/**
 * lib/tareas/sprint.int.test.ts — la reunión del sprint sin el tope de 5 y con su conversación (2026-10-27, decisión de
 * Elías; lib/tareas/sprint.ts) contra una base REAL, con el modelo simulado: las notas proponen todo lo de cada persona,
 * después Nexus lee la conversación sola y suma lo que faltaba sin repetir, y nada de eso lo vence el tope de «Por
 * decidir». Una lectura pedida a mano sigue cortando en 5.
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
import { estadoDeLectura, pedirConversacion, pedirLectura, procesarLectura, type ResumenDeLectura } from "./lectura";
import { borrarFuente, vencerSugerenciasSinDecidir } from "./mutaciones";
import { MAX_PROPUESTAS_POR_PERSONA_EN_EL_SPRINT, MAX_SUGERENCIAS_POR_PERSONA } from "./reglas";
import type { ClientesQueVes } from "./clientes";

const LIDIA = "lidia@test.local";
const ALE = "alejandra@test.local";
const TODOS: ClientesQueVes = { todos: true, ids: new Set(), porId: new Map() };

const TRANSCRIPCION = `Sprint planning - Transcripción
00:00:01

Alejandra Ortega: Bueno, empecemos con lo de la semana. ${"Repasemos cómo vamos con todo. ".repeat(40)}
Lidia Flores: Yo me encargo de mandarle el Excel de leads a Fabio el jueves.
Alejandra Ortega: Perfecto.

La transcripción finalizó después de 00:30:00`;

/** Siete cosas de Lidia en las notas: más de 5. */
const PASOS = Array.from({ length: 7 }, (_, i) => `[Lidia Flores] Pieza ${i + 1}: Diseñar la pieza ${i + 1} de la campaña de SAP.`).join("\n");

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

/**
 * El modelo: solo responde la lectura de la conversación (las demás llamadas fallan y quedan las de respaldo). `antes`
 * corre mientras «la IA lee»: ahí se prueba lo que pasa si alguien toca «¿Faltó algo?» a la vez.
 */
function responderLaConversacion(antes?: () => Promise<void>) {
  crear.mockReset();
  crear.mockImplementation(async (pedido: { tools?: { name: string }[]; messages: { content: string }[] }) => {
    if (pedido.tools?.[0]?.name !== "extraer_tareas") throw new Error("sin modelo");
    await antes?.();
    const texto = pedido.messages[0].content;
    const m = /(M\d+) Lidia Flores/.exec(texto)![1];
    const turno = Number(/\[(\d+)\] Lidia Flores:/.exec(texto)![1]);
    return {
      stop_reason: "tool_use",
      usage: { input_tokens: 1_200, output_tokens: 90 },
      // Una repetida de las notas (no entra) y una nueva.
      content: [{ type: "tool_use", id: "x", name: "extraer_tareas", input: { tareas: [{ titulo: "Diseñar la pieza 1 de la campaña de SAP", dueno: m, turno }, { titulo: "Enviar el Excel de leads a Fabio", dueno: m, turno, vence: "jueves" }] } }],
    };
  });
}

async function reunion(id: string) {
  return prisma.firefliesSession.create({
    data: { id, title: "Sprint planning de marketing", date: new Date(Date.now() - 3_600_000), participants: [ALE, LIDIA], transcript: TRANSCRIPCION, summary: { overview: `Próximos pasos\n\n${PASOS}` } },
  });
}

describe("la reunión del sprint (2026-10-27)", () => {
  it("propone las 7 de Lidia, después lee la conversación sola y suma lo que faltaba; el tope de «Por decidir» no las vence", async () => {
    const ctx = await equipo();
    const ale = await ctx(ALE);
    const fuente = await prisma.fuenteDeTareas.create({ data: { equipo: "marketing", duenoEmail: ALE, serie: "sprint-mkt", titulo: "sprint planning de marketing", rol: "planning" } });
    const sesion = await reunion("fx-sprint-1");
    // Mientras la IA lee la conversación, la líder toca «¿Faltó algo?»: no se lanza (ni se paga) otra lectura.
    let aLaVez: { tomada: boolean } | null = null;
    responderLaConversacion(async () => {
      aLaVez = await pedirConversacion(ale, TODOS, l.id);
    });

    const l = await pedirLectura(ale, TODOS, { sessionId: sesion.id, equipo: "marketing", rol: "planning", fuenteId: fuente.id });
    await procesarLectura(l.id);
    expect(aLaVez).toMatchObject({ tomada: false });
    expect(crear.mock.calls.filter(([p]) => (p as { tools?: { name: string }[] }).tools?.[0]?.name === "extraer_tareas")).toHaveLength(1);

    const fila = await prisma.lecturaDeReunion.findUniqueOrThrow({ where: { id: l.id } });
    const r = fila.resumen as unknown as ResumenDeLectura;
    expect(r).toMatchObject({ lineas: 7, propuestas: 7, sinLugar: 0, tope: MAX_PROPUESTAS_POR_PERSONA_EN_EL_SPRINT, delSprint: true });
    expect(["lista", "sin_ia"]).toContain(fila.estado); // sin_ia: el modelo de las notas no está (el simulado solo responde la conversación)
    expect(fila.leyendoDesde).toBeNull();
    expect(r.conversacion).toMatchObject({ estado: "lista", como: "automatica", delSprint: true, propuestas: 1 });
    const tareas = await prisma.tarea.findMany({ where: { lecturaId: l.id, responsableEmail: LIDIA } });
    expect(tareas).toHaveLength(8);
    expect(tareas.length).toBeGreaterThan(MAX_SUGERENCIAS_POR_PERSONA);
    // Siguen todas por decidir: el tope de 5 sugerencias de «Por decidir» no vence lo acordado en el sprint.
    expect(tareas.every((t) => t.estado === "propuesta")).toBe(true);
    expect(tareas.filter((t) => t.titulo === "Enviar el Excel de leads a Fabio")).toHaveLength(1);
  });

  it("una lectura pedida a mano de una reunión del equipo sigue cortando en 5 y no lee la conversación sola", async () => {
    const ctx = await equipo();
    const ale = await ctx(ALE);
    const sesion = await reunion("fx-sprint-2");
    responderLaConversacion();

    const l = await pedirLectura(ale, TODOS, { sessionId: sesion.id, equipo: "marketing", rol: "planning" });
    await procesarLectura(l.id);

    const r = (await prisma.lecturaDeReunion.findUniqueOrThrow({ where: { id: l.id } })).resumen as unknown as ResumenDeLectura;
    expect(r).toMatchObject({ propuestas: 5, sinLugar: 2, tope: 5 });
    expect(r.conversacion).toBeUndefined();
    expect(crear.mock.calls.some(([p]) => (p as { tools?: { name: string }[] }).tools?.[0]?.name === "extraer_tareas")).toBe(false);
  });
  it("si falla la conversación, la lectura de las notas queda lista y «¿Faltó algo?» se ofrece", async () => {
    const ctx = await equipo();
    const ale = await ctx(ALE);
    const fuente = await prisma.fuenteDeTareas.create({ data: { equipo: "marketing", duenoEmail: ALE, serie: "sprint-mkt", titulo: "sprint planning de marketing", rol: "planning" } });
    const sesion = await reunion("fx-sprint-3");
    responderLaConversacion();
    const l = await pedirLectura(ale, TODOS, { sessionId: sesion.id, equipo: "marketing", rol: "planning", fuenteId: fuente.id });
    // Se cae algo que no es la IA (la base, un timeout) al armar el pedido de la conversación: la consulta de lo que ya
    // salió de las notas (`take: 100`, solo título y cita).
    const original = prisma.tarea.findMany.bind(prisma.tarea);
    const espia = vi.spyOn(prisma.tarea, "findMany").mockImplementation(((args: { take?: number; select?: Record<string, unknown> }) => {
      if (args?.take === 100 && args.select?.cita && args.select?.titulo && !args.select?.id) return Promise.reject(new Error("se cayó la base")) as never;
      return original(args as never) as never;
    }) as never);
    await procesarLectura(l.id);
    espia.mockRestore();

    const fila = await prisma.lecturaDeReunion.findUniqueOrThrow({ where: { id: l.id } });
    expect(["lista", "sin_ia"]).toContain(fila.estado); // sin_ia: el modelo de las notas no está (el simulado solo responde la conversación)
    expect(fila.leyendoDesde).toBeNull();
    expect(await prisma.tarea.count({ where: { lecturaId: l.id, responsableEmail: LIDIA } })).toBe(7);
    const estado = await estadoDeLectura(ale, TODOS, l.id);
    expect(estado.conversacion).toMatchObject({ estado: "error", motivo: "error", puede: true });
  });

  it("lo de clientes sigue con su tope de 5 aunque la persona tenga lo del sprint, y borrar el sprint no lo devuelve al tope", async () => {
    const ctx = await equipo();
    const ale = await ctx(ALE);
    const fuente = await prisma.fuenteDeTareas.create({ data: { equipo: "marketing", duenoEmail: ALE, serie: "sprint-mkt", titulo: "sprint planning de marketing", rol: "planning" } });
    const sprint = await reunion("fx-sprint-4");
    responderLaConversacion();
    const ls = await pedirLectura(ale, TODOS, { sessionId: sprint.id, equipo: "marketing", rol: "planning", fuenteId: fuente.id });
    await procesarLectura(ls.id);
    const delSprint = await prisma.tarea.findMany({ where: { lecturaId: ls.id, responsableEmail: LIDIA }, select: { id: true } });
    expect(delSprint).toHaveLength(8);
    // La líder cambia la serie: borra la fuente vieja. Lo que salió de ella sigue fuera del tope.
    await borrarFuente(fuente.id);

    // Seis sugerencias viejas de reuniones con clientes, y una lectura a mano que le deja 5 más.
    for (let i = 0; i < 6; i++) {
      await prisma.tarea.create({ data: { titulo: `Cliente ${i}`, huella: `cliente ${i}`, estado: "propuesta", origen: "reunion", responsableEmail: LIDIA, equipo: "marketing", createdAt: new Date(Date.now() - (10 - i) * 86_400_000) } });
    }
    const otra = await prisma.firefliesSession.create({
      data: { id: "fx-sprint-5", title: "Revisión de marketing", date: new Date(Date.now() - 3_600_000), participants: [ALE, LIDIA], summary: { overview: `Próximos pasos\n\n${Array.from({ length: 5 }, (_, i) => `[Lidia Flores] Otra ${i + 1}: Revisar la otra cosa ${i + 1}.`).join("\n")}` } },
    });
    crear.mockReset();
    const lm = await pedirLectura(ale, TODOS, { sessionId: otra.id, equipo: "marketing", rol: "planning" });
    await procesarLectura(lm.id);

    const abiertas = await prisma.tarea.findMany({ where: { responsableEmail: LIDIA, estado: "propuesta" }, select: { id: true } });
    const delSprintAbiertas = abiertas.filter((t) => delSprint.some((d) => d.id === t.id));
    expect(delSprintAbiertas).toHaveLength(8);
    // Lo que no es del sprint quedó en sus 5 más nuevas.
    expect(abiertas.length - delSprintAbiertas.length).toBe(MAX_SUGERENCIAS_POR_PERSONA);

    // La limpieza de «Por decidir» no vence por tope lo del sprint aunque venga en el lote; por la fecha, sí.
    const t = await prisma.tarea.findUniqueOrThrow({ where: { id: delSprint[0]!.id }, select: { id: true, version: true } });
    expect(await vencerSugerenciasSinDecidir([{ id: t.id, version: t.version, motivo: "tope", regla: "tope" }])).toBe(0);
    expect(await vencerSugerenciasSinDecidir([{ id: t.id, version: t.version, motivo: "fecha", regla: "fecha" }])).toBe(1);
  });
});
