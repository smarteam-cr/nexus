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
import { mensajeDeLaPropuesta, TEXTO_DE_LAS_FUENTES, type MensajeDeLaPropuesta } from "./mensaje-de-la-propuesta";
import { huellaDeLosCambios, lineaSinMaterial, TEXTO_DE_CUANDO_SE_GENERO, type ExplicacionEnPantalla } from "./explicacion-de-la-propuesta";

const FIXTURE = leerFixtureGrande();
const VIVO = vivoDelFixture(FIXTURE);
const BORRADOR = borradorDelFixture(FIXTURE);
const R = resumir(VIVO, BORRADOR, [], { tareas: "listas" });
const DESDE = "desde «Regenerar todo» · la dejó Persona 1 el 26 sep";
/* L4: el mensaje de arriba, con las referencias sintéticas del fixture y el `hoy` fijo (con zona). */
const REFERENCIAS = {
  prometido: FIXTURE.prometido,
  handoff: FIXTURE.handoff,
  fuentes: { instrucciones: true, reuniones: [], notas: [] },
};
const mensajeCon = (o: Partial<Parameters<typeof mensajeDeLaPropuesta>[0]> = {}): MensajeDeLaPropuesta =>
  mensajeDeLaPropuesta({
    vivo: VIVO,
    borrador: BORRADOR,
    r: R,
    entera: R,
    referencias: REFERENCIAS,
    atrasos: FIXTURE.particularidades,
    cierreFijado: null,
    hoy: new Date(FIXTURE.hoy),
    ...o,
  });
const M = mensajeCon();

type Props = Parameters<typeof RevisionDeLaPropuesta>[0];
const nada = () => {};
function pintar(o: Partial<Props> = {}): string {
  const props: Props = {
    resumen: R,
    mensaje: M,
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
    /* ⚠ ACTUALIZADA en L4 (2026-09-26), con esta razón: el título de la barra ya no cuenta cambios
       (`tituloDeLaBarra`, «La IA propone 2 cambios de fases y 130 de tareas»): lo pone el nivel de la propuesta
       (`mensaje.titulo`, «Rehace casi todas las pendientes»); lo que se aplica lo dicen los totales, abajo. */
    expect(t).toContain(M.titulo);
    expect(t).not.toContain(tituloDeLaBarra(R));
    expect(t).toContain("Recorrer los 14 números");
    expect(fija).toContain(`title="${TITULO_DEL_SIGUIENTE}"`);
    expect(t).toContain(TEXTO_VER_ANTES);
    expect(t).toContain("Aplicar todo");
    // L4: el cierre lo dice ahora la primera línea del mensaje, y tampoco va en lo fijo (ni ninguna otra línea).
    for (const fuera of ["Aplicas", LINEA_DEL_CLIENTE, ...M.lineas, "Descartar", DESDE, "La IA también notó"]) {
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
    /* ⚠ ACTUALIZADA en L4 (2026-09-26), con esta razón: pedía el cierre (`fraseDelCierre`) y lo que ve el cliente en
       UNA línea. El cierre pasó al mensaje (su primera línea, con su causa) y lo que ve el cliente queda solo, debajo.
       Se sigue pidiendo lo mismo: que abajo se diga cómo se mueve el cierre y que el cliente no ve nada todavía. */
    expect(t).toContain(M.lineas[0]);
    expect(abajo).toContain(`<p class="text-xs text-fg-muted">${LINEA_DEL_CLIENTE}</p>`);
    expect(t).not.toContain(fraseDelCierre(R));
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

/**
 * ── L4 · EL MENSAJE DE ARRIBA (spec §5.4) ──────────────────────────────────────────────────────────────────────────
 * El título y el tono de la barra salen del NIVEL de la propuesta entera (`mensaje`), no de la magnitud; lo de abajo
 * pinta sus líneas completas y en su orden, y «Más» (plegado) con lo de detalle y los chips de las fuentes verificadas.
 */
describe("L4 · el mensaje de arriba en la barra", () => {
  const html = pintar();
  const { fija, abajo } = partes(html);

  it("⭐ el título y el tono salen del mensaje (el nivel), no de la magnitud", () => {
    /* La edición que la pone en rojo: volver al tono de `magnitud.esCronogramaNuevo` (con la propuesta grande es
       false: la barra quedaba azul aunque quita 57 de las 66 pendientes), o al título que cuenta cambios. */
    expect(R.magnitud.esCronogramaNuevo, "el fixture ya no prueba esto").toBe(false);
    expect(M.tono).toBe("warn");
    expect(texto(fija)).toContain("Rehace casi todas las pendientes");
    expect(fija).toMatch(/class="[^"]*\bborder-warn-line bg-warn-surface\b/);
    expect(fija).toContain("text-warn-ink");
    const azul = partes(pintar({ mensaje: { ...M, tono: "info", titulo: "Ajuste chico" } })).fija;
    expect(azul).toMatch(/class="[^"]*\bborder-info-line bg-info-surface\b/);
    expect(texto(azul)).toContain("Ajuste chico");
    expect(azul).not.toContain("warn");
  });

  it("⭐ las líneas del mensaje van abajo, completas y en su orden; la primera resaltada y lo que pide atención en ámbar", () => {
    /* Las ediciones que la ponen en rojo: no pintar las líneas, recortarlas, cambiarles el orden o pintarlas en lo fijo. */
    const t = texto(abajo);
    let desde = 0;
    for (const l of M.lineas) {
      const k = t.indexOf(l, desde);
      expect(k, `falta (o está fuera de orden) «${l}»`).toBeGreaterThan(-1);
      desde = k + l.length;
    }
    expect(abajo).toContain(`<p class="font-semibold text-fg">${M.lineas[0]}</p>`);
    const atrasadas = M.lineas.find((l) => l.startsWith("⚠"))!;
    expect(abajo).toContain(`<p class="text-warn-ink">${atrasadas}</p>`);
  });

  it("⭐ «Más» va plegado, con lo de detalle y los chips de las fuentes verificadas", () => {
    /* Las ediciones que la ponen en rojo: desplegar «Más», no pintar lo de detalle, o pintar un chip de fuente que el
       mensaje no verificó. */
    const mas = /<details class="text-xs"><summary[^>]*>Más<\/summary>([\s\S]*?)<\/details>/.exec(abajo);
    expect(mas, "no hay «Más» plegado").not.toBeNull();
    for (const d of M.detalle) expect(texto(mas![1])).toContain(d);
    expect(texto(mas![1])).toContain(TEXTO_DE_LAS_FUENTES);
    expect(mas![1]).toMatch(/<span class="rounded border border-info-line bg-info-surface[^"]*">Instrucciones adicionales<\/span>/);
    const sinFuentes = pintar({ mensaje: mensajeCon({ referencias: { ...REFERENCIAS, fuentes: null } }) });
    expect(texto(sinFuentes)).not.toContain(TEXTO_DE_LAS_FUENTES);
    expect(sinFuentes).not.toContain(">Instrucciones adicionales<");
  });

  it("el aviso «Es prácticamente un cronograma nuevo» se fue: lo dicen el título y «Más»", () => {
    /* La edición que la pone en rojo: volver a pintar el recuadro del aviso además del título (Elías pidió menos texto). */
    expect(texto(html)).not.toContain("prácticamente un cronograma nuevo");
  });
});

describe("L6 · el porqué con fuentes nuevas, en la barra", () => {
  const GENERAL = "Tus instrucciones nuevas alargan la integración y suman un piloto.";
  const explicacion = (vieja: boolean): ExplicacionEnPantalla => ({
    explicacion: {
      corrida: "r-paso2",
      version: 2,
      huellaDeCambios: huellaDeLosCambios(BORRADOR.cambios),
      general: { frase: GENERAL, fuentes: [{ tipo: "instrucciones", titulo: null, fecha: null }] },
      fases: [],
      sinMaterial: ["f02", "f03", "f04"],
      desde: "2026-09-25T15:00:00.000Z",
    },
    vieja,
  });

  it("⭐ la frase general va debajo de las líneas del mensaje, con su chip; «Más» dice UNA vez las fases sin material", () => {
    /* Las ediciones que la ponen en rojo: no pasarle la explicación a la barra, meter la frase en lo fijo, o dejar la
       línea de las fases sin material fuera de «Más». */
    const { fija, abajo } = partes(pintar({ explicacion: explicacion(false) }));
    expect(fija).not.toContain(GENERAL);
    const t = texto(abajo);
    expect(t).toContain(`Por qué: ${GENERAL}`);
    expect(t.indexOf(GENERAL)).toBeGreaterThan(t.indexOf(M.lineas[M.lineas.length - 1]));
    expect(abajo).toContain(">Instrucciones adicionales · línea nueva</span>");
    const linea = lineaSinMaterial(explicacion(false).explicacion)!;
    expect(linea).toBe("3 fases cambian sin una reunión, nota o instrucción nueva que las nombre (desde la generación del 25 sep).");
    const mas = abajo.slice(abajo.indexOf("<details"), abajo.indexOf("</details>"));
    expect(texto(mas)).toContain(linea);
    expect(texto(abajo).split(linea).length - 1, "la línea sale más de una vez").toBe(1);
    expect(t).not.toContain(TEXTO_DE_CUANDO_SE_GENERO);
  });

  it("⭐ vieja: «(de cuando se generó)»; sin explicación, nada de esto", () => {
    expect(texto(pintar({ explicacion: explicacion(true) }))).toContain(`${GENERAL} ${TEXTO_DE_CUANDO_SE_GENERO}`);
    const sin = texto(pintar());
    expect(sin).not.toContain("Por qué:");
    expect(sin).not.toContain("instrucción nueva que las nombre");
  });
});
