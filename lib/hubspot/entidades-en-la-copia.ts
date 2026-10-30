/**
 * lib/hubspot/entidades-en-la-copia.ts — QUIÉN COPIA CADA PROYECTO CUANDO DOS FICHAS COMPARTEN EMPRESA. PURO.
 *
 * El TEC (2026-10-29): la empresa de HubSpot del ITCR es de «TEC · TAE» y trae los proyectos de las dos entidades.
 * «TEC · AE» no tiene empresa propia. Las dos corren la copia normal contra la empresa
 * de la dueña (con su reconciliación y su reactivación), pero cada una toca solo lo suyo: la entidad, los proyectos que ya
 * son de ella; la dueña, todo menos eso. Si la dueña escribiera los de la entidad, el pase de encargado de la entidad no
 * vería el cambio. Un proyecto NUEVO del instituto lo copia la dueña. DECISIONS «Dos fichas que comparten dominio».
 */

export interface FichaParaLaCopia {
  id: string;
  comparteDominioConId: string | null;
  comparteDominioCon: { hubspotCompanyId: string | null; comparteDominioConId: string | null } | null;
}

/**
 * La empresa de la que copia una ENTIDAD: la de su dueña. Null si la ficha no lo es: sin cadenas y sin apuntarse a sí
 * misma, el mismo criterio del resolver (categorize.ts › `gruposDeEntidades`).
 */
export function empresaDeLaDuena(c: FichaParaLaCopia): string | null {
  const d = c.comparteDominioCon;
  if (!c.comparteDominioConId || c.comparteDominioConId === c.id || !d || d.comparteDominioConId) return null;
  return d.hubspotCompanyId;
}

/**
 * ¿Esta corrida se salta el proyecto? `propios`: solo en la corrida de una entidad, sus proyectos. `deSusEntidades`:
 * solo en la de una dueña, los de sus entidades, incluidos los que una persona borró allá (no renacen acá).
 */
export function laCopiaLoSalta(
  hubspotId: string,
  alcance: { propios: ReadonlySet<string> | null; deSusEntidades: ReadonlySet<string> },
): boolean {
  if (alcance.propios && !alcance.propios.has(hubspotId)) return true;
  return alcance.deSusEntidades.has(hubspotId);
}
