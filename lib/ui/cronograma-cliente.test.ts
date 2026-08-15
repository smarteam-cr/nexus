/**
 * lib/ui/cronograma-cliente.test.ts — cómo se le muestra el cronograma AL CLIENTE.
 *
 * `components/canvas/TimelineSection.tsx` es la única superficie del cronograma que sale de
 * Nexus: la ve el cliente por su enlace (`components/external/TimelineLanding.tsx`), viaja
 * dentro del kickoff publicado y se imprime en el PDF. Sus reglas de presentación no son
 * gusto: son lo que el cliente entiende o no entiende de su propio proyecto.
 *
 * Las dos que fija este archivo salieron de mirar el documento real (Elías, 2026-08-14).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(__dirname, "..", "..");
/** Los archivos de este repo son CRLF; el `\r` sobrante no molesta a `includes`. */
const EOL = "\n";
/**
 * El fuente SIN comentarios, conservando los saltos de línea (se blanquean, no se borran).
 *
 * ⚠ Sin esto, el comentario que EXPLICA por qué no hay `nowrap` hace fallar al test que
 * prohíbe `nowrap`. Mencionar no es usar — y una guarda que castiga la explicación enseña a
 * no escribirla. Es el tercer lugar del repo donde hace falta el mismo blanqueo.
 */
function sinComentarios(texto: string): string {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

const src = fs.readFileSync(
  path.join(RAIZ, "components", "canvas", "TimelineSection.tsx"),
  "utf8",
);

/**
 * Cada lugar que pinta `{p.name}`, con dos líneas de contexto: el estilo puede vivir en la
 * línea anterior cuando el nombre queda solo.
 *
 * ⚠ Son DOS desde que existe la vista de lista para pantallas angostas, y esto miraba solo el
 * PRIMERO — o sea que la vista nueva podía nacer truncando sin que nada avisara. Lo cazó el
 * propio test al ponerse rojo; por eso ahora los recorre todos.
 */
const lineasDelFuente = sinComentarios(src).split(EOL);
const bloquesDelNombre = lineasDelFuente
  .map((l, i) =>
    l.includes("{p.name}") ? lineasDelFuente.slice(Math.max(0, i - 2), i + 1).join(EOL) : null,
  )
  .filter((b): b is string => b !== null);

describe("el nombre de la fase no se recorta", () => {
  it("las DOS vistas lo pintan: la grilla y la lista", () => {
    expect(bloquesDelNombre.length, "¿se movió el render de `p.name`?").toBe(2);
  });

  it("⚠ nada de `nowrap` + ellipsis: si no entra a lo ancho, entra a lo alto", () => {
    /* Era `whiteSpace: nowrap` + `textOverflow: ellipsis`, y en pantallas más angostas que la
       de quien lo diseñó el cliente leía «Audit…» y «Sem…» — que no dicen NADA sobre qué se
       hizo esa semana. Y el modo de falla es cruel: quien lo escribió lo ve bien, así que el
       reporte llega de rebote («alguien me lo pasó y se veía cortado»).

       Recortar por píxeles obliga a adivinar el ancho de la pantalla ajena. Envolver funciona
       en todas, y en un documento que se comparte eso no es un detalle. */
    for (const bloque of bloquesDelNombre) {
      expect(bloque).not.toContain("nowrap");
      expect(bloque).not.toContain("textOverflow");
      expect(bloque, "sin `overflowWrap` un nombre largo desborda la columna").toContain(
        "overflowWrap",
      );
    }
  });
});

describe("el estado es un círculo a la izquierda, no una etiqueta «hecho»", () => {
  it("⚠ no volvió el chip de estado", () => {
    /* En un cronograma donde casi todo está hecho, repetir «HECHO» en cada renglón obliga a
       leer hasta el final de cada línea para saber si falta algo. Un círculo en columna fija
       se escanea de un vistazo: lo pendiente salta porque es lo único gris.
       ⚠ Si esto se pone rojo, mirá también el Gantt interno: la gracia es que se vean IGUAL. */
    expect(src, "volvió una tabla de chips de estado").not.toMatch(/STATUS_META_LIGHT/);
    expect(src).toContain("EstadoCirculo");
  });

  it("distingue hecha / en curso / aparcada / pendiente", () => {
    // Binario perdía «en curso»: una tarea atrasada que YA se está trabajando se veía igual
    // que una que nadie tocó. Es el mismo criterio del círculo del Gantt interno.
    for (const estado of ["DONE", "IN_PROGRESS", "SUSPENDED", "PENDING"]) {
      expect(src, `el estado ${estado} no está contemplado`).toContain(estado);
    }
  });

  it("«atrasada» sigue siendo su propio chip, fuera del círculo", () => {
    /* Es ORTOGONAL al estado: una tarea en curso puede estar atrasada. Meterla dentro del
       círculo obligaría a elegir cuál de las dos cosas mostrar, y se perdería una. */
    expect(src).toContain("OVERDUE_META_LIGHT");
  });

  it("el círculo tiene texto para lectores de pantalla", () => {
    // El SVG es `aria-hidden`; si nadie dice «Hecha», el estado desaparece para quien no ve.
    expect(src).toContain("ESTADO_TEXTO");
    expect(src).toContain("SR_ONLY");
  });
});

describe("en un teléfono el cronograma es una LISTA, no una grilla apretada", () => {
  const hook = fs.readFileSync(path.join(RAIZ, "lib", "hooks", "useAnchoAngosto.ts"), "utf8");

  it("⚠ el PDF NUNCA cae en la lista", () => {
    /* El riesgo grande de este cambio, y el más silencioso: el PDF se compone contra 920px de
       papel y ya tiene su propio encogido por `zoom`. Si la lista se colara ahí, el cronograma
       impreso cambiaría de forma sin que nadie lo pida — y nadie lo vería hasta abrir un PDF
       viejo. El `!pdf` va PRIMERO en la condición, y esto lo hace cumplir. */
    expect(src).toMatch(/const enLista = !pdf && anchoAngosto/);
  });

  it("el hook se llama SIEMPRE, no detrás de un `&&`", () => {
    // Un hook condicional es un bug de React, no un detalle de estilo: cambia el orden de los
    // hooks entre renders. Lo escribí mal la primera vez y por eso queda fijado.
    expect(src).toMatch(/const anchoAngosto = useAnchoAngosto\(\);/);
    expect(src, "el hook volvió a quedar detrás de una condición").not.toMatch(
      /(\?|&&|\|\|)\s*useAnchoAngosto\(\)/,
    );
  });

  it("en el servidor el hook responde «ancho»: es lo único que server y cliente comparten", () => {
    // Si devolviera el valor real, el HTML del servidor y el primer render del cliente
    // diferirían y React tiraría mismatch de hidratación.
    expect(hook).toContain("const leerEnServidor = () => false");
    expect(hook, "sin suscripción, rotar el teléfono deja el layout equivocado").toContain(
      "addEventListener",
    );
  });

  it("el ancho del cronograma dejó de ser un porcentaje", () => {
    /* `width: "80%"` en un teléfono de 375px regalaba 65px de los 327 que hay, justo donde no
       sobra ninguno — y nunca coincidía con el ancho del resto de las páginas del cliente. */
    expect(src, "volvió un porcentaje al contenedor").not.toMatch(
      /TIMELINE_CONTAINER = \{[^}]*width: "\d+%"/,
    );
    expect(src).toContain("--stl-w-pagina");
  });

  it("las dos vistas comparten el detalle de la fase", () => {
    // Duplicarlo garantizaba que se separaran: el día que alguien agregue un dato por tarea,
    // lo agregaría en una sola de las dos.
    expect(src).toContain("function DetalleDeFase");
    // ⚠ El corchete final NO es de adorno: sin él, `<DetalleDeFaseCopiaPegada` matcheaba
    //    y la guarda daba verde con el detalle duplicado. Se cazó rompiéndola.
    const usos = src.match(/<DetalleDeFase[\s/>]/g) ?? [];
    expect(usos, "la grilla y la lista tienen que usar el MISMO detalle").toHaveLength(2);
  });
});
