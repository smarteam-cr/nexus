/**
 * lib/rentabilidad/lectura/estado.ts — el ciclo de vida de una propuesta de la lectura de los números. PURO.
 *
 * Mismo ciclo que todo lo que propone Nexus (lib/lo-propuesto/tipos.ts): pendiente, usado, desestimado o vencido.
 * Vencido = pendiente de más de `DIAS_PARA_VENCER` días: se calcula al leer, no se guarda, y decidir después sigue
 * valiendo. Solo lo USADO vale: lo pendiente se muestra como «Nexus propone».
 */
export const DIAS_PARA_VENCER = 30;

export type EstadoGuardado = "pendiente" | "usado" | "desestimado";
export type EstadoDeLaPropuesta = EstadoGuardado | "vencido";

export function estadoDeLaPropuesta(p: { estado: string; createdAt: Date | string }, ahora: Date): EstadoDeLaPropuesta {
  if (p.estado === "usado" || p.estado === "desestimado") return p.estado;
  return ahora.getTime() - new Date(p.createdAt).getTime() > DIAS_PARA_VENCER * 86_400_000 ? "vencido" : "pendiente";
}

/** Una propuesta pendiente (o vencida, que se puede decidir igual) se decide; una ya decidida no. */
export function sePuedeDecidir(estado: string): boolean {
  return estado === "pendiente";
}

/** El mes de la lectura automática: el día 4 desde las 8:00 de Costa Rica lee el mes que cerró. null si no toca. */
export function mesQueTocaLeer(ahora: Date): string | null {
  const x = new Date(+ahora - 6 * 3_600_000);
  if (x.getUTCDate() < 4) return null;
  if (x.getUTCDate() === 4 && x.getUTCHours() < 8) return null;
  const t = x.getUTCFullYear() * 12 + x.getUTCMonth() - 1;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
