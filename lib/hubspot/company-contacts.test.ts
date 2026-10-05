/**
 * lib/hubspot/company-contacts.test.ts — un fallo pasajero de HubSpot NO borra a las personas del cliente.
 *
 * Antes, ante un 500 (o la red) `fetchCompanyContacts` devolvía «soportado, cero contactos»: el
 * try/catch de la copia de señales nunca se disparaba y la copia escribía una lista vacía encima de
 * los contactos guardados. El vigía de Éxito del cliente leía «el sponsor dejó de aparecer».
 * Ahora: 403 = sin permiso (`supported: false`); cualquier otro fallo LANZA, y la copia conserva los
 * contactos que ya tenía.
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
