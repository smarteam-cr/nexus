/**
 * lib/marketing/agents/generate-ideas.test.ts
 *
 * Tests de los helpers PUROS de parsing del output del LLM en
 * lib/marketing/agents/generate-ideas.ts. Para testearlos se les agregó
 * "export" a repairTruncatedJson / parseJsonObject / normalizeCollection
 * (única modificación al fuente — antes eran internos al módulo).
 *
 * El módulo también importa prisma/anthropic para el código DB/red (fuera de
 * alcance acá): se mockean ambos para que el import no instancie clientes
 * reales — los tests son 100% puros, sin DB, red ni env vars.
 *
 * Casos:
 *   A) repairTruncatedJson — truncado dentro de un array anidado en objeto:
 *      el cierre es LIFO ("}]}" — el bug histórico del helper viejo de
 *      analyze/route.ts era cerrar SIEMPRE "]" antes que "}").
 *   B) repairTruncatedJson — truncado a mitad de un string con escapes
 *      (\" y \\): cierra la comilla y respeta los escapes previos.
 *   C) repairTruncatedJson — JSON balanceado completo → null (nada que reparar).
 *   D) repairTruncatedJson — truncado justo tras una barra de escape colgante:
 *      el sufijo '"' queda escapado y el resultado NO parsea (limitación real).
 *   E) parseJsonObject — JSON completo pasa intacto.
 *   F) parseJsonObject — extrae de fence ```json ... ```.
 *   G) parseJsonObject — prosa ANTES del "{" se tolera; prosa DESPUÉS del "}"
 *      (sin fence) rompe el parseo → null (el slice va del primer "{" al FIN).
 *   H) parseJsonObject — basura irreparable → null (sin "{", o "{" + no-JSON).
 *   I) parseJsonObject — fence abierto sin cerrar + JSON truncado → repara
 *      (el regex de fence exige cierre; cae al slice desde "{").
 *   J) parseJsonObject — array top-level → null (exige objeto).
 *   K) normalizeCollection — Zod POR ÍTEM: los inválidos se descartan sin
 *      tumbar los válidos.
 *   L) normalizeCollection — raw no-array → [].
 *
 * Correr: `npx vitest run lib/marketing/agents/generate-ideas.test.ts --project unit`
 */
import { test, expect, vi } from "vitest";
import { z } from "zod";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/anthropic", () => ({ anthropic: {} }));

import { repairTruncatedJson, parseJsonObject, normalizeCollection } from "./generate-ideas";

// ── repairTruncatedJson ───────────────────────────────────────────────────────

test("A — truncado dentro de array anidado en objeto: cierre LIFO '}]}' (no ']}}')", () => {
  const truncado = '{"contentIdeas": [{"title": "Idea 1", "copy": "texto"}, {"title": "Idea 2"';
  const reparado = repairTruncatedJson(truncado);
  expect(reparado).not.toBeNull();
  // El punto del test: primero cierra el objeto interno, después el array, después la raíz.
  expect(reparado!.endsWith('"Idea 2"}]}')).toBe(true);
  const obj = JSON.parse(reparado!) as { contentIdeas: Array<Record<string, unknown>> };
  expect(obj.contentIdeas).toHaveLength(2);
  expect(obj.contentIdeas[1]).toEqual({ title: "Idea 2" });
});

test("B — truncado a mitad de string con escapes \\\" y \\\\: cierra comilla y estructura", () => {
  // El string queda abierto tras un escape COMPLETO (\\ = barra literal).
  const truncado = '{"contentIdeas": [{"copy": "dijo \\"hola\\" y una barra \\\\';
  const reparado = repairTruncatedJson(truncado);
  expect(reparado).not.toBeNull();
  const obj = JSON.parse(reparado!) as { contentIdeas: Array<{ copy: string }> };
  expect(obj.contentIdeas[0].copy).toBe('dijo "hola" y una barra \\');
});

test("C — JSON balanceado completo: null (nada que reparar)", () => {
  expect(repairTruncatedJson('{"a": [1, 2], "b": {"c": "x"}}')).toBeNull();
});

test("D — truncado sobre una barra de escape colgante: el reparado NO parsea (limitación)", () => {
  // Corta EXACTAMENTE tras el "\" que abría un escape: la comilla del sufijo
  // queda escapada y el string nunca se cierra.
  const truncado = '{"a": "x\\';
  const reparado = repairTruncatedJson(truncado);
  expect(reparado).not.toBeNull(); // el helper SÍ intenta reparar…
  expect(() => JSON.parse(reparado!)).toThrow(); // …pero el resultado es inválido
  expect(parseJsonObject(truncado)).toBeNull(); // y aguas arriba termina en null
});

// ── parseJsonObject ───────────────────────────────────────────────────────────

test("E — JSON completo pasa intacto", () => {
  const obj = parseJsonObject('{"contentIdeas": [], "pillarSuggestions": [{"name": "IA"}]}');
  expect(obj).toEqual({ contentIdeas: [], pillarSuggestions: [{ name: "IA" }] });
});

test("F — fence ```json ... ```: extrae el contenido del fence", () => {
  const texto = 'Aquí está el resultado:\n```json\n{"contentIdeas": [{"title": "A"}]}\n```\nEspero que sirva.';
  expect(parseJsonObject(texto)).toEqual({ contentIdeas: [{ title: "A" }] });
});

test("G — prosa antes del '{' se tolera; prosa después del '}' sin fence → null", () => {
  expect(parseJsonObject('Claro, aquí va: {"a": 1}')).toEqual({ a: 1 });
  // El candidato es slice(primer "{") hasta el FIN del texto: la cola de prosa
  // lo vuelve imparseable y la "reparación" no aplica (está balanceado).
  expect(parseJsonObject('{"a": 1} espero que te sirva')).toBeNull();
});

test("H — basura irreparable: null", () => {
  expect(parseJsonObject("no hay json por ningún lado")).toBeNull(); // sin "{"
  expect(parseJsonObject("bla { esto no es json")).toBeNull(); // "{" + no-JSON
  expect(parseJsonObject("")).toBeNull();
});

test("I — fence abierto sin cerrar + JSON truncado: repara desde el primer '{'", () => {
  // Forma típica de un corte por max_tokens: el fence de cierre nunca llegó.
  const texto = '```json\n{"contentIdeas": [{"title": "A"}, {"title": "B';
  const obj = parseJsonObject(texto) as { contentIdeas: Array<Record<string, unknown>> };
  expect(obj).not.toBeNull();
  expect(obj.contentIdeas).toHaveLength(2);
  expect(obj.contentIdeas[0]).toEqual({ title: "A" });
  expect(obj.contentIdeas[1]).toEqual({ title: "B" });
});

test("J — array top-level: null (exige objeto raíz)", () => {
  expect(parseJsonObject('[{"a": 1}]')).toBeNull();
});

// ── normalizeCollection ───────────────────────────────────────────────────────

const itemSchema = z.object({ title: z.string(), likes: z.number().optional() });

test("K — Zod por ítem: los inválidos se descartan sin tumbar los válidos", () => {
  const raw = [
    { title: "válido 1", likes: 3 },
    { title: 42 }, // title no-string → fuera
    "un string suelto", // ni siquiera objeto → fuera
    null, // fuera
    { title: "válido 2" },
  ];
  expect(normalizeCollection(raw, itemSchema)).toEqual([
    { title: "válido 1", likes: 3 },
    { title: "válido 2" },
  ]);
});

test("L — raw no-array: []", () => {
  expect(normalizeCollection(null, itemSchema)).toEqual([]);
  expect(normalizeCollection(undefined, itemSchema)).toEqual([]);
  expect(normalizeCollection({ title: "objeto, no array" }, itemSchema)).toEqual([]);
  expect(normalizeCollection("texto", itemSchema)).toEqual([]);
});
