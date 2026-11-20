"use client";

/**
 * components/trivias/CodigoQr.tsx — el QR de una partida, dibujado en SVG con el codificador propio (lib/trivias/qr.ts).
 *
 * Negro sobre blanco SIEMPRE, también en modo oscuro: un QR invertido no lo leen todas las cámaras. Por eso los
 * colores van como atributos del SVG y no como clases del tema. Lleva su margen blanco (4 módulos) adentro.
 */
import { useMemo } from "react";
import { codificarQr } from "@/lib/trivias/qr";

const MARGEN = 4;

export function CodigoQr({ texto, etiqueta, className }: { texto: string; etiqueta: string; className?: string }) {
  const { lado, camino } = useMemo(() => {
    const m = codificarQr(texto);
    let d = "";
    for (let y = 0; y < m.length; y++) {
      for (let x = 0; x < m.length; x++) if (m[y][x]) d += `M${x + MARGEN} ${y + MARGEN}h1v1h-1z`;
    }
    return { lado: m.length + MARGEN * 2, camino: d };
  }, [texto]);
  return (
    <svg
      viewBox={`0 0 ${lado} ${lado}`}
      role="img"
      aria-label={etiqueta}
      className={className}
      shapeRendering="crispEdges"
    >
      <rect width={lado} height={lado} fill="#FFFFFF" />
      <path d={camino} fill="#111111" />
    </svg>
  );
}
