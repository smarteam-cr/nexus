/**
 * GET /api/tiempos/mias — lo que tengo sin anotar («¿cuánto te tomó?») y todavía no venció. Lo muestra «Para ti».
 */
import { NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { misPreguntasPendientes } from "@/lib/tiempos/preguntas";
import { tiemposDisponible } from "@/lib/tiempos/servidor";

export async function GET() {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  if (!tiemposDisponible()) return NextResponse.json({ preguntas: [] });
  const preguntas = await misPreguntasPendientes(guard.user.email);
  return NextResponse.json({ preguntas });
}
