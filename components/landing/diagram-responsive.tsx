"use client";

/**
 * components/landing/diagram-responsive.tsx
 *
 * Un diagrama que se puede leer también en un teléfono.
 *
 * EL PROBLEMA (medido, 2026-08-14): los diagramas de proceso se montaban como un canvas de
 * React Flow con `fitView`, en una caja de `min(72vh, 780px)`. En un teléfono de 375 px eso
 * significa meter un diagrama de ~1500 px de ancho natural en 327: React Flow lo escala a ~0.22
 * y **las etiquetas de los nodos quedan en 3-4 px**. No se rompe el layout — simplemente no se
 * puede leer, y encima se come el 72% del alto de la pantalla.
 *
 * LA SALIDA: en angosto se cambia el canvas por el SVG estático (`DiagramStatic`, el mismo que
 * ya usa el PDF) dentro de un scroller horizontal con ancho mínimo. El texto queda a tamaño
 * real y el cliente se desplaza — que es exactamente el patrón que el repo ya acepta para la
 * tabla de propiedades (`.stl-props-scroll`, `min-width: 860px`).
 *
 * ⚠ Es mejor que dejar el canvas por dos razones que no son de estilo:
 *   1. Legibilidad: 3 px de texto no se arregla con nada; el scroll sí lo resuelve.
 *   2. Gestos: dentro del canvas, arrastrar compite con el scroll de la página. El SVG no
 *      captura gestos, así que la página se sigue desplazando con normalidad.
 *
 * ⚠ El `children` (el canvas interactivo) NO se monta en angosto — se descarta sin renderizar.
 * `FlowchartViewer` entra por `dynamic(ssr:false)`, así que en un teléfono ni siquiera se baja
 * el bundle.
 */
import type { FC, ReactNode } from "react";
import { DiagramStatic } from "./diagram-static";
import type { FlowchartData } from "@/components/flowchart/FlowchartViewer";
import { useAnchoAngosto } from "@/lib/hooks/useAnchoAngosto";

/** Ancho al que un diagrama se lee cómodo. Por debajo, el scroller hace su trabajo. */
const ANCHO_LEGIBLE = 680;

export const DiagramaResponsive: FC<{
  diagram: FlowchartData;
  /** Alto de la caja del canvas en pantallas anchas. */
  alto: string;
  /** Radio del borde, para que cada documento conserve el suyo. */
  radio?: number;
  /** El canvas interactivo. Solo se monta en pantallas anchas. */
  children: ReactNode;
}> = ({ diagram, alto, radio = 12, children }) => {
  const angosto = useAnchoAngosto();

  if (angosto) {
    return (
      <div style={{ border: "1px solid var(--border)", borderRadius: radio, background: "#fff" }}>
        <div style={{ overflowX: "auto", padding: 12 }}>
          <div style={{ minWidth: ANCHO_LEGIBLE }}>
            <DiagramStatic diagram={diagram} />
          </div>
        </div>
        <p
          style={{
            margin: 0,
            padding: "0 12px 10px",
            fontSize: 11,
            color: "var(--text-muted)",
          }}
        >
          Deslizá el diagrama para verlo completo.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        height: alto,
        border: "1px solid var(--border)",
        borderRadius: radio,
        overflow: "hidden",
        background: "var(--bg, #fff)",
      }}
    >
      {children}
    </div>
  );
};
