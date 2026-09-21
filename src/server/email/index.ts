/**
 * Servicio de envío de correos electrónicos transaccionales.
 *
 * Utiliza Resend si `RESEND_API_KEY` está configurada en las variables de entorno;
 * en caso contrario, escribe el contenido formateado en `console.info` para facilitar
 * el desarrollo y pruebas locales sin necesidad de servicios externos.
 */

import { Resend } from 'resend';

export interface OpcionesEnvioCorreo {
  para: string;
  asunto: string;
  html: string;
  texto: string;
}

const REMITENTE_POR_DEFECTO = 'Typeapromo <onboarding@resend.dev>';

/**
 * Obtiene el remitente configurado en `EMAIL_FROM` o el valor por defecto.
 */
export function remitenteConfigurado(): string {
  const envFrom = process.env.EMAIL_FROM?.trim();
  return envFrom && envFrom !== '' ? envFrom : REMITENTE_POR_DEFECTO;
}

/**
 * Envía un correo electrónico transaccional.
 */
export async function enviarCorreo(opciones: OpcionesEnvioCorreo): Promise<{ exito: boolean; id?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const remitente = remitenteConfigurado();

  if (apiKey && apiKey !== '') {
    try {
      const resend = new Resend(apiKey);
      const { data, error } = await resend.emails.send({
        from: remitente,
        to: opciones.para,
        subject: opciones.asunto,
        html: opciones.html,
        text: opciones.texto,
      });

      if (error) {
        console.error('[EMAIL RESEND ERROR]', error);
        return { exito: false };
      }

      return { exito: true, id: data?.id };
    } catch (err) {
      console.error('[EMAIL RESEND EXCEPCION]', err);
      return { exito: false };
    }
  }

  // Modo desarrollo / sin API key: log en stdout con enlace destacado
  console.info(`\n================== [CORREO SIMULADO (SIN RESEND_API_KEY)] ==================`);
  console.info(`De:     ${remitente}`);
  console.info(`Para:   ${opciones.para}`);
  console.info(`Asunto: ${opciones.asunto}`);
  console.info(`--------------------------------------------------------------------------`);
  console.info(opciones.texto);
  console.info(`==========================================================================\n`);

  return { exito: true, id: 'simulado-dev' };
}

/**
 * Genera el asunto, texto y HTML para el correo de verificación de cuenta.
 */
export function plantillaVerificacion(enlaceVerificacion: string): { asunto: string; texto: string; html: string } {
  const asunto = 'Verifica tu cuenta en Typeapromo';
  const texto = `Hola,

Gracias por crear una cuenta en Typeapromo.

Para verificar tu correo electrónico y activar tu espacio de trabajo, accede al siguiente enlace:
${enlaceVerificacion}

Este enlace es válido durante las próximas 24 horas y solo puede utilizarse una vez.

Si no has solicitado esta cuenta, puedes ignorar este mensaje.
`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${asunto}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7f7f8; color: #1a1a1a; margin: 0; padding: 40px 20px; line-height: 1.5;">
  <div style="max-width: 540px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e5e5e7; padding: 32px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
    <h1 style="font-size: 20px; font-weight: 600; margin-top: 0; margin-bottom: 16px; color: #111111;">Typeapromo</h1>
    <p style="font-size: 15px; color: #333333; margin-bottom: 24px;">Gracias por crear una cuenta en Typeapromo. Para activar tu espacio de trabajo y verificar tu correo, haz clic en el siguiente botón:</p>
    <div style="text-align: left; margin-bottom: 28px;">
      <a href="${enlaceVerificacion}" style="display: inline-block; background-color: #111111; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 500; font-size: 14px;">Verificar correo electrónico</a>
    </div>
    <p style="font-size: 13px; color: #666666; margin-bottom: 16px;">O copia y pega este enlace en tu navegador:</p>
    <p style="font-size: 12px; color: #888888; word-break: break-all; margin-bottom: 24px;">${enlaceVerificacion}</p>
    <hr style="border: none; border-top: 1px solid #eeeeee; margin: 24px 0;" />
    <p style="font-size: 12px; color: #888888; margin: 0;">Este enlace caduca en 24 horas y solo puede usarse una vez. Si no has creado una cuenta, puedes ignorar este mensaje con seguridad.</p>
  </div>
</body>
</html>`;

  return { asunto, texto, html };
}

/**
 * Genera el asunto, texto y HTML para el correo de restablecimiento de contraseña.
 */
export function plantillaRestablecimiento(enlaceRestablecimiento: string): { asunto: string; texto: string; html: string } {
  const asunto = 'Restablece tu contraseña en Typeapromo';
  const texto = `Hola,

Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en Typeapromo.

Accede al siguiente enlace para elegir una nueva contraseña:
${enlaceRestablecimiento}

Este enlace es válido durante 1 hora y solo puede utilizarse una vez.

Si no has solicitado restablecer tu contraseña, puedes ignorar este mensaje; tu contraseña actual no cambiará.
`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${asunto}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7f7f8; color: #1a1a1a; margin: 0; padding: 40px 20px; line-height: 1.5;">
  <div style="max-width: 540px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e5e5e7; padding: 32px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
    <h1 style="font-size: 20px; font-weight: 600; margin-top: 0; margin-bottom: 16px; color: #111111;">Typeapromo</h1>
    <p style="font-size: 15px; color: #333333; margin-bottom: 24px;">Hemos recibido una solicitud para restablecer la contraseña de tu cuenta. Haz clic en el botón para definir una nueva:</p>
    <div style="text-align: left; margin-bottom: 28px;">
      <a href="${enlaceRestablecimiento}" style="display: inline-block; background-color: #111111; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 500; font-size: 14px;">Restablecer contraseña</a>
    </div>
    <p style="font-size: 13px; color: #666666; margin-bottom: 16px;">O copia y pega este enlace en tu navegador:</p>
    <p style="font-size: 12px; color: #888888; word-break: break-all; margin-bottom: 24px;">${enlaceRestablecimiento}</p>
    <hr style="border: none; border-top: 1px solid #eeeeee; margin: 24px 0;" />
    <p style="font-size: 12px; color: #888888; margin: 0;">Este enlace caduca en 1 hora y solo puede usarse una vez. Si no has solicitado este cambio, ignora este mensaje y tu contraseña permanecerá inalterada.</p>
  </div>
</body>
</html>`;

  return { asunto, texto, html };
}

/**
 * Genera el asunto, texto y HTML para el correo de notificación de nueva respuesta recibida.
 */
export function plantillaNuevaRespuesta(opciones: {
  nombreDestinatario?: string | null;
  tituloFormulario: string;
  enlaceResultados?: string;
  totalRespondidas?: number;
}): { asunto: string; texto: string; html: string } {
  const asunto = `Nueva respuesta en «${opciones.tituloFormulario}»`;
  const saludo = opciones.nombreDestinatario ? `Hola, ${opciones.nombreDestinatario}:` : 'Hola:';
  const detalleRespondidas =
    opciones.totalRespondidas !== undefined
      ? `Preguntas respondidas: ${opciones.totalRespondidas}.\n`
      : '';
  const detalleEnlace = opciones.enlaceResultados
    ? `Puedes ver los resultados completos en tu panel:\n${opciones.enlaceResultados}\n`
    : '';

  const texto = `${saludo}

Alguien acaba de completar tu formulario «${opciones.tituloFormulario}».

${detalleRespondidas}${detalleEnlace}
Un saludo,
El equipo de Typeapromo
`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${asunto}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7f7f8; color: #1a1a1a; margin: 0; padding: 40px 20px; line-height: 1.5;">
  <div style="max-width: 540px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e5e5e7; padding: 32px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
    <h1 style="font-size: 20px; font-weight: 600; margin-top: 0; margin-bottom: 16px; color: #111111;">Typeapromo</h1>
    <p style="font-size: 15px; color: #333333; margin-bottom: 16px;">${saludo}</p>
    <p style="font-size: 15px; color: #333333; margin-bottom: 24px;">Alguien acaba de completar tu formulario <strong>«${opciones.tituloFormulario}»</strong>.</p>
    ${
      opciones.totalRespondidas !== undefined
        ? `<p style="font-size: 14px; color: #555555; margin-bottom: 24px;">Preguntas respondidas: <strong>${opciones.totalRespondidas}</strong></p>`
        : ''
    }
    ${
      opciones.enlaceResultados
        ? `<div style="text-align: left; margin-bottom: 28px;">
      <a href="${opciones.enlaceResultados}" style="display: inline-block; background-color: #111111; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 500; font-size: 14px;">Ver respuestas en el panel</a>
    </div>
    <p style="font-size: 13px; color: #666666; margin-bottom: 8px;">O accede directamente a este enlace:</p>
    <p style="font-size: 12px; color: #888888; word-break: break-all; margin-bottom: 24px;">${opciones.enlaceResultados}</p>`
        : ''
    }
    <hr style="border: none; border-top: 1px solid #eeeeee; margin: 24px 0;" />
    <p style="font-size: 12px; color: #888888; margin: 0;">Recibes este correo porque las notificaciones están activadas en la configuración de este formulario en Typeapromo.</p>
  </div>
</body>
</html>`;

  return { asunto, texto, html };
}

/**
 * Envía una notificación por correo al propietario cuando se completa un formulario.
 */
export async function enviarNotificacionNuevaRespuesta(opciones: {
  para: string;
  nombreDestinatario?: string | null;
  tituloFormulario: string;
  enlaceResultados?: string;
  totalRespondidas?: number;
}): Promise<{ exito: boolean; id?: string }> {
  const plantilla = plantillaNuevaRespuesta(opciones);
  return enviarCorreo({
    para: opciones.para,
    asunto: plantilla.asunto,
    texto: plantilla.texto,
    html: plantilla.html,
  });
}

