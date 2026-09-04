/**
 * lib/clients/meeting-dates.test.ts — las dos fechas por cliente salen de Postgres, no del
 * historial entero (C-11, 2026-09-04).
 *
 * Lo que se congela acá:
 *   1. El plegado de referencia (`plegarUltimasFechas`, lo que hacía la versión anterior) y el
 *      armado del mapa desde las filas de Postgres (`armarMapa`) dan LO MISMO sobre un fixture
 *      donde se emula lo que la consulta devuelve. La igualdad contra filas de verdad está en
 *      `meeting-dates.int.test.ts` (base local).
 *   2. Por fuente: la consulta es `DISTINCT ON`, parametrizada con `Prisma.join`, corta por fecha,
 *      compara los correos en minúscula, y el `findMany` que traía el historial ya no está.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { armarMapa, plegarUltimasFechas, type FilaDeFecha, type FilaDeSesion } from "./meeting-dates";

const d = (iso: string) => new Date(iso);
const SALES = new Set(["vende@smarteamcr.com"]);
const CSE = new Set(["cse@smarteamcr.com"]);

/** Lo que la consulta devuelve: por (cliente, rol), la fecha máxima de las sesiones pasadas cuyo participante (en minúscula) es del equipo. */
function emularConsulta(filas: FilaDeSesion[], ahora: Date): FilaDeFecha[] {
  const max = new Map<string, FilaDeFecha>();
  for (const s of filas) {
    if (!s.resolvedClientId || s.date > ahora) continue;
    const emails = s.participants.map((e) => e.toLowerCase());
    for (const [rol, equipo] of [["sales", SALES], ["cse", CSE]] as const) {
      if (!emails.some((e) => equipo.has(e))) continue;
      const k = `${s.resolvedClientId}:${rol}`;
      const previa = max.get(k);
      if (!previa || s.date > previa.date) max.set(k, { clientId: s.resolvedClientId, rol, date: s.date });
    }
  }
  return [...max.values()].sort((a, b) => a.clientId.localeCompare(b.clientId) || a.rol.localeCompare(b.rol));
}

describe("el plegado de referencia y la consulta dicen lo mismo (C-11)", () => {
  const AHORA = d("2026-09-04T12:00:00Z");
  // Ordenadas por fecha DESC, como las leía la versión anterior.
  const FIXTURE: FilaDeSesion[] = [
    { resolvedClientId: "acme", date: d("2026-09-10T15:00:00Z"), participants: ["vende@smarteamcr.com"] }, // futura: no cuenta
    { resolvedClientId: "acme", date: d("2026-09-02T15:00:00Z"), participants: ["VENDE@SmarteamCR.com", "x@acme.test"] },
    { resolvedClientId: "acme", date: d("2026-08-28T15:00:00Z"), participants: ["cse@smarteamcr.com", "vende@smarteamcr.com"] },
    { resolvedClientId: "acme", date: d("2026-08-01T15:00:00Z"), participants: ["cse@smarteamcr.com"] },
    { resolvedClientId: "beta", date: d("2026-08-20T15:00:00Z"), participants: ["cse@smarteamcr.com"] },
    { resolvedClientId: null, date: d("2026-08-19T15:00:00Z"), participants: ["vende@smarteamcr.com"] }, // sin dueño
    { resolvedClientId: "gamma", date: d("2026-08-18T15:00:00Z"), participants: ["alguien@gamma.test"] }, // sin equipo
  ];
  const pasadas = FIXTURE.filter((s) => s.date <= AHORA);

  it("mismo mapa: la más reciente por (cliente, rol), correos en minúscula, sin futuras ni huérfanas", () => {
    /* La edición que lo pone en rojo: que `armarMapa` se quede con la ÚLTIMA fila en vez de la
       primera (DISTINCT ON manda ordenado por fecha DESC), o que la emulación deje pasar futuras. */
    const referencia = plegarUltimasFechas(pasadas, SALES, CSE);
    const consulta = armarMapa(emularConsulta(FIXTURE, AHORA));
    expect(consulta).toEqual(referencia);
    expect(consulta.get("acme")).toEqual({ sales: d("2026-09-02T15:00:00Z"), cse: d("2026-08-28T15:00:00Z") });
    expect(consulta.get("beta")).toEqual({ cse: d("2026-08-20T15:00:00Z") });
    expect(consulta.has("gamma")).toBe(false);
  });

  it("armarMapa respeta el orden de DISTINCT ON: la primera fila por (cliente, rol) gana", () => {
    const m = armarMapa([
      { clientId: "acme", rol: "sales", date: d("2026-09-02T15:00:00Z") },
      { clientId: "acme", rol: "sales", date: d("2026-01-01T15:00:00Z") }, // no debería llegar; si llega, pierde
      { clientId: "acme", rol: "cse", date: d("2026-08-28T15:00:00Z") },
    ]);
    expect(m.get("acme")).toEqual({ sales: d("2026-09-02T15:00:00Z"), cse: d("2026-08-28T15:00:00Z") });
  });
});

describe("la consulta, por fuente", () => {
  const src = fs
    .readFileSync(path.join(process.cwd(), "lib/clients/meeting-dates.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith("//"))
    .join("\n");

  it("DISTINCT ON parametrizado, con techo de fecha y correos en minúscula; el findMany del historial ya no está", () => {
    /* La edición que lo pone en rojo: volver al `firefliesSession.findMany` con participantes
       «porque el raw es incómodo» — vuelve el historial entero por carga de /clients. */
    expect(src).toContain('SELECT DISTINCT ON ("clientId", rol)');
    expect(src).toContain("ORDER BY \"clientId\", rol, date DESC");
    expect(src, "ids y correos van parametrizados, nunca interpolados").toMatch(/IN \(\$\{Prisma\.join\(clientIds\)\}\)/);
    expect(src).toMatch(/lower\(p\) IN \(\$\{Prisma\.join\(emails\)\}\)/);
    expect(src, "sin techo de fecha, una reunión agendada sería «la última»").toContain("s.date <= ${ahora}");
    expect(src, "el historial entero de vuelta").not.toContain("firefliesSession.findMany");
  });
});
