/**
 * lib/landing/lo-que-se-ve-se-cambia.test.ts — LA REGLA DE ELÍAS, HECHA GUARDA.
 *
 * Textual, el 2026-08-23: *«debería poder cambiarse todo»*. Lo dijo después de pedirle al chat que
 * cambiara «QUÉ TE CUESTA HOY» —el rótulo de una columna del diagnóstico— y recibir un «Aplicado»
 * sobre algo que no se movió.
 *
 * ── LAS DOS FORMAS DE ESTAR MUDO, Y LAS DOS ESTABAN VIVAS ────────────────────────────────────
 *  1. **El rótulo vive en la DEFINICIÓN.** Los chips de columna (`chips.retos`, `chips.panel`) y
 *     los rótulos de las portadas eran literales del documento: ninguna operación los alcanzaba y
 *     ningún campo de la pantalla los editaba. Se ven, y no hay dónde tocarlos.
 *  2. **El campo existe pero nadie lo pinta.** `plataforma` seguía en el esquema que el modelo lee
 *     mientras el renderer, con `chips.panel` declarado, tomaba la otra rama. El chat lo escribía
 *     sin un solo rechazo. Es el «Aplicado» de la captura.
 *
 * ⛔ Y las dos fallan hacia el mismo lado: en silencio. La primera deja a la persona sin salida; la
 * segunda le miente. Por eso las dos guardas viven en el mismo archivo: son la misma promesa.
 */
import { describe, it, expect } from "vitest";
import { DOC } from "@/lib/canvas/assist-de-documento";
import { EXPLORACION_DEF_BY_KEY } from "@/components/landing/configs/exploracion.defs";
import { BC_TEMPLATES } from "@/components/landing/configs/templates.defs";
import { schemaParaElChat, camposMudosDe } from "@/lib/canvas/capacidades-de-documento";
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "@/lib/ui/scan-source";

const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");

interface DefMirada {
  key: string;
  sectionType?: string;
  selfTitled?: boolean;
  leeElEncabezado?: boolean;
  schema?: unknown;
  schemaDelChat?: unknown;
  chips?: { retos?: string; panel?: string };
  [k: string]: unknown;
}

/** Todas las defs vivas con el documento que las declara. */
const TODAS: { doc: string; def: DefMirada }[] = [
  ...Object.entries(DOC as unknown as Record<string, { defs?: Record<string, DefMirada> }>).flatMap(
    ([pieza, d]) => Object.values(d.defs ?? {}).map((def) => ({ doc: pieza, def })),
  ),
  ...Object.values(EXPLORACION_DEF_BY_KEY).map((def) => ({
    doc: "exploration",
    def: def as unknown as DefMirada,
  })),
  ...(Object.values(BC_TEMPLATES) as unknown as { id: string; sections: DefMirada[] }[]).flatMap((t) =>
    t.sections.map((def) => ({ doc: t.id, def })),
  ),
];

const props = (s: unknown) =>
  Object.keys((s as { properties?: Record<string, unknown> })?.properties ?? {});

describe("el rótulo de arriba SIEMPRE tiene una puerta", () => {
  /**
   * Hay DOS mecanismos y cuál aplica lo decide `selfTitled`:
   *  · sección normal → el encabezado lo pinta el motor, y el rótulo es la columna
   *    `eyebrowOverride` (`seccion.rotular` + el campo del encabezado);
   *  · portada `selfTitled` → el motor no pinta encabezado, así que el rótulo tiene que ser un
   *    CAMPO de su propia data (`eyebrow`), que el renderer lee.
   * Una def que no tiene ninguno de los dos se ve en pantalla y no se puede tocar por ningún lado.
   */
  const rotulable = (def: DefMirada) => !def.selfTitled || !!def.leeElEncabezado;
  const tieneCampo = (def: DefMirada) => props(schemaParaElChat(def)).includes("eyebrow");

  /**
   * Las dos que quedan afuera, cada una con SU motivo — y el motivo se verifica abajo, porque una
   * lista de excepciones sin comprobar es el lugar donde se esconde el próximo fallo.
   */
  const SIN_ROTULO_A_PROPOSITO: Record<string, "otro-campo" | "no-lo-pinta"> = {
    /* Su rótulo chico ES un campo con otro nombre: `credencial`, que el renderer usa con el de la
       def solo de respaldo. Tiene puerta; lo que no tiene es una llamada `eyebrow`. */
    partner: "otro-campo",
    /* El cierre no pinta rótulo chico. Declararle uno sería el campo fantasma del otro describe. */
    cta: "no-lo-pinta",
  };

  it("la guarda está mirando el motor entero", () => {
    expect(TODAS.length, "se cayeron defs del censo").toBeGreaterThan(80);
  });

  it("⭐ ninguna sección queda sin forma de cambiar su rótulo", () => {
    const mudas = TODAS.filter(
      ({ def }) =>
        !rotulable(def) &&
        !tieneCampo(def) &&
        !SIN_ROTULO_A_PROPOSITO[def.sectionType ?? def.key],
    ).map(({ doc, def }) => `${doc}/${def.key}`);
    expect(
      mudas,
      "Esa sección es `selfTitled` —el motor no le pinta encabezado, así que `seccion.rotular` se " +
        "rechaza— y su esquema del chat no declara `eyebrow`: el rótulo se ve y no hay dónde " +
        "cambiarlo, ni por chat ni a mano. Declaralo en `schemaDelChat` (nunca en `schema`: el " +
        "agente lo pisaría al regenerar) y comprobá que su renderer lo pinte.",
    ).toEqual([]);
  });

  it("⛔ y cada excepción se sostiene: o tiene otra puerta, o no pinta rótulo", () => {
    const src = leer("components/landing/sections.tsx");
    const tramoDe = (nombre: string) => {
      const i = src.indexOf(`export const ${nombre}Section`);
      expect(i, `no encuentro el renderer de ${nombre}`).toBeGreaterThan(0);
      return src.slice(i, src.indexOf("export const", i + 10));
    };
    /* `partner`: su rótulo es `credencial`, y tiene que seguir estando en el esquema del chat. */
    expect(tramoDe("Partner")).toContain("(data.credencial ?? \"\").trim() || (sectionEyebrow ?? \"\").trim()");
    const partner = TODAS.find(({ def }) => (def.sectionType ?? def.key) === "partner");
    expect(props(schemaParaElChat(partner!.def)), "el chat perdió la puerta al rótulo del partner").toContain(
      "credencial",
    );
    /* `cta`: si algún día pinta rótulo, sale de la lista — y esta assert es la que lo obliga. */
    expect(tramoDe("Cta"), "el cierre empezó a pintar rótulo: ya puede salir de la lista").not.toContain(
      "sectionEyebrow",
    );
  });

  it("⭐ y el renderer de las portadas lo pinta EDITABLE, no como texto pelado", () => {
    /* Era la otra mitad del mismo fallo: aunque el campo existiera, `HeroSection` lo dibujaba con
       un `<span>` y ni siquiera con `editable`. La edición que la pone en rojo: volver al span. */
    const src = leer("components/landing/sections.tsx");
    const i = src.indexOf("export const HeroSection");
    const tramo = src.slice(i, src.indexOf("export const", i + 10));
    expect(tramo.length, "se movió HeroSection: la guarda no mira nada").toBeGreaterThan(800);
    expect(tramo).toContain('onCommit={(v) => set({ eyebrow: v })}');
  });
});

describe("el chat no ve campos que este documento no pinta", () => {
  it("⭐ con `chips.panel`, `plataforma` no llega al modelo", () => {
    /* El «Aplicado» de la captura: el chat escribió `plataforma`, que con el rótulo fijo declarado
       el renderer ya no pinta. Sacarlo del esquema del chat cierra las dos puertas de una — el
       ejecutor resuelve las rutas contra ese mismo esquema. */
    const conChips = TODAS.filter(({ def }) => def.chips?.panel);
    expect(conChips.length, "ningún documento declara chips: la guarda no prueba nada").toBe(3);
    for (const { doc, def } of conChips) {
      expect(camposMudosDe(def)).toContain("plataforma");
      expect(
        props(schemaParaElChat(def)),
        `${doc}/${def.key}: el modelo ve un campo que este documento no pinta`,
      ).not.toContain("plataforma");
    }
  });

  it("⛔ y donde NO hay chips lo sigue viendo — ahí el campo es real", () => {
    /* Es la propuesta de sitio web, el único de estos documentos que se publica al cliente. Si el
       predicado se equivocara, esa propuesta perdería el nombre de la plataforma. */
    const sinChips = TODAS.filter(
      ({ def }) => (def.sectionType ?? def.key) === "web_diagnosis" && !def.chips?.panel,
    );
    expect(sinChips.length, "se movió el único que usa `plataforma` de verdad").toBe(1);
    expect(props(schemaParaElChat(sinChips[0].def))).toContain("plataforma");
  });

  it("⭐ y los rótulos de columna SÍ los alcanza el chat", () => {
    /* Lo que Elías pidió: poder cambiar «QUÉ FALTA» y «QUÉ TE CUESTA HOY». Van en el esquema del
       CHAT y no en el del agente — el schema es el prompt, y sumarlos allá pondría a cuatro
       agentes a reescribir el rótulo de una columna en cada regeneración. */
    for (const { doc, def } of TODAS.filter(({ def }) => def.chips?.panel)) {
      const delChat = props(schemaParaElChat(def));
      expect(delChat, `${doc}/${def.key}: el chat no puede cambiar los rótulos`).toContain(
        "rotuloPanel",
      );
      expect(
        props(def.schema),
        `${doc}/${def.key}: el AGENTE reescribiría el rótulo en cada regeneración`,
      ).not.toContain("rotuloPanel");
    }
  });

  it("⭐ y el renderer los pinta editables, con el rótulo del documento de respaldo", () => {
    const src = leer("components/landing/sections-website.tsx");
    expect(src).toContain("onCommit={(v) => set({ rotuloPanel: v })}");
    expect(src).toContain("onCommit={(v) => set({ rotuloRetos: v })}");
    /* El orden importa: lo que escribió una persona manda sobre el rótulo del documento. */
    expect(src).toContain("placeholder={sectionChips?.panel ?? \"\"}");
  });
});
