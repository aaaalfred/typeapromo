/**
 * Experiencia pública de respuesta (PLAN.md · fase 7).
 *
 * Punto de entrada único de `/f/:slug`. Aquí no se renderiza ninguna pregunta:
 * el renderer es el de `@/components/formulario`, el mismo que usa la
 * previsualización del editor, y esta carpeta solo aporta la costura —sesión,
 * autosave, reanudación y medios ya resueltos— más la pantalla de un formulario
 * que no admite respuestas.
 */

export { ExperienciaPublica } from './experiencia';
export type { PropsExperienciaPublica, SesionInicial } from './experiencia';

export { PantallaMensaje } from './pantalla-mensaje';
export type { PropsPantallaMensaje } from './pantalla-mensaje';

export {
  ErrorPublico,
  MENSAJE_ERROR_RED,
  completarSesionPublica,
  crearSesionPublica,
  guardarRespuestaPublica,
} from './api';
export type { RespuestaCrearSesion, RespuestaGuardar, SesionPublica } from './api';
