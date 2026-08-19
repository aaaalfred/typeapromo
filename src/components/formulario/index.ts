/**
 * Renderer compartido de formularios (fase 4 del plan).
 *
 * Punto de entrada único. El editor (fase 5) y la experiencia pública (fase 7)
 * importan de aquí; ninguno de los dos debe importar un bloque suelto ni
 * reimplementar una pantalla.
 */

export { ProveedorFormulario, describedBy, idsDePantalla, useFormulario } from './contexto';
export type { ValorContextoFormulario } from './contexto';

export { SIN_MEDIA, resolverOpcional } from './medios';
export type { MediaResuelta, ResolverMedia } from './medios';

export { PantallaBloque } from './pantalla-bloque';
export { MarcoPantalla } from './marco-pantalla';
export { PieNavegacion, PistaTeclado } from './pie-navegacion';

export { mensajeDeError, valorInicial } from './validacion';

export { RenderizadorFormulario } from './renderizador-formulario';
export type {
  EventoAvance,
  PropsRenderizadorFormulario,
  RespuestaEmitida,
} from './renderizador-formulario';
