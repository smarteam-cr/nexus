import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  medirPropuesta,
  redactarResumenDeCambios,
  MITAD_MINIMA,
  SALTO_SPAN_MINIMO,
  SALTO_SPAN_RELATIVO,
} from "./magnitud-propuesta";
import type { CurrentPhaseLike, ProposalLike } from "./proposal-deltas";
import { totalWeeks } from "./weeks";

/**
 * lib/timeline/magnitud-propuesta.test.ts — EL UMBRAL, COMO TABLA.
 *
 * Lo que estos tests protegen: que el aviso «esto es prácticamente un cronograma nuevo» no se
 * vuelva ruido. Un aviso que grita ante cualquier re-estimación se aprende a ignorar en dos
 * semanas, y entonces no avisa nada el día que de verdad cambió el plan. Las dos filas que más
 * valen son las NEGATIVAS: el ajuste chico y los tres renombres sueltos.
 */

const ANCLA = "2026-06-01T00:00:00.000Z";

/** Un cronograma de N fases de 2 semanas cada una: span 2N. */
const cronograma = (n: number): CurrentPhaseLike[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `Fase ${i}`,
    durationWeeks: 2,
    startWeek: null,
    sessionCount: null,
    notes: null,
    activityType: null,
  }));

/** Propuesta que re-emite las fases actuales con los cambios pedidos por índice. */
const proponer = (
  actuales: CurrentPhaseLike[],
  cambios: Record<number, Partial<CurrentPhaseLike>> = {},
  extra: Partial<ProposalLike> = {},
): ProposalLike => ({
  anchorStartDate: null,
  phases: actuales.map((p, i) => ({ ...p, ...(cambios[i] ?? {}) })),
  ...extra,
});

describe("el umbral: cuándo es «otro cronograma» y cuándo no", () => {
  it("NO dispara: un ajuste chico (1 renombre + 1 duración, span 10 → 11)", () => {
    const actuales = cronograma(5); // span 10
    const propuesta = proponer(actuales, { 0: { name: "Arranque" }, 1: { durationWeeks: 3 } });
    const m = medirPropuesta(actuales, propuesta, ANCLA);
    expect(m.motivos).toEqual([]);
    expect(m.esCronogramaNuevo).toBe(false);
    expect(m.semanasDeCorrimiento).toBe(1);
  });

  it("NO dispara: 3 renombres sobre 6 fases y nada más (UNA sola señal)", () => {
    /* ⚠ LA fila que separa un aviso útil de uno ruidoso. Media docena de fases y tres cambian de
       nombre: es una re-redacción, no un plan distinto. La edición que la pone en rojo: bajar
       `motivos.length >= 2` a `>= 1`. */
    const actuales = cronograma(6);
    const propuesta = proponer(actuales, { 0: { name: "A" }, 1: { name: "B" }, 2: { name: "C" } });
    const m = medirPropuesta(actuales, propuesta, ANCLA);
    expect(m.fasesRenombradas).toBe(3);
    expect(m.motivos).toHaveLength(1);
    expect(m.esCronogramaNuevo).toBe(false);
  });

  it("SÍ dispara: 5 de 6 fases renombradas, aunque sea la única señal (renombre total)", () => {
    const actuales = cronograma(6);
    const propuesta = proponer(actuales, {
      0: { name: "A" }, 1: { name: "B" }, 2: { name: "C" }, 3: { name: "D" }, 4: { name: "E" },
    });
    const m = medirPropuesta(actuales, propuesta, ANCLA);
    expect(m.fasesRenombradas).toBe(5);
    expect(m.esCronogramaNuevo).toBe(true);
  });

  it("SÍ dispara: el caso real — otra descomposición (renombres + duraciones + span)", () => {
    const actuales = cronograma(6); // span 12
    const propuesta = proponer(actuales, {
      0: { name: "Relevamiento", durationWeeks: 3 },
      1: { name: "Diseño", durationWeeks: 4 },
      2: { name: "Build objetos", durationWeeks: 5 },
      3: { name: "Build integraciones", durationWeeks: 4 },
      4: { name: "Pruebas" },
    });
    const m = medirPropuesta(actuales, propuesta, ANCLA);
    expect(m.esCronogramaNuevo).toBe(true);
    expect(m.motivos.length).toBeGreaterThanOrEqual(2);
    expect(m.semanasDeCorrimiento).toBeGreaterThan(0);
    expect(m.finDespues.label).not.toBe(m.finAntes.label);
  });

  it("un cronograma de UNA fase no es «masivo» aunque cambie el 100%", () => {
    /* El piso de MITAD_MINIMA: sin él, renombrar la única fase de un proyecto sería «el 100% de
       las fases» y dispararía el aviso más alarmante del canvas. */
    expect(MITAD_MINIMA).toBe(2);
    const actuales = cronograma(1);
    const propuesta = proponer(actuales, { 0: { name: "Otra cosa" } });
    const m = medirPropuesta(actuales, propuesta, ANCLA);
    expect(m.fasesRenombradas).toBe(1);
    expect(m.motivos).toEqual([]);
    expect(m.esCronogramaNuevo).toBe(false);
  });

  it("el umbral del span es RELATIVO: lo mismo dispara en un plan corto y no en uno largo", () => {
    /* 3 semanas más sobre 8 es otro proyecto; sobre 40 es una re-estimación. Un umbral absoluto
       se equivocaría en los dos casos. */
    expect(SALTO_SPAN_RELATIVO).toBe(0.3);
    expect(SALTO_SPAN_MINIMO).toBe(2);

    const corto = cronograma(4); // span 8 → umbral 3
    const mCorto = medirPropuesta(corto, proponer(corto, { 0: { durationWeeks: 5 } }), ANCLA);
    expect(mCorto.semanasDeCorrimiento).toBe(3);
    expect(mCorto.motivos.some((s) => s.includes("pasa de"))).toBe(true);

    const largo = cronograma(20); // span 40 → umbral 12
    const mLargo = medirPropuesta(largo, proponer(largo, { 0: { durationWeeks: 5 } }), ANCLA);
    expect(mLargo.semanasDeCorrimiento).toBe(3);
    expect(mLargo.motivos.some((s) => s.includes("pasa de"))).toBe(false);
  });

  it("un cronograma que se ACORTA también cuenta como corrimiento (y no imprime negativos)", () => {
    const actuales = cronograma(5); // span 10
    const propuesta = proponer(actuales, { 0: { durationWeeks: 1 }, 1: { durationWeeks: 1 } });
    const m = medirPropuesta(actuales, propuesta, ANCLA);
    expect(m.semanasDeCorrimiento).toBe(-2);
    expect(m.motivos.join(" ")).not.toContain("-2");
    expect(m.diasDeCorrimientoFin).toBe(-14);
  });
});

describe("el cierre proyectado de la propuesta", () => {
  it("usa CALENDARIO: una fase propuesta en paralelo no infla el cierre", () => {
    /* La edición que la pone en rojo: que la magnitud sume duraciones en vez de proyectar. Con
       esfuerzo el span daría 12 y anunciaría un corrimiento que no existe. */
    const actuales = cronograma(3); // span 6
    const propuesta: ProposalLike = {
      anchorStartDate: null,
      phases: [
        ...actuales.map((p) => ({ ...p })),
        { name: "Prep en paralelo", durationWeeks: 6, startWeek: 0, sessionCount: null, notes: null },
      ],
    };
    const m = medirPropuesta(actuales, propuesta, ANCLA);
    expect(m.spanAntes).toBe(6);
    expect(m.spanDespues).toBe(6); // la nueva cabe adentro
    expect(m.diasDeCorrimientoFin).toBe(0);
    expect(m.spanDespues).not.toBe(totalWeeks(propuesta.phases)); // 12 = el número equivocado
  });

  it("sin ancla hay span pero no fechas (nunca una fecha inventada)", () => {
    const actuales = cronograma(3);
    const m = medirPropuesta(actuales, proponer(actuales, { 0: { durationWeeks: 9 } }), null);
    expect(m.spanDespues).toBe(13);
    expect(m.finAntes.label).toBeNull();
    expect(m.finDespues.label).toBeNull();
    expect(m.diasDeCorrimientoFin).toBeNull();
  });

  it("el arranque sugerido entra en el cierre proyectado", () => {
    const actuales = cronograma(3); // span 6
    const propuesta = proponer(actuales, {}, { anchorStartDate: "2026-06-15T00:00:00.000Z" });
    const m = medirPropuesta(actuales, propuesta, ANCLA);
    expect(m.mueveArranque).toBe(true);
    expect(m.diasDeCorrimientoFin).toBe(14);
  });
});

describe("redactarResumenDeCambios", () => {
  it("une con comas y «y», sin números negativos ni frases vacías", () => {
    const actuales = cronograma(6);
    const propuesta: ProposalLike = {
      anchorStartDate: null,
      phases: [
        ...actuales.map((p, i) => ({ ...p, ...(i < 5 ? { name: `N${i}` } : {}), ...(i < 4 ? { durationWeeks: 5 } : {}) })),
        { name: "Extra", durationWeeks: 2, sessionCount: null, notes: null },
      ],
    };
    const m = medirPropuesta(actuales, propuesta, ANCLA);
    expect(redactarResumenDeCambios(m)).toBe(
      "5 fases cambian de nombre, 4 fases cambian de duración y se suma 1 fase nueva",
    );
  });

  it("una sola clase de cambio se lee sin conectores", () => {
    const actuales = cronograma(4);
    const m = medirPropuesta(actuales, proponer(actuales, { 0: { name: "X" } }), ANCLA);
    expect(redactarResumenDeCambios(m)).toBe("1 fase cambia de nombre");
  });

  it("sin cambios, resumen vacío (no se inventa una frase)", () => {
    const actuales = cronograma(3);
    const m = medirPropuesta(actuales, proponer(actuales), ANCLA);
    expect(redactarResumenDeCambios(m)).toBe("");
    expect(m.esCronogramaNuevo).toBe(false);
  });
});

/**
 * ── LAS GUARDAS DE PANTALLA ─────────────────────────────────────────────────
 * La medición puede ser perfecta y no servir de nada: si el bloque del aviso desaparece del
 * JSX, `tsc` sigue verde, el build sigue verde, y la franja vuelve a decir «La IA sugiere 11
 * cambios» sobre un cronograma rehecho. Un dato que se calcula y no se pinta es idéntico a un
 * dato que no existe.
 */
describe("guardas: el aviso y el botón se pintan, y el botón no puede mentir", () => {
  /* ⚠ RE-APUNTADAS en E1 del borrador del cronograma (2026-09-24), con esta razón: la franja
     `ProposalGlobalStrip` se borró y su aviso, su botón grande y su confirmación viven ahora en la
     barra de revisión (`RevisionDeLaPropuesta`), que mide con `evaluarMagnitud` —la misma regla—.
     Las guardas piden lo mismo de siempre sobre el archivo nuevo; cambian los nombres («Aplicar
     todo» en vez de «Aceptar todo»/«Reemplazar todo», porque ya no se acepta de a uno). */
  const src = fs.readFileSync(
    path.join(process.cwd(), "components/canvas/RevisionDeLaPropuesta.tsx"),
    "utf8",
  );

  it("el aviso nombra la diferencia, sus motivos y el corrimiento del cierre", () => {
    /* La edición que la pone en rojo: borrar el bloque del aviso, o la línea del cierre. */
    const i = src.indexOf("{otroCronograma && (");
    expect(i, "desapareció el aviso de cronograma nuevo; revisar esta guarda").toBeGreaterThan(-1);
    const tramo = src.slice(i, src.indexOf("{choques > 0 && (", i));
    expect(tramo.length, "la guarda no está mirando nada").toBeGreaterThan(300);
    expect(tramo, "el aviso dejó de nombrar la diferencia").toContain(
      "prácticamente un cronograma nuevo",
    );
    expect(tramo, "el aviso dejó de listar POR QUÉ es distinto").toContain("magnitud.motivos");
    expect(tramo, "el aviso dejó de aclarar que no se borra nada").toContain("Aplicar no borra nada");
    /* El corrimiento del cierre va en la barra FIJA, siempre a la vista (no solo en el aviso).
       ⚠ REAPUNTADA en la corrección de E1 (2026-09-24), con esta razón: la frase salió del componente
       a `fraseDelCierre` (lib/timeline/borrador.ts) para decir también el cierre fijado a mano, y su
       contenido (el corrimiento, o las semanas) se prueba ahí, llamándola. Acá se pide que la barra
       la pinte, con el cierre fijado. */
    expect(src, "la barra dejó de decir cuánto se mueve la fecha de fin").toContain(
      "const cierre = fraseDelCierre(resumen, cierreFijado);",
    );
    expect(src).toContain('<p className="text-xs text-fg-secondary">{cierre}</p>');
  });

  it("el botón grande abre confirmación y el confirm dice la verdad sobre lo que pasa", () => {
    /* Las afirmaciones del confirm son verificables en el código: el escritor del borrador no tiene
       un solo `delete`, la propuesta de fases nunca trae tareas y las fases nuevas se crean vacías.
       La edición que la pone en rojo: cablear el botón directo a aplicar, sacar la frase de «no se
       borra», o pintarlo como destructivo. */
    const i = src.indexOf("<ConfirmDialog");
    expect(i, "desapareció la confirmación del reemplazo total").toBeGreaterThan(-1);
    const tramo = src.slice(i);
    /* ⚠ REAPUNTADA en la corrección de E1 (2026-09-24), con esta razón: la confirmación ya no es solo
       de «Aplicar todo» —también la pide «Aplicar N de M» cuando lo marcado sigue siendo otro
       cronograma—, así que el botón del diálogo dice lo mismo que el de la barra (`textoDeAplicar`). */
    expect(tramo, "el botón perdió su etiqueta").toContain("confirmLabel={textoDelBoton}");
    expect(src).toContain("const textoDelBoton = textoDeAplicar(marcadas, aplicables);");
    expect(tramo, "el confirm dejó de decir que no se borra nada — el modelo es ADITIVO").toContain(
      "No se borra ninguna fase ni ninguna tarea",
    );
    expect(
      tramo,
      'el confirm se pintó como destructivo: el rojo dice "esto borra" y acá no se borra nada',
    ).not.toContain('variant="destructive"');
    /* Y el botón de la barra tiene que ABRIR el confirm en el caso masivo, no aplicar de una.
       ⚠ REESCRITA en la corrección de E1 (2026-09-24), con esta razón: la condición era
       `otroCronograma && todo`, y con un solo choque (el CSE editó un campo: justo el caso de E1) o
       una nota desmarcada, `todo` era falso y un cronograma prácticamente nuevo se aplicaba con un
       clic. Ahora decide `pideConfirmacion(resumen)`: lo MARCADO es otro cronograma, marcado entero o
       no (sus casos, en borrador.test.ts). */
    expect(src, "el botón grande dejó de pedir confirmación en el caso masivo").toContain(
      "pideConfirmacion(resumen) ? setConfirmar(true) : onAplicar()",
    );
    expect(src, "la confirmación volvió a depender de que esté todo marcado").not.toMatch(/&&\s*todo\s*\?/);
  });

  it("un cambio CHICO no cambia nada de lo que ya existía", () => {
    /* El caso chico se ve como siempre: tratamiento neutro (NO ámbar) y aplicar sin confirmación.
       Lo que la guarda fija es que el caso chico NO use el tratamiento de advertencia. */
    expect(src).toContain("La IA propone ${plural(total");
    expect(src).toContain("border-info-line bg-info-surface");
    expect(src, "el caso chico pasó a pintarse como advertencia").toContain(
      'otroCronograma ? "border-warn-line bg-warn-surface" : "border-info-line bg-info-surface"',
    );
    expect(src, "el caso chico perdió su camino directo").toContain(": onAplicar()");
  });
});

/**
 * ── LOS AVISOS DE CORRIMIENTO EN LOS DEMÁS CAMINOS ──────────────────────────
 * «Todos los cambios que propongan los agentes deben avisar que la fecha de finalización se
 * movió» (Elías). Son cuatro caminos y cada uno puede perder el aviso por su cuenta, sin que
 * nada falle: el assist, el cambio manual del ancla, y los dos que escribían el arranque sin
 * dejar rastro legible.
 */
describe("guardas: el corrimiento del cierre viaja por los cuatro caminos", () => {
  const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

  it("el banner del assist dice cuánto se mueve el cierre", () => {
    const src = leer("components/canvas/CronogramaCanvas.tsx");
    const i = src.indexOf("const diffSummary = (() => {");
    expect(i, "cambió diffSummary; revisar esta guarda").toBeGreaterThan(-1);
    const tramo = src.slice(i, src.indexOf("})();", i));
    expect(tramo.length, "la guarda no está mirando nada").toBeGreaterThan(500);
    expect(tramo, "diffSummary dejó de calcular el corrimiento").toContain("endShiftFragment(");
    expect(tramo, "el corrimiento no llega al retorno del diff").toContain("anchorChanged, endShift }");
    expect(src, "el banner del assist dejó de pintar el corrimiento").toContain("diffSummary.endShift");
  });

  it("cambiar la fecha de arranque a mano avisa el corrimiento", () => {
    const src = leer("components/canvas/CronogramaCanvas.tsx");
    const i = src.indexOf("const setAnchorFromGantt");
    expect(i, "desapareció el handler del arranque").toBeGreaterThan(-1);
    const tramo = src.slice(i, i + 900);
    expect(tramo, "el cambio de arranque dejó de avisar adónde se mueve el cierre").toContain(
      "describeEndShift(",
    );
    expect(tramo, "el aviso se calcula pero no se muestra").toContain("toast.info(aviso)");
  });

  it("aplicar la propuesta despierta al watchdog cuando aplica un cambio de arranque", () => {
    /* Este camino movía TODAS las fechas del proyecto sin emitir ANCHOR_CHANGED: el watchdog
       —único escritor de CsAlert— no se enteraba nunca. La edición que la pone en rojo: borrar
       la llamada a emitTimelineEventsSafe.
       ⚠ RE-APUNTADA en E1 (2026-09-24) a POST /timeline/borrador/aplicar: apply-items quedó como
       lápida y el evento se mudó con la auditoría. */
    const src = leer("app/api/projects/[projectId]/timeline/borrador/aplicar/route.ts");
    const i = src.indexOf("if (anclaAplicada");
    expect(i, "desapareció el gate del evento de arranque").toBeGreaterThan(-1);
    const tramo = src.slice(i, i + 1400);
    expect(tramo, "el evento del watchdog no se emite").toContain("emitTimelineEventsSafe(");
    expect(tramo, "el evento perdió su acción").toContain('action: "ANCHOR_CHANGED"');
    expect(src, "la razón de auditoría dejó de decir el corrimiento").toContain("describeEndShift(");
  });

  it("el autosave audita el arranque aunque no audite nada más", () => {
    /* Excepción angosta: el autosave no escribe TimelineChange (y está bien), pero el arranque
       redefine todas las fechas, se copia a la facturación y es el input del cierre. */
    const src = leer("app/api/projects/[projectId]/timeline/route.ts");
    const i = src.indexOf("if (skipAudit && anchorRealmenteCambio");
    expect(i, "desapareció la excepción del ancla en el autosave").toBeGreaterThan(-1);
    const tramo = src.slice(i, src.indexOf("\n  }", src.indexOf("timelineChange.create", i)));
    expect(tramo.length, "la guarda no está mirando nada").toBeGreaterThan(400);
    expect(tramo, "la excepción dejó de escribir el cambio").toContain("timelineChange.create");
    expect(tramo, "la razón dejó de decir el corrimiento del cierre").toContain("describeEndShift(");
    /* ⚠ La razón dice el ARRANQUE, no el cierre (auditoría de la Tanda J). `.label` de
       `projectedEnd` es el CIERRE: rotularlo «Fecha de arranque» imprimía el mismo par de
       fechas dos veces bajo dos nombres y el arranque real no aparecía en ninguna parte — y esa
       línea es la que la cartera muestra como el porqué del proyecto. La edición que la pone en
       rojo: volver a `${antes.label} → ${despues.label}` en el texto del arranque. */
    expect(tramo, "la razón volvió a imprimir el CIERRE donde dice «Fecha de arranque»").toContain(
      "${arranqueAntes} → ${arranqueDespues}",
    );
    // Y el autosave NO puede empezar a auditar todo lo demás: sigue gateado por el flag.
    expect(src, "el autosave dejó de estar exento del audit general").toContain(
      "if (!skipAudit && timelineId",
    );
  });
});
