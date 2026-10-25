/**
 * lib/clients/copia-de-hubspot.ts — qué se trae de la empresa de HubSpot a Nexus en la copia de cada hora (R2,
 * 2026-10-25). PURO.
 *
 * Lo que alguien cambia en HubSpot (Ventas edita los empleados, la industria) vuelve a Nexus como cualquier otra fuente
 * (`hubspot`), y la regla de quién manda decide si se aplica o queda como propuesta (lib/clients/datos-de-la-empresa.ts ›
 * quienManda). Acá solo se dice qué pedir, con dos filtros para no hacer ruido:
 *   - el ECO: un valor que escribió Nexus (está en `PropuestaDeDato.hubspotPropiedad` con su escritura) no vuelve como
 *     si lo hubiera puesto alguien en HubSpot;
 *   - lo que ya se dijo: si ese mismo valor de HubSpot está esperando como propuesta, o una persona ya lo descartó, no
 *     se vuelve a proponer cada hora.
 */
import { CLAVES_DE_DATO, type ClaveDeDato, type ValorDeDato } from "./datos-de-la-empresa";
import { datoDeLaPropiedad, valorDesdeHubspot, valorParaHubspot } from "@/lib/hubspot/empresa";

export interface PedidoDeLaCopia {
  clave: ClaveDeDato;
  valor: ValorDeDato;
  cita: string;
}

/** La huella de un valor de un dato, para comparar sin importar si es número o texto. */
export function huellaDeValor(clave: ClaveDeDato, valor: ValorDeDato): string {
  return `${clave}=${valorParaHubspot(clave, valor)}`;
}

/**
 * Los datos que se le piden al motor para una empresa, desde sus propiedades de HubSpot. `escritoPorNexus` y
 * `yaDicho` son huellas (`huellaDeValor`).
 */
export function pedidosDeLaCopia(
  propiedades: Readonly<Record<string, string | null | undefined>>,
  filtros: { escritoPorNexus: ReadonlySet<string>; yaDicho: ReadonlySet<string> },
): PedidoDeLaCopia[] {
  const out: PedidoDeLaCopia[] = [];
  for (const [propiedad, crudo] of Object.entries(propiedades)) {
    const clave = datoDeLaPropiedad(propiedad);
    if (!clave || !(CLAVES_DE_DATO as readonly string[]).includes(clave)) continue;
    const valor = valorDesdeHubspot(clave, crudo ?? null);
    // Vacío en HubSpot no borra nada en Nexus (la regla lo ignora igual): ni se pide.
    if (valor === null) continue;
    const huella = huellaDeValor(clave, valor);
    if (filtros.escritoPorNexus.has(huella) || filtros.yaDicho.has(huella)) continue;
    out.push({ clave, valor, cita: `HubSpot · ${propiedad}` });
  }
  return out;
}

/** Desde cuándo mirar: una hora antes de la última corrida (lo que cambió mientras corría la anterior). */
export const SOLAPE_DE_LA_COPIA_MS = 60 * 60 * 1000;

/** ¿La empresa cambió en HubSpot desde la última copia? Sin fecha de modificación, se mira igual. */
export function cambioDesde(hsLastModified: string | null | undefined, desdeMs: number | null): boolean {
  if (desdeMs === null) return true;
  const t = hsLastModified ? Date.parse(hsLastModified) : NaN;
  return !Number.isFinite(t) || t >= desdeMs - SOLAPE_DE_LA_COPIA_MS;
}
