/**
 * lib/clients/interlocutores-ruta.int.test.ts — la RUTA de «Unidades e interlocutores» (PUT /api/clients/[id]/interlocutores)
 * contra `nexus_test`, con el acceso y HubSpot simulados (revisiones del 25 nov): la huella del aviso, el 403 por una ficha
 * que no se abre (hoy y en las reuniones que vienen) y el 503 cuando HubSpot no responde en el control de acceso.
 *
 * Correr solo este archivo: `npx vitest run --project integration lib/clients/interlocutores-ruta.int.test.ts`
 * (prerequisito: `npm run db:local -- up`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/* Lo que el cambio de dueña dispara en segundo plano (reclasificar con IA, hechos, análisis de venta, lectura) seguiría
   corriendo después de cada caso y chocaría con el TRUNCATE del siguiente: aquí no se prueba, se apaga. */
vi.mock("@/lib/sessions/reclassify", () => ({ reclassifyClientSessions: async () => undefined }));
vi.mock("@/lib/seguimiento/hechos-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/seguimiento/hechos-server")>()),
  alCambiarDeDueno: async () => undefined,
}));
vi.mock("@/lib/analizador-venta/ajenos", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analizador-venta/ajenos")>()),
  soltarAnalisisDeVentaAjenos: async () => 0,
}));

/* Quién pide y qué fichas NO abre. */
const acceso = vi.hoisted(() => ({
  noAbre: new Set<string>(),
  hubspotCaido: false,
  hubspotSinCuenta: false,
  /* Lo que devuelve HubSpot en cada llamada (por número de llamada); sin nada, vacío. */
  hubspot: null as null | ((llamada: number) => Map<string, { id: string; name: string; domain: string }>),
  llamadas: 0,
}));
vi.mock("@/lib/auth/api-guards", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/auth/api-guards")>();
  const { NextResponse } = await import("next/server");
  return {
    ...real,
    guardAccessToClient: async (id: string) =>
      acceso.noAbre.has(id) ? NextResponse.json({ error: "sin acceso" }, { status: 403 }) : { user: { email: "eli@smarteamcr.com", teamMember: { id: "tm-eli" } } },
  };
});
vi.mock("@/lib/auth/access", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/auth/access")>();
  return {
    ...real,
    clientesQueNoAbre: async (_tm: string, ids: readonly string[]) => new Set(ids.filter((x) => acceso.noAbre.has(x))),
    accessibleClientWhere: async () => null,
  };
});
vi.mock("@/lib/hubspot/companies", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/hubspot/companies")>();
  return {
    ...real,
    searchCompaniesByDomains: async (_d: string[], o?: { lanzar?: boolean }) => {
      acceso.llamadas += 1;
      if (acceso.hubspotSinCuenta) throw new Error("No hay cuenta HubSpot del sistema configurada");
      if (acceso.hubspotCaido && o?.lanzar) throw new Error("HubSpot 503");
      return acceso.hubspot ? acceso.hubspot(acceso.llamadas) : new Map();
    },
  };
});

import { prisma } from "@/lib/db/prisma";
import { PUT } from "@/app/api/clients/[id]/interlocutores/route";
import { resolveAllSessions } from "@/lib/sessions/resolve-client";

const put = async (id: string, body: unknown) => {
  const r = await PUT(new Request("http://localhost/x", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) as never, {
    params: Promise.resolve({ id }),
  });
  return { status: r.status, d: (await r.json()) as Record<string, unknown> };
};
const confirmadas = async (correo: string) =>
  (await prisma.personaDeLaEmpresa.findMany({ where: { correo, confirmadaAt: { not: null } }, select: { clientId: true } })).map((f) => f.clientId);

/* Sin «(test)» en el nombre: un cliente de prueba no cuenta en el título (categorize.ts › isTestClient). */
async function mundo() {
  await prisma.sessionCategory.create({ data: { name: "Interna", slug: "interna", domains: ["smarteamcr.com"], kind: "internal" } });
  const tae = await prisma.client.create({ data: { name: "TEC · TAE", emailDomains: ["itcr.test"], siglas: ["TAE"], createdAt: new Date("2026-01-01") } });
  const ae = await prisma.client.create({ data: { name: "TEC · AE", siglas: ["AE"], comparteDominioConId: tae.id, createdAt: new Date("2026-02-01") } });
  const bravo = await prisma.client.create({ data: { name: "Bravo Logistica", emailDomains: ["bravo.test"], createdAt: new Date("2026-03-01") } });
  return { tae, ae, bravo };
}

beforeEach(() => {
  acceso.noAbre = new Set();
  acceso.hubspotCaido = false;
  acceso.hubspotSinCuenta = false;
  acceso.hubspot = null;
  acceso.llamadas = 0;
});

describe("la ruta guarda solo lo que mostró el aviso", () => {
  it("simular no escribe; guardar con la huella del aviso mueve; con otra huella responde 409 y no escribe nada", async () => {
    const { ae } = await mundo();
    await prisma.firefliesSession.create({
      data: { id: "s-1", title: "Revisión semanal", date: new Date("2026-11-20T15:00:00Z"), participants: ["cindy@itcr.test", "pedro@itcr.test"] },
    });
    await resolveAllSessions({ reclassify: false });

    const aviso = await put(ae.id, { correo: "cindy@itcr.test", confirmadaEn: [ae.id], simular: true });
    expect(aviso).toMatchObject({ status: 200, d: { reuniones: 1, movidas: [{ de: "Sin ficha", a: "TEC · AE", reuniones: 1 }] } });
    expect(await confirmadas("cindy@itcr.test")).toEqual([]);

    const otra = await put(ae.id, { correo: "cindy@itcr.test", confirmadaEn: [ae.id], huella: "otra" });
    expect(otra).toMatchObject({ status: 409, d: { avisoNuevo: true } });
    expect(await confirmadas("cindy@itcr.test")).toEqual([]);

    const ok = await put(ae.id, { correo: "cindy@itcr.test", confirmadaEn: [ae.id], huella: aviso.d.huella });
    expect(ok).toMatchObject({ status: 200, d: { reuniones: 1 } });
    expect(await confirmadas("cindy@itcr.test")).toEqual([ae.id]);
    expect((await prisma.firefliesSession.findUniqueOrThrow({ where: { id: "s-1" } })).resolvedClientId).toBe(ae.id);
  });
});

describe("la ruta pide acceso a cada ficha que pierde o gana reuniones, hoy o en las que vienen", () => {
  it("una reunión de una ficha que no abres: 403 en el aviso y al guardar, sin escribir", async () => {
    const { ae, bravo } = await mundo();
    await prisma.firefliesSession.create({
      data: { id: "s-b", title: "Weekly", date: new Date("2026-11-20T15:00:00Z"), participants: ["ana@bravo.test"] },
    });
    await resolveAllSessions({ reclassify: false });
    acceso.noAbre = new Set([bravo.id]);
    expect((await put(ae.id, { correo: "ana@bravo.test", confirmadaEn: [ae.id], simular: true })).status).toBe(403);
    expect((await put(ae.id, { correo: "ana@bravo.test", confirmadaEn: [ae.id], huella: "x" })).status).toBe(403);
    expect(await confirmadas("ana@bravo.test")).toEqual([]);
  });

  it("alguien del dominio de una ficha que no abres, sin reuniones todavía: 403 (sus reuniones futuras)", async () => {
    const { ae, bravo } = await mundo();
    acceso.noAbre = new Set([bravo.id]);
    const r = await put(ae.id, { correo: "nueva@bravo.test", confirmadaEn: [ae.id], simular: true });
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.d)).not.toMatch(/Bravo/);
  });

  it("alguien que Nexus aprendió en AE (por títulos «AE |»): confirmarlo en TAE pide AE", async () => {
    const { tae, ae } = await mundo();
    await prisma.firefliesSession.create({
      data: { id: "s-ae", title: "AE | Reportes", date: new Date("2026-11-18T15:00:00Z"), participants: ["cesar@yahoo.test", "x@itcr.test"] },
    });
    await resolveAllSessions({ reclassify: false });
    acceso.noAbre = new Set([ae.id]);
    expect((await put(tae.id, { correo: "cesar@yahoo.test", confirmadaEn: [tae.id], simular: true })).status).toBe(403);
    acceso.noAbre = new Set();
    expect((await put(tae.id, { correo: "cesar@yahoo.test", confirmadaEn: [tae.id], simular: true })).status).toBe(200);
  });
});

describe("la ruta falla cerrado si HubSpot no responde en el control de acceso", () => {
  it("un dominio sin ficha registrada: 503 y no escribe; un correo genérico no le pregunta a HubSpot", async () => {
    const { ae } = await mundo();
    acceso.hubspotCaido = true;
    const r = await put(ae.id, { correo: "jefe@sin-registrar.test", confirmadaEn: [ae.id], simular: true });
    expect(r.status).toBe(503);
    expect((await put(ae.id, { correo: "alguien@gmail.com", confirmadaEn: [ae.id], simular: true })).status).toBe(200);
  });
});

describe("si la cuenta cambia DESPUÉS de escribir, se deshace la persona tal cual y no se mueve nada", () => {
  it("409, la reunión sigue con su dueña y la persona queda idéntica (sin filas nuevas)", async () => {
    await mundo();
    const charlie = await prisma.client.create({ data: { name: "Charlie Seguros", hubspotCompanyId: "hs-c", createdAt: new Date("2026-04-01") } });
    const ae = (await prisma.client.findFirstOrThrow({ where: { name: "TEC · AE" } })).id;
    const conCharlie = new Map([["hs.test", { id: "hs-c", name: "Charlie", domain: "hs.test" }]]);
    await prisma.firefliesSession.create({
      data: { id: "s-h", title: "Weekly", date: new Date("2026-11-20T15:00:00Z"), participants: ["p@x.test", "jefe@hs.test"] },
    });
    acceso.hubspot = () => conCharlie;
    await resolveAllSessions({ reclassify: false });
    expect((await prisma.firefliesSession.findUniqueOrThrow({ where: { id: "s-h" } })).resolvedClientId).toBe(charlie.id);

    const aviso = await put(ae, { correo: "p@x.test", confirmadaEn: [ae], rol: "decide", simular: true });
    expect(aviso).toMatchObject({ status: 200, d: { reuniones: 1 } });

    // Al guardar: las dos primeras llamadas (el aviso de adentro y el dominio) ven a Charlie; la recuenta de después de
    // escribir ya no (HubSpot cambió en ese instante).
    acceso.llamadas = 0;
    acceso.hubspot = (n) => (n <= 2 ? conCharlie : new Map());
    const r = await put(ae, { correo: "p@x.test", confirmadaEn: [ae], rol: "decide", huella: aviso.d.huella });
    expect(r).toMatchObject({ status: 409, d: { avisoNuevo: true } });
    expect(acceso.llamadas).toBeGreaterThanOrEqual(3);
    expect((await prisma.firefliesSession.findUniqueOrThrow({ where: { id: "s-h" } })).resolvedClientId).toBe(charlie.id);
    expect(await prisma.personaDeLaEmpresa.count({ where: { correo: "p@x.test" } })).toBe(0);
  });

  it("una persona que ya estaba vuelve EXACTAMENTE como estaba (quién la confirmó, cuándo y su rol)", async () => {
    const { tae, ae } = await mundo();
    const charlie = await prisma.client.create({ data: { name: "Charlie Seguros", hubspotCompanyId: "hs-c", createdAt: new Date("2026-04-01") } });
    void charlie;
    const conCharlie = new Map([["hs.test", { id: "hs-c", name: "Charlie", domain: "hs.test" }]]);
    const antes = new Date("2026-11-01T12:00:00Z");
    await prisma.personaDeLaEmpresa.create({
      data: { clientId: tae.id, correo: "p@itcr.test", nombre: "Pe", rol: "decide", rolFuente: "persona", rolAt: antes, origenes: ["reunion"], confirmadaAt: antes, confirmadaPorEmail: "maria@smarteamcr.com" },
    });
    await prisma.firefliesSession.create({
      data: { id: "s-h2", title: "Weekly", date: new Date("2026-11-20T15:00:00Z"), participants: ["p@itcr.test", "jefe@hs.test"] },
    });
    acceso.hubspot = () => conCharlie;
    await resolveAllSessions({ reclassify: false });
    const aviso = await put(ae.id, { correo: "p@itcr.test", confirmadaEn: [ae.id], rol: "champion", simular: true });
    acceso.llamadas = 0;
    acceso.hubspot = (n) => (n <= 1 ? conCharlie : new Map());
    const r = await put(ae.id, { correo: "p@itcr.test", confirmadaEn: [ae.id], rol: "champion", huella: aviso.d.huella });
    expect(r.status).toBe(409);
    const filas = await prisma.personaDeLaEmpresa.findMany({ where: { correo: "p@itcr.test" } });
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ clientId: tae.id, rol: "decide", confirmadaPorEmail: "maria@smarteamcr.com", confirmadaAt: antes, origenes: ["reunion"] });
  });
});

describe("sin cuenta de HubSpot conectada (la base local), el control no lo pide", () => {
  it("un dominio sin ficha se confirma igual: el resolver tampoco tiene el paso de HubSpot", async () => {
    const { ae } = await mundo();
    acceso.hubspotSinCuenta = true;
    expect((await put(ae.id, { correo: "jefe@sin-registrar.test", confirmadaEn: [ae.id], simular: true })).status).toBe(200);
  });
});
