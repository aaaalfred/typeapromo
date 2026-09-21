# Configuración de facturación con Stripe

Typeapromo implementa cobros y suscripciones multi-inquilino a nivel de espacio de trabajo (*workspace*) mediante [Stripe](https://stripe.com).

---

## 1. Modelo de suscripción única

Typeapromo no es un SaaS con múltiples niveles complejos; ofrece un único modelo de suscripción periódica por espacio de trabajo (*workspace*), pensado para producción con consumo controlado:

| Característica | Sin suscripción (Free) | Plan Business (Suscripción activa) |
| :--- | :--- | :--- |
| **Formularios publicados** | Máximo 1 formulario simultáneo | Formularios ilimitados |
| **Respuestas mensuales completadas** | Hasta 100 respuestas completadas/mes | Hasta 10.000 respuestas completadas/mes |
| **Gestión de facturación** | No requerida | Stripe Customer Portal integrado |
| **Roles con permiso de gestión** | Solo rol `owner` | Solo rol `owner` |

- **Condición de suscripción activa:** Un workspace se considera pagado (`esWorkspacePagado`) únicamente si su `plan` es `'pro'` y su `planStatus` es `'active'` o `'trialing'`. Si la suscripción entra en `past_due` o `canceled`, el workspace queda restringido a los cupos gratuitos.
- **Gate de publicación:** Al intentar publicar un 2.º formulario sin suscripción activa, el servidor responde con error `PLAN_INSUFICIENTE` (código HTTP 402) impidiendo la publicación hasta activar la suscripción o despublicar/cerrar el anterior.
- **Gate de respuestas completadas:** Solo las respuestas efectivamente completadas (`status = 'completed'`) en el mes natural UTC en curso consumen cupo; las sesiones abandonadas no restan cupo. Al alcanzar el límite (100 en Free o 10.000 en Business), la creación de nuevas sesiones se detiene informando al visitante con un mensaje amigable (`CUPO_EXCEDIDO` / código HTTP 403).

---

## 2. Puesta en marcha en Stripe Dashboard

### Paso 1: Crear el producto de suscripción
1. Entra a tu panel de Stripe (Modo Test para desarrollo o Modo Live para producción).
2. Ve a **Catálogo de productos** > **Añadir producto**.
3. Nombre: `Typeapromo Business`.
4. Modelo de precios: `Suscripción periódica` (define el importe mensual deseado según tu tarificación).
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
