/**
 * GET   /api/sales/exploraciones/[id]/nexus/conversacion  → { conversacion }   (la última de quien mira, o null)
 * PATCH /api/sales/exploraciones/[id]/nexus/conversacion  body: { conversacion, estados? } | { conversacion, cerrar: true }
 *                                                          | { conversacion, vuelta, estadosDeLaEscala } (25 nov)
 *
 * La conversación de «Hablar con Nexus» guardada (21 nov, lib/chat-de-nexus/guardada.ts): al volver a la preventa, el
 * cajón muestra la última, con sus mensajes, lo propuesto y lo aplicado. Cada persona ve SOLO la suya (el correo sale de
 * la sesión, nunca del cuerpo) y cada preventa la suya. PATCH anota qué se hizo con los cambios («Aplicar», «No»,
 * «Aplicar todo») o la cierra («Nueva conversación»). Desde el 25 nov (un solo contexto), también qué se hizo con cada
 * cambio de una propuesta a La escala de la conversación (`vuelta`: la que la dejó; «pendiente» después de «Deshacer»). Ninguna crea corridas: los topes siguen contando igual. Pide poder
 * cambiar la exploración, como una vuelta. Una respuesta que leyó las reuniones de la cuenta vuelve solo si quien mira
 * tiene HOY acceso a la empresa (`guardAccessToClient`); si no, va un aviso en su lugar.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { ESTADOS_GUARDADOS } from "@/lib/chat-de-nexus/guardada";
import { TOPES } from "@/lib/chat-de-nexus/conversacion";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";
import { cerrarEnLaPreventa, conversacionEnLaPreventa, estadosDeLaEscalaEnLaPreventa, estadosEnLaPreventa } from "@/lib/exploraciones/nexus-en-la-preventa-server";
import { ESTADOS_DE_LA_ESCALA } from "@/lib/chat-de-nexus/escala-en-la-conversacion";
import { MAX_CAMBIOS } from "@/lib/pedirle-a-nexus/contrato";

type Ctx = { params: Promise<{ id: string }> };

const ID = z.string().regex(/^[a-z0-9-]{8,64}$/i);
const CuerpoSchema = z.union([
  z.object({ conversacion: ID, cerrar: z.literal(true) }),
  z.object({
    conversacion: ID,
    vuelta: z.string().min(1).max(60),
    estadosDeLaEscala: z
      .record(z.string().max(400), z.enum(ESTADOS_DE_LA_ESCALA))
      .refine((e) => Object.keys(e).length <= MAX_CAMBIOS, "Demasiados cambios."),
  }),
  z.object({
    conversacion: ID,
    estados: z
      .record(z.string().max(120), z.enum(ESTADOS_GUARDADOS))
      .refine((e) => Object.keys(e).length <= TOPES.cambios, "Demasiados cambios."),
  }),
]);

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "write");
  if (guard instanceof NextResponse) return guard;
  if (!guard.email) return NextResponse.json({ conversacion: null });
  // Las respuestas que leyeron reuniones, solo con acceso HOY a la empresa (como al preguntar, en …/nexus).
  const puedeVerLaCuenta = async (clientId: string) => !((await guardAccessToClient(clientId)) instanceof NextResponse);
  return NextResponse.json({ conversacion: await conversacionEnLaPreventa(id, guard.email, puedeVerLaCuenta) });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "write");
  if (guard instanceof NextResponse) return guard;
  if (!guard.email) return NextResponse.json({ error: "No se sabe quién conversa." }, { status: 401 });
  const cuerpo = CuerpoSchema.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return cuerpoInvalido(cuerpo.error);
  const c = cuerpo.data;
  const r =
    "cerrar" in c
      ? await cerrarEnLaPreventa(id, c.conversacion, guard.email)
      : "estadosDeLaEscala" in c
        ? await estadosDeLaEscalaEnLaPreventa(id, c.conversacion, c.vuelta, guard.email, c.estadosDeLaEscala)
        : await estadosEnLaPreventa(id, c.conversacion, guard.email, c.estados);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}
