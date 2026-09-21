# `components/editor` — editor visual

Fase 5 del plan. Tres áreas: recorrido a la izquierda, previsualización en el
centro y propiedades a la derecha. La lógica pura (operaciones sobre el
documento, contraste, vocabulario de reglas, cliente del guardado) vive aparte,
en `@/lib/editor`; aquí solo hay React.

## Reparto del estado

| Qué | Dónde | Por qué |
|---|---|---|
| Documento + revisión | `useState` en `EditorFormulario` | Es **estado de servidor**. PLAN.md §3 lo prohíbe en Zustand, y separarlo de su revisión convierte un conflicto detectable en una sobrescritura silenciosa. |
| Selección, pestaña, ancho de previsualización, ejecución de prueba | `estado.ts` (Zustand) | Es efímero: se puede perder al recargar sin consecuencias. |

Cada operación del documento devuelve un objeto **nuevo**, así que el
autoguardado detecta los cambios por identidad y no necesita ninguna bandera de
«sucio» que alguien pueda olvidarse de bajar.

## Autoguardado

`usar-autoguardado.ts`. Cinco estados visibles: `guardado`, `pendiente`,
`guardando`, `error` y `conflicto`.

- Debounce de 900 ms, una sola petición en vuelo, y lo editado durante esa
  petición entra en la siguiente.
- Un **409** deja el ciclo bloqueado: no se vuelve a escribir hasta que alguien
  decida. `AvisoDeConflicto` muestra las dos revisiones y ofrece recargar.
  Reintentar con la revisión del servidor sería exactamente la sobrescritura
  que el control optimista existe para impedir.

## Previsualización

Es el renderer compartido (`components/formulario`), sin ninguna rama de modo.
En edición va controlada (`pantalla`, `respuestas`, `enfocarAlCambiar={false}`);
en ejecución de prueba va no controlada y **sin `onAvanzar`**, así que no hay a
dónde persistir. La vista móvil es un ancho del marco, no un modo: la raíz del
renderer es un `@container`.

## Validación en vivo

`analizarDocumento()` ejecuta `validateForPublication()` —el mismo validador que
corre al publicar— e indexa sus errores por bloque y por regla. Por eso «sin
avisos en el editor» significa exactamente «publicable», y el editor no puede
dar por bueno algo que la API vaya a rechazar.

## Contraste

`analizarContraste()` mide las seis parejas que el renderer pinta de verdad,
componiendo el alfa sobre el fondo y reproduciendo el token derivado
`--tp-texto-suave`. Los mínimos no son uniformes: 4,5:1 para texto y 3:1 para
elementos no textuales (WCAG 2.1 §1.4.11).

> El `DEFAULT_THEME` del contrato usa `#d1d5db` para los bordes, que sobre
> blanco queda en ~1,4:1. El editor lo avisa desde el primer formulario. Es un
> hallazgo real, no un falso positivo: se arregla oscureciendo ese color.

## Enganche del pipeline de media (fase 6)

`contexto-media.tsx` es el único punto de extensión. Quien monte el editor pasa:

```tsx
<EditorFormulario
  …
  integracionMedia={{ resolverMedia, SelectorMedia: MiSubidorDeImagenes }}
/>
```

- `resolverMedia` es la misma costura que ya define el renderer.
- `SelectorMedia` recibe `{ etiqueta, assetId, alCambiar, ayuda }` y se usa para
  el logo, el fondo, la imagen de cada bloque y la de cada opción.

Mientras tanto se usa `SelectorMediaBasico`, que solo permite referenciar un
activo existente. **La fase 6 no necesita tocar ningún fichero del editor.**

## Tests

```bash
npm run test -- src/components/editor src/lib/editor
```

Cubren el ciclo completo de autoguardado (incluido el 409 y el bloqueo
posterior), el reordenado por teclado con el sensor real de `dnd-kit`, las
advertencias de contraste, la validación en vivo de reglas y la construcción de
un formulario de punta a punta.

`simularGeometriaDeLista()` (en `__tests__/utiles.tsx`) da a jsdom una geometría
falsa deducida de `data-indice`: sin layout, las matemáticas de colisión de
`dnd-kit` no podrían distinguir una fila de otra. Es la única concesión al
entorno; la interacción del test es real.
