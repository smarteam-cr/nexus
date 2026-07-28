"use client";

/**
 * Señal de "listo para capturar" que Puppeteer espera antes de generar el PDF
 * (lib/print/pdf-runner.ts hace `page.waitForSelector('body[data-pdf-ready="true"]')`).
 *
 * Espera fuentes (con timeout — una fuente que no cargue no debe colgar la descarga: cae a
 * fuente de sistema) + que todas las <img> del árbol (logos, portada) disparen load/error.
 *
 * ⚠ NO espera nada asíncrono más, y esa es una decisión con contrapartida: lo que monte
 * DESPUÉS de esta señal no entra en el PDF. Por eso los componentes que cargan async
 * (diagramas, visores de proceso) tienen que ofrecer su variante estática con `ctx.pdfMode`
 * — congelado por lib/ui/pdf-mode-coverage.test.ts.
 */
import { useEffect } from "react";

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | void> {
  return Promise.race([p, new Promise<void>((resolve) => setTimeout(resolve, ms))]);
}

export default function PdfReadySignal() {
  useEffect(() => {
    let cancelled = false;
    async function markReady() {
      await withTimeout(document.fonts.ready, 3000);
      const imgs = Array.from(document.querySelectorAll("img"));
      await Promise.all(
        imgs.map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                img.addEventListener("load", () => resolve(), { once: true });
                img.addEventListener("error", () => resolve(), { once: true });
              }),
        ),
      );
      if (!cancelled) document.body.setAttribute("data-pdf-ready", "true");
    }
    markReady();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
