/**
 * components/feedback/errores.ts — los últimos errores que dio la pantalla, para mandarlos con un reporte.
 *
 * Cuando alguien dice «algo falla», lo que más sirve para arreglarlo es el error que tiró el navegador en
 * ese momento, y la persona no lo ve. Se guardan los últimos 10 (errores sin atrapar, promesas rechazadas
 * y `console.error`) con su hora; el reporte manda los de los últimos 10 minutos. Solo en memoria: nada
 * sale del navegador hasta que la persona manda el reporte.
 */
"use client";

interface ErrorVisto {
  mensaje: string;
  cuando: number;
}

const MAX = 10;
const VENTANA_MS = 10 * 60 * 1000;
const vistos: ErrorVisto[] = [];
let instalado = false;

function anotar(mensaje: unknown) {
  const texto = (mensaje instanceof Error ? mensaje.message : typeof mensaje === "string" ? mensaje : (() => {
    try {
      return JSON.stringify(mensaje);
    } catch {
      return String(mensaje);
    }
  })()).trim();
  if (!texto) return;
  vistos.push({ mensaje: texto.slice(0, 300), cuando: Date.now() });
  if (vistos.length > MAX) vistos.shift();
}

/** Se instala una vez, al montar el shell. */
export function escucharErrores(): void {
  if (instalado || typeof window === "undefined") return;
  instalado = true;
  window.addEventListener("error", (e) => anotar(e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => anotar(e.reason));
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    try {
      anotar(args.map((a) => (a instanceof Error ? a.message : typeof a === "string" ? a : "")).filter(Boolean).join(" "));
    } catch {
      /* nunca romper el console.error de verdad */
    }
    original(...args);
  };
}

/** Los errores de los últimos 10 minutos, con «hace N min». */
export function erroresRecientes(): { mensaje: string; hace: string }[] {
  const ahora = Date.now();
  return vistos
    .filter((e) => ahora - e.cuando <= VENTANA_MS)
    .map((e) => {
      const min = Math.round((ahora - e.cuando) / 60000);
      return { mensaje: e.mensaje, hace: min < 1 ? "recién" : `hace ${min} min` };
    });
}
