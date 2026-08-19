/**
 * Operaciones sobre el documento del editor.
 *
 * Todas son **puras e inmutables**: reciben un `FormDefinition` y devuelven otro
 * nuevo. Eso es lo que permite que el autosave compare por identidad («¿ha
 * cambiado el documento desde el último guardado?») sin llevar una bandera de
 * suciedad aparte, que es justo la que se olvida de bajar y produce guardados
 * perdidos.
 *
 * Aquí vive además el mantenimiento de integridad que el usuario no debería
 * tener que recordar: borrar un bloque borra las reglas que salen de él **y**
 * las que apuntan a él; borrar una pantalla final la desengancha de las reglas
 * y del destino por defecto. Sin esto, cada borrado dejaría el documento
 * impublicable y el panel de lógica lleno de referencias fantasma.
 */

import {
  isChoiceBlock,
  type ChoiceDefinition,
  type EndingBlock,
  type FlowBlockDefinition,
  type FormDefinition,
  type FormMeta,
  type FormSettings,
  type LogicRule,
  type ThemeColors,
  type ThemeDefinition,
  type ThemeTypography,
} from '@/lib/forms';

import { nuevoId } from './ids';
import { crearBloque, crearOpcion, crearPantallaFinal, convertirBloque } from './plantillas';

/* -------------------------------------------------------------------------- */
/* Utilidades                                                                  */
/* -------------------------------------------------------------------------- */

/** Todos los identificadores usados por el documento, de cualquier clase. */
export function identificadoresOcupados(definicion: FormDefinition): Set<string> {
  const ocupados = new Set<string>();
  for (const bloque of definicion.blocks) {
    ocupados.add(bloque.id);
    if (isChoiceBlock(bloque)) {
      for (const opcion of bloque.choices) ocupados.add(opcion.id);
    }
  }
  for (const pantalla of definicion.endScreens) ocupados.add(pantalla.id);
  for (const regla of definicion.rules) ocupados.add(regla.id);
  return ocupados;
}

/** Mueve un elemento de un array a otra posición, devolviendo uno nuevo. */
export function moverEnArray<T>(elementos: readonly T[], desde: number, hasta: number): T[] {
  const copia = [...elementos];
  if (desde < 0 || desde >= copia.length) return copia;
  const destino = Math.min(Math.max(hasta, 0), copia.length - 1);
  const [elemento] = copia.splice(desde, 1);
  if (elemento === undefined) return copia;
  copia.splice(destino, 0, elemento);
  return copia;
}

/** Bloque del recorrido por identificador. */
export function bloquePorId(
  definicion: FormDefinition,
  bloqueId: string,
): FlowBlockDefinition | null {
  return definicion.blocks.find((bloque) => bloque.id === bloqueId) ?? null;
}

/** Pantalla final por identificador. */
export function pantallaPorId(definicion: FormDefinition, pantallaId: string): EndingBlock | null {
  return definicion.endScreens.find((pantalla) => pantalla.id === pantallaId) ?? null;
}

/* -------------------------------------------------------------------------- */
/* Metadatos, ajustes y tema                                                   */
/* -------------------------------------------------------------------------- */

export function actualizarMeta(
  definicion: FormDefinition,
  parcial: Partial<FormMeta>,
): FormDefinition {
  return { ...definicion, meta: { ...definicion.meta, ...parcial } };
}

export function actualizarAjustes(
  definicion: FormDefinition,
  parcial: Partial<FormSettings>,
): FormDefinition {
  return { ...definicion, settings: { ...definicion.settings, ...parcial } };
}

export function actualizarTema(
  definicion: FormDefinition,
  parcial: Partial<ThemeDefinition>,
): FormDefinition {
  return { ...definicion, theme: { ...definicion.theme, ...parcial } };
}

export function actualizarColores(
  definicion: FormDefinition,
  parcial: Partial<ThemeColors>,
): FormDefinition {
  return actualizarTema(definicion, { colors: { ...definicion.theme.colors, ...parcial } });
}

export function actualizarTipografia(
  definicion: FormDefinition,
  parcial: Partial<ThemeTypography>,
): FormDefinition {
  return actualizarTema(definicion, {
    typography: { ...definicion.theme.typography, ...parcial },
  });
}

/* -------------------------------------------------------------------------- */
/* Bloques                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Inserta un bloque nuevo.
 *
 * La bienvenida es un caso aparte: el validador exige que sea el primer bloque
 * y que no haya más de una, así que se coloca sola al principio y se ignora la
 * posición pedida.
 */
export function anadirBloque(
  definicion: FormDefinition,
  tipo: Parameters<typeof crearBloque>[0],
  indice?: number,
): { readonly definicion: FormDefinition; readonly bloque: FlowBlockDefinition } {
  const bloque = crearBloque(tipo, identificadoresOcupados(definicion));

  if (tipo === 'welcome') {
    if (definicion.blocks.some((existente) => existente.type === 'welcome')) {
      return { definicion, bloque };
    }
    return { definicion: { ...definicion, blocks: [bloque, ...definicion.blocks] }, bloque };
  }

  // Nunca por delante de la bienvenida.
  const minimo = definicion.blocks[0]?.type === 'welcome' ? 1 : 0;
  const posicion = Math.min(
    Math.max(indice ?? definicion.blocks.length, minimo),
    definicion.blocks.length,
  );
  const blocks = [...definicion.blocks];
  blocks.splice(posicion, 0, bloque);
  return { definicion: { ...definicion, blocks }, bloque };
}

/** Sustituye un bloque por el resultado de aplicarle `mapear`. */
export function actualizarBloque(
  definicion: FormDefinition,
  bloqueId: string,
  mapear: (bloque: FlowBlockDefinition) => FlowBlockDefinition,
): FormDefinition {
  let cambiado = false;
  const blocks = definicion.blocks.map((bloque) => {
    if (bloque.id !== bloqueId) return bloque;
    cambiado = true;
    return mapear(bloque);
  });
  return cambiado ? { ...definicion, blocks } : definicion;
}

/** Reemplaza un bloque completo. Lo usan los paneles, que ya lo tienen tipado. */
export function reemplazarBloque(
  definicion: FormDefinition,
  bloque: FlowBlockDefinition,
): FormDefinition {
  return actualizarBloque(definicion, bloque.id, () => bloque);
}

/** Cambia el tipo de un bloque conservando su identificador y su contenido común. */
export function cambiarTipoDeBloque(
  definicion: FormDefinition,
  bloqueId: string,
  tipo: Parameters<typeof crearBloque>[0],
): FormDefinition {
  const ocupados = identificadoresOcupados(definicion);
  const convertida = actualizarBloque(definicion, bloqueId, (bloque) =>
    convertirBloque(bloque, tipo, ocupados),
  );
  // Al dejar de recoger respuesta, las reglas que salían del bloque dejan de
  // tener sentido: el validador las rechazaría con `RULE_SOURCE_NOT_A_QUESTION`.
  const nuevo = bloquePorId(convertida, bloqueId);
  if (nuevo === null || 'required' in nuevo) return convertida;
  return {
    ...convertida,
    rules: convertida.rules.filter((regla) => regla.sourceQuestionId !== bloqueId),
  };
}

/**
 * Elimina un bloque y todo lo que quedaría colgando: las reglas que salen de él
 * y las que lo tenían por destino.
 */
export function eliminarBloque(definicion: FormDefinition, bloqueId: string): FormDefinition {
  return {
    ...definicion,
    blocks: definicion.blocks.filter((bloque) => bloque.id !== bloqueId),
    rules: definicion.rules.filter(
      (regla) =>
        regla.sourceQuestionId !== bloqueId &&
        !(regla.target.kind === 'block' && regla.target.id === bloqueId),
    ),
  };
}

/**
 * Duplica un bloque justo detrás del original, con identificadores nuevos para
 * él y para sus opciones. Las reglas **no** se duplican: apuntarían al mismo
 * destino desde una pregunta distinta y casi nunca es lo que se quiere.
 */
export function duplicarBloque(definicion: FormDefinition, bloqueId: string): FormDefinition {
  const indice = definicion.blocks.findIndex((bloque) => bloque.id === bloqueId);
  const original = definicion.blocks[indice];
  if (original === undefined) return definicion;
  // La bienvenida no se puede duplicar: solo puede haber una.
  if (original.type === 'welcome') return definicion;

  const ocupados = identificadoresOcupados(definicion);
  const id = nuevoId('b', ocupados);
  ocupados.add(id);

  let copia: FlowBlockDefinition = { ...original, id, title: `${original.title} (copia)` };
  if (isChoiceBlock(copia)) {
    copia = {
      ...copia,
      choices: copia.choices.map((opcion) => {
        const opcionId = nuevoId('op', ocupados);
        ocupados.add(opcionId);
        return { ...opcion, id: opcionId };
      }),
    };
  }

  const blocks = [...definicion.blocks];
  blocks.splice(indice + 1, 0, copia);
  return { ...definicion, blocks };
}

/** Reordena el recorrido. Es lo que invoca el arrastre y el movimiento por teclado. */
export function moverBloque(
  definicion: FormDefinition,
  desde: number,
  hasta: number,
): FormDefinition {
  if (desde === hasta) return definicion;
  return { ...definicion, blocks: moverEnArray(definicion.blocks, desde, hasta) };
}

/** Reordena por identificador y desplazamiento relativo (`-1` sube, `+1` baja). */
export function desplazarBloque(
  definicion: FormDefinition,
  bloqueId: string,
  delta: number,
): FormDefinition {
  const desde = definicion.blocks.findIndex((bloque) => bloque.id === bloqueId);
  if (desde < 0) return definicion;
  const hasta = desde + delta;
  if (hasta < 0 || hasta >= definicion.blocks.length) return definicion;
  return moverBloque(definicion, desde, hasta);
}

/* -------------------------------------------------------------------------- */
/* Opciones de selección                                                       */
/* -------------------------------------------------------------------------- */

function mapearOpciones(
  definicion: FormDefinition,
  bloqueId: string,
  mapear: (opciones: readonly ChoiceDefinition[]) => ChoiceDefinition[],
): FormDefinition {
  return actualizarBloque(definicion, bloqueId, (bloque) =>
    isChoiceBlock(bloque) ? { ...bloque, choices: mapear(bloque.choices) } : bloque,
  );
}

export function anadirOpcion(definicion: FormDefinition, bloqueId: string): FormDefinition {
  const bloque = bloquePorId(definicion, bloqueId);
  if (bloque === null || !isChoiceBlock(bloque)) return definicion;

  const ocupados = identificadoresOcupados(definicion);
  const valores = new Set(bloque.choices.map((opcion) => opcion.value));
  let numero = bloque.choices.length + 1;
  while (valores.has(`opcion-${String(numero)}`)) numero += 1;

  const opcion = crearOpcion(ocupados, numero);
  return mapearOpciones(definicion, bloqueId, (opciones) => [...opciones, opcion]);
}

export function actualizarOpcion(
  definicion: FormDefinition,
  bloqueId: string,
  opcionId: string,
  parcial: Partial<ChoiceDefinition>,
): FormDefinition {
  return mapearOpciones(definicion, bloqueId, (opciones) =>
    opciones.map((opcion) => (opcion.id === opcionId ? { ...opcion, ...parcial } : opcion)),
  );
}

/**
 * Elimina una opción y limpia las reglas que la comparaban: una regla que
 * apunta a un valor inexistente es un error de publicación (`RULE_CHOICE_NOT_FOUND`)
 * que el usuario no relacionaría con el borrado.
 */
export function eliminarOpcion(
  definicion: FormDefinition,
  bloqueId: string,
  opcionId: string,
): FormDefinition {
  const bloque = bloquePorId(definicion, bloqueId);
  if (bloque === null || !isChoiceBlock(bloque)) return definicion;
  // Una pregunta de selección necesita al menos una opción.
  if (bloque.choices.length <= 1) return definicion;

  const opcion = bloque.choices.find((candidata) => candidata.id === opcionId);
  const sinOpcion = mapearOpciones(definicion, bloqueId, (opciones) =>
    opciones.filter((candidata) => candidata.id !== opcionId),
  );
  if (opcion === undefined) return sinOpcion;

  return {
    ...sinOpcion,
    rules: sinOpcion.rules.filter(
      (regla) => regla.sourceQuestionId !== bloqueId || !reglaUsaValor(regla, opcion.value),
    ),
  };
}

function reglaUsaValor(regla: LogicRule, valor: string): boolean {
  if (typeof regla.value === 'string') return regla.value === valor;
  if (Array.isArray(regla.value)) return regla.value.includes(valor);
  return false;
}

export function moverOpcion(
  definicion: FormDefinition,
  bloqueId: string,
  desde: number,
  hasta: number,
): FormDefinition {
  return mapearOpciones(definicion, bloqueId, (opciones) => moverEnArray(opciones, desde, hasta));
}

/* -------------------------------------------------------------------------- */
/* Pantallas finales                                                           */
/* -------------------------------------------------------------------------- */

export function anadirPantallaFinal(definicion: FormDefinition): {
  readonly definicion: FormDefinition;
  readonly pantalla: EndingBlock;
} {
  const pantalla = crearPantallaFinal(identificadoresOcupados(definicion));
  return {
    definicion: { ...definicion, endScreens: [...definicion.endScreens, pantalla] },
    pantalla,
  };
}

export function reemplazarPantallaFinal(
  definicion: FormDefinition,
  pantalla: EndingBlock,
): FormDefinition {
  return {
    ...definicion,
    endScreens: definicion.endScreens.map((existente) =>
      existente.id === pantalla.id ? pantalla : existente,
    ),
  };
}

/**
 * Elimina una pantalla final. Se niega a dejar el documento sin ninguna, porque
 * entonces el recorrido acabaría en `complete` y `NO_END_SCREENS` bloquearía la
 * publicación sin que el usuario supiera por qué.
 */
export function eliminarPantallaFinal(
  definicion: FormDefinition,
  pantallaId: string,
): FormDefinition {
  if (definicion.endScreens.length <= 1) return definicion;

  const endScreens = definicion.endScreens.filter((pantalla) => pantalla.id !== pantallaId);
  const rules = definicion.rules.filter(
    (regla) => !(regla.target.kind === 'end_screen' && regla.target.id === pantallaId),
  );
  const defaultEndScreenId =
    definicion.defaultEndScreenId === pantallaId ? undefined : definicion.defaultEndScreenId;

  return { ...definicion, endScreens, rules, defaultEndScreenId };
}

/** Marca la pantalla final por defecto (la que se alcanza por caída natural). */
export function marcarPantallaPorDefecto(
  definicion: FormDefinition,
  pantallaId: string,
): FormDefinition {
  if (pantallaPorId(definicion, pantallaId) === null) return definicion;
  return { ...definicion, defaultEndScreenId: pantallaId };
}

/* -------------------------------------------------------------------------- */
/* Reglas de lógica                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Prioridad libre más baja para un origen dado.
 *
 * El validador exige prioridades distintas por origen (si dos empatan, el orden
 * de evaluación dependería del array y dejaría de ser reproducible), así que la
 * asigna el editor y no el usuario.
 */
export function siguientePrioridad(definicion: FormDefinition, origenId: string): number {
  const usadas = new Set(
    definicion.rules
      .filter((regla) => regla.sourceQuestionId === origenId)
      .map((regla) => regla.priority),
  );
  let prioridad = 1;
  while (usadas.has(prioridad)) prioridad += 1;
  return prioridad;
}

export function anadirRegla(
  definicion: FormDefinition,
  regla: Omit<LogicRule, 'id' | 'priority'> & { readonly priority?: number },
): { readonly definicion: FormDefinition; readonly regla: LogicRule } {
  const nueva: LogicRule = {
    ...regla,
    id: nuevoId('r', identificadoresOcupados(definicion)),
    priority: regla.priority ?? siguientePrioridad(definicion, regla.sourceQuestionId),
  };
  return { definicion: { ...definicion, rules: [...definicion.rules, nueva] }, regla: nueva };
}

export function actualizarRegla(
  definicion: FormDefinition,
  reglaId: string,
  parcial: Partial<Omit<LogicRule, 'id'>>,
): FormDefinition {
  return {
    ...definicion,
    rules: definicion.rules.map((regla) =>
      regla.id === reglaId ? { ...regla, ...parcial } : regla,
    ),
  };
}

export function eliminarRegla(definicion: FormDefinition, reglaId: string): FormDefinition {
  return { ...definicion, rules: definicion.rules.filter((regla) => regla.id !== reglaId) };
}

/**
 * Sube o baja una regla dentro de las de su mismo origen, reescribiendo las
 * prioridades de todo el grupo para que queden 1, 2, 3… sin huecos ni empates.
 */
export function desplazarRegla(
  definicion: FormDefinition,
  reglaId: string,
  delta: number,
): FormDefinition {
  const regla = definicion.rules.find((candidata) => candidata.id === reglaId);
  if (regla === undefined) return definicion;

  const hermanas = definicion.rules
    .filter((candidata) => candidata.sourceQuestionId === regla.sourceQuestionId)
    .sort((a, b) => a.priority - b.priority);

  const desde = hermanas.findIndex((candidata) => candidata.id === reglaId);
  const hasta = desde + delta;
  if (hasta < 0 || hasta >= hermanas.length) return definicion;

  const reordenadas = moverEnArray(hermanas, desde, hasta);
  const prioridades = new Map(reordenadas.map((candidata, indice) => [candidata.id, indice + 1]));

  return {
    ...definicion,
    rules: definicion.rules.map((candidata) => {
      const prioridad = prioridades.get(candidata.id);
      return prioridad === undefined ? candidata : { ...candidata, priority: prioridad };
    }),
  };
}
