/**
 * lib/landing/secciones-creadas.test.ts — UNA SECCIÓN CREADA EN RUNTIME SE VE EN LAS TRES
 * SUPERFICIES, O EN NINGUNA.
 *
 * Correr: `npx vitest run lib/landing/secciones-creadas.test.ts --project unit`.
 *
 * ── QUÉ PROTEGE, Y POR QUÉ ESTE MODO DE FALLA ES EL PEOR DEL MOTOR ────────────────────────────
 * Una sección que el CSE crea no está en la plantilla: su def se SINTETIZA desde la key
 * (`custom:*` → `lib/landing/custom-sections.ts`). Si algún camino se olvida de sintetizarla,
 * `toSectionDef` devuelve `null`, el `.filter()` la descarta y **la sección desaparece sin un solo
 * error, sin log y sin poner roja la suite**. Y desaparece por superficie: se ve en el editor y
 * falta en el PDF que ya se mandó, o falta justo en la propuesta que abre el cliente.
 *
 * Es la lección que DECISIONS §«Secciones personalizadas» ya dejó escrita —«un solo resolver, no un
 * parche por consumidor»— y lo que hace que valga acá es que `buildLandingConfigFromOrder` es UNA
 * función que sirve al editor, a la vista del cliente y al PDF de los SEIS documentos de proyecto.
 * Una edición cubre 6 × 3; un olvido descubre 6 × 3.
 *
 * ⚠ Por eso el test recorre los siete adaptadores y no uno de muestra: el acoplamiento vive en el
 * literal de cada `LandingShape`, y ahí es donde alguien puede sumar un documento nuevo copiando el
 * de al lado sin el campo.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "@/lib/ui/scan-source";
import { nuevaCustomKey, CUSTOM_PREFIX } from "@/lib/landing/custom-sections";
import { HtmlEmbedSection } from "@/components/landing/sections-custom";
import { buildKickoffConfig } from "@/components/canvas/kickoff-landing-adapter";
import { buildDesarrolloConfig } from "@/components/canvas/desarrollo-landing-adapter";
import { buildDiagnosticoConfig } from "@/components/canvas/diagnostico-landing-adapter";
import { buildPlanificacionConfig } from "@/components/canvas/planificacion-landing-adapter";
import { buildImplementacionConfig } from "@/components/canvas/implementacion-landing-adapter";
import { buildEntregaConfig } from "@/components/canvas/entrega-landing-adapter";
import { buildExploracionConfig } from "@/components/canvas/exploracion-landing-adapter";

/** Los siete adaptadores que pasan por `buildLandingConfigFromOrder`. */
const ADAPTADORES = [
  ["kickoff", buildKickoffConfig],
  ["desarrollo", buildDesarrolloConfig],
  ["diagnostico", buildDiagnosticoConfig],
  ["planificacion", buildPlanificacionConfig],
  ["implementacion", buildImplementacionConfig],
  ["entrega", buildEntregaConfig],
  ["exploracion", buildExploracionConfig],
] as const;

describe("⭐ una sección creada en runtime se pinta en TODOS los documentos", () => {
  it("cada adaptador la incluye, con su renderer resuelto", () => {
    /* La edición que la pone en rojo: sacarle `sintetizar` al `LandingShape` de cualquiera de los
       siete. Ese documento deja de pintar la sección — en el editor, en la vista del cliente y en
       el PDF a la vez, porque los tres salen de esta misma función. */
    const key = nuevaCustomKey();
    for (const [nombre, build] of ADAPTADORES) {
      const config = build([key]);
      const seccion = config.sections.find((s) => s.key === key);
      expect(seccion, `${nombre} descartó la sección creada en runtime`).toBeDefined();
      expect(
        seccion!.Component,
        `${nombre} sintetizó la def pero sin renderer: el motor la descarta igual`,
      ).toBeTruthy();
    }
  });

  it("⛔ y una key desconocida que NO es creada se sigue ignorando", () => {
    /* El otro lado de la moneda: la tolerancia es para las secciones que existen de verdad, no
       para un typo ni para una sección retirada. Sin esta mitad, cualquier basura en el orden
       pintaría una sección vacía en el documento del cliente. */
    for (const [nombre, build] of ADAPTADORES) {
      const config = build(["typo_que_no_existe"]);
      expect(
        config.sections.map((s) => s.key),
        `${nombre} empezó a pintar keys inventadas`,
      ).not.toContain("typo_que_no_existe");
    }
  });

  it("⚠ el orden vivo se respeta: la creada cae donde la pusieron, no al final", () => {
    /* Antes el recorrido era sobre las defs de la plantilla, así que el orden salía de ahí. Ahora
       sale de `orderedKeys` — y esa es justamente la razón por la que una sección que la plantilla
       no conoce puede existir. Si alguien vuelve a recorrer las defs, esto se cae. */
    const key = nuevaCustomKey();
    const config = buildEntregaConfig(["resumen", key, "alcance"]);
    const keys = config.sections.map((s) => s.key);
    expect(keys.indexOf(key)).toBeGreaterThan(keys.indexOf("resumen"));
    expect(keys.indexOf(key)).toBeLessThan(keys.indexOf("alcance"));
  });

  it("⚠ una key repetida en el orden pinta UNA sola vez", () => {
    /* Con el recorrido viejo (sobre las defs) el dedupe era gratis. Con el recorrido sobre el
       orden hay que hacerlo, o una fila duplicada en el Json pinta la sección dos veces. */
    const config = buildEntregaConfig(["resumen", "resumen"]);
    expect(config.sections.filter((s) => s.key === "resumen")).toHaveLength(1);
  });

  it("⚠ las de dos segmentos (las que YA existen en producción) siguen siendo el embed de HTML", () => {
    /* Las creadas antes del 2026-08-21 son `custom:<uuid>`, sin tipo. Exigir tres segmentos las
       dejaría sin def — o sea, las borraría de la pantalla de propuestas que ya se mandaron. */
    const vieja = `${CUSTOM_PREFIX}0f9a1b2c-3d4e-5f60-7182-93a4b5c6d7e8`;
    const seccion = buildEntregaConfig([vieja]).sections.find((s) => s.key === vieja);
    expect(seccion, "una sección personalizada vieja dejó de resolver").toBeDefined();
    /* ⚠ Se compara el RENDERER y no el `sectionType`: `toSectionDef` copia campo por campo y
       `sectionType` no cruza a `SectionDef` — su trabajo ya lo hizo al elegir el componente. */
    expect(seccion!.Component, "una personalizada vieja dejó de pintar el embed de HTML").toBe(
      HtmlEmbedSection,
    );
  });
});

describe("⛔ el PDF no puede divergir del editor", () => {
  it("los adaptadores de impresión son LOS MISMOS builders, no una copia", () => {
    /* El modo de falla que esto impide: que alguien le ponga a `PrintDocView` una config congelada
       («total, el PDF no reordena») y la sección creada desaparezca SOLO del PDF. Es el caso que
       DECISIONS ya nombra: se ve en el editor y falta en la propuesta que abrió el prospecto.
       La edición que lo pone en rojo: cambiar `buildKickoffConfig` por `landingConfigForKickoff()`
       en el mapa `ADAPTADORES` de PrintDocView. */
    const src = fs.readFileSync(path.join(RAIZ, "components/print/PrintDocView.tsx"), "utf8");
    const i = src.indexOf("const ADAPTADORES");
    expect(i, "desapareció el mapa de adaptadores de impresión").toBeGreaterThan(-1);
    const mapa = src.slice(i, src.indexOf("};", i));
    expect(mapa.length, "la guarda no está mirando nada").toBeGreaterThan(200);
    for (const build of [
      "buildKickoffConfig",
      "buildDesarrolloConfig",
      "buildDiagnosticoConfig",
      "buildPlanificacionConfig",
      "buildImplementacionConfig",
      "buildExploracionConfig",
    ]) {
      expect(
        mapa.includes(build),
        `el PDF dejó de usar ${build}: puede divergir del editor sin que nada avise`,
      ).toBe(true);
    }
  });
});
