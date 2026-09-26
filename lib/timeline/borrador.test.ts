/**
 * lib/timeline/borrador.test.ts — el núcleo puro del borrador del cronograma (E1).
 *
 * Correr: `npx vitest run lib/timeline/borrador.test.ts --project unit`.
 *
 * Lo que cuida, en el orden en que se puede romper:
 *   1. PARIDAD: el conversor de los productores (`convertirPropuestaDeFases`), aplicado entero, da lo
 *      mismo que la vieja `apply-items`, salvo las dos inferencias del handoff, que son a propósito.
 *   2. IDA Y VUELTA: el borrador sobrevive a JSON y se lee igual. E4: lo que no es un v1 no se lee.
 *   3. CHOQUES: lo que el CSE cambió después de la propuesta queda fuera por defecto, y aplicar
 *      todo deja intacta su edición.
 *   4. NÚMEROS: la lista se numera de corrido, determinista, y no se corre al marcar ni al editar.
 *   5. LA HUELLA: cambia si cambia lo que se aplicaría, y solo entonces.
 *   6-8. La vista, la barra y el estado de la pantalla.
 *   9. (E4) Se retiraron el lector del formato viejo y la foto.
 *   10-13. (Revisión de E1, 2026-09-24) «Aplicar todo» con un choque y la confirmación de otro
 *      cronograma; el cierre fijado a mano; lo desmarcado RECORDADO entre montajes; y la propuesta
 *      abierta que el handoff no pisa.
 *   14. (E2b) «Regenerar» de una fase (`soloFase`) y de dónde viene cada propuesta.
 *
 * ⚠ E4 (2026-09): lo guardado es siempre v1; la conversión quedó para los productores. Por eso §2, §8,
 * §9, §12 y §13 se reescribieron: ya no hay foto contra la que convertir al leer, y la identidad de una
 * propuesta es su token (`|v1`).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as moduloDelBorrador from "./borrador";
import * as moduloDeDeltas from "./proposal-deltas";
import {
  almacenEnMemoria,
  alternarVista,
  BLOQUEO_VERSION_NUEVA,
  borradorVacio,
  claveDelRecuerdo,
  claveDeRevision,
  convertirPropuestaDeFases,
  debeDescartarseSolo,
  deDondeViene,
  desdeDeLaPropuesta,
  esBorradorV1,
  FORMATO_BORRADOR,
  fraseDelCierre,
  huellaDeTexto,
  jsonCanonico,
  leerBorrador,
  marcarCambio,
  olvidarRevision,
  pideConfirmacion,
  planDeAplicacion,
  propuestaPorDecidir,
  proyectar,
  recordarRevision,
  recuerdoDeLaRevision,
  resumir,
  revisionPara,
  REVISION_VACIA,
  textoDeAplicar,
  type AlmacenDeFotos,
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

/* Sin `tareas` (E2a, 2026-09-25): la fase viva trae sus tareas guardadas y la proyectada las que
   quedarían, con otra forma; la paridad con apply-items compara solo la ESTRUCTURA, como siempre. */
type FaseComparable = Omit<FaseViva, "id" | "tareas">;
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
  const b = convertirPropuestaDeFases(p, vivo);
  const pr = proyectar(vivo, b, []);
  return { ancla: pr.ancla, fases: pr.fases.map(comparable) };
}

/* ⚠ RENOMBRADA en E4 (2026-09): era «la conversión del formato viejo». Lo guardado ya es siempre v1, pero
   la conversión SIGUE: la usan los dos productores (el handoff y el paso 1) antes de guardar, una vez. */
describe("1 · paridad con apply-items (el conversor de los productores, aplicado entero)", () => {
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

    const b = convertirPropuestaDeFases(p, conAncla);
    const plan = planDeAplicacion(conAncla, b, []);
    expect(plan.items.map((it) => [it.cambio.clave, it.estado])).toEqual([["ancla", "choque"]]);
    expect(plan.items[0].choque).toContain("ya la fijaste a mano");
    const nuevo = aplicadoEntero(conAncla, p);
    expect(nuevo.ancla).toBe("2026-09-01");
    expect(nuevo.fases[1].activityType).toBe("CONFIGURACION");

    // Sin arranque, la sugerencia del handoff se aplica como siempre.
    const sinAncla: Vivo = { ...conAncla, ancla: null };
    expect(planDeAplicacion(sinAncla, convertirPropuestaDeFases(p, sinAncla), []).items[0].estado).toBe("aplica");
  });

  it("la de las reuniones SÍ puede cambiar el tipo… si algún día lo propone (hoy el armador no lo hace)", () => {
    const p: ProposalLike = {
      anchorStartDate: null,
      origen: "contexto",
      phases: [{ ...A, activityType: "SEGUIMIENTO", campos: ["activityType"] }, { ...B }, { ...C }, { ...D }],
    };
    const b = convertirPropuestaDeFases(p, VIVO);
    expect(b.cambios.map((c) => c.clave)).toEqual(["fase:a:activityType"]);
  });
});

describe("2 · ida y vuelta: el borrador se lee igual después de guardarse", () => {
  it("convertir → JSON → leer da el mismo borrador: el v1 trae su `desde`", () => {
    for (const p of [HANDOFF, CONTEXTO]) {
      const b = convertirPropuestaDeFases(p, VIVO);
      const guardado: unknown = JSON.parse(JSON.stringify(b));
      expect(esBorradorV1(guardado)).toBe(true);
      expect(leerBorrador(guardado)).toEqual(b);
      expect(planDeAplicacion(VIVO, leerBorrador(guardado)!, []).huella).toBe(planDeAplicacion(VIVO, b, []).huella);
    }
  });

  it("⛔ E4: lo que no es un v1 NO se lee: el formato viejo (`ProposalLike`) y la del modificador dan null", () => {
    /* ⚠ REESCRITA en E4 (2026-09), con esta razón: pedía que el formato viejo se CONVIRTIERA al leer
       (contra una foto). Desde E4 lo guardado es siempre v1: las viejas se convierten una vez con
       scripts/propuestas-abiertas.ts. La edición que la pone en rojo: volver a convertir al leer, o
       devolverle a `leerBorrador` su segundo parámetro. */
    expect(leerBorrador(HANDOFF), "volvió a convertir el formato viejo al leer").toBeNull();
    expect(leerBorrador(CONTEXTO)).toBeNull();
    expect(leerBorrador.length, "`leerBorrador` volvió a pedir una foto").toBe(1);
    const delModificador = { anchorStartDate: null, phases: [{ ...A, tasks: [] }] };
    expect(leerBorrador(delModificador)).toBeNull();
    expect(leerBorrador(null)).toBeNull();
    expect(leerBorrador("basura")).toBeNull();
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
    const b = leerBorrador(v1)!;
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
  const b = convertirPropuestaDeFases(HANDOFF, VIVO);
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
    const soloFases = convertirPropuestaDeFases({ ...HANDOFF, phases: HANDOFF.phases.filter((x) => x.id) }, VIVO);
    expect(debeDescartarseSolo(planDeAplicacion(todoHecho, soloFases, []))).toBe(true);
    expect(debeDescartarseSolo(planDeAplicacion(VIVO, convertirPropuestaDeFases(HANDOFF, VIVO), []))).toBe(false);
    expect(debeDescartarseSolo(planDeAplicacion(editadoConChoqueSolo(), soloDuracionDeC(), []))).toBe(false);
    // Sin ningún cambio (una propuesta vieja idéntica a lo vivo): también se descarta sola.
    expect(debeDescartarseSolo(planDeAplicacion(VIVO, convertirPropuestaDeFases({ anchorStartDate: null, phases: [A, B, C, D] }, VIVO), []))).toBe(true);
  });
});

function soloDuracionDeC(): Borrador {
  return convertirPropuestaDeFases({ anchorStartDate: null, phases: [{ ...A }, { ...B }, { ...C, durationWeeks: 4 }, { ...D }] }, VIVO);
}
function editadoConChoqueSolo(): Vivo {
  return { ...VIVO, fases: VIVO.fases.map((x) => (x.id === "c" ? { ...x, durationWeeks: 9 } : x)) };
}

describe("4 · la lista se numera de corrido, determinista y estable", () => {
  it("arranque, orden y después fase por fase en el orden de la propuesta (lo que mueve fechas primero)", () => {
    const b = convertirPropuestaDeFases(HANDOFF, VIVO);
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
    const b1 = convertirPropuestaDeFases(HANDOFF, VIVO);
    const b2 = convertirPropuestaDeFases(JSON.parse(JSON.stringify(HANDOFF)), { ...VIVO, fases: [...VIVO.fases] });
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
  const b = convertirPropuestaDeFases(HANDOFF, VIVO);

  it("es la misma para los mismos datos, y cambia si cambia lo que se aplicaría", () => {
    const h = planDeAplicacion(VIVO, b, []).huella;
    expect(planDeAplicacion({ ...VIVO, fases: VIVO.fases.map((x) => ({ ...x })) }, convertirPropuestaDeFases(HANDOFF, VIVO), []).huella).toBe(h);
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
    const b = convertirPropuestaDeFases(HANDOFF, VIVO);
    const p = proyectar(VIVO, b, []);
    const marca = (clave: string) => p.fases.find((x) => x.clave === clave)?.marca ?? null;
    expect(marca("nueva:2")).toEqual({ tono: "nueva", etiquetas: ["nueva"] });
    expect(marca("b")).toEqual({ tono: "cambia", etiquetas: ["renombrada"] });
    expect(marca("c")).toEqual({ tono: "cambia", etiquetas: ["+1 semana", "notas", "movida"] });
    expect(marca("a"), "lo que no cambia no se marca").toBeNull();
    expect(marca("d"), "la que queda en su lugar relativo no se marca como movida").toBeNull();
  });

  it("el inicio se dice en semanas del Gantt: dónde arranca hoy → dónde arrancaría", () => {
    const b = convertirPropuestaDeFases(
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
    const b = convertirPropuestaDeFases(HANDOFF, VIVO);
    const p = proyectar(VIVO, b, ["nueva:2", "fase:b:name"]);
    expect(p.fases.map((x) => x.name)).toEqual(["Kick-off", "Diseño", "Cierre", "Pruebas"]);
    expect(p.fases.find((x) => x.id === "b")!.marca).toBeNull();
  });
});

describe("7 · resumir: la barra dice el cierre antes → después y si es otro cronograma", () => {
  it("el cierre sigue a lo marcado", () => {
    const vivo: Vivo = { ...VIVO, ancla: "2026-09-07" };
    const b = convertirPropuestaDeFases({ ...HANDOFF, anchorStartDate: null }, vivo);
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
    const r = resumir(VIVO, convertirPropuestaDeFases(muchas, VIVO), []);
    const viejo = medirPropuesta(VIVO.fases, muchas, null);
    expect(r.magnitud.esCronogramaNuevo).toBe(viejo.esCronogramaNuevo);
    expect(r.magnitud.motivos).toEqual(viejo.motivos);
    expect(r.magnitud.esCronogramaNuevo).toBe(true);
  });

  it("cada ítem dice qué cambia, con el motivo y el detalle de lo que no cabe en una línea", () => {
    const r = resumir(VIVO, convertirPropuestaDeFases(CONTEXTO, VIVO), []);
    expect(r.items.map((it) => it.titulo)).toEqual([
      "Reordenar las fases: Cierre sube de 4º a 3º · Pruebas baja de 3º a 4º",
      "Fase nueva «Piloto» · 1 semana · va después de «Diseño»",
      "Pruebas · 3 → 5 semanas",
    ]);
    expect(r.items[2].motivo).toBe("M-c");
    expect(r.items[1].motivo).toBe("M-piloto");
    expect(r.observaciones).toEqual(["En el kick-off se habló de 12 semanas en total."]);
    expect(r.origen).toBe("contexto");
    const handoff = resumir(VIVO, convertirPropuestaDeFases(HANDOFF, VIVO), []);
    expect(handoff.items[0].titulo).toBe("Fecha de arranque: sin fecha → 5 oct 2026");
    expect(handoff.items[2].titulo).toBe("Diseño · pasa a llamarse «Diseño funcional» (conserva sus tareas)");
    expect(handoff.items[5].detalle).toEqual([{ etiqueta: "Notas", antes: "(sin notas)", despues: "más pruebas" }]);
  });
});

/** Una propuesta como se GUARDA desde E4: siempre `borrador-v1` (convertida una vez por su productor). */
const guardadaV1 = (p: ProposalLike, vivo: Vivo = VIVO): unknown => JSON.parse(JSON.stringify(convertirPropuestaDeFases(p, vivo)));

describe("8 · el estado de la revisión en pantalla", () => {
  it("una propuesta nueva arranca en «Ver la propuesta», sin nada desmarcado; su identidad es el token", () => {
    /* ⚠ REESCRITA en E4 (2026-09), con esta razón: pedía la foto en el estado y una identidad por
       contenido (token + huella del JSON), que era del formato viejo. Un v1 se identifica por su token
       (`|v1`, desde E2a): lo desmarcado sobrevive a que suba la versión. */
    const V1 = guardadaV1(HANDOFF);
    const clave = claveDeRevision(V1, "run-1");
    expect(clave).toBe("run-1|v1");
    expect(claveDeRevision(V1, "run-2"), "otro token es otra propuesta").not.toBe(clave);
    expect(claveDeRevision({ ...(V1 as object), version: 7 }, "run-1"), "otra versión es la MISMA propuesta").toBe(clave);
    expect(claveDeRevision(HANDOFF, "run-1"), "el formato viejo ya no tiene identidad").toBeNull();
    expect(claveDeRevision({ phases: [{ ...A, tasks: [] }] }, "x"), "la del modificador no es un borrador").toBeNull();
    const e = revisionPara(clave);
    expect(e).toEqual({ clave, sin: new Set(), vista: "propuesta" });
    expect("base" in e, "volvió la foto al estado de la revisión").toBe(false);
    expect(revisionPara(null)).toBe(REVISION_VACIA);
    expect(revisionPara(clave, { sin: ["orden"] }).sin).toEqual(new Set(["orden"]));
  });

  it("jsonCanonico: el mismo contenido con las claves en otro orden da el mismo texto", () => {
    /* La respuesta del POST /estructura y el GET (jsonb de Postgres) no traen el mismo orden de claves.
       Lo usa la huella del plan (`tarea-cambia`, E3): con el texto crudo, la misma lista era «otra». */
    const invertir = (v: unknown): unknown =>
      Array.isArray(v)
        ? v.map(invertir)
        : v && typeof v === "object"
          ? Object.fromEntries(Object.entries(v as Record<string, unknown>).reverse().map(([k, x]) => [k, invertir(x)]))
          : v;
    expect(JSON.stringify(invertir(HANDOFF)), "el fixture tiene que cambiar de orden de verdad").not.toBe(JSON.stringify(HANDOFF));
    expect(jsonCanonico(invertir(HANDOFF))).toBe(jsonCanonico(HANDOFF));
    expect(jsonCanonico({ ...HANDOFF, anchorStartDate: null }), "otro contenido es otro texto").not.toBe(jsonCanonico(HANDOFF));
  });

  it("alternar va y vuelve; marcar y desmarcar son inversos", () => {
    const e = revisionPara("k");
    expect(alternarVista(e).vista).toBe("antes");
    expect(alternarVista(alternarVista(e)).vista).toBe("propuesta");
    const sin = marcarCambio(e, "orden", false);
    expect([...sin.sin]).toEqual(["orden"]);
    expect([...marcarCambio(sin, "orden", true).sin]).toEqual([]);
    expect(e.sin.size, "marcar no muta el estado anterior").toBe(0);
  });
});

/* ⚠ REESCRITA en E4 (2026-09), con esta razón: validaba la foto que mandaba la pantalla (`leerFoto`), que
   solo servía para convertir el formato viejo. Ahora cuida que el lector viejo, la foto y lo que solo
   ellos usaban no vuelvan. */
describe("9 · E4: se retiraron el lector del formato viejo, la foto y las lápidas", () => {
  it("⛔ borrador.ts no exporta `esBorradorGuardado` ni `leerFoto`; proposal-deltas.ts, `reescribirPropuestaPendiente`", () => {
    /* La edición que la pone en rojo: restaurar cualquiera de los tres. */
    expect("esBorradorGuardado" in moduloDelBorrador).toBe(false);
    expect("leerFoto" in moduloDelBorrador).toBe(false);
    expect("convertirPropuestaVieja" in moduloDelBorrador, "el conversor se llama convertirPropuestaDeFases").toBe(false);
    expect("claveDeLaFoto" in moduloDelBorrador, "la clave se llama claveDelRecuerdo").toBe(false);
    expect("reescribirPropuestaPendiente" in moduloDeDeltas).toBe(false);
    expect("describeChanges" in moduloDeDeltas).toBe(false);
    expect("sortChangesByImpact" in moduloDeDeltas).toBe(false);
  });

  it("⛔ api-guards.ts no define `guardTimelineDetailApply` ni `guardTimelineFullRegen`", () => {
    /* Sin usos desde E2b (se fueron apply-all y la vista previa de una fase). La edición que la pone en
       rojo: restaurar cualquiera de los dos. */
    const guards = fs.readFileSync(path.join(process.cwd(), "lib/auth/api-guards.ts"), "utf8");
    expect(guards).toContain("export async function guardIaDelCronograma(");
    expect(guards).not.toMatch(/function guardTimelineDetailApply\b/);
    expect(guards).not.toMatch(/function guardTimelineFullRegen\b/);
  });

  it("⛔ `propuestaPorDecidir` FALLA CERRADA: lo que no es un v1 cuenta como por decidir", () => {
    /* El handoff no pisa lo que no sabe leer: la pantalla ofrece descartarlo y lo decide el CSE. La
       edición que la pone en rojo: `if (!b) return false`. */
    expect(propuestaPorDecidir(HANDOFF, VIVO), "el handoff pisaría lo que no sabe leer").toBe(true);
    expect(propuestaPorDecidir({ cualquier: "cosa" }, VIVO)).toBe(true);
    expect(propuestaPorDecidir(null, VIVO), "sin propuesta no hay nada que decidir").toBe(false);
  });
});

describe("10 · «Aplicar todo» aplica lo limpio, y la confirmación mira lo MARCADO", () => {
  /* Una propuesta que rehace el plan: renombra y alarga casi todo. */
  const MUCHAS: ProposalLike = {
    anchorStartDate: null,
    phases: [
      { ...A, name: "Uno", durationWeeks: 3 },
      { ...B, name: "Dos", durationWeeks: 5 },
      { ...C, name: "Tres", durationWeeks: 6, notes: "otra nota" },
      { ...D, name: "Cuatro" },
    ],
  };
  const b = convertirPropuestaDeFases(MUCHAS, VIVO);
  /* El CSE, con la propuesta abierta, alarga Pruebas a mano: ese cambio choca. */
  const conUnaEdicion: Vivo = { ...VIVO, fases: VIVO.fases.map((x) => (x.id === "c" ? { ...x, durationWeeks: 9 } : x)) };

  it("⭐ con un choque, marcado todo lo limpio el botón dice «Aplicar todo» (M = lo que se puede marcar)", () => {
    /* La edición que la pone en rojo: comparar contra `total`, que cuenta el choque: el botón decía
       «Aplicar N de N+1» con todo lo que se puede aplicar ya marcado. */
    const r = resumir(conUnaEdicion, b, []);
    expect(r.choques).toBe(1);
    expect(r.total).toBe(r.aplicables + 1);
    expect(r.marcadas).toBe(r.aplicables);
    expect(textoDeAplicar(r.marcadas, r.aplicables)).toBe("Aplicar todo");
    const sinUna = resumir(conUnaEdicion, b, ["fase:c:notes"]);
    expect(textoDeAplicar(sinUna.marcadas, sinUna.aplicables)).toBe(`Aplicar ${r.aplicables - 1} de ${r.aplicables}`);
    // Y lo que choca nunca se escribe, aunque el botón diga «todo».
    expect(planDeAplicacion(conUnaEdicion, b, []).aplicadas.map((c) => c.clave)).not.toContain("fase:c:durationWeeks");
  });

  it("⭐ otro cronograma pide confirmación aunque haya un choque o una casilla desmarcada", () => {
    /* La edición que la pone en rojo: volver a `otroCronograma && todo` — con un solo ⚠ (el caso de
       E1: el CSE editó un campo) o una nota desmarcada, un cronograma nuevo se aplicaba con un clic. */
    expect(pideConfirmacion(resumir(VIVO, b, []))).toBe(true);
    expect(pideConfirmacion(resumir(conUnaEdicion, b, [])), "con un choque").toBe(true);
    expect(pideConfirmacion(resumir(VIVO, b, ["fase:c:notes"])), "con una nota desmarcada").toBe(true);
  });

  it("si lo marcado ya no es otro cronograma (o no hay nada marcado), no se confirma", () => {
    const casiNada = b.cambios.map((c) => c.clave).filter((k) => k !== "fase:b:durationWeeks");
    const r = resumir(VIVO, b, casiNada);
    expect(r.magnitud.esCronogramaNuevo, "la propuesta entera sigue siendo otro cronograma").toBe(true);
    expect(r.marcadas).toBe(1);
    expect(pideConfirmacion(r)).toBe(false);
    expect(pideConfirmacion(resumir(VIVO, b, b.cambios.map((c) => c.clave)))).toBe(false);
    // Y un ajuste chico nunca.
    expect(pideConfirmacion(resumir(VIVO, soloDuracionDeC(), []))).toBe(false);
  });
});

describe("11 · el cierre de la barra, también con un cierre fijado a mano (Tanda K)", () => {
  const vivo: Vivo = { ...VIVO, ancla: "2026-09-07" };
  const b = convertirPropuestaDeFases({ ...HANDOFF, anchorStartDate: null }, vivo);

  it("sin cierre fijado, el corrimiento; sin arranque, las semanas", () => {
    expect(fraseDelCierre(resumir(vivo, b, []))).toBe("El cierre se corre 21 días: 26 oct 2026 → 16 nov 2026.");
    expect(fraseDelCierre(resumir(VIVO, b, []))).toBe(
      "El plan pasa de 7 semanas a 10 semanas (sin fecha de arranque no hay fecha de cierre).",
    );
    expect(fraseDelCierre(resumir(VIVO, b, b.cambios.map((c) => c.clave)))).toBe(
      "El plan sigue en 7 semanas (sin fecha de arranque no hay fecha de cierre).",
    );
  });

  it("⭐ con un cierre fijado, la fecha que se nombra es la fijada, y se dice que aplicar no la toca", () => {
    /* La edición que la pone en rojo: ignorar el cierre fijado — la barra decía «26 oct → 16 nov»
       mientras «Ver como estaba antes» y el cliente mostraban el 30 nov. */
    expect(fraseDelCierre(resumir(vivo, b, []), "2026-11-30")).toBe(
      "El cierre está fijado a mano el 30 nov 2026 y aplicar no lo cambia; el plan calculado pasa de terminar el 26 oct 2026 a terminar el 16 nov 2026.",
    );
    expect(fraseDelCierre(resumir(vivo, b, b.cambios.map((c) => c.clave)), "2026-11-30")).toBe(
      "El cierre está fijado a mano el 30 nov 2026 y aplicar no lo cambia; el plan calculado sigue terminando el 26 oct 2026.",
    );
    expect(fraseDelCierre(resumir(VIVO, b, []), "2026-11-30")).toBe(
      "El cierre está fijado a mano el 30 nov 2026 y aplicar no lo cambia; el plan pasa de 7 semanas a 10 semanas.",
    );
  });
});

/* ⚠ REESCRITA en E4 (2026-09), con esta razón: cuidaba la FOTO recordada entre montajes, que evitaba que
   una edición a mano pasara de ⚠ a «aplica» al volver. Un v1 trae su `desde` guardado: la edición choca
   sin foto. Lo que se sigue recordando es lo desmarcado, atado a la identidad `token|v1`. */
describe("12 · lo desmarcado se RECUERDA entre montajes, y un v1 choca sin foto", () => {
  /* El caso del probe de la revisión: el handoff propone Pruebas 3 → 4; con la propuesta abierta, el
     CSE pone 5 a mano, cambia de canvas (el cronograma se desmonta) y vuelve. */
  const PROP = guardadaV1({ anchorStartDate: null, phases: [{ ...A }, { ...B }, { ...C, durationWeeks: 4 }, { ...D }] });
  const editado: Vivo = { ...VIVO, fases: VIVO.fases.map((x) => (x.id === "c" ? { ...x, durationWeeks: 5 } : x)) };

  it("⭐ la edición a mano es un choque siempre: el `desde` viene guardado, no de una foto", () => {
    /* La edición que la pone en rojo: fijar el `desde` contra lo vivo al leer (el cambio pasaría a
       «aplica», marcado, y aplicar escribiría 4 encima del 5). */
    const b = leerBorrador(PROP)!;
    const item = planDeAplicacion(editado, b, []).items.find((it) => it.cambio.clave === "fase:c:durationWeeks")!;
    expect(item.estado).toBe("choque");
    const pr = proyectar(editado, b, []);
    expect(pr.fases.find((x) => x.id === "c")!.durationWeeks, "aplicar todo revierte la edición a mano").toBe(5);
  });

  it("montar → desmarcar → remontar: lo desmarcado vuelve; otra propuesta u otro proyecto no lo heredan", () => {
    const almacen = almacenEnMemoria();
    const clave = claveDeRevision(PROP, "run-1")!;
    expect(recuerdoDeLaRevision(almacen, "p1", clave)).toBeNull();
    recordarRevision(almacen, "p1", clave, { sin: ["fase:c:durationWeeks"] });
    expect(recuerdoDeLaRevision(almacen, "p1", clave)).toEqual({ sin: ["fase:c:durationWeeks"] });
    expect([...revisionPara(clave, recuerdoDeLaRevision(almacen, "p1", clave)).sin]).toEqual(["fase:c:durationWeeks"]);
    expect(JSON.parse(almacen.getItem(claveDelRecuerdo("p1"))!), "se guarda solo `sin`").toEqual({
      revision: clave,
      sin: ["fase:c:durationWeeks"],
    });
    // La misma propuesta con otra versión (llegaron sus tareas) es la MISMA: lo desmarcado sigue.
    expect(recuerdoDeLaRevision(almacen, "p1", claveDeRevision({ ...(PROP as object), version: 4 }, "run-1")!)).not.toBeNull();
    // Otro token es OTRA propuesta: arranca sin nada desmarcado.
    const otra = claveDeRevision(PROP, "run-2")!;
    expect(recuerdoDeLaRevision(almacen, "p1", otra)).toBeNull();
    expect(recuerdoDeLaRevision(almacen, "p2", clave), "la de otro proyecto").toBeNull();
    // Una sola entrada por proyecto: la propuesta nueva pisa la vieja; aplicar o descartar la borra.
    recordarRevision(almacen, "p1", otra, { sin: [] });
    expect(recuerdoDeLaRevision(almacen, "p1", clave)).toBeNull();
    olvidarRevision(almacen, "p1");
    expect(recuerdoDeLaRevision(almacen, "p1", otra)).toBeNull();
    // ⛔ El texto de la clave no cambia: lo desmarcado antes de E4 se sigue leyendo.
    expect(claveDelRecuerdo("p1")).toBe("nexus:cronograma:foto-de-la-propuesta:p1");
  });

  it("⛔ una entrada de la versión anterior, CON `foto`, se lee igual: da solo `sin`", () => {
    /* La migración única de E3 lee lo desmarcado de antes; una pestaña de E3 lo escribe con `foto`. La
       edición que la pone en rojo: exigir la foto (o validarla) para devolver lo desmarcado. */
    const almacen = almacenEnMemoria();
    const clave = claveDeRevision(PROP, "run-1")!;
    almacen.setItem(claveDelRecuerdo("p1"), JSON.stringify({ revision: clave, foto: VIVO, sin: ["orden"] }));
    expect(recuerdoDeLaRevision(almacen, "p1", clave)).toEqual({ sin: ["orden"] });
    almacen.setItem(claveDelRecuerdo("p1"), JSON.stringify({ revision: clave, foto: { ancla: 3, fases: [] }, sin: ["x"] }));
    expect(recuerdoDeLaRevision(almacen, "p1", clave), "una foto sin forma ya no importa").toEqual({ sin: ["x"] });
    almacen.setItem(claveDelRecuerdo("p1"), JSON.stringify({ revision: clave, sin: ["y"] }));
    expect(recuerdoDeLaRevision(almacen, "p1", clave), "sin foto (la de ahora)").toEqual({ sin: ["y"] });
  });

  it("nunca tira: basura guardada, un navegador que no deja leer ni escribir, o sin almacén", () => {
    const clave = claveDeRevision(PROP, "run-1")!;
    const basura = almacenEnMemoria();
    basura.setItem(claveDelRecuerdo("p1"), "{no es json");
    expect(recuerdoDeLaRevision(basura, "p1", clave)).toBeNull();
    const bloqueado: AlmacenDeFotos = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(recuerdoDeLaRevision(bloqueado, "p1", clave)).toBeNull();
    expect(() => recordarRevision(bloqueado, "p1", clave, { sin: [] })).not.toThrow();
    expect(() => olvidarRevision(bloqueado, "p1")).not.toThrow();
    expect(recuerdoDeLaRevision(null, "p1", clave)).toBeNull();
  });
});

/* ⚠ REESCRITA en E4 (2026-09), con esta razón: usaba el formato viejo guardado. Desde E4 lo guardado es un
   v1, y lo que no es un v1 falla cerrado (§9). */
describe("13 · el handoff no pisa una propuesta abierta con algo por decidir", () => {
  it("⭐ con cambios pendientes (del handoff o de las reuniones), se queda la abierta", () => {
    /* La edición que la pone en rojo: que analyze vuelva a proteger solo la de las reuniones — la del
       handoff se reemplazaba a mitad de la revisión y el CSE perdía lo desmarcado. */
    expect(propuestaPorDecidir(guardadaV1(HANDOFF), VIVO)).toBe(true);
    expect(propuestaPorDecidir(guardadaV1(CONTEXTO), VIVO)).toBe(true);
  });

  it("una que ya no tiene nada que decidir no frena: se puede reemplazar sin perder nada", () => {
    expect(propuestaPorDecidir(guardadaV1({ anchorStartDate: null, phases: [A, B, C, D] }), VIVO)).toBe(false);
    const hecho: Vivo = { ...VIVO, fases: VIVO.fases.map((x) => (x.id === "c" ? { ...x, durationWeeks: 4 } : x)) };
    expect(propuestaPorDecidir(guardadaV1({ anchorStartDate: null, phases: [A, B, { ...C, durationWeeks: 4 }, D] }), hecho)).toBe(false);
    expect(propuestaPorDecidir(null, VIVO)).toBe(false);
    // E4: la del modificador (con tareas) no es un v1: esta versión no la sabe leer, y FRENA (falla cerrada).
    expect(propuestaPorDecidir({ phases: [{ ...A, tasks: [] }] }, VIVO)).toBe(true);
  });

  it("un arranque que el CSE fijó a mano después choca, y un choque también se decide (el ⚠ se ve)", () => {
    const conArranque: Vivo = { ...VIVO, ancla: "2026-09-21" };
    expect(
      propuestaPorDecidir(guardadaV1({ anchorStartDate: "2026-10-05T00:00:00.000Z", phases: [A, B, C, D] }), conArranque),
    ).toBe(true);
  });
});

describe("14 · E2b: «Regenerar» de una fase (`soloFase`) y de dónde viene cada propuesta", () => {
  it("⭐ `soloFase` sobrevive a guardarse; ausente por defecto; inválido, se ignora", () => {
    /* La edición que la pone en rojo: no leerlo (la fusión armaría TODO el cronograma sobre un pedido
       de una fase), o leer cualquier cosa. */
    const deUnaFase = borradorVacio({ pedido: "regenerar", corrida: "run-f", soloFase: "c" });
    const guardado: unknown = JSON.parse(JSON.stringify(deUnaFase));
    const leido = leerBorrador(guardado)!;
    expect(leido.soloFase).toBe("c");
    expect(leido).toEqual(deUnaFase);

    // Ausente por defecto: ni `undefined` guardado ni la clave.
    for (const sin of [borradorVacio({ pedido: "regenerar", corrida: "run-f" }), borradorVacio({ pedido: "primera", corrida: "r", soloFase: null })]) {
      expect("soloFase" in sin).toBe(false);
      expect("soloFase" in leerBorrador(JSON.parse(JSON.stringify(sin)))!).toBe(false);
    }
    expect("soloFase" in convertirPropuestaDeFases(CONTEXTO, VIVO)).toBe(false);

    // Un string de 1 a 200 caracteres; lo demás no es una fase.
    expect(leerBorrador({ ...(guardado as object), soloFase: "x".repeat(200) })!.soloFase).toBe("x".repeat(200));
    for (const malo of ["", "x".repeat(201), 7, null, {}, ["c"], true]) {
      const b = leerBorrador({ ...(guardado as object), soloFase: malo })!;
      expect("soloFase" in b, JSON.stringify(malo)?.slice(0, 20)).toBe(false);
    }
  });

  it("⭐ la tabla de `deDondeViene` y `desdeDeLaPropuesta` (una sola clasificación)", () => {
    /* La edición que la pone en rojo: clasificar por `pedido` antes que por `soloFase` («Regenerar» de
       una fase quedaba como «Regenerar todo»), o tratar un v1 sin origen «contexto» como otra cosa que
       el handoff. */
    const v1 = (extra: Record<string, unknown>) => ({
      formato: FORMATO_BORRADOR,
      version: 1,
      origen: "contexto",
      observaciones: [],
      cambios: [],
      pedido: null,
      tareas: null,
      tareasArmadasPara: {},
      ...extra,
    });
    const casos: Array<[string, unknown, string]> = [
      // E4: lo que no es un v1 no se muestra, pero clasificarlo no tira (la auditoría y los carteles).
      ["algo que no es un v1, sin origen", HANDOFF, "desde el handoff"],
      ["algo que no es un v1, de las reuniones", CONTEXTO, "desde el contexto del cronograma"],
      ["un v1 del handoff", v1({ origen: "handoff" }), "desde el handoff"],
      ["un v1 sin origen", v1({ origen: undefined }), "desde el handoff"],
      ["«Generar cronograma»", v1({ pedido: "primera", tareas: { corrida: "r", listas: false } }), "desde «Generar cronograma»"],
      ["«Regenerar todo»", v1({ pedido: "regenerar", tareas: { corrida: "r", listas: false } }), "desde «Regenerar todo»"],
      ["el contexto del cronograma (sin pedido)", v1({}), "desde el contexto del cronograma"],
      [
        "«Regenerar» de una fase, con sus tareas armadas",
        v1({ pedido: "regenerar", soloFase: "b", tareasArmadasPara: { b: { nombre: "Diseño", semanas: 2 } } }),
        "desde «Regenerar» en «Diseño»",
      ],
      ["«Regenerar» de una fase, mientras la IA arma", v1({ pedido: "primera", soloFase: "b" }), "desde «Regenerar» de una fase"],
      ["un `soloFase` inválido no es una fase", v1({ pedido: "regenerar", soloFase: "" }), "desde «Regenerar todo»"],
    ];
    for (const [nombre, json, texto] of casos) {
      expect(desdeDeLaPropuesta(deDondeViene(json)), nombre).toBe(texto);
      // Lo mismo sobre el borrador ya leído que sobre el JSON crudo.
      const leido = leerBorrador(json);
      if (leido) expect(desdeDeLaPropuesta(deDondeViene(leido)), `${nombre} (leído)`).toBe(texto);
    }
    expect(deDondeViene(v1({ soloFase: "b", tareasArmadasPara: { b: { nombre: "Diseño", semanas: 2 } } }))).toEqual({
      de: "regenerar-fase",
      fase: "Diseño",
    });
  });
});
