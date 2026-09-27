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
 *   15. (L2) Mientras se arma la propuesta no hay barra (`modoDeLaPropuesta`), la espera dice «propuesta» y
 *      no la fase del motor, y la llegada no le cambia el Gantt a quien está escribiendo.
 *   16. (L3) UNA numeración (`numeracionDeLaPropuesta`): cabecera y después fase por fase; no se mueve al
 *      marcar, y la huella es la de antes de L3.
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
  claveDeTareaQueCambia,
  claveDeTareaQueSeVa,
  convertirPropuestaDeFases,
  debeDescartarseSolo,
  deDondeViene,
  desdeDeLaPropuesta,
  esBorradorV1,
  esMudanzaSugerida,
  FORMATO_BORRADOR,
  fotoDeTarea,
  fraseDelCierre,
  huellaDeTexto,
  jsonCanonico,
  leerBorrador,
  marcarCambio,
  numeracionDeLaPropuesta,
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
  textoDelBotonDeAplicar,
  type AlmacenDeFotos,
  type Borrador,
  type Cambio,
  type CambioTareaCambia,
  type CambioTareaNueva,
  type CambioTareaSeVa,
  type FaseViva,
  type TareaDelVivo,
  type Vivo,
} from "./borrador";
import {
  anchorAfterDeltas,
  buildPhaseOrder,
  computeProposalDeltas,
  type ProposalLike,
} from "./proposal-deltas";
import { medirPropuesta } from "./magnitud-propuesta";
import { borradorDelFixture, leerFixtureGrande, vivoDelFixture } from "./__fixtures__/propuesta-grande";
import { textoDeLosTotales } from "./vista-de-la-propuesta";

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
    /* ⚠ REESCRITO en L3 (D4), con esta razón: decía «inicio S4 → S7» (base 1, para calzar con el campo
       «inicia S», que sumaba 1). La cabecera del Gantt cuenta desde S0, así que la misma columna se leía S3
       arriba y S4 en la etiqueta. Ahora todo «S» es la semana del proyecto desde 0. */
    expect(proyectar(VIVO, b, []).fases.find((x) => x.id === "c")!.marca).toEqual({
      tono: "cambia",
      etiquetas: ["inicio S3 → S6"],
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

/**
 * L2 (2026-09-26) · Todo se ve cuando termina de armarse. Mientras el paso 2 arma las tareas la barra mostraba
 * la propuesta a medias («Piloto Circle · Sin tareas», números que se corrían al llegar las tareas) y la línea
 * repetía la fase del motor («Analizando sesiones…» con 0 reuniones). Ahora: sin barra hasta que llega entera.
 */
describe("15 · L2: mientras se arma la propuesta no hay barra, y la espera dice «propuesta»", () => {
  const VOSEO = /\b(podés|querés|tenés|decime|decímelo|fijate|mirá|revisá|sabés|elegí|aplicá)\b/i;

  it("⭐ la tabla de `modoDeLaPropuesta`: «armandose» aunque ya traiga cambios de fases", () => {
    /* La edición que la pone en rojo: devolver «barra» con «armando» (la barra volvería a mostrar la propuesta a
       medias), o dejar de mirar si hay borrador. */
    const casos: Array<[string, Parameters<typeof moduloDelBorrador.modoDeLaPropuesta>[0], moduloDelBorrador.ModoDeLaPropuesta]> = [
      ["armando con cambios de fases", { hayBorrador: true, conCambios: true, tareas: "armando" }, "armandose"],
      ["armando, el vacío", { hayBorrador: true, conCambios: false, tareas: "armando" }, "armandose"],
      ["listas con cambios", { hayBorrador: true, conCambios: true, tareas: "listas" }, "barra"],
      ["faltan con cambios (solo fases)", { hayBorrador: true, conCambios: true, tareas: "faltan" }, "barra"],
      ["fallo con cambios (solo fases)", { hayBorrador: true, conCambios: true, tareas: "fallo" }, "barra"],
      ["sin tareas que esperar, con cambios", { hayBorrador: true, conCambios: true, tareas: null }, "barra"],
      ["el vacío que falló", { hayBorrador: true, conCambios: false, tareas: "fallo" }, "nada"],
      ["sin borrador", { hayBorrador: false, conCambios: false, tareas: null }, "nada"],
      ["sin borrador, aunque diga armando", { hayBorrador: false, conCambios: true, tareas: "armando" }, "nada"],
    ];
    for (const [nombre, entrada, esperado] of casos) {
      expect(moduloDelBorrador.modoDeLaPropuesta(entrada), nombre).toBe(esperado);
    }
  });

  it("⭐ la línea de la espera no pinta la fase del motor ni «Sin tareas»; «paso 2 de 2» solo con material", () => {
    /* La edición que la pone en rojo: volver a pintar la fase del motor en «armando» (`fase?.trim() || …`). */
    const { textoDeLaLineaDeTareas, textoDelChipDeEspera } = moduloDelBorrador;
    for (const conMaterial of [true, false]) {
      const texto = textoDeLaLineaDeTareas("armando", "Analizando sesiones…", null, conMaterial)?.texto ?? "";
      expect(texto, `material: ${conMaterial}`).not.toMatch(/Analizando|Sin tareas/);
      expect(texto, `material: ${conMaterial}`).toMatch(/^Armando la propuesta · /);
      expect(texto.includes("paso 2 de 2"), `material: ${conMaterial}`).toBe(conMaterial);
    }
    expect(textoDeLaLineaDeTareas("armando", "Guardando el resultado…", null, true)?.texto).toBe(
      "Armando la propuesta · paso 2 de 2 · puede tardar unos minutos",
    );
    expect(textoDeLaLineaDeTareas("armando", null, null, false)?.texto).toBe("Armando la propuesta · puede tardar unos minutos");
    // «Regenerar» de una fase: la de siempre, sin la fase del motor.
    expect(textoDeLaLineaDeTareas("armando", "Analizando sesiones…", null, true, false, "Diseño")?.texto).toBe(
      "Armando las tareas de «Diseño»… · suele tardar uno o dos minutos",
    );
    expect(textoDelChipDeEspera(false, true)).toBe("Armando la propuesta…");
    expect(textoDelChipDeEspera(false, false, "Diseño")).toBe("Armando las tareas de «Diseño»…");
  });

  it("⭐ la llegada: con el CSE escribiendo, la barra aparece en «antes» y el aviso dice cómo verla", () => {
    /* Las ediciones que la ponen en rojo: pasar a «antes» sin que esté escribiendo (o en cualquier cambio de
       modo), o que el aviso de las tareas listas no cambie cuando está escribiendo. */
    const { pasarAAntesAlLlegar, desenlaceDelSeguimiento, AVISO_LLEGO_LA_PROPUESTA, AVISO_TAREAS_LISTAS, TEXTO_VER_PROPUESTA } =
      moduloDelBorrador;
    const llega = { antes: "armandose", ahora: "barra", escribiendo: true, vista: "propuesta" } as const;
    expect(pasarAAntesAlLlegar(llega)).toBe(true);
    expect(pasarAAntesAlLlegar({ ...llega, escribiendo: false }), "sin escribir, se ve la propuesta").toBe(false);
    expect(pasarAAntesAlLlegar({ ...llega, vista: "antes" }), "ya está en «antes»: alternar la volvería a la propuesta").toBe(false);
    expect(pasarAAntesAlLlegar({ ...llega, antes: "nada" }), "no es una llegada").toBe(false);
    expect(pasarAAntesAlLlegar({ ...llega, antes: "barra" }), "la barra ya estaba").toBe(false);
    expect(pasarAAntesAlLlegar({ ...llega, ahora: "nada" }), "no llegó nada que mostrar").toBe(false);

    const lectura = { hayPropuesta: true, tareas: { estado: "listas" as const, corrida: "r1", motivo: null }, recalculo: null };
    const listas = (escribiendo?: boolean) => desenlaceDelSeguimiento({ corrida: "r1", estado: "DONE", lectura, escribiendo });
    expect(listas()).toEqual({ que: "avisar", ok: true, tono: "exito", texto: AVISO_TAREAS_LISTAS });
    expect(listas(false)).toEqual({ que: "avisar", ok: true, tono: "exito", texto: AVISO_TAREAS_LISTAS });
    expect(listas(true)).toEqual({ que: "avisar", ok: true, tono: "exito", texto: AVISO_LLEGO_LA_PROPUESTA });
    expect(AVISO_LLEGO_LA_PROPUESTA).toBe("Llegó la propuesta: la ves con «Ver la propuesta».");
    expect(AVISO_LLEGO_LA_PROPUESTA, "nombra un botón que no existe").toContain(`«${TEXTO_VER_PROPUESTA}»`);
  });

  it("los textos nuevos, cortos y en tuteo", () => {
    const { TITULO_DE_LA_ESPERA, AVISO_LLEGO_LA_PROPUESTA, textoDeLaLineaDeTareas, textoDelChipDeEspera } = moduloDelBorrador;
    expect(TITULO_DE_LA_ESPERA).toBe("Si editas el cronograma ahora, esos cambios quedan fuera de la propuesta.");
    const textos = [
      TITULO_DE_LA_ESPERA,
      AVISO_LLEGO_LA_PROPUESTA,
      textoDeLaLineaDeTareas("armando", null, null, true)?.texto ?? "",
      textoDeLaLineaDeTareas("armando", null, null, false)?.texto ?? "",
      textoDelChipDeEspera(false, true),
    ];
    for (const t of textos) {
      expect(t).not.toMatch(VOSEO);
      expect(t.length).toBeLessThan(90);
    }
  });
});

/**
 * L3 (D3) · Una sola numeración. Los números de la propuesta van a vivir en el Gantt (una casilla por
 * cambio de fase y una por grupo de tareas), así que se numera como se lee el Gantt: la cabecera (arranque,
 * orden) y después fase por fase, en el orden COMPLETO de la propuesta (su orden y todas sus fases nuevas).
 * La usan el plan (los choques), `resumir`, la barra y el chat. `ItemDelPlan.numero` NO cambia: la huella
 * es la de antes de L3 y una pestaña abierta durante el deploy sigue aplicando.
 */
describe("16 · L3: una sola numeración, la del Gantt", () => {
  const t = (id: string, title: string, weekIndex: number): TareaDelVivo => ({
    id,
    title,
    weekIndex,
    notes: null,
    party: "SMARTEAM",
    type: "TASK",
    status: "PENDING",
    source: "AGENT",
    inicioFijado: null,
    finFijado: null,
  });
  const B1 = t("b1", "Mapear procesos", 0);
  const VIVO_T: Vivo = {
    ancla: "2026-05-19",
    fases: [
      { ...A, tareas: [t("a1", "Reunión de arranque", 0)], status: "PENDING" },
      { ...B, tareas: [B1], status: "PENDING" },
      { ...C, tareas: [t("c1", "Probar flujos", 1)], status: "PENDING" },
      { ...D, tareas: [], status: "PENDING" },
    ],
  };
  const contenido = (title: string, weekIndex: number) => ({
    title,
    weekIndex,
    notes: null,
    party: "SMARTEAM" as const,
    type: "TASK" as const,
    needsValidation: false,
    motivoPorValidar: null,
    fuga: null,
  });
  /* A propósito en DESORDEN: el número sale de la fase y del impacto del campo, no del orden del borrador. */
  const CAMBIOS: Cambio[] = [
    { tipo: "tarea-nueva", clave: "t:c-1", fase: "c", tarea: contenido("Pruebas de aceptación", 2) },
    { tipo: "fase-cambia", clave: "fase:b:name", faseId: "b", fase: "Diseño", campo: "name", desde: "Diseño", a: "Diseño funcional" },
    { tipo: "ancla", clave: "ancla", desde: "2026-05-19", a: "2026-06-02" },
    { tipo: "fase-cambia", clave: "fase:c:notes", faseId: "c", fase: "Pruebas", campo: "notes", desde: null, a: "más pruebas" },
    { tipo: "orden", clave: "orden", desde: ["a", "b", "c", "d"], a: ["a", "c", "b", "d"] },
    { tipo: "fase-cambia", clave: "fase:c:durationWeeks", faseId: "c", fase: "Pruebas", campo: "durationWeeks", desde: 3, a: 4 },
    {
      tipo: "fase-nueva",
      clave: "n:piloto",
      fase: { name: "Piloto", durationWeeks: 2, startWeek: null, sessionCount: null, notes: null, activityType: null },
      despuesDe: "b",
    },
    { tipo: "tarea-se-va", clave: claveDeTareaQueSeVa("b1"), tareaId: "b1", faseId: "b", desde: fotoDeTarea(B1) },
    { tipo: "tarea-nueva", clave: "t:p-1", fase: "n:piloto", tarea: contenido("Piloto con un equipo", 0) },
  ];
  const BORRADOR_L3: Borrador = {
    formato: FORMATO_BORRADOR,
    version: 1,
    origen: "contexto",
    observaciones: [],
    cambios: CAMBIOS,
    pedido: "regenerar",
    tareas: { corrida: "r-paso2", listas: true },
    tareasArmadasPara: {
      b: { nombre: "Diseño funcional", semanas: 2 },
      c: { nombre: "Pruebas", semanas: 4 },
      "n:piloto": { nombre: "Piloto", semanas: 2 },
    },
  };
  const unidades = (u: ReadonlyArray<moduloDelBorrador.UnidadNumerada>) =>
    u.map((x) => [x.numero, x.tipo, x.tipo === "cambio" ? x.clave : x.fase]);
  const ESPERADO = [
    [1, "cambio", "ancla"],
    [2, "cambio", "orden"],
    // «Pruebas» va segunda con el orden propuesto: su duración, su nota (lo que mueve fechas primero) y su grupo.
    [3, "cambio", "fase:c:durationWeeks"],
    [4, "cambio", "fase:c:notes"],
    [5, "grupo", "c"],
    [6, "cambio", "fase:b:name"],
    [7, "grupo", "b"],
    // La fase nueva va después de «Diseño»: su cambio y su grupo.
    [8, "cambio", "n:piloto"],
    [9, "grupo", "n:piloto"],
  ];

  it("⭐ la cabecera y después fase por fase: la fase nueva o la que se va, sus campos por impacto y al final su grupo", () => {
    /* La edición que la pone en rojo: volver a numerar en el orden del borrador (la estructura 1..k y los
       grupos después, `numerosEnLaBarra`), o numerar los campos sin `CAMPOS_POR_IMPACTO`. */
    const n = moduloDelBorrador.numeracionDeLaPropuesta(VIVO_T, CAMBIOS);
    expect(unidades(n.orden)).toEqual(ESPERADO);
    expect(n.porClave.get("t:c-1"), "una tarea lleva el número de su grupo").toBe(5);
    expect(n.porClave.get(claveDeTareaQueSeVa("b1"))).toBe(7);
    expect(n.porClave.get("t:p-1")).toBe(9);
    const r = resumir(VIVO_T, BORRADOR_L3, [], { tareas: "listas" });
    expect(unidades(r.indice), "el índice de `resumir` no es la numeración").toEqual(ESPERADO);
    for (const it of r.items) expect(it.numero, it.clave).toBe(n.porClave.get(it.clave));
    for (const g of r.grupos) expect(g.numero, g.fase).toBe(n.porClave.get(g.tareas[0].clave));
  });

  it("⛔ marcar o desmarcar no cambia ningún número", () => {
    /* La edición que la pone en rojo: numerar con el estado (lo que aplica, o sin lo desmarcado): desmarcar el
       orden correría a «Pruebas» detrás de «Diseño», y desmarcar la fase nueva le sacaría su número. */
    const numeros = (sin: string[]) => {
      const r = resumir(VIVO_T, BORRADOR_L3, sin, { tareas: "listas" });
      return {
        indice: unidades(r.indice),
        items: r.items.map((it) => [it.clave, it.numero]),
        grupos: r.grupos.map((g) => [g.fase, g.numero]),
      };
    };
    const todo = numeros([]);
    const todas = CAMBIOS.map((c) => c.clave);
    for (const sin of [["orden"], ["n:piloto"], ["ancla", "fase:c:durationWeeks", "t:c-1"], todas]) {
      expect(numeros(sin), `sin ${sin.join(", ")}`).toEqual(todo);
    }
  });

  it("⛔ `ItemDelPlan.numero` y la huella son los de antes de L3 (una pestaña abierta durante el deploy sigue aplicando)", () => {
    /* La edición que la pone en rojo: pasarle la numeración nueva a `ItemDelPlan.numero` (la huella la lleva, y
       el servidor rechazaría el plan que vio la pantalla vieja). El valor se calculó con el código de antes de
       L3 (eb42ab0c + L1 + L2) sobre este mismo borrador. */
    const plan = planDeAplicacion(VIVO_T, BORRADOR_L3, [], { tareas: "listas" });
    expect(plan.items.map((it) => it.numero)).toEqual(CAMBIOS.map((_, i) => i + 1));
    expect(plan.huella).toBe(HUELLA_ANTES_DE_L3.todo);
    expect(planDeAplicacion(VIVO_T, BORRADOR_L3, ["orden", "t:p-1"], { tareas: "listas" }).huella).toBe(
      HUELLA_ANTES_DE_L3.sinOrdenNiPiloto,
    );
  });

  it("lo que no tiene fase en la propuesta va al final, en el orden del borrador", () => {
    /* Un campo de una fase que ya no está y un grupo de una fase que no se conoce: se numeran igual (el chat
       puede nombrarlos), después de todo lo demás. */
    const sinPruebas: Vivo = { ...VIVO_T, fases: VIVO_T.fases.filter((x) => x.id !== "c") };
    const n = moduloDelBorrador.numeracionDeLaPropuesta(sinPruebas, CAMBIOS);
    expect(unidades(n.orden).slice(-3)).toEqual([
      [7, "grupo", "c"],
      [8, "cambio", "fase:c:notes"],
      [9, "cambio", "fase:c:durationWeeks"],
    ]);
    expect(n.orden.filter((u) => u.tipo === "cambio" && u.clave.startsWith("fase:c:")).every((u) => u.fase === null)).toBe(true);
    expect(new Set(n.orden.map((u) => u.numero)).size, "un número repetido").toBe(n.orden.length);
  });
});

/** Calculadas con el código de antes de L3 (19453cf3, `planDeAplicacion` sobre `BORRADOR_L3` de §16). */
const HUELLA_ANTES_DE_L3 = { todo: "19eb2647a3f69f", sinOrdenNiPiloto: "1e179fd64f7812" };

/**
 * 17 · L7 (spec §8.2): LA MUDANZA QUE SUGIERE LA IA. Una tarea HECHA que parece de otra fase (en la propuesta grande,
 * las 5 hechas de «Fase A», que la IA quiere mudar a «Fase B») viaja como `tarea-cambia` con `sugerida: "otra-fase"`:
 * sobrevive a guardarse, se ve y se numera en su fase de ORIGEN (el número no depende de la marca), y nace sin marcar
 * sin que eso cuente como algo que el CSE desmarcó.
 */
describe("17 · L7: la mudanza que sugiere la IA (una hecha en la fase equivocada)", () => {
  const FIX = leerFixtureGrande();
  const VIVO_G = vivoDelFixture(FIX);
  const B_G = borradorDelFixture(FIX);
  const LISTAS = { tareas: "listas" as const };
  const ORIGEN = "f02";
  const DESTINO = "f03";
  const HECHAS = ["t019", "t020", "t024", "t025", "t026"];
  const sugerida = (id: string): CambioTareaCambia => {
    const viva = VIVO_G.fases.find((x) => x.id === ORIGEN)!.tareas!.find((t) => t.id === id)!;
    return {
      tipo: "tarea-cambia",
      clave: claveDeTareaQueCambia(id),
      tareaId: id,
      faseId: ORIGEN,
      desde: fotoDeTarea(viva),
      a: { fase: DESTINO },
      motivo: "Parece de «Fase B»",
      sugerida: "otra-fase",
    };
  };
  const CON_SUGERIDAS: Borrador = { ...B_G, cambios: [...B_G.cambios, ...HECHAS.map(sugerida)] };
  const CLAVES = HECHAS.map((id) => claveDeTareaQueCambia(id));
  const numeroDelGrupo = (cambios: readonly Cambio[], fase: string) => {
    const u = numeracionDeLaPropuesta(VIVO_G, cambios).orden.find((x) => x.tipo === "grupo" && x.fase === fase);
    return u?.numero ?? null;
  };

  it("⭐ ida y vuelta: `leerBorrador` conserva `sugerida`; la huella no cambia por la marca; su grupo y su número son los del ORIGEN", () => {
    /* La edición que la pone en rojo: no leerla en `leerCambio` (una mudanza sugerida guardada volvía como un cambio
       cualquiera de la IA: agrupada en su DESTINO, contada en los totales y heredable por el chat). */
    const leido = leerBorrador(JSON.parse(JSON.stringify(CON_SUGERIDAS)))!;
    expect(leido.cambios.filter(esMudanzaSugerida).map((c) => c.tareaId), "se perdió la marca al leer").toEqual(HECHAS);
    // La huella no mira la marca: una pestaña de antes de L7 aplica lo mismo.
    const sinMarca: Borrador = {
      ...leido,
      cambios: leido.cambios.map((c) => {
        if (!esMudanzaSugerida(c)) return c;
        const { sugerida: _s, ...resto } = c;
        void _s;
        return resto;
      }),
    };
    expect(planDeAplicacion(VIVO_G, leido, CLAVES).huella).toBe(planDeAplicacion(VIVO_G, sinMarca, CLAVES).huella);
    expect(planDeAplicacion(VIVO_G, leido, []).huella).toBe(planDeAplicacion(VIVO_G, sinMarca, []).huella);
    // Su grupo es el de su ORIGEN, con el número que ese grupo ya tenía, y ninguna unidad nueva.
    const antes = numeracionDeLaPropuesta(VIVO_G, B_G.cambios);
    const n = numeracionDeLaPropuesta(VIVO_G, leido.cambios);
    expect(n.orden.length, "la sugerida abrió un número nuevo (el grupo del destino)").toBe(antes.orden.length);
    for (const k of CLAVES) expect(n.porClave.get(k), k).toBe(numeroDelGrupo(B_G.cambios, ORIGEN));
    const r = resumir(VIVO_G, leido, CLAVES, LISTAS);
    const grupo = r.grupos.find((g) => g.fase === ORIGEN)!;
    expect(grupo.tareas.filter((t) => t.sugerida).map((t) => [t.clave, t.signo, t.cambio])).toEqual(
      CLAVES.map((k) => [k, "?", "¿es de «Fase B»?"]),
    );
    expect(grupo.sugeridas).toBe(5);
    expect(grupo.cambian, "las sugeridas no son «cambian»").toBe(resumir(VIVO_G, B_G, [], LISTAS).grupos.find((g) => g.fase === ORIGEN)!.cambian);
    expect(r.grupos.find((g) => g.fase === DESTINO)?.tareas.some((t) => t.sugerida) ?? false, "se agrupó en el destino").toBe(false);
    // Marcar una no le cambia el número a nada.
    const marcada = resumir(VIVO_G, leido, CLAVES.slice(1), LISTAS);
    expect(marcada.indice.map((u) => u.numero)).toEqual(r.indice.map((u) => u.numero));
    expect(marcada.grupos.find((g) => g.fase === ORIGEN)!.numero).toBe(grupo.numero);
  });

  it("⭐ los totales: con 5 sugeridas sin marcar, «Aplicar todo» y «… · 5 mudanzas sugeridas sin marcar»; marcar una suma 1 a los dos lados", () => {
    /* La edición que la pone en rojo: contarlas en `aplicables` (una propuesta recién abierta decía «Aplicar 132 de
       137», como si el CSE hubiera desmarcado 5). */
    const sinSugeridas = resumir(VIVO_G, B_G, [], LISTAS);
    expect(sinSugeridas.marcadas).toBe(132);
    const r = resumir(VIVO_G, CON_SUGERIDAS, CLAVES, LISTAS);
    expect(r.sugeridasSinMarcar).toBe(5);
    expect(r.marcadas).toBe(132);
    expect(textoDelBotonDeAplicar(r)).toBe("Aplicar todo");
    expect(textoDeLosTotales(r)).toBe("Aplicas 132 de 132 cambios · 5 mudanzas sugeridas sin marcar");
    const una = resumir(VIVO_G, CON_SUGERIDAS, CLAVES.slice(1), LISTAS);
    expect(una.sugeridasSinMarcar).toBe(4);
    expect(textoDelBotonDeAplicar(una)).toBe("Aplicar todo");
    expect(textoDeLosTotales(una)).toBe("Aplicas 133 de 133 cambios · 4 mudanzas sugeridas sin marcar");
    expect(una.tareas.sugeridas, "la marcada no se cuenta como hecha que se muda").toBe(1);
    // Todas marcadas: nada que decir de las sugeridas.
    const todas = resumir(VIVO_G, CON_SUGERIDAS, [], LISTAS);
    expect(textoDeLosTotales(todas)).toBe("Aplicas 137 de 137 cambios");
    // Lo que el CSE sí desmarca sigue contando como desmarcado.
    const otra = B_G.cambios.find((c) => c.tipo === "tarea-nueva")!.clave;
    expect(textoDelBotonDeAplicar(resumir(VIVO_G, CON_SUGERIDAS, [...CLAVES, otra], LISTAS))).toBe("Aplicar 131 de 132");
  });
});

/**
 * 18 · M2 P2c (spec del replanteo §3.4, 2026-09-27): LO QUE DECIDE EL SISTEMA Y LOS HITOS. El kickoff que sobra sale como
 * `tarea-se-va` con `delSistema: "hito"` y el que faltaba entra como `tarea-nueva` con `delSistema` y `tarea.hito`
 * (R15, tareas-del-detalle.ts). Guardados, se tienen que leer igual: la fusión siguiente reescribe `cambios` desde lo
 * leído, aplicar escribe la marca `hito:kickoff` con `tarea.hito`, y la barra no los pinta como de la IA.
 */
describe("18 · M2: `hito` y `delSistema` sobreviven a guardarse, y la huella no los mira", () => {
  const FIX = leerFixtureGrande();
  const VIVO_G = vivoDelFixture(FIX);
  const B_G = borradorDelFixture(FIX);
  const LISTAS = { tareas: "listas" as const };
  const SE_VA = B_G.cambios.find((c): c is CambioTareaSeVa => c.tipo === "tarea-se-va")!;
  const NUEVA = B_G.cambios.find((c): c is CambioTareaNueva => c.tipo === "tarea-nueva")!;
  const MOTIVO_SE_VA = "Ya hay un kickoff hecho: «Sesión de kickoff: equipo, roles y accesos».";
  const MOTIVO_NUEVA = "Faltaba el kickoff: lo agrega el sistema.";
  const CON_HITOS: Borrador = {
    ...B_G,
    cambios: B_G.cambios.map((c): Cambio => {
      if (c.clave === SE_VA.clave) return { ...SE_VA, motivo: MOTIVO_SE_VA, delSistema: "hito" };
      if (c.clave === NUEVA.clave) return { ...NUEVA, motivo: MOTIVO_NUEVA, delSistema: "hito", tarea: { ...NUEVA.tarea, hito: ["kickoff"] } };
      return c;
    }),
  };
  const guardado = (b: Borrador) => JSON.parse(JSON.stringify(b)) as Record<string, unknown> & { cambios: Array<Record<string, unknown>> };
  const delLeido = <T extends Cambio>(b: Borrador, clave: string) => b.cambios.find((c) => c.clave === clave) as T | undefined;

  it("⭐ ida y vuelta: `delSistema` (en la que se va y en la nueva) y `tarea.hito` se leen, y una segunda vuelta da lo mismo", () => {
    /* La edición que la pone en rojo: no leerlos en `leerCambio` / `leerContenidoDeTarea` (la fusión siguiente los borraba:
       el kickoff del sistema se pintaba como de la IA y aplicarlo no dejaba la marca). */
    const leido = leerBorrador(guardado(CON_HITOS))!;
    expect(leido.desconocidos ?? 0).toBe(0);
    const seVa = delLeido<CambioTareaSeVa>(leido, SE_VA.clave)!;
    expect([seVa.delSistema, seVa.motivo]).toEqual(["hito", MOTIVO_SE_VA]);
    const nueva = delLeido<CambioTareaNueva>(leido, NUEVA.clave)!;
    expect([nueva.delSistema, nueva.motivo, nueva.tarea.hito]).toEqual(["hito", MOTIVO_NUEVA, ["kickoff"]]);
    expect(leerBorrador(JSON.parse(JSON.stringify(leido)))!.cambios, "una segunda vuelta perdió algo").toEqual(leido.cambios);
    // «Sesión de cierre y entrega del proyecto» es los dos hitos a la vez: se leen los dos, en su orden.
    const doble = guardado(CON_HITOS);
    (doble.cambios.find((c) => c.clave === NUEVA.clave)!.tarea as Record<string, unknown>).hito = ["cierre", "entrega"];
    expect(delLeido<CambioTareaNueva>(leerBorrador(doble)!, NUEVA.clave)!.tarea.hito).toEqual(["cierre", "entrega"]);
    // Lo que no lo trae, no lo inventa.
    expect(delLeido<CambioTareaNueva>(leerBorrador(guardado(B_G))!, NUEVA.clave)).not.toHaveProperty("delSistema");
    expect(delLeido<CambioTareaNueva>(leerBorrador(guardado(B_G))!, NUEVA.clave)!.tarea).not.toHaveProperty("hito");
  });

  it("⛔ un `hito` mal formado se ignora y la tarea sigue valiendo; un `delSistema` que no conoce, también", () => {
    /* La edición que la pone en rojo: invalidar la tarea por su `hito` (un JSON raro dejaba la propuesta con un cambio
       desconocido, que no se aplica a medias: se trababa entera). */
    for (const malo of [["kickoff", "kickoff"], ["otro"], "kickoff", [], [1], null, { kickoff: true }, ["kickoff", "cierre", "entrega", "kickoff"]]) {
      const g = guardado(CON_HITOS);
      (g.cambios.find((c) => c.clave === NUEVA.clave)!.tarea as Record<string, unknown>).hito = malo;
      const leido = leerBorrador(g)!;
      expect(leido.desconocidos ?? 0, JSON.stringify(malo)).toBe(0);
      const nueva = delLeido<CambioTareaNueva>(leido, NUEVA.clave);
      expect(nueva, `${JSON.stringify(malo)} invalidó la tarea`).toBeDefined();
      expect(nueva!.tarea, JSON.stringify(malo)).not.toHaveProperty("hito");
      expect(nueva!.tarea.title).toBe(NUEVA.tarea.title);
    }
    const g = guardado(CON_HITOS);
    g.cambios.find((c) => c.clave === SE_VA.clave)!.delSistema = "otro";
    const leido = leerBorrador(g)!;
    expect(leido.desconocidos ?? 0).toBe(0);
    expect(delLeido<CambioTareaSeVa>(leido, SE_VA.clave)).not.toHaveProperty("delSistema");
  });

  it("⭐ la huella no mira `hito` ni `delSistema`: con ellos o sin ellos, la misma (una pestaña de antes sigue aplicando)", () => {
    /* La edición que la pone en rojo: meter `hito` (o `delSistema`) en `destinoDe`: la huella de todo borrador con un
       kickoff cambiaría y una pestaña abierta durante el deploy chocaría al aplicar. */
    const leido = leerBorrador(guardado(CON_HITOS))!;
    expect(planDeAplicacion(VIVO_G, leido, [], LISTAS).huella).toBe(planDeAplicacion(VIVO_G, B_G, [], LISTAS).huella);
    expect(planDeAplicacion(VIVO_G, leido, [NUEVA.clave], LISTAS).huella).toBe(planDeAplicacion(VIVO_G, B_G, [NUEVA.clave], LISTAS).huella);
  });

  it("⭐ la barra lleva lo que decidió el sistema, con su motivo entero (y solo eso)", () => {
    /* La edición que la pone en rojo: no copiarlo en `gruposDeTareas` (la vista no tendría con qué pintar su chip). */
    const items = resumir(VIVO_G, leerBorrador(guardado(CON_HITOS))!, [], LISTAS).grupos.flatMap((g) => g.tareas);
    expect(items.find((t) => t.clave === SE_VA.clave)?.delSistema).toEqual({ tipo: "hito", texto: MOTIVO_SE_VA });
    expect(items.find((t) => t.clave === NUEVA.clave)?.delSistema).toEqual({ tipo: "hito", texto: MOTIVO_NUEVA });
    expect(items.filter((t) => t.delSistema)).toHaveLength(2);
  });
});
