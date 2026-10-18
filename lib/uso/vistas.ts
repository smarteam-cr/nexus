/**
 * lib/uso/vistas.ts — las pestañas de «Uso de Nexus» (`?vista=`) y la ventana de las de IA (`?dias=`). PURO: lo leen
 * la página (servidor) y las pestañas (cliente). No puede vivir en el componente de cliente: un Server Component que
 * importa un valor de un módulo "use client" recibe una referencia, no el valor (lib/ui/funciones-de-cliente.test.ts).
 */
export type VistaDeUso = "equipo" | "propuesto" | "clientes" | "procesos" | "conclusiones" | "reuniones";

export const VISTAS_DE_USO: readonly VistaDeUso[] = ["equipo", "propuesto", "clientes", "procesos", "conclusiones", "reuniones"];

/** Las pestañas que leen el gasto de IA y aceptan `?dias=30|90`. */
export const VISTAS_CON_PERIODO: readonly VistaDeUso[] = ["clientes", "procesos", "conclusiones"];

export const DIAS_POSIBLES = [30, 90] as const;
export type DiasDeIa = (typeof DIAS_POSIBLES)[number];

export function direccionDeUso(vista: VistaDeUso, dias?: DiasDeIa): string {
  const q = new URLSearchParams();
  if (vista !== "equipo") q.set("vista", vista);
  if (dias && dias !== 30 && VISTAS_CON_PERIODO.includes(vista)) q.set("dias", String(dias));
  const s = q.toString();
  return s ? `/para-ti/uso?${s}` : "/para-ti/uso";
}
