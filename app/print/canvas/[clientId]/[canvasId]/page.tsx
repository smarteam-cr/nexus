import { requireConsultantSession } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { resolveHeroTitle } from "@/lib/landing/hero-title";
import { hiddenKeysFrom } from "@/lib/business-cases/section-briefs";
import { kickoffHiddenKey } from "@/components/canvas/kickoff-landing-adapter";
import PrintClient, { type CanvasPrintData } from "./PrintClient";

export const dynamic = "force-dynamic";

/**
 * El pseudo-canvas «Resumen del servicio»: NO es una fila de `ProjectCanvas`. Su contenido
 * son `ClientContextCard` con `canvasId: null` —tarjetas sueltas del proyecto— y este id
 * inventado es lo que lo distingue de un canvas real en toda esta página.
 *
 * Es LA identidad que decide la rama de carga. No usar `isDefault` para eso: ese flag marca
 * el ANCLA del proyecto, que es el canvas de Kickoff (lib/canvas/canvas-defs.ts).
 */
const PSEUDO_DEFAULT_ID = "__pseudo_default__";

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
    /* "default" en la URL significa EL PSEUDO-CANVAS «Resumen del servicio» — el que se
       arma con ClientContextCard. No se consulta la DB: buscar `isDefault:true` devolvía
       el canvas de KICKOFF (que es el ancla del proyecto, canvas-defs.ts) y por eso el PDF
       del Resumen salía titulado "Kickoff". El único llamador manda "default" justamente
       cuando está parado en el Resumen (ProjectCanvasPanel). */
    canvas = { id: PSEUDO_DEFAULT_ID, name: "Resumen del servicio", isDefault: true };
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

  /* ⚠ LA RAMA SE DECIDE POR IDENTIDAD, NO POR `isDefault` ────────────────────────────
     Las tarjetas son `ClientContextCard` con `canvasId: null`: NO cuelgan de ningún canvas,
     y la única superficie que las muestra es el pseudo-canvas «Resumen». `isDefault` marca
     otra cosa — el ANCLA del proyecto, que es el canvas de KICKOFF (canvas-defs.ts) — así
     que ramificar por ahí mandaba al kickoff a buscar su contenido en una tabla donde no
     tiene ni una fila, y el PDF salía con el encabezado correcto y el cuerpo vacío
     ("Este canvas aún no tiene contenido para exportar").
     La lección ya estaba escrita en ProjectCanvasPanel.tsx ("el render se ramifica por
     NOMBRE, no por isDefault") y no había llegado hasta acá. */
  if (canvas.id === PSEUDO_DEFAULT_ID) {
    // Pseudo-canvas «Resumen» → ClientContextCard (sueltas, `canvasId: null`)
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
    /* ── LO QUE EL CSE OCULTÓ AL CLIENTE NO SALE EN PAPEL ────────────────────────────
       Hay DOS fuentes de "sección oculta" y no son la misma forma, porque nacieron en
       módulos distintos:

         business case → entrada `{key, hidden:true}` dentro del Json `ProjectCanvas.sections`
                         (sin columna, para sobrevivir un `db push` entre las dos PCs)
         kickoff       → la columna `Project.hiddenKickoffKeys`, que cuelga del PROYECTO y no
                         del canvas, y cuya clave es el ID de la sección… salvo cronograma y
                         procesos, que van por key (133 kickoffs ya guardaron esas strings)

       Los otros canvas todavía no tienen forma de ocultar secciones, así que sus sets vienen
       vacíos y esto es inocuo. Se leen las dos igual: cuál aplica lo dice el dato, no un `if`
       por tipo de canvas, y el día que un tipo nuevo estrene visibilidad no hay que acordarse
       de esta página.

       ⚠ Esto se volvió urgente al arreglar la rama de carga: hasta entonces el PDF del
       kickoff salía VACÍO, así que el agujero no se veía. Al empezar a salir completo,
       empezaría a sacar al papel lo que el CSE escondió — que es peor que salir vacío. */
    const [canvasJson, proyecto] = await Promise.all([
      prisma.projectCanvas.findUnique({ where: { id: canvas.id }, select: { sections: true } }),
      prisma.project.findUnique({ where: { id: projectId }, select: { hiddenKickoffKeys: true } }),
    ]);
    const ocultasPorKey = hiddenKeysFrom(canvasJson?.sections);
    const ocultasKickoff = new Set(proyecto?.hiddenKickoffKeys ?? []);

    // Canvas custom → CanvasSection + CanvasBlock
    const dbSections = await prisma.canvasSection.findMany({
      where: { canvasId: canvas.id },
      orderBy: { order: "asc" },
      include: {
        blocks: {
          /* Solo CONFIRMED: un bloque que el agente propuso y el CSE todavía no aceptó no
             puede irse impreso al cliente. Los otros dos consumidores del mismo contenido
             (publish y la vista externa del kickoff) ya lo filtraban. */
          where: { status: "CONFIRMED" },
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

    printData.sections = dbSections
      // El filtro de OCULTAS. `kickoffHiddenKey` es el mismo resolvedor que usa la vista
      // del cliente, así que el papel y la pantalla dicen lo mismo por construcción.
      .filter((s) => !ocultasPorKey.has(s.key) && !ocultasKickoff.has(kickoffHiddenKey(s.key, s.id)))
      .map((s) => ({
        key: s.key,
        label: s.label,
        type: "blocks" as const,
        cards: [],
        blocks: s.blocks
          .map((b) => ({
            id: b.id,
            blockType: b.blockType,
            content: b.content,
            data: b.data,
          })),
      }));

    /* El PDF dice el mismo título que la pantalla. Los documentos del motor guardan el
       suyo en la portada (la primera sección); si todavía no tiene uno escrito, queda el
       nombre del canvas, que es lo que se imprimía siempre. Sin esto, el papel y la
       pantalla contarían dos cosas distintas del mismo documento — y el nombre del
       archivo PDF sale de acá. */
    const portada = dbSections[0]?.blocks[0]?.data as { titulo?: unknown } | null;
    printData.canvasName = resolveHeroTitle({
      escrito: portada?.titulo,
      rotulo: canvas.name,
    }).titulo;

    /* Y se QUITA de la portada, porque ya está impreso arriba como nombre del documento.
       `titulo` es una de las claves que titulan su tarjeta (card-print.tsx), así que sin
       esto el mismo texto salía dos veces en la primera página: una en el encabezado y
       otra dentro de la sección. Se quita solo de la copia que va al papel — el dato en
       la base no se toca. */
    const bloquesPortada = printData.sections[0]?.blocks;
    if (bloquesPortada?.[0]?.data && typeof bloquesPortada[0].data === "object") {
      const { titulo: _yaEstaEnElEncabezado, ...resto } = bloquesPortada[0].data as Record<string, unknown>;
      void _yaEstaEnElEncabezado;
      bloquesPortada[0] = { ...bloquesPortada[0], data: resto };
    }
  }

  return <PrintClient data={printData} autoPrint={sp.print === "1"} />;
}
