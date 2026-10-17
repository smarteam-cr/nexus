/**
 * lib/tareas/lectura.ts — leer una reunión para tareas (docs/tareas-plan.md §5.4 y §7). SERVIDOR.
 *
 * Cada reunión se lee UNA vez (`LecturaDeReunion.sessionId` único). La lectura propone, nunca decide:
 *   1. Nivel 0, código (0 tokens): las líneas de «Próximos pasos» con dueño entre corchetes, la fecha que dicen, el
 *      cliente que nombran, «Por asignar» y las lápidas.
 *   2. Nivel 1, una sola llamada a Haiku, solo si hace falta: «¿es una tarea que ya existe?», proyectos sugeridos (R10),
 *      clientes dudosos y, en un cierre, qué se terminó.
 *   3. Todo queda como PROPUESTA, con su cita, y cada persona recibe UN aviso por lectura.
 *
 * Las reuniones se leen SOLO por el chokepoint (lib/sessions/reuniones-para-tareas.ts). Esto escribe
 * `LecturaDeReunion`; las tareas las escribe lib/tareas/mutaciones.ts.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getAnthropic } from "@/lib/anthropic";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { olvidarMedicion } from "@/lib/para-ti/medir-server";
import { conversacionParaTareas, duenosDeReuniones, getReunionesParaTareas, MAX_CONVERSACION_PARA_TAREAS, type ReunionParaTareas } from "@/lib/sessions/reuniones-para-tareas";
import { conversacionComoTexto } from "@/lib/sessions/conversacion";
import { costoDeLlamada } from "@/lib/ai/precios";
import { clientesDeUnTexto, indiceDeClientes, type ClientesDeUnTexto } from "@/lib/sessions/clientes-por-texto";
import { effectiveDomainsForClient } from "@/lib/sessions/categorize";
import { CANDIDATAS_POR_DUENO, DIAS_DE_LAPIDA, DIAS_PARA_AVISAR_UNA_LECTURA, LECTURAS_POR_PERSONA_POR_DIA, LLAMADAS_AUTOMATICAS_POR_DIA, MIN_CARACTERES_DE_CONVERSACION, MINUTOS_PARA_DAR_POR_COLGADA } from "./reglas";
import { aDate, comoFecha, hoyEnCostaRica, rolPorDefecto, semanaDeLaReunion, semanaQueCierra, diaCortoConSemana, horaDeCostaRica, type RolDeReunion } from "./semana";
import { EQUIPOS, claveDeEquipo, equipoDeLaMayoria, nombreDelEquipo } from "./equipos";
import { itemsDeActionItems, itemsDeProximosPasos, parrafosDeDetalles, resumenDeLasNotas, type LineaDeProximosPasos } from "./proximos-pasos";
import { armarPropuestas, armarPropuestasDeLaConversacion, claveDeTareaDeConversacion, necesitaModelo, prepararLineas, type Candidata, type Refs } from "./lectura-armar";
import { pedidoDeLectura } from "./ia/pedido";
import { leerContextos, LINEAS_POR_LLAMADA, pedidoDeContextos, SEGUNDOS_DEL_CONTEXTO } from "./ia/contexto";
import { contextoDeRespaldo } from "./contexto-de-tarea";
import { leerSalida, type SalidaDeLaLectura } from "./ia/salida";
import { MODELO_DE_LA_CONVERSACION, SEGUNDOS_DE_LA_CONVERSACION, leerSalidaDeConversacion, pedidoDeConversacion, type SalidaDeLaConversacion } from "./ia/conversacion";
import { huellaDeTexto } from "./texto";
import { ErrorDeTareas, contextoDeTareas, lideresDe, miembrosActivos, type ContextoDeTareas } from "./servidor";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { seguimientoPrendido } from "@/lib/lecturas/reglas";
import { clientesQueVesParaTareas, type ClientesQueVes } from "./clientes";
import { asegurarEspacio, escribirPropuestasDeLectura, escribirProyectoSugerido, escribirSugerenciaDeCierre, urlDeLaTarea, type PropuestaDeLectura } from "./mutaciones";
import { esLapida } from "./estados";
import { ABIERTAS_WHERE, candidatasWhere } from "./donde";

export const SLUG_DE_LA_LECTURA = "tareas-lectura";

function totalSinLugar(m: ReadonlyMap<string, number>): number {
  let n = 0;
  for (const v of m.values()) n += v;
  return n;
}

function quienLee(ctx: ContextoDeTareas, clientes: ClientesQueVes) {
  return { email: ctx.email, esSuperAdmin: ctx.esSuperAdmin, clientes };
}

/* ── Elegir y pedir ──────────────────────────────────────────────────────────────── */

export interface PedidoDeLectura {
  sessionId: string;
  rol?: RolDeReunion;
  equipo?: string;
  avisarIgual?: boolean;
  /** La serie del sprint que la pidió sola (lib/tareas/fuentes-server.ts). */
  fuenteId?: string;
}

export interface LecturaPedida {
  id: string;
  estado: string;
  /** Ya estaba leída: no se vuelve a leer. */
  yaLeida: boolean;
  /**
   * La fila espera a la lectura de seguimiento de la reunión (la creó su cola y nadie la leyó todavía): quien llama la
   * pide YA por lib/lecturas (`leerAhora`), que deja la salida de Tareas al terminar. Sin esto, «Leer una reunión»
   * quedaba diciendo «está leyendo» mientras la fila esperaba al job (sin presupuesto automático, para siempre).
   */
  esperaAlSeguimiento?: boolean;
  /** La reunión que hay que pedirle a la lectura de seguimiento (con `esperaAlSeguimiento`). */
  sessionId?: string;
}

/** Crea la lectura (o devuelve la que ya hay). El procesamiento corre después, en segundo plano (`procesarLectura`). */
export async function pedirLectura(ctx: ContextoDeTareas, clientes: ClientesQueVes, p: PedidoDeLectura, ahora = new Date()): Promise<LecturaPedida> {
  // El sprint que lee: uno de los equipos fijos o el de alguien activo (su sprint personal). Una clave inventada crearía
  // un espacio que nadie ve y dejaría sus «Por asignar» huérfanas.
  if (p.equipo && !EQUIPOS.some((e) => e.clave === p.equipo) && !ctx.miembros.some((m) => claveDeEquipo(m.area, m.email) === p.equipo)) {
    throw new ErrorDeTareas(400, "Ese equipo no existe.");
  }
  const [reunion] = await getReunionesParaTareas({ quien: quienLee(ctx, clientes), ids: [p.sessionId] });
  if (!reunion) throw new ErrorDeTareas(404, "No encuentro esa reunión entre las tuyas.");

  const rol = p.rol ?? rolPorDefecto(reunion.inicio, reunion.titulo);
  const equipo = p.equipo ?? equipoDeLaMayoria(reunion.participantes, ctx.miembros) ?? ctx.equipo;
  const vieja = +ahora - +reunion.inicio > DIAS_PARA_AVISAR_UNA_LECTURA * 86_400_000;
  const inicioDelDia = new Date(`${hoyEnCostaRica(ahora)}T06:00:00Z`);
  const topeDelDia = async () => {
    const hoyPedidas = await prisma.lecturaDeReunion.count({ where: { pedidaPorEmail: ctx.email, createdAt: { gte: inicioDelDia } } });
    if (hoyPedidas >= LECTURAS_POR_PERSONA_POR_DIA) throw new ErrorDeTareas(429, `Hoy ya pediste ${LECTURAS_POR_PERSONA_POR_DIA} lecturas. Mañana puedes pedir más.`);
  };

  const ya = await prisma.lecturaDeReunion.findUnique({ where: { sessionId: reunion.id }, select: { id: true, estado: true, leyendoDesde: true, pedidaPorEmail: true } });
  if (ya) {
    // La fila espera a la lectura de seguimiento (la creó su cola: `en_espera` y nadie la pidió para tareas). Si se está
    // leyendo, se espera; si está en la cola, se pide YA por lib/lecturas (quien llama). Con la bandera apagada, o sin
    // el SQL de la cola, nadie la va a leer por ese lado: la lee Tareas.
    const esperaFila = ya.estado === "en_espera" && !ya.pedidaPorEmail;
    const delSeguimiento = esperaFila ? await estadoDelSeguimiento(ya.id) : null;
    if (delSeguimiento === "leyendo") return { id: ya.id, estado: ya.estado, yaLeida: true };
    if (delSeguimiento === "en_espera" && seguimientoPrendido(process.env)) {
      await topeDelDia();
      return { id: ya.id, estado: ya.estado, yaLeida: false, esperaAlSeguimiento: true, sessionId: reunion.id };
    }
    // Se retoma una lectura que falló, que quedó colgada, o que no tenía qué leer y ahora sí (llegaron las notas).
    const colgadaDesde = new Date(+ahora - MINUTOS_PARA_DAR_POR_COLGADA * 60_000);
    const colgada = ya.estado === "leyendo" && (!ya.leyendoDesde || ya.leyendoDesde < colgadaDesde);
    const llegaronLasNotas = ya.estado === "sin_texto" && tieneLineas(reunion);
    if (ya.estado !== "error" && !colgada && !llegaronLasNotas && !esperaFila) return { id: ya.id, estado: ya.estado, yaLeida: true };
    await topeDelDia();
    // Condicionada: dos reintentos a la vez retoman una sola vez. Con lo elegido ahora, a nombre de quien reintenta.
    const r = await prisma.lecturaDeReunion.updateMany({
      where: {
        id: ya.id,
        OR: [
          { estado: "error" },
          { estado: "sin_texto" },
          { estado: "leyendo", OR: [{ leyendoDesde: null }, { leyendoDesde: { lt: colgadaDesde } }] },
          ...(esperaFila ? [{ estado: "en_espera", pedidaPorEmail: null }] : []),
        ],
      },
      data: {
        estado: "leyendo",
        leyendoDesde: ahora,
        error: null,
        intentos: { increment: 1 },
        rol,
        equipo,
        semanaQueCierra: rol === "planning" ? null : aDate(semanaQueCierra(reunion.inicio)),
        avisar: p.avisarIgual ? true : !vieja,
        pedidaPorEmail: ctx.email,
        ...(p.fuenteId ? { fuenteId: p.fuenteId } : {}),
      },
    });
    return { id: ya.id, estado: "leyendo", yaLeida: r.count === 0 };
  }

  await topeDelDia();

  // La misma reunión en dos filas (dos series): se lee una vez, la otra queda como copia.
  const gemela = reunion.huellaTexto
    ? await prisma.lecturaDeReunion.findFirst({ where: { huellaTexto: reunion.huellaTexto, estado: { not: "copia" } }, select: { id: true } })
    : null;

  try {
    const l = await prisma.lecturaDeReunion.create({
      data: {
        sessionId: reunion.id,
        huellaTexto: reunion.huellaTexto,
        copiaDeId: gemela?.id ?? null,
        equipo,
        rol,
        semana: aDate(semanaDeLaReunion(reunion.inicio)),
        semanaQueCierra: rol === "planning" ? null : aDate(semanaQueCierra(reunion.inicio)),
        estado: gemela ? "copia" : "leyendo",
        leyendoDesde: gemela ? null : ahora,
        avisar: p.avisarIgual ? true : !vieja,
        pedidaPorEmail: ctx.email,
        fuenteId: p.fuenteId ?? null,
        ...(gemela ? { leidaAt: ahora, resumen: { copiaDe: gemela.id } as Prisma.InputJsonValue } : {}),
      },
      select: { id: true, estado: true },
    });
    return { id: l.id, estado: l.estado, yaLeida: false };
  } catch (e) {
    if ((e as { code?: string })?.code !== "P2002") throw e;
    const otra = await prisma.lecturaDeReunion.findUnique({ where: { sessionId: reunion.id }, select: { id: true, estado: true } });
    if (!otra) throw e;
    return { id: otra.id, estado: otra.estado, yaLeida: true };
  }
}

/**
 * El estado de la lectura de seguimiento de una fila (`seguimientoEstado`), o null si no lo tiene (o a la base le falta
 * el SQL de la cola: entonces nadie la va a leer por ese lado).
 */
async function estadoDelSeguimiento(lecturaId: string): Promise<string | null> {
  try {
    const f = await prisma.lecturaDeReunion.findUnique({ where: { id: lecturaId }, select: { seguimientoEstado: true } });
    return f?.seguimientoEstado ?? null;
  } catch (e) {
    if (esquemaDesactualizado(e)) return null;
    throw e;
  }
}

/** ¿Trae líneas para leer (tareas anotadas o «Próximos pasos» con dueño)? */
function tieneLineas(reunion: ReunionParaTareas): boolean {
  return reunion.actionItems.length > 0 || itemsDeProximosPasos(reunion.notas ?? "").length > 0;
}

/** Una lectura que lleva más de 10 minutos en «leyendo» se cayó a mitad (un reinicio, un deploy): se trata como un error. */
function estaColgada(l: { estado: string; leyendoDesde: Date | null }, ahora: Date): boolean {
  return l.estado === "leyendo" && (!l.leyendoDesde || +ahora - +l.leyendoDesde > MINUTOS_PARA_DAR_POR_COLGADA * 60_000);
}

/* ── Procesar ────────────────────────────────────────────────────────────────────── */

export interface ResumenDeLectura {
  lineas: number;
  propuestas: number;
  porAsignar: number;
  yaEstaban: number;
  sumadas: number;
  omitidas: { lapida: number };
  proyectos: { id: string; nombre: string; nuevo: boolean }[];
  /** Por persona: cuántas le tocaron. */
  porPersona: { email: string; nombre: string; propuestas: number }[];
  /** Cuántas sugerencias de cierre dejó (en un cierre). */
  cierres: number;
  /** Las que no se propusieron porque esa persona ya tenía 5 de esta reunión (lib/tareas/cupo.ts). */
  sinLugar?: number;
  /** `seguimiento`: la escribió la lectura de seguimiento de la reunión (memoria de la cuenta, etapa 2), no Tareas. */
  modelo: "codigo" | "haiku" | "sin_ia" | "seguimiento";
  motivosDelModelo: string[];
  costo: { entrada: number; salida: number } | null;
  sinNotas?: boolean;
  /** El nivel 2: lo que salió de leer la conversación (sola, si las notas no traían pasos; o con «¿Faltó algo?»). */
  conversacion?: ConversacionDeLaLectura;
}

/** El nivel 2 de una lectura (docs/tareas-plan.md §7.3), guardado en `resumen.conversacion`. */
export interface ConversacionDeLaLectura {
  estado: "leyendo" | "lista" | "sin_ia" | "error";
  /** `automatica`: las notas no traían próximos pasos. `pedida`: alguien tocó «¿Faltó algo?». */
  como: "automatica" | "pedida";
  pedidaPorEmail: string | null;
  propuestas: number;
  porAsignar: number;
  yaEstaban: number;
  sumadas: number;
  omitidas: { lapida: number };
  proyectos: { id: string; nombre: string; nuevo: boolean }[];
  porPersona: { email: string; nombre: string; propuestas: number }[];
  /** Las que no se propusieron porque esa persona ya tenía 5 de esta reunión (lib/tareas/cupo.ts). */
  sinLugar?: number;
  turnos: number;
  /** La conversación no entró entera en el tope: faltan los últimos turnos. */
  recortada: boolean;
  costo: { entrada: number; salida: number } | null;
  /** Por qué no se pudo: sin turnos «Nombre: texto» (no se arregla reintentando), la IA devolvió algo que no sirve, o falló. */
  motivo?: "sin_turnos" | "salida_invalida" | "error";
}

const CONVERSACION_VACIA = { propuestas: 0, porAsignar: 0, yaEstaban: 0, sumadas: 0, omitidas: { lapida: 0 }, proyectos: [], porPersona: [], turnos: 0, recortada: false, costo: null };

async function candidatasPara(duenos: readonly string[], equipoDeLaLectura: string, clienteDeLaReunion: string | null, ahora: Date) {
  const por = new Map<string, Candidata[]>();
  if (!duenos.length) return { por, lapidas: [] as { huella: string; responsableEmail: string | null; clientId: string | null }[] };
  const desdeLapida = new Date(+ahora - DIAS_DE_LAPIDA * 86_400_000);
  const [filas, lapidas] = await Promise.all([
    prisma.tarea.findMany({
      where: candidatasWhere(duenos, equipoDeLaLectura, clienteDeLaReunion),
      select: { id: true, numero: true, titulo: true, estado: true, responsableEmail: true, clientId: true, _count: { select: { resultados: { where: { resultado: "pasa", decididoPor: { not: "sistema" } } } } } },
      orderBy: { updatedAt: "desc" },
      take: 400,
    }),
    prisma.tarea.findMany({
      where: { estado: { in: ["rechazada", "fusionada"] }, decididaAt: { gte: desdeLapida }, responsableEmail: { in: [...duenos] } },
      select: { huella: true, responsableEmail: true, clientId: true, estado: true, decision: true, decididaPorEmail: true },
    }),
  ]);
  for (const f of filas) {
    const c: Candidata = { id: f.id, numero: f.numero, titulo: f.titulo, estado: f.estado, responsableEmail: f.responsableEmail, clientId: f.clientId, pases: f._count.resultados };
    const claves = f.responsableEmail ? [f.responsableEmail] : duenos;
    for (const k of claves) por.set(k, [...(por.get(k) ?? []), c]);
  }
  return { por, lapidas: lapidas.filter(esLapida).map((l) => ({ huella: l.huella, responsableEmail: l.responsableEmail, clientId: l.clientId })) };
}

/**
 * El cliente que nombra cada línea de una reunión INTERNA (en una de cliente, todas son de ese cliente). Solo entre las
 * empresas que ve quien pidió la lectura, y nunca la casa (INTERNO o con sus dominios). La usa también el ensayo.
 */
export async function clientesDeLasLineas(lineas: readonly LineaDeProximosPasos[], clientes: ClientesQueVes): Promise<Map<string, ClientesDeUnTexto>> {
  const salida = new Map<string, ClientesDeUnTexto>();
  const filas = await prisma.client.findMany({ where: { id: { in: [...clientes.ids] } }, select: { id: true, name: true, company: true, siglas: true, emailDomains: true, kind: true } });
  const indice = indiceDeClientes(filas.filter((c) => c.kind !== "INTERNO").map((c) => ({ id: c.id, name: c.name, company: c.company, siglas: c.siglas })));
  const internos = new Set(filas.filter((c) => c.kind === "INTERNO").map((c) => c.id));
  const dominiosInternos = new Set(filas.filter((c) => internos.has(c.id)).flatMap((c) => effectiveDomainsForClient(c)));
  const esLaCasa = (c: { id: string }) => internos.has(c.id) || effectiveDomainsForClient(filas.find((f) => f.id === c.id) ?? { emailDomains: [], company: null }).some((d) => dominiosInternos.has(d));
  for (const linea of lineas) salida.set(linea.id, clientesDeUnTexto(`${linea.titulo} ${linea.detalle ?? ""}`, indice, esLaCasa));
  return salida;
}

/** Procesa una lectura pedida. NUNCA lanza: un error queda en la fila, con «Reintentar». */
export async function procesarLectura(lecturaId: string, ahora = new Date()): Promise<void> {
  try {
    await procesar(lecturaId, ahora);
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error(`[tareas] la lectura ${lecturaId} falló: ${mensaje}`);
    await prisma.lecturaDeReunion.update({ where: { id: lecturaId }, data: { estado: "error", error: mensaje.slice(0, 2_000), leyendoDesde: null } }).catch(() => undefined);
  }
}

async function procesar(lecturaId: string, ahora: Date) {
  const l = await prisma.lecturaDeReunion.findUnique({ where: { id: lecturaId }, include: { fuente: { select: { personas: true } } } });
  if (!l || l.estado !== "leyendo" || !l.sessionId || !l.pedidaPorEmail) return;
  const enElSprint = l.fuente?.personas ?? [];
  const tm = await prisma.teamMember.findUnique({ where: { email: l.pedidaPorEmail } });
  if (!tm) throw new Error("Quien pidió la lectura ya no está en el equipo.");
  const ctx = await contextoDeTareas({ teamMember: tm });
  const clientes = await clientesQueVesParaTareas(tm);
  const [reunion] = await getReunionesParaTareas({ quien: quienLee(ctx, clientes), ids: [l.sessionId] });
  if (!reunion) throw new Error("La reunión ya no se puede leer.");
  // Releer (llegaron las notas, o un reintento) no borra lo que ya salió de la conversación.
  const conversacionAnterior = ((l.resumen ?? null) as ResumenDeLectura | null)?.conversacion;
  const conLaAnterior = conversacionAnterior ? { conversacion: conversacionAnterior } : {};

  const lineas = reunion.actionItems.length ? itemsDeActionItems(reunion.actionItems) : itemsDeProximosPasos(reunion.notas ?? "");
  if (lineas.length === 0) {
    const resumen: ResumenDeLectura = { lineas: 0, propuestas: 0, porAsignar: 0, yaEstaban: 0, sumadas: 0, omitidas: { lapida: 0 }, proyectos: [], porPersona: [], cierres: 0, modelo: "codigo", motivosDelModelo: [], costo: null, sinNotas: !reunion.notas, ...conLaAnterior };
    // Nivel 2, en automático: sin «Próximos pasos» ni tareas anotadas, se lee la conversación (si hay, si hay cupo y si
    // no se leyó ya).
    if (reunion.largoTranscript >= MIN_CARACTERES_DE_CONVERSACION && conversacionAnterior?.estado !== "lista" && (await hayCupoAutomatico(ahora))) {
      const conv = await leerLaConversacion({ id: l.id, sessionId: l.sessionId, equipo: l.equipo, semana: comoFecha(l.semana)!, avisar: l.avisar, pedidaPorEmail: l.pedidaPorEmail, enElSprint }, ctx, clientes, "automatica", null, ahora, {
        base: resumen,
        datos: { modo: "transcript", leidaAt: ahora },
      });
      if (conv) return;
      // Hay transcripción, pero sin turnos «Nombre: texto»: no hay conversación que leer, ni ahora ni con «¿Faltó algo?».
      resumen.conversacion = { ...CONVERSACION_VACIA, estado: "error", motivo: "sin_turnos", como: "automatica", pedidaPorEmail: null };
    }
    await prisma.lecturaDeReunion.update({ where: { id: l.id }, data: { estado: "sin_texto", modo: "codigo", resumen: resumen as unknown as Prisma.InputJsonValue, leidaAt: ahora, leyendoDesde: null } });
    return;
  }

  // El cliente de la reunión (si es de un cliente que no es la casa) y el de cada línea (si es interna).
  const clienteDeLaReunion = reunion.duenoClienteId && !reunion.puertasAdentro ? reunion.duenoClienteId : null;
  const clientesPorLinea = clienteDeLaReunion ? new Map<string, ClientesDeUnTexto>() : await clientesDeLasLineas(lineas, clientes);

  const semana = comoFecha(l.semana)!;
  const ctxArmado = {
    lectura: { id: l.id, equipo: l.equipo, semana, pedidaPorEmail: l.pedidaPorEmail, inicio: reunion.inicio, enElSprint },
    miembros: ctx.miembros,
    participantes: reunion.participantes,
    clienteDeLaReunion,
    clientesPorLinea,
    candidatasPorDueno: new Map<string, Candidata[]>(),
    lapidas: [] as { huella: string; responsableEmail: string | null; clientId: string | null }[],
  };
  const previo = prepararLineas(lineas, ctxArmado);
  const duenos = [...new Set(previo.map((p) => p.dueno).filter((d): d is string => !!d))];
  const { por, lapidas } = await candidatasPara(duenos, l.equipo, clienteDeLaReunion, ahora);
  ctxArmado.candidatasPorDueno = por;
  ctxArmado.lapidas = lapidas;
  const prep = prepararLineas(lineas, ctxArmado);

  // Las tareas de la semana que cierra (solo en un cierre), de quienes estuvieron.
  const semanaCerrada = comoFecha(l.semanaQueCierra);
  const tareasDeLaSemana = semanaCerrada
    ? await prisma.tarea.findMany({
        where: { ...ABIERTAS_WHERE, semana: aDate(semanaCerrada), responsableEmail: { in: reunion.participantes } },
        select: { id: true, titulo: true, responsableEmail: true },
        take: 40,
      })
    : [];
  const detalles = semanaCerrada ? parrafosDeDetalles(reunion.notas ?? "") : [];

  // ¿Hace falta el modelo?
  const { necesita, buscarGrupos, motivos } = necesitaModelo(prep, l.rol);
  const refs: Refs = { M: new Map(), T: new Map(), R: new Map(), C: new Map() };
  let salida: SalidaDeLaLectura | null = null;
  let modo: ResumenDeLectura["modelo"] = "codigo";
  let costo: ResumenDeLectura["costo"] = null;
  let agentRunId: string | null = null;

  if (necesita) {
    const proyectos = await prisma.proyectoDeTareas.findMany({
      where: {
        espacio: { equipo: l.equipo },
        OR: [{ estado: { in: ["activo", "propuesta"] } }, { estado: "descartado", decididaAt: { gte: new Date(+ahora - DIAS_DE_LAPIDA * 86_400_000) } }],
      },
      select: { id: true, nombre: true, estado: true },
      take: 10,
    });
    const personas = ctx.miembros.filter((m) => reunion.participantes.includes(m.email) || duenos.includes(m.email) || prep.some((p) => p.persona.tipo === "ambiguo" && p.persona.candidatos.includes(m.email)));
    personas.forEach((m, i) => refs.M.set(`M${i + 1}`, m.email));
    const refDeEmail = (e: string | null) => (e ? ([...refs.M.entries()].find(([, v]) => v === e)?.[0] ?? null) : null);
    const candidatasUnicas = [...new Map(prep.flatMap((p) => p.candidatas).map((c) => [c.id, c])).values()];
    candidatasUnicas.forEach((c, i) => refs.T.set(`T${i + 1}`, c.id));
    tareasDeLaSemana.forEach((t) => {
      if (![...refs.T.values()].includes(t.id)) refs.T.set(`T${refs.T.size + 1}`, t.id);
    });
    const refDeTarea = (id: string) => [...refs.T.entries()].find(([, v]) => v === id)![0];
    proyectos.forEach((p, i) => refs.R.set(`R${i + 1}`, p.id));
    const clientesUsados = [...new Set(prep.flatMap((p) => p.clientesCandidatos))];
    clientesUsados.forEach((c, i) => refs.C.set(`C${i + 1}`, c));
    const refDeCliente = (id: string) => [...refs.C.entries()].find(([, v]) => v === id)![0];

    const pedido = pedidoDeLectura({
      titulo: reunion.titulo,
      fecha: diaCortoConSemana(horaDeCostaRica(reunion.inicio).fecha),
      rol: l.rol as RolDeReunion,
      lineas: prep.map((p) => ({
        ref: p.ref,
        texto: p.linea.texto,
        dueno: refDeEmail(p.dueno),
        candidatas: p.candidatas.map((c) => refDeTarea(c.id)),
        clientes: p.clientesCandidatos.map(refDeCliente),
      })),
      personas: personas.map((m) => ({ ref: refDeEmail(m.email)!, nombre: m.nombre, equipo: nombreDelEquipo(claveDeEquipo(m.area, m.email)) })),
      candidatas: candidatasUnicas.map((c) => ({ ref: refDeTarea(c.id), titulo: c.titulo, dueno: refDeEmail(c.responsableEmail), pases: c.pases, estado: c.estado })),
      proyectos: proyectos.map((p) => ({ ref: [...refs.R.entries()].find(([, v]) => v === p.id)![0], nombre: p.nombre, estado: p.estado })),
      clientes: clientesUsados.map((c) => ({ ref: refDeCliente(c), nombre: clientes.porId.get(c)?.nombre ?? c })),
      resumen: buscarGrupos ? resumenDeLasNotas(reunion.notas ?? "") : null,
      buscarGrupos,
      tareasDeLaSemana: tareasDeLaSemana.map((t) => ({ ref: refDeTarea(t.id), titulo: t.titulo, dueno: refDeEmail(t.responsableEmail) })),
      detalles: detalles.map((d, i) => ({ ref: `D${i + 1}`, texto: d.texto })),
    });

    const run = await prisma.agentRun.create({
      data: { agentSlug: SLUG_DE_LA_LECTURA, status: "RUNNING", triggeredByEmail: l.pedidaPorEmail, clientId: reunion.duenoClienteId ?? null, sourceSessionIds: [reunion.id], stepLabel: "Leer una reunión para tareas", currentPhase: "Leyendo la reunión" },
      select: { id: true },
    });
    agentRunId = run.id;
    try {
      const respuesta = await conContextoDeIA(
        { agentSlug: SLUG_DE_LA_LECTURA, agentRunId: run.id, triggeredByEmail: l.pedidaPorEmail, origen: "tareas/lectura" },
        () => getAnthropic().messages.create(pedido, { timeout: 20_000, maxRetries: 0 }),
      );
      salida = leerSalida(respuesta, {
        L: new Set(prep.map((p) => p.ref)),
        M: new Set(refs.M.keys()),
        T: new Set(refs.T.keys()),
        R: new Set(refs.R.keys()),
        C: new Set(refs.C.keys()),
        D: new Set(detalles.map((_, i) => `D${i + 1}`)),
        textoDe: new Map(prep.map((p) => [p.ref, p.linea.texto])),
        tareasDeLaSemana: new Set(tareasDeLaSemana.map((t) => refDeTarea(t.id))),
      });
      modo = salida ? "haiku" : "sin_ia";
      costo = { entrada: respuesta.usage.input_tokens, salida: respuesta.usage.output_tokens };
      await prisma.agentRun.update({ where: { id: run.id }, data: { status: salida ? "DONE" : "ERROR", output: JSON.stringify(respuesta.content).slice(0, 20_000), currentPhase: null } });
    } catch (e) {
      modo = "sin_ia";
      await prisma.agentRun.update({ where: { id: run.id }, data: { status: "ERROR", output: (e instanceof Error ? e.message : String(e)).slice(0, 2_000), currentPhase: null } });
    }
  }

  const armado = armarPropuestas(prep, ctxArmado, salida, refs);

  // El contexto de cada propuesta (2026-10-09): Haiku con el resumen y los detalles, o el de respaldo si no se puede.
  const ctxDeLasPropuestas = await contextosDeLasNotas(armado.propuestas, lineas, reunion, l.pedidaPorEmail, clientes, ahora);
  for (const p of armado.propuestas) p.contexto = ctxDeLasPropuestas.porLinea.get(p.lineaId) ?? null;
  if (ctxDeLasPropuestas.costo) {
    costo = { entrada: (costo?.entrada ?? 0) + ctxDeLasPropuestas.costo.entrada, salida: (costo?.salida ?? 0) + ctxDeLasPropuestas.costo.salida };
  }

  // Escribir todo junto: proyectos sugeridos, propuestas, sugerencias de cierre y el resumen.
  const espacio = await asegurarEspacio(prisma, l.equipo);
  const resultado = await prisma.$transaction(
    async (tx) => {
      const proyectos: ResumenDeLectura["proyectos"] = [];
      const proyectoDeLinea = new Map<string, string>();
      for (const g of armado.grupos) {
        if (g.mismoQue) {
          // Ya existe: las líneas salen con «¿Va dentro de…?» (sugerido), no adentro.
          for (const p of armado.propuestas) if (g.lineas.includes(p.lineaId)) p.sugerido = { ...p.sugerido, proyectoSugeridoId: g.mismoQue };
          continue;
        }
        const citas = armado.propuestas.filter((p) => g.lineas.includes(p.lineaId)).map((p) => p.cita).join("\n");
        const proy = await escribirProyectoSugerido(tx, { id: l.id, sessionId: reunion.id }, espacio.id, { clave: g.clave, nombre: g.nombre, cita: citas, clientId: clienteDeLaReunion });
        if (!proy) continue; // ya hay uno propuesto con ese nombre, de otro cliente: las líneas quedan sueltas
        proyectos.push({ id: proy.id, nombre: g.nombre, nuevo: proy.nuevo });
        for (const lineaId of g.lineas) proyectoDeLinea.set(lineaId, proy.id);
      }
      const propuestas = armado.propuestas.map((p) => ({ ...p, proyectoId: proyectoDeLinea.get(p.lineaId) ?? null }));
      const escritas = await escribirPropuestasDeLectura(tx, { id: l.id, sessionId: reunion.id, tituloReunion: reunion.titulo, pedidaPorEmail: l.pedidaPorEmail }, propuestas);

      let cierres = 0;
      if (salida && semanaCerrada) {
        for (const r of salida.resultados) {
          const tareaId = refs.T.get(r.T);
          const fuente = r.fuente.startsWith("D") ? detalles[Number(r.fuente.slice(1)) - 1]?.texto : prep.find((p) => p.ref === r.fuente)?.linea.texto;
          if (!tareaId || !fuente) continue;
          await escribirSugerenciaDeCierre(tx, tareaId, { sessionId: reunion.id, cita: fuente, resultado: r.resultado, semana: semanaCerrada, lectura: l.id });
          cierres++;
        }
      }

      const porPersona = new Map<string, number>();
      for (const c of escritas.creadas) if (c.responsableEmail) porPersona.set(c.responsableEmail, (porPersona.get(c.responsableEmail) ?? 0) + 1);
      const resumen: ResumenDeLectura = {
        lineas: lineas.length,
        propuestas: escritas.creadas.filter((c) => c.responsableEmail).length,
        porAsignar: escritas.creadas.filter((c) => !c.responsableEmail).length,
        yaEstaban: escritas.yaEstaban,
        sumadas: escritas.sumadas,
        omitidas: armado.omitidas,
        proyectos,
        porPersona: [...porPersona.entries()].map(([email, n]) => ({ email, nombre: ctx.miembros.find((m) => m.email === email)?.nombre ?? email, propuestas: n })),
        cierres,
        sinLugar: totalSinLugar(escritas.sinLugar),
        modelo: modo,
        motivosDelModelo: motivos,
        costo,
        ...conLaAnterior,
      };
      await tx.lecturaDeReunion.update({
        where: { id: l.id },
        data: { estado: modo === "sin_ia" ? "sin_ia" : "lista", modo, resumen: resumen as unknown as Prisma.InputJsonValue, leidaAt: ahora, leyendoDesde: null, agentRunId },
      });
      return { resumen, creadas: escritas.creadas };
    },
    { timeout: 30_000, maxWait: 10_000 },
  );

  await avisarDeLasPropuestas({ id: l.id, equipo: l.equipo, avisar: l.avisar, pedidaPorEmail: l.pedidaPorEmail }, reunion, ctx, resultado.resumen, "");
}

const SLUG_DEL_CONTEXTO = "tareas-contexto";

/**
 * El contexto de las propuestas del nivel 1. Cada una arranca con el de respaldo (el detalle de su línea y el párrafo de
 * la reunión que más se le parece, sin modelo); después Haiku lo escribe con el resumen y los detalles, en UNA llamada
 * para todas. Nunca frena la lectura: sin cupo automático, sin presupuesto o si falla, queda el de respaldo.
 */
async function contextosDeLasNotas(
  propuestas: readonly { lineaId: string; titulo: string; cita: string }[],
  lineas: readonly LineaDeProximosPasos[],
  reunion: ReunionParaTareas,
  pedidaPorEmail: string | null,
  clientes: ClientesQueVes,
  ahora: Date,
): Promise<{ porLinea: Map<string, string | null>; costo: { entrada: number; salida: number } | null }> {
  const parrafos = parrafosDeDetalles(reunion.notas ?? "").map((d) => d.texto);
  const detalleDe = new Map(lineas.map((x) => [x.id, x.detalle]));
  // Los nombres de las empresas: un párrafo que nombra a otra que la línea no nombra no es su contexto.
  const nombres = [...clientes.porId.values()].map((c) => c.nombre);
  const porLinea = new Map<string, string | null>(
    propuestas.map((p) => [p.lineaId, contextoDeRespaldo({ titulo: p.titulo, detalle: detalleDe.get(p.lineaId) ?? null }, parrafos, { clientes: nombres })]),
  );
  if (!propuestas.length) return { porLinea, costo: null };
  // Una lectura que nadie pidió cuenta contra el cupo automático del día (el slug empieza con «tareas-»).
  if (!pedidaPorEmail && !(await hayCupoAutomatico(ahora))) return { porLinea, costo: null };

  const conRef = propuestas.map((p, i) => ({ ref: `L${i + 1}`, p }));
  const tandas: (typeof conRef)[] = [];
  for (let k = 0; k < conRef.length; k += LINEAS_POR_LLAMADA) tandas.push(conRef.slice(k, k + LINEAS_POR_LLAMADA));
  const fecha = diaCortoConSemana(horaDeCostaRica(reunion.inicio).fecha);
  const resumen = resumenDeLasNotas(reunion.notas ?? "");
  // Con el cliente de la reunión (si lo tiene): la corrida no queda en el montón sin cliente que ve más gente.
  const run = await prisma.agentRun.create({
    data: {
      agentSlug: SLUG_DEL_CONTEXTO,
      status: "RUNNING",
      triggeredByEmail: pedidaPorEmail,
      clientId: reunion.duenoClienteId ?? null,
      sourceSessionIds: [reunion.id],
      stepLabel: "Escribir el contexto de las tareas",
      currentPhase: "Escribiendo el contexto",
    },
    select: { id: true },
  });
  // Una tanda por llamada, en paralelo: una respuesta cortada solo deja con el de respaldo a sus propias líneas.
  const respuestas = await Promise.allSettled(
    tandas.map((tanda) =>
      conContextoDeIA({ agentSlug: SLUG_DEL_CONTEXTO, agentRunId: run.id, triggeredByEmail: pedidaPorEmail, origen: "tareas/contexto" }, () =>
        getAnthropic().messages.create(
          pedidoDeContextos({ titulo: reunion.titulo, fecha, resumen, detalles: parrafos, lineas: tanda.map(({ ref, p }) => ({ ref, titulo: p.titulo, texto: p.cita })) }),
          { timeout: SEGUNDOS_DEL_CONTEXTO * 1_000, maxRetries: 0 },
        ),
      ),
    ),
  );
  let entrada = 0;
  let salida = 0;
  let escritos = 0;
  let fallidas = 0;
  let cortadas = 0;
  respuestas.forEach((r, k) => {
    // Una respuesta sin forma (sin `content` ni `usage`) cuenta como fallida: el contexto nunca frena la lectura.
    if (r.status === "rejected" || !r.value?.content || !r.value.usage) {
      fallidas++;
      return;
    }
    entrada += r.value.usage.input_tokens;
    salida += r.value.usage.output_tokens;
    if (r.value.stop_reason === "max_tokens") cortadas++;
    const leidos = leerContextos(r.value, new Map(tandas[k].map(({ ref, p }) => [ref, p.titulo])));
    for (const { ref, p } of tandas[k]) {
      const c = leidos.get(ref);
      if (c) {
        porLinea.set(p.lineaId, c);
        escritos++;
      }
    }
  });
  // ⛔ El texto escrito NO va a la corrida: es contenido de la reunión, y la corrida no tiene su regla. Solo las cuentas.
  const resumenDeLaCorrida = { lineas: conRef.length, tandas: tandas.length, escritos, fallidas, cortadas };
  await prisma.agentRun
    .update({ where: { id: run.id }, data: { status: fallidas || cortadas ? "ERROR" : "DONE", output: JSON.stringify(resumenDeLaCorrida), currentPhase: null } })
    .catch(() => undefined);
  return { porLinea, costo: entrada || salida ? { entrada, salida } : null };
}

/**
 * Después de escribir las propuestas de una lectura. Desde el 2026-10-16 (fase 1.3 de
 * docs/nexus-sistema-de-trabajo-plan.md) NO avisa: lo propuesto ya es un pendiente en «Para ti» (una línea por reunión,
 * y el «Por asignar» de cada líder), y un aviso que repite un pendiente lo cuenta dos veces. Solo se olvida la medición
 * guardada de quienes recibieron algo, para que «Para ti» lo muestre enseguida.
 */
async function avisarDeLasPropuestas(
  l: { id: string; equipo: string; avisar: boolean; pedidaPorEmail: string | null },
  _reunion: ReunionParaTareas,
  ctx: Pick<ContextoDeTareas, "miembros">,
  r: { porPersona: { email: string; propuestas: number }[]; porAsignar: number },
  _sufijo: string,
  porAsignarPorEquipo?: ReadonlyMap<string, number>,
) {
  for (const pp of r.porPersona) olvidarMedicion(pp.email);
  const porEquipo = porAsignarPorEquipo ?? new Map(r.porAsignar > 0 ? [[l.equipo, r.porAsignar]] : []);
  for (const [equipo, cuantas] of porEquipo) if (cuantas > 0) for (const lider of lideresDe(equipo, ctx.miembros)) olvidarMedicion(lider.email);
  if (l.pedidaPorEmail) olvidarMedicion(l.pedidaPorEmail);
}

/* ── Nivel 2: la conversación (docs/tareas-plan.md §7.3) ────────────────────────────── */

export const SLUG_DE_LA_CONVERSACION = "tareas-conversacion";

/** ¿Queda cupo de llamadas automáticas hoy? Cuenta las de `tareas-*` que disparó el sistema (sin persona). */
async function hayCupoAutomatico(ahora: Date): Promise<boolean> {
  const inicioDelDia = new Date(`${hoyEnCostaRica(ahora)}T06:00:00Z`);
  const hechas = await prisma.llmCall.count({ where: { agentSlug: { startsWith: "tareas-" }, triggeredByEmail: null, at: { gte: inicioDelDia } } });
  return hechas < LLAMADAS_AUTOMATICAS_POR_DIA;
}

/** Lo que cuesta, más o menos, leer una conversación de ese largo (para el botón). */
export function costoEstimadoDeLaConversacion(largoTranscript: number): number | null {
  const caracteres = Math.min(largoTranscript, MAX_CONVERSACION_PARA_TAREAS);
  return costoDeLlamada(MODELO_DE_LA_CONVERSACION, { inputTokens: Math.ceil(caracteres / 3.5) + 1_500, outputTokens: 800 });
}

/**
 * Pide leer la conversación de una reunión ya leída («¿Faltó algo?»). Solo quien puede leer esa reunión, una vez por
 * reunión (se puede reintentar si falló), y con el mismo tope diario que las lecturas. Corre en segundo plano.
 */
export async function pedirConversacion(ctx: ContextoDeTareas, clientes: ClientesQueVes, lecturaId: string, ahora = new Date()): Promise<{ id: string; estado: string; tomada: boolean }> {
  const l = await prisma.lecturaDeReunion.findUnique({ where: { id: lecturaId }, select: { id: true, estado: true, sessionId: true, resumen: true, leyendoDesde: true, updatedAt: true, modo: true } });
  if (!l || !l.sessionId) throw new ErrorDeTareas(404, "Esa lectura no existe.");
  const [reunion] = await getReunionesParaTareas({ quien: quienLee(ctx, clientes), ids: [l.sessionId] });
  if (!reunion) throw new ErrorDeTareas(404, "Esa lectura no existe.");
  if (!["lista", "sin_ia", "sin_texto"].includes(l.estado)) throw new ErrorDeTareas(409, "Espera a que termine la lectura de la reunión.");
  // La lectura de seguimiento ya leyó la conversación entera: pagarla otra vez no trae nada nuevo.
  if (l.modo === "seguimiento" && l.estado === "lista") throw new ErrorDeTareas(409, "La lectura de la reunión ya leyó la conversación entera.");
  if (reunion.largoTranscript < MIN_CARACTERES_DE_CONVERSACION) throw new ErrorDeTareas(409, "Esta reunión no tiene la conversación grabada.");
  const conv = ((l.resumen ?? null) as ResumenDeLectura | null)?.conversacion;
  if (conv?.estado === "lista") throw new ErrorDeTareas(409, "La conversación de esta reunión ya se leyó.");
  if (conv?.motivo === "sin_turnos") throw new ErrorDeTareas(409, "La transcripción de esta reunión no trae quién dijo qué: no hay una conversación que leer.");

  const inicioDelDia = new Date(`${hoyEnCostaRica(ahora)}T06:00:00Z`);
  const hoy = await prisma.agentRun.count({ where: { agentSlug: SLUG_DE_LA_CONVERSACION, triggeredByEmail: ctx.email, createdAt: { gte: inicioDelDia } } });
  if (hoy >= LECTURAS_POR_PERSONA_POR_DIA) throw new ErrorDeTareas(429, `Hoy ya pediste ${LECTURAS_POR_PERSONA_POR_DIA} lecturas de conversaciones. Mañana puedes pedir más.`);

  // Tomarla: una a la vez por lectura (una colgada se puede volver a tomar).
  const colgadaDesde = new Date(+ahora - MINUTOS_PARA_DAR_POR_COLGADA * 60_000);
  const tomada = await prisma.lecturaDeReunion.updateMany({
    where: { id: l.id, estado: l.estado, updatedAt: l.updatedAt, OR: [{ leyendoDesde: null }, { leyendoDesde: { lt: colgadaDesde } }] },
    data: { leyendoDesde: ahora },
  });
  // Ya la está leyendo otra persona: no se lanza otra lectura.
  if (tomada.count === 0) return { id: l.id, estado: "leyendo", tomada: false };
  const leyendo: ConversacionDeLaLectura = { ...CONVERSACION_VACIA, estado: "leyendo", como: "pedida", pedidaPorEmail: ctx.email };
  await guardarConversacion(prisma, l.id, leyendo);
  return { id: l.id, estado: "leyendo", tomada: true };
}

/** Lee la conversación pedida con «¿Faltó algo?». NUNCA lanza: un error queda en `resumen.conversacion`. */
export async function procesarConversacion(lecturaId: string, ahora = new Date()): Promise<void> {
  try {
    const l = await prisma.lecturaDeReunion.findUnique({ where: { id: lecturaId }, include: { fuente: { select: { personas: true } } } });
    const conv = ((l?.resumen ?? null) as ResumenDeLectura | null)?.conversacion;
    if (!l || !l.sessionId || conv?.estado !== "leyendo" || !conv.pedidaPorEmail) return;
    const tm = await prisma.teamMember.findUnique({ where: { email: conv.pedidaPorEmail } });
    if (!tm) throw new Error("Quien pidió la lectura ya no está en el equipo.");
    const ctx = await contextoDeTareas({ teamMember: tm });
    const clientes = await clientesQueVesParaTareas(tm);
    const leida = await leerLaConversacion(
      { id: l.id, sessionId: l.sessionId, equipo: l.equipo, semana: comoFecha(l.semana)!, avisar: l.avisar, pedidaPorEmail: l.pedidaPorEmail, enElSprint: l.fuente?.personas ?? [] },
      ctx,
      clientes,
      "pedida",
      conv.pedidaPorEmail,
      ahora,
    );
    if (!leida) {
      await guardarConversacion(prisma, lecturaId, { ...CONVERSACION_VACIA, como: "pedida", pedidaPorEmail: conv.pedidaPorEmail, estado: "error", motivo: "sin_turnos" });
    }
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error(`[tareas] la conversación de la lectura ${lecturaId} falló: ${mensaje}`);
    const actual = await prisma.lecturaDeReunion.findUnique({ where: { id: lecturaId }, select: { resumen: true } }).catch(() => null);
    const conv = ((actual?.resumen ?? null) as ResumenDeLectura | null)?.conversacion;
    await guardarConversacion(prisma, lecturaId, { ...CONVERSACION_VACIA, como: "pedida", pedidaPorEmail: conv?.pedidaPorEmail ?? null, estado: "error", motivo: "error" }).catch(() => undefined);
  }
}

/** Escribe `resumen.conversacion` sin tocar el resto del resumen, y suelta la lectura. */
async function guardarConversacion(db: Pick<typeof prisma, "lecturaDeReunion">, id: string, conv: ConversacionDeLaLectura, extra: Prisma.LecturaDeReunionUncheckedUpdateInput = {}, base?: ResumenDeLectura) {
  const fila = base ? null : await db.lecturaDeReunion.findUnique({ where: { id }, select: { resumen: true } });
  const resumen = { ...((base ?? fila?.resumen ?? {}) as object), conversacion: conv };
  await db.lecturaDeReunion.update({
    where: { id },
    data: { resumen: resumen as unknown as Prisma.InputJsonValue, ...(conv.estado === "leyendo" ? {} : { leyendoDesde: null }), ...extra },
  });
}

/**
 * Lee la conversación y escribe lo que salió: las mismas reglas que el nivel 1 (dueño solo del equipo que estuvo, la
 * cita es el turno, «¿Es T-12?» contra las candidatas de ese dueño, lápidas, proyectos sugeridos) y UN aviso por
 * persona. `null` si no hay conversación que leer. `automatica` además cierra la lectura (`base` + `datos`).
 */
async function leerLaConversacion(
  l: { id: string; sessionId: string; equipo: string; semana: string; avisar: boolean; pedidaPorEmail: string | null; enElSprint?: readonly string[] },
  ctx: ContextoDeTareas,
  clientes: ClientesQueVes,
  como: ConversacionDeLaLectura["como"],
  pedidaPorEmail: string | null,
  ahora: Date,
  automatica?: { base: ResumenDeLectura; datos: Prisma.LecturaDeReunionUncheckedUpdateInput },
): Promise<ConversacionDeLaLectura | null> {
  const leida = await conversacionParaTareas(quienLee(ctx, clientes), l.sessionId);
  if (!leida) return null;
  const { reunion, conversacion } = leida;
  const clienteDeLaReunion = reunion.duenoClienteId && !reunion.puertasAdentro ? reunion.duenoClienteId : null;

  // Las listas cerradas: quién estuvo (M#), sus tareas abiertas (T#) y los proyectos del equipo (R#).
  const personas = ctx.miembros.filter((m) => reunion.participantes.includes(m.email));
  const refs: Refs = { M: new Map(), T: new Map(), R: new Map(), C: new Map() };
  personas.forEach((m, i) => refs.M.set(`M${i + 1}`, m.email));
  const refDeEmail = (e: string | null) => (e ? ([...refs.M.entries()].find(([, v]) => v === e)?.[0] ?? null) : null);
  const { por, lapidas } = await candidatasPara(personas.map((m) => m.email), l.equipo, clienteDeLaReunion, ahora);
  const unicas = new Map<string, Candidata>();
  for (const m of personas) for (const c of (por.get(m.email) ?? []).slice(0, CANDIDATAS_POR_DUENO)) unicas.set(c.id, c);
  const candidatas = [...unicas.values()];
  candidatas.forEach((c, i) => refs.T.set(`T${i + 1}`, c.id));
  const proyectos = await prisma.proyectoDeTareas.findMany({
    where: {
      espacio: { equipo: l.equipo },
      OR: [{ estado: { in: ["activo", "propuesta"] } }, { estado: "descartado", decididaAt: { gte: new Date(+ahora - DIAS_DE_LAPIDA * 86_400_000) } }],
    },
    select: { id: true, nombre: true, estado: true },
    take: 10,
  });
  proyectos.forEach((p, i) => refs.R.set(`R${i + 1}`, p.id));
  // Lo que ya salió de esta reunión (de las notas o de una lectura anterior): no se repite. Se compara el título y el
  // detalle de la línea («[Lidia] Banner: Diseñar el banner de SAP» → «Banner» y «Diseñar el banner de SAP»).
  const salidas = await prisma.tarea.findMany({ where: { lecturaId: l.id }, select: { titulo: true, cita: true }, take: 100 });
  const sinCorchete = (cita: string) => cita.replace(/^\s*\[[^\]]*\]\s*/, "").trim();
  const yaSalieron = salidas.map((t) => (t.cita ? sinCorchete(t.cita) : t.titulo));
  const huellasQueYaSalieron = new Set(
    salidas.flatMap((t) => {
      const linea = t.cita ? sinCorchete(t.cita) : "";
      const detalle = linea.includes(":") ? linea.slice(linea.indexOf(":") + 1) : linea;
      return [t.titulo, detalle].map((x) => huellaDeTexto(x.replace(/[.;]+\s*$/, ""))).filter(Boolean);
    }),
  );

  const pedido = pedidoDeConversacion({
    titulo: reunion.titulo,
    fecha: diaCortoConSemana(horaDeCostaRica(reunion.inicio).fecha),
    conversacion: conversacionComoTexto(conversacion.turnos),
    turnos: conversacion.turnos.length,
    recortada: conversacion.recortada,
    personas: personas.map((m) => ({ ref: refDeEmail(m.email)!, nombre: m.nombre, equipo: nombreDelEquipo(claveDeEquipo(m.area, m.email)) })),
    candidatas: candidatas.map((c) => ({ ref: [...refs.T.entries()].find(([, v]) => v === c.id)![0], titulo: c.titulo, dueno: refDeEmail(c.responsableEmail), estado: c.estado })),
    proyectos: proyectos.map((p) => ({ ref: [...refs.R.entries()].find(([, v]) => v === p.id)![0], nombre: p.nombre, estado: p.estado })),
    yaSalieron,
  });

  // La llamada. Lo automático no tiene persona detrás: se cobra al presupuesto del sistema.
  const run = await prisma.agentRun.create({
    data: {
      agentSlug: SLUG_DE_LA_CONVERSACION,
      status: "RUNNING",
      triggeredByEmail: pedidaPorEmail,
      clientId: reunion.duenoClienteId ?? null,
      sourceSessionIds: [reunion.id],
      stepLabel: "Leer la conversación de una reunión para tareas",
      currentPhase: "Leyendo la conversación",
    },
    select: { id: true },
  });
  let salida: SalidaDeLaConversacion | null = null;
  let costo: ConversacionDeLaLectura["costo"] = null;
  let motivo: ConversacionDeLaLectura["motivo"] = "salida_invalida";
  try {
    const respuesta = await conContextoDeIA(
      { agentSlug: SLUG_DE_LA_CONVERSACION, agentRunId: run.id, triggeredByEmail: pedidaPorEmail, origen: "tareas/conversacion" },
      () => getAnthropic().messages.create(pedido, { timeout: SEGUNDOS_DE_LA_CONVERSACION * 1_000, maxRetries: 0 }),
    );
    salida = leerSalidaDeConversacion(respuesta, {
      M: new Set(refs.M.keys()),
      T: new Set(refs.T.keys()),
      R: new Set(refs.R.keys()),
      turnos: conversacion.turnos.length,
      yaSalieron: huellasQueYaSalieron,
    });
    costo = { entrada: respuesta.usage.input_tokens, salida: respuesta.usage.output_tokens };
    // ⛔ Sin el contexto de cada tarea: es texto de la reunión y la corrida no tiene su regla.
    const sinContexto = JSON.stringify(respuesta.content, (clave, valor) => (clave === "contexto" ? undefined : valor));
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: salida ? "DONE" : "ERROR", output: sinContexto.slice(0, 20_000), currentPhase: null } });
  } catch (e) {
    motivo = "error";
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "ERROR", output: (e instanceof Error ? e.message : String(e)).slice(0, 2_000), currentPhase: null } });
  }

  const base = { como, pedidaPorEmail, turnos: conversacion.turnos.length, recortada: conversacion.recortada, costo };
  if (!salida) {
    const conv: ConversacionDeLaLectura = { ...CONVERSACION_VACIA, ...base, estado: "sin_ia", motivo };
    await guardarConversacion(prisma, l.id, conv, automatica ? { ...automatica.datos, estado: "sin_ia" } : {}, automatica?.base);
    return conv;
  }

  // En una reunión interna, el cliente que nombra cada tarea (sugerencia, como en el nivel 1).
  const clientesPorTarea = clienteDeLaReunion
    ? new Map<string, ClientesDeUnTexto>()
    : await clientesDeLasLineas(
        salida.tareas.map((t) => ({ id: claveDeTareaDeConversacion(t.titulo), personas: [], titulo: t.titulo, detalle: null, texto: t.titulo })),
        clientes,
      );
  const armado = armarPropuestasDeLaConversacion(
    salida,
    conversacion.turnos,
    {
      lectura: { id: l.id, equipo: l.equipo, semana: l.semana, pedidaPorEmail: pedidaPorEmail ?? l.pedidaPorEmail, inicio: reunion.inicio, enElSprint: l.enElSprint },
      miembros: ctx.miembros,
      clienteDeLaReunion,
      clientesPorTarea,
      candidatasPorDueno: por,
      lapidas,
    },
    refs,
  );

  const espacio = await asegurarEspacio(prisma, l.equipo);
  const conv = await prisma.$transaction(
    async (tx) => {
      const proyectosEscritos: ConversacionDeLaLectura["proyectos"] = [];
      const proyectoDeLinea = new Map<string, string>();
      for (const g of armado.grupos) {
        if (g.mismoQue) {
          for (const p of armado.propuestas) if (g.lineas.includes(p.lineaId)) p.sugerido = { ...p.sugerido, proyectoSugeridoId: g.mismoQue };
          continue;
        }
        const citas = armado.propuestas.filter((p) => g.lineas.includes(p.lineaId)).map((p) => p.cita).join("\n");
        // `c` delante: el G1 de la conversación no es el G1 de las notas de la misma lectura.
        const proy = await escribirProyectoSugerido(tx, { id: l.id, sessionId: reunion.id }, espacio.id, { clave: `c${g.clave}`, nombre: g.nombre, cita: citas, clientId: clienteDeLaReunion });
        if (!proy) continue;
        proyectosEscritos.push({ id: proy.id, nombre: g.nombre, nuevo: proy.nuevo });
        for (const lineaId of g.lineas) proyectoDeLinea.set(lineaId, proy.id);
      }
      const propuestas = armado.propuestas.map((p) => ({ ...p, proyectoId: proyectoDeLinea.get(p.lineaId) ?? null }));
      const escritas = await escribirPropuestasDeLectura(tx, { id: l.id, sessionId: reunion.id, tituloReunion: reunion.titulo, pedidaPorEmail: pedidaPorEmail ?? l.pedidaPorEmail }, propuestas);
      const porPersona = new Map<string, number>();
      for (const c of escritas.creadas) if (c.responsableEmail) porPersona.set(c.responsableEmail, (porPersona.get(c.responsableEmail) ?? 0) + 1);
      const lista: ConversacionDeLaLectura = {
        ...base,
        estado: "lista",
        propuestas: escritas.creadas.filter((c) => c.responsableEmail).length,
        porAsignar: escritas.creadas.filter((c) => !c.responsableEmail).length,
        yaEstaban: escritas.yaEstaban,
        sumadas: escritas.sumadas,
        omitidas: armado.omitidas,
        proyectos: proyectosEscritos,
        porPersona: [...porPersona.entries()].map(([email, n]) => ({ email, nombre: ctx.miembros.find((m) => m.email === email)?.nombre ?? email, propuestas: n })),
        sinLugar: totalSinLugar(escritas.sinLugar),
      };
      await guardarConversacion(tx, l.id, lista, automatica ? { ...automatica.datos, estado: "lista", agentRunId: run.id } : {}, automatica?.base);
      return lista;
    },
    { timeout: 30_000, maxWait: 10_000 },
  );

  await avisarDeLasPropuestas({ id: l.id, equipo: l.equipo, avisar: l.avisar, pedidaPorEmail }, reunion, ctx, conv, ":conversacion");
  return conv;
}

/** El estado de una lectura para la pantalla: solo quien la pidió o quien puede leer esa reunión. */
export async function estadoDeLectura(ctx: ContextoDeTareas, clientes: ClientesQueVes, id: string, ahora = new Date()) {
  const l = await prisma.lecturaDeReunion.findUnique({ where: { id }, select: { id: true, estado: true, sessionId: true, pedidaPorEmail: true, resumen: true, error: true, rol: true, equipo: true, semana: true, copiaDeId: true, modo: true, leyendoDesde: true } });
  if (!l) throw new ErrorDeTareas(404, "Esa lectura no existe.");
  const [r] = l.sessionId ? await getReunionesParaTareas({ quien: quienLee(ctx, clientes), ids: [l.sessionId] }) : [];
  if (!r && l.pedidaPorEmail !== ctx.email && !ctx.esSuperAdmin) throw new ErrorDeTareas(404, "Esa lectura no existe.");
  const resumen = (l.resumen ?? null) as ResumenDeLectura | null;
  const conv = resumen?.conversacion ?? null;
  // «¿Faltó algo?»: con la reunión leída, con conversación grabada, sin leerla todavía (o si falló), y si la puedes leer.
  const hayConversacion = !!r && r.largoTranscript >= MIN_CARACTERES_DE_CONVERSACION;
  const colgada = conv?.estado === "leyendo" && (!l.leyendoDesde || +ahora - +l.leyendoDesde > MINUTOS_PARA_DAR_POR_COLGADA * 60_000);
  // La lectura de seguimiento ya leyó la conversación entera: no se ofrece otra vez.
  const deLaLecturaDeSeguimiento = l.modo === "seguimiento" && l.estado === "lista";
  const puede =
    hayConversacion && !deLaLecturaDeSeguimiento && ["lista", "sin_ia", "sin_texto"].includes(l.estado) && conv?.estado !== "lista" && conv?.motivo !== "sin_turnos" && (conv?.estado !== "leyendo" || colgada);
  const lecturaColgada = estaColgada(l, ahora);
  return {
    conversacion: {
      estado: colgada ? "error" : (conv?.estado ?? null),
      motivo: colgada ? "error" : (conv?.motivo ?? null),
      puede,
      costoEstimado: hayConversacion ? costoEstimadoDeLaConversacion(r.largoTranscript) : null,
    },
    id: l.id,
    estado: lecturaColgada ? "error" : l.estado,
    rol: l.rol,
    equipo: l.equipo,
    semana: comoFecha(l.semana),
    copiaDeId: l.copiaDeId,
    modo: l.modo,
    error: l.estado === "error" || lecturaColgada ? "No se pudo leer la reunión. Prueba de nuevo." : null,
    resumen: (l.resumen ?? null) as ResumenDeLectura | null,
  };
}

/** Para la lista de «Leer una reunión»: si cada reunión ya se leyó. */
export async function lecturasDeReuniones(ids: readonly string[]) {
  if (!ids.length) return new Map<string, { id: string; estado: string }>();
  const filas = await prisma.lecturaDeReunion.findMany({ where: { sessionId: { in: [...ids] } }, select: { id: true, estado: true, sessionId: true, leyendoDesde: true } });
  const ahora = new Date();
  return new Map(filas.map((f) => [f.sessionId!, { id: f.id, estado: estaColgada(f, ahora) ? "error" : f.estado }]));
}

/* ── La lectura de SEGUIMIENTO de una reunión (memoria de la cuenta, etapa 2) ──────────────────────
 *
 * Una fila, una pasada, dos salidas: la lectura de seguimiento (lib/sessions/post-process.ts) lee cada reunión con un
 * cliente o un prospecto y deja sus compromisos como propuestas de Tarea. Su cola es la MISMA `LecturaDeReunion`; su
 * estado vive en las columnas `seguimiento*`, que escribe lib/lecturas/cola.ts. Lo de Tareas —las propuestas, `estado`,
 * `resumen`— se escribe acá y en mutaciones.ts, como siempre (la guarda del único escritor). */

/** La reunión por el chokepoint, vista por el sistema (ve todas): para los avisos y el título de la reunión. */
async function reunionVistaPorElSistema(sessionId: string): Promise<ReunionParaTareas | null> {
  const dueno = (await duenosDeReuniones([sessionId])).get(sessionId)?.clientId ?? null;
  const cliente = dueno ? await prisma.client.findUnique({ where: { id: dueno }, select: { id: true, name: true, kind: true } }) : null;
  const porId = new Map(cliente ? [[cliente.id, { kind: cliente.kind as string, nombre: cliente.name }]] : []);
  const [r] = await getReunionesParaTareas({ quien: { email: "sistema", esSuperAdmin: true, clientes: { todos: true, ids: new Set(porId.keys()), porId } }, ids: [sessionId] });
  return r ?? null;
}

/** Saca las que repiten una lápida (una propuesta igual que una persona rechazó hace menos de 28 días). */
async function sinLasLapidas(propuestas: readonly PropuestaDeLectura[], ahora: Date): Promise<{ propuestas: PropuestaDeLectura[]; omitidas: number }> {
  const huellas = [...new Set(propuestas.map((p) => huellaDeTexto(p.titulo)))];
  if (!huellas.length) return { propuestas: [...propuestas], omitidas: 0 };
  const filas = await prisma.tarea.findMany({
    where: { estado: { in: ["rechazada", "fusionada"] }, decididaAt: { gte: new Date(+ahora - DIAS_DE_LAPIDA * 86_400_000) }, huella: { in: huellas } },
    select: { huella: true, responsableEmail: true, clientId: true, estado: true, decision: true, decididaPorEmail: true },
  });
  const lapidas = new Set(filas.filter(esLapida).map((f) => `${f.huella}|${f.responsableEmail ?? ""}|${f.clientId ?? ""}`));
  const quedan = propuestas.filter((p) => !lapidas.has(`${huellaDeTexto(p.titulo)}|${p.porAsignar ? "" : (p.responsableEmail ?? "")}|${p.clientId ?? ""}`));
  return { propuestas: quedan, omitidas: propuestas.length - quedan.length };
}

export interface SalidaDeSeguimientoEscrita {
  propuestas: number;
  porAsignar: number;
  yaEstaban: number;
  sumadas: number;
  omitidas: { lapida: number };
}

/**
 * Escribe la salida de TAREAS de la lectura de seguimiento: las propuestas (por `escribirPropuestasDeLectura`, el único
 * escritor) y, si la fila la creó el seguimiento y Tareas no la leyó (`estado = en_espera`), su `estado` y su resumen
 * («La leyó el seguimiento de la reunión»). Si Tareas ya la leyó o la está leyendo, no toca ni su estado ni su resumen.
 * Después, UN aviso por persona (sufijo `:seguimiento`, aparte del de las notas). Releer no duplica: el `origenId` es
 * `l:<lectura>:<lineaId>`.
 */
export async function escribirSalidaDeSeguimiento(
  lecturaId: string,
  reunionId: string,
  propuestas: readonly PropuestaDeLectura[],
  ahora = new Date(),
  extra: { lineas?: number; costo?: ResumenDeLectura["costo"] } = {},
): Promise<SalidaDeSeguimientoEscrita> {
  const l = await prisma.lecturaDeReunion.findUnique({ where: { id: lecturaId }, select: { id: true, sessionId: true, equipo: true, avisar: true } });
  if (!l || l.sessionId !== reunionId) throw new Error("La lectura de seguimiento no es de esa reunión.");
  const reunion = await reunionVistaPorElSistema(reunionId);
  if (!reunion) throw new Error("La reunión ya no se puede leer.");
  const { propuestas: quedan, omitidas } = await sinLasLapidas(propuestas, ahora);
  const miembros = await miembrosActivos();

  const resultado = await prisma.$transaction(
    async (tx) => {
      const escritas = await escribirPropuestasDeLectura(tx, { id: l.id, sessionId: reunionId, tituloReunion: reunion.titulo, pedidaPorEmail: null }, quedan);
      const porPersona = new Map<string, number>();
      for (const c of escritas.creadas) if (c.responsableEmail) porPersona.set(c.responsableEmail, (porPersona.get(c.responsableEmail) ?? 0) + 1);
      // Lo por asignar, por sprint: lo del cliente queda en Customer Success o en Ventas, no en el de la lectura. (Al
      // releer, el aviso no se repite: su dedupeKey es el mismo.)
      const sinResponsable = escritas.creadas.filter((c) => !c.responsableEmail).length;
      const porAsignarPorEquipo = new Map<string, number>();
      if (sinResponsable > 0) for (const p of quedan) if (p.porAsignar) porAsignarPorEquipo.set(p.equipo, (porAsignarPorEquipo.get(p.equipo) ?? 0) + 1);
      const resumen: ResumenDeLectura = {
        lineas: extra.lineas ?? propuestas.length,
        propuestas: escritas.creadas.filter((c) => c.responsableEmail).length,
        porAsignar: sinResponsable,
        yaEstaban: escritas.yaEstaban,
        sumadas: escritas.sumadas,
        omitidas: { lapida: omitidas },
        proyectos: [],
        porPersona: [...porPersona.entries()].map(([email, n]) => ({ email, nombre: miembros.find((m) => m.email === email)?.nombre ?? email, propuestas: n })),
        cierres: 0,
        sinLugar: totalSinLugar(escritas.sinLugar),
        modelo: "seguimiento",
        motivosDelModelo: [],
        costo: extra.costo ?? null,
      };
      // La salida de Tareas, solo si la fila esperaba al seguimiento (la creó él y nadie la pidió para tareas).
      await tx.lecturaDeReunion.updateMany({
        where: { id: l.id, estado: "en_espera", pedidaPorEmail: null },
        data: { estado: "lista", modo: "seguimiento", resumen: resumen as unknown as Prisma.InputJsonValue, leidaAt: ahora, leyendoDesde: null },
      });
      return { resumen, porAsignarPorEquipo };
    },
    { timeout: 30_000, maxWait: 10_000 },
  );

  await avisarDeLasPropuestas({ id: l.id, equipo: l.equipo, avisar: l.avisar, pedidaPorEmail: null }, reunion, { miembros }, resultado.resumen, ":seguimiento", resultado.porAsignarPorEquipo);
  return {
    propuestas: resultado.resumen.propuestas,
    porAsignar: resultado.resumen.porAsignar,
    yaEstaban: resultado.resumen.yaEstaban,
    sumadas: resultado.resumen.sumadas,
    omitidas: resultado.resumen.omitidas,
  };
}

/**
 * La lectura de seguimiento terminó SIN escribir su salida (no había texto, la reunión dejó de ser de un cliente, o
 * falló tres veces). Si la fila la creó el seguimiento y Tareas no la leyó, se suelta para Tareas: con `sin_texto`,
 * `pedirLectura` la vuelve a tomar si la reunión trae «Próximos pasos»; con `error`, la deja reintentar. Una fila que
 * Tareas ya leyó (o pidió) no se toca.
 */
export async function soltarLaFilaDelSeguimiento(lecturaId: string, motivo: "sin_texto" | "error", ahora = new Date()): Promise<void> {
  await prisma.lecturaDeReunion.updateMany({
    where: { id: lecturaId, estado: "en_espera", pedidaPorEmail: null },
    data:
      motivo === "error"
        ? { estado: "error", error: "La lectura de seguimiento de esta reunión falló: se puede leer para tareas.", leyendoDesde: null }
        : { estado: "sin_texto", modo: "seguimiento", leidaAt: ahora, leyendoDesde: null },
  });
}

/**
 * Crea la fila de la cola de la lectura de seguimiento de una reunión que todavía no tiene una (lib/lecturas/cola.ts).
 * La fila es de Tareas, así que la crea este archivo, con lo que Tareas exige y con valores que significan algo: el
 * equipo de la mayoría (o `cs`), el rol `planning` (una reunión de cliente propone, no cierra), la semana de la reunión
 * y el estado de Tareas `en_espera` hasta que el seguimiento termina (o `copia` si es la gemela de otra). El estado
 * inicial del seguimiento lo decide la cola; después, la cola solo escribe las columnas `seguimiento*`.
 * Lanza P2002 si otro la creó primero: quien llama lo atrapa y relee.
 *
 * (Los títulos que la lectura de seguimiento manda como «YA SON TAREAS» salen de la puerta de los agentes,
 * lib/tareas/para-agentes.ts, no de acá.)
 */
export async function crearFilaDelSeguimiento(
  reunion: ReunionParaTareas,
  o: { gemelaId: string | null; seguimiento: "en_espera" | "leyendo"; ahora: Date },
): Promise<{ id: string }> {
  const miembros = await miembrosActivos();
  const copia = !!o.gemelaId;
  return prisma.lecturaDeReunion.create({
    data: {
      sessionId: reunion.id,
      huellaTexto: reunion.huellaTexto,
      copiaDeId: o.gemelaId,
      equipo: equipoDeLaMayoria(reunion.participantes, miembros) ?? "cs",
      rol: "planning",
      semana: aDate(semanaDeLaReunion(reunion.inicio)),
      semanaQueCierra: null,
      estado: copia ? "copia" : "en_espera",
      avisar: +o.ahora - +reunion.inicio <= DIAS_PARA_AVISAR_UNA_LECTURA * 86_400_000,
      pedidaPorEmail: null,
      ...(copia ? { leidaAt: o.ahora, resumen: { copiaDe: o.gemelaId } as Prisma.InputJsonValue } : {}),
      seguimientoEstado: copia ? "copia" : o.seguimiento,
      seguimientoDesde: copia ? null : o.ahora,
      seguimientoLeidaAt: copia ? o.ahora : null,
    },
    select: { id: true },
  });
}

export type { ReunionParaTareas };
export { urlDeLaTarea };
