import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { RAW_NEUTRAL_RE, RAW_NEUTRAL_MSG } from "./lib/ui/raw-neutral.mjs";

// ── Vocabulario de UI: tokens + anti-slab en UN solo guard ──────────────────────
//
// ⚠ POR QUÉ un solo objeto: en flat config, dos config objects que definen la
// MISMA regla (`no-restricted-syntax`) sobre archivos solapados NO se fusionan —
// el último REEMPLAZA al primero por completo. Eso mató en silencio al guard de
// tokens durante semanas (el guard de slabs, declarado después, lo pisaba en todo
// .tsx) y entraron ~2.4k grises crudos sin una sola marca. Por eso:
//   1. Ambas familias de selectores viven en UN `no-restricted-syntax`.
//   2. El meta-test lib/ui/eslint-guards.test.ts verifica la config RESUELTA de
//      un .tsx real — si alguien agrega un tercer guard con la misma clave, el
//      test lo caza el mismo día, no semanas después.
//   3. El regex de gris crudo vive en lib/ui/raw-neutral.mjs, compartido con el
//      ratchet lib/ui/token-vocab.test.ts (el que FRENA el merge; esto es warn).
//
// Familia TOKENS (blindaje del tema claro/oscuro): marca los neutros CRUDOS de
// Tailwind en la UI interna. Esos grises no "flipean" en modo claro: el tema vive
// en tokens semánticos (bg-surface, text-fg, border-line…). Excluye lo
// legítimamente hardcodeado (landing/external/print/login/particle-field/
// TimelineSection), donde el hex literal es a propósito.
const TOKEN_SELECTORS = [
  {
    selector: `JSXAttribute[name.name='className'] Literal[value=/${RAW_NEUTRAL_RE}/]`,
    message: RAW_NEUTRAL_MSG,
  },
  {
    selector: `JSXAttribute[name.name='className'] TemplateElement[value.raw=/${RAW_NEUTRAL_RE}/]`,
    message: RAW_NEUTRAL_MSG,
  },
];

// Familia ANTI-SLAB (vocabulario de skeletons): un "slab opaco" es un rectángulo
// relleno GRANDE sin estructura interna — ocupa el espacio pero no comunica qué
// viene. El átomo `Skeleton` es una LÍNEA; más de h-12 va en `SkeletonPanel`.
// Warn mientras corre la migración (olas 3-5 pendientes) → error al cerrarla.
// Sin backslashes a propósito (el selector de esquery los re-escapa mal).
const SLAB_H_RE = "(?:^| )h-(?:1[3-9]|[2-9][0-9]|screen|full)(?: |$)";
const SLAB_MSG =
  "Slab opaco: un <Skeleton> alto (más de h-12) y vacío ocupa espacio sin comunicar qué viene. Usá <SkeletonPanel minH=\"…\"> (cáscara delineada) y poné el shimmer en las líneas de adentro. Referencias: components/clients/skeletons.tsx y TableSkeleton.";

const SLAB_SELECTORS = [
  // <Skeleton className="… h-64 …" /> SIN hijos → es un panel disfrazado de línea.
  {
    selector: `JSXElement[openingElement.name.name='Skeleton'][children.length=0] JSXAttribute[name.name='className'] Literal[value=/${SLAB_H_RE}/]`,
    message: SLAB_MSG,
  },
  // El mismo defecto escrito a mano: un div con la clase de shimmer y altura grande.
  {
    selector: `JSXAttribute[name.name='className'] Literal[value=/skeleton-shimmer/][value=/${SLAB_H_RE}/]`,
    message: SLAB_MSG,
  },
];

// 1) Guard unificado: tokens + slab sobre la UI interna (todo menos exentos de tokens).
const uiVocabGuard = {
  files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
  ignores: [
    // Exentos de AMBAS familias (motor .stl / superficies externas):
    "components/landing/**",
    "app/external/**",
    "app/print/**",
    // Exentos SOLO de tokens (hex/gris literal a propósito) — el guard de slabs
    // se les re-aplica abajo:
    "app/page.tsx",
    "components/particle-field/**",
    "components/canvas/TimelineSection.tsx",
  ],
  rules: {
    "no-restricted-syntax": ["warn", ...TOKEN_SELECTORS, ...SLAB_SELECTORS],
  },
};

// 2) Re-aplica SOLO el anti-slab a los archivos que el guard unificado exime de
//    tokens. DEBE ir DESPUÉS de uiVocabGuard en el array (último gana — esta vez
//    a favor).
const slabOnlyGuard = {
  files: ["app/page.tsx", "components/particle-field/**/*.{ts,tsx}", "components/canvas/TimelineSection.tsx"],
  rules: {
    "no-restricted-syntax": ["warn", ...SLAB_SELECTORS],
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  uiVocabGuard,
  slabOnlyGuard,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
