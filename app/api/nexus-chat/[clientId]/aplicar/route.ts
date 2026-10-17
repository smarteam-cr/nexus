/**
 * /api/nexus-chat/[clientId]/aplicar — APLICAR la lista del chat de Nexus (2026-10-17, ficha H).
 *
 *   POST { turnoId, desmarcadas } → aplica lo que quedó marcado de la lista de ese turno, por la capa de operaciones.
 *
 * ⛔ La lista la lee el servidor del hilo de quien pide en esta cuenta: el navegador no manda operaciones. Responde «Ya
 * estaba aplicado» a un segundo clic, 409 si la lista ya no está vigente y 422 (sin escribir nada) si algo cambió desde
 * que se propuso. Escribe el desenlace en el hilo y lo devuelve.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hiloVivo } from "@/lib/asistente/hilo";
import { aVista } from "@/lib/asistente/handler";
import { PIEZA_NEXUS } from "@/lib/nexus-chat/constantes";
import { quienPide, respuestaDeError } from "@/lib/nexus-chat/http-server";
import { aplicarListaDeNexus } from "@/lib/nexus-chat/aplicar-server";

const Cuerpo = z.object({
  turnoId: z.string().trim().min(1, "Falta la lista.").max(60),
  desmarcadas: z.array(z.number().int().min(0).max(200)).max(200).default([]),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const q = await quienPide(clientId);
  if (q instanceof NextResponse) return q;
  const parsed = Cuerpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Pedido inválido." }, { status: 400 });
  try {
    const r = await aplicarListaDeNexus({ ...q, turnoId: parsed.data.turnoId, desmarcadas: parsed.data.desmarcadas });
    const { hilo } = aVista(await hiloVivo({ dueno: { clientId }, pieza: PIEZA_NEXUS, usuarioEmail: q.usuarioEmail }));
    return NextResponse.json({ ...r, hilo, ...(r.yaEstaba ? { mensaje: "Ya estaba aplicado." } : {}) });
  } catch (e) {
    return respuestaDeError(e, "aplicar");
  }
}
