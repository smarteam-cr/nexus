/**
 * lib/ui/landing-logo-scale.test.ts — el tamaño del logo, congelado donde se rompe solo.
 *
 * Tres invariantes que ningún tipo puede sostener, porque viven en CSS y en un string:
 *
 *  1. La variable `--logo-scale` va en el `<img>` DEL CLIENTE, nunca en la fila. Los tres
 *     logos de la brand-row (cliente, Smarteam, HubSpot) comparten `.stl-brand-logo`: si la
 *     variable se sube al contenedor, escalan los tres. Nadie lo nota hasta que un cliente
 *     abre su propuesta y ve el logo de Smarteam gigante al lado del suyo.
 *  2. El `filter` sigue siendo el DEFAULT de la clase. Es lo único que hace visibles hoy los
 *     logos de los clientes que solo subieron un archivo — que son todos. Se apaga con el
 *     modificador `--asis`, no al revés: si el modificador se pierde en un refactor, el peor
 *     caso tiene que ser lo que ya se ve, no un logo invisible.
 *  3. El alto sale de un `calc()` con la variable SIN UNIDAD. Con unidad, el `calc` se
 *     invalida, `height` cae a `auto` y el logo se pinta a su resolución natural. Eso lo
 *     cubre lib/ui/logo-scale.test.ts del lado del string; acá se cubre del lado del CSS.
 *
 * Mismo patrón fs-scan que landing-brand-contrast.test.ts (no hay tests de componentes:
 * el project `unit` de vitest solo corre lib/**).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { LOGO_SCALE_VAR } from "./logo-scale";

const RAIZ = process.cwd();
const ENGINE = fs.readFileSync(path.join(RAIZ, "app", "landing-engine.css"), "utf8");
const HERO_PARTS = fs.readFileSync(
  path.join(RAIZ, "components", "landing", "hero-parts.tsx"),
  "utf8",
);

/** Cuerpo de una regla CSS por su selector exacto (sin comentarios de por medio). */
function regla(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = ENGINE.match(new RegExp(`${esc}\\s*\\{([^}]*)\\}`));
  if (!m) throw new Error(`no existe la regla "${selector}" en landing-engine.css`);
  return m[1];
}

describe("la regla compartida de la brand-row", () => {
  const brandLogo = regla(".stl .stl-brand-logo");

  it("saca el alto de un calc con la variable, no de un número fijo", () => {
    expect(brandLogo).toMatch(/height:\s*calc\(/);
    expect(brandLogo).toContain(`var(${LOGO_SCALE_VAR}, 1)`);
  });

  it("el fallback de la variable es 1: sin ella, el alto de siempre", () => {
    // Smarteam y HubSpot NO traen la variable. Si el fallback fuera otra cosa —o no
    // existiera— cambiarían de tamaño sin que nadie tocara nada.
    expect(brandLogo).toMatch(/var\(--logo-scale,\s*1\)/);
    expect(brandLogo).toMatch(/calc\(30px\s*\*/);
  });

  it("conserva el filtro como DEFAULT (es lo que hace visibles los logos de hoy)", () => {
    expect(brandLogo).toContain("brightness(0) invert(1)");
  });
});

describe("el modificador que apaga el filtro", () => {
  it("existe y apaga filtro + opacidad", () => {
    const asis = regla(".stl .stl-brand-logo--asis");
    expect(asis).toMatch(/filter:\s*none/);
    expect(asis).toMatch(/opacity:\s*1/);
  });
});

describe("la variable no se escapa al contenedor", () => {
  it("ninguna regla de `.stl-brandrow` declara --logo-scale", () => {
    // Si se declarara acá, la heredarían los TRES logos de la fila.
    const fila = regla(".stl .stl-brandrow");
    expect(fila).not.toContain(LOGO_SCALE_VAR);
  });

  it("el CSS no declara --logo-scale en NINGÚN lado: solo la pone el <img> inline", () => {
    // `var(--logo-scale, 1)` es una LECTURA y está permitida; `--logo-scale:` es una
    // DECLARACIÓN y no debe existir en la hoja — la única fuente es `logoScaleStyle`.
    expect(ENGINE).not.toMatch(/--logo-scale\s*:/);
  });
});

describe("el componente aplica la escala solo al logo del cliente", () => {
  it("el estilo se calcula bajo una condición de «es el cliente»", () => {
    // No verifica la lógica (eso es imposible por fs-scan), sino que la condición EXISTA:
    // un `logoScaleStyle(...)` suelto, sin `esCliente`, escalaría los tres logos.
    expect(HERO_PARTS).toMatch(/esCliente\s*\?\s*logoScaleStyle\(/);
  });

  it("hay UN solo <img> en la brand-row, y lleva el style", () => {
    const imgs = HERO_PARTS.match(/<img\b/g) ?? [];
    expect(imgs.length, "apareció otro <img>: ¿escala también?").toBe(1);
    expect(HERO_PARTS).toMatch(/<img[^>]*className="stl-brand-logo"[^>]*style=\{escala\}/);
  });
});
