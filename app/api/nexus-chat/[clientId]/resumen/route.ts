/**
 * /api/nexus-chat/[clientId]/resumen — lo que el botón del chat de Nexus muestra antes de conversar (2026-10-17, ficha H).
 *
 *   GET → { acciones, uso }: las acciones sugeridas a quien pregunta en esta cuenta (sin IA, lib/nexus-chat/acciones.ts)
 *         y cuánto lleva la conversación y cuánto le queda hoy.
 *
 * Solo lectura. Misma puerta que el chat: `asistente.read` y acceso a la cuenta.
 */
import { NextResponse } from "next/server";
import { hiloVivo } from "@/lib/asistente/hilo";
import { PIEZA_NEXUS, TOPES_DEL_CHAT } from "@/lib/nexus-chat/constantes";
import { quienPide, respuestaDeError } from "@/lib/nexus-chat/http-server";
import { accionesDeLaPersona } from "@/lib/nexus-chat/acciones-server";
import { costoDelHilo, usoDeHoy } from "@/lib/nexus-chat/uso-server";
import { lineaDeUso } from "@/lib/nexus-chat/textos";

export async function GET(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const q = await quienPide(clientId);
  if (q instanceof NextResponse) return q;
  try {
    const [acciones, hoy, hilo] = await Promise.all([
      accionesDeLaPersona(q.persona, clientId),
      usoDeHoy(q.usuarioEmail),
      hiloVivo({ dueno: { clientId }, pieza: PIEZA_NEXUS, usuarioEmail: q.usuarioEmail }),
    ]);
    const hiloUsd = hilo ? await costoDelHilo(hilo.id) : 0;
    return NextResponse.json({
      acciones,
      uso: { hiloUsd, hoyUsd: hoy.usd, hoyMensajes: hoy.mensajes, topes: TOPES_DEL_CHAT, linea: lineaDeUso({ hilo: hiloUsd, hoyUsd: hoy.usd, hoyMensajes: hoy.mensajes }) },
    });
  } catch (e) {
    return respuestaDeError(e, "resumen");
  }
}
