"use client";

/**
 * components/external/test/AnimacionesDelResultado.tsx — EL MOVIMIENTO de la página de resultado del test (29 oct), como
 * el de la aplicación vieja (`assets/js/anim.js` y `wireRadar` de resultado.js):
 *   · las secciones que están más abajo de la pantalla aparecen subiendo un poco cuando el visitante llega a ellas
 *     (`[data-revela]`); la cabecera entra sola al abrir, con CSS (`.rd-entra`, resultado.css);
 *   · cada fila de «Cómo está cada parte» aparece al llegar a ella, una tras otra, y su barra y su puntaje se cargan
 *     JUNTOS: el mismo cuadro mueve el ancho y el número (`[data-fill]` y `[data-count]`, dentro de cada `.rd-fila`).
 *     Antes la barra iba por una transición de CSS y el número por su cuenta, y no llegaban a la vez;
 *   · el imán del radar: sus vértices y su figura se corren apenas hacia el cursor (`imanDelRadar`, como la vieja);
 *   · al pasar el cursor (o tocar) una dimensión del radar, se resaltan su eje (del rótulo a su vértice), su vértice y su
 *     rótulo (`[data-d]` de RadarDeUnaEmpresa; el aspecto, en radar-de-una-empresa.css), y aparece su TARJETA junto a la
 *     dimensión (`[data-tarjeta]`, que la página trae escondida: ResultadoDelTestVista › TarjetaDeLaDimension).
 * La página llega del servidor ya completa (las barras llenas, los números puestos): este componente solo esconde lo
 * que todavía no se ve para animarlo al llegar. Lo que ya está en pantalla al abrir no se toca (no parpadea), y con
 * «reducir movimiento» no se anima nada. «Llegar» es que su borde de arriba entró en la pantalla, se mire con el scroll
 * (no con IntersectionObserver: con un salto, a un enlace o arrastrando la barra, lo que se pasó de largo quedaba
 * escondido para siempre). Es el `<main>` de la página; el PDF no lo usa.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { IMAN, imanHacia } from "@/lib/tests-diagnostico/iman-del-radar";
import { posicionDeLaTarjeta } from "@/lib/tests-diagnostico/tarjeta-del-radar";

/** Cuánto tarda en llenarse una barra y el desfase entre filas del mismo grupo. */
const DURACION_MS = 1400;
const DESFASE_MS = 140;
const suave = (t: number) => 1 - Math.pow(1 - t, 3);

/** Lo que está por debajo del borde de la pantalla al abrir: eso es lo único que se anima. */
const debajoDeLaPantalla = (el: Element) => el.getBoundingClientRect().top > window.innerHeight * 0.92;
/** Ya llegó: su borde de arriba entró en la pantalla (o ya quedó arriba, si se saltó hasta más abajo). */
const yaLlego = (el: Element) => el.getBoundingClientRect().top < window.innerHeight * 0.88;

/** La barra y su número, en el mismo cuadro: llegan juntos al final. */
function cargar(barra: HTMLElement | null, num: HTMLElement | null, retraso: number) {
  const ancho = Number(barra?.dataset.fill) || 0;
  const hasta = Number(num?.dataset.count) || 0;
  let t0: number | undefined;
  const paso = (ts: number) => {
    if (t0 === undefined) t0 = ts;
    const p = suave(Math.min(1, Math.max(0, (ts - t0 - retraso) / DURACION_MS)));
    if (barra) barra.style.width = `${(p * ancho).toFixed(2)}%`;
    if (num) num.textContent = String(Math.round(p * hasta));
    if (p < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

/** Ubica la tarjeta con la regla de lib/tests-diagnostico/tarjeta-del-radar.ts: nunca tapa la dimensión que se mira. */
function ubicar(tip: HTMLElement, svg: SVGSVGElement, clave: string, x: number, y: number) {
  tip.style.maxHeight = "";
  const caja = svg.getBoundingClientRect();
  const rotulo = svg.querySelector(`.rde-rotulo[data-d="${CSS.escape(clave)}"], .rde-numero[data-d="${CSS.escape(clave)}"]`)?.getBoundingClientRect();
  const p = posicionDeLaTarjeta({
    vw: window.innerWidth,
    vh: window.innerHeight,
    w: tip.offsetWidth || 400,
    h: tip.offsetHeight || 260,
    x,
    y,
    radar: caja,
    rotulo: rotulo ?? null,
  });
  tip.classList.toggle("es-angosta", p.angosta);
  if (p.altoMaximo !== null) tip.style.maxHeight = `${p.altoMaximo}px`;
  tip.style.transform = `translate(${p.left}px, ${p.top}px)`;
}

/** El resalte del radar y su tarjeta: la dimensión bajo el cursor (o el dedo), en el SVG donde está. Devuelve cómo soltarlo. */
function resaltarElRadar(raiz: HTMLElement): () => void {
  let visible: HTMLElement | null = null;
  const mostrar = (svg: SVGSVGElement, clave: string | null, x: number, y: number) => {
    const tip = clave ? raiz.querySelector<HTMLElement>(`[data-tarjeta="${CSS.escape(clave)}"]`) : null;
    if (visible && visible !== tip) {
      visible.classList.remove("is-visible");
      visible.hidden = true;
    }
    visible = tip;
    if (!tip || !clave) return;
    tip.hidden = false;
    ubicar(tip, svg, clave, x, y);
    requestAnimationFrame(() => tip.classList.add("is-visible"));
  };
  const activar = (svg: SVGSVGElement, clave: string | null, x: number, y: number) => {
    if ((svg.dataset.activa ?? null) === clave) return;
    if (clave) svg.dataset.activa = clave;
    else delete svg.dataset.activa;
    svg.querySelectorAll<SVGElement>("[data-d]").forEach((el) => el.classList.toggle("is-activa", el.dataset.d === clave));
    mostrar(svg, clave, x, y);
  };
  const alPasar = (e: PointerEvent) => {
    const t = e.target as Element | null;
    // En la pantalla angosta la tarjeta se toca para desplazarla: tocarla no la cierra.
    if (t?.closest?.(".rd-tip")) return;
    const svg = t?.closest?.("svg.rde-interactivo") as SVGSVGElement | null;
    raiz.querySelectorAll<SVGSVGElement>("svg.rde-interactivo[data-activa]").forEach((otro) => otro !== svg && activar(otro, null, 0, 0));
    if (svg) activar(svg, (t?.closest?.("[data-d]") as SVGElement | null)?.dataset.d ?? null, e.clientX, e.clientY);
  };
  const alSalir = (e: PointerEvent) => {
    // Con el dedo, el resalte se queda al levantarlo (o al empezar a desplazar): se va al tocar otra cosa (`alPasar`).
    if (e.pointerType === "touch") return;
    const svg = (e.target as Element | null)?.closest?.("svg.rde-interactivo") as SVGSVGElement | null;
    const hacia = e.relatedTarget as Node | null;
    // En una ventana angosta la tarjeta se puede desplazar: el mouse puede ir del radar a ella sin que se cierre.
    if (hacia instanceof Element && hacia.closest(".rd-tip.es-angosta")) return;
    if (svg && !(hacia && svg.contains(hacia))) activar(svg, null, 0, 0);
  };
  // Con el teclado: cada rótulo (o número, en el compacto) recibe el foco y muestra su tarjeta, que lleva `role="status"`
  // para que el lector de pantalla la lea. Sin esto, «cómo está» cada dimensión solo se veía con el cursor o el dedo.
  const alEnfocar = (e: FocusEvent) => {
    const t = e.target as Element | null;
    const svg = t?.closest?.("svg.rde-interactivo") as SVGSVGElement | null;
    const clave = (t?.closest?.("[data-d]") as SVGElement | null)?.dataset.d ?? null;
    if (!svg || !clave || !t) return;
    const r = t.getBoundingClientRect();
    activar(svg, clave, r.left + r.width / 2, r.top + r.height / 2);
  };
  const alDesenfocar = (e: FocusEvent) => {
    const svg = (e.target as Element | null)?.closest?.("svg.rde-interactivo") as SVGSVGElement | null;
    const hacia = e.relatedTarget as Node | null;
    if (svg && !(hacia && svg.contains(hacia))) activar(svg, null, 0, 0);
  };
  // Al desplazar la página, la tarjeta fija quedaría lejos de su dimensión: se esconde.
  const alDesplazar = () => {
    if (!visible) return;
    // Con el teclado, enfocar un rótulo desplaza la página para mostrarlo: ahí la tarjeta se queda, se reubica.
    // Solo si el foco llegó con el teclado: en el teléfono, tocar un rótulo también le da el foco, y la tarjeta se quedaba
    // pegada al desplazar.
    const foco = document.activeElement;
    if (foco instanceof SVGElement && foco.matches(":focus-visible") && foco.closest("svg.rde-interactivo") && foco.dataset.d) {
      const svg = foco.closest("svg.rde-interactivo") as SVGSVGElement;
      const r = foco.getBoundingClientRect();
      ubicar(visible, svg, foco.dataset.d, r.left + r.width / 2, r.top + r.height / 2);
      return;
    }
    raiz.querySelectorAll<SVGSVGElement>("svg.rde-interactivo[data-activa]").forEach((svg) => activar(svg, null, 0, 0));
  };
  raiz.addEventListener("pointerover", alPasar);
  raiz.addEventListener("pointerout", alSalir);
  raiz.addEventListener("focusin", alEnfocar);
  raiz.addEventListener("focusout", alDesenfocar);
  window.addEventListener("scroll", alDesplazar, { passive: true });
  return () => {
    raiz.removeEventListener("pointerover", alPasar);
    raiz.removeEventListener("pointerout", alSalir);
    raiz.removeEventListener("focusin", alEnfocar);
    raiz.removeEventListener("focusout", alDesenfocar);
    window.removeEventListener("scroll", alDesplazar);
  };
}

/**
 * El IMÁN del radar (la cuenta, en lib/tests-diagnostico/iman-del-radar.ts): cada vértice de la empresa, su figura, el
 * halo de lo que más frena y su flecha al objetivo (`data-iman-x/y`: se mueven con el vértice, no se despegan) se corren
 * un poco hacia el cursor; el movimiento se suaviza cuadro a cuadro. La grilla y los rótulos quedan fijos. Solo con
 * mouse (en el teléfono no hay cursor que seguir) y nunca con «reducir movimiento».
 */
function imanDelRadar(raiz: HTMLElement): () => void {
  type Punto = { x: number; y: number };
  const radares = [...raiz.querySelectorAll<SVGSVGElement>("svg.rde-interactivo")].map((svg) => {
    const centro = (el: SVGElement): Punto | null => {
      if (el.dataset.imanX && el.dataset.imanY) return { x: Number(el.dataset.imanX), y: Number(el.dataset.imanY) };
      const c = el instanceof SVGCircleElement ? el : el.querySelector("circle");
      return c ? { x: c.cx.baseVal.value, y: c.cy.baseVal.value } : null;
    };
    const piezas = [...svg.querySelectorAll<SVGGraphicsElement>(".rde-vertice, .rde-iman")].flatMap((el) => {
      const p = centro(el);
      return p ? [{ el, ...p }] : [];
    });
    const figura = svg.querySelector<SVGPolygonElement>(".rde-figura");
    const puntos: Punto[] = figura ? [...figura.points].map((q) => ({ x: q.x, y: q.y })) : [];
    // El resalte termina en el vértice: se corre con él.
    const lineas = [...svg.querySelectorAll<SVGLineElement>(".rde-eje-resalte")].map((el) => ({ el, x: el.x2.baseVal.value, y: el.y2.baseVal.value }));
    return { svg, piezas, figura, puntos, lineas, caja: svg.getBoundingClientRect(), m: null as Punto | null, objetivo: { x: 0, y: 0 } };
  });
  let cuadro = 0;
  let cursor: Punto | null = null;
  const dibujar = () => {
    cuadro = 0;
    let falta = false;
    for (const r of radares) {
      if (!r.caja.width || !r.m) continue;
      r.m.x += (r.objetivo.x - r.m.x) * IMAN.suavizado;
      r.m.y += (r.objetivo.y - r.m.y) * IMAN.suavizado;
      if (Math.abs(r.objetivo.x - r.m.x) > 0.3 || Math.abs(r.objetivo.y - r.m.y) > 0.3) falta = true;
      // De píxeles de pantalla a unidades del dibujo.
      const k = r.svg.viewBox.baseVal.width / r.caja.width || 1;
      const m = r.m;
      const hacia = (p: Punto) => imanHacia(p.x, p.y, m.x, m.y, IMAN.amplitudPx * k, IMAN.radioPx * k);
      for (const p of r.piezas) {
        const d = hacia(p);
        p.el.style.translate = `${d.x.toFixed(2)}px ${d.y.toFixed(2)}px`;
      }
      const corrido = (p: Punto) => {
        const d = hacia(p);
        return `${(p.x + d.x).toFixed(1)},${(p.y + d.y).toFixed(1)}`;
      };
      if (r.figura) r.figura.setAttribute("points", r.puntos.map(corrido).join(" "));
      for (const l of r.lineas) {
        const d = hacia(l);
        l.el.setAttribute("x2", (l.x + d.x).toFixed(1));
        l.el.setAttribute("y2", (l.y + d.y).toFixed(1));
      }
    }
    if (falta) cuadro = requestAnimationFrame(dibujar);
  };
  /** Dónde está el cursor en las unidades de cada radar (se mide cada vez: al abrir, la cabecera todavía entra). */
  const apuntar = () => {
    if (!cursor) return;
    for (const r of radares) {
      r.caja = r.svg.getBoundingClientRect();
      if (!r.caja.width) continue;
      const vb = r.svg.viewBox.baseVal;
      r.objetivo = { x: vb.x + ((cursor.x - r.caja.left) / r.caja.width) * vb.width, y: vb.y + ((cursor.y - r.caja.top) / r.caja.height) * vb.height };
      // La primera vez arranca donde está el cursor: suavizar desde (0, 0) los corría hacia arriba a la izquierda.
      r.m ??= { ...r.objetivo };
    }
    if (!cuadro) cuadro = requestAnimationFrame(dibujar);
  };
  const alMover = (e: MouseEvent) => {
    cursor = { x: e.clientX, y: e.clientY };
    apuntar();
  };
  // Al desplazar con la rueda el cursor no se mueve, pero el radar sí: se vuelve a apuntar.
  window.addEventListener("mousemove", alMover, { passive: true });
  window.addEventListener("scroll", apuntar, { passive: true });
  window.addEventListener("resize", apuntar, { passive: true });
  return () => {
    window.removeEventListener("mousemove", alMover);
    window.removeEventListener("scroll", apuntar);
    window.removeEventListener("resize", apuntar);
    if (cuadro) cancelAnimationFrame(cuadro);
  };
}

export default function AnimacionesDelResultado({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const raiz = ref.current;
    if (!raiz) return;
    const soltarElRadar = resaltarElRadar(raiz);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return soltarElRadar;
    const soltarElIman = window.matchMedia("(pointer: fine)").matches ? imanDelRadar(raiz) : () => undefined;

    const secciones = [...raiz.querySelectorAll<HTMLElement>("[data-revela]")].filter(debajoDeLaPantalla);
    const filas = [...raiz.querySelectorAll<HTMLElement>(".rd-fila")].filter(debajoDeLaPantalla);
    for (const s of secciones) s.dataset.revela = "oculta";
    for (const fila of filas) {
      const barra = fila.querySelector<HTMLElement>("[data-fill]");
      const num = fila.querySelector<HTMLElement>("[data-count]");
      fila.dataset.barra = "vacia";
      if (barra) barra.style.width = "0%";
      if (num) num.textContent = "0";
    }

    const llenar = (fila: HTMLElement) => {
      // Una tras otra dentro de su grupo, como en la vieja.
      const hermanas = [...(fila.parentElement?.querySelectorAll(":scope > .rd-fila") ?? [])];
      const retraso = Math.max(0, hermanas.indexOf(fila)) * DESFASE_MS;
      fila.style.setProperty("--retraso", `${retraso}ms`);
      fila.dataset.barra = "llena";
      // La fila entra y, cuando ya se ve, la barra y el número arrancan juntos.
      cargar(fila.querySelector<HTMLElement>("[data-fill]"), fila.querySelector<HTMLElement>("[data-count]"), retraso + 250);
    };
    /** Todo a su estado final, sin animar: al imprimir con Ctrl+P y si se desmonta a medio camino. */
    const completar = () => {
      for (const s of secciones) s.dataset.revela = "vista";
      for (const fila of filas) {
        const barra = fila.querySelector<HTMLElement>("[data-fill]");
        const num = fila.querySelector<HTMLElement>("[data-count]");
        fila.dataset.barra = "completa";
        if (barra) barra.style.width = `${barra.dataset.fill}%`;
        if (num) num.textContent = num.dataset.count ?? num.textContent;
      }
      pendientes = [];
    };
    let pendientes = [...secciones, ...filas];
    let cuadro = 0;
    const mirar = () => {
      cuadro = 0;
      pendientes = pendientes.filter((el) => {
        if (!yaLlego(el)) return true;
        if (el.dataset.revela) el.dataset.revela = "vista";
        else llenar(el);
        return false;
      });
      if (!pendientes.length) window.removeEventListener("scroll", alMover);
    };
    const alMover = () => {
      if (!cuadro) cuadro = requestAnimationFrame(mirar);
    };
    window.addEventListener("scroll", alMover, { passive: true });
    window.addEventListener("resize", alMover, { passive: true });
    window.addEventListener("beforeprint", completar);

    return () => {
      window.removeEventListener("scroll", alMover);
      window.removeEventListener("resize", alMover);
      window.removeEventListener("beforeprint", completar);
      if (cuadro) cancelAnimationFrame(cuadro);
      soltarElRadar();
      soltarElIman();
      completar();
    };
  }, []);

  return (
    <main ref={ref} className={className}>
      {children}
    </main>
  );
}
