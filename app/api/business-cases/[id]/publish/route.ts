/**
 * POST /api/business-cases/[id]/publish   body: { canvasId? }
 *
 * Congela el snapshot client-safe del CASO DE USO que el CSE está viendo (el
 * `canvasId` del body; fallback al activo). Valida pertenencia al BC (IDOR) y que
 * NO sea la Plantilla (version 0). Setea publishedAt + asegura el acceso. Exige ≥1
 * sección con contenido real. Gateado con guardSalesAccess.
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { ensureAccess } from "@/lib/business-cases";
import { hiddenKeysFrom } from "@/lib/business-cases/section-briefs";
import { resolveCaseTypeFor } from "@/lib/business-cases/resolve-template";
import { templateDefsByKey } from "@/components/landing/configs/templates.defs";

function buildVerifyUrl(req: NextRequest, token: string): string {
  const base = process.env.APP_URL || new URL(req.url).origin;
  return `${base}/external/business-case/verify/${token}`;
}

/** Un `data` estructurado está "en blanco" si todos sus strings/arrays lo están. */
function dataIsBlank(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.every(dataIsBlank);
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).every(dataIsBlank);
  return false;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const bc = await prisma.businessCase.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      caseType: true,
      caseSubtype: true,
      client: { select: { name: true, logoUrl: true } },
    },
  });
  if (!bc) {
    return NextResponse.json({ error: "Business case no existe" }, { status: 404 });
  }

  // El caso a publicar lo elige el CSE en el dropdown (canvasId en el body). Validamos
  // pertenencia al BC (IDOR) y que NO sea la Plantilla (version 0). Fallback al activo.
  let bodyCanvasId: string | null = null;
  try {
    const body = await req.json();
    if (body && typeof body.canvasId === "string") bodyCanvasId = body.canvasId;
  } catch {
    /* sin body */
  }

  const canvas = bodyCanvasId
    ? await prisma.projectCanvas.findFirst({
        where: { id: bodyCanvasId, businessCaseId: id, version: { gt: 0 } },
        select: { id: true, sections: true },
      })
    : await prisma.projectCanvas.findFirst({
        where: { businessCaseId: id, isActive: true, version: { gt: 0 } },
        select: { id: true, sections: true },
      });
  if (!canvas) {
    return NextResponse.json(
      {
        error: bodyCanvasId
          ? "Ese caso de uso no existe o es la Plantilla (la Plantilla no se publica)."
          : "Generá un caso de uso antes de subir al cliente.",
      },
      { status: 400 },
    );
  }
  // Secciones que el CSE ocultó (flag en el Json del canvas) → no se publican.
  const hidden = hiddenKeysFrom(canvas.sections);

  const sections = await prisma.canvasSection.findMany({
    where: { canvasId: canvas.id },
    orderBy: { order: "asc" },
    select: {
      key: true,
      label: true,
      titleOverride: true,
      eyebrowOverride: true,
      blocks: {
        where: { status: "CONFIRMED" },
        orderBy: { order: "asc" },
        select: { blockType: true, content: true, data: true },
      },
    },
  });
  // Solo secciones con contenido REAL y NO ocultas (los bloques sembrados vacíos también
  // son CONFIRMED, así que filtramos el placeholder en blanco; si no, se publicaría vacío).
  const filled = sections.filter(
    (s) =>
      !hidden.has(s.key) &&
      s.blocks.some((b) => !dataIsBlank(b.data) || (b.content ?? "").trim() !== ""),
  );
  if (filled.length === 0) {
    return NextResponse.json(
      { error: "Generá o escribí contenido antes de subir al cliente." },
      { status: 400 },
    );
  }

  // Tipo/template del caso (columna → __meta del canvas → default) + defs para congelar
  // la PRESENTACIÓN por sección: el snapshot debe poder renderizarse fiel aunque el
  // template viva y cambie después (render sintetizado del external page).
  const resolved = resolveCaseTypeFor(bc, canvas.sections);
  const defsByKey = templateDefsByKey(resolved.templateId);

  const snapshot = {
    name: bc.name,
    clientName: bc.client.name,
    clientLogoUrl: bc.client.logoUrl,
    templateId: resolved.templateId,
    caseType: resolved.caseType,
    caseSubtype: resolved.caseSubtype,
    sections: filled.map((s) => {
      const def = defsByKey[s.key];
      return {
        key: s.key,
        label: s.label,
        titleOverride: s.titleOverride,
        eyebrowOverride: s.eyebrowOverride,
        blocks: s.blocks,
        // Presentación congelada (robustez histórica):
        sectionType: def?.sectionType ?? s.key,
        theme: def?.theme ?? null,
        eyebrow: def?.eyebrow ?? null,
        selfTitled: def?.selfTitled ?? false,
        backdrop: def?.backdrop ?? false,
      };
    }),
  };

  await prisma.businessCase.update({
    where: { id },
    data: {
      status: "PUBLISHED",
      publishedAt: new Date(),
      publishedSnapshot: snapshot as unknown as Prisma.InputJsonValue,
    },
  });

  const access = await ensureAccess(id, guard.user.email ?? null);
  return NextResponse.json({
    published: true,
    accessToken: access.accessToken,
    password: access.accessPassword,
    url: buildVerifyUrl(req, access.accessToken),
  });
}
