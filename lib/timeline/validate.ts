/**
 * lib/timeline/validate.ts
 *
 * Validador del payload de cronograma (fases + tareas anidadas) — compartido
 * por el PUT /timeline (edición humana) y el POST /timeline/assist (propuesta
 * de la IA, que emite EXACTAMENTE este mismo shape para que aplicar la
 * propuesta sea un PUT normal). Server-side only.
 */
import type { TimelineActivityType } from "@prisma/client";

export const ACTIVITY_TYPES = [
  "EXPLORACION",
  "PLANIFICACION",
  "CONFIGURACION",
  "ADOPCION",
  "SEGUIMIENTO",
] as const;

export const PARTY_VALUES = ["CLIENTE", "SMARTEAM", "AMBOS"] as const;
export const TASK_TYPE_VALUES = ["SESSION", "TASK"] as const;

export interface TaskInput {
  id?: string;
  title: string;
  weekIndex: number;
  order: number;
  notes?: string | null;
  /** dueño: undefined = no tocar; null = sin dueño; valor = set */
  party?: (typeof PARTY_VALUES)[number] | null;
  /** tipo: undefined = no tocar; null = sin tipar; valor = set (SESSION | TASK) */
  type?: (typeof TASK_TYPE_VALUES)[number] | null;
}

export interface PhaseInput {
  id?: string;
  name: string;
  order: number;
  durationWeeks: number;
  /** Inicio explícito (offset 0-based). undefined = no tocar; null = contigua (auto); n≥0 = paralelo/solape. */
  startWeek?: number | null;
  sessionCount?: number | null;
  notes?: string | null;
  activityType?: TimelineActivityType | null;
  /** undefined = no tocar; [] = borrar todas; array = diff completo */
  tasks?: TaskInput[];
}

export interface PutBody {
  anchorStartDate?: string | null;
  phases: PhaseInput[];
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  parsed?: PutBody;
}

export function validateTimelinePayload(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") {
    return { valid: false, errors: ["Body debe ser un objeto JSON"] };
  }
  const body = raw as Record<string, unknown>;

  // anchorStartDate (opcional)
  let anchorStartDate: string | null = null;
  if (body.anchorStartDate !== undefined && body.anchorStartDate !== null) {
    if (typeof body.anchorStartDate !== "string") {
      errors.push("anchorStartDate debe ser string ISO o null");
    } else {
      const d = new Date(body.anchorStartDate);
      if (isNaN(d.getTime())) {
        errors.push("anchorStartDate no es una fecha ISO válida");
      } else {
        anchorStartDate = body.anchorStartDate;
      }
    }
  }

  // phases (obligatorio, array)
  if (!Array.isArray(body.phases)) {
    errors.push("phases debe ser un array");
    return { valid: false, errors };
  }

  const parsedPhases: PhaseInput[] = [];
  body.phases.forEach((p, idx) => {
    if (!p || typeof p !== "object") {
      errors.push(`phases[${idx}] debe ser un objeto`);
      return;
    }
    const ph = p as Record<string, unknown>;
    if (typeof ph.name !== "string" || ph.name.trim().length === 0) {
      errors.push(`phases[${idx}].name requerido (string no vacío)`);
      return;
    }
    if (typeof ph.order !== "number" || !Number.isInteger(ph.order) || ph.order < 0) {
      errors.push(`phases[${idx}].order requerido (entero >= 0)`);
      return;
    }
    if (typeof ph.durationWeeks !== "number" || !Number.isInteger(ph.durationWeeks) || ph.durationWeeks <= 0) {
      errors.push(`phases[${idx}].durationWeeks requerido (entero > 0)`);
      return;
    }
    let sessionCount: number | null = null;
    if (ph.sessionCount !== undefined && ph.sessionCount !== null) {
      if (typeof ph.sessionCount !== "number" || !Number.isInteger(ph.sessionCount) || ph.sessionCount <= 0) {
        errors.push(`phases[${idx}].sessionCount debe ser entero > 0 o null`);
        return;
      }
      sessionCount = ph.sessionCount;
    }

    // startWeek (opcional — undefined = no tocar; null = contigua/auto; n≥0 = inicio explícito/solape).
    // Overlap LIBRE: no se valida contra otras fases (fases en paralelo es el requisito).
    let startWeek: number | null | undefined = undefined;
    if (ph.startWeek !== undefined) {
      if (ph.startWeek === null) {
        startWeek = null;
      } else if (typeof ph.startWeek === "number" && Number.isInteger(ph.startWeek) && ph.startWeek >= 0) {
        startWeek = ph.startWeek;
      } else {
        errors.push(`phases[${idx}].startWeek debe ser entero >= 0 o null`);
        return;
      }
    }
    let notes: string | null = null;
    if (ph.notes !== undefined && ph.notes !== null) {
      if (typeof ph.notes !== "string") {
        errors.push(`phases[${idx}].notes debe ser string o null`);
        return;
      }
      notes = ph.notes;
    }
    let id: string | undefined;
    if (ph.id !== undefined) {
      if (typeof ph.id !== "string" || ph.id.length === 0) {
        errors.push(`phases[${idx}].id debe ser string no vacío si está presente`);
        return;
      }
      id = ph.id;
    }

    // activityType (opcional — undefined = sin cambio; null = quitar tipo)
    let activityType: TimelineActivityType | null | undefined = undefined;
    if (ph.activityType !== undefined) {
      if (ph.activityType === null) {
        activityType = null;
      } else if (
        typeof ph.activityType === "string" &&
        (ACTIVITY_TYPES as readonly string[]).includes(ph.activityType)
      ) {
        activityType = ph.activityType as TimelineActivityType;
      } else {
        errors.push(`phases[${idx}].activityType debe ser uno de ${ACTIVITY_TYPES.join("|")} o null`);
        return;
      }
    }

    // tasks (opcional — undefined = no tocar; [] = borrar todas)
    let tasks: TaskInput[] | undefined = undefined;
    if (ph.tasks !== undefined) {
      if (!Array.isArray(ph.tasks)) {
        errors.push(`phases[${idx}].tasks debe ser un array si está presente`);
        return;
      }
      const parsedTasks: TaskInput[] = [];
      let taskError = false;
      ph.tasks.forEach((t, tIdx) => {
        if (taskError) return;
        if (!t || typeof t !== "object") {
          errors.push(`phases[${idx}].tasks[${tIdx}] debe ser un objeto`);
          taskError = true;
          return;
        }
        const tk = t as Record<string, unknown>;
        if (typeof tk.title !== "string" || tk.title.trim().length === 0) {
          errors.push(`phases[${idx}].tasks[${tIdx}].title requerido (string no vacío)`);
          taskError = true;
          return;
        }
        if (
          typeof tk.weekIndex !== "number" ||
          !Number.isInteger(tk.weekIndex) ||
          tk.weekIndex < 0 ||
          tk.weekIndex >= (ph.durationWeeks as number)
        ) {
          errors.push(`phases[${idx}].tasks[${tIdx}].weekIndex debe ser entero en [0, durationWeeks)`);
          taskError = true;
          return;
        }
        if (typeof tk.order !== "number" || !Number.isInteger(tk.order) || tk.order < 0) {
          errors.push(`phases[${idx}].tasks[${tIdx}].order requerido (entero >= 0)`);
          taskError = true;
          return;
        }
        let tNotes: string | null = null;
        if (tk.notes !== undefined && tk.notes !== null) {
          if (typeof tk.notes !== "string") {
            errors.push(`phases[${idx}].tasks[${tIdx}].notes debe ser string o null`);
            taskError = true;
            return;
          }
          tNotes = tk.notes;
        }
        // party (opcional — undefined = sin cambio; null = sin dueño)
        let tParty: (typeof PARTY_VALUES)[number] | null | undefined = undefined;
        if (tk.party !== undefined) {
          if (tk.party === null) {
            tParty = null;
          } else if (typeof tk.party === "string" && (PARTY_VALUES as readonly string[]).includes(tk.party)) {
            tParty = tk.party as (typeof PARTY_VALUES)[number];
          } else {
            errors.push(`phases[${idx}].tasks[${tIdx}].party debe ser uno de ${PARTY_VALUES.join("|")} o null`);
            taskError = true;
            return;
          }
        }
        // type (opcional — undefined = sin cambio; null = sin tipar; valor = SESSION|TASK)
        let tType: (typeof TASK_TYPE_VALUES)[number] | null | undefined = undefined;
        if (tk.type !== undefined) {
          if (tk.type === null) {
            tType = null;
          } else if (typeof tk.type === "string" && (TASK_TYPE_VALUES as readonly string[]).includes(tk.type)) {
            tType = tk.type as (typeof TASK_TYPE_VALUES)[number];
          } else {
            errors.push(`phases[${idx}].tasks[${tIdx}].type debe ser uno de ${TASK_TYPE_VALUES.join("|")} o null`);
            taskError = true;
            return;
          }
        }
        let tId: string | undefined;
        if (tk.id !== undefined) {
          if (typeof tk.id !== "string" || tk.id.length === 0) {
            errors.push(`phases[${idx}].tasks[${tIdx}].id debe ser string no vacío si está presente`);
            taskError = true;
            return;
          }
          tId = tk.id;
        }
        parsedTasks.push({
          id: tId,
          title: tk.title.trim(),
          weekIndex: tk.weekIndex,
          order: tk.order,
          notes: tNotes,
          party: tParty,
          type: tType,
        });
      });
      if (taskError) return;
      tasks = parsedTasks;
    }

    parsedPhases.push({
      id,
      name: ph.name.trim(),
      order: ph.order,
      durationWeeks: ph.durationWeeks,
      startWeek,
      sessionCount,
      notes,
      activityType,
      tasks,
    });
  });

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, parsed: { anchorStartDate, phases: parsedPhases } };
}
