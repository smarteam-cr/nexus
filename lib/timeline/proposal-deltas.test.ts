/**
 * lib/timeline/proposal-deltas.test.ts — deltas por ítem de la propuesta de cronograma.
 *
 * Lo que estos tests FIJAN (el bug de Wherex): la propuesta del handoff es solo estructura de
 * fases sin `tasks` — eso JAMÁS puede leerse como "borrar tareas". Y una propuesta idéntica a lo
 * existente produce cero deltas (no-op → no molesta al CSE).
 */
import { describe, it, test, expect } from "vitest";
import {
  computeProposalDeltas,
  describeChange,
  describeChanges,
  buildPhaseOrder,
  anchorAfterDeltas,
  phasesAfterDeltas,
} from "./proposal-deltas";
import { projectedEnd, endShiftDays } from "./weeks";

const cur = (over: Partial<Parameters<typeof computeProposalDeltas>[0][number]> = {}) => ({
  id: "ph1",
  name: "Configuración",
  durationWeeks: 4,
  startWeek: null,
  sessionCount: 3,
  notes: null,
  activityType: "CONFIGURACION",
  ...over,
});

test("propuesta idéntica → cero deltas (no-op)", () => {
  const current = [cur(), cur({ id: "ph2", name: "Adopción", activityType: "ADOPCION" })];
  const proposal = { anchorStartDate: null, phases: current.map((p) => ({ ...p })) };
  expect(computeProposalDeltas(current, proposal, null)).toEqual([]);
});

test("fase sin id → ADD_PHASE; con cambio de duración → MODIFY_PHASE con from/to", () => {
  const current = [cur()];
  const proposal = {
    anchorStartDate: null,
    phases: [
      { ...cur(), durationWeeks: 6 }, // 4 → 6
      { name: "Integración SAP", durationWeeks: 3, startWeek: null, sessionCount: 2, notes: null },
    ],
  };
  const deltas = computeProposalDeltas(current, proposal, null);
  expect(deltas).toHaveLength(2);
  expect(deltas[0]).toMatchObject({
    kind: "MODIFY_PHASE",
    phaseId: "ph1",
    changes: [{ field: "durationWeeks", from: 4, to: 6 }],
  });
  expect(deltas[1]).toMatchObject({ kind: "ADD_PHASE", key: "add:1" });
});

test("`tasks` ausente o presente en la propuesta NO produce deltas de tareas", () => {
  const current = [cur()];
  // Aunque una propuesta trajera tasks (no debería), el helper es phase-level: las ignora.
  const proposal = { anchorStartDate: null, phases: [{ ...cur(), tasks: [] }] };
  expect(computeProposalDeltas(current, proposal, null)).toEqual([]);
});

test("fase propuesta con id que ya no existe (borrada por humano) → delta descartado", () => {
  const proposal = { anchorStartDate: null, phases: [cur({ id: "muerta" })] };
  expect(computeProposalDeltas([], proposal, null)).toEqual([]);
});

test("anchor nuevo (derivado del kickoff) → SET_ANCHOR; anchor igual → nada", () => {
  const current = [cur()];
  const same = { anchorStartDate: "2026-05-19T00:00:00.000Z", phases: [cur()] };
  expect(computeProposalDeltas(current, same, "2026-05-19")).toEqual([]);
  const set = computeProposalDeltas(current, same, null);
  expect(set).toEqual([{ key: "anchor", kind: "SET_ANCHOR", from: null, to: "2026-05-19" }]);
});

test("describeChange redacta la sugerencia principal", () => {
  expect(describeChange({ field: "durationWeeks", from: 4, to: 6 })).toBe("4 → 6 semanas");
  expect(describeChange({ field: "name", from: "A", to: "B" })).toBe("renombrar a «B»");
});

// ── Asperezas corregidas ─────────────────────────────────────────────────────────────────

test("una fase nueva sabe DÓNDE va (después de la fase previa de la propuesta)", () => {
  const a = cur({ id: "a", name: "Sales Hub" });
  const b = cur({ id: "b", name: "Service Hub" });
  const proposal = {
    anchorStartDate: null,
    phases: [{ ...a }, { name: "Integraciones", durationWeeks: 2, sessionCount: null, notes: null }, { ...b }],
  };
  const [d] = computeProposalDeltas([a, b], proposal, null);
  expect(d).toMatchObject({ kind: "ADD_PHASE", afterPhaseId: "a", afterPhaseName: "Sales Hub" });
});

// ── Tanda O: el ADD_PHASE lleva el hint de fusión (mergeCandidateId) ────────────────────────
// Mismo fixture Sales Hub/Service Hub/Integraciones que ya usa el archivo (el trío real de
// Wherex). El nombre de la candidata se resuelve FRESCO contra `current` en cada delta — nunca
// se guarda una copia que pueda quedar vieja (ver el docblock de `ProposalPhaseLike`).

test("ADD_PHASE con mergeCandidateId resuelve el nombre fresco contra la fase actual", () => {
  const a = cur({ id: "a", name: "Sales Hub" });
  const b = cur({ id: "b", name: "Service Hub" });
  // "b" es la huérfana: no viaja en la propuesta (el reconciliador real la re-emitiría aparte,
  // sin delta — acá alcanza con que esté en `current`, que es contra lo que se resuelve el
  // nombre fresco).
  const proposal = {
    anchorStartDate: null,
    phases: [
      { ...a },
      { name: "Integraciones", durationWeeks: 2, sessionCount: null, notes: null, mergeCandidateId: "b" },
    ],
  };
  const [d] = computeProposalDeltas([a, b], proposal, null);
  expect(d).toMatchObject({
    kind: "ADD_PHASE",
    mergeCandidateId: "b",
    mergeCandidateName: "Service Hub",
  });
});

test("ADD_PHASE sin mergeCandidateId → ambos campos en null (regresión: no inventa una candidata)", () => {
  const a = cur({ id: "a", name: "Sales Hub" });
  const proposal = {
    anchorStartDate: null,
    phases: [{ ...a }, { name: "Integraciones", durationWeeks: 2, sessionCount: null, notes: null }],
  };
  const [d] = computeProposalDeltas([a], proposal, null);
  expect(d).toMatchObject({ kind: "ADD_PHASE", mergeCandidateId: null, mergeCandidateName: null });
});

test("ADD_PHASE con mergeCandidateId que ya no existe (un humano la borró) → se ignora, no revienta", () => {
  const a = cur({ id: "a", name: "Sales Hub" });
  const proposal = {
    anchorStartDate: null,
    phases: [
      { ...a },
      { name: "Integraciones", durationWeeks: 2, sessionCount: null, notes: null, mergeCandidateId: "borrada" },
    ],
  };
  const [d] = computeProposalDeltas([a], proposal, null);
  expect(d).toMatchObject({ kind: "ADD_PHASE", mergeCandidateId: null, mergeCandidateName: null });
});

test("una fase nueva AL PRINCIPIO no tiene ancla previa", () => {
  const a = cur({ id: "a" });
  const proposal = {
    anchorStartDate: null,
    phases: [{ name: "Semana 0", durationWeeks: 1, sessionCount: null, notes: null }, { ...a }],
  };
  const [d] = computeProposalDeltas([a], proposal, null);
  expect(d).toMatchObject({ kind: "ADD_PHASE", afterPhaseId: null, afterPhaseName: null });
});

test("reordenar las MISMAS fases produce un delta (antes se perdía en silencio)", () => {
  const a = cur({ id: "a", name: "A" });
  const b = cur({ id: "b", name: "B" });
  const proposal = { anchorStartDate: null, phases: [{ ...b }, { ...a }] };
  const deltas = computeProposalDeltas([a, b], proposal, null);
  expect(deltas).toEqual([
    { key: "reorder", kind: "REORDER_PHASES", ids: ["b", "a"], names: ["B", "A"] },
  ]);
  expect(computeProposalDeltas([a, b], { anchorStartDate: null, phases: [{ ...a }, { ...b }] }, null)).toEqual([]);
});

test("buildPhaseOrder: la fase aceptada cae en su lugar, no al final", () => {
  const a = cur({ id: "a" });
  const b = cur({ id: "b" });
  const nueva = { name: "Integraciones", durationWeeks: 2, sessionCount: null, notes: null };
  const proposal = { anchorStartDate: null, phases: [{ ...a }, nueva, { ...b }] };
  expect(buildPhaseOrder([a, b], proposal, new Set(["add:1"]))).toEqual([
    { kind: "existing", id: "a" },
    { kind: "new", key: "add:1", phase: nueva },
    { kind: "existing", id: "b" },
  ]);
});

test("buildPhaseOrder: reorden + fase nueva se resuelven juntos, sin pisarse", () => {
  const a = cur({ id: "a" });
  const b = cur({ id: "b" });
  const nueva = { name: "N", durationWeeks: 1, sessionCount: null, notes: null };
  const proposal = { anchorStartDate: null, phases: [{ ...b }, nueva, { ...a }] };
  expect(buildPhaseOrder([a, b], proposal, new Set(["reorder", "add:1"]))).toEqual([
    { kind: "existing", id: "b" },
    { kind: "new", key: "add:1", phase: nueva },
    { kind: "existing", id: "a" },
  ]);
  expect(buildPhaseOrder([a, b], proposal, new Set(["add:1"]))).toEqual([
    { kind: "existing", id: "a" },
    { kind: "existing", id: "b" },
    { kind: "new", key: "add:1", phase: nueva },
  ]);
});

test("buildPhaseOrder: dos fases nuevas consecutivas conservan su orden relativo", () => {
  const a = cur({ id: "a" });
  const n1 = { name: "N1", durationWeeks: 1, sessionCount: null, notes: null };
  const n2 = { name: "N2", durationWeeks: 1, sessionCount: null, notes: null };
  const proposal = { anchorStartDate: null, phases: [{ ...a }, n1, n2] };
  expect(buildPhaseOrder([a], proposal, new Set(["add:1", "add:2"]))).toEqual([
    { kind: "existing", id: "a" },
    { kind: "new", key: "add:1", phase: n1 },
    { kind: "new", key: "add:2", phase: n2 },
  ]);
});

/**
 * ── LA PROYECCIÓN DEL CALENDARIO (Tanda J) ──────────────────────────────────
 * `phasesAfterDeltas` + `anchorAfterDeltas` + `projectedEnd` es lo que permite decir «si
 * aceptás esto, el cierre se corre 21 días» ANTES de aceptar. Lo que fija esta tabla: que la
 * proyección respete el orden (que mueve fechas), el `startWeek` explícito (que puede NO
 * moverlas) y la normalización `undefined → null` que hace el endpoint al escribir.
 */
describe("phasesAfterDeltas / anchorAfterDeltas", () => {
  const ANCLA = "2026-06-01T00:00:00.000Z";
  const a = cur({ id: "a", durationWeeks: 4, startWeek: null });
  const b = cur({ id: "b", durationWeeks: 6, startWeek: null });
  const corrimiento = (proposal: Parameters<typeof phasesAfterDeltas>[1], keys: string[]) =>
    endShiftDays(
      projectedEnd(ANCLA, [a, b]),
      projectedEnd(
        anchorAfterDeltas(ANCLA, proposal, new Set(keys)),
        phasesAfterDeltas([a, b], proposal, new Set(keys)),
      ),
    );

  it("aceptar nada no mueve el cierre", () => {
    const proposal = { anchorStartDate: null, phases: [{ ...a, durationWeeks: 9 }, { ...b }] };
    expect(corrimiento(proposal, [])).toBe(0);
  });

  it("aceptar un cambio de duración mueve el cierre exactamente esas semanas", () => {
    const proposal = { anchorStartDate: null, phases: [{ ...a, durationWeeks: 7 }, { ...b }] };
    expect(corrimiento(proposal, ["mod:a"])).toBe(21); // +3 semanas
  });

  it("aceptar SOLO el arranque mueve el cierre los días del ancla", () => {
    const proposal = { anchorStartDate: "2026-06-08T00:00:00.000Z", phases: [{ ...a }, { ...b }] };
    expect(corrimiento(proposal, ["anchor"])).toBe(7);
    expect(anchorAfterDeltas(ANCLA, proposal, new Set())).toBe(ANCLA); // sin aceptar, no se mueve
  });

  it("una fase nueva CONTIGUA suma su duración al cierre", () => {
    const nueva = { name: "QA", durationWeeks: 2, sessionCount: null, notes: null };
    const proposal = { anchorStartDate: null, phases: [{ ...a }, nueva, { ...b }] };
    expect(corrimiento(proposal, ["add:1"])).toBe(14);
  });

  it("⚠ una fase nueva EN PARALELO al FINAL, dentro del span, NO mueve el cierre", () => {
    /* La fila que distingue una proyección de verdad de una suma de duraciones: arranca en la
       semana 0 y dura 3, así que cabe adentro de las 10 que el proyecto ya ocupa y el cierre no
       se toca. Con `totalWeeks` (esfuerzo) esto daría +21 días de promesa inventada.
       La edición que la pone en rojo: que phasesAfterDeltas ignore el `startWeek` propuesto. */
    const paralela = { name: "Prep", durationWeeks: 3, startWeek: 0, sessionCount: null, notes: null };
    const proposal = { anchorStartDate: null, phases: [{ ...a }, { ...b }, paralela] };
    expect(corrimiento(proposal, ["add:2"])).toBe(0);
  });

  it("⚠ la misma fase paralela EN EL MEDIO sí mueve el cierre — lo ADELANTA", () => {
    /* Contraintuitivo y real: `computePhaseRanges` deja el cursor en el fin de la ÚLTIMA fase
       procesada (weeks.ts), así que una paralela intercalada arrastra hacia atrás a todo lo que
       sigue. El span pasa de 10 a 9 semanas. Se congela porque es exactamente la clase de
       corrimiento que nadie espera y que el aviso tiene que poder anunciar. */
    const paralela = { name: "Prep", durationWeeks: 3, startWeek: 0, sessionCount: null, notes: null };
    const proposal = { anchorStartDate: null, phases: [{ ...a }, paralela, { ...b }] };
    expect(corrimiento(proposal, ["add:1"])).toBe(-7);
  });

  it("el orden aceptado se refleja en la proyección (reorder + startWeek explícito)", () => {
    const conInicio = cur({ id: "b", durationWeeks: 6, startWeek: 4 });
    const proposal = { anchorStartDate: null, phases: [{ ...conInicio }, { ...a }] };
    // Sin aceptar el reorder: a (0-4) y b explícita en 4 → span 10.
    expect(phasesAfterDeltas([a, conInicio], proposal, new Set())).toEqual([
      { durationWeeks: 4, startWeek: null },
      { durationWeeks: 6, startWeek: 4 },
    ]);
    // Con el reorder aceptado, b va primero y a la sigue: el orden viaja a la proyección.
    expect(phasesAfterDeltas([a, conInicio], proposal, new Set(["reorder"]))).toEqual([
      { durationWeeks: 6, startWeek: 4 },
      { durationWeeks: 4, startWeek: null },
    ]);
  });

  it("normaliza undefined → null, igual que lo que escribe el endpoint", () => {
    const sinInicio = { id: "a", name: "X", durationWeeks: 4, sessionCount: null, notes: null };
    const proposal = { anchorStartDate: null, phases: [sinInicio] };
    expect(phasesAfterDeltas([a], proposal, new Set(["mod:a"]))).toEqual([
      { durationWeeks: 4, startWeek: null },
    ]);
  });
});

// ── describeChanges: qué se LEE en el badge del Gantt ──────────────────────────
// El badge mostraba changes[0] + "+N" y escondía justo lo que mueve el calendario.
// Caso real (Grupo Inve): «renombrar a "Auditoría y cierre de gaps" +2».

test("describeChanges: lo que MUEVE fechas va primero; el renombre, último", () => {
  const frase = describeChanges([
    { field: "name", from: "Análisis y diseño", to: "Auditoría y cierre de gaps" },
    { field: "sessionCount", from: 2, to: 4 },
    { field: "durationWeeks", from: 2, to: 5 },
  ]);
  expect(frase).toBe("2 → 5 semanas · 2 → 4 sesiones · renombrar a «Auditoría y cierre de gaps»");
});

test("describeChanges: NADA queda escondido detrás de un +N", () => {
  const frase = describeChanges([
    { field: "name", from: "A", to: "B" },
    { field: "durationWeeks", from: 1, to: 3 },
    { field: "startWeek", from: 0, to: 4 },
  ]);
  expect(frase).toContain("semanas");
  expect(frase).toContain("inicio");
  expect(frase).toContain("renombrar");
  expect(frase).not.toContain("+");
});

test("describeChanges: un solo cambio se lee igual que antes", () => {
  expect(describeChanges([{ field: "durationWeeks", from: 4, to: 6 }])).toBe("4 → 6 semanas");
});

// ── La propuesta NO puede vaciar la fila de acciones del cronograma ──────────

import fs from "node:fs";
import path from "node:path";

/**
 * ── LA FALLA QUE ATACA, y que estaba VIVA ────────────────────────────────────
 * Con una propuesta de estructura pendiente, la fila de CTAs del encabezado del cronograma
 * quedaba VACÍA: los tres botones estaban detrás de un `!proposal`.
 *
 * Y eso era falso para la propuesta de ESTRUCTURA: no congela nada. El Gantt sigue editable, los
 * deltas se dibujan adentro como badges, y el aviso ámbar de abajo igual ofrece "Genera las
 * tareas". O sea que la acción existía —pero solo enterrada en un banner—, y el usuario veía
 * cuatro avisos apilados y ningún botón donde los busca.
 *
 * Solo la propuesta del ASSIST (la que trae tareas) sí reemplaza el Gantt por una vista de solo
 * lectura: ahí esconder las acciones es correcto, y por eso el gate es `structureOnlyProposal`
 * y no `proposal` a secas.
 *
 * Se verifica sobre el texto porque es un gate de JSX dentro de un componente de 2.200 líneas
 * que habla con seis endpoints: montarlo entero para leer una condición cuesta más de lo que
 * protege. El assert nombra la condición exacta, no una palabra suelta.
 */
test("con una propuesta de ESTRUCTURA, el cronograma conserva sus acciones", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "components/canvas/CronogramaCanvas.tsx"),
    "utf8",
  );

  expect(
    src,
    "el CTA de generar/re-chequear volvió a esconderse ante cualquier propuesta: con una de " +
      "estructura el Gantt sigue vivo y la fila de acciones no puede quedar vacía",
  ).toContain("(!proposal || structureOnlyProposal)");

  expect(
    src,
    "desapareció el CTA que lleva a revisar los cambios propuestos desde la fila de acciones",
  ).toMatch(/canEdit && structureOnlyProposal && proposalDeltas\.length > 0/);

  // El CTA lleva al ancla; no acepta desde el encabezado (aceptar N cambios sin verlos es
  // difícil de deshacer, y la fila no tiene espacio para explicarlos).
  expect(src).toContain('getElementById("cronograma-propuesta")');
  expect(
    fs.readFileSync(path.join(process.cwd(), "components/canvas/ProposalGlobalStrip.tsx"), "utf8"),
    "el ancla del CTA se perdió: el botón del encabezado quedaría llevando a ningún lado",
  ).toContain('id="cronograma-propuesta"');
});

/**
 * ── EL POZO SIN SALIDA DEL CRONOGRAMA VACÍO (Tanda F, 2026-08-07) ────────────
 *
 * Con `phases.length === 0`, la pantalla decía «Generá el Handoff para ver el cronograma
 * inicial» y **no tenía ningún botón**. El otro CTA de la pantalla —«Generar cronograma»—
 * exige `phases.length > 0` porque genera TAREAS dentro de fases existentes, no las fases:
 * o sea que en el único estado donde el mensaje aparece, no hay un solo gesto disponible.
 *
 * No era un borde. Era el estado PERMANENTE de los 2 hermanos menores de producción —su
 * handoff se redirigía al hermano mayor, así que sus fases aterrizaban allá y ellos quedaban
 * en cero— y es el estado de cualquier Implementación a la que todavía no se le generó el
 * handoff. Instrucción sin gesto: había que adivinar que el handoff vive en otra pestaña.
 *
 * La edición que pone esta guarda en rojo: sacar el `<a href={cronogramaUrl}>` del bloque de
 * `phases.length === 0`. No falla `tsc`, ni ESLint, ni ningún test de backend — la pantalla
 * simplemente vuelve a ser un callejón.
 */
test("el cronograma sin fases ofrece una salida, no solo una instrucción", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "components/canvas/CronogramaCanvas.tsx"),
    "utf8",
  );

  const i = src.indexOf("{phases.length === 0 ? (");
  expect(i, "cambió la forma del estado vacío; revisar esta guarda").toBeGreaterThan(-1);
  const bloque = src.slice(i, src.indexOf(") : proposal", i));
  expect(bloque.length, "la guarda no está mirando nada").toBeGreaterThan(300);

  expect(
    bloque,
    "el cronograma vacío volvió a ser un callejón: dice qué hacer y no da forma de hacerlo",
  ).toContain("cronogramaUrl");
  expect(bloque).toMatch(/Ir al Handoff/);
});

/**
 * ── X1: LAS INSTRUCCIONES DEL CSE POR DOCUMENTO (2026-08-08) ─────────────────
 * La entry reservada `__doc` del canvas del cronograma llega al agente de detalle como
 * regla dura, y la caja de la pantalla la edita. Tres muertes silenciosas posibles: el
 * bloque deja de inyectarse (la instrucción existe y nadie la lee), la caja deja de
 * pintarse (el CSE re-escribe a mano en cada regeneración), o el PATCH deja de salir
 * solo con lo tipeado (el bug de «Regenerar» del handoff, reproducido acá).
 */
import { bloqueDeInstruccionesDeDoc, docBriefFrom, DOC_BRIEF_KEY } from "@/lib/business-cases/section-briefs";

test("el brief del documento: pura, y '' sin brief (el golden por construcción)", () => {
  // Sin brief, el bloque es la string VACÍA: el userMessage de un proyecto sin
  // instrucciones queda byte-idéntico al de antes de X1.
  expect(bloqueDeInstruccionesDeDoc(null)).toBe("");
  expect(bloqueDeInstruccionesDeDoc("   ")).toBe("");
  const b = bloqueDeInstruccionesDeDoc("Las tareas de QA van al final.");
  expect(b).toContain("INSTRUCCIONES DEL CSE PARA ESTA PIEZA");
  expect(b).toContain("Las tareas de QA van al final.");
  // Y la lectura tolera basura, ignora entries ajenas y encuentra la reservada.
  expect(docBriefFrom(null)).toBeNull();
  expect(docBriefFrom([{ key: "otra", brief: "x" }])).toBeNull();
  expect(docBriefFrom([{ key: DOC_BRIEF_KEY, brief: " hola " }])).toBe("hola");
});

test("analyze inyecta el bloque en el userMessage del detalle", () => {
  /* Desde la migración al contexto NOMBRADO (2026-08-08) el brief ya no se lee inline: lo
     lee lib/contexto/cargar.ts y viaja como `contexto.instrucciones` hasta el render. Esta
     guarda sigue vigilando la MISMA muerte silenciosa (la instrucción existe y nadie la
     lee), ahora sobre el eslabón nuevo; el template y su golden viven en
     lib/contexto/detalle-cronograma.test.ts. */
  const src = fs.readFileSync(
    path.join(process.cwd(), "app/api/clients/[id]/analyze/route.ts"),
    "utf8",
  );
  const rama = src.slice(src.indexOf("if (isTimelineDetailAgent && bodyProjectId) {"));
  const tramo = rama.slice(0, rama.indexOf("\n  }"));
  expect(tramo.length, "cambió la rama del detalle; revisar esta guarda").toBeGreaterThan(200);
  expect(tramo, "la rama dejó de cargar el contexto nombrado (ahí vive el brief)").toContain(
    "cargarContextoDelDetalle(",
  );
  expect(tramo, "las instrucciones dejaron de fluir al render — existen y nadie las lee").toContain(
    "instrucciones: contexto.instrucciones",
  );
  // Ciclo 2: fijar también las fuentes — sin esto, re-armarlas a mano en la ruta (con otro
  // onlyConfirmed) pasaba en verde mientras el cargador seguía llamándose solo por el brief.
  // Ciclo 3: con la coma — sin ella, decorarlas (.filter/.map) era matcheo por prefijo verde.
  expect(tramo, "las fuentes dejaron de venir del cargador tal cual").toContain("fuentes: contexto.fuentes,");
});

test("las instrucciones tipeadas viajan al generar: el flush del paso 0 (auditoría)", () => {
  /* El CSE tipea y aprieta «Regenerar detalle» (por fase o TODO el cronograma, Tanda N) sin
     Guardar: sin el flush, la corrida salía SIN la regla y en silencio — el mismo bug «visto
     en RC» de las exclusiones del handoff. La edición que la pone en rojo: sacar el
     await flushDocBrief() de cualquiera de las tres (generateDetail, startRegenPreview,
     startAllRegenPreview). */
  const src = fs.readFileSync(
    path.join(process.cwd(), "components/canvas/CronogramaCanvas.tsx"),
    "utf8",
  );
  expect(src, "desapareció el flush del brief").toContain("flushDocBrief");
  expect(src.match(/await flushDocBrief\(\);/g)?.length, "una de las tres corridas del detalle perdió el flush").toBe(3);
});

test("la caja de instrucciones se pinta y solo guarda lo que una persona tipeó", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "components/canvas/CronogramaCanvas.tsx"),
    "utf8",
  );
  expect(src, "desapareció la caja de instrucciones del cronograma").toContain(
    "Instrucciones para la IA de este documento",
  );
  // El flag dirty es la lección del bug de «Regenerar» del handoff: sin él, un draft que
  // nunca se re-sembró se ve igual que uno que alguien vació a mano.
  expect(src, "el PATCH del brief dejó de exigir que una persona haya tipeado").toContain(
    "setBriefDirty(true)",
  );
  expect(src, "el guardado dejó de estar gateado por el dirty").toMatch(
    /disabled=\{savingBrief \|\| !briefDirty/,
  );
});
