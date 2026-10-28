"use client";

/**
 * components/escala/Radar.tsx — un área de la escala como radar de PUNTOS (pedido de Elías, 2026-10-28).
 *
 * Un eje por dimensión, un anillo por nivel (Deficiente adentro, Óptimo en el borde) y la línea punteada
 * de Funcional, «la base». En cada eje, un punto por serie: el nivel donde se concentran, en promedio, los
 * criterios de esa clase en la dimensión (`lib/escala/radar.ts`). Los puntos mandan: la línea que los une
 * es fina y el relleno apenas se ve. Cada serie tiene su color (`--color-serie-*`) y su forma, para que no
 * dependa solo del color; la leyenda es también el interruptor de cada una.
 *
 * Pasar el cursor por un eje (o tocarlo) lo cuenta en el panel del costado: cada serie con su nivel, cuántos
 * criterios hay en cada nivel y lo que dice la escala de ese nivel en esa dimensión. Tocarlo lo deja fijo.
 * Los nombres de las dimensiones van en HTML encima del SVG (se parten solos y son botones), como en la
 * rueda de la exploración.
 */
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { describirPerfil, type Perfil } from "@/lib/escala/documento/perfil";
import { LETRAS, type Letra } from "@/lib/escala/documento/tipos";
import {
  aCoordenadas,
  anguloDelEje,
  ejesDelRadar,
  nivelConMas,
  nombreDelPromedio,
  radioDelNivel,
  SERIES_DE_ENTRADA,
  SERIES_DEL_RADAR,
  seriesDisponibles,
  tramosDelRadar,
  type EjeDelRadar,
  type SerieDelRadar,
} from "@/lib/escala/radar";
import type { DatosDeLaVista } from "@/lib/escala/vista";
import { BOTON_CLARO, GrupoDeControl, ParrafoDeLaEscala, ROTULO } from "./piezas";

// ── Geometría (unidades del viewBox) ──────────────────────────────────────────
const W = 720;
const H = 440;
const CX = W / 2;
const CY = H / 2;
/** Óptimo, el anillo de afuera. */
const R_MAX = 160;
/** Donde van los nombres de las dimensiones. */
const R_ETIQUETA = 176;

const f = (v: number) => v.toFixed(1);
const pctX = (x: number) => `${(x / W) * 100}%`;
const pctY = (y: number) => `${(y / H) * 100}%`;

/** La forma de cada serie: el color no carga la identidad solo. */
const FORMA: Record<SerieDelRadar, "circulo" | "cuadrado" | "rombo" | "triangulo" | "anillo"> = {
  criterios: "circulo",
  habitos: "cuadrado",
  riesgos: "rombo",
  requeridos: "triangulo",
  escondidos: "anillo",
};

/** Una marca de serie centrada en (x, y). `s` es la mitad de su ancho. */
function Marca({ serie, x, y, s = 6, color }: { serie: SerieDelRadar; x: number; y: number; s?: number; color: string }) {
  // El anillo de superficie separa marcas que se tocan (sin bordes oscuros).
  const estilo = {
    fill: color,
    stroke: "var(--color-surface)",
    strokeWidth: 2,
    paintOrder: "stroke" as const,
  };
  switch (FORMA[serie]) {
    case "circulo":
      return <circle cx={x} cy={y} r={s} style={estilo} />;
    case "cuadrado":
      return <rect x={x - s * 0.9} y={y - s * 0.9} width={s * 1.8} height={s * 1.8} rx={1.5} style={estilo} />;
    case "rombo":
      return <polygon points={`${f(x)},${f(y - s * 1.2)} ${f(x + s * 1.2)},${f(y)} ${f(x)},${f(y + s * 1.2)} ${f(x - s * 1.2)},${f(y)}`} style={estilo} />;
    case "triangulo":
      return <polygon points={`${f(x)},${f(y - s * 1.2)} ${f(x + s * 1.1)},${f(y + s * 0.8)} ${f(x - s * 1.1)},${f(y + s * 0.8)}`} style={estilo} />;
    case "anillo":
      return (
        <circle
          cx={x}
          cy={y}
          r={s * 0.85}
          style={{
            fill: "var(--color-surface)",
            stroke: color,
            strokeWidth: 2.5,
          }}
        />
      );
  }
}

/** La misma marca, chica, para la leyenda y el panel. */
function MarcaSuelta({ serie, color }: { serie: SerieDelRadar; color: string }) {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 flex-shrink-0" aria-hidden>
      <Marca serie={serie} x={8} y={8} s={5} color={color} />
    </svg>
  );
}

/** «3,3» */
const decimal = (v: number) =>
  v.toLocaleString("es-CR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

/** Qué está bajo el cursor (o fijo): un eje y, si se apuntó a una marca, su serie. */
type Foco = { dim: string; serie: SerieDelRadar | null } | null;

export default function Radar({ datos, perfil, onLeerDimension }: { datos: DatosDeLaVista; perfil: Perfil; onLeerDimension: (dimensionId: string) => void }) {
  const { area, niveles } = datos;
  const ejes = useMemo(() => ejesDelRadar(area, perfil, datos.requeridos), [area, perfil, datos.requeridos]);
  const disponibles = seriesDisponibles(perfil);
  const [prendidas, setPrendidas] = useState<SerieDelRadar[]>([...SERIES_DE_ENTRADA]);
  /** Las que se dibujan: prendidas Y disponibles, siempre en el orden de la escala (el color sigue a la serie). */
  const visibles = SERIES_DEL_RADAR.filter((s) => prendidas.includes(s.clave) && disponibles.includes(s.clave));
  const [encima, setEncima] = useState<Foco>(null);
  const [fijo, setFijo] = useState<Foco>(null);
  const foco = encima ?? fijo;

  const nombreNivel = (l: Letra) => niveles.find((n) => n.letra === l)?.nombre ?? l;
  const n = ejes.length;
  const conPerfil = describirPerfil(perfil) !== null;

  const alternar = (s: SerieDelRadar) => setPrendidas((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));
  // Al tocar, se olvida el «por encima»: en una pantalla táctil el toque también lo pone, y taparía lo fijo.
  const tocarEje = (dim: string, serie: SerieDelRadar | null = null) => {
    setEncima(null);
    setFijo((f) => (f && f.dim === dim && f.serie === serie ? null : { dim, serie }));
  };

  const anillo = (valor: number) => ejes.map((_, i) => aCoordenadas(CX, CY, anguloDelEje(i, n), radioDelNivel(valor, R_MAX)).map(f).join(",")).join(" ");

  const ejeEnFoco = foco ? (ejes.find((e) => e.dimensionId === foco.dim) ?? null) : null;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section aria-label={`Radar de ${area.nombre}`} className="flex min-w-0 flex-col gap-4 rounded-xl border border-line bg-surface p-4 sm:p-5">
        <div className="min-w-0 max-w-[640px]">
          <h2 className="text-lg font-semibold leading-[26px] text-fg">Radar de {area.nombre}</h2>
          <p className="mt-0.5 text-[13px] text-fg-muted">
            Cada eje es una dimensión y cada anillo un nivel, de {nombreNivel("D")} al centro a {nombreNivel("O")} en el borde. Cada punto dice en qué nivel se
            concentran, en promedio, los criterios de esa clase en la dimensión
            {conPerfil ? ` (solo los que aplican con el perfil «${describirPerfil(perfil)}»)` : ""}. Es la escala misma, no una empresa.
          </p>
        </div>

        <GrupoDeControl
          nombre="Qué se compara"
          ayuda="Prende y apaga cada serie. Criterios: dónde pesa cada dimensión. Hábitos: dónde se pide repetir algo hasta que sea costumbre. Riesgos: dónde están los criterios que hay que cumplir para pasar a Eficiente. Requeridos: dónde están los cimientos que otros criterios necesitan. Escondidos por el perfil: lo que el perfil de negocio elegido saca, y solo aparece con un perfil elegido."
        >
          <div role="group" aria-label="Series del radar" className="flex flex-wrap items-center gap-1.5">
            {SERIES_DEL_RADAR.filter((s) => disponibles.includes(s.clave)).map((s) => {
              const prendida = prendidas.includes(s.clave);
              return (
                <button
                  key={s.clave}
                  type="button"
                  aria-pressed={prendida}
                  onClick={() => alternar(s.clave)}
                  title={`${prendida ? "Apagar" : "Prender"} «${s.etiqueta}»: dónde se concentran los ${s.queCuenta} de cada dimensión.`}
                  className={cn(
                    "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border py-[5px] pl-2 pr-2.5 text-[13px] leading-tight transition-colors",
                    prendida ? "border-line bg-surface font-semibold text-fg" : "border-line bg-surface-muted text-fg-muted hover:bg-surface-hover",
                  )}
                >
                  <span className={cn(!prendida && "opacity-40")}>
                    <MarcaSuelta serie={s.clave} color={s.color} />
                  </span>
                  {s.etiqueta}
                </button>
              );
            })}
            <span className="ml-1 inline-flex items-center gap-1.5 text-[13px] text-fg-secondary">
              <svg viewBox="0 0 22 8" className="h-2 w-[22px]" aria-hidden>
                <line
                  x1={1}
                  y1={4}
                  x2={21}
                  y2={4}
                  style={{
                    stroke: "var(--color-nivel-funcional)",
                    strokeWidth: 2,
                    strokeDasharray: "4 3",
                  }}
                />
              </svg>
              {nombreNivel("F")}, la base
            </span>
          </div>
        </GrupoDeControl>

        <div className="relative mx-auto w-full max-w-[760px]" style={{ aspectRatio: `${W} / ${H}` }} onMouseLeave={() => setEncima(null)}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="absolute inset-0 block h-full w-full"
            role="img"
            aria-label={`Radar de las ${n} dimensiones de ${area.nombre} por nivel`}
          >
            {/* Los anillos: uno por nivel, líneas finas. Funcional, punteado y en su color. */}
            {LETRAS.map((l, i) =>
              l === "F" ? null : (
                <polygon
                  key={l}
                  points={anillo(i + 1)}
                  style={{
                    fill: "none",
                    stroke: "var(--color-line)",
                    strokeWidth: 1,
                  }}
                />
              ),
            )}
            {ejes.map((e, i) => {
              const [x, y] = aCoordenadas(CX, CY, anguloDelEje(i, n), R_MAX);
              const enFoco = foco?.dim === e.dimensionId;
              return (
                <line
                  key={e.dimensionId}
                  x1={CX}
                  y1={CY}
                  x2={f(x)}
                  y2={f(y)}
                  style={{
                    stroke: enFoco ? "var(--color-fg-muted)" : "var(--color-line)",
                    strokeWidth: enFoco ? 1.5 : 1,
                  }}
                />
              );
            })}
            <polygon
              points={anillo(3)}
              style={{
                fill: "none",
                stroke: "var(--color-nivel-funcional)",
                strokeWidth: 2,
                strokeDasharray: "7 6",
              }}
            />
            {/* Las zonas de cada eje: pasar el cursor por cualquier parte de la porción lo enfoca. */}
            {ejes.map((e, i) => {
              const g = anguloDelEje(i, n);
              const medio = 180 / n;
              const [ax, ay] = aCoordenadas(CX, CY, g - medio, R_ETIQUETA);
              const [bx, by] = aCoordenadas(CX, CY, g + medio, R_ETIQUETA);
              return (
                <path
                  key={e.dimensionId}
                  d={`M${CX},${CY}L${f(ax)},${f(ay)}A${R_ETIQUETA},${R_ETIQUETA} 0 0 1 ${f(bx)},${f(by)}Z`}
                  style={{ fill: "transparent", cursor: "pointer" }}
                  onMouseEnter={() => setEncima({ dim: e.dimensionId, serie: null })}
                  onClick={() => tocarEje(e.dimensionId)}
                />
              );
            })}

            {visibles.map((s) => {
              const puntos = ejes.map((e, i) => {
                const v = e.series[s.clave].valor;
                return v === null ? null : aCoordenadas(CX, CY, anguloDelEje(i, n), radioDelNivel(v, R_MAX));
              });
              const apagada = foco?.serie != null && foco.serie !== s.clave;
              return (
                <g
                  key={s.clave}
                  style={{
                    opacity: apagada ? 0.3 : 1,
                    transition: "opacity 150ms",
                    pointerEvents: "none",
                  }}
                >
                  {tramosDelRadar(puntos).map((t, k) => {
                    const pts = t.puntos.map((p) => p.map(f).join(",")).join(" ");
                    return t.cerrado ? (
                      <polygon
                        key={k}
                        points={pts}
                        style={{
                          fill: s.color,
                          fillOpacity: 0.06,
                          stroke: s.color,
                          strokeWidth: 1.5,
                          strokeLinejoin: "round",
                        }}
                      />
                    ) : (
                      <polyline
                        key={k}
                        points={pts}
                        style={{
                          fill: "none",
                          stroke: s.color,
                          strokeWidth: 1.5,
                          strokeLinejoin: "round",
                        }}
                      />
                    );
                  })}
                  {puntos.map((p, i) =>
                    p ? (
                      <Marca key={ejes[i].dimensionId} serie={s.clave} x={p[0]} y={p[1]} s={foco?.dim === ejes[i].dimensionId ? 7.5 : 6} color={s.color} />
                    ) : null,
                  )}
                </g>
              );
            })}

            {/* Encima de todo, la zona de cada marca: más grande que la marca, para el cursor y el dedo. */}
            {visibles.map((s) =>
              ejes.map((e, i) => {
                const v = e.series[s.clave].valor;
                if (v === null) return null;
                const [x, y] = aCoordenadas(CX, CY, anguloDelEje(i, n), radioDelNivel(v, R_MAX));
                return (
                  <circle
                    key={`${s.clave}-${e.dimensionId}`}
                    cx={f(x)}
                    cy={f(y)}
                    r={12}
                    style={{ fill: "transparent", cursor: "pointer" }}
                    onMouseEnter={() => setEncima({ dim: e.dimensionId, serie: s.clave })}
                    onClick={() => tocarEje(e.dimensionId, s.clave)}
                  />
                );
              }),
            )}
          </svg>

          {/* Los nombres de las dimensiones: botones encima del dibujo, partidos solos. */}
          {ejes.map((e, i) => {
            const g = anguloDelEje(i, n);
            const [x, y] = aCoordenadas(CX, CY, g, R_ETIQUETA);
            const seno = Math.sin((g * Math.PI) / 180);
            const coseno = Math.cos((g * Math.PI) / 180);
            const tx = seno > 0.3 ? "0" : seno < -0.3 ? "-100%" : "-50%";
            const ty = coseno > 0.3 ? "-100%" : coseno < -0.3 ? "0" : "-50%";
            const enFoco = foco?.dim === e.dimensionId;
            return (
              <button
                key={e.dimensionId}
                type="button"
                lang="es"
                onMouseEnter={() => setEncima({ dim: e.dimensionId, serie: null })}
                onFocus={() => setEncima({ dim: e.dimensionId, serie: null })}
                onBlur={() => setEncima(null)}
                onClick={() => tocarEje(e.dimensionId)}
                aria-pressed={fijo?.dim === e.dimensionId}
                title={e.aplica ? `${e.nombre}: toca para dejarla fija en el panel.` : `${e.nombre}: no aplica con este perfil.`}
                className={cn(
                  "absolute max-w-[26%] rounded px-1 py-0.5 text-[11px] leading-tight transition-colors sm:text-xs",
                  seno > 0.3 ? "text-left" : seno < -0.3 ? "text-right" : "text-center",
                  enFoco ? "font-semibold text-fg" : e.aplica ? "text-fg-secondary hover:text-fg" : "text-fg-muted",
                )}
                style={{
                  left: pctX(x),
                  top: pctY(y),
                  transform: `translate(${tx}, ${ty})`,
                }}
              >
                {e.nombre}
                {!e.aplica && <span className="block text-[10px] font-normal text-fg-muted">no aplica</span>}
              </button>
            );
          })}
          {/* El nombre de cada nivel, entre los dos primeros ejes (ningún punto cae ahí). En HTML, para que se lea al
              ancho de un teléfono; sin cursor, para no tapar las zonas del dibujo. */}
          {LETRAS.map((l, i) => {
            const [x, y] = aCoordenadas(CX, CY, anguloDelEje(1, n) / 2, radioDelNivel(i + 1, R_MAX));
            return (
              <span
                key={l}
                aria-hidden
                className={cn(
                  "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-surface/80 px-0.5 text-[10px] leading-none sm:text-[11px]",
                  l === "F" ? "font-semibold text-fg-secondary" : "text-fg-muted",
                )}
                style={{ left: pctX(x), top: pctY(y) }}
              >
                {nombreNivel(l)}
              </span>
            );
          })}
        </div>

        {visibles.length === 0 && <p className="text-center text-[13px] text-fg-muted">Prende una serie arriba para ver sus puntos.</p>}

        <TablaDelRadar ejes={ejes} series={visibles} nombreNivel={nombreNivel} />
      </section>

      <PanelDelRadar
        eje={ejeEnFoco}
        serieEnFoco={foco?.serie ?? null}
        series={visibles}
        datos={datos}
        nombreNivel={nombreNivel}
        fijo={!!fijo && !encima}
        onSoltar={() => setFijo(null)}
        onLeerDimension={onLeerDimension}
      />
    </div>
  );
}

type SerieVisible = (typeof SERIES_DEL_RADAR)[number];

/** Lo que cuenta un eje: cada serie con su nivel, cuántos hay en cada nivel y lo que dice la escala de ese nivel. */
function PanelDelRadar({
  eje,
  serieEnFoco,
  series,
  datos,
  nombreNivel,
  fijo,
  onSoltar,
  onLeerDimension,
}: {
  eje: EjeDelRadar | null;
  serieEnFoco: SerieDelRadar | null;
  series: SerieVisible[];
  datos: DatosDeLaVista;
  nombreNivel: (l: Letra) => string;
  fijo: boolean;
  onSoltar: () => void;
  onLeerDimension: (dimensionId: string) => void;
}) {
  const caja = "relative self-start rounded-xl border border-line bg-surface p-5 xl:sticky xl:top-4";
  if (!eje) {
    return (
      <aside aria-label="Detalle del radar" className={caja}>
        <p className={ROTULO}>Cómo se lee</p>
        <p className="mt-2 text-[13px] leading-relaxed text-fg-secondary">
          Pasa el cursor por una dimensión, o tócala, para ver en qué nivel se concentra cada serie y lo que dice la escala de ese nivel. Un punto más afuera de
          la línea punteada quiere decir que eso se pide sobre todo por encima de {nombreNivel("F")}; más adentro, antes de llegar a la base.
        </p>
      </aside>
    );
  }
  const dimension = datos.area.dimensiones.find((d) => d.id === eje.dimensionId);
  // La descripción que se muestra: la del nivel de la serie apuntada, o la de la primera que tiene punto.
  const principal = series.find((s) => s.clave === serieEnFoco && eje.series[s.clave].valor !== null) ?? series.find((s) => eje.series[s.clave].valor !== null);
  // Se describe el nivel donde la serie tiene más criterios: un promedio puede caer en uno donde no tiene ninguno.
  const letraPrincipal = principal ? nivelConMas(eje.series[principal.clave]) : null;
  const descripcion = letraPrincipal ? dimension?.niveles.find((nv) => nv.letra === letraPrincipal)?.descripcion : null;

  return (
    <aside aria-label="Detalle del radar" className={caja}>
      {/* Se anuncia solo lo que se deja fijo: pasar el cursor por el dibujo no puede hablar en cada eje que cruza. */}
      <p className="sr-only" aria-live="polite">
        {fijo ? `${eje.nombre}, fijada en el panel.` : ""}
      </p>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={ROTULO}>Dimensión {eje.dimensionId}</p>
          <h3 className="mt-0.5 text-base font-semibold text-fg">{eje.nombre}</h3>
          {!eje.aplica && <p className="text-xs text-fg-muted">No aplica con este perfil de negocio.</p>}
        </div>
        {fijo && (
          <button type="button" onClick={onSoltar} className="rounded p-1 text-fg-muted hover:bg-surface-hover hover:text-fg" aria-label="Soltar la dimensión">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
      </div>

      <ul className="mt-3 flex flex-col gap-2.5">
        {series.map((s) => {
          const p = eje.series[s.clave];
          return (
            <li key={s.clave} className={cn("flex gap-2", serieEnFoco && serieEnFoco !== s.clave && "opacity-60")}>
              <span className="mt-[3px]">
                <MarcaSuelta serie={s.clave} color={s.color} />
              </span>
              <div className="min-w-0 text-[13px]">
                <p className="text-fg">
                  <span className="font-semibold">{s.etiqueta}</span>
                  {p.valor !== null ? (
                    <>
                      {" "}
                      · {nombreDelPromedio(p.valor, nombreNivel)} <span className="text-fg-muted tabular-nums">({decimal(p.valor)})</span>
                    </>
                  ) : (
                    <span className="text-fg-muted"> · sin {s.queCuenta}</span>
                  )}
                </p>
                {p.cuantos > 0 && (
                  <p className="text-xs tabular-nums text-fg-muted">
                    {p.cuantos} en total:{" "}
                    {LETRAS.filter((l) => p.porNivel[l] > 0)
                      .map((l) => `${p.porNivel[l]} en ${nombreNivel(l)}`)
                      .join(", ")}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {letraPrincipal && descripcion && (
        <div className="mt-4 border-t border-line pt-3">
          <p className={ROTULO}>
            Donde más {principal?.queCuenta} hay: {nombreNivel(letraPrincipal)}
          </p>
          <ParrafoDeLaEscala texto={descripcion} className="mt-1 text-[13px] leading-relaxed text-fg-secondary" />
        </div>
      )}

      <button type="button" onClick={() => onLeerDimension(eje.dimensionId)} className={cn(BOTON_CLARO, "mt-4")}>
        Leer la dimensión entera
      </button>
    </aside>
  );
}

/** Los mismos números en una tabla: para quien no lee el dibujo, y para comparar con precisión. */
function TablaDelRadar({ ejes, series, nombreNivel }: { ejes: EjeDelRadar[]; series: SerieVisible[]; nombreNivel: (l: Letra) => string }) {
  if (series.length === 0) return null;
  return (
    <details className="group rounded-xl border border-line text-xs text-fg-secondary">
      <summary className="cursor-pointer select-none px-3 py-2 font-medium text-fg-secondary hover:text-fg">Ver los números en una tabla</summary>
      <div className="overflow-x-auto px-3 pb-3">
        <table className="w-full min-w-[420px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              <th className="py-1.5 pr-3 font-semibold text-fg">Dimensión</th>
              {series.map((s) => (
                <th key={s.clave} className="py-1.5 pr-3 font-semibold text-fg">
                  <span className="inline-flex items-center gap-1">
                    <MarcaSuelta serie={s.clave} color={s.color} />
                    {s.etiqueta}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ejes.map((e) => (
              <tr key={e.dimensionId} className="border-b border-line last:border-0">
                <td className="py-1.5 pr-3 text-fg">{e.nombre}</td>
                {series.map((s) => {
                  const p = e.series[s.clave];
                  return (
                    <td key={s.clave} className="py-1.5 pr-3 tabular-nums">
                      {p.valor === null ? (
                        <span className="text-fg-muted">—</span>
                      ) : (
                        `${nombreDelPromedio(p.valor, nombreNivel)} (${decimal(p.valor)}, ${p.cuantos})`
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-fg-muted">
          Entre paréntesis: el promedio (1 = {nombreNivel("D")}, 5 = {nombreNivel("O")}) y cuántos criterios cuenta.
        </p>
      </div>
    </details>
  );
}
