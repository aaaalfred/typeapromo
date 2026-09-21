# Aplicación de Slack (Sign in with Slack / OpenID Connect) — Modo Stand-by

> **Nota importante:** El acceso principal de Typeapromo es mediante **Email + Contraseña** y verificación con **Resend**. La autenticación con Slack se conserva en el código y en el flujo OIDC pero ha pasado a estar **en stand-by como método secundario opcional**: solo se habilita el botón de acceso con Slack si se configuran las variables de entorno correspondientes.

Esta guía documenta la creación de la aplicación en Slack y las variables necesarias si se desea ofrecer este método de acceso alternativo para el equipo.

El producto usa el flujo **moderno de OpenID Connect** (`openid`, `profile`, `email`), no el
antiguo `identity.*` de Sign in with Slack v1. La configuración del cliente está en
[`src/auth.ts`](../src/auth.ts) con los tres endpoints fijados de forma explícita:

| Fase | Endpoint |
|------|----------|
| Autorización | `https://slack.com/openid/connect/authorize` |
| Token | `https://slack.com/api/openid.connect.token` |
| UserInfo | `https://slack.com/api/openid.connect.userInfo` |

## 1. Crear la aplicación

1. Entra en <https://api.slack.com/apps> con una cuenta del workspace del equipo.
2. **Create New App → From scratch**.
3. Nombre (por ejemplo, `Typeapromo`) y **el workspace del equipo** como workspace de desarrollo.

La aplicación se crea **dentro del workspace y no se distribuye**: sin distribución activada,
nadie de fuera llega siquiera a la pantalla de autorización. Es la primera barrera; la validación
de `team_id` es la segunda.

## 2. Scopes

En **OAuth & Permissions → Scopes → User Token Scopes**, añade exactamente tres:

- `openid`
- `profile`
- `email`

Nada más. El producto **no pide** permisos de canales, mensajes, bots ni webhooks, y no debe
hacerlo: cada scope de más es superficie de ataque y una pantalla de consentimiento más
alarmante.

> Los tres van en *User Token Scopes*, no en *Bot Token Scopes*. Con los scopes OIDC en el sitio
> equivocado, Slack devuelve `invalid_scope` en la autorización.

## 3. URLs de redirección

En **OAuth & Permissions → Redirect URLs**, añade la URL de callback de Auth.js:

```
https://formularios.tu-dominio.com/api/auth/callback/slack
```

El último segmento (`slack`) es el identificador del provider declarado en `src/auth.ts`
(`PROVIDER_SLACK`). Si se cambia allí, hay que cambiarlo aquí.

Tres reglas que Slack aplica sin excepción:

- **HTTPS obligatorio.** `http://localhost` **no** se admite. Es la razón de que el desarrollo
  local no use Slack en absoluto, sino el acceso directo tras `AUTH_DEV_BYPASS=1`
  (`PLAN.md` §2.3).
- **Coincidencia exacta.** Sin barra final de más ni de menos, mismo host, mismo esquema.
- Una entrada por entorno. Añade también la de *staging* si lo hay, cada una en su línea.

Para probar el flujo real de Slack contra una máquina local, expón el puerto con un túnel HTTPS
(ngrok o equivalente), registra la URL del túnel como redirect y pon `AUTH_URL` y
`PUBLIC_BASE_URL` con ese mismo origen. La documentación de Slack recomienda exactamente esto.

## 4. Las tres variables

### `SLACK_CLIENT_ID` y `SLACK_CLIENT_SECRET`

**Basic Information → App Credentials**. El *Client Secret* se muestra tras pulsar *Show* y solo
existe en el servidor: no lleva prefijo `NEXT_PUBLIC_`, así que Next nunca lo incrusta en el
bundle del navegador.

Mientras falte cualquiera de las dos, el provider de Slack **no se registra** y la página de
inicio de sesión no muestra el botón: enseña un aviso de que no hay método de acceso configurado,
en lugar de un botón que fallaría.

### `SLACK_TEAM_ID`

Es el identificador del workspace, con la forma `T` + alfanuméricos (`T01ABCDE2FG`). Tres formas
de obtenerlo, de más a menos cómoda:

1. **Desde la propia aplicación.** En <https://api.slack.com/apps>, abre la app: el
   *Workspace ID* aparece en la barra superior junto al nombre del workspace.
2. **Desde el cliente web.** Abre Slack en el navegador; la URL es
   `https://app.slack.com/client/T01ABCDE2FG/...`. El primer segmento tras `/client/` es el
   `team_id`.
3. **Desde la API**, con cualquier token del workspace:
   ```bash
   curl -s -H "Authorization: Bearer xoxp-..." https://slack.com/api/auth.test
   # {"ok":true,"team":"Mi equipo","team_id":"T01ABCDE2FG", ...}
   ```

También aparece como el claim `https://slack.com/team_id` en el `id_token` del primer login
correcto: si la validación rechaza a todo el mundo, mira ese claim en los logs del proveedor y
compáralo carácter a carácter con lo que hay en la variable.

## 5. Cómo se valida el workspace

La comprobación está en dos sitios a propósito
([`src/lib/auth/workspace.ts`](../src/lib/auth/workspace.ts)):

1. **En el callback `signIn`**, antes de crear nada. Una cuenta de otro workspace **ni siquiera
   llega a existir** en `users`; el navegador acaba en `/acceso-denegado?motivo=…`.
2. **En cada petición protegida**, contra el `slack_team_id` persistido en `users`. Así, si
   `SLACK_TEAM_ID` cambia o alguien sale del workspace, la sesión que ya tenía deja de valer sin
   esperar a que caduque.

Sin `SLACK_TEAM_ID` configurada y sin bypass activo, **se rechaza a todo el mundo**. Falla
cerrado: un despliegue al que se le olvidó la variable no queda abierto al primer workspace que
pase por ahí.

## 6. Comprobación

1. `curl https://formularios.tu-dominio.com/api/health` → `{"status":"ok","db":"up","authMode":"slack"}`.
   Si `authMode` dice `dev-bypass`, **para el despliegue**: hay un `AUTH_DEV_BYPASS` donde no debe.
2. Entra desde una cuenta del workspace → el panel de formularios.
3. Entra desde una cuenta de otro workspace → «Acceso denegado», y `users` no tiene fila nueva.

## Problemas frecuentes

| Síntoma | Causa casi siempre |
|---------|--------------------|
| `bad_redirect_uri` | La URL registrada no coincide exactamente; o `AUTH_URL` apunta a otro origen |
| `invalid_scope` | Los scopes OIDC están en *Bot Token Scopes* en vez de *User Token Scopes* |
| Todo el mundo acaba en «Acceso denegado» | `SLACK_TEAM_ID` mal copiado, o ausente |
| La página de login no muestra el botón de Slack | Falta `SLACK_CLIENT_ID` o `SLACK_CLIENT_SECRET` |
| La sesión se pierde al reiniciar | `AUTH_SECRET` cambia entre despliegues, o no está fijada |

Referencia oficial: [Sign in with Slack](https://api.slack.com/authentication/sign-in-with-slack).
