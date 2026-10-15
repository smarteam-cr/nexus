/**
 * lib/ventas/negocio-escritura-server.ts — lo que una persona escribe sobre un negocio abierto desde Nexus (2026-10-14).
 * SERVER-ONLY.
 *
 * · `responderNegocio`: la fecha de cierre y el monto. Se escriben PRIMERO en HubSpot (es la fuente) y, si HubSpot los
 *   acepta, en la copia. Si HubSpot no responde, la copia no se toca: Nexus no puede decir algo que HubSpot no tiene.
 * · `posponerPregunta`: «Ahora no», 7 días. Es de Nexus, no se escribe en HubSpot.
 *
 * Quién puede: el dueño del negocio, o quien tiene `ventas.write`.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { can } from "@/lib/auth/permissions/engine";
import { DIAS_DE_POSPONER } from "./negocios";
import type { RespuestaDelNegocio } from "./negocios-schema";

export class ErrorDelNegocio extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Persona = Parameters<typeof can>[0] & { id: string; email: string };

async function negocioQuePuedeTocar(id: string, persona: Persona) {
  const n = await prisma.negocioAbierto.findUnique({ where: { id } });
  if (!n) throw new ErrorDelNegocio(404, "Ese negocio no existe.");
  if (!n.abierto) throw new ErrorDelNegocio(409, "Ese negocio ya se cerró en HubSpot.");
  if (n.vendedorId !== persona.id && !(await can(persona, "ventas", "write"))) {
    throw new ErrorDelNegocio(403, "Solo su dueño o alguien con permiso de Ventas puede cambiar este negocio.");
  }
  return n;
}

/**
 * La fecha se manda al mediodía de Costa Rica (18:00 UTC): HubSpot guarda un instante, y a medianoche un día de
 * calendario se corre al anterior según quién lo mire.
 */
export function cierreParaHubspot(fecha: string): string {
  return `${fecha}T18:00:00.000Z`;
}

export async function responderNegocio(id: string, r: RespuestaDelNegocio, persona: Persona) {
  const n = await negocioQuePuedeTocar(id, persona);
  const properties: Record<string, string> = {};
  if (r.fechaCierre) properties.closedate = cierreParaHubspot(r.fechaCierre);
  if (r.monto !== undefined) properties.amount = String(Math.round(r.monto * 100) / 100);

  const hs = await getSystemHubspotClient();
  const res = await hs.apiRequest({ method: "PATCH", path: `/crm/v3/objects/deals/${n.hubspotDealId}`, body: { properties } });
  if (!res.ok) {
    const detalle = (await res.text()).slice(0, 200);
    throw new ErrorDelNegocio(502, `HubSpot no aceptó el cambio (${res.status}): ${detalle}`);
  }

  return prisma.negocioAbierto.update({
    where: { id },
    data: {
      ...(r.fechaCierre ? { fechaCierre: new Date(`${r.fechaCierre}T00:00:00.000Z`) } : {}),
      ...(r.monto !== undefined ? { monto: new Prisma.Decimal(Math.round(r.monto * 100) / 100) } : {}),
      respondidoPor: persona.email.toLowerCase(),
      respondidoAt: new Date(),
      preguntaPospuestaHasta: null,
    },
  });
}

export async function posponerPregunta(id: string, persona: Persona) {
  await negocioQuePuedeTocar(id, persona);
  return prisma.negocioAbierto.update({
    where: { id },
    data: { preguntaPospuestaHasta: new Date(Date.now() + DIAS_DE_POSPONER * 86_400_000) },
  });
}
