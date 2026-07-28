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

describe("`logoScale` no entra al schema del agente", () => {
  // Si entrara, `coerceToSchema` (lib/ai/section-schema.ts) lo aplanaría a `""` —
  // aplana TODA hoja a string— y el ajuste del documento moriría en la primera
  // regeneración. Es el mismo pozo del que salieron `brands` y `coverImageUrl`.
  const DEFS = path.join(RAIZ, "components", "landing", "configs");
  const archivos = fs.readdirSync(DEFS).filter((f) => f.endsWith(".defs.ts"));

  for (const archivo of archivos) {
    it(`${archivo}: ningún bloque \`schema:\` menciona logoScale`, () => {
      const src = fs.readFileSync(path.join(DEFS, archivo), "utf8");
      // Los schemas de este repo son literales `schema: { … }` en una o pocas líneas.
      const schemas = src.match(/schema:\s*\{[^}]*(\{[^}]*\}[^}]*)*\}/g) ?? [];
      const culpables = schemas.filter((s) => s.includes("logoScale"));
      expect(culpables, "logoScale es data CURADA, no del agente").toEqual([]);
    });
  }
});

describe("el componente aplica la escala solo al logo del cliente", () => {
  it("el estilo se calcula bajo una condición de «es el cliente»", () => {
    // No verifica la lógica (eso es imposible por fs-scan), sino que la condición EXISTA:
    // un `logoScaleStyle(...)` suelto, sin `esCliente`, escalaría los tres logos.
    expect(HERO_PARTS).toMatch(/esCliente\s*\?\s*logoScaleStyle\(/);
  });

  it("TODO <img> de la brand-row lleva la clase y el style calculados", () => {
    // Hay dos ramas (con y sin el editor del popover) que pintan el mismo logo. Contar
    // no sirve; lo que importa es que ninguna rama se olvide del style — un `<img>` sin
    // él ignora el tamaño configurado y nadie lo nota hasta ver el documento.
    const imgs = HERO_PARTS.match(/<img[^>]*>/g) ?? [];
    expect(imgs.length, "no quedó ningún <img> en la brand-row").toBeGreaterThanOrEqual(1);
    const sinEscala = imgs.filter((t) => !(t.includes("className={claseLogo}") && t.includes("style={escala}")));
    expect(sinEscala, "un <img> de la brand-row no aplica clase+escala").toEqual([]);
  });

  it("el modificador que apaga el filtro solo se pone con versión oscura REAL", () => {
    // Si se pusiera incondicionalmente, los logos de los clientes que solo tienen un
    // archivo dejarían de blanquearse y quedarían invisibles sobre el navy.
    expect(HERO_PARTS).toMatch(/usaVersionOscura\s*=\s*esCliente && !!ctx\.clientLogoDarkUrl/);
    expect(HERO_PARTS).toMatch(/usaVersionOscura \? " stl-brand-logo--asis" : ""/);
  });
});
