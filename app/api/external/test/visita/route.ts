/**
 * POST /api/external/test/visita — CONTAR que alguien abrió la página de un test (O6 etapa 3, 2026-10-26).
 *
 * Pública (sin login). La manda la página del test una vez al abrirse (components/external/test/TestDelDiagnostico.tsx),
 * no el servidor al armarla: así los que solo leen la dirección (el robot que arma la vista previa de un enlace en
 * WhatsApp o en un anuncio) no cuentan como visitas. Solo suma 1 a la cuenta del día (lib/tests-diagnostico/
 * repositorio-server.ts › contarVisita): no guarda quién, ni de dónde. Tope por dirección y en total
 * (lib/tests-diagnostico/limite.ts › permitirVisita). Responde 204 pase lo que pase: no le enseña la regla a un script.
 */
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { VisitaSchema } from "@/lib/tests-diagnostico/schema";
import { direccionDelVisitante, permitirVisita } from "@/lib/tests-diagnostico/limite";
import { contarVisita } from "@/lib/tests-diagnostico/repositorio-server";
import { AREA_POR_SLUG } from "@/lib/tests-diagnostico/tipos";

const nada = () => new NextResponse(null, { status: 204 });

export async function POST(req: NextRequest) {
  const parsed = VisitaSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return nada();
  const area = AREA_POR_SLUG[parsed.data.area];
  const ip = direccionDelVisitante(req.headers);
  const ipHash = ip ? createHash("sha256").update(`test-diagnostico:${ip}`).digest("hex").slice(0, 32) : null;
  if (!permitirVisita(ipHash, `${area}:${parsed.data.version}`)) return nada();
  // Una visita que no se pudo contar no es un error del visitante: se anota y se responde igual.
  await contarVisita(area, parsed.data.version).catch((e) => console.error("[test-diagnostico] no se pudo contar la visita", e));
  return nada();
}
