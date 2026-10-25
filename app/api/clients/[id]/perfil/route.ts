/**
 * /api/clients/[id]/perfil — el perfil de la empresa que usa Nexus (hoy Smarteam), en su ficha (R13, 2026-10-25).
 *
 * GET → { esLaEmpresaQueUsaNexus: false } en cualquier otra ficha. En la suya: el perfil (propuesta de valor, position
 *       statement, tono, servicios y clientes de referencia), el tono de Marketing (vale mientras el perfil no tenga uno),
 *       el cliente ideal y las buyer personas (se editan en Marketing › Audiencia), los clientes de la cartera para elegir
 *       las referencias y si quien mira puede editarlo (`marketing.write`).
 * PUT → guarda el perfil (Zod en la frontera; lib/smarteam/perfil-server.ts). Pide `marketing.write`.
 * Todo se lee por lib/smarteam/contexto.ts, el único lector.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToClient, guardPermission } from "@/lib/auth/api-guards";
import { can } from "@/lib/auth/permissions/engine";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { CS_CLIENT_WHERE } from "@/lib/clients/kind";
import { contextoDeSmarteam } from "@/lib/smarteam/contexto";
import { ErrorDelPerfil, guardarPerfil } from "@/lib/smarteam/perfil-server";
import { PerfilEdicionSchema } from "@/lib/smarteam/perfil";

const SIN_SQL = "Falta aplicar scripts/sql/2026-10-25-empresa-parte-2.sql y reiniciar.";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acceso = await guardAccessToClient(id);
  if (acceso instanceof NextResponse) return acceso;
  try {
    const contexto = await contextoDeSmarteam();
    if (!contexto.empresa || contexto.empresa.id !== id) return NextResponse.json({ esLaEmpresaQueUsaNexus: false });
    const puedeEditar = acceso.user.teamMember ? await can(acceso.user.teamMember, "marketing", "write") : false;
    const [clientes, marketing] = await Promise.all([
      // La cartera para elegir las referencias, solo a quien puede editar: a los demás no les sirve para nada.
      puedeEditar
        ? prisma.client.findMany({ where: CS_CLIENT_WHERE, orderBy: { name: "asc" }, select: { id: true, name: true, industriaSmarteam: true } })
        : Promise.resolve([]),
      prisma.marketingSettings.findUnique({ where: { id: "marketing" }, select: { brandVoice: true } }),
    ]);
    return NextResponse.json({
      esLaEmpresaQueUsaNexus: true,
      empresa: contexto.empresa,
      perfil: contexto.perfil,
      tonoDeMarketing: marketing?.brandVoice?.trim() || null,
      clienteIdeal: contexto.clienteIdeal,
      buyerPersonas: contexto.buyerPersonas.map((p) => ({ nombre: p.nombre, cargo: p.cargo })),
      clientes: clientes.map((c) => ({ id: c.id, nombre: c.name, industria: c.industriaSmarteam })),
      puedeEditar,
    });
  } catch (e) {
    if (esquemaDesactualizado(e)) return NextResponse.json({ error: SIN_SQL }, { status: 503 });
    throw e;
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acceso = await guardAccessToClient(id);
  if (acceso instanceof NextResponse) return acceso;
  const permiso = await guardPermission("marketing", "write");
  if (permiso instanceof NextResponse) return permiso;
  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  const parsed = PerfilEdicionSchema.safeParse(cuerpo);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  try {
    await guardarPerfil(id, parsed.data, acceso.user.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ErrorDelPerfil) return NextResponse.json({ error: e.message }, { status: e.status });
    if (esquemaDesactualizado(e)) return NextResponse.json({ error: SIN_SQL }, { status: 503 });
    throw e;
  }
}
