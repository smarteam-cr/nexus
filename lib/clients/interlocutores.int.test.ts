/**
 * lib/clients/interlocutores.int.test.ts — «Unidades e interlocutores» (2026-11-25) contra la base `nexus_test`: lo que
 * guarda una persona del equipo, lo que la copia de cada hora no deshace y la reunión que cambia de dueña al confirmar.
 *
 * Correr solo este archivo: `npx vitest run --project integration lib/clients/interlocutores.int.test.ts`
 * (prerequisito: `npm run db:local -- up`).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/* Lo que el cambio de dueña dispara en segundo plano (reclasificar con IA, hechos, análisis de venta, lectura) seguiría
   corriendo después de cada caso y chocaría con el TRUNCATE del siguiente: aquí no se prueba, se apaga. */
vi.mock("@/lib/sessions/reclassify", () => ({ reclassifyClientSessions: async () => undefined }));
vi.mock("@/lib/seguimiento/hechos-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/seguimiento/hechos-server")>()),
  alCambiarDeDueno: async () => undefined,
}));
/* Cuántas veces se le pregunta a HubSpot (la base de pruebas no tiene cuenta: la respuesta real es «sin cuenta»). */
const hubspot = vi.hoisted(() => ({ llamadas: 0 }));
vi.mock("@/lib/hubspot/companies", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/hubspot/companies")>();
  return {
    ...real,
    searchCompaniesByDomains: (...a: Parameters<typeof real.searchCompaniesByDomains>) => {
      hubspot.llamadas++;
      return real.searchCompaniesByDomains(...a);
    },
  };
});
vi.mock("@/lib/analizador-venta/ajenos", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analizador-venta/ajenos")>()),
  soltarAnalisisDeVentaAjenos: async () => 0,
}));

import { prisma } from "@/lib/db/prisma";
import { copiarPersonasDeLaEmpresa, guardarInterlocutor, interlocutoresDeLaEmpresa } from "./personas-de-la-empresa-server";
import { reResolverReunionesDe, resolveAllSessions } from "@/lib/sessions/resolve-client";

/* Sin «(test)» en el nombre: un cliente de prueba no cuenta en el título (categorize.ts › isTestClient). */
async function elTec() {
  await prisma.sessionCategory.create({ data: { name: "Interna", slug: "interna", domains: ["smarteamcr.com"], kind: "internal" } });
  const tae = await prisma.client.create({ data: { name: "TEC · TAE", emailDomains: ["itcr.test"], siglas: ["TAE"], createdAt: new Date("2026-01-01") } });
  const ae = await prisma.client.create({ data: { name: "TEC · AE", siglas: ["AE"], comparteDominioConId: tae.id, createdAt: new Date("2026-02-01") } });
  return { tae, ae };
}

describe("una persona del equipo confirma con qué ficha trabaja alguien", () => {
  it("crea la fila en la unidad, la vista la junta con la de la copia, y la copia no la da de baja", async () => {
    const { tae, ae } = await elTec();
    // La copia la tiene en TAE (el dominio es de la principal).
    await prisma.personaDeLaEmpresa.create({ data: { clientId: tae.id, correo: "cindy@itcr.test", nombre: "Cindy", origenes: ["reunion"], reuniones: 4 } });

    const r = await guardarInterlocutor({
      tocables: [tae.id, ae.id],
      cambio: { correo: "Cindy@itcr.test", rol: "champion", confirmadaEn: [ae.id] },
      porEmail: "eli@smarteamcr.com",
    });
    expect(r.confirmadaEn).toEqual([ae.id]);
    const enAe = await prisma.personaDeLaEmpresa.findUniqueOrThrow({ where: { clientId_correo: { clientId: ae.id, correo: "cindy@itcr.test" } } });
    expect(enAe).toMatchObject({ nombre: "Cindy", rol: "champion", origenes: ["equipo"], confirmadaPorEmail: "eli@smarteamcr.com" });
    expect(enAe.confirmadaAt).not.toBeNull();

    const vista = await interlocutoresDeLaEmpresa(ae.id);
    expect(vista.fichas.map((f) => f.id)).toEqual([tae.id, ae.id]);
    expect(vista.personas).toEqual([expect.objectContaining({ correo: "cindy@itcr.test", confirmadaEn: [ae.id], vistaEn: [tae.id], rol: "champion" })]);

    // La copia de AE no la trae de ninguna fuente (AE no tiene dominio ni contactos): igual sigue vigente.
    await copiarPersonasDeLaEmpresa(ae.id, { apply: true });
    expect((await prisma.personaDeLaEmpresa.findUniqueOrThrow({ where: { id: enAe.id } })).vigente).toBe(true);

    // Una ficha que no se puede tocar no se escribe.
    await expect(
      guardarInterlocutor({ tocables: [ae.id], cambio: { correo: "cindy@itcr.test", confirmadaEn: [tae.id] }, porEmail: "eli@smarteamcr.com" }),
    ).rejects.toThrow(/no se puede tocar/);
  });

  it("confirmarla mueve la reunión que estaba por decidir; el simulacro no escribe y lo asignado a mano no se mueve", async () => {
    const { tae, ae } = await elTec();
    await prisma.firefliesSession.createMany({
      data: [
        { id: "s-1", title: "Revisión semanal de leads", date: new Date("2026-11-20T15:00:00Z"), participants: ["cindy@itcr.test", "pedro@itcr.test", "heiver@smarteamcr.com"] },
        { id: "s-2", title: "Revisión semanal de leads", date: new Date("2026-11-21T15:00:00Z"), participants: ["cindy@itcr.test"], manualClientId: tae.id },
      ],
    });
    await resolveAllSessions({ reclassify: false });
    expect((await prisma.firefliesSession.findUniqueOrThrow({ where: { id: "s-1" } })).resolvedClientId).toBeNull();

    const { cambian: simulado } = await reResolverReunionesDe(["cindy@itcr.test"], { hipotesis: new Map([["cindy@itcr.test", [ae.id]]]), aplicar: false });
    expect(simulado.map((c) => [c.sessionId, c.de, c.a])).toEqual([["s-1", null, ae.id]]);
    expect((await prisma.firefliesSession.findUniqueOrThrow({ where: { id: "s-1" } })).resolvedClientId).toBeNull();

    await guardarInterlocutor({ tocables: [tae.id, ae.id], cambio: { correo: "cindy@itcr.test", confirmadaEn: [ae.id] }, porEmail: "eli@smarteamcr.com" });
    const { cambian: movidas } = await reResolverReunionesDe(["cindy@itcr.test"], { aplicar: true });
    expect(movidas.map((c) => c.sessionId)).toEqual(["s-1"]);
    expect((await prisma.firefliesSession.findUniqueOrThrow({ where: { id: "s-1" } })).resolvedClientId).toBe(ae.id);
    expect((await prisma.firefliesSession.findUniqueOrThrow({ where: { id: "s-2" } })).resolvedClientId).toBe(tae.id);

    // Y la materialización entera da lo mismo (INV2): nada queda distinto de lo que diría el resolver.
    expect((await resolveAllSessions({ dryRun: true })).changed).toBe(0);
  });

  it("al cambiar de dueña se sueltan los vínculos a proyectos de la otra ficha; por decidir, esperan; y se mueve solo lo aprobado", async () => {
    const { tae, ae } = await elTec();
    const deTae = await prisma.project.create({ data: { clientId: tae.id, name: "TAE | CRM (test)" } });
    const deAe = await prisma.project.create({ data: { clientId: ae.id, name: "AE | Smartloop (test)" } });
    await prisma.firefliesSession.createMany({
      data: [
        // Hoy de TAE por el título; con Cindy confirmada en AE sigue de TAE (el título manda): no cambia.
        { id: "s-t", title: "TAE | Soporte", date: new Date("2026-11-19T15:00:00Z"), participants: ["cindy@itcr.test"] },
        // Hoy de TAE (Nexus aprendió a Cindy en TAE por «TAE | Soporte»); confirmada en AE, pasa a AE y pierde el vínculo con
        // el proyecto de TAE: lo confirmado vale más que lo aprendido.
        { id: "s-a", title: "Revisión semanal", date: new Date("2026-11-20T15:00:00Z"), participants: ["cindy@itcr.test", "pedro@itcr.test"] },
        // Con Cindy (AE) y Marco (TAE) confirmados y sin título: queda por decidir y su vínculo espera.
        { id: "s-d", title: "Revisión semanal", date: new Date("2026-11-21T15:00:00Z"), participants: ["cindy@itcr.test", "marco@itcr.test"] },
      ],
    });
    await resolveAllSessions({ reclassify: false });
    // Una persona dejó «s-d» en TAE antes, a mano en el vínculo (no en la dueña), y la IA vinculó «s-a» a TAE.
    await prisma.sessionProject.createMany({
      data: [
        { sessionId: "s-a", projectId: deTae.id, isPrimary: true, source: "agent" },
        { sessionId: "s-a", projectId: deAe.id, isPrimary: false, source: "agent" },
        { sessionId: "s-d", projectId: deTae.id, isPrimary: true, source: "manual" },
      ],
    });
    await prisma.firefliesSession.update({ where: { id: "s-d" }, data: { resolvedClientId: tae.id } });

    await guardarInterlocutor({ tocables: [tae.id, ae.id], cambio: { correo: "marco@itcr.test", confirmadaEn: [tae.id] }, porEmail: "eli@smarteamcr.com" });
    await guardarInterlocutor({ tocables: [tae.id, ae.id], cambio: { correo: "cindy@itcr.test", confirmadaEn: [ae.id] }, porEmail: "eli@smarteamcr.com" });

    // Aprobada solo «s-a»: «s-d» (que ahora daría por decidir) no se mueve aunque el resolver lo diga.
    const r = await reResolverReunionesDe(["cindy@itcr.test"], { aplicar: true, aprobadas: new Map([["s-a", { de: tae.id, a: ae.id }]]) });
    expect(r.cambian.map((c) => c.sessionId)).toEqual(["s-a"]);
    expect(r.saltadas.map((c) => [c.sessionId, c.a])).toEqual([["s-d", null]]);
    const dueña = async (id: string) => (await prisma.firefliesSession.findUniqueOrThrow({ where: { id } })).resolvedClientId;
    expect(await dueña("s-a")).toBe(ae.id);
    expect(await dueña("s-d")).toBe(tae.id);
    expect(await dueña("s-t")).toBe(tae.id);
    const vinculos = async (id: string) => (await prisma.sessionProject.findMany({ where: { sessionId: id }, select: { projectId: true } })).map((v) => v.projectId);
    expect(await vinculos("s-a")).toEqual([deAe.id]);

    // Sin aprobadas: «s-d» queda por decidir y su vínculo (puesto por una persona) espera a quien la asigne.
    await reResolverReunionesDe(["cindy@itcr.test"], { aplicar: true });
    expect(await dueña("s-d")).toBeNull();
    expect(await vinculos("s-d")).toEqual([deTae.id]);
  });

  it("el escritor rechaza a alguien del equipo, un correo de una categoría y la ficha de Smarteam", async () => {
    const { tae } = await elTec();
    await prisma.sessionCategory.create({ data: { name: "HubSpot", slug: "hubspot", domains: ["hubspot.test"], kind: "partner" } });
    const casa = await prisma.client.create({ data: { name: "Smarteam (test)", emailDomains: ["smarteamcr.com"] } });
    const guardar = (correo: string, fichas: string[]) =>
      guardarInterlocutor({ tocables: fichas, cambio: { correo, confirmadaEn: fichas }, porEmail: "eli@smarteamcr.com" });
    await expect(guardar("heiver@smarteamcr.com", [tae.id])).rejects.toThrow(/equipo de Smarteam/);
    await expect(guardar("rep@hubspot.test", [tae.id])).rejects.toThrow(/categoría/);
    await expect(guardar("ana@cliente.test", [casa.id])).rejects.toThrow(/ficha de Smarteam/);
    expect(await prisma.personaDeLaEmpresa.count()).toBe(0);
  });

  it("quitar una confirmación siempre se puede, aunque el dominio de la persona haya pasado a ser una categoría", async () => {
    const { tae } = await elTec();
    await guardarInterlocutor({ tocables: [tae.id], cambio: { correo: "rep@partner.test", confirmadaEn: [tae.id] }, porEmail: "eli@smarteamcr.com" });
    await prisma.sessionCategory.create({ data: { name: "Partner", slug: "partner", domains: ["partner.test"], kind: "partner" } });
    await expect(guardarInterlocutor({ tocables: [tae.id], cambio: { correo: "rep@partner.test", confirmadaEn: [] }, porEmail: "eli@smarteamcr.com" })).resolves.toEqual({
      confirmadaEn: [],
    });
    // Volver a sumarla, no.
    await expect(guardarInterlocutor({ tocables: [tae.id], cambio: { correo: "rep@partner.test", confirmadaEn: [tae.id] }, porEmail: "eli@smarteamcr.com" })).rejects.toThrow(/categoría/);
  });
});

describe("un cambio de las fichas (una sigla, un dominio) en el simulacro de la precarga (revisión del 26 nov)", () => {
  /* Dos unidades sin palabra en común: la sigla sola cuenta como pista del título. */
  async function unaEmpresa() {
    await prisma.sessionCategory.create({ data: { name: "Interna", slug: "interna", domains: ["smarteamcr.com"], kind: "internal" } });
    const corvalia = await prisma.client.create({ data: { name: "Corvalia", emailDomains: ["corvalia.test"], createdAt: new Date("2026-01-01") } });
    const ternesto = await prisma.client.create({ data: { name: "Ternesto", comparteDominioConId: corvalia.id, createdAt: new Date("2026-02-01") } });
    const conXyz = <T extends { id: string; siglas?: string[] | null; emailDomains: string[] }>(clients: readonly T[]): T[] =>
      clients.map((c) => (c.id === ternesto.id ? ({ ...c, siglas: [...(c.siglas ?? []), "XYZ"] } as T) : c));
    await prisma.firefliesSession.createMany({
      data: [
        // Interna, sin nadie de afuera: solo la sigla nueva del título la lleva a Ternesto.
        { id: "s-int", title: "Demo interna XYZ", date: new Date("2026-11-18T15:00:00Z"), participants: ["heiver@smarteamcr.com"] },
        // La que enseña: con la sigla, Nexus aprende que Ana es de Ternesto.
        { id: "s-k", title: "XYZ kickoff", date: new Date("2026-11-19T15:00:00Z"), participants: ["ana@corvalia.test", "heiver@smarteamcr.com"] },
        // Sin pista en el título: decide lo aprendido de Ana.
        { id: "s-seg", title: "Seguimiento semanal", date: new Date("2026-11-20T15:00:00Z"), participants: ["ana@corvalia.test"] },
      ],
    });
    await resolveAllSessions({ reclassify: false });
    return { ternesto, conXyz };
  }
  const resumen = (r: { cambian: { sessionId: string; a: string | null }[] }) => r.cambian.map((c) => [c.sessionId, c.a]).sort();

  it("con «todas» se mira también la reunión interna que no tiene a nadie del mapa; sin «todas», no", async () => {
    const { ternesto, conXyz } = await unaEmpresa();
    const todas = await reResolverReunionesDe([], { aplicar: false, ajustarFichas: conXyz, todas: true });
    expect(resumen(todas)).toContainEqual(["s-int", ternesto.id]);
    expect((await reResolverReunionesDe([], { aplicar: false, ajustarFichas: conXyz })).cambian).toEqual([]);
  });

  it("el simulacro en memoria da lo mismo que la base con la sigla escrita (lo aprendido de los títulos incluido)", async () => {
    const { ternesto, conXyz } = await unaEmpresa();
    const simulado = await reResolverReunionesDe([], { aplicar: false, ajustarFichas: conXyz, todas: true });
    await prisma.client.update({ where: { id: ternesto.id }, data: { siglas: ["XYZ"] } });
    const escrito = await reResolverReunionesDe([], { aplicar: false, todas: true });
    expect(resumen(simulado)).toEqual(resumen(escrito));
    // Y el caso que lo prueba de verdad está adentro: la que decide lo aprendido con la sigla nueva.
    expect(resumen(escrito)).toContainEqual(["s-seg", ternesto.id]);
  });
});

describe("la mudanza con lo aprobado (revisión del 26 nov)", () => {
  it("una aprobada que ya está en su ficha nueva (la movió la app) suelta igual sus vínculos a la ficha vieja", async () => {
    const { tae, ae } = await elTec();
    const deTae = await prisma.project.create({ data: { clientId: tae.id, name: "TAE | CRM (test)" } });
    await prisma.firefliesSession.create({
      data: { id: "s-1", title: "Revisión semanal de leads", date: new Date("2026-11-20T15:00:00Z"), participants: ["cindy@itcr.test", "pedro@itcr.test"] },
    });
    await guardarInterlocutor({ tocables: [tae.id, ae.id], cambio: { correo: "cindy@itcr.test", confirmadaEn: [ae.id] }, porEmail: "eli@smarteamcr.com" });
    // La app ya la movió a AE, pero el vínculo de la IA a TAE quedó.
    await prisma.firefliesSession.update({ where: { id: "s-1" }, data: { resolvedClientId: ae.id } });
    await prisma.sessionProject.create({ data: { sessionId: "s-1", projectId: deTae.id, isPrimary: true, source: "agent" } });

    const r = await reResolverReunionesDe(["cindy@itcr.test"], { aplicar: true, aprobadas: new Map([["s-1", { de: null, a: ae.id }]]) });
    expect(r.cambian).toEqual([]);
    expect(await prisma.sessionProject.count({ where: { sessionId: "s-1" } })).toBe(0);
  });

  it("con el mapa de HubSpot del simulacro no se le vuelve a preguntar a HubSpot", async () => {
    const { tae, ae } = await elTec();
    await prisma.firefliesSession.create({
      data: { id: "s-1", title: "Revisión semanal de leads", date: new Date("2026-11-20T15:00:00Z"), participants: ["cindy@itcr.test", "pedro@itcr.test"] },
    });
    await resolveAllSessions({ reclassify: false });
    const simulado = await reResolverReunionesDe(["cindy@itcr.test"], { hipotesis: new Map([["cindy@itcr.test", [ae.id]]]), aplicar: false, exigirHubspot: true });
    await guardarInterlocutor({ tocables: [tae.id, ae.id], cambio: { correo: "cindy@itcr.test", confirmadaEn: [ae.id] }, porEmail: "eli@smarteamcr.com" });
    expect(hubspot.llamadas).toBeGreaterThan(0); // el simulacro sí preguntó
    const antes = hubspot.llamadas;
    const r = await reResolverReunionesDe(["cindy@itcr.test"], {
      aplicar: true,
      aprobadas: new Map(simulado.cambian.map((c) => [c.sessionId, { de: c.de, a: c.a }])),
      hubspot: simulado.hubspot,
      esperarLoQueCuelga: true,
    });
    expect(r.cambian.map((c) => c.sessionId)).toEqual(["s-1"]);
    expect(hubspot.llamadas).toBe(antes);
  });
});
