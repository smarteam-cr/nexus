/**
 * POST /api/cs/carga/calibracion — usar o descartar una propuesta de la calibración (lib/carga/calibracion.ts).
 *
 * De la CSL y dirección, por rol (`guardLiderDeCs`), como el resto de los supuestos. «Usar» guarda una fila nueva de
 * `ConfigCarga` con el número propuesto y el porqué como motivo; «Descartar» guarda el descarte (no vuelve a
 * proponerse hasta que cambie el número). Las dos son append-only: queda quién y cuándo.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardLiderDeCs } from "@/lib/auth/api-guards";
import { aplicarPropuesta, descartarPropuesta } from "@/lib/carga/calibracion";
import { guardarConfigCarga, TablaDeSupuestosFaltante } from "@/lib/carga/mutations";
import { cargarConfigCarga } from "@/lib/carga/queries";

const cuerpoSchema = z.object({
  accion: z.enum(["usar", "descartar"]),
  clave: z.string().regex(/^(tipo|familia|peso):[A-Za-z]+$/, "Esa propuesta no existe."),
  propuesto: z.number().finite().min(0).max(80),
  /** El porqué de la propuesta: queda como motivo del cambio. */
  porque: z.string().trim().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const guard = await guardLiderDeCs();
  if (guard instanceof NextResponse) return guard;

  const parsed = cuerpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  const { accion, clave, propuesto, porque } = parsed.data;
  if (clave.startsWith("peso:") && propuesto > 2) return NextResponse.json({ error: "Un peso va de 0 a 2." }, { status: 400 });

  const { config, sinTabla } = await cargarConfigCarga();
  if (sinTabla) return NextResponse.json({ error: new TablaDeSupuestosFaltante().message }, { status: 503 });
  try {
    const nueva = accion === "usar" ? aplicarPropuesta(config, clave, propuesto) : descartarPropuesta(config, clave, propuesto);
    const motivo = accion === "usar" ? `Calibración: ${porque ?? clave}` : `Calibración descartada (${clave} → ${propuesto})`;
    const guardada = await guardarConfigCarga(nueva, guard.teamMember.email, motivo);
    return NextResponse.json({ ok: true, ...guardada });
  } catch (e) {
    if (e instanceof TablaDeSupuestosFaltante) return NextResponse.json({ error: e.message }, { status: 503 });
    if (e instanceof Error && e.message.startsWith("No se reconoce")) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[carga] no se pudo guardar la calibración:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo guardar." }, { status: 500 });
  }
}
