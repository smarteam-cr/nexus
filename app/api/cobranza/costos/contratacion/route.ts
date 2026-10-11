/**
 * POST /api/cobranza/costos/contratacion — dirección confirma o descarta la propuesta de contratar de Rentabilidad
 * (lib/rentabilidad/decisiones.ts). Queda firmada con quién y cuándo, una por mes.
 * ⚠ PRIVACIDAD: guardCostosAccess (SOLO SUPER_ADMIN) como PRIMERA línea: vive bajo /costos para que el escaneo de
 * costos-privacy lo vigile, como el resto de lo que es solo de dirección.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { guardarDecisionDeContratacion } from "@/lib/rentabilidad/decisiones";

const cuerpoSchema = z.object({
  valor: z.enum(["CONFIRMADA", "DESCARTADA"]),
  propuesta: z.string().trim().min(3).max(400),
  motivo: z.string().trim().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;

  const parsed = cuerpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  if (parsed.data.valor === "DESCARTADA" && !parsed.data.motivo) {
    return NextResponse.json({ error: "Para descartar la propuesta, escribe por qué." }, { status: 400 });
  }
  const hoyISO = new Date(Date.now() - 6 * 3_600_000).toISOString().slice(0, 10);
  await guardarDecisionDeContratacion({ ...parsed.data, motivo: parsed.data.motivo ?? null, actor: guard.user.email, hoyISO });
  return NextResponse.json({ ok: true });
}
