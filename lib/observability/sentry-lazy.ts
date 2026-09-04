/**
 * lib/observability/sentry-lazy.ts — Sentry del NAVEGADOR bajo demanda (C-14, 2026-09-04).
 *
 * `import * as Sentry from "@sentry/nextjs"` en cualquier módulo de cliente mete el SDK entero en
 * el chunk raíz que TODA página descarga, con DSN o sin él. Medido el 2026-09-04 sobre el build
 * de verificación: 426 KB de los 674 KB de `rootMainFiles` eran ese chunk. El SDK solo hace algo
 * cuando hay `NEXT_PUBLIC_SENTRY_DSN`, así que el bundle lo pide con `import()` recién ahí: sin
 * DSN nunca se descarga; con DSN llega en un chunk aparte, después de la hidratación, y nada
 * lo espera.
 *
 * ⚠ `process.env.NEXT_PUBLIC_SENTRY_DSN` se escribe LITERAL a propósito: Next lo inlinea en el
 * build; leído a través de una variable no se inlinea y el gate deja de ser estático.
 * ⚠ Solo para código que corre en el navegador. El servidor (instrumentation.ts, rutas, jobs)
 * sigue importando el SDK estático: ahí no hay bundle que cuidar y sí hay que capturar en línea.
 */
type SdkDeSentry = typeof import("@sentry/nextjs");

let sdk: Promise<SdkDeSentry> | null = null;

/** El SDK del navegador, cargado una sola vez. `null` sin DSN: no hay nada que cargar. */
export function sentryDelNavegador(): Promise<SdkDeSentry> | null {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return null;
  sdk ??= import("@sentry/nextjs");
  return sdk;
}

/**
 * Corre `fn` con el SDK si hay DSN; sin DSN no hace nada (igual que el no-op del SDK sin init).
 * Nunca lanza: un fallo al cargar Sentry no puede tumbar un error boundary ni un toast.
 */
export function conSentry(fn: (Sentry: SdkDeSentry) => void): void {
  const p = sentryDelNavegador();
  if (!p) return;
  p.then(fn).catch(() => {});
}
