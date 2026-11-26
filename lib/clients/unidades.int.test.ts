/**
 * lib/clients/unidades.int.test.ts — «Unidades de negocio» (2026-11-26) contra la base `nexus_test`: agregar una unidad
 * con la vista previa, lo que se protege, lo que frena el guardado y el proyecto que pasa con lo suyo.
 *
 * Correr solo este archivo: `npx vitest run --project integration lib/clients/unidades.int.test.ts`
 * (prerequisito: `npm run db:local -- up`).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
/* Lo que el cambio de dueña dispara en segundo plano chocaría con el TRUNCATE del caso siguiente: aquí se apaga. */
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
import { guardarUnidad, RechazoDeUnidad, simularUnidad, vistaDeLasUnidades } from "./unidades-server";

/* Sin «(test)» en el nombre: un cliente de prueba no cuenta en el título (categorize.ts › isTestClient). */
async function elTec() {
  await prisma.sessionCategory.create({ data: { name: "Interna", slug: "interna", domains: ["smarteamcr.com"], kind: "internal" } });
  const tae = await prisma.client.create({ data: { name: "TEC · TAE", emailDomains: ["itcr.test"], siglas: ["TAE"], createdAt: new Date("2026-01-01") } });
  const ae = await prisma.client.create({ data: { name: "TEC · AE", siglas: ["AE"], comparteDominioConId: tae.id, createdAt: new Date("2026-02-01") } });
  const yo = await prisma.teamMember.create({ data: { name: "Eli", email: "eli@smarteamcr.com", roleEnum: "SUPER_ADMIN" } });
  return { tae, ae, yo };
}

const sesion = (id: string, title: string, dia: number) => ({
  id,
  title,
  date: new Date(`2026-11-${String(dia).padStart(2, "0")}T15:00:00Z`),
  participants: ["ana@itcr.test", "heiver@smarteamcr.com"],
});

describe("agregar una unidad", () => {
  it("la vista previa no escribe; guardar crea la unidad y mueve solo lo que se vio", async () => {
    const { tae, ae, yo } = await elTec();
    await prisma.firefliesSession.createMany({
      data: [sesion("s-vie", "VIE | Kickoff", 10), sesion("s-tae", "TAE | Seguimiento", 11), sesion("s-mano", "VIE | Revisión", 12)],
    });
    await prisma.firefliesSession.update({ where: { id: "s-mano" }, data: { manualClientId: tae.id } });
    await resolveAllSessions({ reclassify: false });
    /* Ana va a «TAE | Seguimiento»: Nexus la aprende de TAE y la reunión sin sigla de unidad va a TAE por la gente. */
    expect((await prisma.firefliesSession.findUniqueOrThrow({ where: { id: "s-vie" } })).resolvedClientId).toBe(tae.id);

    const pedido = { nombre: "TEC · VIE", siglas: ["vie"], dominios: [] };
    const previa = await simularUnidad(tae.id, pedido, yo.id);
    expect(previa.ficha).toEqual({ nombre: "TEC · VIE", siglas: ["VIE"], dominios: [] });
    expect(previa.filas.map((f) => [f.sessionId, f.como, f.final])).toEqual([["s-vie", "se-mueve", "unidad-nueva"]]);
    expect(await prisma.client.count()).toBe(2);

    const hecho = await guardarUnidad(tae.id, { ...pedido, huella: previa.huella }, { teamMemberId: yo.id, email: yo.email });
    expect(hecho.movidas).toBe(1);
    const vie = await prisma.client.findUniqueOrThrow({ where: { id: hecho.fichaId } });
    expect(vie).toMatchObject({ name: "TEC · VIE", siglas: ["VIE"], emailDomains: [], comparteDominioConId: tae.id, source: "manual" });
    expect((await prisma.firefliesSession.findUniqueOrThrow({ where: { id: "s-vie" } })).resolvedClientId).toBe(vie.id);
    expect((await prisma.firefliesSession.findUniqueOrThrow({ where: { id: "s-mano" } })).resolvedClientId).toBe(tae.id);

    const vista = await vistaDeLasUnidades(ae.id, yo.id);
    expect(vista.tipo).toBe("unidades");
    expect(vista.empresa).toBe("TEC");
    expect(vista.fichas.map((f) => [f.nombre, f.principal, f.esEsta, f.comparteDominio])).toEqual([
      ["TEC · TAE", true, false, false],
      ["TEC · AE", false, true, true],
      ["TEC · VIE", false, false, true],
    ]);
  });

  it("si la cuenta cambió desde la vista previa, no deja la unidad creada y pide revisar", async () => {
    const { tae, yo } = await elTec();
    await prisma.firefliesSession.create({ data: sesion("s-vie", "VIE | Kickoff", 10) });
    await resolveAllSessions({ reclassify: false });
    const pedido = { nombre: "TEC · VIE", siglas: ["VIE"], dominios: [] };
    const previa = await simularUnidad(tae.id, pedido, yo.id);
    // Llega otra reunión que la unidad nueva se llevaría.
    await prisma.firefliesSession.create({ data: sesion("s-nueva", "VIE | Demo", 14) });

    const e = await guardarUnidad(tae.id, { ...pedido, huella: previa.huella }, { teamMemberId: yo.id, email: yo.email }).catch((x) => x);
    expect(e).toBeInstanceOf(RechazoDeUnidad);
    expect((e as RechazoDeUnidad).status).toBe(409);
    expect(await prisma.client.count({ where: { name: "TEC · VIE" } })).toBe(0);
  });

  it("una reunión que quedaría por decidir con un vínculo de una persona frena el guardado hasta elegir su ficha", async () => {
    const { tae, yo } = await elTec();
    const crm = await prisma.project.create({ data: { name: "TAE | CRM", clientId: tae.id } });
    await prisma.firefliesSession.create({ data: sesion("s-dos", "TAE VIE | Diagnóstico", 10) });
    await resolveAllSessions({ reclassify: false });
    expect((await prisma.firefliesSession.findUniqueOrThrow({ where: { id: "s-dos" } })).resolvedClientId).toBe(tae.id);
    await prisma.sessionProject.create({ data: { sessionId: "s-dos", projectId: crm.id, isPrimary: true, source: "manual", diagnosisOverride: true } });

    const pedido = { nombre: "TEC · VIE", siglas: ["VIE"], dominios: [] };
    const previa = await simularUnidad(tae.id, pedido, yo.id);
    expect(previa.filas).toEqual([
      expect.objectContaining({ sessionId: "s-dos", como: "falta-elegir", a: null, elegidaPara: ["Diagnóstico de TAE | CRM"] }),
    ]);
    expect(previa.listo).toBe(false);
    await expect(guardarUnidad(tae.id, { ...pedido, huella: previa.huella }, { teamMemberId: yo.id, email: yo.email })).rejects.toThrow(/elige la ficha/);
    expect(await prisma.client.count({ where: { name: "TEC · VIE" } })).toBe(0);

    // Con su ficha elegida (se queda en TAE), se guarda: la reunión queda asignada a mano y conserva su vínculo.
    const conFicha = { ...pedido, asignar: { "s-dos": tae.id } };
    const previa2 = await simularUnidad(tae.id, conFicha, yo.id);
    expect(previa2.listo).toBe(true);
    const hecho = await guardarUnidad(tae.id, { ...conFicha, huella: previa2.huella }, { teamMemberId: yo.id, email: yo.email });
    expect(hecho.fijadas).toBe(1);
    const s = await prisma.firefliesSession.findUniqueOrThrow({ where: { id: "s-dos" } });
    expect(s).toMatchObject({ manualClientId: tae.id, resolvedClientId: tae.id, manualClientSource: "humano", manualClientBy: yo.email });
    expect(await prisma.sessionProject.count({ where: { sessionId: "s-dos", projectId: crm.id } })).toBe(1);
  });

  it("un proyecto marcado pasa a la unidad con sus reuniones y lo que cuelga de él; sin marcar, se queda", async () => {
    const { tae, yo } = await elTec();
    const vieCrm = await prisma.project.create({ data: { name: "VIE | CRM", clientId: tae.id } });
    const otro = await prisma.project.create({ data: { name: "TAE | Portal", clientId: tae.id } });
    await prisma.firefliesSession.create({ data: sesion("s-vie", "VIE | Kickoff", 10) });
    await prisma.firefliesSession.create({ data: sesion("s-tae", "TAE | Seguimiento", 11) });
    await resolveAllSessions({ reclassify: false });
    await prisma.firefliesSession.update({ where: { id: "s-vie" }, data: { resolvedClientId: tae.id } });
    await prisma.sessionProject.createMany({
      data: [
        { sessionId: "s-vie", projectId: vieCrm.id, isPrimary: true },
        // Un vínculo secundario que puso Nexus, de una reunión que se queda en TAE: se suelta.
        { sessionId: "s-tae", projectId: vieCrm.id, isPrimary: false },
        { sessionId: "s-tae", projectId: otro.id, isPrimary: true },
      ],
    });
    await prisma.actionItem.create({ data: { text: "Mandar la propuesta", clientId: tae.id, projectId: vieCrm.id } });

    const pedido = { nombre: "TEC · VIE", siglas: ["VIE"], dominios: [], proyectos: [vieCrm.id] };
    const previa = await simularUnidad(tae.id, pedido, yo.id);
    expect(previa.proyectos).toEqual([{ id: vieCrm.id, nombre: "VIE | CRM", frenadoPor: [] }]);
    expect(previa.sueltan).toBe(1);
    expect(previa.conLosProyectos).toEqual({ ActionItem: 1 });

    const hecho = await guardarUnidad(tae.id, { ...pedido, huella: previa.huella }, { teamMemberId: yo.id, email: yo.email });
    expect(hecho.proyectos).toBe(1);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: vieCrm.id } })).clientId).toBe(hecho.fichaId);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: otro.id } })).clientId).toBe(tae.id);
    expect((await prisma.actionItem.findFirstOrThrow()).clientId).toBe(hecho.fichaId);
    expect((await prisma.firefliesSession.findUniqueOrThrow({ where: { id: "s-vie" } })).resolvedClientId).toBe(hecho.fichaId);
    expect(await prisma.sessionProject.count({ where: { sessionId: "s-vie", projectId: vieCrm.id } })).toBe(1);
    expect(await prisma.sessionProject.count({ where: { sessionId: "s-tae", projectId: vieCrm.id } })).toBe(0);
    // Invariante 1: ningún vínculo cruza de ficha.
    const cruzados = await prisma.sessionProject.findMany({ include: { session: true, project: true } });
    expect(cruzados.filter((v) => v.session.resolvedClientId && v.session.resolvedClientId !== v.project.clientId)).toEqual([]);
  });

  it("un proyecto con una reunión principal que se queda en la principal no puede pasar", async () => {
    const { tae, yo } = await elTec();
    const crm = await prisma.project.create({ data: { name: "Portal", clientId: tae.id } });
    await prisma.firefliesSession.create({ data: sesion("s-tae", "TAE | Seguimiento", 11) });
    await resolveAllSessions({ reclassify: false });
    await prisma.sessionProject.create({ data: { sessionId: "s-tae", projectId: crm.id, isPrimary: true } });

    const pedido = { nombre: "TEC · VIE", siglas: ["VIE"], dominios: [], proyectos: [crm.id] };
    const previa = await simularUnidad(tae.id, pedido, yo.id);
    expect(previa.proyectos[0]!.frenadoPor).toEqual([{ sessionId: "s-tae", title: "TAE | Seguimiento" }]);
    expect(previa.listo).toBe(false);
    await expect(guardarUnidad(tae.id, { ...pedido, huella: previa.huella }, { teamMemberId: yo.id, email: yo.email })).rejects.toThrow();
    expect((await prisma.project.findUniqueOrThrow({ where: { id: crm.id } })).clientId).toBe(tae.id);
  });
});

describe("cambiar las siglas de una unidad", () => {
  it("mueve las reuniones que la sigla nueva nombra, después de verlas", async () => {
    const { tae, ae, yo } = await elTec();
    await prisma.firefliesSession.create({ data: sesion("s-ace", "ACE | Plan de trabajo", 10) });
    await resolveAllSessions({ reclassify: false });
    expect((await prisma.firefliesSession.findUniqueOrThrow({ where: { id: "s-ace" } })).resolvedClientId).toBeNull();

    const pedido = { fichaId: ae.id, siglas: ["AE", "ACE"], dominios: [] };
    const previa = await simularUnidad(ae.id, pedido, yo.id);
    expect(previa.filas.map((f) => [f.sessionId, f.de, f.final])).toEqual([["s-ace", null, ae.id]]);
    await guardarUnidad(ae.id, { ...pedido, huella: previa.huella }, { teamMemberId: yo.id, email: yo.email });
    expect((await prisma.client.findUniqueOrThrow({ where: { id: ae.id } })).siglas).toEqual(["AE", "ACE"]);
    expect((await prisma.firefliesSession.findUniqueOrThrow({ where: { id: "s-ace" } })).resolvedClientId).toBe(ae.id);
    expect((await prisma.client.findUniqueOrThrow({ where: { id: tae.id } })).siglas).toEqual(["TAE"]);
  });

  it("no deja repetir la sigla de otra unidad", async () => {
    const { ae, yo } = await elTec();
    await expect(simularUnidad(ae.id, { fichaId: ae.id, siglas: ["TAE"], dominios: [] }, yo.id)).rejects.toThrow(/ya es de «TEC · TAE»/);
  });
});

describe("lo que la revisión del 26 nov pidió cubrir", () => {
  it("la reunión de un proyecto que pasa y no se movía sale en la vista previa, y elegirle la unidad lo destraba", async () => {
    const { tae, yo } = await elTec();
    const crm = await prisma.project.create({ data: { name: "VIE | CRM", clientId: tae.id } });
    /* Ana va a «TAE | Seguimiento»: Nexus la aprende de TAE y «Seguimiento CRM», sin sigla, se queda en TAE por la gente. */
    await prisma.firefliesSession.createMany({ data: [sesion("s-crm", "Seguimiento CRM", 11), sesion("s-tae", "TAE | Seguimiento", 12)] });
    await resolveAllSessions({ reclassify: false });
    expect((await prisma.firefliesSession.findUniqueOrThrow({ where: { id: "s-crm" } })).resolvedClientId).toBe(tae.id);
    await prisma.sessionProject.create({ data: { sessionId: "s-crm", projectId: crm.id, isPrimary: true } });

    const pedido = { nombre: "TEC · VIE", siglas: ["VIE"], dominios: [], proyectos: [crm.id] };
    const previa = await simularUnidad(tae.id, pedido, yo.id);
    expect(previa.filas).toEqual([expect.objectContaining({ sessionId: "s-crm", como: "sigue", final: tae.id })]);
    expect(previa.listo).toBe(false);

    const conUnidad = { ...pedido, asignar: { "s-crm": "unidad-nueva" } };
    const previa2 = await simularUnidad(tae.id, conUnidad, yo.id);
    expect(previa2.listo).toBe(true);
    const hecho = await guardarUnidad(tae.id, { ...conUnidad, huella: previa2.huella }, { teamMemberId: yo.id, email: yo.email });
    expect((await prisma.project.findUniqueOrThrow({ where: { id: crm.id } })).clientId).toBe(hecho.fichaId);
    expect(await prisma.firefliesSession.findUniqueOrThrow({ where: { id: "s-crm" } })).toMatchObject({ manualClientId: hecho.fichaId, resolvedClientId: hecho.fichaId });
    expect(await prisma.sessionProject.count({ where: { sessionId: "s-crm", projectId: crm.id } })).toBe(1);
  });

  it("una CSE que no abre la principal no puede agregarle una unidad desde la ficha de otra unidad", async () => {
    const { ae } = await elTec();
    const cse = await prisma.teamMember.create({ data: { name: "Vale", email: "vale@smarteamcr.com", roleEnum: "CSE" } });
    const e = await simularUnidad(ae.id, { nombre: "TEC · VIE", siglas: ["VIE"], dominios: [] }, cse.id).catch((x) => x);
    expect(e).toBeInstanceOf(RechazoDeUnidad);
    expect((e as RechazoDeUnidad).status).toBe(403);
    expect(await prisma.client.count({ where: { name: "TEC · VIE" } })).toBe(0);
  });

  it("tampoco puede elegirle a una reunión una ficha que no abre", async () => {
    const { tae, ae } = await elTec();
    const cse = await prisma.teamMember.create({ data: { name: "Vale", email: "vale@smarteamcr.com", roleEnum: "CSE" } });
    await prisma.firefliesSession.create({ data: sesion("s-ace", "ACE | Plan de trabajo", 10) });
    await resolveAllSessions({ reclassify: false });
    // Desde AE, que sí abre: la sigla nueva le trae la reunión, y la elige para TAE, que no abre.
    const e = await simularUnidad(ae.id, { fichaId: ae.id, siglas: ["AE", "ACE"], dominios: [], asignar: { "s-ace": tae.id } }, cse.id).catch((x) => x);
    expect((e as RechazoDeUnidad).status).toBe(403);
  });

  it("un dominio propio nuevo trae las reuniones de esa gente aunque el título no diga nada", async () => {
    const { ae, yo } = await elTec();
    await prisma.firefliesSession.create({
      data: { id: "s-dom", title: "Reunión semanal", date: new Date("2026-11-12T15:00:00Z"), participants: ["luis@ae-tec.test", "heiver@smarteamcr.com"] },
    });
    await resolveAllSessions({ reclassify: false });
    expect((await prisma.firefliesSession.findUniqueOrThrow({ where: { id: "s-dom" } })).resolvedClientId).toBeNull();

    const pedido = { fichaId: ae.id, siglas: ["AE"], dominios: ["ae-tec.test"] };
    const previa = await simularUnidad(ae.id, pedido, yo.id);
    expect(previa.filas.map((f) => [f.sessionId, f.final])).toEqual([["s-dom", ae.id]]);
    await guardarUnidad(ae.id, { ...pedido, huella: previa.huella }, { teamMemberId: yo.id, email: yo.email });
    expect((await prisma.firefliesSession.findUniqueOrThrow({ where: { id: "s-dom" } })).resolvedClientId).toBe(ae.id);
  });
});

describe("una ficha de un grupo", () => {
  it("no puede pasarle proyectos a una unidad nueva: cambiaría de quién son las reuniones del grupo", async () => {
    await prisma.sessionCategory.create({ data: { name: "Interna", slug: "interna", domains: ["smarteamcr.com"], kind: "internal" } });
    const yo = await prisma.teamMember.create({ data: { name: "Eli", email: "eli@smarteamcr.com", roleEnum: "SUPER_ADMIN" } });
    const teamnet = await prisma.client.create({ data: { name: "Teamnet", emailDomains: ["teamnet.test"], createdAt: new Date("2026-01-01") } });
    const strato = await prisma.client.create({ data: { name: "Stratosphere", emailDomains: ["strato.test"], createdAt: new Date("2026-02-01") } });
    const p = await prisma.project.create({ data: { name: "Teamnet CRM", clientId: teamnet.id } });
    for (const c of [teamnet, strato]) {
      await prisma.personaDeLaEmpresa.create({
        data: { clientId: c.id, correo: "laura@teamnet.test", nombre: "Laura", origenes: ["equipo"], confirmadaAt: new Date(), confirmadaPorEmail: yo.email },
      });
    }
    expect((await vistaDeLasUnidades(teamnet.id, yo.id)).tipo).toBe("grupo");
    await expect(simularUnidad(teamnet.id, { nombre: "Teamnet · Norte", siglas: ["NOR"], dominios: [], proyectos: [p.id] }, yo.id)).rejects.toThrow(
      /es de un grupo con otra empresa/,
    );
    // Sin proyectos, sí.
    expect((await simularUnidad(teamnet.id, { nombre: "Teamnet · Norte", siglas: ["NOR"], dominios: [] }, yo.id)).listo).toBe(true);
  });
});
