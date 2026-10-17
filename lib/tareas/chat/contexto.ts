/**
 * lib/tareas/chat/contexto.ts — lo que lee el modelo en el chat de tareas (docs/tareas-plan.md §6.3). SERVIDOR.
 *
 * Arma, para UNA persona y UN turno, la FOTO (lo que ve y puede, con las etiquetas M#, C#, H#, R#, E# de ese turno) y
 * el TEXTO del bloque «TU CONTEXTO», dentro de un techo de 13.000 caracteres. El chip (una tarea, un proyecto, un
 * cliente o una reunión) se resuelve acá con la visibilidad de quien pregunta y va APARTE: en `messages`, solo ese turno.
 *
 * ⛔ Nunca entra una cita de una reunión (ni la de la tarea, ni la de un evento, ni la de un proyecto), y las notas de
 * una tarea que repiten su cita tampoco. El chip de una reunión trae solo sus próximos pasos y su resumen, por el
 * chokepoint. ⛔ No se usa `tareasVisiblesWhere` para LISTAR: al Super Admin le traería toda la casa. Se lista lo
 * suyo, lo que lidera y lo que nombra; para una T-# nombrada sí vale (la nombró).
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { proyectoClasificableWhere } from "@/lib/projects/scope";
import { getReunionesParaTareas, salasDeReuniones } from "@/lib/sessions/reuniones-para-tareas";
import { accionesDe, estaAbierta, leerEstado, leerEstadoDeProyecto, NOMBRE_DEL_ESTADO, NOMBRE_DEL_ESTADO_DE_PROYECTO } from "../estados";
import { claveDeEquipo, equiposQueLidera, nombreDelEquipo } from "../equipos";
import { itemsDeActionItems, itemsDeProximosPasos, resumenDeLasNotas } from "../proximos-pasos";
import { aDate, comoFecha, diaCortoConSemana, hoyEnCostaRica, lunesDeHoy, nombreDeLaSemana, sumarDias } from "../semana";
import { administraElProyecto, espaciosVisiblesWhere, proyectosVisiblesWhere, tareasVisiblesWhere } from "../visibilidad";
import type { ClientesQueVes } from "../clientes";
import type { ContextoDeTareas } from "../servidor";
import type { FotoDeTareas, PersonaDeLaFoto, ProyectoDeLaFoto, TareaDeLaFoto } from "./operaciones";
import { veElContexto } from "../serializar";

/** El techo del bloque «TU CONTEXTO» (el mismo del chat de documentos). */
export const TECHO_DEL_CONTEXTO_DE_TAREAS = 13_000;
const TECHO_DEL_CHIP = 6_000;

const TOPES = { proyectos: 30, clientes: 40, tuyas: 40, sprint: 60, delChip: 60 };

export const TIPOS_DE_CHIP = ["tarea", "proyecto", "cliente", "reunion"] as const;
export interface ChipDeTareas {
  tipo: (typeof TIPOS_DE_CHIP)[number];
  id: string;
}

export interface ContextoDelChatDeTareas {
  foto: FotoDeTareas;
  /** El bloque «TU CONTEXTO» (va en `system`, cacheado). */
  texto: string;
  /** Lo del chip, si pasó la visibilidad (va en `messages`, solo este turno). */
  chip: string | null;
  /** La reunión de la que sale lo que el chip mostró (o null): ata a ella las tareas que se crean en este turno. */
  sesionDelChip: string | null;
}

/** Lo que nombra lo pendiente: se carga aunque no entre en las listas, para revalidarlo y describirlo. */
export interface Nombradas {
  numeros?: readonly number[];
  proyectos?: readonly string[];
  proyectosHubspot?: readonly string[];
}

/* ── Las filas ──────────────────────────────────────────────────────────────────────────────────────────────────── */

const SELECT_TAREA = {
  id: true,
  numero: true,
  titulo: true,
  estado: true,
  prioridad: true,
  responsableEmail: true,
  creadaPorEmail: true,
  pedidaPorEmail: true,
  equipo: true,
  semana: true,
  venceEl: true,
  clientId: true,
  proyectoId: true,
  minutosEstimados: true,
  privada: true,
  proyecto: { select: { nombre: true, espacio: { select: { tipo: true, miembros: { select: { email: true } } } } } },
} satisfies Prisma.TareaSelect;
type FilaDeTarea = Prisma.TareaGetPayload<{ select: typeof SELECT_TAREA }>;

const SELECT_PROYECTO = {
  id: true,
  nombre: true,
  estado: true,
  clientId: true,
  projectId: true,
  responsableEmail: true,
  creadoPorEmail: true,
  iniciaEl: true,
  venceEl: true,
  updatedAt: true,
  espacio: { select: { tipo: true, equipo: true, nombre: true, miembros: { select: { email: true, rol: true } } } },
} satisfies Prisma.ProyectoDeTareasSelect;
type FilaDeProyecto = Prisma.ProyectoDeTareasGetPayload<{ select: typeof SELECT_PROYECTO }>;

const ESTADOS_DE_PROYECTO_VIVOS = ["propuesta", "activo", "en_pausa"];

function aTareaDeLaFoto(t: FilaDeTarea, ctx: ContextoDeTareas, lunes: string): TareaDeLaFoto {
  const yo = ctx.email;
  const espacioLibre = t.proyecto?.espacio.tipo === "libre" && t.proyecto.espacio.miembros.some((m) => m.email === yo);
  const a = accionesDe({ ...t, semana: comoFecha(t.semana) }, ctx, { lunesDeHoy: lunes, esMiembroDelEspacioLibre: espacioLibre });
  return {
    id: t.id,
    numero: t.numero,
    titulo: t.titulo,
    estado: t.estado,
    responsableEmail: t.responsableEmail,
    equipo: t.equipo,
    semana: comoFecha(t.semana),
    clientId: t.clientId,
    proyectoId: t.proyectoId,
    abierta: estaAbierta(t.estado),
    acciones: { editar: a.editar, reasignar: a.reasignar, tomar: a.tomar, moverDeSemana: a.moverDeSemana, cambiarPrivada: a.cambiarPrivada },
  };
}

function aProyectoDeLaFoto(p: FilaDeProyecto, ctx: ContextoDeTareas): ProyectoDeLaFoto {
  return {
    id: p.id,
    nombre: p.nombre,
    estado: p.estado,
    clientId: p.clientId,
    projectId: p.projectId,
    espacioTipo: p.espacio.tipo,
    miembrosDelEspacio: p.espacio.miembros.map((m) => m.email),
    administra: administraElProyecto(ctx, p),
    iniciaEl: comoFecha(p.iniciaEl),
  };
}

/* ── El armado ──────────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * La foto y el texto de este turno. `nombradas` = lo que nombra lo pendiente (para que no caiga solo porque no entró
 * en las listas). `chip` = lo que la persona señaló.
 */
export async function contextoDelChatDeTareas(
  ctx: ContextoDeTareas,
  clientes: ClientesQueVes,
  o: { ahora?: Date; chip?: ChipDeTareas | null; nombradas?: Nombradas } = {},
): Promise<ContextoDelChatDeTareas> {
  const ahora = o.ahora ?? new Date();
  const hoy = hoyEnCostaRica(ahora);
  const lunes = lunesDeHoy(ahora);
  const yo = ctx.email;
  const vivosDelProyecto = { archivadoAt: null, estado: { in: ESTADOS_DE_PROYECTO_VIVOS } };

  const [espacios, proyectosCrudos, tuyasCrudas, sprintCrudo, cierres, atrasadas, usados] = await Promise.all([
    prisma.espacioDeTareas.findMany({
      where: espaciosVisiblesWhere(ctx),
      select: { id: true, tipo: true, equipo: true, nombre: true, miembros: { select: { email: true } } },
      orderBy: { createdAt: "asc" },
      take: 30,
    }),
    prisma.proyectoDeTareas.findMany({
      where: { AND: [proyectosVisiblesWhere(ctx), vivosDelProyecto] },
      select: SELECT_PROYECTO,
      orderBy: { updatedAt: "desc" },
      take: 120,
    }),
    prisma.tarea.findMany({
      where: {
        archivadaAt: null,
        OR: [
          { responsableEmail: yo, estado: { in: ["pendiente", "en_curso", "propuesta"] } },
          // ⚠ No `NOT: { responsableEmail: yo }`: en SQL eso es NULL con responsable null y deja afuera lo pedido a un equipo.
          { pedidaPorEmail: yo, estado: "propuesta", OR: [{ responsableEmail: null }, { responsableEmail: { not: yo } }] },
        ],
      },
      select: SELECT_TAREA,
      orderBy: [{ semana: { sort: "asc", nulls: "last" } }, { numero: "asc" }],
      take: TOPES.tuyas * 2,
    }),
    ctx.lidera.length
      ? prisma.tarea.findMany({
          where: {
            AND: [
              tareasVisiblesWhere(ctx),
              { equipo: { in: [...ctx.lidera] } },
              { OR: [{ responsableEmail: null }, { responsableEmail: { not: yo } }] },
              {
                OR: [
                  { semana: aDate(lunes), estado: { in: ["pendiente", "en_curso"] } },
                  { responsableEmail: null, estado: { in: ["pendiente", "en_curso", "propuesta"] } },
                ],
              },
            ],
          },
          select: SELECT_TAREA,
          orderBy: { numero: "asc" },
          take: TOPES.sprint,
        })
      : Promise.resolve([] as FilaDeTarea[]),
    prisma.cierreDeSemana.findMany({ where: { personaEmail: yo }, select: { semana: true } }),
    prisma.tarea.groupBy({
      by: ["semana"],
      where: { responsableEmail: yo, archivadaAt: null, estado: { in: ["pendiente", "en_curso"] }, semana: { lt: aDate(lunes) } },
      _count: { _all: true },
    }),
    prisma.tarea.findMany({
      where: { creadaPorEmail: yo, clientId: { not: null }, createdAt: { gte: aDate(sumarDias(hoy, -60)) } },
      select: { clientId: true },
      distinct: ["clientId"],
      take: 60,
    }),
  ]);

  // Lo que nombra lo pendiente y no entró en las listas.
  const enListas = new Set([...tuyasCrudas, ...sprintCrudo].map((t) => t.numero));
  const numerosFaltan = [...new Set(o.nombradas?.numeros ?? [])].filter((n) => !enListas.has(n));
  const proyectosVistos = new Set(proyectosCrudos.map((p) => p.id));
  const proyectosFaltan = [...new Set(o.nombradas?.proyectos ?? [])].filter((id) => !proyectosVistos.has(id));
  const [tareasNombradas, proyectosNombrados, hubspotNombrados] = await Promise.all([
    numerosFaltan.length
      ? prisma.tarea.findMany({ where: { AND: [tareasVisiblesWhere(ctx), { numero: { in: numerosFaltan } }] }, select: SELECT_TAREA })
      : Promise.resolve([] as FilaDeTarea[]),
    proyectosFaltan.length
      ? prisma.proyectoDeTareas.findMany({ where: { AND: [proyectosVisiblesWhere(ctx), { id: { in: proyectosFaltan }, archivadoAt: null }] }, select: SELECT_PROYECTO })
      : Promise.resolve([] as FilaDeProyecto[]),
    o.nombradas?.proyectosHubspot?.length
      ? prisma.project.findMany({ where: { id: { in: [...o.nombradas.proyectosHubspot] } }, select: { id: true, name: true, clientId: true } })
      : Promise.resolve([]),
  ]);

  // El chip, con la visibilidad de quien pregunta. Si no pasa, se descarta.
  const chip = o.chip ? await resolverChip(o.chip, ctx, clientes) : null;

  /* ── Personas (M#): tú primero, después tu equipo, después el resto ── */
  const personasPorEmail = new Map<string, PersonaDeLaFoto>();
  const lideres = new Set<string>();
  const equiposConLider = new Set<string>();
  for (const m of ctx.miembros) {
    const equipo = claveDeEquipo(m.area, m.email);
    personasPorEmail.set(m.email, { email: m.email, nombre: m.nombre, equipo, equipoNombre: nombreDelEquipo(equipo) });
    const lidera = equiposQueLidera(m);
    if (lidera.length) {
      lideres.add(m.email);
      for (const e of lidera) equiposConLider.add(e);
    }
  }
  const ordenPersonas = [...personasPorEmail.values()].sort((a, b) => {
    const pa = a.email === yo ? 0 : a.equipo === ctx.equipo ? 1 : 2;
    const pb = b.email === yo ? 0 : b.equipo === ctx.equipo ? 1 : 2;
    return pa - pb || a.nombre.localeCompare(b.nombre, "es");
  });
  const personas = new Map(ordenPersonas.map((p, i) => [`M${i + 1}`, p]));
  const etiquetaDePersona = new Map([...personas].map(([k, p]) => [p.email, k]));
  const yoEnLaFoto = personasPorEmail.get(yo) ?? { email: yo, nombre: ctx.nombre, equipo: ctx.equipo, equipoNombre: nombreDelEquipo(ctx.equipo) };

  /* ── Espacios (E#): el de tu equipo primero (aunque todavía no exista: lo crea el aplicar) ── */
  const espaciosVista = espacios.map((e) => ({
    id: e.id,
    nombre: e.tipo === "equipo" && e.equipo ? nombreDelEquipo(e.equipo, { paraMi: e.equipo === ctx.equipo }) : e.nombre,
    tipo: e.tipo,
    equipo: e.equipo,
    puedeCrear: ctx.esSuperAdmin || (e.tipo === "equipo" ? e.equipo === ctx.equipo || ctx.lidera.includes(e.equipo ?? "") : e.miembros.some((m) => m.email === yo)),
  }));
  if (!espaciosVista.some((e) => e.tipo === "equipo" && e.equipo === ctx.equipo)) {
    espaciosVista.unshift({ id: `equipo:${ctx.equipo}`, nombre: nombreDelEquipo(ctx.equipo, { paraMi: true }), tipo: "equipo", equipo: ctx.equipo, puedeCrear: true });
  }
  espaciosVista.sort((a, b) => Number(b.equipo === ctx.equipo) - Number(a.equipo === ctx.equipo));
  const espaciosEt = new Map(espaciosVista.map((e, i) => [`E${i + 1}`, { id: e.id, nombre: e.nombre, puedeCrear: e.puedeCrear }]));
  const espaciosPorId = new Map(espaciosVista.map((e) => [e.id, { nombre: e.nombre, puedeCrear: e.puedeCrear }]));

  /* ── Proyectos (R#): los tuyos primero, después los más recientes ──
     ⛔ El chip NO cambia este bloque (va cacheado en `system`): lo que el chip suma toma una etiqueta DESPUÉS de las de
     acá, y se define en el bloque del chip. Si el chip corriera las etiquetas, cada chip invalidaría la caché. */
  const proyectosOrdenados = proyectosCrudos.sort((a, b) => {
    const ma = Number(a.responsableEmail === yo || a.creadoPorEmail === yo);
    const mb = Number(b.responsableEmail === yo || b.creadoPorEmail === yo);
    return mb - ma || b.updatedAt.getTime() - a.updatedAt.getTime();
  });

  /* ── Las tareas ── */
  const tuyas = tuyasCrudas;
  const sprint = sprintCrudo.filter((t) => !tuyas.some((x) => x.id === t.id));

  // Lo que se arma con un tamaño dado (si el texto pasa el techo, se recorta y se vuelve a armar).
  const armar = (escala: number) => {
    const n = (tope: number) => Math.max(5, Math.floor(tope * escala));
    const proyectos = proyectosOrdenados.slice(0, n(TOPES.proyectos));
    const tuyasV = tuyas.slice(0, n(TOPES.tuyas));
    const sprintV = sprint.slice(0, n(TOPES.sprint));
    const todasLasTareas = [...tuyasV, ...sprintV];

    // Clientes (C#): el del chip, los de tus tareas y proyectos, y los que usaste en 60 días.
    const candidatos = [
      ...todasLasTareas.map((t) => t.clientId),
      ...proyectos.map((p) => p.clientId),
      ...usados.map((u) => u.clientId),
    ].filter((id): id is string => !!id && clientes.ids.has(id));
    const idsDeClientes = [...new Set(candidatos)].slice(0, n(TOPES.clientes));
    const clientesEt = new Map(idsDeClientes.map((id, i) => [`C${i + 1}`, { id, nombre: clientes.porId.get(id)?.nombre ?? id }]));
    const etiquetaDeCliente = new Map([...clientesEt].map(([k, c]) => [c.id, k]));
    const proyectosEt = new Map(proyectos.map((p, i) => [`R${i + 1}`, aProyectoDeLaFoto(p, ctx)]));
    const etiquetaDeProyecto = new Map([...proyectosEt].map(([k, p]) => [p.id, k]));

    const nombreDePersona = (email: string | null) => (email ? (email === yo ? "ti" : (personasPorEmail.get(email)?.nombre ?? email)) : null);
    const cliente = (id: string | null) => (id ? (etiquetaDeCliente.get(id) ?? clientes.porId.get(id)?.nombre ?? null) : null);
    const proyecto = (t: FilaDeTarea) => (t.proyectoId ? (etiquetaDeProyecto.get(t.proyectoId) ?? (t.proyecto ? `«${t.proyecto.nombre}»` : null)) : null);

    const lineaDeTarea = (t: FilaDeTarea, quien: "tuya" | "sprint") => {
      const partes = [`T-${t.numero} «${t.titulo}»`, NOMBRE_DEL_ESTADO[leerEstado(t.estado)].toLowerCase()];
      if (quien === "tuya" && t.responsableEmail && t.responsableEmail !== yo) partes.push(`se la pediste a ${nombreDePersona(t.responsableEmail)}; todavía no decide`);
      if (quien === "sprint") partes.push(t.responsableEmail ? `de ${nombreDePersona(t.responsableEmail)}` : "por asignar");
      const semana = comoFecha(t.semana);
      partes.push(semana ? (semana === lunes ? "esta semana" : nombreDeLaSemana(semana)) : "sin semana");
      const vence = comoFecha(t.venceEl);
      if (vence) partes.push(`vence ${diaCortoConSemana(vence)}${vence < hoy && estaAbierta(t.estado) ? " (atrasada)" : ""}`);
      const c = cliente(t.clientId);
      if (c) partes.push(c);
      const p = proyecto(t);
      if (p) partes.push(p);
      if (t.minutosEstimados) partes.push(`${Math.round((t.minutosEstimados / 60) * 10) / 10} h`);
      if (t.prioridad === "alta") partes.push("prioridad alta");
      if (t.privada) partes.push("solo para ti");
      return partes.join(" · ");
    };

    const lineas: string[] = [];
    lineas.push(
      `HOY: ${diaCortoConSemana(hoy)} (${nombreDeLaSemana(lunes)}). Hablas con ${yoEnLaFoto.nombre} (${etiquetaDePersona.get(yo) ?? "M1"}), de ${nombreDelEquipo(ctx.equipo)}` +
        (ctx.lidera.length ? `; lidera ${ctx.lidera.map((e) => nombreDelEquipo(e)).join(", ")}.` : "."),
    );
    lineas.push("", "PERSONAS (M#)");
    for (const [k, p] of personas) lineas.push(`${k} ${p.nombre}${p.email === yo ? " (tú)" : ""} · ${p.equipoNombre}${lideres.has(p.email) ? " · líder" : ""}`);
    if (equiposConLider.size) lineas.push(`Equipos a los que se les puede pedir (equipo:<clave>): ${[...equiposConLider].filter((e) => !e.startsWith("persona:")).map((e) => `${e} (${nombreDelEquipo(e)})`).join(", ")}.`);
    lineas.push("", "ESPACIOS (E#)");
    for (const [k, e] of espaciosEt) lineas.push(`${k} ${e.nombre}${e.puedeCrear ? "" : " · ahí no creas proyectos"}`);
    lineas.push("", `PROYECTOS DE TAREAS QUE VES (R#)${proyectos.length ? "" : ": ninguno"}`);
    for (const [k, p] of proyectosEt) {
      const fila = proyectos.find((x) => x.id === p.id)!;
      const partes = [`${k} «${p.nombre}»`, NOMBRE_DEL_ESTADO_DE_PROYECTO[leerEstadoDeProyecto(p.estado)].toLowerCase()];
      const c = cliente(p.clientId);
      if (c) partes.push(c);
      if (fila.responsableEmail) partes.push(`resp. ${nombreDePersona(fila.responsableEmail)}`);
      if (p.iniciaEl) partes.push(`inicia ${diaCortoConSemana(p.iniciaEl)}`);
      const vence = comoFecha(fila.venceEl);
      if (vence) partes.push(`vence ${diaCortoConSemana(vence)}`);
      if (!p.administra) partes.push("no lo administras");
      lineas.push(partes.join(" · "));
    }
    if (proyectosOrdenados.length > proyectos.length) lineas.push(`(y ${proyectosOrdenados.length - proyectos.length} más que no entran)`);
    lineas.push("", `CLIENTES (C#)${clientesEt.size ? "" : ": ninguno todavía"}. Otro cliente que veas se puede nombrar por su nombre exacto.`);
    for (const [k, c] of clientesEt) lineas.push(`${k} ${c.nombre}`);
    lineas.push("", `TUS TAREAS ABIERTAS Y LO QUE ESPERA TU DECISIÓN${tuyasV.length ? "" : ": nada"}`);
    for (const t of tuyasV) lineas.push(lineaDeTarea(t, "tuya"));
    if (tuyas.length > tuyasV.length) lineas.push(`(y ${tuyas.length - tuyasV.length} más)`);
    if (ctx.lidera.length) {
      lineas.push("", `TU SPRINT ESTA SEMANA Y «POR ASIGNAR» (lo que ves)${sprintV.length ? "" : ": nada"}`);
      for (const t of sprintV) lineas.push(lineaDeTarea(t, "sprint"));
      if (sprint.length > sprintV.length) lineas.push(`(y ${sprint.length - sprintV.length} más)`);
    }
    const revisadas = new Set(cierres.map((c) => comoFecha(c.semana)!));
    const ultimaRevisada = [...revisadas].filter((s) => s < lunes).sort().pop();
    const sinRevisar = atrasadas.map((a) => ({ semana: comoFecha(a.semana)!, n: a._count._all })).filter((a) => a.semana && !revisadas.has(a.semana)).sort((a, b) => a.semana.localeCompare(b.semana));
    lineas.push(
      "",
      "SEMANAS: " +
        (ultimaRevisada ? `la última que revisaste es la ${nombreDeLaSemana(ultimaRevisada)}.` : "todavía no revisaste ninguna.") +
        (sinRevisar.length ? ` Te falta revisar: ${sinRevisar.map((s) => `${nombreDeLaSemana(s.semana)} (${s.n} abiertas)`).join(", ")}. Se revisan en «Revisa tu semana».` : ""),
    );
    return { texto: lineas.join("\n"), clientesEt, proyectosEt, todasLasTareas, revisadas };
  };

  let r = armar(1);
  for (const escala of [0.7, 0.5, 0.35, 0.25]) {
    if (r.texto.length <= TECHO_DEL_CONTEXTO_DE_TAREAS) break;
    r = armar(escala);
  }
  const texto = r.texto.length > TECHO_DEL_CONTEXTO_DE_TAREAS ? r.texto.slice(0, TECHO_DEL_CONTEXTO_DE_TAREAS - 1) + "…" : r.texto;

  /* ── La foto ── */
  const tareas = new Map<number, TareaDeLaFoto>();
  /* Lo nombrado que estaba en las listas crudas pero quedó fuera del recorte del texto también entra a la foto: sin esto,
     una T-# tuya en el puesto 41–80 se aceptaba en el turno y fallaba al aplicar (la foto del aplicar no la tenía). */
  const nombradas = new Set(o.nombradas?.numeros ?? []);
  const crudasNombradas = [...tuyasCrudas, ...sprintCrudo].filter((t) => nombradas.has(t.numero));
  for (const t of [...r.todasLasTareas, ...crudasNombradas, ...(chip?.tareas ?? []), ...tareasNombradas]) tareas.set(t.numero, aTareaDeLaFoto(t, ctx, lunes));
  // Lo que suma el chip, con etiquetas que siguen a las del contexto.
  const clientesEt = new Map(r.clientesEt);
  if (chip?.clienteId && clientes.ids.has(chip.clienteId) && ![...clientesEt.values()].some((c) => c.id === chip.clienteId)) {
    clientesEt.set(`C${clientesEt.size + 1}`, { id: chip.clienteId, nombre: clientes.porId.get(chip.clienteId)?.nombre ?? chip.clienteId });
  }
  const proyectosEt = new Map(r.proyectosEt);
  for (const p of chip?.proyectos ?? []) {
    if (![...proyectosEt.values()].some((x) => x.id === p.id)) proyectosEt.set(`R${proyectosEt.size + 1}`, aProyectoDeLaFoto(p, ctx));
  }
  const proyectosPorId = new Map<string, ProyectoDeLaFoto>();
  for (const p of [...proyectosOrdenados, ...(chip?.proyectos ?? []), ...proyectosNombrados]) proyectosPorId.set(p.id, aProyectoDeLaFoto(p, ctx));
  const proyectosHubspot = new Map((chip?.proyectosHubspot ?? []).map((h, i) => [`H${i + 1}`, h]));
  const proyectosHubspotPorId = new Map<string, { nombre: string; clientId: string }>();
  for (const h of hubspotNombrados) proyectosHubspotPorId.set(h.id, { nombre: h.name, clientId: h.clientId });
  for (const h of chip?.proyectosHubspot ?? []) proyectosHubspotPorId.set(h.id, { nombre: h.nombre, clientId: h.clientId });

  const foto: FotoDeTareas = {
    ahora,
    yo: { ...yoEnLaFoto, lidera: ctx.lidera, esSuperAdmin: ctx.esSuperAdmin },
    personas,
    clientes: clientesEt,
    proyectosHubspot,
    proyectos: proyectosEt,
    espacios: espaciosEt,
    personasPorEmail,
    clientesVisibles: clientes.ids,
    nombresDeClientes: new Map([...clientes.porId].map(([id, c]) => [id, c.nombre])),
    proyectosHubspotPorId,
    proyectosPorId,
    espaciosPorId,
    tareas,
    equiposConLider,
    semanasRevisadas: r.revisadas,
  };

  // El chip nombra con las etiquetas de la foto (se arma después de etiquetar).
  return { foto, texto, chip: chip ? chip.texto(foto) : null, sesionDelChip: chip?.sesion ?? null };
}

/* ── El chip ────────────────────────────────────────────────────────────────────────────────────────────────────── */

interface ChipResuelto {
  tareas: FilaDeTarea[];
  proyectos: FilaDeProyecto[];
  clienteId: string | null;
  proyectosHubspot: { id: string; nombre: string; clientId: string }[];
  /**
   * La reunión de la que sale lo que el chip le muestra al modelo (la reunión misma, o la de la tarea). Las tareas que
   * se crean en ese turno quedan atadas a ella, así su contexto se ve con la regla de su cita y no con la fila.
   */
  sesion: string | null;
  /** El texto, armado con las etiquetas de la foto ya hecha. */
  texto(foto: FotoDeTareas): string;
}

const etiquetaPorId = <T extends { id: string }>(m: ReadonlyMap<string, T>, id: string | null) =>
  id ? ([...m].find(([, v]) => v.id === id)?.[0] ?? null) : null;

function recortar(s: string, techo = TECHO_DEL_CHIP): string {
  return s.length > techo ? s.slice(0, techo - 1) + "…" : s;
}

async function resolverChip(chip: ChipDeTareas, ctx: ContextoDeTareas, clientes: ClientesQueVes): Promise<ChipResuelto | null> {
  switch (chip.tipo) {
    case "tarea": {
      const t = await prisma.tarea.findFirst({
        where: { AND: [tareasVisiblesWhere(ctx), { id: chip.id }] },
        select: {
          ...SELECT_TAREA,
          notas: true,
          contexto: true,
          sessionId: true,
          cita: true,
          bloqueadaPor: { where: { tipo: "bloquea" }, select: { desdeId: true } },
          comentarios: { where: { archivadoAt: null }, orderBy: { createdAt: "desc" }, take: 5, select: { autorEmail: true, cuerpo: true } },
          eventos: { orderBy: { createdAt: "desc" }, take: 8, select: { tipo: true, porEmail: true, createdAt: true } },
        },
      });
      if (!t) return null;
      const esperaA = t.bloqueadaPor.map((r) => r.desdeId);
      const visibles = esperaA.length
        ? await prisma.tarea.findMany({ where: { AND: [tareasVisiblesWhere(ctx), { id: { in: esperaA } }] }, select: { id: true, numero: true, titulo: true, estado: true } })
        : [];
      // ⛔ Las notas que repiten la cita de la reunión no entran.
      const notas = t.notas && !(t.sessionId && t.cita && t.cita.includes(t.notas.trim())) ? t.notas : null;
      // El contexto que escribió Nexus, con la misma regla que en la pantalla (el de una reunión, solo si lo vería).
      let contexto = t.contexto && !t.sessionId ? t.contexto : null;
      if (t.contexto && t.sessionId) {
        const sala = (await salasDeReuniones({ email: ctx.email, esSuperAdmin: ctx.esSuperAdmin, clientes }, [t.sessionId])).get(t.sessionId);
        if (sala && veElContexto(sala, t, { email: ctx.email, esSuperAdmin: ctx.esSuperAdmin, lidera: ctx.lidera })) contexto = t.contexto;
      }
      return {
        tareas: [t],
        proyectos: [],
        clienteId: t.clientId,
        proyectosHubspot: [],
        sesion: t.sessionId,
        texto: () => {
          const l = [`SOBRE LA TAREA T-${t.numero} «${t.titulo}» (${NOMBRE_DEL_ESTADO[leerEstado(t.estado)].toLowerCase()})`];
          if (contexto) l.push(`Contexto: ${contexto.slice(0, 800)}`);
          if (notas) l.push(`Notas: ${notas.slice(0, 1_500)}`);
          if (esperaA.length) {
            const nombres = esperaA.map((id) => {
              const v = visibles.find((x) => x.id === id);
              return v ? `T-${v.numero} «${v.titulo}» (${NOMBRE_DEL_ESTADO[leerEstado(v.estado)].toLowerCase()})` : "una tarea que no ves";
            });
            l.push(`Espera a: ${nombres.join(", ")}.`);
          }
          if (t.comentarios.length) l.push("Comentarios recientes:", ...t.comentarios.map((c) => `- ${c.autorEmail === ctx.email ? "Tú" : c.autorEmail}: ${c.cuerpo.slice(0, 400)}`));
          if (t.eventos.length) l.push(`Historia: ${t.eventos.map((e) => `${e.tipo} (${diaCortoConSemana(hoyEnCostaRica(e.createdAt))})`).join(" · ")}.`);
          return recortar(l.join("\n"));
        },
      };
    }
    case "proyecto": {
      const p = await prisma.proyectoDeTareas.findFirst({ where: { AND: [proyectosVisiblesWhere(ctx), { id: chip.id, archivadoAt: null }] }, select: { ...SELECT_PROYECTO, secciones: true } });
      if (!p) return null;
      const tareas = await prisma.tarea.findMany({
        where: { AND: [tareasVisiblesWhere(ctx), { proyectoId: p.id, estado: { notIn: ["rechazada", "fusionada", "vencida"] } }] },
        select: { ...SELECT_TAREA, seccion: true },
        orderBy: { numero: "asc" },
        take: TOPES.delChip,
      });
      return {
        tareas,
        proyectos: [p],
        // Solo títulos y estados: nada de una reunión.
        sesion: null,
        clienteId: p.clientId,
        proyectosHubspot: [],
        texto: (foto) => {
          const r = etiquetaPorId(foto.proyectos, p.id);
          const l = [`SOBRE EL PROYECTO ${r ?? ""} «${p.nombre}» (${NOMBRE_DEL_ESTADO_DE_PROYECTO[leerEstadoDeProyecto(p.estado)].toLowerCase()})`];
          if (p.secciones.length) l.push(`Secciones: ${p.secciones.join(", ")}.`);
          l.push(`Sus tareas que ves (${tareas.length}):`);
          for (const t of tareas) {
            const semana = comoFecha(t.semana);
            const vence = comoFecha(t.venceEl);
            l.push(
              [`T-${t.numero} «${t.titulo}»`, NOMBRE_DEL_ESTADO[leerEstado(t.estado)].toLowerCase(), t.responsableEmail ? (foto.personasPorEmail.get(t.responsableEmail)?.nombre ?? t.responsableEmail) : "sin responsable", t.seccion, semana ? nombreDeLaSemana(semana) : null, vence ? `vence ${diaCortoConSemana(vence)}` : null]
                .filter(Boolean)
                .join(" · "),
            );
          }
          return recortar(l.join("\n"));
        },
      };
    }
    case "cliente": {
      if (!clientes.ids.has(chip.id)) return null;
      const [hubspot, proyectos] = await Promise.all([
        prisma.project.findMany({ where: proyectoClasificableWhere({ clientId: chip.id }), select: { id: true, name: true, clientId: true }, orderBy: { name: "asc" }, take: 20 }),
        prisma.proyectoDeTareas.findMany({ where: { AND: [proyectosVisiblesWhere(ctx), { clientId: chip.id, archivadoAt: null, estado: { in: ESTADOS_DE_PROYECTO_VIVOS } }] }, select: SELECT_PROYECTO, take: 15 }),
      ]);
      const nombre = clientes.porId.get(chip.id)?.nombre ?? "el cliente";
      const hs = hubspot.map((h) => ({ id: h.id, nombre: h.name, clientId: h.clientId }));
      return {
        tareas: [],
        proyectos,
        sesion: null,
        clienteId: chip.id,
        proyectosHubspot: hs,
        texto: (foto) => {
          const c = etiquetaPorId(foto.clientes, chip.id);
          const l = [`SOBRE EL CLIENTE ${c ?? ""} ${nombre}`];
          l.push(hs.length ? "Sus proyectos de HubSpot (H#):" : "No tiene proyectos de HubSpot activos.");
          hs.forEach((h, i) => l.push(`H${i + 1} ${h.nombre}`));
          if (proyectos.length) l.push(`Sus proyectos de tareas que ves: ${proyectos.map((p) => `${etiquetaPorId(foto.proyectos, p.id) ?? ""} «${p.nombre}»`).join(", ")}.`);
          l.push("El cronograma que ve el cliente no se toca desde acá: lo que acuerdes son tareas internas.");
          return recortar(l.join("\n"));
        },
      };
    }
    case "reunion": {
      // ⛔ Solo por el chokepoint, y solo los próximos pasos y el resumen: nunca la transcripción.
      const [r] = await getReunionesParaTareas({ quien: { email: ctx.email, esSuperAdmin: ctx.esSuperAdmin, clientes }, ids: [chip.id], tope: 1 });
      if (!r) return null;
      const pasos = r.notas ? itemsDeProximosPasos(r.notas) : [];
      const lista = pasos.length ? pasos : itemsDeActionItems(r.actionItems);
      const resumen = r.notas ? resumenDeLasNotas(r.notas) : "";
      return {
        tareas: [],
        proyectos: [],
        clienteId: r.duenoClienteId && clientes.ids.has(r.duenoClienteId) ? r.duenoClienteId : null,
        proyectosHubspot: [],
        sesion: r.id,
        texto: (foto) => {
          const c = r.duenoClienteId ? etiquetaPorId(foto.clientes, r.duenoClienteId) : null;
          const l = [`SOBRE LA REUNIÓN «${r.titulo}» del ${diaCortoConSemana(hoyEnCostaRica(r.inicio))}${r.duenoClienteNombre ? ` (${c ?? r.duenoClienteNombre})` : " (puertas adentro)"}`];
          if (lista.length) l.push("Próximos pasos:", ...lista.map((x) => `- ${x.texto}`));
          else l.push("No trae próximos pasos.");
          if (resumen) l.push(`Resumen: ${resumen}`);
          return recortar(l.join("\n"));
        },
      };
    }
  }
}

/**
 * Carga en la foto las T-# que nombró el modelo en este turno y no estaban en las listas (solo las que ve quien pide):
 * sin esto, «muévela T-88» se rechazaría por no estar entre las 40 de la lista.
 */
export async function sumarTareasNombradas(foto: FotoDeTareas, ctx: ContextoDeTareas, numeros: readonly number[]): Promise<FotoDeTareas> {
  const faltan = [...new Set(numeros)].filter((n) => !foto.tareas.has(n));
  if (!faltan.length) return foto;
  const filas = await prisma.tarea.findMany({ where: { AND: [tareasVisiblesWhere(ctx), { numero: { in: faltan } }] }, select: SELECT_TAREA });
  if (!filas.length) return foto;
  const lunes = lunesDeHoy(foto.ahora);
  const tareas = new Map(foto.tareas);
  for (const t of filas) tareas.set(t.numero, aTareaDeLaFoto(t, ctx, lunes));
  return { ...foto, tareas };
}
