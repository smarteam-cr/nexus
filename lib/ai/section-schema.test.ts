/**
 * lib/ai/section-schema.test.ts — helpers del contrato schema↔modelo (extraídos
 * de canvas-agent en la ola A1 del plan de assist; primeros tests que tienen).
 * Correr: `npx vitest run lib/ai/section-schema.test.ts --project unit`
 */
import { test, expect } from "vitest";
import { shapeOf, coerceToSchema, preserveNonSchemaKeys, parseObject } from "./section-schema";

const CARD_SCHEMA = {
  type: "object",
  properties: {
    intro: { type: "string" },
    items: {
      type: "array",
      items: { type: "object", properties: { title: { type: "string" }, detail: { type: "string" } } },
    },
  },
};

test("shapeOf: objeto anidado con array → representación compacta", () => {
  expect(shapeOf(CARD_SCHEMA)).toBe('{ "intro": string, "items": [ { "title": string, "detail": string } ] }');
  expect(shapeOf({ type: "array", items: { type: "string" } })).toBe("[ string ]");
  expect(shapeOf(undefined)).toBe("string");
});

test("coerceToSchema: deja SOLO las keys del schema y coacciona tipos", () => {
  const out = coerceToSchema(CARD_SCHEMA, {
    intro: "hola",
    items: [{ title: "a", detail: 42, extra: "x" }, "basura"],
    colado: "fuera",
  }) as Record<string, unknown>;
  expect(out).toEqual({
    intro: "hola",
    items: [
      { title: "a", detail: "" }, // detail no-string → ""
      { title: "", detail: "" }, // ítem no-objeto → shape vacío
    ],
  });
  expect("colado" in out).toBe(false);
});

test("coerceToSchema: data malformada nunca rompe (null/array/string)", () => {
  expect(coerceToSchema(CARD_SCHEMA, null)).toEqual({ intro: "", items: [] });
  expect(coerceToSchema(CARD_SCHEMA, "texto")).toEqual({ intro: "", items: [] });
  expect(coerceToSchema({ type: "array", items: { type: "string" } }, "no-array")).toEqual([]);
});

test("preserveNonSchemaKeys: las keys curadas fuera del schema sobreviven al merge", () => {
  const prev = { intro: "viejo", coverImageUrl: "https://x/img.png", __lang: "en" };
  const next = coerceToSchema(CARD_SCHEMA, { intro: "nuevo", items: [] }) as Record<string, unknown>;
  const merged = preserveNonSchemaKeys(CARD_SCHEMA, prev, next);
  expect(merged.intro).toBe("nuevo"); // la key del schema NO se pisa con la vieja
  expect(merged.coverImageUrl).toBe("https://x/img.png");
  expect(merged.__lang).toBe("en");
});

test("parseObject: fence de markdown, texto alrededor, y basura → {}", () => {
  expect(parseObject('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  expect(parseObject('bla bla {"a": {"b": "c"}} y más texto')).toEqual({ a: { b: "c" } });
  expect(parseObject("sin json acá")).toEqual({});
  expect(parseObject('{"roto": ')).toEqual({});
  expect(parseObject("[1,2,3]")).toEqual({}); // array no es objeto
});
