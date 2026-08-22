/**
 * lib/landing/custom-sections.test.ts
 *
 * Lo que este archivo protege NO es la gramática de la key (eso es trivial), sino los dos
 * modos de falla que esta feature puede tener y que ningún error en consola avisaría:
 *
 *  1. La sección DESAPARECE en una superficie y no en las otras. Cada consumidor la
 *     descarta con un `filter(Boolean)`, así que el síntoma es "se ve en el editor y falta
 *     en el PDF que el vendedor ya mandó". De ahí el test positivo sobre las TRES.
 *  2. El agente le escribe encima. La def es `agentGenerated:false` con `properties` vacío,
 *     y esa asimetría importa: si un gate se filtrara, `coerceToSchema` no degradaría la
 *     sección — la VACIARÍA.
 *
 * Más el escaneo del componente, que congela el sandbox: `allow-scripts` sin
 * `allow-same-origin` (juntos se anulan) y sin `allow-forms`/`allow-popups`/
 * `allow-top-navigation`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CUSTOM_PREFIX,
  CUSTOM_SECTION_EMPTY,
  EMBED_ALTO_DEFAULT,
  HTML_EMBED_TYPE,
  altoEmbedPx,
  esCustomKey,
  nuevaCustomKey,
} from "./custom-sections";
import { customDef } from "./catalogo-de-secciones";
import { withEmbedCsp, EMBED_CSP } from "./html-embed";
import { isBlank } from "./is-blank";
import { BC_TEMPLATES, defForCanvasSection, defsForCanvas } from "@/components/landing/configs/templates.defs";
import { configForCanvas, configForSnapshot, SECTION_COMPONENTS } from "@/components/landing/configs/templates";
import { KICKOFF_SECTION_DEFS } from "@/components/landing/configs/kickoff.defs";
import { DESARROLLO_SECTION_DEFS } from "@/components/landing/configs/desarrollo.defs";
import { EXPLORACION_SECTION_DEFS } from "@/components/landing/configs/exploracion.defs";

const KEY = "custom:11111111-2222-3333-4444-555555555555";

describe("la gramática de la key", () => {
  it("reconoce una key personalizada y solo esa", () => {
    expect(esCustomKey(KEY)).toBe(true);
    expect(esCustomKey("hero")).toBe(false);
    expect(esCustomKey("casos_de_uso")).toBe(false);
    expect(esCustomKey("__meta")).toBe(false); // la otra familia de keys reservadas
    expect(esCustomKey("__doc")).toBe(false);
    expect(esCustomKey(CUSTOM_PREFIX)).toBe(false); // el prefijo pelado no identifica nada
  });

  it("cada key nueva es distinta y se auto-reconoce", () => {
    const a = nuevaCustomKey();
    const b = nuevaCustomKey();
    expect(a).not.toBe(b);
    expect(esCustomKey(a)).toBe(true);
  });

  /* La colisión no se evita por convención sino por FORMA: ninguna key de plantilla lleva
     `:` (todas son snake_case). Si alguien introduce una que sí, este test cae antes de que
     una sección de la plantilla empiece a resolverse como personalizada. */
  it("ninguna key declarada por el motor contiene ':'", () => {
    const todas = [
      ...Object.values(BC_TEMPLATES).flatMap((t) => t.sections.map((d) => d.key)),
      ...KICKOFF_SECTION_DEFS.map((d) => d.key),
      ...DESARROLLO_SECTION_DEFS.map((d) => d.key),
      ...EXPLORACION_SECTION_DEFS.map((d) => d.key),
    ];
    expect(todas.filter((k) => k.includes(":"))).toEqual([]);
  });
});

describe("la def sintetizada", () => {
  it("usa el nombre del vendedor y cae a un placeholder si viene vacío", () => {
    expect(customDef(KEY, "Demo de la automatización").label).toBe("Demo de la automatización");
    expect(customDef(KEY, "   ").label).toBe("Sección personalizada");
    expect(customDef(KEY, null).label).toBe("Sección personalizada");
  });

  it("el agente no la genera NI tiene dónde escribir", () => {
    const def = customDef(KEY, "X");
    expect(def.agentGenerated).toBe(false);
    expect(def.sectionType).toBe(HTML_EMBED_TYPE);
    // `properties` vacío: aunque un gate se filtrara, no hay clave que el agente pueda tocar.
    expect((def.schema as { properties: Record<string, unknown> }).properties).toEqual({});
  });
});

describe("las TRES superficies resuelven la sección (el modo de falla mudo)", () => {
  const rows = [{ key: "hero" }, { key: KEY, label: "Demo" }];

  it("el resolver de defs la sintetiza en los dos templates", () => {
    for (const tplId of Object.keys(BC_TEMPLATES)) {
      expect(defsForCanvas(tplId, rows)[KEY]?.sectionType).toBe(HTML_EMBED_TYPE);
      expect(defForCanvasSection(tplId, KEY, "Demo")?.agentGenerated).toBe(false);
      // Una key desconocida que NO es personalizada sigue devolviendo undefined.
      expect(defForCanvasSection(tplId, "no_existe")).toBeUndefined();
    }
  });

  it("el editor y la impresión la incluyen, en el orden de las filas", () => {
    for (const tplId of Object.keys(BC_TEMPLATES)) {
      const cfg = configForCanvas(tplId, rows);
      expect(cfg.sections.map((s) => s.key)).toEqual(["hero", KEY]);
      expect(cfg.sections[1].Component).toBe(SECTION_COMPONENTS[HTML_EMBED_TYPE]);
    }
    // Sin filas (documento recién creado / ventana de carga) cae al template completo.
    expect(configForCanvas("hubspot_v1", []).sections.length).toBeGreaterThan(1);
  });

  /* La propuesta PUBLICADA es la superficie que ve el prospecto y la única que nadie de
     Smarteam mira. `configForSnapshot` la resuelve por el `sectionType` congelado, así que
     lo que este test cuida de verdad es que publish congele "html_embed" y no la key. */
  it("el snapshot publicado la renderiza por su sectionType congelado", () => {
    const ok = configForSnapshot("hubspot_v1", [
      { key: KEY, label: "Demo", sectionType: HTML_EMBED_TYPE },
    ]);
    expect(ok.sections.map((s) => s.key)).toEqual([KEY]);

    // Y la contraprueba: congelar la KEY (lo que pasaría sin la def sintetizada en
    // publish/route.ts) la haría desaparecer sin un solo error.
    const roto = configForSnapshot("hubspot_v1", [{ key: KEY, label: "Demo", sectionType: KEY }]);
    expect(roto.sections).toEqual([]);
  });
});

describe("is-blank: el alto es presentación, no contenido", () => {
  it("recién creada está en blanco (el cliente no la ve)", () => {
    expect(isBlank({ ...CUSTOM_SECTION_EMPTY })).toBe(true);
  });

  it("ajustar SOLO el alto no la vuelve publicable", () => {
    expect(isBlank({ ...CUSTOM_SECTION_EMPTY, altoEmbed: "700" })).toBe(true);
  });

  it("con HTML, o con el texto del PDF, sí tiene algo que decir", () => {
    expect(isBlank({ ...CUSTOM_SECTION_EMPTY, html: "<b>x</b>" })).toBe(false);
    expect(isBlank({ ...CUSTOM_SECTION_EMPTY, notaPdf: "Vela en línea." })).toBe(false);
  });
});

describe("altoEmbedPx", () => {
  it("cae al default con texto vacío o basura", () => {
    expect(altoEmbedPx({ altoEmbed: "" })).toBe(EMBED_ALTO_DEFAULT);
    expect(altoEmbedPx({ altoEmbed: "alto" })).toBe(EMBED_ALTO_DEFAULT);
    expect(altoEmbedPx({})).toBe(EMBED_ALTO_DEFAULT);
    expect(altoEmbedPx(null)).toBe(EMBED_ALTO_DEFAULT);
  });

  it("clampea a un rango razonable", () => {
    expect(altoEmbedPx({ altoEmbed: "700" })).toBe(700);
    expect(altoEmbedPx({ altoEmbed: "10" })).toBe(200);
    expect(altoEmbedPx({ altoEmbed: "99999" })).toBe(2000);
    expect(altoEmbedPx({ altoEmbed: "-5" })).toBe(EMBED_ALTO_DEFAULT);
  });
});

describe("withEmbedCsp", () => {
  it("entra al <head> cuando existe", () => {
    const out = withEmbedCsp("<!DOCTYPE html><html><head><title>x</title></head><body>a</body></html>");
    expect(out).toContain("Content-Security-Policy");
    expect(out.indexOf("Content-Security-Policy")).toBeLessThan(out.indexOf("<title>"));
  });

  it("sin <head>, después de <html>", () => {
    const out = withEmbedCsp("<html><body>a</body></html>");
    expect(out.indexOf("Content-Security-Policy")).toBeLessThan(out.indexOf("<body>"));
  });

  /* Lo importante de este caso: meter cualquier cosa ANTES del doctype tira al navegador a
     quirks mode y la animación se vería distinta que en la máquina de Ventas. */
  it("NUNCA antes de un <!DOCTYPE>", () => {
    const out = withEmbedCsp("<!DOCTYPE html><body>a</body>");
    expect(out.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(out).toContain("Content-Security-Policy");
  });

  it("un fragmento suelto la recibe al principio", () => {
    expect(withEmbedCsp("<div>hola</div>").startsWith("<meta")).toBe(true);
  });

  it("un HTML vacío se deja como está (no hay nada que proteger)", () => {
    expect(withEmbedCsp("")).toBe("");
    expect(withEmbedCsp("   ")).toBe("   ");
  });

  it("la política corta la exfiltración y el envío de formularios", () => {
    expect(EMBED_CSP).toContain("connect-src 'none'");
    expect(EMBED_CSP).toContain("form-action 'none'");
    expect(EMBED_CSP).toContain("base-uri 'none'");
    // …pero deja vivos los CDN, que es lo que hace usable la feature.
    expect(EMBED_CSP).toContain("script-src 'unsafe-inline' 'unsafe-eval' https:");
  });
});

describe("el sandbox del iframe está congelado en el código", () => {
  const src = readFileSync(join(process.cwd(), "components/landing/sections-custom.tsx"), "utf8");

  /* Se mira el VALOR del atributo y no el texto del archivo: el encabezado explica por qué
     no van `allow-same-origin` ni `allow-forms`, así que un `not.toContain` sobre el fuente
     obligaría a borrar la explicación para que el test pase. Esta forma es además más
     fuerte — congela la lista COMPLETA, no la ausencia de las banderas que se nos ocurran. */
  it("todo iframe del archivo lleva exactamente sandbox=\"allow-scripts\"", () => {
    const sandboxes = [...src.matchAll(/sandbox="([^"]*)"/g)].map((m) => m[1]);
    // Solo los `<iframe` que ABREN una línea son JSX; los que aparecen en medio de una
    // frase son las menciones de los comentarios que explican todo esto.
    const iframes = src.match(/^\s*<iframe\b/gm) ?? [];
    expect(sandboxes).toEqual(["allow-scripts"]);
    expect(iframes).toHaveLength(sandboxes.length); // ningún iframe sin sandbox
  });

  /* El `Editable` del motor lee y escribe con `textContent`: el markup pegado se ve hasta el
     blur y se guarda APLANADO, sin aviso. La textarea no es ergonomía, es la frontera. */
  it("el HTML se pega en un <textarea>, nunca en el Editable del motor", () => {
    expect(src).toContain("<textarea");
    expect(src).not.toContain('from "./inline"');
  });

  /* El iframe muere en el PDF por cuatro vías distintas (PdfReadySignal no ve adentro,
     pdf-runner mide con scrollHeight, la animación se congela, Chrome imprime frames
     sandboxeados mal). La rama tiene que RETORNAR, no envolver. */
  it("en pdfMode retorna el texto de reemplazo y nada más", () => {
    expect(src).toMatch(/if \(ctx\.pdfMode\) \{\s*return <p[^>]*>\{notaPdf \|\| PDF_FALLBACK\}<\/p>;/);
  });
});
