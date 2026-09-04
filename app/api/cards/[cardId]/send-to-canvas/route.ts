import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { guardAccessToClient } from "@/lib/auth/api-guards";

const PROJECT_SECTIONS = [
  "objetivo_alcance",
  "hipotesis_recomendaciones",
  "procesos",
  "plan_implementacion",
  "documentos",
];

const CLIENT_SECTIONS = [
  "perfil",
  "stakeholders",
  "herramientas",
  "contexto_comercial",
  "madurez",
  "retos_estrategicos",
  "escala_rendimiento",
  "oportunidades_futuras",
];

/**
 * POST /api/cards/[cardId]/send-to-canvas — clonar una tarjeta a un canvas de proyecto o proponerla
 * al canvas de empresa.
 *
 * ⛔ TENÍA CERO GUARDA (auditoría 2026-09-03), y era la peor de las dos rutas de tarjetas: aceptaba
 * un `targetProjectId` del body sin cruzarlo con nada, así que con solo pasar el middleware se podía
 * clonar contenido a un proyecto de CUALQUIER cliente. La tarjeta se carga primero, el ámbito sale
 * de ella (`guardAccessToClient(original.clientId)`), y el proyecto destino tiene que pertenecer a
 * ESE mismo cliente — si no, 404, igual que si no existiera.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await params;

  // Buscar el card original
  const original = await prisma.clientContextCard.findUnique({
    where: { id: cardId },
    select: {
      id: true,
      clientId: true,
      projectId: true,
      title: true,
      content: true,
      cardType: true,
      diagramData: true,
      chartConfig: true,
      source: true,
    },
  });

  if (!original) {
    return NextResponse.json({ error: "card not found" }, { status: 404 });
  }

  const guard = await guardAccessToClient(original.clientId);
  if (guard instanceof NextResponse) return guard;

  const { target, section, targetProjectId } = await req.json();

  if (!target || !section) {
    return NextResponse.json({ error: "target and section required" }, { status: 400 });
  }

  // ── Enviar al canvas de proyecto ──
  if (target === "project") {
    if (!PROJECT_SECTIONS.includes(section)) {
      return NextResponse.json({ error: "invalid project section" }, { status: 400 });
    }

    const destProjectId: string | null = targetProjectId || original.projectId;
    if (!destProjectId) {
      return NextResponse.json({ error: "targetProjectId required" }, { status: 400 });
    }
    /* El destino viene del body: se cruza con el cliente de la tarjeta. Un id de otro cliente es
       indistinguible de uno inexistente, a propósito. */
    const destino = await prisma.project.findFirst({
      where: { id: destProjectId, clientId: original.clientId },
      select: { id: true },
    });
    if (!destino) {
      return NextResponse.json({ error: "project not found" }, { status: 404 });
    }

    // Verificar si ya existe un clon en el proyecto destino
    const existing = await prisma.clientContextCard.findFirst({
      where: { parentCardId: cardId, projectId: destProjectId, canvasSection: { not: null } },
      select: { id: true, canvasSection: true },
    });

    if (existing) {
      return NextResponse.json({
        error: "already_in_canvas",
        cloneId: existing.id,
        section: existing.canvasSection,
      }, { status: 409 });
    }

    // Calcular siguiente orden en la sección
    const maxOrder = await prisma.clientContextCard.aggregate({
      where: {
        projectId: destProjectId,
        canvasSection: section,
      },
      _max: { canvasOrder: true },
    });
    const nextOrder = (maxOrder._max.canvasOrder ?? -1) + 1;

    // Clonar el card al proyecto destino
    const clone = await prisma.clientContextCard.create({
      data: {
        clientId: original.clientId,
        projectId: destProjectId,
        title: original.title,
        content: original.content,
        cardType: original.cardType,
        diagramData: original.diagramData ?? undefined,
        chartConfig: original.chartConfig ?? undefined,
        source: original.source,
        canvasSection: section,
        canvasOrder: nextOrder,
        parentCardId: original.id,
      },
    });

    return NextResponse.json({ ok: true, cloneId: clone.id, section });
  }

  // ── Enviar al canvas de empresa (como sugerencia) ──
  if (target === "client") {
    if (!CLIENT_SECTIONS.includes(section)) {
      return NextResponse.json({ error: "invalid client section" }, { status: 400 });
    }

    // Crear CanvasSuggestion. `suggested` (Json, REQUERIDO) es el valor que el
    // flujo de aprobación aplica a canvas[section] — faltaba y este create
    // LANZABA en runtime siempre (bug real que el ignoreBuildErrors escondía:
    // "Enviar al canvas de empresa" desde un card estaba roto en prod).
    const suggestion = await prisma.canvasSuggestion.create({
      data: {
        clientId: original.clientId,
        section,
        field: original.title,
        suggested: original.content,
        suggestedValue: original.content,
        source: "manual",
        sourceLabel: original.title,
        status: "pending",
      },
    });

    return NextResponse.json({ ok: true, suggestionId: suggestion.id, section });
  }

  return NextResponse.json({ error: "invalid target (project or client)" }, { status: 400 });
}

// GET: verificar si un card ya fue enviado al canvas + sección sugerida por el agente
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await params;

  const card = await prisma.clientContextCard.findUnique({
    where: { id: cardId },
    select: {
      clientId: true,
      agentRun: {
        select: {
          agent: {
            select: { defaultCanvasSection: true },
          },
        },
      },
    },
  });
  if (!card) return NextResponse.json({ error: "card not found" }, { status: 404 });

  const guard = await guardAccessToClient(card.clientId);
  if (guard instanceof NextResponse) return guard;

  const clone = await prisma.clientContextCard.findFirst({
    where: { parentCardId: cardId, canvasSection: { not: null } },
    select: { id: true, canvasSection: true },
  });

  return NextResponse.json({
    inCanvas: !!clone,
    cloneId: clone?.id ?? null,
    section: clone?.canvasSection ?? null,
    suggestedSection: card.agentRun?.agent?.defaultCanvasSection ?? null,
  });
}
