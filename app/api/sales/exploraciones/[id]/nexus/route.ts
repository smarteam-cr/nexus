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
 *
 * UNA SOLA CONVERSACIÓN (24 nov): un pedido de la cuenta (una tarea, el siguiente paso, la guía, un documento) también
 * entra por acá y vuelve como `turno.tipo = "lista"`; lo prepara el chat de la cuenta con esta conversación como historia.
 * Pide además lo que pedía ese chat: `asistente.read` y acceso a la empresa (`quienPideLaCuenta`, lib/nexus-chat/http-server.ts).
 * Con `pedir`, lo último se toma como pedido («Hazlo»); con `lugar: "guia"`, el cajón se abrió desde la guía. La lista se
 * aplica con `POST …/nexus/aplicar`. Todo eso solo con `listas: true` (la pantalla sabe mostrar la lista): un cajón que no
 * lo manda sigue igual que antes.
 *
 * UN SOLO CONTEXTO (25 nov): un cambio a la página de La escala también entra por acá y vuelve como `turno.tipo = "escala"`
 * (la propuesta por pieza, que se aplica por la ruta de la página: …/escala/nexus). `escala`: el chip de «✨ Mejorar con IA»
 * (la página y la sección a la que va un cambio). Pide lo mismo que la vuelta: poder cambiar la preventa.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { MARCAS_DEL_MENSAJE, mensajesValidos, TOPES } from "@/lib/chat-de-nexus/conversacion";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";
import { vueltaEnLaPreventa } from "@/lib/exploraciones/nexus-en-la-preventa-server";
import { quienPideLaCuenta } from "@/lib/nexus-chat/http-server";
import { LugarEnLaEscalaSchema } from "@/lib/exploraciones/escala-con-nexus-esquemas";

type Ctx = { params: Promise<{ id: string }> };

const CuerpoSchema = z.object({
  conversacion: z.string().regex(/^[a-z0-9-]{8,64}$/i),
  mensajes: z
    .array(
      z.object({
        de: z.enum(["persona", "nexus"]),
        texto: z.string().max(TOPES.largoDelMensaje),
        es: z.enum(MARCAS_DEL_MENSAJE).optional(),
        /** La vuelta de una lista de la cuenta (la pone el servidor; con ella se reconoce su lista). */
        vuelta: z.string().max(60).optional(),
      }),
    )
    .min(1)
    // Con los «gracias» y los «Guardado» (que no son vueltas) una conversación pasa de `TOPES.mensajes`: se aceptan más y
    // `mensajesValidos` se queda con los últimos (22 nov). Antes de esto, la conversación se trababa en «Cuerpo inválido».
    .max(TOPES.mensajes * 4),
  /** «Guardarlo como nota»: lo último se cuenta aunque tenga forma de pregunta. */
  contar: z.boolean().optional(),
  /** «Era una pregunta»: lo último se responde, sin pasar por el modelo que clasifica. */
  preguntar: z.boolean().optional(),
  /** «Hazlo»: lo último es un pedido de la cuenta, sin pasar por el modelo que clasifica. */
  pedir: z.boolean().optional(),
  /** Desde dónde se abrió el cajón: «guia», la guía de la próxima sesión (la mano de la cuenta la tiene a la vista). */
  lugar: z.literal("guia").optional(),
  /**
   * La pantalla sabe mostrar la lista de un pedido de la cuenta (con su «Aplicar»). Sin esto la vuelta es la de antes
   * (contar o preguntar): un cajón viejo no se queda sin respuesta ante un pedido.
   */
  listas: z.literal(true).optional(),
  /** «Guardarlo como nota» debajo de una lista viva (con `contar`): esa lista ya no va. */
  soltar: z.string().max(60).optional(),
  /** El chip de La escala (25 nov): a qué página y sección va un cambio. Sin él, un cambio a la página va al Resumen. */
  escala: z.object({ lugar: LugarEnLaEscalaSchema, foco: z.string().max(400).nullable() }).optional(),
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
  const c = cuerpo.data;
  const r = await vueltaEnLaPreventa(id, c.conversacion, mensajes, guard.email, puedeVerLaCuenta, {
    contar: c.contar,
    preguntar: c.preguntar,
    escala: c.escala ?? null,
    ...(c.listas ? { pedir: c.pedir, lugar: c.lugar, soltar: c.soltar, quienPideLaCuenta } : {}),
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ turno: r.turno, quedan: r.quedan, ...(r.aviso ? { aviso: r.aviso } : {}) });
}
