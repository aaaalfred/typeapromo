# `components/formulario` — renderer compartido

Fase 4 del plan. Un **único** componente, dirigido por `FormDefinition`, que
pinta una pregunta por pantalla. El mismo que usarán la previsualización del
editor (fase 5) y la experiencia pública (fase 7).

> El camino crítico del proyecto es 2 → 4 → 5 (PLAN.md §7). Si el renderer no
> fuera literalmente el mismo componente en las dos vistas, acabarían
> divergiendo. Por eso **no hay ni una sola rama de modo** en el árbol de
> render: no existe `if (esPreview)`, y un test lo comprueba leyendo los
> fuentes (`__tests__/costura.test.tsx`).

## La costura

Todo lo que distingue una vista de la otra entra por **props**. La lista
completa está en `PropsRenderizadorFormulario`; esto es lo que significa cada
eje:

| Prop | Experiencia pública | Previsualización del editor |
|---|---|---|
| `definicion` | versión publicada (`form_versions`) | borrador en curso (`form_drafts`) |
| `respuestas` / `pantalla` | se omiten: el renderer se gobierna solo | se pasan: manda el estado del editor |
| `respuestasIniciales` / `pantallaInicial` | sesión reanudada | pantalla de arranque de la ejecución de prueba |
| `onAvanzar` | guarda la respuesta y espera al servidor | se omite, o registra sin persistir |
| `onCompletar` | cierra la sesión | nada |
| `onRespuestasChange` / `onPantallaChange` | opcionales | los usa para seguir a la pregunta seleccionada |
| `resolverMedia` | activos publicados en R2 | activos del borrador, incluidos los recién subidos |
| `enfocarAlCambiar` | `true` (por defecto) | `false`, para no robar el foco al panel de propiedades |
| `className` | ocupa la ventana | ocupa el marco de la previsualización |

Dos consecuencias que conviene tener presentes:

1. **Controlado y no controlado producen el mismo DOM.** Está fijado por un
   test: con las mismas respuestas y la misma pantalla, el marcado es idéntico.
2. **El ancho de la previsualización no necesita un modo «móvil».** La raíz es
   un `@container` y las variantes responsivas son de contenedor, no de ventana:
   estrechar el marco del editor produce exactamente la misma disposición que
   un teléfono.

## Estructura

| Fichero | Responsabilidad |
|---|---|
| `renderizador-formulario.tsx` | Estado, recorrido, validación al avanzar, tema y transición. Es la única pieza con estado. |
| `pantalla-bloque.tsx` | Único `switch` por tipo de bloque. Exhaustivo sobre la unión del contrato. |
| `marco-pantalla.tsx` | Estructura y accesibilidad comunes: título, descripción, media, error, `<form>`. |
| `pie-navegacion.tsx` | Botones de avance y retroceso. La etiqueta la decide el motor. |
| `bloques/` | Los once tipos. Cada uno aporta solo su control. |
| `controles/` | Selección (cuatro presentaciones), escala y valoración. |
| `contexto.tsx` | Estado que los bloques leen, e identificadores ARIA derivados del `id` del bloque. |
| `validacion.ts` | Redacción en español sobre `validateAnswer()`. No reimplementa ninguna regla. |
| `medios.ts` | Tipo `ResolverMedia`. El renderer nunca sabe de dónde sale una URL. |

El tema vive aparte, en `@/lib/theme`: convierte `ThemeDefinition` en variables
CSS `--tp-*` que se aplican **solo** en el elemento raíz. Ningún componente
elige colores con clases condicionales, y hay un test que comprueba que no se
cuela ningún color literal en el DOM.

## Decisiones que conviene no deshacer

- **El contenedor de cada pantalla es un `<form>` de verdad.** Así el Intro de
  un campo de texto avanza por comportamiento nativo del navegador y no por un
  manejador de teclas replicado once veces.
- **Los grupos de opciones, la escala y la valoración están escritos a mano**,
  no sobre Radix. Comparten la misma mecánica de foco itinerante, y las
  primitivas de Radix inyectaban dentro del `<form>` un campo espejo inútil aquí
  —el formulario no se envía por el navegador— además de exigir
  `ResizeObserver`.
- **La escala numérica cambia de forma según su rango** (botones hasta once
  valores, deslizador nativo por encima). Depende solo del documento, así que
  las dos vistas eligen siempre lo mismo.
- **El valor de una valoración se guarda como entero.** La normalización
  `(valor - 1) / (escala - 1)` la calcula `lib/forms` al leer y se publica en el
  DOM como `data-valor-normalizado`.
- **Una pregunta pasada en blanco se registra como `null`**, no se omite: el
  motor necesita distinguir «respondida en blanco» de «todavía no vista» para
  resolver su bifurcación.

## Tests

```bash
npm run test -- src/components src/lib/theme
```

Cubren los once tipos de bloque, los cuatro estilos de selección, las tres
apariencias de valoración por las cuatro escalas, la navegación por teclado, el
foco, la aplicación de los tokens de tema y la costura entre las dos vistas.
