/**
 * components/feedback/captura.ts — la captura de la pantalla de un reporte, armada en el navegador.
 *
 * Decisión (2026-10-04): un clic y sin pedirle permiso a la persona. Se copia la página tal como está
 * (modern-screenshot) y se recorta a lo que se ve. La otra opción, pedir permiso para capturar la
 * pantalla real (getDisplayMedia), sale exacta pero cuesta dos clics y un diálogo del navegador que
 * asusta. Lo que puede salir distinto: gráficos en canvas y mapas. Si la captura falla, el reporte
 * sale igual con la dirección de la pantalla.
 *
 * Lo que tiene `data-feedback-ui` (el panel, la barra de «Señalar») no sale en la captura; las marcas
 * de «Señalar» sí, para que se vea qué señaló.
 */
"use client";

import { subirDirecto } from "@/lib/storage/subir-directo";

/** Atributo que excluye un elemento de la captura. */
export const ATRIBUTO_FUERA_DE_LA_CAPTURA = "data-feedback-ui";
/** Atributo del contenedor pegado arriba (el menú): en la copia no se pega solo y hay que bajarlo. */
export const ATRIBUTO_FIJO = "data-feedback-fijo";

/**
 * ¿Este elemento queda FUERA de la captura? Lo de Feedback, lo oculto y lo que está entero debajo o a la derecha de la
 * ventana.
 *
 * ⚠ Rendimiento (2026-10-06): la librería copia los estilos calculados de cada elemento que clona, en el hilo de la
 * pantalla. Copiando `document.body` entero, una página de 12.000 elementos tardaba 15,5 s en capturarse —con el
 * navegador trabado— aunque la imagen sea solo la ventana; la ficha de un cliente monta mucho oculto (los paneles de
 * las otras piezas). Con este filtro, 1,1 s y la MISMA imagen, píxel por píxel (medido con modern-screenshot 4.7.0).
 * Lo que está ARRIBA de la ventana NO se saca: correría hacia arriba lo que sí se ve. Lo de debajo o a la derecha no
 * mueve nada de lo visible, y lo oculto (`display:none`) no ocupa lugar.
 */
export function fueraDeLaCaptura(el: Node, ventana: { ancho: number; alto: number }): boolean {
  if (!(el instanceof Element)) return false;
  if (el.hasAttribute(ATRIBUTO_FUERA_DE_LA_CAPTURA)) return true;
  if (typeof el.checkVisibility === "function" && !el.checkVisibility()) return true;
  const r = el.getBoundingClientRect();
  return r.top >= ventana.alto || r.left >= ventana.ancho;
}

export async function capturarPantalla(): Promise<Blob | null> {
  if (typeof window === "undefined") return null;
  try {
    const { domToBlob } = await import("modern-screenshot");
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;
    const ventana = { ancho: window.innerWidth, alto: window.innerHeight };
    const blob = await domToBlob(document.body, {
      type: "image/jpeg",
      quality: 0.82,
      width: window.innerWidth,
      height: window.innerHeight,
      scale: Math.min(window.devicePixelRatio || 1, 1.5),
      backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
      font: false,
      // Por imagen: un logo que tarda sale como un cuadro vacío en vez de frenar todo el reporte.
      timeout: 3000,
      features: { restoreScrollPosition: true },
      fetch: { placeholderImage: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" },
      style: scrollX || scrollY ? { transform: `translate(${-scrollX}px, ${-scrollY}px)` } : null,
      filter: (el) => !fueraDeLaCaptura(el, ventana),
      onCloneNode: (copia) => {
        if (!(copia instanceof HTMLElement) || !scrollY) return;
        // El menú está pegado arriba de la ventana; en la copia quedaría arriba de la PÁGINA.
        copia.querySelectorAll<HTMLElement>(`[${ATRIBUTO_FIJO}]`).forEach((el) => {
          el.style.transform = `translateY(${scrollY}px)`;
        });
      },
    });
    return blob;
  } catch (e) {
    console.warn("[feedback] no se pudo capturar la pantalla:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Sube la captura al almacén privado. Devuelve el path para el reporte, o el error para mostrar. */
export async function subirCaptura(blob: Blob): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const tipo = blob.type || "image/jpeg";
  const archivo = new File([blob], tipo === "image/png" ? "captura.png" : "captura.jpg", { type: tipo });
  const r = await subirDirecto<{ path?: string }>({ ruta: "/api/feedback/captura", archivo });
  if (!r.ok) return r;
  return typeof r.data.path === "string" ? { ok: true, path: r.data.path } : { ok: false, error: "La captura no llegó." };
}
