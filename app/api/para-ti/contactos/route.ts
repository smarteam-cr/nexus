/**
 * /api/para-ti/contactos — a quién invitar al borrador de un evento de la agenda del inicio (2026-10-17).
 *
 * GET ?q=<texto> → los contactos de HubSpot (nombre, correo, cargo o empresa) y las cuentas por su nombre, de las
 *   cuentas que ves.
 * GET ?cliente=<id> → los contactos de esa cuenta, los de actividad más reciente primero. Una cuenta que no ves no
 *   devuelve nada (lo mismo que una que no existe).
 *
 * Solo lectura. La regla, en lib/mi-dia/agenda-contactos-server.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { contactosParaAgendar } from "@/lib/mi-dia/agenda-contactos-server";

export const dynamic = "force-dynamic";

const Q = z.string().max(80);
const ID = z.string().min(1).max(60);

export async function GET(req: NextRequest) {
  const g = await guardInternalUser();
  if (g instanceof NextResponse) return g;
  const q = Q.safeParse(req.nextUrl.searchParams.get("q") ?? "");
  const clienteCrudo = req.nextUrl.searchParams.get("cliente");
  const cliente = clienteCrudo ? ID.safeParse(clienteCrudo) : null;
  if (!q.success || (cliente && !cliente.success)) return NextResponse.json({ error: "La búsqueda no es válida." }, { status: 400 });
  const r = await contactosParaAgendar(g.teamMember, { q: q.data, cliente: cliente?.success ? cliente.data : null });
  return NextResponse.json(r);
}
