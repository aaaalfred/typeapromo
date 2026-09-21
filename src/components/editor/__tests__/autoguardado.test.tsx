/**
 * Ciclo de autoguardado.
 *
 * Es el test que más importa de la fase: mientras el guardado funcione, un
 * fallo en cualquier otro panel cuesta un rato; un fallo aquí cuesta el trabajo
 * de alguien. Se cubren los cuatro estados visibles y, sobre todo, el `409`:
 * que quede bloqueado y no vuelva a escribir es lo que impide la sobrescritura
 * silenciosa que el control de revisión existe para evitar.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GuardarBorrador, ResultadoGuardado } from '@/lib/editor';
import type { FormDefinition } from '@/lib/forms';

import { useAutoguardado } from '../usar-autoguardado';

import { crearDefinicion } from './utiles';

const RETARDO = 500;

function documento(titulo: string): FormDefinition {
  return crearDefinicion({
    blocks: [{ id: 'b1', type: 'short_text', title: titulo }],
  });
}

const OK = (revision: number): ResultadoGuardado => ({
  estado: 'guardado',
  revision,
  guardadoEn: new Date('2026-01-01T10:00:00Z'),
});

const CONFLICTO: ResultadoGuardado = {
  estado: 'conflicto',
  revisionEnviada: 1,
  revisionServidor: 7,
  mensaje: 'El borrador ha cambiado en otra pestaña o dispositivo.',
};

const ERROR: ResultadoGuardado = {
  estado: 'error',
  mensaje: 'No se ha podido contactar con el servidor.',
  codigo: null,
};

/** Monta el hook con un guardado espía y devuelve las dos cosas. */
function montar(guardar: GuardarBorrador, inicial = documento('Primera')) {
  return renderHook(
    ({ definicion }: { definicion: FormDefinition }) =>
      useAutoguardado({
        formularioId: 'f1',
        definicion,
        revisionInicial: 1,
        retardoMs: RETARDO,
        guardar,
      }),
    { initialProps: { definicion: inicial } },
  );
}

/** Avanza los temporizadores y deja que se resuelvan las promesas pendientes. */
async function avanzar(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAutoguardado', () => {
  it('arranca en «guardado» y no escribe si nadie edita', async () => {
    const guardar = vi.fn<GuardarBorrador>().mockResolvedValue(OK(2));
    const { result } = montar(guardar);

    expect(result.current.estado).toBe('guardado');
    await avanzar(RETARDO * 3);
    expect(guardar).not.toHaveBeenCalled();
  });

  it('agrupa las ediciones seguidas en un único guardado', async () => {
    const guardar = vi.fn<GuardarBorrador>().mockResolvedValue(OK(2));
    const { result, rerender } = montar(guardar);

    rerender({ definicion: documento('Segunda') });
    expect(result.current.estado).toBe('pendiente');
    expect(result.current.hayCambiosSinGuardar).toBe(true);

    await avanzar(RETARDO / 2);
    rerender({ definicion: documento('Tercera') });
    await avanzar(RETARDO / 2);
    expect(guardar).not.toHaveBeenCalled();

    await avanzar(RETARDO);
    expect(guardar).toHaveBeenCalledTimes(1);
    expect(result.current.estado).toBe('guardado');
    expect(result.current.revision).toBe(2);
    expect(result.current.hayCambiosSinGuardar).toBe(false);
  });

  it('envía la revisión que devolvió el servidor en el guardado siguiente', async () => {
    const guardar = vi
      .fn<GuardarBorrador>()
      .mockResolvedValueOnce(OK(2))
      .mockResolvedValueOnce(OK(3));
    const { rerender } = montar(guardar);

    rerender({ definicion: documento('Segunda') });
    await avanzar(RETARDO);
    expect(guardar.mock.calls[0]?.[1]).toBe(1);

    rerender({ definicion: documento('Tercera') });
    await avanzar(RETARDO);
    expect(guardar.mock.calls[1]?.[1]).toBe(2);
  });

  it('pasa por «guardando» mientras la petición está en vuelo', async () => {
    let resolver: (resultado: ResultadoGuardado) => void = () => undefined;
    const guardar = vi.fn<GuardarBorrador>().mockImplementation(
      () =>
        new Promise<ResultadoGuardado>((cumplir) => {
          resolver = cumplir;
        }),
    );
    const { result, rerender } = montar(guardar);

    rerender({ definicion: documento('Segunda') });
    await avanzar(RETARDO);
    expect(result.current.estado).toBe('guardando');

    await act(async () => {
      resolver(OK(2));
      await Promise.resolve();
    });
    expect(result.current.estado).toBe('guardado');
  });

  it('lo editado durante el guardado entra en una petición posterior', async () => {
    let resolver: (resultado: ResultadoGuardado) => void = () => undefined;
    const guardar = vi.fn<GuardarBorrador>().mockImplementation(
      () =>
        new Promise<ResultadoGuardado>((cumplir) => {
          resolver = cumplir;
        }),
    );
    const { result, rerender } = montar(guardar);

    rerender({ definicion: documento('Segunda') });
    await avanzar(RETARDO);
    expect(guardar).toHaveBeenCalledTimes(1);

    // Llega una edición con la petición todavía en vuelo.
    rerender({ definicion: documento('Tercera') });
    await act(async () => {
      resolver(OK(2));
      await Promise.resolve();
    });
    expect(result.current.estado).toBe('pendiente');

    await avanzar(RETARDO);
    expect(guardar).toHaveBeenCalledTimes(2);
    expect(guardar.mock.calls[1]?.[2].blocks[0]?.title).toBe('Tercera');
  });

  it('un 409 deja el editor en conflicto, con la revisión del servidor', async () => {
    const guardar = vi.fn<GuardarBorrador>().mockResolvedValue(CONFLICTO);
    const { result, rerender } = montar(guardar);

    rerender({ definicion: documento('Segunda') });
    await avanzar(RETARDO);

    expect(result.current.estado).toBe('conflicto');
    expect(result.current.revisionServidor).toBe(7);
    expect(result.current.revision).toBe(1);
    expect(result.current.mensaje).toContain('otra pestaña');
  });

  it('tras un 409 no vuelve a escribir aunque se siga editando', async () => {
    const guardar = vi.fn<GuardarBorrador>().mockResolvedValue(CONFLICTO);
    const { result, rerender } = montar(guardar);

    rerender({ definicion: documento('Segunda') });
    await avanzar(RETARDO);
    expect(guardar).toHaveBeenCalledTimes(1);

    rerender({ definicion: documento('Tercera') });
    await avanzar(RETARDO * 4);
    result.current.guardarAhora();
    await avanzar(RETARDO * 4);

    expect(guardar).toHaveBeenCalledTimes(1);
    expect(result.current.estado).toBe('conflicto');
  });

  it('un error de red se puede reintentar y se recupera', async () => {
    const guardar = vi
      .fn<GuardarBorrador>()
      .mockResolvedValueOnce(ERROR)
      .mockResolvedValueOnce(OK(2));
    const { result, rerender } = montar(guardar);

    rerender({ definicion: documento('Segunda') });
    await avanzar(RETARDO);
    expect(result.current.estado).toBe('error');
    expect(result.current.mensaje).toContain('servidor');

    await act(async () => {
      result.current.guardarAhora();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(guardar).toHaveBeenCalledTimes(2);
    expect(result.current.estado).toBe('guardado');
  });

  it('«guardar ahora» no espera al debounce', async () => {
    const guardar = vi.fn<GuardarBorrador>().mockResolvedValue(OK(2));
    const { result, rerender } = montar(guardar);

    rerender({ definicion: documento('Segunda') });
    await act(async () => {
      result.current.guardarAhora();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(guardar).toHaveBeenCalledTimes(1);
    expect(result.current.estado).toBe('guardado');
  });

  it('no guarda después de desmontar', async () => {
    const guardar = vi.fn<GuardarBorrador>().mockResolvedValue(OK(2));
    const { rerender, unmount } = montar(guardar);

    rerender({ definicion: documento('Segunda') });
    unmount();
    await avanzar(RETARDO * 3);

    expect(guardar).not.toHaveBeenCalled();
  });
});
