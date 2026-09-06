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
import { coberturaPorCse } from "./cobertura-por-cse";
import fs from "node:fs";
import path from "node:path";
import {
  construirIndice,
  filasDelGrupo,
  grupoAParam,
  grupoDeSesion,
  paramAGrupo,
} from "./indice-de-grupos";
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

  /* Sin el set, "grupo" matchea a los DOS clientes. Hasta el 2026-08-19 ganaba el primero del
     array —el catch-all histórico— y ese "primero gana" ERA el bug: adjudicaba adivinando y en
     silencio. Ahora empata y no elige ninguno, así que la reunión cae al bucket sin dueño, donde
     se ve y se puede asignar a mano. El set de ambiguos sigue siendo la primera línea; esto es la
     red de abajo. */
  const sinSet = categorizeSession(s, ctx({ clients }));
  expect(sinSet.kind, "volvió el catch-all: con dos candidatos, elegir el primero es adivinar").toBe(
    "orphan",
  );

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

// ── C-19 (2026-09-04): /sessions manda el índice + el grupo elegido, no las 16k filas ──────────

test("C-19 — el índice cuenta por grupo (huérfanas por dominio, o label sin dominio) y filasDelGrupo filtra", () => {
  /* La edición que lo pone en rojo: agrupar las huérfanas por label «porque es lo que se ve»
     (dos dominios con el mismo label se funden y `?g=orphan:<dominio>` deja de encontrarlas), o
     que filasDelGrupo devuelva todo cuando no hay grupo. */
  const filas = [
    { id: "1", group: { kind: "client" as const, id: "c1", label: "Acme" }, hasTranscript: true },
    { id: "2", group: { kind: "client" as const, id: "c1", label: "Acme" }, hasTranscript: false },
    { id: "3", group: { kind: "hubspotCompany" as const, id: "h1", label: "Beta", domain: "beta.cr" }, hasTranscript: true },
    { id: "4", group: { kind: "category" as const, id: "k1", label: "Interna", categoryKind: "internal" }, hasTranscript: false },
    { id: "5", group: { kind: "orphan" as const, label: "gamma.cr", domain: "gamma.cr" }, hasTranscript: true },
    { id: "6", group: { kind: "orphan" as const, label: "Sin dominio" }, hasTranscript: false },
  ];
  const indice = construirIndice(filas);
  expect(indice.byClient).toEqual({ c1: { total: 2, withTranscript: 1 } });
  expect(indice.byHubspotCompany).toEqual({ h1: { total: 1, withTranscript: 1 } });
  expect(indice.byCategory).toEqual({ k1: { total: 1, withTranscript: 0 } });
  expect(indice.orphans).toEqual({
    "gamma.cr": { label: "gamma.cr", domain: "gamma.cr", total: 1, withTranscript: 1 },
    "Sin dominio": { label: "Sin dominio", domain: undefined, total: 1, withTranscript: 0 },
  });
  expect(indice.total).toBe(6);

  expect(filasDelGrupo(filas, { kind: "client", id: "c1" }).map((f) => f.id)).toEqual(["1", "2"]);
  expect(filasDelGrupo(filas, { kind: "orphan", id: "gamma.cr" }).map((f) => f.id)).toEqual(["5"]);
  expect(filasDelGrupo(filas, { kind: "orphan", id: "Sin dominio" }).map((f) => f.id)).toEqual(["6"]);
  expect(filasDelGrupo(filas, null), "sin grupo elegido no viaja ninguna fila").toEqual([]);
  // La selección de una huérfana se identifica por su dominio: la misma clave que usa el índice.
  expect(grupoDeSesion(filas[4].group)).toEqual({ kind: "orphan", id: "gamma.cr" });
});

test("C-19 — `?g=` va y vuelve, y un valor inválido devuelve null en vez de lanzar", () => {
  expect(paramAGrupo(grupoAParam({ kind: "client", id: "c1" }))).toEqual({ kind: "client", id: "c1" });
  expect(paramAGrupo(grupoAParam({ kind: "orphan", id: "gamma.cr" }))).toEqual({ kind: "orphan", id: "gamma.cr" });
  expect(paramAGrupo("cliente:c1"), "kind inexistente").toBeNull();
  expect(paramAGrupo("client:"), "id vacío").toBeNull();
  expect(paramAGrupo("client:%E0%A4%A"), "URI mal formada").toBeNull();
  expect(paramAGrupo(undefined)).toBeNull();
});

test("C-19 — la página manda el índice + las filas del grupo, y el cliente adopta las filas nuevas", () => {
  /* La edición que lo pone en rojo: volver a `sessions={sessionsWithMeta}` en la página «porque
     el cliente ya filtraba» — las 16k filas de vuelta en cada clic; o sacar la adopción en el
     cliente: al cambiar de grupo llegan filas nuevas y la lista sigue mostrando las viejas. */
  const leer = (rel: string) =>
    fs.readFileSync(path.join(process.cwd(), rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  const page = leer("app/(shell)/sessions/page.tsx");
  expect(page, "la página vuelve a mandar el historial completo").not.toContain("sessions={sessionsWithMeta}");
  expect(page).toContain("sessions={filas}");
  expect(page).toContain("indice={indice}");
  expect(page, "el grupo lo resuelve el servidor de la URL").toContain("paramAGrupo(uno(sp.g))");
  const cliente = leer("app/(shell)/sessions/SessionsClient.tsx");
  expect(cliente, "el cliente vuelve a contar los grupos con las filas (que ya no son todas)").not.toContain("bump(byClient");
  expect(cliente).toContain("new Map(Object.entries(indice.byClient))");
  expect(cliente, "sin adopción, al cambiar de grupo la lista sigue mostrando las filas viejas").toContain(
    "if (initialSessions !== filasAdoptadas) {",
  );
  expect(cliente, "los helpers de `?g=` tienen un solo dueño").not.toContain("function paramToGroup(");
});

test("C-20 — cambiar de grupo pide la ruta (con guard interno) y NO re-renderiza el servidor; página y ruta cargan por el mismo cargador", () => {
  /* La edición que lo pone en rojo: volver a `router.replace` en el cliente (cada clic re-corre la
     página entera en el servidor), sacarle `withInternal` a la ruta (las sesiones de todos los
     clientes con solo una sesión de Supabase), o que la página vuelva a consultar por su cuenta
     (dos cargadores que divergen: la barra cuenta una cosa y la ruta devuelve otra). */
  const leer = (rel: string) =>
    fs.readFileSync(path.join(process.cwd(), rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  const ruta = leer("app/api/sessions/grupo/route.ts");
  expect(ruta, "la ruta tiene que exigir usuario interno").toMatch(/export const GET = withInternal\(/);
  expect(ruta).toContain("paramAGrupo(req.nextUrl.searchParams.get(\"g\"))");
  expect(ruta, "la ruta carga por el mismo cargador que la página").toContain("cargarSesionesCategorizadas()");
  expect(ruta).toContain("filasDelGrupo(sessionsWithMeta, grupo)");

  const page = leer("app/(shell)/sessions/page.tsx");
  expect(page, "la página tiene que cargar por el mismo cargador que la ruta").toContain("await cargarSesionesCategorizadas()");
  expect(page, "la página vuelve a consultar por su cuenta: dos cargadores que divergen").not.toContain("prisma.");

  const cargador = leer("lib/sessions/cargar-sesiones-categorizadas.ts");
  expect(cargador).toContain("prisma.firefliesSession.findMany(");
  expect(cargador, "las futuras se MARCAN, no se esconden").not.toMatch(/date:\s*\{\s*lte:/);

  const cliente = leer("app/(shell)/sessions/SessionsClient.tsx");
  expect(cliente, "router.replace re-corre la página entera en el servidor en cada clic").not.toContain("router.replace(");
  expect(cliente, "la URL sigue a la selección sin pedirle nada al servidor").toContain('window.history.replaceState(null, "", next)');
  expect(cliente, "las filas de un grupo se piden a la ruta").toContain("/api/sessions/grupo?g=");
  expect(cliente, "y se guardan por grupo: un grupo se pide UNA vez").toContain("setGrupos((prev) => ({ ...prev, [clave]: filas }))");
});

// ── D-08 (2026-09-04): % de reuniones con transcripción, por CSE y por cliente ──────────────────
/* El aviso de /sessions decía «N% no dejó transcripción» y nadie podía responder de QUIÉN. Ahora se
   agrupa por persona de Customer Success sobre las filas que la página ya carga, y la ficha del
   cliente (el GPS del proyecto) dice el % de ese cliente con dos COUNT sobre el índice. */

test("D-08 · coberturaPorCse: solo lo ocurrido en la ventana, quién es CS lo decide el ÁREA, y una reunión con dos CSE cuenta para los dos", () => {
  const ahora = new Date("2026-09-04T12:00:00Z");
  const dias = (n: number) => new Date(ahora.getTime() - n * 24 * 60 * 60 * 1000);
  /* ⚠ El eje es el ÁREA, no la celda de permisos (corregido el 2026-09-05). Hasta entonces esto
     filtraba por `roleEnum ∈ {CSE, CSL}`, un criterio propio que divergía del dueño único del repo
     (`isCseMember`, lib/sessions/areas.ts) justo en el caso que el schema documenta con nombre y
     apellido: alguien de Customer Success con `roleEnum: SUPER_ADMIN` desaparecía del desglose sin
     que nada avisara, y su línea salía corta como si grabara todo.
     Luis es el caso que lo prueba: su permiso NO es "CSE" y aun así cuenta, porque su área sí. */
  const equipo = [
    { name: "Ana", email: "Ana@smarteamcr.com", area: "CSE", roleEnum: "CSE" },
    { name: "Luis", email: "luis@smarteamcr.com", area: "CSE", roleEnum: "CSL" },
    { name: "Sofi", email: "sofi@smarteamcr.com", area: "CSE", roleEnum: "SUPER_ADMIN" },
    { name: "Pepe", email: "pepe@smarteamcr.com", area: "Ventas", roleEnum: "VENTAS" },
  ];
  const sesiones = [
    { id: "s1", date: dias(1), participants: ["ana@smarteamcr.com", "luis@smarteamcr.com", "x@cliente.com"] },
    { id: "s2", date: dias(10).toISOString(), participants: ["ana@smarteamcr.com"] },
    { id: "agendada", date: dias(-1), participants: ["ana@smarteamcr.com"] },
    { id: "vieja", date: dias(100), participants: ["ana@smarteamcr.com"] },
    { id: "ventas", date: dias(2), participants: ["pepe@smarteamcr.com"] },
    { id: "sofi", date: dias(3), participants: ["sofi@smarteamcr.com"] },
  ];
  const conTranscript = new Set(["s1"]);
  const filas = coberturaPorCse(sesiones, equipo, (id) => conTranscript.has(id), ahora);

  expect(
    filas.map((f) => f.email),
    "entran los de ÁREA CS aunque su permiso no sea CSE; Ventas no entra; peor cobertura primero",
  ).toEqual(["sofi@smarteamcr.com", "Ana@smarteamcr.com", "luis@smarteamcr.com"]);
  expect(
    filas[0],
    "el caso que el criterio viejo perdía: área CS con permiso de super admin, y su única reunión sin grabar",
  ).toMatchObject({ nombre: "Sofi", total: 1, sinTranscript: 1 });
  const ana = filas.find((f) => f.nombre === "Ana")!;
  expect({ total: ana.total, sinTranscript: ana.sinTranscript }, "una reunión agendada no es una reunión que hubo, y >90 días queda afuera").toEqual({ total: 2, sinTranscript: 1 });
  expect(filas.find((f) => f.nombre === "Luis"), "la reunión con dos CSE cuenta para los dos").toMatchObject({ total: 1, sinTranscript: 0 });
  expect(
    coberturaPorCse(sesiones, [{ name: "Pepe", email: "pepe@smarteamcr.com", area: "Ventas", roleEnum: "VENTAS" }], () => false, ahora),
    "sin nadie de CS en el equipo no hay desglose",
  ).toEqual([]);
});

test("D-08 · /sessions agrupa por CSE sobre lo que ya cargó, y el aviso lo PINTA", () => {
  /* La edición que lo pone en rojo: calcular `porCse` con una consulta nueva «para que sea exacto»
     (el ítem exige cero consultas pesadas: son las mismas filas), o mandarlo al cliente y no pintarlo
     — un dato que llega y no se pinta es idéntico a un dato que no llega. */
  const cargador = fs.readFileSync(path.join(process.cwd(), "lib/sessions/cargar-sesiones-categorizadas.ts"), "utf8");
  expect(cargador, "el desglose sale de las filas ya cargadas, con el mismo criterio de transcript y el mismo reloj")
    .toContain("const porCse = coberturaPorCse(sessions, teamMembers, (id) => withTranscriptSet.has(id), now);");
  expect(cargador).toContain("return { conCliente, conClienteSinTr, adentro, adentroSinTr, porCse };");

  const cliente = fs.readFileSync(path.join(process.cwd(), "app/(shell)/sessions/SessionsClient.tsx"), "utf8");
  const aviso = cliente.slice(cliente.indexOf("function AvisoDeCobertura("), cliente.indexOf("// ── Badge de fuente"));
  expect(aviso.length, "la guarda no mira nada").toBeGreaterThan(400);
  expect(aviso, "el aviso pinta el desglose por CSE, no solo el número global").toContain("Sin transcripción, por CSE:");
  expect(aviso, "cada fila dice el % y el conteo de ESA persona").toContain("{pct(f.sinTranscript, f.total)}% ({f.sinTranscript} de {f.total})");
});

test("D-08 · la ficha del cliente: el GPS cuenta con dos COUNT (pasadas, con transcript no vacío) y el widget lo pinta", () => {
  /* La edición que lo pone en rojo: contar `transcript: { not: null }` sin excluir `""` («total
     analizables» mentiría hacia arriba, lección de C-10); contar también lo agendado (el % empeora solo
     por agendar); o traer filas en vez de contar. */
  const ruta = fs.readFileSync(path.join(process.cwd(), "app/api/projects/[projectId]/gps/route.ts"), "utf8");
  const bloque = ruta.slice(ruta.indexOf("const ahoraCobertura"), ruta.indexOf("const pendingItemsCompat"));
  expect(bloque.length, "la guarda no mira nada").toBeGreaterThan(200);
  expect(bloque, "solo las que ya ocurrieron, dentro de la ventana").toContain("date: { gte: desdeCobertura, lt: ahoraCobertura }");
  expect(bloque, "«con transcripción» = no nula Y no vacía").toContain('transcript: { not: null }, NOT: { transcript: "" }');
  expect(bloque, "se cuenta, no se traen filas").toContain("prisma.firefliesSession.count({ where: whereCobertura })");
  expect(bloque).not.toContain("findMany");
  expect(ruta, "el dato viaja en la respuesta del GPS").toMatch(/^\s+coberturaDelCliente,$/m);

  const widget = fs.readFileSync(path.join(process.cwd(), "components/clients/ProjectGPS.tsx"), "utf8");
  expect(widget, "el widget lo pinta con el % único del módulo").toContain("Con transcripción: <strong>{pctTranscript}%</strong>");
  expect(widget, "sin reuniones pasadas no se pinta un 0% sobre nada").toContain("cobertura && pctTranscript !== null &&");
});
