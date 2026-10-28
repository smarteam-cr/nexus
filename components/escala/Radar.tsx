"use client";

/**
 * components/escala/Radar.tsx — un área de la escala como radar de PUNTOS (pedido de Elías, 2026-10-28).
 *
 * Es la MISMA rueda que el Mapa (lib/escala/rueda.ts + components/escala/rueda.tsx): mismo tamaño, la base operativa
 * a la derecha y la producción a la izquierda con su nombre y su banda gris, el número y el nombre de cada dimensión
 * en el mismo lugar, los niveles en el hueco de arriba, la línea punteada de «la base» y el centro con el área. Solo
 * cambia lo de adentro (Elías: «básicamente solo debería cambiar lo del centro»): en vez de celdas con conteos, los
 * anillos apenas teñidos y, sobre el eje de cada dimensión, un punto por serie: el nivel donde se concentran, en
 * promedio, los criterios de esa clase (`lib/escala/radar.ts`). Un nivel entero cae en el medio de su anillo.
 *
 * Cada serie tiene su color (`--color-serie-*`) y su forma, para que no dependa solo del color; los chips de arriba
 * son también el interruptor de cada una. Pasar el cursor por una dimensión (su porción, su nombre o un punto) la
 * cuenta en el centro y en el panel del costado; tocarla la deja fija, y el panel lleva a leerla entera.
 */
import { useMemo, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { describirPerfil, type Perfil } from "@/lib/escala/documento/perfil";
import { LETRAS, type Letra } from "@/lib/escala/documento/tipos";
import {
  ejesDelRadar,
  nivelConMas,
  nombreDelPromedio,
  SERIES_DE_ENTRADA,
  SERIES_DEL_RADAR,
  seriesDisponibles,
  type EjeDelRadar,
  type SerieDelRadar,
} from "@/lib/escala/radar";
import { AIRE_ANGULAR, f, H, polar, porciones, posicionDelPromedio, R_BANDA, R_CENTRO, radioEnAnillos, sectorDeAnillo, W } from "@/lib/escala/rueda";
import { lugarEnElOrden, ordenDeDependencias, type DatosDeLaVista } from "@/lib/escala/vista";
import { conteoDeDimension, useEscala } from "./contexto";
import { COLOR_DE_NIVEL } from "./niveles";
import { BOTON_CLARO, GrupoDeControl, ParrafoDeLaEscala, ROTULO } from "./piezas";
import {
  AnillosDeLaRueda,
  CentroDeLaRueda,
  LineaDeLaBase,
  LineaDeUnaSerie,
  MitadesDeLaRueda,
  NombresDeNiveles,
  RotuloDeDimension,
  type PaletaDeLaRueda,
} from "./rueda";

/** La rueda con los tokens del tema: flipea sola en claro y oscuro. */
const PALETA: PaletaDeLaRueda = {
  fg: "var(--color-fg)",
  fgSecundario: "var(--color-fg-secondary)",
  fgApagado: "var(--color-fg-muted)",
  linea: "var(--color-line)",
  superficie: "var(--color-surface)",
  base: "var(--color-nivel-funcional)",
  niveles: COLOR_DE_NIVEL,
};

/** El tamaño de una marca (la mitad de su ancho, en unidades del viewBox): con la rueda a ~900 px se ve de ~15 px. */
const MARCA = 11;
const MARCA_EN_FOCO = 14;

/** La forma de cada serie: el color no carga la identidad solo. */
const FORMA: Record<SerieDelRadar, "circulo" | "cuadrado" | "rombo" | "triangulo" | "anillo"> = {
  criterios: "circulo",
  habitos: "cuadrado",
  riesgos: "rombo",
  requeridos: "triangulo",
  escondidos: "anillo",
};

/** Una marca de serie centrada en (x, y). `s` es la mitad de su ancho; `borde`, el anillo que la separa del fondo. */
function Marca({ serie, x, y, s = MARCA, color, borde = 3 }: { serie: SerieDelRadar; x: number; y: number; s?: number; color: string; borde?: number }) {
  // El anillo de superficie separa marcas que se tocan (sin bordes oscuros).
  const estilo = {
    fill: color,
    stroke: "var(--color-surface)",
    strokeWidth: borde,
    paintOrder: "stroke" as const,
  };
  switch (FORMA[serie]) {
    case "circulo":
      return <circle cx={x} cy={y} r={s} style={estilo} />;
    case "cuadrado":
      return <rect x={x - s * 0.9} y={y - s * 0.9} width={s * 1.8} height={s * 1.8} rx={s * 0.25} style={estilo} />;
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
            strokeWidth: Math.max(2.5, s * 0.36),
          }}
        />
      );
  }
}

/** La misma marca, chica, para los chips y el panel. */
function MarcaSuelta({ serie, color }: { serie: SerieDelRadar; color: string }) {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 flex-shrink-0" aria-hidden>
      <Marca serie={serie} x={8} y={8} s={5} color={color} borde={2} />
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
  const angulos = useMemo(() => porciones(dims), [dims]);
  const disponibles = seriesDisponibles(perfil);
  const [prendidas, setPrendidas] = useState<SerieDelRadar[]>([...SERIES_DE_ENTRADA]);
  /** Las que se dibujan: prendidas Y disponibles, siempre en el orden de la escala (el color sigue a la serie). */
  const visibles = SERIES_DEL_RADAR.filter((s) => prendidas.includes(s.clave) && disponibles.includes(s.clave));
  const [encima, setEncima] = useState<Foco>(null);
  const [fijo, setFijo] = useState<Foco>(null);
  /** Una serie apagada (o que el perfil ya no ofrece) deja de estar en foco: no puede apagar a las que se ven. */
  const sinSerieOculta = (f: Foco): Foco => (f && f.serie && !visibles.some((s) => s.clave === f.serie) ? { ...f, serie: null } : f);
  const foco = sinSerieOculta(encima ?? fijo);

  const nombreNivel = (l: Letra) => niveles.find((n) => n.letra === l)?.nombre ?? l;
  const conPerfil = describirPerfil(perfil) !== null;
  const noAplican = useMemo(() => new Set(ejes.filter((e) => !e.aplica).map((e) => e.dimensionId)), [ejes]);

  /** «Qué se trabaja primero», como en el mapa: el número en la banda de cada capa, si hay un orden solo. */
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
    if (v === null || !ang) return null;
    return polar((ang[0] + ang[1]) / 2, radioEnAnillos(posicionDelPromedio(v)));
  };

  const capaDe = (dim: string) => dims.find((d) => d.id === dim)?.capa ?? "base";

  const ejeEnFoco = foco ? (ejes.find((e) => e.dimensionId === foco.dim) ?? null) : null;
  const dimEnFoco = ejeEnFoco ? dims.find((d) => d.id === ejeEnFoco.dimensionId) : undefined;

  /** El centro: el área o, con una dimensión en foco, su número, su nombre y lo que se apunta. */
  const centro = (() => {
    if (!ejeEnFoco) return { titulo: area.nombre, subtitulo: `${dims.length} dimensiones · ${niveles.length} niveles`, antetitulo: null };
    const serie = foco?.serie ? ejeEnFoco.series[foco.serie] : null;
    const subtitulo =
      serie && serie.valor !== null
        ? nombreDelPromedio(serie.valor, nombreNivel)
        : ejeEnFoco.aplica
          ? cuantos(ejeEnFoco.series.criterios.cuantos, "criterio", "criterios")
          : "no aplica a este perfil";
    return { titulo: ejeEnFoco.nombre, subtitulo, antetitulo: ejeEnFoco.dimensionId };
  })();

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section aria-label={`Radar de ${area.nombre}`} className="flex min-w-0 flex-col gap-4 rounded-xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 max-w-[560px]">
            <h2 className="text-lg font-semibold leading-[26px] text-fg">Radar de {area.nombre}</h2>
            <p className="mt-0.5 text-[13px] text-fg-muted">
              La misma rueda del mapa, con puntos: cada punto dice en qué nivel se concentran, en promedio, los criterios de esa clase en la dimensión
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
                      "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border py-[7px] pl-2.5 pr-3 text-[13px] leading-tight transition-colors",
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
            </div>
          </GrupoDeControl>
        </div>

        <div className="relative" onMouseLeave={() => setEncima(null)}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="mx-auto block h-auto max-h-[calc(100vh-11rem)] w-full"
            role="group"
            aria-label={`Radar de las ${dims.length} dimensiones de ${area.nombre} por nivel`}
          >
            <MitadesDeLaRueda capas={capas} paleta={PALETA} enFoco={dimEnFoco?.capa ?? null} />
            <AnillosDeLaRueda dims={dims} angulos={angulos} paleta={PALETA} enFoco={foco?.dim ?? null} noAplican={noAplican} />
            <LineaDeLaBase paleta={PALETA} />

            {/* La porción de cada dimensión: pasar el cursor por cualquier parte la enfoca; tocarla la deja fija. */}
            {dims.map((d) => {
              const [g0, g1] = angulos.get(d.id)!;
              return (
                <path
                  key={d.id}
                  d={sectorDeAnillo(R_CENTRO, R_BANDA, g0 - AIRE_ANGULAR / 2, g1 + AIRE_ANGULAR / 2)}
                  style={{ fill: "transparent", cursor: "pointer" }}
                  onMouseEnter={() => setEncima({ dim: d.id, serie: null })}
                  onMouseLeave={() => setEncima(null)}
                  onClick={() => tocarEje(d.id)}
                />
              );
            })}

            {/* «Qué se trabaja primero»: encima de las porciones, para que su explicación aparezca en toda la burbuja. */}
            {capas.map((c) => {
              const filas = ordenes.get(c.clave) ?? [];
              const orden = filas.length === 1 ? filas[0] : null;
              if (!orden) return null;
              return dims
                .filter((d) => d.capa === c.clave)
                .map((d) => {
                  const lugar = lugarEnElOrden(orden, d);
                  const [a0, a1] = angulos.get(d.id)!;
                  if (!lugar) return null;
                  const [x, y] = polar((a0 + a1) / 2, R_BANDA);
                  return (
                    <g key={d.id} transform={`translate(${f(x)} ${f(y)})`} className="cursor-help">
                      <title>{`${lugar}.º en el orden de ${c.nombre.toLowerCase()}: ${orden.orden.join(" → ")}. ${orden.porQue}`}</title>
                      <circle r={14} style={{ fill: "var(--color-surface)", stroke: "var(--color-fg-muted)", strokeWidth: 1.5 }} />
                      <text y={5} style={{ fill: "var(--color-fg)", fontSize: 14, fontWeight: 700, textAnchor: "middle" }}>
                        {lugar}
                      </text>
                    </g>
                  );
                });
            })}
            {visibles.map((s) => {
              const puntos = ejes.map((e) => puntoDe(e, s.clave));
              const apagada = foco?.serie != null && foco.serie !== s.clave;
              return (
                <g key={s.clave} style={{ opacity: apagada ? 0.25 : 1, transition: "opacity 150ms", pointerEvents: "none" }}>
                  <LineaDeUnaSerie
                    ejes={ejes.map((e, i) => {
                      const [g0, g1] = angulos.get(e.dimensionId)!;
                      return { medio: (g0 + g1) / 2, capa: capaDe(e.dimensionId), punto: puntos[i] };
                    })}
                    color={s.color}
                    relleno={0}
                  />
                  {puntos.map((p, i) =>
                    p ? <Marca key={ejes[i].dimensionId} serie={s.clave} x={p[0]} y={p[1]} s={foco?.dim === ejes[i].dimensionId ? MARCA_EN_FOCO : MARCA} color={s.color} /> : null,
                  )}
                </g>
              );
            })}

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
                    r={20}
                    style={{ fill: "transparent", cursor: "pointer" }}
                    onMouseEnter={() => setEncima({ dim: e.dimensionId, serie: s.clave })}
                    onMouseLeave={() => setEncima(null)}
                    onClick={() => tocarEje(e.dimensionId, s.clave)}
                  />
                );
              }),
            )}

            <NombresDeNiveles niveles={niveles} paleta={PALETA} />

            {/* El rótulo de cada dimensión, donde está en el mapa: un botón que la deja fija en el panel. */}
            {ejes.map((e) => {
              const [g0, g1] = angulos.get(e.dimensionId)!;
              const reportes = conteoDeDimension(conteos, e.dimensionId).total;
              const enFoco = foco?.dim === e.dimensionId;
              return (
                <RotuloDeDimension
                  key={e.dimensionId}
                  medio={(g0 + g1) / 2}
                  nombre={e.nombre}
                  numero={`${e.dimensionId}${reportes > 0 ? ` · ${cuantos(reportes, "reporte", "reportes")}` : ""}`}
                  nota={e.aplica ? null : "no aplica a este perfil"}
                  paleta={PALETA}
                  destacado={enFoco}
                  apagado={!e.aplica || (!!foco && !enFoco)}
                  props={{
                    role: "button",
                    tabIndex: 0,
                    "aria-label": `${e.dimensionId} ${e.nombre}${e.aplica ? "" : ", no aplica a este perfil"}: tócala para dejarla fija en el panel`,
                    "aria-pressed": fijo?.dim === e.dimensionId,
                    className: "cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-brand",
                    onMouseEnter: () => setEncima({ dim: e.dimensionId, serie: null }),
                    onMouseLeave: () => setEncima(null),
                    onFocus: () => setEncima({ dim: e.dimensionId, serie: null }),
                    onBlur: () => setEncima(null),
                    onClick: () => tocarEje(e.dimensionId),
                    onKeyDown: alTecladoDelRotulo(e.dimensionId),
                  }}
                />
              );
            })}

            <CentroDeLaRueda paleta={PALETA} titulo={centro.titulo} subtitulo={centro.subtitulo} antetitulo={centro.antetitulo} />
          </svg>
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
          Pasa el cursor por una dimensión, o tócala, para ver en qué nivel se concentra cada serie y lo que dice la escala de ese nivel. Un punto pasada la
          línea punteada quiere decir que eso se pide sobre todo desde {nombreNivel("F")}, la base; más adentro, antes de llegar a ella.
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
