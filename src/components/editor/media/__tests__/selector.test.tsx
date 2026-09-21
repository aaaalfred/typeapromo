import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { createDefaultFormDefinition, type FormDefinition } from '@/lib/forms';

import { ProveedorAlmacenMedia, useAlmacenMedia } from '../almacen';
import type { ActivoVista, InstruccionesDeSubida } from '../cliente';
import { SelectorMediaSubida } from '../selector';

/**
 * El cliente HTTP se sustituye por dobles: lo que se prueba aquí es la máquina
 * de estados del selector —cuándo llega el identificador al documento, cuándo
 * se ve el progreso, qué pasa al cancelar— y no la conversación con la API, que
 * ya cubren los tests de `src/server/media`.
 */
vi.mock('../cliente', async (original) => {
  const real = await original<typeof import('../cliente')>();
  return {
    ...real,
    crearIntento: vi.fn(),
    subirBytes: vi.fn(),
    completarSubida: vi.fn(),
    obtenerActivo: vi.fn(),
    borrarActivo: vi.fn(),
  };
});

const { crearIntento, subirBytes, completarSubida, obtenerActivo } = await import('../cliente');

const ID_ACTIVO = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

function activo(sobreescritura: Partial<ActivoVista> = {}): ActivoVista {
  return {
    id: ID_ACTIVO,
    status: 'ready',
    mimeType: 'image/png',
    byteSize: 1024,
    width: 800,
    height: 600,
    sha256: 'a'.repeat(64),
    originalFilename: 'portada.png',
    failureReason: null,
    url: 'https://cdn.test/publico/portada.webp',
    variantes: [],
    createdAt: '2026-08-18T10:00:00.000Z',
    readyAt: '2026-08-18T10:00:02.000Z',
    ...sobreescritura,
  };
}

const INSTRUCCIONES: InstruccionesDeSubida = {
  url: 'https://staging.test/objeto?firma',
  method: 'PUT',
  headers: { 'content-type': 'image/png', 'content-length': '1024' },
  expiresAt: '2026-08-18T10:05:00.000Z',
};

function imagen(nombre = 'portada.png', tipo = 'image/png', bytes = 1024): File {
  return new File([new Uint8Array(bytes)], nombre, { type: tipo });
}

function montar(props: Partial<Parameters<typeof SelectorMediaSubida>[0]> = {}) {
  const alCambiar = vi.fn();
  const definicion: FormDefinition = createDefaultFormDefinition('Sin imágenes');

  render(
    <ProveedorAlmacenMedia definicionInicial={definicion}>
      <SelectorMediaSubida
        etiqueta="Portada"
        assetId={undefined}
        alCambiar={alCambiar}
        {...props}
      />
    </ProveedorAlmacenMedia>,
  );

  return { alCambiar };
}

function campoArchivo(): HTMLInputElement {
  return screen.getByLabelText('Archivo de imagen para Portada');
}

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom no implementa las URL de objeto; sin esto la vista previa revienta.
  URL.createObjectURL = vi.fn(() => 'blob:vista-previa');
  URL.revokeObjectURL = vi.fn();
});

describe('SelectorMediaSubida', () => {
  it('recorre los tres pasos del pipeline y solo entonces toca el documento', async () => {
    (crearIntento as Mock).mockResolvedValue({ asset: activo({ status: 'uploading', url: null }), upload: INSTRUCCIONES });
    (subirBytes as Mock).mockImplementation(
      async (_i: unknown, _a: unknown, alProgresar: (f: number) => void) => {
        alProgresar(0.5);
        alProgresar(1);
      },
    );
    (completarSubida as Mock).mockResolvedValue(activo());

    const { alCambiar } = montar();
    await userEvent.upload(campoArchivo(), imagen());

    await waitFor(() => {
      expect(alCambiar).toHaveBeenCalledWith(ID_ACTIVO);
    });

    expect(crearIntento).toHaveBeenCalledTimes(1);
    expect(subirBytes).toHaveBeenCalledTimes(1);
    expect(completarSubida).toHaveBeenCalledWith(ID_ACTIVO);
  });

  it('no toca el documento mientras la subida está en curso', async () => {
    let terminar: (() => void) | undefined;
    (crearIntento as Mock).mockResolvedValue({ asset: activo(), upload: INSTRUCCIONES });
    (subirBytes as Mock).mockImplementation(
      () =>
        new Promise<void>((resolver) => {
          terminar = resolver;
        }),
    );
    (completarSubida as Mock).mockResolvedValue(activo());

    const { alCambiar } = montar();
    await userEvent.upload(campoArchivo(), imagen());

    await screen.findByRole('progressbar', { name: 'Subiendo Portada' });
    expect(alCambiar).not.toHaveBeenCalled();

    terminar?.();
    await waitFor(() => {
      expect(alCambiar).toHaveBeenCalledWith(ID_ACTIVO);
    });
  });

  it('avisa de que el servidor está procesando cuando los bytes ya han llegado', async () => {
    (crearIntento as Mock).mockResolvedValue({ asset: activo(), upload: INSTRUCCIONES });
    (subirBytes as Mock).mockResolvedValue(undefined);
    (completarSubida as Mock).mockImplementation(
      () => new Promise<ActivoVista>(() => undefined),
    );

    montar();
    await userEvent.upload(campoArchivo(), imagen());

    expect(await screen.findByText(/Procesando la imagen en el servidor/)).toBeInTheDocument();
  });

  it('rechaza en el cliente lo que no es JPEG, PNG ni WebP, sin llamar a la API', async () => {
    // `applyAccept: false` a propósito: el atributo `accept` ya filtra en el
    // selector del sistema, y `userEvent` lo imita. Lo que se prueba aquí es la
    // segunda barrera, la que importa cuando el archivo entra por otra vía
    // —arrastrar y soltar, o un selector que ofrece «todos los archivos»—.
    const usuario = userEvent.setup({ applyAccept: false });

    montar();
    await usuario.upload(campoArchivo(), imagen('animado.gif', 'image/gif'));

    expect(await screen.findByText(/Solo se admiten imágenes JPEG, PNG o WebP/)).toBeInTheDocument();
    expect(crearIntento).not.toHaveBeenCalled();
  });

  it('rechaza en el cliente lo que supera los 8 MB, sin llamar a la API', async () => {
    montar();
    await userEvent.upload(campoArchivo(), imagen('enorme.png', 'image/png', 9 * 1024 * 1024));

    expect(await screen.findByText(/máximo son 8\.0 MB/)).toBeInTheDocument();
    expect(crearIntento).not.toHaveBeenCalled();
  });

  it('muestra el mensaje que redacta el servidor cuando la validación real falla', async () => {
    const { ErrorMedia } = await import('../cliente');
    (crearIntento as Mock).mockResolvedValue({ asset: activo(), upload: INSTRUCCIONES });
    (subirBytes as Mock).mockResolvedValue(undefined);
    (completarSubida as Mock).mockRejectedValue(
      new ErrorMedia('El archivo no es una imagen admitida.', 'FORMATO_NO_ADMITIDO', 400),
    );

    const { alCambiar } = montar();
    await userEvent.upload(campoArchivo(), imagen());

    expect(await screen.findByText('El archivo no es una imagen admitida.')).toBeInTheDocument();
    expect(alCambiar).not.toHaveBeenCalled();
  });

  it('quitar desengancha del documento sin pedir el borrado del activo', async () => {
    (obtenerActivo as Mock).mockResolvedValue(activo());
    const { borrarActivo } = await import('../cliente');

    const { alCambiar } = montar({ assetId: ID_ACTIVO });
    await userEvent.click(await screen.findByRole('button', { name: 'Quitar' }));

    expect(alCambiar).toHaveBeenCalledWith(undefined);
    expect(borrarActivo).not.toHaveBeenCalled();
  });

  it('con un activo ya asociado ofrece reemplazar y muestra sus dimensiones', async () => {
    (obtenerActivo as Mock).mockResolvedValue(activo());

    montar({ assetId: ID_ACTIVO });

    expect(await screen.findByText('800 × 600 px')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reemplazar' })).toBeInTheDocument();
  });
});

describe('resolverMedia', () => {
  function Sonda({ assetId }: { readonly assetId: string }) {
    const { resolverMedia } = useAlmacenMedia();
    const resuelta = resolverMedia(assetId);
    return <span data-testid="resuelta">{resuelta === null ? 'sin-imagen' : resuelta.url}</span>;
  }

  it('devuelve null hasta que el activo está listo, y luego su URL pública', async () => {
    let entregar: ((activo: ActivoVista) => void) | undefined;
    (obtenerActivo as Mock).mockImplementation(
      () =>
        new Promise<ActivoVista>((resolver) => {
          entregar = resolver;
        }),
    );

    const definicion = createDefaultFormDefinition('Con imagen');
    const conImagen: FormDefinition = {
      ...definicion,
      theme: { ...definicion.theme, logoAssetId: ID_ACTIVO },
    };

    render(
      <ProveedorAlmacenMedia definicionInicial={conImagen}>
        <Sonda assetId={ID_ACTIVO} />
      </ProveedorAlmacenMedia>,
    );

    expect(screen.getByTestId('resuelta')).toHaveTextContent('sin-imagen');

    entregar?.(activo());
    await waitFor(() => {
      expect(screen.getByTestId('resuelta')).toHaveTextContent('https://cdn.test/publico/portada.webp');
    });
  });

  it('precarga los activos que el documento ya referencia, sin repetir peticiones', async () => {
    (obtenerActivo as Mock).mockResolvedValue(activo());

    const definicion = createDefaultFormDefinition('Con imagen');
    const conImagen: FormDefinition = {
      ...definicion,
      theme: { ...definicion.theme, logoAssetId: ID_ACTIVO, backgroundImageAssetId: ID_ACTIVO },
    };

    render(
      <ProveedorAlmacenMedia definicionInicial={conImagen}>
        <Sonda assetId={ID_ACTIVO} />
      </ProveedorAlmacenMedia>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('resuelta')).toHaveTextContent('https://cdn.test/publico/portada.webp');
    });
    // El mismo identificador en dos sitios del documento es una sola petición.
    expect(obtenerActivo).toHaveBeenCalledTimes(1);
  });
});
