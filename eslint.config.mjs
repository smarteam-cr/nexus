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

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  themeTokenGuard,
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
