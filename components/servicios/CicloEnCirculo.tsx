/**
 * El ciclo de un servicio recurrente como un CÍRCULO (roadmap «La siguiente serie», iniciativa 4, paso 2): las etapas en
 * el sentido del reloj, dónde va la cuenta y la flecha que vuelve a empezar. SVG estático, solo tokens del tema.
 *
 * La geometría es la de lib/servicios/circulo.ts, la misma que la sección «Cómo trabajamos» de la propuesta.
 */
import { arcoEntre, estadoDeLaEtapa, puntosDelCirculo } from "@/lib/servicios/circulo";

/* Más ancho que alto: las etiquetas de los costados («Implementación») van afuera del círculo. */
const ANCHO = 340;
const ALTO = 236;
const CX = ANCHO / 2;
const C = ALTO / 2;
const R = 78;

export default function CicloEnCirculo({
  etapas,
  actual,
  centro,
  className,
}: {
  etapas: readonly string[];
  /** El índice de la etapa en la que va la cuenta, o null sin ciclo abierto. */
  actual: number | null;
  /** Lo que va en el medio («Ciclo 2»). */
  centro?: string;
  className?: string;
}) {
  const puntos = puntosDelCirculo(etapas.length, R, CX, C);
  return (
    <svg
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      role="img"
      aria-label={`El ciclo: ${etapas.join(", ")}${actual !== null ? `. Va en ${etapas[actual]}.` : "."}`}
      className={className ?? "h-auto w-full max-w-[340px]"}
    >
      <defs>
        <marker id="ciclo-flecha" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="fill-fg-muted" />
        </marker>
      </defs>
      {puntos.map((_, i) => (
        <path key={`a${i}`} d={arcoEntre(i, etapas.length, R, CX, C)} fill="none" strokeWidth={1.5} className="stroke-line" markerEnd="url(#ciclo-flecha)" />
      ))}
      {centro && (
        <text x={CX} y={C + 4} textAnchor="middle" className="fill-fg-secondary text-[12px] font-semibold">
          {centro}
        </text>
      )}
      {puntos.map((p, i) => {
        const estado = estadoDeLaEtapa(i, actual);
        const arriba = p.y < C - 10;
        const abajo = p.y > C + 10;
        const etiquetaY = arriba ? p.y - 18 : abajo ? p.y + 26 : p.y + 4;
        const anchor = Math.abs(p.x - CX) < 10 ? "middle" : p.x < CX ? "end" : "start";
        const etiquetaX = anchor === "middle" ? p.x : p.x < CX ? p.x - 16 : p.x + 16;
        return (
          <g key={`n${i}`}>
            <circle
              cx={p.x}
              cy={p.y}
              r={estado === "actual" ? 11 : 8}
              strokeWidth={2}
              className={
                estado === "actual" ? "fill-brand stroke-brand" : estado === "hecha" ? "fill-success stroke-success" : "fill-surface stroke-line"
              }
            />
            <text x={p.x} y={p.y + 3.5} textAnchor="middle" className={`text-[9px] font-bold ${estado === "por-venir" ? "fill-fg-muted" : "fill-primary-fg"}`}>
              {i + 1}
            </text>
            <text
              x={etiquetaX}
              y={etiquetaY}
              textAnchor={anchor}
              className={`text-[11px] ${estado === "actual" ? "fill-brand font-semibold" : estado === "hecha" ? "fill-fg-secondary" : "fill-fg-muted"}`}
            >
              {etapas[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
