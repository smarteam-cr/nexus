/**
 * POST /api/business-cases/[id]/canvas-sections/[sectionId]/adaptar — «Adaptar a esta empresa».
 *
 * Para una sección personalizada de HTML pegado (típicamente un módulo de la biblioteca armado para
 * otro cliente): la IA propone cambiar sus TEXTOS para la empresa de esta propuesta, sin tocar el
 * diseño. Devuelve la PROPUESTA y la huella del HTML que leyó — NO escribe: el editor la muestra,
 * la persona elige qué cambios aplica, y se guarda por el mismo camino que cualquier edición.
 *
 * Gate: el área de Ventas + que la sección sea de esta propuesta. Corrida en `AgentRun`.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { tipoGuardable, CLAVE_DEL_MODULO, leerHallazgos, resumenDeHallazgos } from "@/lib/landing/modulos-biblioteca";
import { resumenDeLaPropuesta } from "@/lib/landing/adaptar-modulo";
import { adaptarHtml, SinTextosQueAdaptar } from "@/lib/landing/adaptar-modulo-server";
import { huellaDelHtml } from "@/lib/landing/html-textos";

type Params = Promise<{ id: string; sectionId: string }>;

export async function POST(_req: NextRequest, { params }: { params: Params }) {
  const { id, sectionId } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const section = await prisma.canvasSection.findUnique({
    where: { id: sectionId },
    select: {
      key: true,
      canvasId: true,
      canvas: {
        select: {
          businessCaseId: true,
          businessCase: { select: { clientId: true, language: true, client: { select: { name: true } } } },
        },
      },
      blocks: { where: { blockType: "CARD" }, orderBy: { order: "asc" }, take: 1, select: { data: true } },
    },
  });
  if (!section || section.canvas.businessCaseId !== id || !section.canvas.businessCase) {
    return NextResponse.json({ error: "No se encontró esa sección en esta propuesta." }, { status: 404 });
  }
  if (tipoGuardable(section.key) !== "html") {
    return NextResponse.json({ error: "«Adaptar a esta empresa» es para las secciones de HTML pegado." }, { status: 400 });
  }
  const data = (section.blocks[0]?.data ?? {}) as Record<string, unknown>;
  const html = typeof data.html === "string" ? data.html : "";
  if (!html.trim()) return NextResponse.json({ error: "La sección no tiene HTML todavía." }, { status: 400 });

  // Para quién se armó: si la sección salió de un módulo, el módulo lo dice.
  let clienteOrigen: string | null = null;
  let avisos = "";
  const moduloId = typeof data[CLAVE_DEL_MODULO] === "string" ? (data[CLAVE_DEL_MODULO] as string) : null;
  if (moduloId) {
    const modulo = await prisma.moduloDePropuesta
      .findUnique({ where: { id: moduloId }, select: { origenClienteNombre: true, avisos: true } })
      .catch((e: unknown) => {
        if (esquemaDesactualizado(e)) return null;
        throw e;
      });
    clienteOrigen = modulo?.origenClienteNombre ?? null;
    avisos = resumenDeHallazgos(leerHallazgos(modulo?.avisos));
  }

  const otras = await prisma.canvasSection.findMany({
    where: { canvasId: section.canvasId },
    select: { key: true, blocks: { where: { blockType: "CARD" }, take: 1, select: { data: true } } },
  });

  try {
    const propuesta = await adaptarHtml({
      html,
      contexto: {
        clienteNuevo: section.canvas.businessCase.client.name,
        clienteOrigen,
        avisos,
        propuesta: resumenDeLaPropuesta(otras.map((s) => ({ key: s.key, data: s.blocks[0]?.data }))),
        lang: section.canvas.businessCase.language,
      },
      businessCaseId: id,
      clientId: section.canvas.businessCase.clientId,
      triggeredByEmail: guard.user.email.toLowerCase(),
    });
    return NextResponse.json({ ...propuesta, huella: huellaDelHtml(html) });
  } catch (e) {
    if (e instanceof SinTextosQueAdaptar) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[bc/adaptar] error:", e);
    const message = e instanceof Error ? e.message : "No se pudo adaptar el módulo — prueba de nuevo.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
