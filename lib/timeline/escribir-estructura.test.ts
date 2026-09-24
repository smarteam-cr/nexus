/**
 * lib/timeline/escribir-estructura.test.ts — aplicar el borrador con un `tx` FALSO: el orden de las
 * escrituras, y que lo escrito sea lo que la pantalla mostró.
 *
 * Correr: `npx vitest run lib/timeline/escribir-estructura.test.ts --project unit`.
 *
 * El `tx` falso es una base en memoria que anota cada llamada. No reemplaza al *.int.test.ts (que
 * corre contra Postgres): prueba lo que ese no ve barato — el ORDEN (token primero; nada de
 * estructura si la huella no coincide) y que el escritor no toque filas que no cambian.
 */
import { describe, expect, it } from "vitest";
import {
  aplicarBorradorEnTx,
  ErrorAlAplicar,
  MENSAJE_PLAN_CAMBIO,
  type FaseEnLaBase,
  type TxDeEstructura,
} from "./escribir-estructura";
import { FORMATO_BORRADOR, leerBorrador, planDeAplicacion, proyectar, type Vivo } from "./borrador";
import type { ProposalLike } from "./proposal-deltas";

interface Tarea {
  id: string;
  phaseId: string;
  weekIndex: number;
}
interface Estado {
  ancla: string | null;
  fases: FaseEnLaBase[];
  tareas: Tarea[];
  propuesta: unknown;
  token: string | null;
  editado: Date | null;
}

const fase = (id: string, name: string, order: number, durationWeeks: number): FaseEnLaBase => ({
  id,
  name,
  order,
  durationWeeks,
  startWeek: null,
  sessionCount: null,
  notes: null,
  activityType: null,
});

/** Una base en memoria con la forma que el escritor le pide a Prisma. Anota cada llamada. */
function baseFalsa(inicial: Omit<Estado, "editado">) {
  const estado: Estado = JSON.parse(JSON.stringify({ ...inicial, editado: null }));
  const llamadas: string[] = [];
  const wheres: unknown[] = [];
  let secuencia = 0;
  const tx = {
    projectTimeline: {
      updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        llamadas.push("token");
        wheres.push(args.where);
        const w = args.where;
        const cond = w.pendingProposal as { path?: string[]; equals?: unknown };
        const version = (estado.propuesta as { version?: unknown } | null)?.version;
        const coincide =
          estado.propuesta !== null &&
          w.pendingProposalRunId === estado.token &&
          (!cond.path || version === cond.equals);
        if (!coincide) return { count: 0 };
        estado.propuesta = null;
        estado.token = null;
        return { count: 1 };
      },
      findUnique: async () => {
        llamadas.push("leer");
        return {
          anchorStartDate: estado.ancla ? new Date(estado.ancla) : null,
          phases: [...estado.fases].sort((a, b) => a.order - b.order).map((f) => ({ ...f })),
        };
      },
      update: async (args: { data: { anchorStartDate?: Date; lastEditedByHuman?: Date } }) => {
        if (args.data.anchorStartDate) {
          llamadas.push("ancla");
          estado.ancla = args.data.anchorStartDate.toISOString().slice(0, 10);
        }
        if (args.data.lastEditedByHuman) {
          llamadas.push("editado");
          estado.editado = args.data.lastEditedByHuman;
        }
        return {};
      },
    },
    timelinePhase: {
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        const soloOrden = Object.keys(args.data).length === 1 && "order" in args.data;
        llamadas.push(`${soloOrden ? "orden" : "fase"}:${args.where.id}`);
        const f = estado.fases.find((x) => x.id === args.where.id)!;
        Object.assign(f, args.data);
        return {};
      },
      create: async (args: { data: Record<string, unknown> }) => {
        const d = args.data;
        llamadas.push(`crear:${String(d.name)}`);
        const id = `nueva-${++secuencia}`;
        estado.fases.push({
          id,
          name: String(d.name),
          order: Number(d.order),
          durationWeeks: Number(d.durationWeeks),
          startWeek: (d.startWeek as number | null) ?? null,
          sessionCount: (d.sessionCount as number | null) ?? null,
          notes: (d.notes as string | null) ?? null,
          activityType: (d.activityType as string | null) ?? null,
        });
        return { id };
      },
    },
    timelineTask: {
      updateMany: async (args: { where: { phaseId: string; weekIndex: { gte: number } }; data: { weekIndex: number } }) => {
        llamadas.push(`tareas:${args.where.phaseId}`);
        let count = 0;
        for (const t of estado.tareas) {
          if (t.phaseId === args.where.phaseId && t.weekIndex >= args.where.weekIndex.gte) {
            t.weekIndex = args.data.weekIndex;
            count++;
          }
        }
        return { count };
      },
    },
  };
  return { tx: tx as unknown as TxDeEstructura, estado, llamadas, wheres };
}

const FASES = [fase("a", "Kick-off", 0, 1), fase("b", "Diseño", 1, 2), fase("c", "Pruebas", 2, 3), fase("d", "Cierre", 3, 1)];
const TAREAS: Tarea[] = [
  { id: "t1", phaseId: "c", weekIndex: 0 },
  { id: "t2", phaseId: "c", weekIndex: 2 },
  { id: "t3", phaseId: "b", weekIndex: 1 },
];
const vivoDe = (fases: FaseEnLaBase[], ancla: string | null): Vivo => ({
  ancla,
  fases: [...fases].sort((x, y) => x.order - y.order).map(({ order: _o, ...f }) => { void _o; return f; }),
});

/** Handoff: arranque, renombre, acorta Pruebas (una tarea queda afuera), fase nueva y reorden. */
const PROPUESTA: ProposalLike = {
  anchorStartDate: "2026-10-05T00:00:00.000Z",
  phases: [
    { ...FASES[0] },
    { ...FASES[1], name: "Diseño funcional" },
    { name: "Piloto", durationWeeks: 2, startWeek: null, sessionCount: 1, notes: null },
    { ...FASES[3] },
    { ...FASES[2], durationWeeks: 2 },
  ].map((p) => {
    const { order: _o, ...sinOrden } = p as typeof p & { order?: number };
    void _o;
    return sinOrden;
  }),
};

/** Lo que haría la pantalla: convertir contra su foto, planear y mandar la huella. */
function pedidoDeLaPantalla(vivoPantalla: Vivo, foto: Vivo, sin: string[] = []) {
  const borrador = leerBorrador(PROPUESTA, foto)!;
  return { huella: planDeAplicacion(vivoPantalla, borrador, sin).huella, borrador };
}

describe("aplicar el borrador: el orden de las escrituras", () => {
  it("⭐ token primero, lo vivo después, y la estructura en su orden: arranque → campos (+tareas) → nuevas/orden → editado", async () => {
    /* La edición que la pone en rojo: leer y planear ANTES de la escritura condicional del token, o
       escribir la estructura en otro orden (insertar y reordenar por separado se pisan). */
    const db = baseFalsa({ ancla: null, fases: FASES, tareas: TAREAS, propuesta: PROPUESTA, token: "run-1" });
    const vivo = vivoDe(FASES, null);
    const { huella, borrador } = pedidoDeLaPantalla(vivo, vivo);
    const r = await aplicarBorradorEnTx(db.tx, {
      timelineId: "tl",
      token: "run-1",
      guardado: PROPUESTA,
      foto: vivo,
      sin: [],
      huella,
      ahora: new Date("2026-09-24T12:00:00Z"),
    });
    expect(db.llamadas).toEqual([
      "token",
      "leer",
      "ancla",
      "fase:b",
      "fase:c",
      "tareas:c",
      "crear:Piloto",
      "orden:c",
      "editado",
    ]);
    // Lo escrito es EXACTAMENTE lo que la vista «Ver la propuesta» mostraba.
    const mostrado = proyectar(vivo, borrador, []);
    const escrito = [...db.estado.fases].sort((x, y) => x.order - y.order);
    expect(escrito.map((f) => [f.name, f.durationWeeks, f.order])).toEqual(
      mostrado.fases.map((f, i) => [f.name, f.durationWeeks, i]),
    );
    expect(db.estado.ancla).toBe("2026-10-05");
    // La tarea que quedaba en la semana 3 de Pruebas cayó en la última que existe, y se avisa.
    expect(db.estado.tareas.find((t) => t.id === "t2")!.weekIndex).toBe(1);
    expect(r.avisos).toEqual(["«Pruebas» pasó a 2 semanas y 1 tarea quedaba más allá: se movió a la última semana."]);
    // La propuesta se resolvió entera y el cronograma quedó «sin subir».
    expect(db.estado.propuesta).toBeNull();
    expect(db.estado.editado).not.toBeNull();
    expect(r.plan.marcadas).toBe(r.plan.total);
    expect(r.anclaAntes).toBeNull();
  });

  it("⛔ si la propuesta guardada no es la que el CSE tiene enfrente, NO se lee ni se escribe nada más", async () => {
    const db = baseFalsa({ ancla: null, fases: FASES, tareas: TAREAS, propuesta: PROPUESTA, token: "run-2" });
    const vivo = vivoDe(FASES, null);
    const { huella } = pedidoDeLaPantalla(vivo, vivo);
    const intento = aplicarBorradorEnTx(db.tx, { timelineId: "tl", token: "run-1", guardado: PROPUESTA, foto: vivo, sin: [], huella, ahora: new Date() });
    await expect(intento).rejects.toMatchObject({ codigo: "PROPUESTA_CAMBIO", status: 409 });
    expect(db.llamadas).toEqual(["token"]);
    expect(db.estado.fases).toEqual(FASES);
  });

  it("⛔ si la huella no coincide (otra pestaña cambió algo que la lista mira), no se escribe ESTRUCTURA", async () => {
    /* En la base real el `throw` deshace también el token; acá se mira que después del token y de
       leer no haya ninguna escritura. La edición que la pone en rojo: escribir antes de comparar. */
    const enLaBase = FASES.map((f) => (f.id === "b" ? { ...f, name: "Diseño técnico" } : f)); // otra pestaña renombró
    const db = baseFalsa({ ancla: null, fases: enLaBase, tareas: TAREAS, propuesta: PROPUESTA, token: "run-1" });
    const vivoPantalla = vivoDe(FASES, null); // la pantalla no lo vio
    const { huella } = pedidoDeLaPantalla(vivoPantalla, vivoPantalla);
    const intento = aplicarBorradorEnTx(db.tx, { timelineId: "tl", token: "run-1", guardado: PROPUESTA, foto: vivoPantalla, sin: [], huella, ahora: new Date() });
    await expect(intento).rejects.toThrow(MENSAJE_PLAN_CAMBIO);
    expect(db.llamadas).toEqual(["token", "leer"]);
    expect(db.estado.fases.find((f) => f.id === "b")!.name).toBe("Diseño técnico");
  });

  it("⭐ la foto de la pantalla hace que lo editado a mano después choque y quede intacto", async () => {
    // El CSE, con la propuesta abierta, alargó Pruebas a 6 (el autoguardado ya está en la base).
    const editadas = FASES.map((f) => (f.id === "c" ? { ...f, durationWeeks: 6 } : f));
    const db = baseFalsa({ ancla: null, fases: editadas, tareas: TAREAS, propuesta: PROPUESTA, token: "run-1" });
    const foto = vivoDe(FASES, null); // lo que la pantalla tenía cuando llegó la propuesta
    const vivoPantalla = vivoDe(editadas, null);
    const { huella } = pedidoDeLaPantalla(vivoPantalla, foto);
    const r = await aplicarBorradorEnTx(db.tx, { timelineId: "tl", token: "run-1", guardado: PROPUESTA, foto, sin: [], huella, ahora: new Date() });
    expect(db.estado.fases.find((f) => f.id === "c")!.durationWeeks, "aplicar pisó lo que el CSE editó").toBe(6);
    // Solo choca la duración de Pruebas: el resto de la propuesta se aplica igual.
    expect(r.plan.choques).toBe(1);
    expect(db.llamadas).toEqual(["token", "leer", "ancla", "fase:b", "crear:Piloto", "orden:c", "editado"]);
  });

  it("sin foto, el servidor convierte contra lo vivo (y la pantalla, igual)", async () => {
    const db = baseFalsa({ ancla: null, fases: FASES, tareas: TAREAS, propuesta: PROPUESTA, token: "run-1" });
    const vivo = vivoDe(FASES, null);
    const { huella } = pedidoDeLaPantalla(vivo, vivo);
    await aplicarBorradorEnTx(db.tx, { timelineId: "tl", token: "run-1", guardado: PROPUESTA, foto: null, sin: [], huella, ahora: new Date() });
    expect(db.estado.propuesta).toBeNull();
  });

  it("no toca filas que no cambian: un renombre solo escribe esa fase (ni orden ni arranque)", async () => {
    const soloRenombre: ProposalLike = {
      anchorStartDate: null,
      phases: FASES.map(({ order: _o, ...f }) => { void _o; return f.id === "b" ? { ...f, name: "Diseño funcional" } : f; }),
    };
    const db = baseFalsa({ ancla: null, fases: FASES, tareas: TAREAS, propuesta: soloRenombre, token: null });
    const vivo = vivoDe(FASES, null);
    const huella = planDeAplicacion(vivo, leerBorrador(soloRenombre, vivo)!, []).huella;
    await aplicarBorradorEnTx(db.tx, { timelineId: "tl", token: null, guardado: soloRenombre, foto: vivo, sin: [], huella, ahora: new Date() });
    expect(db.llamadas).toEqual(["token", "leer", "fase:b", "editado"]);
  });

  it("lo desmarcado viaja como `sin` y no se escribe; sin nada marcado, 400 (se descarta, no se aplica)", async () => {
    const vivo = vivoDe(FASES, null);
    const db = baseFalsa({ ancla: null, fases: FASES, tareas: TAREAS, propuesta: PROPUESTA, token: "run-1" });
    const sin = ["nueva:2", "orden", "ancla"];
    const { huella } = pedidoDeLaPantalla(vivo, vivo, sin);
    await aplicarBorradorEnTx(db.tx, { timelineId: "tl", token: "run-1", guardado: PROPUESTA, foto: vivo, sin, huella, ahora: new Date() });
    expect(db.llamadas).toEqual(["token", "leer", "fase:b", "fase:c", "tareas:c", "editado"]);

    const todas = ["ancla", "orden", "fase:b:name", "nueva:2", "fase:c:durationWeeks"];
    const db2 = baseFalsa({ ancla: null, fases: FASES, tareas: TAREAS, propuesta: PROPUESTA, token: "run-1" });
    const h2 = pedidoDeLaPantalla(vivo, vivo, todas).huella;
    await expect(
      aplicarBorradorEnTx(db2.tx, { timelineId: "tl", token: "run-1", guardado: PROPUESTA, foto: vivo, sin: todas, huella: h2, ahora: new Date() }),
    ).rejects.toMatchObject({ codigo: "NADA_QUE_APLICAR", status: 400 });
  });

  it("el formato nuevo se condiciona también a su versión, y un tipo inválido sale como 400 antes de escribir estructura", async () => {
    const v1 = {
      formato: FORMATO_BORRADOR,
      version: 3,
      origen: "handoff",
      observaciones: [],
      cambios: [{ tipo: "fase-cambia", clave: "fase:b:activityType", faseId: "b", fase: "Diseño", campo: "activityType", desde: null, a: "INVENTADO" }],
    };
    const db = baseFalsa({ ancla: null, fases: FASES, tareas: TAREAS, propuesta: v1, token: "run-9" });
    const vivo = vivoDe(FASES, null);
    const huella = planDeAplicacion(vivo, leerBorrador(v1, vivo)!, []).huella;
    const intento = aplicarBorradorEnTx(db.tx, { timelineId: "tl", token: "run-9", guardado: v1, foto: null, sin: [], huella, ahora: new Date() });
    await expect(intento).rejects.toBeInstanceOf(ErrorAlAplicar);
    await expect(
      aplicarBorradorEnTx(
        baseFalsa({ ancla: null, fases: FASES, tareas: TAREAS, propuesta: v1, token: "run-9" }).tx,
        { timelineId: "tl", token: "run-9", guardado: v1, foto: null, sin: [], huella, ahora: new Date() },
      ),
    ).rejects.toMatchObject({ codigo: "VALOR_INVALIDO", status: 400 });
    expect(db.wheres[0]).toMatchObject({ pendingProposalRunId: "run-9", pendingProposal: { path: ["version"], equals: 3 } });
    expect(db.llamadas).toEqual(["token", "leer"]);
  });
});
