/**
 * lib/sessions/proyecto-por-titulo.int.test.ts — EL TÍTULO MANDA EL PROYECTO, con el clasificador entero y una base REAL.
 *
 * Correr: `npx vitest run --project integration lib/sessions/proyecto-por-titulo.int.test.ts` (con `npm run db:local -- up`).
 *
 * Etapa U6 del plan de unidades (2026-11-07). kölbi es un cliente con tres proyectos, y su gente va a reuniones de los
 * tres: «kölbi Marketing | Campaña» con la gente de Ventas tiene que ir a Marketing. Antes lo decidía la IA, que ve los
 * correos de la gente. Ahora decide el título, sin llamar a Claude; si el título nombra a dos, decide la IA de siempre.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const crear = vi.hoisted(() => vi.fn());
vi.mock("@/lib/anthropic", () => ({ anthropic: { messages: { create: crear } } }));
/* Sin deals: el clasificador no le pide nada a HubSpot. */
vi.mock("@/lib/hubspot/client", () => ({ getSystemHubspotClient: vi.fn(async () => { throw new Error("sin HubSpot en la prueba"); }) }));

import { prisma } from "@/lib/db/prisma";
import { AGENT_ID_SESSION_PROJECT_CLASSIFIER, classifySessionToProjects } from "./classify-session-project";

async function kolbi() {
  const cliente = await prisma.client.create({ data: { name: "kölbi", company: "kolbi.cr", emailDomains: ["ice.go.cr"] } });
  const proyecto = (name: string, serviceType: string) =>
    prisma.project.create({ data: { name, clientId: cliente.id, status: "active", serviceType } });
  const ventas = await proyecto("Kolbi | Ventas", "loop_sales");
  const marketing = await proyecto("Kolbi | Marketing", "loop_marketing");
  const infoclic = await proyecto("Integración con InfoClic | kölbi", "proyecto_temporal");
  await prisma.agent.create({
    data: { id: AGENT_ID_SESSION_PROJECT_CLASSIFIER, name: "Clasificador", systemPrompt: "Clasifica." },
  });
  /* La gente de Ventas (Diana y Catalina). */
  const reunion = (id: string, title: string) =>
    prisma.firefliesSession.create({
      data: {
        id,
        title,
        date: new Date("2026-10-20T15:00:00Z"),
        participants: ["aortega@smarteamcr.com", "dvillalobos@ice.go.cr", "cdiaz@ice.go.cr"],
        resolvedClientId: cliente.id,
      },
    });
  return { cliente, ventas, marketing, infoclic, reunion };
}

const vinculos = (sessionId: string) =>
  prisma.sessionProject.findMany({ where: { sessionId }, select: { projectId: true, isPrimary: true, source: true, rationale: true } });

describe("dentro de un cliente, el título manda el proyecto — DB real", () => {
  beforeEach(() => {
    crear.mockReset();
    crear.mockRejectedValue(new Error("no tendría que llamar a Claude"));
  });

  it("«kölbi Marketing | Campaña» va a Marketing aunque la gente sea la de Ventas, sin llamar a la IA", async () => {
    const { cliente, marketing, reunion } = await kolbi();
    await reunion("s1", "kölbi Marketing | Campaña");

    const r = await classifySessionToProjects("s1", cliente.id);

    expect(r).toMatchObject({ status: "ok", primaryProjectId: marketing.id, via: "titulo" });
    expect(crear).not.toHaveBeenCalled();
    expect(await vinculos("s1")).toEqual([
      { projectId: marketing.id, isPrimary: true, source: "agent", rationale: "El título nombra el proyecto «Kolbi | Marketing» («marketing»)" },
    ]);
  });

  it("el título manda también sobre lo que la IA había vinculado antes, sin tocar lo que puso una persona", async () => {
    const { cliente, ventas, marketing, infoclic, reunion } = await kolbi();
    await reunion("s2", "Revisión campaña Marketing | Kolbi");
    await prisma.sessionProject.createMany({
      data: [
        { sessionId: "s2", projectId: ventas.id, isPrimary: true, source: "agent", confidence: 0.6 },
        { sessionId: "s2", projectId: infoclic.id, isPrimary: false, source: "manual" },
      ],
    });

    await classifySessionToProjects("s2", cliente.id);

    const v = await vinculos("s2");
    expect(v.map((x) => [x.projectId, x.isPrimary, x.source]).sort()).toEqual(
      [
        [infoclic.id, false, "manual"],
        [marketing.id, true, "agent"],
      ].sort(),
    );
  });

  it("si el título nombra a dos proyectos, decide la IA de siempre", async () => {
    const { cliente, ventas, reunion } = await kolbi();
    await reunion("s3", "Plan de acción Ventas y Marketing");
    crear.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ assignments: [{ projectId: ventas.id, isPrimary: true, confidence: 0.8, rationale: "Pipelines" }] }) }],
    });

    const r = await classifySessionToProjects("s3", cliente.id);

    expect(crear).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ status: "ok", primaryProjectId: ventas.id, via: "ia" });
  });

  it("si una persona excluyó ese proyecto para la reunión, el título no insiste: decide la IA, que tampoco lo propone", async () => {
    const { cliente, ventas, marketing, reunion } = await kolbi();
    await reunion("s5", "kölbi Marketing | Campaña");
    await prisma.sessionProject.create({ data: { sessionId: "s5", projectId: marketing.id, isPrimary: false, source: "manual", included: false } });
    crear.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ assignments: [
        { projectId: marketing.id, isPrimary: true, confidence: 0.9, rationale: "Campaña" },
        { projectId: ventas.id, isPrimary: false, confidence: 0.5, rationale: "Leads" },
      ] }) }],
    });

    const r = await classifySessionToProjects("s5", cliente.id);

    expect(crear).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ via: "ia", primaryProjectId: ventas.id });
    const v = await prisma.sessionProject.findMany({ where: { sessionId: "s5" }, select: { projectId: true, included: true, source: true } });
    expect(v).toContainEqual({ projectId: marketing.id, included: false, source: "manual" }); // la exclusión sigue
  });

  it("si una persona fijó el principal en otro proyecto, el del título entra como secundario y no se lo disputa", async () => {
    const { cliente, ventas, marketing, reunion } = await kolbi();
    await reunion("s6", "kölbi Marketing | Campaña");
    await prisma.sessionProject.create({ data: { sessionId: "s6", projectId: ventas.id, isPrimary: true, source: "manual" } });

    const r = await classifySessionToProjects("s6", cliente.id);

    expect(crear).not.toHaveBeenCalled();
    expect(r).toMatchObject({ via: "titulo", primaryProjectId: ventas.id });
    const v = await vinculos("s6");
    expect(v.map((x) => [x.projectId, x.isPrimary, x.source]).sort()).toEqual(
      [
        [ventas.id, true, "manual"],
        [marketing.id, false, "agent"],
      ].sort(),
    );
  });

  it("si una persona ya agregó el proyecto del título como secundario, el título no lo toma: la reunión no queda sin principal", async () => {
    /* Revisión del 8 nov: el guardado no toca un vínculo con candado y borraba el principal virgen (Ventas). */
    const { cliente, ventas, marketing, reunion } = await kolbi();
    await reunion("s7", "kölbi Marketing | Campaña");
    await prisma.sessionProject.createMany({
      data: [
        { sessionId: "s7", projectId: ventas.id, isPrimary: true, source: "agent", confidence: 0.6 },
        { sessionId: "s7", projectId: marketing.id, isPrimary: false, source: "manual" },
      ],
    });
    crear.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ assignments: [{ projectId: ventas.id, isPrimary: true, confidence: 0.7, rationale: "Leads" }] }) }],
    });

    const r = await classifySessionToProjects("s7", cliente.id);

    expect(r).toMatchObject({ via: "ia" });
    const v = await vinculos("s7");
    expect(v.filter((x) => x.isPrimary)).toHaveLength(1);
    expect(v).toContainEqual(expect.objectContaining({ projectId: marketing.id, isPrimary: false, source: "manual" }));
  });

  it("en simulacro no escribe nada", async () => {
    const { cliente, marketing, reunion } = await kolbi();
    await reunion("s4", "Sesión Marketing - Lead Scoring | KOLBI & SMARTEAM");

    const r = await classifySessionToProjects("s4", cliente.id, { dryRun: true });

    expect(r.proposals).toEqual([expect.objectContaining({ projectId: marketing.id, isPrimary: true })]);
    expect(await vinculos("s4")).toEqual([]);
  });
});
