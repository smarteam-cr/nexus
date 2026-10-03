/**
 * /api/clients/[id]/licencias — las licencias de HubSpot del cliente y sus renovaciones (2026-10-02).
 *
 *   GET → { licencias, datosDeHubspotAl, hoy }  (HubSpot Partner + lo cargado a mano)
 *   PUT → carga a mano un hub: { hub, plan?, fechaCompra?, fechaRenovacion?, montoMensual?, moneda?, nota? }
 *
 * Cualquiera con acceso al cliente lo ve, monto incluido (decisión de Elías: el CSE lo necesita para
 * la renovación). Interno: nunca va a un documento del cliente. Ver lib/cs/licencias.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { HUBS } from "@/lib/cs/licencias";
import { cargarLicenciasDelCliente } from "@/lib/cs/avisos-de-renovacion";
import { fechaLocalDeLaReunion } from "@/lib/sessions/compromisos-y-alcance";

type Params = Promise<{ id: string }>;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const fecha = (v: unknown): Date | null =>
  typeof v === "string" && FECHA.test(v) ? new Date(`${v}T12:00:00.000Z`) : null;
const texto = (v: unknown, max = 200): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;
  const r = await cargarLicenciasDelCliente(id);
  return NextResponse.json({ ...r, hoy: fechaLocalDeLaReunion(new Date()) });
}

export async function PUT(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const hub = typeof b?.hub === "string" ? b.hub : "";
  if (!(HUBS as readonly string[]).includes(hub)) {
    return NextResponse.json({ error: "Hub desconocido." }, { status: 400 });
  }
  const monto = typeof b?.montoMensual === "number" && Number.isFinite(b.montoMensual) && b.montoMensual > 0 ? b.montoMensual : null;
  const datos = {
    plan: texto(b?.plan, 60),
    fechaCompra: fecha(b?.fechaCompra),
    fechaRenovacion: fecha(b?.fechaRenovacion),
    montoMensual: monto,
    moneda: texto(b?.moneda, 8),
    nota: texto(b?.nota, 1000),
  };
  const vacio = Object.values(datos).every((v) => v === null);
  if (vacio) {
    await prisma.licenciaCliente.deleteMany({ where: { clientId: id, hub } });
  } else {
    await prisma.licenciaCliente.upsert({
      where: { clientId_hub: { clientId: id, hub } },
      create: { clientId: id, hub, ...datos, actualizadoPor: guard.user.email },
      update: { ...datos, actualizadoPor: guard.user.email },
    });
  }
  const r = await cargarLicenciasDelCliente(id);
  return NextResponse.json({ ...r, hoy: fechaLocalDeLaReunion(new Date()) });
}
