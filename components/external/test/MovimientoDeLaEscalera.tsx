"use client";

/**
 * components/external/test/MovimientoDeLaEscalera.tsx — LO VIVO de la escalera de los niveles (21 nov), montado sobre el
 * SVG estático de EscaleraDeNiveles. Viene de la aplicación vieja del Diagnóstico de rendimiento:
 *   · `anim.js › iniciarEscalaFX`: los cinco círculos se corren apenas hacia el cursor (con piso: responde en toda la
 *     página) y la curva y el área se redibujan para seguirlos (lib/escala/escalera.ts ›
 *     `trazosDeLaEscalera`, la misma cuenta que el dibujo quieto). El tirón es el del radar (lib/tests-diagnostico/
 *     iman-del-radar.ts), que cerca del cursor se apaga y no da el «jalonazo». Solo con mouse y sin «reducir movimiento».
 *     El corrimiento con el desplazamiento de la página de la vieja no se trajo.
 *   · `resultado.js › wireEscala`: el círculo bajo el cursor crece (`is-hover`, resultado.css) y se abre la tarjeta del
 *     nivel —su número y nombre con su color, cómo se ve el área en ese nivel (`vistazo`) y quién está ahí— junto al
 *     cursor (`posicionarTip`). En el teléfono se abre tocando el nivel y se cierra tocando fuera; Escape y desplazar la
 *     página también la cierran.
 *   · Con el teclado (lo que la vieja no tenía): con JS cada nivel es un botón (Tab, y Enter o Espacio) y el dibujo pasa de
 *     imagen a grupo, con la misma lectura; la tarjeta (`role="status"`) se lee al abrirse. Sin JS sigue siendo la imagen.
 * En el PDF no se monta (`interactiva`); sin JS, el dibujo ya está completo. La tarjeta va en `document.body`: un
 * antepasado con `transform` (las entradas de la página) correría un `position: fixed`.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LETRAS, type Letra } from "@/lib/escala/documento/tipos";
import { COLOR_DE_LA_ESCALERA, marcaDelNivel, PUNTOS_DE_LA_ESCALERA, trazosDeLaEscalera, type NivelMarcado, type Punto } from "@/lib/escala/escalera";
import { IMAN, imanHacia } from "@/lib/tests-diagnostico/iman-del-radar";

/** El imán de la escalera, en unidades del dibujo (los de la vieja: `AMP = 10, RADIO = 520`). */
const IMAN_DE_LA_ESCALERA = { amplitud: 10, radio: 520 } as const;

type Nivel = { letra: Letra; nombre: string; vistazo?: string | null };

/** La tarjeta junto al punto (el cursor, o el pie del círculo tocado), sin salirse de la ventana (`posicionarTip`). */
function ubicar(tip: HTMLElement | null, p: Punto) {
  if (!tip) return;
  const pad = 16;
  const w = tip.offsetWidth || 320;
  const h = tip.offsetHeight || 160;
  let x = p.x + pad;
  let y = p.y + pad;
  if (x + w > window.innerWidth - 8) x = p.x - w - pad;
  if (x < 8) x = 8;
  if (y + h > window.innerHeight - 8) y = window.innerHeight - h - 8;
  if (y < 8) y = 8;
  tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

const conIman = () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches && window.matchMedia("(pointer: fine)").matches;

export default function MovimientoDeLaEscalera({ niveles, marcados }: { niveles: readonly Nivel[]; marcados: readonly NivelMarcado[] }) {
  const ancla = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const punto = useRef<Punto>({ x: 0, y: 0 });
  const [abierto, setAbierto] = useState<Letra | null>(null);

  useLayoutEffect(() => {
    if (!abierto || !tip.current) return;
    // La letra de la página: la tarjeta vive en <body>, fuera de la página que la define.
    const pagina = ancla.current?.parentElement;
    if (pagina) tip.current.style.fontFamily = getComputedStyle(pagina).fontFamily;
    ubicar(tip.current, punto.current);
  }, [abierto]);

  useEffect(() => {
    const svg = ancla.current?.closest("figure")?.querySelector<SVGSVGElement>("svg.esc-svg");
    if (!svg) return;
    svg.classList.add("esc-viva");
    const grupos = () => [...svg.querySelectorAll<SVGGElement>(".esc-nivel")];
    const deMarca = (t: EventTarget | null) => (t instanceof Element ? t.closest<SVGGElement>(".esc-nivel") : null);

    // ── La tarjeta ──
    let activa: SVGGElement | null = null;
    const abrir = (g: SVGGElement, p: Punto) => {
      if (activa !== g) {
        activa?.classList.remove("is-hover");
        g.classList.add("is-hover");
        activa = g;
      }
      punto.current = p;
      setAbierto(g.dataset.nivel as Letra);
      ubicar(tip.current, p);
    };
    const cerrar = () => {
      if (!activa) return;
      activa.classList.remove("is-hover");
      activa = null;
      setAbierto(null);
    };
    const pieDelCirculo = (g: SVGGElement): Punto => {
      const r = (g.querySelector(".esc-aro") ?? g).getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.bottom };
    };
    const alEntrar = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const g = deMarca(e.target);
      if (g) abrir(g, { x: e.clientX, y: e.clientY });
    };
    const alMoverEncima = (e: PointerEvent) => {
      if (e.pointerType === "touch" || !activa) return;
      punto.current = { x: e.clientX, y: e.clientY };
      ubicar(tip.current, punto.current);
    };
    const alSalir = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const g = deMarca(e.target);
      if (g && g === activa && deMarca(e.relatedTarget) !== g) cerrar();
    };
    // Con el dedo: tocar un nivel lo abre (otra vez, lo cierra); tocar fuera lo cierra. Al desplazar con el dedo el
    // navegador manda `pointercancel`, no `pointerup`: desplazar no abre nada.
    const alSoltar = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      const g = deMarca(e.target);
      if (g && svg.contains(g)) {
        if (g === activa) cerrar();
        else abrir(g, pieDelCirculo(g));
      } else cerrar();
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") return cerrar();
      if (e.key !== "Enter" && e.key !== " ") return;
      const g = deMarca(e.target);
      if (!g || !svg.contains(g)) return;
      e.preventDefault();
      if (g === activa) cerrar();
      else abrir(g, pieDelCirculo(g));
    };
    // Cada nivel, un botón con su nombre; la imagen, un grupo con la misma lectura (se devuelve todo al desmontar).
    const rolAntes = svg.getAttribute("role");
    svg.setAttribute("role", "group");
    for (const g of grupos()) {
      const numero = g.querySelector(".esc-num")?.textContent ?? "";
      const nombre = g.querySelector(".esc-nombre")?.textContent ?? "";
      g.setAttribute("tabindex", "0");
      g.setAttribute("role", "button");
      g.setAttribute("aria-label", `Nivel ${numero}, ${nombre}`);
    }
    // El foco del TECLADO abre la tarjeta al pie del círculo (tocar con el dedo también enfoca: eso lo decide `alSoltar`).
    const alEnfocar = (e: FocusEvent) => {
      const g = deMarca(e.target);
      if (g && g.matches(":focus-visible")) abrir(g, pieDelCirculo(g));
    };
    const alDesenfocar = (e: FocusEvent) => {
      if (deMarca(e.target) === activa && !deMarca(e.relatedTarget)) cerrar();
    };
    // Desplazar cierra la tarjeta (es fija y quedaría lejos), salvo con el foco del teclado en un nivel: ahí es el navegador
    // mostrándolo, y la tarjeta lo sigue.
    const alDesplazar = () => {
      if (!activa) return;
      if (activa.matches(":focus-visible")) {
        punto.current = pieDelCirculo(activa);
        ubicar(tip.current, punto.current);
      } else cerrar();
    };
    svg.addEventListener("pointerover", alEntrar);
    svg.addEventListener("pointermove", alMoverEncima);
    svg.addEventListener("pointerout", alSalir);
    document.addEventListener("pointerup", alSoltar);
    document.addEventListener("keydown", alTeclear);
    svg.addEventListener("focusin", alEnfocar);
    svg.addEventListener("focusout", alDesenfocar);
    window.addEventListener("scroll", alDesplazar, { passive: true });

    // ── El imán ──
    let cuadro = 0;
    let cursor: Punto | null = null;
    let m: Punto | null = null;
    let objetivo: Punto = { x: 0, y: 0 };
    let peso = 0;
    const dibujar = () => {
      cuadro = 0;
      if (!m) return;
      m.x += (objetivo.x - m.x) * IMAN.suavizado;
      m.y += (objetivo.y - m.y) * IMAN.suavizado;
      peso += (1 - peso) * IMAN.suavizado;
      const falta = Math.abs(objetivo.x - m.x) > 0.3 || Math.abs(objetivo.y - m.y) > 0.3 || peso < 0.98;
      const c = m;
      const gs = grupos();
      const pts = PUNTOS_DE_LA_ESCALERA.map((p, i) => {
        const d = imanHacia(p.x, p.y, c.x, c.y, IMAN_DE_LA_ESCALERA.amplitud, IMAN_DE_LA_ESCALERA.radio);
        const dx = d.x * peso;
        const dy = d.y * peso;
        if (gs[i]) gs[i].style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)`;
        return { x: p.x + dx, y: p.y + dy };
      });
      const t = trazosDeLaEscalera(pts);
      svg.querySelector(".esc-curva")?.setAttribute("d", t.curva);
      svg.querySelector(".esc-area")?.setAttribute("d", t.area);
      if (falta) cuadro = requestAnimationFrame(dibujar);
    };
    /** Dónde está el cursor en unidades del dibujo (se mide cada vez: la página se desplaza y el lienzo cambia de alto). */
    const apuntar = () => {
      if (!cursor) return;
      const caja = svg.getBoundingClientRect();
      if (!caja.width || !caja.height) return;
      const vb = svg.viewBox.baseVal;
      objetivo = { x: vb.x + ((cursor.x - caja.left) / caja.width) * vb.width, y: vb.y + ((cursor.y - caja.top) / caja.height) * vb.height };
      // La primera vez arranca donde está el cursor y el tirón entra de a poco (como el radar: sin un salto al primer movimiento).
      if (!m) m = { ...objetivo };
      if (!cuadro) cuadro = requestAnimationFrame(dibujar);
    };
    const alMover = (e: MouseEvent) => {
      cursor = { x: e.clientX, y: e.clientY };
      apuntar();
    };
    const iman = conIman();
    if (iman) {
      window.addEventListener("mousemove", alMover, { passive: true });
      window.addEventListener("scroll", apuntar, { passive: true });
      window.addEventListener("resize", apuntar, { passive: true });
    }
    return () => {
      svg.removeEventListener("pointerover", alEntrar);
      svg.removeEventListener("pointermove", alMoverEncima);
      svg.removeEventListener("pointerout", alSalir);
      document.removeEventListener("pointerup", alSoltar);
      document.removeEventListener("keydown", alTeclear);
      svg.removeEventListener("focusin", alEnfocar);
      svg.removeEventListener("focusout", alDesenfocar);
      window.removeEventListener("scroll", alDesplazar);
      if (rolAntes) svg.setAttribute("role", rolAntes);
      for (const g of grupos()) ["tabindex", "role", "aria-label"].forEach((a) => g.removeAttribute(a));
      window.removeEventListener("mousemove", alMover);
      window.removeEventListener("scroll", apuntar);
      window.removeEventListener("resize", apuntar);
      if (cuadro) cancelAnimationFrame(cuadro);
      activa?.classList.remove("is-hover");
      svg.classList.remove("esc-viva");
    };
  }, []);

  const i = abierto ? LETRAS.indexOf(abierto) : -1;
  const nivel = abierto ? niveles.find((n) => n.letra === abierto) : null;
  const marca = abierto ? marcaDelNivel(marcados.find((m) => m.letra === abierto)?.quienes ?? []) : null;
  return (
    <>
      <span ref={ancla} hidden />
      {abierto &&
        createPortal(
          <div ref={tip} className="esc-tip" role="status">
            <div className="esc-tip-cabeza">
              <span className="esc-tip-num" style={{ background: COLOR_DE_LA_ESCALERA[abierto] }}>
                {i + 1}
              </span>
              <span className="esc-tip-nombre" style={{ color: COLOR_DE_LA_ESCALERA[abierto] }}>
                {nivel?.nombre ?? abierto}
              </span>
            </div>
            {nivel?.vistazo && <p className="esc-tip-texto">{nivel.vistazo}</p>}
            {marca && <p className="esc-tip-marca">{marca}</p>}
          </div>,
          document.body,
        )}
    </>
  );
}
