/**
 * lib/clients/ficha-desde-hubspot.ts — lo que alguien cambió en HubSpot vuelve a Información del cliente como
 * propuesta (2026-10-09, entrega 6 de docs/exito-del-cliente-cartera-plan.md). PURO.
 *
 * Nexus escribe la ficha en la empresa de HubSpot al confirmarla (`nexus_*`, lib/clients/ficha-hubspot.ts), pero
 * no la leía de vuelta: si alguien de Ventas corregía los retos en HubSpot, Nexus seguía con lo suyo. Ahora, si el
 * valor de HubSpot no es el que escribió Nexus, se PROPONE (nunca se pisa lo confirmado): el CSE lo usa o lo
 * descarta, como cualquier otra propuesta. Lo descartado no vuelve hasta que el valor de HubSpot cambie de nuevo
 * (`FichaGuardada.hubspotVisto`).
 *
 * «Resultados que persigue» no vuelve: sale de los resultados medibles confirmados de cada proyecto, no de un texto.
 */
import { campoDeFicha, textoAHtml, type ClaveDeFicha, type FichaGuardada } from "./ficha";

export const CAMPOS_QUE_VUELVEN_DE_HUBSPOT: readonly ClaveDeFicha[] = ["retosEstrategicos", "dolorPrincipal"];

/** Las propiedades de HubSpot de esos campos. */
export function propiedadesQueVuelven(): string[] {
  return CAMPOS_QUE_VUELVEN_DE_HUBSPOT.map((c) => {
    const d = campoDeFicha(c).destino;
    return d.tipo === "nota" ? "" : d.propiedad;
  }).filter(Boolean);
}

/** El HTML de una propiedad de texto enriquecido de HubSpot, como el texto que se escribe en la ficha. */
export function htmlATexto(html: string): string {
  return html
    .replace(/\r\n?/g, "\n")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\n- ")
    .replace(/<\s*\/\s*(p|div|ul|ol|h\d)\s*>/gi, "\n\n")
    .replace(/<\s*(strong|b)\s*>/gi, "**")
    .replace(/<\s*\/\s*(strong|b)\s*>/gi, "**")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface CambioDesdeHubspot {
  clave: ClaveDeFicha;
  /** El texto para la ficha. */
  valor: string;
  /** El valor tal cual está en HubSpot (para no volver a proponerlo). */
  html: string;
}

/**
 * Lo que HubSpot tiene distinto de lo que escribió Nexus. No propone: un vacío en HubSpot (borrar no se propone),
 * el mismo HTML que escribió Nexus, lo que ya se propuso una vez, ni lo que dice lo mismo que lo confirmado.
 */
export function cambiosDesdeHubspot(ficha: FichaGuardada, enHubspot: Record<string, string | null | undefined>): CambioDesdeHubspot[] {
  const out: CambioDesdeHubspot[] = [];
  for (const clave of CAMPOS_QUE_VUELVEN_DE_HUBSPOT) {
    const d = campoDeFicha(clave).destino;
    if (d.tipo === "nota") continue;
    const html = (enHubspot[d.propiedad] ?? "").trim();
    if (!html) continue;
    if (html === textoAHtml(ficha.valores[clave]).trim()) continue;
    if (ficha.hubspotVisto?.[clave] === html) continue;
    const valor = htmlATexto(html);
    if (!valor || valor === ficha.valores[clave].trim()) continue;
    out.push({ clave, valor, html });
  }
  return out;
}
