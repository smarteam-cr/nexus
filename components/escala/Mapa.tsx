"use client";

/**
 * components/escala/Mapa.tsx — un área de la escala como rueda.
 *
 * Cada porción es una dimensión y cada anillo un nivel: Deficiente al centro, Óptimo en el borde.
 * La base operativa ocupa la mitad derecha y la producción la izquierda, separadas por un hueco:
 * arriba, en ese hueco, van los nombres de los niveles. La línea punteada es la base (Funcional) y,
 * en el borde de cada capa, el número dice en qué orden se trabaja («Qué se trabaja primero»).
 * Cada celda de la rueda es una celda de la matriz.
 *
 * Interactiva a propósito, para recorrer la escala en vez de leerla de corrido:
 *   · Qué muestran las celdas: criterios (al entrar), hábitos, riesgos, los que esconde el perfil
 *     o los comentarios del equipo. Cuanto más hay, más intenso el color.
 *   · Pasar el cursor por una celda la levanta, apaga lo que no es su dimensión ni su nivel y lo
 *     cuenta en el centro (nada tapa la rueda); tocarla la abre al costado, con sus criterios, y
 *     tocarla de nuevo (o la X del panel) la cierra. Lo que se levanta es solo el dibujo: dónde se
 *     apunta queda quieto, para que el cursor en un borde no la haga temblar.
 *   · Pasar el cursor por el nombre de una capa (base operativa, producción) enciende sus dimensiones.
 *   · Tocar una dimensión la abre entera; tocar un nivel enciende los anillos de adentro hasta él:
 *     la escala se sube de a un nivel.
 *   · ▶ en el centro recorre la escala de Deficiente a Óptimo, un nivel a la vez.
 *   · Con el teclado: ←/→ cambian de dimensión, ↑/↓ de nivel, Enter abre los comentarios, Escape
 *     vuelve al área.
 */
import { createElement, useEffect, useId, useMemo, useRef, useState, type SVGProps } from "react";
import { cn } from "@/lib/cn";
import { aplica, describirPerfil, dimensionAplica, type Perfil } from "@/lib/escala/documento/perfil";
import { LETRAS, type ClaveDeCapa, type Dimension, type Letra, type Nivel } from "@/lib/escala/documento/tipos";
import { lugarEnElOrden, ordenDeDependencias, type DatosDeLaVista } from "@/lib/escala/vista";
import { conteoDe, conteoDeCelda, conteoDeDimension, useEscala } from "./contexto";
import { COLOR_DE_NIVEL, PUNTO_DE_NIVEL } from "./niveles";
import {
  BotonComentar,
  Contador,
  GrupoDeControl,
  MetaDelCriterio,
  NoAplicanEnLaEdicion,
  NombreGeneral,
  Segmentado,
  TextoConPalabras,
} from "./piezas";

type CapaDeDatos = "comentarios" | "criterios" | "habitos" | "riesgos" | "perfil";

export type SeleccionDelMapa =
  | { tipo: "celda"; dim: string; letra: Letra }
  | { tipo: "dimension"; dim: string }
  | { tipo: "nivel"; letra: Letra }
  | null;

/** Lo que está bajo el cursor: lo mismo que se puede elegir, más una capa entera (por su nombre). */
type FocoDelMapa = SeleccionDelMapa | { tipo: "capa"; clave: ClaveDeCapa };

/** ¿Es lo mismo? Tocar de nuevo lo elegido lo suelta. */
function mismaSeleccion(a: SeleccionDelMapa, b: SeleccionDelMapa): boolean {
  if (!a || !b) return a === b;
  if (a.tipo === "celda") return b.tipo === "celda" && a.dim === b.dim && a.letra === b.letra;
  if (a.tipo === "dimension") return b.tipo === "dimension" && a.dim === b.dim;
  return b.tipo === "nivel" && a.letra === b.letra;
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
  return out;
}

/** Lo que dice la escala primero (criterios, por defecto); lo que dice el equipo, al final. */
const CAPAS: { clave: CapaDeDatos; etiqueta: string; title: string }[] = [
  {
    clave: "criterios",
    etiqueta: "Criterios",
    title: "Cuántos criterios tiene cada celda (con el perfil de negocio elegido, si hay uno): más intenso, más criterios. El color es el del nivel.",
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

/** El color y el texto de la leyenda en las capas que pintan las celdas de un solo color. */
const MUESTRA_DE_CAPA: Record<"habitos" | "riesgos" | "perfil", { color: string; texto: string }> = {
  habitos: { color: "var(--color-secondary)", texto: "más intenso, más hábitos" },
  riesgos: { color: "var(--color-warning)", texto: "más intenso, más criterios de riesgo" },
  perfil: { color: "var(--color-info)", texto: "más intenso, más escondidos" },
};

/** «1 criterio», «3 criterios». */
const cuantos = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

// ── Geometría (unidades del viewBox) ──────────────────────────────────────────
const W = 1300;
const H = 900;
const CX = 650;
const CY = 450;
/** El círculo del centro, donde se cuenta lo que se mira. */
const R_CENTRO = 104;
/** Donde empieza Deficiente y cuánto mide cada anillo. */
const R_DENTRO = 114;
const ANCHO = 52;
const R_FUERA = R_DENTRO + ANCHO * 5;
/** La línea de la base: el borde de adentro de Funcional. */
const R_BASE = R_DENTRO + ANCHO * 2;
/** La banda de cada capa, con el orden en que se trabaja. */
const R_BANDA = R_FUERA + 16;
const R_ETIQUETA = R_FUERA + 50;
/** Grados libres arriba y abajo: separan las dos capas, y arriba van los nombres de los niveles. */
const HUECO = 34;
/** Aire entre celdas: grados entre porciones y unidades entre anillos. */
const AIRE_ANGULAR = 1.4;
const AIRE_RADIAL = 3;
/** Cuánto dura cada nivel en «Recorrer». */
const PASO_DEL_RECORRIDO_MS = 3200;

/** Las celdas entran girando desde el centro, anillo por anillo (sin animación si se pidió menos movimiento). */
const ESTILOS = `
@keyframes escala-rueda-entra { from { opacity: 0; transform: scale(0.55) rotate(-10deg); } to { opacity: 1; transform: none; } }
@keyframes escala-rueda-pulso { 0%, 100% { stroke-opacity: 1; } 50% { stroke-opacity: 0.3; } }
.escala-rueda-celda { transform-box: view-box; transform-origin: ${CX}px ${CY}px; animation: escala-rueda-entra 560ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
.escala-rueda-pulso { animation: escala-rueda-pulso 1.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .escala-rueda-celda, .escala-rueda-pulso { animation: none; } }
`;

const f = (v: number) => v.toFixed(1);
const aRadianes = (g: number) => (g * Math.PI) / 180;

/** Grados de reloj (0 = arriba, en el sentido de las agujas) → coordenadas. */
function polar(grados: number, r: number): [number, number] {
  return [CX + r * Math.sin(aRadianes(grados)), CY - r * Math.cos(aRadianes(grados))];
}

/** Un sector de anillo: entre dos radios y dos ángulos. */
function sectorDeAnillo(r0: number, r1: number, g0: number, g1: number): string {
  const [ax, ay] = polar(g0, r1);
  const [bx, by] = polar(g1, r1);
  const [cx, cy] = polar(g1, r0);
  const [dx, dy] = polar(g0, r0);
  const grande = g1 - g0 > 180 ? 1 : 0;
  return `M${f(ax)} ${f(ay)}A${r1} ${r1} 0 ${grande} 1 ${f(bx)} ${f(by)}L${f(cx)} ${f(cy)}A${r0} ${r0} 0 ${grande} 0 ${f(dx)} ${f(dy)}Z`;
}

/** Un arco suelto (la banda de una capa). */
function arco(r: number, g0: number, g1: number): string {
  const [ax, ay] = polar(g0, r);
  const [bx, by] = polar(g1, r);
  return `M${f(ax)} ${f(ay)}A${r} ${r} 0 ${g1 - g0 > 180 ? 1 : 0} 1 ${f(bx)} ${f(by)}`;
}

/** Los radios de un anillo (k = 0 es Deficiente), con aire entre anillos. */
const anillo = (k: number): [number, number] => [R_DENTRO + ANCHO * k + AIRE_RADIAL / 2, R_DENTRO + ANCHO * (k + 1) - AIRE_RADIAL / 2];

/** La mitad de cada capa: la base a la derecha, la producción a la izquierda. */
const MITAD: Record<ClaveDeCapa, [number, number]> = {
  base: [HUECO / 2, 180 - HUECO / 2],
  produccion: [180 + HUECO / 2, 360 - HUECO / 2],
};

/** Los ángulos de la porción de cada dimensión, repartidos dentro de la mitad de su capa. */
function porciones(dims: Dimension[]): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  for (const clave of Object.keys(MITAD) as ClaveDeCapa[]) {
    const [inicio, fin] = MITAD[clave];
    const deLaCapa = dims.filter((d) => d.capa === clave);
    const paso = (fin - inicio) / Math.max(1, deLaCapa.length);
    deLaCapa.forEach((d, j) => out.set(d.id, [inicio + paso * j + AIRE_ANGULAR / 2, inicio + paso * (j + 1) - AIRE_ANGULAR / 2]));
  }
  return out;
}

/**
 * Un `<g>` con `title`: los tipos de React no lo admiten en SVG, pero el navegador sí y la capa
 * global de tooltips lo lee igual que en HTML.
 */
function GrupoConTitulo({ titulo, children, ...resto }: SVGProps<SVGGElement> & { titulo: string }) {
  return createElement("g", { ...resto, title: titulo }, children);
}

const IconoPlay = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden>
    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
  </svg>
);

const IconoPausa = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden>
    <rect x="6" y="5" width="4.5" height="14" rx="1.2" />
    <rect x="13.5" y="5" width="4.5" height="14" rx="1.2" />
  </svg>
);

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
  /** Para los `id` del SVG (el rayado, el halo): únicos aunque haya dos mapas. */
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [capa, setCapa] = useState<CapaDeDatos>("criterios");
  /** Lo que está bajo el cursor: manda sobre lo elegido mientras dure. */
  const [encima, setEncima] = useState<FocoDelMapa>(null);
  const [recorriendo, setRecorriendo] = useState(false);
  const [anuncio, setAnuncio] = useState("");
  /** El contorno de «acá estás» solo se ve navegando con el teclado. */
  const [conFoco, setConFoco] = useState(false);
  const grupoRef = useRef<SVGGElement>(null);
  const seleccionRef = useRef(seleccion);
  const soltarRef = useRef<number | null>(null);
  const hayPerfil = !!(perfil.cierre || perfil.despues);

  useEffect(() => {
    seleccionRef.current = seleccion;
  }, [seleccion]);

  // ▶: un nivel a la vez, de adentro hacia afuera. Se detiene en Óptimo o si se elige otra cosa.
  useEffect(() => {
    if (!recorriendo) return;
    const t = window.setInterval(() => {
      const s = seleccionRef.current;
      const k = s?.tipo === "nivel" ? LETRAS.indexOf(s.letra) : -1;
      if (k < 0 || k >= LETRAS.length - 1) {
        setRecorriendo(false);
        return;
      }
      const siguiente = LETRAS[k + 1];
      onSeleccion({ tipo: "nivel", letra: siguiente });
      setAnuncio(`${area.nombre} en ${niveles.find((x) => x.letra === siguiente)?.nombre ?? siguiente}`);
    }, PASO_DEL_RECORRIDO_MS);
    return () => window.clearInterval(t);
  }, [recorriendo, onSeleccion, area.nombre, niveles]);

  useEffect(
    () => () => {
      if (soltarRef.current) window.clearTimeout(soltarRef.current);
    },
    [],
  );

  /** Elegir algo a mano detiene el recorrido. */
  const elegir = (s: SeleccionDelMapa) => {
    setRecorriendo(false);
    onSeleccion(s);
  };

  /** Tocar de nuevo lo elegido lo suelta (lo mismo que la X del panel). */
  const alternar = (s: SeleccionDelMapa) => elegir(mismaSeleccion(s, seleccion) ? null : s);

  /** Desde el nivel elegido (si no es el último) o desde el centro. */
  const recorrer = () => {
    const desde = seleccion?.tipo === "nivel" && seleccion.letra !== LETRAS[LETRAS.length - 1] ? seleccion.letra : LETRAS[0];
    onSeleccion({ tipo: "nivel", letra: desde });
    setRecorriendo(true);
  };

  // Al salir de algo, soltar con un respiro: si el cursor entra enseguida a otra cosa, no parpadea.
  const ponerEncima = (s: FocoDelMapa) => {
    if (soltarRef.current) {
      window.clearTimeout(soltarRef.current);
      soltarRef.current = null;
    }
    setEncima(s);
  };
  const soltarEncima = () => {
    if (soltarRef.current) window.clearTimeout(soltarRef.current);
    soltarRef.current = window.setTimeout(() => {
      soltarRef.current = null;
      setEncima(null);
    }, 80);
  };

  // La celda «activa» para el teclado: la elegida, o la primera Funcional.
  const activa = seleccion?.tipo === "celda" ? seleccion : { dim: dims[0].id, letra: "F" as Letra };

  /** El valor de cada celda según lo que se eligió mostrar. */
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
  const angulos = useMemo(() => porciones(dims), [dims]);

  /** «Qué se trabaja primero»: el orden de cada capa en esta área, con el cierre elegido. */
  const ordenes = useMemo(
    () => new Map(capas.map((c) => [c.clave, ordenDeDependencias(datos.dependencias, area.nombre, c.nombre, perfil.cierre)])),
    [capas, datos.dependencias, area.nombre, perfil.cierre],
  );
  const hayOrden = [...ordenes.values()].some((filas) => filas.length === 1);
  /** La base de Ventas cambia de orden según cómo se cierra la venta: sin perfil, no hay uno solo. */
  const ordenSegunElCierre = [...ordenes.values()].some((filas) => filas.length > 1);
  const algunaNoAplica = dims.some((d) => !dimensionAplica(d, perfil));

  const colorDe = (letra: Letra, v: { valor: number; abiertos: number }) => {
    if (capa === "comentarios") return v.abiertos ? "var(--color-brand)" : "var(--color-fg-muted)";
    if (capa === "criterios") return COLOR_DE_NIVEL[letra];
    return MUESTRA_DE_CAPA[capa].color;
  };

  const enPalabras = (v: { valor: number; abiertos: number }): string => {
    switch (capa) {
      case "criterios":
        return cuantos(v.valor, "criterio", "criterios");
      case "habitos":
        return cuantos(v.valor, "hábito", "hábitos");
      case "riesgos":
        return cuantos(v.valor, "criterio de riesgo", "criterios de riesgo");
      case "perfil":
        return `${cuantos(v.valor, "escondido", "escondidos")} por el perfil`;
      case "comentarios":
        return `${cuantos(v.valor, "comentario", "comentarios")}${v.abiertos ? ` · ${cuantos(v.abiertos, "abierto", "abiertos")}` : ""}`;
    }
  };

  const nombreNivel = (l: Letra) => niveles.find((x) => x.letra === l)?.nombre ?? l;

  // Anunciar la celda activa a los lectores de pantalla.
  const describir = (dimId: string, letra: Letra) => {
    const d = dims.find((x) => x.id === dimId)!;
    return `${d.id} ${d.nombre}, ${nombreNivel(letra)}: ${enPalabras(valores.get(`${dimId}.${letra}`)!)}`;
  };

  const mover = (dDim: number, dNivel: number) => {
    const i = dims.findIndex((x) => x.id === activa.dim);
    const k = LETRAS.indexOf(activa.letra);
    const sig = { tipo: "celda" as const, dim: dims[(i + dDim + n) % n].id, letra: LETRAS[Math.min(4, Math.max(0, k + dNivel))] };
    elegir(sig);
    setAnuncio(describir(sig.dim, sig.letra));
  };

  // El teclado, sobre la rueda entera.
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
      elegir(null);
    }
  };

  /** Lo que está en foco: lo que está bajo el cursor o, si no, lo elegido. */
  const foco: FocoDelMapa = encima ?? seleccion;
  /** Apagar lo que no es el foco: fuerte bajo el cursor, suave con algo elegido. */
  const opacidadDe = (d: Dimension, k: number): number => {
    if (!foco) return 1;
    const tenue = encima ? 0.26 : 0.5;
    if (foco.tipo === "capa") return d.capa === foco.clave ? 1 : tenue;
    if (foco.tipo === "celda") return foco.dim === d.id || LETRAS[k] === foco.letra ? 1 : tenue;
    if (foco.tipo === "dimension") return foco.dim === d.id ? 1 : tenue;
    // Un nivel: encendidos todos los anillos hasta él. La escala se sube de a uno.
    return k <= LETRAS.indexOf(foco.letra) ? 1 : 0.2;
  };

  const focoDim = foco && (foco.tipo === "celda" || foco.tipo === "dimension") ? dims.find((x) => x.id === foco.dim) : undefined;
  const focoNivel = foco && (foco.tipo === "celda" || foco.tipo === "nivel") ? foco.letra : null;
  /** La capa en foco: la que se nombra o la de la dimensión en foco. */
  const focoCapa = foco?.tipo === "capa" ? foco.clave : (focoDim?.capa ?? null);

  /** El centro de la rueda: lo que se mira, dicho corto. */
  const centro = (() => {
    const boton = (etiqueta: string, alTocar: () => void, pausa = false) => (
      <button
        type="button"
        onClick={alTocar}
        className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary font-semibold text-primary-fg shadow-sm transition-colors hover:bg-primary-hover"
        style={{ fontSize: 15, padding: "6px 14px" }}
      >
        {pausa ? <IconoPausa /> : <IconoPlay />}
        {etiqueta}
      </button>
    );
    if (!foco) {
      return (
        <>
          <p className="font-bold leading-none text-fg" style={{ fontSize: 30 }}>
            {area.nombre}
          </p>
          <p className="mt-1.5 text-fg-muted" style={{ fontSize: 15 }}>
            {n} dimensiones · {niveles.length} niveles
          </p>
          {boton("Recorrer", recorrer)}
        </>
      );
    }
    if (foco.tipo === "nivel") {
      const k = LETRAS.indexOf(foco.letra);
      const elegido = seleccion?.tipo === "nivel" && seleccion.letra === foco.letra;
      return (
        <>
          <p className="font-semibold uppercase tracking-wide text-fg-muted" style={{ fontSize: 13 }}>
            Nivel {k + 1} de {LETRAS.length}
          </p>
          <p className="mt-0.5 font-bold leading-tight text-fg" style={{ fontSize: 27 }}>
            {nombreNivel(foco.letra)}
          </p>
          <span className="mt-1.5 flex gap-1" aria-hidden>
            {LETRAS.map((l, j) => (
              <span key={l} className={cn("rounded-full", j <= k ? PUNTO_DE_NIVEL[l] : "bg-surface-hover")} style={{ width: 10, height: 10 }} />
            ))}
          </span>
          {elegido
            ? recorriendo
              ? boton("Pausar", () => setRecorriendo(false), true)
              : boton(k < LETRAS.length - 1 ? "Seguir subiendo" : "Otra vez", recorrer)
            : (
              <p className="mt-1.5 text-fg-muted" style={{ fontSize: 14 }}>
                Toca para ver {area.nombre} en este nivel
              </p>
            )}
        </>
      );
    }
    if (foco.tipo === "capa") {
      const c = capas.find((x) => x.clave === foco.clave);
      return (
        <>
          <p className="font-semibold uppercase tracking-wide text-fg-muted" style={{ fontSize: 13 }}>
            Capa
          </p>
          <p className="mt-0.5 font-bold leading-tight text-fg" style={{ fontSize: 24 }}>
            {c?.nombre}
          </p>
          <p className="mt-1 text-fg-muted" style={{ fontSize: 15 }}>
            {cuantos(dims.filter((d) => d.capa === foco.clave).length, "dimensión", "dimensiones")}
          </p>
        </>
      );
    }
    if (!focoDim) return null;
    if (foco.tipo === "dimension") {
      const visibles = focoDim.niveles.flatMap((x) => x.criterios).filter((c) => aplica(c, perfil)).length;
      return (
        <>
          <p className="font-mono text-fg-muted" style={{ fontSize: 15 }}>
            {focoDim.id}
          </p>
          <p className="mt-0.5 line-clamp-3 font-bold leading-tight text-fg" style={{ fontSize: 21 }}>
            {focoDim.nombre}
          </p>
          <p className="mt-1 text-fg-muted" style={{ fontSize: 15 }}>
            {dimensionAplica(focoDim, perfil) ? cuantos(visibles, "criterio", "criterios") : "no aplica a este perfil"}
          </p>
        </>
      );
    }
    const nv = focoDim.niveles.find((x) => x.letra === foco.letra)!;
    return (
      <>
        <p className="font-mono text-fg-muted" style={{ fontSize: 15 }}>
          {nv.id}
        </p>
        <p className="mt-0.5 flex items-center justify-center gap-1.5 font-bold text-fg" style={{ fontSize: 20 }}>
          <span className={cn("rounded-sm", PUNTO_DE_NIVEL[nv.letra])} style={{ width: 10, height: 10 }} aria-hidden />
          {nombreNivel(nv.letra)}
        </p>
        <p className="mt-0.5 line-clamp-2 leading-tight text-fg-secondary" style={{ fontSize: 18 }}>
          {focoDim.nombre}
        </p>
        <p className="mt-1 text-fg-muted" style={{ fontSize: 15 }}>
          {dimensionAplica(focoDim, perfil) || capa === "perfil" ? enPalabras(valores.get(nv.id)!) : "no aplica a este perfil"}
        </p>
      </>
    );
  })();

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section aria-label={`Mapa de ${area.nombre}`} className="min-w-0 rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-fg">Mapa de {area.nombre}</h2>
            <p className="mt-0.5 max-w-xl text-xs text-fg-muted">
              Cada porción es una dimensión y cada anillo un nivel, de Deficiente al centro a Óptimo en el borde. Cada celda es una
              dimensión en un nivel ({dims[0].id}.F es {dims[0].nombre} en {nombreNivel("F")}) y su número dice cuántos criterios tiene. Tócala
              para ver sus criterios y otra vez para cerrarla; «Recorrer», en el centro, sube la escala de Deficiente a Óptimo.
            </p>
          </div>
          <GrupoDeControl
            nombre="Qué muestran las celdas"
            ayuda="Cada celda es una dimensión en un nivel. Su color se intensifica cuanto más hay ahí de lo que elijas: criterios, hábitos, riesgos, criterios escondidos por el perfil o comentarios del equipo."
            className="items-end"
          >
            <Segmentado
              etiqueta="Qué muestran las celdas"
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

        <div className="relative mt-2" onMouseLeave={soltarEncima}>
          <svg
            key={area.id}
            viewBox={`0 0 ${W} ${H}`}
            className="mx-auto block h-auto max-h-[calc(100vh-11rem)] w-full"
            role="img"
            aria-label={`Rueda de las ${n} dimensiones de ${area.nombre} por nivel`}
          >
            <style>{ESTILOS}</style>
            <defs>
              <radialGradient id={`${uid}-halo`}>
                <stop offset="0%" style={{ stopColor: "var(--color-brand)", stopOpacity: 0.13 }} />
                <stop offset="100%" style={{ stopColor: "var(--color-brand)", stopOpacity: 0 }} />
              </radialGradient>
              <pattern id={`${uid}-rayado`} width={9} height={9} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width={9} height={9} style={{ fill: "var(--color-surface-muted)" }} />
                <line x1={0} y1={0} x2={0} y2={9} style={{ stroke: "var(--color-line)", strokeWidth: 4 }} />
              </pattern>
            </defs>

            {/* El halo de fondo */}
            <circle cx={CX} cy={CY} r={R_FUERA + 70} style={{ fill: `url(#${uid}-halo)` }} />

            {/* Las dos capas, bien a la vista: su nombre al costado de su mitad y una banda en el borde, con el
                orden en que se trabajan. Pasar el cursor por el nombre enciende sus dimensiones. */}
            {capas.map((c) => {
              const derecha = c.clave === "base";
              const x = derecha ? CX + R_BANDA + 26 : CX - R_BANDA - 26;
              const ancla = derecha ? "start" : "end";
              const nombre = partirEnLineas(c.nombre.toUpperCase(), 10);
              const descripcion = c.descripcion ? partirEnLineas(c.descripcion, 25) : [];
              const alto = nombre.length * 34 + descripcion.length * 21;
              const y0 = CY - alto / 2 + 24;
              const activa = focoCapa === c.clave;
              return (
                <g
                  key={c.clave}
                  onMouseEnter={() => ponerEncima({ tipo: "capa", clave: c.clave })}
                  onMouseLeave={soltarEncima}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <rect x={derecha ? x - 8 : x - 232} y={y0 - 32} width={240} height={alto + 22} style={{ fill: "transparent" }} />
                  {nombre.map((linea, j) => (
                    <text
                      key={linea}
                      x={x}
                      y={y0 + j * 34}
                      style={{
                        fill: activa ? "var(--color-brand)" : "var(--color-fg)",
                        fontSize: 30,
                        fontWeight: 800,
                        letterSpacing: "0.02em",
                        textAnchor: ancla,
                        transition: "fill 160ms",
                      }}
                    >
                      {linea}
                    </text>
                  ))}
                  {descripcion.map((linea, j) => (
                    <text key={linea} x={x} y={y0 + nombre.length * 34 - 6 + j * 21} style={{ fill: "var(--color-fg-muted)", fontSize: 16, textAnchor: ancla }}>
                      {linea}
                    </text>
                  ))}
                </g>
              );
            })}
            {capas.map((c) => {
              const [g0, g1] = MITAD[c.clave];
              const filas = ordenes.get(c.clave) ?? [];
              const orden = filas.length === 1 ? filas[0] : null;
              const activa = focoCapa === c.clave;
              return (
                <g key={c.clave}>
                  <path
                    d={arco(R_BANDA, g0 + 1, g1 - 1)}
                    style={{
                      fill: "none",
                      stroke: activa ? "var(--color-brand)" : "var(--color-fg-muted)",
                      strokeOpacity: activa ? 0.85 : 0.3,
                      strokeWidth: 10,
                      strokeLinecap: "round",
                      pointerEvents: "none",
                      transition: "stroke 160ms, stroke-opacity 160ms",
                    }}
                  />
                  {orden &&
                    dims
                      .filter((d) => d.capa === c.clave)
                      .map((d) => {
                        const lugar = lugarEnElOrden(orden, d);
                        const [a0, a1] = angulos.get(d.id)!;
                        if (!lugar) return null;
                        const [x, y] = polar((a0 + a1) / 2, R_BANDA);
                        return (
                          <GrupoConTitulo
                            key={d.id}
                            titulo={`${lugar}.º en el orden de ${c.nombre.toLowerCase()}: ${orden.orden.join(" → ")}. ${orden.porQue}`}
                            transform={`translate(${f(x)} ${f(y)})`}
                            className="cursor-help"
                          >
                            <circle r={14} style={{ fill: "var(--color-surface)", stroke: "var(--color-fg-muted)", strokeWidth: 1.5 }} />
                            <text y={5} style={{ fill: "var(--color-fg)", fontSize: 14, fontWeight: 700, textAnchor: "middle" }}>
                              {lugar}
                            </text>
                          </GrupoConTitulo>
                        );
                      })}
                </g>
              );
            })}

            {/* Las celdas: una por dimensión y nivel */}
            <g
              ref={grupoRef}
              tabIndex={0}
              role="group"
              aria-label="Celdas de la rueda. Flechas para moverte, Enter para comentar, Escape para cerrar."
              onKeyDown={alTeclado}
              onFocus={() => setConFoco(true)}
              onBlur={() => setConFoco(false)}
              className="outline-none"
            >
              {dims.map((d, i) => {
                const [g0, g1] = angulos.get(d.id)!;
                const medio = (g0 + g1) / 2;
                const aplicaD = dimensionAplica(d, perfil);
                return d.niveles.map((nv, k) => {
                  const [r0, r1] = anillo(k);
                  const v = valores.get(nv.id)!;
                  const esta = { tipo: "celda" as const, dim: d.id, letra: nv.letra };
                  const elegido = mismaSeleccion(esta, seleccion);
                  const enfocado = conFoco && activa.dim === d.id && activa.letra === nv.letra;
                  const levantado = elegido || (encima?.tipo === "celda" && encima.dim === d.id && encima.letra === nv.letra);
                  const [tx, ty] = polar(medio, (r0 + r1) / 2);
                  const px = levantado ? 7 * Math.sin(aRadianes(medio)) : 0;
                  const py = levantado ? -7 * Math.cos(aRadianes(medio)) : 0;
                  const rayada = !aplicaD && capa !== "perfil";
                  return (
                    <g
                      key={nv.id}
                      className="cursor-pointer"
                      style={{ opacity: opacidadDe(d, k), transition: "opacity 180ms ease" }}
                      onMouseEnter={() => ponerEncima(esta)}
                      onMouseLeave={soltarEncima}
                      onClick={() => {
                        alternar(esta);
                        grupoRef.current?.focus({ preventScroll: true });
                      }}
                    >
                      {/* Lo que se ve: se levanta hacia afuera. No recibe el cursor. */}
                      <g style={{ transform: `translate(${f(px)}px, ${f(py)}px)`, transition: "transform 180ms ease", pointerEvents: "none" }}>
                        <path
                          className="escala-rueda-celda"
                          d={sectorDeAnillo(r0, r1, g0, g1)}
                          style={{
                            animationDelay: `${k * 90 + i * 25}ms`,
                            fill: rayada ? `url(#${uid}-rayado)` : v.valor === 0 ? "var(--color-surface-muted)" : colorDe(nv.letra, v),
                            fillOpacity: rayada || v.valor === 0 ? 1 : 0.16 + 0.64 * (v.valor / maximo),
                            stroke: elegido ? "var(--color-fg)" : enfocado ? "var(--color-brand)" : v.valor === 0 || rayada ? "var(--color-line)" : "none",
                            strokeWidth: elegido ? 3 : enfocado ? 2.5 : 1,
                            strokeDasharray: enfocado && !elegido ? "5 4" : undefined,
                            transition: "fill 240ms ease, fill-opacity 240ms ease",
                          }}
                        />
                        {v.valor > 0 && !rayada && (
                          <text
                            x={f(tx)}
                            y={f(ty + 6)}
                            style={{
                              fill: "var(--color-fg)",
                              fontSize: 17,
                              fontWeight: 700,
                              textAnchor: "middle",
                              stroke: "var(--color-surface)",
                              strokeWidth: 3.5,
                              paintOrder: "stroke",
                              strokeLinejoin: "round",
                            }}
                          >
                            {v.valor}
                          </text>
                        )}
                      </g>
                      {/* Dónde se apunta: quieta y sin aire entre celdas. Si se levantara con la celda, el cursor
                          en el borde la haría entrar y salir sin parar (temblaba). */}
                      <path
                        d={sectorDeAnillo(r0 - AIRE_RADIAL / 2, r1 + AIRE_RADIAL / 2, g0 - AIRE_ANGULAR / 2, g1 + AIRE_ANGULAR / 2)}
                        style={{ fill: "transparent", pointerEvents: "all" }}
                      />
                    </g>
                  );
                });
              })}
            </g>

            {/* La base: el borde de adentro de Funcional */}
            <circle cx={CX} cy={CY} r={R_BASE} style={{ fill: "none", stroke: "var(--color-success)", strokeWidth: 2.5, strokeDasharray: "8 7", pointerEvents: "none" }} />
            <text
              x={CX}
              y={CY + R_BASE + 21}
              style={{
                fill: "var(--color-success)",
                fontSize: 14,
                fontWeight: 700,
                textAnchor: "middle",
                stroke: "var(--color-surface)",
                strokeWidth: 4,
                paintOrder: "stroke",
                pointerEvents: "none",
              }}
            >
              la base
            </text>

            {/* El contorno de lo que está en foco: una dimensión entera o un nivel (latiendo al recorrer) */}
            {focoDim && foco?.tipo === "dimension" && (
              <path
                d={sectorDeAnillo(R_DENTRO, R_FUERA, ...(angulos.get(focoDim.id) ?? [0, 0]))}
                style={{ fill: "none", stroke: "var(--color-fg)", strokeWidth: 2.2, pointerEvents: "none" }}
              />
            )}
            {focoNivel &&
              foco?.tipo === "nivel" &&
              Object.values(MITAD).map(([g0, g1], j) => {
                const [r0, r1] = anillo(LETRAS.indexOf(focoNivel));
                return (
                  <path
                    key={j}
                    className={recorriendo ? "escala-rueda-pulso" : undefined}
                    d={sectorDeAnillo(r0 - 1, r1 + 1, g0, g1)}
                    style={{ fill: "none", stroke: "var(--color-fg)", strokeWidth: 2.2, pointerEvents: "none" }}
                  />
                );
              })}

            {/* Los nombres de los niveles, en el hueco de arriba: tocarlos enciende la escala hasta ahí */}
            {niveles.map((nv, k) => {
              const [r0, r1] = anillo(k);
              const y = CY - (r0 + r1) / 2 + 5;
              const activo = focoNivel === nv.letra;
              return (
                <g
                  key={nv.letra}
                  role="button"
                  tabIndex={-1}
                  aria-label={`Ver ${area.nombre} en ${nv.nombre}`}
                  className="cursor-pointer outline-none"
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => ponerEncima({ tipo: "nivel", letra: nv.letra })}
                  onMouseLeave={soltarEncima}
                  onClick={() => alternar({ tipo: "nivel", letra: nv.letra })}
                >
                  <rect x={CX - 44} y={y - 20} width={88} height={28} style={{ fill: "transparent" }} />
                  <text
                    x={CX}
                    y={y}
                    style={{
                      fill: activo ? "var(--color-fg)" : "var(--color-fg-muted)",
                      fontSize: 14,
                      fontWeight: activo ? 700 : 600,
                      textAnchor: "middle",
                      stroke: "var(--color-surface)",
                      strokeWidth: 4,
                      paintOrder: "stroke",
                      strokeLinejoin: "round",
                      transition: "fill 160ms",
                    }}
                  >
                    {nv.nombre}
                  </text>
                  {activo && <rect x={CX - 14} y={y + 5} width={28} height={3} rx={1.5} style={{ fill: COLOR_DE_NIVEL[nv.letra] }} />}
                </g>
              );
            })}

            {/* Los nombres de las dimensiones, afuera: tocarlos abre la dimensión */}
            {dims.map((d) => {
              const [g0, g1] = angulos.get(d.id)!;
              const medio = (g0 + g1) / 2;
              const [x, y] = polar(medio, R_ETIQUETA);
              const s = Math.sin(aRadianes(medio));
              const c = Math.cos(aRadianes(medio));
              const ancla = s > 0.15 ? "start" : s < -0.15 ? "end" : "middle";
              // Arriba el bloque crece hacia arriba; abajo, hacia abajo; a los costados, centrado.
              const y0 = c > 0.35 ? y - 24 : c < -0.35 ? y + 10 : y - 8;
              const aplicaD = dimensionAplica(d, perfil);
              const activo = focoDim?.id === d.id;
              const comentarios = conteoDeDimension(conteos, d.id).total;
              return (
                <g
                  key={d.id}
                  role="button"
                  tabIndex={-1}
                  aria-label={`Abrir ${d.id} ${d.nombre}`}
                  className="cursor-pointer outline-none"
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => ponerEncima({ tipo: "dimension", dim: d.id })}
                  onMouseLeave={soltarEncima}
                  onClick={() => alternar({ tipo: "dimension", dim: d.id })}
                >
                  <text x={f(x)} y={f(y0)} style={{ textAnchor: ancla, fontSize: 14, fill: "var(--color-fg-muted)", fontFamily: "var(--font-geist-mono), monospace" }}>
                    {d.id}
                    {comentarios > 0 ? ` · ${cuantos(comentarios, "comentario", "comentarios")}` : ""}
                  </text>
                  <text
                    x={f(x)}
                    y={f(y0 + 22)}
                    style={{
                      textAnchor: ancla,
                      fontSize: 18,
                      fontWeight: activo ? 700 : 600,
                      fill: activo ? "var(--color-brand)" : aplicaD ? "var(--color-fg)" : "var(--color-fg-muted)",
                      transition: "fill 160ms",
                    }}
                  >
                    {d.nombre}
                  </text>
                  {!aplicaD && (
                    <text x={f(x)} y={f(y0 + 42)} style={{ textAnchor: ancla, fontSize: 13, fill: "var(--color-fg-muted)" }}>
                      no aplica a este perfil
                    </text>
                  )}
                </g>
              );
            })}

            {/* El centro */}
            <circle
              cx={CX}
              cy={CY}
              r={R_CENTRO}
              style={{ fill: "var(--color-surface)", stroke: "var(--color-line)", strokeWidth: 1.5, filter: "drop-shadow(0 6px 18px rgb(0 0 0 / 0.10))" }}
            />
            <foreignObject x={CX - 88} y={CY - 88} width={176} height={176}>
              <div className="flex h-full w-full flex-col items-center justify-center text-center">{centro}</div>
            </foreignObject>
          </svg>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-2xs text-fg-muted">
          {capa === "comentarios" ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm bg-brand" aria-hidden /> con comentarios abiertos
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm bg-fg-muted" aria-hidden /> solo cerrados
              </span>
            </>
          ) : capa === "criterios" ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-flex gap-0.5" aria-hidden>
                {LETRAS.map((l) => (
                  <span key={l} className={cn("h-3 w-3 rounded-sm", PUNTO_DE_NIVEL[l])} />
                ))}
              </span>
              el color es el nivel; más intenso, más criterios
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm" style={{ background: MUESTRA_DE_CAPA[capa].color }} aria-hidden /> {MUESTRA_DE_CAPA[capa].texto}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm border border-line bg-surface-muted" aria-hidden /> vacía
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-5 border-t-2 border-dashed border-success" aria-hidden /> la base: Funcional
          </span>
          {hayOrden && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-fg-muted text-[9px] font-bold text-fg" aria-hidden>
                1
              </span>
              qué se trabaja primero en cada capa
            </span>
          )}
          {ordenSegunElCierre && <span>El orden de la base depende de cómo se cierra la venta: elige un perfil para verlo.</span>}
          {algunaNoAplica && (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-3 w-3 rounded-sm border border-line"
                style={{ background: "repeating-linear-gradient(45deg, var(--color-line) 0 2px, var(--color-surface-muted) 2px 5px)" }}
                aria-hidden
              />
              no aplica a este perfil
            </span>
          )}
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
        onSeleccion={elegir}
        onCerrar={() => elegir(null)}
        onLeerDimension={onLeerDimension}
        onVerEnLaMatriz={onVerEnLaMatriz}
      />
    </div>
  );
}

// ── El panel del costado: lo elegido en la rueda ──────────────────────────────

/** La X del panel: suelta lo elegido (lo mismo que tocarlo de nuevo en la rueda, o Escape). */
function BotonCerrar({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Cerrar"
      title="Cerrar (también: tocarlo de nuevo en la rueda, o Escape)"
      className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}

function DetalleDelMapa({
  datos,
  perfil,
  seleccion,
  onSeleccion,
  onCerrar,
  onLeerDimension,
  onVerEnLaMatriz,
}: {
  datos: DatosDeLaVista;
  perfil: Perfil;
  seleccion: SeleccionDelMapa;
  onSeleccion: (s: SeleccionDelMapa) => void;
  onCerrar: () => void;
  onLeerDimension: (dim: string) => void;
  onVerEnLaMatriz: () => void;
}) {
  const { conteos, abrirComentarios } = useEscala();
  const { area, niveles } = datos;
  const dims = area.dimensiones;
  const nombreNivel = (l: Letra) => niveles.find((x) => x.letra === l)!.nombre;
  const caja = "relative self-start rounded-2xl border border-line bg-surface p-5 xl:sticky xl:top-4";

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
          <li>Toca una celda para ver sus criterios; tócala otra vez (o la X) para cerrarla.</li>
          <li>Toca el nombre de una dimensión para verla entera.</li>
          <li>Toca el nombre de un nivel (arriba, en la rueda) para ver el área en ese nivel.</li>
          <li>«Recorrer», en el centro, sube la escala de Deficiente a Óptimo, un nivel a la vez.</li>
          <li>Con el teclado: flechas para moverte, Enter para comentar, Escape para volver.</li>
        </ul>
      </aside>
    );
  }

  if (seleccion.tipo === "nivel") {
    const k = LETRAS.indexOf(seleccion.letra);
    return (
      <aside aria-label="Detalle del nivel" className={caja}>
        <BotonCerrar onClick={onCerrar} />
        <p className="pr-8 text-2xs font-bold uppercase tracking-wide text-fg-muted">Así se ve {area.nombre} en</p>
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
        <BotonCerrar onClick={onCerrar} />
        <p className="pr-8 text-2xs text-fg-muted">
          <span className="font-mono">{d.id}</span>
          {d.generica && d.generica.nombre !== d.nombre ? ` · ${d.generica.nombre}` : ""}
        </p>
        <h3 className="mt-0.5 text-lg font-bold text-fg">{d.nombre}</h3>
        <NombreGeneral nombre={d.nombreGeneral} />
        <p className="mt-2 text-sm leading-snug text-fg">{d.pregunta}</p>
        {d.descripcion && (
          <p className="mt-2 text-xs leading-relaxed text-fg-secondary">
            <TextoConPalabras texto={d.descripcion} palabras={datos.terminos} />
          </p>
        )}
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
  return (
    <DetalleDeCelda
      datos={datos}
      perfil={perfil}
      d={d}
      nv={nv}
      onCerrar={onCerrar}
      onLeerDimension={onLeerDimension}
      onVerEnLaMatriz={onVerEnLaMatriz}
      caja={caja}
    />
  );
}

function DetalleDeCelda({
  datos,
  perfil,
  d,
  nv,
  onCerrar,
  onLeerDimension,
  onVerEnLaMatriz,
  caja,
}: {
  datos: DatosDeLaVista;
  perfil: Perfil;
  d: Dimension;
  nv: Nivel;
  onCerrar: () => void;
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
      <BotonCerrar onClick={onCerrar} />
      <p className="pr-8 text-2xs text-fg-muted">
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
                  <TextoConPalabras texto={c.texto} palabras={datos.terminos} />
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
      <NoAplicanEnLaEdicion nivel={nv} className="mt-2 block text-xs" />
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
