/**
 * lib/tareas/compromisos-del-pipeline.int.test.ts — Ventas › Pipeline contra una base REAL: lo prometido a una empresa no
 * cruza a otra (invariante 1) y la cita sigue su regla, también para quien ve la empresa.
 *
 * Correr con la base local: `npx vitest run --project integration lib/tareas/compromisos-del-pipeline`.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: <T,>(fn: T) => fn, revalidateTag: () => undefined, revalidatePath: () => undefined }));

import type { TeamMember } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { compromisosDeLasEmpresas, tareasDeReunionAjena } from "./compromisos-del-pipeline";

const AHORA = new Date();
const VENDEDORA = "vendedora@test.local";
const OTRO = "otro-vendedor@test.local";
const DIRECCION = "direccion@test.local";

let numero = 0;
async function compromiso(clientId: string, sessionId: string, extra: Record<string, unknown> = {}) {
  numero++;
  return prisma.tarea.create({
    data: {
      titulo: `Enviar la propuesta ${numero}`,
      huella: `h${numero}`,
      estado: "propuesta",
      equipo: "ventas",
      lado: "smarteam",
      origen: "reunion",
      origenId: `l:lectura:seg-s-${numero}`,
      cita: "Yo te mando la propuesta el viernes",
      clientId,
      sessionId,
      ...extra,
    },
  });
}

async function mundo() {
  await prisma.teamMember.createMany({
    data: [
      { name: "Vendedora", email: VENDEDORA, roleEnum: "VENTAS", area: "Ventas" },
      { name: "Otro vendedor", email: OTRO, roleEnum: "VENTAS", area: "Ventas" },
      { name: "Dirección", email: DIRECCION, roleEnum: "SUPER_ADMIN", area: "Dirección" },
    ],
  });
  const tms = await prisma.teamMember.findMany();
  const quien = (email: string) => tms.find((t) => t.email === email) as TeamMember;
  const wherex = await prisma.client.create({ data: { name: "Wherex" } });
  const honda = await prisma.client.create({ data: { name: "Honda" } });
  const reunion = (id: string, clientId: string) =>
    prisma.firefliesSession.create({ data: { id, title: `Reunión ${id}`, date: new Date(+AHORA - 86_400_000), participants: [VENDEDORA, "ana@cliente.test"], resolvedClientId: clientId } });
  await reunion("r-wherex", wherex.id);
  await reunion("r-honda", honda.id);
  return { quien, wherex, honda };
}

describe("lo prometido en las reuniones, por empresa", () => {
  it("solo trae las empresas pedidas", async () => {
    const { quien, wherex, honda } = await mundo();
    await compromiso(wherex.id, "r-wherex");
    await compromiso(honda.id, "r-honda");
    const r = await compromisosDeLasEmpresas(quien(VENDEDORA), [wherex.id], AHORA);
    expect(r.map((c) => c.clientId)).toEqual([wherex.id]);
  });

  it("una tarea cuya reunión ya es de otro cliente no sale", async () => {
    const { quien, wherex } = await mundo();
    await compromiso(wherex.id, "r-honda");
    expect(await compromisosDeLasEmpresas(quien(VENDEDORA), [wherex.id], AHORA)).toEqual([]);
  });

  it("la cita y la reunión las ve quien estuvo; quien no estuvo ve el compromiso sin ellas", async () => {
    const { quien, wherex } = await mundo();
    await compromiso(wherex.id, "r-wherex");
    const [estuvo] = await compromisosDeLasEmpresas(quien(VENDEDORA), [wherex.id], AHORA);
    expect(estuvo!.cita).toBe("Yo te mando la propuesta el viernes");
    expect(estuvo!.reunion?.titulo).toBe("Reunión r-wherex");
    const [noEstuvo] = await compromisosDeLasEmpresas(quien(OTRO), [wherex.id], AHORA);
    expect(noEstuvo!.titulo).toBe(estuvo!.titulo);
    expect(noEstuvo!.cita).toBeNull();
    expect(noEstuvo!.reunion).toBeNull();
  });

  it("una tarea cuya reunión ya es de otro cliente no cuenta como siguiente paso", async () => {
    const { wherex, honda } = await mundo();
    const ajena = await compromiso(wherex.id, "r-honda", { estado: "pendiente", responsableEmail: VENDEDORA });
    const suya = await compromiso(honda.id, "r-honda", { estado: "pendiente", responsableEmail: VENDEDORA });
    expect([...(await tareasDeReunionAjena([ajena.id, suya.id]))]).toEqual([ajena.id]);
  });

  it("una reunión sin dueño resuelto no se da por ajena", async () => {
    const { quien, wherex } = await mundo();
    await prisma.firefliesSession.create({ data: { id: "r-sin-dueno", title: "Sin dueño", date: new Date(+AHORA - 86_400_000), participants: [VENDEDORA] } });
    await compromiso(wherex.id, "r-sin-dueno");
    expect(await compromisosDeLasEmpresas(quien(VENDEDORA), [wherex.id], AHORA)).toHaveLength(1);
  });

  it("lo privado de otra persona no sale ni para un Super Admin", async () => {
    const { quien, wherex } = await mundo();
    await compromiso(wherex.id, "r-wherex", { privada: true, responsableEmail: OTRO });
    expect(await compromisosDeLasEmpresas(quien(DIRECCION), [wherex.id], AHORA)).toEqual([]);
  });

  it("no lee lo del cliente, un correo ni una decisión", async () => {
    const { quien, wherex } = await mundo();
    await compromiso(wherex.id, "r-wherex", { lado: "cliente" });
    await compromiso(wherex.id, "r-wherex", { origen: "correo" });
    await compromiso(wherex.id, "r-wherex", { estado: "rechazada", decision: "rechazada" });
    expect(await compromisosDeLasEmpresas(quien(VENDEDORA), [wherex.id], AHORA)).toEqual([]);
  });

  it("sin empresas no consulta nada", async () => {
    const { quien } = await mundo();
    expect(await compromisosDeLasEmpresas(quien(VENDEDORA), [], AHORA)).toEqual([]);
  });
});
