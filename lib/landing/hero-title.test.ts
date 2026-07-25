/**
 * lib/landing/hero-title.test.ts
 *
 * El candado que sostiene la promesa "ningún documento del motor se queda sin título".
 *
 * El test que importa es el último: recorre las SEIS portadas reales y falla si alguna
 * puede quedar sin rótulo o si dos comparten el mismo. Existe porque el defecto que
 * motivó todo esto fue exactamente ese — Exploración, Planificación e Implementación
 * heredaban el respaldo de Desarrollo y se presentaban como un requerimiento técnico —
 * y porque el séptimo documento que alguien construya va a copiar de estos.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { resolveHeroTitle, heroTitleBrief, HERO_TITLE_MAX_CHARS } from "@/lib/landing/hero-title";
import { KICKOFF_SECTION_DEFS } from "@/components/landing/configs/kickoff.defs";
import { DESARROLLO_SECTION_DEFS } from "@/components/landing/configs/desarrollo.defs";
import { EXPLORACION_SECTION_DEFS } from "@/components/landing/configs/exploracion.defs";
import { DIAGNOSTICO_SECTION_DEFS } from "@/components/landing/configs/diagnostico.defs";
import { PLANIFICACION_SECTION_DEFS } from "@/components/landing/configs/planificacion.defs";
import { IMPLEMENTACION_SECTION_DEFS } from "@/components/landing/configs/implementacion.defs";

describe("la cadena de respaldo del título", () => {
  it("gana el título propio, y el titular del caso baja a bajada", () => {
    expect(resolveHeroTitle({
      escrito: "Diagnóstico comercial",
      titular: "Tu proceso pierde los leads que marketing pagó",
      rotulo: "Diagnóstico de rendimiento",
    })).toEqual({
      titulo: "Diagnóstico comercial",
      bajada: "Tu proceso pierde los leads que marketing pagó",
    });
  });

  it("🔒 sin título propio, el titular SUBE a título y NO se repite abajo", () => {
    // Es lo que evita que los documentos ya generados —algunos publicados y vistos por
    // el cliente— cambien de aspecto solos: su titular sigue siendo el título hasta que
    // alguien le escriba uno propio.
    expect(resolveHeroTitle({
      escrito: "",
      titular: "Tu proceso pierde los leads que marketing pagó",
      rotulo: "Diagnóstico de rendimiento",
    })).toEqual({
      titulo: "Tu proceso pierde los leads que marketing pagó",
      bajada: "",
    });
  });

  it("sin nada escrito, cae al rótulo del documento", () => {
    expect(resolveHeroTitle({ rotulo: "Plan de implementación" }))
      .toEqual({ titulo: "Plan de implementación", bajada: "" });
  });

  it("un texto con solo espacios cuenta como vacío", () => {
    expect(resolveHeroTitle({ escrito: "   \n ", titular: "  ", rotulo: "Guía de construcción" }))
      .toEqual({ titulo: "Guía de construcción", bajada: "" });
  });

  it("recorta los espacios de los bordes", () => {
    expect(resolveHeroTitle({ escrito: "  Diagnóstico comercial  " }).titulo).toBe("Diagnóstico comercial");
  });

  it("tolera basura sin reventar", () => {
    // La data viene de la base y de la IA: puede llegar cualquier cosa.
    for (const basura of [null, 42, {}, [], true]) {
      expect(resolveHeroTitle({ escrito: basura, titular: basura, rotulo: "Kickoff" }))
        .toEqual({ titulo: "Kickoff", bajada: "" });
    }
  });

  it("sin nada de nada devuelve vacío — el candado de abajo prueba que no puede pasar", () => {
    expect(resolveHeroTitle({})).toEqual({ titulo: "", bajada: "" });
  });
});

describe("la guía que se le da al agente", () => {
  it("nombra el tope de largo y trae el ejemplo del documento", () => {
    const guia = heroTitleBrief("Diagnóstico de rendimiento");
    expect(guia).toContain(String(HERO_TITLE_MAX_CHARS));
    expect(guia).toContain("Diagnóstico de rendimiento");
  });

  it("el tope es corto de verdad", () => {
    expect(HERO_TITLE_MAX_CHARS).toBeLessThanOrEqual(80);
  });
});

// ── 🔒 EL CANDADO ────────────────────────────────────────────────────────────

const DOCUMENTOS = [
  { nombre: "Kickoff", defs: KICKOFF_SECTION_DEFS },
  { nombre: "Desarrollo", defs: DESARROLLO_SECTION_DEFS },
  { nombre: "Exploración", defs: EXPLORACION_SECTION_DEFS },
  { nombre: "Diagnóstico", defs: DIAGNOSTICO_SECTION_DEFS },
  { nombre: "Planificación", defs: PLANIFICACION_SECTION_DEFS },
  { nombre: "Implementación", defs: IMPLEMENTACION_SECTION_DEFS },
];

describe("🔒 ninguna portada puede quedar sin título ni heredar el de otra", () => {
  for (const doc of DOCUMENTOS) {
    it(`${doc.nombre}: su portada declara un rótulo propio y no vacío`, () => {
      // La portada es la primera sección de cada documento (garantizado por el adaptador).
      const portada = doc.defs[0];
      expect(portada, `${doc.nombre} no tiene secciones`).toBeTruthy();
      expect(portada.label?.trim(), `la portada de ${doc.nombre} no declara rótulo`).toBeTruthy();

      // Con la portada vacía, el respaldo tiene que dar el rótulo de ESTE documento.
      expect(resolveHeroTitle({ rotulo: portada.label }).titulo).toBe(portada.label);
    });

    it(`${doc.nombre}: su portada le pide el título al agente`, () => {
      const portada = doc.defs[0];
      const props = (portada.schema as { properties?: Record<string, unknown> })?.properties;
      expect(
        props?.titulo,
        `la portada de ${doc.nombre} no tiene el campo del título en su esquema`,
      ).toBeTruthy();
      expect(
        portada.brief?.includes("titulo"),
        `la guía de la portada de ${doc.nombre} no le explica el título al agente`,
      ).toBe(true);
    });
  }

  it("los seis rótulos son distintos entre sí", () => {
    // Si dos documentos comparten rótulo, uno se está presentando como el otro — que es
    // literalmente el defecto que este archivo vino a cerrar.
    const rotulos = DOCUMENTOS.map((d) => d.defs[0].label);
    expect(new Set(rotulos).size, `rótulos repetidos: ${rotulos.join(" · ")}`).toBe(rotulos.length);
  });

  it("🔒 el campo editable trata como vacío lo que no sea texto", () => {
    // Pasó de verdad: durante una recarga en caliente, una portada recibió un objeto
    // donde iba el título. El navegador lo pintó como "[object Object]" y, como este
    // campo comitea su propio texto al perder el foco, ESA CADENA SE GUARDÓ en dos
    // documentos de un proyecto real (saneado con scripts/fix-titulos-basura.ts).
    // El tipo dice `string`, pero los tipos no existen en tiempo de ejecución y la data
    // viene de la base y de la IA. Las TRES lecturas del valor tienen que ir por la
    // versión saneada: la que pinta, la que compara al desmontar (el camino por el que
    // se guardó) y la de modo lectura.
    const src = fs.readFileSync(path.join(process.cwd(), "components/landing/inline.tsx"), "utf8");
    expect(
      src.includes('const safeValue = typeof value === "string" ? value : ""'),
      "Editable dejó de sanear el valor: un objeto vuelve a poder guardarse como texto",
    ).toBe(true);
    expect(
      src.includes("useRef(safeValue)"),
      "el commit al desmontar volvió a comparar contra el valor crudo — es el camino exacto " +
        "por el que se guardó '[object Object]'",
    ).toBe(true);
    expect(
      src.includes("if (!safeValue) return null"),
      "el modo lectura volvió a pintar el valor crudo",
    ).toBe(true);
  });

  it("ningún rótulo menciona un requerimiento técnico salvo el de Desarrollo", () => {
    // El respaldo viejo era "Requerimiento técnico de integración" para CUATRO documentos.
    for (const doc of DOCUMENTOS) {
      if (doc.nombre === "Desarrollo") continue;
      expect(
        /requerimiento t[eé]cnico/i.test(doc.defs[0].label),
        `la portada de ${doc.nombre} se presenta como un requerimiento técnico`,
      ).toBe(false);
    }
  });
});
