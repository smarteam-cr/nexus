/**
 * lib/exploraciones/reuniones-de-trabajo.ts — LAS REUNIONES DE TRABAJO QUE NEXUS SUGIERE sumar a la preventa de un cliente
 * (24 nov, el TEC; docs/diagnostico-con-lo-que-sabemos-plan.md, etapa 2). PURO y client-safe.
 *
 * Un cliente ya tuvo reuniones con Smarteam (capacitaciones, revisiones de avance). Las que sirven para el diagnóstico son
 * las que la EMPRESA habló: el Resumen marca «mal leída» una reunión donde la empresa dijo menos del 28 % de lo dicho
 * (`PARTE_MINIMA_DEL_CLIENTE`, resumen-de-la-escala.ts), y en una capacitación habla sobre todo Smarteam. Por eso se
 * sugieren por cuánto habló el cliente, primero la mejor de cada equipo (así no salen todas de Ventas) y después las demás;
 * a igual parte, la más nueva. Las de menos del mínimo van al final, marcadas: la persona decide.
 * Una reunión donde la empresa no habló nada (de puertas adentro, o sin saber quién habló) no se sugiere.
 */
import { sugerirEquipo, type ClaveDeEquipo } from "./equipos";

/** Cuántas sugiere, como mucho. */
export const MAX_REUNIONES_DE_TRABAJO_SUGERIDAS = 12;

export interface ReunionDeTrabajoSugerida {
  sessionId: string;
  titulo: string;
  /** ISO. */
  fecha: string;
  /** Qué parte de lo dicho dijo la empresa, de 0 a 100. */
  delCliente: number;
  /** El equipo que sugiere su título («AE | Reportes de Ventas» → Ventas), o null. */
  equipo: ClaveDeEquipo | null;
  /** La empresa dijo menos del mínimo: el Resumen la marcaría «mal leída». */
  pocoDelCliente: boolean;
}

export function sugerirReunionesDeTrabajo(
  reuniones: readonly { sessionId: string; title: string; date: string; texto: string }[],
  /** El porcentaje de lo dicho por la empresa en cada reunión (lib/analizador-venta/quien-hablo.ts), o null si no se sabe. */
  delCliente: ReadonlyMap<string, number | null>,
  o: { minimo: number; cuantas?: number },
): ReunionDeTrabajoSugerida[] {
  const candidatas = reuniones.flatMap((r) => {
    const parte = delCliente.get(r.sessionId);
    if (r.texto !== "transcripcion" || parte === null || parte === undefined || parte <= 0) return [];
    return [{ sessionId: r.sessionId, titulo: r.title, fecha: r.date, delCliente: Math.round(parte), equipo: sugerirEquipo([r.title]), pocoDelCliente: parte < o.minimo * 100 }];
  });
  const porParte = [...candidatas].sort(
    (a, b) => Number(a.pocoDelCliente) - Number(b.pocoDelCliente) || b.delCliente - a.delCliente || Date.parse(b.fecha) - Date.parse(a.fecha),
  );
  // Primero la mejor de cada equipo (sin equipo cuenta como uno más), en el orden de su parte; después las demás.
  const vistos = new Set<string>();
  const primeras = porParte.filter((r) => {
    if (r.pocoDelCliente) return false;
    const k = r.equipo ?? "";
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
  const resto = porParte.filter((r) => !primeras.includes(r));
  return [...primeras, ...resto].slice(0, o.cuantas ?? MAX_REUNIONES_DE_TRABAJO_SUGERIDAS);
}
