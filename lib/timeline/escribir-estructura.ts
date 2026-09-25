/**
 * lib/timeline/escribir-estructura.ts — APLICAR EL BORRADOR DEL CRONOGRAMA, dentro de UNA transacción.
 *
 * Server-only (recibe el `tx` de Prisma). Lo llama POST /timeline/borrador/aplicar; está acá y no en
 * la ruta para que el ORDEN de las escrituras se pueda probar con un `tx` falso
 * (escribir-estructura.test.ts), sin base.
 *
 * ── EL ORDEN, Y POR QUÉ ─────────────────────────────────────────────────────
 *   1. La escritura CONDICIONAL del token, primero: la propuesta guardada tiene que ser la que el CSE
 *      tiene enfrente (su corrida y, en el formato nuevo, su versión). Si no, no se escribe nada
 *      (409 PROPUESTA_CAMBIO). Aplicar resuelve la propuesta ENTERA (lo desmarcado y lo que choca se
 *      descarta con ella), así que esta escritura es también la limpieza.
 *   2. Lo vivo —fases CON sus tareas— se lee DENTRO de la transacción, y el plan se calcula con la
 *      MISMA función que usó la pantalla (`planDeAplicacion`, lib/timeline/borrador.ts), con el
 *      estado de las tareas que se dedujo de la corrida (mientras se arman, no se aplica).
 *   3. Si la huella del plan no es la que vio el CSE, se aborta sin escribir nada más: el `throw`
 *      deshace también el paso 1 (409 PLAN_CAMBIO). Aplicar otra lista que la que vio es justo lo
 *      que no puede pasar.
 *   4. El permiso: tocar tareas pide la misma vara que generarlas (403 SIN_PERMISO). Desmarcando las
 *      tareas, se aplican solo los cambios de fases.
 *   5. La estructura (`escribirEstructura`): arranque, campos de fase —acomodando las tareas de una
 *      fase que se acorta—, fases nuevas y orden. Nada que no cambie se toca.
 *   6. Las tareas (`escribirTareas`, lib/timeline/escribir-tareas.ts), DESPUÉS de la estructura: una
 *      tarea de una fase nueva necesita su id real. Solo crea y borra; nunca parchea la foto publicada.
 *   7. El cierre (o la reapertura) de cada fase existente que cambió de tareas.
 *   8. `lastEditedByHuman`: el cronograma cambió y el cliente todavía no lo ve («Subir al cliente»).
 *      Con tareas tocadas, además, el borrador de avance queda viejo (ids nuevos): se invalida.
 * La auditoría y los eventos del watchdog van AFUERA, después: alargar la transacción no, y perder
 * un evento es aceptable (mismo criterio que el PUT).
 *
 * Extraído de `proposal/apply-items` (2026-09-24), que queda como lápida: la reubicación de tareas,
 * el orden denso 0..N-1 y la escritura solo de lo que cambia son los mismos.
 */
import { Prisma, type TimelineActivityType } from "@prisma/client";
import { ACTIVITY_TYPES } from "./validate";
import {
  esCambioDeTarea,
  leerBorrador,
  planDeAplicacion,
  versionDelBorrador,
  type Borrador,
  type EscriturasDeEstructura,
  type EstadoDeLasTareas,
  type FaseViva,
  type PlanDeAplicacion,
  type TareaDelVivo,
  type Vivo,
} from "./borrador";
import { escribirTareas, TareasQueNoCuadran, type FaseParaTareas, type ResultadoDeTareas } from "./escribir-tareas";
import { recalcularCierreDeFase } from "./apply-curated-phase";

/** Lo que el escritor usa del `tx`: tipado contra Prisma, para que un campo mal escrito no compile. */
export type TxDeEstructura = Pick<Prisma.TransactionClient, "projectTimeline" | "timelinePhase" | "timelineTask">;

export const SELECT_DE_FASE = {
  id: true,
  name: true,
  order: true,
  durationWeeks: true,
  startWeek: true,
  sessionCount: true,
  notes: true,
  activityType: true,
} as const;

/** Lo que se lee de cada tarea para planear: lo que viaja en el cable (sin fechas reales) y su `order`. */
export const SELECT_DE_TAREA = {
  id: true,
  title: true,
  weekIndex: true,
  order: true,
  notes: true,
  party: true,
  type: true,
  status: true,
  source: true,
  startDateOverride: true,
  dueDateOverride: true,
} as const;

export interface FaseEnLaBase extends FaseViva {
  order: number;
}

export type CodigoDeAplicar =
  | "PROPUESTA_CAMBIO"
  | "PLAN_CAMBIO"
  | "NADA_QUE_APLICAR"
  | "NO_SE_PUEDE"
  | "SIN_PERMISO"
  | "VALOR_INVALIDO"
  | "SIN_CRONOGRAMA";

const STATUS: Record<CodigoDeAplicar, number> = {
  PROPUESTA_CAMBIO: 409,
  PLAN_CAMBIO: 409,
  NO_SE_PUEDE: 409,
  SIN_PERMISO: 403,
  NADA_QUE_APLICAR: 400,
  VALOR_INVALIDO: 400,
  SIN_CRONOGRAMA: 404,
};

/** Un motivo para no aplicar, con el código que lee la pantalla y el texto que lee el CSE. */
export class ErrorAlAplicar extends Error {
  readonly codigo: CodigoDeAplicar;
  readonly status: number;
  constructor(codigo: CodigoDeAplicar, mensaje: string) {
    super(mensaje);
    this.codigo = codigo;
    this.status = STATUS[codigo];
  }
}

export const MENSAJE_PROPUESTA_CAMBIO =
  "La propuesta cambió mientras la revisabas (se regeneró el handoff, o se resolvió en otra pestaña): no se aplicó nada. Revisa la que está ahora.";
export const MENSAJE_PLAN_CAMBIO =
  "El cronograma cambió mientras revisabas la propuesta (otra pestaña u otra persona): no se aplicó nada. Revisa la lista actualizada y vuelve a aplicar.";
export const MENSAJE_NADA_QUE_APLICAR =
  "No hay ningún cambio marcado para aplicar. Si no quieres ninguno, descarta la propuesta.";
export const MENSAJE_SIN_PERMISO_TAREAS =
  "Aplicar las tareas de la propuesta necesita el permiso de regenerar el cronograma. Puedes aplicar solo los cambios de fases desmarcando las tareas.";

function tipoDeActividad(v: unknown): TimelineActivityType | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && (ACTIVITY_TYPES as readonly string[]).includes(v)) return v as TimelineActivityType;
  throw new ErrorAlAplicar("VALOR_INVALIDO", `Tipo de actividad inválido en la propuesta: ${String(v)}`);
}

/**
 * Escribe la estructura que dice el plan. Recibe las fases TAL COMO SE LEYERON en esta misma
 * transacción (con su `order`), para escribir solo lo que cambia.
 */
export async function escribirEstructura(
  tx: TxDeEstructura,
  entrada: { timelineId: string; fases: readonly FaseEnLaBase[]; escrituras: EscriturasDeEstructura },
): Promise<{ avisos: string[]; creadas: Array<{ clave: string; id: string }> }> {
  const { timelineId, fases, escrituras } = entrada;
  const porId = new Map(fases.map((f) => [f.id, f]));
  const avisos: string[] = [];

  // Valida ANTES de la primera escritura de estructura: un enum inválido sale como 400 legible.
  for (const n of escrituras.nuevas) tipoDeActividad(n.fase.activityType);
  for (const f of escrituras.fases) if ("activityType" in f.campos) tipoDeActividad(f.campos.activityType);

  // 1) El arranque.
  if (escrituras.ancla) {
    await tx.projectTimeline.update({ where: { id: timelineId }, data: { anchorStartDate: new Date(escrituras.ancla) } });
  }

  // 2) Los campos de cada fase, campo por campo y tipados.
  for (const { id, campos } of escrituras.fases) {
    const antes = porId.get(id);
    if (!antes) throw new ErrorAlAplicar("PLAN_CAMBIO", MENSAJE_PLAN_CAMBIO);
    const data: Prisma.TimelinePhaseUpdateInput = {};
    if ("name" in campos) data.name = String(campos.name);
    if ("durationWeeks" in campos) data.durationWeeks = Number(campos.durationWeeks);
    if ("startWeek" in campos) data.startWeek = campos.startWeek === null ? null : Number(campos.startWeek);
    if ("sessionCount" in campos) data.sessionCount = campos.sessionCount === null ? null : Number(campos.sessionCount);
    if ("notes" in campos) data.notes = campos.notes === null ? null : String(campos.notes);
    if ("activityType" in campos) data.activityType = tipoDeActividad(campos.activityType);
    await tx.timelinePhase.update({ where: { id }, data });

    /* ── ACORTAR LA FASE NO PUEDE DEJAR SUS TAREAS EN UNA SEMANA QUE NO EXISTE ─────────────────
       El agujero que dejó 34 tareas fuera de rango en 5 proyectos (barrido del 2026-08-20) y que
       apagaba «Pedir cambio con IA» en esos proyectos (lib/timeline/duenios-de-duracion.test.ts).
       Última semana que existe, igual que el PUT y que `repararPropuesta`: una sola regla. */
    const nuevaDuracion = data.durationWeeks;
    if (typeof nuevaDuracion === "number" && nuevaDuracion < antes.durationWeeks) {
      const reubicadas = await tx.timelineTask.updateMany({
        where: { phaseId: id, weekIndex: { gte: nuevaDuracion } },
        data: { weekIndex: nuevaDuracion - 1 },
      });
      if (reubicadas.count > 0) {
        avisos.push(
          `«${antes.name}» pasó a ${nuevaDuracion} ${nuevaDuracion === 1 ? "semana" : "semanas"} y ` +
            `${reubicadas.count === 1 ? "1 tarea quedaba" : `${reubicadas.count} tareas quedaban`} ` +
            `más allá: ${reubicadas.count === 1 ? "se movió" : "se movieron"} a la última semana.`,
        );
      }
    }
  }

  /* 3) Las fases nuevas y el ORDEN, juntos y de una vez: insertar y reordenar por separado se
     pisan. El orden queda DENSO (0..N-1), igual que la posición en pantalla, y solo se escribe la
     fila cuyo orden cambió de verdad. Las fases nuevas nacen VACÍAS: las tareas llegan con el
     paso 2 de «Regenerar todo» o con «Regenerar» de esa fase. */
  const nuevas = new Map(escrituras.nuevas.map((n) => [n.clave, n.fase]));
  const creadas: Array<{ clave: string; id: string }> = [];
  for (const [i, lugar] of escrituras.orden.entries()) {
    if (lugar.tipo === "nueva") {
      const fase = nuevas.get(lugar.clave);
      if (!fase) continue;
      const creada = await tx.timelinePhase.create({
        data: {
          timelineId,
          name: fase.name,
          order: i,
          durationWeeks: fase.durationWeeks,
          startWeek: fase.startWeek,
          sessionCount: fase.sessionCount,
          notes: fase.notes,
          activityType: tipoDeActividad(fase.activityType),
          source: "AGENT", // propuesta por la IA, confirmada por una persona
        },
        select: { id: true },
      });
      creadas.push({ clave: lugar.clave, id: creada.id });
    } else {
      const previa = porId.get(lugar.id);
      if (previa && previa.order !== i) {
        await tx.timelinePhase.update({ where: { id: lugar.id }, data: { order: i } });
      }
    }
  }
  return { avisos, creadas };
}

export interface PedidoDeAplicar {
  timelineId: string;
  /** `pendingProposalRunId` de la propuesta que el CSE tiene enfrente. */
  token: string | null;
  /** Lo que estaba guardado en `pendingProposal` cuando se leyó (fuera de la transacción). Para
   *  un token dado no cambia sin que cambie su versión (la escritura del paso 1 se condiciona a ella). */
  guardado: unknown;
  /** La foto contra la que la pantalla convirtió el formato viejo (lib/timeline/borrador.ts). */
  foto: Vivo | null;
  sin: readonly string[];
  huella: string;
  ahora: Date;
  /** El estado de las tareas del borrador, deducido de su corrida ANTES de la transacción
   *  (`leerEstadoDeLasTareas`, lib/timeline/borrador-del-detalle.ts). null = no espera tareas. */
  tareas: EstadoDeLasTareas | null;
  /** ¿Quien aplica puede tocar tareas? La misma vara que para generarlas (`guardIaDelCronograma`). */
  puedeTocarTareas: boolean;
  /** Quien aplica: firma el cierre o la reapertura de una fase. */
  actorEmail: string | null;
}

export interface ResultadoDeAplicar {
  borrador: Borrador;
  plan: PlanDeAplicacion;
  avisos: string[];
  /** Para la auditoría y el evento del arranque, que van después de la transacción. */
  anclaAntes: string | null;
  fasesAntes: Array<{ durationWeeks: number; startWeek: number | null }>;
  /** Tareas creadas + borradas. Con > 0, la pantalla encadena el re-chequeo del avance. */
  tareasTocadas: number;
  tareas: { creadas: number; borradas: number };
}

/** YYYY-MM-DD de una fecha fijada a mano, igual que la ve la pantalla en el cable (ISO → día). */
const diaDe = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

/** El cuerpo de la transacción. Ver el orden arriba. */
export async function aplicarBorradorEnTx(tx: TxDeEstructura, p: PedidoDeAplicar): Promise<ResultadoDeAplicar> {
  // 1) El token, primero (y la limpieza: se resuelve la propuesta entera).
  const version = versionDelBorrador(p.guardado);
  const tomado = await tx.projectTimeline.updateMany({
    where: {
      id: p.timelineId,
      pendingProposalRunId: p.token,
      pendingProposal:
        version === null ? { not: Prisma.DbNull } : { path: ["version"], equals: version },
    },
    data: { pendingProposal: Prisma.DbNull, pendingProposalRunId: null },
  });
  if (tomado.count === 0) throw new ErrorAlAplicar("PROPUESTA_CAMBIO", MENSAJE_PROPUESTA_CAMBIO);

  // 2) Lo vivo, dentro de la transacción: las fases CON sus tareas.
  const tl = await tx.projectTimeline.findUnique({
    where: { id: p.timelineId },
    select: {
      anchorStartDate: true,
      phases: {
        orderBy: { order: "asc" },
        select: {
          ...SELECT_DE_FASE,
          tasks: { orderBy: [{ weekIndex: "asc" }, { order: "asc" }], select: SELECT_DE_TAREA },
        },
      },
    },
  });
  if (!tl) throw new ErrorAlAplicar("SIN_CRONOGRAMA", "No hay cronograma.");
  const fases: FaseEnLaBase[] = tl.phases.map(({ tasks, ...f }) => ({
    ...f,
    activityType: f.activityType ?? null,
    tareas: tasks.map(
      (t): TareaDelVivo => ({
        id: t.id,
        title: t.title,
        weekIndex: t.weekIndex,
        notes: t.notes ?? null,
        party: t.party ?? null,
        type: t.type ?? null,
        status: t.status,
        source: t.source,
        inicioFijado: diaDe(t.startDateOverride),
        finFijado: diaDe(t.dueDateOverride),
      }),
    ),
  }));
  const anclaAntes = tl.anchorStartDate?.toISOString() ?? null;
  const vivo: Vivo = {
    ancla: anclaAntes,
    fases: fases.map((f) => ({
      id: f.id,
      name: f.name,
      durationWeeks: f.durationWeeks,
      startWeek: f.startWeek,
      sessionCount: f.sessionCount,
      notes: f.notes,
      activityType: f.activityType,
      tareas: f.tareas,
    })),
  };

  // 3) El plan: el mismo borrador que armó la pantalla (con su foto) y la misma función.
  const borrador = leerBorrador(p.guardado, p.foto ?? vivo);
  if (!borrador) throw new ErrorAlAplicar("PROPUESTA_CAMBIO", MENSAJE_PROPUESTA_CAMBIO);
  const plan = planDeAplicacion(vivo, borrador, p.sin, { tareas: p.tareas });
  if (plan.bloqueo) throw new ErrorAlAplicar("NO_SE_PUEDE", plan.bloqueo);

  // 4) La huella: otra lista que la que vio el CSE → nada (el throw deshace el token).
  if (plan.huella !== p.huella) throw new ErrorAlAplicar("PLAN_CAMBIO", MENSAJE_PLAN_CAMBIO);
  if (plan.aplicadas.length === 0) throw new ErrorAlAplicar("NADA_QUE_APLICAR", MENSAJE_NADA_QUE_APLICAR);

  // 5) El permiso: tocar tareas pide la vara de generarlas. Sin ella, se aplican solo las fases
  //    desmarcando las tareas (el plan de arriba ya no las tendría entre las aplicadas).
  if (!p.puedeTocarTareas && plan.aplicadas.some(esCambioDeTarea)) {
    throw new ErrorAlAplicar("SIN_PERMISO", MENSAJE_SIN_PERMISO_TAREAS);
  }

  // 6) La estructura.
  const { avisos, creadas } = await escribirEstructura(tx, { timelineId: p.timelineId, fases, escrituras: plan.escrituras });

  // 7) Las tareas, con los ids reales de las fases nuevas y la duración con que quedan las fases.
  const duracionNueva = new Map(
    plan.escrituras.fases.flatMap((f) => ("durationWeeks" in f.campos ? [[f.id, Number(f.campos.durationWeeks)] as const] : [])),
  );
  const existentes = new Map<string, FaseParaTareas>(
    tl.phases.map((f) => [
      f.id,
      { durationWeeks: duracionNueva.get(f.id) ?? f.durationWeeks, tareas: f.tasks },
    ]),
  );
  const duracionDeLaNueva = new Map(plan.escrituras.nuevas.map((n) => [n.clave, n.fase.durationWeeks]));
  const nuevas = new Map(
    creadas.map((c) => [c.clave, { id: c.id, durationWeeks: duracionDeLaNueva.get(c.clave) ?? 1 }]),
  );
  let tareas: ResultadoDeTareas;
  try {
    tareas = await escribirTareas(tx, { escrituras: plan.escrituras.tareas, existentes, nuevas });
  } catch (e) {
    // Una tarea cuya fase no resuelve, o que ya no se podía quitar: nada (el throw deshace todo).
    if (e instanceof TareasQueNoCuadran) throw new ErrorAlAplicar("PLAN_CAMBIO", MENSAJE_PLAN_CAMBIO);
    throw e;
  }

  // 8) El cierre (o la reapertura) de cada fase existente que cambió de tareas.
  for (const phaseId of tareas.fasesTocadas) {
    await recalcularCierreDeFase(tx, phaseId, p.ahora, p.actorEmail);
  }

  /* 9) El cronograma cambió y el cliente todavía no lo ve. Con tareas creadas o borradas, el
     borrador de avance quedó viejo (ids que ya no están): se invalida. Las fases nuevas solas no lo
     invalidan (igual que E1). La corrida que armó las tareas queda como su traza. */
  const tareasTocadas = tareas.creadas + tareas.borradas;
  await tx.projectTimeline.update({
    where: { id: p.timelineId },
    data: {
      lastEditedByHuman: p.ahora,
      ...(tareasTocadas > 0 ? { pendingProgress: Prisma.DbNull, pendingProgressRunId: null } : {}),
      ...(tareas.creadas > 0 && borrador.tareas?.corrida ? { detailGeneratedByAgentRunId: borrador.tareas.corrida } : {}),
    },
  });

  return {
    borrador,
    plan,
    avisos,
    anclaAntes,
    fasesAntes: fases.map((f) => ({ durationWeeks: f.durationWeeks, startWeek: f.startWeek })),
    tareasTocadas,
    tareas: { creadas: tareas.creadas, borradas: tareas.borradas },
  };
}
