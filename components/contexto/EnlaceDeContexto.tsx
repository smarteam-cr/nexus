"use client";

/**
 * components/contexto/EnlaceDeContexto.tsx — el «+ …» al pie de una columna del «Contexto adicional»
 * (2026-10-07).
 *
 * Pedido de Elías: «debe ser exactamente el mismo botón en todas las áreas de los contextos
 * adicionales». Convivían tres: el enlace azul de la preventa («+ Buscar una reunión de Meet»), un
 * botón punteado azul («Buscar más sesiones») y uno punteado gris («Agregar fuente»). Queda el de la
 * preventa, en un solo lugar: va al pie de la columna (`mt-auto`), así las dos columnas lo tienen a la
 * misma altura.
 */
import type { ReactNode } from "react";

export default function EnlaceDeContexto({
  children,
  onClick,
  disabled,
  title,
}: {
  /** Lo que hace, sin el «+»: «Buscar una reunión de Meet», «Sumar una sesión o un documento». */
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="mt-auto self-start text-[11px] font-semibold text-brand transition-colors hover:text-brand-dark disabled:opacity-50"
    >
      + {children}
    </button>
  );
}
