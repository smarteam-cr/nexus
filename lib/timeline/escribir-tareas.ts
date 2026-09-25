/**
 * lib/timeline/escribir-tareas.ts — las TAREAS del borrador del cronograma, dentro de la transacción
 * de aplicar (E2a).
 *
 * Server-only (recibe el `tx`). Lo llama `aplicarBorradorEnTx` (lib/timeline/escribir-estructura.ts)
 * DESPUÉS de la estructura: una tarea nueva de una fase nueva necesita el id real que acaba de crear
 * `escribirEstructura`. Está aparte para que el orden y la cantidad de llamadas se prueben con un
 * `tx` falso (escribir-estructura.test.ts).
 *
 * ── LO QUE HACE, Y LO QUE NO ─────────────────────────────────────────────────
 *   · CREA y BORRA y, desde E3, ACTUALIZA las que cambian por el chat (renombre, semana, dueño, tipo
 *     o mudanza): conservan su id, su estado y sus fechas.
 *   · Borra con la regla de siempre en el `where` (pendiente y no escrita a mano): el plan ya dejó
 *     afuera lo que tiene avance, y esta es la segunda red. Si se borra otra cantidad que la que se
 *     vio, no se aplica nada (PLAN_CAMBIO): nunca se borra otra cosa de la que el CSE revisó.
 *   · Una que cambia se escribe condicionada a su fase de origen (`where: { id, phaseId }`): si ya no
 *     está ahí, no se aplica nada (PLAN_CAMBIO). Una que se muda va al final de su semana en el destino.
 *   · Crea en UN solo `createMany`, al final de su semana, sin renumerar las que ya estaban.
 *   · ⛔ NUNCA parchea la foto publicada (`patchBaselinePhaseTasks`): el parche absorbería en la
 *     promesa los movimientos que el CSE hizo a mano a las que quedan (foto-del-plan.ts). Una tarea
 *     nueva no entra en la foto y una borrada se queda en ella, que es lo correcto.
 *   · Pocas llamadas: 1 `deleteMany` + 1 `createMany` + 1 `updateMany` por tarea que CAMBIA (solo las
 *     dicta el chat, de a pocas), nunca una por tarea creada o borrada (Wherex ronda las 300).
 */
import type { Prisma, TaskParty, TimelineTaskType } from "@prisma/client";
import { PARTY_VALUES, TASK_TYPE_VALUES } from "./validate";
import type { EscriturasDeTareas, Lugar } from "./borrador";

/** Lo que el escritor usa del `tx`. */
export type TxDeTareas = Pick<Prisma.TransactionClient, "timelineTask">;

/** Una fase EXISTENTE tal como se leyó en la transacción, con la duración con que queda. */
export interface FaseParaTareas {
  /** La duración FINAL (la del plan si la cambia; si no, la leída). */
  durationWeeks: number;
  /** E3: `source`, para que una que cambia pase de AGENT a MODIFIED (opcional: los llamadores de E2a). */
  tareas: ReadonlyArray<{ id: string; weekIndex: number; order: number; source?: string }>;
}

/** Un motivo para no escribir: quien llama lo convierte en su error (409 PLAN_CAMBIO). */
export class TareasQueNoCuadran extends Error {}

const esParty = (v: unknown): v is TaskParty => typeof v === "string" && (PARTY_VALUES as readonly string[]).includes(v);
const esTipo = (v: unknown): v is TimelineTaskType =>
  typeof v === "string" && (TASK_TYPE_VALUES as readonly string[]).includes(v);
/** La semana dentro de la fase: [0, duración). */
const acotar = (semana: number, duracion: number) =>
  Math.min(Math.max(Number.isInteger(semana) ? semana : 0, 0), Math.max(duracion - 1, 0));

export interface ResultadoDeTareas {
  creadas: number;
  borradas: number;
  /** E3: las que cambiaron (se hayan mudado o no) y, de ellas, las que se mudaron de fase. */
  cambiadas: number;
  mudadas: number;
  /** Las fases EXISTENTES con alguna tarea creada, borrada, que entró o que salió (para su cierre),
   *  en el orden de `existentes`. */
  fasesTocadas: string[];
}

/**
 * Escribe las tareas del plan. `existentes`: las fases leídas en esta transacción (por id, en su
 * orden). `nuevas`: las fases que acaba de crear la estructura (clave `n:…` → id real y duración).
 * Resuelve TODO antes de la primera escritura: una tarea cuya fase no resuelve no deja nada a medias.
 */
export async function escribirTareas(
  tx: TxDeTareas,
  entrada: {
    escrituras: EscriturasDeTareas;
    existentes: ReadonlyMap<string, FaseParaTareas>;
    nuevas: ReadonlyMap<string, { id: string; durationWeeks: number }>;
  },
): Promise<ResultadoDeTareas> {
  const { escrituras, existentes, nuevas } = entrada;
  const cambian = escrituras.cambian ?? [];

  /** Una fase del plan → su id real y la duración con que queda. Si no resuelve, no se escribe nada. */
  const resolver = (fase: Lugar): { phaseId: string; duracion: number } => {
    if (fase.tipo === "existente") {
      const f = existentes.get(fase.id);
      if (!f) throw new TareasQueNoCuadran(`La fase ${fase.id} no está en el cronograma.`);
      return { phaseId: fase.id, duracion: f.durationWeeks };
    }
    const creada = nuevas.get(fase.clave);
    if (!creada) throw new TareasQueNoCuadran(`La fase nueva ${fase.clave} no se creó.`);
    return { phaseId: creada.id, duracion: creada.durationWeeks };
  };

  // 1) Cada tarea nueva, a su fase real. Si alguna no resuelve, no se escribe nada (red de seguridad:
  //    el plan nunca manda una así).
  const destinos = escrituras.nuevas.map((n) => ({ ...resolver(n.fase), n }));

  // 1b) E3: cada una que cambia, con su origen leído (la tarea tiene que estar ahí) y su destino real.
  const leidas = new Map<string, { faseId: string; weekIndex: number; source?: string }>();
  for (const [id, f] of existentes) {
    for (const t of f.tareas) leidas.set(t.id, { faseId: id, weekIndex: t.weekIndex, source: t.source });
  }
  const cambios = cambian.map((c) => {
    const leida = leidas.get(c.id);
    const origen = existentes.get(c.desdeFase);
    if (!leida || !origen || leida.faseId !== c.desdeFase) throw new TareasQueNoCuadran(`La tarea ${c.id} ya no está en su fase.`);
    const destino = c.aFase === null ? { phaseId: c.desdeFase, duracion: origen.durationWeeks } : resolver(c.aFase);
    return { c, leida, destino };
  });

  // 2) Las que se van: pendientes y no escritas a mano, o nada.
  if (escrituras.seVan.length > 0) {
    const borradas = await tx.timelineTask.deleteMany({
      where: { id: { in: escrituras.seVan }, status: "PENDING", source: { not: "HUMAN" } },
    });
    if (borradas.count !== escrituras.seVan.length) {
      throw new TareasQueNoCuadran(`Se iban ${escrituras.seVan.length} tareas y se podían quitar ${borradas.count}.`);
    }
  }

  // 3) El `order` más alto leído en cada fase y semana: una que se muda y una nueva van al final.
  //    Las leídas se acotan a la duración final igual que las acomoda la estructura al acortar.
  const maximos = new Map<string, number>();
  const llave = (phaseId: string, semana: number) => `${phaseId}|${semana}`;
  for (const [id, f] of existentes) {
    for (const t of f.tareas) {
      const k = llave(id, acotar(t.weekIndex, f.durationWeeks));
      maximos.set(k, Math.max(maximos.get(k) ?? -1, t.order));
    }
  }
  const alFinal = (phaseId: string, semana: number): number => {
    const k = llave(phaseId, semana);
    const order = (maximos.get(k) ?? -1) + 1;
    maximos.set(k, order);
    return order;
  };

  /* 3b) E3: las que cambian, una por una y condicionadas a su fase de origen. Lo que se pidió
     (`campos`), la semana acotada a la duración final del destino, la fase y el lugar si se muda, y la
     marca de «la tocó una persona» (AGENT → MODIFIED, sin «por validar»), como el PUT. */
  let mudadas = 0;
  for (const { c, leida, destino } of cambios) {
    const seMuda = c.aFase !== null;
    const edicion: Prisma.TimelineTaskUncheckedUpdateManyInput = { needsValidation: false };
    if (c.campos.title !== undefined) edicion.title = c.campos.title;
    if (c.campos.party !== undefined) edicion.party = esParty(c.campos.party) ? c.campos.party : null;
    if (c.campos.type !== undefined) edicion.type = esTipo(c.campos.type) ? c.campos.type : null;
    if (c.campos.weekIndex !== undefined || seMuda) {
      const semana = acotar(c.campos.weekIndex ?? leida.weekIndex, destino.duracion);
      edicion.weekIndex = semana;
      if (seMuda) {
        edicion.phaseId = destino.phaseId;
        edicion.order = alFinal(destino.phaseId, semana);
      }
    }
    if (leida.source === "AGENT") edicion.source = "MODIFIED";
    const r = await tx.timelineTask.updateMany({ where: { id: c.id, phaseId: c.desdeFase }, data: edicion });
    if (r.count !== 1) throw new TareasQueNoCuadran(`La tarea ${c.id} cambió mientras se aplicaba.`);
    if (seMuda) mudadas++;
  }

  // 4) Las nuevas, al final de su semana: el `order` más alto leído en esa fase y semana + 1 (+ k).
  //    E3: la del chat o la que el chat retocó nace MODIFIED (la dictó una persona), y la del chat
  //    sin «por validar».
  const data: Prisma.TimelineTaskCreateManyInput[] = destinos.map(({ phaseId, duracion, n }) => {
    const semana = acotar(n.tarea.weekIndex, duracion);
    const order = alFinal(phaseId, semana);
    return {
      phaseId,
      title: n.tarea.title,
      weekIndex: semana,
      order,
      notes: n.tarea.notes,
      party: esParty(n.tarea.party) ? n.tarea.party : null,
      type: esTipo(n.tarea.type) ? n.tarea.type : null,
      status: "PENDING",
      source: n.porChat || n.retocada ? "MODIFIED" : "AGENT",
      needsValidation: n.tarea.needsValidation === true && !n.porChat,
    };
  });
  if (data.length > 0) await tx.timelineTask.createMany({ data });

  // 5) Qué fases existentes cambiaron de tareas: su cierre se recalcula (E3: también las que ganan o
  //    pierden una que se muda).
  const seVan = new Set(escrituras.seVan);
  const tocadas = new Set(destinos.map((d) => d.phaseId));
  for (const { c, destino } of cambios) {
    if (c.aFase === null) continue;
    tocadas.add(c.desdeFase);
    tocadas.add(destino.phaseId);
  }
  const fasesTocadas = [...existentes].flatMap(([id, f]) =>
    tocadas.has(id) || f.tareas.some((t) => seVan.has(t.id)) ? [id] : [],
  );
  return { creadas: data.length, borradas: escrituras.seVan.length, cambiadas: cambios.length, mudadas, fasesTocadas };
}
