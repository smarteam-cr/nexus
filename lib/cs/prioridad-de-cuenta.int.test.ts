/**
 * lib/cs/prioridad-de-cuenta.int.test.ts — los motivos que crea el equipo, contra una base REAL.
 *
 * Correr (con la base local levantada: `npm run db:local -- up`):
 *   npx vitest run lib/cs/prioridad-de-cuenta.int.test.ts --project integration
 *
 * Lo que una prueba pura no ve: que el índice único de `clave` junta lo que solo cambia en mayúsculas o espacios, y que la
 * columna nueva convive con el CHECK de `motivo`, que sigue guardando «otro».
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { prisma } from "@/lib/db/prisma";
import { leerMotivosDelEquipo, MotivoQueNoExiste, registrarPrioridad } from "./prioridad-de-cuenta-server";

const ALEX = { email: "alex@smarteam.test", nombre: "Alex" };
let clientId: string;

beforeEach(async () => {
  clientId = (await prisma.client.create({ data: { name: "Cuenta de prueba" } })).id;
});

describe("«Otro motivo»", () => {
  it("⭐ crea un motivo que queda para todos, y escribirlo distinto no lo repite", async () => {
    const primera = await registrarPrioridad(clientId, { tipo: "marcar", motivo: "otro", motivoNuevo: "  Cambio   de sponsor " }, ALEX);
    expect(primera?.motivoDelEquipo?.nombre).toBe("Cambio de sponsor");

    const otra = (await prisma.client.create({ data: { name: "Otra cuenta" } })).id;
    const segunda = await registrarPrioridad(otra, { tipo: "marcar", motivo: "otro", motivoNuevo: "CAMBIO DE SPONSOR" }, { email: "b@smarteam.test", nombre: null });
    expect(segunda?.motivoDelEquipo).toEqual(primera?.motivoDelEquipo);
    expect(await leerMotivosDelEquipo()).toEqual([primera?.motivoDelEquipo]);
  });

  it("dos personas creándolo a la vez: un motivo y las dos marcas", async () => {
    const otra = (await prisma.client.create({ data: { name: "Otra cuenta" } })).id;
    const marcas = await Promise.all(
      [clientId, otra].map((id) => registrarPrioridad(id, { tipo: "marcar", motivo: "otro", motivoNuevo: "Cambio de sponsor" }, ALEX)),
    );
    expect(marcas[0]?.motivoDelEquipo).toEqual(marcas[1]?.motivoDelEquipo);
    expect(await leerMotivosDelEquipo()).toHaveLength(1);
  });

  it("escribir el nombre de un motivo fijo usa el fijo", async () => {
    const marca = await registrarPrioridad(clientId, { tipo: "marcar", motivo: "otro", motivoNuevo: " smartloop " }, ALEX);
    expect(marca).toMatchObject({ motivo: "smartloop", motivoDelEquipo: null });
    expect(await leerMotivosDelEquipo()).toEqual([]);
  });

  it("se elige uno ya creado por su id; uno que no existe no marca", async () => {
    const creado = await registrarPrioridad(clientId, { tipo: "marcar", motivo: "otro", motivoNuevo: "Cambio de sponsor" }, ALEX);
    const elegida = await registrarPrioridad(clientId, { tipo: "marcar", motivo: "otro", motivoDelEquipoId: creado?.motivoDelEquipo?.id, nota: "en diciembre" }, ALEX);
    expect(elegida).toMatchObject({ motivo: "otro", motivoDelEquipo: creado?.motivoDelEquipo, nota: "en diciembre" });
    await expect(registrarPrioridad(clientId, { tipo: "marcar", motivo: "otro", motivoDelEquipoId: "no-existe" }, ALEX)).rejects.toBeInstanceOf(MotivoQueNoExiste);
  });
});
