/**
 * components/escala/movimiento-del-radar.ts — EL MOVIMIENTO del radar de una empresa (RadarDeUnaEmpresa, con
 * `interactivo`), UNO SOLO para las dos pantallas que lo usan (8 nov, Elías: «aprovechar hasta todo el mismo código»):
 *   · la página de resultado del test (components/external/test/AnimacionesDelResultado.tsx), con su tarjeta escondida
 *     en el HTML del servidor;
 *   · La escala de la preventa, de un proyecto y de la cuenta (components/exploraciones/TarjetaDelRadar.tsx), con su
 *     tarjeta de React y sus botones, y a veces varias áreas superpuestas.
 *
 * Tres piezas:
 *   · `resaltarElRadar`: al pasar el cursor (o tocar, o enfocar) una dimensión se resaltan su eje, su vértice y su rótulo
 *     (`data-activa` en el SVG e `is-activa` en sus piezas; el aspecto, en radar-de-una-empresa.css) y aparece su tarjeta.
 *     Un vértice de un área superpuesta lleva `data-eje`, el eje donde está: se resalta él con el rótulo de ese eje, y la
 *     tarjeta va junto a ese rótulo. La tarjeta SE DEJA ALCANZAR en cualquier ancho (el puente, con las reglas de
 *     lib/tests-diagnostico/tarjeta-del-radar.ts), sin nada invisible que tape otra dimensión y sin quedar pegada al
 *     salir del radar en otra dirección.
 *   · `imanDelRadar`: los vértices, sus figuras y el resalte se corren apenas hacia el cursor (lib/tests-diagnostico/
 *     iman-del-radar.ts). Solo con mouse; nunca con «reducir movimiento» (lo decide quien lo llama).
 *   · `ubicarLaTarjeta`: la tarjeta junto al rótulo de su dimensión, con la misma regla en las dos pantallas.
 *
 * DOM puro (sin React): cada pantalla le pasa su `Tarjetero`, que muestra y esconde su tarjeta. Escucha en `document`,
 * filtrando lo que pasa dentro de `raiz` y de la tarjeta abierta.
 */
import { IMAN, imanHacia } from "@/lib/tests-diagnostico/iman-del-radar";
import {
  alEntrarEnUnaPieza,
  ESPERA_AL_CRUZAR_MS,
  GRACIA_AL_SALIR_MS,
  GRACIA_PARA_LLEGAR_MS,
  posicionDeLaTarjeta,
  vaHaciaLaTarjeta,
  type PiezaDelRadar,
  type Punto,
  type PosicionDeLaTarjeta,
} from "@/lib/tests-diagnostico/tarjeta-del-radar";

/** Qué tarjeta abrir y dónde: la dimensión, el eje donde está (el de su rótulo), el SVG y el punto del cursor o del foco. */
export interface TarjetaPedida {
  clave: string;
  eje: string;
  svg: SVGSVGElement;
  x: number;
  y: number;
}

/** Lo que cada pantalla hace con su tarjeta. `mostrar` también se llama con la misma clave para reubicarla. */
export interface Tarjetero {
  mostrar: (t: TarjetaPedida) => void;
  ocultar: () => void;
  /** La tarjeta que se ve, o null: el puente mira si el cursor va rumbo a ella o está encima. */
  abierta: () => HTMLElement | null;
}

const SVG = "svg.rde-interactivo";
/** Lo que es de todo el eje: la porción del cursor, la línea, el rótulo y el número. */
const DE_EJE = ".rde-cuna, .rde-eje, .rde-rotulo, .rde-numero";

interface Pieza extends PiezaDelRadar {
  el: SVGElement;
  svg: SVGSVGElement;
}

function piezaDe(t: EventTarget | null): Pieza | null {
  if (!(t instanceof Element)) return null;
  const el = t.closest<SVGElement>("[data-d]");
  const svg = el?.closest<SVGSVGElement>(SVG);
  const clave = el?.dataset.d;
  if (!el || !svg || !clave) return null;
  return { el, svg, clave, eje: el.dataset.eje ?? clave, deEje: el.matches(DE_EJE) };
}

const centro = (el: Element): Punto => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

/** Ubica la tarjeta junto al rótulo del eje (lib/tests-diagnostico/tarjeta-del-radar.ts): nunca tapa la dimensión. */
export function ubicarLaTarjeta(tip: HTMLElement, t: TarjetaPedida): PosicionDeLaTarjeta {
  tip.style.maxHeight = "";
  const e = CSS.escape(t.eje);
  const rotulo = t.svg.querySelector(`.rde-rotulo[data-d="${e}"], .rde-numero[data-d="${e}"]`)?.getBoundingClientRect() ?? null;
  const p = posicionDeLaTarjeta({
    vw: window.innerWidth,
    vh: window.innerHeight,
    w: tip.offsetWidth || 360,
    h: tip.offsetHeight || 260,
    x: t.x,
    y: t.y,
    radar: t.svg.getBoundingClientRect(),
    rotulo,
  });
  tip.classList.toggle("es-angosta", p.angosta);
  if (p.altoMaximo !== null) tip.style.maxHeight = `${p.altoMaximo}px`;
  tip.style.transform = `translate(${p.left}px, ${p.top}px)`;
  return p;
}

/** El resalte del radar, su tarjeta y el puente del cursor hacia ella. Devuelve cómo soltarlo. */
export function resaltarElRadar(raiz: HTMLElement, tarjetero: Tarjetero): () => void {
  let activa: { svg: SVGSVGElement; clave: string; eje: string } | null = null;
  let cierre = 0;
  let cambio = 0;
  /** La pieza bajo el cursor: el cambio que espera solo se hace si el cursor sigue ahí. */
  let bajo: Element | null = null;
  /** Seleccionando texto de la tarjeta (botón apretado): salir de ella no la cierra hasta soltar. */
  let arrastrando = false;
  let antes: Punto | null = null;
  let ahora: Punto | null = null;

  const enLaTarjeta = (t: EventTarget | null) => t instanceof Node && !!tarjetero.abierta()?.contains(t);
  const enElRadar = (t: EventTarget | null) => t instanceof Node && raiz.contains(t);
  const rumboALaTarjeta = () => {
    const tip = tarjetero.abierta();
    return vaHaciaLaTarjeta(antes, ahora, tip ? tip.getBoundingClientRect() : null);
  };
  const cancelarCierre = () => {
    window.clearTimeout(cierre);
    cierre = 0;
  };
  const cancelarCambio = () => {
    window.clearTimeout(cambio);
    cambio = 0;
  };

  const limpiar = (svg: SVGSVGElement) => {
    delete svg.dataset.activa;
    svg.querySelectorAll(".is-activa").forEach((el) => el.classList.remove("is-activa"));
  };
  const cerrar = () => {
    cancelarCierre();
    cancelarCambio();
    arrastrando = false;
    if (!activa) return;
    limpiar(activa.svg);
    activa = null;
    tarjetero.ocultar();
  };
  const cerrarLuego = (ms: number) => {
    if (!activa || cierre) return;
    cierre = window.setTimeout(cerrar, ms);
  };
  const abrir = (p: Pieza, x: number, y: number) => {
    cancelarCierre();
    cancelarCambio();
    if (activa?.svg === p.svg && activa.clave === p.clave) return;
    if (activa) limpiar(activa.svg);
    activa = { svg: p.svg, clave: p.clave, eje: p.eje };
    p.svg.dataset.activa = p.clave;
    p.svg.querySelectorAll<SVGElement>("[data-d]").forEach((el) => {
      const d = el.dataset.d;
      if (d === p.clave || (d === p.eje && el.matches(".rde-rotulo, .rde-numero"))) el.classList.add("is-activa");
    });
    tarjetero.mostrar({ clave: p.clave, eje: p.eje, svg: p.svg, x, y });
  };
  /** El cursor quedó fuera de toda dimensión: rumbo a la tarjeta, la espera; si no, se cierra de una. */
  const salir = (ms = GRACIA_PARA_LLEGAR_MS) => {
    cancelarCambio();
    if (!activa) return;
    if (rumboALaTarjeta()) cerrarLuego(ms);
    else cerrar();
  };

  const alMover = (e: PointerEvent) => {
    // Soltó el botón fuera de la ventana: el primer movimiento de vuelta, ya sin botón, cuenta como soltar.
    if (arrastrando && e.type === "pointermove" && !e.buttons) alSoltar(e);
    const p = { x: e.clientX, y: e.clientY };
    if (!ahora || Math.hypot(p.x - ahora.x, p.y - ahora.y) > 3) {
      antes = ahora;
      ahora = p;
    }
  };
  const alPasar = (e: PointerEvent) => {
    alMover(e);
    // Seleccionando texto de la tarjeta (botón apretado): el cursor que cruza el radar no la cambia ni la cierra.
    if (arrastrando) return;
    const t = e.target;
    if (enLaTarjeta(t)) {
      bajo = null;
      cancelarCierre();
      cancelarCambio();
      return;
    }
    const p = piezaDe(t);
    if (e.pointerType === "touch") {
      // Con el dedo: tocar una dimensión la abre de una; tocar cualquier otra cosa la cierra.
      if (p && enElRadar(p.el)) abrir(p, e.clientX, e.clientY);
      else cerrar();
      return;
    }
    if (!enElRadar(t)) return;
    bajo = p?.el ?? null;
    if (!p) return salir();
    cancelarCierre();
    const queHacer = alEntrarEnUnaPieza(activa?.svg === p.svg ? activa : null, p, rumboALaTarjeta());
    if (queHacer === "abrir") abrir(p, e.clientX, e.clientY);
    else if (queHacer === "nada") cancelarCambio();
    else {
      cancelarCambio();
      const x = e.clientX;
      const y = e.clientY;
      cambio = window.setTimeout(() => {
        cambio = 0;
        if (bajo === p.el) abrir(p, x, y);
      }, ESPERA_AL_CRUZAR_MS);
    }
  };
  const alSalir = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    alMover(e);
    const hacia = e.relatedTarget;
    // Sale de la tarjeta con el botón apretado (seleccionando texto): se queda hasta soltarlo, vaya a donde vaya.
    if (enLaTarjeta(e.target) && !enLaTarjeta(hacia) && e.buttons) {
      bajo = null;
      arrastrando = true;
      cancelarCierre();
      return;
    }
    // Lo que sigue lo decide `alPasar` sobre donde llega el cursor.
    if (enLaTarjeta(hacia) || enElRadar(hacia)) return;
    if (enLaTarjeta(e.target)) {
      bajo = null;
      cerrarLuego(GRACIA_AL_SALIR_MS);
    } else if (enElRadar(e.target)) {
      bajo = null;
      salir();
    }
  };
  const alSoltar = (e: PointerEvent) => {
    if (!arrastrando) return;
    arrastrando = false;
    if (!enLaTarjeta(e.target) && !piezaDe(e.target)) cerrarLuego(GRACIA_AL_SALIR_MS);
  };
  // Con el teclado: cada rótulo (o número, en el compacto) y cada vértice de un área superpuesta recibe el foco y muestra
  // su tarjeta. Pasar el foco a la tarjeta (sus botones) no la cierra.
  const alEnfocar = (e: FocusEvent) => {
    if (enLaTarjeta(e.target)) return cancelarCierre();
    const p = piezaDe(e.target);
    if (!p || !enElRadar(p.el)) return;
    const c = centro(p.el);
    abrir(p, c.x, c.y);
  };
  const alDesenfocar = (e: FocusEvent) => {
    if (!activa) return;
    if (!enLaTarjeta(e.target) && !piezaDe(e.target)) return;
    const hacia = e.relatedTarget;
    if (enLaTarjeta(hacia) || (piezaDe(hacia) && enElRadar(hacia))) return;
    // Sin destino (un clic en el texto de la tarjeta, o el botón que se cambió por «✓ Va a…»): manda el cursor.
    if (!hacia) return;
    cerrar();
  };
  const alTeclear = (e: KeyboardEvent) => {
    if (e.key === "Escape" && activa) cerrar();
  };
  // Al desplazar la página, la tarjeta (fija) quedaría lejos de su dimensión: se cierra. Con el foco del TECLADO en una
  // dimensión, desplazar es el navegador mostrándola: ahí la tarjeta se queda y se reubica. Solo con el teclado: en el
  // teléfono tocar un rótulo también le da el foco, y la tarjeta quedaba pegada al desplazar.
  const alDesplazar = () => {
    if (!activa) return;
    const foco = document.activeElement;
    const p = piezaDe(foco);
    if (foco instanceof SVGElement && foco.matches(":focus-visible") && p && p.svg === activa.svg && p.clave === activa.clave) {
      const c = centro(foco);
      tarjetero.mostrar({ ...activa, x: c.x, y: c.y });
      return;
    }
    cerrar();
  };

  document.addEventListener("pointermove", alMover, { passive: true });
  document.addEventListener("pointerover", alPasar);
  document.addEventListener("pointerout", alSalir);
  document.addEventListener("pointerup", alSoltar);
  document.addEventListener("focusin", alEnfocar);
  document.addEventListener("focusout", alDesenfocar);
  document.addEventListener("keydown", alTeclear);
  window.addEventListener("scroll", alDesplazar, { passive: true });
  return () => {
    document.removeEventListener("pointermove", alMover);
    document.removeEventListener("pointerover", alPasar);
    document.removeEventListener("pointerout", alSalir);
    document.removeEventListener("pointerup", alSoltar);
    document.removeEventListener("focusin", alEnfocar);
    document.removeEventListener("focusout", alDesenfocar);
    document.removeEventListener("keydown", alTeclear);
    window.removeEventListener("scroll", alDesplazar);
    cancelarCierre();
    cancelarCambio();
    if (activa) limpiar(activa.svg);
  };
}

/** Lo que el imán escribió en un atributo (los puntos de una figura, la punta de una línea), para saber si React lo cambió. */
interface Escrito {
  base: Punto[];
  escrito: string;
}

const leerPuntos = (attr: string | null): Punto[] =>
  (attr ?? "")
    .trim()
    .split(/\s+/)
    .flatMap((par) => {
      const [x, y] = par.split(",").map(Number);
      return Number.isFinite(x) && Number.isFinite(y) ? [{ x, y }] : [];
    });

/**
 * El IMÁN del radar (la cuenta, en lib/tests-diagnostico/iman-del-radar.ts): cada vértice (de todas las áreas), sus
 * figuras, el halo de lo que más frena y su flecha al objetivo (`data-iman-x/y`), y el resalte (termina en el vértice) se
 * corren un poco hacia el cursor; el movimiento se suaviza cuadro a cuadro. La grilla y los rótulos quedan fijos.
 *
 * Las piezas se buscan en cada cuadro y la base de lo que se reescribe se recuerda aparte: en La escala, React vuelve a
 * dibujar el radar (sumar un área, ubicar con las reuniones) y el imán toma lo nuevo sin correr dos veces lo mismo.
 */
export function imanDelRadar(raiz: HTMLElement): () => void {
  const estado = new WeakMap<SVGSVGElement, { m: Punto | null; objetivo: Punto; peso: number; caja: DOMRect }>();
  const escritos = new WeakMap<Element, Escrito>();
  /** La base de un atributo: la que el imán recuerda, salvo que React lo haya cambiado desde la última escritura. */
  const base = (el: Element, leer: () => string | null, desde: () => Punto[]): Punto[] => {
    const e = escritos.get(el);
    if (e && e.escrito === leer()) return e.base;
    const b = desde();
    escritos.set(el, { base: b, escrito: leer() ?? "" });
    return b;
  };
  const anotar = (el: Element, escrito: string) => {
    const e = escritos.get(el);
    if (e) e.escrito = escrito;
  };
  const radares = () => [...raiz.querySelectorAll<SVGSVGElement>(SVG)];

  let cuadro = 0;
  let cursor: Punto | null = null;
  const dibujar = () => {
    cuadro = 0;
    let falta = false;
    for (const svg of radares()) {
      const r = estado.get(svg);
      if (!r || !r.caja.width || !r.m) continue;
      r.m.x += (r.objetivo.x - r.m.x) * IMAN.suavizado;
      r.m.y += (r.objetivo.y - r.m.y) * IMAN.suavizado;
      r.peso += (1 - r.peso) * IMAN.suavizado;
      if (Math.abs(r.objetivo.x - r.m.x) > 0.3 || Math.abs(r.objetivo.y - r.m.y) > 0.3 || r.peso < 0.98) falta = true;
      // De píxeles de pantalla a unidades del dibujo.
      const k = svg.viewBox.baseVal.width / r.caja.width || 1;
      const m = r.m;
      const peso = r.peso;
      const hacia = (p: Punto) => {
        const d = imanHacia(p.x, p.y, m.x, m.y, IMAN.amplitudPx * k, IMAN.radioPx * k);
        return { x: d.x * peso, y: d.y * peso };
      };
      for (const el of svg.querySelectorAll<SVGGraphicsElement>(".rde-vertice, .rde-iman")) {
        let p: Punto | null = null;
        if (el.dataset.imanX && el.dataset.imanY) p = { x: Number(el.dataset.imanX), y: Number(el.dataset.imanY) };
        else {
          const c = el instanceof SVGCircleElement ? el : el.querySelector("circle");
          if (c) p = { x: c.cx.baseVal.value, y: c.cy.baseVal.value };
        }
        if (!p) continue;
        const d = hacia(p);
        el.style.translate = `${d.x.toFixed(2)}px ${d.y.toFixed(2)}px`;
      }
      for (const fig of svg.querySelectorAll<SVGPolygonElement>(".rde-figura")) {
        const puntos = base(fig, () => fig.getAttribute("points"), () => leerPuntos(fig.getAttribute("points")));
        const nuevo = puntos
          .map((p) => {
            const d = hacia(p);
            return `${(p.x + d.x).toFixed(1)},${(p.y + d.y).toFixed(1)}`;
          })
          .join(" ");
        fig.setAttribute("points", nuevo);
        anotar(fig, nuevo);
      }
      for (const l of svg.querySelectorAll<SVGLineElement>(".rde-eje-resalte")) {
        const [p] = base(l, () => `${l.getAttribute("x2")},${l.getAttribute("y2")}`, () => [{ x: l.x2.baseVal.value, y: l.y2.baseVal.value }]);
        const d = hacia(p);
        const x2 = (p.x + d.x).toFixed(1);
        const y2 = (p.y + d.y).toFixed(1);
        l.setAttribute("x2", x2);
        l.setAttribute("y2", y2);
        anotar(l, `${x2},${y2}`);
      }
    }
    if (falta) cuadro = requestAnimationFrame(dibujar);
  };
  /** Dónde está el cursor en las unidades de cada radar (se mide cada vez: al abrir, la cabecera todavía entra). */
  const apuntar = () => {
    if (!cursor) return;
    for (const svg of radares()) {
      const caja = svg.getBoundingClientRect();
      if (!caja.width) continue;
      const vb = svg.viewBox.baseVal;
      const objetivo = { x: vb.x + ((cursor.x - caja.left) / caja.width) * vb.width, y: vb.y + ((cursor.y - caja.top) / caja.height) * vb.height };
      // La primera vez arranca donde está el cursor: suavizar desde (0, 0) los corría hacia arriba a la izquierda. El tirón
      // entra de a poco (`peso`): de golpe, el primer movimiento del mouse corría toda la figura en un cuadro.
      const r = estado.get(svg);
      if (r) Object.assign(r, { caja, objetivo });
      else estado.set(svg, { caja, objetivo, m: { ...objetivo }, peso: 0 });
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

/** Con «reducir movimiento» no hay imán; sin mouse (el teléfono) tampoco: no hay cursor que seguir. */
export const conIman = () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches && window.matchMedia("(pointer: fine)").matches;
