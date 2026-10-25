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
| ✅ | **El borrador en Nexus** — `/escala/borrador`, para los super admin: abrir el borrador, bajar su `.md`, subirlo con cambios (antes de guardar se ve qué cambia, criterio por criterio), la bitácora y «Revisar y publicar» con las mismas pruebas del script, sin Python. |
| ✅ | **El editor** — `/escala/borrador/[área]`, con las mismas vistas de la escala: tocar un criterio, un nivel o una dimensión lo edita (texto, cómo se verifica, marcas, requeridos, frase, resultado, pregunta, costo) o le agrega un criterio con el número que sigue. Al editar se ve el feedback de esa parte y el cambio se vincula al reporte que lo originó. |
| ⬜ | **Teoría y manual a Documentación** — la Parte 1 y la parte de uso de la Parte 2 salen de la escala; la medición queda en la especificación. |
| ⬜ | **El banco de preguntas** — el botón «Test» en la escala: preguntas por dimensión, con sus opciones y el nivel de cada una, filtrables por área, dimensión y dónde se preguntan. Lo leen el cuestionario y las exploraciones. |
| ✅ | **La mejora grande, primera parte: la 8.8.0** (2026-10-09) — la limpieza de la revisión de la 8.7 que no cambia qué se mide: las 13 decisiones donde se podían aplicar sin tocar identificadores, las 24 preguntas, las palabras, los umbrales, las condiciones «Si…», y el feedback del equipo (F-5, F-6, F-7). Se hizo antes que las dos etapas de arriba porque Elías la pidió primero. |
| ⬜ | **La mejora grande, segunda parte: la 9.0** — lo que sí cambia qué se mide (criterios nuevos, partidos o movidos, riesgo, cálculo): [`pendiente-9-0.md`](pendiente-9-0.md). El borrador 9.0.0 está escrito (2026-10-25, [`borrador-9-0.md`](borrador-9-0.md)); se publica después de probar la 8.9.1 con 5 a 8 clientes reales (nunca Wherex). |

## Cómo se trabaja con la escala mientras tanto (etapas 2 y 3)

1. Se abre un borrador desde la versión publicada (`npx tsx scripts/escala-datos.ts borrador --version 8.8.0`).
2. Los cambios entran al borrador: en bloque, importando un `.md` (`importar`), o —cuando esté el
   editor— desde la pantalla. Cada cambio queda en la bitácora.
3. Se revisa el borrador: su bitácora en `/escala/borrador` (o exportado).
4. Se publica desde `/escala/borrador` («Revisar y publicar») o con `scripts/publicar-escala.ts`; las
   dos corren las mismas pruebas. La versión se congela y su `.md` queda en `EscalaDocumento`.

⛔ Toda escritura a producción sigue igual: `$env:ALLOW_PROD_WRITE="1"` y `--apply`, en tu PC.

## Decidido en el camino

- **La especificación y el manual dicen desde qué versión de la escala valen** (Elías, 2026-10-08):
  sacan una versión nueva solo cuando cambian ellos. La prueba 7 lo mira así en Nexus y en
  `pruebas_escala.py`; la especificación 1.3.7 lo dice. Por eso el botón publica solo la escala.
- **Las pruebas del cálculo (2 y 3) corren también en TypeScript** (`lib/escala/documento/validar.ts`,
  copiadas del Python línea por línea), para publicar sin Python. El script corre las dos.

## Lo que sigue pendiente

- **Lo que dice una edición** (sus reescritos, sus criterios propios, lo que no aplica) y **retirar un
  criterio** se cambian, por ahora, con el `.md`: retirar pide anotarlo en la especificación.
- **Desde la bandeja de Feedback, abrir el criterio en el borrador** (hoy se hace al revés: el editor
  muestra el feedback de lo que se edita y lo vincula).
- **El mapa de herramientas** sigue como documento aparte; pasarlo a datos es otra tanda.
