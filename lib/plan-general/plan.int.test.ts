/**
 * lib/plan-general/plan.int.test.ts — el plan general como objeto de la cuenta, contra una base REAL (2026-11-26).
 *
 * Lo que no puede romperse sin que nada avise (DECISIONS «El plan general es un objeto de la cuenta»):
 *  - el plan nace con los proyectos que la cuenta ya mostraba y con su cronograma; dos pedidos no crean dos;
 *  - la lista de proyectos es explícita y solo acepta proyectos activos de ESA cuenta;
 *  - las tareas de una fase propia se manejan con las MISMAS operaciones del motor, y una tarea del plan no se toca desde
 *    un proyecto (ni al revés);
 *  - lo que ve el cliente pasa por el chokepoint: «00 · Transversal», sin notas de tarea ni lo suspendido;
 *  - ⛔ un cronograma de plan no entra donde se espera uno de proyecto (la carga de la cartera, el cronograma de un
 *    proyecto) y la base no deja un cronograma sin dueño ni con dos.
 * `npx vitest run --project integration lib/plan-general/plan.int.test.ts`.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { readClientTimeline } from "@/lib/external/timeline-view";
import { INV22 } from "@/lib/invariantes/cronograma";
import { leerCronogramasDeCartera } from "@/lib/carga/queries";
import { borrarTarea, cambiarEstadoDeTarea, crearTarea, editarCamposDeTarea } from "@/lib/timeline/una-tarea";
import { leerPlanGeneral, leerPlanParaElCliente, proyectosParaElegir } from "./leer";
import { asegurarPlan, borrarFasePropia, crearFasePropia, editarFasePropia, ErrorDelPlan, fijarArranqueDelPlan, fijarProyectosDelPlan } from "./plan";

const ARRANQUE = new Date("2026-11-02T00:00:00.000Z");

async function cuentaConUnLoop(nombre: string) {
  const c = await prisma.client.create({ data: { name: nombre, kind: "CLIENTE" } });
  const p = await prisma.project.create({ data: { clientId: c.id, name: `Proyecto de ${nombre}`, tags: [] } });
  const tl = await prisma.projectTimeline.create({ data: { projectId: p.id, anchorStartDate: ARRANQUE, detailConfirmedAt: new Date() } });
  const f = await prisma.timelinePhase.create({
    data: { timelineId: tl.id, name: "Campaign Activation", order: 0, durationWeeks: 12, startWeek: 0, loopNumero: 2 },
  });
  const t = await prisma.timelineTask.create({ data: { phaseId: f.id, title: "Campaña piloto", weekIndex: 1 } });
  const sinLoops = await prisma.project.create({ data: { clientId: c.id, name: `Otro de ${nombre}`, tags: [] } });
  return { c, p, f, t, sinLoops };
}

describe("el plan nace con lo que la cuenta ya mostraba", () => {
  it("con los proyectos con loops, su arranque y su cronograma (detalle confirmado), una sola vez", async () => {
    const { c, p } = await cuentaConUnLoop("Plan A (test)");
    const [uno, otro] = await Promise.all([asegurarPlan(c.id, "cse@smarteam.cr"), asegurarPlan(c.id, null)]);
    expect(uno).toEqual(otro);
    const plan = await prisma.planGeneral.findUniqueOrThrow({
      where: { clientId: c.id },
      select: { proyectos: { select: { projectId: true } }, cronograma: { select: { projectId: true, anchorStartDate: true, detailConfirmedAt: true } } },
    });
    expect(plan.proyectos.map((x) => x.projectId)).toEqual([p.id]);
    expect(plan.cronograma?.projectId).toBeNull();
    expect(plan.cronograma?.anchorStartDate?.toISOString()).toBe(ARRANQUE.toISOString());
    expect(plan.cronograma?.detailConfirmedAt).not.toBeNull();
    expect(await prisma.planGeneral.count({ where: { clientId: c.id } })).toBe(1);
  });

  it("⛔ la base no deja un cronograma sin dueño ni con proyecto y plan a la vez", async () => {
    const { c, p } = await cuentaConUnLoop("Plan B (test)");
    const { planId } = await asegurarPlan(c.id, null);
    await expect(prisma.projectTimeline.create({ data: {} })).rejects.toThrow();
    expect(planId).toBeTruthy();
    /* Con un proyecto y un plan que NO tienen cronograma: así lo único que puede frenarlo es el CHECK (si se usara el
       plan de arriba, lo frenaría el único de `planId`). */
    const otro = await prisma.project.create({ data: { clientId: c.id, name: "Sin cronograma", tags: [] } });
    const otraCuenta = await prisma.client.create({ data: { name: "Plan B2 (test)", kind: "CLIENTE" } });
    const planSinCronograma = await prisma.planGeneral.create({ data: { clientId: otraCuenta.id } });
    await expect(
      prisma.$executeRaw`INSERT INTO "ProjectTimeline" ("id","projectId","planId","createdAt","updatedAt") VALUES ('dos-duenos', ${otro.id}, ${planSinCronograma.id}, now(), now())`,
    ).rejects.toThrow(/ProjectTimeline_un_solo_dueno/);
    expect(await prisma.projectTimeline.count({ where: { projectId: p.id } })).toBe(1);
  });
});

describe("la lista de proyectos es explícita", () => {
  it("entra uno sin loops (no muestra nada todavía) y sale el que no viene", async () => {
    const { c, p, sinLoops } = await cuentaConUnLoop("Plan C (test)");
    expect((await proyectosParaElegir(c.id)).map((o) => [o.id === p.id, o.incluido])).toEqual(
      expect.arrayContaining([
        [true, true],
        [false, false],
      ]),
    );
    await fijarProyectosDelPlan(c.id, [sinLoops.id], null);
    const plan = await leerPlanGeneral(c.id);
    expect(plan.proyectos.map((x) => x.id)).toEqual([sinLoops.id]);
    expect(plan.fases).toEqual([]);
  });

  it("⛔ no acepta un proyecto de otra cuenta, ni uno cerrado o de prueba, y no toca nada", async () => {
    const a = await cuentaConUnLoop("Plan D (test)");
    const b = await cuentaConUnLoop("Plan E (test)");
    await expect(fijarProyectosDelPlan(a.c.id, [a.p.id, b.p.id], null)).rejects.toBeInstanceOf(ErrorDelPlan);
    const prueba = await prisma.project.create({ data: { clientId: a.c.id, name: "De prueba", tags: [], esPrueba: true } });
    await expect(fijarProyectosDelPlan(a.c.id, [prueba.id], null)).rejects.toBeInstanceOf(ErrorDelPlan);
    expect(await prisma.planGeneral.count({ where: { clientId: a.c.id } })).toBe(0);
  });

  it("un proyecto que se cierra deja de verse aunque siga en la lista", async () => {
    const { c, p } = await cuentaConUnLoop("Plan F (test)");
    await asegurarPlan(c.id, null);
    await prisma.project.update({ where: { id: p.id }, data: { status: "closed" } });
    expect((await leerPlanGeneral(c.id)).proyectos).toEqual([]);
  });
});

describe("las fases propias, con el mismo motor", () => {
  it("«00 · Transversal» con sus tareas: el equipo ve todo, el cliente lo que deja el chokepoint", async () => {
    const { c, p, f } = await cuentaConUnLoop("Plan G (test)");
    const fase = await crearFasePropia(c.id, { name: "Transversal", loopNumero: 0, startWeek: 0, durationWeeks: 9 }, null);
    const { planId } = await asegurarPlan(c.id, null);
    const hecha = await crearTarea({ planId }, { phaseId: fase.id, title: "Alinear objetivos", weekIndex: 0, party: "AMBOS", type: "TASK", semanas: 1 });
    const larga = await crearTarea({ planId }, { phaseId: fase.id, title: "Capacitar por rol", weekIndex: 3, party: "AMBOS", type: "TASK", semanas: 20 });
    const suspendida = await crearTarea({ planId }, { phaseId: fase.id, title: "Algo descartado", weekIndex: 2, party: null, type: null, semanas: null });
    expect(hecha.ok && larga.ok && suspendida.ok).toBe(true);
    if (!hecha.ok || !larga.ok || !suspendida.ok) return;
    expect(larga.valor.task.semanas).toBe(6); // recortada a lo que queda de la fase (S3 a S8)
    await editarCamposDeTarea({ planId }, hecha.valor.task.id, { data: { notes: "Entregable: objetivos aprobados" } });
    await cambiarEstadoDeTarea({ planId }, hecha.valor.task.id, "DONE", null);
    await cambiarEstadoDeTarea({ planId }, suspendida.valor.task.id, "SUSPENDED", null);

    const plan = await leerPlanGeneral(c.id);
    expect(plan.fases.map((x) => [x.id, x.proyectoId])).toEqual([
      [fase.id, null],
      [f.id, p.id],
    ]);
    expect(plan.fases[0].tasks.find((t) => t.id === hecha.valor.task.id)?.notes).toBe("Entregable: objetivos aprobados");

    const cliente = await leerPlanParaElCliente(c.id);
    expect(cliente.phases.map((x) => x.name)).toEqual(["00 · Transversal", "02 · Campaign Activation"]);
    const texto = JSON.stringify(cliente);
    expect(texto).not.toContain("Entregable: objetivos aprobados");
    expect(texto).not.toContain("Algo descartado");
    expect(cliente.phases[0].tasks?.map((t) => [t.title, t.status, t.semanas ?? 1])).toEqual([
      ["Alinear objetivos", "DONE", 1],
      ["Capacitar por rol", "PENDING", 6],
    ]);
  });

  it("⛔ una tarea del plan no se toca desde un proyecto, ni una del proyecto desde el plan", async () => {
    const { c, p, t } = await cuentaConUnLoop("Plan H (test)");
    const fase = await crearFasePropia(c.id, { name: "Transversal", loopNumero: 0, startWeek: 0, durationWeeks: 4 }, null);
    const { planId } = await asegurarPlan(c.id, null);
    const delPlan = await crearTarea({ planId }, { phaseId: fase.id, title: "Del plan", weekIndex: 0, party: null, type: null, semanas: null });
    if (!delPlan.ok) throw new Error("no se creó");
    expect((await cambiarEstadoDeTarea({ projectId: p.id }, delPlan.valor.task.id, "DONE", null)).ok).toBe(false);
    expect((await borrarTarea({ projectId: p.id }, delPlan.valor.task.id)).ok).toBe(false);
    expect((await cambiarEstadoDeTarea({ planId }, t.id, "DONE", null)).ok).toBe(false);
    expect((await editarCamposDeTarea({ planId }, t.id, { data: {}, phaseId: fase.id })).ok).toBe(false);
    // Ni crear en una fase de un proyecto desde el plan.
    const f2 = await prisma.timelinePhase.findFirstOrThrow({ where: { timeline: { projectId: p.id } } });
    expect((await crearTarea({ planId }, { phaseId: f2.id, title: "x", weekIndex: 0, party: null, type: null, semanas: null })).ok).toBe(false);
    expect((await prisma.timelineTask.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("PENDING");
  });

  it("acortar una fase propia no deja tareas afuera (INV22): pide moverlas antes", async () => {
    const { c } = await cuentaConUnLoop("Plan I (test)");
    const fase = await crearFasePropia(c.id, { name: "Transversal", loopNumero: 0, startWeek: 0, durationWeeks: 9 }, null);
    const { planId } = await asegurarPlan(c.id, null);
    await crearTarea({ planId }, { phaseId: fase.id, title: "Al final", weekIndex: 8, party: null, type: null, semanas: null });
    await expect(editarFasePropia(c.id, fase.id, { durationWeeks: 5 })).rejects.toBeInstanceOf(ErrorDelPlan);
    expect((await prisma.timelinePhase.findUniqueOrThrow({ where: { id: fase.id } })).durationWeeks).toBe(9);
  });

  it("acortarla recorta la duración de las tareas que se pasaban del nuevo final, y no toca las demás", async () => {
    const { c } = await cuentaConUnLoop("Plan I2 (test)");
    const fase = await crearFasePropia(c.id, { name: "Transversal", loopNumero: 0, startWeek: 0, durationWeeks: 9 }, null);
    const { planId } = await asegurarPlan(c.id, null);
    const larga = await crearTarea({ planId }, { phaseId: fase.id, title: "Larga", weekIndex: 3, party: null, type: null, semanas: 6 });
    const corta = await crearTarea({ planId }, { phaseId: fase.id, title: "Corta", weekIndex: 0, party: null, type: null, semanas: 2 });
    if (!larga.ok || !corta.ok) throw new Error("no se crearon");
    await editarFasePropia(c.id, fase.id, { durationWeeks: 5 });
    const leer = (id: string) => prisma.timelineTask.findUniqueOrThrow({ where: { id }, select: { semanas: true } });
    expect((await leer(larga.valor.task.id)).semanas).toBe(2); // S3 y S4: lo que queda de la fase
    expect((await leer(corta.valor.task.id)).semanas).toBe(2);
    await editarFasePropia(c.id, fase.id, { durationWeeks: 4 });
    expect((await leer(larga.valor.task.id)).semanas).toBeNull(); // una sola semana: se guarda null
  });

  it("⛔ una cuenta no edita ni borra una fase de otra (ni de su plan ni de un proyecto)", async () => {
    const a = await cuentaConUnLoop("Plan L (test)");
    const b = await cuentaConUnLoop("Plan M (test)");
    const faseDeB = await crearFasePropia(b.c.id, { name: "Transversal de B", loopNumero: 0, startWeek: 0, durationWeeks: 4 }, null);
    await expect(editarFasePropia(a.c.id, faseDeB.id, { name: "Pisada" })).rejects.toMatchObject({ status: 404 });
    await expect(borrarFasePropia(a.c.id, faseDeB.id)).rejects.toMatchObject({ status: 404 });
    // Tampoco un loop de un proyecto (ni de la misma cuenta): las fases de un proyecto se editan en su cronograma.
    await expect(editarFasePropia(a.c.id, a.f.id, { name: "Pisada" })).rejects.toMatchObject({ status: 404 });
    await expect(borrarFasePropia(b.c.id, b.f.id)).rejects.toMatchObject({ status: 404 });
    expect((await prisma.timelinePhase.findUniqueOrThrow({ where: { id: faseDeB.id } })).name).toBe("Transversal de B");
    expect(await prisma.timelinePhase.count({ where: { id: { in: [a.f.id, b.f.id] } } })).toBe(2);
  });

  it("el arranque del plan no puede ir después que sus proyectos; antes, sí", async () => {
    const { c } = await cuentaConUnLoop("Plan J (test)");
    await expect(fijarArranqueDelPlan(c.id, "2026-11-16", null)).rejects.toBeInstanceOf(ErrorDelPlan);
    await fijarArranqueDelPlan(c.id, "2026-10-26", null);
    const plan = await leerPlanGeneral(c.id);
    expect(plan.ancla?.slice(0, 10)).toBe("2026-10-26");
    expect(plan.fases[0].startWeek).toBe(1);
  });
});

describe("⛔ un cronograma de plan no se cuela donde se espera uno de proyecto", () => {
  it("la carga de la cartera, el cronograma del proyecto y el INV22 (que nombra al plan)", async () => {
    const { c, p } = await cuentaConUnLoop("Plan K (test)");
    const fase = await crearFasePropia(c.id, { name: "Transversal del plan K", loopNumero: 0, startWeek: 0, durationWeeks: 2 }, null);
    const { timelineId } = await asegurarPlan(c.id, null);
    const cartera = await leerCronogramasDeCartera();
    expect(cartera.some((x) => x.project === null)).toBe(false);
    expect(JSON.stringify(cartera)).not.toContain(timelineId);
    expect((await readClientTimeline(p.id)).phases.map((x) => x.name)).toEqual(["Campaign Activation"]);
    // Una tarea fuera de su fase en el plan: el INV22 la ve y nombra al plan, sin romperse por no tener proyecto.
    await prisma.timelineTask.create({ data: { phaseId: fase.id, title: "Desbordada", weekIndex: 5 } });
    const r = await INV22.correr(prisma, new Date());
    expect(JSON.stringify(r)).toContain("Plan general de Plan K (test)");
  });
});
