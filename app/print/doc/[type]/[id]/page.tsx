/**
 * /print/doc/[type]/[id] — LA página de impresión. Una, para todos los tipos del registro.
 *
 * Vive fuera de AppShell (mismo principio que /print/canvas): es la hoja que Puppeteer
 * captura, sin barra lateral ni encabezado de la app. También se puede abrir a mano con la
 * sesión normal para revisar el layout antes de exportar — es la forma más rápida de ver
 * exactamente lo que va a salir impreso.
 *
 * ── UNA RUTA Y NO UNA POR TIPO ───────────────────────────────────────────────
 * Con una página por tipo habría un lugar por tipo donde olvidarse del anti-IDOR, un prefijo
 * por tipo en el bypass del middleware y una copia por tipo del wrapper de PDF. Acá `[type]` se valida
 * contra el registro ANTES de tocar la base, y el gate está en un solo lugar
 * (`lib/print/load-doc.ts`).
 *
 * Auth: token de un solo uso (?pdfToken=) para la navegación interna de Puppeteer —que no
 * lleva cookies—; sin token cae al gate normal por scope.
 */
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { printDocType } from "@/lib/print/doc-types";
import { loadPrintDoc } from "@/lib/print/load-doc";
import { consumePrintJobToken } from "@/lib/print/job-token";
import PrintDocView from "@/components/print/PrintDocView";
import PdfReadySignal from "@/components/print/PdfReadySignal";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ type: string; id: string }>;
}): Promise<Metadata> {
  const { type } = await params;
  // Sin tocar la base: el título fino lo pone el nombre del archivo que arma el endpoint.
  return { title: printDocType(type)?.label ?? "Documento" };
}

export default async function PrintDocPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string; id: string }>;
  searchParams: Promise<{ pdfToken?: string; canvasId?: string; ocultar?: string }>;
}) {
  const { type, id } = await params;
  const sp = await searchParams;

  const tipo = printDocType(type);
  if (!tipo) notFound();

  /* Con token: lo valida y NO pide sesión — Puppeteer navega sin cookies.
     El token está atado a este par (docType, docId), así que uno emitido para otro
     documento no abre éste. Vale mientras no expire (60s), no un solo uso: ver job-token.ts. Sin token: gate normal, adentro de loadPrintDoc. */
  /* `ocultar`: lo que el editor tenía oculto en pantalla sin haberlo subido. Solo SUMA
     ocultamientos, así que aceptarlo de la URL no revela nada — ver PrintStaging.tsx. */
  const ocultasEnPantalla = (sp.ocultar ?? "").split(",").map((k) => k.trim()).filter(Boolean);

  let doc;
  if (sp.pdfToken) {
    const r = await consumePrintJobToken(sp.pdfToken, tipo.id, id);
    if (!r.ok) notFound();
    // `canvasId` solo lo usa el caso de negocio (tiene versiones); viaja en el token para que
    // el PDF exporte exactamente la versión desde la que se pidió.
    doc = await loadPrintDoc(tipo, id, { yaAutorizado: true, canvasId: r.canvasId, ocultasEnPantalla });
  } else {
    // A mano: `?canvasId=` permite mirar una versión concreta antes de exportarla.
    doc = await loadPrintDoc(tipo, id, { canvasId: sp.canvasId ?? null, ocultasEnPantalla });
  }
  if (!doc) notFound();

  return (
    /* `.stl-pdf-mode` es lo que el runner mide y lo que `.stl-pdf-paged` engancha cuando el
       documento no entra en una sola página. El fondo blanco explícito evita que el PDF
       herede el tema oscuro del sistema en el Chromium headless. */
    <div className="stl-pdf-mode" style={{ background: "#fff" }}>
      <PdfReadySignal />
      <PrintDocView doc={doc} />
    </div>
  );
}
