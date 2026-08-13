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
import { defsForCanvas } from "@/components/landing/configs/templates.defs";
import { isBlank } from "@/lib/landing/is-blank";
import { INVERSION_SECTION_KEY, licenciasDeHubSinMonto } from "@/lib/landing/inversion";

function buildVerifyUrl(req: NextRequest, token: string): string {
  const base = process.env.APP_URL || new URL(req.url).origin;
  return `${base}/external/business-case/verify/${token}`;
}

/* El predicado de "sección en blanco" es `lib/landing/is-blank.ts`, el MISMO que usa el
   render. Acá vivía una copia sin `NO_CONTENIDO`, y esa divergencia hacía que una sección
   con solo una clave de PRESENTACIÓN escrita —la moneda de la inversión, el ancho de una
   card— pasara este filtro y se publicara, mientras el render la omitía: el cliente abría
   la propuesta y ahí no había nada. Un solo predicado, una sola respuesta. */
const dataIsBlank = isBlank;

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
      client: { select: { name: true, logoUrl: true, logoDarkUrl: true, logoScale: true } },
    },
  });
  if (!bc) {
    return NextResponse.json({ error: "Esa propuesta no existe" }, { status: 404 });
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

  /* Preflight de las licencias sembradas: la siembra pone el RENGLÓN y deja el monto a Ventas,
     pero una línea con `hub` y sin monto ya vuelve la sección no-blank ⇒ sin este freno la
     propuesta sale con "Marketing Hub —" y sin total, que es lo único de esta feature que el
     cliente ve si nadie mira. NO se filtra en el render: una celda que desaparece rompe la
     columna (es lo que el CSS declara a propósito) y el vendedor tiene que ver exactamente lo
     que ve el cliente. */
  const inv = filled.find((s) => s.key === INVERSION_SECTION_KEY);
  const sinMonto = licenciasDeHubSinMonto(inv?.blocks[0]?.data);
  if (sinMonto.length) {
    return NextResponse.json(
      {
        error: `Falta el monto de ${sinMonto.length === 1 ? "una licencia" : `${sinMonto.length} licencias`}: ${sinMonto.join(" · ")}. Poné el monto o borrá la línea antes de subir.`,
      },
      { status: 400 },
    );
  }

  // Tipo/template del caso (columna → __meta del canvas → default) + defs para congelar
  // la PRESENTACIÓN por sección: el snapshot debe poder renderizarse fiel aunque el
  // template viva y cambie después (render sintetizado del external page).
  const resolved = resolveCaseTypeFor(bc, canvas.sections);
  /* `defsForCanvas` y no `templateDefsByKey`: una sección PERSONALIZADA no está en la
     plantilla, así que sin la def sintetizada `sectionType` congelaría la key entera
     (`custom:abc`), `configForSnapshot` no encontraría renderer para eso y la sección
     desaparecería SOLO en la propuesta publicada — la superficie que abre el prospecto,
     y la única donde nadie de Smarteam mira. */
  const defsByKey = defsForCanvas(resolved.templateId, filled);

  const snapshot = {
    name: bc.name,
    clientName: bc.client.name,
    clientLogoUrl: bc.client.logoUrl,
    // Qué archivo, cuál variante y a qué tamaño son UNA unidad visual: congelar una y
    // leer las otras vivas garantiza el desajuste (logo viejo con el tamaño del nuevo).
    clientLogoDarkUrl: bc.client.logoDarkUrl,
    clientLogoScale: bc.client.logoScale,
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
