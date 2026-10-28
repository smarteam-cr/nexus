/**
 * components/escala/rueda.tsx — las piezas fijas de la rueda de un área, en SVG: las dos mitades con su nombre y su
 * banda gris, los anillos de nivel, la línea de la base, los nombres de los niveles, el rótulo de cada dimensión y
 * el centro. Sin estado ni efectos: se dibujan igual en el servidor, en el navegador y en el PDF.
 *
 * Las usan el Radar de la escala (components/escala/Radar.tsx, con los tokens del tema) y el radar de una empresa
 * (RadarDeUnaEmpresa.tsx, con hex literal para la página del cliente). La geometría es la del Mapa
 * (lib/escala/rueda.ts): las tres vistas comparten tamaño y rótulos, y solo cambia lo de adentro. El color entra
 * por la `paleta`, nunca escrito en una pieza.
 */
import type { SVGProps } from "react";
import { LETRAS, type ClaveDeCapa, type Letra } from "@/lib/escala/documento/tipos";
import {
  anillo,
  arco,
  CX,
  CY,
  f,
  MITAD,
  polar,
  R_BANDA,
  R_BASE,
  R_CENTRO,
  R_DENTRO,
  R_FUERA,
  rotuloDeCapa,
  rotuloDeDimension,
  sectorDeAnillo,
  lineaDeLaSerie,
  partirEnLineas,
  yDelNombreDeNivel,
} from "@/lib/escala/rueda";

export interface PaletaDeLaRueda {
  fg: string;
  fgSecundario: string;
  fgApagado: string;
  linea: string;
  superficie: string;
  /** La línea punteada de la base (Funcional). */
  base: string;
  niveles: Record<Letra, string>;
}

/** Lo mínimo de una dimensión para ubicarla en la rueda. */
export interface DimensionDeLaRueda {
  id: string;
  nombre: string;
  capa: ClaveDeCapa;
}

/** Las dos mitades: su nombre y descripción al costado y la banda gris en el borde (más oscura si está en foco). */
export function MitadesDeLaRueda({
  capas,
  paleta,
  enFoco = null,
}: {
  capas: readonly { clave: ClaveDeCapa; nombre: string; descripcion?: string | null }[];
  paleta: PaletaDeLaRueda;
  enFoco?: ClaveDeCapa | null;
}) {
  return (
    <g style={{ pointerEvents: "none" }}>
      {capas.map((c) => {
        const r = rotuloDeCapa(c.clave, c.nombre, c.descripcion ?? null);
        const [g0, g1] = MITAD[c.clave];
        const activa = enFoco === c.clave;
        return (
          <g key={c.clave}>
            <path
              d={arco(R_BANDA, g0 + 1, g1 - 1)}
              style={{
                fill: "none",
                stroke: activa ? paleta.fg : paleta.fgApagado,
                strokeOpacity: activa ? 0.55 : 0.25,
                strokeWidth: 10,
                strokeLinecap: "round",
              }}
            />
            {r.nombre.map((linea) => (
              <text
                key={linea.texto}
                x={r.x}
                y={linea.y}
                style={{
                  fill: enFoco && !activa ? paleta.fgApagado : paleta.fg,
                  fontSize: 30,
                  fontWeight: 800,
                  letterSpacing: "0.02em",
                  textAnchor: r.ancla,
                }}
              >
                {linea.texto}
              </text>
            ))}
            {r.descripcion.map((linea) => (
              <text key={linea.texto} x={r.x} y={linea.y} style={{ fill: paleta.fgApagado, fontSize: 16, textAnchor: r.ancla }}>
                {linea.texto}
              </text>
            ))}
          </g>
        );
      })}
    </g>
  );
}

/**
 * Los anillos de nivel, celda por celda como en el mapa pero apenas teñidos con el color de su nivel: son el papel
 * sobre el que se marcan los puntos. Por el medio de cada porción, el eje de la dimensión. Una dimensión que no
 * aplica queda más pálida todavía.
 */
export function AnillosDeLaRueda({
  dims,
  angulos,
  paleta,
  enFoco = null,
  noAplican,
}: {
  dims: readonly DimensionDeLaRueda[];
  angulos: Map<string, [number, number]>;
  paleta: PaletaDeLaRueda;
  enFoco?: string | null;
  noAplican?: ReadonlySet<string>;
}) {
  return (
    <g style={{ pointerEvents: "none" }}>
      {dims.map((d) => {
        const [g0, g1] = angulos.get(d.id)!;
        const pale = noAplican?.has(d.id);
        const foco = enFoco === d.id;
        return (
          <g key={d.id}>
            {LETRAS.map((l, k) => {
              const [r0, r1] = anillo(k);
              return (
                <path
                  key={l}
                  d={sectorDeAnillo(r0, r1, g0, g1)}
                  style={{ fill: paleta.niveles[l], fillOpacity: pale ? 0.05 : foco ? 0.26 : 0.15 }}
                />
              );
            })}
          </g>
        );
      })}
      {dims.map((d) => {
        const [g0, g1] = angulos.get(d.id)!;
        const [x0, y0] = polar((g0 + g1) / 2, R_DENTRO);
        const [x1, y1] = polar((g0 + g1) / 2, R_FUERA);
        return (
          <line
            key={d.id}
            x1={f(x0)}
            y1={f(y0)}
            x2={f(x1)}
            y2={f(y1)}
            style={{ stroke: enFoco === d.id ? paleta.fgApagado : paleta.linea, strokeWidth: enFoco === d.id ? 2 : 1.5 }}
          />
        );
      })}
    </g>
  );
}

/** La base: el borde de adentro de Funcional, punteado, con su rótulo abajo. */
export function LineaDeLaBase({ paleta }: { paleta: PaletaDeLaRueda }) {
  return (
    <g style={{ pointerEvents: "none" }}>
      <circle cx={CX} cy={CY} r={R_BASE} style={{ fill: "none", stroke: paleta.base, strokeWidth: 2.5, strokeDasharray: "8 7" }} />
      <text
        x={CX}
        y={CY + R_BASE + 21}
        style={{
          fill: paleta.base,
          fontSize: 14,
          fontWeight: 700,
          textAnchor: "middle",
          stroke: paleta.superficie,
          strokeWidth: 4,
          paintOrder: "stroke",
        }}
      >
        la base
      </text>
    </g>
  );
}

/** Los nombres de los niveles, en el hueco de arriba, con un halo del color del fondo para leerse sobre las líneas. */
export function NombresDeNiveles({ niveles, paleta }: { niveles: readonly { letra: Letra; nombre: string }[]; paleta: PaletaDeLaRueda }) {
  return (
    <g style={{ pointerEvents: "none" }}>
      {niveles.map((nv) => (
        <text
          key={nv.letra}
          x={CX}
          y={yDelNombreDeNivel(LETRAS.indexOf(nv.letra))}
          style={{
            fill: paleta.fgApagado,
            fontSize: 14,
            fontWeight: 600,
            textAnchor: "middle",
            stroke: paleta.superficie,
            strokeWidth: 5,
            paintOrder: "stroke",
            strokeLinejoin: "round",
          }}
        >
          {nv.nombre}
        </text>
      ))}
    </g>
  );
}

/**
 * El rótulo de una dimensión, en el mismo lugar que en el mapa: su número (y lo que se le sume, como los reportes o
 * el nivel) arriba, su nombre abajo y, si hace falta, una nota. `props` hace del rótulo un botón donde se puede tocar.
 */
export function RotuloDeDimension({
  medio,
  nombre,
  numero,
  nota,
  paleta,
  destacado = false,
  apagado = false,
  props,
}: {
  medio: number;
  nombre: string;
  numero: string;
  nota?: string | null;
  paleta: PaletaDeLaRueda;
  destacado?: boolean;
  apagado?: boolean;
  props?: SVGProps<SVGGElement>;
}) {
  const r = rotuloDeDimension(medio, nombre);
  return (
    <g {...props}>
      <text x={f(r.x)} y={f(r.yNumero)} style={{ textAnchor: r.ancla, fontSize: 14, fill: paleta.fgApagado, fontVariantNumeric: "tabular-nums" }}>
        {numero}
      </text>
      {r.nombre.map((linea) => (
        <text
          key={linea.texto}
          x={f(r.x)}
          y={f(linea.y)}
          style={{
            textAnchor: r.ancla,
            fontSize: 18,
            fontWeight: destacado ? 700 : 600,
            fill: apagado && !destacado ? paleta.fgApagado : paleta.fg,
            opacity: apagado && !destacado ? 0.7 : 1,
          }}
        >
          {linea.texto}
        </text>
      ))}
      {nota && (
        <text x={f(r.x)} y={f(r.yNota)} style={{ textAnchor: r.ancla, fontSize: 13, fill: paleta.fgApagado }}>
          {nota}
        </text>
      )}
    </g>
  );
}

/**
 * El centro: un círculo con lo que se mira. Sin nada en foco, el área y «8 dimensiones · 5 niveles» con las medidas
 * del mapa; con algo en foco, un rótulo chico arriba y el nombre (partido en hasta tres líneas) en el medio.
 */
export function CentroDeLaRueda({
  paleta,
  titulo,
  subtitulo,
  antetitulo,
}: {
  paleta: PaletaDeLaRueda;
  titulo: string;
  subtitulo?: string | null;
  antetitulo?: string | null;
}) {
  // El área va grande si cabe (unas 11 letras a 30 en los ~200 del círculo); si no, más chica y partida.
  const largo = titulo.length > 11;
  const partido = largo ? partirEnLineas(titulo, 16) : [titulo];
  // Más de tres renglones no caben en el círculo: el tercero termina en «…».
  const lineas = partido.length > 3 ? [...partido.slice(0, 2), `${partido[2]}…`] : partido;
  const tam = largo ? 21 : 30;
  const altoAntes = antetitulo ? 22 : 0;
  const altoTitulo = tam + 4;
  // El subtítulo, en hasta dos renglones de 26 letras (a 15, lo que entra en el círculo).
  const renglonesDelSubtitulo = subtitulo ? partirEnLineas(subtitulo, 26).slice(0, 2) : [];
  const alto = altoAntes + lineas.length * altoTitulo + renglonesDelSubtitulo.length * 20 + (subtitulo ? 4 : 0);
  const arriba = CY - alto / 2;
  const yTitulo = arriba + altoAntes;
  const ySubtitulo = yTitulo + lineas.length * altoTitulo;
  return (
    <g style={{ pointerEvents: "none" }}>
      <circle cx={CX} cy={CY} r={R_CENTRO} style={{ fill: paleta.superficie, stroke: paleta.linea, strokeWidth: 1.5 }} />
      {antetitulo && (
        <text x={CX} y={arriba + 15} style={{ fill: paleta.fgApagado, fontSize: 15, textAnchor: "middle", fontVariantNumeric: "tabular-nums" }}>
          {antetitulo}
        </text>
      )}
      {lineas.map((linea, j) => (
        <text key={linea} x={CX} y={yTitulo + j * altoTitulo + tam * 0.8} style={{ fill: paleta.fg, fontSize: tam, fontWeight: 700, textAnchor: "middle" }}>
          {linea}
        </text>
      ))}
      {renglonesDelSubtitulo.map((linea, j) => (
        <text key={linea} x={CX} y={ySubtitulo + 19 + j * 20} style={{ fill: paleta.fgApagado, fontSize: 15, textAnchor: "middle" }}>
          {linea}
        </text>
      ))}
    </g>
  );
}

/**
 * La línea de una serie (`lineaDeLaSerie`): entera dentro de cada mitad y, al cruzar el hueco entre las dos, fina y
 * punteada, para que no tache los nombres de los niveles ni «la base». El relleno, apenas, solo con todos los puntos.
 */
export function LineaDeUnaSerie({
  ejes,
  color,
  relleno = 0.08,
}: {
  ejes: readonly { medio: number; capa: ClaveDeCapa; punto: [number, number] | null }[];
  color: string;
  relleno?: number;
}) {
  const { lados, relleno: poligono } = lineaDeLaSerie(ejes);
  return (
    <g style={{ pointerEvents: "none" }}>
      {poligono && <polygon points={poligono.map((p) => p.map(f).join(",")).join(" ")} style={{ fill: color, fillOpacity: relleno, stroke: "none" }} />}
      {lados.map(({ de, a, cruzaElHueco }, k) => (
        <line
          key={k}
          x1={f(de[0])}
          y1={f(de[1])}
          x2={f(a[0])}
          y2={f(a[1])}
          style={
            cruzaElHueco
              ? { stroke: color, strokeWidth: 1.5, strokeOpacity: 0.45, strokeDasharray: "2 6", strokeLinecap: "round" }
              : { stroke: color, strokeWidth: 3, strokeOpacity: 0.9, strokeLinecap: "round" }
          }
        />
      ))}
    </g>
  );
}
