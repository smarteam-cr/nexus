/**
 * lib/sessions/bookends.test.ts
 *
 * Fija la lógica pura de bookends (extraída del endpoint GPS en la dieta PERF #1):
 * próxima futura + última pasada, global y por frente Ventas/Entrega, con la
 * clasificación mixed y la extracción del summary de Fireflies.
 */
import { test, expect } from "vitest";
import { computeBookends, extractSummaryText, hidratarResumenes, idsQueNecesitanResumen, type BookendSessionRow } from "./bookends";

const NOW = Date.UTC(2026, 6, 15, 12, 0, 0); // 2026-07-15 12:00Z

const VENTAS = new Set(["vendedor@smarteamcr.com"]);
const ENTREGA = new Set(["cse@smarteamcr.com", "dev@smarteamcr.com"]);

let seq = 0;
function s(opts: {
  offsetDays: number; // relativo a NOW (negativo = pasada)
  participants?: string[];
  summary?: unknown;
  title?: string;
}): BookendSessionRow {
  seq += 1;
  return {
    id: `s${seq}`,
    title: opts.title ?? `Sesión ${seq}`,
    date: new Date(NOW + opts.offsetDays * 86_400_000),
    participants: opts.participants ?? [],
    summary: opts.summary ?? null,
    googleDocId: null,
    googleEventId: null,
  };
}

test("sin sesiones → todo null", () => {
  const r = computeBookends([], NOW, VENTAS, ENTREGA);
  expect(r).toEqual({
    next: null,
    last: null,
    fronts: { ventas: { next: null, last: null }, cs: { next: null, last: null } },
  });
});

test("next = la futura MÁS CERCANA; last = la pasada MÁS RECIENTE (aunque lleguen desordenadas)", () => {
  const cercanaFutura = s({ offsetDays: 2 });
  const lejanFutura = s({ offsetDays: 10 });
  const reciente = s({ offsetDays: -1 });
  const vieja = s({ offsetDays: -30 });
  // Orden de entrada adrede revuelto: el módulo ordena solo.
  const r = computeBookends([lejanFutura, vieja, cercanaFutura, reciente], NOW, VENTAS, ENTREGA);
  expect(r.next?.sessionId).toBe(cercanaFutura.id);
  expect(r.last?.sessionId).toBe(reciente.id);
});

test("frentes: cada área ve SU bookend; una sesión mixta cae en ambos con mixed=true", () => {
  const ventasPasada = s({ offsetDays: -3, participants: ["vendedor@smarteamcr.com", "cliente@acme.com"] });
  const entregaPasada = s({ offsetDays: -1, participants: ["dev@smarteamcr.com"] });
  const mixtaFutura = s({ offsetDays: 5, participants: ["vendedor@smarteamcr.com", "cse@smarteamcr.com"] });
  const r = computeBookends([ventasPasada, entregaPasada, mixtaFutura], NOW, VENTAS, ENTREGA);

  expect(r.fronts.ventas.last?.sessionId).toBe(ventasPasada.id);
  expect(r.fronts.cs.last?.sessionId).toBe(entregaPasada.id);
  // La mixta es la próxima de AMBOS frentes, marcada mixed.
  expect(r.fronts.ventas.next?.sessionId).toBe(mixtaFutura.id);
  expect(r.fronts.cs.next?.sessionId).toBe(mixtaFutura.id);
  expect(r.fronts.cs.next?.mixed).toBe(true);
  // Las de un solo frente no son mixed.
  expect(r.fronts.ventas.last?.mixed).toBe(false);
});

test("participants matchean case-insensitive (el set viene en minúsculas)", () => {
  const pasada = s({ offsetDays: -2, participants: ["CSE@SmarteamCR.com"] });
  const r = computeBookends([pasada], NOW, VENTAS, ENTREGA);
  expect(r.fronts.cs.last?.sessionId).toBe(pasada.id);
});

test("área sin emails (equipo vacío) → frente vacío, sin lanzar", () => {
  const pasada = s({ offsetDays: -2, participants: ["dev@smarteamcr.com"] });
  const r = computeBookends([pasada], NOW, new Set(), ENTREGA);
  expect(r.fronts.ventas).toEqual({ next: null, last: null });
  expect(r.fronts.cs.last?.sessionId).toBe(pasada.id);
});

test("summary de Fireflies: overview > shorthand_bullet > null; basura no lanza", () => {
  expect(extractSummaryText({ overview: "resumen", shorthand_bullet: "b" })).toBe("resumen");
  expect(extractSummaryText({ shorthand_bullet: "bullets" })).toBe("bullets");
  expect(extractSummaryText({ otro: 1 })).toBeNull();
  expect(extractSummaryText(null)).toBeNull();
  expect(extractSummaryText("string suelto")).toBeNull();
  const pasada = s({ offsetDays: -1, summary: { overview: "qué se habló" } });
  const r = computeBookends([pasada], NOW, VENTAS, ENTREGA);
  expect(r.last?.summary).toBe("qué se habló");
});

test("sesión EXACTAMENTE en now cuenta como pasada (> vs <=)", () => {
  const enNow = s({ offsetDays: 0 });
  const r = computeBookends([enNow], NOW, VENTAS, ENTREGA);
  expect(r.last?.sessionId).toBe(enNow.id);
  expect(r.next).toBeNull();
});

test("C-12: sin summary en las filas, los bookends salen sin texto; los ids que lo necesitan son ≤ 3 sin repetir; hidratar pone solo lo del mapa", () => {
  /* La edición que lo pone en rojo: que `hidratarResumenes` pise con null lo que no está en el mapa,
     o que `idsQueNecesitanResumen` repita la misma sesión cuando es la última global Y la de un frente. */
  const fila = (id: string, dias: number, participants: string[]): BookendSessionRow => ({
    id,
    title: id,
    date: new Date(Date.now() - dias * 86_400_000),
    participants,
    googleDocId: null,
    googleEventId: null,
  });
  const ventas = new Set(["v@smarteamcr.com"]);
  const entrega = new Set(["c@smarteamcr.com"]);
  const b = computeBookends(
    [fila("mixta", 1, ["v@smarteamcr.com", "c@smarteamcr.com"]), fila("solo-cse", 3, ["c@smarteamcr.com"])],
    Date.now(),
    ventas,
    entrega,
  );
  expect(b.last?.summary).toBeNull();
  // La última global, la de ventas y la de entrega son LA MISMA sesión: un solo id.
  expect(idsQueNecesitanResumen(b)).toEqual(["mixta"]);

  const h = hidratarResumenes(b, new Map([["mixta", { overview: "Se acordó el alcance." }]]));
  expect(h.last?.summary).toBe("Se acordó el alcance.");
  expect(h.fronts.ventas.last?.summary).toBe("Se acordó el alcance.");
  expect(h.fronts.cs.last?.summary).toBe("Se acordó el alcance.");
  // Lo que no está en el mapa queda como estaba (no se pisa con null).
  const parcial = hidratarResumenes({ ...h, last: h.last }, new Map());
  expect(parcial.last?.summary).toBe("Se acordó el alcance.");
  expect(b.next).toBeNull();
});
