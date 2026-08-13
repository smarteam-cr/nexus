/**
 * lib/landing/consejos-embed.test.ts
 *
 * El brief de `consejos-embed.ts` se copia y se le pega a un AGENTE DE CÓDIGO, que va a
 * escribir el HTML creyéndole. Un brief desactualizado no es prosa vieja: es un agente
 * escribiendo `fetch` porque el texto decía que se podía, y un vendedor volviendo con "no
 * funciona" y sin error que mostrar.
 *
 * Por eso este guard ATA el texto al contrato REAL en vez de verificar que el string exista:
 *   · la CSP y los topes se INTERPOLAN de las constantes, así que no pueden divergir — lo que
 *     el test verifica es que sigan interpolándose y no los pise una copia a mano;
 *   · el sandbox y el `allow=""` sí están escritos a mano en el brief: se comparan contra el
 *     JSX del componente;
 *   · la geometría del marco se compara contra el CSS del motor;
 *   · y las prohibiciones grandes (sin red, sin formularios, sin iframes anidados) se atan a
 *     la directiva de la CSP que las produce: si alguien abre `connect-src`, el brief pasa a
 *     mentir y el test se pone rojo pidiendo que lo reescriban.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CONSEJOS_EMBED } from "./consejos-embed";
import { EMBED_CSP } from "./html-embed";
import {
  EMBED_ALTO_DEFAULT,
  EMBED_ALTO_MAX,
  EMBED_ALTO_MIN,
  MAX_EMBED_CHARS,
} from "./custom-sections";

const COMPONENTE = readFileSync(
  join(process.cwd(), "components/landing/sections-custom.tsx"),
  "utf8",
);
const CSS = readFileSync(join(process.cwd(), "app/landing-engine.css"), "utf8");

/** La CSP partida en `{ directiva: valor }`, para poder assertear valores EXACTOS. */
const DIRECTIVAS = Object.fromEntries(
  EMBED_CSP.split(";").map((d) => {
    const [nombre, ...resto] = d.trim().split(/\s+/);
    return [nombre, resto.join(" ")];
  }),
);

describe("el brief cita el contrato real, no una copia", () => {
  it("trae la CSP completa, interpolada", () => {
    expect(
      CONSEJOS_EMBED,
      "el brief tiene que INTERPOLAR `EMBED_CSP`, no repetirla a mano: una copia envejece " +
        "sola y nadie se entera hasta que un agente escribe código contra la política vieja.",
    ).toContain(EMBED_CSP);
  });

  it.each([
    ["sandbox=\"allow-scripts\"", "el sandbox"],
    ["allow=\"\"", "la Permissions Policy vacía"],
    ["referrerPolicy=\"no-referrer\"", "la política de referrer"],
    ["loading=\"lazy\"", "la carga diferida"],
  ])("cita %s tal como está en el iframe", (literal, que) => {
    expect(COMPONENTE, `${que} cambió en el componente`).toContain(literal);
    expect(CONSEJOS_EMBED, `${que} del brief no coincide con el iframe`).toContain(literal);
  });

  it.each([
    [String(EMBED_ALTO_DEFAULT), "el alto por defecto"],
    [String(EMBED_ALTO_MIN), "el alto mínimo"],
    [String(EMBED_ALTO_MAX), "el alto máximo"],
    [MAX_EMBED_CHARS.toLocaleString("en-US"), "el tope de caracteres"],
  ])("cita %s (%s)", (valor) => {
    expect(CONSEJOS_EMBED).toContain(valor);
  });

  /* El ancho no es una constante de TS: sale del CSS. Se recalcula acá para que ensanchar la
     página (o cambiar el padding del contenedor) ponga el brief en rojo — un agente que
     diseñe para 1232 px cuando la caja mide 1400 entrega una pieza que se ve angosta. */
  it("el ancho máximo sale del CSS, no de la memoria de nadie", () => {
    const base = Number(/--stl-w-pagina-base:\s*(\d+)px/.exec(CSS)?.[1]);
    const padding = Number(/\.stl \.stl-wrap \{[^}]*padding:\s*0\s+(\d+)px/.exec(CSS)?.[1]);
    expect(base, "no pude leer --stl-w-pagina-base del CSS").toBeGreaterThan(0);
    expect(padding, "no pude leer el padding de .stl-wrap").toBeGreaterThan(0);
    expect(
      CONSEJOS_EMBED,
      `el ancho útil es ${base} - ${padding * 2} - 2 = ${base - padding * 2 - 2} px`,
    ).toContain(String(base - padding * 2 - 2));
  });

  it("el radio del marco coincide con el del iframe", () => {
    const radio = /\.stl-embed-frame \{[^}]*border-radius:\s*(\d+)px/.exec(CSS)?.[1];
    expect(radio, "no pude leer el border-radius de .stl-embed-frame").toBeTruthy();
    expect(CONSEJOS_EMBED, "el brief dice otro radio que el que pinta el motor")
      .toContain(`border-radius de ${radio} px`);
  });
});

describe("cada prohibición grande está atada a la directiva que la produce", () => {
  /* Si alguien afloja una de estas, el consejo pasa a ser falso EN LA DIRECCIÓN CARA: el
     agente evita algo que ya funciona, o —peor— el brief sigue prometiendo un bloqueo que
     dejó de existir. El test no opina sobre la política: exige que las dos cuenten lo mismo. */
  const ATADAS: Array<[string, string, string, string]> = [
    ["connect-src", "'none'", "fetch", "sin red: el brief dice que fetch/XHR/WebSocket están bloqueados"],
    ["form-action", "'none'", "<form>", "sin formularios: el brief dice que un submit no envía nada"],
    ["frame-src", "'none'", "YouTube", "sin iframes anidados: el brief dice que YouTube no carga"],
    ["base-uri", "'none'", "<base>", "el brief dice que no se puede corregir la URL base"],
  ];

  it.each(ATADAS)("%s sigue en %s", (directiva, valor, mencion, porQue) => {
    expect(DIRECTIVAS[directiva], `${porQue}. Si la política cambió, reescribí el brief.`)
      .toBe(valor);
    expect(CONSEJOS_EMBED, `el brief dejó de mencionar ${mencion}`).toContain(mencion);
  });

  /* Y al revés: lo que el brief promete que SÍ funciona tiene que seguir permitido. Un
     `script-src` recortado convertiría el esqueleto de arranque en una pieza muerta. */
  it.each([
    ["script-src", "https:", "el brief manda traer las librerías por CDN https"],
    ["style-src", "https:", "el brief manda cargar Google Fonts por <link>"],
    ["font-src", "https:", "el brief manda cargar Plus Jakarta Sans"],
    ["img-src", "https:", "el brief manda las imágenes por URL https"],
  ])("%s sigue permitiendo %s", (directiva, token, porQue) => {
    expect(DIRECTIVAS[directiva], porQue).toContain(token);
  });
});

describe("el texto es usable", () => {
  it("trae el esqueleto de arranque con lo que más se olvida", () => {
    for (const imprescindible of [
      "<!DOCTYPE html>",
      "prefers-reduced-motion",
      "Plus Jakarta Sans",
      "height: 100%",
      "const CONFIG",
    ]) {
      expect(CONSEJOS_EMBED, `falta \`${imprescindible}\` en el esqueleto`).toContain(imprescindible);
    }
  });

  /* Copy de UI nuevo va en TUTEO (CLAUDE.md, invariante 6). El límite de palabra importa:
     por substring, "evitarlo" contiene "evitar" y "escribí" aparece dentro de "escribíamos" —
     un matcher flojo se pone rojo con palabras perfectamente válidas. */
  it.each(["usá", "pegá", "poné", "tenés", "podés", "hacé", "mirá", "dejá", "traé", "abrí", "escribí", "andá"])(
    "sin voseo: %s",
    (v) => {
      const re = new RegExp(`\\b${v}(?![a-záéíóúüñ])`, "i");
      expect(re.test(CONSEJOS_EMBED), `"${v}" es voseo: el copy nuevo va en tuteo`).toBe(false);
    },
  );

  it("entra en un mensaje de chat sin ser una novela", () => {
    expect(CONSEJOS_EMBED.length).toBeGreaterThan(4_000);
    expect(CONSEJOS_EMBED.length, "si pasa de 14k, alguien le está agregando relleno")
      .toBeLessThan(14_000);
  });
});

describe("el botón no le llega al prospecto", () => {
  /* Los ~10 KB del brief solo tienen sentido en el editor. `HtmlEmbedSection` la importa
     estáticamente el registry del motor, así que una constante de módulo viajaría en el
     bundle que descarga el prospecto al abrir la propuesta publicada. */
  it("el texto se carga con import() dinámico", () => {
    expect(
      /await import\(\s*["']@\/lib\/landing\/consejos-embed["']\s*\)/.test(COMPONENTE),
      "el brief tiene que cargarse bajo demanda dentro del handler, no como import estático",
    ).toBe(true);
    expect(
      /^import .*consejos-embed/m.test(COMPONENTE),
      "hay un import ESTÁTICO de consejos-embed: eso mete el brief en el bundle del prospecto",
    ).toBe(false);
  });

  it("el CTA solo existe en el camino editable", () => {
    /* `ctx.pdfMode` y `!editable` retornan ANTES de llegar al formulario. Si el CTA se colara
       ahí, el prospecto vería un botón para copiar instrucciones internas. */
    const antesDelForm = COMPONENTE.slice(0, COMPONENTE.indexOf('className="stl-embed-edit"'));
    expect(
      antesDelForm.includes("<CopiarConsejos"),
      "el CTA se montó fuera del formulario de edición",
    ).toBe(false);
  });
});
