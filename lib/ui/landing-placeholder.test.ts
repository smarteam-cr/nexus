/**
 * lib/ui/landing-placeholder.test.ts
 *
 * El placeholder de un campo VACÍO del motor de landings se pinta con un pseudo-elemento
 * (`.stl-editable:empty::before { content: attr(data-placeholder) }`), y hay clases del motor
 * que decoran ESE MISMO pseudo-elemento. Un elemento tiene UN solo `::before`: cuando las dos
 * reglas caen sobre el mismo nodo, la más específica gana `content` y NADA MÁS — el resto de
 * la caja (ancho, alto, fondo, `flex-shrink`…) sigue siendo el de la decoración, porque nadie
 * lo pisa.
 *
 * Eso fue un bug REAL y visible: la rayita de marca del eyebrow es una caja de 26×2px con
 * fondo, así que el texto del placeholder quedaba metido adentro, partido en columna
 * ("EY / EB / RO / W") y desbordando ENCIMA del título. Se veía en toda sección con el eyebrow
 * vacío —siempre en las personalizadas, que no declaran uno— y en el hero de /roles con el
 * área sin llenar. Nadie lo cazó porque el CSS del motor no tiene ningún test de layout.
 *
 * Este guard NO mide píxeles (jsdom no hace layout, y medir en Chrome exige una app logueada
 * que este entorno no tiene). Lee el CSS y el código REALES, y hace cuatro cosas:
 *   1. la regla del placeholder existe y pone el texto del atributo;
 *   2. su reset declara con VALOR INERTE toda propiedad que no sea puramente tipográfica —
 *      verificar que la propiedad esté nombrada no alcanza: `width: 26px` adentro del reset
 *      es el bug original escrito de nuevo, y pasaría;
 *   3. toda propiedad que una decoración VIVA le ponga al pseudo está cubierta por el reset;
 *      la lista de lo que NO hace falta resetear es una DENY-list corta, así que una propiedad
 *      nueva (`display`, `aspect-ratio`…) falla sola, sin que nadie venga a declararla acá;
 *   4. congela QUÉ clases editables tienen hoy un pseudo-elemento decorado, para que una
 *      colisión nueva se MIRE y se decida, en vez de descubrirse en una propuesta que el
 *      cliente está viendo.
 *
 * ALCANCE, dicho explícito: el guard descubre decoraciones por CLASE. Las que caen por
 * ATRIBUTO o por elemento (`.stl [data-tip]::before`, `.stl .stl-compare-list li::before`) no
 * las ve. Hoy ninguna toca un `<Editable>` —`data-tip` vive en spans hermanos— pero ponerle un
 * `data-tip` a un `<Editable>` reproduce exactamente este bug con el test en verde.
 *
 * Nada de esto toca el modo LECTURA: con `editable=false`, `Editable` no emite la clase
 * `stl-editable` ni el atributo `data-placeholder` (components/landing/inline.tsx), así que ni
 * `:empty` ni el placeholder existen en /external ni en el PDF. Por eso las reglas de
 * impresión (`.stl-pdf-*`) quedan FUERA del barrido: ahí la colisión es imposible por
 * construcción, y bloquear una mejora de paginado con este test sería mandar a investigar algo
 * que no existe.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const CSS_CRUDO = readFileSync(join(process.cwd(), "app/landing-engine.css"), "utf8");

/** Un comentario puede nombrar una propiedad sin declararla (los de este motor son largos y
 *  explican justamente la cascada): se sacan antes de leer nada, o el guard se daría por
 *  satisfecho con la prosa. */
const CSS = CSS_CRUDO.replace(/\/\*[\s\S]*?\*\//g, "");

/** Las carpetas donde vive un `<Editable>` del motor. `components/canvas/*-sections` renderiza
 *  DENTRO de `.stl` igual que `components/landing` (es la misma lista que enumera
 *  `lib/ui/pdf-mode-coverage.test.ts`), así que una decoración nueva sobre una clase que solo
 *  se use desde ahí tiene el mismo modo de falla. */
const CARPETAS = ["components/landing", "components/canvas"];

/** El cuerpo de la regla del placeholder. */
const REGLA_PLACEHOLDER =
  /\.stl\s+\.stl-editable:empty::before\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? "";

/** Declaraciones de un cuerpo de regla, como pares [propiedad, valor]. */
function declaraciones(cuerpo: string): Array<[string, string]> {
  return [...cuerpo.matchAll(/(?:^|;)\s*([a-z-]+)\s*:\s*([^;]+)/g)].map((m) => [
    m[1],
    m[2].trim(),
  ]);
}

/**
 * Lo que NO le da caja al pseudo-elemento: texto, color y transiciones. Es DENY-list a
 * propósito — con una allowlist, la propiedad que nadie previó (`display:none` es el ejemplo
 * caro: deja el placeholder invisible) se saltearía en silencio, que es justo el modo de falla
 * que este archivo existe para cerrar.
 */
const SIN_CAJA = new Set([
  "content",
  "color",
  "opacity",
  "font",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "font-variant",
  "letter-spacing",
  "line-height",
  "text-transform",
  "text-align",
  "text-decoration",
  "white-space",
  "word-break",
  "overflow-wrap",
  "transition",
  "cursor",
  "pointer-events",
]);

/** Valores que NO imponen caja. `flex-shrink: 1` y `display: inline` son los defaults del
 *  pseudo, así que cuentan como inertes aunque no se llamen `auto`. */
const VALOR_INERTE = /^(auto|none|0|0px|1|static|inline|initial|unset|revert|inherit|transparent)$/;

/** Clases que el motor le pasa a `<Editable className="…">`, leídas del código real. */
function clasesEditables(): { clases: Set<string>; total: number; capturados: number } {
  const archivos: string[] = [];
  for (const raiz of CARPETAS) {
    (function walk(d: string) {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith(".tsx")) archivos.push(p);
      }
    })(join(process.cwd(), raiz));
  }

  const clases = new Set<string>();
  let total = 0;
  let capturados = 0;
  for (const p of archivos) {
    const src = readFileSync(p, "utf8");
    total += (src.match(/<Editable\b/g) ?? []).length;
    const usos = [...src.matchAll(/<Editable[\s\S]{0,900}?\/>/g)];
    capturados += usos.length;
    for (const m of usos) {
      const cn = /className=(?:"([^"]+)"|\{`([^`]+)`\}|\{([^}]+)\})/.exec(m[0]);
      const valor = cn?.[1] ?? cn?.[2] ?? cn?.[3] ?? "";
      for (const c of valor.split(/[\s`${}?:'"|&()]+/)) {
        /* NO se filtra por prefijo `stl-`: el kickoff y desarrollo usan las clases BASE del
           motor (`eyebrow`, `cta-title`), y son justo las que más chance tienen de estrenar la
           misma rayita — el comentario de `.eyebrow` en el CSS dice que busca ser consistente
           con los eyebrows de `.stl`. El criterio es "¿el motor la estila?". */
        if (c && c !== "stl-editable" && new RegExp(`\\.${c}\\b`).test(CSS)) clases.add(c);
      }
    }
  }
  return { clases, total, capturados };
}

/** Los cuerpos de las reglas `::before`/`::after` que decoran una clase dada, sin las de
 *  impresión (ver ALCANCE en la cabecera) y sin la regla del propio placeholder. */
function pseudosDecorados(clase: string): string[] {
  const out: string[] = [];
  for (const m of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const cuerpo = m[2];
    // Las reglas del PROPIO placeholder (y su variante dark) no son decoraciones ajenas.
    if (cuerpo.includes("attr(data-placeholder)") || m[1].includes(".stl-editable:empty")) continue;
    for (const sel of m[1].split(",")) {
      if (!/::(before|after)\s*$/.test(sel.trim())) continue;
      if (sel.includes("stl-pdf-")) continue;
      if (new RegExp(`\\.${clase}\\b`).test(sel)) {
        out.push(cuerpo);
        break;
      }
    }
  }
  return out;
}

describe("el placeholder de un campo vacío no puede heredar la caja de otra decoración", () => {
  it("la regla existe y pone el texto del atributo", () => {
    expect(REGLA_PLACEHOLDER, "no encontré `.stl .stl-editable:empty::before` en el CSS del motor")
      .toContain("attr(data-placeholder)");
  });

  /* El caso EXACTO que se vio en pantalla, escrito aparte para que el día que falle se sepa de
     qué se está hablando sin leer el resto del archivo. */
  it("neutraliza la rayita de marca del eyebrow (el bug reportado)", () => {
    const reset = new Map(declaraciones(REGLA_PLACEHOLDER));
    for (const [prop, porQue] of [
      ["width", "sin esto el texto queda encerrado en los 26px de la rayita y se parte letra por letra"],
      ["height", "sin esto la caja mide los 2px de la rayita y el texto se derrama sobre el título"],
      ["background", "sin esto queda la barra de color de la rayita detrás del texto"],
      ["flex-shrink", "el `flex-shrink:0` de la rayita sobrevive al reset y un placeholder ancho desborda en vez de envolver"],
    ] as const) {
      expect([...reset.keys()], porQue).toContain(prop);
    }
  });

  /* Que la propiedad esté NOMBRADA no dice nada: `width: 26px` acá adentro es el bug original
     escrito de nuevo. Lo que importa es que el valor no imponga caja. */
  it("cada propiedad del reset tiene un valor INERTE", () => {
    for (const [prop, valor] of declaraciones(REGLA_PLACEHOLDER)) {
      if (SIN_CAJA.has(prop)) continue; // content/color/opacity son del placeholder, no del reset
      expect(
        VALOR_INERTE.test(valor),
        `el reset declara \`${prop}: ${valor}\`, que NO es inerte: le impone caja al ` +
          `placeholder en vez de sacársela. Valores válidos: auto · none · 0 · 1 · static · inline.`,
      ).toBe(true);
    }
  });

  /* La que cierra la CLASE del error: se compara el reset contra lo que las decoraciones VIVAS
     declaran hoy. Si alguien le agrega `transform`, un `position:absolute` o un `display:none`
     al ::before de una clase editable, este test lo dice con el nombre de la propiedad — que es
     justo lo que un reset por enumeración no puede adivinar solo. */
  it("el reset cubre toda propiedad de caja que declare una decoración viva", () => {
    const reset = new Set(declaraciones(REGLA_PLACEHOLDER).map(([p]) => p));

    for (const clase of clasesEditables().clases) {
      for (const cuerpo of pseudosDecorados(clase)) {
        for (const [prop] of declaraciones(cuerpo)) {
          if (SIN_CAJA.has(prop)) continue;
          expect(
            reset.has(prop) || reset.has(prop.split("-")[0]),
            `\`.${clase}\` decora su pseudo-elemento con \`${prop}\`, y la regla del ` +
              `placeholder (\`.stl .stl-editable:empty::before\`) no lo neutraliza. Con el ` +
              `campo VACÍO las dos reglas caen sobre el MISMO ::before y la del placeholder ` +
              `solo gana \`content\`: \`${prop}\` sigue siendo el de la decoración y le ` +
              `deforma la caja al texto de ayuda. Agregá \`${prop}\` al reset con valor inerte.`,
          ).toBe(true);
        }
      }
    }
  });

  /* El caso más ancho posible: una regla sobre `.stl-editable` misma pisaría el placeholder de
     TODOS los campos del motor, no solo el de los eyebrow. Se chequea aparte porque esa clase
     la agrega el componente y no un llamador, así que no aparece en el barrido de arriba. */
  it("nadie decora el pseudo-elemento de `.stl-editable` misma", () => {
    expect(
      pseudosDecorados("stl-editable"),
      "hay otra regla `::before`/`::after` sobre `.stl-editable`: convive con el placeholder en " +
        "el MISMO pseudo-elemento y le va a ganar o perder por especificidad, campo por campo.",
    ).toEqual([]);
  });
});

describe("qué clases editables tienen un pseudo-elemento decorado", () => {
  /* Registro congelado. Hoy es UNA: la rayita de marca del eyebrow (landing-engine.css ~260),
     que es la que produjo el bug — y entra por DOS lados, el encabezado de sección
     (LandingView) y el hero de /roles (sections-roles). El test de arriba ya verifica que el
     reset la cubra; éste existe para que sumar una decoración nueva sea una DECISIÓN: hay
     combinaciones que el reset no puede arreglar solo (una decoración con contenido propio,
     por ejemplo, directamente no puede convivir con un placeholder en el mismo pseudo — ahí la
     salida es mover uno de los dos a `::after`). */
  const CONOCIDAS = ["stl-eyebrow"];

  it("solo las declaradas", () => {
    const { clases, total, capturados } = clasesEditables();

    /* Si el regex dejara de capturar los usos (un `<Editable>` no auto-cerrado, props más largas que el techo), el barrido se vaciaría y TODO quedaría en verde sin avisar. */
    expect(capturados, `capturé ${capturados} de ${total} usos de <Editable>: el regex se quedó corto`)
      .toBe(total);
    expect(clases.size, "no encontré ningún <Editable className=…>; ¿cambió la forma de escribirlos?")
      .toBeGreaterThan(20);

    const conPseudo = [...clases].filter((c) => pseudosDecorados(c).length > 0).sort();

    expect(
      conPseudo,
      `Una clase editable estrenó un ::before/::after decorado. Mirá cómo se ve su placeholder ` +
        `VACÍO antes de sumarla acá (el bug del eyebrow fue exactamente esto).`,
    ).toEqual(CONOCIDAS);
  });
});
