/**
 * lib/clients/crear-empresa.int.test.ts — armar la empresa arriba de sus unidades y deshacerla, contra `nexus_test`
 * (2026-11-26). Lo que escribe scripts/crear-empresa-de-unidades.ts con `--apply` y `--deshacer --apply`.
 *
 * Correr: `npx vitest run --project integration lib/clients/crear-empresa.int.test.ts` (con `npm run db:local -- up`).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const yo = vi.hoisted(() => ({ teamMember: { id: "", email: "", roleEnum: "CSE" } }));
vi.mock("@/lib/auth/supabase", async (original) => ({
  ...(await original<typeof import("@/lib/auth/supabase")>()),
  requireInternalUser: async () => ({ user: { id: "u" }, teamMember: yo.teamMember, role: yo.teamMember.roleEnum }),
}));

import { prisma } from "@/lib/db/prisma";
import { planDeLaEmpresa, type FichaParaLaEmpresa } from "./crear-empresa";
import { aplicarLaEmpresa, deshacerLaEmpresa } from "./crear-empresa-server";
import { rechazoDeEscrituraEnLaEmpresa } from "./empresa-server";

const SELECT = { id: true, name: true, kind: true, company: true, emailDomains: true, hubspotCompanyId: true, comparteDominioConId: true } as const;

async function elTecDeAntes() {
  const tae = await prisma.client.create({ data: { name: "TEC · TAE", company: "itcr.test", emailDomains: ["itcr.test"], hubspotCompanyId: "hs-itcr", siglas: ["TAE"] } });
  const ae = await prisma.client.create({ data: { name: "TEC · AE", siglas: ["AE"], comparteDominioConId: tae.id } });
  return { tae, ae };
}

async function armar(tae: string, ae: string) {
  const fichas = (await prisma.client.findMany({ select: SELECT })) as FichaParaLaEmpresa[];
  const r = planDeLaEmpresa({ clave: "tec", nombre: "TEC", unidades: [tae, ae], desde: tae, dominiosCompartidos: ["itcr.test"], empresaDeHubspot: "hs-itcr" }, fichas);
  if (!r.ok) throw new Error(r.errores.join(" "));
  return aplicarLaEmpresa(r.plan);
}

describe("armar la empresa", () => {
  it("la empresa se lleva el dominio, el company que es dominio y la empresa de HubSpot; las dos unidades le cuelgan", async () => {
    const { tae, ae } = await elTecDeAntes();
    const tec = await armar(tae.id, ae.id);
    expect(await prisma.client.findUniqueOrThrow({ where: { id: tec }, select: SELECT })).toMatchObject({ kind: "EMPRESA", emailDomains: ["itcr.test"], company: "itcr.test", hubspotCompanyId: "hs-itcr" });
    expect(await prisma.client.findUniqueOrThrow({ where: { id: tae.id }, select: SELECT })).toMatchObject({ emailDomains: [], company: null, hubspotCompanyId: null, comparteDominioConId: tec });
    expect((await prisma.client.findUniqueOrThrow({ where: { id: ae.id } })).comparteDominioConId).toBe(tec);
  });
});

describe("deshacer la empresa", () => {
  it("todo vuelve a la vieja principal, aunque un contacto haya quedado en la empresa y en una unidad", async () => {
    const { tae, ae } = await elTecDeAntes();
    const tec = await armar(tae.id, ae.id);
    /* El caso de la revisión: esperó en la empresa (dado de baja) y después se confirmó en AE. */
    await prisma.contactoDeHubspot.create({ data: { clientId: tec, hubspotId: "c1", nombre: "Ivania", email: "ivania@itcr.test", vigente: false } });
    await prisma.contactoDeHubspot.create({ data: { clientId: ae.id, hubspotId: "c1", nombre: "Ivania", email: "ivania@itcr.test" } });
    await prisma.contactoDeHubspot.create({ data: { clientId: tae.id, hubspotId: "c2", nombre: "Marco", email: "marco@itcr.test", vigente: false } });
    await prisma.contactoDeHubspot.create({ data: { clientId: tec, hubspotId: "c2", nombre: "Marco", email: "marco@itcr.test" } });
    const p = await prisma.project.create({ data: { clientId: tec, name: "Proyecto Y", status: "active" } });

    const vuelve = await deshacerLaEmpresa({ empresaId: tec, principal: tae.id, unidades: [tae.id, ae.id] });
    expect(vuelve).toMatchObject({ proyectos: 1, contactos: 2 });
    const contactos = await prisma.contactoDeHubspot.findMany({ orderBy: { hubspotId: "asc" }, select: { clientId: true, hubspotId: true, vigente: true } });
    expect(contactos).toEqual([
      { clientId: tae.id, hubspotId: "c1", vigente: true },
      { clientId: tae.id, hubspotId: "c2", vigente: true },
    ]);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: p.id } })).clientId).toBe(tae.id);
    expect(await prisma.client.findUnique({ where: { id: tec } })).toBeNull();
    expect(await prisma.client.findUniqueOrThrow({ where: { id: tae.id }, select: SELECT })).toMatchObject({ emailDomains: ["itcr.test"], company: "itcr.test", hubspotCompanyId: "hs-itcr", comparteDominioConId: null });
    expect((await prisma.client.findUniqueOrThrow({ where: { id: ae.id } })).comparteDominioConId).toBe(tae.id);
  });

  it("una empresa que solo agrupa (sin vieja principal): las unidades vuelven a no colgar de nadie", async () => {
    const g = await prisma.client.create({ data: { name: "Grupo Teamnet", kind: "EMPRESA" } });
    const t = await prisma.client.create({ data: { name: "Teamnet", emailDomains: ["teamnet.test"], comparteDominioConId: g.id } });
    const s = await prisma.client.create({ data: { name: "Stratosphere", emailDomains: ["strato.test"], comparteDominioConId: g.id } });
    await deshacerLaEmpresa({ empresaId: g.id, principal: null, unidades: [t.id, s.id] });
    expect((await prisma.client.findMany({ where: { id: { in: [t.id, s.id] } } })).map((c) => c.comparteDominioConId)).toEqual([null, null]);
  });
});

describe("cambiar la empresa desde su ficha", () => {
  it("solo el Super Admin o quien abre TODAS sus unidades", async () => {
    const { tae, ae } = await elTecDeAntes();
    const tec = await armar(tae.id, ae.id);
    const cse = await prisma.teamMember.create({ data: { name: "Hei", email: "hei@smarteamcr.com", roleEnum: "CSE" } });
    await prisma.project.create({ data: { clientId: ae.id, name: "AE | CRM", status: "active", hubspotOwnerEmail: cse.email } });
    yo.teamMember = { id: cse.id, email: cse.email, roleEnum: "CSE" };
    expect(await rechazoDeEscrituraEnLaEmpresa(tec)).toMatchObject({ status: 403 });
    expect(await rechazoDeEscrituraEnLaEmpresa(ae.id)).toBeNull();
    await prisma.project.create({ data: { clientId: tae.id, name: "TAE | CRM", status: "active", hubspotOwnerEmail: cse.email } });
    expect(await rechazoDeEscrituraEnLaEmpresa(tec)).toBeNull();
    yo.teamMember = { id: "sa", email: "eli@smarteamcr.com", roleEnum: "SUPER_ADMIN" };
    expect(await rechazoDeEscrituraEnLaEmpresa(tec)).toBeNull();
  });
});
