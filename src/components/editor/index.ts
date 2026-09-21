/**
 * Editor visual de formularios (fase 5 del plan).
 *
 * Punto de entrada único. La página de `/formularios/:id/editar` monta
 * `EditorFormulario` y nada más; el resto de componentes son internos y pueden
 * moverse sin romper a nadie.
 */

export { EditorFormulario } from './editor-formulario';
export type { PropsEditorFormulario } from './editor-formulario';

export {
  INTEGRACION_MEDIA_POR_DEFECTO,
  ProveedorMedia,
  SelectorMediaBasico,
  useIntegracionMedia,
} from './contexto-media';
export type {
  ComponenteSelectorMedia,
  IntegracionMedia,
  PropsSelectorMedia,
} from './contexto-media';

export { crearAcciones } from './acciones';
export type { AccionesDocumento, Aplicar, Transformacion } from './acciones';

export { useEstadoEditor } from './estado';
export type { Dispositivo, Pestana, Seleccion } from './estado';

export { useAutoguardado, RETARDO_AUTOGUARDADO_MS } from './usar-autoguardado';
export type { Autoguardado, EstadoAutoguardado } from './usar-autoguardado';
