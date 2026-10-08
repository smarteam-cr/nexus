# Plan — La escala como datos

Pedido de Elías (2026-10-08): la escala deja de ser un archivo `.md`. Vive en la base como datos
—áreas, capas, dimensiones, niveles, criterios y sus relaciones— y el `.md` se arma desde esos
datos. El test sale de la escala y vive aparte, detrás de un botón; el manual y la teoría también
salen. Después de eso viene la mejora grande de la escala (las 13 decisiones de la revisión de la 8.7).

**Acordado con Elías:** editan la escala los super admin · un solo banco de preguntas para todo lo
que pregunta por la escala, filtrable por dónde se pregunta (Marketing, Ventas, Servicio) además de
por área y dimensión · la escala pasa a la base ANTES de la mejora grande.

## Lo que no cambia para nadie

Todo lo que hoy lee la escala —la pantalla `/escala`, el cuestionario del cliente, las
exploraciones de venta, la guía de exploración, el feedback anclado a criterios— sigue leyendo lo
mismo: la versión publicada, con la misma forma. Lo que cambia es de dónde sale: ya no de un
archivo del repo, sino de los datos de la base.

## Cómo queda armado

| Pieza | Qué es |
|:--|:--|
| `EscalaVersion` | Cada versión de la escala como datos (JSON con la estructura entera). Una por versión. Estado `borrador` (hay uno solo a la vez y se edita) o `publicada` (congelada: no cambia nunca). |
| `EscalaCambio` | La bitácora del borrador: cada cambio, anclado al criterio, nivel, dimensión o sección que tocó, con quién, cuándo, el antes y el después, y el reporte de feedback que lo originó si lo hay. |
| `EscalaDocumento` (ya existe) | El `.md` de cada versión publicada, generado desde los datos al publicar, con su huella. Es lo que se descarga y lo que leen las pantallas. |
| `lib/escala/datos/` | La forma de los datos, cómo se importan desde un `.md` y cómo se genera el `.md` desde los datos. |

**Los datos.** El documento entero, en orden, sin perder una letra: la matriz y las ediciones
como estructura (área → capa → dimensión → nivel → criterio, con sus marcas y requeridos; cada
edición con lo que reescribe, sus criterios propios y lo que no aplica), y la prosa (Partes 1, 2 y 4
y la introducción de las ediciones) como secciones de texto. La prosa queda como texto a propósito:
es la que sale de la escala en las etapas 4 y 5.

**La garantía.** Importar un `.md` y volver a generarlo da el mismo texto, byte por byte. El
importador lo comprueba solo: si algo no se puede guardar como dato sin perderse, frena con la línea.

**Por qué un JSON por versión y no una tabla por criterio.** Una versión publicada se congela
entera; el JSON la guarda de una vez, con su huella, y comparar dos versiones es comparar dos
documentos. La bitácora (`EscalaCambio`) da el detalle por criterio. Si más adelante las
mediciones necesitan consultar criterios con SQL, el catálogo por versión se deriva al publicar.

## Etapas

| | Etapa |
|:--:|:--|
| ✅ | **Acuerdo: la escala es solo conocimiento** — qué queda en la escala, qué sale y en qué orden. |
| ✅ | **La escala como datos** — las tablas, el formato de los datos, importar y generar con la prueba de ida y vuelta, y la 8.7.0 publicada pasada a datos. Nadie nota el cambio. |
| ✅ | **Publicar desde los datos** — el borrador, importar cambios en bloque con bitácora, exportar el `.md` y publicar (con las mismas pruebas de hoy) congelando la versión. El `.md` del repo pasa a ser una exportación. |
| ⬜ | **El borrador en Nexus** — los super admin ven el borrador en `/escala` con sus cambios, lo descargan, suben cambios en bloque y lo publican con un botón. |
| ⬜ | **El editor** — cambiar un criterio, una frase de nivel, una pregunta o lo que dice una edición desde la pantalla; cada cambio a la bitácora; un reporte de feedback abre su criterio en el borrador. |
| ⬜ | **Teoría y manual a Documentación** — la Parte 1 y la parte de uso de la Parte 2 salen de la escala; la medición queda en la especificación. |
| ⬜ | **El banco de preguntas** — el botón «Test» en la escala: preguntas por dimensión, con sus opciones y el nivel de cada una, filtrables por área, dimensión y dónde se preguntan. Lo leen el cuestionario y las exploraciones. |
| ⬜ | **La mejora grande** — las 13 decisiones y los arreglos de la revisión de la 8.7, ya sobre los datos. |

## Cómo se trabaja con la escala mientras tanto (etapas 2 y 3)

1. Se abre un borrador desde la versión publicada (`npx tsx scripts/escala-datos.ts borrador --version 8.8.0`).
2. Los cambios entran al borrador: en bloque, importando un `.md` (`importar`), o —cuando esté el
   editor— desde la pantalla. Cada cambio queda en la bitácora.
3. Se revisa el borrador (exportado, y desde la etapa 3, en la pantalla).
4. Se publica (`scripts/publicar-escala.ts`, con las mismas pruebas de hoy): la versión se congela y
   su `.md` queda en `EscalaDocumento`.

⛔ Toda escritura a producción sigue igual: `$env:ALLOW_PROD_WRITE="1"` y `--apply`, en tu PC.

## Lo que sigue pendiente de decidir

- **Publicar con un botón** (etapa 3) obliga a llevar a TypeScript las dos pruebas del cálculo que
  hoy corre `pruebas_escala.py` (2 · Nada se regala, 3 · Los ejemplos cuadran) y a aflojar la prueba
  7: hoy cada versión de la escala exige una versión nueva de la especificación y del manual, aunque
  no cambien. Propuesta: que digan desde qué versión de la escala valen.
- **El mapa de herramientas** sigue como documento aparte; pasarlo a datos es otra tanda.
