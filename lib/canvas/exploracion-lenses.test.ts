/**
 * lib/canvas/exploracion-lenses.test.ts — guard del TAG-DRIVEN de la Exploración.
 *
 * Dos cosas que tienen que seguir siendo ciertas para que el tag NO vuelva a ser decoración:
 *
 *  1. COMPLETITUD — todo tag del catálogo tiene lente. Agregar un tag sin decidir qué cambia
 *     en la exploración lo dejaría inerte para este agente (que es exactamente el estado del
 *     que venimos). El test falla y obliga a tomar la decisión.
 *  2. SELECTIVIDAD — solo entran las lentes de los tags ACTIVOS. Si se colaran todas, el
 *     agente leería instrucciones de proyectos que no son el suyo y el tag dejaría de dirigir.
 *
 * Vive en `lib/` porque el project `unit` de vitest solo incluye `lib/**` (el sujeto bajo
 * prueba vive en components/, igual que el golden de build-landing).
 */
import { describe, expect, it } from "vitest";
import { TAG_CATALOG } from "@/lib/tags/catalog";
import {
  EXPLORACION_TAG_LENSES,
  buildTagLensBlock,
} from "@/components/landing/configs/exploracion-lenses";

describe("Lentes de exploración: completitud contra el catálogo de tags", () => {
  it("TODO tag del catálogo tiene su lente", () => {
    const sinLente = TAG_CATALOG.filter((t) => !EXPLORACION_TAG_LENSES[t.slug]).map((t) => t.slug);
    expect(
      sinLente,
      `Tags sin lente de exploración: ${sinLente.join(", ")}.\n` +
        "Un tag sin lente no dirige nada — agregá su entrada en " +
        "components/landing/configs/exploracion-lenses.ts decidiendo QUÉ tiene que ir a buscar " +
        "la exploración en ese tipo de proyecto.",
    ).toEqual([]);
  });

  it("no hay lentes huérfanas (de tags que ya no existen en el catálogo)", () => {
    const slugs = new Set(TAG_CATALOG.map((t) => t.slug));
    const huerfanas = Object.keys(EXPLORACION_TAG_LENSES).filter((k) => !slugs.has(k));
    expect(huerfanas, `Lentes de tags inexistentes: ${huerfanas.join(", ")}`).toEqual([]);
  });

  it("el tag de sitio web existe y su lente cubre lo que pidió el negocio", () => {
    expect(TAG_CATALOG.some((t) => t.slug === "sitio_web")).toBe(true);
    const lente = EXPLORACION_TAG_LENSES.sitio_web.toLowerCase();
    // Los tres ejes que motivaron el tag (referencias, funcionalidad, assets).
    expect(lente).toContain("referencia");
    expect(lente).toContain("funcionalidad");
    expect(lente).toContain("assets");
  });
});

describe("buildTagLensBlock: solo inyecta las lentes de los tags activos", () => {
  it("con un tag, trae SU lente y no la de otro", () => {
    const bloque = buildTagLensBlock(["sitio_web"]);
    expect(bloque).toContain("Sitio web");
    expect(bloque.toLowerCase()).toContain("anti-referencias");
    // La lente de sales_hub NO debe viajar en un proyecto que no lo tiene.
    expect(bloque).not.toContain(EXPLORACION_TAG_LENSES.sales_hub);
  });

  it("con varios tags, trae todas las lentes activas", () => {
    const bloque = buildTagLensBlock(["sitio_web", "sales_hub"]);
    expect(bloque).toContain(EXPLORACION_TAG_LENSES.sitio_web);
    expect(bloque).toContain(EXPLORACION_TAG_LENSES.sales_hub);
  });

  it("sin tags, devuelve el bloque EXPLÍCITO de 'no asumas tipo de proyecto'", () => {
    const bloque = buildTagLensBlock([]);
    expect(bloque).toContain("NO tiene etiquetas");
    // No debe filtrarse ninguna lente concreta.
    expect(bloque).not.toContain(EXPLORACION_TAG_LENSES.sitio_web);
  });

  it("descarta slugs desconocidos (misma regla que sanitizeTags en todo el sistema)", () => {
    const bloque = buildTagLensBlock(["no_existe", "sitio_web"]);
    expect(bloque).not.toContain("no_existe");
    expect(bloque).toContain(EXPLORACION_TAG_LENSES.sitio_web);
  });

  it("acepta LABELS además de slugs (compat del storage histórico)", () => {
    // `normalizeTag` acepta label o slug — el bloque no puede depender de cuál llegó.
    expect(buildTagLensBlock(["Sitio web"])).toContain(EXPLORACION_TAG_LENSES.sitio_web);
  });
});
