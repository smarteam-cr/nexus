"use client";

/**
 * components/escala/Radar.tsx — un área de la escala como radar (pedido de Elías, 2026-10-28).
 *
 * Un radar clásico (lib/escala/radar-dibujo.ts): un eje por dimensión, la base operativa a la derecha y la producción a
 * la izquierda con su nombre al costado; una regla de 0 (el centro) a 100 (el borde) con un anillo en cada límite de
 * franja (20, 40, 60, 80) y sus números en el hueco de arriba; «la base», punteada en 40. Cada serie es un polígono con
 * sus vértices sobre los ejes: el nivel donde se concentran, en promedio, los criterios de esa clase
 * (`lib/escala/radar.ts`), puesto en la regla con `enLaRegla` (un nivel entero, a la mitad de su franja). Sin zonas de
 * color por nivel: el diseño aprobado en Claude Design (pantallas `Main` y `Dimension`).
 *
 * Cada serie tiene su color (`--color-serie-*`) y su forma, para que no dependa solo del color; los chips de arriba
 * son también el interruptor de cada una. Pasar el cursor por una dimensión (su nombre, su eje o una marca) la cuenta
 * en el panel del costado; tocarla la deja fija (tocar fuera del radar la suelta), y el panel lleva a leerla entera.
 */
import { useMemo, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { describirPerfil, type Perfil } from "@/lib/escala/documento/perfil";
import { LETRAS, type Letra } from "@/lib/escala/documento/tipos";
import {
  ejesDelRadar,
  nivelConMas,
  nivelMasCercano,
  nombreDelPromedio,
  SERIES_DE_ENTRADA,
  SERIES_DEL_RADAR,
  seriesDisponibles,
  type EjeDelRadar,
  type SerieDelRadar,
} from "@/lib/escala/radar";
import {
  angulosDeLosEjes,
  anilloDelRadar,
  CX,
  CY,
  enElRadar,
  enLaRegla,
  f,
  FRANJAS,
  H,
  LA_BASE,
  LIMITES,
  porcionDelEje,
  puntosSvg,
  rangoDeLaFranja,
  rotuloDeLaMitad,
  rotuloDelEje,
  W,
  yEnElCentro,
} from "@/lib/escala/radar-dibujo";
import { lineaDeLaSerie } from "@/lib/escala/rueda";
import { lugarEnElOrden, ordenDeDependencias, type DatosDeLaVista } from "@/lib/escala/vista";
import { conteoDeDimension, useEscala } from "./contexto";
import { COLOR_DE_NIVEL } from "./niveles";
import { BOTON_CLARO, GrupoDeControl, ParrafoDeLaEscala, ROTULO } from "./piezas";

/** Las rayas del dibujo, con los tokens del tema: los anillos de adentro más tenues que el borde y los ejes. */
const RAYA_TENUE = { stroke: "var(--color-fg-muted)", strokeOpacity: 0.18, strokeWidth: 1 };
const RAYA = { stroke: "var(--color-fg-muted)", strokeOpacity: 0.32, strokeWidth: 1 };

/** El tamaño de una marca (la mitad de su ancho, en unidades del viewBox) y su anillo de superficie. */
const MARCA = 6;
const MARCA_EN_FOCO = 8;
const BORDE_DE_MARCA = 2.5;

/** La forma de cada serie: el color no carga la identidad solo. */
const FORMA: Record<SerieDelRadar, "circulo" | "cuadrado" | "rombo" | "triangulo" | "anillo"> = {
  criterios: "circulo",
  habitos: "cuadrado",
  riesgos: "rombo",
  requeridos: "triangulo",
  escondidos: "anillo",
};

/** Qué dice cada serie, en una línea («Cómo se lee»). */
const QUE_DICE: Record<SerieDelRadar, string> = {
  criterios: "dónde pesa la dimensión",
  habitos: "desde dónde se pide repetir",
  riesgos: "dónde están sus riesgos",
  requeridos: "dónde están los cimientos que otros necesitan",
  escondidos: "lo que el perfil saca",
};

/** Una marca de serie centrada en (x, y). `s` es la mitad de su ancho; `borde`, el anillo que la separa del fondo. */
function Marca({
  serie,
  x,
  y,
  s = MARCA,
  color,
  borde = BORDE_DE_MARCA,
}: {
  serie: SerieDelRadar;
  x: number;
  y: number;
  s?: number;
  color: string;
  borde?: number;
}) {
  // El anillo de superficie separa marcas que se tocan (sin bordes oscuros).
  const estilo = { fill: color, stroke: "var(--color-surface)", strokeWidth: borde };
  switch (FORMA[serie]) {
    case "circulo":
      return <circle cx={x} cy={y} r={s} style={estilo} />;
    case "cuadrado":
      return <rect x={x - s} y={y - s} width={s * 2} height={s * 2} rx={s / 3} style={estilo} />;
    case "rombo":
      return <polygon points={`${f(x)},${f(y - s * 1.3)} ${f(x + s * 1.3)},${f(y)} ${f(x)},${f(y + s * 1.3)} ${f(x - s * 1.3)},${f(y)}`} style={estilo} />;
    case "triangulo":
      return <polygon points={`${f(x)},${f(y - s * 1.3)} ${f(x + s * 1.2)},${f(y + s * 0.9)} ${f(x - s * 1.2)},${f(y + s * 0.9)}`} style={estilo} />;
    case "anillo":
      return <circle cx={x} cy={y} r={s * 0.85} style={{ fill: "var(--color-surface)", stroke: color, strokeWidth: Math.max(2, s * 0.4) }} />;
  }
}

/** La misma marca, chica, para los chips y el panel. */
function MarcaSuelta({ serie, color }: { serie: SerieDelRadar; color: string }) {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 flex-shrink-0" aria-hidden>
      <Marca serie={serie} x={8} y={8} s={5} color={color} borde={0} />
    </svg>
  );
}

/** «3,3» */
const decimal = (v: number) =>
  v.toLocaleString("es-CR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

/** «1 criterio», «3 criterios». */
const cuantos = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Qué está bajo el cursor (o fijo): una dimensión y, si se apuntó a una marca, su serie. */
type Foco = { dim: string; serie: SerieDelRadar | null } | null;

export default function Radar({ datos, perfil, onLeerDimension }: { datos: DatosDeLaVista; perfil: Perfil; onLeerDimension: (dimensionId: string) => void }) {
  const { conteos } = useEscala();
  const { area, niveles, capas } = datos;
  const dims = area.dimensiones;
  const ejes = useMemo(() => ejesDelRadar(area, perfil, datos.requeridos), [area, perfil, datos.requeridos]);
  const angulos = useMemo(() => angulosDeLosEjes(dims), [dims]);
  const todosLosAngulos = useMemo(() => [...angulos.values()], [angulos]);
  const disponibles = seriesDisponibles(perfil);
  const [prendidas, setPrendidas] = useState<SerieDelRadar[]>([...SERIES_DE_ENTRADA]);
  /** Las que se dibujan: prendidas Y disponibles, siempre en el orden de la escala (el color sigue a la serie). */
  const visibles = SERIES_DEL_RADAR.filter((s) => prendidas.includes(s.clave) && disponibles.includes(s.clave));
  const ofrecidas = SERIES_DEL_RADAR.filter((s) => disponibles.includes(s.clave));
  const [encima, setEncima] = useState<Foco>(null);
  const [fijo, setFijo] = useState<Foco>(null);
  /** Una serie apagada (o que el perfil ya no ofrece) deja de estar en foco: no puede apagar a las que se ven. */
  const sinSerieOculta = (f: Foco): Foco => (f && f.serie && !visibles.some((s) => s.clave === f.serie) ? { ...f, serie: null } : f);
  const foco = sinSerieOculta(encima ?? fijo);

  const nombreNivel = (l: Letra) => niveles.find((n) => n.letra === l)?.nombre ?? l;
  const conPerfil = describirPerfil(perfil) !== null;

  /** «Qué se trabaja primero», como en el mapa: el número junto al rótulo de cada dimensión, si hay un orden solo. */
  const ordenes = useMemo(
    () => new Map(capas.map((c) => [c.clave, ordenDeDependencias(datos.dependencias, area.nombre, c.nombre, perfil.cierre)])),
    [capas, datos.dependencias, area.nombre, perfil.cierre],
  );

  const alternar = (s: SerieDelRadar) => setPrendidas((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));
  // Al tocar, se olvida el «por encima»: en una pantalla táctil el toque también lo pone, y taparía lo fijo.
  const tocarEje = (dim: string, serie: SerieDelRadar | null = null) => {
    setEncima(null);
    setFijo((f) => (f && f.dim === dim && f.serie === serie ? null : { dim, serie }));
  };
  const alTecladoDelRotulo = (dim: string) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      tocarEje(dim);
    } else if (e.key === "Escape") setFijo(null);
  };

  /** Dónde cae la marca de una serie en una dimensión (null si no tiene punto). */
  const puntoDe = (e: EjeDelRadar, s: SerieDelRadar): [number, number] | null => {
    const v = e.series[s].valor;
    const ang = angulos.get(e.dimensionId);
    if (v === null || ang === undefined) return null;
    return enElRadar(ang, enLaRegla(v));
  };

  const capaDe = (dim: string) => dims.find((d) => d.id === dim)?.capa ?? "base";
  const apagada = (s: SerieDelRadar) => foco?.serie != null && foco.serie !== s;

  const ejeEnFoco = foco ? (ejes.find((e) => e.dimensionId === foco.dim) ?? null) : null;
  const yDeLaBase = yEnElCentro(todosLosAngulos, LA_BASE, "abajo");

  return (
    <section aria-label={`Radar de ${area.nombre}`} className="flex min-w-0 flex-col gap-3 rounded-[20px] border border-line bg-surface px-6 py-5">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex min-w-0 max-w-[620px] flex-col gap-1">
          <h2 className="text-base font-semibold text-fg">
            Radar de {area.nombre}
            <span className="ml-2 text-[13px] font-normal text-fg-muted">
              {dims.length} dimensiones · {niveles.length} niveles
            </span>
          </h2>
          <p className="text-[13px] leading-normal text-fg-muted">
            Un eje por dimensión. Cada punto es el nivel donde se concentran, en promedio, los criterios de esa clase
            {conPerfil ? ` (solo los que aplican con el perfil «${describirPerfil(perfil)}»)` : ""}. Es la escala misma, no una empresa.
          </p>
        </div>
        <GrupoDeControl
          nombre="Qué se compara"
          ayuda="Prende y apaga cada serie. Criterios: dónde pesa cada dimensión. Hábitos: dónde se pide repetir algo hasta que sea costumbre. Riesgos: dónde están los criterios que hay que cumplir para pasar a Eficiente. Requeridos: dónde están los cimientos que otros criterios necesitan. Escondidos por el perfil: lo que el perfil de negocio elegido saca, y solo aparece con un perfil elegido."
        >
          <div role="group" aria-label="Series del radar" className="flex flex-wrap items-center gap-2">
            {ofrecidas.map((s) => {
              const prendida = prendidas.includes(s.clave);
              return (
                <button
                  key={s.clave}
                  type="button"
                  aria-pressed={prendida}
                  onClick={() => alternar(s.clave)}
                  title={`${prendida ? "Apagar" : "Prender"} «${s.etiqueta}»: dónde se concentran los ${s.queCuenta} de cada dimensión.`}
                  className={cn(
                    "inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-full border px-3 text-[13px] font-semibold leading-tight transition-colors",
                    prendida ? "border-line bg-surface text-fg" : "border-dashed border-line bg-surface-muted text-fg-muted hover:bg-surface-hover",
                  )}
                >
                  <span className={cn(!prendida && "opacity-40")}>
                    <MarcaSuelta serie={s.clave} color={s.color} />
                  </span>
                  {s.etiqueta}
                </button>
              );
            })}
          </div>
        </GrupoDeControl>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0" onMouseLeave={() => setEncima(null)}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="mx-auto block h-auto max-h-[calc(100vh-11rem)] w-full"
            role="group"
            aria-label={`Radar de las ${dims.length} dimensiones de ${area.nombre}, de 0 en el centro a 100 en el borde`}
          >
            {/* El fondo: tocar fuera del radar suelta la dimensión fija. */}
            <rect width={W} height={H} style={{ fill: "transparent" }} onClick={() => setFijo(null)} />

            {/* La porción de cada eje: pasar el cursor por cualquier parte la enfoca; tocarla la deja fija. */}
            {dims.map((d) => (
              <polygon
                key={d.id}
                points={puntosSvg(porcionDelEje(todosLosAngulos, angulos.get(d.id)!))}
                style={{ fill: "transparent", cursor: "pointer" }}
                onMouseEnter={() => setEncima({ dim: d.id, serie: null })}
                onMouseLeave={() => setEncima(null)}
                onClick={() => tocarEje(d.id)}
              />
            ))}

            <g style={{ pointerEvents: "none" }}>
              {/* Los anillos de la regla: 20, 40, 60, 80 y el borde en 100. */}
              {LIMITES.map((l) => (
                <polygon key={l} points={puntosSvg(anilloDelRadar(todosLosAngulos, l))} style={{ fill: "none", ...(l === 100 ? RAYA : RAYA_TENUE) }} />
              ))}
              {/* Los ejes: el de la dimensión en foco, más grueso y del color de marca; el que no aplica, punteado. */}
              {ejes.map((e) => {
                const [x, y] = enElRadar(angulos.get(e.dimensionId)!, 100);
                const enFoco = foco?.dim === e.dimensionId;
                return (
                  <line
                    key={e.dimensionId}
                    x1={CX}
                    y1={CY}
                    x2={f(x)}
                    y2={f(y)}
                    style={enFoco ? { stroke: "var(--color-brand)", strokeWidth: 2 } : { ...RAYA, strokeDasharray: e.aplica ? undefined : "3 4" }}
                  />
                );
              })}
              {/* La base: donde empieza Funcional. */}
              <polygon
                points={puntosSvg(anilloDelRadar(todosLosAngulos, LA_BASE))}
                style={{ fill: "none", stroke: "var(--color-nivel-funcional)", strokeWidth: 1.75, strokeDasharray: "6 5" }}
              />

              {/* Cada serie, un polígono: relleno muy tenue y trazo de 2,5. Un eje sin punto lo corta y se queda sin relleno. */}
              {visibles.map((s) => {
                const { lados, relleno } = lineaDeLaSerie(
                  ejes.map((e) => ({ medio: angulos.get(e.dimensionId)!, capa: capaDe(e.dimensionId), punto: puntoDe(e, s.clave) })),
                );
                return (
                  <g key={s.clave} style={{ opacity: apagada(s.clave) ? 0.25 : 1, transition: "opacity 150ms" }}>
                    {relleno ? (
                      <polygon points={puntosSvg(relleno)} style={{ fill: s.color, fillOpacity: 0.1, stroke: s.color, strokeWidth: 2.5, strokeLinejoin: "round" }} />
                    ) : (
                      lados.map(({ de, a }, k) => (
                        <line key={k} x1={f(de[0])} y1={f(de[1])} x2={f(a[0])} y2={f(a[1])} style={{ stroke: s.color, strokeWidth: 2.5, strokeLinecap: "round" }} />
                      ))
                    )}
                  </g>
                );
              })}

              {/* Los números de la regla, en el hueco de arriba, con halo del color de la superficie. */}
              {LIMITES.map((l) => (
                <text
                  key={l}
                  x={CX}
                  y={f(yEnElCentro(todosLosAngulos, l, "arriba") + 3.5)}
                  style={{
                    fill: "var(--color-fg-muted)",
                    fontSize: 10.5,
                    fontWeight: 600,
                    textAnchor: "middle",
                    stroke: "var(--color-surface)",
                    strokeWidth: 4,
                    paintOrder: "stroke",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {l}
                </text>
              ))}
              {/* El chip de «la base», abajo. */}
              <rect
                x={CX - 32}
                y={f(yDeLaBase - 11)}
                width={64}
                height={22}
                rx={11}
                style={{ fill: "var(--color-surface)", stroke: "var(--color-nivel-funcional)", strokeWidth: 1.25 }}
              />
              <text x={CX} y={f(yDeLaBase + 4)} style={{ fill: "var(--color-success-ink)", fontSize: 11.5, fontWeight: 600, textAnchor: "middle" }}>
                La base
              </text>

              {/* Las marcas, en los vértices; las de la dimensión en foco, más grandes. */}
              {visibles.map((s) => (
                <g key={s.clave} style={{ opacity: apagada(s.clave) ? 0.25 : 1, transition: "opacity 150ms" }}>
                  {ejes.map((e) => {
                    const p = puntoDe(e, s.clave);
                    return p ? (
                      <Marca key={e.dimensionId} serie={s.clave} x={p[0]} y={p[1]} s={foco?.dim === e.dimensionId ? MARCA_EN_FOCO : MARCA} color={s.color} />
                    ) : null;
                  })}
                </g>
              ))}

              {/* El nombre de cada mitad, al costado. */}
              {capas.map((c) => {
                const r = rotuloDeLaMitad(c.clave, c.nombre, c.descripcion);
                return (
                  <g key={c.clave}>
                    {r.nombre.map((linea) => (
                      <text key={linea.texto} x={r.x} y={f(linea.y)} style={{ fill: "var(--color-fg)", fontSize: 28, fontWeight: 700, textAnchor: r.ancla }}>
                        {linea.texto}
                      </text>
                    ))}
                    {r.descripcion.map((linea) => (
                      <text key={linea.texto} x={r.x} y={f(linea.y)} style={{ fill: "var(--color-fg-muted)", fontSize: 13, textAnchor: r.ancla }}>
                        {linea.texto}
                      </text>
                    ))}
                  </g>
                );
              })}
            </g>

            {/* Encima de las series, la zona de cada marca: más grande que la marca, para el cursor y el dedo. */}
            {visibles.map((s) =>
              ejes.map((e) => {
                const p = puntoDe(e, s.clave);
                if (!p) return null;
                return (
                  <circle
                    key={`${s.clave}-${e.dimensionId}`}
                    cx={f(p[0])}
                    cy={f(p[1])}
                    r={12}
                    style={{ fill: "transparent", cursor: "pointer" }}
                    onMouseEnter={() => setEncima({ dim: e.dimensionId, serie: s.clave })}
                    onMouseLeave={() => setEncima(null)}
                    onClick={() => tocarEje(e.dimensionId, s.clave)}
                  />
                );
              }),
            )}

            {/* El rótulo de cada dimensión: su número (con sus reportes) y su nombre; un botón que la deja fija en el panel. */}
            {ejes.map((e) => {
              const r = rotuloDelEje(angulos.get(e.dimensionId)!, e.nombre, !e.aplica);
              const reportes = conteoDeDimension(conteos, e.dimensionId).total;
              const enFoco = foco?.dim === e.dimensionId;
              // «Qué se trabaja primero»: el número en un círculo, del lado del radar, y el texto del número corrido.
              const capa = capas.find((c) => c.clave === capaDe(e.dimensionId));
              const filas = capa ? (ordenes.get(capa.clave) ?? []) : [];
              const orden = filas.length === 1 ? filas[0] : null;
              const dim = dims.find((d) => d.id === e.dimensionId);
              const lugar = orden && dim ? lugarEnElOrden(orden, dim) : null;
              const lado = r.ancla === "start" ? 1 : -1;
              return (
                <g key={e.dimensionId}>
                  <g
                    role="button"
                    tabIndex={0}
                    aria-label={`${e.dimensionId} ${e.nombre}${e.aplica ? "" : ", no aplica a este perfil"}: tócala para dejarla fija en el panel`}
                    aria-pressed={fijo?.dim === e.dimensionId}
                    className="cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-brand"
                    onMouseEnter={() => setEncima({ dim: e.dimensionId, serie: null })}
                    onMouseLeave={() => setEncima(null)}
                    onFocus={() => setEncima({ dim: e.dimensionId, serie: null })}
                    onBlur={() => setEncima(null)}
                    onClick={() => tocarEje(e.dimensionId)}
                    onKeyDown={alTecladoDelRotulo(e.dimensionId)}
                  >
                    <text
                      x={f(lugar ? r.x + lado * 24 : r.x)}
                      y={f(r.yNumero)}
                      style={{
                        textAnchor: r.ancla,
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: "0.06em",
                        fill: "var(--color-fg-muted)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {`${e.dimensionId}${reportes > 0 ? ` · ${cuantos(reportes, "reporte", "reportes")}` : ""}`}
                    </text>
                    {r.nombre.map((linea) => (
                      <text
                        key={linea.texto}
                        x={f(r.x)}
                        y={f(linea.y)}
                        style={{
                          textAnchor: r.ancla,
                          fontSize: 15,
                          fontWeight: 600,
                          fill: enFoco ? "var(--color-brand)" : e.aplica ? "var(--color-fg)" : "var(--color-fg-muted)",
                        }}
                      >
                        {linea.texto}
                      </text>
                    ))}
                    {!e.aplica && (
                      <text x={f(r.x)} y={f(r.yNota)} style={{ textAnchor: r.ancla, fontSize: 12, fill: "var(--color-fg-muted)" }}>
                        no aplica a este perfil
                      </text>
                    )}
                  </g>
                  {lugar && orden && capa && (
                    <g transform={`translate(${f(r.x + lado * 9)} ${f(r.yNumero - 4)})`} className="cursor-help">
                      <title>{`${lugar}.º en el orden de ${capa.nombre.toLowerCase()}: ${orden.orden.join(" → ")}. ${orden.porQue}`}</title>
                      <circle r={9} style={{ fill: "var(--color-surface)", stroke: "var(--color-fg-muted)", strokeWidth: 1.25 }} />
                      <text y={3.8} style={{ fill: "var(--color-fg)", fontSize: 11, fontWeight: 700, textAnchor: "middle" }}>
                        {lugar}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
          {visibles.length === 0 && <p className="text-center text-[13px] text-fg-muted">Prende una serie arriba para ver sus puntos.</p>}
        </div>

        <PanelDelRadar
          eje={ejeEnFoco}
          serieEnFoco={foco?.serie ?? null}
          series={visibles}
          ofrecidas={ofrecidas}
          datos={datos}
          nombreNivel={nombreNivel}
          fijo={!!fijo && !encima}
          onSoltar={() => setFijo(null)}
          onLeerDimension={onLeerDimension}
        />
      </div>

      <TablaDelRadar ejes={ejes} series={visibles} nombreNivel={nombreNivel} />
    </section>
  );
}

type SerieVisible = (typeof SERIES_DEL_RADAR)[number];

/** Lo que cuenta un eje: cada serie con su nivel, cuántos hay en cada nivel y lo que dice la escala de ese nivel. */
function PanelDelRadar({
  eje,
  serieEnFoco,
  series,
  ofrecidas,
  datos,
  nombreNivel,
  fijo,
  onSoltar,
  onLeerDimension,
}: {
  eje: EjeDelRadar | null;
  serieEnFoco: SerieDelRadar | null;
  series: SerieVisible[];
  /** Todas las que se pueden prender (las apagadas también, para la leyenda). */
  ofrecidas: SerieVisible[];
  datos: DatosDeLaVista;
  nombreNivel: (l: Letra) => string;
  fijo: boolean;
  onSoltar: () => void;
  onLeerDimension: (dimensionId: string) => void;
}) {
  const caja = "relative flex flex-col gap-3 self-start rounded-[14px] bg-surface-muted p-4 xl:sticky xl:top-4";
  if (!eje) {
    return (
      <aside aria-label="Detalle del radar" className={caja}>
        <p className={ROTULO}>Cómo se lee</p>
        <p className="text-[13px] leading-normal text-fg-secondary">
          Cada eje es una dimensión: el centro es 0 y el borde, 100. De {nombreNivel("D")} a {nombreNivel("E")} cada nivel es una franja de 20 entre dos
          anillos, y un nivel entero cae a la mitad de la suya; {nombreNivel("O")} es el borde, en 100. Un punto entre dos niveles queda entre sus
          lugares.
        </p>
        <ul className="flex flex-col gap-2.5">
          {ofrecidas.map((s) => {
            const prendida = series.some((v) => v.clave === s.clave);
            return (
              <li key={s.clave} className="flex items-start gap-2.5">
                <span className={cn("mt-0.5", !prendida && "opacity-40")}>
                  <MarcaSuelta serie={s.clave} color={s.color} />
                </span>
                <div className="min-w-0">
                  <p className={cn("text-[13px] font-semibold", prendida ? "text-fg" : "text-fg-muted")}>
                    {s.etiqueta}
                    {!prendida && <span className="font-normal"> · apagado</span>}
                  </p>
                  <p className="text-xs text-fg-muted">{QUE_DICE[s.clave]}</p>
                </div>
              </li>
            );
          })}
          <li className="flex items-center gap-2.5">
            <svg width="14" height="14" viewBox="0 0 14 14" className="flex-shrink-0" aria-hidden>
              <line x1="0" y1="7" x2="14" y2="7" style={{ stroke: "var(--color-nivel-funcional)", strokeWidth: 2, strokeDasharray: "4 3" }} />
            </svg>
            <p className="text-[13px] text-fg">
              <span className="font-semibold">La base</span>{" "}
              <span className="text-fg-muted">
                · donde empieza {nombreNivel("F")} ({LA_BASE})
              </span>
            </p>
          </li>
        </ul>
        <p className="text-[13px] leading-normal text-fg-secondary">
          Pasa el cursor por una dimensión, o tócala, para ver en qué nivel se concentra cada serie y lo que dice la escala de ese nivel. Un punto pasada la
          línea punteada quiere decir que eso se pide sobre todo desde {nombreNivel("F")}, la base; más adentro, antes de llegar a ella.
        </p>
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <p className={ROTULO}>Las franjas</p>
          <ul className="flex flex-col gap-1.5">
            {FRANJAS.map((fr) => (
              <li key={fr.letra} className="flex items-center gap-2 text-[12.5px] text-fg">
                <svg width="8" height="8" viewBox="0 0 8 8" className="flex-shrink-0" aria-hidden>
                  <circle cx="4" cy="4" r="4" style={{ fill: COLOR_DE_NIVEL[fr.letra] }} />
                </svg>
                <span className="w-[74px] font-semibold">{nombreNivel(fr.letra)}</span>
                <span className="tabular-nums text-fg-muted">
                  {rangoDeLaFranja(fr)}
                  {fr.letra === "F" && <span className="text-success-ink"> · aquí empieza la base</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    );
  }
  const dimension = datos.area.dimensiones.find((d) => d.id === eje.dimensionId);
  const capa = datos.capas.find((c) => c.clave === dimension?.capa);
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
          <p className={ROTULO}>
            Dimensión {eje.dimensionId}
            {capa ? ` · ${capa.nombre}` : ""}
          </p>
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

      {dimension?.descripcion && <p className="text-[13px] leading-normal text-fg-secondary">{dimension.descripcion}</p>}

      <ul className="flex flex-col divide-y divide-line rounded-[10px] bg-surface px-3 py-1">
        {series.map((s) => {
          const p = eje.series[s.clave];
          return (
            <li key={s.clave} className={cn("flex gap-2 py-2.5", serieEnFoco && serieEnFoco !== s.clave && "opacity-60")}>
              <span className="mt-[3px]">
                <MarcaSuelta serie={s.clave} color={s.color} />
              </span>
              <div className="min-w-0 text-[13px]">
                <p className="text-fg">
                  <span className="font-semibold">{s.etiqueta}</span>
                  {p.valor !== null ? (
                    <>
                      {" "}
                      ·{" "}
                      <svg width="8" height="8" viewBox="0 0 8 8" className="inline-block align-baseline" aria-hidden>
                        <circle cx="4" cy="4" r="4" style={{ fill: COLOR_DE_NIVEL[nivelMasCercano(p.valor)] }} />
                      </svg>{" "}
                      {nombreDelPromedio(p.valor, nombreNivel)} <span className="text-fg-muted tabular-nums">({decimal(p.valor)})</span>
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
        <div className="border-t border-line pt-3">
          <p className={ROTULO}>
            Donde más {principal?.queCuenta} hay: {nombreNivel(letraPrincipal)}
          </p>
          <ParrafoDeLaEscala texto={descripcion} className="mt-1 text-[13px] leading-relaxed text-fg-secondary" />
        </div>
      )}

      <button type="button" onClick={() => onLeerDimension(eje.dimensionId)} className={cn(BOTON_CLARO, "justify-center font-semibold text-fg")}>
        Leer la dimensión entera
      </button>
      {fijo && <p className="text-xs leading-normal text-fg-muted">Toca otra dimensión para cambiarla, o fuera del radar para soltarla.</p>}
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
