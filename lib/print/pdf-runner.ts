/**
 * lib/print/pdf-runner.ts — el motor de PDF, una sola vez para todos los documentos.
 *
 * Extraído tal cual del export-pdf del Business Case (ya retirado), donde vivía
 * casado con el Business Case: el semáforo de concurrencia, el `@page` inyectado, el buffer
 * del 4%, el fallback y la traducción de errores no tienen NADA de específico de un caso de
 * negocio. Lo único propio de cada documento es qué URL abrir y cómo se llama el archivo.
 *
 * Comportamiento IDÉNTICO al anterior: esto es un movimiento, no un rediseño. Los números
 * (1000px de ancho, ×1.04+24, 18.000px de techo, 2 concurrentes, cola de 4) y sus razones
 * viajaron enteros — son el resultado de haber medido, no defaults.
 */
import puppeteer, { type Browser } from "puppeteer-core";
import { PRINT_PAGE_WIDTH } from "./page-metrics";

// En prod (Docker) el default es el symlink a Chrome for Testing de Google (ver
// Dockerfile: /usr/local/bin/chrome-pdf) — el `chromium` de Debian crashea con
// SIGILL en el CPU virtualizado del VPS. En dev local se setea
// PUPPETEER_EXECUTABLE_PATH en .env.local (ruta a chrome.exe).
const CHROMIUM_EXECUTABLE = process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/local/bin/chrome-pdf";
const NAV_TIMEOUT_MS = 20_000;
const READY_TIMEOUT_MS = 15_000;

// ── Semáforo de concurrencia (módulo-level, válido en el deploy single-instance;
// ver docs/RUNBOOK.md). Cada export lanza un Chromium (~150-300MB): sin cap, N
// vendedores exportando a la vez = N Chromiums en el VPS. Cap 2 + cola corta;
// si la cola también está llena, 429 inmediato con mensaje humano (mejor que
// encolar minutos en silencio).
//
// ⚠ El semáforo es UNO SOLO para TODOS los tipos de documento, a propósito: es un cap del
// VPS, no del documento. Multiplicar el botón "Descargar PDF" por ocho tipos aumenta la
// presión sobre este mismo par de slots — no darle un semáforo propio a cada tipo.
const MAX_CONCURRENT_PDF = 2;
const MAX_QUEUED_PDF = 4;
let activePdf = 0;
const pdfQueue: Array<() => void> = [];

/** null = cola llena (el caller responde 429). Si no, espera turno y devuelve
 *  el release — llamarlo SIEMPRE en finally. */
export async function acquirePdfSlot(): Promise<(() => void) | null> {
  if (activePdf >= MAX_CONCURRENT_PDF && pdfQueue.length >= MAX_QUEUED_PDF) return null;
  if (activePdf >= MAX_CONCURRENT_PDF) {
    await new Promise<void>((resolve) => pdfQueue.push(resolve));
  }
  activePdf++;
  return () => {
    activePdf--;
    pdfQueue.shift()?.();
  };
}

/* Ancho del documento (px): coincide con el viewport para que el layout responsive se
   resuelva igual que se mide. 1000px conserva los grids multi-columna del diseño. Vive en
   `page-metrics.ts` —puro— porque también lo necesitan componentes del lado cliente que
   tienen que encoger para caber (el Gantt); acá se re-exporta para no romper a los callers. */
export const DOC_WIDTH = PRINT_PAGE_WIDTH;
/** Techo de Chromium para una página: 200 in = 19.200 px. Éste es ese límite con margen,
 *  así que NO se puede subir — pasado eso, se pagina (ver `paged` en el resultado). */
export const MAX_PDF_HEIGHT_PX = 18_000;

/** Nombre de archivo, una sola regla para todos los documentos. */
export function slugify(name: string, fallback = "documento"): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || fallback;
}

/** El error crudo de Puppeteer → un mensaje que el CSE pueda leer. */
export function pdfErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : "";
  if (msg.includes("waitForSelector")) {
    return "El documento tardó demasiado en renderizar (fuentes/imágenes) — reintentá.";
  }
  if (msg.includes("Timeout")) return "La generación del PDF tardó demasiado — reintentá.";
  if (/Failed to launch|ENOENT|spawn|was not found at the configured executablePath/i.test(msg)) {
    return `No se encontró Chromium en "${CHROMIUM_EXECUTABLE}". En desarrollo local, seteá PUPPETEER_EXECUTABLE_PATH en .env.local (ej. la ruta a chrome.exe) — en producción (Docker) ya viene instalado.`;
  }
  return "No se pudo generar el PDF.";
}

/**
 * Abre una ruta INTERNA de la propia app y la devuelve como PDF.
 *
 * `printPath` es absoluto desde la raíz (ej. `/print/doc/kickoff/abc?pdfToken=…`): se
 * resuelve contra 127.0.0.1 y el PORT del proceso, así que nunca sale a la red.
 *
 * `paged: true` avisa que el documento superó el techo y salió paginado en vez de una sola
 * página continua — el caller decide si se lo dice al usuario.
 */
export async function renderPathToPdf(printPath: string): Promise<{ pdf: Buffer; paged: boolean }> {
  const port = process.env.PORT || "3000";
  const url = `http://127.0.0.1:${port}${printPath}`;
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
    await page.goto(url, { waitUntil: "networkidle0", timeout: NAV_TIMEOUT_MS });
    await page.waitForSelector('body[data-pdf-ready="true"]', { timeout: READY_TIMEOUT_MS });

    // PDF CORRIDO — estos documentos son LANDINGS, no documentos paginados: UNA sola
    // página del alto EXACTO del contenido (sin cortes A4 entre secciones, que dejaban
    // huecos). Vía `@page { size }` inyectado + `preferCSSPageSize` — el camino confiable
    // de Puppeteer: pasar `width`/`height` a page.pdf() reflowea el contenido a una banda
    // comprimida al centro (el motor de PDF pagina distinto a como medimos en pantalla);
    // con @page el layout de pantalla se respeta 1:1.
    const contentHeight = await page.evaluate((w) => {
      const el = document.querySelector(".stl-pdf-mode") as HTMLElement | null;
      const screenH = el?.scrollHeight ?? document.body.scrollHeight;
      // El motor de PDF renderiza el contenido ~3% MÁS ALTO que el scrollHeight de
      // pantalla (redondeo de métricas de fuente acumulado línea a línea). Con un
      // colchón fijo chico, ese excedente empuja la última fila a una 2ª página y
      // pageRanges:"1" la RECORTA. Buffer PROPORCIONAL del 4% (cubre el 3% medido +
      // margen) + 24px → nunca recorta, deja solo un margen mínimo abajo (~1cm). Es
      // proporcional a la altura porque la deriva escala con la cantidad de líneas.
      const h = Math.ceil(screenH * 1.04) + 24;
      const style = document.createElement("style");
      style.textContent = `@page { size: ${w}px ${h}px; margin: 0; }`;
      document.head.appendChild(style);
      return h;
    }, DOC_WIDTH);

    const paged = contentHeight > MAX_PDF_HEIGHT_PX;
    if (!paged) {
      const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, pageRanges: "1" });
      return { pdf: Buffer.from(pdf), paged: false };
    }

    /* No entra en una sola página. El fallback anterior era `format: "A4"`, y eso reflowea
       el contenido a 794px de ancho: el layout que se MIDIÓ a 1000 no es el que se imprime.
       Encima `.stl-pdf-mode` no tiene reglas de corte a propósito (el PDF normal es
       corrido), así que las tarjetas salían partidas al medio y las bandas oscuras cortadas.

       Se pagina a 1000 × 1414 —la proporción A4 AL ANCHO AL QUE SE MIDIÓ— así el layout es
       el mismo y lo único que cambia es dónde se corta. Y `.stl-pdf-paged` aporta las reglas
       de corte, que solo existen para este caso. */
    console.warn(`[pdf-runner] ${printPath}: ${contentHeight}px excede el máximo — sale paginado.`);
    // Este `@page` se agrega DESPUÉS del que puso la medición, y con la misma especificidad
    // gana el último: no hace falta borrar el anterior.
    await page.evaluate((w) => {
      document.querySelector(".stl-pdf-mode")?.classList.add("stl-pdf-paged");
      const s = document.createElement("style");
      s.textContent = `@page { size: ${w}px ${Math.round(w * 1.4142)}px; margin: 0; }`;
      document.head.appendChild(s);
    }, DOC_WIDTH);
    // Sin `pageRanges`: acá SÍ queremos todas las páginas.
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    return { pdf: Buffer.from(pdf), paged: true };
  } finally {
    await browser?.close().catch(() => {});
  }
}
