/**
 * GET /api/clients/[id]/lectura — cómo está la cuenta: el color y hasta tres motivos (2026-10-16, fase 1.2 de
 * docs/nexus-sistema-de-trabajo-plan.md). La pide la cabecera de la ficha del cliente.
 *
 * Pide acceso al cliente y, además, ser quien lidera Customer Success o el CSE de la cuenta (`puedeVerLaLectura`):
 * el color lee el uso de HubSpot Partner, que no es para todo el que abre la ficha. Al CSE le llega sin lo que habla
 * de plata. `lectura: null` = la cuenta no está en la cartera (no hay nada que acompañar).
 */
import { NextResponse } from "next/server";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { cargarLecturas, puedeVerLaLectura } from "@/lib/cs/lectura-de-la-cuenta-server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;
  const tm = guard.user.teamMember;
  const ve = await puedeVerLaLectura(id, { rol: tm?.roleEnum, email: tm?.email ?? guard.user.email });
  if (!ve) return NextResponse.json({ error: "La lectura de la cuenta es del CSE de la cuenta y de quien lidera Customer Success." }, { status: 403 });
  const lecturas = await cargarLecturas([id], { sinPlata: ve.sinPlata });
  return NextResponse.json({ lectura: lecturas.get(id) ?? null, verEnExito: !ve.sinPlata });
}
