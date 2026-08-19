/**
 * Interfaz del panel del equipo.
 *
 * Todo lo que las páginas de `src/app/(app)` necesitan sale de aquí. El acceso a
 * la API vive en `./api` y los tipos de transporte en `./tipos`; ninguna página
 * habla con `fetch` directamente.
 */

export * from './acciones';
export * from './api';
export { Aviso, type PropsAviso } from './aviso';
export { CabeceraPanel, type PropsCabeceraPanel } from './cabecera-panel';
export { Dialogo, type PropsDialogo } from './dialogo';
export { DialogoConfirmacion } from './dialogo-confirmacion';
export { DialogoCrearFormulario } from './dialogo-crear-formulario';
export { EsqueletoListado, EstadoVacio } from './estados';
export { EtiquetaEstado } from './etiqueta-estado';
export { FilaFormulario } from './fila-formulario';
export * from './formato';
export { ListadoFormularios } from './listado-formularios';
export * from './rutas-panel';
export { ESTILO_PANEL, type EstiloPanel } from './tema-panel';
export * from './tipos';
