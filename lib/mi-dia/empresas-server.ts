/**
 * lib/mi-dia/empresas-server.ts — cómo se reconoce la empresa de un evento del calendario (etapa 4c de
 * docs/mi-dia-plan.md; compartido desde la ficha D, 2026-10-17). SERVER-ONLY, solo lectura.
 *
 * Los contactos de HubSpot de cada cliente (lib/contactos) y los dominios registrados de los clientes y prospectos.
 * Lo usan la agenda del día y la regla de servicio («¿la cuenta tiene reunión en los próximos 8 días?»): las dos con
 * los mismos mapas, para que no cuenten historias distintas. Se guardan dos minutos en memoria: el inicio los pide en
 * cada visita y el número del menú cada minuto y medio (RUNBOOK, invariante #1: un solo proceso).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { modeloDisponible } from "@/lib/db/esquema";
import { dominiosDeLaCasa } from "@/lib/sessions/reuniones-para-seguimiento";
import { indiceDeClientes, type IndiceDeClientes } from "@/lib/sessions/clientes-por-texto";

export interface MapasDeEmpresas {
  porCorreo: Map<string, string[]>;
  porDominio: Map<string, string[]>;
  /** Los dominios de Smarteam. */
  internos: Set<string>;
  nombreDe: Map<string, string>;
  /**
   * Los clientes y prospectos para reconocer una empresa NOMBRADA en un evento propio («Preparar demo para Accesos
   * Automáticos»), con el match de títulos del cascade (lib/sessions/clientes-por-texto.ts).
   */
  indiceDeNombres: IndiceDeClientes;
}

const VIDA_MS = 2 * 60_000;
let guardado: { at: number; mapas: MapasDeEmpresas } | null = null;
let enVuelo: Promise<MapasDeEmpresas> | null = null;

async function leer(): Promise<MapasDeEmpresas> {
  const [clientes, contactos, internos] = await Promise.all([
    prisma.client.findMany({ where: { kind: { in: ["CLIENTE", "PROSPECTO"] } }, select: { id: true, name: true, company: true, siglas: true, emailDomains: true } }),
    modeloDisponible(prisma.contactoDeHubspot)
      ? prisma.contactoDeHubspot.findMany({ where: { vigente: true, email: { not: null } }, select: { email: true, clientId: true } }).catch(() => [])
      : Promise.resolve([]),
    dominiosDeLaCasa(),
  ]);
  const porDominio = new Map<string, string[]>();
  for (const c of clientes) {
    for (const d of c.emailDomains ?? []) {
      const k = d.trim().toLowerCase();
      if (k) porDominio.set(k, [...new Set([...(porDominio.get(k) ?? []), c.id])]);
    }
  }
  const porCorreo = new Map<string, string[]>();
  for (const c of contactos) {
    if (!c.email) continue;
    const k = c.email.trim().toLowerCase();
    porCorreo.set(k, [...new Set([...(porCorreo.get(k) ?? []), c.clientId])]);
  }
  return {
    porCorreo,
    porDominio,
    internos,
    nombreDe: new Map(clientes.map((c) => [c.id, c.name])),
    indiceDeNombres: indiceDeClientes(clientes.map((c) => ({ id: c.id, name: c.name, company: c.company, siglas: c.siglas }))),
  };
}

export async function mapasDeEmpresas(ahora = new Date()): Promise<MapasDeEmpresas> {
  if (guardado && ahora.getTime() - guardado.at < VIDA_MS) return guardado.mapas;
  if (enVuelo) return enVuelo;
  enVuelo = leer()
    .then((mapas) => {
      guardado = { at: Date.now(), mapas };
      return mapas;
    })
    .finally(() => {
      enVuelo = null;
    });
  return enVuelo;
}
