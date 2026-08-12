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
import fs from "node:fs";
import path from "node:path";
import {
  EJES_EXCLUYENTES,
  EJE_TIPO_IMPLEMENTACION,
  GRUPOS_EXCLUYENTES,
  HUBSPOT_HUB_SLUGS,
  IMPLEMENTACION_TAG,
  REIMPLEMENTACION_TAG,
  TAG_CATALOG,
  conTag,
  ejeExcluyenteDe,
  esReimplementacion,
  faltanEjesRequeridos,
  labelForTag,
  normalizeTag,
  productTags,
  sanitizeTags,
  seccionesDelCatalogo,
  tagDef,
  tipoDeImplementacion,
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


/**
 * ── LA SEGUNDA FALLA QUE ESTE ARCHIVO ATACA (2026-08-12) ─────────────────────
 * El tipo de implementación vivía en una COLUMNA aparte, con su propio endpoint y su propio chip.
 * Al mudarlo a `tags` aparece un riesgo que antes no existía: una LISTA no puede impedir sola que
 * un proyecto sea "implementación" y "re-implementación" a la vez. Un enum sí podía.
 *
 * Lo que reemplaza a esa garantía son las dos funciones de abajo, y las dos tienen que existir:
 *   · `sanitizeTags` REPARA lo que ya llegó contradictorio → PRIMERO gana (lo curado le gana al agente).
 *   · `conTag` EXPRESA una elección nueva → ÚLTIMO gana (el clic del CSE hace algo).
 * Invertir cualquiera de las dos produce un bug mudo: con la primera al revés, cada regeneración
 * del handoff da vuelta una clasificación corregida a mano; con la segunda al revés, el clic en
 * "Re-implementación" no hace nada y no da error.
 */
describe("Catálogo de tags · el eje excluyente", () => {
  it("sanitizeTags deja UNO solo, y gana el primero", () => {
    expect(sanitizeTags([IMPLEMENTACION_TAG, REIMPLEMENTACION_TAG])).toEqual([IMPLEMENTACION_TAG]);
    expect(sanitizeTags([REIMPLEMENTACION_TAG, IMPLEMENTACION_TAG])).toEqual([REIMPLEMENTACION_TAG]);
    // El caso REAL: el merge aditivo del handoff concatena lo curado + lo del agente.
    expect(sanitizeTags(["sales_hub", REIMPLEMENTACION_TAG, "custom_dev", IMPLEMENTACION_TAG])).toEqual([
      "sales_hub",
      REIMPLEMENTACION_TAG,
      "custom_dev",
    ]);
  });

  it("los tags que NO son de un eje excluyente conviven sin límite", () => {
    const varios = ["sales_hub", "service_hub", "custom_dev", "crm_migration", "recurrente"];
    expect(sanitizeTags(varios)).toEqual(varios);
    for (const s of varios) expect(ejeExcluyenteDe(s)).toBeNull();
  });

  it("conTag SACA al hermano — sin esto, el clic del CSE no hace nada", () => {
    expect(conTag([IMPLEMENTACION_TAG], REIMPLEMENTACION_TAG)).toEqual([REIMPLEMENTACION_TAG]);
    // Conserva el resto y no lo reordena.
    expect(conTag(["sales_hub", IMPLEMENTACION_TAG, "custom_dev"], REIMPLEMENTACION_TAG)).toEqual([
      "sales_hub",
      "custom_dev",
      REIMPLEMENTACION_TAG,
    ]);
    // Un tag normal simplemente se agrega, y no se duplica.
    expect(conTag(["sales_hub"], "custom_dev")).toEqual(["sales_hub", "custom_dev"]);
    expect(conTag(["sales_hub"], "sales_hub")).toEqual(["sales_hub"]);
    // Un slug desconocido no rompe ni ensucia.
    expect(conTag(["sales_hub"], "no_existe")).toEqual(["sales_hub"]);
  });

  it("los valores del enum viejo entran por la misma puerta que los renombres", () => {
    /* Es lo que hace que el script de migración sea `sanitizeTags([...tags, columna])` y que una
       fila sin migrar se siga leyendo bien entre el deploy y la migración. */
    expect(normalizeTag("IMPLEMENTATION")).toBe(IMPLEMENTACION_TAG);
    expect(normalizeTag("REIMPLEMENTATION")).toBe(REIMPLEMENTACION_TAG);
    expect(esReimplementacion(["REIMPLEMENTATION"])).toBe(true);
  });

  it("tipoDeImplementacion / esReimplementacion / faltanEjesRequeridos", () => {
    expect(tipoDeImplementacion([REIMPLEMENTACION_TAG])).toBe(REIMPLEMENTACION_TAG);
    expect(tipoDeImplementacion(["sales_hub"])).toBeNull();
    // Sin definir se comporta como el enum en null: "desde cero". El hueco se AVISA, no se asume.
    expect(esReimplementacion([])).toBe(false);
    expect(faltanEjesRequeridos([])).toEqual([EJE_TIPO_IMPLEMENTACION]);
    expect(faltanEjesRequeridos(["sales_hub"])).toEqual([EJE_TIPO_IMPLEMENTACION]);
    expect(faltanEjesRequeridos([IMPLEMENTACION_TAG])).toEqual([]);
  });

  it("el registro y el catálogo no se desincronizan", () => {
    // Todo eje declarado tiene al menos DOS tags: un eje excluyente de uno solo no excluye nada.
    for (const eje of GRUPOS_EXCLUYENTES) {
      const miembros = TAG_CATALOG.filter((t) => t.group === eje);
      expect(miembros.length, `El eje "${eje}" tiene ${miembros.length} tag(s)`).toBeGreaterThanOrEqual(2);
      expect(EJES_EXCLUYENTES[eje]?.avisoFalta, `El eje "${eje}" no dice qué avisar cuando falta`).toBeTruthy();
    }
    // Y toda sección del selector sale del catálogo: un grupo sin rótulo se caería sin avisar.
    const enSecciones = seccionesDelCatalogo().flatMap((s) => s.tags.map((t) => t.slug));
    expect([...enSecciones].sort()).toEqual([...TAG_CATALOG.map((t) => t.slug)].sort());
  });
});


/**
 * ── EL TRINQUETE DEL RETIRO ──────────────────────────────────────────────────
 * `Project.implementationType` y `BusinessCase.implementationType` SIGUEN existiendo en la base
 * a propósito: el retiro va en dos pasos y esta tanda es el primero (la app deja de usarlas; el
 * `DROP COLUMN` es un cambio aparte, con el sistema nuevo ya probado en uso). La columna con su
 * dato es la red de seguridad.
 *
 * El riesgo de ese diseño es exactamente esto: la columna está ahí, Prisma la autocompleta, y
 * alguien la vuelve a leer sin querer. A partir de ahí conviven DOS respuestas a la misma
 * pregunta y ninguna falla — que es el estado del que esta tanda salió.
 *
 * Se buscan las dos formas que significan "la app volvió a usar la columna": el `select` de
 * Prisma y la escritura. Un comentario que la nombre para explicar la historia no es un uso.
 */
describe("Catálogo de tags · la columna retirada no vuelve", () => {
  const RAIZ = process.cwd();

  /* El PUENTE: el agente todavía DEVUELVE `implementationType` como campo top-level (así lo piden
     los tres prompts vivos) y `analyze` lo traduce al tag. No es la columna: es el JSON del
     modelo. Cuando los prompts se unifiquen, esta entrada se borra junto con el puente. */
  const PUENTE = "app/api/clients/[id]/analyze/route.ts";

  function archivos(dir: string): string[] {
    const out: string[] = [];
    const rec = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) rec(f);
        else if ((f.endsWith(".ts") || f.endsWith(".tsx")) && !f.includes(".test.")) out.push(f);
      }
    };
    rec(path.join(RAIZ, dir));
    return out;
  }

  it("nadie la SELECCIONA ni la ESCRIBE", () => {
    const culpables: string[] = [];
    for (const dir of ["app", "lib", "components"]) {
      for (const f of archivos(dir)) {
        const src = fs.readFileSync(f, "utf8");
        // `select: { …, implementationType: true, … }` y `data: { implementationType: … }`
        if (/implementationType\s*:\s*(true|implType|value|bc\.|project\.)/.test(src)) {
          culpables.push(path.relative(RAIZ, f));
        }
      }
    }
    expect(
      culpables,
      "La clasificación de un proyecto tiene UN solo lugar desde el 2026-08-12: el array `tags` " +
        "(lib/tags/catalog.ts). La columna `implementationType` sigue en la base solo como red de " +
        "seguridad hasta su DROP. Leerla o escribirla reabre los dos sistemas paralelos que esta " +
        "tanda unificó — usá `tipoDeImplementacion()` / `conTag()` sobre los tags.",
    ).toEqual([]);
  });

  it("solo el PUENTE lee el campo del JSON del agente", () => {
    const culpables: string[] = [];
    for (const dir of ["app", "lib", "components"]) {
      for (const f of archivos(dir)) {
        const rel = path.relative(RAIZ, f).split(path.sep).join("/");
        if (rel === PUENTE) continue;
        // Un `.implementationType` de verdad (acceso a propiedad), no la palabra en un comentario.
        if (/[)\w\]]\??\.implementationType\b/.test(fs.readFileSync(f, "utf8"))) culpables.push(rel);
      }
    }
    expect(
      culpables,
      "El campo top-level `implementationType` del JSON del agente se traduce a tag en UN solo " +
        "lugar (persistTimelineFromAgentOutput). Un segundo traductor es un segundo criterio.",
    ).toEqual([]);
  });
});
