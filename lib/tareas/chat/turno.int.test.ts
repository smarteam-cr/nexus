/**
 * lib/tareas/chat/turno.int.test.ts — el chat de tareas contra una base REAL, con el modelo simulado (docs/tareas-plan.md
 * §6): un turno deja un acuerdo con sus líneas, dependencias y rótulos (y no escribe ninguna tarea); una fecha que la
 * persona no dijo vuelve al modelo una vez; lo pendiente se arrastra y se descarta con cascada; el contexto no lleva la
 * cita de una reunión.
 *
 * Correr con la base local: `npm run test:int`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: <T,>(fn: T) => fn, revalidateTag: () => undefined, revalidatePath: () => undefined }));
const { crear } = vi.hoisted(() => ({ crear: vi.fn() }));
vi.mock("@/lib/anthropic", () => ({ getAnthropic: () => ({ messages: { create: crear } }) }));

import { prisma } from "@/lib/db/prisma";
import { abrirHilo, hiloVivo } from "@/lib/asistente/hilo";
import { leerAcuerdo } from "@/lib/asistente/acuerdo";
import { contextoDeTareas } from "../servidor";
import type { ClientesQueVes } from "../clientes";
import { contextoDelChatDeTareas } from "./contexto";
import { correrTurnoDeTareas } from "./turno";
import { aplicarDelChat } from "./aplicar";
import { decidirProyecto, editarProyecto, mantenimientoDelLunes } from "../mutaciones";
import { agregarTurno } from "@/lib/asistente/hilo";
import { marcaDeAcuerdo } from "@/lib/asistente/acuerdo";

const LIDIA = "lidia@test.local";
const ALE = "alejandra@test.local";
const MARCO = "marco@test.local";
const TODOS: ClientesQueVes = { todos: true, ids: new Set(), porId: new Map() };

async function lidia() {
  await prisma.teamMember.createMany({
    data: [
      { name: "Lidia Flores", email: LIDIA, roleEnum: "MARKETING", area: "Marketing" },
      { name: "Alejandra Ortega", email: ALE, roleEnum: "MARKETING", area: "Marketing", lideraEquipos: ["marketing"] },
      { name: "Marco Salas", email: MARCO, roleEnum: "VENTAS", area: "Ventas" },
    ],
  });
  const tm = await prisma.teamMember.findFirstOrThrow({ where: { email: LIDIA } });
  return { ctx: await contextoDeTareas({ teamMember: tm }), clientes: TODOS };
}

/** La M# de una persona en el pedido que recibió el modelo. */
function m(pedido: { system: { text: string }[] }, nombre: string): string {
  return new RegExp(`(M\\d+) ${nombre}`).exec(pedido.system.map((s) => s.text).join("\n"))![1];
}

const herramienta = (input: unknown, id = "t1") => ({ type: "tool_use", id, name: "registrar_cambio_acordado", input });
const respuesta = (...content: unknown[]) => ({ stop_reason: "tool_use", usage: { input_tokens: 1_000, output_tokens: 100 }, content });

const PEDIDO = { dueno: { personal: true } as const, pieza: "tareas", usuarioEmail: LIDIA, modelo: "claude-sonnet-5" };

beforeEach(() => {
  // ⚠ Con llaves: `mockReset()` devuelve el mock, y una función que devuelve beforeEach se corre como limpieza.
  crear.mockReset();
});

describe("el chat de tareas", () => {
  it("un turno deja un acuerdo (líneas, dependencias, rótulos) y no escribe ninguna tarea", async () => {
    const quien = await lidia();
    crear.mockImplementation(async (pedido) =>
      respuesta(
        { type: "text", text: "Te anoto una y le sugiero otra a Marco." },
        herramienta({
          resumen: "Una para ti y una para Marco",
          operaciones: [
            { op: "tarea.crear", titulo: "Revisar los copies del Radisson", contexto: "Para que el equipo tenga lo que necesita esta semana.", para: "yo", cuando: "manana", minutos: 60 },
            { op: "tarea.crear", titulo: "Dejar administrable la landing de SAP", contexto: "Para que el equipo tenga lo que necesita esta semana.", para: m(pedido, "Marco Salas"), modo: "asignar" },
          ],
        }),
      ),
    );
    const hilo = await abrirHilo(PEDIDO);
    const r = await correrTurnoDeTareas(hilo, "Anótame revisar los copies del Radisson para mañana y asígnale a Marco la landing", quien);

    expect(r.acuerdo?.operaciones).toHaveLength(2);
    expect(r.acuerdo?.lineas?.[1]).toContain("Proponerle a Marco Salas");
    expect(r.acuerdo?.lineas?.[1]).toContain("no puedes asignársela directo");
    expect(r.acuerdo?.rotulos).toEqual(["crear", "proponer:Marco Salas"]);
    expect(r.acuerdo?.dependencias).toEqual([[], []]);
    expect((r.acuerdo?.operaciones?.[0] as { origen?: string }).origen).toMatch(/^c:[0-9a-f]{12}:0$/);
    expect(await prisma.tarea.count()).toBe(0);
    // Quedó guardado y se lee igual.
    const guardado = await hiloVivo(PEDIDO);
    expect(guardado?.turnos).toHaveLength(2);
    expect(leerAcuerdo(guardado!.turnos[1].contenido).acuerdo?.rotulos).toEqual(["crear", "proponer:Marco Salas"]);
    // El pedido: dos bloques cacheados en system y una sola herramienta.
    const pedido = crear.mock.calls[0][0];
    expect(pedido.system).toHaveLength(2);
    expect(pedido.system[1].text.startsWith("TU CONTEXTO")).toBe(true);
    expect(pedido.tools).toHaveLength(1);
  });

  it("una fecha que la persona no dijo vuelve al modelo una vez, y lo corregido entra", async () => {
    const quien = await lidia();
    crear
      .mockImplementationOnce(async () => respuesta(herramienta({ resumen: "x", operaciones: [{ op: "tarea.crear", titulo: "Mandar el reporte", contexto: "Para que el equipo tenga lo que necesita esta semana.", cuando: "2026-12-20" }] })))
      .mockImplementationOnce(async () => respuesta({ type: "text", text: "Corregido." }, herramienta({ resumen: "x", operaciones: [{ op: "tarea.crear", titulo: "Mandar el reporte", contexto: "Para que el equipo tenga lo que necesita esta semana.", cuando: "viernes" }] }, "t2")));
    const hilo = await abrirHilo(PEDIDO);
    const r = await correrTurnoDeTareas(hilo, "anótame mandar el reporte", quien);
    expect(crear).toHaveBeenCalledTimes(2);
    const reintento = crear.mock.calls[1][0].messages.at(-1);
    expect(reintento.content[0]).toMatchObject({ type: "tool_result", tool_use_id: "t1", is_error: true });
    expect(reintento.content[0].content).toContain("no la dijo la persona");
    expect(r.acuerdo?.operaciones).toHaveLength(1);
    expect(r.respuesta).not.toContain("No registré");
  });

  it("lo pendiente se arrastra; descartar el proyecto se lleva sus tareas y deja un acuerdo de cierre", async () => {
    const quien = await lidia();
    crear.mockImplementationOnce(async () =>
      respuesta(
        herramienta({
          resumen: "Un plan",
          operaciones: [
            { op: "proyecto.crear", ref: "onb1", nombre: "Onboarding de kölbi", inicia: "lunes" },
            { op: "tarea.crear", ref: "k1", titulo: "Hacer el kickoff interno", contexto: "Para que el equipo tenga lo que necesita esta semana.", para: "yo", proyecto: "onb1", dia: 1 },
            { op: "tarea.crear", titulo: "Configurar el pipeline", contexto: "Para que el equipo tenga lo que necesita esta semana.", para: "nadie", proyecto: "onb1", dia: 6, despuesDe: ["k1"] },
          ],
        }),
      ),
    );
    const hilo = await abrirHilo(PEDIDO);
    const r1 = await correrTurnoDeTareas(hilo, "arma un plan de onboarding", quien);
    expect(r1.acuerdo?.dependencias).toEqual([[], [0], [0, 1]]);
    expect(r1.acuerdo?.rotulos).toEqual(["proyecto", "plan", "plan"]);

    // Segundo turno: una pregunta sin cambios. Lo pendiente sigue, arrastrado al acuerdo nuevo (el botón baja con él).
    crear.mockImplementationOnce(async () => respuesta({ type: "text", text: "El plan arranca el lunes. ¿Algo más?" }));
    const r2 = await correrTurnoDeTareas((await hiloVivo(PEDIDO))!, "¿cuándo arranca?", quien);
    expect(r2.acuerdo?.arrastradas).toEqual([0, 1, 2]);
    expect(crear).toHaveBeenCalledTimes(2);
    expect(crear.mock.calls[1][0].messages.at(-1).content).toContain("P1.");

    // Tercer turno: lo descarta. El proyecto se lleva sus dos tareas; queda un acuerdo de cierre.
    crear.mockImplementationOnce(async () => respuesta({ type: "text", text: "Listo, lo saco." }, herramienta({ resumen: "Sin plan", descartar: ["P1"], operaciones: [] })));
    const r3 = await correrTurnoDeTareas((await hiloVivo(PEDIDO))!, "olvídalo", quien);
    expect(r3.acuerdo).toMatchObject({ operaciones: [] });
    expect(r3.acuerdo?.descartadas).toHaveLength(3);
  });

  it("el contexto no lleva la cita de una reunión, y el chip de la tarea tampoco", async () => {
    const quien = await lidia();
    const sesion = await prisma.firefliesSession.create({ data: { id: "fx-chat-1", title: "Sprint planning", date: new Date(Date.now() - 3_600_000), participants: [LIDIA, ALE] } });
    const t = await prisma.tarea.create({
      data: {
        titulo: "Enviar el Excel de leads a Fabio",
        huella: "enviar excel leads fabio",
        estado: "pendiente",
        equipo: "marketing",
        responsableEmail: LIDIA,
        origen: "reunion",
        sessionId: sesion.id,
        cita: "[Lidia Flores] Enviar el Excel de leads a Fabio: el jueves sin falta",
        notas: "el jueves sin falta",
        creadaPorEmail: LIDIA,
      },
    });
    const c = await contextoDelChatDeTareas(quien.ctx, quien.clientes, { chip: { tipo: "tarea", id: t.id } });
    expect(c.texto).toContain(`T-${t.numero} «Enviar el Excel de leads a Fabio»`);
    expect(c.texto).not.toContain("sin falta");
    expect(c.chip).toContain("SOBRE LA TAREA");
    expect(c.chip).not.toContain("sin falta");
    expect(c.foto.tareas.get(t.numero)?.acciones.editar).toBe(true);
  });
});

describe("aplicar lo acordado (todo o nada)", () => {
  async function acordar(quien: Awaited<ReturnType<typeof lidia>>, operaciones: (pedido: { system: { text: string }[] }) => unknown[]) {
    crear.mockImplementationOnce(async (pedido) => respuesta(herramienta({ resumen: "Acordado", operaciones: operaciones(pedido) })));
    const hilo = await abrirHilo(PEDIDO);
    await correrTurnoDeTareas(hilo, "anótame y sugiérele", quien);
    const vivo = (await hiloVivo(PEDIDO))!;
    return vivo.turnos[vivo.turnos.length - 1].id;
  }

  it("crea lo tuyo y la sugerencia, escribe el desenlace en el hilo, y un segundo clic dice «Ya estaba aplicado»", async () => {
    const quien = await lidia();
    const turnoId = await acordar(quien, (p) => [
      { op: "tarea.crear", titulo: "Revisar los copies del Radisson", contexto: "Para que el equipo tenga lo que necesita esta semana.", para: "yo", cuando: "esta_semana" },
      { op: "tarea.crear", titulo: "Dejar administrable la landing", contexto: "Para que el equipo tenga lo que necesita esta semana.", para: m(p, "Marco Salas") },
    ]);
    const r = await aplicarDelChat(quien, LIDIA, turnoId, []);
    expect(r.yaEstaba).toBe(false);
    const mia = await prisma.tarea.findFirstOrThrow({ where: { titulo: "Revisar los copies del Radisson" } });
    expect(mia).toMatchObject({ estado: "pendiente", responsableEmail: LIDIA, origen: "chat", equipo: "marketing" });
    expect(mia.origenId).toMatch(/^c:/);
    const deMarco = await prisma.tarea.findFirstOrThrow({ where: { titulo: "Dejar administrable la landing" } });
    expect(deMarco).toMatchObject({ estado: "propuesta", responsableEmail: MARCO, pedidaPorEmail: LIDIA });
    const hilo = (await hiloVivo(PEDIDO))!;
    expect(hilo.turnos.at(-1)!.shaDeContexto).toBeNull();
    expect(hilo.turnos.at(-1)!.contenido).toContain("✅ Listo");
    // Otro clic: nada nuevo.
    const otra = await aplicarDelChat(quien, LIDIA, turnoId, []);
    expect(otra.yaEstaba).toBe(true);
    expect(await prisma.tarea.count()).toBe(2);
  });

  it("un plan entra como borrador: nadie recibe nada hasta activarlo, y activarlo reparte", async () => {
    const quien = await lidia();
    const turnoId = await acordar(quien, (p) => [
      { op: "proyecto.crear", ref: "onb1", nombre: "Onboarding de kölbi", inicia: "lunes" },
      { op: "tarea.crear", ref: "k1", titulo: "Hacer el kickoff interno", contexto: "Para que el equipo tenga lo que necesita esta semana.", para: "yo", proyecto: "onb1", dia: 1 },
      { op: "tarea.crear", titulo: "Preparar el diagnóstico", contexto: "Para que el equipo tenga lo que necesita esta semana.", para: m(p, "Marco Salas"), proyecto: "onb1", dia: 3, despuesDe: ["k1"] },
    ]);
    const r = await aplicarDelChat(quien, LIDIA, turnoId, []);
    expect(r.proyectos).toEqual([expect.objectContaining({ borrador: true })]);
    const proyecto = await prisma.proyectoDeTareas.findFirstOrThrow({ where: { nombre: "Onboarding de kölbi" } });
    expect(proyecto.estado).toBe("propuesta");
    const enEspera = await prisma.tarea.findMany({ where: { proyectoId: proyecto.id }, orderBy: { numero: "asc" } });
    expect(enEspera.map((t) => [t.responsableEmail, t.equipo, t.semana])).toEqual([[null, null, null], [null, null, null]]);
    expect(await prisma.tareaRelacion.count({ where: { desdeId: enEspera[0].id, haciaId: enEspera[1].id } })).toBe(1);
    expect(await prisma.aviso.count({ where: { tipo: { startsWith: "tareas." } } })).toBe(0);

    await decidirProyecto(quien.ctx, proyecto.id, proyecto.version, "usar");
    const repartidas = await prisma.tarea.findMany({ where: { proyectoId: proyecto.id }, orderBy: { numero: "asc" } });
    expect(repartidas[0]).toMatchObject({ responsableEmail: LIDIA, estado: "pendiente", equipo: "marketing" });
    expect(repartidas[0].semana).not.toBeNull();
    expect(repartidas[1]).toMatchObject({ responsableEmail: MARCO, estado: "propuesta", pedidaPorEmail: LIDIA });
  });

  it("desmarcar el proyecto se lleva sus tareas; si no queda nada, no se aplica", async () => {
    const quien = await lidia();
    const turnoId = await acordar(quien, () => [
      { op: "proyecto.crear", ref: "onb1", nombre: "Onboarding", inicia: "lunes" },
      { op: "tarea.crear", titulo: "Hacer el kickoff", contexto: "Para que el equipo tenga lo que necesita esta semana.", para: "yo", proyecto: "onb1", dia: 1 },
    ]);
    await expect(aplicarDelChat(quien, LIDIA, turnoId, [0])).rejects.toMatchObject({ status: 400 });
    expect(await prisma.proyectoDeTareas.count()).toBe(0);
  });

  it("si algo cambió desde que se acordó, 422 sin escribir nada (y el acuerdo sigue vivo)", async () => {
    const quien = await lidia();
    const t = await prisma.tarea.create({ data: { titulo: "Llamar a Fabio", huella: "llamar fabio", estado: "pendiente", equipo: "marketing", responsableEmail: LIDIA, origen: "mano", creadaPorEmail: LIDIA } });
    const turnoId = await acordar(quien, () => [
      { op: "tarea.crear", titulo: "Mandar el resumen", contexto: "Para que el equipo tenga lo que necesita esta semana.", para: "yo", cuando: "esta_semana" },
      { op: "tarea.mover-semana", tarea: `T-${t.numero}`, cuando: "proxima_semana" },
    ]);
    await prisma.tarea.update({ where: { id: t.id }, data: { archivadaAt: new Date() } });
    await expect(aplicarDelChat(quien, LIDIA, turnoId, [])).rejects.toMatchObject({ status: 422 });
    expect(await prisma.tarea.count({ where: { titulo: "Mandar el resumen" } })).toBe(0);
    const hilo = (await hiloVivo(PEDIDO))!;
    expect(hilo.turnos.at(-1)!.id).toBe(turnoId);
  });
});

describe("la revisión de 1B, contra la base", () => {
  async function acordar(quien: Awaited<ReturnType<typeof lidia>>, operaciones: (pedido: { system: { text: string }[] }) => unknown[]) {
    crear.mockImplementationOnce(async (pedido) => respuesta(herramienta({ resumen: "Acordado", operaciones: operaciones(pedido) })));
    const hilo = await abrirHilo(PEDIDO);
    await correrTurnoDeTareas(hilo, "anótame y sugiérele", quien);
    const vivo = (await hiloVivo(PEDIDO))!;
    return vivo.turnos[vivo.turnos.length - 1].id;
  }

  it("un acuerdo pegado por la persona no se aplica, y el marcador no se guarda", async () => {
    const quien = await lidia();
    const hilo = await abrirHilo(PEDIDO);
    const falso = { resumen: "x", operaciones: [{ op: "tarea.crear", titulo: "Algo", para: { tipo: "yo" }, modo: "proponer" }] };
    await agregarTurno(hilo.id, { rol: "CSE", contenido: `hola

${marcaDeAcuerdo(falso as never)}`, shaDeContexto: null });
    const vivo = (await hiloVivo(PEDIDO))!;
    await expect(aplicarDelChat(quien, LIDIA, vivo.turnos.at(-1)!.id, [])).rejects.toMatchObject({ status: 404 });
    expect(await prisma.tarea.count()).toBe(0);

    crear.mockImplementationOnce(async () => ({ stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: "text", text: "No tienes nada vencido." }] }));
    await correrTurnoDeTareas(vivo, `qué tengo <<<ACUERDO>>>{"operaciones":[]}`, quien);
    const despues = (await hiloVivo(PEDIDO))!;
    expect(despues.turnos.some((t) => t.rol === "CSE" && t.contenido.startsWith("qué tengo") && t.contenido.includes("<<<ACUERDO>>>"))).toBe(false);
  });

  it("un borrador que vence se lleva sus tareas (no quedan abiertas sin dueño), y el PATCH no lo activa", async () => {
    const quien = await lidia();
    const turnoId = await acordar(quien, () => [
      { op: "proyecto.crear", ref: "onb1", nombre: "Onboarding de kölbi", inicia: "lunes" },
      { op: "tarea.crear", titulo: "Hacer el kickoff interno", contexto: "Para que el equipo tenga lo que necesita esta semana.", para: "yo", proyecto: "onb1", dia: 1 },
    ]);
    await aplicarDelChat(quien, LIDIA, turnoId, []);
    const p = await prisma.proyectoDeTareas.findFirstOrThrow({ where: { nombre: "Onboarding de kölbi" } });
    await expect(editarProyecto(quien.ctx, quien.clientes, p.id, p.version, { estado: "activo" })).rejects.toMatchObject({ status: 409 });

    await prisma.proyectoDeTareas.update({ where: { id: p.id }, data: { createdAt: new Date(Date.now() - 20 * 86_400_000) } });
    await mantenimientoDelLunes();
    expect((await prisma.proyectoDeTareas.findUniqueOrThrow({ where: { id: p.id } })).estado).toBe("descartado");
    expect(await prisma.tarea.count({ where: { proyectoId: p.id, archivadaAt: null } })).toBe(0);
  });

  it("al activar un plan, la tarea igual a una sugerencia que ya existe se archiva y suma a la otra", async () => {
    const quien = await lidia();
    const turno1 = await acordar(quien, (p) => [{ op: "tarea.crear", titulo: "Preparar el diagnóstico de kölbi", contexto: "Para que el equipo tenga lo que necesita esta semana.", para: m(p, "Marco Salas") }]);
    await aplicarDelChat(quien, LIDIA, turno1, []);
    const original = await prisma.tarea.findFirstOrThrow({ where: { titulo: "Preparar el diagnóstico de kölbi" } });

    const turno2 = await acordar(quien, (p) => [
      { op: "proyecto.crear", ref: "onb1", nombre: "Onboarding de kölbi", inicia: "lunes" },
      { op: "tarea.crear", titulo: "Preparar el diagnóstico de kölbi", contexto: "Para que el equipo tenga lo que necesita esta semana.", para: m(p, "Marco Salas"), proyecto: "onb1", dia: 2 },
    ]);
    await aplicarDelChat(quien, LIDIA, turno2, []);
    const proyecto = await prisma.proyectoDeTareas.findFirstOrThrow({ where: { nombre: "Onboarding de kölbi" } });
    await decidirProyecto(quien.ctx, proyecto.id, proyecto.version, "usar");

    const copia = await prisma.tarea.findFirstOrThrow({ where: { proyectoId: proyecto.id } });
    expect(copia.archivadaAt).not.toBeNull();
    expect(copia.mismaQueId).toBe(original.id);
    expect(await prisma.tareaEvento.count({ where: { tareaId: original.id, tipo: "mencionada" } })).toBe(1);
    expect(await prisma.tarea.count({ where: { titulo: "Preparar el diagnóstico de kölbi", archivadaAt: null } })).toBe(1);
  });
});

describe("lo que el chat escribe desde una reunión (2026-10-09)", () => {
  it("la tarea creada con el chip de una reunión queda atada a esa reunión: su contexto va con la regla de la cita", async () => {
    const quien = await lidia();
    const sesion = await prisma.firefliesSession.create({
      data: { id: "fx-chat-reunion-1", title: "Kickoff con un cliente", date: new Date(Date.now() - 3_600_000), participants: [LIDIA], summary: { overview: "Próximos pasos\n\n[Lidia Flores] Banner: cambiar el banner." } },
    });
    crear.mockImplementationOnce(async (pedido) =>
      respuesta(
        herramienta({
          resumen: "Una para Marco",
          operaciones: [{ op: "tarea.crear", titulo: "Cambiar el banner del cliente", contexto: "El cliente pidió cambiar el banner por el logo nuevo.", para: m(pedido, "Marco Salas") }],
        }),
      ),
    );
    const hilo = await abrirHilo(PEDIDO);
    await correrTurnoDeTareas(hilo, "pídele a Marco el banner que salió", quien, { tipo: "reunion", id: sesion.id });
    const vivo = (await hiloVivo(PEDIDO))!;
    await aplicarDelChat(quien, LIDIA, vivo.turnos.at(-1)!.id, []);
    const t = await prisma.tarea.findFirstOrThrow({ where: { titulo: "Cambiar el banner del cliente" } });
    expect(t).toMatchObject({ sessionId: sesion.id, cita: null, contexto: "El cliente pidió cambiar el banner por el logo nuevo." });
  });
});
