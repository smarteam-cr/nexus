/**
 * lib/clients/empresa-arriba.int.test.ts — LA EMPRESA ARRIBA DE SUS UNIDADES contra la base `nexus_test` (2026-11-26).
 *
 * Correr solo este archivo: `npx vitest run --project integration lib/clients/empresa-arriba.int.test.ts`
 * (prerequisito: `npm run db:local -- up`). DECISIONS «La empresa arriba de sus unidades».
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/sessions/reclassify", () => ({ reclassifyClientSessions: async () => undefined }));
vi.mock("@/lib/seguimiento/hechos-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/seguimiento/hechos-server")>()),
  alCambiarDeDueno: async () => 0,
}));
vi.mock("@/lib/analizador-venta/ajenos", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analizador-venta/ajenos")>()),
  soltarAnalisisDeVentaAjenos: async () => 0,
}));

import { prisma } from "@/lib/db/prisma";
import { resolveAllSessions } from "@/lib/sessions/resolve-client";
import { getProjectHandoffSessions } from "@/lib/sessions/project-sources";
import { cargarRepartoDeEmpresas } from "@/lib/sessions/reparto-de-la-empresa-server";
import { guardarUnidad, simularUnidad, vistaDeLasUnidades, RechazoDeUnidad } from "./unidades-server";
import { rechazoSiLaFichaEsEmpresa } from "./empresa-server";
import { motivoParaNoGuardar } from "./personas-de-la-empresa-server";
import { createCuenta, CobranzaError } from "@/lib/cobranza/mutations";
import { clientesQueNoAbre } from "@/lib/auth/access";

/* Sin «(test)» en el nombre: un cliente de prueba no cuenta en el título (categorize.ts › isTestClient). */
async function elTec() {
  await prisma.sessionCategory.create({ data: { name: "Interna", slug: "interna", domains: ["smarteamcr.com"], kind: "internal" } });
  const tec = await prisma.client.create({
    data: { name: "TEC", kind: "EMPRESA", emailDomains: ["itcr.test"], hubspotCompanyId: "hs-itcr", createdAt: new Date("2026-11-26") },
  });
  const tae = await prisma.client.create({ data: { name: "TEC · TAE", siglas: ["TAE"], comparteDominioConId: tec.id, createdAt: new Date("2026-01-01") } });
  const ae = await prisma.client.create({ data: { name: "TEC · AE", siglas: ["AE"], comparteDominioConId: tec.id, createdAt: new Date("2026-02-01") } });
  const yo = await prisma.teamMember.create({ data: { name: "Eli", email: "eli@smarteamcr.com", roleEnum: "SUPER_ADMIN" } });
  return { tec, tae, ae, yo };
}

const sesion = (id: string, title: string, dia: number, gente = ["ana@itcr.test"]) => ({
  id,
  title,
  date: new Date(`2026-11-${String(dia).padStart(2, "0")}T15:00:00Z`),
  participants: [...gente, "heiver@smarteamcr.com"],
});

describe("las reuniones de una empresa con su ficha arriba", () => {
  it("van a la unidad que dice el título o la gente; sin pista, por decidir; nunca a la empresa", async () => {
    const { tec, tae, ae } = await elTec();
    await prisma.firefliesSession.createMany({
      data: [
        sesion("s-tae", "TAE | Seguimiento", 10),
        sesion("s-ae", "AE | Reportes", 11, ["ivania@itcr.test"]),
        sesion("s-gente", "Revisión semanal", 12, ["ivania@itcr.test"]),
        sesion("s-nadie", "Reunión", 13, ["nuevo@itcr.test"]),
        sesion("s-mano", "Reunión", 14, ["otro@itcr.test"]),
      ],
    });
    /* Asignada a mano a la empresa (ninguna pantalla lo ofrece): igual no es de ella. */
    await prisma.firefliesSession.update({ where: { id: "s-mano" }, data: { manualClientId: tec.id } });
    await resolveAllSessions({ reclassify: false });
    const dueno = async (id: string) => (await prisma.firefliesSession.findUniqueOrThrow({ where: { id } })).resolvedClientId;
    expect(await dueno("s-tae")).toBe(tae.id);
    expect(await dueno("s-ae")).toBe(ae.id);
    expect(await dueno("s-gente")).toBe(ae.id);
    expect(await dueno("s-nadie")).toBeNull();
    expect(await dueno("s-mano")).toBeNull();
    expect(await prisma.firefliesSession.count({ where: { resolvedClientId: tec.id } })).toBe(0);
  });

  it("un proyecto que quedó en la empresa no ve reuniones de sus unidades (invariante 1)", async () => {
    const { tec, ae } = await elTec();
    const p = await prisma.project.create({ data: { clientId: tec.id, name: "Proyecto Y", status: "active" } });
    await prisma.firefliesSession.create({ data: sesion("s-ae", "AE | Reportes", 11) });
    await resolveAllSessions({ reclassify: false });
    expect((await prisma.firefliesSession.findUniqueOrThrow({ where: { id: "s-ae" } })).resolvedClientId).toBe(ae.id);
    /* Aunque alguien lo vincule, el chokepoint no deja pasar una reunión de otra ficha. */
    await prisma.sessionProject.create({ data: { sessionId: "s-ae", projectId: p.id, isPrimary: true, source: "manual", confidence: 1 } });
    expect((await getProjectHandoffSessions(p.id)).sessions).toHaveLength(0);
  });
});

describe("lo de HubSpot de la empresa", () => {
  it("el reparto manda cada fila a su unidad, y lo dudoso se queda en la empresa", async () => {
    const { tec, tae, ae } = await elTec();
    await prisma.firefliesSession.createMany({ data: [sesion("s-ae", "AE | Reportes", 11, ["ivania@itcr.test"]), sesion("s-tae", "TAE | Reportes", 12, ["marco@itcr.test"])] });
    const r = await cargarRepartoDeEmpresas();
    expect(r.esEmpresa(tec.id)).toBe(true);
    expect(r.destino(tec.id, { titulo: null, correos: ["ivania@itcr.test"] })).toBe(ae.id);
    expect(r.destino(tec.id, { titulo: "Re: soporte", correos: ["marco@itcr.test"] })).toBe(tae.id);
    expect(r.destino(tec.id, { titulo: "IA AGENT | WA - TEC AE", correos: [] })).toBe(ae.id);
    expect(r.destino(tec.id, { titulo: "Hola", correos: ["nuevo@itcr.test"] })).toBe(tec.id);
  });
});

describe("la página de la empresa", () => {
  it("la empresa va primero, con lo que espera unidad; un proyecto suyo pasa a una unidad con la vista previa", async () => {
    const { tec, ae, yo } = await elTec();
    const p = await prisma.project.create({ data: { clientId: tec.id, name: "Proyecto Y", status: "active" } });
    await prisma.contactoDeHubspot.create({ data: { clientId: tec.id, hubspotId: "c1", nombre: "Nadie", email: "nadie@itcr.test" } });

    const vista = await vistaDeLasUnidades(tec.id, yo.id);
    expect(vista.empresa).toBe("TEC");
    expect(vista.fichas[0]).toMatchObject({ id: tec.id, esEmpresa: true, principal: true, enEspera: { contactos: 1, correos: 0, tickets: 0, negocios: 0 } });
    expect(vista.fichas[0]!.proyectos.map((x) => x.nombre)).toEqual(["Proyecto Y"]);
    expect(vista.fichas.slice(1).map((f) => [f.nombre, f.esEmpresa, f.comparteDominio])).toEqual([
      ["TEC · TAE", false, true],
      ["TEC · AE", false, true],
    ]);

    const pedido = { fichaId: ae.id, siglas: ["AE"], dominios: [], proyectos: [p.id] };
    const previa = await simularUnidad(tec.id, pedido, yo.id);
    expect(previa.listo).toBe(true);
    const hecho = await guardarUnidad(tec.id, { ...pedido, huella: previa.huella }, { teamMemberId: yo.id, email: yo.email });
    expect(hecho.proyectos).toBe(1);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: p.id } })).clientId).toBe(ae.id);
  });

  it("una unidad nueva que cuelga de la empresa es un cliente, no otra empresa", async () => {
    const { tec, yo } = await elTec();
    const pedido = { nombre: "TEC · VIE", siglas: ["VIE"], dominios: [] };
    const previa = await simularUnidad(tec.id, pedido, yo.id);
    const hecho = await guardarUnidad(tec.id, { ...pedido, huella: previa.huella }, { teamMemberId: yo.id, email: yo.email });
    expect(await prisma.client.findUniqueOrThrow({ where: { id: hecho.fichaId } })).toMatchObject({ kind: "CLIENTE", comparteDominioConId: tec.id });
  });

  it("la empresa no lleva siglas, y a una unidad solo le pasan proyectos de la empresa", async () => {
    const { tec, tae, ae, yo } = await elTec();
    const p = await prisma.project.create({ data: { clientId: tae.id, name: "TAE | CRM", status: "active" } });
    const e1 = await simularUnidad(tec.id, { fichaId: tec.id, siglas: ["TEC"], dominios: ["itcr.test"] }, yo.id).catch((x) => x);
    expect(e1).toBeInstanceOf(RechazoDeUnidad);
    const e2 = await simularUnidad(tec.id, { fichaId: ae.id, siglas: ["AE"], dominios: [], proyectos: [p.id] }, yo.id).catch((x) => x);
    expect(e2).toBeInstanceOf(RechazoDeUnidad);
  });
});

describe("pasar proyectos a una unidad que ya existe", () => {
  it("solo desde la empresa arriba: con una principal de antes, se rechaza con su motivo", async () => {
    await prisma.sessionCategory.create({ data: { name: "Interna", slug: "interna", domains: ["smarteamcr.com"], kind: "internal" } });
    const tae = await prisma.client.create({ data: { name: "TEC · TAE", emailDomains: ["itcr.test"], siglas: ["TAE"] } });
    const ae = await prisma.client.create({ data: { name: "TEC · AE", siglas: ["AE"], comparteDominioConId: tae.id } });
    const yo = await prisma.teamMember.create({ data: { name: "Eli", email: "eli@smarteamcr.com", roleEnum: "SUPER_ADMIN" } });
    const p = await prisma.project.create({ data: { clientId: tae.id, name: "TAE | CRM", status: "active" } });
    const e = await simularUnidad(tae.id, { fichaId: ae.id, siglas: ["AE"], dominios: [], proyectos: [p.id] }, yo.id).catch((x) => x);
    expect(e).toBeInstanceOf(RechazoDeUnidad);
    expect((e as Error).message).toMatch(/de la empresa a una de sus unidades/);
  });

  it("a una reunión no se le puede elegir la empresa en la vista previa", async () => {
    const { tec, ae, yo } = await elTec();
    await prisma.firefliesSession.create({ data: sesion("s-nadie", "Reunión", 13, ["nuevo@itcr.test"]) });
    await resolveAllSessions({ reclassify: false });
    const previa = await simularUnidad(tec.id, { fichaId: ae.id, siglas: ["AE", "XX"], dominios: [], asignar: { "s-nadie": tec.id } }, yo.id);
    expect(previa.filas.find((f) => f.sessionId === "s-nadie")?.final ?? null).not.toBe(tec.id);
  });
});

describe("quién abre la empresa", () => {
  it("quien abre alguna de sus unidades abre la empresa; las demás unidades, no", async () => {
    const { tec, tae, ae } = await elTec();
    const cse = await prisma.teamMember.create({ data: { name: "Hei", email: "hei@smarteamcr.com", roleEnum: "CSE" } });
    await prisma.project.create({ data: { clientId: ae.id, name: "AE | CRM", status: "active", hubspotOwnerEmail: cse.email, hubspotPipelineId: "0" } });
    const noAbre = await clientesQueNoAbre(cse.id, [tec.id, tae.id, ae.id]);
    expect(noAbre.has(ae.id)).toBe(false);
    expect(noAbre.has(tec.id)).toBe(false);
    expect(noAbre.has(tae.id)).toBe(true);
  });
});

describe("a la empresa no se le crea trabajo", () => {
  it("la guarda responde 409 y la cuenta de cobro no nace", async () => {
    const { tec, tae } = await elTec();
    expect(await rechazoSiLaFichaEsEmpresa(tec.id)).toMatchObject({ status: 409 });
    expect(await rechazoSiLaFichaEsEmpresa(tae.id)).toBeNull();
    const e = await createCuenta({ clientId: tec.id } as Parameters<typeof createCuenta>[0]).catch((x) => x);
    expect(e).toBeInstanceOf(CobranzaError);
    expect(await prisma.cuentaFinanciera.count()).toBe(0);
  });

  it("el escritor único del dueño a mano no deja asignarle una reunión a la empresa", async () => {
    const { tec, tae } = await elTec();
    await prisma.firefliesSession.create({ data: sesion("s-x", "Reunión", 13) });
    const { asignarDuenioManual } = await import("@/lib/sessions/duenio-manual");
    await expect(asignarDuenioManual("s-x", tec.id, { origen: "humano", actorEmail: "eli@smarteamcr.com" })).rejects.toThrow(/unidad/);
    await expect(asignarDuenioManual("s-x", tae.id, { origen: "humano", actorEmail: "eli@smarteamcr.com" })).resolves.toBe(true);
  });

  it("en la empresa no se confirma a nadie: la gente es de una unidad", async () => {
    const { tec, tae } = await elTec();
    expect(await motivoParaNoGuardar({ correo: "ana@itcr.test", fichas: [tec.id] })).toMatch(/unidad/);
    expect(await motivoParaNoGuardar({ correo: "ana@itcr.test", fichas: [tae.id] })).toBeNull();
  });
});
