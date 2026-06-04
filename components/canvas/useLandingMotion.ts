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
export function useReveal(containerRef: RefObject<HTMLElement | null>, deps: unknown[] = []) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const els = Array.from(container.querySelectorAll<HTMLElement>(".reveal"));
    if (els.length === 0) return;

    if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
      els.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const root = findScrollParent(container); // null → viewport
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { root, threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
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
