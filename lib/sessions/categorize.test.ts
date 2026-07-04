/**
 * lib/sessions/categorize.test.ts
 *
 * Tests del cascade sesión→cliente (categorizeSession, puro — contextos armados
 * a mano, sin DB ni red). Es la fuente canónica del ownership que alimenta
 * `resolvedClientId` y el invariante anti-leak INV1. Casos:
 *
 *   ORDEN DEL CASCADE
 *   1)  Manual override gana a todo (incluso con dominio de otro cliente presente).
 *   2)  manualClientId huérfano (cliente borrado) → sigue el cascade (resuelve por dominio).
 *   3)  Sesión 100% interna + título con nombre de cliente → bucket del cliente, no Internal.
 *   4)  Sesión 100% interna sin match de título → categoría internal; sin categoría
 *       internal → orphan "Interna (sin categoría)".
 *   5)  Dominio (emailDomains) manda antes que el título que nombra a OTRO cliente.
 *   6)  Dominio inferido de `company` (URL / www. / dominio plano); nombre legible NO infiere.
 *   7)  Categoría por dominio (paso 4) — y la categoría kind=internal se saltea en ese paso.
 *   8)  HubSpot→Client ligada (señal fuerte) gana al title-match.
 *   9)  Company HubSpot NO ligada + groupUnlinkedHubspotCompany=true → bucket "hubspotCompany".
 *   10) Company HubSpot NO ligada sin el flag (materialización) → ADITIVO: cae al título.
 *   11) Stopwords del title-match: título de puros conectores ("para", "sesion"…) no
 *       matchea; un nombre distintivo real sí.
 *   12) Clientes de PRUEBA ("Empresa para pruebas", /\btest\b/) excluidos del title-match.
 *   13) computeAmbiguousNameTokens: token en 2+ empresas DISTINTAS ("grupo") se ignora en
 *       el title-match; sin el set se reproduce el catch-all histórico (comportamiento previo).
 *   14) computeAmbiguousNameTokens es subset-aware: duplicados de la MISMA empresa
 *       (token-set ⊆ del otro) NO cuentan como ambiguos.
 *   15) extractParticipantDomains: lowercase, dedup, filtra entradas sin dominio.
 *   16) Orphan: sin participantes → "Sin participantes"; dominio desconocido → label=dominio.
 *
 * No se modificó el código fuente (las funciones necesarias ya estaban exportadas).
 * Correr: `npx vitest run lib/sessions/categorize.test.ts --project unit`.
 */
import { test, expect } from "vitest";
import {
  categorizeSession,
  computeAmbiguousNameTokens,
  extractParticipantDomains,
  type CategorizeContext,
  type CategorizableSession,
} from "./categorize";
import type { HubspotCompanyLite } from "@/lib/hubspot/companies";

// ── Builders ──────────────────────────────────────────────────────────────────

function cliente(
  id: string,
  name: string,
  opts: { company?: string | null; emailDomains?: string[] } = {}
): CategorizeContext["clients"][number] {
  return { id, name, company: opts.company ?? null, emailDomains: opts.emailDomains ?? [] };
}

function categoria(
  id: string,
  name: string,
  kind: string,
  domains: string[],
  color: string | null = null
): CategorizeContext["categories"][number] {
  return { id, name, slug: name.toLowerCase(), domains, kind, color };
}

function ctx(overrides: Partial<CategorizeContext> = {}): CategorizeContext {
  return {
    clients: [],
    categories: [],
    hubspotCompaniesByDomain: new Map<string, HubspotCompanyLite>(),
    internalDomains: new Set<string>(),
    ...overrides,
  };
}

function sesion(overrides: Partial<CategorizableSession> = {}): CategorizableSession {
  return { participants: [], manualClientId: null, title: "", ...overrides };
}

// ── 1-2: manual override ─────────────────────────────────────────────────────

test("1 — manual override gana a todo, incluso con dominio de otro cliente en la sala", () => {
  const c = ctx({
    clients: [
      cliente("a", "Acme Industrial", { emailDomains: ["acme.com"] }),
      cliente("b", "Botica Central"),
    ],
  });
  const g = categorizeSession(
    sesion({ manualClientId: "b", participants: ["x@acme.com"], title: "Demo Acme" }),
    c
  );
  expect(g).toEqual({ kind: "client", id: "b", label: "Botica Central", company: null });
});

test("2 — manualClientId huérfano (cliente borrado): el cascade sigue y resuelve por dominio", () => {
  const c = ctx({ clients: [cliente("a", "Acme Industrial", { emailDomains: ["acme.com"] })] });
  const g = categorizeSession(
    sesion({ manualClientId: "ya-no-existe", participants: ["x@acme.com"] }),
    c
  );
  expect(g).toMatchObject({ kind: "client", id: "a" });
});

// ── 3-4: sesión 100% interna ─────────────────────────────────────────────────

test("3 — 100% interna con título que nombra al cliente → bucket del cliente, no Internal", () => {
  const c = ctx({
    clients: [cliente("w", "Wherex")],
    categories: [categoria("int", "Interna", "internal", ["smarteam.mx"], "#94A3B8")],
    internalDomains: new Set(["smarteam.mx"]),
  });
  const g = categorizeSession(
    sesion({ participants: ["ana@smarteam.mx", "luis@smarteam.mx"], title: "Hand Off | WHEREX" }),
    c
  );
  expect(g).toMatchObject({ kind: "client", id: "w", label: "Wherex" });
});

test("4 — 100% interna sin match de título → categoría internal; sin categoría → orphan especial", () => {
  const interna = categoria("int", "Interna", "internal", ["smarteam.mx"], "#94A3B8");
  const base = {
    clients: [cliente("w", "Wherex")],
    internalDomains: new Set(["smarteam.mx"]),
  };
  const s = sesion({ participants: ["ana@smarteam.mx"], title: "Sync semanal equipo" });

  const conCat = categorizeSession(s, ctx({ ...base, categories: [interna] }));
  expect(conCat).toEqual({
    kind: "category",
    id: "int",
    label: "Interna",
    categoryKind: "internal",
    color: "#94A3B8",
  });

  const sinCat = categorizeSession(s, ctx({ ...base, categories: [] }));
  expect(sinCat).toEqual({ kind: "orphan", label: "Interna (sin categoría)" });
});

// ── 5-6: match por dominio ───────────────────────────────────────────────────

test("5 — el dominio (emailDomains) manda antes que un título que nombra a OTRO cliente", () => {
  const c = ctx({
    clients: [
      cliente("a", "Acme Industrial", { emailDomains: ["acme.com"] }),
      cliente("b", "Botica Central"),
    ],
  });
  // Con el dominio de Acme presente, el título "Botica Central" no pesa.
  const porDominio = categorizeSession(
    sesion({ participants: ["x@acme.com"], title: "Cierre | Botica Central" }),
    c
  );
  expect(porDominio).toMatchObject({ kind: "client", id: "a" });

  // Control: sin ese dominio, el mismo título SÍ habría resuelto a Botica (paso 6).
  const porTitulo = categorizeSession(
    sesion({ participants: ["x@dominio-ajeno.com"], title: "Cierre | Botica Central" }),
    c
  );
  expect(porTitulo).toMatchObject({ kind: "client", id: "b" });
});

test("6 — dominio inferido de company (URL, www., plano); nombre legible NO infiere dominio", () => {
  const porUrl = categorizeSession(
    sesion({ participants: ["p@wherex.com"] }),
    ctx({ clients: [cliente("w", "Wherex", { company: "https://wherex.com/" })] })
  );
  expect(porUrl).toMatchObject({ kind: "client", id: "w" });

  const porWww = categorizeSession(
    sesion({ participants: ["p@teamnet.com.mx"] }),
    ctx({ clients: [cliente("t", "Teamnet", { company: "www.teamnet.com.mx" })] })
  );
  expect(porWww).toMatchObject({ kind: "client", id: "t" });

  // "AMC - Atlas Mining" es nombre legible, no dominio → no matchea → orphan.
  const legible = categorizeSession(
    sesion({ participants: ["p@atlasmining.com"] }),
    ctx({ clients: [cliente("m", "AMC", { company: "AMC - Atlas Mining" })] })
  );
  expect(legible).toEqual({ kind: "orphan", label: "atlasmining.com", domain: "atlasmining.com" });
});

// ── 7: categoría por dominio ─────────────────────────────────────────────────

test("7 — categoría por dominio (paso 4); la kind=internal se saltea aunque liste el dominio", () => {
  const c = ctx({
    categories: [
      // internal listada PRIMERO y con el mismo dominio: el paso 4 la debe saltear.
      categoria("int", "Interna", "internal", ["partner.io"]),
      categoria("par", "Partners", "partner", ["partner.io"], "#F97316"),
    ],
    // internalDomains vacío a propósito: el dominio cuenta como externo.
  });
  const g = categorizeSession(sesion({ participants: ["x@partner.io"] }), c);
  expect(g).toEqual({
    kind: "category",
    id: "par",
    label: "Partners",
    categoryKind: "partner",
    color: "#F97316",
  });
});

// ── 8-10: HubSpot → Client ───────────────────────────────────────────────────

test("8 — dominio→company HubSpot LIGADA a un Client: señal fuerte, gana al title-match", () => {
  const c = ctx({
    clients: [cliente("inve", "Grupo Inve"), cliente("bot", "Botica Central")],
    hubspotCompaniesByDomain: new Map([
      ["inve.com", { id: "hs1", name: "Inve S.A.", domain: "inve.com" }],
    ]),
    clientsByHubspotCompanyId: new Map([
      ["hs1", { id: "inve", name: "Grupo Inve", company: null }],
    ]),
  });
  // El título nombra a Botica, pero HubSpot→Client resuelve antes (paso 5 > paso 6).
  const g = categorizeSession(
    sesion({ participants: ["x@inve.com"], title: "Sesión Botica Central" }),
    c
  );
  expect(g).toEqual({ kind: "client", id: "inve", label: "Grupo Inve", company: null });
});

test("9 — company HubSpot NO ligada + groupUnlinkedHubspotCompany=true → bucket hubspotCompany (display)", () => {
  const c = ctx({
    clients: [cliente("bot", "Botica Central")],
    hubspotCompaniesByDomain: new Map([
      ["inve.com", { id: "hs1", name: "Inve S.A.", domain: "inve.com" }],
    ]),
    groupUnlinkedHubspotCompany: true,
  });
  const g = categorizeSession(
    sesion({ participants: ["x@inve.com"], title: "Sesión Botica Central" }),
    c
  );
  expect(g).toEqual({ kind: "hubspotCompany", id: "hs1", label: "Inve S.A.", domain: "inve.com" });
});

test("10 — company HubSpot NO ligada sin el flag (materialización): ADITIVO, cae al título", () => {
  const c = ctx({
    clients: [cliente("bot", "Botica Central")],
    hubspotCompaniesByDomain: new Map([
      ["inve.com", { id: "hs1", name: "Inve S.A.", domain: "inve.com" }],
    ]),
    // groupUnlinkedHubspotCompany ausente → no corta.
  });
  const g = categorizeSession(
    sesion({ participants: ["x@inve.com"], title: "Sesión Botica Central" }),
    c
  );
  expect(g).toMatchObject({ kind: "client", id: "bot" });
});

// ── 11-12: title-match (stopwords y clientes de prueba) ──────────────────────

test("11 — stopwords: título de puros conectores no matchea; nombre distintivo real sí", () => {
  const c = ctx({ clients: [cliente("w", "Wherex")] });

  // "sesion", "seguimiento", "para", "cierre" son stopwords → sin tokens útiles → orphan.
  const conectores = categorizeSession(
    sesion({ participants: ["x@unknown.com"], title: "Sesión de seguimiento para cierre" }),
    c
  );
  expect(conectores).toEqual({ kind: "orphan", label: "unknown.com", domain: "unknown.com" });

  // "kickoff" y "para" se descartan, pero "wherex" es distintivo → resuelve.
  const distintivo = categorizeSession(
    sesion({ participants: ["x@unknown.com"], title: "Kickoff para Wherex" }),
    c
  );
  expect(distintivo).toMatchObject({ kind: "client", id: "w" });
});

test("12 — clientes de prueba ('Empresa para pruebas', /\\btest\\b/) excluidos del title-match", () => {
  const c = ctx({
    clients: [cliente("ep", "Empresa para pruebas"), cliente("tc", "Corp Test")],
  });
  // "empresa" matchearía al primero y "corp" al segundo, pero ambos son de prueba → orphan.
  const g = categorizeSession(
    sesion({ participants: ["x@foo-bar.com"], title: "Reunión empresa corp" }),
    c
  );
  expect(g).toEqual({ kind: "orphan", label: "foo-bar.com", domain: "foo-bar.com" });
});

// ── 13-14: computeAmbiguousNameTokens ────────────────────────────────────────

test("13 — token en 2+ empresas DISTINTAS ('grupo') se ignora; sin el set, catch-all histórico", () => {
  const clients = [cliente("s", "Grupo Servica"), cliente("i", "Grupo Inve")];
  const ambiguous = computeAmbiguousNameTokens(clients);
  expect(ambiguous.has("grupo")).toBe(true);
  expect(ambiguous.has("servica")).toBe(false);
  expect(ambiguous.has("inve")).toBe(false);

  const s = sesion({ participants: ["x@printer-sa.com"], title: "GRUPO PRINTER | seguimiento" });

  // Con el set: "grupo" se ignora y "printer" no es de nadie → orphan (no hay catch-all).
  const conSet = categorizeSession(s, ctx({ clients, ambiguousNameTokens: ambiguous }));
  expect(conSet).toEqual({ kind: "orphan", label: "printer-sa.com", domain: "printer-sa.com" });

  // Sin el set (comportamiento previo documentado): "grupo" matchea al primer cliente.
  const sinSet = categorizeSession(s, ctx({ clients }));
  expect(sinSet).toMatchObject({ kind: "client", id: "s" });

  // El token distintivo sigue resolviendo con el set activo.
  const porDistintivo = categorizeSession(
    sesion({ participants: ["x@printer-sa.com"], title: "Avances Servica" }),
    ctx({ clients, ambiguousNameTokens: ambiguous })
  );
  expect(porDistintivo).toMatchObject({ kind: "client", id: "s" });
});

test("14 — subset-aware: duplicados de la MISMA empresa (token-set ⊆ del otro) no son ambiguos", () => {
  const ambiguous = computeAmbiguousNameTokens([
    cliente("m1", "Ministerio de Economía"),
    cliente("m2", "Ministerio de Economía (MINEC)"), // superset del anterior → misma empresa
    cliente("c1", "Construtecho"),
    cliente("c2", "Construtecho"), // duplicado exacto → subsets mutuos
    cliente("s", "Grupo Servica"),
    cliente("i", "Grupo Inve"),
  ]);
  // Los duplicados de la misma empresa NO rompen su propia resolución por título.
  expect(ambiguous.has("ministerio")).toBe(false);
  expect(ambiguous.has("economia")).toBe(false); // normalizado sin acento
  expect(ambiguous.has("construtecho")).toBe(false);
  // Pero el token compartido entre empresas realmente distintas sí es ambiguo.
  expect(ambiguous.has("grupo")).toBe(true);
});

// ── 15-16: helpers y orphan ──────────────────────────────────────────────────

test("15 — extractParticipantDomains: lowercase, dedup y filtra entradas sin dominio", () => {
  const domains = extractParticipantDomains([
    "Ana@ACME.COM",
    "b@acme.com",
    "solo-nombre-sin-arroba",
    "",
    "c@Partner.io",
  ]);
  expect(domains).toEqual(new Set(["acme.com", "partner.io"]));
});

test("16 — orphan: sin participantes → 'Sin participantes'; dominio desconocido → label=dominio", () => {
  const sinParticipantes = categorizeSession(sesion(), ctx());
  expect(sinParticipantes).toEqual({ kind: "orphan", label: "Sin participantes" });

  const desconocido = categorizeSession(
    sesion({ participants: ["x@desconocido.cr"], title: "Agenda abierta" }),
    ctx()
  );
  expect(desconocido).toEqual({
    kind: "orphan",
    label: "desconocido.cr",
    domain: "desconocido.cr",
  });
});
