# Documentación

Guías de operación de Typeapromo. El alcance funcional está en [`PR.md`](../PR.md) y el plan de
ejecución en [`PLAN.md`](../PLAN.md); esto es lo que hace falta para **poner la aplicación en
marcha y mantenerla viva**.

| Documento | Cuándo se lee |
|-----------|---------------|
| [Puesta en marcha local](./puesta-en-marcha.md) | La primera vez que se clona el repositorio |
| [Migraciones de base de datos](./migraciones.md) | Al cambiar el esquema y en cada despliegue |
| [Aplicación de Slack (OIDC)](./slack.md) | Antes del primer despliegue en producción |
| [Buckets R2 y política CORS](./r2.md) | Antes del primer despliegue en producción |
| [Despliegue y operación](./despliegue.md) | En cada despliegue, y para configurar el cron |
| [Suite end-to-end](./e2e.md) | Al escribir o depurar pruebas de `e2e/` |

> [!WARNING]
> `AUTH_DEV_BYPASS` habilita la entrada sin credenciales. **Nunca debe existir en producción.**
> El detalle está en [Despliegue y operación](./despliegue.md#el-bypass-de-autenticación-jamás-en-producción).
