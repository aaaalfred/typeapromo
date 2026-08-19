# `lib/forms` — contratos y motor de lógica

Fase 2 del plan. Es el contrato único entre el editor, la API y la experiencia
pública: los tres importan de `@/lib/forms` para que ninguno pueda quedarse con
una copia divergente de las reglas del documento.

Única dependencia externa: **zod**.

## Ficheros

| Fichero | Responsabilidad |
|---|---|
| `definition.ts` | Esquemas Zod del documento y validación de respuestas por tipo. Solo **forma**. |
| `engine.ts` | Recorrido: siguiente pantalla, alcanzables, progreso. |
| `validate.ts` | Validador de publicación. Solo **semántica**, con errores tipados. |
| `rating.ts` | Normalización y analítica de las valoraciones. |
| `index.ts` | Reexporta todo. |

La separación forma/semántica es deliberada: `formDefinitionSchema.parse()`
garantiza que el JSONB es legible; `validateForPublication()` garantiza que
además tiene sentido como formulario publicable.

## Modelo

```
FormDefinition
├─ schemaVersion: 1          ← literal, obligatorio (PLAN.md §2.5)
├─ meta                      título, descripción, idioma, mensaje de cierre
├─ theme                     colores, tipografía, radio, botón, alineación, logo, fondo
├─ blocks[]                  recorrido secuencial — 10 tipos, nunca `ending`
├─ rules[]                   lógica condicional
├─ endScreens[]              pantallas finales — el tipo `ending`
├─ defaultEndScreenId?       si se omite, `endScreens[0]`
└─ settings                  barra de progreso, reanudación, numeración
```

Los **once tipos de bloque** están en una unión discriminada por `type`:
`short_text`, `long_text`, `email`, `date`, `single_choice`, `multi_choice`,
`scale`, `rating`, `statement`, `welcome` y `ending`. Los ocho primeros recogen
respuesta (`QuestionDefinition`); `ending` solo aparece en `endScreens`.

`rating` es **un único tipo configurable**: `appearance` (`stars` | `faces` |
`hearts`) × `scale` (3 | 5 | 7 | 10) + etiquetas opcionales de los extremos. Las
preguntas de selección se presentan como `list`, `buttons`, `image_cards` o
`grid`.

## Reglas del motor

1. Flujo **secuencial** por defecto.
2. Las reglas del mismo origen se evalúan por **prioridad ascendente**
   (`priority: 1` antes que `priority: 2`); gana la primera que se cumple.
3. **Solo saltos hacia adelante.** El motor ignora en tiempo de ejecución
   cualquier destino que no exista o que no esté por delante, así que el
   recorrido no puede ciclar ni con un documento corrupto. El validador lo
   rechaza antes de publicar.
4. Al caer del último bloque se muestra la pantalla final por defecto.

Convención con respuesta vacía: solo se cumplen `is_empty`, `not_equals`,
`not_contains` e `is_not_selected`. `contains` exige **todos** los valores
buscados; `is_selected` se conforma con **alguno**.

## API principal

```ts
nextScreen(definition, answers, currentId)   // ScreenRef: block | end_screen | complete
firstScreen(definition)
walkPath(definition, answers)                // recorrido completo, para CSV y tests
reachableFrom(definition, answers, currentId) // ReachableSet
countReachableQuestions(definition, answers, currentId)
progressFor(definition, answers, currentId)  // barra de progreso

validateForPublication(input: unknown): ValidationReport
validateDefinition(definition): { errors, warnings }

normalize(value, scale)                      // (value - 1) / (scale - 1)
summarizeRating(values, scale)
```

`reachableFrom` implementa la definición de progreso de PLAN.md §2.7: las
preguntas alcanzables desde la actual **dadas las respuestas ya introducidas**.
Cada bloque ya respondido tiene su bifurcación resuelta y solo aporta su rama
real; los que aún no se han respondido aportan todas las ramas posibles. Por eso
el total es una estimación y `ReachableSet.deterministic` dice si todavía puede
cambiar.

## Validador de publicación

Devuelve errores **tipados**, no cadenas: cada uno lleva `code`, los datos
concretos del problema (`ruleId`, `blockId`, `targetId`…), un `message` en
español y la `path` dentro del documento para que el editor pueda enlazarlo.

Cubre los cuatro casos exigidos por el plan — destinos inexistentes, saltos
hacia atrás, preguntas inalcanzables y reglas contradictorias — y además:
identificadores repetidos, colisiones bloque/pantalla, prioridades repetidas,
operadores no aplicables al tipo de pregunta, valores fuera de rango, opciones
inexistentes, rangos de escala, longitud, fecha y selección incoherentes.

Como advertencias no bloqueantes: reglas muertas, reglas tapadas por otra que se
cumple siempre, reglas redundantes, pantallas finales huérfanas, opciones sin
imagen en presentación visual y formularios sin ninguna pregunta.

## Rating

El valor **entero** elegido es lo que se persiste; la normalización se calcula
al leer. Guardar el valor normalizado impediría cambiar la escala de una
pregunta sin reescribir respuestas históricas, que es justo lo que evita el
versionado del formulario.

## Tests

`__tests__/` cubre los once tipos de bloque, los doce operadores, el análisis
estático de reglas, los casos límite de saltos (hacia atrás, a sí mismo, a
destinos inexistentes, encadenados, a pantalla final, con empate de prioridad) y
todos los códigos del validador.

```bash
npm run test -- src/lib/forms
npm run typecheck
```
