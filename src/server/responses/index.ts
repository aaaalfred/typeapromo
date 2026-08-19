/**
 * Experiencia de respuesta (PLAN.md · fase 7).
 *
 *   import { cargarFormularioPublico, crearSesion } from '@/server/responses';
 *
 * Nada de esto conoce HTTP: la capa lanza `ResponsesError` con un código de
 * dominio y el borde (`src/app/api/public`, `src/app/f`) lo traduce.
 *
 * `publico.ts`, `sesiones.ts` y `medios.ts` importan `@/db` y abren el pool al
 * cargarse. Los módulos puros —`token`, `cookies`, `pantalla`, `abandono`,
 * `errores`— se importan por su ruta en los tests para poder ejecutarse sin
 * `DATABASE_URL`.
 */

export * from './abandono';
export * from './cookies';
export * from './errores';
export * from './esquemas';
export * from './estado';
export * from './eventos';
export * from './medios';
export * from './pantalla';
export * from './publico';
export * from './sesiones';
export * from './token';
