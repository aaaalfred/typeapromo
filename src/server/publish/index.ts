/**
 * Publicación versionada (PLAN.md · fase 7).
 *
 *   import { publishForm, publishFormSchema } from '@/server/publish';
 *
 * Nada de esto conoce HTTP: se reutilizan los errores de dominio de
 * `@/server/forms` (`FormsError`) porque `POST /api/forms/:id/publish` vive
 * dentro de la API de formularios y el panel ya sabe leer esos códigos.
 *
 * `publicar.ts` importa `@/db` y abre el pool al cargarse; `decisiones.ts` y
 * `esquemas.ts` son puros y los tests los importan por su ruta para poder
 * ejecutarse sin `DATABASE_URL`.
 */

export * from './decisiones';
export * from './esquemas';
export * from './publicar';
