"use client";

/**
 * components/canvas/useLandingMotion.ts
 *
 * Reescritura como hooks de React del reveal-on-scroll + parallax del hero de
 * `Landings/shared/app.js`. Clave: el landing interno vive dentro de un panel con
 * su PROPIO scroll (`div.overflow-y-auto`), no en `window`. Los hooks resuelven el
 * contenedor de scroll correcto con `findScrollParent` (fallback a viewport para la
 * ruta pública de Fase C). Respetan `prefers-reduced-motion`.
 */

import { useEffect, type RefObject } from "react";

/** Sube por el DOM hasta el primer ancestro con overflow-y auto/scroll.
 *  null = no hay contenedor scrollable → el observer/parallax usan el viewport. */
export function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const oy = getComputedStyle(node).overflowY;
    if (oy === "auto" || oy === "scroll" || oy === "overlay") return node;
    node = node.parentElement;
  }
  return null;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Reveal-on-scroll de los `.reveal` dentro de `containerRef`. Observa con el
 * scroll-parent del panel como `root`. Re-corre cuando cambian `deps` (los
 * `.reveal` aparecen recién después de cargar los datos).
 */
export function useReveal(
  containerRef: RefObject<HTMLElement | null>,
  deps: unknown[] = [],
  // `immediate` (edición): sin animación de entrada → revelar al instante, incluido el
  // contenido que aparece async. Editar debe mostrar todo ya, no depender del scroll.
  immediate = false,
) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const noAnim = immediate || prefersReducedMotion() || typeof IntersectionObserver === "undefined";
    const observer = noAnim
      ? null
      : new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                entry.target.classList.add("is-visible");
                observer!.unobserve(entry.target);
              }
            });
          },
          { root: findScrollParent(container), threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
        );

    const arm = (el: HTMLElement) => {
      if (el.classList.contains("is-visible")) return;
      if (noAnim) el.classList.add("is-visible");
      else observer!.observe(el);
    };
    container.querySelectorAll<HTMLElement>(".reveal").forEach(arm);

    // Contenido que se monta DESPUÉS del effect (ctx async del editor: cronograma/
    // procesos/cierre se pintan al volver el fetch). Sin esto sus `.reveal` nunca se
    // observan → quedan en opacity:0 y la sección se ve VACÍA. El renderer viejo lo
    // evitaba re-corriendo el effect con timeline/procesos en sus deps; acá lo cubre un
    // MutationObserver general (sirve para cualquier contenido async, no solo kickoff).
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const node of m.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.classList.contains("reveal")) arm(node);
          node.querySelectorAll?.<HTMLElement>(".reveal").forEach(arm);
        }
      }
    });
    mo.observe(container, { childList: true, subtree: true });

    return () => {
      observer?.disconnect();
      mo.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Parallax de las dos capas del `.hero-backdrop` referenciado por `heroRef`.
 * Escucha el scroll del contenedor correcto (panel o window) + rAF, y setea
 * `--parallax-slow/-fast`. No-op si `prefers-reduced-motion`.
 */
export function useHeroParallax(heroRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero || prefersReducedMotion()) return;

    const scrollParent = findScrollParent(hero);
    const target: HTMLElement | Window = scrollParent ?? window;

    let ticking = false;
    const update = () => {
      ticking = false;
      const rect = hero.getBoundingClientRect();
      const vh = window.innerHeight;
      if (rect.bottom < -200 || rect.top > vh + 200) return;
      const scrollRel = -rect.top; // viewport-relativo: sirve con scroll de panel o window
      hero.style.setProperty("--parallax-slow", `${scrollRel * 0.18}px`);
      hero.style.setProperty("--parallax-fast", `${scrollRel * 0.38}px`);
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };

    target.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    update();
    return () => {
      target.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [heroRef]);
}
