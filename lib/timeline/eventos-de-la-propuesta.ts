/**
 * lib/timeline/eventos-de-la-propuesta.ts — LOS EVENTOS DEL WATCHDOG DE LO QUE DICTÓ EL CHAT (E3, D15).
 *
 * Puro (sin base ni red). Con una propuesta abierta, lo que acuerda el chat va a la propuesta y ya no
 * pasa por el PUT del cronograma, que es el que hoy emite los eventos por fase y por tarea
 * (app/api/projects/[projectId]/timeline/route.ts). Sin esto, el watchdog de Éxito del cliente dejaría
 * de enterarse de lo que el CSE pidió por chat. La ruta de aplicar los emite DESPUÉS de la transacción,
 * best-effort y con `source: "AI_ASSIST_APPLY"`, con las mismas acciones que el PUT:
 *   · PHASE CREATED; PHASE DELETED solo si la fase se borró de verdad (una que se queda con lo suyo
 *     emite el TASK DELETED de cada tarea que se fue); PHASE MOVED si cambia la duración, el inicio o
 *     el orden, EDITED si cambia otro campo (las notas no cuentan, como en el PUT);
 *   · TASK CREATED y TASK DELETED; TASK MOVED si cambia la semana o la fase, EDITED si no.
 * Solo lo `porChat` aplicado: lo de la IA sigue sin eventos por tarea (aplicar una propuesta de la IA
 * nunca los emitió). El arranque no va acá: la ruta ya emite ANCHOR_CHANGED para cualquier arranque.
 */
import { diffFields, type DraftEvent } from "@/lib/cs/timeline-events";
import type { CambioFaseCambia, Lugar, PlanDeAplicacion, TareaDelVivo, Vivo } from "./borrador";

/** Las notas son cosméticas para el watchdog (la misma regla del PUT). */
const CAMPOS_DE_FASE_CON_EVENTO = ["name", "durationWeeks", "startWeek", "sessionCount", "activityType"] as const;
const MUEVEN_LA_FASE = ["durationWeeks", "startWeek", "order"];
const MUEVEN_LA_TAREA = ["weekIndex", "fase"];

const semanaAcotada = (semana: number, duracion: number) => Math.min(semana, Math.max(duracion - 1, 0));

/**
 * Los eventos de lo que dictó el chat y se aplicó. `fasesBorradas`: los ids de las fases que la
 * transacción borró enteras. `fasesCreadas`: la clave de cada fase nueva y su id real (sin él, el
 * evento va sin `entityId`, como el TASK CREATED del PUT).
 */
export function eventosDelChatAplicado(
  plan: PlanDeAplicacion,
  vivo: Vivo,
  fasesBorradas: readonly string[],
  fasesCreadas: ReadonlyArray<{ clave: string; id: string }> = [],
): DraftEvent[] {
  const delChat = plan.aplicadas.filter((c) => c.porChat);
  if (delChat.length === 0) return [];

  const vivas = new Map(vivo.fases.map((f, i) => [f.id, { fase: f, orden: i }]));
  const tareas = new Map<string, { tarea: TareaDelVivo; faseId: string }>();
  for (const f of vivo.fases) for (const t of f.tareas ?? []) tareas.set(t.id, { tarea: t, faseId: f.id });
  const ordenFinal = new Map(plan.escrituras.orden.map((l, i) => [l.tipo === "existente" ? l.id : l.clave, i]));
  const camposFinales = new Map(plan.escrituras.fases.map((f) => [f.id, f.campos]));
  const nuevas = new Map(plan.escrituras.nuevas.map((n) => [n.clave, n.fase]));
  const idCreada = new Map(fasesCreadas.map((c) => [c.clave, c.id]));
  const borradas = new Set(fasesBorradas);

  /** El nombre y la duración con que queda una fase (una existente con sus campos aplicados, o una nueva). */
  const faseFinal = (clave: string): { nombre: string; semanas: number } => {
    const nueva = nuevas.get(clave);
    if (nueva) return { nombre: nueva.name, semanas: nueva.durationWeeks };
    const viva = vivas.get(clave)?.fase;
    const campos = camposFinales.get(clave) ?? {};
    return {
      nombre: "name" in campos ? String(campos.name) : (viva?.name ?? clave),
      semanas: "durationWeeks" in campos ? Number(campos.durationWeeks) : (viva?.durationWeeks ?? 1),
    };
  };
  const claveDelLugar = (l: Lugar) => (l.tipo === "existente" ? l.id : l.clave);

  const eventos: DraftEvent[] = [];

  // ── Las fases ──
  for (const c of delChat) {
    if (c.tipo !== "fase-nueva") continue;
    eventos.push({
      entityType: "PHASE",
      entityId: idCreada.get(c.clave) ?? null,
      label: c.fase.name,
      action: "CREATED",
      after: { order: ordenFinal.get(c.clave) ?? null, durationWeeks: c.fase.durationWeeks, startWeek: c.fase.startWeek },
    });
  }
  /* Un campo o el orden que dictó el chat, por fase existente y una sola vez (como el PUT, que emite un
     evento por fila que cambia). Solo lo del chat: un cambio de la IA de la misma fase no entra. */
  const camposDelChat = new Map<string, CambioFaseCambia[]>();
  for (const c of delChat) {
    if (c.tipo === "fase-cambia") camposDelChat.set(c.faseId, [...(camposDelChat.get(c.faseId) ?? []), c]);
  }
  const ordenDelChat = delChat.some((c) => c.tipo === "orden");
  for (const [id, { fase, orden }] of vivas) {
    if (!ordenFinal.has(id)) continue; // se borró: su evento es DELETED
    const cambios = camposDelChat.get(id) ?? [];
    const nuevoOrden = ordenFinal.get(id)!;
    if (cambios.length === 0 && !(ordenDelChat && nuevoOrden !== orden)) continue;
    const antes: Record<string, unknown> = {
      name: fase.name,
      order: orden,
      durationWeeks: fase.durationWeeks,
      startWeek: fase.startWeek ?? null,
      sessionCount: fase.sessionCount ?? null,
      activityType: fase.activityType ?? null,
    };
    const despues: Record<string, unknown> = { ...antes, ...(ordenDelChat ? { order: nuevoOrden } : {}) };
    for (const c of cambios) {
      if ((CAMPOS_DE_FASE_CON_EVENTO as readonly string[]).includes(c.campo)) despues[c.campo] = c.a;
    }
    const d = diffFields(antes, despues);
    if (!d) continue;
    eventos.push({
      entityType: "PHASE",
      entityId: id,
      label: String(despues.name),
      action: MUEVEN_LA_FASE.some((k) => k in d.after) ? "MOVED" : "EDITED",
      before: d.before,
      after: d.after,
    });
  }
  const seVanPorElChat = new Set(delChat.flatMap((c) => (c.tipo === "fase-se-va" ? [c.faseId] : [])));
  for (const f of plan.escrituras.fasesQueSeVan ?? []) {
    if (!seVanPorElChat.has(f.id)) continue;
    const viva = vivas.get(f.id);
    if (borradas.has(f.id)) {
      eventos.push({
        entityType: "PHASE",
        entityId: f.id,
        label: viva?.fase.name ?? "(fase)",
        action: "DELETED",
        before: { order: viva?.orden, durationWeeks: viva?.fase.durationWeeks, tasks: viva?.fase.tareas?.length ?? 0 },
      });
      continue;
    }
    // Se quedó con lo suyo: se fueron solo sus pendientes, una por una.
    for (const id of f.borrar) {
      const t = tareas.get(id)?.tarea;
      eventos.push({
        entityType: "TASK",
        entityId: id,
        label: t?.title ?? "(tarea)",
        action: "DELETED",
        before: { weekIndex: t?.weekIndex, party: t?.party ?? null, type: t?.type ?? null },
      });
    }
  }

  // ── Las tareas ──
  const cambian = new Map((plan.escrituras.tareas.cambian ?? []).map((c) => [c.id, c]));
  for (const c of delChat) {
    if (c.tipo === "tarea-nueva") {
      eventos.push({
        entityType: "TASK",
        label: c.tarea.title,
        action: "CREATED",
        after: {
          weekIndex: semanaAcotada(c.tarea.weekIndex, faseFinal(c.fase).semanas),
          party: c.tarea.party,
          type: c.tarea.type,
        },
      });
    } else if (c.tipo === "tarea-se-va") {
      const t = tareas.get(c.tareaId)?.tarea;
      eventos.push({
        entityType: "TASK",
        entityId: c.tareaId,
        label: t?.title ?? c.desde.title,
        action: "DELETED",
        before: { weekIndex: t?.weekIndex ?? c.desde.weekIndex, party: t?.party ?? null, type: t?.type ?? null },
      });
    } else if (c.tipo === "tarea-cambia") {
      const viva = tareas.get(c.tareaId);
      const escrita = cambian.get(c.tareaId);
      if (!viva || !escrita) continue;
      const t = viva.tarea;
      const destino = escrita.aFase === null ? viva.faseId : claveDelLugar(escrita.aFase);
      // La fase solo entra al diff si se muda (un renombre de su fase no es mover la tarea).
      const faseAntes = vivas.get(viva.faseId)?.fase.name ?? viva.faseId;
      const antes = {
        title: t.title,
        weekIndex: t.weekIndex,
        party: t.party ?? null,
        type: t.type ?? null,
        fase: faseAntes,
      };
      const despues = {
        title: escrita.campos.title ?? t.title,
        weekIndex: semanaAcotada(escrita.campos.weekIndex ?? t.weekIndex, faseFinal(destino).semanas),
        party: escrita.campos.party !== undefined ? escrita.campos.party : (t.party ?? null),
        type: escrita.campos.type !== undefined ? escrita.campos.type : (t.type ?? null),
        fase: escrita.aFase === null ? faseAntes : faseFinal(destino).nombre,
      };
      const d = diffFields(antes, despues);
      if (!d) continue;
      eventos.push({
        entityType: "TASK",
        entityId: c.tareaId,
        label: despues.title,
        action: MUEVEN_LA_TAREA.some((k) => k in d.after) ? "MOVED" : "EDITED",
        before: d.before,
        after: d.after,
      });
    }
  }
  return eventos;
}

/** Cuántos de los cambios aplicados dictó el chat: la razón de la auditoría lo dice « (N del chat)». */
export const aplicadosDelChat = (plan: Pick<PlanDeAplicacion, "aplicadas">): number =>
  plan.aplicadas.filter((c) => c.porChat).length;
