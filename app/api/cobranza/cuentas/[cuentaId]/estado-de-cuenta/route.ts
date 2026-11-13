/**
 * /api/cobranza/cuentas/[cuentaId]/estado-de-cuenta — el enlace del estado de cuenta para el cliente (pedido 17,
 * 2026-11-13; lib/cobranza/estado-de-cuenta-compartir.ts).
 *
 *   GET     → el estado del enlace (sin generar · activo · vencido · revocado), quién lo creó y la última vista.
 *   POST    → `{}` crea el enlace (o devuelve el que abre; uno vencido o revocado se reemplaza por otro);
 *             `{ accion: "extender" }` corre el vencimiento con la MISMA dirección.
 *   DELETE  → revoca: el enlace deja de abrir.
 * ⛔ Todo pide EDITAR Cobranza (`guardCobranzaEditor`), también mirar: el enlace saca la deuda de la empresa fuera de
 * Nexus, y quien solo lee la cartera no decide a quién se le muestra.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardCobranzaEditor } from "@/lib/auth/api-guards";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import {
  crearEnlace,
  ErrorDelEnlace,
  estadoDelEnlace,
  extenderEnlace,
  revocarEnlace,
  type EnlaceDelEstadoDeCuenta,
} from "@/lib/cobranza/estado-de-cuenta-compartir";

type Ctx = { params: Promise<{ cuentaId: string }> };

const cuerpoSchema = z.object({ accion: z.enum(["crear", "extender"]).optional() }).strict();

async function responder(hacer: () => Promise<EnlaceDelEstadoDeCuenta>) {
  try {
    return NextResponse.json(await hacer());
  } catch (e) {
    if (e instanceof ErrorDelEnlace) return NextResponse.json({ error: e.message }, { status: e.status });
    if (esquemaDesactualizado(e)) {
      return NextResponse.json({ error: "Falta aplicar scripts/sql/2026-11-13-estado-de-cuenta-compartido.sql y reiniciar." }, { status: 503 });
    }
    throw e;
  }
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const guard = await guardCobranzaEditor();
  if (guard instanceof NextResponse) return guard;
  const { cuentaId } = await params;
  return responder(() => estadoDelEnlace(cuentaId));
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const guard = await guardCobranzaEditor();
  if (guard instanceof NextResponse) return guard;
  const { cuentaId } = await params;
  const raw: unknown = await req.json().catch(() => ({}));
  const parsed = cuerpoSchema.safeParse(raw ?? {});
  if (!parsed.success) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  if (parsed.data.accion === "extender") return responder(() => extenderEnlace(cuentaId));
  return responder(() => crearEnlace(cuentaId, guard.user.email));
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const guard = await guardCobranzaEditor();
  if (guard instanceof NextResponse) return guard;
  const { cuentaId } = await params;
  return responder(() => revocarEnlace(cuentaId, guard.user.email));
}
