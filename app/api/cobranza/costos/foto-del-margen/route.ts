/**
 * POST /api/cobranza/costos/foto-del-margen — tomar (o volver a tomar) la foto del margen de un mes cerrado, desde
 * Rentabilidad (lib/rentabilidad/foto-server.ts, el único escritor). Volver a tomarla pide un motivo, que queda en la fila.
 * ⚠ PRIVACIDAD: guardCostosAccess (SOLO SUPER_ADMIN) como PRIMERA línea: la foto lleva planilla y el costo de la hora de
 * cada persona. Vive bajo /costos para que el escaneo de costos-privacy lo vigile.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { FotoNoValida, TablaDeFotosFaltante, tomarFotoDelMes } from "@/lib/rentabilidad/foto-server";

const cuerpoSchema = z.object({
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "El mes va como AAAA-MM."),
  reemplazar: z.boolean().optional(),
  motivo: z.string().trim().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;

  const parsed = cuerpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  try {
    const r = await tomarFotoDelMes(parsed.data.mes, {
      por: guard.user.email,
      reemplazar: parsed.data.reemplazar,
      motivo: parsed.data.motivo ?? null,
    });
    if (r.estado === "ya-estaba") {
      return NextResponse.json({ error: "Ese mes ya tiene foto. Para volver a tomarla, escribe por qué.", estado: r.estado }, { status: 409 });
    }
    return NextResponse.json({ ok: true, estado: r.estado, mes: r.mes, cuentas: r.cuentas });
  } catch (e) {
    if (e instanceof FotoNoValida) return NextResponse.json({ error: e.message }, { status: 400 });
    if (e instanceof TablaDeFotosFaltante) return NextResponse.json({ error: e.message }, { status: 503 });
    console.error("[rentabilidad] no se pudo tomar la foto del mes:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo tomar la foto del mes." }, { status: 500 });
  }
}
