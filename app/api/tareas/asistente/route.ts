/**
 * /api/tareas/asistente — EL CHAT DE TAREAS (docs/tareas-plan.md §6). Un hilo por persona, en todas las pantallas.
 *
 *   GET                      → el hilo vivo de quien pregunta (o vacío)
 *   POST { mensaje, chip? }  → un turno: la persona dice algo, el asistente contesta (y puede dejar un acuerdo)
 *   POST { empezarDeCero }   → abre un hilo nuevo (el viejo queda como historia)
 *
 * ⛔ El desenlace NO lo escribe el navegador: lo escribe `POST /api/tareas/operaciones` al aplicar, en la misma
 * transacción. Por eso acá no hay `desenlace`, y el handler genérico rechaza la pieza «tareas».
 *
 * RBAC: miembro interno + la celda `asistente.read` (conversar consume modelo) + las tablas de tareas. Tope: 30
 * mensajes por persona por día, contados como mensajes suyos en sus hilos de tareas desde el inicio del día CR.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardInternalUser, guardPermission } from "@/lib/auth/api-guards";
import { triggeredByEmail } from "@/lib/agents/triggered-by";
import { inicioDelDiaCr } from "@/lib/ai/presupuesto";
import { abrirHilo, empezarDeCero, hiloVivo, turnosDeHoy } from "@/lib/asistente/hilo";
import { PIEZA_TAREAS } from "@/lib/asistente/piezas";
import { MODELO_DEL_ASISTENTE } from "@/lib/asistente/turno";
import { leerCuerpo, prepararTareas, sinElSql } from "@/lib/tareas/http";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { TIPOS_DE_CHIP } from "@/lib/tareas/chat/contexto";
import { correrTurnoDeTareas, MAX_TURNOS_DE_TAREAS_POR_DIA } from "@/lib/tareas/chat/turno";
import { textoDelTopeDiario } from "@/lib/tareas/chat/textos";
import { vistaDelHilo as vista } from "@/lib/tareas/chat/vista";

const piezaSchema = z.literal(PIEZA_TAREAS).optional();
const bodySchema = z.union([
  z.object({
    pieza: piezaSchema,
    mensaje: z.string().trim().min(1).max(4_000),
    chip: z.object({ tipo: z.enum(TIPOS_DE_CHIP), id: z.string().trim().min(1).max(120) }).optional(),
  }),
  z.object({ pieza: piezaSchema, empezarDeCero: z.literal(true) }),
]);

export async function GET(req: NextRequest) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const perm = await guardPermission("asistente", "read");
  if (perm instanceof NextResponse) return perm;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const pieza = req.nextUrl.searchParams.get("pieza");
  if (pieza && pieza !== PIEZA_TAREAS) return NextResponse.json({ error: "Este chat solo conversa sobre tus tareas." }, { status: 400 });
  const usuarioEmail = await triggeredByEmail();
  if (!usuarioEmail) return NextResponse.json({ error: "sin sesión" }, { status: 401 });
  return NextResponse.json(vista(await hiloVivo({ dueno: { personal: true }, pieza: PIEZA_TAREAS, usuarioEmail })));
}

export async function POST(req: NextRequest) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const perm = await guardPermission("asistente", "read");
  if (perm instanceof NextResponse) return perm;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  if (body && typeof body === "object" && "desenlace" in body) {
    return NextResponse.json({ error: "El resultado de aplicar lo escribe Nexus al aplicar: no se manda desde acá." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Escribe un mensaje (hasta 4.000 caracteres)." }, { status: 400 });

  /* ⚠ El correo sale de la SESIÓN, la misma fuente que la clave del hilo (y que usa el aplicar). */
  const usuarioEmail = await triggeredByEmail();
  if (!usuarioEmail) return NextResponse.json({ error: "sin sesión" }, { status: 401 });
  const pedido = { dueno: { personal: true } as const, pieza: PIEZA_TAREAS, usuarioEmail, modelo: MODELO_DEL_ASISTENTE };

  if ("empezarDeCero" in parsed.data) return NextResponse.json(vista(await empezarDeCero(pedido)));

  if ((await turnosDeHoy(pedido, inicioDelDiaCr(new Date()))) >= MAX_TURNOS_DE_TAREAS_POR_DIA) {
    return NextResponse.json({ error: textoDelTopeDiario(MAX_TURNOS_DE_TAREAS_POR_DIA) }, { status: 429 });
  }

  const hilo = await abrirHilo(pedido);
  try {
    const { acuerdo } = await correrTurnoDeTareas(hilo, parsed.data.mensaje, p, parsed.data.chip ?? null);
    return NextResponse.json({ ...vista(await hiloVivo(pedido)), acuerdo });
  } catch (e) {
    // A la base le falta una tabla o una columna de Tareas: decirlo, no «el asistente no pudo contestar».
    if (esquemaDesactualizado(e)) {
      console.error("[tareas/chat] a la base le falta algo de Tareas:", e instanceof Error ? e.message : e);
      return sinElSql();
    }
    /* El turno de la persona no se guarda si el modelo falló: un turno colgado se reenviaría como contexto. */
    console.error("[tareas/chat]", e);
    return NextResponse.json({ error: "El asistente no pudo contestar. Prueba de nuevo en un momento." }, { status: 502 });
  }
}
