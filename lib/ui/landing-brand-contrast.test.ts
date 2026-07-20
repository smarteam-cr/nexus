/**
 * lib/ui/landing-brand-contrast.test.ts — GUARD PERMANENTE de la línea gráfica.
 *
 * El retema 2026-07 (marca Smarteam: navy/royal/naranja) se diseñó par por par
 * contra la matriz de contraste del doc de marca (prompt-linea-grafica.md):
 * texto naranja/coral NUNCA sobre navy/royal; coral solo display sobre oscuro;
 * AA 4.5:1 texto normal / 3:1 display, medido contra el fondo REAL del elemento.
 *
 * Este test fija esa matriz con matemática de luminancia WCAG pura (cero deps):
 * si alguien mueve un token de app/landing-engine.css o app/kickoff-landing.css
 * a un par ilegal, el merge FRENA acá con el ratio exacto. Además verifica que
 * los DOS archivos declaren los MISMOS valores (gemelos con nombres distintos)
 * y que la menta Insider (#42E4B3) siga en CERO usos en el motor.
 *
 * Mismo patrón fs-scan que skeleton-vocab.test.ts / token-vocab.test.ts.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();
const ENGINE = fs.readFileSync(path.join(RAIZ, "app", "landing-engine.css"), "utf8");
const KICKOFF = fs.readFileSync(path.join(RAIZ, "app", "kickoff-landing.css"), "utf8");

// ── Luminancia relativa + ratio WCAG (sRGB linealizado) ──────────────────────
function lum(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(fg: string, bg: string): number {
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

/** Lee el valor de un token en un bloque CSS (primer match). */
function token(css: string, name: string): string {
  const m = css.match(new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`));
  if (!m) throw new Error(`token ${name} no encontrado o no es un hex simple`);
  return m[1].toUpperCase();
}

// ── La paleta como está DECLARADA hoy en los archivos ────────────────────────
const P = {
  blue: token(ENGINE, "--blue"),
  text: token(ENGINE, "--text"),
  text2: token(ENGINE, "--text-2"),
  muted: token(ENGINE, "--text-muted"),
  bg: "#FFFFFF",
  tint: token(ENGINE, "--bg-soft"),
  darkBg: token(ENGINE, "--dark-bg"),
  darkCard: token(ENGINE, "--dark-card"),
  darkText2: token(ENGINE, "--dark-text-2"),
  accentBtn: token(ENGINE, "--accent-btn"),
  cream: token(ENGINE, "--teal-soft"), // alias histórico → crema
};

describe("los dos archivos declaran los MISMOS valores (gemelos)", () => {
  const pares: Array<[string, string]> = [
    ["--blue", "--brand-blue"],
    ["--blue-dark", "--brand-blue-dark"],
    ["--teal", "--brand-teal"],
    ["--teal-dark", "--brand-teal-dark"],
    ["--teal-soft", "--brand-teal-soft"],
    ["--dark-bg", "--dark-bg"],
    ["--dark-card", "--dark-bg-card"],
    ["--text", "--text"],
  ];
  for (const [engineName, kickoffName] of pares) {
    it(`${engineName} == ${kickoffName}`, () => {
      expect(token(ENGINE, engineName)).toBe(token(KICKOFF, kickoffName));
    });
  }
});

describe("matriz de contraste de la marca (AA, contra el fondo REAL)", () => {
  const casos: Array<[string, string, string, number]> = [
    // [descripción, fg, bg, mínimo]
    ["tinta sobre paper", P.text, P.bg, 4.5],
    ["tinta sobre tint", P.text, P.tint, 4.5],
    ["secundario sobre paper", P.text2, P.bg, 4.5],
    ["secundario sobre tint", P.text2, P.tint, 4.5],
    ["muted sobre paper", P.muted, P.bg, 4.5],
    ["muted sobre tint (la restricción dominante)", P.muted, P.tint, 4.5],
    ["royal (links) sobre paper", P.blue, P.bg, 4.5],
    ["royal (links) sobre tint", P.blue, P.tint, 4.5],
    ["blanco sobre navy", "#FFFFFF", P.darkBg, 4.5],
    ["blanco sobre card navy", "#FFFFFF", P.darkCard, 4.5],
    ["secundario-dark sobre navy", P.darkText2, P.darkBg, 4.5],
    ["secundario-dark sobre card navy", P.darkText2, P.darkCard, 4.5],
    ["acento eyebrow claro (#C2400F) sobre paper", "#C2400F", P.bg, 4.5],
    ["acento eyebrow claro (#C2400F) sobre tint", "#C2400F", P.tint, 4.5],
    ["acento dark (#1E8FF6) sobre navy", "#1E8FF6", P.darkBg, 4.5],
    ["coral DISPLAY sobre navy (3:1 large)", "#F87B5B", P.darkBg, 3],
    ["naranja DISPLAY sobre paper (3:1 large)", "#E8481C", P.bg, 3],
    ["blanco sobre botón naranja (3:1 AA-large 19px/700)", "#FFFFFF", P.accentBtn, 3],
    ["blanco sobre chip naranja profundo (#C2400F)", "#FFFFFF", "#C2400F", 4.5],
    ["positivo (#07429A) sobre crema", "#07429A", P.cream, 4.5],
    ["tinta sobre crema", P.text, P.cream, 4.5],
  ];
  for (const [desc, fg, bg, min] of casos) {
    it(`${desc} ≥ ${min}:1`, () => {
      const r = ratio(fg, bg);
      expect(r, `${fg} sobre ${bg} da ${r.toFixed(2)}:1 (mínimo ${min}:1)`).toBeGreaterThanOrEqual(min);
    });
  }
});

describe("reglas duras de la marca", () => {
  it("la menta Insider #42E4B3 tiene CERO usos en el motor (reservada)", () => {
    for (const [name, css] of [["landing-engine.css", ENGINE], ["kickoff-landing.css", KICKOFF]] as const) {
      expect(css.includes("42E4B3") || css.includes("42e4b3"), `${name} contiene la menta reservada`).toBe(false);
      expect(css.includes("rgba(66, 228, 179") || css.includes("rgba(66,228,179"), `${name} contiene rgba de la menta`).toBe(false);
    }
  });

  it("texto naranja/coral NUNCA como --accent del tema dark (solo #1E8FF6)", () => {
    const m = ENGINE.match(/\.stl-dark\s*\{[^}]*--accent:\s*(#[0-9A-Fa-f]{6})/);
    expect(m?.[1]?.toUpperCase()).toBe("#1E8FF6");
  });

  it("el easing de marca está en ambos archivos", () => {
    for (const css of [ENGINE, KICKOFF]) {
      expect(css).toContain("cubic-bezier(0.22, 0.61, 0.36, 1)");
    }
  });

  it("la familia única es Jakarta (cero referencias a Montserrat/Open Sans en el motor)", () => {
    for (const css of [ENGINE, KICKOFF]) {
      expect(css.includes("--font-montserrat") || css.includes("--font-open-sans")).toBe(false);
      expect(css).toContain("--font-jakarta");
    }
  });
});
