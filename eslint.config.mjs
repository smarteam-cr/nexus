import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// ── Blindaje del tema claro/oscuro ──────────────────────────────────────────────
// Marca (warn) los neutros CRUDOS de Tailwind en la UI interna. Esos grises no
// "flipean" en modo claro: el tema vive en tokens semánticos (bg-surface, text-fg,
// border-line…) que sí resuelven a la variable correcta en cada modo. Usar un gris
// crudo nuevo reproduce el bug de "lo nuevo se ve oscuro en claro". La regla NO
// rompe el build (warn) — aparece en el `eslint` de lo tocado para corregirlo al
// escribirlo. Excluye lo que es legítimamente hardcodeado (landing/external/login/
// print/TimelineSection), donde el hex literal es a propósito.
const RAW_NEUTRAL_RE =
  "(?:bg|text|border|ring|divide|from|via|to)-gray-[0-9]|(?:bg|text)-(?:white|black)(?:[^-a-z]|$)";
const RAW_NEUTRAL_MSG =
  "Usá tokens semánticos del tema (bg-surface · bg-surface-muted · bg-surface-hover · border-line · text-fg · text-fg-secondary · text-fg-muted · text-brand). Los grises crudos (bg-gray-*, text-white, etc.) no flipean en modo claro. Scrims que deben ser oscuros en ambos modos: usá bg-black/NN.";

const themeTokenGuard = {
  files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
  ignores: [
    "components/landing/**",
    "app/external/**",
    "app/print/**",
    "app/page.tsx",
    "components/particle-field/**",
    "components/canvas/TimelineSection.tsx",
  ],
  rules: {
    "no-restricted-syntax": [
      "warn",
      {
        selector: `JSXAttribute[name.name='className'] Literal[value=/${RAW_NEUTRAL_RE}/]`,
        message: RAW_NEUTRAL_MSG,
      },
      {
        selector: `JSXAttribute[name.name='className'] TemplateElement[value.raw=/${RAW_NEUTRAL_RE}/]`,
        message: RAW_NEUTRAL_MSG,
      },
    ],
  },
};

// ── Blindaje anti-slab (vocabulario de skeletons) ───────────────────────────────
// Un "slab opaco" es un rectángulo relleno GRANDE sin estructura interna: ocupa el
// espacio pero no comunica qué viene, y se lee peor que un vacío. El átomo `Skeleton`
// es una LÍNEA (chip, avatar, botón): más de 48px de alto ya no se lee como "una línea
// de contenido" sino como "un panel que no dice nada" — y para eso está `SkeletonPanel`,
// que delinea la cáscara y pone el shimmer en los hijos.
// Warn mientras corre la migración (olas 3-5 pendientes) → error al cerrarla.
// Sin backslashes a propósito (el selector de esquery los re-escapa mal): los
// classnames van separados por espacios, así que alcanza con delimitar por espacio.
const SLAB_H_RE = "(?:^| )h-(?:1[3-9]|[2-9][0-9]|screen|full)(?: |$)";
const SLAB_MSG =
  "Slab opaco: un <Skeleton> alto (más de h-12) y vacío ocupa espacio sin comunicar qué viene. Usá <SkeletonPanel minH=\"…\"> (cáscara delineada) y poné el shimmer en las líneas de adentro. Referencias: components/clients/skeletons.tsx y TableSkeleton.";

const skeletonSlabGuard = {
  files: ["app/**/*.tsx", "components/**/*.tsx"],
  ignores: ["components/landing/**", "app/external/**", "app/print/**"],
  rules: {
    "no-restricted-syntax": [
      "warn",
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
    ],
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  themeTokenGuard,
  skeletonSlabGuard,
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
