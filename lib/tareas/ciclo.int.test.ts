/**
 * lib/tareas/ciclo.int.test.ts — el ciclo de Tareas internas de punta a punta contra una base REAL (docs/tareas-plan.md
 * §13, 1A.1): aceptar en una semana ya revisada cae en la siguiente; «Sigue» desde una semana pasada cae en la de hoy
 * con UN solo pase, y corregirlo a «La terminé» la devuelve a esa semana; dos pedidos iguales de dos personas no se
 * funden; una fusión entre clientes se rechaza; una tarea con otro cliente que su proyecto se rechaza; y quien no ve la
 * cuenta ve el título en su sprint, nunca la cita de la reunión.
 *
 * Correr con la base local: `npm run test:int`.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
// Fuera de un pedido de Next no hay caché incremental: la lista de dominios de la casa se calcula directo.
vi.mock("next/cache", () => ({ unstable_cache: <T,>(fn: T) => fn, revalidateTag: () => undefined, revalidatePath: () => undefined }));

import { prisma } from "@/lib/db/prisma";
import { COLUMNAS_POSTERIORES, contextoDeTareas, cuantasColumnasHay, cuantasTablasHay, olvidarTablasMiradas, TABLAS_DE_TAREAS, tareasDisponible } from "./servidor";
import { INV38 } from "@/lib/invariantes/tareas";
import { archivarComentario, asignar, cerrarSemanaPasadaComoSistema, decidirProyecto, editarTarea, escribirPropuestasDeLectura, escribirProyectoSugerido, quitarVinculoDe, refrescarVinculo, vincular, vincularA, type LectorParaVincular, cambiarEspacio, cambiarEstado, cerrarRevision, comentar, crearEspacio, crearTarea, quitarDelEspacio, decidirTarea, dejarDeEsperar, editarComentario, esperarA, mantenimientoDelLunes, responderRevision } from "./mutaciones";
import { INV40 } from "@/lib/invariantes/tareas";
import { estadoDeLectura, pedirLectura } from "./lectura";
import { normalizar } from "./texto";
import { cargarLoQueDelegaste, cargarComentarios, cargarMetricasDelEquipo, cargarMisTareas, cargarVinculos, cargarVinculosDe, cargarEspacio, cargarMisEspacios, cargarPorCliente, cargarSemanaDePersona, cargarSemanaDelEquipo, cargarTarea, cargarTareasDeLaCuenta } from "./consultas";
import { aDate, lunesDeHoy, sumarSemanas } from "./semana";
import type { ClientesQueVes } from "./clientes";

const LIDIA = "lidia@test.local";
const ALE = "alejandra@test.local";
const ELIAS = "elias@test.local";
const CSE = "ana@test.local";

const TODOS: ClientesQueVes = { todos: true, ids: new Set(), porId: new Map() };
/** Quien ve toda la cartera: `ids` las trae todas (como lo arma clientesQueVesParaTareas). */
const conClientes = (...cs: { id: string; name: string }[]): ClientesQueVes => ({
  todos: true,
  ids: new Set(cs.map((c) => c.id)),
  porId: new Map(cs.map((c) => [c.id, { id: c.id, nombre: c.name, kind: "CLIENTE" }])),
});
const NINGUNO: ClientesQueVes = { todos: false, ids: new Set(), porId: new Map() };

async function equipo() {
  await prisma.teamMember.createMany({
    data: [
      { name: "Lidia Flores", email: LIDIA, roleEnum: "MARKETING", area: "Marketing" },
      // La líder del sprint: `lideraEquipos`.
      { name: "Alejandra Ortega", email: ALE, roleEnum: "MARKETING", area: "Marketing", lideraEquipos: ["marketing"] },
      { name: "Elías González", email: ELIAS, roleEnum: "SUPER_ADMIN", area: "Marketing" },
      { name: "Ana CSE", email: CSE, roleEnum: "CSE", area: "CSE" },
    ],
  });
  const tms = await prisma.teamMember.findMany();
  const ctx = async (email: string) => contextoDeTareas({ teamMember: tms.find((t) => t.email === email)! });
  return { ctx };
}

describe("aceptar y revisar", () => {
  it("aceptar en una semana que ya revisaste cae en la siguiente sin revisar", async () => {
    const { ctx } = await equipo();
    const hoy = lunesDeHoy();
    await prisma.cierreDeSemana.create({ data: { personaEmail: ALE, semana: aDate(hoy), cerradaPor: ALE } });
    // Lidia le sugiere algo a su líder: nace propuesta (una par o una persona del equipo no le asigna a la líder).
    const lidia = await ctx(LIDIA);
    const t = await crearTarea(lidia, TODOS, { titulo: "Diseñar el banner de octubre", para: ALE, cuando: "esta_semana" });
    expect(t.estado).toBe("propuesta");
    const ale = await ctx(ALE);
    const fila = await prisma.tarea.findUniqueOrThrow({ where: { id: t.id } });
    await decidirTarea(ale, TODOS, t.id, fila.version, { tipo: "usar" });
    const despues = await prisma.tarea.findUniqueOrThrow({ where: { id: t.id } });
    expect(despues.estado).toBe("pendiente");
    expect(despues.semana?.toISOString().slice(0, 10)).toBe(sumarSemanas(hoy, 1));
  });

  it("«Sigue» desde una semana pasada cae en la de hoy con un solo pase; corregirlo a «La terminé» la devuelve a esa semana", async () => {
    const { ctx } = await equipo();
    const hoy = lunesDeHoy();
    const pasada = sumarSemanas(hoy, -2);
    const lidia = await ctx(LIDIA);
    // crearTarea no deja crear en una semana pasada (piso en hoy): la que quedó de hace dos semanas se siembra.
    const intento = await crearTarea(lidia, TODOS, { titulo: "Otra", cuando: pasada });
    expect((await prisma.tarea.findUniqueOrThrow({ where: { id: intento.id } })).semana?.toISOString().slice(0, 10)).toBe(hoy);
    const t = await prisma.tarea.create({
      data: { titulo: "Publicar el post de SAP", huella: "post sap", estado: "pendiente", origen: "mano", responsableEmail: LIDIA, equipo: "marketing", semana: aDate(pasada), creadaPorEmail: LIDIA },
    });

    await responderRevision(lidia, pasada, { tareaId: t.id, resultado: "sigue" });
    const siguio = await prisma.tarea.findUniqueOrThrow({ where: { id: t.id } });
    expect(siguio.semana?.toISOString().slice(0, 10)).toBe(hoy);
    const resultados = await prisma.resultadoDeSemana.findMany({ where: { tareaId: t.id } });
    expect(resultados).toHaveLength(1);
    expect(resultados[0].resultado).toBe("pasa");

    // Corregir: ya no está en esa semana, pero se respondió ahí.
    await responderRevision(lidia, pasada, { tareaId: t.id, resultado: "hecha" });
    const hecha = await prisma.tarea.findUniqueOrThrow({ where: { id: t.id } });
    expect(hecha.estado).toBe("hecha");
    expect(hecha.semana?.toISOString().slice(0, 10)).toBe(pasada);
    const r2 = await prisma.resultadoDeSemana.findMany({ where: { tareaId: t.id } });
    expect(r2.map((r) => r.resultado)).toEqual(["hecha"]);
  });
});

describe("pedidos y fusiones", () => {
  it("dos pedidos iguales de dos personas no se funden: son dos propuestas", async () => {
    const { ctx } = await equipo();
    // Dos personas que no lideran su sprint (la líder le asignaría directo).
    const lidia = await ctx(LIDIA);
    const ana = await ctx(CSE);
    const a = await crearTarea(lidia, TODOS, { titulo: "Revisar el blog", para: ELIAS });
    const b = await crearTarea(ana, TODOS, { titulo: "Revisar el blog", para: ELIAS });
    expect(a.yaExistia).toBe(false);
    expect(b.yaExistia).toBe(false);
    expect(a.id).not.toBe(b.id);
    expect(await prisma.tarea.count({ where: { responsableEmail: ELIAS, estado: "propuesta" } })).toBe(2);
  });

  it("una fusión entre tareas de clientes distintos se rechaza", async () => {
    const { ctx } = await equipo();
    const [c1, c2] = await Promise.all([prisma.client.create({ data: { name: "Colby" } }), prisma.client.create({ data: { name: "Ecoquintas" } })]);
    const lidia = await ctx(LIDIA);
    const ale = await ctx(ALE);
    const ves = conClientes(c1, c2);
    const ana = await ctx(CSE);
    void ale;
    const vieja = await crearTarea(lidia, ves, { titulo: "Armar la landing", clientId: c1.id });
    const nueva = await crearTarea(ana, ves, { titulo: "Armar la landing", para: LIDIA, clientId: c2.id });
    expect(nueva.estado).toBe("propuesta");
    const fila = await prisma.tarea.findUniqueOrThrow({ where: { id: nueva.id } });
    await expect(decidirTarea(lidia, ves, nueva.id, fila.version, { tipo: "misma", otraId: vieja.id })).rejects.toMatchObject({ status: expect.any(Number) });
    expect((await prisma.tarea.findUniqueOrThrow({ where: { id: nueva.id } })).estado).toBe("propuesta");
  });

  it("una tarea con otro cliente que su proyecto se rechaza", async () => {
    const { ctx } = await equipo();
    const [c1, c2] = await Promise.all([prisma.client.create({ data: { name: "Colby" } }), prisma.client.create({ data: { name: "Ecoquintas" } })]);
    const ale = await ctx(ALE);
    const espacio = await prisma.espacioDeTareas.create({ data: { nombre: "Marketing", tipo: "equipo", equipo: "marketing", creadoPorEmail: ALE } });
    const proyecto = await prisma.proyectoDeTareas.create({ data: { espacioId: espacio.id, nombre: "Campaña Colby", huella: "campana colby", origen: "mano", clientId: c1.id, creadoPorEmail: ALE, responsableEmail: ALE } });
    await expect(crearTarea(ale, conClientes(c1, c2), { titulo: "Copy del anuncio", proyectoId: proyecto.id, clientId: c2.id })).rejects.toMatchObject({ status: 400 });
  });
});

describe("lo que se ve", () => {
  it("quien no ve la cuenta ve el título en el sprint, nunca la cita de la reunión", async () => {
    const { ctx } = await equipo();
    const cliente = await prisma.client.create({ data: { name: "Wherex" } });
    const sesion = await prisma.firefliesSession.create({
      data: { id: "fx-tareas-1", title: "Seguimiento Wherex", date: new Date(), participants: [ALE], resolvedClientId: cliente.id },
    });
    const hoy = lunesDeHoy();
    await prisma.tarea.create({
      data: {
        titulo: "Mandar el reporte de campaña",
        huella: "x1",
        estado: "pendiente",
        origen: "reunion",
        responsableEmail: ALE,
        equipo: "marketing",
        semana: aDate(hoy),
        clientId: cliente.id,
        sessionId: sesion.id,
        cita: "Le mandamos el reporte el jueves.",
        creadaPorEmail: ALE,
      },
    });
    // Elías (super admin) ve todo, con la cita.
    const elias = await ctx(ELIAS);
    const suya = await cargarSemanaDelEquipo(elias, conClientes(cliente), "marketing", hoy);
    const vistaDeElias = suya.personas.find((p) => p.persona.email === ALE)!.tareas[0];
    expect(vistaDeElias.titulo).toBe("Mandar el reporte de campaña");
    // Lidia, del mismo sprint y sin la cuenta: el título sí (es trabajo de su equipo), la cita no.
    const lidia = await ctx(LIDIA);
    const deLidia = await cargarSemanaDelEquipo(lidia, NINGUNO, "marketing", hoy);
    const vista = deLidia.personas.find((p) => p.persona.email === ALE)!.tareas[0];
    expect(vista.titulo).toBe("Mandar el reporte de campaña");
    expect(vista.salioDe && "cita" in vista.salioDe ? vista.salioDe.cita : null).toBeNull();
    expect(JSON.stringify(vista)).not.toContain("Le mandamos el reporte");
  });
});

describe("el lunes", () => {
  it("vence lo que nadie decidió en 14 días, pasa a «Por asignar» lo de una baja (no lo privado) y muda al sprint de casa", async () => {
    await equipo();
    const hoy = lunesDeHoy();
    const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000);
    const base = { origen: "mano", creadaPorEmail: ELIAS } as const;
    const vieja = await prisma.tarea.create({ data: { ...base, titulo: "Vieja", huella: "vieja", estado: "propuesta", responsableEmail: LIDIA, equipo: "marketing", createdAt: hace(15) } });
    const nueva = await prisma.tarea.create({ data: { ...base, titulo: "Nueva", huella: "nueva", estado: "propuesta", responsableEmail: LIDIA, equipo: "marketing", createdAt: hace(13) } });
    // Ana se da de baja con una abierta y una privada.
    await prisma.teamMember.update({ where: { email: CSE }, data: { deactivatedAt: new Date() } });
    const deAna = await prisma.tarea.create({ data: { ...base, titulo: "Llamar a Wherex", huella: "llamar", estado: "pendiente", responsableEmail: CSE, equipo: "cs", semana: aDate(hoy) } });
    const privada = await prisma.tarea.create({ data: { ...base, titulo: "Lo mío", huella: "mio", estado: "pendiente", responsableEmail: CSE, equipo: "cs", semana: aDate(hoy), privada: true } });
    // Lidia pasó a Ventas: su abierta, que estaba en Marketing, se muda.
    await prisma.teamMember.update({ where: { email: LIDIA }, data: { area: "Ventas" } });
    const deLidia = await prisma.tarea.create({ data: { ...base, titulo: "Copy", huella: "copy", estado: "pendiente", responsableEmail: LIDIA, equipo: "marketing", semana: aDate(hoy) } });

    const r = await mantenimientoDelLunes();
    expect(r).toMatchObject({ vencidas: 1, aPorAsignar: 1, privadasDeBajas: 1 });
    expect((await prisma.tarea.findUniqueOrThrow({ where: { id: vieja.id } })).estado).toBe("vencida");
    expect((await prisma.tarea.findUniqueOrThrow({ where: { id: nueva.id } })).estado).toBe("propuesta");
    const pasada = await prisma.tarea.findUniqueOrThrow({ where: { id: deAna.id } });
    expect(pasada.responsableEmail).toBeNull();
    expect(pasada.semana).toBeNull();
    expect(pasada.equipo).toBe("cs");
    expect((await prisma.tarea.findUniqueOrThrow({ where: { id: privada.id } })).responsableEmail).toBe(CSE);
    const mudada = await prisma.tarea.findUniqueOrThrow({ where: { id: deLidia.id } });
    expect(mudada.equipo).toBe("ventas");
    // Correrlo de nuevo no cambia nada.
    expect(await mantenimientoDelLunes()).toMatchObject({ vencidas: 0, aPorAsignar: 0, mudadas: 0 });
  });
});

describe("revisar con el equipo", () => {
  it("la líder no ve lo privado de la persona; marca lo demás y, si queda algo privado, no cierra a su nombre y le avisa", async () => {
    const { ctx } = await equipo();
    const hoy = lunesDeHoy();
    const base = { origen: "mano", creadaPorEmail: LIDIA, responsableEmail: LIDIA, equipo: "marketing", semana: aDate(hoy), estado: "pendiente" } as const;
    const visible = await prisma.tarea.create({ data: { ...base, titulo: "Post de SAP", huella: "post sap" } });
    await prisma.tarea.create({ data: { ...base, titulo: "Cita médica", huella: "cita medica", privada: true } });
    const ale = await ctx(ALE);
    const semanaDeLidia = await cargarSemanaDePersona(ale, NINGUNO, LIDIA, hoy);
    expect(semanaDeLidia.tareas.map((t) => t.titulo)).toEqual(["Post de SAP"]);
    await responderRevision(ale, hoy, { tareaId: visible.id, resultado: "hecha" });
    const r = await cerrarRevision(ale, LIDIA, hoy);
    expect(r).toEqual({ cerrada: false, faltanSuyas: 1 });
    expect(await prisma.cierreDeSemana.count({ where: { personaEmail: LIDIA } })).toBe(0);
    const aviso = await prisma.aviso.findFirst({ where: { paraEmail: LIDIA, tipo: "tareas.cerrada" } });
    expect(aviso?.titulo).toContain("revisó contigo 1 tarea");
  });
});

describe("comentarios", () => {
  it("comentar avisa a los otros involucrados y no a quien escribió; solo el autor edita; quien no ve la tarea no ve sus comentarios", async () => {
    const { ctx } = await equipo();
    const lidia = await ctx(LIDIA);
    const ana = await ctx(CSE);
    // Ana (CS) le pide algo a Lidia: es de Ana y de Lidia.
    const t = await crearTarea(ana, TODOS, { titulo: "Landing del evento", para: LIDIA });
    const c = await comentar(lidia, t.id, "La landing ya tiene su diseño base.");
    const avisos = await prisma.aviso.findMany({ where: { tipo: "tareas.comentario" }, select: { paraEmail: true } });
    expect(avisos.map((a) => a.paraEmail)).toEqual([CSE]);
    await expect(editarComentario(ana, c.id, "Cambio")).rejects.toMatchObject({ status: 403 });
    await editarComentario(lidia, c.id, "La landing ya tiene diseño.");
    const lista = await cargarComentarios(lidia, t.id);
    expect(lista).toMatchObject([{ cuerpo: "La landing ya tiene diseño.", editado: true, propio: true }]);
    // Una privada de Lidia: Alejandra (su líder, sin ser parte) no ve ni la tarea ni sus comentarios.
    const privada = await crearTarea(lidia, TODOS, { titulo: "Lo mío", privada: true });
    await comentar(lidia, privada.id, "Nota para mí.");
    await expect(cargarComentarios(await ctx(ALE), privada.id)).rejects.toMatchObject({ status: 404 });
    await archivarComentario(lidia, c.id);
    expect(await cargarComentarios(lidia, t.id)).toEqual([]);
  });
});

describe("dependencias", () => {
  it("una tarea espera a otra; un círculo se rechaza; al terminar la que bloquea, le avisa a quien esperaba", async () => {
    const { ctx } = await equipo();
    const lidia = await ctx(LIDIA);
    const ale = await ctx(ALE);
    const disenio = await crearTarea(ale, TODOS, { titulo: "Diseño de la landing" });
    const publicar = await crearTarea(lidia, TODOS, { titulo: "Publicar la landing" });
    await esperarA(lidia, publicar.id, disenio.id);
    const vista = (await cargarTarea(lidia, TODOS, publicar.id)).tarea;
    expect(vista.esperando).toMatchObject([{ numero: disenio.numero, abierta: true, titulo: "Diseño de la landing" }]);
    // El diseño no puede esperar a la publicación: sería un círculo.
    await expect(esperarA(ale, disenio.id, publicar.id)).rejects.toMatchObject({ status: 409 });
    const fila = await prisma.tarea.findUniqueOrThrow({ where: { id: disenio.id } });
    await cambiarEstado(ale, disenio.id, fila.version, "hecha");
    const aviso = await prisma.aviso.findFirst({ where: { paraEmail: LIDIA, tipo: "tareas.dependencia" } });
    expect(aviso?.titulo).toContain(`T-${disenio.numero} está hecha`);
    await dejarDeEsperar(lidia, publicar.id, disenio.id);
    expect((await cargarTarea(lidia, TODOS, publicar.id)).tarea.esperando).toEqual([]);
  });
});

describe("por cliente", () => {
  it("agrupa lo abierto por cliente y lo hecho por la foto de la semana; una privada de otra persona no cuenta", async () => {
    const { ctx } = await equipo();
    const colby = await prisma.client.create({ data: { name: "Colby" } });
    const ves = conClientes(colby);
    const lidia = await ctx(LIDIA);
    const abierta = await crearTarea(lidia, ves, { titulo: "Banner de Colby", clientId: colby.id });
    const hecha = await crearTarea(lidia, ves, { titulo: "Post de Colby", clientId: colby.id });
    await responderRevision(lidia, lunesDeHoy(), { tareaId: hecha.id, resultado: "hecha" });
    await crearTarea(lidia, ves, { titulo: "Lo mío", clientId: colby.id, privada: true });
    const ale = await ctx(ALE);
    const datos = await cargarPorCliente(ale, ves, "semana");
    const fila = datos.grupos.find((g) => g.etiqueta === "Colby");
    expect(fila).toMatchObject({ ambito: "cliente", abiertas: 1, hechas: 1 });
    expect(fila?.tareas.map((t) => t.id)).toEqual([abierta.id]);
  });
});

describe("espacios libres", () => {
  it("Elías crea «Evento SmartAgro» con Lidia y le asigna una tarea directo; Ana, que no es miembro, no lo ve", async () => {
    const { ctx } = await equipo();
    const elias = await ctx(ELIAS);
    const r = await crearEspacio(elias, { nombre: "Evento SmartAgro", visibilidad: "miembros", miembros: [LIDIA] });
    const lidia = await ctx(LIDIA);
    expect((await cargarMisEspacios(lidia)).map((e) => e.nombre)).toEqual(["Evento SmartAgro"]);
    const t = await crearTarea(elias, TODOS, { titulo: "Reservar el salón", para: LIDIA, proyectoId: r.proyectoId });
    expect(t.estado).toBe("pendiente"); // entre miembros de un espacio libre, directo
    const aviso = await prisma.aviso.findFirst({ where: { paraEmail: LIDIA, tipo: "tareas.espacio" } });
    expect(aviso?.titulo).toContain("Evento SmartAgro");
    const ana = await ctx(CSE);
    await expect(cargarEspacio(ana, NINGUNO, r.espacioId)).rejects.toMatchObject({ status: 404 });
    // El único admin no se quita; con un proyecto activo, no se archiva.
    await expect(quitarDelEspacio(elias, r.espacioId, ELIAS)).rejects.toMatchObject({ status: 409 });
    const e = await prisma.espacioDeTareas.findUniqueOrThrow({ where: { id: r.espacioId } });
    await expect(cambiarEspacio(elias, r.espacioId, e.version, { archivar: true })).rejects.toMatchObject({ status: 409 });
  });
});

describe("vínculos", () => {
  it("un registro de HubSpot se vincula con su cliente; quien no lo ve lo ve sin título; otro portal o una empresa ajena no entran", async () => {
    const { ctx } = await equipo();
    const colby = await prisma.client.create({ data: { name: "Colby", hubspotCompanyId: "777" } });
    const honda = await prisma.client.create({ data: { name: "Honda", hubspotCompanyId: "888" } });
    const lector = (empresas: string[]): LectorParaVincular => ({
      portal: async () => "4774209",
      leer: async () => ({ estado: "ok", etiqueta: "Renovación Colby", detalle: "Negocio", empresas }),
    });
    const sinPermisos = { veVentas: false, vePreventa: false };
    const ale = await ctx(ALE);
    const soloColby = conClientes(colby);
    const t = await crearTarea(ale, soloColby, { titulo: "Preparar la renovación", clientId: colby.id });
    await vincular(ale, soloColby, t.id, { tipo: "hubspot", url: "https://app.hubspot.com/contacts/4774209/deal/1" }, sinPermisos, lector(["777"]));
    expect(await cargarVinculos(ale, soloColby, t.id, sinPermisos)).toMatchObject([{ tipo: "hubspot", etiqueta: "Renovación Colby", url: "https://app.hubspot.com/contacts/4774209/deal/1" }]);
    // Lidia (mismo sprint) ve la tarea, pero no la cuenta: el vínculo sale sin título.
    const lidia = await ctx(LIDIA);
    expect(await cargarVinculos(lidia, NINGUNO, t.id, sinPermisos)).toMatchObject([{ etiqueta: null, url: null }]);
    // Un registro de una empresa que no ves no se guarda.
    await expect(vincular(ale, soloColby, t.id, { tipo: "hubspot", url: "https://app.hubspot.com/contacts/4774209/deal/2" }, sinPermisos, lector(["888"]))).rejects.toMatchObject({ status: 403 });
    // Otro portal, tampoco.
    await expect(vincular(ale, soloColby, t.id, { tipo: "hubspot", url: "https://app.hubspot.com/contacts/1/deal/3" }, sinPermisos, lector(["777"]))).rejects.toMatchObject({ status: 400 });
    // Sin poder abrir propuestas, no se vincula una.
    await expect(vincular(ale, soloColby, t.id, { tipo: "propuesta", id: "x" }, sinPermisos, lector([]))).rejects.toMatchObject({ status: 403 });
    expect(await prisma.tareaVinculo.count()).toBe(1);
    void honda;
  });
});

describe("cierre automático", () => {
  it("el sistema revisa la semana pasada de quien no la revisó: pasa a hoy con un pase que no cuenta, y la persona lo corrige", async () => {
    const { ctx } = await equipo();
    const hoy = lunesDeHoy();
    const pasada = sumarSemanas(hoy, -1);
    const t = await prisma.tarea.create({
      data: { titulo: "Cerrar el reporte", huella: "reporte", estado: "pendiente", origen: "mano", responsableEmail: LIDIA, equipo: "marketing", semana: aDate(pasada), creadaPorEmail: LIDIA },
    });
    expect(await cerrarSemanaPasadaComoSistema()).toEqual({ personas: 1, tareas: 1 });
    expect((await prisma.tarea.findUniqueOrThrow({ where: { id: t.id } })).semana?.toISOString().slice(0, 10)).toBe(hoy);
    const lidia = await ctx(LIDIA);
    const mias = await cargarMisTareas(lidia, TODOS);
    expect(mias.cerradaPorElSistema).toEqual({ semana: pasada, pasadas: 1 });
    expect(mias.estaSemana.find((x) => x.id === t.id)?.pases).toBe(0); // el pase del sistema no cuenta
    // Lidia corrige: la había terminado.
    await responderRevision(lidia, pasada, { tareaId: t.id, resultado: "hecha" });
    const corregida = await prisma.tarea.findUniqueOrThrow({ where: { id: t.id } });
    expect(corregida.estado).toBe("hecha");
    expect(corregida.semana?.toISOString().slice(0, 10)).toBe(pasada);
    await cerrarRevision(lidia, LIDIA, pasada);
    expect((await prisma.cierreDeSemana.findFirstOrThrow({ where: { personaEmail: LIDIA } })).cerradaPor).toBe(LIDIA);
    expect((await cargarMisTareas(lidia, TODOS)).cerradaPorElSistema).toBeNull();
    // Correrlo de nuevo no hace nada.
    expect(await cerrarSemanaPasadaComoSistema()).toEqual({ personas: 0, tareas: 0 });
  });
});

describe("métricas del equipo", () => {
  it("cuentan lo que ve quien mira: la privada de otra persona no entra a ninguna cifra", async () => {
    const { ctx } = await equipo();
    const hoy = lunesDeHoy();
    const lidia = await ctx(LIDIA);
    const a = await crearTarea(lidia, TODOS, { titulo: "Banner" });
    const privada = await crearTarea(lidia, TODOS, { titulo: "Lo mío", privada: true });
    await responderRevision(lidia, hoy, { tareaId: a.id, resultado: "hecha" });
    await responderRevision(lidia, hoy, { tareaId: privada.id, resultado: "hecha" });
    const ale = await ctx(ALE);
    const m = await cargarMetricasDelEquipo(ale, "marketing", hoy);
    expect(m.revision.hechas).toBe(1);
    expect(m.comoEntran).toEqual([{ origen: "mano", nombre: "A mano", cuantas: 1 }]);
    // Lidia ve las dos.
    expect((await cargarMetricasDelEquipo(lidia, "marketing", hoy)).revision.hechas).toBe(2);
    // Ana (CS) no ve la semana de Marketing.
    await expect(cargarMetricasDelEquipo(await ctx(CSE), "marketing", hoy)).rejects.toMatchObject({ status: 403 });
  });
});

describe("el tope de sugerencias por persona (fase 1.4, 2026-10-16)", () => {
  it("con más de 10 sugerencias de las reuniones sin decidir, las más viejas vencen solas; lo que pidió una persona no", async () => {
    await equipo();
    const cliente = await prisma.client.create({ data: { name: "Wherex" } });
    // Tres reuniones: cada una le propone como mucho 5 a una persona (ficha A, 2026-10-17).
    const lecturas = [];
    for (const n of [1, 2, 3]) {
      const sesion = await prisma.firefliesSession.create({ data: { id: `fx-tareas-tope-${n}`, title: "Seguimiento Wherex", date: new Date(), participants: [ALE], resolvedClientId: cliente.id } });
      lecturas.push({ sesion, lectura: await prisma.lecturaDeReunion.create({ data: { sessionId: sesion.id, equipo: "marketing", rol: "planning", semana: aDate(lunesDeHoy()), pedidaPorEmail: ALE } }) });
    }
    // Una sugerencia que pidió una persona: no cuenta ni vence por el tope.
    await prisma.tarea.create({ data: { titulo: "Pedido de Elías", huella: "pedido-elias", estado: "propuesta", equipo: "marketing", responsableEmail: LIDIA, origen: "pedido", creadaPorEmail: ELIAS, pedidaPorEmail: ELIAS } });
    const linea = (i: number) => ({
      lineaId: String(i),
      titulo: `Compromiso ${i}`,
      notas: null,
      contexto: null,
      cita: `[Lidia] Compromiso ${i}`,
      responsableEmail: LIDIA,
      equipo: "marketing",
      semana: lunesDeHoy(),
      venceEl: null,
      clientId: cliente.id,
      projectId: null,
      proyectoId: null,
      pedidaPorEmail: null,
      pedidaPorEquipo: null,
      mismaQueId: null,
      sugerido: {},
      porAsignar: false,
    });
    for (const [i, { sesion, lectura }] of lecturas.entries()) {
      const desde = i * 5 + 1;
      const lineas = Array.from({ length: i === 2 ? 2 : 5 }, (_, k) => linea(desde + k));
      await prisma.$transaction((tx) => escribirPropuestasDeLectura(tx, { id: lectura.id, sessionId: sesion.id, tituloReunion: "Seguimiento Wherex", pedidaPorEmail: ALE }, lineas));
    }
    const deLidia = await prisma.tarea.findMany({ where: { responsableEmail: LIDIA }, select: { titulo: true, estado: true } });
    expect(deLidia.filter((t) => t.estado === "propuesta" && t.titulo.startsWith("Compromiso"))).toHaveLength(10);
    expect(deLidia.filter((t) => t.estado === "vencida").map((t) => t.titulo).sort()).toEqual(["Compromiso 1", "Compromiso 2"]);
    expect(deLidia.find((t) => t.titulo === "Pedido de Elías")?.estado).toBe("propuesta");
  });

  it("una reunión le propone como mucho 5 a cada persona, también si se lee dos veces", async () => {
    await equipo();
    const sesion = await prisma.firefliesSession.create({ data: { id: "fx-tareas-cupo", title: "Sprint planning de marketing", date: new Date(), participants: [ALE, LIDIA] } });
    const lectura = await prisma.lecturaDeReunion.create({ data: { sessionId: sesion.id, equipo: "marketing", rol: "planning", semana: aDate(lunesDeHoy()), pedidaPorEmail: ALE } });
    const linea = (i: number, quien: string) => ({
      lineaId: `${quien}-${i}`,
      titulo: `Pieza ${quien} ${i}`,
      notas: null,
      contexto: null,
      cita: `[${quien}] Pieza ${i}`,
      responsableEmail: quien,
      equipo: "marketing",
      semana: lunesDeHoy(),
      venceEl: null,
      clientId: null,
      projectId: null,
      proyectoId: null,
      pedidaPorEmail: null,
      pedidaPorEquipo: null,
      mismaQueId: null,
      sugerido: {},
      porAsignar: false,
    });
    const primera = await prisma.$transaction((tx) =>
      escribirPropuestasDeLectura(tx, { id: lectura.id, sessionId: sesion.id, tituloReunion: "Sprint planning de marketing", pedidaPorEmail: ALE }, [
        ...Array.from({ length: 7 }, (_, i) => linea(i + 1, LIDIA)),
        linea(1, ALE),
      ]),
    );
    expect(primera.creadas.filter((c) => c.responsableEmail === LIDIA)).toHaveLength(5);
    expect(primera.sinLugar.get(LIDIA)).toBe(2);
    // La segunda pasada (la conversación) no le suma nada a Lidia; a Alejandra sí.
    const segunda = await prisma.$transaction((tx) =>
      escribirPropuestasDeLectura(tx, { id: lectura.id, sessionId: sesion.id, tituloReunion: "Sprint planning de marketing", pedidaPorEmail: ALE }, [linea(9, LIDIA), linea(2, ALE)]),
    );
    expect(segunda.creadas.map((c) => c.responsableEmail)).toEqual([ALE]);
    expect(await prisma.tarea.count({ where: { lecturaId: lectura.id, responsableEmail: LIDIA } })).toBe(5);
  });
});

describe("la revisión del 9 de octubre", () => {
  it("lo que sale de una reunión de cliente no lleva su título ni su detalle a quien no estuvo", async () => {
    const { ctx } = await equipo();
    const cliente = await prisma.client.create({ data: { name: "Wherex" } });
    const sesion = await prisma.firefliesSession.create({ data: { id: "fx-tareas-h1", title: "Seguimiento Wherex", date: new Date(), participants: [ALE], resolvedClientId: cliente.id } });
    const lectura = await prisma.lecturaDeReunion.create({ data: { sessionId: sesion.id, equipo: "marketing", rol: "planning", semana: aDate(lunesDeHoy()), pedidaPorEmail: ALE } });
    await prisma.$transaction((tx) =>
      escribirPropuestasDeLectura(tx, { id: lectura.id, sessionId: sesion.id, tituloReunion: "Seguimiento Wherex", pedidaPorEmail: ALE }, [
        {
          lineaId: "1",
          titulo: "Mandar el reporte",
          // Una fila de antes: el detalle de la línea como notas.
          notas: "Le mandamos el reporte el jueves",
          contexto: null,
          cita: "[Equipo] Reporte: Le mandamos el reporte el jueves",
          responsableEmail: null,
          equipo: "marketing",
          semana: null,
          venceEl: null,
          clientId: cliente.id,
          projectId: null,
          proyectoId: null,
          pedidaPorEmail: null,
          pedidaPorEquipo: null,
          mismaQueId: null,
          sugerido: {},
          porAsignar: true,
        },
      ]),
    );
    const deLidia = (await cargarMisTareas(await ctx(LIDIA), NINGUNO)).porAsignar;
    expect(deLidia.map((t) => t.titulo)).toEqual(["Mandar el reporte"]);
    expect(JSON.stringify(deLidia)).not.toContain("Le mandamos el reporte");
    expect(JSON.stringify(deLidia)).not.toContain("Seguimiento Wherex");
    const deElias = (await cargarMisTareas(await ctx(ELIAS), conClientes(cliente))).porAsignar[0];
    expect(deElias.salioDe).toMatchObject({ visible: true, titulo: "Seguimiento Wherex" });
  });

  it("el contexto de una reunión de cliente: lo ve quien la hace si ve al cliente; si no, solo sabe que existe", async () => {
    const { ctx } = await equipo();
    const cliente = await prisma.client.create({ data: { name: "Wherex" } });
    const sesion = await prisma.firefliesSession.create({ data: { id: "fx-tareas-h2", title: "Seguimiento Wherex", date: new Date(), participants: [ALE], resolvedClientId: cliente.id } });
    const lectura = await prisma.lecturaDeReunion.create({ data: { sessionId: sesion.id, equipo: "marketing", rol: "planning", semana: aDate(lunesDeHoy()), pedidaPorEmail: ALE } });
    await prisma.$transaction((tx) =>
      escribirPropuestasDeLectura(tx, { id: lectura.id, sessionId: sesion.id, tituloReunion: "Seguimiento Wherex", pedidaPorEmail: ALE }, [
        {
          lineaId: "2",
          titulo: "Mandar el reporte de leads",
          notas: null,
          contexto: "Wherex lo necesita para su comité: los leads de octubre por canal.",
          cita: "[Lidia Flores] Reporte: mandar los leads de octubre",
          responsableEmail: LIDIA,
          equipo: "marketing",
          semana: lunesDeHoy(),
          venceEl: null,
          clientId: cliente.id,
          projectId: null,
          proyectoId: null,
          pedidaPorEmail: null,
          pedidaPorEquipo: null,
          mismaQueId: null,
          sugerido: {},
          porAsignar: false,
        },
      ]),
    );
    // Lidia no estuvo, pero la hace y ve a Wherex: lo necesita para hacerla.
    const conWherex = (await cargarMisTareas(await ctx(LIDIA), conClientes(cliente))).porDecidir[0];
    expect(conWherex).toMatchObject({ contexto: "Wherex lo necesita para su comité: los leads de octubre por canal.", contextoOculto: null });
    expect(conWherex.salioDe).toMatchObject({ visible: false });
    // Sin ver a Wherex, solo sabe que hay contexto.
    const sinWherex = (await cargarMisTareas(await ctx(LIDIA), NINGUNO)).porDecidir[0];
    expect(sinWherex.contexto).toBeNull();
    expect(sinWherex.contextoOculto).toContain("reunión con un cliente");
    expect(JSON.stringify(sinWherex)).not.toContain("comité");
  });

  it("«Por asignar» no trae lo de un espacio privado a quien no es miembro", async () => {
    const { ctx } = await equipo();
    const r = await crearEspacio(await ctx(ELIAS), { nombre: "Evento SmartAgro", visibilidad: "miembros", miembros: [LIDIA] });
    await prisma.tarea.create({ data: { titulo: "Reservar el salón", huella: "salon", estado: "pendiente", origen: "mano", equipo: "marketing", proyectoId: r.proyectoId, creadaPorEmail: ELIAS } });
    expect((await cargarMisTareas(await ctx(ALE), TODOS)).porAsignar.map((t) => t.titulo)).not.toContain("Reservar el salón");
    expect((await cargarMisTareas(await ctx(LIDIA), TODOS)).porAsignar.map((t) => t.titulo)).toContain("Reservar el salón");
  });

  it("«Sigue» sobre una que ya no se hará la reabre; una propuesta no se revisa", async () => {
    const { ctx } = await equipo();
    const hoy = lunesDeHoy();
    const lidia = await ctx(LIDIA);
    const t = await crearTarea(lidia, TODOS, { titulo: "Post del evento" });
    await cambiarEstado(lidia, t.id, (await prisma.tarea.findUniqueOrThrow({ where: { id: t.id } })).version, "no_se_hara", "Se canceló");
    await responderRevision(lidia, hoy, { tareaId: t.id, resultado: "sigue" });
    const despues = await prisma.tarea.findUniqueOrThrow({ where: { id: t.id } });
    expect(despues).toMatchObject({ estado: "pendiente", motivo: null });
    expect(despues.semana?.toISOString().slice(0, 10)).toBe(sumarSemanas(hoy, 1));
    const propuesta = await crearTarea(await ctx(CSE), TODOS, { titulo: "Revisar el blog", para: LIDIA });
    await expect(responderRevision(lidia, hoy, { tareaId: propuesta.id, resultado: "hecha" })).rejects.toMatchObject({ status: 409 });
  });

  it("reabrir en una semana ya revisada la pasa a la siguiente; volver a terminarla no choca", async () => {
    const { ctx } = await equipo();
    const hoy = lunesDeHoy();
    const lidia = await ctx(LIDIA);
    const t = await crearTarea(lidia, TODOS, { titulo: "Cerrar el reporte" });
    await responderRevision(lidia, hoy, { tareaId: t.id, resultado: "hecha" });
    expect(await cerrarRevision(lidia, LIDIA, hoy)).toMatchObject({ cerrada: true });
    await cambiarEstado(lidia, t.id, (await prisma.tarea.findUniqueOrThrow({ where: { id: t.id } })).version, "pendiente");
    const reabierta = await prisma.tarea.findUniqueOrThrow({ where: { id: t.id } });
    expect(reabierta.semana?.toISOString().slice(0, 10)).toBe(sumarSemanas(hoy, 1));
    expect((await prisma.resultadoDeSemana.findMany({ where: { tareaId: t.id } })).map((r) => r.resultado)).toEqual(["pasa"]);
    expect((await INV40.correr(prisma as never, new Date())).ok).toBe(true);
    await cambiarEstado(lidia, t.id, reabierta.version, "hecha");
    expect((await prisma.tarea.findUniqueOrThrow({ where: { id: t.id } })).estado).toBe("hecha");
  });

  it("pasarle a alguien una tarea igual a una sugerencia tuya sin decidir da 409, no un error", async () => {
    const { ctx } = await equipo();
    const lidia = await ctx(LIDIA);
    await crearTarea(lidia, TODOS, { titulo: "Armar la landing", para: CSE });
    const mia = await crearTarea(lidia, TODOS, { titulo: "Armar la landing" });
    const fila = await prisma.tarea.findUniqueOrThrow({ where: { id: mia.id } });
    await expect(asignar(lidia, mia.id, fila.version, CSE)).rejects.toMatchObject({ status: 409 });
    expect((await prisma.tarea.findUniqueOrThrow({ where: { id: mia.id } })).responsableEmail).toBe(LIDIA);
  });

  it("quien no es miembro no mete tareas en un proyecto privado; un pedido a un equipo sin líder no entra", async () => {
    const { ctx } = await equipo();
    const r = await crearEspacio(await ctx(ELIAS), { nombre: "Evento SmartAgro", visibilidad: "miembros", miembros: [LIDIA] });
    const ana = await ctx(CSE);
    await expect(crearTarea(ana, TODOS, { titulo: "Colarme", proyectoId: r.proyectoId })).rejects.toMatchObject({ status: 404 });
    await expect(crearTarea(await ctx(LIDIA), TODOS, { titulo: "Ayuda", paraEquipo: "cs" })).rejects.toMatchObject({ status: 400 });
    // Con líder: le llega a su «Por decidir», no a «Por asignar»; y quien lo pidió lo ve en lo que pidió.
    const pedido = await crearTarea(ana, TODOS, { titulo: "Piezas para el evento", paraEquipo: "marketing" });
    const deAle = await cargarMisTareas(await ctx(ALE), TODOS);
    expect(deAle.porDecidir.map((t) => t.id)).toContain(pedido.id);
    expect(deAle.porAsignar.map((t) => t.id)).not.toContain(pedido.id);
    expect((await cargarMisTareas(ana, TODOS)).loQuePediste.map((t) => t.id)).toContain(pedido.id);
  });

  it("editar: la cita de una reunión ata al cliente; sin sprint no sale del proyecto; «Solo para mí» es de su responsable", async () => {
    const { ctx } = await equipo();
    const [wherex, honda] = await Promise.all([prisma.client.create({ data: { name: "Wherex" } }), prisma.client.create({ data: { name: "Honda" } })]);
    const sesion = await prisma.firefliesSession.create({ data: { id: "fx-tareas-h6", title: "Seguimiento Wherex", date: new Date(), participants: [ALE], resolvedClientId: wherex.id } });
    const elias = await ctx(ELIAS);
    const ves = conClientes(wherex, honda);
    const conCita = await prisma.tarea.create({
      data: { titulo: "Reporte", huella: "reporte", estado: "pendiente", origen: "reunion", responsableEmail: LIDIA, equipo: "marketing", semana: aDate(lunesDeHoy()), clientId: wherex.id, sessionId: sesion.id, cita: "Le mandamos el reporte.", creadaPorEmail: null },
    });
    await expect(editarTarea(elias, ves, conCita.id, conCita.version, { clientId: honda.id })).rejects.toMatchObject({ status: 400 });
    await editarTarea(elias, ves, conCita.id, conCita.version, { clientId: null });
    expect((await prisma.tarea.findUniqueOrThrow({ where: { id: conCita.id } })).clientId).toBeNull();

    const r = await crearEspacio(elias, { nombre: "Evento", visibilidad: "todos", miembros: [] });
    const sinSprint = await prisma.tarea.create({ data: { titulo: "Salón", huella: "salon", estado: "pendiente", origen: "mano", proyectoId: r.proyectoId, creadaPorEmail: ELIAS } });
    await expect(editarTarea(elias, ves, sinSprint.id, sinSprint.version, { proyectoId: null })).rejects.toMatchObject({ status: 400 });

    const deLidia = await crearTarea(await ctx(LIDIA), TODOS, { titulo: "Lo de Lidia" });
    const v = (await prisma.tarea.findUniqueOrThrow({ where: { id: deLidia.id } })).version;
    await expect(editarTarea(await ctx(ALE), TODOS, deLidia.id, v, { privada: true })).rejects.toMatchObject({ status: 403 });
  });
});

describe("la segunda revisión del 9 de octubre", () => {
  it("un proyecto sugerido de otro cliente no se reusa: las líneas quedan sueltas", async () => {
    await equipo();
    const [wherex, honda] = await Promise.all([prisma.client.create({ data: { name: "Wherex" } }), prisma.client.create({ data: { name: "Honda" } })]);
    const espacio = await prisma.espacioDeTareas.create({ data: { nombre: "Marketing", tipo: "equipo", equipo: "marketing", creadoPorEmail: ALE } });
    const nombre = "Campaña de lanzamiento";
    const deWherex = await prisma.proyectoDeTareas.create({ data: { espacioId: espacio.id, nombre, huella: normalizar(nombre), estado: "propuesta", origen: "reunion", clientId: wherex.id } });
    const grupo = { clave: "G1", nombre, cita: "x" };
    expect(await prisma.$transaction((tx) => escribirProyectoSugerido(tx, { id: "l-x", sessionId: null }, espacio.id, { ...grupo, clientId: honda.id }))).toBeNull();
    expect(await prisma.$transaction((tx) => escribirProyectoSugerido(tx, { id: "l-x", sessionId: null }, espacio.id, { ...grupo, clientId: wherex.id }))).toEqual({ id: deWherex.id, nuevo: false });
  });

  it("«Usar» una propuesta con el cliente de la reunión funciona aunque quien la usa no vea esa cuenta", async () => {
    const { ctx } = await equipo();
    const wherex = await prisma.client.create({ data: { name: "Wherex" } });
    const t = await prisma.tarea.create({
      data: { titulo: "Llamar a Wherex", huella: "llamar", estado: "propuesta", origen: "reunion", responsableEmail: CSE, equipo: "cs", semana: aDate(lunesDeHoy()), clientId: wherex.id },
    });
    await decidirTarea(await ctx(CSE), NINGUNO, t.id, t.version, { tipo: "usar" });
    expect(await prisma.tarea.findUniqueOrThrow({ where: { id: t.id } })).toMatchObject({ estado: "pendiente", clientId: wherex.id });
  });

  it("«Más adelante» con una fecha de esta misma semana no la deja abierta en la semana que se revisa", async () => {
    const { ctx } = await equipo();
    const hoy = lunesDeHoy();
    const lidia = await ctx(LIDIA);
    const t = await crearTarea(lidia, TODOS, { titulo: "Post del jueves" });
    await responderRevision(lidia, hoy, { tareaId: t.id, resultado: "mas_adelante", desde: hoy });
    expect((await prisma.tarea.findUniqueOrThrow({ where: { id: t.id } })).semana?.toISOString().slice(0, 10)).toBe(sumarSemanas(hoy, 1));
    expect(await cerrarRevision(lidia, LIDIA, hoy)).toMatchObject({ cerrada: true });
  });

  it("corregir la revisión de una semana borra lo anotado en la semana a la que la tarea siguió", async () => {
    const { ctx } = await equipo();
    const hoy = lunesDeHoy();
    const pasada = sumarSemanas(hoy, -1);
    const lidia = await ctx(LIDIA);
    const t = await prisma.tarea.create({ data: { titulo: "Reporte", huella: "reporte", estado: "pendiente", origen: "mano", responsableEmail: LIDIA, equipo: "marketing", semana: aDate(pasada), creadaPorEmail: LIDIA } });
    await responderRevision(lidia, pasada, { tareaId: t.id, resultado: "sigue" });
    const siguio = await prisma.tarea.findUniqueOrThrow({ where: { id: t.id } });
    await cambiarEstado(lidia, t.id, siguio.version, "hecha");
    await responderRevision(lidia, pasada, { tareaId: t.id, resultado: "hecha" });
    const resultados = await prisma.resultadoDeSemana.findMany({ where: { tareaId: t.id } });
    expect(resultados.map((r) => [r.semana.toISOString().slice(0, 10), r.resultado])).toEqual([[pasada, "hecha"]]);
  });

  it("descartar un proyecto sugerido suelta también lo que ya estaba aceptado adentro", async () => {
    const { ctx } = await equipo();
    const espacio = await prisma.espacioDeTareas.create({ data: { nombre: "Marketing", tipo: "equipo", equipo: "marketing", creadoPorEmail: ALE } });
    const p = await prisma.proyectoDeTareas.create({ data: { espacioId: espacio.id, nombre: "Evento", huella: "evento", estado: "propuesta", origen: "reunion" } });
    const porAsignar = await prisma.tarea.create({ data: { titulo: "Reservar el salón", huella: "salon", estado: "pendiente", origen: "reunion", equipo: "marketing", proyectoId: p.id } });
    await decidirProyecto(await ctx(ALE), p.id, p.version, "descartar");
    expect((await prisma.tarea.findUniqueOrThrow({ where: { id: porAsignar.id } })).proyectoId).toBeNull();
  });

  it("reintentar una lectura con error toma lo elegido ahora y a nombre de quien reintenta; dos a la vez retoman una vez; una colgada se ve como error", async () => {
    const { ctx } = await equipo();
    const ale = await ctx(ALE);
    const sesion = await prisma.firefliesSession.create({ data: { id: "fx-tareas-r2", title: "Sprint planning", date: new Date(Date.now() - 3_600_000), participants: [ALE, LIDIA] } });
    const l = await prisma.lecturaDeReunion.create({ data: { sessionId: sesion.id, equipo: "ventas", rol: "cierre", semana: aDate(lunesDeHoy()), estado: "error", pedidaPorEmail: ELIAS } });
    const a = await pedirLectura(ale, TODOS, { sessionId: sesion.id, equipo: "marketing", rol: "planning" });
    expect(a.yaLeida).toBe(false);
    expect(await prisma.lecturaDeReunion.findUniqueOrThrow({ where: { id: l.id } })).toMatchObject({ estado: "leyendo", equipo: "marketing", rol: "planning", pedidaPorEmail: ALE, semanaQueCierra: null });
    expect((await pedirLectura(ale, TODOS, { sessionId: sesion.id, equipo: "marketing" })).yaLeida).toBe(true);
    await prisma.lecturaDeReunion.update({ where: { id: l.id }, data: { leyendoDesde: new Date(Date.now() - 30 * 60_000) } });
    expect((await estadoDeLectura(ale, TODOS, l.id)).estado).toBe("error");
  });
});

describe("vínculos de un proyecto", () => {
  it("quien administra el proyecto vincula y actualiza la foto; quien solo lo ve no; «ya no está» queda marcado", async () => {
    const { ctx } = await equipo();
    const colby = await prisma.client.create({ data: { name: "Colby", hubspotCompanyId: "777" } });
    const espacio = await prisma.espacioDeTareas.create({ data: { nombre: "Marketing", tipo: "equipo", equipo: "marketing", creadoPorEmail: ALE } });
    const p = await prisma.proyectoDeTareas.create({ data: { espacioId: espacio.id, nombre: "Campaña Colby", huella: "campana colby", origen: "mano", estado: "activo", creadoPorEmail: ALE, responsableEmail: ALE } });
    const dueno = { tipo: "proyecto" as const, id: p.id };
    const sinPermisos = { veVentas: false, vePreventa: false };
    const lector = (etiqueta: string, estado: "ok" | "no_existe" = "ok"): LectorParaVincular => ({
      portal: async () => "4774209",
      leer: async () => (estado === "ok" ? { estado: "ok", etiqueta, detalle: "Negocio", empresas: ["777"] } : { estado: "no_existe" }),
    });
    const ale = await ctx(ALE);
    const soloColby = conClientes(colby);
    const v = await vincularA(ale, soloColby, dueno, { tipo: "hubspot", url: "https://app.hubspot.com/contacts/4774209/deal/9" }, sinPermisos, lector("Renovación Colby"));
    expect(await cargarVinculosDe(ale, soloColby, dueno, sinPermisos)).toMatchObject([{ etiqueta: "Renovación Colby", puedeActualizar: true }]);
    // Lidia ve el proyecto (es de su equipo) pero no lo administra ni ve la cuenta.
    const lidia = await ctx(LIDIA);
    expect(await cargarVinculosDe(lidia, NINGUNO, dueno, sinPermisos)).toMatchObject([{ etiqueta: null, puedeActualizar: false, puedeQuitar: false }]);
    await expect(vincularA(lidia, NINGUNO, dueno, { tipo: "hubspot", url: "https://app.hubspot.com/contacts/4774209/deal/10" }, sinPermisos, lector("Otro"))).rejects.toMatchObject({ status: 403 });
    await expect(refrescarVinculo(lidia, v.id, lector("Otro"))).rejects.toMatchObject({ status: 403 });
    // Actualizar: el nombre nuevo; y si HubSpot ya no lo tiene, queda marcado.
    expect(await refrescarVinculo(ale, v.id, lector("Renovación Colby 2027"))).toEqual(dueno);
    expect((await cargarVinculosDe(ale, soloColby, dueno, sinPermisos))[0]).toMatchObject({ etiqueta: "Renovación Colby 2027", ausente: false });
    await refrescarVinculo(ale, v.id, lector("", "no_existe"));
    expect((await cargarVinculosDe(ale, soloColby, dueno, sinPermisos))[0]).toMatchObject({ ausente: true });
    await quitarVinculoDe(ale, dueno, v.id);
    expect(await prisma.tareaVinculo.count()).toBe(0);
  });
});

describe("sin el SQL, un aviso y no un 500", () => {
  it("la base de pruebas tiene las 13 tablas; una que no existe cuenta 0 sin lanzar", async () => {
    olvidarTablasMiradas();
    expect(await cuantasTablasHay(TABLAS_DE_TAREAS)).toBe(TABLAS_DE_TAREAS.length);
    expect(await cuantasTablasHay(["Tarea", "TablaQueNoExiste"])).toBe(1);
    expect(await cuantasColumnasHay(COLUMNAS_POSTERIORES)).toBe(COLUMNAS_POSTERIORES.length);
    expect(await cuantasColumnasHay([["Tarea", "contexto"], ["Tarea", "columnaQueNoExiste"], ["TablaQueNoExiste", "id"]])).toBe(1);
    expect(await tareasDisponible()).toBe(true);
  });

  it("un invariante de tareas sobre una base sin la tabla dice «no aplica todavía», no se cae", async () => {
    const sinTabla = new Proxy(prisma, {
      get(target, prop) {
        if (prop === "tarea" || prop === "proyectoDeTareas") {
          return { findMany: async () => { throw Object.assign(new Error("The table `public.Tarea` does not exist in the current database."), { code: "P2021" }); } };
        }
        return Reflect.get(target, prop);
      },
    });
    const r = await INV38.correr(sinTabla, new Date());
    expect(r.ok).toBe(true);
    expect(r.lineas[0]).toContain("no aplica todavía");
  });
});

describe("lo que delegaste (2026-10-09)", () => {
  it("lo que pediste a otras personas, con su estado y lo último que pasó; lo tuyo y lo ajeno, no", async () => {
    const { ctx } = await equipo();
    const lidia = await ctx(LIDIA);
    const ale = await ctx(ALE);
    const ana = await ctx(CSE);
    // Lidia le pide algo a Ale (su líder) y algo a Ana (otro equipo); además anota algo suyo.
    const aAle = await crearTarea(lidia, TODOS, { titulo: "Revisar el copy del banner", para: ALE, cuando: "esta_semana" });
    const aAna = await crearTarea(lidia, TODOS, { titulo: "Pasar los datos del cliente", para: CSE, cuando: "esta_semana" });
    await crearTarea(lidia, TODOS, { titulo: "Lo mío", cuando: "esta_semana" });
    // Ale la usa y la empieza; Ana la descarta.
    await decidirTarea(ale, TODOS, aAle.id, (await prisma.tarea.findUniqueOrThrow({ where: { id: aAle.id } })).version, { tipo: "usar" });
    await cambiarEstado(ale, aAle.id, (await prisma.tarea.findUniqueOrThrow({ where: { id: aAle.id } })).version, "en_curso");
    await decidirTarea(ana, TODOS, aAna.id, (await prisma.tarea.findUniqueOrThrow({ where: { id: aAna.id } })).version, { tipo: "rechazar", motivo: "No es de CS" });

    const d = await cargarLoQueDelegaste(lidia, TODOS);
    const porTitulo = new Map(d.tareas.map((t) => [t.titulo, t]));
    expect([...porTitulo.keys()].sort()).toEqual(["Pasar los datos del cliente", "Revisar el copy del banner"]);
    expect(porTitulo.get("Revisar el copy del banner")).toMatchObject({ estado: "en_curso", responsable: { email: ALE } });
    expect(porTitulo.get("Pasar los datos del cliente")).toMatchObject({ estado: "rechazada", motivo: "No es de CS" });
    expect(d.movimientos[aAle.id]).toMatchObject({ quien: "Alejandra Ortega", texto: "Cambió el estado", detalle: "a en curso" });
    // A quien no pidió nada no le aparece.
    expect((await cargarLoQueDelegaste(ale, TODOS)).tareas).toEqual([]);
  });
});

describe("la revisión de «Lo que delegaste» y del contexto (2026-10-09)", () => {
  it("tomar una tarea no es delegarla, aunque después la líder se la pase a otra persona", async () => {
    const { ctx } = await equipo();
    const lidia = await ctx(LIDIA);
    const ale = await ctx(ALE);
    const suelta = await prisma.tarea.create({ data: { titulo: "Revisar el blog", huella: "revisar blog", estado: "pendiente", origen: "mano", equipo: "marketing", creadaPorEmail: ALE } });
    await asignar(lidia, suelta.id, suelta.version, LIDIA); // la toma
    const tomada = await prisma.tarea.findUniqueOrThrow({ where: { id: suelta.id } });
    await asignar(ale, suelta.id, tomada.version, ELIAS); // la líder se la pasa a otra persona
    expect((await cargarLoQueDelegaste(lidia, TODOS)).tareas.map((t) => t.titulo)).not.toContain("Revisar el blog");
    expect((await cargarLoQueDelegaste(ale, TODOS)).tareas.map((t) => t.titulo)).toContain("Revisar el blog");
  });

  it("retirar el pedido de una tarea TUYA que le pasaste a otra persona te la devuelve, no la cierra", async () => {
    const { ctx } = await equipo();
    const lidia = await ctx(LIDIA);
    const mia = await crearTarea(lidia, TODOS, { titulo: "Armar el reporte de octubre", cuando: "esta_semana" });
    const fila = await prisma.tarea.findUniqueOrThrow({ where: { id: mia.id } });
    await asignar(lidia, mia.id, fila.version, CSE); // otra persona, otro equipo: le llega como sugerencia
    const pasada = await prisma.tarea.findUniqueOrThrow({ where: { id: mia.id } });
    expect(pasada).toMatchObject({ estado: "propuesta", responsableEmail: CSE, pedidaPorEmail: LIDIA });
    await decidirTarea(lidia, TODOS, mia.id, pasada.version, { tipo: "retirar" });
    const devuelta = await prisma.tarea.findUniqueOrThrow({ where: { id: mia.id } });
    expect(devuelta).toMatchObject({ estado: "pendiente", responsableEmail: LIDIA, pedidaPorEmail: null, equipo: "marketing" });
    expect(devuelta.semana).not.toBeNull();
  });

  it("el contexto de una reunión de afuera sin dueño resuelto: solo quien estuvo", async () => {
    const { ctx } = await equipo();
    // Sin cliente resuelto y con alguien de afuera: no es puertas adentro y no se sabe de quién es.
    const sesion = await prisma.firefliesSession.create({ data: { id: "fx-tareas-h3", title: "Llamada con prospecto", date: new Date(), participants: [ALE, "cliente@externo.com"] } });
    const lectura = await prisma.lecturaDeReunion.create({ data: { sessionId: sesion.id, equipo: "marketing", rol: "planning", semana: aDate(lunesDeHoy()), pedidaPorEmail: ALE } });
    await prisma.$transaction((tx) =>
      escribirPropuestasDeLectura(tx, { id: lectura.id, sessionId: sesion.id, tituloReunion: "Llamada con prospecto", pedidaPorEmail: ALE }, [
        {
          lineaId: "3",
          titulo: "Preparar el reporte de ventas",
          notas: null,
          contexto: "El prospecto reportó una caída de ventas en septiembre.",
          cita: "[Lidia Flores] Reporte: preparar el reporte de ventas",
          responsableEmail: LIDIA,
          equipo: "marketing",
          semana: lunesDeHoy(),
          venceEl: null,
          clientId: null,
          projectId: null,
          proyectoId: null,
          pedidaPorEmail: null,
          pedidaPorEquipo: null,
          mismaQueId: null,
          sugerido: {},
          porAsignar: false,
        },
      ]),
    );
    const deLidia = (await cargarMisTareas(await ctx(LIDIA), TODOS)).porDecidir[0];
    expect(deLidia.contexto).toBeNull();
    expect(deLidia.contextoOculto).toContain("reunión");
  });
});

describe("la ficha del cliente › Tareas (ficha A, 2026-10-17)", () => {
  it("todas las tareas de la cuenta, de cualquier equipo, con su origen; nunca lo «Solo para mí» de otros", async () => {
    const { ctx } = await equipo();
    const cliente = await prisma.client.create({ data: { name: "Wherex" } });
    const otro = await prisma.client.create({ data: { name: "Otra empresa" } });
    const base = { huella: "x", origen: "mano", estado: "pendiente" } as const;
    await prisma.tarea.createMany({
      data: [
        { ...base, titulo: "Campaña de Wherex", huella: "campana", equipo: "marketing", responsableEmail: LIDIA, clientId: cliente.id, creadaPorEmail: LIDIA },
        { ...base, titulo: "Revisar el pipeline", huella: "pipeline", equipo: "cs", responsableEmail: CSE, clientId: cliente.id, creadaPorEmail: CSE, origen: "hubspot" },
        { ...base, titulo: "Lo mío de Wherex", huella: "mio", equipo: "marketing", responsableEmail: ALE, clientId: cliente.id, creadaPorEmail: ALE, privada: true },
        { ...base, titulo: "De otra empresa", huella: "otra", equipo: "marketing", responsableEmail: LIDIA, clientId: otro.id, creadaPorEmail: LIDIA },
      ],
    });
    const datos = await cargarTareasDeLaCuenta(await ctx(ELIAS), conClientes(cliente, otro), cliente.id);
    expect(datos.tareas.map((t) => t.titulo).sort()).toEqual(["Campaña de Wherex", "Revisar el pipeline"]);
    expect(datos.tareas.find((t) => t.titulo === "Revisar el pipeline")?.de.clave).toBe("hubspot");
    expect(datos.tareas.find((t) => t.titulo === "Campaña de Wherex")?.de.clave).toBe("mano");
    // Quien no ve la cuenta: 404, no la lista vacía.
    await expect(cargarTareasDeLaCuenta(await ctx(LIDIA), NINGUNO, cliente.id)).rejects.toMatchObject({ status: 404 });
  });
});
