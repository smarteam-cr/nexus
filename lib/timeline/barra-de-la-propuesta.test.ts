/**
 * lib/timeline/barra-de-la-propuesta.test.ts — LA BARRA DE LA PROPUESTA, REDUCIDA (L3 P3d, spec §4.1, §4.5 y §4.7).
 *
 * Correr: `npx vitest run lib/timeline/barra-de-la-propuesta.test.ts --project unit`.
 *
 * Desde L3 cada cambio se decide en su fila del Gantt, y la barra queda en dos partes: LO FIJO, una línea (el título,
 * «Siguiente número», «Ver como estaba antes», «Descartar» y «Aplicar»; debajo de 640 px, el título, «Descartar» y
 * «Aplicar»), y LO DE ABAJO, que no se fija (el origen, el cierre con lo que ve el cliente, los totales, los choques
 * solo si hay, el avance sin revisar y lo que notó la IA; debajo de 640 px, tras «Detalles»).
 * M1 (2026-09-27): «Descartar» subió de abajo a lo fijo, al lado de «Aplicar», y siempre pregunta (su diálogo).
 *
 * La barra (components/canvas/RevisionDeLaPropuesta.tsx) se PINTA de verdad con react-dom/server sobre la propuesta
 * grande anonimizada (__fixtures__/propuesta-grande.json, leída, nunca importada) y se mira el HTML: qué va en lo fijo,
 * qué va abajo, qué no está. El cableado con el canvas se mira por su código en revision-de-la-propuesta.test.ts.
 * Cada `it` nombra la edición de producción que lo pone en rojo.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import RevisionDeLaPropuesta from "@/components/canvas/RevisionDeLaPropuesta";
import { borradorDelFixture, leerFixtureGrande, vivoDelFixture } from "./__fixtures__/propuesta-grande";
import { fraseDelCierre, LINEA_DEL_CLIENTE, resumir, tituloDeLaBarra, TEXTO_VER_ANTES } from "./borrador";
import { TEXTO_DESCARTAR, textoDeLosChoques, textoDelSiguiente, TITULO_DEL_SIGUIENTE } from "./vista-de-la-propuesta";
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

  it("⭐ lo fijo es UNA línea: el título, «Siguiente número», «Ver como estaba antes», «Descartar» y «Aplicar»", () => {
    /* Las ediciones que la ponen en rojo: volver a meter en lo fijo el cierre, lo que ve el cliente, los totales o el
       origen (la barra fija tapaba medio Gantt), sacar de ahí «Siguiente número», o dejar «Descartar» abajo o después
       de «Aplicar». */
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
    /* ⚠ ACTUALIZADA el 2026-09-27 (M1), con esta razón: Elías pidió «Descartar» a la par de «Aplicar todo» (abajo, tras
       el mensaje y «Más», no se encontraba). Esta guarda lo prohibía en lo fijo; ahora pide que esté ahí, justo antes
       de «Aplicar» (el primario sigue siendo el último). Lo demás sigue fuera. */
    expect(fija).toMatch(new RegExp(`>${TEXTO_DESCARTAR}</button><button[^>]*>Aplicar todo</button>`));
    // L4: el cierre lo dice ahora la primera línea del mensaje, y tampoco va en lo fijo (ni ninguna otra línea).
    for (const fuera of ["Aplicas", LINEA_DEL_CLIENTE, ...M.lineas, DESDE, "La IA también notó"]) {
      expect(t, `lo fijo volvió a decir «${fuera}»`).not.toContain(fuera);
    }
    expect(fija).toMatch(/\bsticky\b/);
    expect(abajo, "lo de abajo también quedó fijo").not.toMatch(/\bsticky\b/);
  });

  it("⭐ lo de abajo: el origen, el cierre con lo que ve el cliente, y los totales en `aria-live`, sin «Descartar»", () => {
    /* Las ediciones que la ponen en rojo: sacar el `aria-live` de los totales (el lector no anuncia lo que cambia al
       marcar en el Gantt), perder el origen, el cierre o lo que ve el cliente, o volver a pintar «Descartar» abajo. */
    const t = texto(abajo);
    expect(t).toContain(DESDE);
    /* ⚠ ACTUALIZADA en L4 (2026-09-26), con esta razón: pedía el cierre (`fraseDelCierre`) y lo que ve el cliente en
       UNA línea. El cierre pasó al mensaje (su primera línea, con su causa) y lo que ve el cliente queda solo, debajo.
       Se sigue pidiendo lo mismo: que abajo se diga cómo se mueve el cierre y que el cliente no ve nada todavía. */
    expect(t).toContain(M.lineas[0]);
    expect(abajo).toContain(`<p class="text-xs text-fg-muted">${LINEA_DEL_CLIENTE}</p>`);
    expect(t).not.toContain(fraseDelCierre(R));
    /* ⚠ ACTUALIZADA el 2026-09-27 (M1), con esta razón: Elías pidió «Descartar» a la par de «Aplicar todo». Pedía
       «Descartar» abajo, junto a los totales; ahora pide lo contrario: abajo quedan los totales solos (en un <p>), y
       «Descartar» no está (UN solo lugar para esa decisión, en lo fijo). */
    expect(abajo).toMatch(/<p aria-live="polite"[^>]*>Aplicas 132 de 132 cambios<\/p>/);
    expect(t, "«Descartar» sigue (o volvió) abajo: dos lugares para la misma decisión").not.toContain(TEXTO_DESCARTAR);
    // Lo que notó la IA, plegado y sin la jerga del paso 1.
    expect(t).toContain("La IA también notó 4 cosas que no se aplican solas");
    expect(abajo).toMatch(/<details[^>]*>\s*<summary/);
    expect(t).not.toMatch(/paso de (las )?tareas/i);
  });

  it("⭐ debajo de 640 px: lo fijo muestra el título, «Descartar» y «Aplicar»; lo demás, tras «Detalles»", () => {
    /* La edición que la pone en rojo: dejar «Siguiente número» y «Ver como estaba antes» visibles en pantallas chicas
       (la línea fija se parte en tres), dejar lo de abajo siempre abierto en un teléfono, o esconder «Descartar» en un
       teléfono.
       ⚠ ACTUALIZADA el 2026-09-27 (M1), con esta razón: Elías pidió «Descartar» a la par de «Aplicar todo»; en un
       teléfono lo fijo ya no es «solo el título y «Aplicar»»: suma «Descartar», fuera del bloque que se esconde. */
    const envuelto = /<span class="hidden items-center gap-2 sm:inline-flex">([\s\S]*?)<\/span><button/.exec(fija);
    expect(envuelto, "«Siguiente» y «Ver antes» no van en un bloque que se esconde en pantallas chicas").not.toBeNull();
    expect(texto(envuelto![1])).toContain("Recorrer los 14 números");
    expect(texto(envuelto![1])).toContain(TEXTO_VER_ANTES);
    expect(texto(envuelto![1])).not.toContain("Aplicar");
    expect(texto(envuelto![1]), "«Descartar» quedó en el bloque que se esconde en un teléfono").not.toContain(TEXTO_DESCARTAR);
    expect(texto(fija)).toContain(TEXTO_DESCARTAR);
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
 * ── M1 · «DESCARTAR» AL LADO DE «APLICAR», Y SIEMPRE PREGUNTA (2026-09-27) ────────────────────────────────────────
 * Pedido de Elías: abajo no se encontraba. En lo fijo queda a un clic del botón principal, y descartar borra la
 * propuesta sin copia (DELETE /timeline/proposal): el clic abre SU diálogo y solo el «Descartar» del diálogo descarta.
 * La CONDUCTA (apretar, cancelar, confirmar, con el estado que cambia) se prueba con el montaje de
 * recalculo-en-la-pantalla.test.ts (bloque 3, «M1 · «Descartar» abre SU diálogo…»); acá, el HTML y el código.
 */
describe("M1 · «Descartar» al lado de «Aplicar», y siempre pregunta", () => {
  it("⭐ mientras descarta: «Descartando…» y los dos botones apagados; aplicando, «Descartar» también", () => {
    /* La edición que la pone en rojo: sacarle `disabled={trabajando}` a «Descartar» (un doble clic mandaba dos DELETE,
       y «Aplicar» durante el descarte caía en un 409). */
    const boton = (html: string) => /<button([^>]*)>(Descartar|Descartando…)<\/button>/.exec(partes(html).fija);
    const descartando = boton(pintar({ enCurso: "descartar" }));
    expect(descartando?.[2]).toBe("Descartando…");
    expect(descartando?.[1]).toContain('disabled=""');
    expect(partes(pintar({ enCurso: "descartar" })).fija).toMatch(
      /<button[^>]*disabled=""[^>]*>Descartando…<\/button><button[^>]*disabled=""[^>]*>Aplicar todo<\/button>/,
    );
    expect(boton(pintar({ enCurso: "aplicar" }))?.[1]).toContain('disabled=""');
    const libre = boton(pintar());
    expect(libre?.[2]).toBe(TEXTO_DESCARTAR);
    expect(libre?.[1]).not.toContain('disabled=""');
  });

  it("⭐ en el código, `onDescartar` solo se llama desde el «confirmar» del diálogo del descarte", () => {
    /* La edición que la pone en rojo: `onClick={onDescartar}` directo, o cualquier otro camino (un atajo, otro botón)
       que descarte sin pasar por el diálogo. Mira el código sin comentarios, con los saltos normalizados. */
    const src = fs
      .readFileSync(path.join(process.cwd(), "components/canvas/RevisionDeLaPropuesta.tsx"), "utf8")
      .replace(/\r\n/g, "\n")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/^\s*\/\/.*$/gm, "");
    const firma = src.indexOf("export default function RevisionDeLaPropuesta(");
    const finDeLaFirma = src.indexOf("}) {", firma);
    expect(firma, "no encuentro el componente").toBeGreaterThan(-1);
    expect(finDeLaFirma, "no encuentro el fin de sus props").toBeGreaterThan(firma);
    // La prop: una vez en la lista y una en su tipo.
    expect(src.slice(firma, finDeLaFirma).match(/\bonDescartar\b/g)).toHaveLength(2);
    const cuerpo = src.slice(finDeLaFirma);
    const usos = [...cuerpo.matchAll(/\bonDescartar\b/g)].map((m) => m.index!);
    expect(usos, "`onDescartar` se usa en más (o menos) de un lugar").toHaveLength(1);
    const dialogo = cuerpo.slice(cuerpo.lastIndexOf("<ConfirmDialog", usos[0]), usos[0]);
    expect(dialogo, "`onDescartar` no está dentro del diálogo del descarte").toContain("open={confirmarDescarte}");
    expect(dialogo, "`onDescartar` no está dentro de su `onConfirm`").toMatch(/onConfirm=\{\s*\(\)\s*=>\s*\{[^}]*$/);
    expect(dialogo, "se cerró el diálogo antes de llegar a `onDescartar`").not.toContain("/>");
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

describe("M4 P4e · la semana que cambió, en la barra", () => {
  const AVISO = "⚠ Se reprogramó desde la S18 y hoy es la S19: vuelve a generarla para que lo atrasado arranque esta semana.";

  it("⭐ el aviso va abajo, en ámbar y antes de los choques; sin aviso, nada", () => {
    /* Las ediciones que la ponen en rojo: no pintar `mensaje.avisoDeLaSemana` (el CSE aplicaba una reprogramación de
       la semana pasada sin enterarse), pintarlo en lo fijo o después de los choques. */
    const { fija, abajo } = partes(pintar({ mensaje: { ...M, avisoDeLaSemana: AVISO }, resumen: { ...R, choques: 2 } }));
    expect(abajo).toContain(`<p class="text-xs text-warn-ink">${AVISO}</p>`);
    expect(texto(abajo).indexOf(AVISO), "después de los choques").toBeLessThan(texto(abajo).indexOf(textoDeLosChoques(2)));
    expect(texto(fija)).not.toContain("Se reprogramó");
    expect(M.avisoDeLaSemana, "el fixture no trae reloj").toBeNull();
    expect(texto(pintar())).not.toContain("Se reprogramó");
  });

  it("⭐ §5.10: con la semana cambiada, aplicar sigue permitido (el aviso no traba «Aplicar todo»)", () => {
    /* Caso borde de la spec (§5.10, 2026-09-27): no se recalcula sola (cambiar duraciones obliga a rehacer tareas con IA,
       que se paga) y tampoco se traba: el CSE decide si la aplica o la vuelve a generar. La edición que la pone en rojo:
       apagar «Aplicar todo» por el aviso (`disabled={… || !!mensaje.avisoDeLaSemana}`). */
    const aplicar = (html: string) => /<button([^>]*)>Aplicar todo<\/button>/.exec(partes(html).fija)?.[1];
    const conAviso = aplicar(pintar({ mensaje: { ...M, avisoDeLaSemana: AVISO } }));
    expect(conAviso, "no está «Aplicar todo»").toBeDefined();
    expect(conAviso, "el aviso de la semana trabó «Aplicar todo»").not.toContain('disabled=""');
    expect(conAviso).toBe(aplicar(pintar()));
  });
});
