/**
 * lib/leads/reglas.ts — las reglas de la copia de los LEADS de HubSpot (B3 etapa 1, 2026-10-25). PURO: se prueba sin base
 * ni HubSpot (reglas.test.ts).
 *
 *   · de qué cliente es un lead: la MISMA regla que una comunicación (`clienteDeLaComunicacion`, invariante 1): sus
 *     empresas de Nexus primero, sus contactos después; de dos clientes, de ninguno;
 *   · qué se guarda de cada uno (nombre, etapa, origen, dueño, fechas);
 *   · el plan de la copia, por id de HubSpot: un lead es UNA fila, y si pasa a otro cliente la fila se mueve (no se crea
 *     otra). Nunca se borra: el que ya no es de nadie, o no vino en una lista completa, queda `vigente = false`.
 */
import { createHash } from "node:crypto";

export { clienteDeLaComunicacion as clienteDelLead, type ClienteDeLaComunicacion as ClienteDelLead } from "@/lib/comunicaciones/reglas";

/** Lo que se guarda de un lead (sin el cliente). */
export interface DatosDelLead {
  nombre: string;
  pipeline: string | null;
  etapaId: string | null;
  etapa: string | null;
  etapaCategoria: string | null;
  tipoDeLead: string | null;
  origen: string | null;
  duenoEmail: string | null;
  contactoHubspotId: string | null;
  creadoEnHubspot: Date | null;
  modificadoEnHubspot: Date | null;
}

const texto = (v: string | null | undefined): string | null => (v && v.trim() ? v.trim() : null);

function fecha(v: string | null | undefined): Date | null {
  if (!v) return null;
  const ms = /^\d{10,}$/.test(v) ? Number(v) : Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

/** Un lead de HubSpot → lo que se guarda. El nombre: el que le puso la persona, el calculado, o «Lead sin nombre». */
export function datosDelLead(
  p: Record<string, string | null | undefined>,
  o: { etapas: ReadonlyMap<string, string>; correoDelDueno: (ownerId: string | null) => string | null; contactoPrincipal: string | null },
): DatosDelLead {
  const etapaId = texto(p.hs_pipeline_stage);
  return {
    nombre: texto(p.hs_lead_name_calculated) ?? texto(p.hs_lead_name) ?? "Lead sin nombre",
    pipeline: texto(p.hs_pipeline),
    etapaId,
    etapa: etapaId ? (o.etapas.get(etapaId) ?? etapaId) : null,
    etapaCategoria: texto(p.hs_pipeline_stage_category)?.toLowerCase() ?? null,
    tipoDeLead: texto(p.hs_lead_type),
    origen: texto(p.hs_lead_source),
    duenoEmail: o.correoDelDueno(texto(p.hubspot_owner_id)),
    contactoHubspotId: o.contactoPrincipal,
    creadoEnHubspot: fecha(p.hs_createdate),
    modificadoEnHubspot: fecha(p.hs_lastmodifieddate),
  };
}

export function huellaDelLead(d: DatosDelLead): string {
  const base = JSON.stringify([
    d.nombre, d.pipeline, d.etapaId, d.etapa, d.etapaCategoria, d.tipoDeLead, d.origen, d.duenoEmail, d.contactoHubspotId,
    d.creadoEnHubspot?.toISOString() ?? null, d.modificadoEnHubspot?.toISOString() ?? null,
  ]);
  return createHash("sha256").update(base).digest("hex").slice(0, 32);
}

export interface LeadExistente {
  hubspotId: string;
  clientId: string;
  huella: string;
  vigente: boolean;
}

export interface LeadParaCopiar {
  hubspotId: string;
  clientId: string;
  datos: DatosDelLead;
  huella: string;
}

export interface PlanDeLeads {
  crear: LeadParaCopiar[];
  /** Cambió algo, volvió a estar vigente o pasó a otro cliente (la fila se mueve). */
  actualizar: (LeadParaCopiar & { cambioDeCliente: boolean })[];
  bajas: string[];
  sinCambio: number;
}

/**
 * Qué hacer. `decididos` = los ids cuyo dueño se pudo decidir (de uno, de dos o de nadie); `enLaLista` = todos los que
 * trajo la lista (también los de asociaciones ilegibles); `listaCompleta` = la lista llegó entera. Se da de baja la fila
 * vigente de un lead decidido que ya no es de un solo cliente, o que no vino en una lista completa (se borró o se archivó
 * en HubSpot). Uno que vino pero no se pudo decidir no se toca.
 */
export function planDeLeads(
  existentes: readonly LeadExistente[],
  paraCopiar: readonly LeadParaCopiar[],
  o: { decididos: ReadonlySet<string>; enLaLista: ReadonlySet<string>; listaCompleta: boolean },
): PlanDeLeads {
  const porId = new Map(existentes.map((e) => [e.hubspotId, e]));
  const plan: PlanDeLeads = { crear: [], actualizar: [], bajas: [], sinCambio: 0 };
  const copiados = new Set<string>();
  for (const l of paraCopiar) {
    if (copiados.has(l.hubspotId)) continue;
    copiados.add(l.hubspotId);
    const e = porId.get(l.hubspotId);
    if (!e) plan.crear.push(l);
    else if (e.vigente && e.huella === l.huella && e.clientId === l.clientId) plan.sinCambio++;
    else plan.actualizar.push({ ...l, cambioDeCliente: e.clientId !== l.clientId });
  }
  for (const e of existentes) {
    if (!e.vigente || copiados.has(e.hubspotId)) continue;
    if (o.decididos.has(e.hubspotId) || (o.listaCompleta && !o.enLaLista.has(e.hubspotId))) plan.bajas.push(e.hubspotId);
  }
  return plan;
}
