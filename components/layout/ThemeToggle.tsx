"use client";

import { useTheme, type Theme } from "@/lib/theme";

export default function ThemeToggle({
  initialTheme = "light",
}: {
  /** Lo pasa el server desde la cookie → server y cliente renderizan igual (sin hydration
   *  mismatch ni setState en useEffect). La cookie sigue siendo la fuente de verdad. */
  initialTheme?: Theme;
}) {
  // Estado compartido vía useTheme → si el tema cambia desde el submenú del avatar, este
  // toggle se re-sincroniza solo (y viceversa). serverIsDark mantiene el render SSR sin parpadeo.
  const { isDark, toggle } = useTheme(initialTheme === "dark");

  return (
    <button
      onClick={toggle}
      title={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      className="flex items-center justify-center w-7 h-7 rounded-lg text-fg-muted hover:text-fg-secondary hover:bg-surface-hover transition-colors"
    >
      {isDark ? (
        // Luna → estamos en oscuro, clic cambia a claro
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
      ) : (
        // Sol → estamos en claro, clic cambia a oscuro
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z"
          />
        </svg>
      )}
    </button>
  );
}
