/**
 * POST /api/sessions/[id]/empresa — de qué empresa es esta reunión (T3 y T8, 2026-10-25).
 *
 *   { accion: "confirmar", esperada }   → la propuesta de Nexus que vio la persona (si cambió, 409; si es una empresa de
 *                                         HubSpot, se crea como prospecto, con acceso a Ventas o a Preventa)
 *   { accion: "elegir", clientId }      → otra empresa, de las que quien decide puede abrir
 *   { accion: "mover", clientId }       → una reunión que quedó en otra empresa con el mismo dominio (el buscador, T8)
 *
 * Pide acceso a la reunión (`guardAccesoALaReunion`: con dueña, acceso a esa empresa; si no, 404). Quién decide y qué
 * escribe: lib/sessions/empresa-de-la-reunion-server.ts (el dueño, solo por `asignarDuenioManual` y `reResolveSession`).
 * Responde la empresa y qué le pasa a la reunión después.
 */
import { NextRequest, NextResponse } from "next/server";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { esLiderDeCs } from "@/lib/cs/acceso";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { guardAccesoALaReunion } from "@/lib/sessions/acceso-a-la-reunion";
import { decidirEmpresaDeLaReunion } from "@/lib/sessions/empresa-de-la-reunion-server";
import { EmpresaDeLaReunion } from "@/lib/sessions/reunion-schema";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const acceso = await guardAccesoALaReunion(id);
  if (acceso instanceof NextResponse) return acceso;
  const tm = acceso.user.teamMember;
  if (!tm) return NextResponse.json({ error: "Usuario interno sin miembro del equipo." }, { status: 403 });

  const raw = await req.json().catch(() => undefined);
  if (raw === undefined) return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  const parsed = EmpresaDeLaReunion.safeParse(raw);
  if (!parsed.success) return cuerpoInvalido(parsed.error);

  try {
    const r = await decidirEmpresaDeLaReunion(id, parsed.data, {
      email: tm.email,
      teamMemberId: tm.id,
      veTodo: esLiderDeCs(tm.roleEnum),
    });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json(r);
  } catch (e) {
    if (esquemaDesactualizado(e)) return NextResponse.json({ error: "A la base le falta el SQL 2026-10-25-reuniones-parte-2.sql." }, { status: 503 });
    throw e;
  }
}
