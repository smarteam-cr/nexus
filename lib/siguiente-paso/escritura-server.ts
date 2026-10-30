/**
 * lib/siguiente-paso/escritura-server.ts — fijar un siguiente paso, darlo por hecho y escribirlo en HubSpot. SERVER-ONLY.
 *
 * Desde el 2026-10-16 (fase 0.2 de docs/nexus-sistema-de-trabajo-plan.md) el siguiente paso de un equipo ES UNA TAREA:
 * la próxima abierta con fecha de su sprint (desde-tareas.ts). Por eso:
 *   · fijarlo crea una tarea de paso (o cambia la que hoy es el siguiente paso, si es una tarea de paso de quien lo
 *     fija), por el escritor único de Tareas;
 *   · darlo por hecho marca la tarea como hecha;
 *   · lo que va a HubSpot (`siguiente_paso_<equipo>`, su fecha y su responsable) sale de la tarea: `SiguientePaso` es la
 *     COPIA de lo que está escrito allá, con la tarea de la que salió. La escribe solo este archivo (y la copia que
 *     vuelve de HubSpot, copia-server.ts).
 *
 * El orden es Nexus primero, HubSpot después: si HubSpot no responde, la copia queda «pendiente» y el job
 * `negocios-abiertos` la reintenta cada hora (hasta 5 veces). Ese job también pone al día las cuentas cuyas tareas
 * cambiaron desde la pantalla de Tareas.
 *
 * Quién puede: el equipo, el suyo o uno que lidera (reglas.ts › equiposQueEscribe); el objeto, con acceso a su cliente
 * (`requireAccessToClient`). Un negocio sin cliente en Nexus: su dueño, o quien tiene `ventas.write`. Lo demás lo
 * decide Tareas (quién puede editar, asignar o terminar cada tarea).
 */
import "server-only";
import { Prisma, type TeamMember } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { ownerIdPorCorreo } from "@/lib/hubspot/owner-por-correo";
import { requireAccessToClient } from "@/lib/auth/access";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { olvidarMedicion } from "@/lib/para-ti/medir-server";
import { proyectoClasificableWhere } from "@/lib/projects/scope";
import { contextoDeTareas, equipoDe, ErrorDeTareas } from "@/lib/tareas/servidor";
import { clientesQueVesParaTareas } from "@/lib/tareas/clientes";
import { equiposQueLidera, nombreDelEquipo } from "@/lib/tareas/equipos";
import { asignar, cambiarEstado, crearTarea, editarTarea, moverDeSemana } from "@/lib/tareas/mutaciones";
import { lunesDeFecha } from "@/lib/tareas/semana";
import { cuentasConTareasCambiadas, tareaDelPaso } from "@/lib/tareas/siguiente-paso";
import { EQUIPOS_DEL_SIGUIENTE_PASO, type EquipoDelSiguientePaso } from "./propiedades";
import { esDelObjeto, fechaDelPaso, mismoQueLaTarea, siguientePasoDe, SPRINT_DEL_PASO, tareaQueSeCambiaAlFijar, type TareaDelPaso } from "./desde-tareas";
import { copiasEnHubspot, resolverParaBuscar, tareasDeLosObjetos, type ObjetoParaBuscar } from "./lectura-server";
import { MAX_INTENTOS_EN_HUBSPOT, OBJETO_EN_HUBSPOT, equiposQueEscribe, valoresParaHubspot, type ObjetoDelPaso } from "./reglas";

export class ErrorDelPaso extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface ObjetoResuelto {
  objeto: ObjetoDelPaso;
  objetoId: string;
  nombre: string;
  clientId: string | null;
  hubspotObjectType: string;
  hubspotObjectId: string | null;
  /** Solo un negocio: su dueño en Nexus. */
  vendedorId?: string | null;
}

export async function resolverObjeto(objeto: ObjetoDelPaso, objetoId: string): Promise<ObjetoResuelto> {
  const tipo = OBJETO_EN_HUBSPOT[objeto];
  if (objeto === "empresa") {
    const c = await prisma.client.findUnique({ where: { id: objetoId }, select: { id: true, name: true, hubspotCompanyId: true } });
    if (!c) throw new ErrorDelPaso(404, "Esa empresa no existe.");
    return { objeto, objetoId, nombre: c.name, clientId: c.id, hubspotObjectType: tipo, hubspotObjectId: c.hubspotCompanyId };
  }
  if (objeto === "negocio") {
    const n = await prisma.negocioAbierto.findUnique({
      where: { id: objetoId },
      select: { id: true, nombre: true, clientId: true, hubspotDealId: true, vendedorId: true, abierto: true },
    });
    if (!n) throw new ErrorDelPaso(404, "Ese negocio no existe.");
    return { objeto, objetoId, nombre: n.nombre, clientId: n.clientId, hubspotObjectType: tipo, hubspotObjectId: n.hubspotDealId, vendedorId: n.vendedorId };
  }
  const p = await prisma.project.findUnique({ where: { id: objetoId }, select: { id: true, name: true, clientId: true, hubspotServiceId: true } });
  if (!p) throw new ErrorDelPaso(404, "Ese proyecto no existe.");
  return { objeto, objetoId, nombre: p.name, clientId: p.clientId, hubspotObjectType: tipo, hubspotObjectId: p.hubspotServiceId };
}

/** ¿Puede esta persona ver el objeto? Se pregunta con la sesión del pedido (`requireAccessToClient`). */
export async function exigirAcceso(o: ObjetoResuelto, persona: TeamMember): Promise<void> {
  if (o.clientId) {
    try {
      await requireAccessToClient(o.clientId);
      return;
    } catch (e) {
      if (e instanceof ForbiddenError || e instanceof UnauthorizedError) throw new ErrorDelPaso(403, "No tienes acceso a esta cuenta.");
      throw e;
    }
  }
  if (o.objeto === "negocio" && (o.vendedorId === persona.id || (await can(persona, "ventas", "write")))) return;
  throw new ErrorDelPaso(403, "Solo su dueño o alguien con permiso de Ventas puede cambiar este negocio.");
}

/** Un error de Tareas (quién puede editar, asignar o terminar) se dice igual en la pantalla del siguiente paso. */
async function comoPaso<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (e) {
    if (e instanceof ErrorDeTareas) throw new ErrorDelPaso(e.status, e.message);
    throw e;
  }
}

/* ── Fijar y dar por hecho ───────────────────────────────────────────────────────────── */

export interface NuevoPaso {
  objeto: ObjetoDelPaso;
  objetoId: string;
  equipo: EquipoDelSiguientePaso;
  que: string;
  /** `YYYY-MM-DD`. Sin fecha, la tarea queda en esta semana. */
  fecha: string | null;
  /** Correo de quien lo lleva. Sin él, quien lo escribe. */
  responsableEmail?: string | null;
}

export interface PasoFijado {
  /** El id de la tarea. */
  id: string;
  numero: number;
  /** `propuesta` = es para otra persona y le llega como sugerencia: no es el siguiente paso hasta que la tome. */
  estado: string;
  hubspotEstado: string;
  hubspotError: string | null;
}

/**
 * Fija el siguiente paso de un equipo. Si el siguiente paso de hoy en ese objeto es una tarea de paso (`origen = "paso"`)
 * de quien lo fija, cambia ESA tarea (qué, fecha y quién); en cualquier otro caso crea una tarea de paso nueva: la tarea
 * de otra persona (o la que nació en una reunión, el chat o HubSpot) no se reescribe desde acá. Después pone al día lo
 * que está escrito en HubSpot.
 */
export async function fijarSiguientePaso(persona: TeamMember, n: NuevoPaso): Promise<PasoFijado> {
  if (!equiposQueEscribe(persona.roleEnum, equiposQueLidera(persona)).includes(n.equipo)) {
    throw new ErrorDelPaso(403, "Solo puedes escribir el siguiente paso de tu equipo o de uno que lideras.");
  }
  const que = n.que.trim();
  if (!que) throw new ErrorDelPaso(400, "Escribe qué sigue.");
  const o = await resolverObjeto(n.objeto, n.objetoId);
  await exigirAcceso(o, persona);

  const ctx = await contextoDeTareas({ teamMember: persona });
  const clientes = await clientesQueVesParaTareas(persona);
  const responsable = (n.responsableEmail ?? persona.email).trim().toLowerCase();
  const sprint = SPRINT_DEL_PASO[n.equipo];
  if (equipoDe(responsable, ctx.miembros) !== sprint) {
    throw new ErrorDelPaso(400, `Elige a alguien de ${nombreDelEquipo(sprint)}: el siguiente paso de un equipo es una tarea de su sprint.`);
  }

  const [buscado] = await resolverParaBuscar([{ objeto: o.objeto, objetoId: o.objetoId }]);
  const [tareas, copias] = await Promise.all([tareasDeLosObjetos([buscado]), copiasEnHubspot([buscado])]);
  const actual = siguientePasoDe(
    tareas.filter((t) => esDelObjeto(t, buscado)),
    n.equipo,
    copias.get(`${o.objeto}:${o.objetoId}:${n.equipo}`)?.tareaId ?? null,
  );

  let tareaId: string;
  let numero: number;
  let estado: string;
  // Solo se reescribe una tarea de paso de quien lo fija: si no, a quien no es su dueño le respondería 403 sin salida, y
  // quien lidera le pisaría el título a la tarea de otra persona.
  const propia = tareaQueSeCambiaAlFijar(actual, persona.email);
  if (propia) {
    // El siguiente paso de hoy es una tarea de paso tuya: lo que se guarda la cambia.
    await cambiarLaTarea(ctx, clientes, propia, { que, fecha: n.fecha, responsable });
    const despues = await tareaDelPaso(propia.id);
    tareaId = propia.id;
    numero = propia.numero;
    estado = despues?.estado ?? propia.estado;
  } else {
    const creada = await comoPaso(() =>
      crearTarea(ctx, clientes, {
        titulo: que,
        para: responsable,
        cuando: n.fecha ? lunesDeFecha(n.fecha) : "esta_semana",
        venceEl: n.fecha,
        clientId: o.clientId,
        projectId: o.objeto === "proyecto" ? o.objetoId : null,
        hubspotDealId: o.objeto === "negocio" ? o.hubspotObjectId : null,
        origen: "paso",
      }),
    );
    tareaId = creada.id;
    numero = creada.numero;
    estado = creada.estado;
  }

  const copia = await sincronizarObjetos(await resolverParaBuscar([{ objeto: o.objeto, objetoId: o.objetoId }]));
  const escrita = copia.find((c) => c.equipo === n.equipo && c.objetoId === o.objetoId);
  olvidarMedicion(persona.email.toLowerCase());
  if (responsable !== persona.email.toLowerCase()) olvidarMedicion(responsable);
  return { id: tareaId, numero, estado, hubspotEstado: escrita?.hubspotEstado ?? (o.hubspotObjectId ? "pendiente" : "sin_hubspot"), hubspotError: escrita?.hubspotError ?? null };
}

/** Cambia la tarea que hoy es el siguiente paso: el título, la fecha (y su semana) y quién la lleva. */
async function cambiarLaTarea(
  ctx: Awaited<ReturnType<typeof contextoDeTareas>>,
  clientes: Awaited<ReturnType<typeof clientesQueVesParaTareas>>,
  t: TareaDelPaso,
  c: { que: string; fecha: string | null; responsable: string },
): Promise<void> {
  const version = async () => (await tareaDelPaso(t.id))?.version ?? t.version;
  const cambiaTitulo = c.que !== t.titulo.trim();
  const cambiaFecha = (c.fecha ?? null) !== (t.venceEl ?? null) && !!c.fecha;
  if (cambiaTitulo || cambiaFecha) {
    await comoPaso(async () =>
      editarTarea(ctx, clientes, t.id, await version(), { ...(cambiaTitulo ? { titulo: c.que } : {}), ...(cambiaFecha ? { venceEl: c.fecha } : {}) }),
    );
  }
  if (c.fecha && t.responsableEmail && t.semana !== lunesDeFecha(c.fecha)) {
    await comoPaso(async () => moverDeSemana(ctx, t.id, await version(), lunesDeFecha(c.fecha!)));
  }
  if (c.responsable !== (t.responsableEmail ?? null)) {
    await comoPaso(async () => asignar(ctx, t.id, await version(), c.responsable));
  }
}

/** «Ya se hizo»: la tarea que es el siguiente paso queda hecha. Después se pone al día lo que dice HubSpot. */
export async function darPorHecho(persona: TeamMember, id: string): Promise<{ hubspotEstado: string }> {
  const t = await tareaDelPaso(id);
  if (!t) throw new ErrorDelPaso(404, "Ese siguiente paso no existe.");
  if (t.estado !== "pendiente" && t.estado !== "en_curso") throw new ErrorDelPaso(409, "Esa tarea ya no está abierta. Recarga para ver lo último.");
  if (t.clientId) await exigirAcceso(await resolverObjeto("empresa", t.clientId), persona);
  const ctx = await contextoDeTareas({ teamMember: persona });
  await comoPaso(() => cambiarEstado(ctx, id, t.version, "hecha"));

  const objetos: Array<{ objeto: ObjetoDelPaso; objetoId: string }> = [];
  if (t.clientId) objetos.push({ objeto: "empresa", objetoId: t.clientId });
  if (t.projectId) objetos.push({ objeto: "proyecto", objetoId: t.projectId });
  if (t.hubspotDealId) {
    const negocio = await prisma.negocioAbierto.findFirst({ where: { hubspotDealId: t.hubspotDealId }, select: { id: true } }).catch(() => null);
    if (negocio) objetos.push({ objeto: "negocio", objetoId: negocio.id });
  }
  const copia = await sincronizarObjetos(await resolverParaBuscar(objetos));
  olvidarMedicion(persona.email.toLowerCase());
  if (t.responsableEmail && t.responsableEmail !== persona.email.toLowerCase()) olvidarMedicion(t.responsableEmail);
  const deLaEmpresa = copia.find((c) => c.objeto === "empresa");
  return { hubspotEstado: deLaEmpresa?.hubspotEstado ?? "sin_hubspot" };
}

/* ── La copia de lo que está escrito en HubSpot ──────────────────────────────────────── */

export interface CopiaPuestaAlDia {
  objeto: ObjetoDelPaso;
  objetoId: string;
  equipo: EquipoDelSiguientePaso;
  hubspotEstado: string;
  hubspotError: string | null;
}

const esUnicoDuplicado = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/**
 * Pone al día lo que está escrito en HubSpot para esos objetos: por cada equipo, el siguiente paso que sale de las
 * tareas. Si ya está escrito igual, no hace nada (tampoco si alguien lo borró en HubSpot y la tarea no cambió: así no
 * se pelean). Devuelve lo que quedó de cada objeto y equipo que tiene o tuvo paso.
 */
export async function sincronizarObjetos(objetos: readonly ObjetoParaBuscar[]): Promise<CopiaPuestaAlDia[]> {
  if (!objetos.length) return [];
  const [tareas, ultimas, resueltos] = await Promise.all([
    tareasDeLosObjetos(objetos),
    prisma.siguientePaso.findMany({
      where: { estado: { in: ["vigente", "hecho"] }, OR: objetos.map((o) => ({ objeto: o.objeto, objetoId: o.objetoId })) },
      orderBy: { createdAt: "desc" },
    }),
    Promise.all(objetos.map((o) => resolverObjeto(o.objeto, o.objetoId).catch(() => null))),
  ]);
  const ultimaDe = new Map<string, (typeof ultimas)[number]>();
  for (const f of ultimas) {
    const k = `${f.objeto}:${f.objetoId}:${f.equipo}`;
    const previo = ultimaDe.get(k);
    if (!previo || (f.estado === "vigente" && previo.estado !== "vigente")) ultimaDe.set(k, f);
  }

  const salida: CopiaPuestaAlDia[] = [];
  for (let i = 0; i < objetos.length; i++) {
    const o = objetos[i];
    const r = resueltos[i];
    if (!r) continue;
    const deEste = tareas.filter((t) => esDelObjeto(t, o));
    for (const { clave: equipo } of EQUIPOS_DEL_SIGUIENTE_PASO) {
      const k = `${o.objeto}:${o.objetoId}:${equipo}`;
      const ultima = ultimaDe.get(k) ?? null;
      const deseada = siguientePasoDe(deEste, equipo, ultima?.tareaId ?? null);
      const escrito = ultima
        ? { tareaId: ultima.tareaId, que: ultima.que, fecha: ultima.fecha ? ultima.fecha.toISOString().slice(0, 10) : null, responsableEmail: ultima.responsableEmail }
        : null;

      if (!deseada) {
        if (ultima?.estado !== "vigente") continue;
        // Ya no hay siguiente paso (se hizo, se cerró o se movió): se borra de HubSpot.
        const r2 = await prisma.siguientePaso.updateMany({
          where: { id: ultima.id, estado: "vigente", updatedAt: ultima.updatedAt },
          data: { estado: "hecho", cerradoAt: new Date(), cerradoPor: "nexus", hubspotEstado: r.hubspotObjectId ? "pendiente" : "sin_hubspot", hubspotError: null, hubspotIntentos: 0 },
        });
        if (r2.count) {
          const f = await escribirEnHubspot(ultima.id);
          salida.push({ objeto: o.objeto, objetoId: o.objetoId, equipo, hubspotEstado: f.hubspotEstado, hubspotError: f.hubspotError });
        }
        continue;
      }
      if (escrito && mismoQueLaTarea(escrito, deseada)) {
        if (ultima) salida.push({ objeto: o.objeto, objetoId: o.objetoId, equipo, hubspotEstado: ultima.hubspotEstado, hubspotError: ultima.hubspotError });
        continue;
      }

      const responsableOwnerId = deseada.responsableEmail ? await ownerIdPorCorreo(deseada.responsableEmail) : null;
      const fecha = fechaDelPaso(deseada);
      let nueva;
      try {
        nueva = await prisma.$transaction(async (tx) => {
          if (ultima?.estado === "vigente") {
            const r3 = await tx.siguientePaso.updateMany({
              where: { id: ultima.id, estado: "vigente", updatedAt: ultima.updatedAt },
              data: { estado: "reemplazado", cerradoAt: new Date(), cerradoPor: "nexus" },
            });
            if (r3.count === 0) return null;
          }
          return tx.siguientePaso.create({
            data: {
              objeto: o.objeto,
              objetoId: o.objetoId,
              equipo,
              que: deseada.titulo.trim(),
              fecha: fecha ? new Date(`${fecha}T00:00:00.000Z`) : null,
              responsableEmail: deseada.responsableEmail,
              responsableOwnerId,
              escritoPor: deseada.creadaPorEmail ?? "nexus",
              fuente: "tarea",
              tareaId: deseada.id,
              clientId: r.clientId,
              hubspotObjectType: r.hubspotObjectType,
              hubspotObjectId: r.hubspotObjectId,
              hubspotEstado: r.hubspotObjectId ? "pendiente" : "sin_hubspot",
            },
          });
        });
      } catch (e) {
        // Otra corrida llegó primero (el índice de un solo vigente): la próxima vuelve a mirar.
        if (esUnicoDuplicado(e)) continue;
        throw e;
      }
      if (!nueva) continue;
      const f = await escribirEnHubspot(nueva.id);
      salida.push({ objeto: o.objeto, objetoId: o.objetoId, equipo, hubspotEstado: f.hubspotEstado, hubspotError: f.hubspotError });
    }
  }
  return salida;
}

/** Pone al día HubSpot para una cuenta entera: la empresa, sus negocios abiertos y sus proyectos activos. */
export async function sincronizarCuenta(clientId: string): Promise<CopiaPuestaAlDia[]> {
  const [negocios, proyectos] = await Promise.all([
    prisma.negocioAbierto.findMany({ where: { clientId, abierto: true }, select: { id: true } }).catch(() => []),
    prisma.project.findMany({ where: proyectoClasificableWhere({ clientId }), select: { id: true } }),
  ]);
  return sincronizarObjetos(
    await resolverParaBuscar([
      { objeto: "empresa", objetoId: clientId },
      ...negocios.map((n) => ({ objeto: "negocio" as const, objetoId: n.id })),
      ...proyectos.map((p) => ({ objeto: "proyecto" as const, objetoId: p.id })),
    ]),
  );
}

/**
 * Las cuentas cuyas tareas cambiaron (desde la pantalla de Tareas, el chat o una reunión) en las últimas horas: lo que
 * dice HubSpot se pone al día. Lo corre el job `negocios-abiertos` cada hora.
 */
export async function sincronizarCuentasCambiadas(desde: Date, limite = 40): Promise<{ cuentas: number; escritos: number }> {
  const cuentas = await cuentasConTareasCambiadas(desde, limite);
  let escritos = 0;
  for (const clientId of cuentas) {
    const r = await sincronizarCuenta(clientId).catch((e) => {
      console.error(`[siguiente-paso] no se pudo poner al día HubSpot para la cuenta ${clientId}:`, e instanceof Error ? e.message : e);
      return [] as CopiaPuestaAlDia[];
    });
    escritos += r.filter((c) => c.hubspotEstado === "escrito").length;
  }
  return { cuentas: cuentas.length, escritos };
}

/**
 * Escribe en HubSpot lo que dice la copia: sus valores si está vigente, vacío si se dio por hecho. Nunca lanza: si
 * HubSpot no responde, queda en «error» y el job lo reintenta.
 */
export async function escribirEnHubspot(id: string) {
  const p = await prisma.siguientePaso.findUnique({ where: { id } });
  if (!p) throw new ErrorDelPaso(404, "Ese siguiente paso no existe.");
  if (p.estado === "reemplazado" || p.hubspotEstado === "escrito" || p.hubspotEstado === "sin_hubspot") return p;
  if (!p.hubspotObjectId) return prisma.siguientePaso.update({ where: { id }, data: { hubspotEstado: "sin_hubspot" } });

  // Uno dado por hecho que ya tiene uno más nuevo: lo que dice HubSpot lo decide el más nuevo.
  if (p.estado === "hecho") {
    const masNuevo = await prisma.siguientePaso.count({
      where: { objeto: p.objeto, objetoId: p.objetoId, equipo: p.equipo, createdAt: { gt: p.createdAt } },
    });
    if (masNuevo > 0) return prisma.siguientePaso.update({ where: { id }, data: { hubspotEstado: "escrito", hubspotError: "Lo cubre un paso más nuevo." } });
  }

  const properties = valoresParaHubspot(
    p.equipo as EquipoDelSiguientePaso,
    p.estado === "vigente" ? { que: p.que, fecha: p.fecha ? p.fecha.toISOString().slice(0, 10) : null, responsableOwnerId: p.responsableOwnerId } : null,
  );
  let error: string | null = null;
  try {
    const hs = await getSystemHubspotClient();
    const res = await hs.apiRequest({ method: "PATCH", path: `/crm/v3/objects/${p.hubspotObjectType}/${p.hubspotObjectId}`, body: { properties } });
    if (!res.ok) error = `HubSpot ${res.status}: ${(await res.text()).slice(0, 300)}`;
  } catch (e) {
    error = e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300);
  }
  return prisma.siguientePaso.update({
    where: { id },
    data: error
      ? { hubspotEstado: "error", hubspotError: error, hubspotIntentos: { increment: 1 } }
      : { hubspotEstado: "escrito", hubspotError: null, hubspotEscritoAt: new Date() },
  });
}

/** Lo que quedó sin escribir en HubSpot (pendiente o con error), hasta 5 intentos. Lo corre el job `negocios-abiertos`. */
export async function reintentarEscrituras(limite = 25): Promise<{ intentados: number; escritos: number; conError: number }> {
  const filas = await prisma.siguientePaso.findMany({
    where: {
      estado: { in: ["vigente", "hecho"] },
      hubspotEstado: { in: ["pendiente", "error"] },
      hubspotIntentos: { lt: MAX_INTENTOS_EN_HUBSPOT },
      // Lo que se está escribiendo en este momento no se pisa.
      updatedAt: { lt: new Date(Date.now() - 60_000) },
    },
    orderBy: { updatedAt: "asc" },
    take: limite,
    select: { id: true },
  });
  let escritos = 0;
  let conError = 0;
  for (const f of filas) {
    const r = await escribirEnHubspot(f.id);
    if (r.hubspotEstado === "escrito") escritos++;
    else if (r.hubspotEstado === "error") conError++;
  }
  return { intentados: filas.length, escritos, conError };
}

