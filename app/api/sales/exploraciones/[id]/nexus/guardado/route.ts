/**
 * POST /api/sales/exploraciones/[id]/nexus/guardado   body: { conversacion, clave }
 *
 * Después de que la pantalla guardó la nota `clave` de «Hablar con Nexus» en «Lo que sabes del cliente»: deja sus hechos
 * (con destino en la preventa, verificados contra la nota guardada) y pregunta al agente de impacto si cambia la página
 * de La escala. Responde { hechos, impacto }: con `impacto.cambia`, la pantalla muestra la cuenta regresiva. Nunca
 * publica. Pide poder cambiar la exploración (lib/exploraciones/guardia.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";
import { alGuardarLaNota } from "@/lib/exploraciones/nexus-en-la-preventa-server";
import { MAX_CLAVE_DE_NOTA } from "@/lib/exploraciones/notas-de-sesion";

type Ctx = { params: Promise<{ id: string }> };

const CuerpoSchema = z.object({ conversacion: z.string().regex(/^[a-z0-9-]{8,64}$/i), clave: z.string().min(1).max(MAX_CLAVE_DE_NOTA) });

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "write");
  if (guard instanceof NextResponse) return guard;
  if (!guard.email) return NextResponse.json({ error: "No se sabe quién guardó la nota." }, { status: 401 });
  const cuerpo = CuerpoSchema.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return cuerpoInvalido(cuerpo.error);
  const r = await alGuardarLaNota(id, cuerpo.data.conversacion, cuerpo.data.clave, guard.email);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ hechos: r.hechos, impacto: r.impacto });
}
