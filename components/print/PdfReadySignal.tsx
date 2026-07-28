"use client";

/**
 * Señal de "listo para capturar" que Puppeteer espera antes de generar el PDF
 * (lib/print/pdf-runner.ts hace `page.waitForSelector('body[data-pdf-ready="true"]')`).
 *
 * Espera fuentes + que todas las <img> del árbol (logos, portada) disparen load/error.
 * LAS DOS ESPERAS ESTÁN ACOTADAS, y esa es la regla: nada acá puede colgar la descarga.
 * Una fuente que no baja cae a fuente de sistema; una imagen que no responde sale rota.
 * Las dos cosas son peores que un PDF perfecto y mejores que ningún PDF — que es lo que
 * pasaba cuando la espera de imágenes no tenía techo: quince segundos y "no se pudo
 * generar el PDF", sin decir qué faltaba.
 *
 * ⚠ NO espera nada asíncrono más, y esa es una decisión con contrapartida: lo que monte
 * DESPUÉS de esta señal no entra en el PDF. Por eso los componentes que cargan async
 * (diagramas, visores de proceso) tienen que ofrecer su variante estática con `ctx.pdfMode`
 * — congelado por lib/ui/pdf-mode-coverage.test.ts.
 *
 * ── `data-pdf-wait`: en qué anda ─────────────────────────────────────────────
 * Se publica en el `<body>` a medida que avanza. No lo lee nadie en el camino feliz; lo lee
 * el runner CUANDO FALLA, para poder decir "se quedó esperando las imágenes" en vez de
 * "tardó demasiado". Sin esto, un timeout no distingue entre una fuente colgada, una imagen
 * colgada y React que nunca hidrató — que son tres archivos distintos donde buscar.
 */
import { useEffect } from "react";

const FUENTES_MS = 3000;
const IMAGENES_MS = 8000;

function conTecho<T>(p: Promise<T>, ms: number): Promise<T | void> {
  return Promise.race([p, new Promise<void>((resolve) => setTimeout(resolve, ms))]);
}

export default function PdfReadySignal() {
  useEffect(() => {
    let cancelled = false;
    const marca = (etapa: string) => {
      if (!cancelled) document.body.setAttribute("data-pdf-wait", etapa);
    };

    async function markReady() {
      marca("fuentes");
      await conTecho(document.fonts.ready, FUENTES_MS);

      const imgs = Array.from(document.querySelectorAll("img"));
      const pendientes = imgs.filter((img) => !img.complete);
      marca(`imagenes:${pendientes.length}/${imgs.length}`);
      await conTecho(
        Promise.all(
          pendientes.map(
            (img) =>
              new Promise<void>((resolve) => {
                img.addEventListener("load", () => resolve(), { once: true });
                img.addEventListener("error", () => resolve(), { once: true });
              }),
          ),
        ),
        IMAGENES_MS,
      );

      marca("listo");
      if (!cancelled) document.body.setAttribute("data-pdf-ready", "true");
    }
    markReady();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
