/**
 * components/external/test/EscaleraDeNiveles.tsx — LA ESCALERA de los cinco niveles, arriba de la página de cada área
 * (Elías, 20 nov; desde el 21 nov, idéntica a la curva de la página de resultados de la aplicación vieja: la geometría y los
 * colores en lib/escala/escalera.ts).
 *
 * El dibujo es un SVG ESTÁTICO, el `curvaSVG` de la vieja: se ve completo sin JS, en el teléfono (escala con el ancho; la
 * letra de los nombres crece en resultado.css) y en el PDF. Hex literal: es una página del cliente y no flipea. Lo que
 * dibuja: la línea gris que se vuelve azul y el área azul que se desvanece; los cinco niveles numerados, los marcados (donde
 * está cada capa) con su color y un círculo más grande, el resto en gris.
 *
 * Encima se monta MovimientoDeLaEscalera (componente cliente, solo en la pantalla: `interactiva`): los círculos se corren
 * hacia el cursor y crecen bajo él, y cada nivel abre su tarjeta con lo que es ese nivel en el área.
 */
import type { Letra } from "@/lib/escala/documento/tipos";
import {
  AZUL_DE_LA_ESCALERA,
  BAJO_EL_PUNTO,
  dibujoDeLaEscalera,
  GRIS_DE_LA_ESCALERA,
  LIENZO,
  lecturaDeLaEscalera,
  RADIO,
  type NivelMarcado,
} from "@/lib/escala/escalera";
import MovimientoDeLaEscalera from "./MovimientoDeLaEscalera";

export default function EscaleraDeNiveles({
  area,
  niveles,
  marcados,
  idSvg = "esc",
  interactiva = true,
}: {
  area: string;
  /** Los cinco niveles en orden; `vistazo`, cómo se ve el área en ese nivel (la tarjeta de cada uno). */
  niveles: readonly { letra: Letra; nombre: string; vistazo?: string | null }[];
  /** Los niveles que se marcan y quién está en cada uno (`nivelesMarcados`). */
  marcados: readonly NivelMarcado[];
  /** Un prefijo para los ids de los degradados: dos escaleras en la misma página no pueden compartirlos. */
  idSvg?: string;
  /** false en el PDF: sin movimiento ni tarjetas, solo el dibujo. */
  interactiva?: boolean;
}) {
  const d = dibujoDeLaEscalera(niveles, marcados);
  const linea = `${idSvg}-cg`;
  const relleno = `${idSvg}-cf`;
  return (
    <figure className="esc">
      <svg
        className="esc-svg"
        viewBox={`${LIENZO.x} ${LIENZO.y} ${LIENZO.ancho} ${LIENZO.alto}`}
        preserveAspectRatio="xMidYMid meet"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={lecturaDeLaEscalera(area, d.marcas)}
      >
        <defs>
          <linearGradient id={linea} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={GRIS_DE_LA_ESCALERA} />
            <stop offset="55%" stopColor={GRIS_DE_LA_ESCALERA} />
            <stop offset="100%" stopColor={AZUL_DE_LA_ESCALERA} />
          </linearGradient>
          <linearGradient id={relleno} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={AZUL_DE_LA_ESCALERA} stopOpacity="0.16" />
            <stop offset="100%" stopColor={AZUL_DE_LA_ESCALERA} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="esc-area" d={d.area} fill={`url(#${relleno})`} />
        <path className="esc-curva" d={d.curva} fill="none" stroke={`url(#${linea})`} strokeWidth="3" strokeLinecap="round" />
        {d.marcas.map((m) => (
          <g key={m.letra} className={`esc-nivel${m.activo ? " is-active" : ""}`} data-nivel={m.letra}>
            {/* Lo que se toca con el dedo: más grande que el círculo (invisible). */}
            <circle className="esc-toque" cx={m.x} cy={m.y} r={RADIO.activo + 14} fill="transparent" />
            <circle
              className="esc-aro"
              cx={m.x}
              cy={m.y}
              r={m.r}
              fill={m.activo ? m.color : "#FFFFFF"}
              stroke={m.activo ? m.color : GRIS_DE_LA_ESCALERA}
              strokeWidth="3"
            />
            <text
              className="esc-num"
              x={m.x}
              y={m.y + BAJO_EL_PUNTO.numero}
              textAnchor="middle"
              fontFamily="'Space Grotesk',sans-serif"
              fontSize="24"
              fontWeight="700"
              fill={m.activo ? "#FFFFFF" : GRIS_DE_LA_ESCALERA}
            >
              {m.numero}
            </text>
            <text
              className="esc-nombre"
              x={m.x}
              y={m.y + BAJO_EL_PUNTO.nombre}
              textAnchor="middle"
              fontFamily="Inter,sans-serif"
              fontSize="14"
              fontWeight={m.activo ? 700 : 600}
              fill={m.activo ? m.color : GRIS_DE_LA_ESCALERA}
            >
              {m.nombre}
            </text>
          </g>
        ))}
      </svg>
      {interactiva && <MovimientoDeLaEscalera niveles={niveles} marcados={marcados} />}
    </figure>
  );
}
