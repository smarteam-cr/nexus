/**
 * lib/timeline/barra-de-la-propuesta.test.ts — LA BARRA DE LA PROPUESTA, REDUCIDA (L3 P3d, spec §4.1, §4.5 y §4.7).
 *
 * Correr: `npx vitest run lib/timeline/barra-de-la-propuesta.test.ts --project unit`.
 *
 * Desde L3 cada cambio se decide en su fila del Gantt, y la barra queda en dos partes: LO FIJO, una línea (el título,
 * «Siguiente número», «Ver como estaba antes» y «Aplicar»; debajo de 640 px, solo el título y «Aplicar»), y LO DE
 * ABAJO, que no se fija (el origen, el cierre con lo que ve el cliente, los totales con «Descartar», los choques solo
 * si hay, el avance sin revisar y lo que notó la IA; debajo de 640 px, tras «Detalles»).
 *
 * La barra (components/canvas/RevisionDeLaPropuesta.tsx) se PINTA de verdad con react-dom/server sobre la propuesta
 * grande anonimizada (__fixtures__/propuesta-grande.json, leída, nunca importada) y se mira el HTML: qué va en lo fijo,
 * qué va abajo, qué no está. El cableado con el canvas se mira por su código en revision-de-la-propuesta.test.ts.
 * Cada `it` nombra la edición de producción que lo pone en rojo.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import RevisionDeLaPropuesta from "@/components/canvas/RevisionDeLaPropuesta";
import { borradorDelFixture, leerFixtureGrande, vivoDelFixture } from "./__fixtures__/propuesta-grande";
import { fraseDelCierre, LINEA_DEL_CLIENTE, resumir, tituloDeLaBarra, TEXTO_VER_ANTES } from "./borrador";
import { textoDeLosChoques, textoDelSiguiente, TITULO_DEL_SIGUIENTE } from "./vista-de-la-propuesta";

const FIXTURE = leerFixtureGrande();
const VIVO = vivoDelFixture(FIXTURE);
const BORRADOR = borradorDelFixture(FIXTURE);
const R = resumir(VIVO, BORRADOR, [], { tareas: "listas" });
const DESDE = "desde «Regenerar todo» · la dejó Persona 1 el 26 sep";

type Props = Parameters<typeof RevisionDeLaPropuesta>[0];
const nada = () => {};
function pintar(o: Partial<Props> = {}): string {
  const props: Props = {
    resumen: R,
    vista: "propuesta",
    onAlternar: nada,
    onSiguiente: nada,
    posicion: { actual: null, total: 14, primero: 1 },
    onAplicar: nada,
    onDescartar: nada,
    desde: DESDE,
    tareas: null,
    enCurso: null,
    cierreFijado: null,
    barraRef: { current: null },
    ...o,
  };
  return renderToStaticMarkup(createElement(RevisionDeLaPropuesta, props));
}

/** Lo fijo (la barra `sticky`, con el ancla) y lo de abajo (lo que no se fija). */
function partes(html: string): { fija: string; abajo: string } {
  const i = html.indexOf('id="cronograma-propuesta"');
  const j = html.indexOf('class="rounded-xl border border-line bg-surface', i);
  if (i < 0 || j < 0) throw new Error("no encuentro las dos partes de la barra");
  return { fija: html.slice(i, j), abajo: html.slice(j) };
}
/** El texto de un HTML (sin etiquetas, con las entidades de react-dom). */
const texto = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

describe("L3 P3d · la barra reducida", () => {
  const html = pintar();
  const { fija, abajo } = partes(html);

  it("⭐ la barra ya no tiene casillas ni listas: cada cambio se decide en el Gantt", () => {
    /* La edición que la pone en rojo: volver a pintar la lista numerada con casillas, o los grupos de tareas. */
    expect(html.length, "la guarda no está mirando nada").toBeGreaterThan(1500);
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toMatch(/<ol\b/);
    expect(texto(html)).not.toContain("Tareas de «");
  });

  it("⭐ lo fijo es UNA línea: el título, «Siguiente número», «Ver como estaba antes» y «Aplicar»", () => {
    /* Las ediciones que la ponen en rojo: volver a meter en lo fijo el cierre, lo que ve el cliente, los totales,
       «Descartar» o el origen (la barra fija tapaba medio Gantt), o sacar de ahí «Siguiente número». */
    const t = texto(fija);
    expect(t).toContain(tituloDeLaBarra(R));
    expect(t).toContain("Recorrer los 14 números");
    expect(fija).toContain(`title="${TITULO_DEL_SIGUIENTE}"`);
    expect(t).toContain(TEXTO_VER_ANTES);
    expect(t).toContain("Aplicar todo");
    for (const fuera of ["Aplicas", LINEA_DEL_CLIENTE, fraseDelCierre(R), "Descartar", DESDE, "La IA también notó"]) {
      expect(t, `lo fijo volvió a decir «${fuera}»`).not.toContain(fuera);
    }
    expect(fija).toMatch(/\bsticky\b/);
    expect(abajo, "lo de abajo también quedó fijo").not.toMatch(/\bsticky\b/);
  });

  it("⭐ lo de abajo: el origen, el cierre con lo que ve el cliente, y los totales en `aria-live` con «Descartar»", () => {
    /* Las ediciones que la ponen en rojo: sacar el `aria-live` de los totales (el lector no anuncia lo que cambia al
       marcar en el Gantt), o perder el origen, el cierre o lo que ve el cliente. */
    const t = texto(abajo);
    expect(t).toContain(DESDE);
    expect(t).toContain(`${fraseDelCierre(R)} ${LINEA_DEL_CLIENTE}`);
    expect(abajo).toMatch(/<span aria-live="polite"[^>]*>Aplicas 132 de 132 cambios<\/span>/);
    expect(t).toContain("Descartar");
    // Lo que notó la IA, plegado y sin la jerga del paso 1.
    expect(t).toContain("La IA también notó 4 cosas que no se aplican solas");
    expect(abajo).toMatch(/<details[^>]*>\s*<summary/);
    expect(t).not.toMatch(/paso de (las )?tareas/i);
  });

  it("⭐ debajo de 640 px: lo fijo muestra solo el título y «Aplicar»; lo demás, tras «Detalles»", () => {
    /* La edición que la pone en rojo: dejar «Siguiente número» y «Ver como estaba antes» visibles en pantallas chicas
       (la línea fija se parte en tres), o dejar lo de abajo siempre abierto en un teléfono. */
    const envuelto = /<span class="hidden items-center gap-2 sm:inline-flex">([\s\S]*?)<\/span><button/.exec(fija);
    expect(envuelto, "«Siguiente» y «Ver antes» no van en un bloque que se esconde en pantallas chicas").not.toBeNull();
    expect(texto(envuelto![1])).toContain("Recorrer los 14 números");
    expect(texto(envuelto![1])).toContain(TEXTO_VER_ANTES);
    expect(texto(envuelto![1])).not.toContain("Aplicar");
    expect(abajo).toMatch(/<button type="button" aria-expanded="false" class="[^"]*sm:hidden[^"]*">Detalles<\/button>/);
    expect(abajo).toMatch(/<div class="[^"]*\bsm:block\b[^"]*\bhidden\b[^"]*">/);
    // En «Detalles», los dos botones, solo en pantallas chicas.
    const chicos = /<div class="flex flex-wrap items-center gap-2 sm:hidden">([\s\S]*?)<\/div>/.exec(abajo);
    expect(chicos).not.toBeNull();
    expect(texto(chicos![1])).toContain("Recorrer los 14 números");
    expect(texto(chicos![1])).toContain(TEXTO_VER_ANTES);
  });

  it("⭐ los choques solo si hay, abajo, y sin afirmar que todos son ediciones a mano", () => {
    /* La edición que la pone en rojo: pintar la línea de los choques con 0, o en lo fijo. */
    expect(R.choques).toBe(0);
    expect(texto(html)).not.toMatch(/chocan?\b/);
    const con = partes(pintar({ resumen: { ...R, choques: 3 } }));
    expect(texto(con.abajo)).toContain(textoDeLosChoques(3));
    expect(texto(con.fija)).not.toContain("chocan");
  });

  it("⭐ el avance sin revisar: un botón que abre su cajón y, si toca la propuesta, «Revísalo antes de aplicar»", () => {
    /* Las ediciones que la ponen en rojo: no ofrecer el avance (la barra decía «más abajo» y no había nada), perder el
       botón, o no decir que toca lo que la propuesta quita o cambia. */
    expect(texto(html)).not.toContain("avance detectado");
    const sinCruce = texto(pintar({ avance: { hay: true, seCruza: false }, onRevisarAvance: nada }));
    expect(sinCruce).toContain("Hay un avance detectado sin revisar.");
    expect(sinCruce).not.toContain("Revísalo antes de aplicar.");
    const conCruce = pintar({ avance: { hay: true, seCruza: true }, onRevisarAvance: nada });
    expect(texto(conCruce)).toContain("Hay un avance detectado sin revisar. Revísalo antes de aplicar.");
    expect(conCruce).toMatch(/<button type="button"[^>]*>Revisar avance<\/button>/);
    expect(texto(partes(conCruce).fija)).not.toContain("avance");
  });

  it("⭐ «Siguiente número» dice dónde está, y sin números no aparece", () => {
    /* La edición que la pone en rojo: un texto fijo («Siguiente») que no dice cuántos hay ni en cuál estás. */
    const en3 = texto(partes(pintar({ posicion: { actual: 3, total: 14, primero: 1 } })).fija);
    expect(en3).toContain(textoDelSiguiente({ actual: 3, total: 14, primero: 1 })!);
    expect(en3).toContain("Siguiente número · 3 de 14");
    expect(texto(pintar({ posicion: { actual: 14, total: 14, primero: 1 } }))).toContain("Volver al 1 · 14 de 14");
    expect(pintar({ posicion: { actual: null, total: 0, primero: null } })).not.toContain(TITULO_DEL_SIGUIENTE);
  });

  it("solo tokens del tema: ningún color crudo en lo que pinta la barra", () => {
    /* La edición que la pone en rojo: un color crudo de Tailwind en la barra. */
    const crudo = /\b(bg|text|border|ring)-(gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(-\d|\b)/;
    for (const h of [html, pintar({ resumen: { ...R, choques: 2 }, avance: { hay: true, seCruza: true }, onRevisarAvance: nada })]) {
      expect(h).not.toMatch(crudo);
    }
  });
});
