/**
 * lib/casos-de-uso/actividades-puras.ts — lo de las actividades que necesita una pantalla de cliente, SIN zod
 * (2026-11-08): las etapas, las tarifas y los formatos. `actividades.ts` (con la validación, que pesa zod) lo re-exporta;
 * un componente de cliente importa de aquí (lib/auth/client-safe.test.ts › C-24).
 */

export const ETAPAS_DE_ACTIVIDAD = [
  { clave: "sin-etapa", nombre: "De todo el proyecto" },
  { clave: "01-diagnostico", nombre: "Diagnóstico" },
  { clave: "02-planificacion", nombre: "Planificación" },
  { clave: "03-implementacion", nombre: "Implementación" },
  { clave: "04-adopcion", nombre: "Adopción" },
  { clave: "05-aprendizaje", nombre: "Aprendizaje" },
] as const;
export type EtapaDeActividad = (typeof ETAPAS_DE_ACTIVIDAD)[number]["clave"];

/** Cómo se cobra dentro de una venta: una vez en toda la venta, una vez si es sobre lo mismo, o en cada caso. */
export type ComoSeComparte = "venta" | "sobreQue" | "no";

/** La tarifa por hora de cada segmento, en dólares. La gestión va dentro de la tarifa. */
export const TARIFAS = [
  { clave: "estandar", nombre: "Estándar", usdPorHora: 80 },
  { clave: "corporativo", nombre: "Corporativo", usdPorHora: 100 },
  { clave: "gobierno", nombre: "Gobierno", usdPorHora: 120 },
] as const;

const ARTICULOS = new Set(["el", "la", "los", "las", "un", "una", "de", "del", "y", "a"]);

/**
 * El «sobre qué» que vale la pena mostrar junto al nombre: vacío si el nombre ya lo dice («Revisar uso y resultados a
 * los 30 días» no repite «a los 30 días»). Lo que va entre «<…>» es un nombre por llenar y no cuenta.
 */
export function sobreQueAparte(f: { nombre: string; sobreQue: string }): string {
  // Por palabras y sin artículos: «Importar los contactos y las empresas» ya dice «contactos y empresas».
  const palabras = (s: string) => s.toLowerCase().replace(/<[^>]*>/g, " ").split(/[^\p{L}\d-]+/u).filter((p) => p && !ARTICULOS.has(p));
  const nucleo = palabras(f.sobreQue);
  const nombre = new Set(palabras(f.nombre));
  return nucleo.length && nucleo.every((p) => nombre.has(p)) ? "" : f.sobreQue;
}

/** `28.5` → «28,5 h». Sin `toLocaleString`: el separador no puede depender del Node o del navegador. */
export function formatoHoras(h: number): string {
  const r = Math.round(h * 10) / 10;
  return `${Number.isInteger(r) ? String(r) : r.toFixed(1).replace(".", ",")} h`;
}

/** `2280` → «2.280 USD». */
export function formatoUsd(n: number): string {
  return `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} USD`;
}
