"use client";

/**
 * RuedaDelEquipo — un área de la escala como rueda, con dónde parece estar el equipo.
 *
 * Copia el tablero «Preventa · La escala» (Claude Design, aprobado por Elías el 2026-10-05) medida por
 * medida, en su caja de 900 × 640: cada porción es una dimensión y cada anillo un nivel, Deficiente al
 * centro y Óptimo en el borde; la base operativa a la derecha y la producción a la izquierda, con sus
 * nombres grandes a cada lado; los nombres de los niveles en el hueco de arriba y el círculo punteado
 * en Funcional («la base»). Cada porción se pinta HASTA el nivel en que está esa dimensión, y la celda
 * de ese nivel lleva la marca: ✓ con evidencia, ? hipótesis (y la porción entera en un tono más claro).
 * Con una dimensión elegida, las demás se aclaran, como en el mapa de la sección Escala.
 *
 * ⚠ Los textos van en HTML ENCIMA del SVG (posiciones en %), no en `<text>`: los nombres de las
 * dimensiones se parten solos y siguen siendo botones. Al pasar el cursor por una celda sale un
 * tooltip con lo que dice la escala de ese nivel y dónde está el equipo respecto de él.
 */
import { useState } from "react";
import { COLOR_DE_NIVEL, PUNTO_DE_NIVEL } from "@/components/escala/niveles";
import { cn } from "@/lib/cn";
import type { ClaveDeCapa, Letra } from "@/lib/escala/documento/tipos";
import type { AreaDelLienzo, DimensionDelLienzo } from "@/lib/exploraciones/escala-del-lienzo";
import type { PosicionEnElMapa } from "@/lib/exploraciones/mapa";

const LETRAS: Letra[] = ["D", "I", "F", "E", "O"];

// ── Geometría del tablero (unidades del viewBox) ──────────────────────────────
const W = 900;
const H = 640;
const CX = 450;
const CY = 318;
const R0 = 72;
const ANCHO = 37;
/** Grados libres arriba y abajo: separan las dos capas, y arriba van los nombres de los niveles. */
const HUECO = 30;
const R_ETIQUETA = 304;
const R_CENTRO = 66;
/** «La base»: el borde de adentro del anillo de Funcional. */
const R_FUNCIONAL = R0 + ANCHO * 2;

const f = (v: number) => v.toFixed(1);
const rad = (g: number) => (g * Math.PI) / 180;
const pctX = (x: number) => `${(x / W) * 100}%`;
const pctY = (y: number) => `${(y / H) * 100}%`;

/** Grados de reloj (0 = arriba, en el sentido de las agujas) → coordenadas. */
function polar(g: number, r: number): [number, number] {
  return [CX + r * Math.sin(rad(g)), CY - r * Math.cos(rad(g))];
}

function sector(r0: number, r1: number, g0: number, g1: number): string {
  const [ax, ay] = polar(g0, r1);
  const [bx, by] = polar(g1, r1);
  const [cx, cy] = polar(g1, r0);
  const [dx, dy] = polar(g0, r0);
  return `M${f(ax)} ${f(ay)}A${r1} ${r1} 0 0 1 ${f(bx)} ${f(by)}L${f(cx)} ${f(cy)}A${r0} ${r0} 0 0 0 ${f(dx)} ${f(dy)}Z`;
}

function arco(r: number, g0: number, g1: number): string {
  const [ax, ay] = polar(g0, r);
  const [bx, by] = polar(g1, r);
  return `M${f(ax)} ${f(ay)}A${r} ${r} 0 0 1 ${f(bx)} ${f(by)}`;
}

/** Los radios de un anillo (k = 0 es Deficiente), con aire entre anillos. */
const anillo = (k: number): [number, number] => [R0 + ANCHO * k + 1.5, R0 + ANCHO * (k + 1) - 1.5];
const R_FUERA = anillo(4)[1];

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
    deLaCapa.forEach((d, j) => out.set(d.id, [inicio + paso * j + 0.8, inicio + paso * (j + 1) - 0.8]));
  }
  return out;
}

export default function RuedaDelEquipo({
  area,
  posiciones,
  niveles,
  nombresDeCapa,
  nivelDelArea,
  verbo,
  elegida,
  onElegir,
}: {
  area: AreaDelLienzo;
  posiciones: Readonly<Record<string, PosicionEnElMapa>>;
  niveles: { letra: Letra; nombre: string }[];
  nombresDeCapa: Record<ClaveDeCapa, string>;
  /** El nivel que sale del chequeo del mapa (null mientras falte algo). */
  nivelDelArea: Letra | null;
  /** «está en» o «parece estar en». */
  verbo: string;
  elegida: string | null;
  onElegir: (dimensionId: string | null) => void;
}) {
  const [encima, setEncima] = useState<{ dim: string; k: number } | null>(null);
  const angulos = porciones(area.dimensiones);
  const nombre = (l: Letra) => niveles.find((n) => n.letra === l)?.nombre ?? l;
  const alternar = (id: string) => onElegir(elegida === id ? null : id);

  return (
    <div data-recorrido="preventa.escala.dimensiones" className="relative mx-auto w-full max-w-[900px]" style={{ aspectRatio: `${W} / ${H}` }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 block h-full w-full" role="img" aria-label={`Dónde parece estar ${area.nombre}, dimensión por dimensión`}>
        {/* Los arcos de cada capa, afuera */}
        {(["base", "produccion"] as ClaveDeCapa[]).map((c) => (
          <path key={c} d={arco(R_FUERA + 12, MITAD[c][0], MITAD[c][1])} style={{ fill: "none", stroke: "var(--color-line)", strokeWidth: 6, strokeLinecap: "round" }} />
        ))}

        {/* Las celdas: una por dimensión y nivel */}
        {area.dimensiones.map((d) => {
          const [g0, g1] = angulos.get(d.id) ?? [0, 0];
          const p = d.aplica ? posiciones[d.id] : undefined;
          const kn = p ? LETRAS.indexOf(p.nivel) : -1;
          const hip = p?.clase === "hipotesis";
          const apagada = !!elegida && elegida !== d.id;
          return LETRAS.map((l, k) => {
            const [r0, r1] = anillo(k);
            let op = !d.aplica ? 0 : k < kn ? 0.5 : k === kn ? 0.95 : 0;
            if (hip) op *= 0.5;
            if (apagada) op *= 0.35;
            const enEsta = encima?.dim === d.id && encima.k === k;
            return (
              <path
                key={`${d.id}-${l}`}
                d={sector(r0, r1, g0, g1)}
                onClick={() => d.aplica && alternar(d.id)}
                onMouseEnter={() => setEncima({ dim: d.id, k })}
                onMouseLeave={() => setEncima((x) => (x?.dim === d.id && x.k === k ? null : x))}
                style={{
                  fill: op > 0 ? COLOR_DE_NIVEL[l] : "var(--color-surface-hover)",
                  fillOpacity: op > 0 ? op : apagada || !d.aplica ? 0.45 : 1,
                  stroke: enEsta ? "var(--color-fg)" : "var(--color-surface)",
                  strokeWidth: 2,
                  cursor: d.aplica ? "pointer" : "default",
                  transition: "fill-opacity 150ms ease",
                }}
              />
            );
          });
        })}

        {/* La base: el círculo punteado de Funcional */}
        <circle cx={CX} cy={CY} r={R_FUNCIONAL} style={{ fill: "none", stroke: "var(--color-nivel-funcional)", strokeWidth: 2, strokeDasharray: "6 5", pointerEvents: "none" }} />
        <circle cx={CX} cy={CY} r={R_CENTRO} style={{ fill: "var(--color-surface)", stroke: "var(--color-line)", strokeWidth: 1 }} />
      </svg>

      {/* Los nombres de los niveles, en el hueco de arriba */}
      {LETRAS.map((l, k) => {
        const [r0, r1] = anillo(k);
        return (
          <span
            key={l}
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-[11.5px] font-semibold text-fg-muted"
            style={{ left: "50%", top: pctY(CY - (r0 + r1) / 2) }}
          >
            {nombre(l)}
          </span>
        );
      })}
      <span className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-xs font-semibold text-success-ink" style={{ left: "50%", top: pctY(CY + R_FUNCIONAL + 20) }}>
        la base
      </span>

      {/* La marca de cada dimensión, en la celda de su nivel: ✓ con evidencia, ? hipótesis */}
      {area.dimensiones.map((d) => {
        const p = d.aplica ? posiciones[d.id] : undefined;
        if (!p) return null;
        const [g0, g1] = angulos.get(d.id) ?? [0, 0];
        const [r0, r1] = anillo(LETRAS.indexOf(p.nivel));
        const [x, y] = polar((g0 + g1) / 2, (r0 + r1) / 2);
        const hip = p.clase === "hipotesis";
        return (
          <span
            key={d.id}
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute flex h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-surface text-[11px] font-bold",
              hip ? "border-[1.5px] border-dashed border-warning text-warn-ink" : "border-[1.5px] border-success text-success-ink",
            )}
            style={{ left: pctX(x), top: pctY(y), opacity: elegida && elegida !== d.id ? 0.4 : 1 }}
          >
            {hip ? "?" : "✓"}
          </span>
        );
      })}

      {/* El centro: el área y dónde está */}
      <div className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-px text-center" style={{ left: "50%", top: pctY(CY) }}>
        <span className="text-[17px] font-bold text-fg">{area.nombre}</span>
        {nivelDelArea ? (
          <>
            <span className="text-[11px] text-fg-muted">{verbo}</span>
            <span className="inline-flex items-center gap-[5px] text-[13px] font-bold text-fg">
              <span className={cn("h-2 w-2 rounded-full", PUNTO_DE_NIVEL[nivelDelArea])} aria-hidden="true" />
              {nombre(nivelDelArea)}
            </span>
          </>
        ) : (
          <span className="text-[11px] text-fg-muted">sin ubicar</span>
        )}
      </div>

      {/* Las dos capas, a cada lado */}
      <div className="pointer-events-none absolute left-0 hidden -translate-y-1/2 flex-col gap-0.5 md:flex" style={{ top: pctY(300) }}>
        <span className="text-[20px] font-extrabold uppercase tracking-[0.02em] text-fg">{nombresDeCapa.produccion}</span>
        <span className="text-xs text-fg-muted">qué entrega hacia afuera</span>
      </div>
      <div className="pointer-events-none absolute right-0 hidden -translate-y-1/2 flex-col items-end gap-0.5 text-right md:flex" style={{ top: pctY(300) }}>
        <span className="text-[20px] font-extrabold uppercase tracking-[0.02em] text-fg">{nombresDeCapa.base}</span>
        <span className="text-xs text-fg-muted">cómo está montado por dentro</span>
      </div>

      {/* El tooltip de la celda bajo el cursor */}
      {encima && <Tooltip area={area} d={area.dimensiones.find((x) => x.id === encima.dim)!} k={encima.k} p={posiciones[encima.dim]} angulos={angulos} nombre={nombre} />}

      {/* Los nombres de las dimensiones, afuera: tocarlos también la abre */}
      {area.dimensiones.map((d) => {
        const [g0, g1] = angulos.get(d.id) ?? [0, 0];
        const m = (g0 + g1) / 2;
        const [x, y] = polar(m, R_ETIQUETA);
        const sn = Math.sin(rad(m));
        const co = Math.cos(rad(m));
        const p = d.aplica ? posiciones[d.id] : undefined;
        const esElegida = elegida === d.id;
        const hip = p?.clase === "hipotesis";
        const horizontal: React.CSSProperties = sn > 0 ? { left: pctX(x), alignItems: "flex-start", textAlign: "left" } : { right: pctX(W - x), alignItems: "flex-end", textAlign: "right" };
        const vertical: React.CSSProperties = co > 0.3 ? { bottom: pctY(H - y) } : co < -0.3 ? { top: pctY(y) } : { top: pctY(y), transform: "translateY(-50%)" };
        return (
          <button
            key={d.id}
            type="button"
            aria-pressed={esElegida}
            disabled={!d.aplica}
            onClick={() => alternar(d.id)}
            className="absolute flex max-w-[22%] flex-col gap-px border-0 bg-transparent px-0 py-0.5 disabled:cursor-default"
            style={{ ...horizontal, ...vertical }}
          >
            <span className="text-[11px] tabular-nums text-fg-muted">{d.id}</span>
            <span className={cn("text-sm leading-[1.25] text-fg", esElegida ? "font-bold underline underline-offset-[3px]" : "font-medium", !d.aplica && "text-fg-muted")}>{d.nombre}</span>
            {!d.aplica ? (
              <span className="text-xs text-fg-muted">No aplica a este perfil</span>
            ) : p ? (
              <span className={cn("inline-flex items-center gap-[5px] text-xs", hip ? "text-warn-ink" : "text-success-ink")}>
                <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", PUNTO_DE_NIVEL[p.nivel])} aria-hidden="true" />
                {nombre(p.nivel)} · {hip ? "hipótesis" : "con evidencia"}
              </span>
            ) : (
              <span className="text-xs text-fg-muted">Sin dato</span>
            )}
            {p?.porRevisar && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand">
                <span className="h-[7px] w-[7px] rounded-full bg-info" aria-hidden="true" />
                el agente sugiere algo
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Lo que dice la escala de ese nivel y dónde está el equipo respecto de él. */
function Tooltip({
  d,
  k,
  p,
  angulos,
  nombre,
}: {
  area: AreaDelLienzo;
  d: DimensionDelLienzo;
  k: number;
  p: PosicionEnElMapa | undefined;
  angulos: Map<string, [number, number]>;
  nombre: (l: Letra) => string;
}) {
  const l = LETRAS[k];
  const [g0, g1] = angulos.get(d.id) ?? [0, 0];
  const [r0, r1] = anillo(k);
  const [x, y] = polar((g0 + g1) / 2, (r0 + r1) / 2);
  const kn = p ? LETRAS.indexOf(p.nivel) : -1;
  const hip = p?.clase === "hipotesis";
  const descripcion = d.niveles.find((n) => n.letra === l)?.descripcion ?? "";
  const estado = !d.aplica
    ? { texto: "No aplica a este perfil de negocio", clase: "text-fg-muted" }
    : !p
      ? { texto: "Todavía sin dato: pregúntalo en la reunión", clase: "text-fg-muted" }
      : k === kn
        ? { texto: hip ? "? Aquí parece estar hoy · hipótesis" : "✓ Aquí está hoy · con evidencia", clase: hip ? "text-warn-ink" : "text-success-ink" }
        : k < kn
          ? { texto: "Debajo de donde está hoy", clase: "text-fg-muted" }
          : l === "F"
            ? { texto: "Todavía no llega: es el objetivo de la primera venta", clase: "text-fg" }
            : { texto: "Todavía no llega", clase: "text-fg-muted" };
  const cita = k === kn ? p?.citas[0] : undefined;
  const sugerido = k === kn && !!p?.porRevisar;
  // Se abre hacia el centro de la rueda: así no se sale por los costados.
  const posicion: React.CSSProperties =
    x <= CX ? { left: pctX(x), top: pctY(y), transform: "translate(18px, -50%)" } : { right: pctX(W - x), top: pctY(y), transform: "translate(-18px, -50%)" };
  return (
    <div role="tooltip" className="pointer-events-none absolute z-10 flex w-[280px] flex-col gap-1.5 rounded-xl border border-line bg-surface px-3.5 py-3 shadow-lg" style={posicion}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
        {d.id} · {d.nombre}
      </span>
      <span className="flex items-center gap-1.5 text-sm font-semibold text-fg">
        <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", PUNTO_DE_NIVEL[l])} aria-hidden="true" />
        {nombre(l)}
        {l === "F" && <span className="rounded-full border border-line bg-surface px-[7px] text-[11px] font-semibold text-fg-secondary">La base</span>}
      </span>
      {descripcion && <span className="text-[13px] leading-[1.45] text-fg-secondary">{descripcion}</span>}
      <span className={cn("text-xs font-semibold", estado.clase)}>{estado.texto}</span>
      {cita && <span className="text-xs italic leading-[1.45] text-fg-secondary">«{cita.cita}» — {cita.etiqueta}</span>}
      {sugerido && (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand">
          <span className="h-[7px] w-[7px] rounded-full bg-info" aria-hidden="true" />
          El agente sugiere algo para esta dimensión
        </span>
      )}
      <span className="border-t border-line pt-1.5 text-[11.5px] text-fg-muted">{d.aplica ? "Toca para abrir la dimensión" : "No se pregunta ni se cuenta"}</span>
    </div>
  );
}
