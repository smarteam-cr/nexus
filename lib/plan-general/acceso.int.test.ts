/**
 * lib/plan-general/acceso.int.test.ts — el plan general que ve el cliente, contra una base REAL (2026-11-19).
 *
 * Lo que no puede romperse sin que nada avise: la página del cliente (`planParaElToken`) sirve SOLO la foto publicada,
 * armada con el chokepoint del cronograma externo (sin proyectos, notas de tarea ni lo «por validar»); un enlace
 * revocado no abre, y uno nuevo es otro; el plan de una cuenta nunca trae los loops de otra; y sin el detalle
 * confirmado el cliente ve el loop sin sus tareas, como en el cronograma compartible.
 * `npx vitest run --project integration lib/plan-general/acceso.int.test.ts`.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { planParaElToken } from "@/lib/external/plan-view";
import { crearAccesoAlPlan, estadoDelAccesoAlPlan, publicarElPlan, revocarAccesoAlPlan } from "./acceso";
import { leerPlanGeneral, leerPlanParaElCliente } from "./leer";

const ARRANQUE = new Date("2026-11-02T00:00:00.000Z");

async function cuentaConUnLoop(nombre: string) {
  const c = await prisma.client.create({ data: { name: nombre, kind: "CLIENTE" } });
  const p = await prisma.project.create({ data: { clientId: c.id, name: `Proyecto secreto de ${nombre}`, tags: [] } });
  const tl = await prisma.projectTimeline.create({ data: { projectId: p.id, anchorStartDate: ARRANQUE, detailConfirmedAt: new Date() } });
  // Una fase común que NO es loop: no entra al plan.
  await prisma.timelinePhase.create({ data: { timelineId: tl.id, name: "Fase común secreta", order: 1, durationWeeks: 2, startWeek: 0 } });
  const f = await prisma.timelinePhase.create({
    data: { timelineId: tl.id, name: "Campaign Activation", order: 0, durationWeeks: 12, startWeek: 0, loopNumero: 2 },
  });
  const visible = await prisma.timelineTask.create({
    data: { phaseId: f.id, title: "Campaña piloto", weekIndex: 4, semanas: 2, status: "IN_PROGRESS", notes: "NOTA INTERNA" },
  });
  const porValidar = await prisma.timelineTask.create({
    data: { phaseId: f.id, title: "Sugerencia del agente", weekIndex: 1, needsValidation: true },
  });
  return { c, p, f, visible, porValidar };
}

const tokenDe = (enlace: string | null) => (enlace ?? "").split("/").pop() ?? "";

describe("la página del cliente sirve la foto publicada y nada más", () => {
  it("⛔ sin proyectos, notas, fases comunes ni lo por validar; con la duración de la tarea", async () => {
    const { c, p, visible, porValidar } = await cuentaConUnLoop("Cuenta A (test)");
    const acceso = await crearAccesoAlPlan(c.id, "cse@smarteam.cr");
    const pagina = await planParaElToken(tokenDe(acceso.enlace));
    expect(pagina).not.toBeNull();
    const texto = JSON.stringify(pagina);
    expect(texto).not.toContain(p.name);
    expect(texto).not.toContain(p.id);
    expect(texto).not.toContain(visible.id);
    expect(texto).not.toContain("NOTA INTERNA");
    expect(texto).not.toContain(porValidar.title);
    expect(texto).not.toContain("Fase común secreta");
    expect(pagina!.timeline!.phases.map((f) => f.name)).toEqual(["02 · Campaign Activation"]);
    expect(pagina!.timeline!.phases[0].tasks).toEqual([{ title: "Campaña piloto", weekIndex: 4, semanas: 2, status: "IN_PROGRESS", party: null, type: null }]);
  });

  it("⛔ lo que cambia después no le llega hasta publicar", async () => {
    const { c, visible } = await cuentaConUnLoop("Cuenta B (test)");
    const acceso = await crearAccesoAlPlan(c.id, null);
    await prisma.timelineTask.update({ where: { id: visible.id }, data: { status: "DONE" } });
    expect((await estadoDelAccesoAlPlan(c.id)).sinPublicar).toBe(true);
    expect((await planParaElToken(tokenDe(acceso.enlace)))!.timeline!.phases[0].tasks![0].status).toBe("IN_PROGRESS");
    await publicarElPlan(c.id, null);
    expect((await planParaElToken(tokenDe(acceso.enlace)))!.timeline!.phases[0].tasks![0].status).toBe("DONE");
    expect((await estadoDelAccesoAlPlan(c.id)).sinPublicar).toBe(false);
  });

  it("⛔ revocado no abre, y el enlace nuevo es otro (el viejo sigue sin abrir)", async () => {
    const { c } = await cuentaConUnLoop("Cuenta C (test)");
    const viejo = tokenDe((await crearAccesoAlPlan(c.id, null)).enlace);
    await revocarAccesoAlPlan(c.id);
    expect(await planParaElToken(viejo)).toBeNull();
    const nuevo = tokenDe((await crearAccesoAlPlan(c.id, null)).enlace);
    expect(nuevo).not.toBe(viejo);
    expect(await planParaElToken(viejo)).toBeNull();
    expect(await planParaElToken(nuevo)).not.toBeNull();
  });

  it("un token con otra forma no abre", async () => {
    expect(await planParaElToken("abc")).toBeNull();
    expect(await planParaElToken("0".repeat(64))).toBeNull();
  });
});

describe("⛔ nunca mezcla cuentas", () => {
  it("el plan de una cuenta no trae los loops de otra (ni el del equipo ni el del cliente)", async () => {
    const a = await cuentaConUnLoop("Cuenta D (test)");
    const b = await cuentaConUnLoop("Cuenta E (test)");
    const plan = await leerPlanGeneral(a.c.id);
    expect(plan.fases.map((f) => f.proyectoId)).toEqual([a.p.id]);
    expect(JSON.stringify(plan)).not.toContain(b.p.id);
    const cliente = await leerPlanParaElCliente(a.c.id);
    expect(cliente.phases.map((f) => f.id)).toEqual([a.f.id]);
  });
});

describe("⛔ la puerta del detalle confirmado, como el cronograma externo", () => {
  it("sin el detalle confirmado el cliente ve el loop sin sus tareas; el equipo las ve todas", async () => {
    const { c, p } = await cuentaConUnLoop("Cuenta F (test)");
    await prisma.projectTimeline.update({ where: { projectId: p.id }, data: { detailConfirmedAt: null } });
    const cliente = await leerPlanParaElCliente(c.id);
    expect(cliente.phases).toHaveLength(1);
    expect(cliente.phases[0].tasks).toBeUndefined();
    const plan = await leerPlanGeneral(c.id);
    expect(plan.fases[0].tasks).toHaveLength(2);
    expect(plan.proyectos[0].detalleConfirmado).toBe(false);
  });
});
