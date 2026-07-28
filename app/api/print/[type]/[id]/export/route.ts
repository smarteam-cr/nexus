/**
 * POST /api/print/[type]/[id]/export — EL endpoint de PDF. Uno, para los ocho tipos.
 *
 * Todo lo pesado está afuera: el motor de Chromium en `lib/print/pdf-runner.ts`, el gate en
 * `lib/print/load-doc.ts`, el token en `lib/print/job-token.ts`. Acá queda el orden en que se
 * combinan, que es lo único que este archivo decide.
 *
 * ── EL ORDEN NO ES CASUAL ────────────────────────────────────────────────────
 *   1. validar el tipo contra el registro → 404 sin tocar la base;
 *   2. autorizar → un docId ajeno no llega ni a la consulta de contenido;
 *   3. tomar el slot del semáforo ANTES de mintear el token: el token vive 60s y esperar en
 *      cola con él ya emitido lo quema;
 *   4. renderizar, y soltar el slot SIEMPRE (finally).
 */
import { NextRequest, NextResponse } from "next/server";
import { printDocType } from "@/lib/print/doc-types";
import { authorizePrintDoc, loadPrintDoc } from "@/lib/print/load-doc";
import { createPrintJobToken } from "@/lib/print/job-token";
import { acquirePdfSlot, pdfErrorMessage, renderPathToPdf, slugify } from "@/lib/print/pdf-runner";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const { type, id } = await params;

  const tipo = printDocType(type);
  if (!tipo) return NextResponse.json({ error: "Tipo de documento desconocido" }, { status: 404 });

  const auth = await authorizePrintDoc(tipo, id);
  if (!auth.ok) {
    const error =
      auth.status === 401
        ? "Sesión vencida — volvé a entrar."
        : auth.status === 403
          ? "No tenés permiso para exportar este documento."
          : "Documento no encontrado.";
    return NextResponse.json({ error }, { status: auth.status });
  }

  /* Se carga el documento ANTES de gastar un Chromium: si no hay nada que imprimir —el canvas
     no existe, o todo su contenido está oculto o en borrador— el 404 sale en milisegundos en
     vez de después de veinte segundos y una hoja en blanco. */
  /* `canvasId` (opcional) elige QUÉ VERSIÓN del documento exportar. Hoy solo el caso de
     negocio versiona; los demás lo ignoran. Sin body, sale la versión activa. */
  const body = (await req.json().catch(() => ({}))) as { canvasId?: unknown; hiddenKeys?: unknown };
  const canvasId = typeof body.canvasId === "string" ? body.canvasId : null;
  /* Lo que el editor tiene oculto EN PANTALLA y no subió todavía. Solo SUMA ocultamientos
     —nunca revela— así que no hace falta validarlo contra nada: en el peor caso, alguien
     saca contenido de su propio PDF. Ver components/print/PrintStaging.tsx. */
  const ocultasEnPantalla = Array.isArray(body.hiddenKeys)
    ? body.hiddenKeys.filter((k): k is string => typeof k === "string").slice(0, 200)
    : [];

  const doc = await loadPrintDoc(tipo, id, { yaAutorizado: true, canvasId, ocultasEnPantalla });
  if (!doc) return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
  if (doc.rows.length === 0) {
    return NextResponse.json(
      { error: `El ${tipo.label.toLowerCase()} no tiene contenido visible para exportar.` },
      { status: 409 },
    );
  }

  const release = await acquirePdfSlot();
  if (!release) {
    return NextResponse.json(
      { error: "Hay varias exportaciones de PDF en curso — esperá unos segundos y reintentá." },
      { status: 429 },
    );
  }

  try {
    const token = await createPrintJobToken(tipo.id, id, { canvasId, createdByEmail: auth.email });
    /* Las mismas claves viajan en la URL que abre Puppeteer: la página se rinde sola y tiene
       que llegar al mismo resultado que el chequeo de contenido de arriba. */
    const ocultarParam = ocultasEnPantalla.length
      ? `&ocultar=${encodeURIComponent(ocultasEnPantalla.join(","))}`
      : "";
    const { pdf, paged } = await renderPathToPdf(
      `/print/doc/${tipo.id}/${id}?pdfToken=${token}${ocultarParam}`,
    );

    /* Cliente + documento, salteando lo que no aplique: un perfil de puesto no tiene cliente
       y no debe llamarse "cliente-analista-de-datos.pdf". */
    const partes = [doc.clientName, doc.docTitle].map((p) => slugify(p, "")).filter(Boolean);
    const filename = `${partes.join("-") || tipo.id}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        // Superó el techo de una sola página y salió paginado. Se informa en vez de callarlo:
        // quien descarga tiene que saber por qué el PDF se ve distinto.
        ...(paged ? { "X-Pdf-Paged": "1" } : {}),
      },
    });
  } catch (e) {
    console.error(`[print/${tipo.id}] error:`, e);
    return NextResponse.json({ error: pdfErrorMessage(e) }, { status: 500 });
  } finally {
    release();
  }
}
