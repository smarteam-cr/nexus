"use client";

/**
 * lib/theme.ts — fuente única de la lógica de tema en cliente.
 *
 * La verdad del tema vive en la cookie `nexus-theme`, que el SSR lee en
 * `app/layout.tsx` y materializa como `<html class="light">` (sin parpadeo).
 * Acá centralizamos el "aplicar tema" y un hook reactivo compartido para que el
 * toggle de Configuración y el del submenú del avatar usen exactamente la misma
 * escritura (clase + cookie + localStorage) y se mantengan EN SYNC entre sí
 * (vía THEME_EVENT). Default del producto: claro.
 */
import { useCallback, useSyncExternalStore } from "react";

export const THEME_COOKIE = "nexus-theme";
/** Evento same-tab que emite applyTheme → los hooks useTheme montados se re-sincronizan. */
export const THEME_EVENT = "nexus-theme-change";
const ONE_YEAR = 60 * 60 * 24 * 365;

export type Theme = "light" | "dark";

/** Aplica el tema: clase en <html>, cookie (fuente de verdad del SSR), localStorage (compat). */
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("light", theme === "light");
  document.cookie = `${THEME_COOKIE}=${theme};path=/;max-age=${ONE_YEAR};SameSite=Lax`;
  try {
    localStorage.setItem("theme", theme);
  } catch {
    /* no-op */
  }
  // Notifica a todos los useTheme de la pestaña (toggle de /settings + submenú del avatar)
  // para que su estado no se desincronice cuando se togglea desde otro control.
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** Lee el tema actual del DOM (post-hidratación; en server no se llama). */
export function currentTheme(): Theme {
  return typeof document !== "undefined" &&
    document.documentElement.classList.contains("light")
    ? "light"
    : "dark";
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(THEME_EVENT, onChange);
  return () => window.removeEventListener(THEME_EVENT, onChange);
}

/**
 * Estado del tema reactivo y compartido. `serverIsDark` es el valor que el SERVER ya
 * conoce (de la cookie) para que el primer render coincida con el SSR sin parpadeo;
 * componentes cuya UI temática no se renderiza en SSR (p.ej. un menú cerrado) pueden
 * omitirlo. Todos los consumidores se re-sincronizan vía THEME_EVENT al togglear.
 */
export function useTheme(serverIsDark = false): { isDark: boolean; toggle: () => void } {
  const isDark = useSyncExternalStore(
    subscribe,
    () => currentTheme() === "dark",
    () => serverIsDark,
  );
  const toggle = useCallback(() => {
    applyTheme(currentTheme() === "dark" ? "light" : "dark");
  }, []);
  return { isDark, toggle };
}
