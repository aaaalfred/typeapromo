/**
 * Control de abuso de los endpoints públicos (PLAN.md · §2.6).
 *
 *   import { consumirLimiteDePeticion } from '@/server/rate-limit';
 *
 * La IP se hashea con una sal de proceso que no se persiste, se guarda solo el
 * hash en `rate_limits` y las ventanas son cortas. Esta tabla no tiene ninguna
 * relación con `response_sessions` ni con `answers`, y ese aislamiento es el
 * requisito de privacidad, no un descuido.
 *
 * `limitador.ts` importa `@/db` y abre el pool al cargarse; `clave.ts` y
 * `sal.ts` son puros y los tests los importan por su ruta para correr sin
 * `DATABASE_URL`.
 */

export * from './clave';
export * from './limitador';
export { rotarSalDeProceso, salDeProceso } from './sal';
