/**
 * lib/mi-dia/seguimiento-server.ts — «Seguimiento de cuentas» con datos (2026-10-19). SERVER-ONLY, solo lectura.
 *
 * Se arma sobre la cartera de Customer Success de «Para ti» (`cargarCarteraDeCs`): las cuentas, su CSE, su color y su
 * siguiente paso salen de ahí, con sus mismas reglas de quién ve qué (el CSE, sus cuentas; quien lidera Customer
 * Success, toda la cartera). Acá se suma, por lote y con tope (nada por cuenta):
 *   · la próxima sesión en 30 días: el calendario de quien lleva cada cuenta (el mismo que usa la cartera) y las
 *     reuniones planeadas en Tareas. Una reunión cuenta para una cuenta solo si es de UNA empresa (`cuentaDelEvento`);
 *   · la última reunión con el cliente y los temas: las reuniones cuyo dueño (`duenoDeLaSesion`, la fuente única) es
 *     una de esas cuentas, sin las de puertas adentro; los temas de su minuta (`SessionMinute.topics`, los escribe la
 *     lectura de cada reunión); los asuntos de los correos y llamadas de HubSpot de la cuenta; y, si con eso no
 *     alcanza, los títulos de sus tareas abiertas (sin lo privado ni lo de un espacio de «solo miembros» ajeno).
 * Sin IA: los temas ya están escritos.
 *
 * ⛔ Lo que NO se le pasa a la pantalla: montos, uso ni relación con HubSpot Partner, renovaciones, el texto de una
 * reunión, de un correo o de una tarea (solo su tema y su título). Lo vigila lib/mi-dia/seguimiento-frontera.test.ts.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { modeloDisponible } from "@/lib/db/esquema";
import { esLiderDeCs } from "@/lib/cs/acceso";
import { duenoDeLaSesion } from "@/lib/sessions/project-sources";
import { esReunionDePuertasAdentro } from "@/lib/sessions/candidatas-internas";
import { tareasDisponible } from "@/lib/tareas/servidor";
import { alcanceDe, type MiembroParaAlcance } from "@/lib/para-ti/alcance-server";
import { cuentaDelEvento } from "./agenda";
import { calendarioDeLosProximosDias } from "./calendario-server";
import { cargarCarteraDeCs } from "./cartera-cs-server";
import { mapasDeEmpresas } from "./empresas-server";
import { deEspacioPrivadoAjeno } from "./servicio-server";
import {
  DIAS_DE_CORREOS,
  DIAS_DE_REUNIONES,
  DIAS_DE_TEMAS,
  DIAS_PARA_LA_PROXIMA_SESION,
  REUNIONES_PARA_TEMAS,
  asuntoComoTema,
  elegirTemas,
  filtrosPorDefecto,
  ordenarSeguimiento,
  pasoDelSeguimiento,
  proximaSesionDe,
  temasDeLaMinuta,
  type CandidatoDeTema,
  type FiltrosDeSeguimiento,
  type FilaDeSeguimiento,
  type PersonaDelSeguimiento,
  type SesionQueViene,
} from "./seguimiento";

export interface SeguimientoDeCuentas {
  filas: FilaDeSeguimiento[];
  /** Lidera Customer Success: ve toda la cartera y el filtro por CSE arranca en «Todos». */
  lider: boolean;
  /** El correo de quien mira: «Agendar» abre Google Calendar en su cuenta. */
  correo: string;
  filtros: FiltrosDeSeguimiento;
}

const DIA_MS = 86_400_000;
/** Topes de cordura: la cartera entera tiene ~100 cuentas. */
const MAX_REUNIONES = 6000;
const MAX_COMUNICACIONES = 3000;
const MAX_TAREAS = 3000;
/** Cuántos temas de una minuta se miran (los primeros: la minuta los ordena por importancia). */
const TEMAS_POR_MINUTA = 4;
/** Cuántos correos y llamadas por cuenta, y cuántas tareas abiertas. */
const CORREOS_POR_CUENTA = 5;
const TAREAS_POR_CUENTA = 5;

/** Los correos de afuera de una reunión (sin los dominios de Smarteam ni los calendarios y salas de Google). */
function invitadosDe(participantes: readonly string[], internos: ReadonlySet<string>): string[] {
  return [
    ...new Set(
      participantes
        .map((p) => p.trim().toLowerCase())
        .filter((p) => p.includes("@") && !internos.has(p.split("@")[1] ?? "") && !/calendar\.google\.com$|resource\.calendar/.test(p)),
    ),
  ];
}

export async function cargarSeguimientoDeCuentas(tm: MiembroParaAlcance, o: { ahora: Date; hoyISO: string }): Promise<SeguimientoDeCuentas> {
  const alcance = await alcanceDe(tm);
  const lider = esLiderDeCs(alcance.rol);
  const correo = alcance.email;
  const filtros = filtrosPorDefecto({ lider });
  // El calendario de 30 días se pide ANTES de la cartera, en paralelo: la regla de servicio de la cartera pide el de 8 y
  // lo toma recortado de esta misma lectura (lib/mi-dia/calendario-server.ts). Una lectura a Google por persona, no dos.
  // El CSE mira el suyo; quien lidera, el de cada CSE y CSL del equipo (los CSE de las cuentas casi siempre son ellos).
  const calendarios = new Map<string, ReturnType<typeof calendarioDeLosProximosDias>>();
  const leerCalendario = (p: string) => {
    const k = p.toLowerCase();
    if (!calendarios.has(k)) calendarios.set(k, calendarioDeLosProximosDias(k, o.ahora, DIAS_PARA_LA_PROXIMA_SESION).catch(() => null));
    return calendarios.get(k)!;
  };
  if (lider) {
    const equipo = await prisma.teamMember
      .findMany({ where: { deactivatedAt: null, roleEnum: { in: ["CSE", "CSL"] } }, select: { email: true } })
      .catch(() => []);
    for (const m of equipo) void leerCalendario(m.email);
  } else void leerCalendario(correo);
  const cartera = await cargarCarteraDeCs(lider ? "csl" : "cse", alcance, o);
  const empresas = cartera.empresas;
  const ids = empresas.map((e) => e.clientId);
  if (ids.length === 0) return { filas: [], lider, correo, filtros };

  // De qué calendario sale la próxima sesión de cada cuenta: el mismo que usó la cartera para el siguiente paso (el CSE
  // mira el suyo; quien lidera, el del CSE de cada cuenta). Así la sesión y el paso no se contradicen.
  const llevaDe = new Map(empresas.map((e) => [e.clientId, lider ? (e.cse?.email?.toLowerCase() ?? null) : correo.toLowerCase()]));
  const personas = [...new Set([...llevaDe.values()].filter((x): x is string => !!x))];
  const esSuperAdmin = alcance.rol === "SUPER_ADMIN";
  const hasta = new Date(o.ahora.getTime() + DIAS_PARA_LA_PROXIMA_SESION * DIA_MS);
  // Solo las reuniones que YA ocurrieron: la fila afirma cuál fue «la última reunión» y de qué se habló.
  const ahora = o.ahora;
  const desdeReuniones = new Date(o.ahora.getTime() - DIAS_DE_REUNIONES * DIA_MS);
  const desdeCorreos = new Date(o.ahora.getTime() - DIAS_DE_CORREOS * DIA_MS);
  const hayTareas = await tareasDisponible();
  const sinPrivadoAjeno = esSuperAdmin ? {} : { NOT: deEspacioPrivadoAjeno(correo.toLowerCase()) };

  const [leidos, planeadas, reuniones, comunicaciones, tareas, internos] = await Promise.all([
    Promise.all(personas.map(async (p) => [p, await leerCalendario(p)] as const)),
    hayTareas
      ? prisma.tarea.findMany({
          where: {
            archivadaAt: null,
            clase: "reunion",
            estado: { in: ["pendiente", "en_curso"] },
            privada: false,
            clientId: { in: ids },
            reunionInicio: { gte: o.ahora, lte: hasta },
            ...sinPrivadoAjeno,
          },
          select: { clientId: true, titulo: true, reunionInicio: true },
          orderBy: { reunionInicio: "asc" },
          take: MAX_TAREAS,
        })
      : Promise.resolve([]),
    // El dueño de una reunión es `duenoDeLaSesion`: la resolución, y el manual solo si no hay. El `where` es esa misma
    // regla (nunca una reunión de otra empresa por un override colgado).
    prisma.firefliesSession.findMany({
      where: {
        date: { gte: desdeReuniones, lte: ahora },
        OR: [{ resolvedClientId: { in: ids } }, { resolvedClientId: null, manualClientId: { in: ids } }],
      },
      select: { id: true, title: true, date: true, participants: true, organizerEmail: true, resolvedClientId: true, manualClientId: true },
      orderBy: { date: "desc" },
      take: MAX_REUNIONES,
    }),
    modeloDisponible(prisma.comunicacionDeHubspot)
      ? prisma.comunicacionDeHubspot
          .findMany({
            where: { clientId: { in: ids }, vigente: true, tipo: { in: ["correo", "llamada"] }, ocurrioAt: { gte: desdeCorreos, lte: o.ahora }, asunto: { not: null } },
            select: { id: true, clientId: true, tipo: true, asunto: true, ocurrioAt: true },
            orderBy: { ocurrioAt: "desc" },
            take: MAX_COMUNICACIONES,
          })
          .catch(() => [])
      : Promise.resolve([]),
    hayTareas
      ? prisma.tarea.findMany({
          where: {
            archivadaAt: null,
            clase: { not: "reunion" },
            estado: { in: ["pendiente", "en_curso"] },
            privada: false,
            clientId: { in: ids },
            ...sinPrivadoAjeno,
          },
          select: { clientId: true, numero: true, titulo: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: MAX_TAREAS,
        })
      : Promise.resolve([]),
    mapasDeEmpresas(o.ahora).then((m) => m.internos),
  ]);

  // Las reuniones de cada cuenta con el cliente (sin las de puertas adentro), de la más nueva a la más vieja.
  const conElCliente = new Map<string, typeof reuniones>();
  for (const r of reuniones) {
    const dueno = duenoDeLaSesion(r);
    if (!dueno || !llevaDe.has(dueno)) continue;
    if (esReunionDePuertasAdentro({ participants: r.participants, organizerEmail: r.organizerEmail }, internos)) continue;
    const l = conElCliente.get(dueno) ?? [];
    l.push(r);
    conElCliente.set(dueno, l);
  }
  const desdeTemas = o.ahora.getTime() - DIAS_DE_TEMAS * DIA_MS;
  const paraTemas = [...conElCliente.values()].flatMap((l) => l.filter((r) => r.date.getTime() >= desdeTemas).slice(0, REUNIONES_PARA_TEMAS));
  const minutas = paraTemas.length
    ? await prisma.sessionMinute.findMany({ where: { sessionId: { in: paraTemas.map((r) => r.id) } }, select: { sessionId: true, topics: true } })
    : [];
  const temasDe = new Map(minutas.map((m) => [m.sessionId, temasDeLaMinuta(m.topics).slice(0, TEMAS_POR_MINUTA)]));

  // Las sesiones que vienen: del calendario de quien lleva la cuenta y las planeadas en Tareas.
  const delCalendario = new Map(leidos);
  const sesionesQueVienen: SesionQueViene[] = [
    ...planeadas.flatMap((t) =>
      t.clientId && t.reunionInicio ? [{ clientId: t.clientId, titulo: t.titulo, inicio: t.reunionInicio.toISOString(), fuente: "tarea" as const }] : [],
    ),
  ];
  const sesionesDelCalendario = new Map<string, SesionQueViene[]>();
  for (const [p, cal] of delCalendario) {
    sesionesDelCalendario.set(
      p,
      (cal?.reuniones ?? []).flatMap((r) => {
        const clientId = cuentaDelEvento(r);
        return clientId ? [{ clientId, titulo: r.titulo, inicio: r.inicio, fuente: "calendario" as const }] : [];
      }),
    );
  }

  // Los nombres de quienes llevan un siguiente paso.
  const correosDelPaso = [...new Set(empresas.flatMap((e) => (e.paso?.lleva ? [e.paso.lleva.toLowerCase()] : [])))];
  const miembros = correosDelPaso.length
    ? await prisma.teamMember.findMany({ where: { email: { in: correosDelPaso, mode: "insensitive" } }, select: { email: true, name: true } })
    : [];
  const nombreDe = new Map(miembros.map((m) => [m.email.toLowerCase(), m.name]));
  const persona = (email: string | null | undefined): PersonaDelSeguimiento | null => {
    if (!email) return null;
    const e = email.toLowerCase();
    return { nombre: nombreDe.get(e) ?? e, email: e };
  };

  const correosDe = new Map<string, typeof comunicaciones>();
  for (const c of comunicaciones) {
    const l = correosDe.get(c.clientId) ?? [];
    if (l.length < CORREOS_POR_CUENTA) l.push(c);
    correosDe.set(c.clientId, l);
  }
  const tareasDe = new Map<string, typeof tareas>();
  for (const t of tareas) {
    if (!t.clientId) continue;
    const l = tareasDe.get(t.clientId) ?? [];
    if (l.length < TAREAS_POR_CUENTA) l.push(t);
    tareasDe.set(t.clientId, l);
  }

  const filas: FilaDeSeguimiento[] = empresas.map((e) => {
    const lleva = llevaDe.get(e.clientId) ?? null;
    const cal = lleva ? delCalendario.get(lleva) : null;
    const calendarioLeido = !lleva || cal !== null;
    const proximas = [...sesionesQueVienen, ...(lleva ? (sesionesDelCalendario.get(lleva) ?? []) : [])];
    const suyas = conElCliente.get(e.clientId) ?? [];
    const ultima = suyas[0] ?? null;

    const candidatos: CandidatoDeTema[] = [
      ...suyas
        .filter((r) => r.date.getTime() >= desdeTemas)
        .slice(0, REUNIONES_PARA_TEMAS)
        .flatMap((r) =>
          (temasDe.get(r.id) ?? []).map((texto, posicion) => ({
            texto,
            origen: "reunion" as const,
            fuente: r.title?.trim() || "Reunión",
            fecha: r.date.toISOString(),
            posicion,
            href: `/sessions/${r.id}`,
          })),
        ),
      ...(correosDe.get(e.clientId) ?? []).flatMap((c) => {
        const asunto = asuntoComoTema(c.asunto);
        return asunto
          ? [{ texto: asunto, origen: c.tipo === "llamada" ? ("llamada" as const) : ("correo" as const), fuente: asunto, fecha: c.ocurrioAt.toISOString(), posicion: 0, href: null }]
          : [];
      }),
      ...(tareasDe.get(e.clientId) ?? []).map((t) => ({
        texto: t.titulo,
        origen: "tarea" as const,
        fuente: `T-${t.numero}`,
        fecha: t.createdAt.toISOString(),
        posicion: 0,
        href: null,
      })),
    ];

    return {
      clientId: e.clientId,
      nombre: e.nombre,
      cse: e.cse ? { nombre: e.cse.nombre, email: e.cse.email?.toLowerCase() ?? null } : null,
      cseDeBaja: e.cseDeBaja,
      tuya: e.tuya,
      salud: e.salud,
      porque: e.porque,
      proximaSesion: proximaSesionDe(proximas, e.clientId, o.ahora),
      calendarioLeido,
      paso: pasoDelSeguimiento(e.paso),
      pasoLleva: persona(e.paso?.lleva),
      ultimaReunion: ultima ? { sessionId: ultima.id, titulo: ultima.title?.trim() || "Reunión", fecha: ultima.date.toISOString() } : null,
      temas: elegirTemas(candidatos, e.nombre),
      // Para «Agendar»: la gente de afuera de la última reunión CON EL CLIENTE que muestra la fila (no la de la cartera,
      // que puede ser una de puertas adentro).
      invitados: ultima ? invitadosDe(ultima.participants, internos) : [],
    };
  });

  return { filas: ordenarSeguimiento(filas, o.hoyISO), lider, correo, filtros };
}
