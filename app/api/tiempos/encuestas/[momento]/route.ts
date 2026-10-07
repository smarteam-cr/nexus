/**
 * PATCH /api/tiempos/encuestas/[momento] — prender, pausar o ajustar una pregunta de tiempo. Solo dirección (quien
 * revisa el feedback): la configura en Feedback › Encuestas. La primera vez que se guarda, nace su fila.
 */
import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { guardRevisorDeFeedback } from "@/lib/feedback/http";
import { CLAVES_DE_MOMENTO, definicionDe, leerConfig, type Momento } from "@/lib/tiempos/reglas";
import { encuestaPatchSchema } from "@/lib/tiempos/schema";
import { SQL_DE_TIEMPOS, tiemposDisponible } from "@/lib/tiempos/servidor";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ momento: string }> }) {
  const guard = await guardRevisorDeFeedback();
  if (guard instanceof NextResponse) return guard;
  if (!tiemposDisponible()) {
    return NextResponse.json({ error: `Los tiempos todavía no están disponibles: falta aplicar ${SQL_DE_TIEMPOS}.` }, { status: 503 });
  }
  const { momento: crudo } = await params;
  if (!(CLAVES_DE_MOMENTO as readonly string[]).includes(crudo)) {
    return NextResponse.json({ error: "Ese momento no existe." }, { status: 404 });
  }
  const momento = crudo as Momento;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const parsed = encuestaPatchSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  if (parsed.data.activa && !definicionDe(momento).disponible) {
    return NextResponse.json({ error: definicionDe(momento).motivoNoDisponible ?? "Este momento todavía no se puede activar." }, { status: 409 });
  }

  const actual = await prisma.encuestaDeTiempo.findUnique({ where: { momento }, select: { config: true } });
  const config = (parsed.data.config ?? leerConfig(actual?.config, momento)) as unknown as Prisma.InputJsonValue;
  const fila = await prisma.encuestaDeTiempo.upsert({
    where: { momento },
    create: { momento, activa: parsed.data.activa ?? false, config, actualizadaPorEmail: guard.user.email },
    update: {
      ...(parsed.data.activa !== undefined ? { activa: parsed.data.activa } : {}),
      ...(parsed.data.config ? { config } : {}),
      actualizadaPorEmail: guard.user.email,
    },
    select: { activa: true, config: true },
  });
  return NextResponse.json({ activa: fila.activa, config: leerConfig(fila.config, momento) });
}
