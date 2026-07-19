/**
 * lib/ui/scan-source.ts — walker compartido de los tests de vocabulario de UI
 * (skeleton-vocab, token-vocab). Escanea el fuente con fs y afirma sobre el
 * código, mismo patrón estructural que lib/cobranza/costos-privacy.test.ts.
 *
 * Dos listas de exención, una por familia de guard:
 *   EXENTOS_STL    → skeletons/slabs: superficies que renderizan con el motor
 *                    `.stl` (externo/PDF), estilos inline a propósito.
 *   EXENTOS_TOKENS → tokens: las anteriores MÁS las superficies con hex/gris
 *                    literal deliberado. Espeja 1:1 los `ignores` del guard de
 *                    tokens en eslint.config.mjs (el meta-test
 *                    eslint-guards.test.ts vigila que sigan alineados).
 */
import fs from "node:fs";
import path from "node:path";

export const RAIZ = process.cwd();

export const EXENTOS_STL = [
  path.join("components", "landing"),
  path.join("app", "external"),
  path.join("app", "print"),
];

export const EXENTOS_TOKENS = [
  ...EXENTOS_STL,
  path.join("app", "page.tsx"),
  path.join("components", "particle-field"),
  path.join("components", "canvas", "TimelineSection.tsx"),
];

export function listarTsx(dir: string, acc: string[] = []): string[] {
  const abs = path.join(RAIZ, dir);
  if (!fs.existsSync(abs)) return acc;
  for (const entrada of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === "node_modules" || entrada.name.startsWith(".")) continue;
      listarTsx(rel, acc);
    } else if (entrada.name.endsWith(".tsx") || entrada.name.endsWith(".ts")) {
      acc.push(rel);
    }
  }
  return acc;
}

/** app/** + components/** menos la lista de exentos que corresponda al guard. */
export function archivosUi(exentos: readonly string[]): string[] {
  const exento = (rel: string) => exentos.some((e) => rel.startsWith(e));
  return [...listarTsx("app"), ...listarTsx("components")].filter((f) => !exento(f));
}
