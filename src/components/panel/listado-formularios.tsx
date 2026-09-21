'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { Boton } from '@/components/ui/boton';
import { CampoTexto } from '@/components/ui/campo';

import { DESCRIPCION_ACCION, type AccionFormulario } from './acciones';
import {
  archivarFormulario,
  cerrarFormulario,
  crearFormulario,
  duplicarFormulario,
  esCancelacion,
  esErrorApi,
  listarFormularios,
  publicarFormulario,
} from './api';
import { Aviso } from './aviso';
import { DialogoConfirmacion } from './dialogo-confirmacion';
import { DialogoCrearFormulario } from './dialogo-crear-formulario';
import { EsqueletoListado, EstadoVacio } from './estados';
import { FilaFormulario } from './fila-formulario';
import { plural } from './formato';
import { rutaEditor } from './rutas-panel';
import {
  FILTRO_INICIAL,
  OPCIONES_FILTRO_ESTADO,
  type FiltroEstado,
  type FiltroListado,
  type PaginaFormularios,
  type ResumenFormulario,
} from './tipos';

/**
 * Listado de formularios del equipo.
 *
 * Es un componente de cliente y no una página de servidor a propósito. El
 * listado se filtra y se busca sin recargar, y sobre todo tiene que poder
 * **enseñar el fallo**: si `GET /api/forms` no responde, la pantalla dice que no
 * ha podido conectar y ofrece reintentar, en lugar de quedarse en blanco. Con
 * los datos resueltos en el servidor ese caso acabaría en la pantalla de error
 * genérica de Next, sin forma de recuperarse dentro del panel.
 *
 * Los mensajes de error que se ven son los que manda la API: ya vienen en
 * español y explican el motivo real (`TRANSICION_INVALIDA` sabe decir por qué no
 * se puede cerrar un borrador; una frase inventada aquí, no).
 */

/** Milisegundos entre la última tecla y la consulta. */
const RETARDO_BUSQUEDA = 250;

/** Acción pendiente de confirmar o en ejecución. */
interface SolicitudAccion {
  readonly accion: AccionFormulario;
  readonly formulario: ResumenFormulario;
}

/**
 * Resultado de la última consulta resuelta, etiquetado con la clave del filtro
 * que lo produjo.
 *
 * Guardar la clave junto a los datos es lo que permite derivar «estoy
 * cargando» (`clave del filtro actual ≠ clave del resultado`) en lugar de
 * mantener un booleano aparte que hay que subir y bajar a mano en cada camino
 * —incluido el del error, que es justo donde se olvida—.
 */
interface ResultadoListado {
  readonly clave: string;
  readonly datos: PaginaFormularios | null;
  readonly error: string | null;
}

/** Identidad de una consulta. `recarga` la cambia para forzar un refresco igual. */
function claveDeConsulta(filtro: FiltroListado, recarga: number): string {
  return JSON.stringify([filtro.estado, filtro.q, recarga]);
}

/** Mensaje que se puede mostrar de cualquier fallo, sea de la API o no. */
function mensajeDeError(causa: unknown): string {
  if (esErrorApi(causa)) return causa.message;
  return 'Se ha producido un error inesperado. Inténtalo de nuevo.';
}

function invocar(accion: AccionFormulario, id: string): Promise<unknown> {
  switch (accion) {
    case 'duplicar':
      return duplicarFormulario(id);
    case 'publicar':
      return publicarFormulario(id);
    case 'cerrar':
      return cerrarFormulario(id);
    case 'archivar':
      return archivarFormulario(id, true);
    case 'desarchivar':
      return archivarFormulario(id, false);
  }
}

export function ListadoFormularios() {
  const router = useRouter();
  const idBusqueda = useId();
  const idEstado = useId();

  /* --- Filtro: el texto se escribe libre y se aplica con retardo --- */
  const [texto, setTexto] = useState('');
  const [filtro, setFiltro] = useState<FiltroListado>(FILTRO_INICIAL);

  /* --- Datos --- */
  const [resultado, setResultado] = useState<ResultadoListado | null>(null);
  const [recarga, setRecarga] = useState(0);
  const clave = claveDeConsulta(filtro, recarga);

  /* --- Acciones --- */
  const [solicitud, setSolicitud] = useState<SolicitudAccion | null>(null);
  const [enCurso, setEnCurso] = useState<SolicitudAccion | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);

  /* --- Alta --- */
  const [creando, setCreando] = useState(false);
  const [dialogoCrear, setDialogoCrear] = useState(false);
  const [errorCrear, setErrorCrear] = useState<string | null>(null);

  const recargar = useCallback(() => {
    setRecarga((valor) => valor + 1);
  }, []);

  // El primer render ya arranca con el filtro inicial: sin esta guarda, el
  // temporizador de arranque dispararía una segunda consulta idéntica.
  const primeraBusqueda = useRef(true);

  useEffect(() => {
    if (primeraBusqueda.current) {
      primeraBusqueda.current = false;
      return;
    }
    const temporizador = setTimeout(() => {
      setFiltro((actual) => (actual.q === texto ? actual : { ...actual, q: texto }));
    }, RETARDO_BUSQUEDA);
    return () => {
      clearTimeout(temporizador);
    };
  }, [texto]);

  useEffect(() => {
    const control = new AbortController();
    let vigente = true;

    listarFormularios(filtro, control.signal)
      .then((pagina) => {
        if (vigente) setResultado({ clave, datos: pagina, error: null });
      })
      .catch((causa: unknown) => {
        if (!vigente || esCancelacion(causa)) return;
        setResultado({ clave, datos: null, error: mensajeDeError(causa) });
      });

    return () => {
      vigente = false;
      control.abort();
    };
  }, [clave, filtro]);

  /* ------------------------------------------------------------------ */
  /* Acciones                                                            */
  /* ------------------------------------------------------------------ */

  const ejecutar = useCallback(
    async (peticion: SolicitudAccion) => {
      setEnCurso(peticion);
      setErrorAccion(null);
      try {
        await invocar(peticion.accion, peticion.formulario.id);
        setSolicitud(null);
        setMensajeExito(DESCRIPCION_ACCION[peticion.accion].exito(peticion.formulario.title));
        recargar();
      } catch (causa) {
        setErrorAccion(mensajeDeError(causa));
      } finally {
        setEnCurso(null);
      }
    },
    [recargar],
  );

  const solicitarAccion = useCallback(
    (accion: AccionFormulario, formulario: ResumenFormulario) => {
      setMensajeExito(null);
      setErrorAccion(null);
      if (DESCRIPCION_ACCION[accion].confirma) {
        setSolicitud({ accion, formulario });
        return;
      }
      void ejecutar({ accion, formulario });
    },
    [ejecutar],
  );

  const crear = useCallback(
    async (titulo: string, slug?: string) => {
      setCreando(true);
      setErrorCrear(null);
      try {
        const { form } = await crearFormulario(titulo, slug);
        setDialogoCrear(false);
        // El formulario nace vacío: lo único útil que se puede hacer con él es
        // abrirlo en el editor, así que se navega directamente.
        router.push(rutaEditor(form.id));
      } catch (causa) {
        setErrorCrear(mensajeDeError(causa));
      } finally {
        setCreando(false);
      }
    },
    [router],
  );

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */

  // Estado de carga **derivado**: mientras el resultado guardado no lleve la
  // clave del filtro actual, hay una consulta en vuelo. No hace falta un
  // booleano aparte que subir y bajar en cada rama.
  const cargando = resultado === null || resultado.clave !== clave;
  const datos = resultado?.datos ?? null;
  const errorListado = resultado !== null && resultado.clave === clave ? resultado.error : null;

  const items = datos?.items ?? [];
  const hayBusqueda = filtro.q.trim().length > 0 || filtro.estado !== 'todos';
  const primeraCarga = datos === null && cargando;
  const descripcionAccion = solicitud === null ? null : DESCRIPCION_ACCION[solicitud.accion];

  return (
    <section aria-labelledby="titulo-formularios" className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 id="titulo-formularios" className="text-2xl font-semibold tracking-tight">
            Formularios
          </h1>
          <p className="mt-1 text-sm text-[color:var(--tp-texto-suave)]">
            Todo el equipo puede crear, editar y publicar cualquier formulario.
          </p>
        </div>
        <Boton
          onClick={() => {
            setErrorCrear(null);
            setDialogoCrear(true);
          }}
        >
          <Plus aria-hidden="true" className="size-4" />
          Nuevo formulario
        </Boton>
      </header>

      <form
        role="search"
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(evento) => {
          // El listado se refresca solo; enviar no debe recargar la página.
          evento.preventDefault();
          setFiltro((actual) => (actual.q === texto ? actual : { ...actual, q: texto }));
        }}
      >
        <div className="flex-1">
          <label htmlFor={idBusqueda} className="block text-sm font-medium">
            Buscar formularios
          </label>
          <CampoTexto
            id={idBusqueda}
            type="search"
            name="q"
            value={texto}
            placeholder="Título o dirección pública"
            autoComplete="off"
            className="mt-1.5"
            onChange={(evento) => {
              setTexto(evento.target.value);
            }}
          />
        </div>
        <div className="sm:w-56">
          <label htmlFor={idEstado} className="block text-sm font-medium">
            Estado
          </label>
          <select
            id={idEstado}
            name="status"
            value={filtro.estado}
            className="tp-foco mt-1.5 w-full rounded-[var(--tp-radio-superficie)] border border-[color:var(--tp-borde)] bg-[var(--tp-control-fondo)] px-4 py-3 text-[color:var(--tp-texto)]"
            onChange={(evento) => {
              const valor = evento.target.value as FiltroEstado;
              setMensajeExito(null);
              setFiltro((actual) => ({ ...actual, estado: valor }));
            }}
          >
            {OPCIONES_FILTRO_ESTADO.map((opcion) => (
              <option key={opcion.value} value={opcion.value}>
                {opcion.label}
              </option>
            ))}
          </select>
        </div>
      </form>

      {mensajeExito === null ? null : (
        <Aviso tono="informacion" titulo={mensajeExito} />
      )}

      {errorAccion !== null && solicitud === null ? (
        <Aviso titulo="No se ha podido completar la acción">{errorAccion}</Aviso>
      ) : null}

      <p role="status" className="text-sm text-[color:var(--tp-texto-suave)]">
        {errorListado !== null
          ? 'No se ha podido cargar el listado.'
          : primeraCarga
            ? 'Cargando formularios…'
            : `${plural(datos?.total ?? 0, 'formulario', 'formularios')}${cargando ? ' · actualizando…' : ''}`}
      </p>

      {errorListado !== null ? (
        <Aviso
          titulo="No se han podido cargar los formularios"
          etiquetaAccion="Reintentar"
          onAccion={recargar}
        >
          {errorListado}
        </Aviso>
      ) : primeraCarga ? (
        <EsqueletoListado />
      ) : items.length === 0 ? (
        hayBusqueda ? (
          <EstadoVacio
            variante="sin-resultados"
            titulo="Ningún formulario coincide"
            descripcion="Prueba con otras palabras o cambia el filtro de estado. La búsqueda mira el título y la dirección pública."
          >
            <Boton
              estiloTema="outline"
              tamano="sm"
              onClick={() => {
                setTexto('');
                setFiltro(FILTRO_INICIAL);
              }}
            >
              Quitar los filtros
            </Boton>
          </EstadoVacio>
        ) : (
          <EstadoVacio
            titulo="Todavía no hay formularios"
            descripcion="Crea el primero y se abrirá en el editor con una pantalla de bienvenida y una pregunta de ejemplo."
          >
            <Boton
              onClick={() => {
                setErrorCrear(null);
                setDialogoCrear(true);
              }}
            >
              <Plus aria-hidden="true" className="size-4" />
              Crear el primer formulario
            </Boton>
          </EstadoVacio>
        )
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((formulario) => (
            <FilaFormulario
              key={formulario.id}
              formulario={formulario}
              accionEnCurso={enCurso?.formulario.id === formulario.id ? enCurso.accion : null}
              bloqueado={enCurso !== null}
              onAccion={solicitarAccion}
            />
          ))}
        </ul>
      )}

      {/* Se monta solo mientras está abierto: cada apertura empieza en limpio. */}
      {dialogoCrear ? (
        <DialogoCrearFormulario
          abierto
          cargando={creando}
          error={errorCrear}
          onCrear={(titulo) => {
            void crear(titulo);
          }}
          onCancelar={() => {
            if (!creando) setDialogoCrear(false);
          }}
        />
      ) : null}

      {solicitud === null || descripcionAccion === null ? null : (
        <DialogoConfirmacion
          abierto
          titulo={descripcionAccion.tituloConfirmacion}
          descripcion={descripcionAccion.explicacion(solicitud.formulario.title)}
          etiquetaConfirmar={descripcionAccion.etiquetaConfirmar}
          cargando={enCurso !== null}
          error={errorAccion}
          onConfirmar={() => {
            void ejecutar(solicitud);
          }}
          onCancelar={() => {
            if (enCurso !== null) return;
            setSolicitud(null);
            setErrorAccion(null);
          }}
        />
      )}
    </section>
  );
}
