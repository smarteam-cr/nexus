/**
 * lib/hubspot/sync-projects.test.ts — guard de la pérdida silenciosa de tags.
 *
 * EL BUG (2026-07-24): el sync escribía `tags: hubTag ? [hubTag] : []` — un REEMPLAZO.
 * Como `inferServiceMapping` devuelve `hubTag: null` para cualquier nombre fuera de su
 * catálogo de 8 plantillas, todo proyecto con nombre libre quedaba con `tags: []` en CADA
 * sync, borrando la clasificación del agente de handoff Y la del CSE. Y el sync corre al
 * ENTRAR al cliente (cooldown 10 min), así que los tags "desaparecían solos" cada tanto:
 * un defecto invisible, sin error ni aviso.
 *
 * Lo que congela este test: el sync solo puede SUMAR. Si alguien vuelve a escribir un
 * reemplazo, el primer caso falla.
 */
import { describe, expect, it } from "vitest";
import { mergeHubTag } from "./sync-projects";

describe("mergeHubTag: el sync de HubSpot NUNCA borra tags", () => {
  it("sin hubTag (nombre fuera del catálogo) CONSERVA lo que había — el bug original", () => {
    // Caso real: "Wherex - Nuevo tipo de objeto Deal" → hubTag null. Antes → [].
    const curados = ["sales_hub", "service_hub", "marketing_hub", "data_hub", "custom_dev", "crm_migration"];
    expect(mergeHubTag(curados, null)).toEqual(curados);
  });

  it("con hubTag, SUMA sin pisar lo curado", () => {
    expect(mergeHubTag(["custom_dev"], "Marketing Hub")).toEqual(["custom_dev", "marketing_hub"]);
  });

  it("no duplica si el tag derivado ya está (en slug o en label legacy)", () => {
    expect(mergeHubTag(["marketing_hub"], "Marketing Hub")).toEqual(["marketing_hub"]);
    expect(mergeHubTag(["Marketing Hub"], "Marketing Hub")).toEqual(["marketing_hub"]);
  });

  it("guarda el SLUG canónico, no el label que trae el mapa de HubSpot", () => {
    expect(mergeHubTag([], "Sales Hub")).toEqual(["sales_hub"]);
  });

  it("normaliza labels legacy ya guardados", () => {
    expect(mergeHubTag(["Service Hub", "custom_dev"], null)).toEqual(["service_hub", "custom_dev"]);
  });

  it("descarta basura sin romper (misma regla que sanitizeTags)", () => {
    expect(mergeHubTag(["no_existe", "sales_hub"], null)).toEqual(["sales_hub"]);
    expect(mergeHubTag([], "Hub Inventado")).toEqual([]);
  });

  it("proyecto nuevo sin hubTag → vacío (no hay nada que preservar)", () => {
    expect(mergeHubTag([], null)).toEqual([]);
  });
});
