/**
 * lib/plan-general/acceso.int.test.ts — el plan general que ve el cliente, contra una base REAL (2026-11-19).
 *
 * Lo que no puede romperse sin que nada avise: la página del cliente (`planParaElToken`) sirve SOLO la foto publicada,
 * sin proyectos, ids, notas ni lo «por validar»; un enlace revocado no abre, y uno nuevo es otro; y el plan de una
 * cuenta nunca trae los loops de otra.
 * `npx vitest run --project integration lib/plan-general/acceso.int.test.ts`.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { planParaElToken } from "@/lib/external/plan-view";
import { crearAccesoAlPlan, estadoDelAccesoAlPlan, publicarElPlan, revocarAccesoAlPlan } from "./acceso";
import { leerPlanGeneral } from "./leer";

const ARRANQUE = new Date("2026-11-02T00:00:00.000Z");

async function cuentaConUnLoop(nombre: string) {
  const c = await prisma.client.create({ data: { name: nombre, kind: "CLIENTE" } });
  const p = await prisma.project.create({ data: { clientId: c.id, name: `Proyecto secreto de ${nombre}`, tags: [] } });
  const tl = await prisma.projectTimeline.create({ data: { projectId: p.id, anchorStartDate: ARRANQUE, detailConfirmedAt: new Date() } });
  const f = await prisma.timelinePhase.create({
    data: { timelineId: tl.id, name: "Campaign Activation", order: 0, durationWeeks: 12, startWeek: 0, loopNumero: 2 },
  });
  const visible = await prisma.timelineTask.create({
    data: { phaseId: f.id, title: "Campaña piloto", weekIndex: 4, semanas: 2, tipoDeTrabajo: "ejecucion", status: "IN_PROGRESS", notes: "NOTA INTERNA" },
  });
  const porValidar = await prisma.timelineTask.create({
    data: { phaseId: f.id, title: "Sugerencia del agente", weekIndex: 1, needsValidation: true },
  });
  return { c, p, f, visible, porValidar };
}

const tokenDe = (enlace: string | null) => (enlace ?? "").split("/").pop() ?? "";

describe("la página del cliente sirve la foto publicada y nada más", () => {
  it("⛔ sin proyectos, ids, notas ni lo por validar; con semanas desde 1", async () => {
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
    expect(pagina!.foto!.grupos[0].filas).toEqual([{ titulo: "Campaña piloto", tipo: "ejecucion", desde: 5, hasta: 6, estado: "IN_PROGRESS" }]);
  });

  it("⛔ lo que cambia después no le llega hasta publicar", async () => {
    const { c, visible } = await cuentaConUnLoop("Cuenta B (test)");
    const acceso = await crearAccesoAlPlan(c.id, null);
    await prisma.timelineTask.update({ where: { id: visible.id }, data: { status: "DONE" } });
    expect((await estadoDelAccesoAlPlan(c.id)).sinPublicar).toBe(true);
    expect((await planParaElToken(tokenDe(acceso.enlace)))!.foto!.grupos[0].filas[0].estado).toBe("IN_PROGRESS");
    await publicarElPlan(c.id, null);
    expect((await planParaElToken(tokenDe(acceso.enlace)))!.foto!.grupos[0].filas[0].estado).toBe("DONE");
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
  it("el plan de una cuenta no trae los loops de otra", async () => {
    const a = await cuentaConUnLoop("Cuenta D (test)");
    const b = await cuentaConUnLoop("Cuenta E (test)");
    const plan = await leerPlanGeneral(a.c.id);
    expect(plan.grupos.map((g) => g.proyectoId)).toEqual([a.p.id]);
    expect(JSON.stringify(plan)).not.toContain(b.p.id);
  });
});

describe("⛔ la puerta del detalle confirmado, como el cronograma externo", () => {
  it("sin el detalle confirmado el cliente no ve las actividades de ese proyecto", async () => {
    const { c, p } = await cuentaConUnLoop("Cuenta F (test)");
    await prisma.projectTimeline.update({ where: { projectId: p.id }, data: { detailConfirmedAt: null } });
    const plan = await leerPlanGeneral(c.id, { paraElCliente: true });
    expect(plan.grupos[0].filas).toEqual([]);
    expect(plan.grupos[0].detalleConfirmado).toBe(false);
    expect((await leerPlanGeneral(c.id)).grupos[0].filas.length).toBe(2);
  });
});
