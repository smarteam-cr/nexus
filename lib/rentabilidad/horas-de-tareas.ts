/**
 * lib/rentabilidad/horas-de-tareas.ts — las horas de las tareas internas hechas para una cuenta. PURO.
 *
 * Una tarea de Tareas internas (`Tarea`) es trabajo con la cuenta fuera de una reunión. Cuánto tomó sale, en orden:
 *  1. Lo que duraron sus BLOQUES en la agenda (`agendaBloques`, el evento privado que crea Nexus): es tiempo puesto en
 *     el calendario de quien lo hizo, sin que nadie lo marque. Va a la dueña del bloque, en el mes del bloque.
 *  2. Sin bloque, su estimado (`minutosEstimados`): va a quien la tiene, en el mes en que se terminó, como ESTIMADO.
 *  3. Sin ninguno de los dos, no suma: se cuenta cuántas son. No se inventan horas.
 *
 * ⛔ Una tarea de clase «reunion» nunca suma: sus horas son las de la reunión (la de Meet o la del calendario). Si
 * sumara, la misma hora se contaría dos veces. Lo mismo un bloque: nunca entra como reunión del calendario
 * (lib/rentabilidad/horas-del-calendario.ts lo descarta), solo por su tarea.
 *
 * Mismos topes que una reunión (lib/carga/reuniones.ts): un bloque de 8 horas o más es de día completo y no cuenta, y
 * los demás se topan en 4 horas.
 */
import { minutosContables } from "@/lib/carga/reuniones";

export interface BloqueDeTarea {
  /** El correo de la dueña del bloque. */
  calendario: string;
  inicio: string;
  fin: string;
}

export interface TareaParaMargen {
  id: string;
  clienteId: string;
  responsableEmail: string | null;
  clase: string;
  estado: string;
  completadaAt: Date | string | null;
  minutosEstimados: number | null;
  bloques: readonly BloqueDeTarea[];
}

export interface HorasDeTareasDeLaPersona {
  /** De los bloques en la agenda. */
  agenda: number;
  /** De su estimado, sin bloque. */
  estimadas: number;
}

export interface HorasDeTareas {
  /** clienteId → correo → horas. */
  porCuenta: Map<string, Map<string, HorasDeTareasDeLaPersona>>;
  cuenta: { hechas: number; conBloque: number; conEstimado: number; sinTiempo: number; reuniones: number };
}

const dentro = (ms: number, r: { desde: Date; hasta: Date }) => ms >= +r.desde && ms < +r.hasta;

/** Lee los bloques guardados en `Tarea.agendaBloques` (Json), tolerante: lo que no tiene forma se ignora. */
export function leerBloques(json: unknown): BloqueDeTarea[] {
  if (!Array.isArray(json)) return [];
  const out: BloqueDeTarea[] = [];
  for (const b of json) {
    if (!b || typeof b !== "object") continue;
    const { calendario, inicio, fin } = b as Record<string, unknown>;
    if (typeof calendario === "string" && typeof inicio === "string" && typeof fin === "string" && !Number.isNaN(Date.parse(inicio)) && !Number.isNaN(Date.parse(fin))) {
      out.push({ calendario: calendario.trim().toLowerCase(), inicio, fin });
    }
  }
  return out;
}

/** Las horas de las tareas hechas, por cuenta y por persona, en el rango. */
export function horasDeTareas(tareas: readonly TareaParaMargen[], rango: { desde: Date; hasta: Date }): HorasDeTareas {
  const porCuenta = new Map<string, Map<string, HorasDeTareasDeLaPersona>>();
  const cuenta = { hechas: 0, conBloque: 0, conEstimado: 0, sinTiempo: 0, reuniones: 0 };
  const sumar = (clienteId: string, email: string, campo: keyof HorasDeTareasDeLaPersona, h: number) => {
    if (h <= 0) return;
    const personas = porCuenta.get(clienteId) ?? new Map<string, HorasDeTareasDeLaPersona>();
    const x = personas.get(email) ?? { agenda: 0, estimadas: 0 };
    x[campo] += h;
    personas.set(email, x);
    porCuenta.set(clienteId, personas);
  };

  for (const t of tareas) {
    if (t.estado !== "hecha" || !t.completadaAt) continue;
    if (t.clase === "reunion") {
      cuenta.reuniones++;
      continue;
    }
    const bloques = t.bloques.filter((b) => minutosContables((Date.parse(b.fin) - Date.parse(b.inicio)) / 60_000) !== null);
    if (bloques.length > 0) {
      let alguno = false;
      for (const b of bloques) {
        if (!dentro(Date.parse(b.inicio), rango)) continue;
        alguno = true;
        sumar(t.clienteId, b.calendario, "agenda", (minutosContables((Date.parse(b.fin) - Date.parse(b.inicio)) / 60_000) ?? 0) / 60);
      }
      if (alguno) {
        cuenta.hechas++;
        cuenta.conBloque++;
      }
      continue;
    }
    if (!dentro(+new Date(t.completadaAt), rango)) continue;
    cuenta.hechas++;
    const email = t.responsableEmail?.trim().toLowerCase();
    if (t.minutosEstimados && t.minutosEstimados > 0 && email) {
      cuenta.conEstimado++;
      sumar(t.clienteId, email, "estimadas", Math.min(t.minutosEstimados, 8 * 60) / 60);
    } else {
      cuenta.sinTiempo++;
    }
  }
  return { porCuenta, cuenta };
}
