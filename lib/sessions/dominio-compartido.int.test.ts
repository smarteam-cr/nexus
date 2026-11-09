/**
 * lib/sessions/dominio-compartido.int.test.ts — DOS FICHAS QUE COMPARTEN DOMINIO, contra una base REAL.
 *
 * Correr: `npx vitest run --project integration lib/sessions/dominio-compartido.int.test.ts` (con `npm run db:local -- up`).
 *
 * La prueba pura (dominio-compartido.test.ts) fija la regla; esta prueba la cadena entera: la columna
 * `comparteDominioConId`, la gente que aprende `buildCategorizeCtx` de la base, la materialización de
 * `resolveAllSessions` y el chokepoint. El caso es el TEC (2026-10-29): «TEC · TAE» tiene el dominio y «TEC · AE» lo
 * comparte. Una reunión de AE no puede entrar al proyecto de TAE, y una sin pista no entra a ninguno.
 */
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { loadBcFeeding } from "@/lib/business-cases/feeding";
import { getClientSessions } from "./project-sources";
import { resolveAllSessions } from "./resolve-client";

async function elTec() {
  await prisma.sessionCategory.create({
    data: { name: "Interna", slug: "interna", kind: "internal", domains: ["smarteamcr.com"] },
  });
  const tae = await prisma.client.create({
    data: { name: "TEC · TAE", emailDomains: ["itcr.ac.cr"], siglas: ["TAE"], createdAt: new Date("2026-05-19T00:00:00Z") },
  });
  const ae = await prisma.client.create({
    data: { name: "TEC · AE", emailDomains: [], siglas: ["AE"], comparteDominioConId: tae.id, createdAt: new Date("2026-07-22T00:00:00Z") },
  });
  const reunion = (id: string, title: string, gente: string[], manualClientId: string | null = null) =>
    prisma.firefliesSession.create({
      data: {
        id,
        title,
        date: new Date("2026-10-01T15:00:00Z"),
        participants: ["hgomez@smarteamcr.com", ...gente],
        manualClientId,
        // Como hoy en producción: todas en la ficha más vieja.
        resolvedClientId: manualClientId ?? tae.id,
      },
    });
  await reunion("ae-nombre", "AE | Reportes de Ventas", ["ivania@itcr.ac.cr"]);
  await reunion("tae-nombre", "TEC TAE | RE-IMPLEMENTACIÓN CRM", ["marco@itcr.ac.cr"]);
  await reunion("ae-gente", "Kick Off | TEC & Smarteam", ["ivania@itcr.ac.cr"]);
  await reunion("tae-mano", "Soporte | TAE", ["otra@itcr.ac.cr"], tae.id);
  await reunion("tae-gente", "Workflows", ["otra@itcr.ac.cr"]);
  await reunion("duda", "Visita FUNDATEC", ["ivania@itcr.ac.cr", "marco@itcr.ac.cr"]);
  return { tae, ae };
}

describe("dos fichas que comparten dominio — DB real", () => {
  it("cada reunión va a su entidad, y la que no tiene pista queda sin dueño", async () => {
    const { tae, ae } = await elTec();

    const r = await resolveAllSessions({ reclassify: false });
    expect(r.changed).toBe(3); // ae-nombre y ae-gente a AE; duda a nadie

    const dueno = Object.fromEntries(
      (await prisma.firefliesSession.findMany({ select: { id: true, resolvedClientId: true } })).map((s) => [s.id, s.resolvedClientId]),
    );
    expect(dueno).toEqual({
      "ae-nombre": ae.id,
      "tae-nombre": tae.id,
      "ae-gente": ae.id,
      "tae-mano": tae.id,
      "tae-gente": tae.id, // a «otra» la conoce el título de la reunión asignada a mano
      duda: null,
    });

    /* El chokepoint: cada ficha ve solo lo suyo, y la que queda por decidir no alimenta a ninguna. */
    const deAe = (await getClientSessions(ae.id)).map((s) => s.id).sort();
    const deTae = (await getClientSessions(tae.id)).map((s) => s.id).sort();
    expect(deAe).toEqual(["ae-gente", "ae-nombre"]);
    expect(deTae).toEqual(["tae-gente", "tae-mano", "tae-nombre"]);

    /* Fresco: correrlo de nuevo no cambia nada (INV2). */
    expect((await resolveAllSessions({ dryRun: true })).changed).toBe(0);
  });

  it("una reunión por decidir no alimenta la propuesta de la dueña, y sin el grupo sí entra por dominio", async () => {
    const { tae, ae } = await elTec();
    await resolveAllSessions({ reclassify: false });
    const bc = await prisma.businessCase.create({ data: { clientId: tae.id, name: "Propuesta", slug: "prueba-tae", createdByEmail: "x@smarteamcr.com" } });
    const ids = async () => JSON.stringify(await loadBcFeeding(bc.id));
    expect(await ids()).not.toContain('"duda"');
    await prisma.client.update({ where: { id: ae.id }, data: { comparteDominioConId: null } });
    expect(await ids()).toContain('"duda"');
  });

  it("sin la marca, todo sigue en la ficha más vieja (como antes)", async () => {
    const { tae, ae } = await elTec();
    await prisma.client.update({ where: { id: ae.id }, data: { comparteDominioConId: null } });
    expect((await resolveAllSessions({ dryRun: true })).changed).toBe(0);
    expect((await getClientSessions(tae.id)).length).toBe(6);
  });

  it("CEMACO: una unidad con dominio propio la decide su dominio; la de gente de los dos países queda por decidir", async () => {
    await prisma.sessionCategory.create({ data: { name: "Interna", slug: "interna", kind: "internal", domains: ["smarteamcr.com"] } });
    const cr = await prisma.client.create({
      data: { name: "Cemaco · Costa Rica", emailDomains: ["cemaco.co.cr"], siglas: ["CR"], createdAt: new Date("2026-09-14T00:00:00Z") },
    });
    const ec = await prisma.client.create({
      data: { name: "Cemaco · Ecuador", emailDomains: ["sukasa.com", "comohogar.com"], siglas: ["EC"], comparteDominioConId: cr.id },
    });
    const reunion = (id: string, title: string, gente: string[]) =>
      prisma.firefliesSession.create({
        data: { id, title, date: new Date("2026-11-05T15:00:00Z"), participants: ["aortega@smarteamcr.com", ...gente], resolvedClientId: cr.id },
      });
    await reunion("cr-sales", "Cemaco | Sales Hub", ["jose@cemaco.co.cr"]);
    await reunion("ec-ti", "SUKASA + CEMACO + COMOHOGAR | TI", ["ana@sukasa.com"]);
    await reunion("dos-paises", "Platiquemos sobre HubSpot | SUKASA + CEMACO + COMOHOGAR", ["ana@sukasa.com", "jose@cemaco.co.cr"]);
    await reunion("interna-cr", "Cemaco CR | Handoff", []);

    await resolveAllSessions({ reclassify: false });

    const dueno = Object.fromEntries(
      (await prisma.firefliesSession.findMany({ select: { id: true, resolvedClientId: true } })).map((s) => [s.id, s.resolvedClientId]),
    );
    expect(dueno).toEqual({ "cr-sales": cr.id, "ec-ti": ec.id, "dos-paises": null, "interna-cr": cr.id });
    expect((await getClientSessions(ec.id)).map((s) => s.id)).toEqual(["ec-ti"]);
    expect((await resolveAllSessions({ dryRun: true })).changed).toBe(0);
  });
});
