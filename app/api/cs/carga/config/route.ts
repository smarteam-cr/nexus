/**
 * POST /api/cs/carga/config — guarda los supuestos de la carga de Customer Success (lib/carga/config.ts).
 *
 * De la CSL y dirección, por rol (`guardLiderDeCs`), como el resto de Éxito del cliente. Cada guardado es una fila
 * nueva (append-only): queda quién lo cambió, cuándo y por qué. Sin montos ni salarios: son horas y pesos.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardLiderDeCs } from "@/lib/auth/api-guards";
import { guardarConfigCargaSchema } from "@/lib/carga/schema";
import { guardarConfigCarga, TablaDeSupuestosFaltante } from "@/lib/carga/mutations";
import { completarConfig } from "@/lib/carga/config";

export async function POST(req: NextRequest) {
  const guard = await guardLiderDeCs();
  if (guard instanceof NextResponse) return guard;

  const cuerpo = await req.json().catch(() => null);
  const parsed = guardarConfigCargaSchema.safeParse(cuerpo);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Los supuestos no son válidos." }, { status: 400 });
  }
  try {
    const guardada = await guardarConfigCarga(completarConfig(parsed.data.valores), guard.teamMember.email, parsed.data.motivo);
    return NextResponse.json({ ok: true, ...guardada });
  } catch (e) {
    if (e instanceof TablaDeSupuestosFaltante) return NextResponse.json({ error: e.message }, { status: 503 });
    console.error("[carga] no se pudieron guardar los supuestos:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudieron guardar los supuestos." }, { status: 500 });
  }
}
