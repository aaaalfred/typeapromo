# Configuración de correo con Resend

Typeapromo utiliza [Resend](https://resend.com) como proveedor oficial para el envío de correos electrónicos transaccionales:

1. **Verificación de correo** al registrar una cuenta nueva (enlace válido durante 24 horas).
2. **Restablecimiento de contraseña** ante solicitudes de olvido (enlace válido durante 1 hora).
3. **Reenvío de activación** para cuentas pendientes de confirmación.

---

## 1. Modo de desarrollo (sin API Key)

Para desarrollar o ejecutar pruebas en local **no es obligatorio disponer de una clave de Resend**.

Si la variable `RESEND_API_KEY` no está definida o está vacía, Typeapromo entra en modo de simulación de correo:
- La petición se procesa como exitosa.
- El correo completo se imprime por consola (`stdout`) con un formato legible que incluye el enlace exacto generado:

```text
================== [CORREO SIMULADO (SIN RESEND_API_KEY)] ==================
De:     Typeapromo <onboarding@resend.dev>
Para:   usuario@ejemplo.com
Asunto: Verifica tu cuenta en Typeapromo
--------------------------------------------------------------------------
Hola,

Gracias por crear una cuenta en Typeapromo.
Para verificar tu correo electrónico y activar tu espacio de trabajo...
http://localhost:3000/verificar-correo?token=...
==========================================================================
```

Basta con copiar y pegar el enlace en el navegador para completar la verificación o el restablecimiento.

---

## 2. Puesta en producción con Resend

### Paso 1: Obtener una clave de API
1. Crea una cuenta en [resend.com](https://resend.com).
2. Dirígete a la sección **API Keys** y genera una nueva clave con permisos de envío.
3. Copia el valor (empieza por `re_...`).

### Paso 2: Configurar tu dominio
1. En el panel de Resend, añade tu dominio (ej. `midominio.com`).
2. Configura los registros DNS recomendados (SPF, DKIM y DMARC) para garantizar la entregabilidad.
3. Una vez verificado por Resend, puedes utilizar direcciones de ese dominio como remitente.
*(Nota: Para pruebas iniciales puedes usar el remitente por defecto de prueba: `onboarding@resend.dev`, enviando únicamente al correo con el que te registraste en Resend).*

### Paso 3: Variables de entorno
Añade en tu archivo `.env` o en el entorno de producción:

```env
RESEND_API_KEY=re_123456789_abcdef
EMAIL_FROM="Typeapromo <notificaciones@midominio.com>"
```

---

## 3. Seguridad de los tokens

- **Tokens criptográficos:** Se generan cadenas aleatorias de 256 bits (64 caracteres hexadecimales) con `crypto.randomBytes`.
- **Almacenamiento ciego:** En la base de datos solo se persiste el hash SHA-256 del token (`token_hash`), nunca el token en claro.
- **Caducidad y un solo uso:**
  - Verificación de cuenta: caduca en 24 horas y se marca `consumed_at = now()`. No puede reutilizarse.
  - Restablecimiento de contraseña: caduca en 1 hora, se marca `consumed_at = now()` y destruye todas las sesiones activas en `auth_sessions`.
