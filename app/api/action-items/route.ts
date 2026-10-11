import { NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";

/**
 * POST /api/action-items — RETIRADA (memoria de la cuenta, etapa 2; 2026-10-10).
 *
 * Creaba un `ActionItem` a mano. `ActionItem` quedó DEPRECATED: ningún camino lo crea y los pendientes de un proyecto
 * son tareas (POST /api/tareas con `projectId` y `clientId`, por el único escritor de Tareas). Responde 410 para que
 * una pestaña vieja diga por qué no se guardó, en vez de crear algo que ninguna pantalla muestra. PATCH y DELETE de
 * /api/action-items/[id] se quedan para lo histórico (DECISIONS «La lectura de cada reunión es durable…»).
 */
export async function POST() {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json(
    { error: "Los pendientes ahora son tareas. Recarga la página y agrégalo desde «Pendientes recientes»." },
    { status: 410 },
  );
}
