/**
 * lib/timeline/escribir-estructura.test.ts — aplicar el borrador con un `tx` FALSO: el orden de las
 * escrituras, y que lo escrito sea lo que la pantalla mostró.
 *
 * Correr: `npx vitest run lib/timeline/escribir-estructura.test.ts --project unit`.
 *
 * El `tx` falso es una base en memoria que anota cada llamada. No reemplaza al *.int.test.ts (que
 * corre contra Postgres): prueba lo que ese no ve barato — el ORDEN (token primero; nada de
 * estructura si la huella no coincide; las tareas DESPUÉS de las fases nuevas), que el escritor no
 * toque filas que no cambian, y cuántas llamadas hace (nunca una por tarea).
 *
 * ⚠ REESCRITO en E2a P2 (2026-09-25), con esta razón: aplicar lee ahora las fases CON sus tareas y
 * escribe las tareas del borrador (`timelineTask.deleteMany` / `createMany`, el cierre de la fase y
 * la invalidación del avance). El `tx` falso suma esas llamadas y la lectura anidada. Las listas de
 * los casos SIN tareas no cambian: una propuesta solo de fases no hace ninguna llamada de tareas, y
 * eso es parte de lo que se protege (casos «estructura sola»).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import {
  aplicarBorradorEnTx,
  ErrorAlAplicar,
  MENSAJE_PLAN_CAMBIO,
  MENSAJE_SIN_PERMISO_TAREAS,
  type FaseEnLaBase,
  type PedidoDeAplicar,
  type TxDeEstructura,
} from "./escribir-estructura";
import { escribirTareas, TareasQueNoCuadran } from "./escribir-tareas";
import {
  BLOQUEO_TAREAS_EN_CURSO,
  borradorBase,
  claveDeTareaQueSeVa,
  FORMATO_BORRADOR,
  fotoDeTarea,
  leerBorrador,
  mensajeDeRecalculoAlAplicar,
  planDeAplicacion,
  proyectar,
  type Borrador,
  type CambioTareaNueva,
  type CambioTareaSeVa,
  type ContenidoDeTareaNueva,
  type EstadoDeLasTareas,
  type TareaDelVivo,
  type Vivo,
} from "./borrador";
import type { ProposalLike } from "./proposal-deltas";

/** Una tarea en la base falsa: las columnas que lee y escribe el aplicar. Fechas fijadas en ISO. */
interface Tarea {
  id: string;
  phaseId: string;
  title: string;
  weekIndex: number;
  order: number;
  notes: string | null;
  party: string | null;
  type: string | null;
  status: string;
  source: string;
  inicio: string | null;
  fin: string | null;
  needsValidation: boolean;
}
type FaseDeLaBase = FaseEnLaBase & { status?: string };
interface Estado {
  ancla: string | null;
  fases: FaseDeLaBase[];
  tareas: Tarea[];
  propuesta: unknown;
  token: string | null;
  editado: Date | null;
  /** El borrador de avance (`pendingProgress`): null = invalidado. */
  avance: unknown;
  /** `detailGeneratedByAgentRunId`. */
  detalle: string | null;
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
const tareaDB = (id: string, phaseId: string, title: string, weekIndex: number, order: number, extra: Partial<Tarea> = {}): Tarea => ({
  id,
  phaseId,
  title,
  weekIndex,
  order,
  notes: null,
  party: "SMARTEAM",
  type: "TASK",
  status: "PENDING",
  source: "AGENT",
  inicio: null,
  fin: null,
  needsValidation: false,
  ...extra,
});

/** Una base en memoria con la forma que el escritor le pide a Prisma. Anota cada llamada. */
function baseFalsa(
  inicial: Omit<Estado, "editado" | "avance" | "detalle">,
  ganchos: { alBorrar?: (estado: Estado) => void } = {},
) {
  const estado: Estado = JSON.parse(
    JSON.stringify({ ...inicial, editado: null, avance: { tasks: [{ id: "t1", done: true }] }, detalle: null }),
  );
  const llamadas: string[] = [];
  const wheres: unknown[] = [];
  const reubicaciones: unknown[] = [];
  const borrados: unknown[] = [];
  const editados: Array<Record<string, unknown>> = [];
  let secuencia = 0;
  const tareasDe = (phaseId: string) =>
    estado.tareas.filter((t) => t.phaseId === phaseId).sort((a, b) => a.weekIndex - b.weekIndex || a.order - b.order);
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
          phases: [...estado.fases]
            .sort((a, b) => a.order - b.order)
            .map(({ status: _s, ...f }) => {
              void _s;
              return {
                ...f,
                tasks: tareasDe(f.id).map((t) => ({
                  id: t.id,
                  title: t.title,
                  weekIndex: t.weekIndex,
                  order: t.order,
                  notes: t.notes,
                  party: t.party,
                  type: t.type,
                  status: t.status,
                  source: t.source,
                  startDateOverride: t.inicio ? new Date(t.inicio) : null,
                  dueDateOverride: t.fin ? new Date(t.fin) : null,
                })),
              };
            }),
        };
      },
      update: async (args: { data: Record<string, unknown> }) => {
        const d = args.data;
        if (d.anchorStartDate instanceof Date) {
          llamadas.push("ancla");
          estado.ancla = d.anchorStartDate.toISOString().slice(0, 10);
        }
        if (d.lastEditedByHuman) {
          llamadas.push("editado");
          editados.push(d);
          estado.editado = d.lastEditedByHuman as Date;
          if ("pendingProgress" in d) estado.avance = d.pendingProgress === Prisma.DbNull ? null : d.pendingProgress;
          if (typeof d.detailGeneratedByAgentRunId === "string") estado.detalle = d.detailGeneratedByAgentRunId;
        }
        return {};
      },
    },
    timelinePhase: {
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        const soloOrden = Object.keys(args.data).length === 1 && "order" in args.data;
        const estadoDeLaFase = "status" in args.data;
        llamadas.push(`${estadoDeLaFase ? "estado" : soloOrden ? "orden" : "fase"}:${args.where.id}`);
        const f = estado.fases.find((x) => x.id === args.where.id)!;
        Object.assign(f, estadoDeLaFase ? { status: args.data.status } : args.data);
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
      findUnique: async (args: { where: { id: string } }) => {
        llamadas.push(`cierre:${args.where.id}`);
        const f = estado.fases.find((x) => x.id === args.where.id);
        if (!f) return null;
        return { status: f.status ?? "PENDING", actualStart: null, tasks: tareasDe(f.id).map((t) => ({ status: t.status })) };
      },
    },
    timelineTask: {
      updateMany: async (args: {
        where: { phaseId: string; weekIndex: { gte: number }; id?: { notIn: string[] } };
        data: { weekIndex: number };
      }) => {
        llamadas.push(`tareas:${args.where.phaseId}`);
        reubicaciones.push(args.where);
        let count = 0;
        for (const t of estado.tareas) {
          if (args.where.id?.notIn.includes(t.id)) continue; // E2a (revisión): las que el aplicar borra no se mueven
          if (t.phaseId === args.where.phaseId && t.weekIndex >= args.where.weekIndex.gte) {
            t.weekIndex = args.data.weekIndex;
            count++;
          }
        }
        return { count };
      },
      deleteMany: async (args: { where: { id: { in: string[] }; status?: string; source?: { not: string } } }) => {
        ganchos.alBorrar?.(estado);
        llamadas.push("tareas-se-van");
        borrados.push(args.where);
        const w = args.where;
        const antes = estado.tareas.length;
        estado.tareas = estado.tareas.filter(
          (t) =>
            !(
              w.id.in.includes(t.id) &&
              (w.status === undefined || t.status === w.status) &&
              (w.source === undefined || t.source !== w.source.not)
            ),
        );
        return { count: antes - estado.tareas.length };
      },
      createMany: async (args: { data: Array<Record<string, unknown>> }) => {
        llamadas.push("tareas-nuevas");
        for (const d of args.data) {
          estado.tareas.push({
            id: `creada-${++secuencia}`,
            phaseId: String(d.phaseId),
            title: String(d.title),
            weekIndex: Number(d.weekIndex),
            order: Number(d.order),
            notes: (d.notes as string | null) ?? null,
            party: (d.party as string | null) ?? null,
            type: (d.type as string | null) ?? null,
            status: String(d.status),
            source: String(d.source),
            inicio: null,
            fin: null,
            needsValidation: d.needsValidation === true,
          });
        }
        return { count: args.data.length };
      },
      // Si alguien vuelve a escribir tarea por tarea, se nota en la cuenta de llamadas (no en un TypeError).
      create: async () => {
        llamadas.push("tarea-creada");
        return { id: `creada-${++secuencia}` };
      },
      delete: async () => {
        llamadas.push("tarea-borrada");
        return {};
      },
    },
  };
  return { tx: tx as unknown as TxDeEstructura, estado, llamadas, wheres, reubicaciones, borrados, editados };
}

const FASES = [fase("a", "Kick-off", 0, 1), fase("b", "Diseño", 1, 2), fase("c", "Pruebas", 2, 3), fase("d", "Cierre", 3, 1)];
const TAREAS: Tarea[] = [
  tareaDB("t1", "c", "Probar flujos", 0, 0),
  tareaDB("t2", "c", "Pruebas con usuarios", 2, 0),
  tareaDB("t3", "b", "Mapear procesos", 1, 0),
];
/** La tarea como la ve la pantalla en el cable (y como la arma el servidor): sin `order`. */
const tareaDelVivo = (t: Tarea): TareaDelVivo => ({
  id: t.id,
  title: t.title,
  weekIndex: t.weekIndex,
  notes: t.notes,
  party: t.party as TareaDelVivo["party"],
  type: t.type as TareaDelVivo["type"],
  status: t.status,
  source: t.source,
  inicioFijado: t.inicio,
  finFijado: t.fin,
});
const vivoDe = (fases: FaseEnLaBase[], ancla: string | null, tareas?: Tarea[]): Vivo => ({
  ancla,
  fases: [...fases]
    .sort((x, y) => x.order - y.order)
    .map(({ order: _o, ...f }) => {
      void _o;
      return tareas
        ? {
            ...f,
            tareas: tareas
              .filter((t) => t.phaseId === f.id)
              .sort((a, b) => a.weekIndex - b.weekIndex || a.order - b.order)
              .map(tareaDelVivo),
          }
        : f;
    }),
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

/** Lo que agrega E2a al pedido: en los casos de solo fases, nada que esperar y permiso de sobra. */
const SIN_TAREAS = { tareas: null, puedeTocarTareas: true, actorEmail: "cse@smarteam.cr" } as const;

// ─────────────────────────────────────────────────────────────────────────────
// ── Un borrador v1 de «Regenerar todo» CON tareas ────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/** El paso 1: las mismas fases que PROPUESTA pero SIN acortar Pruebas (sus tareas se arman con 3 semanas). */
const PROPUESTA_DEL_PASO_1: ProposalLike = {
  anchorStartDate: PROPUESTA.anchorStartDate,
  phases: PROPUESTA.phases.map((f) => ("id" in f && f.id === "c" ? { ...f, durationWeeks: 3 } : f)),
};
const contenido = (title: string, weekIndex: number, extra: Partial<ContenidoDeTareaNueva> = {}): ContenidoDeTareaNueva => ({
  title,
  weekIndex,
  notes: null,
  party: "SMARTEAM",
  type: "TASK",
  needsValidation: false,
  motivoPorValidar: null,
  fuga: null,
  ...extra,
});

/**
 * El v1 que dejaría la fusión del paso 2: la estructura del paso 1, más «Probar flujos» que se va,
 * dos nuevas en Pruebas (una en una semana que no existe: se acota) y una en la fase nueva Piloto.
 */
function v1ConTareas(tareas: Tarea[] = TAREAS, fases: FaseEnLaBase[] = FASES): { v1: Borrador; piloto: string } {
  const vivo = vivoDe(fases, null, tareas);
  const base = borradorBase({ propuesta: PROPUESTA_DEL_PASO_1, vivo, pedido: "regenerar", nuevaClave: () => "a1b2c3d4-0000" });
  const piloto = base.cambios.find((c) => c.tipo === "fase-nueva")!.clave;
  const t1 = tareas.find((t) => t.id === "t1")!;
  const seVa: CambioTareaSeVa = {
    tipo: "tarea-se-va",
    clave: claveDeTareaQueSeVa("t1"),
    tareaId: "t1",
    faseId: "c",
    desde: fotoDeTarea(tareaDelVivo(t1)),
  };
  const nuevas: CambioTareaNueva[] = [
    { tipo: "tarea-nueva", clave: "t:carga", fase: "c", tarea: contenido("Pruebas de carga", 2) },
    { tipo: "tarea-nueva", clave: "t:regresion", fase: "c", tarea: contenido("Pruebas de regresión", 7, { party: "AMBOS" }) },
    {
      tipo: "tarea-nueva",
      clave: "t:piloto",
      fase: piloto,
      tarea: contenido("Piloto con cinco usuarios", 1, { needsValidation: true, motivoPorValidar: "Sin respaldo en las reuniones." }),
    },
  ];
  const v1: Borrador = {
    ...base,
    version: 4,
    cambios: [...base.cambios, seVa, ...nuevas],
    tareas: { corrida: "run-tareas", listas: true },
    tareasArmadasPara: { c: { nombre: "Pruebas", semanas: 3 }, [piloto]: { nombre: "Piloto", semanas: 2 } },
  };
  return { v1: JSON.parse(JSON.stringify(v1)) as Borrador, piloto };
}

/** El pedido que mandaría la pantalla con un v1: su huella contra el vivo CON tareas, como el cable. */
function pedidoConTareas(
  v1: Borrador,
  estado: { fases: FaseEnLaBase[]; tareas: Tarea[] },
  extra: Partial<PedidoDeAplicar> & { tareas?: EstadoDeLasTareas | null } = {},
): PedidoDeAplicar {
  const vivo = vivoDe(estado.fases, null, estado.tareas);
  const sin = extra.sin ?? [];
  const tareas = extra.tareas === undefined ? "listas" : extra.tareas;
  const huella = planDeAplicacion(vivo, leerBorrador(v1, vivo)!, sin, { tareas }).huella;
  return {
    timelineId: "tl",
    token: "run-estructura",
    guardado: v1,
    foto: null,
    sin,
    huella,
    ahora: new Date("2026-09-25T12:00:00Z"),
    tareas,
    puedeTocarTareas: true,
    actorEmail: "cse@smarteam.cr",
    ...extra,
  };
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
      ...SIN_TAREAS,
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
    expect(r.tareasTocadas).toBe(0);
  });

  it("⛔ si la propuesta guardada no es la que el CSE tiene enfrente, NO se lee ni se escribe nada más", async () => {
    const db = baseFalsa({ ancla: null, fases: FASES, tareas: TAREAS, propuesta: PROPUESTA, token: "run-2" });
    const vivo = vivoDe(FASES, null);
    const { huella } = pedidoDeLaPantalla(vivo, vivo);
    const intento = aplicarBorradorEnTx(db.tx, { timelineId: "tl", token: "run-1", guardado: PROPUESTA, foto: vivo, sin: [], huella, ahora: new Date(), ...SIN_TAREAS });
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
    const intento = aplicarBorradorEnTx(db.tx, { timelineId: "tl", token: "run-1", guardado: PROPUESTA, foto: vivoPantalla, sin: [], huella, ahora: new Date(), ...SIN_TAREAS });
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
    const r = await aplicarBorradorEnTx(db.tx, { timelineId: "tl", token: "run-1", guardado: PROPUESTA, foto, sin: [], huella, ahora: new Date(), ...SIN_TAREAS });
    expect(db.estado.fases.find((f) => f.id === "c")!.durationWeeks, "aplicar pisó lo que el CSE editó").toBe(6);
    // Solo choca la duración de Pruebas: el resto de la propuesta se aplica igual.
    expect(r.plan.choques).toBe(1);
    expect(db.llamadas).toEqual(["token", "leer", "ancla", "fase:b", "crear:Piloto", "orden:c", "editado"]);
  });

  it("sin foto, el servidor convierte contra lo vivo (y la pantalla, igual)", async () => {
    const db = baseFalsa({ ancla: null, fases: FASES, tareas: TAREAS, propuesta: PROPUESTA, token: "run-1" });
    const vivo = vivoDe(FASES, null);
    const { huella } = pedidoDeLaPantalla(vivo, vivo);
    await aplicarBorradorEnTx(db.tx, { timelineId: "tl", token: "run-1", guardado: PROPUESTA, foto: null, sin: [], huella, ahora: new Date(), ...SIN_TAREAS });
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
    await aplicarBorradorEnTx(db.tx, { timelineId: "tl", token: null, guardado: soloRenombre, foto: vivo, sin: [], huella, ahora: new Date(), ...SIN_TAREAS });
    expect(db.llamadas).toEqual(["token", "leer", "fase:b", "editado"]);
  });

  it("lo desmarcado viaja como `sin` y no se escribe; sin nada marcado, 400 (se descarta, no se aplica)", async () => {
    const vivo = vivoDe(FASES, null);
    const db = baseFalsa({ ancla: null, fases: FASES, tareas: TAREAS, propuesta: PROPUESTA, token: "run-1" });
    const sin = ["nueva:2", "orden", "ancla"];
    const { huella } = pedidoDeLaPantalla(vivo, vivo, sin);
    await aplicarBorradorEnTx(db.tx, { timelineId: "tl", token: "run-1", guardado: PROPUESTA, foto: vivo, sin, huella, ahora: new Date(), ...SIN_TAREAS });
    expect(db.llamadas).toEqual(["token", "leer", "fase:b", "fase:c", "tareas:c", "editado"]);

    const todas = ["ancla", "orden", "fase:b:name", "nueva:2", "fase:c:durationWeeks"];
    const db2 = baseFalsa({ ancla: null, fases: FASES, tareas: TAREAS, propuesta: PROPUESTA, token: "run-1" });
    const h2 = pedidoDeLaPantalla(vivo, vivo, todas).huella;
    await expect(
      aplicarBorradorEnTx(db2.tx, { timelineId: "tl", token: "run-1", guardado: PROPUESTA, foto: vivo, sin: todas, huella: h2, ahora: new Date(), ...SIN_TAREAS }),
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
    const intento = aplicarBorradorEnTx(db.tx, { timelineId: "tl", token: "run-9", guardado: v1, foto: null, sin: [], huella, ahora: new Date(), ...SIN_TAREAS });
    await expect(intento).rejects.toBeInstanceOf(ErrorAlAplicar);
    await expect(
      aplicarBorradorEnTx(
        baseFalsa({ ancla: null, fases: FASES, tareas: TAREAS, propuesta: v1, token: "run-9" }).tx,
        { timelineId: "tl", token: "run-9", guardado: v1, foto: null, sin: [], huella, ahora: new Date(), ...SIN_TAREAS },
      ),
    ).rejects.toMatchObject({ codigo: "VALOR_INVALIDO", status: 400 });
    expect(db.wheres[0]).toMatchObject({ pendingProposalRunId: "run-9", pendingProposal: { path: ["version"], equals: 3 } });
    expect(db.llamadas).toEqual(["token", "leer"]);
  });

  it("⭐ estructura sola: ni una llamada de tareas, y el borrador de avance NO se invalida", async () => {
    /* Las fases nuevas solas no dejan viejo el avance (igual que E1). La edición que la pone en rojo:
       limpiar `pendingProgress` siempre, o llamar al escritor de tareas con listas vacías. */
    const db = baseFalsa({ ancla: null, fases: FASES, tareas: TAREAS, propuesta: PROPUESTA, token: "run-1" });
    const vivo = vivoDe(FASES, null);
    const { huella } = pedidoDeLaPantalla(vivo, vivo);
    await aplicarBorradorEnTx(db.tx, { timelineId: "tl", token: "run-1", guardado: PROPUESTA, foto: vivo, sin: [], huella, ahora: new Date(), ...SIN_TAREAS });
    expect(db.llamadas.filter((l) => l.startsWith("tareas-") || l.startsWith("cierre:"))).toEqual([]);
    expect(db.editados).toHaveLength(1);
    expect(Object.keys(db.editados[0]), "aplicar solo fases invalidó el avance").toEqual(["lastEditedByHuman"]);
    expect(db.estado.avance).not.toBeNull();
    expect(db.estado.detalle).toBeNull();
  });
});

describe("aplicar el borrador CON tareas (E2a)", () => {
  it("⭐ el orden: token → leer → estructura → las que se van → las nuevas → cierre → editado", async () => {
    /* La edición que la pone en rojo: crear las tareas ANTES que las fases nuevas (una tarea de una
       fase nueva necesita su id real), o borrar después de crear. */
    const { v1, piloto } = v1ConTareas();
    const db = baseFalsa({ ancla: null, fases: FASES, tareas: TAREAS, propuesta: v1, token: "run-estructura" });
    const resultado = await aplicarBorradorEnTx(db.tx, pedidoConTareas(v1, { fases: FASES, tareas: TAREAS })).catch((e: unknown) => e);
    expect(db.llamadas).toEqual([
      "token",
      "leer",
      "ancla",
      "fase:b",
      "crear:Piloto",
      "orden:c",
      "tareas-se-van",
      "tareas-nuevas",
      "cierre:c",
      "editado",
    ]);
    expect(resultado).not.toBeInstanceOf(Error);
    const r = resultado as Awaited<ReturnType<typeof aplicarBorradorEnTx>>;
    expect(r.tareasTocadas).toBe(4);
    expect(r.tareas).toEqual({ creadas: 3, borradas: 1 });
    // «Probar flujos» se fue; las nuevas quedaron al final de su semana, acotadas y con su fase real.
    expect(db.estado.tareas.some((t) => t.id === "t1")).toBe(false);
    const idPiloto = db.estado.fases.find((f) => f.name === "Piloto")!.id;
    const creadas = db.estado.tareas.filter((t) => t.id.startsWith("creada-"));
    expect(creadas.map((t) => [t.phaseId, t.title, t.weekIndex, t.order, t.party, t.status, t.source, t.needsValidation])).toEqual([
      ["c", "Pruebas de carga", 2, 1, "SMARTEAM", "PENDING", "AGENT", false],
      ["c", "Pruebas de regresión", 2, 2, "AMBOS", "PENDING", "AGENT", false],
      [idPiloto, "Piloto con cinco usuarios", 1, 0, "SMARTEAM", "PENDING", "AGENT", true],
    ]);
    expect(piloto.startsWith("n:")).toBe(true);
    // Con tareas tocadas, el avance quedó viejo y la corrida que las armó queda como traza.
    expect(db.estado.avance).toBeNull();
    expect(db.estado.detalle).toBe("run-tareas");
    // Lo que se escribió es la vista «Ver la propuesta».
    const vivo = vivoDe(FASES, null, TAREAS);
    const mostrado = proyectar(vivo, leerBorrador(v1, vivo)!, []);
    const pruebas = mostrado.fases.find((f) => f.name === "Pruebas")!;
    expect(pruebas.tareas.map((t) => t.title).sort()).toEqual(
      db.estado.tareas.filter((t) => t.phaseId === "c").map((t) => t.title).sort(),
    );
  });

  it("⛔ pocas llamadas: 1 deleteMany + 1 createMany + a lo sumo 2 por fase tocada, nunca una por tarea", async () => {
    /* Reemplaza al «Wherex registra el tiempo», que no podía fallar. Wherex ronda las 300 tareas: una
       llamada por tarea contra el pooler remoto es el P2028. La edición que la pone en rojo: crear o
       borrar tarea por tarea. */
    const fases = Array.from({ length: 12 }, (_, i) => fase(`f${i}`, `Fase ${i}`, i, 3));
    const tareas = fases.flatMap((f) =>
      Array.from({ length: 25 }, (_, k) => tareaDB(`${f.id}-t${k}`, f.id, `Tarea ${k} de ${f.name}`, k % 3, Math.floor(k / 3))),
    );
    const cambios = [
      ...tareas.map(
        (t): CambioTareaSeVa => ({
          tipo: "tarea-se-va",
          clave: claveDeTareaQueSeVa(t.id),
          tareaId: t.id,
          faseId: t.phaseId,
          desde: fotoDeTarea(tareaDelVivo(t)),
        }),
      ),
      ...fases.flatMap((f) =>
        Array.from({ length: 25 }, (_, k): CambioTareaNueva => ({
          tipo: "tarea-nueva",
          clave: `t:${f.id}-${k}`,
          fase: f.id,
          tarea: contenido(`Nueva ${k} de ${f.name}`, k % 3),
        })),
      ),
    ];
    const v1: Borrador = {
      formato: FORMATO_BORRADOR,
      version: 1,
      origen: "contexto",
      observaciones: [],
      cambios,
      pedido: "regenerar",
      tareas: { corrida: "run-wherex", listas: true },
      tareasArmadasPara: Object.fromEntries(fases.map((f) => [f.id, { nombre: f.name, semanas: 3 }])),
    };
    const db = baseFalsa({ ancla: null, fases, tareas, propuesta: v1, token: "run-estructura" });
    const r = await aplicarBorradorEnTx(db.tx, pedidoConTareas(v1, { fases, tareas }));
    expect(r.tareas).toEqual({ creadas: 300, borradas: 300 });
    const cuenta = (l: string) => db.llamadas.filter((x) => x === l).length;
    expect(cuenta("tareas-se-van"), "se borra tarea por tarea").toBe(1);
    expect(cuenta("tareas-nuevas"), "se crea tarea por tarea").toBe(1);
    expect(cuenta("tarea-creada") + cuenta("tarea-borrada"), "una llamada por tarea").toBe(0);
    const porFase = db.llamadas.filter((l) => l.startsWith("cierre:") || l.startsWith("estado:"));
    expect(porFase.length, "más de dos llamadas por fase tocada").toBeLessThanOrEqual(2 * fases.length);
    expect(db.llamadas.length).toBeLessThanOrEqual(5 + 2 * fases.length);
  });

  it("⛔ se borra solo lo pendiente y no escrito a mano; si se borra otra cantidad, PLAN_CAMBIO y nada más", async () => {
    /* La segunda red detrás del plan: si entre la lectura y el borrado la tarea arrancó (otra
       transacción), el `where` no la toca y la cuenta no da. La edición que la pone en rojo: sacar
       `status`/`source` del `where`, o dejar de comparar la cuenta. */
    const { v1 } = v1ConTareas();
    const db = baseFalsa(
      { ancla: null, fases: FASES, tareas: TAREAS, propuesta: v1, token: "run-estructura" },
      { alBorrar: (e) => (e.tareas.find((t) => t.id === "t1")!.status = "IN_PROGRESS") },
    );
    const resultado = await aplicarBorradorEnTx(db.tx, pedidoConTareas(v1, { fases: FASES, tareas: TAREAS })).catch((e: unknown) => e);
    expect(db.borrados[0]).toEqual({ id: { in: ["t1"] }, status: "PENDING", source: { not: "HUMAN" } });
    expect(resultado).toBeInstanceOf(ErrorAlAplicar);
    expect(resultado).toMatchObject({ codigo: "PLAN_CAMBIO", status: 409 });
    expect(db.llamadas, "siguió escribiendo después de un borrado que no cuadra").not.toContain("tareas-nuevas");
    expect(db.estado.tareas.find((t) => t.id === "t1")!.status).toBe("IN_PROGRESS");
  });

  it("⛔ una tarea nueva cuya fase no resuelve: nada se escribe (red de seguridad)", async () => {
    /* El plan nunca manda una así; si llega, no se borra ni se crea nada. La edición que la pone en
       rojo: resolver la fase después de borrar, o saltearse la que no resuelve. */
    for (const fase of [{ tipo: "nueva" as const, clave: "n:fantasma" }, { tipo: "existente" as const, id: "zz" }]) {
      const db = baseFalsa({ ancla: null, fases: FASES, tareas: TAREAS, propuesta: null, token: null });
      const intento = escribirTareas(db.tx, {
        escrituras: { seVan: ["t1"], nuevas: [{ clave: "t:x", fase, tarea: contenido("Algo", 0) }] },
        existentes: new Map([["c", { durationWeeks: 3, tareas: [{ id: "t1", weekIndex: 0, order: 0 }] }]]),
        nuevas: new Map(),
      });
      await expect(intento).rejects.toBeInstanceOf(TareasQueNoCuadran);
      expect(db.llamadas).toEqual([]);
      expect(db.estado.tareas).toHaveLength(TAREAS.length);
    }
  });

  it("⛔ SIN_PERMISO: tareas marcadas sin el permiso → 403 sin escribir; con las tareas desmarcadas, aplica las fases", async () => {
    /* Tocar tareas pide la misma vara que generarlas. La edición que la pone en rojo: no mirar el
       permiso, o mirarlo aunque no haya ninguna tarea marcada. */
    const { v1 } = v1ConTareas();
    const db = baseFalsa({ ancla: null, fases: FASES, tareas: TAREAS, propuesta: v1, token: "run-estructura" });
    const intento = aplicarBorradorEnTx(db.tx, pedidoConTareas(v1, { fases: FASES, tareas: TAREAS }, { puedeTocarTareas: false }));
    await expect(intento).rejects.toMatchObject({ codigo: "SIN_PERMISO", status: 403, message: MENSAJE_SIN_PERMISO_TAREAS });
    expect(db.llamadas).toEqual(["token", "leer"]);

    const sinTareas = v1.cambios.filter((c) => c.tipo === "tarea-nueva" || c.tipo === "tarea-se-va").map((c) => c.clave);
    const db2 = baseFalsa({ ancla: null, fases: FASES, tareas: TAREAS, propuesta: v1, token: "run-estructura" });
    const r = await aplicarBorradorEnTx(db2.tx, pedidoConTareas(v1, { fases: FASES, tareas: TAREAS }, { puedeTocarTareas: false, sin: sinTareas }));
    expect(r.tareasTocadas).toBe(0);
    expect(db2.llamadas).toEqual(["token", "leer", "ancla", "fase:b", "crear:Piloto", "orden:c", "editado"]);
  });

  it("⛔ mientras la IA arma las tareas no se aplica (NO_SE_PUEDE), aunque la huella coincida", async () => {
    /* La edición que la pone en rojo: planear sin el estado de las tareas que dedujo la ruta. */
    const { v1 } = v1ConTareas();
    const db = baseFalsa({ ancla: null, fases: FASES, tareas: TAREAS, propuesta: v1, token: "run-estructura" });
    const intento = aplicarBorradorEnTx(db.tx, pedidoConTareas(v1, { fases: FASES, tareas: TAREAS }, { tareas: "armando" }));
    await expect(intento).rejects.toMatchObject({ codigo: "NO_SE_PUEDE", message: BLOQUEO_TAREAS_EN_CURSO });
    expect(db.llamadas).toEqual(["token", "leer"]);
  });

  it("⛔ E2c P3 · una pestaña de antes con una fase DESFASADA: NO_SE_PUEDE con «recarga la página», y nada se escribe; forzada, aplica", async () => {
    /* Quitar un cambio de fase ya no deja sus tareas fuera: se recalculan, y aplicar espera. Solo una
       pestaña de antes (que no sabe recalcular ni forzar) manda tareas desfasadas: se le dice que
       recargue (crítica de alcance #16), no el bloqueo de la pantalla nueva («recalcúlalas»), que ella no
       puede cumplir. Las ediciones que la ponen en rojo: aplicar las tareas armadas para otra forma
       (sin bloqueo), o devolverle el bloqueo de la pantalla nueva. */
    const t2 = TAREAS.find((t) => t.id === "t2")!;
    const acorta: Borrador = {
      formato: FORMATO_BORRADOR,
      version: 2,
      origen: "contexto",
      observaciones: [],
      cambios: [
        { tipo: "fase-cambia", clave: "fase:c:durationWeeks", faseId: "c", fase: "Pruebas", campo: "durationWeeks", desde: 3, a: 2 },
        { tipo: "tarea-se-va", clave: claveDeTareaQueSeVa("t2"), tareaId: "t2", faseId: "c", desde: fotoDeTarea(tareaDelVivo(t2)) },
      ],
      pedido: "regenerar",
      tareas: { corrida: "run-tareas", listas: true },
      tareasArmadasPara: { c: { nombre: "Pruebas", semanas: 2 } },
    };
    // El CSE desmarcó el cambio de semanas: «Pruebas» sigue en 3 y su tarea se armó para 2.
    const sin = ["fase:c:durationWeeks"];
    const db = baseFalsa({ ancla: null, fases: FASES, tareas: TAREAS, propuesta: acorta, token: "run-estructura" });
    const intento = aplicarBorradorEnTx(db.tx, pedidoConTareas(acorta, { fases: FASES, tareas: TAREAS }, { sin }));
    await expect(intento).rejects.toMatchObject({ codigo: "NO_SE_PUEDE", message: mensajeDeRecalculoAlAplicar(["Pruebas"]) });
    expect(db.llamadas, "escribió algo con tareas desfasadas").toEqual(["token", "leer"]);
    // «Aplicar de todos modos» (la pantalla nueva, tras un recálculo fallido): la fase forzada aplica tal cual.
    const vivo = vivoDe(FASES, null, TAREAS);
    const huella = planDeAplicacion(vivo, leerBorrador(acorta, vivo)!, sin, { tareas: "listas", forzar: ["c"] }).huella;
    const db2 = baseFalsa({ ancla: null, fases: FASES, tareas: TAREAS, propuesta: acorta, token: "run-estructura" });
    const r = await aplicarBorradorEnTx(db2.tx, pedidoConTareas(acorta, { fases: FASES, tareas: TAREAS }, { sin, huella, forzar: ["c"] }));
    expect(r.tareas).toEqual({ creadas: 0, borradas: 1 });
    expect(r.plan.forzadas.map((f) => f.fase)).toEqual(["c"]);
  });

  it("el cierre de la fase: quitar la última pendiente la cierra; sumar una a una fase cerrada la reabre", async () => {
    /* `recalcularCierreDeFase` (extraída de apply-curated-phase.ts con la misma conducta; desde E2b
       P5b vive en escribir-estructura.ts). La edición que la pone en rojo: no recalcular el cierre de
       las fases que cambiaron de tareas. */
    const hechas = [tareaDB("t1", "c", "Probar flujos", 0, 0), tareaDB("t2", "c", "Pruebas con usuarios", 2, 0, { status: "DONE" })];
    const seVa: CambioTareaSeVa = {
      tipo: "tarea-se-va",
      clave: claveDeTareaQueSeVa("t1"),
      tareaId: "t1",
      faseId: "c",
      desde: fotoDeTarea(tareaDelVivo(hechas[0])),
    };
    const quitar: Borrador = {
      formato: FORMATO_BORRADOR,
      version: 1,
      origen: "contexto",
      observaciones: [],
      cambios: [seVa],
      pedido: "regenerar",
      tareas: { corrida: "run-tareas", listas: true },
      tareasArmadasPara: { c: { nombre: "Pruebas", semanas: 3 } },
    };
    const db = baseFalsa({ ancla: null, fases: FASES, tareas: hechas, propuesta: quitar, token: "run-estructura" });
    await aplicarBorradorEnTx(db.tx, pedidoConTareas(quitar, { fases: FASES, tareas: hechas }));
    expect(db.llamadas).toContain("estado:c");
    expect(db.estado.fases.find((f) => f.id === "c")!.status).toBe("DONE");

    const cerrada = FASES.map((f): FaseDeLaBase => (f.id === "c" ? { ...f, status: "DONE" } : f));
    const sumar: Borrador = {
      ...quitar,
      cambios: [{ tipo: "tarea-nueva", clave: "t:otra", fase: "c", tarea: contenido("Pruebas de carga", 1) }],
    };
    const soloHechas = [hechas[1]];
    const db2 = baseFalsa({ ancla: null, fases: cerrada, tareas: soloHechas, propuesta: sumar, token: "run-estructura" });
    await aplicarBorradorEnTx(db2.tx, pedidoConTareas(sumar, { fases: FASES, tareas: soloHechas }));
    expect(db2.estado.fases.find((f) => f.id === "c")!.status).toBe("IN_PROGRESS");
  });

  it("⛔ al acortar una fase, el aviso cuenta SOLO las tareas que quedan: las que el mismo aplicar borra no se mueven", async () => {
    /* Revisión de E2a: la estructura corre antes que las tareas y movía también las que se iban, así
       que el aviso decía «2 tareas… se movieron» cuando una ya no existía. La edición que la pone en
       rojo: no pasarle `seVan` a la estructura, o sacar el `notIn` de la reubicación. */
    const tareas = [...TAREAS, tareaDB("t4", "c", "Pruebas finales", 2, 1)];
    const t2 = tareas.find((t) => t.id === "t2")!;
    const acorta: Borrador = {
      formato: FORMATO_BORRADOR,
      version: 2,
      origen: "contexto",
      observaciones: [],
      cambios: [
        { tipo: "fase-cambia", clave: "fase:c:durationWeeks", faseId: "c", fase: "Pruebas", campo: "durationWeeks", desde: 3, a: 2 },
        { tipo: "tarea-se-va", clave: claveDeTareaQueSeVa("t2"), tareaId: "t2", faseId: "c", desde: fotoDeTarea(tareaDelVivo(t2)) },
      ],
      pedido: "regenerar",
      tareas: { corrida: "run-tareas", listas: true },
      tareasArmadasPara: { c: { nombre: "Pruebas", semanas: 2 } },
    };
    const db = baseFalsa({ ancla: null, fases: FASES, tareas, propuesta: acorta, token: "run-estructura" });
    const r = await aplicarBorradorEnTx(db.tx, pedidoConTareas(acorta, { fases: FASES, tareas }));
    expect(r.tareas).toEqual({ creadas: 0, borradas: 1 });
    expect(db.reubicaciones).toEqual([{ phaseId: "c", weekIndex: { gte: 2 }, id: { notIn: ["t2"] } }]);
    expect(r.avisos, "el aviso contó una tarea que el mismo aplicar borró").toEqual([
      "«Pruebas» pasó a 2 semanas y 1 tarea quedaba más allá: se movió a la última semana.",
    ]);
    expect(db.estado.tareas.find((t) => t.id === "t4")!.weekIndex).toBe(1);
    expect(db.estado.tareas.some((t) => t.id === "t2")).toBe(false);
  });
});

describe("lo que el escritor de tareas NO hace", () => {
  const leer = (rel: string) =>
    fs
      .readFileSync(path.join(process.cwd(), rel), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
      .replace(/^\s*\/\/.*$/gm, "");

  it("⛔ nunca parchea la foto publicada (el parche absorbería los movimientos hechos a mano)", () => {
    /* foto-del-plan.ts: `patchBaselinePhaseTasks` re-sincroniza TODAS las tareas de la fase con lo
       vivo. El borrador solo crea y borra: una nueva no entra a la foto y una borrada se queda. La
       edición que la pone en rojo: llamar al parche desde el aplicar del borrador. */
    for (const rel of ["lib/timeline/escribir-tareas.ts", "lib/timeline/escribir-estructura.ts"]) {
      const src = leer(rel);
      expect(src.length, `${rel}: la guarda no está mirando nada`).toBeGreaterThan(1000);
      expect(src, `${rel} parchea la foto publicada`).not.toContain("patchBaselinePhaseTasks(");
    }
  });

  /* E2b P5b (2026-09-25): salió «y `applyCuratedPhaseTasks` sigue cerrando la fase con la misma
     función». applyCuratedPhaseTasks se borró con apply-curated-phase.ts (la curación de dos
     columnas), y `recalcularCierreDeFase` se mudó a escribir-estructura.ts, su único llamador: ya no
     hay una segunda copia que vigilar. Su conducta la prueba «el cierre de la fase» de arriba. */

  it("⭐ crea con la marca «por validar» de la tarea (no con un false fijo)", () => {
    /* Traída de apply-curated-phase.test.ts (E2b P5b), que se borró: vigilaba lo mismo en el apply de
       la curación. La marca del agente (la típica del tipo de fase, sin respaldo en ninguna fuente)
       tiene que llegar hasta la tarea creada. La edición que la pone en rojo: crear todo como validado
       o dejar de leer la marca de la tarea propuesta. */
    const src = leer("lib/timeline/escribir-tareas.ts");
    const i = src.indexOf("const data: Prisma.TimelineTaskCreateManyInput[] = destinos.map(");
    expect(i, "se movió el ancla: revisa esta guarda").toBeGreaterThan(0);
    const alta = src.slice(i, src.indexOf("await tx.timelineTask.createMany(", i));
    expect(alta.length, "el tramo del alta salió vacío").toBeGreaterThan(200);
    expect(alta, "el aplicar volvió a crear todo como validado: la marca del agente se pierde").toContain(
      "needsValidation: n.tarea.needsValidation === true",
    );
  });
});
