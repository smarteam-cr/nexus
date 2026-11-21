/**
 * components/external/test/EscaleraDeNiveles.tsx — LA ESCALERA de los cinco niveles, arriba de la página de cada área
 * (Elías, 20 nov; la geometría y la meta en lib/escala/escalera.ts). SVG estático, sin JS: sirve igual en la pantalla, en el
 * teléfono (escala con el ancho; la letra va grande en el lienzo para que no baje de unos 11 px) y en el PDF. Hex literal:
 * es una página del cliente y no flipea.
 *
 * Lo que dibuja: la curva en S con el área de abajo sombreada de rojo a verde, los cinco niveles numerados encima, el de
 * HOY lleno con su color y «Hoy» arriba, la META con su aro punteado y «Meta» arriba, y el tramo entre los dos más marcado.
 */
import type { ReactNode } from "react";
import type { Letra } from "@/lib/escala/documento/tipos";
import { ALTO_DE_LA_ESCALERA, ANCHO_DE_LA_ESCALERA, COLOR_DE_LA_ESCALERA, dibujoDeLaEscalera, lecturaDeLaEscalera } from "@/lib/escala/escalera";

const TINTA = "#0f1b4c";
const APAGADO = "#7a86a8";

export default function EscaleraDeNiveles({
  area,
  niveles,
  hoy,
  meta,
  idSvg = "esc",
  pie = null,
}: {
  area: string;
  niveles: readonly { letra: Letra; nombre: string }[];
  /** El nivel general del área hoy (null: «En medición»). */
  hoy: Letra | null;
  /** A dónde la llevamos (`metaDeLaEscalera`). */
  meta: Letra | null;
  /** Un prefijo para los ids de los degradados: dos escaleras en la misma página no pueden compartirlos. */
  idSvg?: string;
  /** Debajo del dibujo: en la pantalla interna, el selector de la meta. */
  pie?: ReactNode;
}) {
  const d = dibujoDeLaEscalera(niveles, hoy, meta);
  const nombre = (l: Letra | null) => (l ? { nombre: niveles.find((n) => n.letra === l)?.nombre ?? l } : null);
  const g = `${idSvg}-grad`;
  const gArea = `${idSvg}-area`;
  const paradas = (["D", "I", "F", "E", "O"] as const).map((l, i) => <stop key={l} offset={`${i * 25}%`} stopColor={COLOR_DE_LA_ESCALERA[l]} />);
  return (
    <figure className="esc">
      <svg
        className="esc-svg"
        viewBox={`0 0 ${ANCHO_DE_LA_ESCALERA} ${ALTO_DE_LA_ESCALERA}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={lecturaDeLaEscalera(area, nombre(hoy), nombre(meta))}
      >
        <defs>
          <linearGradient id={g} x1="0" x2="1" y1="0" y2="0">
            {paradas}
          </linearGradient>
          <linearGradient id={gArea} x1="0" x2="1" y1="0" y2="0">
            {(["D", "I", "F", "E", "O"] as const).map((l, i) => (
              <stop key={l} offset={`${i * 25}%`} stopColor={COLOR_DE_LA_ESCALERA[l]} stopOpacity="0.13" />
            ))}
          </linearGradient>
        </defs>
        <path className="esc-area" d={d.area} fill={`url(#${gArea})`} />
        {d.areaDelTramo && <path className="esc-area-tramo" d={d.areaDelTramo} fill={`url(#${gArea})`} />}
        <path className="esc-curva" d={d.curva} fill="none" stroke={`url(#${g})`} strokeWidth="4" strokeLinecap="round" />
        {d.tramo && <path className="esc-tramo" d={d.tramo} fill="none" stroke={TINTA} strokeWidth="3" strokeDasharray="2 9" strokeLinecap="round" />}
        {d.marcas.map((m) => {
          const hoyAqui = m.es === "hoy";
          const metaAqui = m.es === "meta";
          const r = hoyAqui ? 30 : metaAqui ? 28 : 24;
          return (
            <g key={m.letra} className={`esc-nivel${hoyAqui ? " esc-hoy" : ""}${metaAqui ? " esc-meta" : ""}`} data-nivel={m.letra}>
              {metaAqui && <circle cx={m.x} cy={m.y} r={r + 8} fill="none" stroke={m.color} strokeWidth="2.5" strokeDasharray="5 5" />}
              <circle cx={m.x} cy={m.y} r={r} fill={hoyAqui ? m.color : "#ffffff"} stroke={hoyAqui || metaAqui ? m.color : "#c9d1e3"} strokeWidth="3" />
              <text className="esc-num" x={m.x} y={m.y + 9} textAnchor="middle" fontSize="25" fontWeight="700" fill={hoyAqui ? "#ffffff" : metaAqui ? m.color : APAGADO}>
                {m.numero}
              </text>
              <text className="esc-nombre" x={m.x} y={m.y + r + 34} textAnchor="middle" fontSize="22" fontWeight={hoyAqui || metaAqui ? 700 : 500} fill={hoyAqui || metaAqui ? TINTA : APAGADO}>
                {m.nombre}
              </text>
              {(hoyAqui || metaAqui) && (
                <g className="esc-etiqueta">
                  <rect x={m.x - 46} y={m.y - r - 46} width="92" height="32" rx="16" fill={hoyAqui ? TINTA : "#ffffff"} stroke={hoyAqui ? TINTA : m.color} strokeWidth="2" />
                  <text className="esc-chip" x={m.x} y={m.y - r - 23.5} textAnchor="middle" fontSize="18" fontWeight="700" fill={hoyAqui ? "#ffffff" : m.color}>
                    {hoyAqui ? "Hoy" : "Meta"}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      {pie}
    </figure>
  );
}
