/**
 * lib/timeline/revision-de-la-propuesta.test.ts — la PANTALLA de la revisión de la propuesta de fases
 * (E1 del borrador del cronograma, 2026-09-24).
 *
 * Correr: `npx vitest run lib/timeline/revision-de-la-propuesta.test.ts --project unit`.
 *
 * La lógica vive en lib/timeline/borrador.ts (y sus tests); esto mira el cableado que solo existe en
 * los componentes: un solo botón que alterna sobre el MISMO Gantt, la vista de la propuesta que nunca
 * pasa por el guardado, «Subir al cliente» libre con aviso, el aplicar que espera el guardado y la
 * cadena al paso 2. Escaneos del código SIN comentarios: cada tramo se verifica primero no vacío y
 * recién después las negaciones. Cada `it` nombra la edición que lo pone en rojo.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  AVISO_SUBIR_CON_PROPUESTA,
  LINEA_DEL_CLIENTE,
  TEXTO_VER_ANTES,
  TEXTO_VER_PROPUESTA,
  textoDeAplicar,
} from "./borrador";

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const soloCodigo = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/^\s*\/\/.*$/gm, "");

const CANVAS = soloCodigo(leer("components/canvas/CronogramaCanvas.tsx"));
const BARRA = soloCodigo(leer("components/canvas/RevisionDeLaPropuesta.tsx"));
const GANTT = soloCodigo(leer("components/canvas/TimelineGantt.tsx"));
const HOOK = soloCodigo(leer("components/canvas/useBorradorDelCronograma.ts"));
const tramo = (src: string, desde: string, hasta: string) => {
  const i = src.indexOf(desde);
  return i < 0 ? "" : src.slice(i, src.indexOf(hasta, i + desde.length));
};

describe("los textos de la barra", () => {
  it("«Aplicar todo» solo si va todo; si no, «Aplicar N de M»", () => {
    expect(textoDeAplicar(5, 5)).toBe("Aplicar todo");
    expect(textoDeAplicar(3, 5)).toBe("Aplicar 3 de 5");
    expect(textoDeAplicar(0, 2)).toBe("Aplicar 0 de 2");
  });

  it("la línea fija y el aviso de «Subir al cliente» dicen lo que pasa con el cliente, en tuteo", () => {
    expect(LINEA_DEL_CLIENTE).toBe("El cliente sigue viendo el cronograma actual hasta que apliques.");
    expect(AVISO_SUBIR_CON_PROPUESTA).toContain("sin aplicar");
    expect(AVISO_SUBIR_CON_PROPUESTA).toContain("si subes ahora");
    expect([TEXTO_VER_ANTES, TEXTO_VER_PROPUESTA]).toEqual(["Ver como estaba antes", "Ver la propuesta"]);
  });
});

describe("la barra: UN botón que alterna, la línea fija, la lista con casillas y el cierre", () => {
  it("⭐ un solo botón alterna la vista y dice lo que vas a ver", () => {
    /* La edición que la pone en rojo: dos botones (uno por vista) o un texto que no cambia. */
    expect(BARRA.length).toBeGreaterThan(2000);
    expect(BARRA.match(/onClick=\{onAlternar\}/g)?.length, "tiene que haber UN botón que alterna").toBe(1);
    expect(BARRA).toContain('{vista === "propuesta" ? TEXTO_VER_ANTES : TEXTO_VER_PROPUESTA}');
    expect(BARRA).toContain("{LINEA_DEL_CLIENTE}");
    // La barra es fija (sticky) y la lista de abajo no: una lista larga no tapa el Gantt.
    expect(BARRA).toContain('ref={barraRef} className="sticky top-0');
    expect(BARRA).toContain(': textoDeAplicar(marcadas, total)}');
    expect(BARRA).toContain("onClick={onDescartar}");
  });

  it("las casillas: lo que choca o ya está así no se puede marcar, y el número es el del núcleo", () => {
    /* La edición que la pone en rojo: dejar marcar un choque (aplicarlo pisaría lo que editaste) o
       numerar en la pantalla en vez de usar `it.numero` (los números se correrían al marcar). */
    const lista = tramo(BARRA, "{items.map((it) => {", "</ol>");
    expect(lista.length).toBeGreaterThan(500);
    expect(lista).toContain('type="checkbox"');
    expect(lista).toContain('const sePuedeMarcar = it.estado === "aplica" || it.estado === "excluido";');
    expect(lista).toContain("disabled={trabajando || !sePuedeMarcar}");
    expect(lista).toContain("onChange={(e) => onMarcar(it.clave, e.target.checked)}");
    expect(lista).toContain("{it.numero}.");
    expect(lista, "la pantalla numera por su cuenta").not.toMatch(/\bindex\s*\+\s*1\b|\bi\s*\+\s*1\b/);
  });

  it("solo tokens semánticos: ningún color crudo de Tailwind", () => {
    /* El ratchet de grises (lib/ui/token-vocab.test.ts) no mira los colores de familia; esto sí. */
    expect(BARRA, "color crudo en la barra de revisión").not.toMatch(
      /\b(bg|text|border)-(gray|slate|zinc|neutral|red|amber|yellow|blue|sky|emerald|green|violet|fuchsia)-\d/,
    );
    expect(BARRA).toContain("bg-info-surface");
    expect(BARRA).toContain("text-warn-ink");
  });
});

describe("el Canvas: el MISMO Gantt en las dos vistas, y la propuesta nunca pasa por el guardado", () => {
  const rama = tramo(CANVAS, '<div id="cronograma-gantt"', "<TaskDetailDrawer");

  it("⭐ un solo <TimelineGantt> para las dos vistas (no se desmonta: las fases abiertas siguen abiertas)", () => {
    /* La edición que la pone en rojo: pintar la propuesta en OTRO <TimelineGantt> (un ternario de dos
       elementos): React lo desmonta al alternar y se pierden las fases abiertas y el lugar. */
    expect(rama.length).toBeGreaterThan(2000);
    expect(rama.match(/<TimelineGantt\b/g)?.length).toBe(1);
    expect(rama).toContain("phases={verPropuesta ? fasesDeLaPropuesta : ganttPhases}");
    expect(rama).toContain("readOnly={verPropuesta || !canEdit}");
    expect(rama).toContain("marcas={verPropuesta ? marcasDeLaPropuesta : undefined}");
    expect(rama, "en la vista de la propuesta el arranque se edita").toContain(
      "onSetAnchor={verPropuesta ? undefined : setAnchorFromGantt}",
    );
    // El lugar del scroll: el contenedor del Gantt y la fila que se mira.
    expect(rama).toContain("<div ref={revision.contenedorRef}>");
    expect(GANTT).toContain("data-fase-key={p.key}");
    expect(HOOK).toContain('querySelectorAll<HTMLElement>("[data-fase-key]")');
    expect(HOOK).toMatch(/useLayoutEffect\(\(\) => \{[\s\S]*?restaurarAncla\([\s\S]*?\}, \[actual\.vista\]\);/);
  });

  it("⛔ la proyección es SOLO LECTURA: nunca pasa por setPhases ni por el guardado (plan §3.4)", () => {
    /* La edición que la pone en rojo: meter las fases proyectadas en el estado editable (el
       autoguardado las mandaría como si el CSE las hubiera escrito). */
    expect(CANVAS).toContain("const fasesDeLaPropuesta: GanttPhase[] = (revision.proyeccion?.fases ?? [])");
    for (const llamada of CANVAS.match(/setPhases\([^;]*;/g) ?? []) {
      expect(llamada).not.toContain("fasesDeLaPropuesta");
      expect(llamada).not.toContain("proyeccion");
    }
    expect(CANVAS).not.toMatch(/buildPutBody\([^)]*(fasesDeLaPropuesta|proyeccion)/);
  });

  it("la barra va arriba del Gantt, solo para quien edita, y aplica/descarta con la cadena de siempre", () => {
    const iBarra = rama.indexOf("<RevisionDeLaPropuesta");
    expect(iBarra).toBeGreaterThan(-1);
    expect(iBarra).toBeLessThan(rama.indexOf("<TimelineGantt"));
    expect(rama.slice(Math.max(0, iBarra - 120), iBarra)).toContain("canEdit && hayBorrador && revision.resumen && (");
    expect(rama).toContain("onAplicar={() => void aplicarBorrador()}");
    expect(rama).toContain("onDescartar={() => void discardProposal()}");
  });

  it("⭐ aplicar: espera el guardado, limpia el deshacer, manda token + sin + huella + foto, y sigue al paso 2", () => {
    /* La edición que la pone en rojo: aplicar sin esperar lo que está guardándose (el servidor
       compararía contra otra foto), no mandar el token, o cortar la cadena al paso 2. */
    const aplicar = tramo(CANVAS, "const aplicarBorrador = async (", "useEffect(");
    expect(aplicar.length).toBeGreaterThan(1500);
    const iEspera = aplicar.indexOf("await esperarQueSeGuarde()");
    const iLimpia = aplicar.indexOf("clearScope(undoScope)");
    const iFetch = aplicar.indexOf("/timeline/borrador/aplicar");
    expect(iEspera).toBeGreaterThan(-1);
    expect(iEspera).toBeLessThan(iLimpia);
    expect(iLimpia).toBeLessThan(iFetch);
    expect(aplicar).toContain("body: JSON.stringify({ token: proposalMeta.current.runId, sin: [...sin], huella: resumen.huella, foto })");
    expect(aplicar, "lee la revisión del render del clic, no la de ahora").toContain("revisionRef.current");
    expect(aplicar).toContain("pasoTrasResolver(");
    expect(aplicar).toContain("pedirPropuestaDeDetalle(modoDeLaCadena, { saltarEstructura: true })");
    // Un 409 de «el plan cambió» recarga lo vivo (misma propuesta); otro trae la propuesta nueva.
    expect(aplicar).toContain('if (d?.error === "PLAN_CAMBIO") {');
    expect(aplicar).not.toContain("apply-items");
  });

  it("con un borrador abierto se puede editar a mano: el autoguardado sigue, y el chat/«IA» siguen frenados", () => {
    /* Respuesta 2 de Elías: se puede seguir editando; lo que choque queda fuera. La edición que la
       pone en rojo: volver a frenar el autoguardado con cualquier propuesta. */
    expect(CANVAS).toContain("if (!dirty || (proposal && !hayBorrador) || saving || !canEdit) return;");
    expect(CANVAS.match(/if \(hayBorrador\) \{/g)?.length, "las dos guardas (modificador y chat)").toBe(2);
  });

  it("⭐ «Subir al cliente» queda LIBRE con un borrador abierto, con el aviso (respuesta 4 de Elías)", () => {
    /* La edición que la pone en rojo: volver a esconder el PublishBar con cualquier propuesta, o
       perder el aviso. */
    expect(CANVAS).toContain("{canEdit && (!proposal || hayBorrador) && phases.length > 0 && (");
    const barra = tramo(CANVAS, "<PublishBar", "/>");
    expect(barra.length).toBeGreaterThan(200);
    expect(barra).toContain("AVISO_SUBIR_CON_PROPUESTA");
    const modal = tramo(CANVAS, "{publishReasonOpen && (", "<textarea");
    expect(modal.length).toBeGreaterThan(200);
    expect(modal).toContain("{hayBorrador && (");
    expect(modal).toContain("{AVISO_SUBIR_CON_PROPUESTA}");
  });

  it("lo viejo se fue: ni franja, ni recuadros «Sugerencia», ni filas fantasma, ni apply-items en pantalla", () => {
    expect(fs.existsSync(path.join(process.cwd(), "components/canvas/ProposalGlobalStrip.tsx"))).toBe(false);
    expect(CANVAS).not.toContain("ProposalGlobalStrip");
    expect(CANVAS).not.toContain("resolveProposalItems");
    expect(CANVAS).not.toContain("proposal/apply-items");
    expect(GANTT).not.toContain("onResolveProposalDelta");
    expect(GANTT).not.toContain("Fase propuesta");
    expect(GANTT).not.toContain("proposalGlobalSlot");
  });

  it("un borrador del formato nuevo no revienta la pantalla: la vista previa del modificador no lo lee", () => {
    /* `proposal.phases` no existe en `borrador-v1`: leerlo como la del modificador reventaba. */
    expect(CANVAS).toContain("const propuestaDelAssist = proposal && !hayBorrador ? proposal : null;");
    expect(tramo(CANVAS, "const diffSummary = (() => {", "})();")).toContain("const proposal = propuestaDelAssist;");
    expect(CANVAS).toContain("const hayBorrador = !!proposal && esBorradorGuardado(proposal);");
  });
});
