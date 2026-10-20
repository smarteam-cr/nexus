/**
 * lib/tareas/consultas.ts — lo que leen las pantallas de Tareas internas. SERVIDOR.
 *
 * Toda lista sale filtrada por `tareasVisiblesWhere` (lib/tareas/visibilidad.ts) y serializada por
 * lib/tareas/serializar.ts. «Para ti» y el chat se recortan a lo de la persona aunque sea Super Admin.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { cargarConfigCarga } from "@/lib/carga/queries";
import { horasDisponibles } from "@/lib/carga/config";
import { NOMBRE_DEL_ESTADO, ORDEN_DE_PRIORIDAD, SISTEMA, accionesDe, leerEstado, leerPrioridad, estaAbierta } from "./estados";
import { aDate, comoFecha, enVentanaDeRevision, hoyEnCostaRica, lunesDeFecha, lunesDeHoy, sumarSemanas } from "./semana";
import { EQUIPOS, claveDeEquipo, esEquipoPersonal, nombreDelEquipo } from "./equipos";
import { ABIERTAS_WHERE, PROPUESTAS_WHERE, TRABAJO_WHERE } from "./donde";
import { administraElProyecto, espaciosVisiblesWhere, tareasOpacasDelSprintWhere, tareasVisiblesWhere, proyectosVisiblesWhere, veLaTarea } from "./visibilidad";
import { SELECT_PROYECTO, SELECT_TAREA, prepararSerializacion, serializarProyecto, serializarTarea, type FilaDeProyecto, type FilaDeTarea } from "./serializar";
import { ErrorDeTareas, lideresDe, type ContextoDeTareas } from "./servidor";
import { datosDeAmbito } from "./ambito-server";
import { salasDeReuniones } from "@/lib/sessions/reuniones-para-tareas";
import { proyectoClasificableWhere } from "@/lib/projects/scope";
import type { ClientesQueVes } from "./clientes";
import type { ComentarioVista, DatosDelEspacio, DuenoDelVinculo, PermisosDeVinculo, RegistroParaVincular, VinculoVista, EspacioEnLista, GrupoPorCliente, LoQueDelegasteDatos, MisTareasDatos, MovimientoDeTarea, OpcionesDeTareas, PeriodoPorCliente, PersonaDeLaSemana, PorClienteDatos, ProyectoVista, SemanaDelEquipoDatos, TareaDeLaReunion, TareasDeLaCuentaDatos, TareasDelProyectoDatos, TareaVista } from "./tipos";
import { NOMBRE_DEL_AMBITO, type Ambito } from "./ambito";
import { metricasDeLaSemana, type MetricasDeLaSemana } from "./metricas";
import { instanteCR } from "./agenda";
import { hubspotRecordUrl } from "@/lib/hubspot/urls";
import { DE_LA_PREVENTA } from "@/lib/exploraciones/marco";

/** Por prioridad, después por vencimiento y número. */
export function ordenarTareas<T extends { prioridad: string; venceEl: string | null; numero: number }>(lista: T[]): T[] {
  return [...lista].sort(
    (a, b) =>
      ORDEN_DE_PRIORIDAD[leerPrioridad(a.prioridad)] - ORDEN_DE_PRIORIDAD[leerPrioridad(b.prioridad)] ||
      (a.venceEl ?? "9999").localeCompare(b.venceEl ?? "9999") ||
      a.numero - b.numero,
  );
}

async function avanceDeProyectos(ids: readonly string[], ctx: ContextoDeTareas, lunes: string) {
  const mapa = new Map<string, { hechas: number; total: number; sumadasEstaSemana: number; queVes: number; propuestas: number }>();
  if (!ids.length) return mapa;
  const [todas, visibles] = await Promise.all([
    prisma.tarea.findMany({
      where: { proyectoId: { in: [...ids] }, archivadaAt: null, estado: { in: [...TRABAJO_WHERE.estado.in, "propuesta"] } },
      select: { proyectoId: true, estado: true, createdAt: true },
    }),
    prisma.tarea.groupBy({ by: ["proyectoId"], where: { AND: [{ proyectoId: { in: [...ids] } }, TRABAJO_WHERE, tareasVisiblesWhere(ctx)] }, _count: { _all: true } }),
  ]);
  const desde = aDate(lunes);
  for (const id of ids) mapa.set(id, { hechas: 0, total: 0, sumadasEstaSemana: 0, queVes: 0, propuestas: 0 });
  for (const t of todas) {
    const a = mapa.get(t.proyectoId!)!;
    if (t.estado === "propuesta") {
      a.propuestas++;
      continue;
    }
    a.total++;
    if (t.estado === "hecha") a.hechas++;
    if (t.createdAt >= desde) a.sumadasEstaSemana++;
  }
  for (const v of visibles) if (v.proyectoId && mapa.has(v.proyectoId)) mapa.get(v.proyectoId)!.queVes = v._count._all;
  return mapa;
}

async function serializarProyectos(filas: FilaDeProyecto[], ctx: ContextoDeTareas, clientes: ClientesQueVes, ahora: Date): Promise<ProyectoVista[]> {
  if (!filas.length) return [];
  const [s, ambito, salas, avance] = await Promise.all([
    prepararSerializacion(ctx, clientes, [], ahora),
    datosDeAmbito(filas.map((p) => p.clientId), filas.map((p) => p.projectId)),
    salasDeReuniones({ email: ctx.email, esSuperAdmin: ctx.esSuperAdmin, clientes }, filas.map((p) => p.sessionId).filter((x): x is string => !!x)),
    avanceDeProyectos(filas.map((p) => p.id), ctx, lunesDeHoy(ahora)),
  ]);
  s.ambito = ambito;
  for (const [k, v] of salas) s.salas.set(k, v);
  return filas.map((p) => serializarProyecto(p, s, avance.get(p.id)!));
}

async function serializarTareas(filas: FilaDeTarea[], ctx: ContextoDeTareas, clientes: ClientesQueVes, ahora: Date): Promise<TareaVista[]> {
  if (!filas.length) return [];
  const s = await prepararSerializacion(ctx, clientes, filas, ahora);
  return filas.map((f) => serializarTarea(f, s));
}

/* ── Mis tareas ──────────────────────────────────────────────────────────────────── */

/** La última semana que cerró el sistema por esta persona, si no pasaron 7 días: «El sistema pasó N tareas…». */
async function cerradaPorElSistema(yo: string, cierres: { semana: Date; cerradaPor: string; cerradaAt: Date }[], ahora: Date): Promise<{ semana: string; pasadas: number } | null> {
  const delSistema = cierres
    .filter((c) => c.cerradaPor === SISTEMA && +ahora - +c.cerradaAt < 7 * 86_400_000)
    .sort((a, b) => +b.semana - +a.semana)[0];
  if (!delSistema) return null;
  const pasadas = await prisma.resultadoDeSemana.count({ where: { semana: delSistema.semana, responsableEmail: yo, decididoPor: SISTEMA } });
  return pasadas ? { semana: comoFecha(delSistema.semana)!, pasadas } : null;
}

export async function cargarMisTareas(ctx: ContextoDeTareas, clientes: ClientesQueVes, ahora = new Date()): Promise<MisTareasDatos> {
  const yo = ctx.email;
  const lunes = lunesDeHoy(ahora);
  const hace14 = new Date(+ahora - 14 * 86_400_000);
  const misEquipos = [...new Set([ctx.equipo, ...ctx.lidera])];

  const [porDecidirF, mias, pedidasF, hechasF, porAsignarF, revisadas, proyectosPorDecidirF, misProyectosF, eventosMios, config] = await Promise.all([
    prisma.tarea.findMany({
      // Con AND y no con spread: las dos llevan su propio OR y una pisaría a la otra.
      where: {
        AND: [
          tareasVisiblesWhere(ctx),
          {
            ...PROPUESTAS_WHERE,
            OR: [{ responsableEmail: yo }, { responsableEmail: null, equipo: { in: [...ctx.lidera] } }],
            // Un plan del chat en borrador no reparte nada hasta que se activa.
            NOT: { proyecto: { estado: "propuesta", origen: { in: ["chat", "plantilla"] } } },
          },
        ],
      },
      select: SELECT_TAREA,
      orderBy: { createdAt: "asc" },
      take: 200,
    }),
    prisma.tarea.findMany({ where: { ...ABIERTAS_WHERE, responsableEmail: yo }, select: SELECT_TAREA, take: 400 }),
    prisma.tarea.findMany({
      // «No es mía» incluye el pedido a un equipo, que todavía no tiene responsable (un `not` de Prisma deja afuera el null).
      where: {
        archivadaAt: null,
        pedidaPorEmail: yo,
        AND: [
          { OR: [{ responsableEmail: null }, { responsableEmail: { not: yo } }] },
          { OR: [{ estado: { in: ["propuesta", "pendiente", "en_curso"] } }, { updatedAt: { gte: hace14 } }] },
        ],
      },
      select: SELECT_TAREA,
      orderBy: { updatedAt: "desc" },
      take: 60,
    }),
    prisma.tarea.findMany({ where: { responsableEmail: yo, estado: "hecha", completadaAt: { gte: hace14 }, archivadaAt: null }, select: SELECT_TAREA, orderBy: { completadaAt: "desc" }, take: 60 }),
    prisma.tarea.findMany({ where: { AND: [tareasVisiblesWhere(ctx), { ...ABIERTAS_WHERE, responsableEmail: null, equipo: { in: misEquipos } }] }, select: SELECT_TAREA, take: 60 }),
    prisma.cierreDeSemana.findMany({ where: { personaEmail: yo }, select: { semana: true, cerradaPor: true, cerradaAt: true } }),
    prisma.proyectoDeTareas.findMany({
      where: {
        estado: "propuesta",
        archivadoAt: null,
        OR: [{ lectura: { pedidaPorEmail: yo } }, { espacio: { equipo: { in: [...ctx.lidera] } } }, { creadoPorEmail: yo }],
      },
      select: SELECT_PROYECTO,
      take: 20,
    }),
    prisma.proyectoDeTareas.findMany({
      where: {
        estado: { in: ["activo", "en_pausa"] },
        archivadoAt: null,
        AND: [proyectosVisiblesWhere(ctx), { OR: [{ responsableEmail: yo }, { tareas: { some: { responsableEmail: yo, ...ABIERTAS_WHERE } } }, { espacio: { equipo: ctx.equipo } }] }],
      },
      select: SELECT_PROYECTO,
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    prisma.tareaEvento.count({ where: { porEmail: yo } }),
    cargarConfigCarga().catch(() => null),
  ]);

  const todasF = [...new Map([...porDecidirF, ...mias, ...pedidasF, ...hechasF, ...porAsignarF].map((f) => [f.id, f])).values()];
  const vistas = new Map((await serializarTareas(todasF, ctx, clientes, ahora)).map((t) => [t.id, t]));
  const v = (f: FilaDeTarea) => vistas.get(f.id)!;

  const revisadasSet = new Set(revisadas.map((r) => comoFecha(r.semana)!));
  const abiertasMias = mias.map(v);
  const estaSemana = ordenarTareas(abiertasMias.filter((t) => t.semana === lunes));
  const masAdelante = ordenarTareas(abiertasMias.filter((t) => !t.semana || t.semana > lunes));
  const pasadas = abiertasMias.filter((t) => t.semana && t.semana < lunes);
  const porSemana = new Map<string, number>();
  for (const t of pasadas) if (!revisadasSet.has(t.semana!)) porSemana.set(t.semana!, (porSemana.get(t.semana!) ?? 0) + 1);
  // Las tareas abiertas de una semana pasada que ya está revisada (no debería haber) se muestran en esta semana.
  for (const t of pasadas) if (revisadasSet.has(t.semana!)) estaSemana.push(t);

  const minutos = estaSemana.reduce((a, t) => a + (t.minutosEstimados ?? 0), 0);
  const sinEstimar = estaSemana.filter((t) => !t.minutosEstimados).length;
  const disponibles = config ? Math.round(horasDisponibles(config.config, yo) * 60) : 32 * 60;

  return {
    yo: { email: yo, nombre: ctx.nombre, equipo: ctx.equipo, equipoNombre: nombreDelEquipo(ctx.equipo, { paraMi: true, miembros: ctx.companeros.length }), lidera: [...ctx.lidera], esSuperAdmin: ctx.esSuperAdmin },
    hoy: hoyEnCostaRica(ahora),
    lunesDeHoy: lunes,
    enVentanaDeRevision: enVentanaDeRevision(ahora),
    porDecidir: porDecidirF.map(v),
    proyectosPorDecidir: await serializarProyectos(proyectosPorDecidirF, ctx, clientes, ahora),
    estaSemana,
    masAdelante,
    loQuePediste: pedidasF.map(v),
    hechas: hechasF.map(v),
    porAsignar: ordenarTareas(porAsignarF.map(v)),
    semanasSinRevisar: [...porSemana.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([semana, abiertas]) => ({ semana, abiertas })),
    cerradaPorElSistema: await cerradaPorElSistema(yo, revisadas, ahora),
    proyectos: await serializarProyectos(misProyectosF, ctx, clientes, ahora),
    horas: { minutos, disponibles, sinEstimar },
    sinAgendar: estaSemana.filter((t) => estaAbierta(t.estado) && t.agenda.estado !== "agendada").length,
    primeraVez: eventosMios === 0 && todasF.length === 0,
  };
}

/* ── Una semana de una persona (para «Revisa tu semana») ─────────────────────────── */

export async function cargarSemanaDePersona(ctx: ContextoDeTareas, clientes: ClientesQueVes, persona: string, semana: string, ahora = new Date()) {
  const W = lunesDeFecha(semana);
  const p = persona.toLowerCase();
  const m = ctx.miembros.find((x) => x.email === p);
  if (!m) throw new ErrorDeTareas(404, "Esa persona no está en el equipo.");
  const equipo = claveDeEquipo(m.area, m.email);
  if (p !== ctx.email && !ctx.lidera.includes(equipo) && !ctx.esSuperAdmin) throw new ErrorDeTareas(403, "Solo la persona o su líder revisan esa semana.");
  // Lo ya respondido en W también entra: una que «sigue» ya está en otra semana, y corregir la revisión la tiene que ver.
  const respondidas = await prisma.resultadoDeSemana.findMany({ where: { semana: aDate(W), responsableEmail: p }, select: { tareaId: true } });
  // De otra persona, la líder ve solo lo de su sprint y nunca lo privado (ni lo de un espacio privado donde no está):
  // el mismo filtro de visibilidad que el resto de las listas.
  const filas = await prisma.tarea.findMany({
    where: {
      AND: [
        tareasVisiblesWhere(ctx),
        {
          archivadaAt: null,
          responsableEmail: p,
          OR: [{ semana: aDate(W), estado: { in: ["pendiente", "en_curso", "hecha", "no_se_hara"] } }, { id: { in: respondidas.map((r) => r.tareaId) } }],
          ...(p !== ctx.email && !ctx.esSuperAdmin ? { equipo: { in: [...ctx.lidera] } } : {}),
        },
      ],
    },
    select: SELECT_TAREA,
  });
  const resultados = await prisma.resultadoDeSemana.findMany({ where: { semana: aDate(W), tareaId: { in: filas.map((f) => f.id) } }, select: { tareaId: true, resultado: true, decididoPor: true } });
  const cierre = await prisma.cierreDeSemana.findUnique({ where: { personaEmail_semana: { personaEmail: p, semana: aDate(W) } }, select: { cerradaPor: true, cerradaAt: true } });
  const tareas = ordenarTareas(await serializarTareas(filas, ctx, clientes, ahora));
  return {
    persona: { email: p, nombre: m.nombre, equipo },
    semana: W,
    lunesDeHoy: lunesDeHoy(ahora),
    tareas,
    resultados: Object.fromEntries(resultados.map((r) => [r.tareaId, { resultado: r.resultado, decididoPor: r.decididoPor }])),
    cierre: cierre ? { cerradaPor: cierre.cerradaPor, cerradaAt: cierre.cerradaAt.toISOString() } : null,
  };
}

/* ── La semana del equipo ────────────────────────────────────────────────────────── */

export async function cargarSemanaDelEquipo(ctx: ContextoDeTareas, clientes: ClientesQueVes, equipoPedido: string | null, semanaPedida: string | null, ahora = new Date()): Promise<SemanaDelEquipoDatos> {
  const equipo = equipoPedido || ctx.equipo;
  const puede = ctx.esSuperAdmin || equipo === ctx.equipo || ctx.lidera.includes(equipo);
  if (!puede) throw new ErrorDeTareas(403, "Ves la semana de tu equipo.");
  const lunes = lunesDeHoy(ahora);
  const W = semanaPedida ? lunesDeFecha(semanaPedida) : lunes;
  const personas = ctx.miembros.filter((m) => claveDeEquipo(m.area, m.email) === equipo);
  const emails = personas.map((p) => p.email);

  const [filas, opacas, porAsignarF, pedidoF, cierres, espacio, config] = await Promise.all([
    prisma.tarea.findMany({
      where: { AND: [tareasVisiblesWhere(ctx), { equipo, semana: aDate(W), responsableEmail: { in: emails }, ...TRABAJO_WHERE }] },
      select: SELECT_TAREA,
      take: 500,
    }),
    prisma.tarea.findMany({ where: { ...tareasOpacasDelSprintWhere(ctx, equipo), semana: aDate(W), estado: { in: ["pendiente", "en_curso", "hecha"] } }, select: { responsableEmail: true, privada: true, minutosEstimados: true } }),
    prisma.tarea.findMany({ where: { AND: [tareasVisiblesWhere(ctx), { ...ABIERTAS_WHERE, equipo, responsableEmail: null }] }, select: SELECT_TAREA, take: 100 }),
    prisma.tarea.findMany({
      where: { AND: [tareasVisiblesWhere(ctx), { archivadaAt: null, pedidaPorEquipo: equipo, createdAt: { gte: aDate(sumarSemanas(W, -4)) } }] },
      select: SELECT_TAREA,
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
    prisma.cierreDeSemana.findMany({ where: { semana: aDate(W), personaEmail: { in: emails } }, select: { personaEmail: true } }),
    prisma.espacioDeTareas.findUnique({ where: { equipo }, select: { id: true } }),
    cargarConfigCarga().catch(() => null),
  ]);
  const proyectosF = espacio
    ? await prisma.proyectoDeTareas.findMany({ where: { espacioId: espacio.id, archivadoAt: null, estado: { in: ["activo", "en_pausa", "propuesta"] } }, select: SELECT_PROYECTO, orderBy: { updatedAt: "desc" }, take: 30 })
    : [];

  const todas = [...new Map([...filas, ...porAsignarF, ...pedidoF].map((f) => [f.id, f])).values()];
  const vistas = new Map((await serializarTareas(todas, ctx, clientes, ahora)).map((t) => [t.id, t]));
  const revisaron = new Set(cierres.map((c) => c.personaEmail));

  const porPersona: PersonaDeLaSemana[] = personas.map((m) => {
    const tareas = ordenarTareas(filas.filter((f) => f.responsableEmail === m.email).map((f) => vistas.get(f.id)!));
    const suyasOpacas = opacas.filter((o) => o.responsableEmail === m.email).map((o) => ({ titulo: o.privada ? "Tarea privada" : "Tarea de un espacio privado", minutos: o.minutosEstimados }));
    const abiertas = tareas.filter((t) => estaAbierta(t.estado));
    return {
      persona: { email: m.email, nombre: m.nombre, equipo },
      tareas,
      opacas: suyasOpacas,
      minutos: [...tareas, ...suyasOpacas].reduce((a, t) => a + (("minutosEstimados" in t ? t.minutosEstimados : t.minutos) ?? 0), 0),
      disponibles: config ? Math.round(horasDisponibles(config.config, m.email) * 60) : 32 * 60,
      sinEstimar: [...tareas.filter((t) => !t.minutosEstimados), ...suyasOpacas.filter((o) => !o.minutos)].length,
      revisada: revisaron.has(m.email),
      faltan: W < lunes || (W === lunes && enVentanaDeRevision(ahora)) ? abiertas.length : 0,
    };
  });

  return {
    equipo,
    equipoNombre: nombreDelEquipo(equipo, { paraMi: equipo === ctx.equipo, miembros: personas.length }),
    semana: W,
    lunesDeHoy: lunes,
    lideras: ctx.lidera.includes(equipo) || ctx.esSuperAdmin,
    personas: porPersona,
    porAsignar: ordenarTareas(porAsignarF.map((f) => vistas.get(f.id)!)),
    pedidoAOtros: pedidoF.map((f) => vistas.get(f.id)!),
    proyectos: await serializarProyectos(proyectosF, ctx, clientes, ahora),
    equipos: (ctx.esSuperAdmin ? EQUIPOS.map((e) => e.clave) : [...new Set([ctx.equipo, ...ctx.lidera])]).filter((c) => !esEquipoPersonal(c)).map((c) => ({ clave: c, nombre: nombreDelEquipo(c) })),
  };
}

/* ── Una tarea, un proyecto ──────────────────────────────────────────────────────── */

const NOMBRE_DEL_EVENTO: Record<string, string> = {
  propuesta: "Nexus la propuso",
  creada: "La creó",
  editada: "La editó",
  asignada: "La asignó",
  pase: "Cambió de manos",
  no_es_mia: "Dijo que no era suya",
  estado: "Cambió el estado",
  semana: "La movió de semana",
  decidida: "La decidió",
  mencionada: "Volvió a salir",
  agenda: "La agendó",
  revisada: "La revisó",
  sugerido_cierre: "La retro dijo algo",
  cierre_corregido: "Corrigió la revisión",
  comentada: "Comentó",
  espera: "Cambió lo que espera",
  sprint: "Pasó a su sprint",
  vinculo: "Cambió lo vinculado",
  plan: "Quedó en el borrador de un plan",
  repartida: "Se repartió al activar el plan",
  hubspot: "Cambió en HubSpot",
  a_hubspot: "Lo escribió en HubSpot",
};

/** Los campos que se sincronizan con HubSpot, dichos para la historia (lib/tareas-hubspot/reglas.ts). */
const CAMPO_DE_HUBSPOT: Record<string, string> = {
  titulo: "el título",
  estado: "el estado",
  vence: "el vencimiento",
  venceEl: "el vencimiento",
  prioridad: "la prioridad",
  responsable: "el responsable",
};

/** Cómo se dice una decisión sobre una propuesta (sin las claves internas). */
const NOMBRE_DE_LA_DECISION: Record<string, string> = {
  tal_cual: "la usó",
  con_cambios: "la usó con cambios",
  mas_adelante: "la dejó para más adelante",
  rechazada: "la descartó",
  misma: "era una tarea que ya existía",
  retirada: "se retiró el pedido",
  vencida: "nadie la decidió a tiempo",
};

const REVISION: Record<string, string> = { hecha: "la terminó", pasa: "sigue la semana que viene", mas_adelante: "la dejó para más adelante", no_se_hara: "ya no se hará" };

/** Un evento de una tarea, dicho para una persona. Nunca lleva la cita de una reunión (ni la lee). */
function textoDelEvento(
  e: { tipo: string; porEmail: string; createdAt: Date; datos: unknown },
  ctx: ContextoDeTareas,
): { quien: string; texto: string; detalle: string | null; cuando: string } {
  const d = (e.datos ?? {}) as Record<string, unknown>;
  const quien =
    e.porEmail === "agente" ? "Nexus" : e.porEmail === "sistema" ? "El sistema" : e.porEmail === "hubspot" ? "HubSpot" : e.porEmail === ctx.email ? "Tú" : (ctx.miembros.find((m) => m.email === e.porEmail)?.nombre ?? e.porEmail);
  const camposDeHubspot = (Array.isArray(d.campos) ? d.campos : []).map((c) => CAMPO_DE_HUBSPOT[String(c)]).filter(Boolean);
  const conflicto = Array.isArray(d.conflictos) && d.conflictos.length ? " · había cambiado en los dos lados: quedó lo más reciente" : "";
  const estado = (v: unknown) => (typeof v === "string" && v in NOMBRE_DEL_ESTADO ? NOMBRE_DEL_ESTADO[v as keyof typeof NOMBRE_DEL_ESTADO].toLowerCase() : String(v ?? ""));
  const detalle =
    e.tipo === "semana" ? `${typeof d.desde === "string" ? `de la semana del ${d.desde}` : "de «más adelante»"} a ${typeof d.hacia === "string" ? `la del ${d.hacia}` : "«más adelante»"}` :
    e.tipo === "estado" ? `a ${estado(d.hacia)}${typeof d.motivo === "string" && d.motivo ? ` · «${d.motivo}»` : ""}` :
    e.tipo === "decidida" ? (typeof d.decision === "string" ? (NOMBRE_DE_LA_DECISION[d.decision] ?? d.decision) : null) :
    e.tipo === "asignada" && d.motivo === "baja" ? "pasó a «Por asignar»: su responsable se dio de baja" :
    e.tipo === "pase" && typeof d.texto === "string" ? d.texto :
    e.tipo === "revisada" ? (REVISION[String(d.resultado)] ?? null) :
    (e.tipo === "hubspot" || e.tipo === "a_hubspot") && camposDeHubspot.length ? `${camposDeHubspot.join(", ")}${conflicto}` : null;
  // «Nexus la propuso» solo si la propuso Nexus: la que sugiere una persona dice eso.
  const texto = e.tipo === "propuesta" && e.porEmail !== "agente" ? "La sugirió" : (NOMBRE_DEL_EVENTO[e.tipo] ?? e.tipo);
  return { quien, texto, detalle, cuando: e.createdAt.toISOString() };
}

export async function cargarTarea(ctx: ContextoDeTareas, clientes: ClientesQueVes, id: string, ahora = new Date()) {
  const f = await prisma.tarea.findUnique({ where: { id }, select: SELECT_TAREA });
  if (!f) throw new ErrorDeTareas(404, "Esa tarea no existe.");
  const espacio = f.proyecto?.espacio ? { ...f.proyecto.espacio, miembros: f.proyecto.espacio.miembros.map((m) => m.email) } : null;
  if (!veLaTarea({ ...f, espacio }, ctx)) throw new ErrorDeTareas(404, "Esa tarea no existe.");
  // A la vez: la historia no depende de la tarea serializada (es lo que devuelve cada PATCH, que la pantalla espera).
  const [[tarea], eventos] = await Promise.all([
    serializarTareas([f], ctx, clientes, ahora),
    prisma.tareaEvento.findMany({ where: { tareaId: id }, orderBy: { createdAt: "desc" }, take: 40, select: { id: true, tipo: true, porEmail: true, createdAt: true, datos: true } }),
  ]);
  const historia = eventos.map((e) => ({ id: e.id, tipo: e.tipo, ...textoDelEvento(e, ctx) }));
  return { tarea, historia };
}

/* ── Lo que delegaste ───────────────────────────────────────────────────────────────────────────────────────────── */

/** Cuántos días hacia atrás entran las cerradas (hecha, no se hará, descartada, vencida). */
export const DIAS_DE_LO_DELEGADO_CERRADO = 30;

/**
 * Lo que la persona le pidió o asignó a OTRAS personas y a otros equipos, y cómo va (Elías, 2026-10-09). Entra lo que
 * pidió (`pedidaPorEmail`: también lo que creó para otra persona, que lo lleva) y lo que asignó directo a OTRA persona
 * (el evento `asignada` con `hacia` distinto: «tomar» no es delegar); lo abierto siempre y lo cerrado de los últimos 30
 * días, contado por cuándo se cerró. Las tareas de un plan del chat en borrador no: todavía no le llegaron a nadie.
 * Siempre con la regla de visibilidad de todas las listas, y sin citas: el contexto y la reunión van con su regla.
 */
export async function cargarLoQueDelegaste(ctx: ContextoDeTareas, clientes: ClientesQueVes, ahora = new Date()): Promise<LoQueDelegasteDatos> {
  const yo = ctx.email;
  const desde = new Date(+ahora - DIAS_DE_LO_DELEGADO_CERRADO * 86_400_000);
  const filas = await prisma.tarea.findMany({
    where: {
      AND: [
        tareasVisiblesWhere(ctx),
        { archivadaAt: null },
        // Un `not` de Prisma deja afuera el null: lo pedido a un equipo todavía no tiene responsable.
        { OR: [{ responsableEmail: null }, { responsableEmail: { not: yo } }] },
        { OR: [{ pedidaPorEmail: yo }, { eventos: { some: { tipo: "asignada", porEmail: yo, NOT: { datos: { path: ["hacia"], equals: yo } } } } }] },
        // Solo el borrador de un plan (chat o plantilla): lo que sugiere una reunión SÍ le llegó a la persona.
        { OR: [{ proyectoId: null }, { proyecto: { NOT: { estado: "propuesta", origen: { in: ["chat", "plantilla"] } } } }] },
        {
          OR: [
            { estado: { in: ["propuesta", "pendiente", "en_curso"] } },
            { completadaAt: { gte: desde } },
            { decididaAt: { gte: desde } },
            // «Ya no se hará» no tiene su propia fecha: la da el evento que la cerró (no `updatedAt`, que cambia con cualquier edición).
            { estado: "no_se_hara", eventos: { some: { tipo: { in: ["estado", "revisada"] }, createdAt: { gte: desde } } } },
          ],
        },
      ],
    },
    select: SELECT_TAREA,
    orderBy: { updatedAt: "desc" },
    take: 300,
  });
  const tareas = await serializarTareas(filas, ctx, clientes, ahora);
  const ids = filas.map((f) => f.id);
  const ultimos = ids.length
    ? await prisma.tareaEvento.findMany({
        where: { tareaId: { in: ids } },
        orderBy: { createdAt: "desc" },
        distinct: ["tareaId"],
        select: { tareaId: true, tipo: true, porEmail: true, createdAt: true, datos: true },
      })
    : [];
  const movimientos: Record<string, MovimientoDeTarea> = {};
  for (const e of ultimos) if (e.tareaId) movimientos[e.tareaId] = textoDelEvento(e, ctx);
  return {
    yo: { email: yo, equipo: ctx.equipo },
    hoy: hoyEnCostaRica(ahora),
    lunesDeHoy: lunesDeHoy(ahora),
    cerradasDesde: hoyEnCostaRica(desde),
    tareas,
    movimientos,
  };
}

/* ── Espacios (docs/tareas-plan.md §5.3) ───────────────────────────────────────────────────────────────────────── */

/** Un espacio que ves, con sus proyectos (sin los descartados ni archivados). 404 si no lo ves. */
export async function cargarEspacio(ctx: ContextoDeTareas, clientes: ClientesQueVes, id: string, ahora = new Date()): Promise<DatosDelEspacio> {
  const e = await prisma.espacioDeTareas.findFirst({
    where: { AND: [{ id, archivadoAt: null }, espaciosVisiblesWhere(ctx)] },
    select: { id: true, nombre: true, tipo: true, equipo: true, visibilidad: true, version: true, miembros: { select: { email: true, rol: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!e) throw new ErrorDeTareas(404, "Ese espacio no existe.");
  const filas = await prisma.proyectoDeTareas.findMany({
    where: { AND: [{ espacioId: id, archivadoAt: null, estado: { not: "descartado" } }, proyectosVisiblesWhere(ctx)] },
    select: SELECT_PROYECTO,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const nombre = (email: string) => ctx.miembros.find((m) => m.email === email)?.nombre ?? email;
  const tipo = e.tipo === "equipo" ? "equipo" : "libre";
  const puedeAdministrar = ctx.esSuperAdmin || (tipo === "libre" ? e.miembros.some((m) => m.email === ctx.email && m.rol === "admin") : !!e.equipo && ctx.lidera.includes(e.equipo));
  const miembros =
    tipo === "libre"
      ? e.miembros.map((m) => ({ email: m.email, nombre: nombre(m.email), rol: m.rol === "admin" ? ("admin" as const) : ("miembro" as const) }))
      : ctx.miembros.filter((m) => claveDeEquipo(m.area, m.email) === e.equipo).map((m) => ({ email: m.email, nombre: m.nombre, rol: "miembro" as const }));
  return {
    espacio: { id: e.id, nombre: e.nombre, tipo, visibilidad: e.visibilidad === "todos" ? "todos" : "miembros", miembros, puedeAdministrar, version: e.version },
    proyectos: await serializarProyectos(filas, ctx, clientes, ahora),
  };
}

/** Los espacios libres que ves (para «Tus espacios»), con cuántos proyectos activos tiene cada uno. */
export async function cargarMisEspacios(ctx: ContextoDeTareas): Promise<EspacioEnLista[]> {
  const filas = await prisma.espacioDeTareas.findMany({
    where: { AND: [{ tipo: "libre", archivadoAt: null }, espaciosVisiblesWhere(ctx), ctx.esSuperAdmin ? { miembros: { some: { email: ctx.email } } } : {}] },
    select: { id: true, nombre: true, _count: { select: { proyectos: { where: { estado: { in: ["activo", "en_pausa"] }, archivadoAt: null } } } } },
    orderBy: { nombre: "asc" },
    take: 50,
  });
  return filas.map((f) => ({ id: f.id, nombre: f.nombre, tipo: "libre" as const, proyectosActivos: f._count.proyectos }));
}

/* ── Métricas de la semana de un sprint (lib/tareas/metricas.ts) ─────────────────────────────────────────────── */

/** Las métricas de una semana de un equipo, solo sobre lo que ves (nada privado de otra persona entra a una cifra). */
export async function cargarMetricasDelEquipo(ctx: ContextoDeTareas, equipoPedido: string | null, semanaPedida: string | null, ahora = new Date()): Promise<MetricasDeLaSemana & { equipo: string; semana: string }> {
  const equipo = equipoPedido || ctx.equipo;
  const puede = ctx.esSuperAdmin || equipo === ctx.equipo || ctx.lidera.includes(equipo);
  if (!puede) throw new ErrorDeTareas(403, "Ves la semana de tu equipo.");
  const W = semanaPedida ? lunesDeFecha(semanaPedida) : lunesDeHoy(ahora);
  const desde = instanteCR(W, 0);
  const hasta = instanteCR(sumarSemanas(W, 1), 0);
  const visibles = tareasVisiblesWhere(ctx);
  const [resultados, filas] = await Promise.all([
    prisma.resultadoDeSemana.findMany({ where: { semana: aDate(W), equipo, tarea: visibles }, select: { resultado: true, fotoAmbitoNombre: true } }),
    prisma.tarea.findMany({
      where: { AND: [visibles, { equipo, OR: [{ semana: aDate(W) }, { createdAt: { gte: desde, lt: hasta } }] }] },
      select: { origen: true, estado: true, decision: true, semana: true, createdAt: true },
      take: 1000,
    }),
  ]);
  const m = metricasDeLaSemana(
    resultados,
    filas.map((f) => ({ origen: f.origen, estado: f.estado, decision: f.decision, enLaSemana: comoFecha(f.semana) === W, creadaEnLaSemana: f.createdAt >= desde && f.createdAt < hasta })),
  );
  return { ...m, equipo, semana: W };
}

/* ── Tareas internas por cliente (docs/tareas-plan.md §4.3) ───────────────────────────────────────────────────── */

/** El lunes desde el que cuenta un período: esta semana, el mes o el trimestre en curso (hora de Costa Rica). */
export function desdeDelPeriodo(periodo: PeriodoPorCliente, ahora = new Date()): string {
  const hoy = hoyEnCostaRica(ahora);
  if (periodo === "semana") return lunesDeHoy(ahora);
  const [anio, mes] = hoy.split("-").map(Number);
  const mesInicial = periodo === "mes" ? mes : Math.floor((mes - 1) / 3) * 3 + 1;
  return lunesDeFecha(`${anio}-${String(mesInicial).padStart(2, "0")}-01`);
}

/**
 * Lo abierto hoy y lo hecho en el período, por empresa, SOLO sobre lo que ves. Lo abierto sale de la tarea (su cliente
 * y su proyecto de hoy); lo hecho, de la foto de cada semana (`ResultadoDeSemana`): el pasado no cambia si la tarea
 * cambia de cliente o si HubSpot marca un proyecto después. Lo interno va por su nombre («Interno · SmartAgro»).
 */
export async function cargarPorCliente(ctx: ContextoDeTareas, clientes: ClientesQueVes, periodo: PeriodoPorCliente, ahora = new Date()): Promise<PorClienteDatos> {
  const desde = desdeDelPeriodo(periodo, ahora);
  const [filas, hechas] = await Promise.all([
    prisma.tarea.findMany({ where: { AND: [tareasVisiblesWhere(ctx), ABIERTAS_WHERE, { responsableEmail: { not: null } }] }, select: SELECT_TAREA, take: 600, orderBy: { createdAt: "desc" } }),
    prisma.resultadoDeSemana.findMany({
      where: { resultado: "hecha", semana: { gte: aDate(desde) }, tarea: tareasVisiblesWhere(ctx) },
      select: { fotoAmbito: true, fotoAmbitoNombre: true },
    }),
  ]);
  const vistas = await serializarTareas(filas, ctx, clientes, ahora);
  const grupos = new Map<string, GrupoPorCliente>();
  const grupo = (ambito: Ambito, etiqueta: string): GrupoPorCliente => {
    const clave = `${ambito}|${etiqueta}`;
    let g = grupos.get(clave);
    if (!g) {
      g = { clave, ambito, etiqueta, abiertas: 0, minutos: 0, sinEstimar: 0, hechas: 0, proyectos: [], tareas: [] };
      grupos.set(clave, g);
    }
    return g;
  };
  for (const t of vistas) {
    const g = grupo(t.ambito.ambito, t.ambito.etiqueta);
    g.abiertas++;
    if (t.minutosEstimados) g.minutos += t.minutosEstimados;
    else g.sinEstimar++;
    g.tareas.push(t);
    const proyecto = t.proyecto?.nombre ?? t.proyectoHubspot?.nombre ?? null;
    if (proyecto) {
      const p = g.proyectos.find((x) => x.nombre === proyecto);
      if (p) p.abiertas++;
      else g.proyectos.push({ nombre: proyecto, abiertas: 1 });
    }
  }
  for (const h of hechas) {
    const ambito = (["cliente", "prospecto", "aliado", "interno", "sin_clasificar"] as const).find((a) => a === h.fotoAmbito) ?? "sin_clasificar";
    grupo(ambito, h.fotoAmbitoNombre ?? NOMBRE_DEL_AMBITO[ambito]).hechas++;
  }
  const ORDEN: Record<Ambito, number> = { cliente: 0, prospecto: 1, aliado: 2, interno: 3, sin_clasificar: 4 };
  return {
    periodo,
    desde,
    grupos: [...grupos.values()]
      .map((g) => ({ ...g, proyectos: g.proyectos.sort((a, b) => b.abiertas - a.abiertas) }))
      .sort((a, b) => ORDEN[a.ambito] - ORDEN[b.ambito] || b.abiertas + b.hechas - (a.abiertas + a.hechas) || a.etiqueta.localeCompare(b.etiqueta, "es")),
  };
}

/**
 * Los vínculos de una tarea, con la regla de cada destino (cerrada por defecto): un registro de HubSpot se ve con su
 * título si es de un cliente que ves; sin cliente resuelto, solo para quien ve toda la cartera. Una propuesta pide
 * poder abrir propuestas y ver su empresa; una preventa, poder abrir preventas. Lo demás sale sin título.
 */
export async function cargarVinculos(ctx: ContextoDeTareas, clientes: ClientesQueVes, tareaId: string, permisos: PermisosDeVinculo): Promise<VinculoVista[]> {
  return cargarVinculosDe(ctx, clientes, { tipo: "tarea", id: tareaId }, permisos);
}

/** Los vínculos de una tarea o de un proyecto, con la máscara de siempre: lo que no puedes abrir sale sin título. */
export async function cargarVinculosDe(ctx: ContextoDeTareas, clientes: ClientesQueVes, dueno: DuenoDelVinculo, permisos: PermisosDeVinculo): Promise<VinculoVista[]> {
  let puedeEditar: boolean;
  if (dueno.tipo === "tarea") {
    const f = await prisma.tarea.findUnique({ where: { id: dueno.id }, select: SELECT_TAREA });
    if (!f) throw new ErrorDeTareas(404, "Esa tarea no existe.");
    const espacio = f.proyecto?.espacio ? { ...f.proyecto.espacio, miembros: f.proyecto.espacio.miembros.map((m) => m.email) } : null;
    if (!veLaTarea({ ...f, espacio }, ctx)) throw new ErrorDeTareas(404, "Esa tarea no existe.");
    puedeEditar = accionesDe({ ...f, semana: comoFecha(f.semana) }, ctx, { lunesDeHoy: lunesDeHoy(), esMiembroDelEspacioLibre: !!espacio && espacio.tipo === "libre" && espacio.miembros.includes(ctx.email) }).editar;
  } else {
    const p = await prisma.proyectoDeTareas.findFirst({
      where: { AND: [{ id: dueno.id, archivadoAt: null }, proyectosVisiblesWhere(ctx)] },
      select: { responsableEmail: true, creadoPorEmail: true, espacio: { select: { tipo: true, equipo: true, miembros: { select: { email: true, rol: true } } } } },
    });
    if (!p) throw new ErrorDeTareas(404, "Ese proyecto no existe.");
    puedeEditar = administraElProyecto(ctx, p);
  }
  const filas = await prisma.tareaVinculo.findMany({
    where: dueno.tipo === "tarea" ? { tareaId: dueno.id } : { proyectoId: dueno.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, hubspotPortalId: true, hubspotObjeto: true, externalHubspotRecordId: true, businessCaseId: true, exploracionId: true, etiqueta: true, detalle: true, empresaResuelta: true, clientId: true, ausenteAt: true, creadoPorEmail: true, fotoAt: true },
  });
  const ves = (clientId: string | null) => (clientId ? clientes.ids.has(clientId) : clientes.todos);
  return filas.map((v) => {
    const tipo: VinculoVista["tipo"] = v.businessCaseId ? "propuesta" : v.exploracionId ? "preventa" : "hubspot";
    const visible =
      tipo === "hubspot"
        ? v.empresaResuelta === "cliente"
          ? ves(v.clientId)
          : clientes.todos
        : tipo === "propuesta"
          ? permisos.veVentas && ves(v.clientId)
          : permisos.vePreventa;
    const url = !visible
      ? null
      : tipo === "hubspot" && v.hubspotPortalId && v.hubspotObjeto && v.externalHubspotRecordId
        ? hubspotRecordUrl(v.hubspotPortalId, v.hubspotObjeto, v.externalHubspotRecordId)
        : tipo === "propuesta"
          ? `/business-cases/${v.businessCaseId}`
          : tipo === "preventa"
            ? `/sales/exploraciones/${v.exploracionId}`
            : null;
    return {
      id: v.id,
      tipo,
      etiqueta: visible ? v.etiqueta : null,
      detalle: visible ? v.detalle : null,
      url,
      ausente: !!v.ausenteAt,
      puedeQuitar: v.creadoPorEmail === ctx.email || puedeEditar,
      fotoAt: v.fotoAt.toISOString(),
      puedeActualizar: tipo === "hubspot" && puedeEditar,
    };
  });
}

/** Las propuestas y preventas que se pueden vincular, por nombre (solo las que puedes abrir). */
export async function buscarRegistrosParaVincular(clientes: ClientesQueVes, q: string, permisos: PermisosDeVinculo): Promise<RegistroParaVincular[]> {
  const texto = q.trim();
  if (texto.length < 2) return [];
  const deEmpresa = clientes.todos ? {} : { clientId: { in: [...clientes.ids] } };
  const [propuestas, preventas] = await Promise.all([
    permisos.veVentas
      ? prisma.businessCase.findMany({ where: { ...deEmpresa, OR: [{ name: { contains: texto, mode: "insensitive" } }, { client: { name: { contains: texto, mode: "insensitive" } } }] }, select: { id: true, name: true, client: { select: { name: true } } }, orderBy: { updatedAt: "desc" }, take: 8 })
      : [],
    permisos.vePreventa
      ? prisma.exploracionDeVenta.findMany({ where: { ...DE_LA_PREVENTA, client: { name: { contains: texto, mode: "insensitive" } } }, select: { id: true, client: { select: { name: true } } }, orderBy: { updatedAt: "desc" }, take: 8 })
      : [],
  ]);
  return [
    ...propuestas.map((p) => ({ id: p.id, tipo: "propuesta" as const, etiqueta: `${p.name} · ${p.client.name}` })),
    ...preventas.map((p) => ({ id: p.id, tipo: "preventa" as const, etiqueta: `Preventa · ${p.client.name}` })),
  ];
}

/** Los comentarios de una tarea, del más viejo al más nuevo. Los ve quien ve la tarea (404 si no). */
export async function cargarComentarios(ctx: ContextoDeTareas, tareaId: string): Promise<ComentarioVista[]> {
  const f = await prisma.tarea.findUnique({ where: { id: tareaId }, select: SELECT_TAREA });
  if (!f) throw new ErrorDeTareas(404, "Esa tarea no existe.");
  const espacio = f.proyecto?.espacio ? { ...f.proyecto.espacio, miembros: f.proyecto.espacio.miembros.map((m) => m.email) } : null;
  if (!veLaTarea({ ...f, espacio }, ctx)) throw new ErrorDeTareas(404, "Esa tarea no existe.");
  const filas = await prisma.tareaComentario.findMany({
    where: { tareaId, archivadoAt: null },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { id: true, autorEmail: true, cuerpo: true, createdAt: true, editadoAt: true },
  });
  return filas.map((c) => ({
    id: c.id,
    autor: { email: c.autorEmail, nombre: ctx.miembros.find((m) => m.email === c.autorEmail)?.nombre ?? c.autorEmail },
    cuerpo: c.cuerpo,
    cuando: c.createdAt.toISOString(),
    editado: !!c.editadoAt,
    propio: c.autorEmail === ctx.email,
  }));
}

export async function cargarProyecto(ctx: ContextoDeTareas, clientes: ClientesQueVes, id: string, ahora = new Date()) {
  const p = await prisma.proyectoDeTareas.findFirst({ where: { AND: [{ id }, proyectosVisiblesWhere(ctx)] }, select: SELECT_PROYECTO });
  // Quien solo tiene una tarea en un proyecto ve su nombre, y en el cajón, las tareas que puede ver.
  const visibleSoloPorTarea = !p ? await prisma.tarea.findFirst({ where: { AND: [{ proyectoId: id }, tareasVisiblesWhere(ctx)] }, select: { id: true } }) : null;
  const fila = p ?? (visibleSoloPorTarea ? await prisma.proyectoDeTareas.findUnique({ where: { id }, select: SELECT_PROYECTO }) : null);
  if (!fila) throw new ErrorDeTareas(404, "Ese proyecto no existe.");
  const tareasF = await prisma.tarea.findMany({
    where: { AND: [{ proyectoId: id }, tareasVisiblesWhere(ctx), { archivadaAt: null, estado: { in: ["propuesta", "pendiente", "en_curso", "hecha", "no_se_hara"] } }] },
    select: SELECT_TAREA,
    orderBy: { numero: "asc" },
    take: 300,
  });
  const [proyecto] = await serializarProyectos([fila], ctx, clientes, ahora);
  return { proyecto, tareas: ordenarTareas(await serializarTareas(tareasF, ctx, clientes, ahora)) };
}

/* ── Opciones de los selectores ──────────────────────────────────────────────────── */

export async function cargarOpciones(ctx: ContextoDeTareas, clientes: ClientesQueVes, clientId?: string | null): Promise<OpcionesDeTareas & { proyectosHubspot?: { id: string; nombre: string; interno: boolean }[] }> {
  const proyectos = await prisma.proyectoDeTareas.findMany({
    where: { AND: [proyectosVisiblesWhere(ctx), { estado: { in: ["activo", "en_pausa"] }, archivadoAt: null }, clientId ? { clientId } : {}] },
    select: { id: true, nombre: true, clientId: true, espacio: { select: { nombre: true } } },
    orderBy: { nombre: "asc" },
    take: 200,
  });
  let proyectosHubspot: { id: string; nombre: string; interno: boolean }[] | undefined;
  if (clientId) {
    if (!clientes.ids.has(clientId)) throw new ErrorDeTareas(404, "No puedes elegir esa empresa.");
    const ps = await prisma.project.findMany({ where: proyectoClasificableWhere({ clientId }), select: { id: true, name: true, proyectoInterno: true }, orderBy: { name: "asc" } });
    proyectosHubspot = ps.map((p) => ({ id: p.id, nombre: p.name, interno: p.proyectoInterno }));
  }
  return {
    personas: ctx.miembros.map((m) => ({ email: m.email, nombre: m.nombre, equipo: claveDeEquipo(m.area, m.email) })),
    empresas: [...clientes.porId.values()].map((e) => ({ id: e.id, nombre: e.nombre, kind: e.kind })),
    equiposConLider: EQUIPOS.filter((e) => lideresDe(e.clave, ctx.miembros).length > 0).map((e) => ({ clave: e.clave, nombre: e.nombre })),
    proyectos: proyectos.map((p) => ({ id: p.id, nombre: p.nombre, espacio: p.espacio.nombre, clientId: p.clientId })),
    ...(proyectosHubspot ? { proyectosHubspot } : {}),
  };
}

/* ── Buscar ──────────────────────────────────────────────────────────────────────── */

export async function buscarTareas(ctx: ContextoDeTareas, clientes: ClientesQueVes, q: string, ahora = new Date()): Promise<TareaVista[]> {
  const texto = q.trim();
  if (texto.length < 2) return [];
  const numero = /^t-?(\d+)$/i.exec(texto)?.[1];
  const where: Prisma.TareaWhereInput = numero
    ? { numero: Number(numero) }
    : { OR: [{ titulo: { contains: texto, mode: "insensitive" } }, { notas: { contains: texto, mode: "insensitive" } }] };
  const filas = await prisma.tarea.findMany({ where: { AND: [tareasVisiblesWhere(ctx), where, { estado: { notIn: ["rechazada", "fusionada", "vencida"] } }] }, select: SELECT_TAREA, orderBy: { updatedAt: "desc" }, take: 30 });
  return serializarTareas(filas, ctx, clientes, ahora);
}

/* ── Los pendientes de un proyecto y lo que dejó una reunión (memoria de la cuenta, etapa 2) ─────────────────────── */

/** Cuántos días hacia atrás cuenta «reciente» en los «Pendientes recientes» del Resumen. */
export const DIAS_DE_LO_RECIENTE_DEL_PROYECTO = 28;

/**
 * Sin las privadas de OTRAS personas, también para el Super Admin: estas listas viven en pantallas de un cliente (el
 * Resumen, la página de la reunión), no en la semana de alguien. Con OR: un NOT dejaría afuera lo que no tiene responsable.
 */
function sinPrivadasAjenas(ctx: ContextoDeTareas): Prisma.TareaWhereInput {
  return { OR: [{ privada: false }, { responsableEmail: ctx.email }] };
}

/** Lo abierto y lo que espera decisión, sin el borrador de un plan del chat (todavía no le llegó a nadie). */
const ABIERTAS_O_POR_DECIDIR: Prisma.TareaWhereInput = {
  archivadaAt: null,
  estado: { in: ["propuesta", "pendiente", "en_curso"] },
  OR: [{ proyectoId: null }, { proyecto: { NOT: { estado: "propuesta", origen: { in: ["chat", "plantilla"] } } } }],
};

/**
 * Los «Pendientes recientes» del Resumen de un proyecto de HubSpot y su diálogo «Ver los N» (reemplazan a `ActionItem`,
 * que se retiró). Solo lo que ve quien mira (`tareasVisiblesWhere`: nunca las privadas de otros), serializado con su
 * regla (la cita y el contexto, lib/tareas/serializar.ts). 404 si el proyecto no existe o es de un cliente que no ves:
 * confirmar que existe ya sería información.
 */
export async function cargarTareasDelProyecto(
  ctx: ContextoDeTareas,
  clientes: ClientesQueVes,
  projectId: string,
  opciones: { recientesDias?: number } = {},
  ahora = new Date(),
): Promise<TareasDelProyectoDatos> {
  const proyecto = await prisma.project.findUnique({ where: { id: projectId }, select: { clientId: true } });
  // El acceso de requireAccessToClient (lib/tareas/clientes.ts); quien ve toda la cartera, también las empresas de prueba.
  if (!proyecto || (!clientes.todos && !clientes.ids.has(proyecto.clientId))) throw new ErrorDeTareas(404, "Ese proyecto no existe.");
  const desde = new Date(+ahora - (opciones.recientesDias ?? DIAS_DE_LO_RECIENTE_DEL_PROYECTO) * 86_400_000);
  const delProyecto: Prisma.TareaWhereInput = { AND: [tareasVisiblesWhere(ctx), sinPrivadasAjenas(ctx), { projectId }] };
  const abiertas: Prisma.TareaWhereInput = { AND: [delProyecto, ABIERTAS_O_POR_DECIDIR] };
  const recientes: Prisma.TareaWhereInput = { AND: [abiertas, { createdAt: { gte: desde } }] };
  const orden: Prisma.TareaOrderByWithRelationInput[] = [{ venceEl: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }];
  const [recientesF, recientesTotal, abiertasF, abiertasTotal, historialF] = await Promise.all([
    prisma.tarea.findMany({ where: recientes, select: SELECT_TAREA, orderBy: orden, take: 5 }),
    prisma.tarea.count({ where: recientes }),
    prisma.tarea.findMany({ where: abiertas, select: SELECT_TAREA, orderBy: orden, take: 100 }),
    prisma.tarea.count({ where: abiertas }),
    prisma.tarea.findMany({ where: { AND: [delProyecto, { estado: { in: ["hecha", "no_se_hara"] } }] }, select: SELECT_TAREA, orderBy: { updatedAt: "desc" }, take: 50 }),
  ]);
  // Una sola serialización para las tres listas (una tarea reciente también está en las abiertas).
  const unicas = [...new Map([...recientesF, ...abiertasF, ...historialF].map((f) => [f.id, f])).values()];
  const vistas = new Map((await serializarTareas(unicas, ctx, clientes, ahora)).map((t) => [t.id, t]));
  const de = (filas: readonly FilaDeTarea[]) => filas.map((f) => vistas.get(f.id)!).filter(Boolean);
  return {
    hoy: hoyEnCostaRica(ahora),
    recientes: de(recientesF),
    recientesTotal,
    abiertas: de(abiertasF),
    abiertasTotal,
    historial: de(historialF),
  };
}

/** Cuántos días atrás entran las hechas en la ficha del cliente. */
export const DIAS_DE_LO_HECHO_DE_LA_CUENTA = 30;
const TOPE_DE_LA_CUENTA = 300;

/**
 * La ficha del cliente › La cuenta › Tareas (ficha A, 2026-10-17): todo lo que Smarteam tiene que hacer con esa empresa,
 * de cualquier equipo. Con la regla de todas las listas (`tareasVisiblesWhere`, que ya incluye la regla de las cuentas) y
 * sin las privadas de otros, aunque quien mira sea Super Admin: es la pantalla de un cliente, no la semana de alguien.
 * La cita y el contexto de cada reunión van con su regla (lib/tareas/serializar.ts). 404 si es un cliente que no ves.
 */
export async function cargarTareasDeLaCuenta(ctx: ContextoDeTareas, clientes: ClientesQueVes, clientId: string, ahora = new Date()): Promise<TareasDeLaCuentaDatos> {
  if (!clientes.todos && !clientes.ids.has(clientId)) throw new ErrorDeTareas(404, "Ese cliente no existe.");
  const hechasDesde = new Date(+ahora - DIAS_DE_LO_HECHO_DE_LA_CUENTA * 86_400_000);
  const deLaCuenta: Prisma.TareaWhereInput = { AND: [tareasVisiblesWhere(ctx), sinPrivadasAjenas(ctx), { clientId }] };
  const [abiertasF, hechasF] = await Promise.all([
    prisma.tarea.findMany({
      where: { AND: [deLaCuenta, ABIERTAS_O_POR_DECIDIR] },
      select: SELECT_TAREA,
      orderBy: [{ venceEl: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: TOPE_DE_LA_CUENTA + 1,
    }),
    prisma.tarea.findMany({
      where: { AND: [deLaCuenta, { archivadaAt: null, estado: "hecha", completadaAt: { gte: hechasDesde } }] },
      select: SELECT_TAREA,
      orderBy: { completadaAt: "desc" },
      take: 100,
    }),
  ]);
  const recortadas = abiertasF.length > TOPE_DE_LA_CUENTA;
  const filas = [...abiertasF.slice(0, TOPE_DE_LA_CUENTA), ...hechasF];
  return {
    hoy: hoyEnCostaRica(ahora),
    tareas: await serializarTareas(filas, ctx, clientes, ahora),
    hechasDesde: comoFecha(hechasDesde)!,
    recortadas,
  };
}

/** Las tareas que salieron de una reunión: lo que es trabajo (y lo que espera decisión), no lo descartado ni lo vencido. */
const DE_LA_REUNION_EN_PIE: Prisma.TareaWhereInput = { archivadaAt: null, estado: { in: ["propuesta", "pendiente", "en_curso", "hecha", "no_se_hara"] } };

/** Cuántas tareas dejó una reunión, de las que ve quien mira (la página de la reunión: «N tareas»). */
export async function contarTareasDeLaReunion(ctx: ContextoDeTareas, sessionId: string): Promise<number> {
  return prisma.tarea.count({ where: { AND: [tareasVisiblesWhere(ctx), sinPrivadasAjenas(ctx), { sessionId }, DE_LA_REUNION_EN_PIE] } });
}

/**
 * Lo que dejó una reunión en Tareas, para LEER en su tarjeta: las que ve quien mira, sin sus propias propuestas (esas
 * las decide en la misma tarjeta), con el lado de la lectura de seguimiento. Sin la cita ni el contexto.
 */
export async function cargarTareasDeLaReunion(ctx: ContextoDeTareas, sessionId: string, tope = 40): Promise<TareaDeLaReunion[]> {
  const filas = await prisma.tarea.findMany({
    where: {
      AND: [
        tareasVisiblesWhere(ctx),
        sinPrivadasAjenas(ctx),
        { sessionId, estado: { in: ["propuesta", "pendiente", "en_curso", "hecha"] } },
        // Con OR y no con NOT: un NOT sobre `responsableEmail` deja afuera lo que no tiene responsable.
        { OR: [{ estado: { not: "propuesta" } }, { responsableEmail: null }, { responsableEmail: { not: ctx.email } }] },
      ],
    },
    orderBy: [{ venceEl: { sort: "asc", nulls: "last" } }, { numero: "asc" }],
    take: tope,
    select: {
      id: true,
      titulo: true,
      estado: true,
      venceEl: true,
      responsableEmail: true,
      eventos: { where: { tipo: { in: ["propuesta", "creada"] } }, orderBy: { createdAt: "asc" }, take: 1, select: { datos: true } },
    },
  });
  // Lo abierto primero; lo hecho al final (se ve tachado).
  const ordenadas = [...filas].sort((a, b) => Number(a.estado === "hecha") - Number(b.estado === "hecha"));
  return ordenadas.map((f) => {
    const datos = f.eventos[0]?.datos as Record<string, unknown> | null | undefined;
    const lado = datos && typeof datos === "object" && (datos.lado === "cliente" || datos.lado === "smarteam") ? datos.lado : null;
    return {
      id: f.id,
      titulo: f.titulo,
      lado,
      responsable: f.responsableEmail ? (ctx.miembros.find((m) => m.email === f.responsableEmail)?.nombre ?? f.responsableEmail) : null,
      venceEl: comoFecha(f.venceEl),
      estado: leerEstado(f.estado),
    };
  });
}
