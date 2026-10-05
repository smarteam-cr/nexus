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
 *   · Qué muestran las celdas: criterios (al entrar), hábitos, riesgos, los que otros requieren,
 *     los que esconde el perfil o los comentarios del equipo. Cuanto más hay, más intenso el color.
 *   · Con una celda en foco, un borde marca las celdas de las que sus criterios requieren algo y
 *     las que requieren algo de ella: de dónde se sostiene cada cosa.
 *   · Pasar el cursor por una celda la levanta, apaga lo que no es su dimensión ni su nivel y lo
 *     cuenta en el centro (nada tapa la rueda); tocarla la abre al costado, con sus criterios, y
 *     tocarla de nuevo (o la X del panel) la cierra. Lo que se levanta es solo el dibujo: dónde se
 *     apunta queda quieto, para que el cursor en un borde no la haga temblar.
 *   · Pasar el cursor por el nombre de una capa (base operativa, producción) enciende sus dimensiones.
 *   · Tocar una dimensión la abre entera; tocar un nivel enciende los anillos de adentro hasta él:
 *     la escala se sube de a un nivel.
 *   · «Recorrer», arriba de la rueda, sube la escala de Deficiente a Óptimo, un nivel a la vez. Es el
 *     único botón azul de la pantalla (sistema «Nexus · interfaz interna», 2026-10-03).
 *   · Con el teclado: ←/→ cambian de dimensión, ↑/↓ de nivel, Enter abre los comentarios, Escape
 *     vuelve al área.
 *   · Con herramientas prendidas (el filtro de arriba), cada celda lleva el isotipo de las que ayudan
 *     ahí, en vez de su número, y las celdas donde no ayuda ninguna se aclaran. ⛔ La marca va
 *     encima: el color de la celda sigue siendo el de su nivel.
 *
 * La rueda va sobre blanco, sin halo ni sombra: el sistema separa con bordes, no con brillos.
 */
import { createElement, useEffect, useId, useMemo, useRef, useState, type SVGProps } from "react";
import { Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import { aplica, describirPerfil, dimensionAplica, type Perfil } from "@/lib/escala/documento/perfil";
import { LETRAS, type ClaveDeCapa, type Dimension, type Letra, type Nivel } from "@/lib/escala/documento/tipos";
import type { Herramienta } from "@/lib/escala/herramientas/tipos";
import { lugarEnElOrden, ordenDeDependencias, type DatosDeLaVista } from "@/lib/escala/vista";
import { conteoDe, conteoDeCelda, conteoDeDimension, useEscala } from "./contexto";
import { COLOR_DE_HERRAMIENTA, HerramientasDelCriterio, MarcaDeHerramienta, useHerramientas } from "./herramientas";
import { Isotipo, tieneIsotipo } from "./isotipos";
import { COLOR_DE_NIVEL, PUNTO_DE_NIVEL } from "./niveles";
import { EVENTO_DEL_RECORRIDO, type AccionDelRecorrido } from "@/lib/recorridos/tipos";
import {
  BLOQUE_DE_RESULTADO,
  BOTON_CLARO,
  BotonComentar,
  Contador,
  EnlacesDelCriterio,
  enlacesDe,
  GrupoDeControl,
  MetaDelCriterio,
  NoAplicanEnLaEdicion,
  NombreGeneral,
  ROTULO,
  TextoConPalabras,
} from "./piezas";

type CapaDeDatos = "comentarios" | "criterios" | "habitos" | "riesgos" | "requeridos" | "perfil";

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
    clave: "requeridos",
    etiqueta: "Requeridos",
    title: "Cuántos criterios de cada celda son requeridos por otros: dónde están los cimientos de la escala. Lo que otro criterio necesita conviene tenerlo antes.",
  },
  {
    clave: "perfil",
    etiqueta: "Escondidos por el perfil",
    title: "Cuántos criterios de cada celda NO aplican al perfil de negocio elegido y quedan escondidos. Sirve para ver dónde cambia la escala según cómo vende la empresa.",
  },
  {
    clave: "comentarios",
    etiqueta: "Comentarios del equipo",
    title: "Cuántos comentarios dejó el equipo en cada celda: lo que no se entiende, lo que no calza con un cliente y las propuestas. Con el color de su nivel si alguno sigue abierto; en gris si ya se cerraron todos.",
  },
];

/**
 * Qué cuenta la intensidad del color en cada capa. El color es SIEMPRE el del nivel: si una capa
 * pintara con su propio color (el naranja de los riesgos es el de Inicial), una celda de Funcional
 * parecería de otro nivel.
 */
const QUE_CUENTA: Record<CapaDeDatos, string> = {
  criterios: "criterios",
  habitos: "hábitos",
  riesgos: "criterios de riesgo",
  requeridos: "criterios que otros requieren",
  perfil: "criterios escondidos por el perfil",
  comentarios: "comentarios",
};

/**
 * Cómo se ve cada celda según lo que está en foco. Tres alturas, para que lo elegido se note:
 * lo elegido y lo que se relaciona con ello, enteros; su dimensión y su nivel, a media luz (para
 * ubicarse); lo demás, más claro. Apagar es aclarar conservando el color del nivel (un tinte
 * blanco): en gris la rueda se sentía apagada de más (pedido del responsable de la escala).
 */
type Luz = "entera" | "media" | "apagada";
const OPACIDAD: Record<Luz, number> = { entera: 1, media: 0.6, apagada: 0.3 };

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
  <svg viewBox="0 0 24 24" width={14} height={14} fill="currentColor" aria-hidden>
    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
  </svg>
);

const IconoPausa = () => (
  <svg viewBox="0 0 24 24" width={14} height={14} fill="currentColor" aria-hidden>
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
  /** Para los `id` del SVG (el rayado): únicos aunque haya dos mapas. */
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

  // El recorrido guiado elige en la rueda (lib/recorridos/contenido/escala.ts). Elige algo explícito y
  // nunca alterna: repetirlo al volver con «Anterior» deja lo mismo elegido. «dimension» es la
  // primera dimensión del área; «dimension.F», esa dimensión en Funcional.
  useEffect(() => {
    const alPedido = (e: Event) => {
      const a = (e as CustomEvent<AccionDelRecorrido>).detail;
      if (a?.evento !== "escala.seleccionar") return;
      const primera = dims[0]?.id;
      if (!a.valor) onSeleccion(null);
      else if (a.valor === "dimension" && primera) onSeleccion({ tipo: "dimension", dim: primera });
      else if (a.valor === "dimension.F" && primera) onSeleccion({ tipo: "celda", dim: primera, letra: "F" });
      else if ((LETRAS as readonly string[]).includes(a.valor)) onSeleccion({ tipo: "nivel", letra: a.valor as Letra });
    };
    window.addEventListener(EVENTO_DEL_RECORRIDO, alPedido);
    return () => window.removeEventListener(EVENTO_DEL_RECORRIDO, alPedido);
  }, [dims, onSeleccion]);

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
        else if (capa === "requeridos") valor = visibles.filter((c) => enlacesDe(datos, c.id, perfil).loRequieren.length > 0).length;
        else valor = nv.criterios.length - visibles.length;
        out.set(nv.id, { valor, abiertos });
      }
    }
    return out;
  }, [dims, perfil, capa, conteos, datos]);

  const maximo = Math.max(1, ...[...valores.values()].map((v) => v.valor));
  const angulos = useMemo(() => porciones(dims), [dims]);

  /**
   * Con herramientas prendidas: las que ayudan en cada celda (en algún criterio que aplica al perfil)
   * y en cuántos criterios. Una celda sin ninguna se aclara.
   */
  const { hayFiltro, prendidas } = useHerramientas();
  const marcasPorCelda = useMemo(() => {
    const out = new Map<string, { herramienta: Herramienta; cuantos: number }[]>();
    if (!hayFiltro) return out;
    for (const d of dims) {
      for (const nv of d.niveles) {
        const visibles = nv.criterios.filter((c) => aplica(c, perfil));
        const marcas = prendidas
          .map((h) => ({ herramienta: h, cuantos: visibles.filter((c) => h.aportes[c.id] !== undefined).length }))
          .filter((m) => m.cuantos > 0);
        if (marcas.length) out.set(nv.id, marcas);
      }
    }
    return out;
  }, [dims, perfil, hayFiltro, prendidas]);

  /** «Qué se trabaja primero»: el orden de cada capa en esta área, con el cierre elegido. */
  const ordenes = useMemo(
    () => new Map(capas.map((c) => [c.clave, ordenDeDependencias(datos.dependencias, area.nombre, c.nombre, perfil.cierre)])),
    [capas, datos.dependencias, area.nombre, perfil.cierre],
  );
  const hayOrden = [...ordenes.values()].some((filas) => filas.length === 1);
  /** La base de Ventas cambia de orden según cómo se cierra la venta: sin perfil, no hay uno solo. */
  const ordenSegunElCierre = [...ordenes.values()].some((filas) => filas.length > 1);
  const algunaNoAplica = dims.some((d) => !dimensionAplica(d, perfil));

  /** El color es el del nivel; en los comentarios, gris si ya se cerraron todos. */
  const colorDe = (letra: Letra, v: { valor: number; abiertos: number }) =>
    capa === "comentarios" && !v.abiertos ? "var(--color-fg-muted)" : COLOR_DE_NIVEL[letra];

  const enPalabras = (v: { valor: number; abiertos: number }): string => {
    switch (capa) {
      case "criterios":
        return cuantos(v.valor, "criterio", "criterios");
      case "habitos":
        return cuantos(v.valor, "hábito", "hábitos");
      case "riesgos":
        return cuantos(v.valor, "criterio de riesgo", "criterios de riesgo");
      case "requeridos":
        return `${cuantos(v.valor, "criterio", "criterios")} que otros requieren`;
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
  /** Cuánta luz tiene cada celda con lo que está en foco (lo mismo bajo el cursor que elegido). */
  const luzDe = (d: Dimension, k: number): Luz => {
    if (!foco) return "entera";
    if (foco.tipo === "capa") return d.capa === foco.clave ? "entera" : "apagada";
    if (foco.tipo === "celda") {
      // La celda y las que se relacionan con ella por sus requeridos; su dimensión y su nivel, para ubicarse.
      const celda = `${d.id}.${LETRAS[k]}`;
      if (celda === `${foco.dim}.${foco.letra}` || relacionDelFoco.requeridas.has(celda) || relacionDelFoco.dependientes.has(celda)) return "entera";
      return foco.dim === d.id || LETRAS[k] === foco.letra ? "media" : "apagada";
    }
    if (foco.tipo === "dimension") return foco.dim === d.id ? "entera" : "apagada";
    // Un nivel: encendidos todos los anillos hasta él. La escala se sube de a uno.
    return k <= LETRAS.indexOf(foco.letra) ? "entera" : "apagada";
  };

  const focoDim = foco && (foco.tipo === "celda" || foco.tipo === "dimension") ? dims.find((x) => x.id === foco.dim) : undefined;
  const focoNivel = foco && (foco.tipo === "celda" || foco.tipo === "nivel") ? foco.letra : null;
  /** La capa en foco: la que se nombra o la de la dimensión en foco. */
  const focoCapa = foco?.tipo === "capa" ? foco.clave : (focoDim?.capa ?? null);

  /**
   * Los requeridos de la celda en foco, llevados a celdas: las que tienen algo que sus criterios
   * necesitan («requeridas») y las que tienen criterios que necesitan algo de ella («dependientes»).
   * Se marcan con un borde en la rueda: así se ve de dónde se sostiene cada cosa.
   */
  const relacionDelFoco = { requeridas: new Set<string>(), dependientes: new Set<string>() };
  if (foco?.tipo === "celda") {
    const celda = `${foco.dim}.${foco.letra}`;
    const nv = dims.find((x) => x.id === foco.dim)?.niveles.find((x) => x.letra === foco.letra);
    for (const c of nv?.criterios.filter((x) => aplica(x, perfil)) ?? []) {
      const { requiere, loRequieren } = enlacesDe(datos, c.id, perfil);
      for (const e of requiere) if (e.area === area.id) relacionDelFoco.requeridas.add(`${e.dimension}.${e.letra}`);
      for (const e of loRequieren) if (e.area === area.id) relacionDelFoco.dependientes.add(`${e.dimension}.${e.letra}`);
    }
    relacionDelFoco.requeridas.delete(celda);
    relacionDelFoco.dependientes.delete(celda);
  }
  /** Las dimensiones que tienen alguna celda relacionada con la celda en foco. */
  const dimsRelacionadas = new Set([...relacionDelFoco.requeridas, ...relacionDelFoco.dependientes].map((c) => c.slice(0, c.lastIndexOf("."))));
  /** El nombre de una dimensión se apaga si no tiene nada que ver con lo que está en foco. */
  const nombreApagado = (d: Dimension): boolean => {
    if (!foco) return false;
    if (foco.tipo === "capa") return d.capa !== foco.clave;
    if (foco.tipo === "dimension") return d.id !== foco.dim;
    if (foco.tipo === "celda") return d.id !== foco.dim && !dimsRelacionadas.has(d.id);
    return false;
  };

  /**
   * «Recorrer»: arriba de la rueda, no en su centro (el centro solo dice lo que se mira). Mientras
   * sube, se pausa; con un nivel elegido, sigue desde ahí; en Óptimo, vuelve a empezar.
   */
  const nivelElegido = seleccion?.tipo === "nivel" ? seleccion.letra : null;
  const botonRecorrer = recorriendo
    ? { etiqueta: "Pausar", alTocar: () => setRecorriendo(false), pausa: true }
    : nivelElegido && nivelElegido !== LETRAS[LETRAS.length - 1]
      ? { etiqueta: "Seguir subiendo", alTocar: recorrer, pausa: false }
      : nivelElegido
        ? { etiqueta: "Otra vez", alTocar: recorrer, pausa: false }
        : { etiqueta: `Recorrer de ${nombreNivel(LETRAS[0])} a ${nombreNivel(LETRAS[LETRAS.length - 1])}`, alTocar: recorrer, pausa: false };

  /** El centro de la rueda: lo que se mira, dicho corto. */
  const centro = (() => {
    if (!foco) {
      return (
        <>
          <p className="font-bold leading-none text-fg" style={{ fontSize: 30 }}>
            {area.nombre}
          </p>
          <p className="mt-1.5 text-fg-muted" style={{ fontSize: 15 }}>
            {n} dimensiones · {niveles.length} niveles
          </p>
        </>
      );
    }
    if (foco.tipo === "nivel") {
      const k = LETRAS.indexOf(foco.letra);
      const elegido = seleccion?.tipo === "nivel" && seleccion.letra === foco.letra;
      return (
        <>
          <p className="font-semibold uppercase tracking-[0.08em] text-fg-muted" style={{ fontSize: 13 }}>
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
          {!elegido && (
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
          <p className="font-semibold uppercase tracking-[0.08em] text-fg-muted" style={{ fontSize: 13 }}>
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
          <p className="tabular-nums text-fg-muted" style={{ fontSize: 15 }}>
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
        <p className="tabular-nums text-fg-muted" style={{ fontSize: 15 }}>
          {nv.id}
        </p>
        <p className="mt-0.5 flex items-center justify-center gap-1.5 font-bold text-fg" style={{ fontSize: 20 }}>
          <span className={cn("rounded-full", PUNTO_DE_NIVEL[nv.letra])} style={{ width: 10, height: 10 }} aria-hidden />
          {nombreNivel(nv.letra)}
        </p>
        <p className="mt-0.5 line-clamp-2 leading-tight text-fg-secondary" style={{ fontSize: 18 }}>
          {focoDim.nombre}
        </p>
        {hayFiltro && dimensionAplica(focoDim, perfil) ? (
          // Con herramientas prendidas: cuáles ayudan acá y en cuántos criterios.
          (marcasPorCelda.get(nv.id)?.length ?? 0) > 0 ? (
            <p className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 font-semibold text-fg-secondary" style={{ fontSize: 15 }}>
              {marcasPorCelda.get(nv.id)!.map((m) => (
                <span key={m.herramienta.clave} className="inline-flex items-center gap-1" title={m.herramienta.nombre}>
                  <MarcaDeHerramienta herramienta={m.herramienta} />
                  {m.cuantos}
                </span>
              ))}
            </p>
          ) : (
            <p className="mt-1 text-fg-muted" style={{ fontSize: 14 }}>
              ninguna ayuda acá
            </p>
          )
        ) : (
          <p className="mt-1 text-fg-muted" style={{ fontSize: 15 }}>
            {dimensionAplica(focoDim, perfil) || capa === "perfil" ? enPalabras(valores.get(nv.id)!) : "no aplica a este perfil"}
          </p>
        )}
      </>
    );
  })();

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section data-recorrido="escala.mapa" aria-label={`Mapa de ${area.nombre}`} className="flex min-w-0 flex-col gap-4 rounded-xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 max-w-[560px]">
            <h2 className="text-lg font-semibold leading-[26px] text-fg">Mapa de {area.nombre}</h2>
            <p className="mt-0.5 text-[13px] text-fg-muted">
              Cada porción es una dimensión y cada anillo un nivel, de {nombreNivel(LETRAS[0])} al centro a {nombreNivel(LETRAS[LETRAS.length - 1])} en el
              borde. Toca una celda para ver sus criterios.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div data-recorrido="escala.capas">
            <GrupoDeControl
              nombre="Qué muestran las celdas"
              ayuda={`Cada celda es una dimensión en un nivel (${dims[0].id}.F es ${dims[0].nombre} en ${nombreNivel("F")}). Su color se intensifica cuanto más hay ahí de lo que elijas. ${CAPAS.map((c) => c.title).join(" ")}${hayPerfil ? "" : " «Escondidos por el perfil» se elige después de elegir un perfil de negocio arriba."}`}
            >
              <Select
                aria-label="Qué muestran las celdas"
                value={capa}
                onChange={(e) => setCapa(e.target.value as CapaDeDatos)}
                className="w-auto min-w-[200px] bg-surface py-2 text-[13px] leading-tight text-fg"
              >
                {CAPAS.map((c) => (
                  <option key={c.clave} value={c.clave} title={c.title} disabled={c.clave === "perfil" && !hayPerfil}>
                    {c.etiqueta}
                  </option>
                ))}
              </Select>
            </GrupoDeControl>
            </div>
            <button data-recorrido="escala.recorrer"
              type="button"
              onClick={botonRecorrer.alTocar}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-[9px] text-sm font-semibold leading-tight text-primary-fg transition-colors hover:bg-primary-hover"
            >
              {botonRecorrer.pausa ? <IconoPausa /> : <IconoPlay />}
              {botonRecorrer.etiqueta}
            </button>
          </div>
        </div>

        <LeyendaDeLaRueda capa={capa} nombreNivel={nombreNivel} conOrden={hayOrden} conNoAplica={algunaNoAplica} herramientas={hayFiltro ? prendidas : []} />

        <div data-recorrido="escala.rueda" className="relative" onMouseLeave={soltarEncima}>
          <svg
            key={area.id}
            viewBox={`0 0 ${W} ${H}`}
            className="mx-auto block h-auto max-h-[calc(100vh-11rem)] w-full"
            role="img"
            aria-label={`Rueda de las ${n} dimensiones de ${area.nombre} por nivel`}
          >
            <style>{ESTILOS}</style>
            <defs>
              <pattern id={`${uid}-rayado`} width={9} height={9} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width={9} height={9} style={{ fill: "var(--color-surface-muted)" }} />
                <line x1={0} y1={0} x2={0} y2={9} style={{ stroke: "var(--color-line)", strokeWidth: 4 }} />
              </pattern>
            </defs>

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
                        fill: focoCapa && !activa ? "var(--color-fg-muted)" : "var(--color-fg)",
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
                      stroke: activa ? "var(--color-fg)" : "var(--color-fg-muted)",
                      strokeOpacity: activa ? 0.55 : 0.25,
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
                  // El «acá estás» del teclado: solo mientras se recorre por celdas (con una dimensión o un
                  // nivel elegidos, un borde en otra celda confundiría).
                  const enfocado = conFoco && (!seleccion || seleccion.tipo === "celda") && activa.dim === d.id && activa.letra === nv.letra;
                  const levantado = elegido || (encima?.tipo === "celda" && encima.dim === d.id && encima.letra === nv.letra);
                  const [tx, ty] = polar(medio, (r0 + r1) / 2);
                  const px = levantado ? 7 * Math.sin(aRadianes(medio)) : 0;
                  const py = levantado ? -7 * Math.cos(aRadianes(medio)) : 0;
                  const rayada = !aplicaD && capa !== "perfil";
                  // Relacionada con la celda en foco por sus requeridos: se marca con un borde.
                  const requerida = relacionDelFoco.requeridas.has(nv.id);
                  const dependiente = relacionDelFoco.dependientes.has(nv.id);
                  // Las herramientas prendidas que ayudan acá. Si hay filtro y no ayuda ninguna, la celda
                  // se aclara (salvo la elegida, que se sigue leyendo entera).
                  const marcas = rayada ? [] : (marcasPorCelda.get(nv.id) ?? []);
                  const luz: Luz = hayFiltro && marcas.length === 0 && !elegido ? "apagada" : luzDe(d, k);
                  return (
                    <g
                      key={nv.id}
                      className="cursor-pointer"
                      data-luz={luz}
                      style={{
                        opacity: OPACIDAD[luz],
                        transition: "opacity 180ms ease",
                      }}
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
                            // Desde un piso visible: una celda con pocos criterios no parece apagada.
                            fillOpacity: rayada || v.valor === 0 ? 1 : 0.3 + 0.6 * (v.valor / maximo),
                            // Los bordes son de un color neutro: el azul y el verde ya son niveles.
                            stroke: elegido
                              ? "var(--color-fg)"
                              : enfocado
                                ? "var(--color-brand)"
                                : requerida || dependiente
                                  ? "var(--color-fg)"
                                  : v.valor === 0 || rayada
                                    ? "var(--color-line)"
                                    : "none",
                            strokeWidth: elegido ? 3.5 : requerida || dependiente ? 3 : enfocado ? 2.5 : 1,
                            // Rayas: la elegida necesita algo de aquí. Puntos: esta necesita algo de la elegida.
                            strokeDasharray: elegido ? undefined : enfocado ? "5 4" : requerida ? "10 6" : dependiente ? "0.1 7" : undefined,
                            strokeLinecap: dependiente && !elegido ? "round" : undefined,
                            transition: "fill 240ms ease, fill-opacity 240ms ease",
                          }}
                        />
                        {/* Con herramientas prendidas, la marca de cada una en vez del número, en fila sobre
                            el arco de la celda: su isotipo en un círculo claro (o, si no tiene, un punto de
                            su color con su sigla). */}
                        {marcas.map((m, j) => {
                          const radio = (r0 + r1) / 2;
                          const paso = (33 / radio) * (180 / Math.PI);
                          const [mx, my] = polar(medio + (j - (marcas.length - 1) / 2) * paso, radio);
                          const h = m.herramienta;
                          return (
                            <g key={h.clave} transform={`translate(${f(mx)} ${f(my)})`}>
                              {tieneIsotipo(h.clave) ? (
                                <>
                                  <circle r={15} style={{ fill: "var(--color-surface)", stroke: "var(--color-line)", strokeWidth: 1.5 }} />
                                  <Isotipo clave={h.clave} x={-10} y={-10} width={20} height={20} />
                                </>
                              ) : (
                                <>
                                  <circle r={14} style={{ fill: COLOR_DE_HERRAMIENTA[h.color], stroke: "var(--color-surface)", strokeWidth: 2.5 }} />
                                  <text y={5.5} style={{ fill: "var(--color-herramienta-fg)", fontSize: 16, fontWeight: 800, textAnchor: "middle" }}>
                                    {h.sigla}
                                  </text>
                                </>
                              )}
                            </g>
                          );
                        })}
                        {v.valor > 0 && !rayada && !hayFiltro && (
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
            <circle cx={CX} cy={CY} r={R_BASE} style={{ fill: "none", stroke: "var(--color-nivel-funcional)", strokeWidth: 2.5, strokeDasharray: "8 7", pointerEvents: "none" }} />
            <text
              x={CX}
              y={CY + R_BASE + 21}
              style={{
                fill: "var(--color-nivel-funcional)",
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
                <g data-recorrido={nv.letra === "F" ? "escala.nivel" : undefined}
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
              // A los costados hay poco ancho: un nombre largo (los de una edición suelen serlo) va en dos
              // líneas, para que no se salga del dibujo.
              const nombre = Math.abs(s) > 0.8 ? partirEnLineas(d.nombre, 27) : [d.nombre];
              const extra = (nombre.length - 1) * 21;
              // Arriba el bloque crece hacia arriba; abajo, hacia abajo; a los costados, centrado.
              const y0 = c > 0.35 ? y - 24 - extra : c < -0.35 ? y + 10 : y - 8 - extra / 2;
              const aplicaD = dimensionAplica(d, perfil);
              const activo = focoDim?.id === d.id;
              const comentarios = conteoDeDimension(conteos, d.id).total;
              return (
                <g data-recorrido={d.id === dims[0]?.id ? "escala.dimension" : undefined}
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
                  <text x={f(x)} y={f(y0)} style={{ textAnchor: ancla, fontSize: 14, fill: "var(--color-fg-muted)", fontVariantNumeric: "tabular-nums" }}>
                    {d.id}
                    {comentarios > 0 ? ` · ${cuantos(comentarios, "comentario", "comentarios")}` : ""}
                  </text>
                  {nombre.map((linea, j) => (
                    <text
                      key={linea}
                      x={f(x)}
                      y={f(y0 + 22 + j * 21)}
                      style={{
                        textAnchor: ancla,
                        fontSize: 18,
                        fontWeight: activo ? 700 : 600,
                        fill: activo ? "var(--color-fg)" : aplicaD && !nombreApagado(d) ? "var(--color-fg)" : "var(--color-fg-muted)",
                        opacity: nombreApagado(d) ? 0.55 : 1,
                        transition: "fill 160ms, opacity 160ms",
                      }}
                    >
                      {linea}
                    </text>
                  ))}
                  {!aplicaD && (
                    <text x={f(x)} y={f(y0 + 42 + extra)} style={{ textAnchor: ancla, fontSize: 13, fill: "var(--color-fg-muted)" }}>
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
              style={{ fill: "var(--color-surface)", stroke: "var(--color-line)", strokeWidth: 1.5 }}
            />
            <foreignObject x={CX - 88} y={CY - 88} width={176} height={176}>
              <div className="flex h-full w-full flex-col items-center justify-center text-center">{centro}</div>
            </foreignObject>
          </svg>
        </div>

        {(ordenSegunElCierre || hayPerfil) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-fg-muted">
            {ordenSegunElCierre && <span>El orden de la base depende de cómo se cierra la venta: elige un perfil para verlo.</span>}
            {hayPerfil && <span>Perfil: {describirPerfil(perfil)}</span>}
          </div>
        )}
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

// ── La leyenda: qué es cada color, cada borde y cada guía de la rueda ─────────

/** Una muestra de borde, dibujada igual que en la rueda. */
function MuestraDeBorde({ patron }: { patron: "entero" | "rayas" | "puntos" }) {
  return (
    <svg width={22} height={14} viewBox="0 0 22 14" className="flex-shrink-0" aria-hidden>
      <rect
        x={2}
        y={2}
        width={18}
        height={10}
        rx={1.5}
        style={{
          fill: "var(--color-surface-muted)",
          stroke: "var(--color-fg)",
          strokeWidth: patron === "entero" ? 2.5 : 2,
          strokeDasharray: patron === "rayas" ? "5 3" : patron === "puntos" ? "0.1 3.6" : undefined,
          strokeLinecap: patron === "puntos" ? "round" : undefined,
        }}
      />
    </svg>
  );
}

function ItemDeLeyenda({ muestra, children }: { muestra: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <span className="flex w-6 flex-shrink-0 justify-center">{muestra}</span>
      <span>{children}</span>
    </li>
  );
}

/**
 * Siempre a la vista, arriba de la rueda: quien la abre por primera vez no tiene que adivinar qué
 * dice cada color. Tres grupos: el color de las celdas, lo que pasa al tocar una, y las guías fijas.
 */
function LeyendaDeLaRueda({
  capa,
  nombreNivel,
  conOrden,
  conNoAplica,
  herramientas,
}: {
  capa: CapaDeDatos;
  nombreNivel: (l: Letra) => string;
  conOrden: boolean;
  conNoAplica: boolean;
  /** Las herramientas prendidas en el filtro (vacío: no hay filtro). */
  herramientas: Herramienta[];
}) {
  const titulo = cn("mb-1.5", ROTULO);
  const conHerramientas = herramientas.length > 0;
  return (
    // Abierta de entrada; quien ya la conoce la cierra (y vuelve a abrirse al recargar: es ayuda, no un ajuste).
    <details open className="group rounded-xl border border-line text-xs text-fg-secondary">
      <summary className={cn("flex cursor-pointer list-none items-center gap-1.5 px-4 py-2.5 hover:text-fg [&::-webkit-details-marker]:hidden", ROTULO)}>
        <svg className="h-3 w-3 transition-transform group-open:rotate-90" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
          <path d="M4 2.5 8 6l-4 3.5z" />
        </svg>
        Cómo leer la rueda
      </summary>
      <div className={cn("grid gap-x-6 gap-y-3 border-t border-line px-4 py-3", conHerramientas ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3")}>
        {conHerramientas && (
          <div>
            <p className={titulo}>Herramientas</p>
            <ul className="space-y-1">
              {herramientas.map((h) => (
                <ItemDeLeyenda key={h.clave} muestra={<MarcaDeHerramienta herramienta={h} />}>
                  {h.nombre} ayuda en esa celda
                </ItemDeLeyenda>
              ))}
              <ItemDeLeyenda
                muestra={
                  <span className="flex gap-0.5" aria-hidden>
                    <span className={cn("h-3.5 w-2.5 rounded-sm opacity-30", PUNTO_DE_NIVEL.F)} />
                  </span>
                }
              >
                Más clara: no ayuda ninguna de las elegidas
              </ItemDeLeyenda>
            </ul>
          </div>
        )}
        <div>
          <p className={titulo}>El color es el nivel</p>
          <ul className="space-y-1">
            <li className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              {LETRAS.map((l) => (
                <span key={l} className="inline-flex items-center gap-1.5">
                  <span className={cn("h-2 w-2 rounded-full", PUNTO_DE_NIVEL[l])} aria-hidden />
                  {nombreNivel(l)}
                </span>
              ))}
            </li>
            <ItemDeLeyenda
              muestra={
                <span className="flex gap-0.5" aria-hidden>
                  {[0.3, 0.6, 0.9].map((o) => (
                    <span key={o} className={cn("h-3.5 w-1.5 rounded-sm", PUNTO_DE_NIVEL.F)} style={{ opacity: o }} />
                  ))}
                </span>
              }
            >
              Más intenso, más {QUE_CUENTA[capa]}
              {conHerramientas ? "" : "; el número dice cuántos"}
            </ItemDeLeyenda>
            {capa === "comentarios" && (
              <ItemDeLeyenda muestra={<span className="h-3.5 w-3.5 rounded-sm bg-fg-muted" aria-hidden />}>Gris: sus comentarios ya se cerraron</ItemDeLeyenda>
            )}
          </ul>
        </div>
        <div>
          <p className={titulo}>En la rueda</p>
          <ul className="space-y-1">
            <ItemDeLeyenda muestra={<span className="h-3.5 w-3.5 rounded-sm border border-line bg-surface-muted" aria-hidden />}>Vacía: no hay ninguno</ItemDeLeyenda>
            {conNoAplica && (
              <ItemDeLeyenda
                muestra={
                  <span
                    className="h-3.5 w-3.5 rounded-sm border border-line"
                    style={{ background: "repeating-linear-gradient(45deg, var(--color-line) 0 2px, var(--color-surface-muted) 2px 5px)" }}
                    aria-hidden
                  />
                }
              >
                Rayada: no aplica al perfil elegido
              </ItemDeLeyenda>
            )}
            <ItemDeLeyenda
              muestra={
                <svg width={22} height={8} viewBox="0 0 22 8" aria-hidden>
                  <line x1={1} y1={4} x2={21} y2={4} style={{ stroke: "var(--color-nivel-funcional)", strokeWidth: 2, strokeDasharray: "4 3" }} />
                </svg>
              }
            >
              Círculo verde: la base, el nivel {nombreNivel("F")}
            </ItemDeLeyenda>
            {conOrden && (
              <ItemDeLeyenda
                muestra={
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-fg-muted text-[9px] font-bold text-fg" aria-hidden>
                    1
                  </span>
                }
              >
                Por fuera: en qué orden se trabaja cada capa
              </ItemDeLeyenda>
            )}
          </ul>
        </div>
        <div>
          <p className={titulo}>Al tocar una celda</p>
          <ul className="space-y-1">
            <ItemDeLeyenda muestra={<MuestraDeBorde patron="entero" />}>La que elegiste</ItemDeLeyenda>
            <ItemDeLeyenda muestra={<MuestraDeBorde patron="rayas" />}>La elegida necesita algo de esta</ItemDeLeyenda>
            <ItemDeLeyenda muestra={<MuestraDeBorde patron="puntos" />}>Esta necesita algo de la elegida</ItemDeLeyenda>
            <ItemDeLeyenda
              muestra={
                <span className="flex gap-0.5" aria-hidden>
                  <span className={cn("h-3.5 w-2.5 rounded-sm opacity-60", PUNTO_DE_NIVEL.E)} />
                  <span className={cn("h-3.5 w-2.5 rounded-sm opacity-30", PUNTO_DE_NIVEL.E)} />
                </span>
              }
            >
              A media luz, su dimensión y su nivel; más claro, lo demás
            </ItemDeLeyenda>
          </ul>
        </div>
      </div>
    </details>
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
  const caja = "relative self-start rounded-xl border border-line bg-surface p-5 xl:sticky xl:top-4";

  if (!seleccion) {
    const total = dims.reduce((s, d) => s + conteoDeDimension(conteos, d.id).total, 0);
    const abiertos = dims.reduce((s, d) => s + conteoDeDimension(conteos, d.id).abiertos, 0);
    return (
      <aside data-recorrido="escala.detalle" aria-label="Detalle" className={caja}>
        <p className={ROTULO}>{area.nombre}</p>
        <p className="mt-2 text-sm leading-relaxed text-fg-secondary">{area.descripcion}</p>
        <p className="mt-4 text-sm text-fg">
          <span className="text-2xl font-bold tabular-nums">{total}</span> comentarios · <span className="font-semibold">{abiertos}</span> abiertos
        </p>
        <ul className="mt-4 space-y-1.5 text-xs text-fg-muted">
          <li>Toca una celda para ver sus criterios; tócala otra vez (o la X) para cerrarla.</li>
          <li>Toca el nombre de una dimensión para verla entera.</li>
          <li>Toca el nombre de un nivel (arriba, en la rueda) para ver el área en ese nivel.</li>
          <li>«Recorrer», arriba de la rueda, sube la escala de Deficiente a Óptimo, un nivel a la vez.</li>
          <li>Con el teclado: flechas para moverte, Enter para comentar, Escape para volver.</li>
        </ul>
      </aside>
    );
  }

  if (seleccion.tipo === "nivel") {
    const k = LETRAS.indexOf(seleccion.letra);
    return (
      <aside data-recorrido="escala.detalle" aria-label="Detalle del nivel" className={caja}>
        <BotonCerrar onClick={onCerrar} />
        <p className={cn("pr-8", ROTULO)}>Así se ve {area.nombre} en</p>
        <div className="mt-1 flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", PUNTO_DE_NIVEL[seleccion.letra])} aria-hidden />
          <h3 className="text-lg font-semibold text-fg">{nombreNivel(seleccion.letra)}</h3>
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
                  <span className="w-7 flex-shrink-0 text-xs tabular-nums text-fg-muted">{d.id}</span>
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
          <button type="button" disabled={k === 0} onClick={() => onSeleccion({ tipo: "nivel", letra: LETRAS[k - 1] })} className={BOTON_CLARO}>
            ← {k > 0 ? nombreNivel(LETRAS[k - 1]) : "—"}
          </button>
          <button
            type="button"
            disabled={k === LETRAS.length - 1}
            onClick={() => onSeleccion({ tipo: "nivel", letra: LETRAS[k + 1] })}
            className={BOTON_CLARO}
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
      <aside data-recorrido="escala.detalle" aria-label="Detalle de la dimensión" className={caja}>
        <BotonCerrar onClick={onCerrar} />
        <p className="pr-8 text-xs text-fg-muted">
          <span className="tabular-nums">{d.id}</span>
          {d.generica && d.generica.nombre !== d.nombre ? ` · ${d.generica.nombre}` : ""}
        </p>
        <h3 className="mt-0.5 text-lg font-semibold leading-[26px] text-fg">{d.nombre}</h3>
        <NombreGeneral nombre={d.nombreGeneral} />
        <p className="mt-2 text-sm leading-snug text-fg">{d.pregunta}</p>
        {d.descripcion && (
          <p className="mt-2 text-xs leading-relaxed text-fg-secondary">
            <TextoConPalabras texto={d.descripcion} palabras={datos.terminos} />
          </p>
        )}
        <p role="note" className="mt-3 rounded-lg border border-warn-line bg-warn-surface px-3 py-2 text-xs leading-relaxed text-warn-ink">
          <span className="font-semibold">Costo de quedarse. </span>
          {d.costoDeQuedarse}
        </p>
        <ol className="mt-4 space-y-1">
          {d.niveles.map((nv) => (
            <li key={nv.id}>
              <button
                type="button"
                onClick={() => onSeleccion({ tipo: "celda", dim: d.id, letra: nv.letra })}
                className="flex w-full items-start gap-2 rounded-lg px-1 py-1.5 text-left hover:bg-surface-hover"
              >
                <span className={cn("mt-1 h-2 w-2 flex-shrink-0 rounded-full", PUNTO_DE_NIVEL[nv.letra])} aria-hidden />
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
          <button type="button" onClick={() => onLeerDimension(d.id)} className={BOTON_CLARO}>
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
      onSeleccion={onSeleccion}
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
  onSeleccion,
  onCerrar,
  onLeerDimension,
  onVerEnLaMatriz,
  caja,
}: {
  datos: DatosDeLaVista;
  perfil: Perfil;
  d: Dimension;
  nv: Nivel;
  onSeleccion: (s: SeleccionDelMapa) => void;
  onCerrar: () => void;
  onLeerDimension: (dim: string) => void;
  onVerEnLaMatriz: () => void;
  caja: string;
}) {
  const { conteos, abrirComentarios } = useEscala();
  const { atenuado } = useHerramientas();
  const nombre = datos.niveles.find((x) => x.letra === nv.letra)!.nombre;
  const visibles = nv.criterios.filter((c) => aplica(c, perfil));
  const ocultos = nv.criterios.length - visibles.length;
  return (
    <aside data-recorrido="escala.detalle" aria-label="Detalle de la celda" className={caja}>
      <BotonCerrar onClick={onCerrar} />
      <p className="pr-8 text-xs text-fg-muted">
        <span className="tabular-nums">{nv.id}</span> · {datos.capas.find((c) => c.clave === d.capa)?.nombre}
      </p>
      <h3 className="mt-1 text-lg font-semibold leading-[26px] text-fg">
        {d.nombre} <span className="font-normal text-fg-muted">en</span>{" "}
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full", PUNTO_DE_NIVEL[nv.letra])} aria-hidden />
          {nombre}
        </span>
      </h3>
      <p className="mt-3 text-sm font-semibold leading-normal text-fg">{nv.descripcion}</p>
      {nv.resultado && (
        <div className={cn(BLOQUE_DE_RESULTADO, "mt-3 px-3 py-2.5")}>
          <span className={ROTULO}>Resultado</span>
          <span className="text-[13px] leading-normal text-fg-secondary">{nv.resultado}</span>
        </div>
      )}
      {visibles.length > 0 && (
        <ul data-recorrido="escala.criterios" className="mt-2 divide-y divide-line">
          {visibles.map((c) => (
            <li key={c.id} className={cn("flex items-start gap-2 py-2.5 transition-opacity", atenuado(c.id) && "opacity-45 hover:opacity-100")}>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-normal text-fg">
                  <TextoConPalabras texto={c.texto} palabras={datos.terminos} />
                </p>
                <MetaDelCriterio criterio={c} datos={datos} perfil={perfil} className="mt-1" />
                <HerramientasDelCriterio criterio={c} conTexto className="mt-1.5" />
                {/* Lo que requiere y quiénes lo requieren: tocar uno lleva a SU celda de la rueda. */}
                <EnlacesDelCriterio
                  criterio={c}
                  datos={datos}
                  perfil={perfil}
                  onIr={(e) => onSeleccion({ tipo: "celda", dim: e.dimension, letra: e.letra })}
                  className="mt-2"
                />
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
        <button type="button" onClick={() => onLeerDimension(d.id)} className={BOTON_CLARO}>
          Leer la dimensión
        </button>
        <button type="button" onClick={onVerEnLaMatriz} className={BOTON_CLARO}>
          Ver en la matriz
        </button>
      </div>
    </aside>
  );
}
