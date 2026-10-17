/**
 * lib/tareas/conversacion.int.test.ts — el nivel 2 de la lectura (docs/tareas-plan.md §7.3) contra una base REAL, con
 * el modelo simulado: sin «Próximos pasos», Nexus lee la conversación solo; con notas, «¿Faltó algo?» la lee con un
 * clic y no repite lo que ya salió de las notas. La cita es lo que dijo la persona, y nada entra solo.
 *
 * Correr con la base local: `npm run test:int`.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: <T,>(fn: T) => fn, revalidateTag: () => undefined, revalidatePath: () => undefined }));
const { crear } = vi.hoisted(() => ({ crear: vi.fn() }));
vi.mock("@/lib/anthropic", () => ({ getAnthropic: () => ({ messages: { create: crear } }) }));

import { prisma } from "@/lib/db/prisma";
import { contextoDeTareas } from "./servidor";
import { estadoDeLectura, pedirConversacion, pedirLectura, procesarConversacion, procesarLectura, type ResumenDeLectura } from "./lectura";
import type { ClientesQueVes } from "./clientes";

const LIDIA = "lidia@test.local";
const ALE = "alejandra@test.local";
const TODOS: ClientesQueVes = { todos: true, ids: new Set(), porId: new Map() };

const TRANSCRIPCION = `Sprint planning - Transcripción
00:00:01

Alejandra Ortega: Bueno, empecemos con lo de la semana. ${"Repasemos cómo vamos con todo. ".repeat(40)}
Lidia Flores: Yo me encargo de mandarle el Excel de leads a Fabio el jueves.
Alejandra Ortega: Perfecto. Y el banner de SAP lo vemos la otra semana.

La transcripción finalizó después de 00:30:00`;

async function equipo() {
  await prisma.teamMember.createMany({
    data: [
      { name: "Lidia Flores", email: LIDIA, roleEnum: "MARKETING", area: "Marketing" },
      { name: "Alejandra Ortega", email: ALE, roleEnum: "MARKETING", area: "Marketing", lideraEquipos: ["marketing"] },
    ],
  });
  const tms = await prisma.teamMember.findMany();
  return (email: string) => contextoDeTareas({ teamMember: tms.find((t) => t.email === email)! });
}

/** La respuesta del modelo: busca la M# de Lidia en el pedido y el turno donde habla. */
function responder(titulos: string[]) {
  crear.mockImplementation(async (pedido: { messages: { content: string }[] }) => {
    const texto = pedido.messages[0].content;
    const m = /(M\d+) Lidia Flores/.exec(texto)![1];
    const turno = Number(/\[(\d+)\] Lidia Flores:/.exec(texto)![1]);
    return {
      stop_reason: "tool_use",
      usage: { input_tokens: 1_200, output_tokens: 90 },
      content: [{ type: "tool_use", id: "x", name: "extraer_tareas", input: { tareas: titulos.map((titulo) => ({ titulo, dueno: m, turno, vence: "jueves" })) } }],
    };
  });
}

describe("nivel 2: la conversación", () => {
  it("sin próximos pasos, Nexus lee la conversación solo: la propuesta lleva lo que dijo la persona", async () => {
    const ctx = await equipo();
    const ale = await ctx(ALE);
    const sesion = await prisma.firefliesSession.create({
      data: { id: "fx-conv-1", title: "Sprint planning de marketing", date: new Date(Date.now() - 3_600_000), participants: [ALE, LIDIA], transcript: TRANSCRIPCION },
    });
    responder(["Enviar el Excel de leads a Fabio"]);
    const l = await pedirLectura(ale, TODOS, { sessionId: sesion.id, equipo: "marketing", rol: "planning" });
    await procesarLectura(l.id);

    const fila = await prisma.lecturaDeReunion.findUniqueOrThrow({ where: { id: l.id } });
    expect(fila).toMatchObject({ estado: "lista", modo: "transcript", leyendoDesde: null });
    const conv = (fila.resumen as unknown as ResumenDeLectura).conversacion!;
    expect(conv).toMatchObject({ estado: "lista", como: "automatica", propuestas: 1, porAsignar: 0 });
    const t = await prisma.tarea.findFirstOrThrow({ where: { lecturaId: l.id } });
    expect(t).toMatchObject({ estado: "propuesta", responsableEmail: LIDIA, titulo: "Enviar el Excel de leads a Fabio", notas: null, pedidaPorTexto: null });
    expect(t.cita).toBe("Lidia Flores: Yo me encargo de mandarle el Excel de leads a Fabio el jueves.");
    expect(t.origenId).toMatch(/^l:.+:c:/);
    // Ya se leyó: no se vuelve a pedir.
    await expect(pedirConversacion(ale, TODOS, l.id)).rejects.toMatchObject({ status: 409 });
    expect((await estadoDeLectura(ale, TODOS, l.id)).conversacion.puede).toBe(false);
  });

  it("«¿Faltó algo?» lee la conversación de una reunión con notas y no repite lo que ya salió", async () => {
    const ctx = await equipo();
    const ale = await ctx(ALE);
    const sesion = await prisma.firefliesSession.create({
      data: {
        id: "fx-conv-2",
        title: "Sprint planning de marketing",
        date: new Date(Date.now() - 3_600_000),
        participants: [ALE, LIDIA],
        transcript: TRANSCRIPCION,
        summary: { overview: "Próximos pasos\n\n[Lidia Flores] Banner: Diseñar el banner de SAP." },
      },
    });
    crear.mockReset();
    const l = await pedirLectura(ale, TODOS, { sessionId: sesion.id, equipo: "marketing", rol: "planning" });
    await procesarLectura(l.id);
    expect(await prisma.tarea.count({ where: { lecturaId: l.id } })).toBe(1);
    // Sin el modelo (la llamada del contexto falla), el contexto es el detalle de la línea.
    expect((await prisma.tarea.findFirstOrThrow({ where: { lecturaId: l.id } })).contexto).toBe("Diseñar el banner de SAP.");
    const antes = await estadoDeLectura(ale, TODOS, l.id);
    expect(antes.conversacion).toMatchObject({ estado: null, puede: true });
    expect(antes.conversacion.costoEstimado).toBeGreaterThan(0);

    // La IA devuelve lo de las notas otra vez y algo nuevo: lo repetido no entra.
    responder(["Diseñar el banner de SAP", "Enviar el Excel de leads a Fabio"]);
    const p = await pedirConversacion(ale, TODOS, l.id);
    expect(p).toMatchObject({ estado: "leyendo", tomada: true });
    // Otra persona que la pide a la vez no lanza otra lectura.
    expect(await pedirConversacion(ale, TODOS, l.id)).toMatchObject({ tomada: false });
    await procesarConversacion(l.id);

    const titulos = (await prisma.tarea.findMany({ where: { lecturaId: l.id }, orderBy: { createdAt: "asc" } })).map((t) => t.titulo);
    expect(titulos).toHaveLength(2);
    expect(titulos[1]).toBe("Enviar el Excel de leads a Fabio");
    const despues = await estadoDeLectura(ale, TODOS, l.id);
    expect(despues.resumen?.conversacion).toMatchObject({ estado: "lista", como: "pedida", propuestas: 1 });
    expect(despues.resumen?.lineas).toBe(1); // el resumen del nivel 1 sigue ahí
    expect(despues.conversacion.puede).toBe(false);
    // Un aviso por persona para lo de la conversación, aparte del de las notas.
    expect(await prisma.aviso.count({ where: { paraEmail: LIDIA, tipo: "tareas.sugerencias" } })).toBe(2);
  });
});

describe("el contexto de lo que sale de las notas (2026-10-09)", () => {
  it("Haiku escribe el contexto de cada línea con el resumen y los detalles", async () => {
    const ctx = await equipo();
    const ale = await ctx(ALE);
    const sesion = await prisma.firefliesSession.create({
      data: {
        id: "fx-conv-3",
        title: "Sprint planning de marketing",
        date: new Date(Date.now() - 3_600_000),
        participants: [ALE, LIDIA],
        summary: {
          overview:
            "Resumen\n\nSe revisó la campaña de SAP de octubre.\n\nPróximos pasos\n\n[Lidia Flores] Banner: Diseñar el banner de SAP.\n\nDetalles\n\n**Banner de SAP:** Lidia comentó que el banner de SAP tiene que estar listo para la campaña de octubre, con el logo nuevo.",
        },
      },
    });
    crear.mockReset();
    crear.mockImplementation(async (pedido: { tools?: { name: string }[]; messages: { content: string }[] }) => {
      if (pedido.tools?.[0]?.name !== "escribir_contextos") throw new Error("no se esperaba otra llamada");
      return {
        stop_reason: "tool_use",
        usage: { input_tokens: 600, output_tokens: 60 },
        content: [{ type: "tool_use", id: "c", name: "escribir_contextos", input: { contextos: [{ L: "L1", contexto: "Es para la campaña de SAP de octubre: tiene que llevar el logo nuevo." }] } }],
      };
    });
    const l = await pedirLectura(ale, TODOS, { sessionId: sesion.id, equipo: "marketing", rol: "planning" });
    await procesarLectura(l.id);
    const t = await prisma.tarea.findFirstOrThrow({ where: { lecturaId: l.id } });
    expect(t.contexto).toBe("Es para la campaña de SAP de octubre: tiene que llevar el logo nuevo.");
    expect(t.notas).toBeNull();
    const pedido = crear.mock.calls[0][0] as { messages: { content: string }[] };
    expect(pedido.messages[0].content).toContain("logo nuevo");
    expect(await prisma.agentRun.count({ where: { agentSlug: "tareas-contexto", status: "DONE" } })).toBe(1);
  });
});
