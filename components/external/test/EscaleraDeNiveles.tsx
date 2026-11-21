/**
 * components/external/test/EscaleraDeNiveles.tsx — LA ESCALERA de los cinco niveles, arriba de la página de cada área
 * (Elías, 20 nov; desde el 21 nov, la curva de la aplicación vieja: la geometría y la meta en lib/escala/escalera.ts).
 *
 * El dibujo es un SVG ESTÁTICO: se ve completo sin JS, en el teléfono (escala con el ancho; la letra crece en
 * resultado.css) y en el PDF. Hex literal: es una página del cliente y no flipea. Lo que dibuja: la curva que sube despacio
 * y después se dispara, con el color de cada nivel en su punto; el área de abajo que se desvanece; los cinco niveles
 * numerados, el de HOY lleno con su color y «Hoy» arriba, la META con su aro punteado y «Meta» arriba, y el tramo entre los
 * dos punteado. Los nombres llevan un halo blanco: nunca los corta la curva ni el área.
 *
 * Encima se monta MovimientoDeLaEscalera (componente cliente, solo en la pantalla: `interactiva`): los círculos se corren
 * hacia el cursor y crecen bajo él, y cada nivel abre su tarjeta con lo que es ese nivel en el área.
 */
import type { ReactNode } from "react";
import type { Letra } from "@/lib/escala/documento/tipos";
import { BASE_DEL_AREA, dibujoDeLaEscalera, ETIQUETA, lecturaDeLaEscalera, RADIO } from "@/lib/escala/escalera";
import MovimientoDeLaEscalera from "./MovimientoDeLaEscalera";

const TINTA = "#0f1b4c";
const APAGADO = "#7a86a8";

export default function EscaleraDeNiveles({
  area,
  niveles,
  hoy,
  meta,
  idSvg = "esc",
  pie = null,
  interactiva = true,
}: {
  area: string;
  /** Los cinco niveles en orden; `vistazo`, cómo se ve el área en ese nivel (la tarjeta de cada uno). */
  niveles: readonly { letra: Letra; nombre: string; vistazo?: string | null }[];
  /** El nivel general del área hoy (null: «En medición»). */
  hoy: Letra | null;
  /** A dónde la llevamos (`metaDeLaEscalera`). */
  meta: Letra | null;
  /** Un prefijo para los ids de los degradados: dos escaleras en la misma página no pueden compartirlos. */
  idSvg?: string;
  /** Debajo del dibujo: en la pantalla interna, el selector de la meta. */
  pie?: ReactNode;
  /** false en el PDF: sin movimiento ni tarjetas, solo el dibujo. */
  interactiva?: boolean;
}) {
  const d = dibujoDeLaEscalera(niveles, hoy, meta, { quieta: !interactiva });
  const nombre = (l: Letra | null) => (l ? { nombre: niveles.find((n) => n.letra === l)?.nombre ?? l } : null);
  const g = `${idSvg}-grad`;
  const gArea = `${idSvg}-area`;
  const gDesvanece = `${idSvg}-desvanece`;
  const mascara = `${idSvg}-mascara`;
  const x0 = d.marcas[0].x;
  const x1 = d.marcas[d.marcas.length - 1].x;
  const yArriba = Math.min(...d.marcas.map((m) => m.y));
  const metaDibujada = d.marcas.find((m) => m.es === "meta")?.letra ?? null;
  return (
    <figure className="esc">
      <svg
        className="esc-svg"
        viewBox={`${d.caja.x} ${d.caja.y} ${d.caja.ancho} ${d.caja.alto}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={lecturaDeLaEscalera(area, nombre(hoy), nombre(metaDibujada))}
      >
        <defs>
          {/* El color de cada nivel justo en su punto (los puntos no están a la misma distancia). */}
          <linearGradient id={g} gradientUnits="userSpaceOnUse" x1={x0} x2={x1} y1="0" y2="0">
            {d.paradas.map((p) => (
              <stop key={p.offset} offset={p.offset} stopColor={p.color} />
            ))}
          </linearGradient>
          <linearGradient id={gArea} gradientUnits="userSpaceOnUse" x1={x0} x2={x1} y1="0" y2="0">
            {d.paradas.map((p) => (
              <stop key={p.offset} offset={p.offset} stopColor={p.color} stopOpacity="0.3" />
            ))}
          </linearGradient>
          {/* El área se desvanece hacia el piso (la de la vieja): sin un borde de abajo que corte los nombres. */}
          <linearGradient id={gDesvanece} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={yArriba} y2={BASE_DEL_AREA}>
            <stop offset="0" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <mask id={mascara} maskUnits="userSpaceOnUse" x={d.caja.x} y={d.caja.y} width={d.caja.ancho} height={d.caja.alto}>
            <rect x={d.caja.x} y={d.caja.y} width={d.caja.ancho} height={d.caja.alto} fill={`url(#${gDesvanece})`} />
          </mask>
        </defs>
        <path className="esc-area" d={d.area} fill={`url(#${gArea})`} mask={`url(#${mascara})`} />
        <path className="esc-curva" d={d.curva} fill="none" stroke={`url(#${g})`} strokeWidth="4" strokeLinecap="round" />
        {d.tramo && <path className="esc-tramo" d={d.tramo} fill="none" stroke={TINTA} strokeWidth="3" strokeDasharray="2 9" strokeLinecap="round" />}
        {d.marcas.map((m) => {
          const hoyAqui = m.es === "hoy";
          const metaAqui = m.es === "meta";
          const marcado = hoyAqui || metaAqui;
          return (
            <g key={m.letra} className={`esc-nivel${hoyAqui ? " esc-hoy" : ""}${metaAqui ? " esc-meta" : ""}`} data-nivel={m.letra}>
              {/* Lo que se toca con el dedo: más grande que el círculo (invisible). */}
              <circle className="esc-toque" cx={m.x} cy={m.y} r={RADIO.hoy + 16} fill="transparent" />
              {metaAqui && <circle className="esc-aro" cx={m.x} cy={m.y} r={m.r + RADIO.aroDeLaMeta} fill="none" stroke={m.color} strokeWidth="2.5" strokeDasharray="5 5" />}
              <circle className="esc-aro esc-circulo" cx={m.x} cy={m.y} r={m.r} fill={hoyAqui ? m.color : "#ffffff"} stroke={marcado ? m.color : "#c9d1e3"} strokeWidth="3" />
              <text className="esc-num" x={m.x} y={m.y + 9} textAnchor="middle" fontSize="25" fontWeight="700" fill={hoyAqui ? "#ffffff" : metaAqui ? m.color : APAGADO}>
                {m.numero}
              </text>
              <text
                className="esc-nombre"
                x={m.x}
                y={m.yNombre}
                textAnchor="middle"
                fontSize="22"
                fontWeight={marcado ? 700 : 500}
                fill={marcado ? TINTA : APAGADO}
                stroke="#ffffff"
                strokeWidth="6"
                strokeLinejoin="round"
                paintOrder="stroke"
              >
                {m.nombre}
              </text>
              {m.etiqueta && (
                <g className="esc-etiqueta">
                  <rect
                    x={m.etiqueta.x}
                    y={m.etiqueta.y}
                    width={ETIQUETA.ancho}
                    height={ETIQUETA.alto}
                    rx={ETIQUETA.alto / 2}
                    fill={hoyAqui ? TINTA : "#ffffff"}
                    stroke={hoyAqui ? TINTA : m.color}
                    strokeWidth="2"
                  />
                  <text className="esc-chip" x={m.x} y={m.etiqueta.y + 22.5} textAnchor="middle" fontSize="18" fontWeight="700" fill={hoyAqui ? "#ffffff" : m.color}>
                    {hoyAqui ? "Hoy" : "Meta"}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      {interactiva && <MovimientoDeLaEscalera area={area} niveles={niveles} hoy={hoy} meta={metaDibujada} />}
      {pie}
    </figure>
  );
}
