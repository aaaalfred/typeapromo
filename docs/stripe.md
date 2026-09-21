# Configuración de facturación con Stripe

Typeapromo implementa cobros y suscripciones multi-inquilino a nivel de espacio de trabajo (*workspace*) mediante [Stripe](https://stripe.com).

---

## 1. Modelo de planes

El producto ofrece dos niveles de servicio por espacio de trabajo:

| Característica | Plan Free | Plan Pro (29 €/mes) |
| :--- | :--- | :--- |
| **Formularios publicados** | Máximo 1 formulario simultáneo | Formularios ilimitados |
| **Respuestas mensuales** | Hasta 100 respuestas/mes | Hasta 10.000 respuestas/mes |
| **Gestión de facturación** | No requerida | Stripe Customer Portal integrado |
| **Roles con permiso de compra** | Solo rol `owner` | Solo rol `owner` |

- **Gate de publicación:** Al intentar publicar un 2º formulario en plan Free, el servidor responde con error `PLAN_INSUFICIENTE` (código HTTP 402) impidiendo la publicación hasta actualizar a Pro o cerrar/despublicar el anterior.
- **Gate de respuestas:** Si un espacio en plan Free alcanza las 100 respuestas en el mes natural, la creación de nuevas sesiones de respuesta se pausa informando al visitante. El contador se reinicia automáticamente el primer día del mes.

---

## 2. Puesta en marcha en Stripe Dashboard

### Paso 1: Crear el producto Pro
1. Entra a tu panel de Stripe (Modo Test para desarrollo o Modo Live para producción).
2. Ve a **Catálogo de productos** > **Añadir producto**.
3. Nombre: `Typeapromo Pro`.
4. Modelo de precios: `Suscripción periódica` > `29,00 €` / `mensual`.
5. Guarda el producto y copia el identificador del precio que comienza por `price_...`.
6. Asígnalo a la variable `STRIPE_PRO_PRICE_ID`.

### Paso 2: Habilitar el Portal de Clientes (Customer Portal)
1. En Stripe Dashboard, ve a **Configuración** > **Portal de facturación**.
2. Habilita las siguientes opciones:
   - Permitir a los clientes cambiar de método de pago.
   - Permitir consultar historial de facturas y descargarlas en PDF.
   - Permitir cancelar suscripciones (al final del ciclo de facturación).
3. Guarda los cambios.

### Paso 3: Configurar el Webhook
1. Ve a **Desarrolladores** > **Webhooks** > **Añadir extremo**.
2. URL del extremo: `https://tu-dominio.com/api/stripe/webhook` (o tu URL de webhook local con el CLI de Stripe: `stripe listen --forward-to localhost:3000/api/stripe/webhook`).
3. Selecciona los eventos a escuchar:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Guarda el extremo y revela el **Secreto de firma** (`whsec_...`).
5. Asígnalo a la variable `STRIPE_WEBHOOK_SECRET`.

---

## 3. Variables de entorno requeridas

Añade en tu fichero `.env`:

```env
STRIPE_SECRET_KEY=sk_test_51...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_PRICE_ID=price_...
```

---

## 4. Modo sin Stripe (Desarrollo local)

Si `STRIPE_SECRET_KEY` no está configurada:
- La aplicación opera normalmente en modo Free sin arrojar errores 500.
- La pantalla `/app/plan` muestra un aviso informativo de que Stripe no está configurado y los botones de actualización quedan ocultos o deshabilitados.
- Todo el ciclo de edición, respuesta, publicación de 1 formulario y analítica funciona al 100%.

---

## 5. Idempotencia del Webhook

Para proteger la integridad de los datos ante reintentos automáticos de Stripe:
- Cada evento entrante se valida contra su firma oficial (`stripe.webhooks.constructEvent`).
- Se comprueba la clave primaria en la tabla `stripe_events`.
- Si el evento ya fue recibido, el webhook responde de inmediato con `{ received: true, duplicado: true }` sin volver a ejecutar mutaciones sobre la base de datos.
