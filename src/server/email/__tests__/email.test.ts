import { describe, expect, it, vi } from 'vitest';
import {
  enviarCorreo,
  enviarNotificacionNuevaRespuesta,
  plantillaNuevaRespuesta,
  plantillaRestablecimiento,
  plantillaVerificacion,
  remitenteConfigurado,
} from '../index';

describe('email templates y servicio', () => {
  it('remitenteConfigurado usa EMAIL_FROM o el valor por defecto', () => {
    const original = process.env.EMAIL_FROM;
    delete process.env.EMAIL_FROM;
    expect(remitenteConfigurado()).toContain('onboarding@resend.dev');

    process.env.EMAIL_FROM = 'Notificaciones <info@midominio.com>';
    expect(remitenteConfigurado()).toBe('Notificaciones <info@midominio.com>');

    if (original !== undefined) {
      process.env.EMAIL_FROM = original;
    } else {
      delete process.env.EMAIL_FROM;
    }
  });

  it('plantillaVerificacion incluye el enlace y textos en español', () => {
    const link = 'https://ejemplo.com/verificar-correo?token=abc123xyz';
    const plantilla = plantillaVerificacion(link);

    expect(plantilla.asunto).toContain('Verifica tu cuenta');
    expect(plantilla.texto).toContain(link);
    expect(plantilla.html).toContain(link);
    expect(plantilla.texto).toContain('24 horas');
  });

  it('plantillaRestablecimiento incluye el enlace y textos en español', () => {
    const link = 'https://ejemplo.com/restablecer-contrasena?token=reset456';
    const plantilla = plantillaRestablecimiento(link);

    expect(plantilla.asunto).toContain('Restablece tu contraseña');
    expect(plantilla.texto).toContain(link);
    expect(plantilla.html).toContain(link);
    expect(plantilla.texto).toContain('1 hora');
  });

  it('plantillaNuevaRespuesta genera correo informativo con enlace a resultados', () => {
    const plantilla = plantillaNuevaRespuesta({
      nombreDestinatario: 'Carlos',
      tituloFormulario: 'Encuesta de Satisfacción',
      enlaceResultados: 'https://app.typeapromo.com/app/formularios/123/resultados',
      totalRespondidas: 5,
    });

    expect(plantilla.asunto).toBe('Nueva respuesta en «Encuesta de Satisfacción»');
    expect(plantilla.texto).toContain('Hola, Carlos:');
    expect(plantilla.texto).toContain('Encuesta de Satisfacción');
    expect(plantilla.texto).toContain('Preguntas respondidas: 5.');
    expect(plantilla.texto).toContain('https://app.typeapromo.com/app/formularios/123/resultados');
    expect(plantilla.html).toContain('Encuesta de Satisfacción');
    expect(plantilla.html).toContain('Ver respuestas en el panel');
  });

  it('enviarCorreo en modo desarrollo no falla y escribe en console.info', async () => {
    const originalApiKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;

    const spyInfo = vi.spyOn(console, 'info').mockImplementation(() => {});

    const res = await enviarCorreo({
      para: 'test@ejemplo.com',
      asunto: 'Prueba',
      texto: 'Hola mundo',
      html: '<p>Hola mundo</p>',
    });

    expect(res.exito).toBe(true);
    expect(spyInfo).toHaveBeenCalled();

    spyInfo.mockRestore();
    if (originalApiKey !== undefined) {
      process.env.RESEND_API_KEY = originalApiKey;
    }
  });

  it('enviarNotificacionNuevaRespuesta llama a enviarCorreo correctamente', async () => {
    const spyInfo = vi.spyOn(console, 'info').mockImplementation(() => {});

    const res = await enviarNotificacionNuevaRespuesta({
      para: 'owner@ejemplo.com',
      nombreDestinatario: 'Owner',
      tituloFormulario: 'Formulario Demo',
      enlaceResultados: 'http://localhost:3000/app/formularios/abc/resultados',
      totalRespondidas: 3,
    });

    expect(res.exito).toBe(true);
    spyInfo.mockRestore();
  });
});
