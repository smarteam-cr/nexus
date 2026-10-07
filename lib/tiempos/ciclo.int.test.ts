/**
 * lib/tiempos/ciclo.int.test.ts — «¿cuánto te tomó?» de punta a punta contra una base REAL.
 *
 * Marcar una tarea hecha pregunta (una sola vez); responder la anota; desmarcar la retira; un avance pregunta por una
 * por tipo de fase; publicar un documento pregunta solo la primera vez; y lo que lee la carga es solo lo respondido.
 * Correr con la base local: `npm run test:int`.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { alDesmarcarTareas, alMarcarTareasHechas, alPublicarDocumento } from "./disparar";
import { misPreguntasPendientes, responderPregunta } from "./preguntas";
import { CONFIG_POR_DEFECTO, type Momento } from "./reglas";
import { csvDeTiempos, datosDeTiempos, tiemposAnotados } from "./resultados";
import { cuantasPendientes } from "./servidor";

const CSE = "ana@test.local";
const VENTAS = "luis@test.local";
const DIA = 24 * 60 * 60 * 1000;

async function activar(momento: Momento, cambio: Record<string, unknown> = {}) {
  const config = { ...CONFIG_POR_DEFECTO[momento], ...cambio } as unknown as Prisma.InputJsonValue;
  await prisma.encuestaDeTiempo.upsert({ where: { momento }, create: { momento, activa: true, config }, update: { activa: true, config } });
}

/** Un cliente con un proyecto, su cronograma de dos fases y unas tareas ya HECHAS (lo que dejó la ruta). */
async function mundo(tareas: { titulo: string; fase?: 0 | 1; party?: "SMARTEAM" | "AMBOS" | "CLIENTE"; vence?: Date }[]) {
  await prisma.teamMember.createMany({
    data: [
      { name: "Ana CSE", email: CSE, roleEnum: "CSE" },
      { name: "Luis Ventas", email: VENTAS, roleEnum: "VENTAS" },
    ],
  });
  const client = await prisma.client.create({ data: { name: "Grupo Prueba" } });
  const project = await prisma.project.create({ data: { clientId: client.id, name: "Implementación Sales Hub" } });
  const timeline = await prisma.projectTimeline.create({ data: { projectId: project.id, anchorStartDate: new Date(Date.now() - 7 * DIA) } });
  const fases = [
    await prisma.timelinePhase.create({ data: { timelineId: timeline.id, name: "Configuración", order: 0, durationWeeks: 4, activityType: "CONFIGURACION" } }),
    await prisma.timelinePhase.create({ data: { timelineId: timeline.id, name: "Adopción", order: 1, durationWeeks: 2, activityType: "ADOPCION" } }),
  ];
  const ids: string[] = [];
  for (const [i, t] of tareas.entries()) {
    const creada = await prisma.timelineTask.create({
      data: {
        phaseId: fases[t.fase ?? 0].id,
        title: t.titulo,
        weekIndex: 0,
        order: i,
        party: t.party ?? "SMARTEAM",
        status: "DONE",
        dueDateOverride: t.vence ?? null,
      },
    });
    ids.push(creada.id);
  }
  return { client, project, ids };
}

describe("al marcar una tarea hecha", () => {
  it("con la pregunta pausada no pregunta nada", async () => {
    const { ids } = await mundo([{ titulo: "Configurar el pipeline" }]);
    expect(await alMarcarTareasHechas({ email: CSE, taskIds: ids, origen: "cronograma" })).toEqual([]);
  });

  it("activa: pregunta UNA vez a quien la marcó, con lo que supone la carga", async () => {
    await activar("TAREA_HECHA");
    const { ids, project } = await mundo([{ titulo: "Configurar el pipeline" }]);
    const [p] = await alMarcarTareasHechas({ email: CSE, taskIds: ids, origen: "cronograma" });
    expect(p.titulo).toBe("Configurar el pipeline");
    expect(p.contexto).toContain("Grupo Prueba");
    expect(p.estimacion).toEqual({ modo: "despues", texto: "La carga supone 2 h para una tarea de Configuración." });
    expect(await alMarcarTareasHechas({ email: CSE, taskIds: ids, origen: "cronograma" })).toEqual([]);

    const fila = await prisma.preguntaDeTiempo.findUniqueOrThrow({ where: { id: p.id } });
    expect(fila).toMatchObject({ personaEmail: CSE, rol: "CSE", projectId: project.id, tipoFase: "CONFIGURACION", party: "SMARTEAM", estimadoMinutos: 120 });
  });

  it("no pregunta en tareas del cliente, a quien no está en la lista, ni por lo marcado más de 14 días tarde", async () => {
    await activar("TAREA_HECHA");
    const { ids } = await mundo([
      { titulo: "Enviar la base de contactos", party: "CLIENTE" },
      { titulo: "Revisar propiedades" },
      { titulo: "Algo de hace un mes", vence: new Date(Date.now() - 20 * DIA) },
    ]);
    expect(await alMarcarTareasHechas({ email: CSE, taskIds: [ids[0]], origen: "cronograma" })).toEqual([]);
    expect(await alMarcarTareasHechas({ email: VENTAS, taskIds: [ids[1]], origen: "cronograma" })).toEqual([]);
    expect(await alMarcarTareasHechas({ email: CSE, taskIds: [ids[2]], origen: "cronograma" })).toEqual([]);
  });

  it("respeta el tope del día", async () => {
    await activar("TAREA_HECHA", { topePorDia: 2 });
    const { ids } = await mundo([{ titulo: "Una" }, { titulo: "Dos" }, { titulo: "Tres" }]);
    for (const id of ids) await alMarcarTareasHechas({ email: CSE, taskIds: [id], origen: "cronograma" });
    expect((await cuantasPendientes(CSE)).total).toBe(2);
  });

  it("responder la anota; otra persona no puede; desmarcar retira lo pendiente y volver a marcar la reabre", async () => {
    await activar("TAREA_HECHA");
    const { ids } = await mundo([{ titulo: "Configurar el pipeline" }, { titulo: "Revisar propiedades" }]);
    const [a] = await alMarcarTareasHechas({ email: CSE, taskIds: [ids[0]], origen: "cronograma" });
    const [b] = await alMarcarTareasHechas({ email: CSE, taskIds: [ids[1]], origen: "cronograma" });
    expect((await misPreguntasPendientes(CSE)).map((p) => p.id).sort()).toEqual([a.id, b.id].sort());

    await expect(responderPregunta(a.id, VENTAS, { accion: "responder", minutos: 90 })).rejects.toThrow("otra persona");
    await responderPregunta(a.id, CSE, { accion: "responder", minutos: 90 });

    await alDesmarcarTareas([ids[0], ids[1]]);
    const [fa, fb] = await Promise.all([
      prisma.preguntaDeTiempo.findUniqueOrThrow({ where: { id: a.id } }),
      prisma.preguntaDeTiempo.findUniqueOrThrow({ where: { id: b.id } }),
    ]);
    expect(fa.estado).toBe("respondida");
    expect(fb.estado).toBe("retirada");
    await expect(responderPregunta(b.id, CSE, { accion: "responder", minutos: 30 })).rejects.toThrow("ya no cuenta");

    const [otra] = await alMarcarTareasHechas({ email: CSE, taskIds: [ids[1]], origen: "cronograma" });
    expect(otra.id).toBe(b.id);
    expect((await prisma.preguntaDeTiempo.findUniqueOrThrow({ where: { id: b.id } })).estado).toBe("pendiente");
  });
});

describe("al aplicar un avance", () => {
  it("pregunta por una por tipo de fase, juntas en un lote", async () => {
    await activar("TAREA_HECHA");
    const { ids } = await mundo([
      { titulo: "Configurar A" },
      { titulo: "Configurar B" },
      { titulo: "Capacitar a ventas", fase: 1, party: "AMBOS" },
      { titulo: "Entregar manual", fase: 1 },
    ]);
    const lote = await alMarcarTareasHechas({ email: CSE, taskIds: ids, origen: "avance" });
    expect(lote).toHaveLength(2);
    expect(new Set(lote.map((p) => p.lote)).size).toBe(1);
    expect(lote[0].lote).not.toBeNull();
    expect(new Set(lote.map((p) => p.contexto.split(" · ")[1]))).toEqual(new Set(["Configuración", "Adopción"]));
  });
});

describe("al publicar un documento", () => {
  it("pregunta solo la primera vez", async () => {
    await activar("DOCUMENTO_PUBLICADO");
    const { project } = await mundo([]);
    const p = await alPublicarDocumento({ email: CSE, projectId: project.id, documento: "diagnostico", yaEstabaPublicado: false });
    expect(p?.titulo).toBe("Diagnóstico");
    expect(await alPublicarDocumento({ email: CSE, projectId: project.id, documento: "diagnostico", yaEstabaPublicado: false })).toBeNull();
    expect(await alPublicarDocumento({ email: CSE, projectId: project.id, documento: "kickoff", yaEstabaPublicado: true })).toBeNull();
  });
});

describe("lo que se mira y lo que lee la carga", () => {
  it("cuenta por tipo de fase, exporta sin correos y la carga lee solo lo respondido", async () => {
    await activar("TAREA_HECHA");
    const { ids, client, project } = await mundo([{ titulo: "Configurar A" }, { titulo: "Configurar B" }, { titulo: "Configurar C" }]);
    const [a] = await alMarcarTareasHechas({ email: CSE, taskIds: [ids[0]], origen: "cronograma" });
    const [b] = await alMarcarTareasHechas({ email: CSE, taskIds: [ids[1]], origen: "cronograma" });
    await alMarcarTareasHechas({ email: CSE, taskIds: [ids[2]], origen: "cronograma" });
    await responderPregunta(a.id, CSE, { accion: "responder", minutos: 60 });
    await responderPregunta(b.id, CSE, { accion: "omitir", motivo: "no_lo_hice" });

    const d = await datosDeTiempos("todo");
    expect(d.calibracion.find((c) => c.tipo === "CONFIGURACION")).toMatchObject({ respuestas: 1, mediana: null, calibra: false });
    const tareas = d.encuestas.find((e) => e.momento === "TAREA_HECHA")!;
    expect(tareas).toMatchObject({ activa: true, preguntas: 3 });
    expect(tareas.tasa).toMatchObject({ respondidas: 1, noLoHice: 1, esperando: 1, porcentaje: 50 });
    expect(d.encuestas.find((e) => e.momento === "CIERRE_SEMANA")).toMatchObject({ disponible: false, activa: false });

    const csv = await csvDeTiempos("todo");
    expect(csv.split("\n")).toHaveLength(4);
    expect(csv).not.toContain("@test.local");
    expect(csv).toContain("No lo hice yo");

    const anotados = await tiemposAnotados({ desde: new Date(Date.now() - DIA), hasta: new Date(Date.now() + DIA) });
    expect(anotados).toEqual([
      expect.objectContaining({ persona: CSE, clienteId: client.id, proyectoId: project.id, tareaId: ids[0], minutos: 60, origen: "cronograma" }),
    ]);
  });
});
