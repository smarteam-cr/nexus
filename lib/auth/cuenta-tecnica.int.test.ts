/**
 * lib/auth/cuenta-tecnica.int.test.ts — qué cuentas abre Customer Success, con filas reales (2026-10-30). Es la frontera
 * del acceso: una prueba con la base simulada no lee el filtro. Correr con la base local: `npm run test:int`.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { pipelineByKey } from "@/lib/projects/kind";
import { accessibleClientWhere, CUENTA_TECNICA_DE_LA_CARTERA } from "./access";

const DESARROLLO = pipelineByKey("development").hubspotPipelineId;
const CS = pipelineByKey("customer-success").hubspotPipelineId;
let serie = 0;

async function cuenta(kind: "CLIENTE" | "PROSPECTO", proyectos: { pipeline: string | null; status?: string; hubspot?: boolean; contenedor?: boolean }[]) {
  const c = await prisma.client.create({ data: { name: `Cuenta ${++serie} (test)`, kind } });
  for (const p of proyectos) {
    await prisma.project.create({
      data: {
        name: "Proyecto",
        clientId: c.id,
        status: p.status ?? "active",
        hubspotPipelineId: p.pipeline,
        hubspotServiceId: p.hubspot === false ? null : `hs-${++serie}`,
        ...(p.contenedor ? { serviceType: "__strategy__" } : {}),
      },
    });
  }
  return c.id;
}

const seAbre = async (id: string) => (await prisma.client.count({ where: { id, ...CUENTA_TECNICA_DE_LA_CARTERA } })) > 0;

describe("la cuenta con solo proyectos técnicos", () => {
  it("se abre con un proyecto técnico activo y ninguno de CS, también con su contenedor", async () => {
    expect(await seAbre(await cuenta("CLIENTE", [{ pipeline: DESARROLLO }]))).toBe(true);
    expect(await seAbre(await cuenta("CLIENTE", [{ pipeline: DESARROLLO }, { pipeline: null, hubspot: false, contenedor: true }]))).toBe(true);
  });

  it("⛔ no se abre con un proyecto de CS activo, ni con un alta de CS a medio hacer", async () => {
    expect(await seAbre(await cuenta("CLIENTE", [{ pipeline: DESARROLLO }, { pipeline: CS }]))).toBe(false);
    expect(await seAbre(await cuenta("CLIENTE", [{ pipeline: DESARROLLO }, { pipeline: CS, hubspot: false }]))).toBe(false);
  });

  it("un proyecto de CS inactivo no la cierra", async () => {
    expect(await seAbre(await cuenta("CLIENTE", [{ pipeline: DESARROLLO }, { pipeline: CS, status: "inactive" }]))).toBe(true);
  });

  it("⛔ no se abre sin un técnico activo, con un pipeline sin declarar, ni si es un prospecto", async () => {
    expect(await seAbre(await cuenta("CLIENTE", [{ pipeline: DESARROLLO, status: "inactive" }]))).toBe(false);
    expect(await seAbre(await cuenta("CLIENTE", [{ pipeline: "999" }]))).toBe(false);
    expect(await seAbre(await cuenta("CLIENTE", []))).toBe(false);
    expect(await seAbre(await cuenta("PROSPECTO", [{ pipeline: DESARROLLO }]))).toBe(false);
  });
});

describe("el listado de Clientes", () => {
  const persona = (roleEnum: "CSE" | "ADMIN") =>
    prisma.teamMember.create({ data: { name: `Persona ${++serie}`, email: `p${serie}@test.local`, roleEnum } });
  const ve = async (tm: Awaited<ReturnType<typeof persona>>, id: string) => {
    const w = await accessibleClientWhere({ kind: "INTERNAL", teamMember: tm } as never);
    return (await prisma.client.count({ where: { AND: [w ?? {}, { id }] } })) > 0;
  };

  it("se la muestra a un CSE que no es dueño de nada, y no a otro rol", async () => {
    const id = await cuenta("CLIENTE", [{ pipeline: DESARROLLO }]);
    expect(await ve(await persona("CSE"), id)).toBe(true);
    expect(await ve(await persona("ADMIN"), id)).toBe(false);
  });

  it("⛔ una cuenta con proyecto de CS sigue sin mostrársela a otro CSE, y un REVOKE la saca", async () => {
    const cse = await persona("CSE");
    expect(await ve(cse, await cuenta("CLIENTE", [{ pipeline: DESARROLLO }, { pipeline: CS }]))).toBe(false);
    const id = await cuenta("CLIENTE", [{ pipeline: DESARROLLO }]);
    const quien = await persona("ADMIN");
    await prisma.clientAssignment.create({ data: { clientId: id, teamMemberId: cse.id, kind: "REVOKE", grantedById: quien.id } });
    expect(await ve(cse, id)).toBe(false);
  });
});
