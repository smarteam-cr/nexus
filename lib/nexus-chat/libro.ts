/**
 * lib/nexus-chat/libro.ts — la LISTA de cambios del chat de Nexus a lo largo de la conversación. PURO.
 *
 * Un turno puede proponer cambios y la persona puede no aplicarlos todavía: siguen pendientes y el turno siguiente los
 * arrastra (la lista vive en el acuerdo del último mensaje del asistente, como en los otros dos chats:
 * lib/asistente/acuerdo-vivo.ts). Acá se lee lo pendiente de un hilo y se arma el acuerdo nuevo:
 *
 *   · lo pendiente que sigue en pie (ya revalidado contra hoy), menos lo que el modelo soltó;
 *   · lo nuevo de este turno, sin repetir lo que ya estaba;
 *   · si no queda nada y algo se soltó, el acuerdo de CIERRE (corta la lista y apaga el botón del acuerdo de antes).
 *
 * El acuerdo guarda, por cambio, la operación de la capa y su entrada ya acotada a la cuenta (`{ nombre, entrada }`), y
 * su línea en castellano. Al aplicar se vuelve a preparar: lo guardado nunca se aplica tal cual.
 */
import type { CambioAcordado } from "@/lib/asistente/acuerdo";
import { leerAcuerdo } from "@/lib/asistente/acuerdo";
import { acuerdoPendienteDelHilo, type TurnoDelLibro } from "@/lib/asistente/acuerdo-vivo";
import { COMO_SE_ACOTA } from "./alcance";
import type { CambioPropuesto } from "./bucle";

/** Lo que guarda el acuerdo por cada cambio. */
export interface CambioGuardado {
  nombre: string;
  entrada: unknown;
}

export const RESUMEN_DE_LA_LISTA = "Cambios para aplicar en esta cuenta.";
export const RESUMEN_DEL_CIERRE_DE_NEXUS = "Lo que estaba en la lista ya no va.";

/** ¿Es un cambio del chat de Nexus? (un acuerdo de otro chat no lo es) */
export function esCambioDeNexus(o: unknown): o is CambioGuardado {
  if (!o || typeof o !== "object" || Array.isArray(o)) return false;
  const n = (o as { nombre?: unknown }).nombre;
  return typeof n === "string" && Object.prototype.hasOwnProperty.call(COMO_SE_ACOTA, n) && "entrada" in (o as object);
}

/** Lo pendiente del hilo: los cambios del último acuerdo sin aplicar, con sus líneas. Solo turnos del asistente. */
export function pendientesDeNexus(turnos: readonly TurnoDelLibro[]): Array<CambioGuardado & { linea: string }> {
  const pend = acuerdoPendienteDelHilo(turnos.filter((t) => t.rol !== "CSE"));
  if (!pend) return [];
  return pend.operaciones.flatMap((o, i) => (esCambioDeNexus(o) ? [{ nombre: o.nombre, entrada: o.entrada, linea: pend.lineas[i] ?? o.nombre }] : []));
}

const clave = (c: CambioGuardado) => `${c.nombre}:${JSON.stringify(c.entrada)}`;

/** Arma el acuerdo del turno. null = no hay lista que mostrar. */
export function componerAcuerdo(o: {
  /** Lo pendiente que sigue en pie, en el orden en que se le mostró al modelo (P1, P2…). */
  vivas: readonly CambioPropuesto[];
  /** Lo pendiente que se cayó al revalidar, con su motivo. */
  caidas: ReadonlyArray<{ linea: string; motivo: string }>;
  /** Los índices de `vivas` que el modelo soltó. */
  descartar: readonly number[];
  /** Lo nuevo de este turno. */
  nuevos: readonly CambioPropuesto[];
}): CambioAcordado | null {
  const fuera = new Set(o.descartar.filter((i) => i >= 0 && i < o.vivas.length));
  const quedan = o.vivas.filter((_, i) => !fuera.has(i));
  const vistos = new Set(quedan.map(clave));
  const nuevos = o.nuevos.filter((c) => {
    const k = clave(c);
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
  const todos = [...quedan, ...nuevos];
  const soltadas = [...o.caidas.map((c) => `${c.linea} (${c.motivo})`), ...o.vivas.filter((_, i) => fuera.has(i)).map((c) => c.linea)];
  if (todos.length) {
    return {
      resumen: RESUMEN_DE_LA_LISTA,
      operaciones: todos.map((c) => ({ nombre: c.nombre, entrada: c.entrada })),
      lineas: todos.map((c) => c.linea),
      // Cada cambio es independiente: desmarcar uno no arrastra a otro.
      dependencias: todos.map(() => []),
      ...(quedan.length ? { arrastradas: quedan.map((_, i) => i) } : {}),
      ...(o.caidas.length ? { descartadas: o.caidas.map((c) => `${c.linea} (${c.motivo})`) } : {}),
    };
  }
  if (soltadas.length) return { resumen: RESUMEN_DEL_CIERRE_DE_NEXUS, operaciones: [], descartadas: soltadas };
  return null;
}

/** Los cambios de un acuerdo guardado, o null si no es del chat de Nexus. */
export function cambiosDelAcuerdo(contenido: string): { acuerdo: CambioAcordado; cambios: CambioGuardado[] } | null {
  const { acuerdo } = leerAcuerdo(contenido);
  const ops = acuerdo?.operaciones;
  if (!acuerdo || !Array.isArray(ops) || !ops.length || !ops.every(esCambioDeNexus)) return null;
  return { acuerdo, cambios: ops as CambioGuardado[] };
}
