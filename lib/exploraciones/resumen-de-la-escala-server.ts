/**
 * lib/exploraciones/resumen-de-la-escala-server.ts — el agente que arma el RESUMEN de la escala que ve el cliente (Elías,
 * 9 nov; ./resumen-de-la-escala.ts). SERVIDOR.
 *
 * Una llamada (`MODELO_DEL_RESUMEN`) con:
 *   - lo que ya sale en la página (`resultadosDeLaEscala`, las áreas que ve el cliente): niveles, capas, lo que más frena;
 *   - las TRANSCRIPCIONES de las reuniones de las sesiones de la preventa, numeradas por turno. ⛔ Invariante 1: salen de
 *     `transcripcionesDeLaExploracion`, que pasa por el chokepoint (`getClientSessions` de SU empresa), y la duración se
 *     lee con `whereBelongsToClient`;
 *   - quién habló de cada lado (`quienHabloEnLasReuniones`): una cifra la tiene que haber dicho alguien de la empresa;
 *   - el contexto por equipo que escribió el equipo de Smarteam y las instrucciones del vendedor.
 * Todo lo que devuelve pasa por `leerElResumen` (cada cifra con su cita verificada). Si no devolvió nada legible, se pide
 * una vez más. Se guarda en `contenido.resumenDeLaEscala` sin pisar lo editado a mano (`juntarConLoEditado`) y sin subir
 * la versión. Trazabilidad: `AgentRun` + el medidor de gasto (`conContextoDeIA`).
 *
 * Quién lo llama: solo `POST /api/sales/exploraciones/[id]/escala/resumen` («Armar el Resumen» / «Rehacer con IA»). No se
 * arma solo al crear el «Acceso» (revisión del 9 nov): lo que lee la dirección del cliente lo mira antes una persona.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { getAnthropic } from "@/lib/anthropic";
import { humanizeAgentError } from "@/lib/agents/anthropic-error";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { quienHabloEnLasReuniones } from "@/lib/analizador-venta/analizar-server";
import { conversacionDelAnalisis } from "@/lib/analizador-venta/conversacion";
import { paraComparar } from "@/lib/analizador-venta/analisis";
import { prisma } from "@/lib/db/prisma";
import { aplicarEdicion } from "@/lib/escala/documento/edicion";
import type { Escala, Letra } from "@/lib/escala/documento/tipos";
import { LETRAS } from "@/lib/escala/documento/tipos";
import { SENTINEL_SERVICE_TYPE } from "@/lib/projects/kind";
import { whereBelongsToClient } from "@/lib/sessions/project-sources";
import { dominiosDeLaCasa } from "@/lib/sessions/reuniones-para-seguimiento";
import { DOMINIOS_GENERICOS } from "./agendadas";
import { AGENTE_DE_LA_EXPLORACION, nombresDelEquipo } from "./agente";
import type { EstadoDeExploracion } from "./contenido";
import { contextoDelEquipo, firmaDelArea } from "./descripcion-de-la-escala";
import { EQUIPOS, type ClaveDeEquipo } from "./equipos";
import { areasDeLaPagina, resultadosDeLaEscala, type ResultadoDeUnArea } from "./escala-para-el-cliente";
import { leerContenido } from "./esquemas";
import { reunionesDeLaExploracion, transcripcionesDeLaExploracion } from "./fuentes";
import { leerLoLeido } from "./lo-leido";
import { bloqueDeInstrucciones } from "./notas-de-sesion";
import {
  conIdsDeLaCorrida,
  delClienteDe,
  esDeOtraEmpresa,
  guiaDelEquipo,
  NO_ES_UNA_PERSONA,
  escribirElResumen,
  juntarConLoEditado,
  minutosDeLaReunion,
  MODELO_DEL_RESUMEN,
  resumenParaLaPagina,
  reunionesQueLee,
  type AreaParaElResumen,
  type ContextoDelResumen,
  type ResumenDeLaPagina,
  type ResumenGuardado,
  type ReunionParaElResumen,
  type SesionHecha,
} from "./resumen-de-la-escala";
import { bloquearFila, escalaDeLaExploracion, escalaParaExplorar, estadoDesdeFila, leerExploracion, type FilaDeExploracion } from "./servidor";

/** Cuántas reuniones lee como mucho (las más recientes de las sesiones) y cuánto texto entre todas. */
const MAX_REUNIONES = 8;
const TOPE_DE_TODAS = 320_000;
const TOPE_DE_UNA = 120_000;
/** Quien dijo menos que esto en una reunión no cuenta como «persona de tu equipo» (un saludo, un «sí»). */
const PALABRAS_DE_QUIEN_PARTICIPO = 40;

export type ResultadoDelResumen =
  | { ok: true; resumen: ResumenDeLaPagina; descartados: string[]; segundos: number; uso: { entrada: number; salida: number } }
  | { ok: false; status: number; error: string };

type Lectura =
  | { ok: true; fila: FilaDeExploracion; escala: Escala; estado: EstadoDeExploracion; deLasAreas: ResultadoDeUnArea[] }
  | { ok: false; status: number; error: string };

/** La exploración y las áreas que ve el cliente. Mismas puertas que la descripción: la de un proyecto no se comparte. */
async function leer(exploracionId: string): Promise<Lectura> {
  const lectura = await leerExploracion(exploracionId);
  if (lectura.estado !== "ok") return { ok: false, status: lectura.estado === "no-existe" ? 404 : 503, error: "Esa exploración no existe." };
  const fila = lectura.fila;
  if (fila.projectId) {
    const p = await prisma.project.findUnique({ where: { id: fila.projectId }, select: { clientId: true, serviceType: true } });
    if (p?.clientId !== fila.clientId || p.serviceType !== SENTINEL_SERVICE_TYPE) return { ok: false, status: 409, error: "La exploración de un proyecto no se comparte con el cliente." };
  }
  const vig = await escalaParaExplorar();
  if (vig.estado !== "ok") return { ok: false, status: 503, error: "La escala no está publicada en Nexus." };
  const estado = estadoDesdeFila(fila);
  const escala = aplicarEdicion(vig.general, estado.edicion);
  const lienzo = escalaDeLaExploracion(vig.general, estado);
  return { ok: true, fila, escala, estado, deLasAreas: resultadosDeLaEscala(escala, lienzo, estado, areasDeLaPagina(lienzo, estado)) };
}

const entornoDe = (f: Pick<FilaDeExploracion, "edicion" | "perfilCierre" | "perfilDespues">, escala: Pick<Escala, "version">) => ({
  edicion: f.edicion,
  perfilCierre: f.perfilCierre,
  perfilDespues: f.perfilDespues,
  escalaVersion: escala.version,
});

/** Lo que el agente sabe de un área de la página: niveles por nombre, sus vecinos y lo que más la frena. */
function areaParaElResumen(escala: Escala, x: ResultadoDeUnArea, contexto: string | null): AreaParaElResumen {
  const r = x.resultado;
  const nombre = (l: Letra | null | undefined) => (l ? (escala.niveles.find((n) => n.letra === l)?.nombre ?? l) : null);
  const i = r.nivel ? LETRAS.indexOf(r.nivel) : -1;
  const capa = (c: string) => r.capas.find((k) => k.clave === c)?.nombre ?? c;
  return {
    id: r.areaId,
    nombre: r.areaNombre,
    nivel: nombre(r.nivel),
    arriba: i >= 0 ? nombre(LETRAS[i + 1]) : null,
    abajo: i > 0 ? nombre(LETRAS[i - 1]) : null,
    loQueMasFrena: r.recomendacion?.tipo === "trabajar" ? r.recomendacion.dimensionNombre : null,
    dimensiones: r.dimensiones.map((d) => ({ id: d.id, nombre: d.nombre, capa: capa(d.capa), nivel: d.preguntada ? nombre(d.nivel) : null, porExplorar: x.porExplorar.includes(d.id) })),
    contexto,
  };
}

interface LoQueLee {
  ctx: ContextoDelResumen;
  hicimos: ResumenGuardado["hicimos"];
  personas: string[];
  firmas: Record<string, string>;
  /** Los equipos de la escala que el cliente no ve: no se leen sus reuniones ni se habla de ellos. */
  areasFuera: string[];
}

/**
 * Lo que lee el agente: las reuniones de las sesiones (con texto y numeradas), «Lo que hicimos» y las reglas. Exportado
 * para el simulacro (scripts/simular-resumen-de-la-escala.ts), que no guarda nada.
 */
export async function loQueLeeElResumen(l: Extract<Lectura, { ok: true }>, ahora = new Date()): Promise<LoQueLee> {
  const { fila, estado, escala } = l;
  const deLaFila = {
    exploracionId: fila.id,
    clientId: fila.clientId,
    projectId: fila.projectId,
    creadaEn: fila.createdAt,
    propuesta: estado.propuesta,
    leido: leerLoLeido(fila.test),
    sesiones: estado.contenido.sesiones,
    fuera: estado.contenido.fuera,
    elegidas: estado.contenido.reunionesElegidas,
  };
  // ⛔ Invariante 1: las dos pasan por el chokepoint de sesiones de ESTA empresa.
  const [conTexto, todas] = await Promise.all([
    transcripcionesDeLaExploracion(deLaFila, { cuantas: MAX_REUNIONES, caracteres: TOPE_DE_UNA * 2 }, ahora),
    reunionesDeLaExploracion(deLaFila, ahora),
  ]);
  const fuera = new Set(estado.contenido.fuera ?? []);
  /* Una sesión es una reunión que pasó y en la que se conversó: no un documento subido a mano, ni una de Meet sin texto
     o cortada (revisión del 9 nov: un PDF contaba como sesión y una reunión vacía sumaba la hora del evento). */
  const hechas = todas.filter(
    (r) =>
      !r.legado &&
      !r.puertasAdentro &&
      !fuera.has(`${r.origen}:${r.id}`) &&
      Date.parse(r.fecha) <= ahora.getTime() &&
      (r.origen === "hubspot" || (r.origen === "meet" && r.texto !== "nada" && !r.corta)),
  );
  const idsDeMeet = hechas.filter((r) => r.origen === "meet").map((r) => r.id);
  const [filas, quien, equipo, cliente, casa] = await Promise.all([
    idsDeMeet.length
      ? prisma.firefliesSession.findMany({
          where: { ...whereBelongsToClient(fila.clientId), id: { in: idsDeMeet }, date: { lte: ahora } },
          select: { id: true, duration: true, conferenciaInicio: true, conferenciaFin: true, transcript: true, participants: true },
        })
      : Promise.resolve([]),
    quienHabloEnLasReuniones(conTexto.sesiones),
    nombresDelEquipo(),
    prisma.client.findUnique({ where: { id: fila.clientId }, select: { emailDomains: true } }),
    dominiosDeLaCasa(),
  ]);
  /* La gente de OTRA empresa (la de HubSpot en Centauro, 10 nov) no es «persona de tu equipo» ni dice cifras de la
     empresa: se reconoce por los correos de los invitados de cada reunión. */
  const correosDe = new Map(filas.map((f) => [f.id, f.participants ?? []]));
  const noCuentan = new Set([...casa, ...DOMINIOS_GENERICOS]);
  const deOtraEn = (id: string) => (nombre: string) => esDeOtraEmpresa(nombre, correosDe.get(id) ?? [], cliente?.emailDomains ?? [], noCuentan);
  /* Solo se cita una TRANSCRIPCIÓN: las notas de Gemini no dicen quién habló, y sus títulos («Pérdida de clientes: …») se
     leían como si fueran una persona de la empresa (revisión del 9 nov). */
  const conTranscripcion = new Set(filas.filter((f) => !!f.transcript?.trim()).map((f) => f.id));
  // Los equipos de la escala que el cliente no ve: sus reuniones no se leen y ningún texto habla de ellos.
  const vistas = new Set(l.deLasAreas.map((x) => x.resultado.areaId));
  const areasFuera = escala.areas.filter((a) => !vistas.has(a.id)).map((a) => a.nombre);
  const areaDelEquipo = (clave: ClaveDeEquipo | null | undefined) => (clave ? (EQUIPOS[clave]?.area ?? null) : null);
  const quienesDe = (id: string) =>
    quien
      .get(id)
      ?.personas.filter((p) => p.lado === "cliente" && p.palabras >= PALABRAS_DE_QUIEN_PARTICIPO && !NO_ES_UNA_PERSONA.test(p.nombre) && !deOtraEn(id)(p.nombre))
      .map((p) => paraComparar(p.nombre)) ?? [];

  // El equipo de cada reunión: el que le da la exploración a las que tienen texto; si no, el de la sesión a la que se unió.
  const equipoDeLaFuente = new Map(conTexto.reuniones.map((r, i) => [conTexto.sesiones[i], r.equipo ?? null]));
  const claveDelEquipo = (r: (typeof hechas)[number]): ClaveDeEquipo | null =>
    equipoDeLaFuente.get(r.id) ??
    estado.contenido.sesiones.find((s) => (s.reunion?.id === r.id && s.reunion.origen === r.origen) || (!!r.eventoId && s.evento?.id === r.eventoId))?.equipo ??
    null;
  const duracion = new Map(filas.map((f) => [f.id, minutosDeLaReunion(f)]));
  const sesiones: SesionHecha[] = hechas
    .map((r) => {
      const clave = claveDelEquipo(r);
      return {
        fecha: r.fecha,
        equipo: clave ? (EQUIPOS[clave]?.nombre ?? null) : null,
        minutos: r.origen === "meet" ? (duracion.get(r.id) ?? null) : null,
        areaId: areaDelEquipo(clave),
        quienes: r.origen === "meet" ? quienesDe(r.id) : [],
      };
    })
    .sort((a, b) => Date.parse(a.fecha) - Date.parse(b.fecha));

  // Las reuniones con turnos, de la más vieja a la más nueva, repartiendo el tope entre todas.
  const conTurnos = reunionesQueLee(
    conTexto.fuentes.map((f, i) => ({ id: conTexto.sesiones[i], equipo: conTexto.reuniones[i]?.equipo ?? null, areaId: areaDelEquipo(conTexto.reuniones[i]?.equipo), texto: f.texto })),
    conTranscripcion,
    vistas,
  );
  const tope = Math.min(TOPE_DE_UNA, Math.floor(TOPE_DE_TODAS / Math.max(1, conTurnos.length)));
  const fechas = new Map(hechas.map((r) => [r.id, r.fecha]));
  const reuniones: ReunionParaElResumen[] = [];
  for (const r of conTurnos) {
    const { turnos } = conversacionDelAnalisis(r.texto, tope);
    if (!turnos.length) continue;
    const q = quien.get(r.id);
    reuniones.push({
      id: r.id,
      clave: `R${reuniones.length + 1}`,
      fecha: fechas.get(r.id) ?? "",
      equipo: r.equipo ? (EQUIPOS[r.equipo]?.nombre ?? null) : null,
      turnos,
      delCliente: delClienteDe(q?.personas, deOtraEn(r.id)),
    });
  }

  const delCliente = new Set(sesiones.flatMap((x) => x.quienes ?? []));
  // Ningún nombre puede salir; salvo el de la empresa («Centauro» no es una persona aunque sea el nombre de la sala).
  const deLaEmpresa = new Set(paraComparar(fila.client.name).split(/\s+/));
  const personas = [...new Set([...equipo, ...[...quien.values()].flatMap((q) => q.personas.map((p) => p.nombre))])].filter(
    (n) => !deLaEmpresa.has(paraComparar(n.split(/\s+/)[0] ?? "")),
  );

  const ctx: ContextoDelResumen = {
    empresa: fila.client.name,
    areas: l.deLasAreas.map((x) => areaParaElResumen(escala, x, contextoDelEquipo(fila.contenido ?? {}, x.resultado.areaId))),
    reuniones,
    instrucciones: bloqueDeInstrucciones(estado.contenido.notas, "exploracion"),
    guia: guiaDelEquipo(estado.contenido.casillas as Record<string, unknown>),
  };
  const entorno = entornoDe(fila, escala);
  const firmas = Object.fromEntries(l.deLasAreas.map((x) => [x.resultado.areaId, firmaDelArea(estado.contenido.chequeo, x.resultado.areaId, entorno)]));
  return { ctx, hicimos: { sesiones, personas: delCliente.size, texto: null }, personas, firmas, areasFuera };
}

/** La exploración y lo que sale hoy en su página (para el simulacro). */
export async function leerParaElResumen(exploracionId: string): Promise<Lectura> {
  return leer(exploracionId);
}

/** El Resumen como lo ve la pantalla interna (con las citas) para la exploración, de las áreas que ve el cliente. */
function comoLoVeElCse(l: Extract<Lectura, { ok: true }>, guardado: ResumenGuardado | null | undefined): ResumenDeLaPagina {
  const vistas = new Set(l.deLasAreas.map((x) => x.resultado.areaId));
  const areasFuera = l.escala.areas.filter((a) => !vistas.has(a.id)).map((a) => a.nombre);
  return resumenParaLaPagina(guardado, l.deLasAreas.map((x) => x.resultado), l.estado.contenido.chequeo, entornoDe(l.fila, l.escala), {
    conCitas: true,
    areasFuera,
    porExplorar: Object.fromEntries(l.deLasAreas.map((x) => [x.resultado.areaId, x.porExplorar])),
  });
}

/** Arma (o rehace) el Resumen y lo guarda. */
export async function generarElResumenDeLaEscala(o: { exploracionId: string; email: string | null }): Promise<ResultadoDelResumen> {
  const t0 = Date.now();
  const l = await leer(o.exploracionId);
  if (!l.ok) return l;
  const { fila } = l;
  if (fila.archivadaEn) return { ok: false, status: 409, error: "La exploración está archivada: el agente ya no trabaja en ella." };
  if (!l.deLasAreas.length) return { ok: false, status: 409, error: "Todavía no hay equipos en la página del cliente: elige cuáles ve en «Acceso»." };

  const le = await loQueLeeElResumen(l);
  if (!le.ctx.reuniones.length) return { ok: false, status: 409, error: "Ninguna sesión de esta preventa tiene transcripción todavía: el Resumen sale de lo que se habló en ellas." };

  // Trazabilidad (ARCHITECTURE §6 regla 5). Sin `exploracionId` en los filtros a propósito: no es una corrida del lienzo.
  const run = await prisma.agentRun.create({
    data: {
      agentSlug: AGENTE_DE_LA_EXPLORACION,
      clientId: fila.clientId,
      projectId: fila.projectId,
      status: "RUNNING",
      stepLabel: "La escala: el Resumen para el cliente",
      currentPhase: "Leyendo las reuniones…",
      triggeredByEmail: o.email,
      sourceSessionIds: le.ctx.reuniones.map((r) => r.id),
      filters: { exploracion: o.exploracionId, modo: "resumen-de-la-escala", areas: le.ctx.areas.map((a) => a.id) } as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  const ia = { agentSlug: AGENTE_DE_LA_EXPLORACION, agentRunId: run.id, clientId: fila.clientId, triggeredByEmail: o.email, origen: "exploraciones/agente:resumen-de-la-escala" };
  try {
    const corrida = await escribirElResumen(le, (pedido) => conContextoDeIA(ia, () => getAnthropic().messages.create(pedido)));
    // Ids de esta corrida: una pantalla abierta con el Resumen de antes no puede tocar, por el id, otra pieza.
    const escrito = conIdsDeLaCorrida(corrida, Date.now().toString(36).slice(-4));
    const uso = { entrada: escrito.usos.reduce((s, u) => s + u.input_tokens, 0), salida: escrito.usos.reduce((s, u) => s + u.output_tokens, 0) };
    if (escrito.cortado) {
      // Un Resumen cortado o ilegible no pisa el que hay (revisión del 9 nov: se guardaba vacío y decía «Listo»).
      const error = "La IA no devolvió un Resumen completo. No se cambió nada: vuelve a intentarlo en un rato.";
      await prisma.agentRun.update({ where: { id: run.id }, data: { status: "ERROR", currentPhase: null, output: JSON.stringify({ error, descartados: escrito.descartados, uso }) } });
      return { ok: false, status: 502, error };
    }
    const nuevo: ResumenGuardado = {
      v: 2,
      at: new Date().toISOString(),
      por: o.email,
      modelo: MODELO_DEL_RESUMEN,
      agentRunId: run.id,
      hicimos: le.hicimos,
      datosRojos: [],
      areas: escrito.areas,
      entendimos: escrito.entendimos,
      falta: [],
      negocio: escrito.negocio,
      recorrido: escrito.recorrido,
      operativas: escrito.operativas,
      pendientes: escrito.pendientes,
    };
    const guardado = await guardar(o.exploracionId, nuevo);
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "DONE", currentPhase: null, output: JSON.stringify({ resumen: nuevo, descartados: escrito.descartados, uso }) },
    });
    // Sin volver a leer la exploración: los niveles son los de la lectura de arriba (si cambiaron mientras tanto, la
    // pantalla trae la página al día por su cuenta).
    return { ok: true, resumen: comoLoVeElCse(l, guardado), descartados: escrito.descartados, segundos: Math.round((Date.now() - t0) / 1000), uso };
  } catch (e) {
    const mensaje = humanizeAgentError(e);
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "ERROR", currentPhase: null, output: JSON.stringify({ error: mensaje }) } }).catch(() => {});
    console.error("[exploraciones/resumen-de-la-escala] falló", e);
    return { ok: false, status: 502, error: mensaje };
  }
}

/**
 * Guarda con la fila bloqueada y releída: lo nuevo junto con lo que una persona escribió (también lo que escribió mientras
 * el agente trabajaba) y sin lo que quitó. Conserva las claves del Json que esta versión no conoce.
 */
async function guardar(exploracionId: string, nuevo: ResumenGuardado): Promise<ResumenGuardado | null> {
  return prisma.$transaction(async (tx) => {
    await bloquearFila(tx, exploracionId);
    const f = await tx.exploracionDeVenta.findUnique({ where: { id: exploracionId }, select: { contenido: true, archivadaEn: true } });
    if (!f || f.archivadaEn) return null;
    const c = leerContenido(f.contenido);
    const resumenDeLaEscala = juntarConLoEditado(nuevo, c.resumenDeLaEscala);
    const crudo = f.contenido && typeof f.contenido === "object" && !Array.isArray(f.contenido) ? (f.contenido as Record<string, unknown>) : {};
    await tx.exploracionDeVenta.update({
      where: { id: exploracionId },
      data: { contenido: { ...crudo, ...c, resumenDeLaEscala } as unknown as Prisma.InputJsonValue },
    });
    return resumenDeLaEscala;
  });
}
