/**
 * lib/contactos/copia-empresa.int.test.ts — LO DE HUBSPOT DE UNA EMPRESA, A SU UNIDAD, dentro de las copias de verdad
 * (2026-11-26, revisión: el reparto se probaba solo por separado). Contra `nexus_test` y un HubSpot simulado: la copia de
 * contactos y tickets, y la de correos y notas, con la empresa «TEC» arriba de TAE y AE.
 *
 * Correr: `npx vitest run --project integration lib/contactos/copia-empresa.int.test.ts` (con `npm run db:local -- up`).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ITCR = "hs-itcr";
const hs = vi.hoisted(() => ({
  contactos: [] as { id: string; email: string }[],
  tickets: [] as { id: string; asunto: string; contactos: string[] }[],
  correo: { id: "m1", contactos: [] as string[] },
}));

vi.mock("@/lib/hubspot/client", async (original) => ({
  ...(await original<typeof import("@/lib/hubspot/client")>()),
  getSystemHubspotClient: async () => ({ apiRequest: async () => ({ ok: false, status: 404, json: async () => ({}) }) }),
}));
vi.mock("@/lib/hubspot/duenos", () => ({ leerDuenos: async () => ({ porOwner: new Map() }) }));
vi.mock("@/lib/hubspot/contactos-y-tickets", async (original) => ({
  ...(await original<typeof import("@/lib/hubspot/contactos-y-tickets")>()),
  asociacionesDeEmpresas: async (_h: unknown, ids: readonly string[], hacia: string, desde = "companies") => {
    const porEmpresa = new Map<string, string[]>();
    for (const id of ids) {
      if (desde === "tickets") porEmpresa.set(id, hs.tickets.find((t) => t.id === id)?.contactos ?? []);
      else porEmpresa.set(id, id !== ITCR ? [] : hacia === "contacts" ? hs.contactos.map((c) => c.id) : hs.tickets.map((t) => t.id));
    }
    return { sinPermiso: false, porEmpresa, ilegibles: new Set(), truncadas: new Set() };
  },
  leerContactos: async (_h: unknown, ids: readonly string[]) => ({
    sinPermiso: false,
    fallo: false,
    contactos: hs.contactos
      .filter((c) => ids.includes(c.id))
      .map((c) => ({ id: c.id, nombre: c.email, email: c.email, cargo: null, ownerId: null, ultimoContacto: null, ultimaActividad: null, creado: null })),
  }),
  leerTickets: async (_h: unknown, ids: readonly string[]) => ({
    sinPermiso: false,
    fallo: false,
    tickets: hs.tickets
      .filter((t) => ids.includes(t.id))
      .map((t) => ({ id: t.id, asunto: t.asunto, pipeline: null, etapaId: null, prioridad: null, ownerId: null, creado: null, cerrado: null, modificado: null })),
  }),
  etapasDeTickets: async () => new Map(),
}));
vi.mock("@/lib/hubspot/comunicaciones", async (original) => ({
  ...(await original<typeof import("@/lib/hubspot/comunicaciones")>()),
  buscarModificadas: async () => ({ sinPermiso: false, completa: true, registros: [], ultimaModificacion: null }),
  asociacionesDe: async (_h: unknown, _tipo: string, ids: readonly string[]) => ({
    sinPermiso: false,
    porRegistro: new Map(ids.map((id) => [id, id === hs.correo.id ? hs.correo.contactos : []])),
    ilegibles: new Set(),
  }),
}));

import { prisma } from "@/lib/db/prisma";
import { copiarContactosYTickets } from "./copia-server";
import { copiarComunicaciones } from "@/lib/comunicaciones/copia-server";

async function elTec() {
  await prisma.sessionCategory.create({ data: { name: "Interna", slug: "interna", domains: ["smarteamcr.com"], kind: "internal" } });
  const tec = await prisma.client.create({ data: { name: "TEC", kind: "EMPRESA", emailDomains: ["itcr.test"], hubspotCompanyId: ITCR } });
  const tae = await prisma.client.create({ data: { name: "TEC · TAE", siglas: ["TAE"], comparteDominioConId: tec.id } });
  const ae = await prisma.client.create({ data: { name: "TEC · AE", siglas: ["AE"], comparteDominioConId: tec.id } });
  /* Ivania la confirmó el equipo en AE; el resto no da pista. */
  await prisma.personaDeLaEmpresa.create({ data: { clientId: ae.id, correo: "ivania@itcr.test", confirmadaAt: new Date(), confirmadaPorEmail: "eli@smarteamcr.com" } });
  hs.contactos = [
    { id: "c-ivania", email: "ivania@itcr.test" },
    { id: "c-nadie", email: "nadie@itcr.test" },
  ];
  hs.tickets = [
    { id: "t-siglas", asunto: "AE | Soporte", contactos: [] },
    { id: "t-gente", asunto: "Hola", contactos: ["c-ivania"] },
    { id: "t-nada", asunto: "Hola", contactos: [] },
  ];
  return { tec, tae, ae };
}

describe("la copia de contactos y tickets de una empresa con unidades", () => {
  it("cada fila va a su unidad, lo dudoso se queda en la empresa, y lo que estaba en la vieja principal se da de baja", async () => {
    const { tec, tae, ae } = await elTec();
    /* Antes de la empresa, TAE tenía a Ivania (que es de AE): como quedó al armar la empresa. */
    await prisma.contactoDeHubspot.create({ data: { clientId: tae.id, hubspotId: "c-ivania", nombre: "Ivania", email: "ivania@itcr.test" } });

    const r = await copiarContactosYTickets();
    expect(r.errores).toEqual([]);
    const contacto = async (clientId: string, hubspotId: string) =>
      (await prisma.contactoDeHubspot.findUnique({ where: { clientId_hubspotId: { clientId, hubspotId } } }))?.vigente ?? null;
    expect(await contacto(ae.id, "c-ivania")).toBe(true);
    expect(await contacto(tae.id, "c-ivania")).toBe(false);
    expect(await contacto(tec.id, "c-nadie")).toBe(true);

    const ticket = async (hubspotId: string) => (await prisma.ticketDeHubspot.findFirst({ where: { hubspotId, vigente: true } }))?.clientId;
    expect(await ticket("t-siglas")).toBe(ae.id);
    expect(await ticket("t-gente")).toBe(ae.id);
    expect(await ticket("t-nada")).toBe(tec.id);
  });
});

describe("la copia de correos y notas de una empresa con unidades", () => {
  it("lo que ya estaba copiado se vuelve a repartir en cada corrida, aunque en HubSpot no haya cambiado", async () => {
    const { tae, ae } = await elTec();
    await copiarContactosYTickets();
    /* Un correo del instituto que quedó en TAE (la vieja principal), con Ivania como contacto en HubSpot. */
    await prisma.comunicacionDeHubspot.create({
      data: { clientId: tae.id, tipo: "correo", hubspotId: hs.correo.id, ocurrioAt: new Date(Date.now() - 5 * 86_400_000), asunto: "Re: reporte", deEmail: "heiver@smarteamcr.com", huella: "x" },
    });
    hs.correo.contactos = ["c-ivania"];

    const r = await copiarComunicaciones();
    expect(r.errores).toEqual([]);
    expect(r.reubicadasEnUnidades).toBe(1);
    expect((await prisma.comunicacionDeHubspot.findUniqueOrThrow({ where: { tipo_hubspotId: { tipo: "correo", hubspotId: hs.correo.id } } })).clientId).toBe(ae.id);

    /* La siguiente corrida no lo vuelve a mover. */
    expect((await copiarComunicaciones()).reubicadasEnUnidades).toBe(0);
  });
});
