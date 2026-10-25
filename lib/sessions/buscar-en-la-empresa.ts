/**
 * lib/sessions/buscar-en-la-empresa.ts — ENCONTRAR CUALQUIER REUNIÓN DE LA EMPRESA (T8, 2026-10-25;
 * docs/reuniones-pieza-angular-plan.md). PURO.
 *
 * El buscador de «Contexto adicional» (components/clients/SessionSelectionReview.tsx) ya mostraba las reuniones de la
 * empresa y las del calendario de quien busca. Faltaban dos:
 *   · las de la empresa en las que quien busca no estuvo y que no están entre las 100 más recientes: con lo escrito, se
 *     busca en TODA la historia de la empresa (la ruta de candidatas con `?q=`);
 *   · las que quedaron en OTRA empresa con gente del mismo dominio, con «Mover a esta empresa» (una persona decide: se
 *     escribe por lib/sessions/empresa-de-la-reunion-server.ts, nunca acá).
 * ⛔ Esto no elige el dueño de nada (invariante 2): solo encuentra reuniones para que una persona las mire. Los dominios
 * salen de las piezas del resolver (`effectiveDomainsForClient`, `extractParticipantDomains`), sin regla nueva.
 */
import { effectiveDomainsForClient, extractParticipantDomains } from "./categorize";

/** Desde cuántas letras se busca en toda la historia de la empresa (las mismas que en el calendario). */
export const MIN_BUSQUEDA_EN_LA_EMPRESA = 3;
/** Cuántas reuniones de otra empresa se muestran como mucho. */
export const TOPE_EN_OTRA_EMPRESA = 30;
/** Hasta cuántos días atrás se buscan las que quedaron en otra empresa. */
export const DIAS_EN_OTRA_EMPRESA = 365;

/** El patrón de ILIKE de lo que escribió la persona, con «%» y «_» literales. */
export function patronDeBusqueda(q: string): string {
  return `%${q.trim().slice(0, 100).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Los dominios propios de la empresa por los que se busca: sin los de la casa (un dominio de Smarteam no es de nadie). */
export function dominiosDeLaEmpresa(c: { emailDomains: string[] | null; company: string | null }, propios: ReadonlySet<string>): string[] {
  return effectiveDomainsForClient({ emailDomains: c.emailDomains ?? [], company: c.company }).filter((d) => !!d && !propios.has(d));
}

/** Los dominios de la empresa que estuvieron en la reunión (con el organizador), como los mira el resolver. */
export function dominiosEnComun(r: { participants: readonly string[]; organizerEmail: string | null }, dominios: readonly string[]): string[] {
  const enLaReunion = extractParticipantDomains([...r.participants, ...(r.organizerEmail ? [r.organizerEmail] : [])]);
  return dominios.filter((d) => enLaReunion.has(d));
}
