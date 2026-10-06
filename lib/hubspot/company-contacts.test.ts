/**
 * lib/hubspot/company-contacts.test.ts — un fallo pasajero de HubSpot NO borra a las personas del cliente.
 *
 * Antes, ante un 500 (o la red) `fetchCompanyContacts` devolvía «soportado, cero contactos»: el
 * try/catch de la copia de señales nunca se disparaba y la copia escribía una lista vacía encima de
 * los contactos guardados. El vigía de Éxito del cliente leía «el sponsor dejó de aparecer».
 * Ahora: 403 = sin permiso (`supported: false`); cualquier otro fallo LANZA, y la copia conserva los
 * contactos que ya tenía.
 *
 * El mismo criterio vale para los TICKETS (`tickets.ts`: un fallo dejaba «0 abiertos») y el REGISTRO
 * de actividad (`company-timeline.ts`: un fallo borraba la última actividad y el cliente se veía
 * «frío»). Sus casos están abajo: los módulos reales se leen con `vi.importActual`, porque para la
 * copia de señales este archivo los simula.
 *
 * HubSpot y la base son falsos: `apiRequest` contesta lo que cada test diga.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Client as HsClient } from "@hubspot/api-client";

const hubspot = vi.hoisted(() => ({ apiRequest: vi.fn() }));
const db = vi.hoisted(() => ({
  client: { findUnique: vi.fn() },
  firefliesSession: { findFirst: vi.fn() },
  clientCsSignals: { findUnique: vi.fn(), upsert: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("./client", () => ({
  getSystemHubspotClient: async () => hubspot,
  forceRefreshSystemToken: vi.fn(async () => {}),
}));
vi.mock("./deals", () => ({ fetchCompanyDeals: vi.fn(async () => []) }));
vi.mock("./company-timeline", () => ({ fetchCompanyTimelineItems: vi.fn(async () => []) }));
vi.mock("./tickets", () => ({ fetchCompanyTickets: vi.fn(async () => ({ supported: true, tickets: [] })) }));
vi.mock("@/lib/sessions/project-sources", () => ({ whereBelongsToClient: () => ({}) }));

import { FalloAlLeerContactos, fetchCompanyContacts } from "./company-contacts";
import { computeClientSignals } from "./cs-signals";
// Simulados (los de arriba): cada test de la copia decide si fallan.
import { fetchCompanyTickets } from "./tickets";
import { fetchCompanyTimelineItems } from "./company-timeline";

/** Una respuesta de HubSpot con su status (y su JSON, si hay). */
const respuesta = (status: number, body: unknown = {}) => ({ status, json: async () => body });

/** HubSpot contesta según la ruta: las asociaciones y la lectura en lote. */
function hubspotQueContesta(asociaciones: ReturnType<typeof respuesta>, lote?: ReturnType<typeof respuesta>) {
  hubspot.apiRequest.mockImplementation(async (req: { path: string }) => {
    if (req.path.includes("/associations/contacts")) return asociaciones;
    if (req.path.includes("/contacts/batch/read")) return lote ?? respuesta(500);
    throw new Error(`ruta inesperada en el test: ${req.path}`);
  });
}

const hs = hubspot as unknown as HsClient;

const SPONSOR = {
  id: "c1",
  nombre: "Ana Sponsor",
  email: "ana@cliente.com",
  cargo: "Gerente general",
  ultimoContacto: "2026-09-30T15:00:00.000Z",
  creado: "2025-01-10T12:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  db.client.findUnique.mockResolvedValue({ id: "cli-1", hubspotCompanyId: "hs-99" });
  db.firefliesSession.findFirst.mockResolvedValue(null);
  db.clientCsSignals.findUnique.mockResolvedValue({ engagement: { lastAt: null, count90d: 0, lastItems: [], contactos: [SPONSOR] } });
  db.clientCsSignals.upsert.mockResolvedValue({});
});

describe("fetchCompanyContacts: «no soportado» no es lo mismo que «falló»", () => {
  it("⭐ un 500 en las asociaciones LANZA (no devuelve cero contactos)", async () => {
    hubspotQueContesta(respuesta(500));
    await expect(fetchCompanyContacts(hs, "hs-99")).rejects.toBeInstanceOf(FalloAlLeerContactos);
  });

  it("⭐ un 500 en la lectura en lote LANZA", async () => {
    hubspotQueContesta(respuesta(200, { results: [{ id: "c1" }] }), respuesta(500));
    await expect(fetchCompanyContacts(hs, "hs-99")).rejects.toThrow(/respondió 500/);
  });

  it("⭐ la red caída LANZA", async () => {
    hubspot.apiRequest.mockRejectedValue(new Error("ECONNRESET"));
    await expect(fetchCompanyContacts(hs, "hs-99")).rejects.toThrow(/ECONNRESET/);
  });

  it("un 403 es «sin permiso»: no soportado, sin lanzar", async () => {
    hubspotQueContesta(respuesta(403));
    await expect(fetchCompanyContacts(hs, "hs-99")).resolves.toEqual({ supported: false, contactos: [] });
  });

  it("una empresa sin contactos asociados sí es «soportado, cero»", async () => {
    hubspotQueContesta(respuesta(200, { results: [] }));
    await expect(fetchCompanyContacts(hs, "hs-99")).resolves.toEqual({ supported: true, contactos: [] });
  });

  it("la lectura buena trae a las personas", async () => {
    hubspotQueContesta(
      respuesta(200, { results: [{ id: "c1" }] }),
      respuesta(200, {
        results: [
          {
            id: "c1",
            properties: { firstname: "Ana", lastname: "Sponsor", email: "ana@cliente.com", jobtitle: "Gerente general", notes_last_contacted: "2026-09-30T15:00:00.000Z", createdate: "2025-01-10T12:00:00.000Z" },
          },
        ],
      }),
    );
    await expect(fetchCompanyContacts(hs, "hs-99")).resolves.toEqual({ supported: true, contactos: [SPONSOR] });
  });
});

describe("la copia de señales no pisa los contactos guardados ante un fallo", () => {
  /** Los contactos que la copia escribió en la base. */
  const escritos = () => {
    expect(db.clientCsSignals.upsert).toHaveBeenCalledTimes(1);
    const arg = db.clientCsSignals.upsert.mock.calls[0][0] as {
      update: { engagement: { contactos: unknown } };
      create: { engagement: { contactos: unknown } };
    };
    return { update: arg.update.engagement.contactos, create: arg.create.engagement.contactos };
  };

  it("⭐ HubSpot responde 500 → se conservan los contactos de la copia anterior y queda anotado el error", async () => {
    hubspotQueContesta(respuesta(500));
    const r = await computeClientSignals("cli-1");
    expect(escritos().update, "un 500 borró a las personas guardadas").toEqual([SPONSOR]);
    expect(escritos().create).toEqual([SPONSOR]);
    expect(r.fetchStatus).toBe("partial");
    expect(r.errors.join(" ")).toMatch(/^contactos: .*500/);
  });

  it("una lectura buena SÍ reemplaza lo guardado (aunque venga vacía)", async () => {
    hubspotQueContesta(respuesta(200, { results: [] }));
    const r = await computeClientSignals("cli-1");
    expect(escritos().update).toEqual([]);
    expect(r.fetchStatus).toBe("ok");
  });

  it("sin copia anterior, un fallo deja la lista vacía (no inventa a nadie)", async () => {
    db.clientCsSignals.findUnique.mockResolvedValue(null);
    hubspotQueContesta(respuesta(500));
    await computeClientSignals("cli-1");
    expect(escritos().update).toEqual([]);
  });
});

/** HubSpot contesta según un trozo de la ruta; una ruta que el test no previó LANZA. */
function hubspotPorRuta(rutas: [string, ReturnType<typeof respuesta>][]) {
  hubspot.apiRequest.mockImplementation(async (req: { path: string }) => {
    const r = rutas.find(([trozo]) => req.path.includes(trozo));
    if (!r) throw new Error(`ruta inesperada en el test: ${req.path}`);
    return r[1];
  });
}

describe("tickets: «no soportado» no es lo mismo que «falló»", () => {
  const real = () => vi.importActual<typeof import("./tickets")>("./tickets");

  it("⭐ un 500 en las asociaciones LANZA (no devuelve «cero abiertos»)", async () => {
    const t = await real();
    hubspotPorRuta([["/associations/tickets", respuesta(500)]]);
    const leer = t.fetchCompanyTickets(hs, "hs-99");
    await expect(leer).rejects.toBeInstanceOf(t.FalloAlLeerTickets);
    await expect(leer).rejects.toThrow(/asociaciones respondieron 500/);
  });

  it("⭐ un 429 en la lectura en lote LANZA", async () => {
    const t = await real();
    hubspotPorRuta([
      ["/associations/tickets", respuesta(200, { results: [{ id: "t1" }] })],
      ["/tickets/batch/read", respuesta(429)],
    ]);
    await expect(t.fetchCompanyTickets(hs, "hs-99")).rejects.toThrow(/lote respondió 429/);
  });

  it("⭐ la red caída LANZA", async () => {
    const t = await real();
    hubspot.apiRequest.mockRejectedValue(new Error("ECONNRESET"));
    await expect(t.fetchCompanyTickets(hs, "hs-99")).rejects.toThrow(/ECONNRESET/);
  });

  it("⭐ un 401 aun con el token renovado LANZA", async () => {
    const t = await real();
    hubspotPorRuta([["/associations/tickets", respuesta(401)]]);
    await expect(t.fetchCompanyTickets(hs, "hs-99")).rejects.toThrow(/401 aun con el token renovado/);
  });

  it("un 403 es «sin permiso»: no soportado, sin lanzar", async () => {
    const t = await real();
    hubspotPorRuta([["/associations/tickets", respuesta(403)]]);
    await expect(t.fetchCompanyTickets(hs, "hs-99")).resolves.toEqual({ supported: false, tickets: [] });
  });

  it("una empresa sin tickets sí es «soportado, cero»", async () => {
    const t = await real();
    hubspotPorRuta([["/associations/tickets", respuesta(200, { results: [] })]]);
    await expect(t.fetchCompanyTickets(hs, "hs-99")).resolves.toEqual({ supported: true, tickets: [] });
  });
});

describe("registro de actividad: un fallo LANZA, un 403 es vacío", () => {
  const real = () => vi.importActual<typeof import("./company-timeline")>("./company-timeline");
  const ENGAGEMENTS = "/engagements/v1/engagements/associated/company/";

  it("⭐ un 500 LANZA (no devuelve «sin actividad»)", async () => {
    const r = await real();
    hubspotPorRuta([[ENGAGEMENTS, respuesta(500)]]);
    const leer = r.fetchCompanyTimelineItems(hs, "hs-99");
    await expect(leer).rejects.toBeInstanceOf(r.FalloAlLeerElRegistro);
    await expect(leer).rejects.toThrow(/engagements respondieron 500/);
  });

  it("⭐ la red caída LANZA", async () => {
    const r = await real();
    hubspot.apiRequest.mockRejectedValue(new Error("ETIMEDOUT"));
    await expect(r.fetchCompanyTimelineItems(hs, "hs-99")).rejects.toThrow(/ETIMEDOUT/);
  });

  it("⭐ un 401 aun con el token renovado LANZA", async () => {
    const r = await real();
    hubspotPorRuta([[ENGAGEMENTS, respuesta(401)]]);
    await expect(r.fetchCompanyTimelineItems(hs, "hs-99")).rejects.toThrow(/401 aun con el token renovado/);
  });

  it("un 403 (sin permiso) devuelve vacío sin lanzar", async () => {
    const r = await real();
    hubspotPorRuta([[ENGAGEMENTS, respuesta(403)]]);
    await expect(r.fetchCompanyTimelineItems(hs, "hs-99")).resolves.toEqual([]);
  });
});

describe("la copia de señales no pisa los tickets ni la última actividad ante un fallo", () => {
  const ACTIVIDAD = { type: "MEETING", title: "Revisión trimestral", date: "20 sept 2026", ts: Date.parse("2026-09-20T15:00:00.000Z"), resumen: "Revisamos el avance" };
  const ULTIMA = new Date("2026-09-20T15:00:00.000Z");
  const TICKETS_GUARDADOS = {
    supported: true,
    open: [{ id: "t1", subject: "No sincroniza", pipelineStage: "1", priority: "HIGH", createdAt: "2026-09-28T10:00:00.000Z", closedAt: null }],
    recent: [{ id: "t1", subject: "No sincroniza", pipelineStage: "1", priority: "HIGH", createdAt: "2026-09-28T10:00:00.000Z", closedAt: null }],
  };

  /** Lo que la copia escribió en la base (update y create van iguales). */
  const escrito = () => {
    expect(db.clientCsSignals.upsert).toHaveBeenCalledTimes(1);
    return db.clientCsSignals.upsert.mock.calls[0][0] as {
      update: Record<string, unknown> & { engagement: { lastAt: unknown; count90d: unknown; lastItems: unknown } };
      create: Record<string, unknown> & { engagement: { lastAt: unknown; count90d: unknown; lastItems: unknown } };
    };
  };

  beforeEach(() => {
    hubspotQueContesta(respuesta(200, { results: [] })); // los contactos leen bien
    db.clientCsSignals.findUnique.mockResolvedValue({
      engagement: { lastAt: ULTIMA.toISOString(), count90d: 4, lastItems: [ACTIVIDAD], contactos: [SPONSOR] },
      tickets: TICKETS_GUARDADOS,
      lastEngagementAt: ULTIMA,
      engagements90d: 4,
      openTicketCount: 1,
      ticketsSupported: true,
    });
  });

  it("⭐ los tickets fallan → se conservan los abiertos de la copia anterior y queda anotado el error", async () => {
    vi.mocked(fetchCompanyTickets).mockRejectedValueOnce(new Error("no se pudieron leer los tickets de HubSpot: la lectura en lote respondió 500"));
    const r = await computeClientSignals("cli-1");
    const { update, create } = escrito();
    expect(update.openTicketCount, "un 500 dejó al cliente con «0 tickets abiertos»").toBe(1);
    expect(update.ticketsSupported).toBe(true);
    expect(update.tickets).toEqual(TICKETS_GUARDADOS);
    expect(create.openTicketCount).toBe(1);
    expect(r.fetchStatus).toBe("partial");
    expect(r.errors.join(" ")).toMatch(/^tickets: .*500/);
  });

  it("⭐ el registro de actividad falla → se conserva la última actividad (el cliente no se ve frío)", async () => {
    vi.mocked(fetchCompanyTimelineItems).mockRejectedValueOnce(new Error("no se pudo leer el registro de actividad de HubSpot: los engagements respondieron 500"));
    const r = await computeClientSignals("cli-1");
    const { update, create } = escrito();
    expect(update.lastEngagementAt, "un 500 borró la última actividad").toEqual(ULTIMA);
    expect(update.engagements90d).toBe(4);
    expect(update.engagement.lastAt).toBe(ULTIMA.toISOString());
    expect(update.engagement.lastItems).toEqual([ACTIVIDAD]);
    expect(create.lastEngagementAt).toEqual(ULTIMA);
    expect(r.fetchStatus).toBe("partial");
    expect(r.errors.join(" ")).toMatch(/^engagement: .*500/);
  });

  it("una lectura buena SÍ reemplaza lo guardado (cero abiertos y sin actividad de verdad)", async () => {
    const r = await computeClientSignals("cli-1");
    const { update } = escrito();
    expect(update.openTicketCount).toBe(0);
    expect(update.lastEngagementAt).toBeNull();
    expect(update.engagement.lastItems).toEqual([]);
    expect(r.fetchStatus).toBe("ok");
  });

  it("un 403 de tickets es «sin permiso»: se escribe no soportado, sin error", async () => {
    vi.mocked(fetchCompanyTickets).mockResolvedValueOnce({ supported: false, tickets: [] });
    const r = await computeClientSignals("cli-1");
    expect(escrito().update.ticketsSupported).toBe(false);
    expect(escrito().update.openTicketCount).toBe(0);
    expect(r.fetchStatus).toBe("ok");
  });
});
