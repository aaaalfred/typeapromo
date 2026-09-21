import { createDefaultFormDefinition } from '@/lib/forms';
import { describe, expect, it } from 'vitest';

import {
  createFormSchema,
  duplicateFormSchema,
  formIdSchema,
  listFormsQueryFromSearchParams,
  listFormsQuerySchema,
  saveDraftSchema,
  updateFormSchema,
} from '../schemas';

const DEFINICION = createDefaultFormDefinition('Encuesta');

describe('createFormSchema', () => {
  it('acepta solo el título y recorta los espacios', () => {
    const parsed = createFormSchema.parse({ title: '  Encuesta  ' });
    expect(parsed.title).toBe('Encuesta');
    expect(parsed.definition).toBeUndefined();
  });

  it('acepta una definición completa', () => {
    const parsed = createFormSchema.parse({ title: 'Encuesta', definition: DEFINICION });
    expect(parsed.definition?.schemaVersion).toBe(1);
  });

  it('rechaza el título vacío o ausente', () => {
    expect(createFormSchema.safeParse({ title: '   ' }).success).toBe(false);
    expect(createFormSchema.safeParse({}).success).toBe(false);
  });

  it('rechaza campos desconocidos', () => {
    expect(createFormSchema.safeParse({ title: 'Encuesta', status: 'published' }).success).toBe(
      false,
    );
  });

  it('rechaza una definición con forma inválida', () => {
    expect(
      createFormSchema.safeParse({ title: 'Encuesta', definition: { schemaVersion: 99 } }).success,
    ).toBe(false);
  });
});

describe('updateFormSchema', () => {
  it('acepta cualquier metadato suelto', () => {
    expect(updateFormSchema.parse({ title: 'Otro' }).title).toBe('Otro');
    expect(updateFormSchema.parse({ archived: true }).archived).toBe(true);
    expect(updateFormSchema.parse({ slug: 'otro-slug' }).slug).toBe('otro-slug');
  });

  it('rechaza un slug de menos de 3 caracteres', () => {
    expect(updateFormSchema.safeParse({ slug: 'ab' }).success).toBe(false);
  });

  it('rechaza un slug con guiones dobles o formato inválido', () => {
    expect(updateFormSchema.safeParse({ slug: 'slug--doble' }).success).toBe(false);
    expect(updateFormSchema.safeParse({ slug: '-slug' }).success).toBe(false);
    expect(updateFormSchema.safeParse({ slug: 'slug-' }).success).toBe(false);
  });

  it('rechaza un slug reservado', () => {
    expect(updateFormSchema.safeParse({ slug: 'app' }).success).toBe(false);
    expect(updateFormSchema.safeParse({ slug: 'iniciar-sesion' }).success).toBe(false);
  });

  it('rechaza un cuerpo sin ningún metadato', () => {
    expect(updateFormSchema.safeParse({}).success).toBe(false);
  });

  it('no admite cambiar el estado por la puerta de atrás', () => {
    expect(updateFormSchema.safeParse({ status: 'published' }).success).toBe(false);
  });
});

describe('saveDraftSchema', () => {
  it('exige revisión y definición', () => {
    const parsed = saveDraftSchema.parse({ revision: 3, definition: DEFINICION });
    expect(parsed.revision).toBe(3);
  });

  it('rechaza el guardado sin revisión: sin ella no hay control optimista', () => {
    expect(saveDraftSchema.safeParse({ definition: DEFINICION }).success).toBe(false);
  });

  it('rechaza revisiones no enteras o menores que uno', () => {
    expect(saveDraftSchema.safeParse({ revision: 0, definition: DEFINICION }).success).toBe(false);
    expect(saveDraftSchema.safeParse({ revision: 1.5, definition: DEFINICION }).success).toBe(
      false,
    );
    expect(saveDraftSchema.safeParse({ revision: '2', definition: DEFINICION }).success).toBe(
      false,
    );
  });

  it('rechaza una definición corrupta', () => {
    expect(
      saveDraftSchema.safeParse({
        revision: 1,
        definition: { ...DEFINICION, blocks: [{ type: 'inexistente' }] },
      }).success,
    ).toBe(false);
  });

  it('devuelve mensajes en español', () => {
    const parsed = saveDraftSchema.safeParse({ definition: DEFINICION });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.message).join(' ')).toMatch(/revisión/i);
    }
  });
});

describe('duplicateFormSchema', () => {
  it('admite cuerpo vacío', () => {
    expect(duplicateFormSchema.parse({})).toEqual({});
  });

  it('admite un título propio para la copia', () => {
    expect(duplicateFormSchema.parse({ title: 'Copia manual' }).title).toBe('Copia manual');
  });
});

describe('formIdSchema', () => {
  it('exige un UUID', () => {
    expect(formIdSchema.safeParse('3f0f8b34-4b4b-4a5f-9a3a-2f3a1b2c3d4e').success).toBe(true);
    expect(formIdSchema.safeParse('no-es-un-uuid').success).toBe(false);
  });
});

describe('listFormsQuerySchema', () => {
  function desdeUrl(query: string): unknown {
    return listFormsQueryFromSearchParams(new URLSearchParams(query));
  }

  it('aplica los valores por defecto cuando no hay parámetros', () => {
    expect(listFormsQuerySchema.parse(desdeUrl(''))).toEqual({
      page: 1,
      perPage: 20,
      sort: 'updated',
    });
  });

  it('convierte página y tamaño desde la cadena de consulta', () => {
    const parsed = listFormsQuerySchema.parse(desdeUrl('page=3&perPage=50'));
    expect(parsed.page).toBe(3);
    expect(parsed.perPage).toBe(50);
  });

  it('acota el tamaño de página', () => {
    expect(listFormsQuerySchema.safeParse(desdeUrl('perPage=500')).success).toBe(false);
    expect(listFormsQuerySchema.safeParse(desdeUrl('page=0')).success).toBe(false);
  });

  it('interpreta los booleanos de la URL sin invertirlos', () => {
    expect(listFormsQuerySchema.parse(desdeUrl('includeArchived=1')).includeArchived).toBe(true);
    expect(listFormsQuerySchema.parse(desdeUrl('includeArchived=true')).includeArchived).toBe(
      true,
    );
    expect(listFormsQuerySchema.parse(desdeUrl('includeArchived=0')).includeArchived).toBe(false);
    expect(listFormsQuerySchema.parse(desdeUrl('includeArchived=false')).includeArchived).toBe(
      false,
    );
  });

  it('rechaza estados y criterios de orden desconocidos', () => {
    expect(listFormsQuerySchema.safeParse(desdeUrl('status=borrador')).success).toBe(false);
    expect(listFormsQuerySchema.safeParse(desdeUrl('sort=aleatorio')).success).toBe(false);
    expect(listFormsQuerySchema.parse(desdeUrl('status=archived')).status).toBe('archived');
  });

  it('ignora los parámetros vacíos en lugar de romper los valores por defecto', () => {
    expect(listFormsQuerySchema.parse(desdeUrl('q=&page='))).toEqual({
      page: 1,
      perPage: 20,
      sort: 'updated',
    });
  });
});
