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
  // Sección "Qué se implementa": blanco y gris con el naranja de HubSpot SOLO en los
  // íconos. El naranja va sobre blanco y sobre `--hub-soft`, y como es un ícono —no
  // texto— el mínimo es el 3:1 de WCAG 1.4.11. El margen es CHICO (3.14 sobre el gris),
  // así que este par es el que impide oscurecer el gris sin darse cuenta.
  const hubAccent = token(ENGINE, "--hub-accent");
  const hubSoft = token(ENGINE, "--hub-soft");
  casos.push(
    ["ícono naranja de Hub sobre paper", hubAccent, P.bg, 3],
    ["ícono naranja de Hub sobre el gris de la sección", hubAccent, hubSoft, 3],
    ["tinta sobre el gris de la sección", P.text, hubSoft, 4.5],
    ["secundario sobre el gris de la sección", P.text2, hubSoft, 4.5],
    ["muted sobre el gris de la sección", P.muted, hubSoft, 4.5],
    // El borde de la píldora ENCENDIDA es lo que dice "seleccionada" —el relleno tiene
    // el techo del ícono—, así que es el borde de un control y le aplica el 3:1 de
    // WCAG 1.4.11. Aclararlo lo devuelve al estado en que no se notaba cuál estaba.
    ["borde de la píldora encendida sobre paper", token(ENGINE, "--hub-line-on"), P.bg, 3],
    /* El MISMO ícono naranja identifica la línea de licencia en la sección de Inversión, que
       en los dos templates es `theme: "soft"` ⇒ el fondo es `--bg-soft` y no el paper. Es el
       par más ajustado de la familia (3.05:1 contra el 3:1 de WCAG 1.4.11 para un ícono), así
       que aclarar el naranja o oscurecer el tinte se cae acá y no en la propuesta del cliente. */
    ["ícono naranja de Hub sobre el tinte de Inversión", hubAccent, P.tint, 3],
  );
  for (const [desc, fg, bg, min] of casos) {
    it(`${desc} ≥ ${min}:1`, () => {
      const r = ratio(fg, bg);
      expect(r, `${fg} sobre ${bg} da ${r.toFixed(2)}:1 (mínimo ${min}:1)`).toBeGreaterThanOrEqual(min);
    });
  }
});

// ── Paleta INTERNA (.stl-internal) ───────────────────────────────────────────
// Los documentos que el cliente NO ve (canvas Exploración) re-declaran la paleta a
// grises + UN ámbar. El guard tiene que cubrirla también: es el mismo motor y los
// mismos componentes, así que un par ilegal acá rompe igual la legibilidad.
const BLOQUE_INTERNO = ENGINE.match(/\.stl\.stl-internal\s*\{([^}]*)\}/)?.[1] ?? "";
function internalToken(name: string): string {
  const m = BLOQUE_INTERNO.match(new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`));
  if (!m) throw new Error(`token interno ${name} no encontrado en .stl.stl-internal`);
  return m[1].toUpperCase();
}

describe("paleta interna (.stl-internal): gris + UN ámbar, y legible", () => {
  it("el bloque .stl.stl-internal existe y va DESPUÉS del bloque de marca", () => {
    expect(BLOQUE_INTERNO, "no se encontró el bloque .stl.stl-internal").not.toBe("");
    expect(ENGINE.indexOf(".stl.stl-internal")).toBeGreaterThan(ENGINE.indexOf(".stl {"));
  });

  // Si alguien mueve el bloque interno ARRIBA del de marca, `token()` (primer match)
  // empezaría a leer los grises y TODA la matriz de arriba pasaría a validar la paleta
  // equivocada en silencio. Este test lo vuelve imposible.
  it("los tokens de MARCA se siguen leyendo del bloque base, no del interno", () => {
    expect(P.blue).toBe("#0B58D3");
    expect(P.darkBg).toBe("#051849");
    expect(P.text).toBe("#051849");
  });

  const I = {
    bg: internalToken("--bg"),
    soft: internalToken("--bg-soft"),
    text: internalToken("--text"),
    text2: internalToken("--text-2"),
    muted: internalToken("--text-muted"),
    blue: internalToken("--blue"),
    darkBg: internalToken("--dark-bg"),
    darkCard: internalToken("--dark-card"),
    darkText2: internalToken("--dark-text-2"),
    flag: internalToken("--flag"),
    flagSoft: internalToken("--flag-soft"),
  };

  const casos: Array<[string, string, string, number]> = [
    ["tinta sobre blanco", I.text, I.bg, 4.5],
    ["tinta sobre gris suave", I.text, I.soft, 4.5],
    ["secundario sobre blanco", I.text2, I.bg, 4.5],
    ["secundario sobre gris suave", I.text2, I.soft, 4.5],
    ["muted sobre blanco", I.muted, I.bg, 4.5],
    ["muted sobre gris suave", I.muted, I.soft, 4.5],
    ["interactivo (grafito) sobre blanco", I.blue, I.bg, 4.5],
    ["interactivo (grafito) sobre gris suave", I.blue, I.soft, 4.5],
    ["blanco sobre banda carbón", "#FFFFFF", I.darkBg, 4.5],
    ["blanco sobre card carbón", "#FFFFFF", I.darkCard, 4.5],
    ["secundario-dark sobre banda carbón", I.darkText2, I.darkBg, 4.5],
    ["ámbar de «sin verificar» sobre su fondo", I.flag, I.flagSoft, 4.5],
    ["ámbar de «sin verificar» sobre blanco", I.flag, I.bg, 4.5],
    // Umbral 3 y no 4.5 A PROPÓSITO: el × de una pregunta del plan de sesiones es un ícono
    // SVG de 13px, y WCAG 1.4.11 pide 3:1 para contenido no textual. Sobre la fila marcada
    // (gris suave) el par da 4.43 — alcanza para un ícono, no para texto. Si algún día ese
    // botón lleva una palabra, hay que subir este 3 a 4.5 y el guard va a frenarlo.
    ["× de borrar pregunta sobre fila marcada (ícono, no texto)", "#DC2626", I.soft, 3],
    ["× de borrar pregunta sobre fila sin marcar", "#DC2626", I.bg, 3],
  ];
  for (const [desc, fg, bg, min] of casos) {
    it(`${desc} ≥ ${min}:1`, () => {
      const r = ratio(fg, bg);
      expect(r, `${fg} sobre ${bg} da ${r.toFixed(2)}:1 (mínimo ${min}:1)`).toBeGreaterThanOrEqual(min);
    });
  }

  // "Gris + UN ámbar" es la decisión de producto (el documento tiene que leerse como
  // interno de un vistazo). Verificable: ningún color de MARCA puede aparecer adentro.
  it("la paleta interna NO reintroduce ningún color de marca", () => {
    for (const marca of ["0B58D3", "07429A", "1E8FF6", "E8481C", "F87B5B", "051849", "FBF1E4", "FF7A59"]) {
      expect(
        BLOQUE_INTERNO.toUpperCase().includes(marca),
        `.stl-internal reintroduce el color de marca #${marca}`,
      ).toBe(false);
    }
  });

  // El ámbar es la ÚNICA señal cromática permitida: los demás tokens del bloque tienen
  // que ser NEUTROS. Se mide por SATURACIÓN (HSL), no por spread RGB crudo: los grises
  // fríos de la escala (ej. #4b5563, azulado a propósito) son neutros legítimos y un
  // spread crudo los rechazaba, mientras que un acento real está muy por encima
  // (#0B58D3 royal ≈ 90%, #E8481C naranja ≈ 82%). El corte en 25% los separa limpio.
  it("fuera del ámbar, todos los tokens del bloque interno son NEUTROS (saturación < 25%)", () => {
    const hexes = [...BLOQUE_INTERNO.matchAll(/(--[a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)];
    const permitidos = new Set(["--flag", "--flag-soft", "--flag-line"]);
    for (const [, name, hex] of hexes) {
      if (permitidos.has(name)) continue;
      const h = hex.replace("#", "");
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;
      const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
      expect(sat, `${name}: ${hex} no es neutro (saturación ${(sat * 100).toFixed(0)}%, máx 25%)`).toBeLessThanOrEqual(0.25);
    }
  });
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

/**
 * La banda «Por qué Smarteam» pinta su propio DEGRADADO sobre el tema oscuro, así que su
 * legibilidad ya no depende de un token suelto sino del extremo más claro del degradado. El
 * primer intento fue `--dark-card` y la credencial quedaba en 4.2 — por debajo de AA. En vez
 * de anotar el resultado, el guard lee los stops REALES: cambiar el degradado vuelve a
 * frenar el merge, que es lo único que impide que se aclare de a poco sin que nadie mire.
 */
describe("el degradado de «Por qué Smarteam» se mantiene legible", () => {
  const bloque = ENGINE.match(/\.stl\s+\.stl-sec:has\(\.stl-partner\)\s*\{([^}]*)\}/);

  it("existe y está declarado con tokens, no con hex sueltos", () => {
    expect(bloque, "no se encontró la regla del degradado de la banda partner").toBeTruthy();
    expect(bloque![1]).toContain("linear-gradient");
    expect(bloque![1], "un hex suelto se escapa de esta verificación").not.toMatch(/#[0-9A-Fa-f]{6}/);
  });

  it("todos sus stops sostienen AA para el texto blanco Y para el acento de la credencial", () => {
    const usados = [...bloque![1].matchAll(/var\((--[a-z-]+)\)/g)].map((m) => m[1]);
    expect(usados.length, "el degradado no declara ningún stop").toBeGreaterThan(0);
    for (const nombre of new Set(usados)) {
      const fondo = token(ENGINE, nombre);
      expect(ratio("#FFFFFF", fondo), `blanco sobre ${nombre} (${fondo})`).toBeGreaterThanOrEqual(4.5);
      expect(ratio("#1E8FF6", fondo), `acento de la credencial sobre ${nombre} (${fondo})`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(P.darkText2, fondo), `secundario-dark sobre ${nombre} (${fondo})`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
