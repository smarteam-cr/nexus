/**
 * lib/tags/catalog.test.ts — que un renombre de HubSpot no deje datos huérfanos.
 *
 * ── LA FALLA QUE ATACA ───────────────────────────────────────────────────────
 * HubSpot renombra sus productos (Operations Hub → Data Hub, Commerce Hub → Revenue Hub,
 * CMS Hub → Content Hub) y la base guarda lo que se escribió el día que se escribió: al hacer
 * el cambio había 10 filas con `operations_hub` y 1 con `commerce_hub`. Si el catálogo se
 * actualizara a secas, `normalizeTag` devolvería `null` para todas ellas y `sanitizeTags` las
 * DESCARTARÍA EN SILENCIO — el proyecto perdería su clasificación sin un solo error, y con ella
 * la lente que dirige al agente de Exploración.
 *
 * Por eso los nombres muertos se resuelven al leer. Este test congela esa puerta.
 */
import { describe, expect, it } from "vitest";
import {
  HUBSPOT_HUB_SLUGS,
  TAG_CATALOG,
  labelForTag,
  normalizeTag,
  productTags,
  sanitizeTags,
  tagDef,
} from "./catalog";

describe("Catálogo de tags · los renombres de HubSpot", () => {
  it("los slugs muertos siguen resolviendo al vigente", () => {
    expect(normalizeTag("operations_hub")).toBe("data_hub");
    expect(normalizeTag("commerce_hub")).toBe("revenue_hub");
  });

  it("los LABELS muertos también, sin importar mayúsculas", () => {
    // El sync de HubSpot alimenta labels, no slugs — y "CMS Hub" devolvía `null` hasta ahora.
    expect(normalizeTag("Operations Hub")).toBe("data_hub");
    expect(normalizeTag("COMMERCE HUB")).toBe("revenue_hub");
    expect(normalizeTag("CMS Hub")).toBe("content_hub");
  });

  it("una fila con el nombre viejo Y el nuevo colapsa a uno solo", () => {
    // El caso real de la base: 10 filas con `operations_hub` y 5 con `data_hub`, algunas con
    // los dos. `sanitizeTags` deduplica DESPUÉS de normalizar, así que no queda repetido.
    expect(sanitizeTags(["operations_hub", "data_hub"])).toEqual(["data_hub"]);
    expect(sanitizeTags(["Commerce Hub", "revenue_hub"])).toEqual(["revenue_hub"]);
  });

  it("ningún alias apunta a un slug que no existe", () => {
    /* Un alias hacia un slug borrado es peor que no tenerlo: `normalizeTag` devolvería algo que
       `tagDef` no sabe pintar, y el tag saldría en la tira sin label ni color. */
    for (const viejo of ["operations_hub", "commerce_hub", "Operations Hub", "CMS Hub"]) {
      const slug = normalizeTag(viejo);
      expect(slug, `alias "${viejo}" no resuelve`).not.toBeNull();
      expect(tagDef(slug!), `alias "${viejo}" → "${slug}" no está en el catálogo`).toBeDefined();
    }
  });

  it("los nombres retirados NO están en el catálogo vivo", () => {
    // Si volvieran, habría dos tags para el mismo producto — que es justo el estado del que
    // este cambio salió (`operations_hub` y `data_hub` conviviendo).
    const slugs = TAG_CATALOG.map((t) => t.slug);
    expect(slugs).not.toContain("operations_hub");
    expect(slugs).not.toContain("commerce_hub");
    expect(labelForTag("data_hub")).toBe("Data Hub");
    expect(labelForTag("revenue_hub")).toBe("Revenue Hub");
  });
});

describe("Catálogo de tags · HUBSPOT_HUB_SLUGS", () => {
  it("son un subconjunto ESTRICTO de los productos: Insider no es un Hub", () => {
    /* La razón de que esta constante exista: filtrar por `group === "product"` mete
       `insider_one` —una app de Smarteam— entre los Hubs de HubSpot. */
    const productos = productTags().map((t) => t.slug);
    for (const hub of HUBSPOT_HUB_SLUGS) expect(productos).toContain(hub);
    expect(HUBSPOT_HUB_SLUGS as readonly string[]).not.toContain("insider_one");
    expect(productos.length).toBeGreaterThan(HUBSPOT_HUB_SLUGS.length);
  });

  it("todo Hub declarado existe en el catálogo", () => {
    const huerfanos = HUBSPOT_HUB_SLUGS.filter((s) => !tagDef(s));
    expect(huerfanos, `Hubs sin entrada en TAG_CATALOG:\n${huerfanos.join("\n")}`).toEqual([]);
  });
});
