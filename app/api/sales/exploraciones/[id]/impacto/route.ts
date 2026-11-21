/**
 * POST /api/sales/exploraciones/[id]/impacto   body: { clave }
 *
 * El agente de impacto (lib/impacto/impacto.ts, 21 nov): ¿la nota del equipo `clave` («Lo que sabes del cliente», ya
 * guardada) cambia la página de La escala? Responde { cambia, porque, partes, contradiceLoAceptado, aviso }. No rehace ni
 * publica nada: si cambia, la pantalla muestra la cuenta regresiva y al llegar a 0 llama POST …/escala/resumen.
 * Pide poder cambiar la exploración (lib/exploraciones/guardia.ts), como guardar la nota.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";
import { impactoDeLaNotaEnLaEscala } from "@/lib/exploraciones/impacto-en-la-escala-server";
import { MAX_CLAVE_DE_NOTA } from "@/lib/exploraciones/notas-de-sesion";

type Ctx = { params: Promise<{ id: string }> };

const CuerpoSchema = z.object({ clave: z.string().min(1).max(MAX_CLAVE_DE_NOTA) });

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "write");
  if (guard instanceof NextResponse) return guard;
  const cuerpo = CuerpoSchema.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return cuerpoInvalido(cuerpo.error);
  return NextResponse.json(await impactoDeLaNotaEnLaEscala(id, cuerpo.data.clave, guard.email));
}
