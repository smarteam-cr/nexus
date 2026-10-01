"use client";

/**
 * RuedaDelEquipo — un área de la escala como rueda, con dónde parece estar el equipo.
 *
 * Es la misma lectura que el mapa de la sección Escala (components/escala/Mapa.tsx): cada porción
 * es una dimensión y cada anillo un nivel, Deficiente al centro y Óptimo en el borde; la base
 * operativa a la derecha y la producción a la izquierda; los nombres de los niveles en el hueco de
 * arriba y la línea punteada en Funcional. Acá cada porción se llena HASTA el nivel en que parece
 * estar esa dimensión:
 *   · color lleno: con evidencia (lo dijo el cliente, se vio en el portal o lo marcó el vendedor);
 *   · rayado: hipótesis (del test o de lo que hay en HubSpot), para explorar en la reunión;
 *   · vacía: sin dato. Un punto en el borde avisa que el agente propone algo nuevo.
 * Tocar una porción la abre al costado.
 */
import { useId, useState } from "react";
import { COLOR_DE_NIVEL } from "@/components/escala/niveles";
import type { ClaveDeCapa, Letra } from "@/lib/escala/documento/tipos";
import type { AreaDelLienzo, DimensionDelLienzo } from "@/lib/exploraciones/escala-del-lienzo";
import type { PosicionEnElMapa } from "@/lib/exploraciones/mapa";

const LETRAS: Letra[] = ["D", "I", "F", "E", "O"];

// ── Geometría (unidades del viewBox) ──────────────────────────────────────────
const W = 760;
const H = 540;
const CX = 380;
const CY = 272;
const R_CENTRO = 48;
const R_DENTRO = 56;
const ANCHO = 34;
const R_FUERA = R_DENTRO + ANCHO * 5;
/** La línea de Funcional: el borde de adentro de su anillo. */
const R_FUNCIONAL = R_DENTRO + ANCHO * 2;
const R_ETIQUETA = R_FUERA + 16;
/** Grados libres arriba y abajo: separan las dos capas, y arriba van los nombres de los niveles. */
const HUECO = 26;
const AIRE_ANGULAR = 1.2;
const AIRE_RADIAL = 2.5;

const f = (v: number) => v.toFixed(1);
const aRadianes = (g: number) => (g * Math.PI) / 180;

/** Grados de reloj (0 = arriba, en el sentido de las agujas) → coordenadas. */
function polar(grados: number, r: number): [number, number] {
  return [CX + r * Math.sin(aRadianes(grados)), CY - r * Math.cos(aRadianes(grados))];
}

function sectorDeAnillo(r0: number, r1: number, g0: number, g1: number): string {
  const [ax, ay] = polar(g0, r1);
  const [bx, by] = polar(g1, r1);
  const [cx, cy] = polar(g1, r0);
  const [dx, dy] = polar(g0, r0);
  const grande = g1 - g0 > 180 ? 1 : 0;
  return `M${f(ax)} ${f(ay)}A${r1} ${r1} 0 ${grande} 1 ${f(bx)} ${f(by)}L${f(cx)} ${f(cy)}A${r0} ${r0} 0 ${grande} 0 ${f(dx)} ${f(dy)}Z`;
}

/** Los radios de un anillo (k = 0 es Deficiente), con aire entre anillos. */
const anillo = (k: number): [number, number] => [R_DENTRO + ANCHO * k + AIRE_RADIAL / 2, R_DENTRO + ANCHO * (k + 1) - AIRE_RADIAL / 2];

const MITAD: Record<ClaveDeCapa, [number, number]> = {
  base: [HUECO / 2, 180 - HUECO / 2],
  produccion: [180 + HUECO / 2, 360 - HUECO / 2],
};

function porciones(dims: readonly DimensionDelLienzo[]): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  for (const clave of Object.keys(MITAD) as ClaveDeCapa[]) {
    const [inicio, fin] = MITAD[clave];
    const deLaCapa = dims.filter((d) => d.capa === clave);
    const paso = (fin - inicio) / Math.max(1, deLaCapa.length);
    deLaCapa.forEach((d, j) => out.set(d.id, [inicio + paso * j + AIRE_ANGULAR / 2, inicio + paso * (j + 1) - AIRE_ANGULAR / 2]));
  }
  return out;
}

/** Un texto partido en líneas de hasta `max` caracteres, sin cortar palabras (el SVG no parte solo). */
function partirEnLineas(texto: string, max: number): string[] {
  const out: string[] = [];
  let linea = "";
  for (const palabra of texto.split(/\s+/).filter(Boolean)) {
    if (linea && `${linea} ${palabra}`.length > max) {
      out.push(linea);
      linea = palabra;
    } else linea = linea ? `${linea} ${palabra}` : palabra;
  }
  if (linea) out.push(linea);
  return out.slice(0, 3);
}

export default function RuedaDelEquipo({
  area,
  posiciones,
  niveles,
  nivelDelArea,
  elegida,
  onElegir,
}: {
  area: AreaDelLienzo;
  posiciones: Readonly<Record<string, PosicionEnElMapa>>;
  niveles: { letra: Letra; nombre: string }[];
  /** El nivel que sale del chequeo del mapa (null mientras falte algo). */
  nivelDelArea: Letra | null;
  elegida: string | null;
  onElegir: (dimensionId: string | null) => void;
}) {
  const uid = useId().replace(/:/g, "");
  // La porción con el foco del teclado: se marca con un borde (el estilo en línea no deja usar :focus-visible).
  const [conFoco, setConFoco] = useState<string | null>(null);
  const angulos = porciones(area.dimensiones);
  const nombre = (l: Letra) => niveles.find((n) => n.letra === l)?.nombre ?? l;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block h-auto w-full max-w-[760px]" role="group" aria-label={`Dónde parece estar ${area.nombre}, dimensión por dimensión`}>
      <defs>
        {LETRAS.map((l) => (
          <pattern key={l} id={`${uid}-h-${l}`} width={7} height={7} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={7} height={7} style={{ fill: COLOR_DE_NIVEL[l], fillOpacity: 0.16 }} />
            <rect width={3} height={7} style={{ fill: COLOR_DE_NIVEL[l], fillOpacity: 0.9 }} />
          </pattern>
        ))}
        <pattern id={`${uid}-no-aplica`} width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={8} height={8} style={{ fill: "var(--color-surface-muted)" }} />
          <line x1={0} y1={0} x2={0} y2={8} style={{ stroke: "var(--color-line)", strokeWidth: 3 }} />
        </pattern>
      </defs>

      {/* Las porciones: una por dimensión, cada una con sus cinco anillos */}
      {area.dimensiones.map((d) => {
        const [g0, g1] = angulos.get(d.id) ?? [0, 0];
        const p = d.aplica ? posiciones[d.id] : undefined;
        const kNivel = p ? LETRAS.indexOf(p.nivel) : -1;
        const esElegida = elegida === d.id;
        const etiqueta = !d.aplica
          ? `${d.nombre}: no aplica a este perfil`
          : p
            ? `${d.nombre}: ${nombre(p.nivel)}, ${p.clase === "evidencia" ? "con evidencia" : "hipótesis"}${p.porRevisar ? ", con algo nuevo del agente" : ""}`
            : `${d.nombre}: sin dato`;
        const medio = (g0 + g1) / 2;
        return (
          <g
            key={d.id}
            role="button"
            tabIndex={0}
            aria-label={etiqueta}
            aria-pressed={esElegida}
            className="cursor-pointer outline-none"
            onFocus={() => setConFoco(d.id)}
            onBlur={() => setConFoco((x) => (x === d.id ? null : x))}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onElegir(esElegida ? null : d.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onElegir(esElegida ? null : d.id);
              }
            }}
          >
            {LETRAS.map((l, k) => {
              const [r0, r1] = anillo(k);
              let fill = "var(--color-surface-muted)";
              let fillOpacity = 1;
              if (!d.aplica) fill = `url(#${uid}-no-aplica)`;
              else if (p && k < kNivel) {
                fill = COLOR_DE_NIVEL[l];
                fillOpacity = 0.22;
              } else if (p && k === kNivel) {
                fill = p.clase === "evidencia" ? COLOR_DE_NIVEL[l] : `url(#${uid}-h-${l})`;
                fillOpacity = p.clase === "evidencia" ? 0.9 : 1;
              }
              return (
                <path
                  key={l}
                  d={sectorDeAnillo(r0, r1, g0, g1)}
                  style={{
                    fill,
                    fillOpacity,
                    stroke: p && k === kNivel && p.clase === "hipotesis" ? COLOR_DE_NIVEL[l] : "var(--color-line)",
                    strokeWidth: p && k === kNivel && p.clase === "hipotesis" ? 1.5 : 0.6,
                    strokeDasharray: p && k === kNivel && p.clase === "hipotesis" ? "4 3" : undefined,
                    transition: "fill-opacity 200ms ease",
                  }}
                />
              );
            })}
            {/* El contorno de la porción: marca la elegida (y el foco del teclado) */}
            <path
              d={sectorDeAnillo(R_DENTRO, R_FUERA, g0, g1)}
              style={{
                fill: "transparent",
                stroke: esElegida ? "var(--color-fg)" : conFoco === d.id ? "var(--color-brand)" : "transparent",
                strokeWidth: esElegida ? 2.5 : 2,
                strokeDasharray: !esElegida && conFoco === d.id ? "5 4" : undefined,
              }}
            />
            {p?.porRevisar && (
              <circle cx={f(polar(medio, R_FUERA + 7)[0])} cy={f(polar(medio, R_FUERA + 7)[1])} r={5} style={{ fill: "var(--color-brand)" }} />
            )}
          </g>
        );
      })}

      {/* Funcional: la línea punteada, con su nombre abajo */}
      <circle cx={CX} cy={CY} r={R_FUNCIONAL} style={{ fill: "none", stroke: "var(--color-success)", strokeWidth: 2, strokeDasharray: "6 5", pointerEvents: "none" }} />

      {/* Los nombres de los niveles, en el hueco de arriba */}
      {LETRAS.map((l, k) => {
        const [r0, r1] = anillo(k);
        return (
          <text
            key={l}
            x={CX}
            y={CY - (r0 + r1) / 2 + 4}
            style={{
              fill: "var(--color-fg-muted)",
              fontSize: 11,
              fontWeight: 600,
              textAnchor: "middle",
              stroke: "var(--color-surface)",
              strokeWidth: 3,
              paintOrder: "stroke",
              pointerEvents: "none",
            }}
          >
            {nombre(l)}
          </text>
        );
      })}

      {/* Los nombres de las dimensiones, afuera: tocarlos también la abre */}
      {area.dimensiones.map((d) => {
        const [g0, g1] = angulos.get(d.id) ?? [0, 0];
        const medio = (g0 + g1) / 2;
        const [x, y] = polar(medio, R_ETIQUETA);
        const s = Math.sin(aRadianes(medio));
        const c = Math.cos(aRadianes(medio));
        const ancla = s > 0.15 ? "start" : s < -0.15 ? "end" : "middle";
        const lineas = partirEnLineas(d.nombre, Math.abs(s) > 0.8 ? 18 : 24);
        const extra = (lineas.length - 1) * 15;
        const y0 = c > 0.35 ? y - 4 - extra : c < -0.35 ? y + 12 : y + 4 - extra / 2;
        const p = posiciones[d.id];
        const esElegida = elegida === d.id;
        return (
          <g key={d.id} className="cursor-pointer" onClick={() => onElegir(esElegida ? null : d.id)} aria-hidden="true">
            {lineas.map((linea, j) => (
              <text
                key={j}
                x={f(x)}
                y={f(y0 + j * 15)}
                style={{
                  textAnchor: ancla,
                  fontSize: 12.5,
                  fontWeight: esElegida || p?.porRevisar ? 700 : 500,
                  fill: d.aplica ? "var(--color-fg)" : "var(--color-fg-muted)",
                }}
              >
                {linea}
              </text>
            ))}
          </g>
        );
      })}

      {/* El centro: el nivel del área */}
      <circle cx={CX} cy={CY} r={R_CENTRO} style={{ fill: "var(--color-surface)", stroke: "var(--color-line)", strokeWidth: 1.2 }} />
      {nivelDelArea ? (
        <>
          <text x={CX} y={CY - 4} style={{ fill: COLOR_DE_NIVEL[nivelDelArea], fontSize: 15, fontWeight: 800, textAnchor: "middle" }}>
            {nombre(nivelDelArea)}
          </text>
          <text x={CX} y={CY + 13} style={{ fill: "var(--color-fg-muted)", fontSize: 10.5, textAnchor: "middle" }}>
            {area.nombre}
          </text>
        </>
      ) : (
        <text x={CX} y={CY + 5} style={{ fill: "var(--color-fg-muted)", fontSize: 12, textAnchor: "middle" }}>
          {area.nombre}
        </text>
      )}
    </svg>
  );
}
