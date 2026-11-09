"use client";

/**
 * ArrastreDelRadar — envuelve el radar de una empresa (RadarDeUnaEmpresa, con `interactivo`) y deja ARRASTRAR el nivel de
 * cada dimensión por su eje (La escala interna editable, 8 nov). Lo usa solo la pantalla interna; la página del cliente
 * no lo monta.
 *
 * Se toma una dimensión por cualquiera de sus piezas (`[data-d]`: el vértice, su porción, el eje, el rótulo) y se arrastra:
 * el nivel es el del anillo más cercano al cursor a lo largo del eje (lib/escala/arrastre-del-radar.ts). Mientras se
 * arrastra, `onMover` dice el nivel que va a quedar (el radar lo dibuja ya); al soltar, `onSoltar`. Si el cursor casi no
 * se movió, es un toque: `onTocar` (también con Enter o espacio sobre la pieza enfocada). El radar sigue siendo SVG sin
 * JavaScript propio: todo se lee del DOM. Un vértice de otra área encima (`data-eje`) no se arrastra.
 */
import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import type { Letra } from "@/lib/escala/documento/tipos";
import { esArrastre, letraDelArrastre } from "@/lib/escala/arrastre-del-radar";
import { COMPACTO, GRANDE, type MedidasDelRadar, type Punto } from "@/lib/escala/radar-de-una-empresa";

interface Toma {
  clave: string;
  svg: SVGSVGElement;
  m: MedidasDelRadar;
  eje: { desde: Punto; hasta: Punto };
  x0: number;
  y0: number;
  puntero: number;
  arrastrando: boolean;
  letra: Letra | null;
}

function piezaDe(t: EventTarget | null): { clave: string; svg: SVGSVGElement } | null {
  if (!(t instanceof Element)) return null;
  const el = t.closest<SVGElement>("[data-d]");
  const svg = el?.closest<SVGSVGElement>("svg.rde-interactivo");
  const clave = el?.dataset.d;
  if (!el || !svg || !clave || el.closest("[data-eje]")) return null;
  return { clave, svg };
}

/** El eje de la dimensión en coordenadas del SVG (la línea que sale del centro). */
function ejeDe(svg: SVGSVGElement, clave: string): { desde: Punto; hasta: Punto } | null {
  const l = svg.querySelector<SVGLineElement>(`line.rde-eje[data-d="${CSS.escape(clave)}"]`);
  if (!l) return null;
  const n = (a: string) => Number(l.getAttribute(a));
  return { desde: [n("x1"), n("y1")], hasta: [n("x2"), n("y2")] };
}

function enElSvg(svg: SVGSVGElement, x: number, y: number): Punto | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const p = new DOMPoint(x, y).matrixTransform(ctm.inverse());
  return [p.x, p.y];
}

export default function ArrastreDelRadar({
  activo,
  onMover,
  onSoltar,
  onTocar,
  children,
}: {
  /** Sin permiso de edición: tocar sí, arrastrar no. */
  activo: boolean;
  onMover: (clave: string, letra: Letra | null) => void;
  onSoltar: (clave: string, letra: Letra) => void;
  onTocar: (clave: string) => void;
  children: ReactNode;
}) {
  const toma = useRef<Toma | null>(null);
  /** Tras un arrastre llega un clic: no es un toque. */
  const tragarClic = useRef(false);

  const pagina = (svg: Element) => svg.closest(".dr");
  const terminar = (t: Toma) => {
    pagina(t.svg)?.classList.remove("rd-arrastrando");
    toma.current = null;
  };

  const alBajar = (e: PointerEvent<HTMLDivElement>) => {
    if (!activo || e.button !== 0) return;
    const pieza = piezaDe(e.target);
    if (!pieza) return;
    const eje = ejeDe(pieza.svg, pieza.clave);
    if (!eje) return;
    const m = pieza.svg.closest(".rde-compacto") ? COMPACTO : GRANDE;
    toma.current = {
      ...pieza,
      m,
      eje,
      x0: e.clientX,
      y0: e.clientY,
      puntero: e.pointerId,
      arrastrando: false,
      letra: null,
    };
  };

  const alMover = (e: PointerEvent<HTMLDivElement>) => {
    const t = toma.current;
    if (!t || e.pointerId !== t.puntero) return;
    if (!t.arrastrando) {
      if (!esArrastre({ x: t.x0, y: t.y0 }, { x: e.clientX, y: e.clientY })) return;
      t.arrastrando = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      pagina(t.svg)?.classList.add("rd-arrastrando");
    }
    const p = enElSvg(t.svg, e.clientX, e.clientY);
    if (!p) return;
    const letra = letraDelArrastre(t.m, p, t.eje);
    if (letra !== t.letra) {
      t.letra = letra;
      onMover(t.clave, letra);
    }
  };

  const alSoltar = (e: PointerEvent<HTMLDivElement>) => {
    const t = toma.current;
    if (!t || e.pointerId !== t.puntero) return;
    terminar(t);
    if (!t.arrastrando) return;
    // El clic que sigue al soltar no es un toque; si no llega (se soltó fuera), no se traga el próximo.
    tragarClic.current = true;
    window.setTimeout(() => (tragarClic.current = false), 80);
    if (t.letra) onSoltar(t.clave, t.letra);
    else onMover(t.clave, null);
  };

  const alCancelar = () => {
    const t = toma.current;
    if (!t) return;
    terminar(t);
    if (t.arrastrando) onMover(t.clave, null);
  };

  return (
    <div
      onPointerDown={alBajar}
      onPointerMove={alMover}
      onPointerUp={alSoltar}
      onPointerCancel={alCancelar}
      onLostPointerCapture={(e) => {
        if (toma.current?.arrastrando && e.pointerId === toma.current.puntero) alCancelar();
      }}
      onClick={(e) => {
        if (tragarClic.current) {
          tragarClic.current = false;
          return;
        }
        const pieza = piezaDe(e.target);
        if (pieza) onTocar(pieza.clave);
      }}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        const pieza = piezaDe(e.target);
        if (!pieza) return;
        e.preventDefault();
        onTocar(pieza.clave);
      }}
    >
      {children}
    </div>
  );
}
