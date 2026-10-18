/**
 * /api/nexus-chat/[clientId]/asistente — EL CHAT DE NEXUS sobre una cuenta (2026-10-17, ficha H). Un hilo por cuenta y
 * por persona.
 *
 *   GET                       → el hilo vivo de quien pregunta en esta cuenta (o vacío)
 *   POST { mensaje }          → un turno: Nexus lee lo que necesita de la cuenta y puede dejar una lista de cambios
 *   POST { empezarDeCero }    → abre un hilo nuevo (el viejo queda como historia)
 *
 * ⛔ El desenlace NO lo escribe el navegador: lo escribe `POST …/aplicar` al aplicar. Por eso acá no hay `desenlace`.
 * Topes: mensajes y dólares de hoy de la persona en todas sus cuentas (lib/nexus-chat/textos.ts › decidirTope).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { abrirHilo, empezarDeCero, hiloVivo } from "@/lib/asistente/hilo";
import { aVista } from "@/lib/asistente/handler";
import { MODELO_DEL_ASISTENTE } from "@/lib/asistente/turno";
import { PIEZA_NEXUS } from "@/lib/nexus-chat/constantes";
import { quienPide, respuestaDeError } from "@/lib/nexus-chat/http-server";
import { correrTurnoDeNexus } from "@/lib/nexus-chat/turno-server";
import { usoDeHoy } from "@/lib/nexus-chat/uso-server";
import { decidirTope, textoDelTope } from "@/lib/nexus-chat/textos";

const piezaSchema = z.literal(PIEZA_NEXUS).optional();
/* El cajón también manda `seccion` (los otros chats la usan): acá se ignora. El `chip` de tipo «guia» (validación 71,
   2026-10-18) dice que la persona abrió el chat desde la guía de una exploración: el turno suma esa guía al mensaje. */
const chipSchema = z.object({ tipo: z.string().max(20), id: z.string().max(60) }).optional();
const bodySchema = z.union([
  z.object({ pieza: piezaSchema, mensaje: z.string().trim().min(1).max(4_000), chip: chipSchema }).passthrough(),
  z.object({ pieza: piezaSchema, empezarDeCero: z.literal(true) }),
]);

const TURNOS_A_LA_VISTA = 60;

function vista(hilo: Awaited<ReturnType<typeof hiloVivo>>) {
  const v = aVista(hilo);
  if (!v.hilo) return v;
  return { hilo: { ...v.hilo, turnos: v.hilo.turnos.slice(-TURNOS_A_LA_VISTA) } };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const q = await quienPide(clientId);
  if (q instanceof NextResponse) return q;
  const pieza = req.nextUrl.searchParams.get("pieza");
  if (pieza && pieza !== PIEZA_NEXUS) return NextResponse.json({ error: "Este chat solo conversa sobre la cuenta." }, { status: 400 });
  try {
    return NextResponse.json(vista(await hiloVivo({ dueno: { clientId }, pieza: PIEZA_NEXUS, usuarioEmail: q.usuarioEmail })));
  } catch (e) {
    return respuestaDeError(e, "GET");
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const q = await quienPide(clientId);
  if (q instanceof NextResponse) return q;
  const body = await req.json().catch(() => null);
  if (body && typeof body === "object" && "desenlace" in body) {
    return NextResponse.json({ error: "El resultado de aplicar lo escribe Nexus al aplicar: no se manda desde acá." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Escribe un mensaje (hasta 4.000 caracteres)." }, { status: 400 });

  const pedido = { dueno: { clientId }, pieza: PIEZA_NEXUS, usuarioEmail: q.usuarioEmail, modelo: MODELO_DEL_ASISTENTE };
  try {
    if ("empezarDeCero" in parsed.data) return NextResponse.json(vista(await empezarDeCero(pedido)));

    const tope = decidirTope(await usoDeHoy(q.usuarioEmail));
    if (tope) return NextResponse.json({ error: textoDelTope(tope) }, { status: 429 });

    const hilo = await abrirHilo(pedido);
    const chip = "chip" in parsed.data ? parsed.data.chip : undefined;
    const foco = chip?.tipo === "guia" ? { tipo: "guia" as const, exploracionId: chip.id } : undefined;
    const { acuerdo, costoUsd } = await correrTurnoDeNexus(hilo, parsed.data.mensaje, q, new Date(), foco);
    return NextResponse.json({ ...vista(await hiloVivo(pedido)), acuerdo, costoUsd });
  } catch (e) {
    /* El turno de la persona no se guarda si el modelo falló: un turno colgado se reenviaría como contexto. */
    return respuestaDeError(e, "POST");
  }
}
