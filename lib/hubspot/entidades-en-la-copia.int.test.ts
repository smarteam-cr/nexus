/**
 * lib/hubspot/entidades-en-la-copia.int.test.ts — LA COPIA DE PROYECTOS DE DOS FICHAS QUE COMPARTEN EMPRESA, de punta a punta.
 *
 * Correr: `npx vitest run --project integration lib/hubspot/entidades-en-la-copia.int.test.ts` (con `npm run db:local -- up`).
 *
 * Corre `syncProjectsForClient` de verdad contra la base y un HubSpot simulado: la empresa del ITCR trae los proyectos de
 * las dos entidades, y AE no tiene empresa propia. La prueba pura (entidades-en-la-copia.test.ts) fija la
 * decisión; esta prueba lo que la decisión deja vivo: la reconciliación, la reactivación y el ida y vuelta de cada ficha.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { syncProjectsForClient } from "./sync-projects";

const ITCR = "59180429929";
const P_AE = "524044741203";
const P_TAE = "539887413831";

interface Mundo {
  /** Los proyectos asociados a la empresa del ITCR. */
  asociados: string[];
  /** Los proyectos que existen en HubSpot, con sus propiedades. */
  existen: Map<string, Record<string, string | null>>;
  /** Un 429 en toda lectura de propiedades: el último recurso arma los proyectos con `properties: {}`. */
  lecturaCaida: boolean;
}

const mundo: Mundo = { asociados: [], existen: new Map(), lecturaCaida: false };

const respuesta = (status: number, cuerpo: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => cuerpo,
  text: async () => JSON.stringify(cuerpo),
});

async function hubspot({ method, path, body }: { method: string; path: string; body?: { inputs?: { id: string }[] } }) {
  const asociacion = path.match(/^\/crm\/v4\/objects\/companies\/(\d+)\/associations\//);
  if (asociacion) {
    const ids = asociacion[1] === ITCR ? mundo.asociados : [];
    return respuesta(200, { results: ids.map((id) => ({ toObjectId: Number(id) })) });
  }
  if (path.includes("/owners/")) {
    const id = path.split("/owners/")[1]!.split("?")[0]!;
    return respuesta(200, { id, email: `${id}@smarteamcr.com`, firstName: id, lastName: "" });
  }
  if (method === "POST" && path.endsWith("/batch/read")) {
    if (mundo.lecturaCaida) return respuesta(429, { status: "error" });
    const results = (body?.inputs ?? []).flatMap(({ id }) => {
      const properties = mundo.existen.get(id);
      return properties ? [{ id, properties }] : [];
    });
    return respuesta(200, { results });
  }
  if (method === "POST" && path.endsWith("/search")) return respuesta(mundo.lecturaCaida ? 429 : 200, {});
  const objeto = path.match(/^\/crm\/v3\/objects\/[^/]+\/(\d+)/);
  if (objeto && method === "GET") {
    if (mundo.lecturaCaida) return respuesta(429, { status: "error" });
    const properties = mundo.existen.get(objeto[1]!);
    return properties ? respuesta(200, { id: objeto[1], properties }) : respuesta(404, {});
  }
  return respuesta(404, {});
}

vi.mock("./client", async (original) => ({
  ...(await original<typeof import("./client")>()),
  getSystemHubspotClient: async () => ({ apiRequest: hubspot }),
}));

/* El piso de 60 s de `syncProjectsForClient` (es por proceso): cada corrida de la prueba pasa un rato después. */
let ahora = Date.now();
const correr = (clientId: string) => {
  ahora += 5 * 60_000;
  return syncProjectsForClient(clientId, { force: true });
};

async function elTec() {
  const tae = await prisma.client.create({ data: { name: "TEC · TAE", hubspotCompanyId: ITCR, emailDomains: ["itcr.ac.cr"], siglas: ["TAE"] } });
  const ae = await prisma.client.create({
    data: { name: "TEC · AE", hubspotCompanyId: null, emailDomains: [], siglas: ["AE"], comparteDominioConId: tae.id },
  });
  await prisma.project.create({ data: { clientId: ae.id, name: "AE | HUBSPOT", hubspotServiceId: P_AE, status: "active", hubspotOwnerEmail: "heiver@smarteamcr.com" } });
  await prisma.project.create({ data: { clientId: tae.id, name: "TEC TAE | CRM", hubspotServiceId: P_TAE, status: "active", hubspotOwnerEmail: "heiver@smarteamcr.com" } });
  mundo.asociados = [P_AE, P_TAE];
  mundo.existen = new Map([
    [P_AE, { nombre_del_proyecto: "AE | HUBSPOT", hubspot_owner_id: "111" }],
    [P_TAE, { nombre_del_proyecto: "TEC TAE | CRM", hubspot_owner_id: "222" }],
  ]);
  mundo.lecturaCaida = false;
  return { tae, ae };
}

const proyecto = (hubspotServiceId: string) => prisma.project.findUnique({ where: { hubspotServiceId } });

describe("la copia de proyectos de dos fichas que comparten empresa", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockImplementation(() => ahora);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("cada ficha copia solo lo suyo, y la entidad corre sin error aunque no tenga empresa propia", async () => {
    const { tae, ae } = await elTec();

    const deTae = await correr(tae.id);
    expect(deTae.errors).toEqual([]);
    expect((await proyecto(P_TAE))?.hubspotOwnerEmail).toBe("222@smarteamcr.com");
    expect((await proyecto(P_AE))?.hubspotOwnerEmail).toBe("heiver@smarteamcr.com"); // la dueña no le escribe a la entidad

    const deAe = await correr(ae.id);
    expect(deAe.errors).toEqual([]);
    expect((await proyecto(P_AE))?.hubspotOwnerEmail).toBe("111@smarteamcr.com");
    expect((await proyecto(P_AE))?.clientId).toBe(ae.id);
    expect((await proyecto(P_TAE))?.clientId).toBe(tae.id);
  });

  it("RECONCILIACIÓN: un proyecto de la entidad borrado en HubSpot se da de baja en la corrida de la entidad", async () => {
    const { tae, ae } = await elTec();
    mundo.asociados = [P_TAE];
    mundo.existen.delete(P_AE);

    await correr(tae.id);
    expect((await proyecto(P_AE))?.status).toBe("active"); // la dueña no reconcilia lo que no es suyo

    const r = await correr(ae.id);
    expect(r.errors).toEqual([]);
    expect((await proyecto(P_AE))?.status).toBe("inactive");
    expect((await proyecto(P_TAE))?.status).toBe("active");
  });

  it("RECONCILIACIÓN: uno que ya no viene en la empresa pero sigue vivo en HubSpot se conserva", async () => {
    const { ae } = await elTec();
    mundo.asociados = [P_TAE];
    await correr(ae.id);
    expect((await proyecto(P_AE))?.status).toBe("active");
  });

  it("REACTIVACIÓN: un proyecto de la entidad apagado vuelve en la corrida de la entidad, no en la de la dueña", async () => {
    const { tae, ae } = await elTec();
    await prisma.project.update({ where: { hubspotServiceId: P_AE }, data: { status: "inactive" } });

    await correr(tae.id);
    expect((await proyecto(P_AE))?.status).toBe("inactive");

    await correr(ae.id);
    expect((await proyecto(P_AE))?.status).toBe("active");
  });

  it("un fallo de HubSpot en la corrida de la dueña no apaga el proyecto de la entidad", async () => {
    const { tae, ae } = await elTec();
    mundo.lecturaCaida = true;
    await correr(tae.id);
    expect((await proyecto(P_AE))?.status).toBe("active");
    expect((await proyecto(P_TAE))?.status).toBe("inactive"); // el suyo sí: la regla del fantasma de siempre

    /* Y si le pasa a la entidad con el suyo, la corrida siguiente lo recupera. */
    await correr(ae.id);
    expect((await proyecto(P_AE))?.status).toBe("inactive");
    mundo.lecturaCaida = false;
    await correr(ae.id);
    expect((await proyecto(P_AE))?.status).toBe("active");
  });

  it("un proyecto nuevo del instituto nace en la dueña, nunca en la entidad", async () => {
    const { tae, ae } = await elTec();
    const NUEVO = "600000000001";
    mundo.asociados.push(NUEVO);
    mundo.existen.set(NUEVO, { nombre_del_proyecto: "Otro proyecto del TEC" });

    await correr(ae.id);
    expect(await proyecto(NUEVO)).toBeNull();

    await correr(tae.id);
    expect((await proyecto(NUEVO))?.clientId).toBe(tae.id);
  });

  it("un proyecto borrado a mano en la entidad no renace en la dueña", async () => {
    const { tae, ae } = await elTec();
    await prisma.project.delete({ where: { hubspotServiceId: P_AE } });
    await prisma.client.update({ where: { id: ae.id }, data: { ignoredHubspotServiceIds: [P_AE] } });

    await correr(tae.id);
    expect(await proyecto(P_AE)).toBeNull();
  });

  it("una ficha sin grupo reconcilia como siempre", async () => {
    const { tae } = await elTec();
    await prisma.client.update({ where: { id: (await proyecto(P_AE))!.clientId }, data: { comparteDominioConId: null } });
    mundo.asociados = [P_AE];
    mundo.existen.delete(P_TAE);
    await correr(tae.id);
    expect((await proyecto(P_TAE))?.status).toBe("inactive");
  });
});
