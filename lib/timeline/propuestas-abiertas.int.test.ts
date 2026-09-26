/**
 * lib/timeline/propuestas-abiertas.int.test.ts — LA CONVERSIÓN DE LAS VIEJAS DEL HANDOFF contra una
 * base REAL (E4 P3, scripts/propuestas-abiertas.ts --convertir-viejas).
 *
 * Correr (con la base local levantada: `npm run db:local -- up` y, si es nueva, `bootstrap`):
 *   npx vitest run lib/timeline/propuestas-abiertas.int.test.ts --project integration
 *
 * El test unitario prueba la conversión y la forma de cada escritura con una base falsa. Lo que solo
 * una base prueba es:
 *   · la lectura de las ediciones (los enums, el corte por fecha): entran solo las posteriores a la
 *     corrida del token, y de fases o del arranque;
 *   · la condición `pendingProposal: { equals: <la vieja entera> }` en Postgres: escribe si la vieja
 *     sigue igual, y NO toca nada si cambió después de leerla (otra propuesta, otro token);
 *   · deshacer devuelve la vieja tal cual, con su token.
 * Y el caso de la spec: el handoff copió todos los campos y propuso uno; después se editaron a mano el
 * copiado y el propuesto. Convertida, el copiado no aparece, el propuesto queda con ⚠ y «Aplicar todo»
 * no revierte ninguno de los dos.
 * Corre contra nexus_test (test/setup.integration.ts la trunca antes de cada caso). Nunca producción.
 */
import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { leerBorrador, planDeAplicacion } from "./borrador";
import {
  convertirLaVieja,
  formatoDe,
  type EntradaDeLaConversion,
  type VivoConOrden,
} from "../../scripts/lib/propuestas-abiertas";
import { deshacerLaConversion, escribirLaConversion, eventosPosteriores } from "../../scripts/lib/conversion-de-viejas";

const ANCLA = "2026-10-05T00:00:00.000Z";

async function mundo() {
  const cliente = await prisma.client.create({ data: { name: "Cliente de la conversión (test)" } });
  const proyecto = await prisma.project.create({ data: { clientId: cliente.id, name: "Implementación (test)" } });
  const tl = await prisma.projectTimeline.create({ data: { projectId: proyecto.id, anchorStartDate: new Date(ANCLA) } });
  const crear = (name: string, order: number, durationWeeks: number) =>
    prisma.timelinePhase.create({ data: { timelineId: tl.id, name, order, durationWeeks, source: "AGENT" } });
  const a = await crear("Kick-off", 0, 1);
  const b = await crear("Diseño", 1, 2);
  const c = await crear("Pruebas", 2, 3);
  // La corrida del handoff que dejó la propuesta: el 1 de agosto.
  const run = await prisma.agentRun.create({
    data: { projectId: proyecto.id, clientId: cliente.id, status: "DONE", createdAt: new Date("2026-08-01T12:00:00.000Z") },
  });
  // La vieja del handoff: copia TODOS los campos de cada fase, propone Pruebas a 4 semanas y suma un Piloto.
  const fila = (f: typeof a) => ({
    id: f.id,
    name: f.name,
    order: f.order,
    durationWeeks: f.durationWeeks,
    startWeek: null,
    sessionCount: null,
    notes: null,
    activityType: null,
  });
  const vieja = {
    anchorStartDate: ANCLA,
    phases: [fila(a), fila(b), { ...fila(c), durationWeeks: 4 }, { name: "Piloto", durationWeeks: 2, startWeek: null, sessionCount: null, notes: null }],
  };
  await prisma.projectTimeline.update({
    where: { id: tl.id },
    data: { pendingProposal: vieja as unknown as Prisma.InputJsonValue, pendingProposalRunId: run.id },
  });
  // Después, a mano (como el PUT, con sus eventos): Diseño 2 → 3 (un campo copiado) y Pruebas 3 → 5 (el propuesto).
  await prisma.timelinePhase.update({ where: { id: b.id }, data: { durationWeeks: 3 } });
  await prisma.timelinePhase.update({ where: { id: c.id }, data: { durationWeeks: 5 } });
  const evento = (faseId: string, label: string, antes: number, despues: number, dia: string): Prisma.TimelineEventCreateManyInput => ({
    projectId: proyecto.id,
    clientId: cliente.id,
    timelineId: tl.id,
    entityType: "PHASE",
    entityId: faseId,
    label,
    action: "MOVED",
    before: { durationWeeks: antes },
    after: { durationWeeks: despues },
    source: "UI_PUT",
    createdAt: new Date(`2026-${dia}T12:00:00.000Z`),
  });
  await prisma.timelineEvent.createMany({
    data: [
      evento(b.id, "Diseño", 2, 3, "08-05"),
      evento(c.id, "Pruebas", 3, 5, "08-06"),
      // Anterior a la corrida: no se lee.
      evento(c.id, "Pruebas", 9, 3, "07-20"),
      // Otra acción: no se lee.
      { ...evento(a.id, "Kick-off", 1, 1, "08-07"), action: "STATUS_CHANGED", before: { status: "PENDING" }, after: { status: "IN_PROGRESS" } },
    ],
  });
  return { proyecto, tl, a, b, c, run, vieja };
}

/** Lo que lee el script de UNA fila, con las mismas consultas. */
async function leerComoElScript(timelineId: string) {
  const f = await prisma.projectTimeline.findUniqueOrThrow({
    where: { id: timelineId },
    select: {
      id: true,
      projectId: true,
      pendingProposal: true,
      pendingProposalRunId: true,
      anchorStartDate: true,
      phases: {
        orderBy: { order: "asc" },
        select: { id: true, name: true, order: true, durationWeeks: true, startWeek: true, sessionCount: true, notes: true, activityType: true },
      },
    },
  });
  const run = f.pendingProposalRunId ? await prisma.agentRun.findUnique({ where: { id: f.pendingProposalRunId } }) : null;
  const creada = run?.createdAt ?? null;
  const eventos = creada ? await eventosPosteriores(prisma, f.projectId, creada) : [];
  const vivoHoy: VivoConOrden = { ancla: f.anchorStartDate?.toISOString() ?? null, fases: f.phases };
  return { f, eventos, vivoHoy, r: convertirLaVieja({ json: f.pendingProposal, vivoHoy, creada, eventos }) };
}

const entradaDe = (l: Awaited<ReturnType<typeof leerComoElScript>>): EntradaDeLaConversion => ({
  projectId: l.f.projectId,
  timelineId: l.f.id,
  token: l.f.pendingProposalRunId!,
  original: l.f.pendingProposal,
  convertida: l.r.tipo === "convertida" ? l.r.borrador : null,
});

const guardado = (timelineId: string) =>
  prisma.projectTimeline.findUniqueOrThrow({ where: { id: timelineId }, select: { pendingProposal: true, pendingProposalRunId: true } });

describe("convertir las viejas del handoff — DB real", () => {
  it("⭐ la copia editada no aparece, lo propuesto que se editó choca, y «Aplicar todo» no revierte ninguno", async () => {
    const m = await mundo();
    const l = await leerComoElScript(m.tl.id);
    expect(l.eventos.map((e) => [e.entityId, e.before]), "solo las posteriores a la corrida, de fases").toEqual([
      [m.b.id, { durationWeeks: 2 }],
      [m.c.id, { durationWeeks: 3 }],
    ]);
    if (l.r.tipo !== "convertida") throw new Error(`se esperaba «convertida» y dio «${l.r.tipo}»`);

    const avisos: number[] = [];
    const w = await escribirLaConversion(prisma, [entradaDe(l)], (todas) => avisos.push(todas.length));
    expect(avisos).toEqual([1]);
    expect(w.escritas).toHaveLength(1);

    // Lo guardado es un v1 del handoff con el MISMO token (la autoría sigue diciendo «desde el handoff»).
    const g = await guardado(m.tl.id);
    expect(formatoDe(g.pendingProposal)).toBe("v1");
    expect(g.pendingProposalRunId).toBe(m.run.id);
    const leido = leerBorrador(g.pendingProposal, { ancla: null, fases: [] })!;
    expect(leido.origen).toBe("handoff");
    // «Aplicar todo»: solo el Piloto. Ni Diseño (la copia vieja) ni Pruebas (choca) se escriben.
    const plan = planDeAplicacion(l.vivoHoy, leido);
    expect(plan.aplicadas.map((c) => c.tipo)).toEqual(["fase-nueva"]);
    expect(plan.escrituras.fases).toEqual([]);
    expect(plan.items.find((it) => it.cambio.tipo === "fase-cambia")).toMatchObject({ estado: "choque" });

    // Otra vez: la vieja ya no está, así que no se toca.
    expect((await escribirLaConversion(prisma, [entradaDe(l)], () => {})).cambiaron).toHaveLength(1);

    // Deshacer la devuelve tal cual, con su token; y una segunda vez ya no encuentra la convertida.
    expect((await deshacerLaConversion(prisma, [entradaDe(l)])).escritas).toHaveLength(1);
    const vuelta = await guardado(m.tl.id);
    expect(vuelta.pendingProposal).toEqual(m.vieja);
    expect(vuelta.pendingProposalRunId).toBe(m.run.id);
    expect((await deshacerLaConversion(prisma, [entradaDe(l)])).cambiaron).toHaveLength(1);
  });

  it("⭐ una que no deja nada por decidir se limpia (propuesta y token), y deshacerla la devuelve", async () => {
    const m = await mundo();
    // Una vieja que solo propone Pruebas a 4 semanas, y a mano Pruebas quedó en 4: todo «ya está».
    const soloPruebas = { ...m.vieja, phases: m.vieja.phases.slice(0, 3) };
    await prisma.projectTimeline.update({ where: { id: m.tl.id }, data: { pendingProposal: soloPruebas as unknown as Prisma.InputJsonValue } });
    await prisma.timelinePhase.update({ where: { id: m.c.id }, data: { durationWeeks: 4 } });
    const l = await leerComoElScript(m.tl.id);
    expect(l.r.tipo).toBe("nada-que-decidir");
    const e = entradaDe(l);
    expect(e.convertida).toBeNull();

    expect((await escribirLaConversion(prisma, [e], () => {})).escritas).toHaveLength(1);
    expect(await guardado(m.tl.id)).toEqual({ pendingProposal: null, pendingProposalRunId: null });

    expect((await deshacerLaConversion(prisma, [e])).escritas).toHaveLength(1);
    expect(await guardado(m.tl.id)).toEqual({ pendingProposal: soloPruebas, pendingProposalRunId: m.run.id });
  });

  it("⛔ si la propuesta cambió después de leerla (otra propuesta u otro token), no se toca", async () => {
    const m = await mundo();
    const l = await leerComoElScript(m.tl.id);
    const e = entradaDe(l);

    // Otra propuesta con el mismo token (la vieja cambió en un campo).
    const otra = { ...m.vieja, phases: m.vieja.phases.slice(0, 3) };
    await prisma.projectTimeline.update({ where: { id: m.tl.id }, data: { pendingProposal: otra as unknown as Prisma.InputJsonValue } });
    expect((await escribirLaConversion(prisma, [e], () => {})).cambiaron).toHaveLength(1);
    expect((await guardado(m.tl.id)).pendingProposal).toEqual(otra);

    // La misma vieja, pero con otro token.
    await prisma.projectTimeline.update({
      where: { id: m.tl.id },
      data: { pendingProposal: m.vieja as unknown as Prisma.InputJsonValue, pendingProposalRunId: "otra-corrida" },
    });
    expect((await escribirLaConversion(prisma, [e], () => {})).cambiaron).toHaveLength(1);
    expect(await guardado(m.tl.id)).toEqual({ pendingProposal: m.vieja, pendingProposalRunId: "otra-corrida" });
  });
});
