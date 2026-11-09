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
 *     dimensión (`[data-tarjeta]`, que la página trae escondida: ResultadoDelTestVista › TarjetaDeLaDimension). La tarjeta
 *     se deja alcanzar con el cursor en cualquier ancho (8 nov). El resalte, el puente a la tarjeta y el imán son el
 *     mismo código de La escala interna: components/escala/movimiento-del-radar.ts.
 * La página llega del servidor ya completa (las barras llenas, los números puestos): este componente solo esconde lo
 * que todavía no se ve para animarlo al llegar. Lo que ya está en pantalla al abrir no se toca (no parpadea), y con
 * «reducir movimiento» no se anima nada. «Llegar» es que su borde de arriba entró en la pantalla, se mire con el scroll
 * (no con IntersectionObserver: con un salto, a un enlace o arrastrando la barra, lo que se pasó de largo quedaba
 * escondido para siempre). Es el `<main>` de la página; el PDF no lo usa.
 *
 * `quieta` (La escala interna editable, 8 nov): la misma página dentro de la pantalla que la edita. Ahí solo queda el
 * resalte del radar y su tarjeta: sin el imán (corría los vértices mientras se arrastra un nivel) y sin la entrada de las
 * secciones (la pantalla interna se desplaza en su propio contenedor, no en la ventana: lo de abajo quedaba escondido).
 * Ahí tampoco es el `<main>` (la pantalla ya tiene el suyo), y una tarjeta cuyo texto se está editando
 * (`data-fijada`, TextoEditableDeLaPagina) no se cierra ni la reemplaza otra hasta terminar.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { conIman, imanDelRadar, resaltarElRadar, ubicarLaTarjeta, type Tarjetero } from "@/components/escala/movimiento-del-radar";

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

/**
 * La tarjeta de la página: viene escondida en el HTML del servidor, una por dimensión (`[data-tarjeta]`). El resalte, el
 * puente del cursor y el imán son los de La escala interna (components/escala/movimiento-del-radar.ts).
 */
function tarjetasDeLaPagina(raiz: HTMLElement): Tarjetero {
  let visible: HTMLElement | null = null;
  // Se está editando su texto (solo adentro): se queda abierta y en su lugar.
  const fijada = () => visible?.dataset.fijada === "1";
  const esconder = () => {
    if (!visible || fijada()) return;
    visible.classList.remove("is-visible");
    visible.hidden = true;
    visible = null;
  };
  return {
    mostrar: (t) => {
      const tip = raiz.querySelector<HTMLElement>(`[data-tarjeta="${CSS.escape(t.clave)}"]`);
      if (fijada() && visible !== tip) return;
      if (visible !== tip) esconder();
      if (!tip) return;
      visible = tip;
      tip.hidden = false;
      // `ubicarLaTarjeta` la mide ya sin `hidden` (con opacidad 0): desde ahí el fundido corre al marcarla visible.
      ubicarLaTarjeta(tip, t);
      tip.classList.add("is-visible");
    },
    ocultar: esconder,
    abierta: () => visible,
  };
}

export default function AnimacionesDelResultado({ className, quieta = false, children }: { className?: string; quieta?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const raiz = ref.current;
    if (!raiz) return;
    const soltarElRadar = resaltarElRadar(raiz, tarjetasDeLaPagina(raiz));
    if (quieta || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return soltarElRadar;
    const soltarElIman = conIman() ? imanDelRadar(raiz) : () => undefined;

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
  }, [quieta]);

  return (
    quieta ? (
      <div ref={ref} className={className}>
        {children}
      </div>
    ) : (
      <main ref={ref} className={className}>
        {children}
      </main>
    )
  );
}
