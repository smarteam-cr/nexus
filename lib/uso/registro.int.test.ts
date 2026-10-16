/**
 * lib/uso/registro.int.test.ts — el latido contra la base de prueba: una fila por persona, sección y día, y las
 * aperturas suman. Correr: `npm run test:int -- lib/uso`.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { anotarApertura } from "./registro-server";
import { usoDelEquipo } from "./lectura-server";

describe("el registro de uso", { timeout: 30_000 }, () => {
  it("la segunda apertura del día suma en la misma fila y mueve la última hora", async () => {
    const t1 = new Date("2026-10-16T15:00:00Z"); // 9:00 en Costa Rica
    const t2 = new Date("2026-10-16T20:30:00Z"); // 14:30
    expect(await anotarApertura("Ana@Smarteamcr.com", "clients", t1)).toBe(true);
    expect(await anotarApertura("ana@smarteamcr.com", "clients", t2)).toBe(true);
    const filas = await prisma.usoDeNexus.findMany();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ personaEmail: "ana@smarteamcr.com", seccion: "clients", dia: "2026-10-16", aperturas: 2 });
    expect(filas[0].primeraAt.toISOString()).toBe(t1.toISOString());
    expect(filas[0].ultimaAt.toISOString()).toBe(t2.toISOString());
  });

  it("otro día u otra sección es otra fila, y el día es el de Costa Rica", async () => {
    await anotarApertura("ana@smarteamcr.com", "clients", new Date("2026-10-17T05:30:00Z")); // 23:30 del 16 en CR
    await anotarApertura("ana@smarteamcr.com", "para-ti", new Date("2026-10-17T05:30:00Z"));
    await anotarApertura("ana@smarteamcr.com", "clients", new Date("2026-10-17T06:30:00Z")); // 00:30 del 17
    const filas = await prisma.usoDeNexus.findMany({ orderBy: [{ dia: "asc" }, { seccion: "asc" }] });
    expect(filas.map((f) => [f.dia, f.seccion, f.aperturas])).toEqual([
      ["2026-10-16", "clients", 1],
      ["2026-10-16", "para-ti", 1],
      ["2026-10-17", "clients", 1],
    ]);
  });

  it("la pantalla junta los días por persona, sin las cuentas de prueba", async () => {
    await prisma.teamMember.createMany({
      data: [
        { name: "Ana Pérez", email: "ana@smarteamcr.com", roleEnum: "CSE", area: "CSE" },
        { name: "Test CSE Uno", email: "test@smarteamcr.com", roleEnum: "CSE", area: "CSE" },
      ],
    });
    const ahora = new Date("2026-10-16T20:00:00Z");
    await anotarApertura("ana@smarteamcr.com", "clients", new Date("2026-10-15T15:00:00Z"));
    await anotarApertura("ana@smarteamcr.com", "tareas", new Date("2026-10-16T15:00:00Z"));
    const u = await usoDelEquipo(ahora);
    expect(u.faltaLaTabla).toBe(false);
    expect(u.personas.map((p) => p.nombre)).toEqual(["Ana Pérez"]);
    const ana = u.personas[0];
    expect(ana.diasConUso).toBe(2);
    expect(ana.diasEstaSemana).toBe(2);
    expect(ana.equipo).toBe("Customer Success");
    expect(ana.horaPrimera).toBe("09:00");
    expect(u.dias).toHaveLength(28);
    expect(u.dias[u.dias.length - 7]).toBe("2026-10-12");
    expect(u.medidoDesde).toBe("2026-10-15");
  });
});
