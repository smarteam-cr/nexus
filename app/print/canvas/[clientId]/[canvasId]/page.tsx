import { requireConsultantSession } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import PrintClient, { type CanvasPrintData } from "./PrintClient";

export const dynamic = "force-dynamic";

// Secciones fijas del canvas default
const DEFAULT_SECTIONS = [
  { key: "objetivo_alcance",           label: "Objetivo y alcance" },
  { key: "hipotesis_recomendaciones",  label: "Hipótesis y recomendaciones" },
  { key: "procesos",                   label: "Procesos" },
  { key: "plan_implementacion",        label: "Plan de implementación" },
] as const;

/**
 * Página print del canvas — vive fuera de /clients/[id]/ para no heredar el
 * AppShell + Sidebar + Header del cliente. Renderiza un layout limpio
 * pensado para "Save as PDF" desde el browser.
 *
 * URL: /print/canvas/[clientId]/[canvasId]?print=1&projectId=X
 *   canvasId="default" → busca el ProjectCanvas con isDefault=true
 */
export default async function CanvasPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string; canvasId: string }>;
  searchParams: Promise<{ projectId?: string; print?: string }>;
}) {
  try {
    await requireConsultantSession();
  } catch {
    redirect("/");
  }

  const { clientId, canvasId: canvasIdParam } = await params;
  const sp = await searchParams;

  // Cargar cliente
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, company: true, industry: true },
  });
  if (!client) notFound();

  // Resolver projectId
  let projectId: string | null = sp.projectId ?? null;
  if (!projectId) {
    const projects = await prisma.project.findMany({
      where: { clientId, status: "active" },
      select: { id: true, serviceType: true },
      orderBy: { createdAt: "asc" },
    });
    const nonStrategy = projects.find((p) => p.serviceType !== "__strategy__");
    projectId = nonStrategy?.id ?? projects[0]?.id ?? null;
  }
  if (!projectId) notFound();

  // Cargar metadata del proyecto (info bar)
  const projectMeta = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      name: true,
      hubspotPipelineName: true,
      hubspotOwnerName: true,
      hubspotOwnerEmail: true,
      hubspotCreatedAt: true,
      createdAt: true,
      serviceType: true,
    },
  });

  // Resolver canvas
  let canvas: { id: string; name: string; isDefault: boolean } | null = null;

  if (canvasIdParam === "default") {
    const def = await prisma.projectCanvas.findFirst({
      where: { projectId, isDefault: true },
      select: { id: true, name: true, isDefault: true },
    });
    canvas = def ?? { id: "__pseudo_default__", name: "Resumen del servicio", isDefault: true };
  } else {
    const found = await prisma.projectCanvas.findUnique({
      where: { id: canvasIdParam },
      select: { id: true, name: true, isDefault: true, projectId: true },
    });
    if (!found || found.projectId !== projectId) notFound();
    canvas = { id: found.id, name: found.name, isDefault: found.isDefault };
  }

  // Construir data
  const displayClientName = client.name ?? client.company ?? "Cliente";
  const printData: CanvasPrintData = {
    clientName: displayClientName,
    clientCompany:
      client.company && client.company !== displayClientName ? client.company : null,
    clientIndustry: client.industry ?? null,
    canvasName: canvas.name,
    isDefault: canvas.isDefault,
    sections: [],
    generatedAt: new Date().toISOString(),
    projectMeta: {
      name: projectMeta?.name ?? null,
      pipelineName: projectMeta?.hubspotPipelineName ?? null,
      cseEncargado: projectMeta?.hubspotOwnerName ?? null,
      createdAt: (projectMeta?.hubspotCreatedAt ?? projectMeta?.createdAt)?.toISOString() ?? null,
    },
  };

  if (canvas.isDefault) {
    // Canvas default → ClientContextCard
    const cards = await prisma.clientContextCard.findMany({
      where: {
        projectId,
        canvasSection: { not: null },
        canvasId: null,
      },
      select: {
        id: true,
        title: true,
        content: true,
        cardType: true,
        canvasSection: true,
        canvasOrder: true,
      },
      orderBy: [{ canvasOrder: "asc" }, { createdAt: "asc" }],
    });

    const cardsBySection = new Map<string, typeof cards>();
    for (const c of cards) {
      const sec = c.canvasSection!;
      if (!cardsBySection.has(sec)) cardsBySection.set(sec, []);
      cardsBySection.get(sec)!.push(c);
    }

    printData.sections = DEFAULT_SECTIONS.map((s) => ({
      key: s.key,
      label: s.label,
      type: "cards" as const,
      cards: (cardsBySection.get(s.key) ?? []).map((c) => ({
        id: c.id,
        title: c.title,
        content: c.content ?? "",
      })),
      blocks: [],
    }));
  } else {
    // Canvas custom → CanvasSection + CanvasBlock
    const dbSections = await prisma.canvasSection.findMany({
      where: { canvasId: canvas.id },
      orderBy: { order: "asc" },
      include: {
        blocks: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            blockType: true,
            content: true,
            data: true,
            order: true,
            colSpan: true,
            colStart: true,
            rowSpan: true,
          },
        },
      },
    });

    printData.sections = dbSections.map((s) => ({
      key: s.key,
      label: s.label,
      type: "blocks" as const,
      cards: [],
      blocks: s.blocks.map((b) => ({
        id: b.id,
        blockType: b.blockType,
        content: b.content,
        data: b.data,
      })),
    }));
  }

  return <PrintClient data={printData} autoPrint={sp.print === "1"} />;
}
