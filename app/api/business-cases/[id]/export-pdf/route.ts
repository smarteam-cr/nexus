/**
 * POST /api/business-cases/[id]/export-pdf   body: { canvasId? }
 *
 * Genera el PDF del Business Case desde el contenido VIVO del canvas (el activo, o el
 * `canvasId` del body). Navega a la página interna /print/business-case/[id], autenticada
 * por un PrintJobToken de un solo uso (60s) en vez de reenviar cookies de sesión.
 *
 * EL MOTOR VIVE EN `lib/print/pdf-runner.ts` — semáforo, Chromium, `@page` inyectado,
 * fallback y traducción de errores son genéricos y los comparten todos los tipos de
 * documento. Acá queda solo lo PROPIO del business case: el guard de ventas, de dónde sale
 * el nombre del archivo, y qué URL abrir.
 *
 * Gateado con guardSalesAccess (mismo guard que generate/publish).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { createPdfJobToken } from "@/lib/business-cases/pdf-job-token";
import { acquirePdfSlot, pdfErrorMessage, renderPathToPdf, slugify } from "@/lib/print/pdf-runner";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const bc = await prisma.businessCase.findUnique({
    where: { id },
    select: { id: true, name: true, client: { select: { name: true } } },
  });
  if (!bc) return NextResponse.json({ error: "Caso de negocio no encontrado" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { canvasId?: unknown };
  const canvasId = typeof body.canvasId === "string" ? body.canvasId : null;

  // Cap de concurrencia ANTES de mintear el token (el token dura 60s — no
  // quemarlo esperando en cola).
  const release = await acquirePdfSlot();
  if (!release) {
    return NextResponse.json(
      { error: "Hay varias exportaciones de PDF en curso — esperá unos segundos y reintentá." },
      { status: 429 },
    );
  }

  try {
    const token = await createPdfJobToken(id, { canvasId, createdByEmail: guard.teamMember.email ?? null });
    const { pdf, paged } = await renderPathToPdf(`/print/business-case/${id}?pdfToken=${token}`);

    const filename = `${slugify(bc.client.name, "cliente")}-${slugify(bc.name, "business-case")}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        // El documento superó el techo de una sola página y salió paginado. Se informa en
        // vez de callarlo: el vendedor tiene que saber por qué el PDF se ve distinto.
        ...(paged ? { "X-Pdf-Paged": "1" } : {}),
      },
    });
  } catch (e) {
    console.error("[export-pdf] error:", e);
    return NextResponse.json({ error: pdfErrorMessage(e) }, { status: 500 });
  } finally {
    release();
  }
}
