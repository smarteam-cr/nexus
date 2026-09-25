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
 *   · Solo CREA y BORRA. En E2a nadie propone editar ni mudar una tarea (eso es E3).
 *   · Borra con la regla de siempre en el `where` (pendiente y no escrita a mano): el plan ya dejó
 *     afuera lo que tiene avance, y esta es la segunda red. Si se borra otra cantidad que la que se
 *     vio, no se aplica nada (PLAN_CAMBIO): nunca se borra otra cosa de la que el CSE revisó.
 *   · Crea en UN solo `createMany`, al final de su semana, sin renumerar las que ya estaban.
 *   · ⛔ NUNCA parchea la foto publicada (`patchBaselinePhaseTasks`): el parche absorbería en la
 *     promesa los movimientos que el CSE hizo a mano a las que quedan (foto-del-plan.ts). Una tarea
 *     nueva no entra en la foto y una borrada se queda en ella, que es lo correcto.
 *   · Pocas llamadas: 1 `deleteMany` + 1 `createMany`, nunca una por tarea (Wherex ronda las 300).
 */
import type { Prisma, TaskParty, TimelineTaskType } from "@prisma/client";
import { PARTY_VALUES, TASK_TYPE_VALUES } from "./validate";
import type { EscriturasDeTareas } from "./borrador";

/** Lo que el escritor usa del `tx`. */
export type TxDeTareas = Pick<Prisma.TransactionClient, "timelineTask">;

/** Una fase EXISTENTE tal como se leyó en la transacción, con la duración con que queda. */
export interface FaseParaTareas {
  /** La duración FINAL (la del plan si la cambia; si no, la leída). */
  durationWeeks: number;
  tareas: ReadonlyArray<{ id: string; weekIndex: number; order: number }>;
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
  /** Las fases EXISTENTES con alguna tarea creada o borrada (para su cierre), en el orden de `existentes`. */
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

  // 1) Cada tarea nueva, a su fase real. Si alguna no resuelve, no se escribe nada (red de seguridad:
  //    el plan nunca manda una así).
  const destinos = escrituras.nuevas.map((n) => {
    if (n.fase.tipo === "existente") {
      const f = existentes.get(n.fase.id);
      if (!f) throw new TareasQueNoCuadran(`La fase ${n.fase.id} no está en el cronograma.`);
      return { phaseId: n.fase.id, duracion: f.durationWeeks, n };
    }
    const creada = nuevas.get(n.fase.clave);
    if (!creada) throw new TareasQueNoCuadran(`La fase nueva ${n.fase.clave} no se creó.`);
    return { phaseId: creada.id, duracion: creada.durationWeeks, n };
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

  // 3) Las nuevas, al final de su semana: el `order` más alto leído en esa fase y semana + 1 (+ k).
  //    Las leídas se acotan a la duración final igual que las acomoda la estructura al acortar.
  const maximos = new Map<string, number>();
  const llave = (phaseId: string, semana: number) => `${phaseId}|${semana}`;
  for (const [id, f] of existentes) {
    for (const t of f.tareas) {
      const k = llave(id, acotar(t.weekIndex, f.durationWeeks));
      maximos.set(k, Math.max(maximos.get(k) ?? -1, t.order));
    }
  }
  const data: Prisma.TimelineTaskCreateManyInput[] = destinos.map(({ phaseId, duracion, n }) => {
    const semana = acotar(n.tarea.weekIndex, duracion);
    const k = llave(phaseId, semana);
    const order = (maximos.get(k) ?? -1) + 1;
    maximos.set(k, order);
    return {
      phaseId,
      title: n.tarea.title,
      weekIndex: semana,
      order,
      notes: n.tarea.notes,
      party: esParty(n.tarea.party) ? n.tarea.party : null,
      type: esTipo(n.tarea.type) ? n.tarea.type : null,
      status: "PENDING",
      source: "AGENT",
      needsValidation: n.tarea.needsValidation === true,
    };
  });
  if (data.length > 0) await tx.timelineTask.createMany({ data });

  // 4) Qué fases existentes cambiaron de tareas: su cierre se recalcula.
  const seVan = new Set(escrituras.seVan);
  const conNuevas = new Set(destinos.map((d) => d.phaseId));
  const fasesTocadas = [...existentes].flatMap(([id, f]) =>
    conNuevas.has(id) || f.tareas.some((t) => seVan.has(t.id)) ? [id] : [],
  );
  return { creadas: data.length, borradas: escrituras.seVan.length, fasesTocadas };
}
