/**
 * lib/uso/vistas.ts — las pestañas de «Uso de Nexus» (`?vista=`). PURO: lo leen la página (servidor) y las pestañas
 * (cliente). No puede vivir en el componente de cliente: un Server Component que importa un valor de un módulo
 * "use client" recibe una referencia, no el valor (lib/ui/funciones-de-cliente.test.ts).
 */
export type VistaDeUso = "equipo" | "propuesto" | "reuniones";

export const VISTAS_DE_USO: readonly VistaDeUso[] = ["equipo", "propuesto", "reuniones"];
