"use client";

/**
 * components/external/test/AnimacionesDelResultado.tsx — EL MOVIMIENTO de la página de resultado del test (29 oct), como
 * el de la aplicación vieja (`assets/js/anim.js` y `wireRadar` de resultado.js):
 *   · las secciones que están más abajo de la pantalla aparecen subiendo un poco cuando el visitante llega a ellas
 *     (`[data-revela]`);
 *   · cada barra de «Cómo está cada parte» se llena desde cero y su puntaje cuenta hasta el valor, una tras otra
 *     (`[data-fill]` y `[data-count]`, dentro de cada `.rd-fila`);
 *   · al pasar el cursor (o tocar) una dimensión del radar, se resaltan su eje, su vértice y su rótulo (`[data-d]` de
 *     RadarDeUnaEmpresa; el aspecto, en radar-de-una-empresa.css).
 * La página llega del servidor ya completa (las barras llenas, los números puestos): este componente solo esconde lo
 * que todavía no se ve para animarlo al llegar. Lo que ya está en pantalla al abrir no se toca (no parpadea), y con
 * «reducir movimiento» no se anima nada. «Llegar» es que su borde de arriba entró en la pantalla, se mire con el scroll
 * (no con IntersectionObserver: con un salto, a un enlace o arrastrando la barra, lo que se pasó de largo quedaba
 * escondido para siempre). Es el `<main>` de la página; el PDF no lo usa.
 */
import { useEffect, useRef, type ReactNode } from "react";

/** Cuánto tarda en llenarse una barra (la misma duración que su transición en resultado.css) y el desfase entre filas. */
const DURACION_MS = 1600;
const DESFASE_MS = 140;
const suave = (t: number) => 1 - Math.pow(1 - t, 3);

/** Lo que está por debajo del borde de la pantalla al abrir: eso es lo único que se anima. */
const debajoDeLaPantalla = (el: Element) => el.getBoundingClientRect().top > window.innerHeight * 0.92;
/** Ya llegó: su borde de arriba entró en la pantalla (o ya quedó arriba, si se saltó hasta más abajo). */
const yaLlego = (el: Element) => el.getBoundingClientRect().top < window.innerHeight * 0.88;

function contar(span: HTMLElement, hasta: number, retraso: number) {
  let t0: number | undefined;
  const paso = (ts: number) => {
    if (t0 === undefined) t0 = ts;
    const p = Math.min(1, Math.max(0, (ts - t0 - retraso) / DURACION_MS));
    span.textContent = String(Math.round(suave(p) * hasta));
    if (p < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

/** El resalte del radar: la dimensión bajo el cursor (o el dedo), en el SVG donde está. Devuelve cómo soltarlo. */
function resaltarElRadar(raiz: HTMLElement): () => void {
  const activar = (svg: SVGSVGElement, clave: string | null) => {
    if ((svg.dataset.activa ?? null) === clave) return;
    if (clave) svg.dataset.activa = clave;
    else delete svg.dataset.activa;
    svg.querySelectorAll<SVGElement>("[data-d]").forEach((el) => el.classList.toggle("is-activa", el.dataset.d === clave));
  };
  const alPasar = (e: PointerEvent) => {
    const t = e.target as Element | null;
    const svg = t?.closest?.("svg.rde-interactivo") as SVGSVGElement | null;
    raiz.querySelectorAll<SVGSVGElement>("svg.rde-interactivo[data-activa]").forEach((otro) => otro !== svg && activar(otro, null));
    if (svg) activar(svg, (t?.closest?.("[data-d]") as SVGElement | null)?.dataset.d ?? null);
  };
  const alSalir = (e: PointerEvent) => {
    // Con el dedo, el resalte se queda al levantarlo (o al empezar a desplazar): se va al tocar otra cosa (`alPasar`).
    if (e.pointerType === "touch") return;
    const svg = (e.target as Element | null)?.closest?.("svg.rde-interactivo") as SVGSVGElement | null;
    const hacia = e.relatedTarget as Node | null;
    if (svg && !(hacia && svg.contains(hacia))) activar(svg, null);
  };
  raiz.addEventListener("pointerover", alPasar);
  raiz.addEventListener("pointerout", alSalir);
  return () => {
    raiz.removeEventListener("pointerover", alPasar);
    raiz.removeEventListener("pointerout", alSalir);
  };
}

export default function AnimacionesDelResultado({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const raiz = ref.current;
    if (!raiz) return;
    const soltarElRadar = resaltarElRadar(raiz);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return soltarElRadar;

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
      const barra = fila.querySelector<HTMLElement>("[data-fill]");
      const num = fila.querySelector<HTMLElement>("[data-count]");
      fila.dataset.barra = "llena";
      fila.style.setProperty("--retraso", `${retraso}ms`);
      if (barra) requestAnimationFrame(() => requestAnimationFrame(() => (barra.style.width = `${barra.dataset.fill}%`)));
      if (num) contar(num, Number(num.dataset.count) || 0, retraso);
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
      completar();
    };
  }, []);

  return (
    <main ref={ref} className={className}>
      {children}
    </main>
  );
}
