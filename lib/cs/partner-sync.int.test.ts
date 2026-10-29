/**
 * lib/cs/partner-sync.int.test.ts — el cambio de registro de Partner Clients, contra una base REAL.
 *
 * Correr (con la base local levantada: `npm run db:local -- up`):
 *   npx vitest run lib/cs/partner-sync.int.test.ts --project integration
 *
 * Lo que una prueba pura no ve: que `clientId` @unique deja soltar el registro viejo y vincular el
 * nuevo en la misma transacción, que el historial semanal pasa con el registro, y que la corrida
 * siguiente no deshace nada ni vuelve a avisar. HubSpot va simulado; la base no.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const fetchAllPartnerClients = vi.hoisted(() => vi.fn());
vi.mock("@/lib/hubspot/partner-clients", () => ({ fetchAllPartnerClients }));

import { prisma } from "@/lib/db/prisma";
import type { PartnerClientRecord } from "@/lib/hubspot/partner-clients";
import { aplicarCambioDeRegistro, syncPartnerClients } from "./partner-sync";

/* El caso de KAIZEN KAPITAL medido el 2026-10-07. */
const VIEJO = "432818549540";
const NUEVO = "593040862051";
const COMPANY = "58556731410";
const DOMINIO = "kaizenkapital.com";

function registro(id: string, activo: boolean | null, companies: string[] = [COMPANY], uso = "40"): PartnerClientRecord {
  return {
    id,
    properties: { hs_is_active: activo === null ? null : String(activo), hs_unified_usage_score: uso },
    associatedCompanyIds: companies,
    resolved: { clientName: "KAIZEN KAPITAL", domain: DOMINIO, uusScore: uso },
  };
}

function hubspot(records: PartnerClientRecord[], associationsOk = true) {
  fetchAllPartnerClients.mockResolvedValue({ supported: true, records, associationsOk, propertyLabels: {} });
}

async function cliente() {
  return prisma.client.create({
    data: { name: "KAIZEN KAPITAL", kind: "CLIENTE", hubspotCompanyId: COMPANY, emailDomains: [DOMINIO] },
    select: { id: true },
  });
}

async function snapshot(partnerId: string, clientId: string | null, activo: boolean | null) {
  await prisma.clientPartnerSnapshot.create({
    data: { hubspotPartnerClientId: partnerId, clientId, properties: { hs_is_active: activo === null ? null : String(activo) } },
  });
}

async function semana(partnerId: string, weekKey: string, clientId: string | null, uusScore: number) {
  await prisma.partnerUsageSnapshot.create({ data: { hubspotPartnerClientId: partnerId, weekKey, clientId, uusScore } });
}

const vinculo = async (partnerId: string) =>
  (await prisma.clientPartnerSnapshot.findUnique({ where: { hubspotPartnerClientId: partnerId }, select: { clientId: true } }))?.clientId ?? null;

beforeEach(() => {
  fetchAllPartnerClients.mockReset();
});

describe("cambio de registro de Partner Clients", () => {
  it("el cliente pasa del registro inactivo al activo, con su historial, y la corrida siguiente no avisa nada", async () => {
    const c = await cliente();
    await snapshot(VIEJO, c.id, false);
    await snapshot(NUEVO, null, true);
    await semana(VIEJO, "2026-W28", c.id, 12);
    await semana(NUEVO, "2026-W39", null, 40);
    await prisma.csAccountBrief.create({ data: { clientId: c.id, statements: [] } });
    hubspot([registro(VIEJO, false), registro(NUEVO, true)]);

    const r = await syncPartnerClients({ createClients: true });

    expect(r.cambiosDeRegistro).toEqual([
      expect.objectContaining({ clientId: c.id, cliente: "KAIZEN KAPITAL", desde: VIEJO, hacia: NUEVO, via: "company", semanasDeHistorial: 1 }),
    ]);
    expect(r.errors).toEqual([]);
    expect(await vinculo(VIEJO)).toBeNull();
    expect(await vinculo(NUEVO)).toBe(c.id);
    // Lo que lee la ficha (por cliente): solo la serie del registro vivo, también la semana de hoy.
    const porCliente = await prisma.partnerUsageSnapshot.findMany({ where: { clientId: c.id }, select: { hubspotPartnerClientId: true } });
    expect(porCliente.length).toBeGreaterThan(0);
    expect(new Set(porCliente.map((f) => f.hubspotPartnerClientId))).toEqual(new Set([NUEVO]));
    // El historial del viejo sigue en la base, por registro, sin cliente.
    expect(await prisma.partnerUsageSnapshot.count({ where: { hubspotPartnerClientId: VIEJO, clientId: { not: null } } })).toBe(0);
    expect(await prisma.partnerUsageSnapshot.count({ where: { hubspotPartnerClientId: VIEJO } })).toBeGreaterThan(0);
    expect((await prisma.csAccountBrief.findUnique({ where: { clientId: c.id } }))?.staleAt).not.toBeNull();
    // No se creó ningún cliente: el viejo, suelto, sigue apuntando al mismo.
    expect(await prisma.client.count()).toBe(1);

    const segunda = await syncPartnerClients({ createClients: true });
    expect(segunda.cambiosDeRegistro).toEqual([]);
    expect(segunda.errors).toEqual([]);
    expect(await vinculo(NUEVO)).toBe(c.id);
    expect(await vinculo(VIEJO)).toBeNull();
  });

  it("dos registros activos para el mismo cliente: no se elige, se avisa una vez", async () => {
    const c = await cliente();
    await snapshot(VIEJO, c.id, true);
    await snapshot(NUEVO, null, true);
    hubspot([registro(VIEJO, true), registro(NUEVO, true)]);

    const r = await syncPartnerClients({ createClients: true });

    expect(r.cambiosDeRegistro).toEqual([]);
    expect(r.cambiosSinElegir).toEqual([expect.objectContaining({ clientId: c.id, motivo: "dos-activos", actual: VIEJO, candidatos: [NUEVO] })]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain("dos registros activos");
    expect(await vinculo(VIEJO)).toBe(c.id);
    expect(await vinculo(NUEVO)).toBeNull();
  });

  it("corrida «partial» (asociaciones no confiables): no se mueve nada", async () => {
    const c = await cliente();
    await snapshot(VIEJO, c.id, false);
    await snapshot(NUEVO, null, true);
    hubspot([registro(VIEJO, false), registro(NUEVO, true)], false);

    const r = await syncPartnerClients({ createClients: true });

    expect(r.cambiosDeRegistro).toEqual([]);
    expect(await vinculo(VIEJO)).toBe(c.id);
    expect(await vinculo(NUEVO)).toBeNull();
  });

  it("si el registro activo no se había sincronizado nunca, el cambio crea su snapshot", async () => {
    const c = await cliente();
    await snapshot(VIEJO, c.id, false);
    hubspot([registro(VIEJO, false), registro(NUEVO, true)]);

    const r = await syncPartnerClients({ createClients: true });

    expect(r.cambiosDeRegistro).toHaveLength(1);
    expect(await vinculo(NUEVO)).toBe(c.id);
    expect(await vinculo(VIEJO)).toBeNull();
  });

  it("un registro inactivo que no coincide con nadie no crea un cliente", async () => {
    hubspot([{ ...registro("777", false, ["123"]), resolved: { clientName: "Portal cerrado", domain: "cerrado.com" } }]);

    const r = await syncPartnerClients({ createClients: true });

    expect(r.createdClients).toEqual([]);
    expect(await prisma.client.count()).toBe(0);
  });

  it("sin `cambiarRegistros` el cambio solo se planea: nadie se mueve", async () => {
    const c = await cliente();
    await snapshot(VIEJO, c.id, false);
    await snapshot(NUEVO, null, true);
    hubspot([registro(VIEJO, false), registro(NUEVO, true)]);

    const r = await syncPartnerClients({ createClients: false, cambiarRegistros: false });

    expect(r.cambiosDeRegistro).toEqual([]);
    expect(r.cambiosPendientes).toEqual([expect.objectContaining({ clientId: c.id, desde: VIEJO, hacia: NUEVO })]);
    expect(r.errors).toEqual([]);
    expect(await vinculo(VIEJO)).toBe(c.id);
    expect(await vinculo(NUEVO)).toBeNull();
  });

  it("la empresa de HubSpot del registro activo es de un prospecto: por dominio no se lleva al cliente", async () => {
    const c = await cliente();
    await prisma.client.create({ data: { name: "Otra con el mismo dominio", kind: "PROSPECTO", hubspotCompanyId: "999" } });
    await snapshot(VIEJO, c.id, false);
    hubspot([registro(VIEJO, false), registro(NUEVO, true, ["999"])]);

    const r = await syncPartnerClients({ createClients: false });

    expect(r.cambiosDeRegistro).toEqual([]);
    expect(await vinculo(VIEJO)).toBe(c.id);
    expect(await vinculo(NUEVO)).toBeNull();
  });
});

describe("aplicarCambioDeRegistro: todo o nada", () => {
  const cambio = (clientId: string) => ({ clientId, desde: VIEJO, hacia: NUEVO, via: "company" as const });
  const sinDatos = {} as Parameters<typeof aplicarCambioDeRegistro>[1];

  it("si el registro activo ya tiene otro cliente, se deshace todo y el cliente sigue con el viejo", async () => {
    const c = await cliente();
    const otro = await prisma.client.create({ data: { name: "Otra", kind: "CLIENTE" }, select: { id: true } });
    await snapshot(VIEJO, c.id, false);
    await snapshot(NUEVO, otro.id, true);
    await semana(VIEJO, "2026-W28", c.id, 12);

    await expect(aplicarCambioDeRegistro(cambio(c.id), sinDatos, new Date())).rejects.toThrow(/ya tiene otro cliente/);

    expect(await vinculo(VIEJO)).toBe(c.id);
    expect(await vinculo(NUEVO)).toBe(otro.id);
    expect(await prisma.partnerUsageSnapshot.count({ where: { hubspotPartnerClientId: VIEJO, clientId: c.id } })).toBe(1);
  });

  it("si el registro viejo ya no es del cliente, no escribe nada", async () => {
    const c = await cliente();
    await snapshot(VIEJO, null, false);
    await snapshot(NUEVO, null, true);

    await expect(aplicarCambioDeRegistro(cambio(c.id), sinDatos, new Date())).rejects.toThrow(/ya no tiene al cliente/);

    expect(await vinculo(NUEVO)).toBeNull();
  });
});
