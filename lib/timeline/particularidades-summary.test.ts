/**
 * lib/timeline/particularidades-summary.test.ts
 *
 * Tests del resumen con atribución de particularidades. Casos: suma por party, weeksImpact
 * null/negativo = 0, party desconocido → SIN_ATRIBUIR, INVARIANTE (los buckets suman el total),
 * y la frase (orden mayor→menor, AMBOS, DEV interno vs cliente, sin atribuir).
 */
import { test, expect } from "vitest";
import {
  summarizeParticularidades,
  attributionSentence,
  ATTRIBUTION_BUCKETS,
  type ParticularidadLike,
} from "./particularidades-summary";

const p = (party: string, weeksImpact: number | null = null): ParticularidadLike => ({ party, weeksImpact });

test("suma weeksImpact por party", () => {
  const s = summarizeParticularidades([p("CLIENTE", 2), p("SMARTEAM", 1), p("CLIENTE", 1)]);
  expect(s.count).toBe(3);
  expect(s.totalWeeks).toBe(4);
  expect(s.byParty.CLIENTE).toBe(3);
  expect(s.byParty.SMARTEAM).toBe(1);
  expect(s.byParty.AMBOS).toBe(0);
  expect(s.byParty.DEV).toBe(0);
  expect(s.byParty.SIN_ATRIBUIR).toBe(0);
});

test("weeksImpact null o negativo cuenta como 0 (pero la particularidad cuenta en count)", () => {
  const s = summarizeParticularidades([p("CLIENTE", null), p("SMARTEAM", -3), p("CLIENTE", 2)]);
  expect(s.count).toBe(3);
  expect(s.totalWeeks).toBe(2);
  expect(s.byParty.CLIENTE).toBe(2);
  expect(s.byParty.SMARTEAM).toBe(0);
});

test("party desconocido cae en SIN_ATRIBUIR (no desaparece del desglose)", () => {
  const s = summarizeParticularidades([p("MARCIANO", 5), p("CLIENTE", 1)]);
  expect(s.count).toBe(2);
  expect(s.totalWeeks).toBe(6);
  expect(s.byParty.CLIENTE).toBe(1);
  expect(s.byParty.SIN_ATRIBUIR).toBe(5);
});

test("lista vacía → todo en 0", () => {
  const s = summarizeParticularidades([]);
  expect(s).toEqual({
    count: 0,
    totalWeeks: 0,
    byParty: { AMBOS: 0, CLIENTE: 0, SMARTEAM: 0, DEV: 0, SIN_ATRIBUIR: 0 },
  });
});

// ── INVARIANTE ───────────────────────────────────────────────────────────────
// Lo que el usuario leyó como error ("7 semanas, 1 y 1 atribuidas, ¿las demás?") solo puede ser
// una falla de redacción si los buckets SIEMPRE suman el titular. Esto lo fija.
test("INVARIANTE: los buckets siempre suman totalWeeks", () => {
  const casos: ParticularidadLike[][] = [
    [],
    [p("CLIENTE", 1)],
    [p("AMBOS", 5), p("CLIENTE", 1), p("SMARTEAM", 1)],
    [p("MARCIANO", 5), p("CLIENTE", 1), p("DEV", 2)],
    [p("CLIENTE", null), p("SMARTEAM", -3), p("", 4), p("DEV", 0)],
  ];
  for (const caso of casos) {
    const s = summarizeParticularidades(caso);
    const suma = ATTRIBUTION_BUCKETS.reduce((acc, b) => acc + s.byParty[b], 0);
    expect(suma).toBe(s.totalWeeks);
  }
});

// ── Frase ────────────────────────────────────────────────────────────────────

test("attributionSentence: frase con cliente + Smarteam (mayor primero)", () => {
  const s = summarizeParticularidades([p("CLIENTE", 2), p("SMARTEAM", 1)]);
  expect(attributionSentence(s)).toBe("3 semanas de atraso acumulado: 2 del cliente y 1 de Smarteam.");
});

test("attributionSentence: singular", () => {
  const s = summarizeParticularidades([p("CLIENTE", 1)]);
  expect(attributionSentence(s)).toBe("1 semana de atraso acumulado: 1 del cliente.");
});

test("attributionSentence: sin atraso (totalWeeks 0) → null", () => {
  const s = summarizeParticularidades([p("CLIENTE", null), p("SMARTEAM", null)]);
  expect(attributionSentence(s)).toBeNull();
});

// El caso real de Wherex: el grueso compartido debe leerse PRIMERO, no último y en vago.
test("attributionSentence: AMBOS va primero por ser el mayor", () => {
  const s = summarizeParticularidades([
    p("AMBOS", 2), p("AMBOS", 3), p("SMARTEAM", 1), p("CLIENTE", 1),
  ]);
  expect(attributionSentence(s)).toBe(
    "7 semanas de atraso acumulado: 5 compartidas, 1 del cliente y 1 de Smarteam.",
  );
});

test("attributionSentence: DEV es un bucket propio en la vista interna", () => {
  const s = summarizeParticularidades([p("DEV", 2), p("CLIENTE", 1)]);
  expect(attributionSentence(s, { audience: "interno" })).toBe(
    "3 semanas de atraso acumulado: 2 de desarrollo y 1 del cliente.",
  );
});

// El cliente NO lee el reparto por responsable: es un marcador de faltas y pone la relación a la
// defensiva. Lee qué pasó y, sobre todo, cuándo terminamos.
test("attributionSentence cliente: sin reparto de responsables", () => {
  const s = summarizeParticularidades([p("AMBOS", 5), p("CLIENTE", 1), p("SMARTEAM", 1)]);
  const frase = attributionSentence(s, { audience: "cliente" });
  expect(frase).toBe("El plan se movió 7 semanas.");
  expect(frase).not.toContain("cliente");
  expect(frase).not.toContain("Smarteam");
});

test("attributionSentence cliente: cierra con la fecha nueva cuando la hay", () => {
  const s = summarizeParticularidades([p("CLIENTE", 1)]);
  expect(attributionSentence(s, { audience: "cliente", closingDate: "15 sep 2026" })).toBe(
    "El plan se movió 1 semana. Nueva fecha de cierre: 15 sep 2026.",
  );
});

test("attributionSentence cliente: sin atraso → null (no se inventa una alarma)", () => {
  const s = summarizeParticularidades([p("CLIENTE", null)]);
  expect(attributionSentence(s, { audience: "cliente", closingDate: "15 sep 2026" })).toBeNull();
});

test("attributionSentence: lo no atribuido se dice, no se esconde", () => {
  const s = summarizeParticularidades([p("MARCIANO", 5), p("CLIENTE", 1)]);
  expect(attributionSentence(s)).toBe("6 semanas de atraso acumulado: 5 sin atribuir y 1 del cliente.");
});

// ── Un COMPROMISO no es un atraso ────────────────────────────────────────────────
// El defecto que fija este bloque: la vista del cliente sumaba ATRASO y COMPROMISO en el mismo
// total y lo mostraba como "el plan se movió N semanas". Un compromiso es un acuerdo fechado que
// FIJA una fecha — decir que llegamos tarde por algo que acordamos es mentirle al cliente.

test("por defecto solo el ATRASO suma al total", () => {
  const s = summarizeParticularidades([
    { kind: "ATRASO", party: "CLIENTE", weeksImpact: 3 },
    { kind: "COMPROMISO", party: "SMARTEAM", weeksImpact: 2 },
  ]);
  expect(s.totalWeeks).toBe(3);
  expect(s.byParty.SMARTEAM).toBe(0);
  // La bitácora sigue contando las dos: `count` no se acota.
  expect(s.count).toBe(2);
});

test("SOLICITUD legacy tampoco suma", () => {
  const s = summarizeParticularidades([
    { kind: "SOLICITUD", party: "CLIENTE", weeksImpact: 4 },
  ]);
  expect(s.totalWeeks).toBe(0);
  expect(s.count).toBe(1);
});

test("kinds: [] suma todo (la bitácora completa)", () => {
  const s = summarizeParticularidades(
    [
      { kind: "ATRASO", party: "CLIENTE", weeksImpact: 3 },
      { kind: "COMPROMISO", party: "SMARTEAM", weeksImpact: 2 },
    ],
    { kinds: [] },
  );
  expect(s.totalWeeks).toBe(5);
});

// Compatibilidad: un caller que no proyecta `kind` sigue sumando todo, en vez de dar 0 en silencio.
test("sin kind en el objeto, el ítem cuenta (migración caller por caller)", () => {
  expect(summarizeParticularidades([{ party: "CLIENTE", weeksImpact: 3 }]).totalWeeks).toBe(3);
});

// La invariante de siempre, ahora con el filtro puesto.
test("el desglose sigue cerrando contra el total con kinds acotados", () => {
  const s = summarizeParticularidades([
    { kind: "ATRASO", party: "CLIENTE", weeksImpact: 3 },
    { kind: "ATRASO", party: "AMBOS", weeksImpact: 2 },
    { kind: "COMPROMISO", party: "SMARTEAM", weeksImpact: 9 },
  ]);
  const suma = Object.values(s.byParty).reduce((a, b) => a + b, 0);
  expect(suma).toBe(s.totalWeeks);
  expect(s.totalWeeks).toBe(5);
});

// AVISO = nota libre del CSE al cliente. Es bitácora, NO corrimiento: no puede sumar semanas ni
// aparecer en el desglose por responsable, o el cliente leería "el plan se movió N semanas" por
// algo que explícitamente no mueve fechas.
test("un AVISO cuenta en la bitácora pero no suma semanas ni atribución", () => {
  const s = summarizeParticularidades([
    { kind: "ATRASO", party: "CLIENTE", weeksImpact: 2 },
    { kind: "AVISO", party: "SMARTEAM", weeksImpact: null },
  ]);
  expect(s.count).toBe(2);
  expect(s.totalWeeks).toBe(2);
  expect(s.byParty.SMARTEAM).toBe(0);
  expect(Object.values(s.byParty).reduce((a, b) => a + b, 0)).toBe(s.totalWeeks);
});

// Defensa: aunque una fila vieja/corrupta trajera semanas en un AVISO, no deben contarse.
test("un AVISO con semanas igual no suma al corrimiento", () => {
  const s = summarizeParticularidades([{ kind: "AVISO", party: "CLIENTE", weeksImpact: 9 }]);
  expect(s.totalWeeks).toBe(0);
  expect(s.byParty.CLIENTE).toBe(0);
});
