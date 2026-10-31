/**
 * lib/servicios/ruta-del-servicio.int.test.ts — la ruta del servicio de SmartLoop no le muestra al cliente una tarea «por
 * validar», contra una base REAL (D0).
 *
 * La ruta se congela al «Subir al cliente». Hasta el 2026-10-24 decidía por su cuenta qué tarea cruzaba (solo sacaba las
 * suspendidas), y una tarea del cliente que inventó el agente le llegaba como algo que él tenía que entregar. Lo encontró
 * /revisar. Correr con la base local: `npm run test:int`.
 */
import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { armarRutaDelServicio } from "./ruta-del-servicio-server";

vi.mock("server-only", () => ({}));

const PIPELINE_SMARTLOOP = "942509592";

describe("armarRutaDelServicio — lo que el cliente tiene que entregar (D0)", () => {
  it("de tres tareas del cliente (confirmada, por validar y suspendida), al cliente solo le llega la confirmada", async () => {
    const cliente = await prisma.client.create({ data: { name: "Cliente SmartLoop (test)" } });
    const proyecto = await prisma.project.create({
      data: { clientId: cliente.id, name: "SmartLoop (test)", hubspotPipelineId: PIPELINE_SMARTLOOP },
    });
    const tl = await prisma.projectTimeline.create({ data: { projectId: proyecto.id, anchorStartDate: new Date("2026-10-26") } });
    const fase = await prisma.timelinePhase.create({
      data: { timelineId: tl.id, name: "Caso 1", order: 0, durationWeeks: 4, startWeek: 0 },
    });
    await prisma.timelineTask.createMany({
      data: [
        { phaseId: fase.id, title: "Enviar la base de contactos", weekIndex: 0, order: 0, party: "CLIENTE" },
        { phaseId: fase.id, title: "Aprobar el pipeline inventado", weekIndex: 1, order: 1, party: "CLIENTE", needsValidation: true },
        { phaseId: fase.id, title: "Algo descartado", weekIndex: 2, order: 2, party: "CLIENTE", status: "SUSPENDED" },
      ],
    });
    const ciclo = await prisma.cicloDeProyecto.create({
      data: { projectId: proyecto.id, numero: 1, desde: new Date("2026-10-26"), hasta: new Date("2026-11-20") },
    });
    await prisma.casoDeUso.create({
      data: { clientId: cliente.id, projectId: proyecto.id, cicloId: ciclo.id, faseId: fase.id, titulo: "Ordenar el pipeline", estado: "en_ciclo" },
    });

    const ruta = await armarRutaDelServicio(proyecto.id, new Date("2026-10-27T12:00:00Z"));

    expect(ruta, "el proyecto no se reconoció como servicio recurrente").not.toBeNull();
    const delCliente = ruta!.ciclos.flatMap((c) => c.casos.flatMap((x) => x.delCliente.map((d) => d.titulo)));
    expect(delCliente).toEqual(["Enviar la base de contactos"]);
  });

  it("sin ninguna fila de ciclo se sube igual, con la etapa de HubSpot, y no escribe nada (Elías, 31 oct)", async () => {
    const cliente = await prisma.client.create({ data: { name: "Cliente SmartLoop sin ciclos (test)" } });
    const proyecto = await prisma.project.create({
      data: {
        clientId: cliente.id,
        name: "SmartLoop de HubSpot (test)",
        hubspotPipelineId: PIPELINE_SMARTLOOP,
        hubspotServiceId: "hs-sin-ciclos",
        hubspotPipelineStageLabel: "Adopción",
      },
    });

    const ruta = await armarRutaDelServicio(proyecto.id, new Date("2026-10-31T12:00:00Z"));

    expect(ruta?.ciclos).toHaveLength(1);
    expect(ruta?.ciclos[0]).toMatchObject({ etapa: "Adopción", cerrado: false, casos: [] });
    expect(await prisma.cicloDeProyecto.count({ where: { projectId: proyecto.id } })).toBe(0);
  });

  it("con todos los ciclos cerrados, la foto suma la etapa de hoy", async () => {
    const cliente = await prisma.client.create({ data: { name: "Cliente SmartLoop con cerrados (test)" } });
    const proyecto = await prisma.project.create({
      data: {
        clientId: cliente.id,
        name: "SmartLoop con cerrados (test)",
        hubspotPipelineId: PIPELINE_SMARTLOOP,
        hubspotServiceId: "hs-cerrados",
        hubspotPipelineStageLabel: "Planificación",
      },
    });
    await prisma.cicloDeProyecto.create({ data: { projectId: proyecto.id, numero: 1, estado: "cerrado" } });

    const ruta = await armarRutaDelServicio(proyecto.id, new Date("2026-10-31T12:00:00Z"));

    expect(ruta?.ciclos.map((c) => [c.numero, c.cerrado, c.etapa])).toEqual([[1, true, null], [2, false, "Planificación"]]);
  });

  it("el ciclo abierto muestra la etapa de HubSpot, no la que quedó guardada", async () => {
    const cliente = await prisma.client.create({ data: { name: "Cliente SmartLoop con ciclo (test)" } });
    const proyecto = await prisma.project.create({
      data: {
        clientId: cliente.id,
        name: "SmartLoop movido en HubSpot (test)",
        hubspotPipelineId: PIPELINE_SMARTLOOP,
        hubspotServiceId: "hs-movido",
        hubspotPipelineStageLabel: "Implementación",
      },
    });
    await prisma.cicloDeProyecto.create({ data: { projectId: proyecto.id, numero: 1, etapa: "diagnostico" } });

    const ruta = await armarRutaDelServicio(proyecto.id, new Date("2026-10-31T12:00:00Z"));

    expect(ruta?.ciclos[0].etapa).toBe("Implementación");
  });
});
