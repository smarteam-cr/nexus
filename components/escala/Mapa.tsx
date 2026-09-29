"use client";

/**
 * components/escala/Mapa.tsx — un área de la escala como mapa radial.
 *
 * Cada eje es una dimensión y cada anillo un nivel: Deficiente en el centro, Óptimo en el borde.
 * El anillo punteado es la base Funcional (el mismo lenguaje del radar del diagnóstico: después
 * este mapa puede llevar encima el nivel de un cliente). Cada cruce es una celda de la matriz.
 *
 * Interactivo a propósito, para recorrer la escala en vez de leerla de corrido:
 *   · Qué muestran los puntos: criterios (lo que se ve al entrar), hábitos, riesgos, los que
 *     esconde el perfil elegido o los comentarios del equipo. El tamaño es cuántos hay en esa celda.
 *   · Pasar el cursor por un punto ilumina su dimensión y su nivel y dice qué es; tocarlo abre la
 *     celda al costado, con sus criterios y sus comentarios.
 *   · Tocar el nombre de una dimensión la abre entera; tocar el nombre de un nivel recorre el área
 *     en ese nivel (con anterior / siguiente: el camino de Deficiente a Óptimo).
 *   · Con el teclado: flechas ←/→ cambian de dimensión, ↑/↓ de nivel, Enter abre los comentarios,
 *     Escape vuelve al área.
 */
import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { aplica, describirPerfil, dimensionAplica, type Perfil } from "@/lib/escala/documento/perfil";
import { LETRAS, type Dimension, type Letra, type Nivel } from "@/lib/escala/documento/tipos";
import type { DatosDeLaVista } from "@/lib/escala/vista";
import { conteoDe, conteoDeCelda, conteoDeDimension, useEscala } from "./contexto";
import { COLOR_DE_NIVEL, PUNTO_DE_NIVEL } from "./niveles";
import { BotonComentar, Contador, GrupoDeControl, MetaDelCriterio, Segmentado, TextoConPalabras } from "./piezas";

type CapaDeDatos = "comentarios" | "criterios" | "habitos" | "riesgos" | "perfil";

export type SeleccionDelMapa =
  | { tipo: "celda"; dim: string; letra: Letra }
  | { tipo: "dimension"; dim: string }
  | { tipo: "nivel"; letra: Letra }
  | null;

/** Lo que dice la escala primero (criterios, por defecto); lo que dice el equipo, al final. */
const CAPAS: { clave: CapaDeDatos; etiqueta: string; title: string }[] = [
  {
    clave: "criterios",
    etiqueta: "Criterios",
    title: "El tamaño de cada punto es cuántos criterios tiene esa celda (con el perfil de negocio elegido, si hay uno). El color es el del nivel.",
  },
  {
    clave: "habitos",
    etiqueta: "Hábitos",
    title: "Cuántos criterios de cada celda son hábitos: algo que el equipo repite y que solo se confirma después de operar un tiempo.",
  },
  {
    clave: "riesgos",
    etiqueta: "Riesgos",
    title: "Cuántos criterios de cada celda son de riesgo: no deciden el nivel, pero hay que cumplirlos para pasar a Eficiente.",
  },
  {
    clave: "perfil",
    etiqueta: "Escondidos por el perfil",
    title: "Cuántos criterios de cada celda NO aplican al perfil de negocio elegido y quedan escondidos. Sirve para ver dónde cambia la escala según cómo vende la empresa.",
  },
  {
    clave: "comentarios",
    etiqueta: "Comentarios del equipo",
    title: "Cuántos comentarios dejó el equipo en cada celda: lo que no se entiende, lo que no calza con un cliente y las propuestas. En azul si alguno sigue abierto; en gris si ya se cerraron todos.",
  },
];

/** El color y el texto de la leyenda en las capas que pintan los puntos de un solo color. */
const MUESTRA_DE_CAPA: Record<"habitos" | "riesgos" | "perfil", { color: string; texto: string }> = {
  habitos: { color: "var(--color-secondary)", texto: "cuantos más hábitos, más grande" },
  riesgos: { color: "var(--color-warning)", texto: "cuantos más riesgos, más grande" },
  perfil: { color: "var(--color-info)", texto: "cuantos más escondidos, más grande" },
};

/** «1 criterio», «3 criterios». */
const cuantos = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

// ── Geometría (unidades del viewBox) ──────────────────────────────────────────
const W = 920;
const H = 650;
const CX = 460;
const CY = 322;
const R0 = 58;
const PASO = 48; // anillos en 58, 106, 154, 202, 250
const R_BORDE = R0 + PASO * 4;
const R_ETIQUETA = R_BORDE + 28;

const radio = (k: number) => R0 + PASO * k;

function punto(i: number, n: number, r: number): [number, number] {
  const a = ((-90 + (360 / n) * i) * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

const par = ([x, y]: [number, number]) => `${x.toFixed(1)},${y.toFixed(1)}`;
const medio = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

interface Props {
  datos: DatosDeLaVista;
  perfil: Perfil;
  seleccion: SeleccionDelMapa;
  onSeleccion: (s: SeleccionDelMapa) => void;
  onLeerDimension: (dim: string) => void;
  onVerEnLaMatriz: () => void;
}

export default function Mapa({ datos, perfil, seleccion, onSeleccion, onLeerDimension, onVerEnLaMatriz }: Props) {
  const { conteos, abrirComentarios } = useEscala();
  const { area, niveles, capas } = datos;
  const dims = area.dimensiones;
  const n = dims.length;
  const [capa, setCapa] = useState<CapaDeDatos>("criterios");
  const [encima, setEncima] = useState<{ dim: string; letra: Letra } | null>(null);
  const [anuncio, setAnuncio] = useState("");
  /** El anillo punteado de «acá estás» solo se ve navegando con el teclado. */
  const [conFoco, setConFoco] = useState(false);
  const grupoRef = useRef<SVGGElement>(null);
  const hayPerfil = !!(perfil.cierre || perfil.despues);

  // La celda «activa» para el teclado: la elegida, o la primera Funcional.
  const activa = seleccion?.tipo === "celda" ? seleccion : { dim: dims[0].id, letra: "F" as Letra };

  /** El valor de cada celda según la capa elegida. */
  const valores = useMemo(() => {
    const out = new Map<string, { valor: number; abiertos: number }>();
    for (const d of dims) {
      for (const nv of d.niveles) {
        const visibles = nv.criterios.filter((c) => aplica(c, perfil));
        let valor = 0;
        let abiertos = 0;
        if (capa === "comentarios") {
          const c = conteoDeCelda(conteos, d.id, nv.letra);
          valor = c.total;
          abiertos = c.abiertos;
        } else if (capa === "criterios") valor = visibles.length;
        else if (capa === "habitos") valor = visibles.filter((c) => c.habito).length;
        else if (capa === "riesgos") valor = visibles.filter((c) => c.riesgo).length;
        else valor = nv.criterios.length - visibles.length;
        out.set(nv.id, { valor, abiertos });
      }
    }
    return out;
  }, [dims, perfil, capa, conteos]);

  const maximo = Math.max(1, ...[...valores.values()].map((v) => v.valor));

  const colorDelPunto = (letra: Letra, v: { valor: number; abiertos: number }) => {
    if (v.valor === 0) return "var(--color-surface)";
    if (capa === "comentarios") return v.abiertos ? "var(--color-brand)" : "var(--color-fg-muted)";
    if (capa === "habitos") return "var(--color-secondary)";
    if (capa === "riesgos") return "var(--color-warning)";
    if (capa === "perfil") return "var(--color-info)";
    return COLOR_DE_NIVEL[letra];
  };

  const radioDelPunto = (v: number) => (v === 0 ? 4.5 : 7 + 9 * Math.sqrt(v / maximo));

  // Anunciar la celda activa a los lectores de pantalla (y en el borde inferior del mapa).
  const describir = (dimId: string, letra: Letra) => {
    const d = dims.find((x) => x.id === dimId)!;
    const nombre = niveles.find((x) => x.letra === letra)!.nombre;
    const v = valores.get(`${dimId}.${letra}`)!;
    return `${d.id} ${d.nombre}, ${nombre}: ${v.valor} ${CAPAS.find((c) => c.clave === capa)!.etiqueta.toLowerCase()}`;
  };

  const mover = (dDim: number, dNivel: number) => {
    const i = dims.findIndex((x) => x.id === activa.dim);
    const k = LETRAS.indexOf(activa.letra);
    const ni = (i + dDim + n) % n;
    const nk = Math.min(4, Math.max(0, k + dNivel));
    const sig = { tipo: "celda" as const, dim: dims[ni].id, letra: LETRAS[nk] };
    onSeleccion(sig);
    setAnuncio(describir(sig.dim, sig.letra));
  };

  // El teclado, sobre el mapa entero.
  const alTeclado = (e: React.KeyboardEvent) => {
    const t: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    if (t[e.key]) {
      e.preventDefault();
      mover(...t[e.key]);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (seleccion?.tipo === "celda") abrirComentarios(`${seleccion.dim}.${seleccion.letra}`);
      else mover(0, 0);
    } else if (e.key === "Escape") {
      onSeleccion(null);
    }
  };

  const vertices = (r: number) => dims.map((_, i) => punto(i, n, r));
  const bordes = vertices(R_BORDE + 14);
  const iBase = dims.map((d, i) => (d.capa === "base" ? i : -1)).filter((i) => i >= 0);
  const iProd = dims.map((d, i) => (d.capa === "produccion" ? i : -1)).filter((i) => i >= 0);
  const cuna = (idx: number[]) => {
    if (idx.length === 0) return "";
    const primero = idx[0];
    const ultimo = idx[idx.length - 1];
    const antes = medio(bordes[(primero - 1 + n) % n], bordes[primero]);
    const despues = medio(bordes[ultimo], bordes[(ultimo + 1) % n]);
    return [par([CX, CY]), par(antes), ...idx.map((i) => par(bordes[i])), par(despues)].join(" ");
  };

  const iluminadaDim = encima?.dim ?? (seleccion?.tipo === "celda" || seleccion?.tipo === "dimension" ? seleccion.dim : null);
  const iluminadaLetra = encima?.letra ?? (seleccion?.tipo === "celda" || seleccion?.tipo === "nivel" ? seleccion.letra : null);

  const encimaD = encima ? dims.find((x) => x.id === encima.dim) : null;
  const encimaN = encimaD?.niveles.find((x) => x.letra === encima!.letra) ?? null;
  const encimaI = encimaD ? dims.indexOf(encimaD) : -1;
  const encimaPos = encima ? punto(encimaI, n, radio(LETRAS.indexOf(encima.letra))) : null;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section aria-label={`Mapa de ${area.nombre}`} className="min-w-0 rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-fg">Mapa de {area.nombre}</h2>
            <p className="mt-0.5 max-w-xl text-xs text-fg-muted">
              Cada eje es una dimensión y cada anillo un nivel, de Deficiente en el centro a Óptimo en el borde. El anillo punteado marca la
              base Funcional. Toca un punto para abrir esa celda; usa las flechas para recorrerlo.
            </p>
          </div>
          <GrupoDeControl
            nombre="Qué muestran los puntos"
            ayuda="Cada punto es una celda (una dimensión en un nivel). Su tamaño dice cuánto hay ahí de lo que elijas: criterios, hábitos, riesgos, criterios escondidos por el perfil o comentarios del equipo."
            className="items-end"
          >
            <Segmentado
              etiqueta="Qué muestran los puntos"
              valor={capa}
              onCambio={setCapa}
              className="flex-wrap"
              opciones={CAPAS.map((c) =>
                c.clave === "perfil" && !hayPerfil
                  ? { ...c, deshabilitada: true, title: "Elige primero un perfil de negocio (arriba): esta capa muestra cuántos criterios esconde en cada celda." }
                  : c,
              )}
            />
          </GrupoDeControl>
        </div>
        {capa === "perfil" && !hayPerfil && (
          <p className="mt-2 rounded-lg bg-info-surface px-3 py-1.5 text-xs text-info-ink">Elige un perfil de negocio arriba para ver qué criterios esconde en cada celda.</p>
        )}

        <div className="relative mt-2">
          <svg
            key={area.id}
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full animate-in fade-in zoom-in-95 duration-300"
            role="img"
            aria-label={`Mapa radial de las ${n} dimensiones de ${area.nombre} por nivel`}
          >
            {/* Las dos capas, como dos cuñas suaves */}
            <polygon points={cuna(iBase)} style={{ fill: "var(--color-info)", opacity: 0.045 }} />
            <polygon points={cuna(iProd)} style={{ fill: "var(--color-secondary)", opacity: 0.045 }} />
            {/* La base queda a la derecha (x.1 arriba, en sentido horario) y la producción a la izquierda. */}
            {capas.map((c) => (
              <text
                key={c.clave}
                x={c.clave === "base" ? W - 18 : 18}
                y={c.clave === "base" ? 26 : H - 14}
                style={{
                  fill: "var(--color-fg-muted)",
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textAnchor: c.clave === "base" ? "end" : "start",
                }}
              >
                {c.nombre.toUpperCase()}
              </text>
            ))}

            {/* Anillos: uno por nivel. Funcional, punteado. */}
            {niveles.map((nv, k) => {
              const iluminado = iluminadaLetra === nv.letra;
              return (
                <polygon
                  key={nv.letra}
                  points={vertices(radio(k)).map(par).join(" ")}
                  style={{
                    fill: "none",
                    // Resaltado SUAVE a propósito: un anillo azul fuerte se lee como el polígono de un
                    // resultado (el radar del diagnóstico), y acá no hay ningún resultado.
                    stroke: iluminado ? "var(--color-brand)" : nv.letra === "F" ? "var(--color-success)" : "var(--color-line)",
                    strokeOpacity: iluminado ? 0.5 : 1,
                    strokeWidth: iluminado ? 1.6 : nv.letra === "F" ? 2 : 1,
                    strokeDasharray: nv.letra === "F" ? "6 5" : iluminado ? "2 4" : undefined,
                    transition: "stroke 160ms, stroke-width 160ms",
                  }}
                />
              );
            })}

            {/* Ejes: uno por dimensión */}
            {dims.map((d, i) => {
              const [x, y] = punto(i, n, R_BORDE);
              const aplicaD = dimensionAplica(d, perfil);
              const iluminado = iluminadaDim === d.id;
              return (
                <line
                  key={d.id}
                  x1={CX}
                  y1={CY}
                  x2={x}
                  y2={y}
                  style={{
                    stroke: iluminado ? "var(--color-brand)" : "var(--color-line)",
                    strokeOpacity: iluminado ? 0.6 : 1,
                    strokeWidth: iluminado ? 1.6 : 1,
                    strokeDasharray: aplicaD ? undefined : "3 4",
                    transition: "stroke 160ms",
                  }}
                />
              );
            })}

            {/* Nombres de los niveles, a la derecha del eje de arriba y bajo cada anillo (Deficiente, en
                el centro): tocarlos recorre el área en ese nivel. Con halo para leerse sobre las líneas. */}
            {niveles.map((nv, k) => {
              const centro = k === 0;
              return (
                <g
                  key={nv.letra}
                  role="button"
                  tabIndex={-1}
                  aria-label={`Ver ${area.nombre} en ${nv.nombre}`}
                  className="cursor-pointer"
                  onClick={() => onSeleccion({ tipo: "nivel", letra: nv.letra })}
                >
                  <text
                    x={centro ? CX : CX + 7}
                    y={centro ? CY + 4 : CY - radio(k) + 15}
                    style={{
                      fill: iluminadaLetra === nv.letra ? "var(--color-brand)" : "var(--color-fg-muted)",
                      fontSize: 10.5,
                      fontWeight: iluminadaLetra === nv.letra ? 700 : 500,
                      textAnchor: centro ? "middle" : "start",
                      stroke: "var(--color-surface)",
                      strokeWidth: 3.5,
                      paintOrder: "stroke",
                      strokeLinejoin: "round",
                    }}
                  >
                    {nv.nombre}
                  </text>
                </g>
              );
            })}

            {/* Nombres de las dimensiones: tocarlos abre la dimensión */}
            {dims.map((d, i) => {
              const [x, y] = punto(i, n, R_ETIQUETA);
              const ancla = x > CX + 8 ? "start" : x < CX - 8 ? "end" : "middle";
              const aplicaD = dimensionAplica(d, perfil);
              const iluminado = iluminadaDim === d.id;
              const c = conteoDeDimension(conteos, d.id);
              return (
                <g
                  key={d.id}
                  role="button"
                  tabIndex={-1}
                  aria-label={`Abrir ${d.id} ${d.nombre}`}
                  className="cursor-pointer"
                  onClick={() => onSeleccion({ tipo: "dimension", dim: d.id })}
                  onMouseEnter={() => setEncima(null)}
                >
                  <text x={x} y={y - 3} style={{ textAnchor: ancla, fontSize: 11, fill: "var(--color-fg-muted)", fontFamily: "var(--font-geist-mono), monospace" }}>
                    {d.id}
                    {c.total > 0 ? ` · ${c.total}` : ""}
                  </text>
                  <text
                    x={x}
                    y={y + 13}
                    style={{
                      textAnchor: ancla,
                      fontSize: 14,
                      fontWeight: iluminado ? 700 : 600,
                      fill: iluminado ? "var(--color-brand)" : aplicaD ? "var(--color-fg)" : "var(--color-fg-muted)",
                      opacity: aplicaD ? 1 : 0.7,
                      transition: "fill 160ms",
                    }}
                  >
                    {d.nombre}
                    {aplicaD ? "" : " · no aplica"}
                  </text>
                </g>
              );
            })}

            {/* Los puntos: una celda por cruce */}
            <g
              ref={grupoRef}
              tabIndex={0}
              role="group"
              aria-label="Celdas del mapa. Flechas para moverte, Enter para comentar."
              onKeyDown={alTeclado}
              onFocus={() => setConFoco(true)}
              onBlur={() => setConFoco(false)}
              className="outline-none"
            >
              {dims.map((d, i) =>
                d.niveles.map((nv, k) => {
                  const [x, y] = punto(i, n, radio(k));
                  const v = valores.get(nv.id)!;
                  const r = radioDelPunto(v.valor);
                  const elegido = seleccion?.tipo === "celda" && seleccion.dim === d.id && seleccion.letra === nv.letra;
                  const activo = conFoco && activa.dim === d.id && activa.letra === nv.letra;
                  const aplicaD = dimensionAplica(d, perfil);
                  return (
                    <g
                      key={nv.id}
                      transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
                      className="cursor-pointer"
                      style={{ opacity: aplicaD ? 1 : 0.35, transition: "opacity 200ms" }}
                      onMouseEnter={() => setEncima({ dim: d.id, letra: nv.letra })}
                      onMouseLeave={() => setEncima((e) => (e?.dim === d.id && e.letra === nv.letra ? null : e))}
                      onClick={() => {
                        onSeleccion({ tipo: "celda", dim: d.id, letra: nv.letra });
                        grupoRef.current?.focus({ preventScroll: true });
                      }}
                    >
                      <circle r={18} style={{ fill: "transparent" }} />
                      {(elegido || activo) && (
                        <circle
                          r={1}
                          vectorEffect="non-scaling-stroke"
                          style={{
                            transform: `scale(${r + 5})`,
                            fill: "none",
                            stroke: elegido ? "var(--color-fg)" : "var(--color-brand)",
                            strokeWidth: 2,
                            strokeDasharray: elegido ? undefined : "3 3",
                            transition: "transform 200ms ease",
                          }}
                        />
                      )}
                      <circle
                        r={1}
                        vectorEffect="non-scaling-stroke"
                        style={{
                          transform: `scale(${r})`,
                          fill: colorDelPunto(nv.letra, v),
                          stroke: v.valor === 0 ? "var(--color-fg-muted)" : "var(--color-surface)",
                          strokeWidth: v.valor === 0 ? 1.5 : 2,
                          transition: "transform 220ms ease, fill 220ms ease",
                        }}
                      />
                      {/* El número va AFUERA del punto, con el color del texto y halo: dentro, sobre ámbar o
                          gris, no se leía en los dos temas. */}
                      {v.valor > 0 && (
                        <text
                          x={r * 0.72 + 3}
                          y={-r * 0.72 + 1}
                          style={{
                            fill: "var(--color-fg)",
                            fontSize: 11,
                            fontWeight: 700,
                            textAnchor: "start",
                            stroke: "var(--color-surface)",
                            strokeWidth: 3,
                            paintOrder: "stroke",
                            strokeLinejoin: "round",
                            pointerEvents: "none",
                          }}
                        >
                          {v.valor}
                        </text>
                      )}
                    </g>
                  );
                }),
              )}
            </g>
          </svg>

          {/* Lo que hay bajo el cursor */}
          {encimaD && encimaN && encimaPos && (
            <div
              className="pointer-events-none absolute z-10 w-64 -translate-x-1/2 rounded-lg border border-line bg-surface px-3 py-2 shadow-lg"
              style={{
                left: `${Math.min(88, Math.max(12, (encimaPos[0] / W) * 100))}%`,
                top: `${(encimaPos[1] / H) * 100}%`,
                transform: `translate(-50%, ${encimaPos[1] > H * 0.6 ? "calc(-100% - 22px)" : "22px"})`,
              }}
            >
              <p className="text-2xs text-fg-muted">
                <span className="font-mono">{encimaN.id}</span> · {niveles.find((x) => x.letra === encimaN.letra)?.nombre}
              </p>
              <p className="text-xs font-semibold text-fg">{encimaD.nombre}</p>
              <p className="mt-1 line-clamp-3 text-xs leading-snug text-fg-secondary">{encimaN.descripcion}</p>
              <p className="mt-1 text-2xs text-fg-muted">
                {[
                  cuantos(encimaN.criterios.filter((c) => aplica(c, perfil)).length, "criterio", "criterios"),
                  hayPerfil && encimaN.criterios.some((c) => !aplica(c, perfil))
                    ? `${cuantos(encimaN.criterios.filter((c) => !aplica(c, perfil)).length, "escondido", "escondidos")} por el perfil`
                    : null,
                  cuantos(conteoDeCelda(conteos, encimaD.id, encimaN.letra).total, "comentario", "comentarios"),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-fg-muted">
          {capa === "comentarios" ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-brand" aria-hidden /> con comentarios abiertos
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-fg-muted" aria-hidden /> solo cerrados
              </span>
            </>
          ) : capa === "criterios" ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-flex gap-0.5" aria-hidden>
                {LETRAS.map((l) => (
                  <span key={l} className={cn("h-2.5 w-2.5 rounded-full", PUNTO_DE_NIVEL[l])} />
                ))}
              </span>
              el color es el nivel; cuantos más criterios, más grande
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full" style={{ background: MUESTRA_DE_CAPA[capa].color }} aria-hidden /> {MUESTRA_DE_CAPA[capa].texto}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full border border-fg-muted bg-surface" aria-hidden /> nada
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-5 border-t-2 border-dashed border-success-line" aria-hidden /> base Funcional
          </span>
          {hayPerfil && <span>Perfil: {describirPerfil(perfil)}</span>}
        </div>
        <p className="sr-only" aria-live="polite">
          {anuncio}
        </p>
      </section>

      <DetalleDelMapa
        datos={datos}
        perfil={perfil}
        seleccion={seleccion}
        onSeleccion={onSeleccion}
        onLeerDimension={onLeerDimension}
        onVerEnLaMatriz={onVerEnLaMatriz}
      />
    </div>
  );
}

// ── El panel del costado: lo elegido en el mapa ───────────────────────────────

function DetalleDelMapa({
  datos,
  perfil,
  seleccion,
  onSeleccion,
  onLeerDimension,
  onVerEnLaMatriz,
}: {
  datos: DatosDeLaVista;
  perfil: Perfil;
  seleccion: SeleccionDelMapa;
  onSeleccion: (s: SeleccionDelMapa) => void;
  onLeerDimension: (dim: string) => void;
  onVerEnLaMatriz: () => void;
}) {
  const { conteos, abrirComentarios } = useEscala();
  const { area, niveles } = datos;
  const dims = area.dimensiones;
  const nombreNivel = (l: Letra) => niveles.find((x) => x.letra === l)!.nombre;
  const caja = "self-start rounded-2xl border border-line bg-surface p-5 xl:sticky xl:top-4";

  if (!seleccion) {
    const total = dims.reduce((s, d) => s + conteoDeDimension(conteos, d.id).total, 0);
    const abiertos = dims.reduce((s, d) => s + conteoDeDimension(conteos, d.id).abiertos, 0);
    return (
      <aside aria-label="Detalle" className={caja}>
        <p className="text-2xs font-bold uppercase tracking-wide text-fg-muted">{area.nombre}</p>
        <p className="mt-2 text-sm leading-relaxed text-fg-secondary">{area.descripcion}</p>
        <p className="mt-4 text-sm text-fg">
          <span className="text-2xl font-bold tabular-nums">{total}</span> comentarios · <span className="font-semibold">{abiertos}</span> abiertos
        </p>
        <ul className="mt-4 space-y-1.5 text-xs text-fg-muted">
          <li>Toca un punto para abrir esa celda.</li>
          <li>Toca el nombre de una dimensión para verla entera.</li>
          <li>Toca el nombre de un nivel para recorrer el área en ese nivel.</li>
          <li>Con el teclado: flechas para moverte, Enter para comentar, Escape para volver.</li>
        </ul>
      </aside>
    );
  }

  if (seleccion.tipo === "nivel") {
    const k = LETRAS.indexOf(seleccion.letra);
    return (
      <aside aria-label="Detalle del nivel" className={caja}>
        <p className="text-2xs font-bold uppercase tracking-wide text-fg-muted">Así se ve {area.nombre} en</p>
        <div className="mt-1 flex items-center gap-2">
          <span className={cn("h-3 w-3 rounded-sm", PUNTO_DE_NIVEL[seleccion.letra])} aria-hidden />
          <h3 className="text-lg font-bold text-fg">{nombreNivel(seleccion.letra)}</h3>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-fg-secondary">{area.panoramica[seleccion.letra] ?? "—"}</p>
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {dims.map((d) => {
            const nv = d.niveles.find((x) => x.letra === seleccion.letra)!;
            return (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => onSeleccion({ tipo: "celda", dim: d.id, letra: seleccion.letra })}
                  className="flex w-full items-start gap-2 py-2 text-left hover:bg-surface-hover"
                >
                  <span className="w-7 flex-shrink-0 font-mono text-2xs text-fg-muted">{d.id}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-fg">{d.nombre}</span>
                    <span className="block text-xs leading-snug text-fg-secondary">{nv.descripcion}</span>
                  </span>
                  <Contador conteo={conteoDeCelda(conteos, d.id, seleccion.letra)} />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex justify-between gap-2">
          <button
            type="button"
            disabled={k === 0}
            onClick={() => onSeleccion({ tipo: "nivel", letra: LETRAS[k - 1] })}
            className="rounded-lg border border-line px-2.5 py-1.5 text-xs text-fg-secondary hover:bg-surface-hover disabled:opacity-40"
          >
            ← {k > 0 ? nombreNivel(LETRAS[k - 1]) : "—"}
          </button>
          <button
            type="button"
            disabled={k === LETRAS.length - 1}
            onClick={() => onSeleccion({ tipo: "nivel", letra: LETRAS[k + 1] })}
            className="rounded-lg border border-line px-2.5 py-1.5 text-xs text-fg-secondary hover:bg-surface-hover disabled:opacity-40"
          >
            {k < LETRAS.length - 1 ? nombreNivel(LETRAS[k + 1]) : "—"} →
          </button>
        </div>
      </aside>
    );
  }

  const d = dims.find((x) => x.id === seleccion.dim);
  if (!d) return null;

  if (seleccion.tipo === "dimension") {
    const i = dims.indexOf(d);
    return (
      <aside aria-label="Detalle de la dimensión" className={caja}>
        <p className="text-2xs text-fg-muted">
          <span className="font-mono">{d.id}</span>
          {d.generica && d.generica.nombre !== d.nombre ? ` · ${d.generica.nombre}` : ""}
        </p>
        <h3 className="mt-0.5 text-lg font-bold text-fg">{d.nombre}</h3>
        <p className="mt-2 text-sm leading-snug text-fg">{d.pregunta}</p>
        <p className="mt-3 rounded-lg border border-warn-line bg-warn-surface px-3 py-2 text-xs leading-relaxed text-warn-ink">
          <span className="font-semibold">Costo de quedarse. </span>
          {d.costoDeQuedarse}
        </p>
        <ol className="mt-4 space-y-1">
          {d.niveles.map((nv) => (
            <li key={nv.id}>
              <button
                type="button"
                onClick={() => onSeleccion({ tipo: "celda", dim: d.id, letra: nv.letra })}
                className="flex w-full items-start gap-2 rounded-md px-1 py-1.5 text-left hover:bg-surface-hover"
              >
                <span className={cn("mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-sm", PUNTO_DE_NIVEL[nv.letra])} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-fg">{nombreNivel(nv.letra)}</span>
                  <span className="block text-xs leading-snug text-fg-secondary">{nv.descripcion}</span>
                </span>
                <Contador conteo={conteoDeCelda(conteos, d.id, nv.letra)} />
              </button>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <BotonComentar conteo={conteoDe(conteos, d.id)} onClick={() => abrirComentarios(d.id)} etiqueta="Comentarios de la dimensión" />
          <button type="button" onClick={() => onLeerDimension(d.id)} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg hover:bg-primary-hover">
            Leer la dimensión
          </button>
        </div>
        <div className="mt-3 flex justify-between gap-2 border-t border-line pt-3">
          <button type="button" onClick={() => onSeleccion({ tipo: "dimension", dim: dims[(i - 1 + dims.length) % dims.length].id })} className="text-xs text-fg-secondary hover:text-fg">
            ← {dims[(i - 1 + dims.length) % dims.length].nombre}
          </button>
          <button type="button" onClick={() => onSeleccion({ tipo: "dimension", dim: dims[(i + 1) % dims.length].id })} className="text-xs text-fg-secondary hover:text-fg">
            {dims[(i + 1) % dims.length].nombre} →
          </button>
        </div>
      </aside>
    );
  }

  const nv = d.niveles.find((x) => x.letra === seleccion.letra)!;
  return <DetalleDeCelda datos={datos} perfil={perfil} d={d} nv={nv} onLeerDimension={onLeerDimension} onVerEnLaMatriz={onVerEnLaMatriz} caja={caja} />;
}

function DetalleDeCelda({
  datos,
  perfil,
  d,
  nv,
  onLeerDimension,
  onVerEnLaMatriz,
  caja,
}: {
  datos: DatosDeLaVista;
  perfil: Perfil;
  d: Dimension;
  nv: Nivel;
  onLeerDimension: (dim: string) => void;
  onVerEnLaMatriz: () => void;
  caja: string;
}) {
  const { conteos, abrirComentarios } = useEscala();
  const nombre = datos.niveles.find((x) => x.letra === nv.letra)!.nombre;
  const visibles = nv.criterios.filter((c) => aplica(c, perfil));
  const ocultos = nv.criterios.length - visibles.length;
  return (
    <aside aria-label="Detalle de la celda" className={caja}>
      <p className="text-2xs text-fg-muted">
        <span className="font-mono">{nv.id}</span> · {datos.capas.find((c) => c.clave === d.capa)?.nombre}
      </p>
      <h3 className="mt-0.5 text-lg font-bold leading-tight text-fg">
        {d.nombre} <span className="font-medium text-fg-muted">en</span>{" "}
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("h-2.5 w-2.5 rounded-sm", PUNTO_DE_NIVEL[nv.letra])} aria-hidden />
          {nombre}
        </span>
      </h3>
      <p className="mt-2 text-sm font-medium leading-relaxed text-fg">{nv.descripcion}</p>
      {nv.resultado && (
        <p className="mt-2 rounded-lg bg-success-surface px-3 py-2 text-xs leading-relaxed text-success-ink">
          <span className="font-bold">Resultado · </span>
          {nv.resultado}
        </p>
      )}
      {visibles.length > 0 && (
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {visibles.map((c) => (
            <li key={c.id} className="flex items-start gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug text-fg">
                  <TextoConPalabras texto={c.texto} palabras={datos.palabrasConValorFijo} />
                </p>
                <MetaDelCriterio criterio={c} datos={datos} className="mt-1" />
              </div>
              <BotonComentar conteo={conteoDe(conteos, c.id)} onClick={() => abrirComentarios(c.id)} etiqueta={`Comentarios de ${c.id}`} />
            </li>
          ))}
        </ul>
      )}
      {ocultos > 0 && (
        <p className="mt-2 text-xs text-fg-muted">
          {ocultos} {ocultos === 1 ? "criterio no aplica" : "criterios no aplican"} a este perfil.
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <BotonComentar conteo={conteoDe(conteos, nv.id)} onClick={() => abrirComentarios(nv.id)} etiqueta={`Comentarios del nivel ${nombre}`} />
        <button type="button" onClick={() => onLeerDimension(d.id)} className="rounded-lg border border-line px-3 py-1.5 text-xs text-fg-secondary hover:bg-surface-hover">
          Leer la dimensión
        </button>
        <button type="button" onClick={onVerEnLaMatriz} className="rounded-lg border border-line px-3 py-1.5 text-xs text-fg-secondary hover:bg-surface-hover">
          Ver en la matriz
        </button>
      </div>
    </aside>
  );
}
