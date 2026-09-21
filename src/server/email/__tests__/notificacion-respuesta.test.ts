import { describe, expect, it, vi } from 'vitest';
import { formSettingsSchema } from '@/lib/forms/definition';
import {
  enviarNotificacionNuevaRespuesta,
  plantillaNuevaRespuesta,
} from '../index';

describe('notificación de nueva respuesta al owner', () => {
  it('la configuración del formulario incluye notifyOnCompletion por defecto en true', () => {
    const porDefecto = formSettingsSchema.parse({});
    expect(porDefecto.notifyOnCompletion).toBe(true);

    const desactivado = formSettingsSchema.parse({ notifyOnCompletion: false });
    expect(desactivado.notifyOnCompletion).toBe(false);
  });

  it('genera plantilla con todos los datos opcionales presentes', () => {
    const resultado = plantillaNuevaRespuesta({
      nombreDestinatario: 'Ana Propietaria',
      tituloFormulario: 'Registro de Clientes',
      enlaceResultados: 'https://typeapromo.com/app/formularios/uuid-123/resultados',
      totalRespondidas: 4,
    });

    expect(resultado.asunto).toBe('Nueva respuesta en «Registro de Clientes»');
    expect(resultado.texto).toContain('Hola, Ana Propietaria:');
    expect(resultado.texto).toContain('Registro de Clientes');
    expect(resultado.texto).toContain('Preguntas respondidas: 4.');
    expect(resultado.texto).toContain('https://typeapromo.com/app/formularios/uuid-123/resultados');
    expect(resultado.html).toContain('Ana Propietaria');
    expect(resultado.html).toContain('Ver respuestas en el panel');
  });

  it('genera plantilla limpia cuando no hay nombre ni enlace', () => {
    const resultado = plantillaNuevaRespuesta({
      tituloFormulario: 'Feedback Rápido',
    });

    expect(resultado.asunto).toBe('Nueva respuesta en «Feedback Rápido»');
    expect(resultado.texto).toContain('Hola:');
    expect(resultado.texto).not.toContain('Preguntas respondidas:');
    expect(resultado.texto).not.toContain('undefined');
    expect(resultado.html).not.toContain('Ver respuestas en el panel');
  });

  it('enviarNotificacionNuevaRespuesta captura fallos sin lanzar excepción', async () => {
    const originalApiKey = process.env.RESEND_API_KEY;
    // Forzamos clave inválida para provocar fallo o comprobamos retorno seguro
    process.env.RESEND_API_KEY = 're_clave_invalida_de_prueba';

    const spyError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const resultado = await enviarNotificacionNuevaRespuesta({
      para: 'owner@empresa.com',
      tituloFormulario: 'Encuesta',
    });

    // Debe devolver un objeto { exito: false } en vez de romper la ejecución
    expect(resultado.exito).toBe(false);

    spyError.mockRestore();
    if (originalApiKey !== undefined) {
      process.env.RESEND_API_KEY = originalApiKey;
    } else {
      delete process.env.RESEND_API_KEY;
    }
  });
});
