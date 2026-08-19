/**
 * Tipos del manejador de base de datos.
 *
 * Las funciones que pueden ejecutarse dentro o fuera de una transacción reciben
 * un `DbHandle` en lugar de importar `db` directamente. La importación es
 * `import type`, así que este módulo **no** abre el pool al cargarse: eso
 * permite que los tests unitarios de los módulos puros se ejecuten sin
 * `DATABASE_URL`.
 */

import type { Database } from '@/db/client';

/** Transacción de Drizzle, tal y como la recibe el callback de `db.transaction`. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Conexión suelta o transacción: cualquiera sirve para leer y escribir. */
export type DbHandle = Database | Transaction;
