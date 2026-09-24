/**
 * lib/timeline/borrador.test.ts — el núcleo puro del borrador del cronograma (E1).
 *
 * Correr: `npx vitest run lib/timeline/borrador.test.ts --project unit`.
 *
 * Lo que cuida, en el orden en que se puede romper:
 *   1. PARIDAD: la conversión del formato viejo, aplicada entera, da lo mismo que `apply-items`
 *      (el camino que reemplaza), salvo las dos inferencias del handoff, que son a propósito.
 *   2. IDA Y VUELTA: el borrador sobrevive a JSON y se lee igual (el formato nuevo se LEE en E1).
 *   3. CHOQUES: lo que el CSE cambió después de la propuesta queda fuera por defecto, y aplicar
 *      todo deja intacta su edición.
 *   4. NÚMEROS: la lista se numera de corrido, determinista, y no se corre al marcar ni al editar.
 *   5. LA HUELLA: cambia si cambia lo que se aplicaría, y solo entonces.
 */
import { describe, expect, it } from "vitest";
import {
  alternarVista,
  BLOQUEO_VERSION_NUEVA,
  claveDeRevision,
  convertirPropuestaVieja,
  debeDescartarseSolo,
  esBorradorGuardado,
  FORMATO_BORRADOR,
  huellaDeTexto,
  leerBorrador,
  leerFoto,
  marcarCambio,
  planDeAplicacion,
  proyectar,
  resumir,
  revisionPara,
  REVISION_VACIA,
  type Borrador,
  type FaseViva,
  type Vivo,
} from "./borrador";
import {
  anchorAfterDeltas,
  buildPhaseOrder,
  computeProposalDeltas,
  type ProposalLike,
} from "./proposal-deltas";
import { medirPropuesta } from "./magnitud-propuesta";

const f = (id: string, name: string, durationWeeks: number, extra: Partial<FaseViva> = {}): FaseViva => ({
  id,
  name,
  durationWeeks,
  startWeek: null,
  sessionCount: null,
  notes: null,
  activityType: null,
  ...extra,
});

const A = f("a", "Kick-off", 1, { activityType: "EXPLORACION" });
const B = f("b", "Diseño", 2, { activityType: "PLANIFICACION" });
const C = f("c", "Pruebas", 3, { sessionCount: 2 });
const D = f("d", "Cierre", 1);
const VIVO: Vivo = { ancla: null, fases: [A, B, C, D] };

/** La propuesta típica del handoff: renombra, alarga, suma una fase, reordena y trae arranque. */
const HANDOFF: ProposalLike = {
  anchorStartDate: "2026-10-05T00:00:00.000Z",
  phases: [
    { ...A },
    { ...B, name: "Diseño funcional" },
    { name: "Piloto", durationWeeks: 2, startWeek: null, sessionCount: 1, notes: "piloto" },
    { ...D },
    { ...C, durationWeeks: 4, notes: "más pruebas" },
  ],
};

/** La del paso 1 de «Regenerar todo»: `campos`, `movidas`, motivos y observaciones. */
const CONTEXTO: ProposalLike = {
  anchorStartDate: null,
  origen: "contexto",
  observaciones: ["En el kick-off se habló de 12 semanas en total."],
  movidas: [{ id: "d", despuesDe: "b" }],
  phases: [
    { ...A, campos: [] },
    { ...B, campos: [], motivo: "M-d" },
    { name: "Piloto", durationWeeks: 1, startWeek: null, sessionCount: null, notes: null, motivo: "M-piloto" },
    { ...C, durationWeeks: 5, campos: ["durationWeeks"], motivo: "M-c" },
    { ...D, campos: [], motivo: "M-d" },
  ],
};

type FaseComparable = Omit<FaseViva, "id">;
const comparable = (x: FaseComparable): FaseComparable => ({
  name: x.name,
  durationWeeks: x.durationWeeks,
  startWeek: x.startWeek ?? null,
  sessionCount: x.sessionCount ?? null,
  notes: x.notes ?? null,
  activityType: x.activityType ?? null,
});

/** Lo que dejaba `apply-items` aceptando TODAS las claves: la referencia de la paridad. */
function comoApplyItems(vivo: Vivo, p: ProposalLike): { ancla: string | null; fases: FaseComparable[] } {
  const deltas = computeProposalDeltas(vivo.fases, p, vivo.ancla);
  const todas = new Set(deltas.map((d) => d.key));
  const porId = new Map(vivo.fases.map((x) => [x.id, { ...x }]));
  for (const d of deltas) {
    if (d.kind !== "MODIFY_PHASE") continue;
    const fase = porId.get(d.phaseId)! as unknown as Record<string, unknown>;
    for (const c of d.changes) fase[c.field] = c.to;
  }
  const fases = buildPhaseOrder(vivo.fases, p, todas).map((s) =>
    s.kind === "existing"
      ? comparable(porId.get(s.id)!)
      : comparable({
          name: s.phase.name,
          durationWeeks: s.phase.durationWeeks,
          startWeek: s.phase.startWeek ?? null,
          sessionCount: s.phase.sessionCount ?? null,
          notes: s.phase.notes ?? null,
          activityType: s.phase.activityType ?? null,
        }),
  );
  const ancla = anchorAfterDeltas(vivo.ancla, p, todas);
  return { ancla: ancla ? ancla.slice(0, 10) : null, fases };
}

function aplicadoEntero(vivo: Vivo, p: ProposalLike) {
  const b = convertirPropuestaVieja(p, vivo);
  const pr = proyectar(vivo, b, []);
  return { ancla: pr.ancla, fases: pr.fases.map(comparable) };
}

describe("1 · paridad con apply-items (la conversión del formato viejo aplicada entera)", () => {
  it("la del handoff: renombre, duración, notas, fase nueva en su lugar, orden y arranque", () => {
    /* La edición que la pone en rojo: armar el orden final o los campos con otra regla que la de
       `buildPhaseOrder` y `computeProposalDeltas` (un segundo algoritmo que diverge en silencio). */
    const ref = comoApplyItems(VIVO, HANDOFF);
    expect(aplicadoEntero(VIVO, HANDOFF)).toEqual(ref);
    expect(ref.fases.map((x) => x.name)).toEqual(["Kick-off", "Diseño funcional", "Piloto", "Cierre", "Pruebas"]);
    expect(ref.ancla).toBe("2026-10-05");
  });

  it("la de las reuniones: `campos`, `movidas` sobre el orden vivo y la fase nueva detrás de su ancla", () => {
    const ref = comoApplyItems(VIVO, CONTEXTO);
    expect(aplicadoEntero(VIVO, CONTEXTO)).toEqual(ref);
    expect(ref.fases.map((x) => x.name)).toEqual(["Kick-off", "Diseño", "Piloto", "Cierre", "Pruebas"]);
    expect(ref.ancla, "la IA nunca mueve el arranque").toBeNull();
  });

  it("varias fases nuevas seguidas, una al principio, y una que se ancla en una fase borrada antes de la foto", () => {
    const p: ProposalLike = {
      anchorStartDate: null,
      phases: [
        { name: "Cero", durationWeeks: 1, sessionCount: null, notes: null },
        { ...A },
        { id: "borrada", name: "Ya no está", durationWeeks: 1 },
        { name: "N1", durationWeeks: 1, sessionCount: null, notes: null },
        { name: "N2", durationWeeks: 2, sessionCount: null, notes: null },
        { ...B },
        { ...C },
        { ...D },
      ],
    };
    expect(aplicadoEntero(VIVO, p)).toEqual(comoApplyItems(VIVO, p));
    expect(aplicadoEntero(VIVO, p).fases.map((x) => x.name)).toEqual([
      "Cero",
      "Kick-off",
      "N1",
      "N2",
      "Diseño",
      "Pruebas",
      "Cierre",
    ]);
  });

  it("⭐ las dos diferencias son a propósito: el arranque que puso una persona y el tipo de la fase", () => {
    /* (1) El handoff propone arranque SOLO cuando el proyecto no tenía (analyze: `existente ??
       kickoff`). Si hoy hay otro, lo puso una persona: apply-items lo pisaba; el borrador lo deja.
       (2) El handoff copia el tipo de la fase existente (reconcile-proposal): una diferencia es una
       edición humana posterior, que apply-items revertía. La edición que la pone en rojo: volver a
       tomar el `desde` del arranque o el tipo de la foto como si el handoff los propusiera. */
    const conAncla: Vivo = { ancla: "2026-09-01", fases: [A, { ...B, activityType: "CONFIGURACION" }, C, D] };
    const p: ProposalLike = { anchorStartDate: "2026-10-05T00:00:00.000Z", phases: [{ ...A }, { ...B }, { ...C }, { ...D }] };
    const viejo = comoApplyItems(conAncla, p);
    expect(viejo.ancla, "apply-items movía el arranque que fijó una persona").toBe("2026-10-05");
    expect(viejo.fases[1].activityType, "y le devolvía el tipo viejo a la fase").toBe("PLANIFICACION");

    const b = convertirPropuestaVieja(p, conAncla);
    const plan = planDeAplicacion(conAncla, b, []);
    expect(plan.items.map((it) => [it.cambio.clave, it.estado])).toEqual([["ancla", "choque"]]);
    expect(plan.items[0].choque).toContain("ya la fijaste a mano");
    const nuevo = aplicadoEntero(conAncla, p);
    expect(nuevo.ancla).toBe("2026-09-01");
    expect(nuevo.fases[1].activityType).toBe("CONFIGURACION");

    // Sin arranque, la sugerencia del handoff se aplica como siempre.
    const sinAncla: Vivo = { ...conAncla, ancla: null };
    expect(planDeAplicacion(sinAncla, convertirPropuestaVieja(p, sinAncla), []).items[0].estado).toBe("aplica");
  });

  it("la de las reuniones SÍ puede cambiar el tipo… si algún día lo propone (hoy el armador no lo hace)", () => {
    const p: ProposalLike = {
      anchorStartDate: null,
      origen: "contexto",
      phases: [{ ...A, activityType: "SEGUIMIENTO", campos: ["activityType"] }, { ...B }, { ...C }, { ...D }],
    };
    const b = convertirPropuestaVieja(p, VIVO);
    expect(b.cambios.map((c) => c.clave)).toEqual(["fase:a:activityType"]);
  });
});

describe("2 · ida y vuelta: el borrador se lee igual después de guardarse", () => {
  it("convertir → JSON → leer da el mismo borrador, y un borrador-v1 no necesita la foto", () => {
    for (const p of [HANDOFF, CONTEXTO]) {
      const b = convertirPropuestaVieja(p, VIVO);
      const guardado: unknown = JSON.parse(JSON.stringify(b));
      expect(esBorradorGuardado(guardado)).toBe(true);
      // La foto no importa: el formato nuevo trae su `desde`.
      expect(leerBorrador(guardado, { ancla: null, fases: [] })).toEqual(b);
      expect(planDeAplicacion(VIVO, leerBorrador(guardado, VIVO)!, []).huella).toBe(planDeAplicacion(VIVO, b, []).huella);
    }
  });

  it("el formato viejo se reconoce, y la propuesta del modificador (con tareas) NO es un borrador", () => {
    expect(esBorradorGuardado(HANDOFF)).toBe(true);
    expect(leerBorrador(HANDOFF, VIVO)?.formato).toBe(FORMATO_BORRADOR);
    const delModificador = { anchorStartDate: null, phases: [{ ...A, tasks: [] }] };
    expect(esBorradorGuardado(delModificador)).toBe(false);
    expect(leerBorrador(delModificador, VIVO)).toBeNull();
    expect(leerBorrador(null, VIVO)).toBeNull();
    expect(leerBorrador("basura", VIVO)).toBeNull();
  });

  it("⛔ un borrador-v1 con cambios que esta versión no conoce se lee, pero NO se aplica a medias", () => {
    /* Vuelta atrás desde E2: el borrador puede traer tareas. La edición que la pone en rojo: ignorar
       los cambios desconocidos y aplicar el resto como si fuera todo. */
    const v1 = {
      formato: FORMATO_BORRADOR,
      version: 3,
      origen: "contexto",
      observaciones: ["x"],
      cambios: [
        { tipo: "fase-cambia", clave: "fase:c:durationWeeks", faseId: "c", fase: "Pruebas", campo: "durationWeeks", desde: 3, a: 4 },
        { tipo: "tarea-nueva", clave: "tarea:1", titulo: "Algo" },
      ],
    };
    const b = leerBorrador(v1, VIVO)!;
    expect(b.version).toBe(3);
    expect(b.origen).toBe("contexto");
    expect(b.cambios).toHaveLength(1);
    expect(b.desconocidos).toBe(1);
    const plan = planDeAplicacion(VIVO, b, []);
    expect(plan.bloqueo).toBe(BLOQUEO_VERSION_NUEVA);
    expect(debeDescartarseSolo(plan), "bloqueado no es «nada que decidir»").toBe(false);
  });
});

describe("3 · choques: lo que el CSE cambió después queda fuera, y su edición queda intacta", () => {
  const b = convertirPropuestaVieja(HANDOFF, VIVO);
  /* El CSE, con la propuesta abierta, edita a mano: la duración de Pruebas (que la propuesta TAMBIÉN
     cambia) y las notas de Diseño (que la propuesta no toca). */
  const editado: Vivo = {
    ...VIVO,
    fases: VIVO.fases.map((x) =>
      x.id === "c" ? { ...x, durationWeeks: 6 } : x.id === "b" ? { ...x, notes: "nota del CSE" } : x,
    ),
  };

  it("el cambio que choca queda EXCLUIDO por defecto, con el ⚠ en palabras del CSE", () => {
    /* La edición que la pone en rojo: comparar contra lo vivo en vez del `desde` (el choque
       desaparece y aplicar pisa lo que el CSE escribió). */
    const plan = planDeAplicacion(editado, b, []);
    const choque = plan.items.find((it) => it.cambio.clave === "fase:c:durationWeeks")!;
    expect(choque.estado).toBe("choque");
    expect(choque.choque).toContain("Lo cambiaste a mano");
    expect(plan.aplicadas.map((c) => c.clave)).not.toContain("fase:c:durationWeeks");
    expect(plan.choques).toBe(1);
    // Los demás siguen aplicando.
    expect(plan.aplicadas.map((c) => c.clave)).toContain("fase:c:notes");
  });

  it("⭐ editar en «antes» y después «Aplicar todo» deja la edición intacta (las dos)", () => {
    const p = proyectar(editado, b, []);
    const porId = new Map(p.fases.map((x) => [x.id, x]));
    expect(porId.get("c")!.durationWeeks, "aplicar pisó la duración que puso el CSE").toBe(6);
    expect(porId.get("b")!.notes, "aplicar le borró la nota al CSE").toBe("nota del CSE");
    // Y lo que no choca se aplicó.
    expect(porId.get("b")!.name).toBe("Diseño funcional");
    expect(porId.get("c")!.notes).toBe("más pruebas");
    // Lo que hacía apply-items, contra lo vivo: devolvía las dos ediciones a lo del handoff.
    const viejo = computeProposalDeltas(editado.fases, HANDOFF, null);
    const modB = viejo.find((d) => d.kind === "MODIFY_PHASE" && d.phaseId === "b");
    expect(modB && modB.kind === "MODIFY_PHASE" ? modB.changes.map((c) => c.field) : []).toContain("notes");
  });

  it("si la fase ya no está, el cambio choca (no se recrea ni se salta en silencio)", () => {
    const sinC: Vivo = { ...VIVO, fases: VIVO.fases.filter((x) => x.id !== "c") };
    const plan = planDeAplicacion(sinC, b, []);
    const deC = plan.items.filter((it) => it.cambio.tipo === "fase-cambia" && it.cambio.faseId === "c");
    expect(deC.map((it) => it.estado)).toEqual(["choque", "choque"]);
    expect(deC[0].choque).toContain("ya no está");
    // Y el orden, que contaba con esa fase, también.
    expect(plan.items.find((it) => it.cambio.clave === "orden")!.estado).toBe("choque");
  });

  it("si el CSE hizo lo mismo que la propuesta, está «ya está así» y no se escribe", () => {
    const igual: Vivo = { ...VIVO, fases: VIVO.fases.map((x) => (x.id === "b" ? { ...x, name: "Diseño funcional" } : x)) };
    const plan = planDeAplicacion(igual, b, []);
    expect(plan.items.find((it) => it.cambio.clave === "fase:b:name")!.estado).toBe("ya-esta");
    expect(plan.escrituras.fases.find((x) => x.id === "b")).toBeUndefined();
  });

  it("una fase nueva choca si ya hay una con ese nombre o si la fase de la que colgaba se borró", () => {
    const conPiloto: Vivo = { ...VIVO, fases: [...VIVO.fases, f("p", " piloto ", 1)] };
    const nueva = planDeAplicacion(conPiloto, b, []).items.find((it) => it.cambio.tipo === "fase-nueva")!;
    expect(nueva.estado).toBe("choque");
    expect(nueva.choque).toContain("Ya hay una fase «Piloto»");
    const sinB: Vivo = { ...VIVO, fases: VIVO.fases.filter((x) => x.id !== "b") };
    const huerfana = planDeAplicacion(sinB, b, []).items.find((it) => it.cambio.tipo === "fase-nueva")!;
    expect(huerfana.estado).toBe("choque");
    expect(huerfana.choque).toContain("ya no está");
  });

  it("reordenar a mano después de la propuesta hace chocar el orden", () => {
    const reordenado: Vivo = { ...VIVO, fases: [A, C, B, D] };
    const orden = planDeAplicacion(reordenado, b, []).items.find((it) => it.cambio.clave === "orden")!;
    expect(orden.estado).toBe("choque");
    expect(planDeAplicacion(reordenado, b, []).escrituras.orden.map((l) => (l.tipo === "existente" ? l.id : l.clave))).toEqual([
      "a",
      "c",
      "b",
      "nueva:2",
      "d",
    ]);
  });

  it("un borrador donde TODO ya está así se descarta solo; con un choque, no (el CSE tiene que ver el ⚠)", () => {
    const todoHecho: Vivo = {
      ancla: "2026-10-05",
      fases: [A, { ...B, name: "Diseño funcional" }, f("p", "Piloto", 2), D, { ...C, durationWeeks: 4, notes: "más pruebas" }],
    };
    const soloFases = convertirPropuestaVieja({ ...HANDOFF, phases: HANDOFF.phases.filter((x) => x.id) }, VIVO);
    expect(debeDescartarseSolo(planDeAplicacion(todoHecho, soloFases, []))).toBe(true);
    expect(debeDescartarseSolo(planDeAplicacion(VIVO, convertirPropuestaVieja(HANDOFF, VIVO), []))).toBe(false);
    expect(debeDescartarseSolo(planDeAplicacion(editadoConChoqueSolo(), soloDuracionDeC(), []))).toBe(false);
    // Sin ningún cambio (una propuesta vieja idéntica a lo vivo): también se descarta sola.
    expect(debeDescartarseSolo(planDeAplicacion(VIVO, convertirPropuestaVieja({ anchorStartDate: null, phases: [A, B, C, D] }, VIVO), []))).toBe(true);
  });
});

function soloDuracionDeC(): Borrador {
  return convertirPropuestaVieja({ anchorStartDate: null, phases: [{ ...A }, { ...B }, { ...C, durationWeeks: 4 }, { ...D }] }, VIVO);
}
function editadoConChoqueSolo(): Vivo {
  return { ...VIVO, fases: VIVO.fases.map((x) => (x.id === "c" ? { ...x, durationWeeks: 9 } : x)) };
}

describe("4 · la lista se numera de corrido, determinista y estable", () => {
  it("arranque, orden y después fase por fase en el orden de la propuesta (lo que mueve fechas primero)", () => {
    const b = convertirPropuestaVieja(HANDOFF, VIVO);
    expect(b.cambios.map((c) => c.clave)).toEqual([
      "ancla",
      "orden",
      "fase:b:name",
      "nueva:2",
      "fase:c:durationWeeks",
      "fase:c:notes",
    ]);
    expect(planDeAplicacion(VIVO, b, []).items.map((it) => it.numero)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("los mismos datos dan la misma lista, y marcar o editar no corre los números", () => {
    /* La edición que la pone en rojo: numerar solo lo que aplica (desmarcar el 2 volvería 3 al 4). */
    const b1 = convertirPropuestaVieja(HANDOFF, VIVO);
    const b2 = convertirPropuestaVieja(JSON.parse(JSON.stringify(HANDOFF)), { ...VIVO, fases: [...VIVO.fases] });
    expect(b2).toEqual(b1);
    const base = planDeAplicacion(VIVO, b1, []).items.map((it) => [it.numero, it.cambio.clave]);
    expect(planDeAplicacion(VIVO, b1, ["orden", "nueva:2"]).items.map((it) => [it.numero, it.cambio.clave])).toEqual(base);
    expect(planDeAplicacion(editadoConChoqueSolo(), b1, []).items.map((it) => [it.numero, it.cambio.clave])).toEqual(base);
    const r = resumir(VIVO, b1, ["orden"]);
    expect(r.items.map((it) => it.numero)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.items[1].estado).toBe("excluido");
    expect(r.marcadas).toBe(5);
    expect(r.total).toBe(6);
  });
});

describe("5 · la huella", () => {
  const b = convertirPropuestaVieja(HANDOFF, VIVO);

  it("es la misma para los mismos datos, y cambia si cambia lo que se aplicaría", () => {
    const h = planDeAplicacion(VIVO, b, []).huella;
    expect(planDeAplicacion({ ...VIVO, fases: VIVO.fases.map((x) => ({ ...x })) }, convertirPropuestaVieja(HANDOFF, VIVO), []).huella).toBe(h);
    expect(planDeAplicacion(VIVO, b, ["orden"]).huella, "desmarcar cambia lo que se aplica").not.toBe(h);
    expect(planDeAplicacion(editadoConChoqueSolo(), b, []).huella, "un choque nuevo cambia la lista").not.toBe(h);
  });

  it("⚠ una edición que no toca ningún cambio NO cambia la huella (no es otra lista)", () => {
    const otraNota: Vivo = { ...VIVO, fases: VIVO.fases.map((x) => (x.id === "a" ? { ...x, notes: "otra" } : x)) };
    expect(planDeAplicacion(otraNota, b, []).huella).toBe(planDeAplicacion(VIVO, b, []).huella);
  });

  it("huellaDeTexto es determinista y distingue textos", () => {
    expect(huellaDeTexto("hola")).toBe(huellaDeTexto("hola"));
    expect(huellaDeTexto("hola")).not.toBe(huellaDeTexto("hola "));
    expect(huellaDeTexto("")).toMatch(/^[0-9a-f]{14}$/);
  });
});

describe("6 · proyectar: la vista «Ver la propuesta» y sus marcas", () => {
  it("marca lo nuevo, lo que cambia y lo que se mueve, con etiquetas cortas", () => {
    const b = convertirPropuestaVieja(HANDOFF, VIVO);
    const p = proyectar(VIVO, b, []);
    const marca = (clave: string) => p.fases.find((x) => x.clave === clave)?.marca ?? null;
    expect(marca("nueva:2")).toEqual({ tono: "nueva", etiquetas: ["nueva"] });
    expect(marca("b")).toEqual({ tono: "cambia", etiquetas: ["renombrada"] });
    expect(marca("c")).toEqual({ tono: "cambia", etiquetas: ["+1 semana", "notas", "movida"] });
    expect(marca("a"), "lo que no cambia no se marca").toBeNull();
    expect(marca("d"), "la que queda en su lugar relativo no se marca como movida").toBeNull();
  });

  it("el inicio se dice en semanas del Gantt: dónde arranca hoy → dónde arrancaría", () => {
    const b = convertirPropuestaVieja(
      { anchorStartDate: null, phases: [{ ...A }, { ...B }, { ...C, startWeek: 6 }, { ...D }] },
      VIVO,
    );
    // Pruebas arranca sola en la semana 3 (0-based); pasa a la 6.
    expect(proyectar(VIVO, b, []).fases.find((x) => x.id === "c")!.marca).toEqual({
      tono: "cambia",
      etiquetas: ["inicio S4 → S7"],
    });
  });

  it("lo desmarcado no aparece en la vista: la propuesta es lo que se aplicaría", () => {
    const b = convertirPropuestaVieja(HANDOFF, VIVO);
    const p = proyectar(VIVO, b, ["nueva:2", "fase:b:name"]);
    expect(p.fases.map((x) => x.name)).toEqual(["Kick-off", "Diseño", "Cierre", "Pruebas"]);
    expect(p.fases.find((x) => x.id === "b")!.marca).toBeNull();
  });
});

describe("7 · resumir: la barra dice el cierre antes → después y si es otro cronograma", () => {
  it("el cierre sigue a lo marcado", () => {
    const vivo: Vivo = { ...VIVO, ancla: "2026-09-07" };
    const b = convertirPropuestaVieja({ ...HANDOFF, anchorStartDate: null }, vivo);
    const todo = resumir(vivo, b, []);
    expect(todo.cierreAntes.spanWeeks).toBe(7);
    expect(todo.cierreDespues.spanWeeks).toBe(10);
    expect(todo.corrimiento).toBe("El cierre se corre 21 días: 26 oct 2026 → 16 nov 2026.");
    const sinNuevaNiDuracion = resumir(vivo, b, ["nueva:2", "fase:c:durationWeeks"]);
    expect(sinNuevaNiDuracion.cierreDespues.spanWeeks).toBe(7);
    expect(sinNuevaNiDuracion.corrimiento).toContain("no se mueve");
  });

  it("la magnitud usa la MISMA regla que la franja vieja", () => {
    /* La edición que la pone en rojo: contar distinto (por campo en vez de por fase) y que un mismo
       cambio sea «otro cronograma» en una pantalla y no en la otra. */
    const muchas: ProposalLike = {
      anchorStartDate: null,
      phases: [
        { ...A, name: "Uno", durationWeeks: 3 },
        { ...B, name: "Dos", durationWeeks: 5 },
        { ...C, name: "Tres" },
        { ...D },
      ],
    };
    const r = resumir(VIVO, convertirPropuestaVieja(muchas, VIVO), []);
    const viejo = medirPropuesta(VIVO.fases, muchas, null);
    expect(r.magnitud.esCronogramaNuevo).toBe(viejo.esCronogramaNuevo);
    expect(r.magnitud.motivos).toEqual(viejo.motivos);
    expect(r.magnitud.esCronogramaNuevo).toBe(true);
  });

  it("cada ítem dice qué cambia, con el motivo y el detalle de lo que no cabe en una línea", () => {
    const r = resumir(VIVO, convertirPropuestaVieja(CONTEXTO, VIVO), []);
    expect(r.items.map((it) => it.titulo)).toEqual([
      "Reordenar las fases: Cierre sube de 4º a 3º · Pruebas baja de 3º a 4º",
      "Fase nueva «Piloto» · 1 semana · va después de «Diseño»",
      "Pruebas · 3 → 5 semanas",
    ]);
    expect(r.items[2].motivo).toBe("M-c");
    expect(r.items[1].motivo).toBe("M-piloto");
    expect(r.observaciones).toEqual(["En el kick-off se habló de 12 semanas en total."]);
    expect(r.origen).toBe("contexto");
    const handoff = resumir(VIVO, convertirPropuestaVieja(HANDOFF, VIVO), []);
    expect(handoff.items[0].titulo).toBe("Fecha de arranque: sin fecha → 5 oct 2026");
    expect(handoff.items[2].titulo).toBe("Diseño · pasa a llamarse «Diseño funcional» (conserva sus tareas)");
    expect(handoff.items[5].detalle).toEqual([{ etiqueta: "Notas", antes: "(sin notas)", despues: "más pruebas" }]);
  });
});

describe("8 · el estado de la revisión en pantalla", () => {
  it("una propuesta nueva arranca en «Ver la propuesta», sin nada desmarcado y con la foto de ese momento", () => {
    const clave = claveDeRevision(HANDOFF, "run-1");
    expect(clave).not.toBeNull();
    expect(claveDeRevision(HANDOFF, "run-2"), "otro token es otra propuesta").not.toBe(clave);
    expect(claveDeRevision({ ...HANDOFF, anchorStartDate: null }, "run-1"), "otro contenido también").not.toBe(clave);
    expect(claveDeRevision({ phases: [{ ...A, tasks: [] }] }, "x"), "la del modificador no es un borrador").toBeNull();
    const e = revisionPara(clave, VIVO);
    expect(e).toEqual({ clave, base: VIVO, sin: new Set(), vista: "propuesta" });
    expect(revisionPara(null, VIVO)).toBe(REVISION_VACIA);
  });

  it("alternar va y vuelve; marcar y desmarcar son inversos", () => {
    const e = revisionPara("k", VIVO);
    expect(alternarVista(e).vista).toBe("antes");
    expect(alternarVista(alternarVista(e)).vista).toBe("propuesta");
    const sin = marcarCambio(e, "orden", false);
    expect([...sin.sin]).toEqual(["orden"]);
    expect([...marcarCambio(sin, "orden", true).sin]).toEqual([]);
    expect(e.sin.size, "marcar no muta el estado anterior").toBe(0);
  });
});

describe("9 · la foto que manda la pantalla se valida", () => {
  it("acepta la forma de un cronograma y rechaza la basura", () => {
    expect(leerFoto({ ancla: "2026-10-05T00:00:00.000Z", fases: [A, B] })).toEqual({ ancla: "2026-10-05", fases: [A, B] });
    expect(leerFoto({ ancla: null, fases: [{ id: "x", name: "X", durationWeeks: 1 }] })!.fases[0]).toEqual(f("x", "X", 1));
    expect(leerFoto(null)).toBeNull();
    expect(leerFoto({ ancla: 3, fases: [] })).toBeNull();
    expect(leerFoto({ ancla: null, fases: [{ id: "x", name: "X", durationWeeks: "1" }] })).toBeNull();
    expect(leerFoto({ ancla: null, fases: [{ id: "x", name: "X", durationWeeks: 1, notes: 4 }] })).toBeNull();
  });
});
