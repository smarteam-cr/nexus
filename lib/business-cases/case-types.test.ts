/**
 * lib/business-cases/case-types.test.ts — que un tipo de propuesta no siembre lo que no sabe.
 *
 * ── LA FALLA QUE ATACA ───────────────────────────────────────────────────────
 * El tipo "Sitio web" sembraba `content_hub` (y su subtipo E-commerce, `commerce_hub`) como si
 * elegirlo dijera algo sobre la PLATAFORMA. No lo dice: el sitio puede ir en WordPress. El tag
 * viajaba igual, y los tags no son decorativos — dirigen al agente de Exploración
 * (`EXPLORACION_TAG_LENSES`) y `custom_dev`/`insider_one` rutean al canvas Desarrollo y a la
 * fase técnica del cronograma.
 *
 * La regla que quedó: se siembra SOLO lo que elegir el tipo vuelve CIERTO. Como el catálogo va
 * a crecer (CRM, CDP, lo que venga), esto la sostiene sin depender de que alguien se acuerde.
 */
import { describe, expect, it } from "vitest";
import { tagDef, TAG_CATALOG } from "@/lib/tags/catalog";
import { BC_TYPE_CATALOG, seedTagsFor, resolveBcType, DEFAULT_BC_TYPE_ID } from "./case-types";
import { BC_TEMPLATES } from "@/components/landing/configs/templates.defs";

/**
 * Los ÚNICOS tipos que pueden sembrar un tag de PRODUCTO, porque el producto está en su
 * identidad: elegir "Implementación de Insider" ES afirmar que hay Insider.
 *
 * ⚠ Si agregás un tipo que siembra producto, agregalo acá A PROPÓSITO — y antes preguntate si
 * el producto se DEDUCE del tipo o si en realidad lo estás adivinando. "Sitio web" parecía
 * deducirlo y no lo deducía.
 */
const PUEDEN_SEMBRAR_PRODUCTO = new Set(["insider_implementation"]);

describe("Tipos de propuesta · los tags que siembran", () => {
  it("todo tag sembrado existe en el catálogo", () => {
    /* Un slug con typo no explota: se guarda igual y queda como un tag fantasma que la tira
       no sabe pintar ni el CSE puede quitar. */
    const desconocidos = BC_TYPE_CATALOG.flatMap((t) => [
      ...t.defaultTags.filter((s) => !tagDef(s)).map((s) => `${t.id} → ${s}`),
      ...(t.subtypes ?? []).flatMap((sub) =>
        (sub.extraTags ?? []).filter((s) => !tagDef(s)).map((s) => `${t.id}/${sub.id} → ${s}`),
      ),
    ]);
    expect(
      desconocidos,
      `Tags sembrados que no están en TAG_CATALOG (serían invisibles en la tira):\n` +
        desconocidos.join("\n"),
    ).toEqual([]);
  });

  it("ningún tipo siembra un PRODUCTO que no tenga en su identidad", () => {
    const productos = new Set(TAG_CATALOG.filter((t) => t.group === "product").map((t) => t.slug));
    const infractores = BC_TYPE_CATALOG.filter((t) => !PUEDEN_SEMBRAR_PRODUCTO.has(t.id)).flatMap(
      (t) =>
        [...t.defaultTags, ...(t.subtypes ?? []).flatMap((s) => s.extraTags ?? [])]
          .filter((s) => productos.has(s))
          .map((s) => `${t.label} siembra "${s}"`),
    );
    expect(
      infractores,
      `Un tipo está sembrando un producto que elegirlo NO vuelve cierto:\n${infractores.join("\n")}\n\n` +
        `La plataforma la agrega el CSE cuando la sabe. Si de verdad el tipo la AFIRMA, sumá su ` +
        `id a PUEDEN_SEMBRAR_PRODUCTO en este archivo y dejá escrito por qué.`,
    ).toEqual([]);
  });

  it("el tipo Sitio web afirma el alcance y NO la plataforma", () => {
    // El caso concreto que originó la regla, congelado: si alguien vuelve a meter el producto
    // acá, el mensaje de arriba explica por qué no va.
    const web = BC_TYPE_CATALOG.find((t) => t.id === "website")!;
    expect(seedTagsFor(web)).toEqual(["sitio_web"]);
    expect(seedTagsFor(web, "ecommerce")).toEqual(["sitio_web"]);
  });
});

describe("Tipos de propuesta · integridad del catálogo", () => {
  it("cada tipo apunta a una plantilla que existe", () => {
    const huerfanos = BC_TYPE_CATALOG.filter((t) => !BC_TEMPLATES[t.templateId]).map(
      (t) => `${t.id} → ${t.templateId}`,
    );
    expect(huerfanos, `Tipos con plantilla inexistente:\n${huerfanos.join("\n")}`).toEqual([]);
  });

  it("los ids de tipo y de subtipo no se repiten", () => {
    const ids = BC_TYPE_CATALOG.map((t) => t.id);
    expect(new Set(ids).size, "hay ids de tipo repetidos").toBe(ids.length);
    for (const t of BC_TYPE_CATALOG) {
      const subIds = (t.subtypes ?? []).map((s) => s.id);
      expect(new Set(subIds).size, `subtipos repetidos en ${t.id}`).toBe(subIds.length);
    }
  });

  it("no hay dos tipos del mismo color", () => {
    /* El tag de color existe para distinguir un tipo de otro de un vistazo. Dos tipos del mismo
       tono no solo no ayudan: hacen creer que son lo mismo. El compilador ya obliga a declarar
       `tone` (es requerido en `BcTypeDef`); esto vigila lo que el tipo no puede — que el valor
       elegido sea NUEVO. Si el catálogo crece más que la paleta, no repitas: agregá una variante
       a `components/ui/Badge` y sumala a `BcTypeTone`. */
    const porTono = new Map<string, string[]>();
    for (const t of BC_TYPE_CATALOG) {
      porTono.set(t.tone, [...(porTono.get(t.tone) ?? []), t.shortLabel]);
    }
    const repetidos = [...porTono.entries()]
      .filter(([, tipos]) => tipos.length > 1)
      .map(([tono, tipos]) => `${tono}: ${tipos.join(", ")}`);
    expect(repetidos, `Tipos que comparten color:\n${repetidos.join("\n")}`).toEqual([]);
  });

  it("el tipo por default existe y está habilitado", () => {
    // `resolveBcType` cae acá con null/desconocido: si estuviera deshabilitado o no existiera,
    // toda propuesta legacy resolvería a un tipo que el stepper no deja elegir.
    const def = resolveBcType(null);
    expect(def.id).toBe(DEFAULT_BC_TYPE_ID);
    expect(def.enabled).toBe(true);
  });
});
