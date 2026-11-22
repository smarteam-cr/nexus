/**
 * POST /api/sales/exploraciones/[id]/nexus   body: { conversacion, mensajes: [{ de: "persona" | "nexus", texto }] }
 *
 * Una vuelta de «Hablar con Nexus» en la preventa (21 nov, lib/exploraciones/nexus-en-la-preventa-server.ts): Nexus
 * pregunta lo que falta (como mucho dos rondas) o dice adónde va cada cosa. Responde { turno, quedan }, o 429 con el tope
 * de la conversación o del día. Si es una pregunta lo decide el código cuando es seguro y el modelo cuando no
 * (`comoSeLee`); con `contar`, lo último se cuenta aunque tenga forma de pregunta («Guardarlo como nota»), y con
 * `preguntar` se responde («Era una pregunta»). No escribe nada de la preventa: la nota la guarda la pantalla y «Aplicar» también. Una
 * pregunta lee las reuniones de la cuenta solo si quien pregunta tiene acceso a la empresa (`guardAccessToClient`).
 * Pide poder cambiar la exploración (lib/exploraciones/guardia.ts), como guardar una nota.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { mensajesValidos, TOPES } from "@/lib/chat-de-nexus/conversacion";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";
import { vueltaEnLaPreventa } from "@/lib/exploraciones/nexus-en-la-preventa-server";

type Ctx = { params: Promise<{ id: string }> };

const CuerpoSchema = z.object({
  conversacion: z.string().regex(/^[a-z0-9-]{8,64}$/i),
  mensajes: z
    .array(z.object({ de: z.enum(["persona", "nexus"]), texto: z.string().max(TOPES.largoDelMensaje), es: z.enum(["consulta", "respuesta"]).optional() }))
    .min(1)
    .max(TOPES.mensajes),
  /** «Guardarlo como nota»: lo último se cuenta aunque tenga forma de pregunta. */
  contar: z.boolean().optional(),
  /** «Era una pregunta»: lo último se responde, sin pasar por el modelo que clasifica. */
  preguntar: z.boolean().optional(),
});

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "write");
  if (guard instanceof NextResponse) return guard;
  if (!guard.email) return NextResponse.json({ error: "No se sabe quién conversa." }, { status: 401 });
  const cuerpo = CuerpoSchema.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return cuerpoInvalido(cuerpo.error);
  const mensajes = mensajesValidos(cuerpo.data.mensajes);
  if (!mensajes) return NextResponse.json({ error: "Escribe algo para contarle a Nexus." }, { status: 400 });
  // Las reuniones de la cuenta solo si quien pregunta tiene acceso a la empresa (una preventa puede ser de un cliente).
  const puedeVerLaCuenta = async (clientId: string) => !((await guardAccessToClient(clientId)) instanceof NextResponse);
  const r = await vueltaEnLaPreventa(id, cuerpo.data.conversacion, mensajes, guard.email, puedeVerLaCuenta, { contar: cuerpo.data.contar, preguntar: cuerpo.data.preguntar });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ turno: r.turno, quedan: r.quedan });
}
