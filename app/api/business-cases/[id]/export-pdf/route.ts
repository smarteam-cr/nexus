/**
 * POST /api/business-cases/[id]/export-pdf   body: { canvasId? }
 *
 * Genera el PDF del Business Case desde el contenido VIVO del canvas (el activo,
 * o el `canvasId` del body) usando Chromium headless (puppeteer-core + el paquete
 * `chromium` de Debian instalado en la imagen Docker — ver Dockerfile). Navega a
 * la página interna /print/business-case/[id], autenticada por un PrintJobToken
 * de un solo uso (60s) en vez de reenviar cookies de sesión Supabase. Devuelve el
 * buffer con Content-Disposition: attachment.
 *
 * Gateado con guardSalesAccess (mismo guard que generate/publish). Lanza y cierra
 * el browser POR REQUEST (uso esporádico — evita memory leaks de una instancia
 * compartida). Timeouts explícitos en cada fase; cualquier falla devuelve un error
 * humano en vez de colgar la request.
 */
import { NextRequest, NextResponse } from "next/server";
import puppeteer, { type Browser } from "puppeteer-core";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { createPdfJobToken } from "@/lib/business-cases/pdf-job-token";

// En prod (Docker) el default es el symlink a Chrome for Testing de Google (ver
// Dockerfile: /usr/local/bin/chrome-pdf) — el `chromium` de Debian crashea con
// SIGILL en el CPU virtualizado del VPS. En dev local se setea
// PUPPETEER_EXECUTABLE_PATH en .env.local (ruta a chrome.exe).
const CHROMIUM_EXECUTABLE = process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/local/bin/chrome-pdf";
const NAV_TIMEOUT_MS = 20_000;
const READY_TIMEOUT_MS = 15_000;
// Ancho del documento (px): coincide con el viewport para que el layout responsive
// se resuelva igual que se mide. 1000px conserva los grids multi-columna del diseño.
const DOC_WIDTH = 1000;
const MAX_PDF_HEIGHT_PX = 18_000;

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "business-case";
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
    select: { id: true, name: true, client: { select: { name: true } } },
  });
  if (!bc) return NextResponse.json({ error: "Caso de negocio no encontrado" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { canvasId?: unknown };
  const canvasId = typeof body.canvasId === "string" ? body.canvasId : null;

  const token = await createPdfJobToken(id, { canvasId, createdByEmail: guard.teamMember.email ?? null });
  const port = process.env.PORT || "3000";
  const printUrl = `http://127.0.0.1:${port}/print/business-case/${id}?pdfToken=${token}`;

  let browser: Browser | null = null;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROMIUM_EXECUTABLE,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        // Silencia el handler de crashes (crashpad) — en Docker no puede hacer su
        // ptrace y llena el stderr de ruido inofensivo; no necesitamos sus minidumps
        // (el error ya se maneja en el catch). NOTA: esto NO era el fix del bug de
        // arranque — ese era el binario de Debian; ver el comentario de CHROMIUM_EXECUTABLE.
        "--disable-crash-reporter",
      ],
      timeout: NAV_TIMEOUT_MS,
    });
    const page = await browser.newPage();
    await page.setViewport({ width: DOC_WIDTH, height: 1600 });
    await page.goto(printUrl, { waitUntil: "networkidle0", timeout: NAV_TIMEOUT_MS });
    await page.waitForSelector('body[data-pdf-ready="true"]', { timeout: READY_TIMEOUT_MS });

    // PDF CORRIDO — el caso de negocio es una LANDING, no un documento paginado:
    // UNA sola página del alto EXACTO del contenido (sin cortes A4 entre secciones,
    // que dejaban huecos). Vía `@page { size }` inyectado + `preferCSSPageSize` —
    // el camino confiable de Puppeteer: pasar `width`/`height` a page.pdf() reflowea
    // el contenido a una banda comprimida al centro (el motor de PDF pagina distinto
    // a como medimos en pantalla); con @page el layout de pantalla se respeta 1:1.
    const contentHeight = await page.evaluate((w) => {
      const el = document.querySelector(".stl-pdf-mode") as HTMLElement | null;
      const screenH = el?.scrollHeight ?? document.body.scrollHeight;
      // El motor de PDF renderiza el contenido ~3% MÁS ALTO que el scrollHeight de
      // pantalla (redondeo de métricas de fuente acumulado línea a línea). Con un
      // colchón fijo chico, ese excedente empuja la última fila (ej. las cards de
      // "Why Smarteam") a una 2ª página y pageRanges:"1" la RECORTA. Buffer
      // PROPORCIONAL del 4% (cubre el 3% medido + margen) + 24px → nunca recorta,
      // deja solo un margen mínimo abajo (~1cm). Es proporcional a la altura porque
      // la deriva escala con la cantidad de líneas.
      const h = Math.ceil(screenH * 1.04) + 24;
      const style = document.createElement("style");
      style.textContent = `@page { size: ${w}px ${h}px; margin: 0; }`;
      document.head.appendChild(style);
      return h;
    }, DOC_WIDTH);
    // Guarda defensiva: un caso larguísimo (> ~200 in, el límite de Chromium) daría
    // un PDF corrupto — si se excede, caemos a paginación A4 normal (raro, avisado).
    if (contentHeight > MAX_PDF_HEIGHT_PX) {
      console.warn(`[export-pdf] contenido de ${contentHeight}px excede el máximo — cae a A4 paginado.`);
    }
    const pdf =
      contentHeight > MAX_PDF_HEIGHT_PX
        ? await page.pdf({ format: "A4", printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } })
        : await page.pdf({ preferCSSPageSize: true, printBackground: true, pageRanges: "1" });

    const filename = `${slugify(bc.client.name)}-${slugify(bc.name)}.pdf`;
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    console.error("[export-pdf] error:", e);
    const msg = e instanceof Error ? e.message : "";
    const message =
      msg.includes("waitForSelector")
        ? "El caso tardó demasiado en renderizar (fuentes/imágenes) — reintentá."
        : msg.includes("Timeout")
          ? "La generación del PDF tardó demasiado — reintentá."
          : /Failed to launch|ENOENT|spawn|was not found at the configured executablePath/i.test(msg)
            ? `No se encontró Chromium en "${CHROMIUM_EXECUTABLE}". En desarrollo local, seteá PUPPETEER_EXECUTABLE_PATH en .env.local (ej. la ruta a chrome.exe) — en producción (Docker) ya viene instalado.`
            : "No se pudo generar el PDF.";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await browser?.close().catch(() => {});
  }
}
