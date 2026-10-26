/**
 * lib/tareas/noche2.int.test.ts — las escrituras de Tareas de la noche 2 (2026-10-27) contra una base REAL:
 *   · D2 etapa 1: la limpieza de «Por decidir» vence lo que nadie tocó y deja lo que tocó una persona.
 *   · D4: el contacto y el negocio de HubSpot son solo del cliente de la tarea; cambiar el cliente los borra; una tarea
 *     que ya está en HubSpot los deja fijos; crearla allá se reserva una sola vez y se anota una sola vez. INV63.
 *   · H1: la fuente personal se crea una vez y, pausada, sigue pausada.
 *   · P3: una reunión planeada se une una sola vez a la reunión que se hizo.
 *
 * Correr con la base local: `npm run test:int`.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: <T,>(fn: T) => fn, revalidateTag: () => undefined, revalidatePath: () => undefined }));

import { prisma } from "@/lib/db/prisma";
import { contextoDeTareas } from "./servidor";
import {
  anotarCreadaEnHubspot,
  asegurarFuentePersonal,
  crearTarea,
  editarTarea,
  reservarCreacionEnHubspot,
  unirReunionHecha,
  vencerSugerenciasSinDecidir,
} from "./mutaciones";
import { SERIE_PERSONAL, TITULO_DE_LA_FUENTE_PERSONAL } from "./lectura-personal";
import { INV63 } from "@/lib/invariantes/tareas";
import type { ClientesQueVes } from "./clientes";

const LIDIA = "lidia@test.local";
const ELIAS = "elias@test.local";

const conClientes = (...cs: { id: string; name: string }[]): ClientesQueVes => ({
  todos: true,
  ids: new Set(cs.map((c) => c.id)),
  porId: new Map(cs.map((c) => [c.id, { id: c.id, nombre: c.name, kind: "CLIENTE" }])),
});

async function equipo() {
  await prisma.teamMember.createMany({
    data: [
      { name: "Lidia Flores", email: LIDIA, roleEnum: "VENTAS", area: "Ventas" },
      { name: "Elías González", email: ELIAS, roleEnum: "SUPER_ADMIN", area: "Marketing" },
    ],
  });
  const tms = await prisma.teamMember.findMany();
  return (email: string) => contextoDeTareas({ teamMember: tms.find((t) => t.email === email)! });
}

describe("D2 etapa 1 · la limpieza de «Por decidir»", () => {
  it("vence lo que nadie tocó, con su motivo y firmado por el sistema; lo que tocó una persona queda", async () => {
    await equipo();
    const nueva = (titulo: string) =>
      prisma.tarea.create({ data: { titulo, huella: titulo, estado: "propuesta", origen: "reunion", responsableEmail: LIDIA, equipo: "ventas" }, select: { id: true, version: true } });
    const [sola, comentada, tocada] = await Promise.all([nueva("Llamar a Luis"), nueva("Enviar la propuesta"), nueva("Revisar el contrato")]);
    await prisma.tareaComentario.create({ data: { tareaId: comentada.id, autorEmail: LIDIA, cuerpo: "Esta sí va" } });
    await prisma.tareaEvento.create({ data: { tareaId: tocada.id, tipo: "editada", porEmail: LIDIA, datos: {} } });
    // Lo que pidió una persona no es una sugerencia de Nexus: no se vence aunque venga en el lote.
    const pedida = await prisma.tarea.create({
      data: { titulo: "Pedido", huella: "pedido", estado: "propuesta", origen: "pedido", responsableEmail: LIDIA, equipo: "ventas", creadaPorEmail: ELIAS },
      select: { id: true, version: true },
    });

    const n = await vencerSugerenciasSinDecidir(
      [sola, comentada, tocada, pedida].map((t) => ({ id: t.id, version: t.version, motivo: "Su fecha pasó sin que nadie la decidiera.", regla: "fecha" })),
    );
    expect(n).toBe(1);
    const filas = await prisma.tarea.findMany({ select: { id: true, estado: true, decididaPorEmail: true, motivo: true } });
    const de = (id: string) => filas.find((f) => f.id === id)!;
    expect(de(sola.id)).toMatchObject({ estado: "vencida", decididaPorEmail: "sistema", motivo: "Su fecha pasó sin que nadie la decidiera." });
    expect(de(comentada.id).estado).toBe("propuesta");
    expect(de(tocada.id).estado).toBe("propuesta");
    expect(de(pedida.id).estado).toBe("propuesta");
    const ev = await prisma.tareaEvento.findFirst({ where: { tareaId: sola.id, tipo: "decidida" } });
    expect(ev?.porEmail).toBe("sistema");
    // Correrla de nuevo no hace nada: ya no es una propuesta.
    expect(await vencerSugerenciasSinDecidir([{ id: sola.id, version: sola.version + 1, motivo: "x", regla: "fecha" }])).toBe(0);
  });
});

describe("D4 · el seguimiento comercial", () => {
  it("el contacto es solo del cliente de la tarea; cambiar el cliente lo borra", async () => {
    const ctxDe = await equipo();
    const kolbi = await prisma.client.create({ data: { name: "kölbi" } });
    const honda = await prisma.client.create({ data: { name: "Honda" } });
    await prisma.contactoDeHubspot.createMany({
      data: [
        { clientId: kolbi.id, hubspotId: "501", nombre: "Luis" },
        { clientId: honda.id, hubspotId: "777", nombre: "Ana" },
      ],
    });
    const clientes = conClientes({ id: kolbi.id, name: "kölbi" }, { id: honda.id, name: "Honda" });
    const lidia = await ctxDe(LIDIA);
    const t = await crearTarea(lidia, clientes, { titulo: "Llamar a Luis", clientId: kolbi.id, venceEl: "2026-11-02" });
    const v = async () => (await prisma.tarea.findUniqueOrThrow({ where: { id: t.id } })).version;

    await expect(editarTarea(lidia, clientes, t.id, await v(), { hubspotContactId: "777" })).rejects.toMatchObject({ status: 400 });
    await editarTarea(lidia, clientes, t.id, await v(), { hubspotContactId: "501" });
    expect((await prisma.tarea.findUniqueOrThrow({ where: { id: t.id } })).hubspotContactId).toBe("501");

    await editarTarea(lidia, clientes, t.id, await v(), { clientId: honda.id });
    const movida = await prisma.tarea.findUniqueOrThrow({ where: { id: t.id } });
    expect(movida.clientId).toBe(honda.id);
    expect(movida.hubspotContactId).toBeNull();
  });

  it("una tarea que ya está en HubSpot deja fijos el contacto y el negocio", async () => {
    const ctxDe = await equipo();
    const kolbi = await prisma.client.create({ data: { name: "kölbi" } });
    await prisma.contactoDeHubspot.createMany({ data: [{ clientId: kolbi.id, hubspotId: "501", nombre: "Luis" }, { clientId: kolbi.id, hubspotId: "502", nombre: "Marta" }] });
    const clientes = conClientes({ id: kolbi.id, name: "kölbi" });
    const lidia = await ctxDe(LIDIA);
    const t = await crearTarea(lidia, clientes, { titulo: "Llamar a Luis", clientId: kolbi.id, venceEl: "2026-11-02" });
    await prisma.tarea.update({ where: { id: t.id }, data: { hubspotContactId: "501", hubspotTaskId: "9999" } });
    const v = (await prisma.tarea.findUniqueOrThrow({ where: { id: t.id } })).version;
    await expect(editarTarea(lidia, clientes, t.id, v, { hubspotContactId: "502" })).rejects.toMatchObject({ status: 409 });
    // El mismo valor no es un cambio.
    await editarTarea(lidia, clientes, t.id, v, { hubspotContactId: "501", titulo: "Llamar a Luis hoy" });
  });

  it("crearla en HubSpot se reserva una sola vez (la reserva vence) y se anota una sola vez", async () => {
    await equipo();
    const t = await prisma.tarea.create({
      data: { titulo: "Llamar a Luis", huella: "llamar", estado: "pendiente", origen: "mano", responsableEmail: LIDIA, equipo: "ventas", hubspotContactId: "501", creadaPorEmail: LIDIA },
    });
    const ahora = new Date();
    expect(await reservarCreacionEnHubspot(t.id, 10, ahora)).toEqual({ tomada: true, intentoAnterior: null });
    expect((await reservarCreacionEnHubspot(t.id, 10, ahora)).tomada).toBe(false);
    expect(await reservarCreacionEnHubspot(t.id, 10, new Date(+ahora + 11 * 60_000))).toEqual({ tomada: true, intentoAnterior: ahora });
    expect(await anotarCreadaEnHubspot(t.id, { hubspotTaskId: "123", acordado: { titulo: "Llamar a Luis" }, datos: {} })).toBe(true);
    expect(await anotarCreadaEnHubspot(t.id, { hubspotTaskId: "124", acordado: {}, datos: {} })).toBe(false);
    const f = await prisma.tarea.findUniqueOrThrow({ where: { id: t.id } });
    expect(f.hubspotTaskId).toBe("123");
    expect(f.version).toBe(t.version);
    expect((await reservarCreacionEnHubspot(t.id, 10, new Date(+ahora + 60 * 60_000))).tomada).toBe(false);
  });

  it("el CHECK de la base: lo que nació en Nexus se ata a HubSpot solo si no es privado y tiene contacto o negocio", async () => {
    await equipo();
    const base = { huella: "x", estado: "pendiente", origen: "mano", responsableEmail: LIDIA, equipo: "ventas", creadaPorEmail: LIDIA };
    await prisma.tarea.create({ data: { ...base, titulo: "Seguimiento", hubspotTaskId: "1", hubspotContactId: "501" } });
    await prisma.tarea.create({ data: { ...base, titulo: "De HubSpot", origen: "hubspot", hubspotTaskId: "2" } });
    await expect(prisma.tarea.create({ data: { ...base, titulo: "Interna", hubspotTaskId: "3" } })).rejects.toThrow();
    await expect(prisma.tarea.create({ data: { ...base, titulo: "Privada", privada: true, hubspotTaskId: "4", hubspotContactId: "501" } })).rejects.toThrow();
    await expect(prisma.tarea.create({ data: { ...base, titulo: "De HubSpot sin id", origen: "hubspot" } })).rejects.toThrow();
  });

  it("una tarea de Nexus que está en HubSpot no se puede volver «Solo para mí»", async () => {
    const ctxDe = await equipo();
    const lidia = await ctxDe(LIDIA);
    const t = await crearTarea(lidia, conClientes(), { titulo: "Llamar a Luis" });
    await prisma.tarea.update({ where: { id: t.id }, data: { hubspotContactId: "501", hubspotTaskId: "77" } });
    const v = (await prisma.tarea.findUniqueOrThrow({ where: { id: t.id } })).version;
    await expect(editarTarea(lidia, conClientes(), t.id, v, { privada: true })).rejects.toMatchObject({ status: 409 });
  });

  it("INV63: el contacto de otro cliente viola", async () => {
    await equipo();
    const kolbi = await prisma.client.create({ data: { name: "kölbi" } });
    const honda = await prisma.client.create({ data: { name: "Honda" } });
    await prisma.contactoDeHubspot.create({ data: { clientId: kolbi.id, hubspotId: "501", nombre: "Luis" } });
    const base = { huella: "x", estado: "pendiente", origen: "mano", responsableEmail: LIDIA, equipo: "ventas", creadaPorEmail: LIDIA };
    await prisma.tarea.create({ data: { ...base, titulo: "Bien", clientId: kolbi.id, hubspotContactId: "501" } });
    expect((await INV63.correr(prisma, new Date())).ok).toBe(true);
    await prisma.tarea.create({ data: { ...base, titulo: "Cruzada", clientId: honda.id, hubspotContactId: "501" } });
    expect((await INV63.correr(prisma, new Date())).ok).toBe(false);
  });
});

describe("D4 · crear en HubSpot (con un HubSpot falso)", () => {
  type Pedido = { method: string; path: string; body?: unknown };
  const hubspotFalso = (respuestas: { busqueda?: unknown[] } = {}) => {
    const pedidos: Pedido[] = [];
    let n = 0;
    const responder = (cuerpo: unknown) => ({ ok: true, status: 200, json: async () => cuerpo, text: async () => JSON.stringify(cuerpo) }) as unknown as Response;
    return {
      pedidos,
      hs: {
        apiRequest: async (p: Pedido) => {
          pedidos.push(p);
          if (p.path === "/crm/v3/objects/tasks/search") return responder({ results: respuestas.busqueda ?? [] });
          return responder({ id: `h${++n}` });
        },
      },
    };
  };
  const eq = { ownerDe: (e: string | null) => (e === LIDIA ? "84937900" : null) };

  it("crea solo el seguimiento de su cliente, una vez; ni lo privado, ni lo interno, ni un contacto de otro cliente", async () => {
    await equipo();
    const kolbi = await prisma.client.create({ data: { name: "kölbi", hubspotCompanyId: "300" } });
    const honda = await prisma.client.create({ data: { name: "Honda" } });
    await prisma.contactoDeHubspot.create({ data: { clientId: kolbi.id, hubspotId: "501", nombre: "Luis" } });
    const base = { estado: "pendiente", origen: "mano", responsableEmail: LIDIA, equipo: "ventas", creadaPorEmail: LIDIA, venceEl: new Date("2026-11-02T00:00:00Z") };
    const bien = await prisma.tarea.create({ data: { ...base, titulo: "Llamar a Luis", huella: "a", clientId: kolbi.id, hubspotContactId: "501" } });
    const privada = await prisma.tarea.create({ data: { ...base, titulo: "Privada", huella: "b", clientId: kolbi.id, hubspotContactId: "501", privada: true } });
    const interna = await prisma.tarea.create({ data: { ...base, titulo: "Interna", huella: "c", clientId: kolbi.id } });
    const cruzada = await prisma.tarea.create({ data: { ...base, titulo: "Cruzada", huella: "d", clientId: honda.id, hubspotContactId: "501" } });
    const paso = await prisma.tarea.create({ data: { ...base, titulo: "Paso", huella: "e", origen: "paso", clientId: kolbi.id, hubspotContactId: "501" } });

    const { crearSeguimientos } = await import("@/lib/tareas-hubspot/sync-server");
    const f = hubspotFalso();
    const r = await crearSeguimientos(f.hs as never, eq, null, new Date(), false);
    expect(r).toEqual({ creadas: 1, errores: [] });
    const posts = f.pedidos.filter((p) => p.method === "POST" && p.path === "/crm/v3/objects/tasks");
    expect(posts).toHaveLength(1);
    const cuerpo = posts[0]!.body as { properties: Record<string, string>; associations: { to: { id: string } }[] };
    expect(cuerpo.properties.hs_task_subject).toBe("Llamar a Luis");
    expect(cuerpo.associations.map((a) => a.to.id)).toEqual(["501", "300"]);

    const filas = await prisma.tarea.findMany({ select: { id: true, hubspotTaskId: true, hubspotError: true } });
    const de = (id: string) => filas.find((x) => x.id === id)!;
    expect(de(bien.id).hubspotTaskId).toBe("h1");
    for (const t of [privada, interna, paso]) expect(de(t.id).hubspotTaskId).toBeNull();
    expect(de(cruzada.id)).toMatchObject({ hubspotTaskId: null, hubspotError: expect.stringContaining("tienen que ser de su cliente") });

    // Otra corrida no crea otra.
    const f2 = hubspotFalso();
    expect((await crearSeguimientos(f2.hs as never, eq, null, new Date(), false)).creadas).toBe(0);
    expect(f2.pedidos.filter((p) => p.path === "/crm/v3/objects/tasks")).toHaveLength(0);
  });

  it("un reintento adopta la que HubSpot ya había creado en vez de crear otra; los intentos no mueven `updatedAt`", async () => {
    await equipo();
    const kolbi = await prisma.client.create({ data: { name: "kölbi" } });
    await prisma.contactoDeHubspot.create({ data: { clientId: kolbi.id, hubspotId: "501", nombre: "Luis" } });
    const t = await prisma.tarea.create({
      data: { titulo: "Llamar a Luis", huella: "a", estado: "pendiente", origen: "mano", responsableEmail: LIDIA, equipo: "ventas", creadaPorEmail: LIDIA, clientId: kolbi.id, hubspotContactId: "501", venceEl: new Date("2026-11-02T00:00:00Z") },
    });
    // Un intento anterior que se cayó al volver: la reserva quedó hace 30 minutos.
    const hace30 = new Date(Date.now() - 30 * 60_000);
    await prisma.tarea.update({ where: { id: t.id }, data: { hubspotSincronizadaAt: hace30 } });
    const antes = (await prisma.tarea.findUniqueOrThrow({ where: { id: t.id } })).updatedAt;
    const { crearSeguimientos } = await import("@/lib/tareas-hubspot/sync-server");
    const f = hubspotFalso({ busqueda: [{ id: "777", properties: { hs_task_body: `<p>Creada desde Nexus (T-${t.numero}).</p>` } }] });
    expect((await crearSeguimientos(f.hs as never, eq, [t.id], new Date(), false)).creadas).toBe(1);
    expect(f.pedidos.filter((p) => p.path === "/crm/v3/objects/tasks")).toHaveLength(0);
    const despues = await prisma.tarea.findUniqueOrThrow({ where: { id: t.id } });
    expect(despues.hubspotTaskId).toBe("777");
    expect(+despues.updatedAt).toBe(+antes);
  });
});

describe("H1 · la lectura personal de otra persona", () => {
  it("quien pide una reunión que leyó la lectura personal de otra la vuelve a leer como la de siempre", async () => {
    const ctxDe = await equipo();
    const fuente = await asegurarFuentePersonal(ELIAS, SERIE_PERSONAL, TITULO_DE_LA_FUENTE_PERSONAL);
    const sesion = await prisma.firefliesSession.create({ data: { id: "fx-n2-personal", title: "Revisión interna", date: new Date(Date.now() - 3_600_000), participants: [LIDIA, ELIAS] } });
    const l = await prisma.lecturaDeReunion.create({ data: { sessionId: sesion.id, equipo: "marketing", rol: "planning", semana: new Date(), estado: "lista", pedidaPorEmail: ELIAS, fuenteId: fuente.id } });
    const { pedirLectura } = await import("./lectura");
    const lidia = await ctxDe(LIDIA);
    const r = await pedirLectura(lidia, conClientes(), { sessionId: sesion.id });
    expect(r).toMatchObject({ id: l.id, estado: "leyendo", yaLeida: false });
    const fila = await prisma.lecturaDeReunion.findUniqueOrThrow({ where: { id: l.id } });
    expect(fila).toMatchObject({ fuenteId: null, pedidaPorEmail: LIDIA });
    // La dueña de la personal no la retoma: para ella ya está leída.
    const otra = await prisma.lecturaDeReunion.update({ where: { id: l.id }, data: { estado: "lista", fuenteId: fuente.id, pedidaPorEmail: ELIAS } });
    expect((await pedirLectura(await ctxDe(ELIAS), conClientes(), { sessionId: sesion.id })).yaLeida).toBe(true);
    expect(otra.fuenteId).toBe(fuente.id);
  });
});

describe("H1 · la fuente personal", () => {
  it("se crea una vez; pausada, sigue pausada", async () => {
    const a = await asegurarFuentePersonal(ELIAS, SERIE_PERSONAL, TITULO_DE_LA_FUENTE_PERSONAL);
    const b = await asegurarFuentePersonal(ELIAS.toUpperCase(), SERIE_PERSONAL, TITULO_DE_LA_FUENTE_PERSONAL);
    expect(b.id).toBe(a.id);
    expect(await prisma.fuenteDeTareas.count()).toBe(1);
    const f = await prisma.fuenteDeTareas.findUniqueOrThrow({ where: { id: a.id } });
    expect(f).toMatchObject({ equipo: null, duenoEmail: ELIAS, serie: SERIE_PERSONAL, personas: [ELIAS], activa: true });
    await prisma.fuenteDeTareas.update({ where: { id: a.id }, data: { activa: false } });
    expect((await asegurarFuentePersonal(ELIAS, SERIE_PERSONAL, TITULO_DE_LA_FUENTE_PERSONAL)).activa).toBe(false);
  });
});

describe("P3 · la reunión planeada y la que se hizo", () => {
  it("se une una sola vez, firmado por el sistema, sin subir la versión", async () => {
    await equipo();
    const kolbi = await prisma.client.create({ data: { name: "kölbi" } });
    const sesion = await prisma.firefliesSession.create({ data: { id: "gmeet_ev1", title: "Reunión kölbi", date: new Date(), participants: [LIDIA], resolvedClientId: kolbi.id } });
    const t = await prisma.tarea.create({
      data: { titulo: "Reunión con kölbi", huella: "reunion", estado: "pendiente", origen: "mano", clase: "reunion", reunionInicio: new Date(), responsableEmail: LIDIA, equipo: "ventas", clientId: kolbi.id, creadaPorEmail: LIDIA },
    });
    expect(await unirReunionHecha(t.id, sesion.id)).toBe(true);
    expect(await unirReunionHecha(t.id, sesion.id)).toBe(false);
    const f = await prisma.tarea.findUniqueOrThrow({ where: { id: t.id } });
    expect(f.reunionHechaId).toBe(sesion.id);
    expect(f.version).toBe(t.version);
    expect((await prisma.tareaEvento.findFirst({ where: { tareaId: t.id, tipo: "reunion_hecha" } }))?.porEmail).toBe("sistema");
  });
});
