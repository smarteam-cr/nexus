/**
 * lib/exploraciones/resumen-de-la-escala-server.ts — el agente que arma el RESUMEN de la escala que ve el cliente (Elías,
 * 9 nov; ./resumen-de-la-escala.ts). SERVIDOR.
 *
 * Una llamada principal (`MODELO_DEL_RESUMEN`, con streaming desde el 24 nov) con:
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
 * Al rehacerlo, el de antes y el nuevo quedan en el historial de versiones (21 nov, ./versiones-del-resumen-server.ts):
 * «Usar esta versión» pone cualquiera otra vez.
 *
 * Quién lo llama: `POST /api/sales/exploraciones/[id]/escala/resumen` («Armar el Resumen» / «Rehacer con IA»), con
 * `lanzarElResumenDeLaEscala`: desde el 24 nov la corrida sigue en segundo plano y la pantalla la consulta por su fase
 * (`ultimaCorridaDelResumen`, ./corrida-del-resumen.ts). Cada llamada a la IA va con streaming y su tope
 * (lib/ai/llamada-con-tope.ts): una colgada falla en minutos, se intenta una vez más y, si no, la corrida dice por qué.
 * El simulacro con --guardar espera entero (`generarElResumenDeLaEscala`). No se arma solo al crear el «Acceso»
 * (revisión del 9 nov): lo que lee la dirección del cliente lo mira antes una persona.
 */
import "server-only";
import { partirDeLoQueYaSabemos } from "./posicionar";
import type Anthropic from "@anthropic-ai/sdk";
import type { Prisma } from "@prisma/client";
import { getAnthropic } from "@/lib/anthropic";
import { humanizeAgentError } from "@/lib/agents/anthropic-error";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { LlamadaSinRespuesta, llamarConTope } from "@/lib/ai/llamada-con-tope";
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
import {
  corridaDesdeLaFila,
  ERROR_SIN_RESPUESTA,
  FASES_DEL_RESUMEN,
  MINUTOS_SIN_LATIDO,
  TOPES_DEL_RESUMEN,
  type CorridaDelResumen,
  type CorridaTerminada,
  type FilaDeLaCorridaDelResumen,
} from "./corrida-del-resumen";
import { contextoDelEquipo, firmaDelArea } from "./descripcion-de-la-escala";
import { generarDescripcionesDeLaEscala } from "./descripcion-de-la-escala-server";
import { EQUIPOS, type ClaveDeEquipo } from "./equipos";
import { areasDeLaPagina, resultadosDeLaEscala, type ResultadoDeUnArea } from "./escala-para-el-cliente";
import { leerContenido } from "./esquemas";
import { reunionesDeLaExploracion, transcripcionesDeLaExploracion } from "./fuentes";
import { guardarAlRehacer } from "./versiones-del-resumen-server";
import { leerLoLeido } from "./lo-leido";
import { perdidaDeLaEscala, perdidaParaElAgente } from "./perdida-de-la-escala";
import { bloqueDeInstrucciones } from "./notas-de-sesion";
import { notasComoFuentes, reunionesDeVerdad } from "./notas-del-equipo";
import { nombresDeLosAutores } from "./posicionar-fuentes";
import {
  comoSeLeyo,
  conIdsDeLaCorrida,
  delClienteDe,
  esDeOtraEmpresa,
  esDeSmarteamPorElNombre,
  guiaDelEquipo,
  NO_ES_UNA_PERSONA,
  escribirElResumen,
  juntarConLoEditado,
  largoDeLosTurnos,
  loQueDijoLaEmpresa,
  minutosDeLaReunion,
  nombresDeQuienesDeciden,
  pesoDeLasSesiones,
  quienesDecidenDe,
  MAX_TOKENS_DEL_RESUMEN,
  MODELO_DEL_RESUMEN,
  resumenParaLaPagina,
  repartirElTope,
  reunionesQueLee,
  type AreaParaElResumen,
  type ContextoDelResumen,
  type ResumenDeLaPagina,
  type ResumenGuardado,
  type ReunionMalLeida,
  type ReunionParaElResumen,
  type SesionHecha,
} from "./resumen-de-la-escala";
import { bloquearFila, escalaDeLaExploracion, escalaParaExplorar, estadoDesdeFila, leerExploracion, type FilaDeExploracion } from "./servidor";

/** Cuántas reuniones lee como mucho (las más recientes de las sesiones) y cuánto texto entre todas. */
const MAX_REUNIONES = 8;
/** Cuántas reuniones se le guardan a cada equipo antes de llenar con las más nuevas (24 nov: todo se inclinaba a Ventas). */
const REUNIONES_POR_EQUIPO = 2;
/* 24 nov (Elías: «que se lean enteras»): de 400 a 700 mil, y de 120 a 250 mil por reunión. Con 400 mil, tres de las siete
   reuniones de Centauro se leían sin un pedazo del medio (86, 87 y 72 %). Enteras miden 454 mil: 177 mil tokens de entrada
   en vez de 157 mil, unos 0,06 USD más por armado (medido con count_tokens el 24 nov). El modelo lee hasta 1 millón de
   tokens; el tope queda solo contra lo anormal (una reunión de cinco horas): 700 mil son unos 250 mil tokens. Se eligió
   esto y no completar lo cortado con la lectura de la reunión (sus hechos): esa lectura trae de 3 a 10 hechos por reunión
   y lo cortado eran de 117 a 239 intervenciones. */
const TOPE_DE_TODAS = 700_000;
const TOPE_DE_UNA = 250_000;
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

/** Los equipos del cliente cuya área de la escala NO está en la página (con área: Dirección no tiene y no se excluye). */
function equiposQueNoVe(areasQueVe: readonly string[]): Set<ClaveDeEquipo> {
  return new Set((Object.keys(EQUIPOS) as ClaveDeEquipo[]).filter((k) => !!EQUIPOS[k].area && !areasQueVe.includes(EQUIPOS[k].area!)));
}

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
  /** Las reuniones que no se pudieron leer bien (18 nov): cortadas, o casi sin la voz de la empresa. */
  malLeidas: ReunionMalLeida[];
}

/**
 * Lo que lee el agente: las reuniones de las sesiones (con texto y numeradas), «Lo que hicimos» y las reglas. Exportado
 * para el simulacro (scripts/simular-resumen-de-la-escala.ts), que no guarda nada.
 */
export async function loQueLeeElResumen(l: Extract<Lectura, { ok: true }>, ahora = new Date(), o: { completas?: boolean } = {}): Promise<LoQueLee> {
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
    transcripcionesDeLaExploracion(
      deLaFila,
      // Sin lugar para los equipos que el cliente no ve: sus reuniones no se leen (revisión del 24 nov).
      { cuantas: MAX_REUNIONES, caracteres: TOPE_DE_UNA * 2, porEquipo: REUNIONES_POR_EQUIPO, sinLugar: equiposQueNoVe(l.deLasAreas.map((x) => x.resultado.areaId)) },
      ahora,
    ),
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
  /* Una sala de Meet con el nombre de alguien de Smarteam («Presentación de Marco Salas», Centauro 19 nov: Meet pone así a
     quien comparte pantalla) tampoco es de la empresa. En UN lugar (revisión del 24 nov): con esto decide quién es de la
     empresa en las citas, en los números que se rescatan, en lo ya resuelto y en «Quién es quién». */
  const salaDeSmarteam = (nombre: string) => esDeSmarteamPorElNombre(nombre, equipo);
  const deOtraEn = (id: string) => (nombre: string) => salaDeSmarteam(nombre) || esDeOtraEmpresa(nombre, correosDe.get(id) ?? [], cliente?.emailDomains ?? [], noCuentan);
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
  const sesionDe = (r: (typeof hechas)[number]) =>
    estado.contenido.sesiones.find((s) => (s.reunion?.id === r.id && s.reunion.origen === r.origen) || (!!r.eventoId && s.evento?.id === r.eventoId));
  const claveDelEquipo = (r: (typeof hechas)[number]): ClaveDeEquipo | null => equipoDeLaFuente.get(r.id) ?? sesionDe(r)?.equipo ?? null;
  /* Una reunión de trabajo (24 nov, la preventa de un cliente): la que la exploración marcó así al leerla, o la de una sesión
     marcada. Cuenta, pesa menos y «Lo que hicimos» la nombra aparte (D4). */
  const deTrabajoDeLaFuente = new Map(conTexto.reuniones.map((r, i) => [conTexto.sesiones[i], !!r.deTrabajo]));
  // La marca vale solo en la preventa de un cliente (posicionar.ts › `partirDeLoQueYaSabemos`); en otro lado se ignora.
  const conMarcas = !fila.projectId && partirDeLoQueYaSabemos(fila.client.kind);
  const esDeTrabajo = (r: (typeof hechas)[number]): boolean => conMarcas && (deTrabajoDeLaFuente.get(r.id) ?? !!sesionDe(r)?.deLoQueYaSabemos);
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
        ...(esDeTrabajo(r) ? { deTrabajo: true as const } : {}),
      };
    })
    .sort((a, b) => Date.parse(a.fecha) - Date.parse(b.fecha));

  // Las reuniones con turnos, de la más vieja a la más nueva, repartiendo el tope entre todas.
  const conTurnos = reunionesQueLee(
    conTexto.fuentes.map((f, i) => ({
      id: conTexto.sesiones[i],
      equipo: conTexto.reuniones[i]?.equipo ?? null,
      areaId: areaDelEquipo(conTexto.reuniones[i]?.equipo),
      texto: f.texto,
      deTrabajo: !!conTexto.reuniones[i]?.deTrabajo,
    })),
    conTranscripcion,
    vistas,
  );
  /* El tope se reparte justo (18 nov): si todas caben, ninguna se corta; si no, las cortas van enteras y lo que queda va a
     las largas (Cemaco: se cortaba el medio de las dos de cobranza aunque todo cabía). `completas`: sin recortar nada (la
     auditoría del simulacro relee cada cita en su turno). */
  const enteras = conTurnos.map((r) => conversacionDelAnalisis(r.texto, Number.POSITIVE_INFINITY).turnos);
  const largos = enteras.map(largoDeLosTurnos);
  const topes = o.completas ? largos.map(() => Number.MAX_SAFE_INTEGER) : repartirElTope(largos, TOPE_DE_TODAS, TOPE_DE_UNA);
  const fechas = new Map(hechas.map((r) => [r.id, r.fecha]));
  const titulos = new Map(hechas.map((r) => [r.id, r.titulo || null]));
  const reuniones: ReunionParaElResumen[] = [];
  const malLeidas: ReunionMalLeida[] = [];
  for (const [i, r] of conTurnos.entries()) {
    // Sin recorte, la conversación entera que ya se armó (no se vuelve a procesar la transcripción).
    const { turnos, omitidos } = topes[i] >= largos[i] ? { turnos: enteras[i], omitidos: null } : conversacionDelAnalisis(r.texto, topes[i]);
    if (!turnos.length) continue;
    const q = quien.get(r.id);
    const reunion: ReunionParaElResumen = {
      id: r.id,
      clave: `R${reuniones.length + 1}`,
      fecha: fechas.get(r.id) ?? "",
      equipo: r.equipo ? (EQUIPOS[r.equipo]?.nombre ?? null) : null,
      areaId: r.areaId,
      titulo: titulos.get(r.id) ?? null,
      minutos: duracion.get(r.id) ?? null,
      ...(omitidos ? { recortada: true } : {}),
      ...(r.deTrabajo ? { deTrabajo: true as const } : {}),
      turnos,
      delCliente: delClienteDe(q?.personas, deOtraEn(r.id)),
      // Solo lo de Smarteam sin corregir vale como cifra por confirmar: no lo de HubSpot ni lo de alguien sin identificar.
      deSmarteam: (q?.personas ?? []).filter((p) => p.lado === "smarteam").map((p) => p.nombre),
    };
    reuniones.push(reunion);
    // Cuánto de lo dicho es de la empresa, sobre la reunión entera (no sobre lo leído), con la regla de las citas.
    const mal = comoSeLeyo(reunion, { largo: largos[i], leido: largoDeLosTurnos(turnos), delCliente: loQueDijoLaEmpresa(enteras[i], reunion.delCliente) });
    if (mal) malLeidas.push(mal);
  }

  /* Lo que sabe el equipo (21 nov, notas-del-equipo.ts): cada nota de «Lo que sabes del cliente» como una fuente N1, N2…,
     después de las reuniones (así R1, R2… no cambian), con quién la escribió. Pesa más que una reunión. */
  const autores = estado.contenido.autoresDeLasNotas;
  reuniones.push(...notasComoFuentes(estado.contenido.notas, autores, await nombresDeLosAutores(autores)));

  const delCliente = new Set(sesiones.flatMap((x) => x.quienes ?? []));
  /* Ningún nombre puede salir; salvo el de la empresa («Centauro» no es una persona aunque sea el nombre de la sala), y los
     de su gente en «Quién es quién» (24 nov, Elías: el mapa de los equipos con nombres; nunca pegados a un dolor). */
  const deLaEmpresa = new Set(paraComparar(fila.client.name).split(/\s+/));
  // También quienes deciden (la casilla «Quién decide»): el agente los conoce por nombre y no pueden salir aunque no hablaran.
  const casillas = estado.contenido.casillas as Record<string, unknown>;
  const personas = [...new Set([...equipo, ...[...quien.values()].flatMap((q) => q.personas.map((p) => p.nombre)), ...nombresDeQuienesDeciden(casillas)])].filter(
    (n) => !deLaEmpresa.has(paraComparar(n.split(/\s+/)[0] ?? "")),
  );
  // La gente de la empresa: la que habló de su lado en las reuniones que se leen (sin el grabador ni otra empresa) y quien decide.
  /* Sin los dominios de correo de la empresa no se sabe quién es de afuera (Centauro, 10 nov: «Michael, de HubSpot» contaba
     como de Centauro): ahí no hay gente de la empresa y «Quién es quién» no lleva ningún nombre (revisión del 24 nov). */
  const gente = (cliente?.emailDomains ?? []).length
    ? [...new Set([...reuniones.filter((r) => !r.delEquipo).flatMap((r) => r.delCliente), ...nombresDeQuienesDeciden(casillas)])].filter(
        (n) => !NO_ES_UNA_PERSONA.test(n) && !deLaEmpresa.has(paraComparar(n.split(/\s+/)[0] ?? "")) && !salaDeSmarteam(n),
      )
    : [];

  // El peso de cada sesión (18 nov): su título y sus minutos, también las que no tienen texto (pesan: se habló de eso).
  const peso = pesoDeLasSesiones(
    hechas.map((r) => ({
      id: r.id,
      origen: r.origen,
      fecha: r.fecha,
      titulo: r.titulo || null,
      minutos: duracion.get(r.id) ?? null,
      areaId: areaDelEquipo(claveDelEquipo(r)),
      deTrabajo: esDeTrabajo(r),
    })),
    vistas,
    new Map(reuniones.map((r) => [r.id, r.clave])),
  );
  const ctx: ContextoDelResumen = {
    empresa: fila.client.name,
    areas: l.deLasAreas.map((x) => areaParaElResumen(escala, x, contextoDelEquipo(fila.contenido ?? {}, x.resultado.areaId))),
    reuniones,
    instrucciones: bloqueDeInstrucciones(estado.contenido.notas, "exploracion"),
    guia: guiaDelEquipo(casillas),
    peso,
    // 20 nov (vender por resultados): de quién pesan más los dolores y la pérdida que la empresa validó en la preventa.
    deciden: quienesDecidenDe(casillas),
    perdida: perdidaParaElAgente(perdidaDeLaEscala(fila.contenido)),
    gente,
  };
  const entorno = entornoDe(fila, escala);
  const firmas = Object.fromEntries(l.deLasAreas.map((x) => [x.resultado.areaId, firmaDelArea(estado.contenido.chequeo, x.resultado.areaId, entorno)]));
  return { ctx, hicimos: { sesiones, personas: delCliente.size, texto: null }, personas, firmas, areasFuera, malLeidas };
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
    perdida: perdidaDeLaEscala(l.fila.contenido),
  });
}

/** Las corridas del Resumen de esta exploración (el modo y la exploración van en los filtros de la corrida). */
const deEsteResumen = (exploracionId: string) => ({
  agentSlug: AGENTE_DE_LA_EXPLORACION,
  AND: [{ filters: { path: ["modo"], equals: MODO_DEL_RESUMEN } }, { filters: { path: ["exploracion"], equals: exploracionId } }],
});
const MODO_DEL_RESUMEN = "resumen-de-la-escala";
const COLUMNAS_DE_LA_CORRIDA = { id: true, status: true, currentPhase: true, createdAt: true, updatedAt: true, output: true } as const;

/**
 * La corrida del Resumen de esta exploración que está trabajando, si hay. Se mira el LATIDO (`updatedAt`: cada fase lo
 * escribe), no cuándo empezó (24 nov): una con un reintento puede pasar de 10 minutos y seguir viva. La que no da señales
 * hace más de MINUTOS_SIN_LATIDO se cayó y no frena otra.
 */
async function corridaEnCurso(db: Pick<Prisma.TransactionClient, "agentRun">, exploracionId: string): Promise<FilaDeLaCorridaDelResumen | null> {
  return db.agentRun.findFirst({
    where: { ...deEsteResumen(exploracionId), status: "RUNNING", updatedAt: { gte: new Date(Date.now() - MINUTOS_SIN_LATIDO * 60_000) } },
    orderBy: { createdAt: "desc" },
    select: COLUMNAS_DE_LA_CORRIDA,
  });
}

/** La última corrida del Resumen de esta exploración, como la sigue la pantalla (GET …/escala/resumen). */
export async function ultimaCorridaDelResumen(exploracionId: string): Promise<CorridaDelResumen | null> {
  const f = await prisma.agentRun.findFirst({ where: deEsteResumen(exploracionId), orderBy: { createdAt: "desc" }, select: COLUMNAS_DE_LA_CORRIDA });
  return f ? corridaDesdeLaFila(f) : null;
}

/** Cada cuánto, como mucho, se escribe el latido de una corrida que no cambió de fase (al empezar cada llamada). */
const LATIDO_MINIMO_MS = 45_000;

/** La última corrida del Resumen que terminó bien: desde cuándo leyó el Resumen que hay (las notas de después son nuevas). */
export async function ultimaTerminadaDelResumen(exploracionId: string): Promise<CorridaTerminada | null> {
  const f = await prisma.agentRun.findFirst({ where: { ...deEsteResumen(exploracionId), status: "DONE" }, orderBy: { createdAt: "desc" }, select: { id: true, createdAt: true } });
  return f ? { id: f.id, empezo: f.createdAt.toISOString() } : null;
}

/**
 * Por qué no se arma el Resumen sin reuniones con texto, dicho donde se está (24 nov): en la cuenta no hay «preventa», y en
 * la preventa de un cliente el camino es sumar reuniones de trabajo (Nexus sugiere cuáles).
 */
export function sinReunionesParaElResumen(fila: { projectId: string | null; client: { kind: string } }): string {
  if (fila.projectId) return "Ninguna sesión de esta escala tiene transcripción todavía: el Resumen sale de lo que se habló en ellas.";
  if (partirDeLoQueYaSabemos(fila.client.kind))
    return "Ninguna sesión tiene transcripción todavía: suma reuniones de trabajo con «+ Agregar sesión» (Nexus sugiere cuáles) y el Resumen sale de lo que se habló en ellas.";
  return "Ninguna sesión de esta preventa tiene transcripción todavía: el Resumen sale de lo que se habló en ellas.";
}

/** Lo que deja listo `prepararElResumen`: la lectura, lo que lee el agente y la corrida ya creada (RUNNING). */
interface ResumenPreparado {
  l: Extract<Lectura, { ok: true }>;
  le: LoQueLee;
  run: FilaDeLaCorridaDelResumen;
  t0: number;
  email: string | null;
  exploracionId: string;
}

/**
 * Lo que se decide antes de gastar IA (unos segundos): las puertas, lo que lee el agente y la corrida. Si algo frena, lo
 * dice con su status; si arranca, la corrida ya existe en RUNNING (la pantalla la puede seguir).
 */
async function prepararElResumen(o: { exploracionId: string; email: string | null }): Promise<{ ok: true; prep: ResumenPreparado } | { ok: false; status: number; error: string; corrida?: CorridaDelResumen }> {
  const t0 = Date.now();
  const l = await leer(o.exploracionId);
  if (!l.ok) return l;
  const { fila } = l;
  if (fila.archivadaEn) return { ok: false, status: 409, error: "La exploración está archivada: el agente ya no trabaja en ella." };
  if (!l.deLasAreas.length) return { ok: false, status: 409, error: "Todavía no hay equipos en la página del cliente: elige cuáles ve en «Acceso»." };

  /* Uno a la vez (revisión del 21 nov): la cuenta regresiva de una nota y el botón pueden pedirlo juntos. Dos corridas se
     pagan dos veces, y la que termina última pisa a la otra (podía dejar fuera la nota más nueva). Desde el 24 nov la
     pantalla sigue la que ya corre (viene con el 409). Una corrida sin latido hace MINUTOS_SIN_LATIDO se dio por caída. */
  const yaCorre = (viva: FilaDeLaCorridaDelResumen) =>
    ({ ok: false, status: 409, error: "Nexus ya está armando el Resumen de esta escala. Cuando termine, vuelve a rehacerlo para sumar lo último.", corrida: corridaDesdeLaFila(viva) }) as const;
  // Temprano, para responder rápido con la que ya corre; se vuelve a mirar con la fila bloqueada, justo antes de crearla.
  const viva = await corridaEnCurso(prisma, o.exploracionId);
  if (viva) return yaCorre(viva);

  const le = await loQueLeeElResumen(l);
  // Las notas del equipo pesan, pero el Resumen sale de lo que se habló: sin ninguna reunión con texto no se arma.
  if (!reunionesDeVerdad(le.ctx.reuniones).length) return { ok: false, status: 409, error: sinReunionesParaElResumen(fila) };

  const deVerdad = reunionesDeVerdad(le.ctx.reuniones);
  /* Mirar y crear, con la fila de la exploración bloqueada (revisión del 24 nov): leer las reuniones tarda segundos, y dos
     pedidos de dos pestañas o dos personas podían pasar los dos el candado y pagar dos corridas. */
  const creada = await prisma.$transaction(async (tx) => {
    await bloquearFila(tx, o.exploracionId);
    const otra = await corridaEnCurso(tx, o.exploracionId);
    if (otra) return { otra };
    // Trazabilidad (ARCHITECTURE §6 regla 5). Sin `exploracionId` en los filtros a propósito: no es una corrida del lienzo.
    const run = await tx.agentRun.create({
      data: {
        agentSlug: AGENTE_DE_LA_EXPLORACION,
        clientId: fila.clientId,
        projectId: fila.projectId,
        status: "RUNNING",
        stepLabel: "La escala: el Resumen para el cliente",
        currentPhase: FASES_DEL_RESUMEN.leyendo(deVerdad.length, le.ctx.reuniones.length - deVerdad.length),
        triggeredByEmail: o.email,
        sourceSessionIds: reunionesDeVerdad(le.ctx.reuniones).map((r) => r.id),
        filters: { exploracion: o.exploracionId, modo: MODO_DEL_RESUMEN, areas: le.ctx.areas.map((a) => a.id) } as Prisma.InputJsonValue,
      },
      select: COLUMNAS_DE_LA_CORRIDA,
    });
    return { run };
  });
  if (creada.otra) return yaCorre(creada.otra);
  if (!creada.run) return { ok: false, status: 503, error: "No se pudo empezar a armar el Resumen. Vuelve a intentarlo." };
  return { ok: true, prep: { l, le, run: creada.run, t0, email: o.email, exploracionId: o.exploracionId } };
}

/** Arma (o rehace) el Resumen y lo guarda, esperando a que termine (el simulacro con --guardar). La pantalla usa `lanzarElResumenDeLaEscala`. */
export async function generarElResumenDeLaEscala(o: { exploracionId: string; email: string | null }): Promise<ResultadoDelResumen> {
  const p = await prepararElResumen(o);
  if (!p.ok) return p;
  return escribirYGuardar(p.prep);
}

/**
 * «Armar el Resumen» / «Rehacer con IA» desde la pantalla (24 nov): arranca la corrida y responde enseguida. `seguir` es el
 * trabajo con la IA (unos 3 minutos): la ruta lo deja corriendo después de responder (`after`), y la pantalla lo sigue
 * por su fase (`ultimaCorridaDelResumen`). Nunca lanza: lo que falla queda en la corrida.
 */
export async function lanzarElResumenDeLaEscala(o: {
  exploracionId: string;
  email: string | null;
}): Promise<{ ok: true; corrida: CorridaDelResumen; seguir: () => Promise<void> } | { ok: false; status: number; error: string; corrida?: CorridaDelResumen }> {
  const p = await prepararElResumen(o);
  if (!p.ok) return p;
  return {
    ok: true,
    corrida: corridaDesdeLaFila(p.prep.run),
    seguir: () =>
      escribirYGuardar(p.prep)
        .then(() => undefined)
        .catch((e) => console.error("[exploraciones/resumen-de-la-escala] la corrida en segundo plano falló", e)),
  };
}

/** La parte que gasta IA: escribe, verifica y guarda. Toda falla queda en la corrida (ERROR con su motivo). */
async function escribirYGuardar(prep: ResumenPreparado): Promise<ResultadoDelResumen> {
  const { l, le, run, t0 } = prep;
  const { fila } = l;
  const o = { exploracionId: prep.exploracionId, email: prep.email };
  const ia = { agentSlug: AGENTE_DE_LA_EXPLORACION, agentRunId: run.id, clientId: fila.clientId, triggeredByEmail: o.email, origen: "exploraciones/agente:resumen-de-la-escala" };
  /* La fase real (24 nov), que es también el LATIDO de la corrida (`updatedAt`): se escribe cuando cambia y, aunque no
     cambie, al empezar cada llamada si la última escritura tiene más de LATIDO_MINIMO_MS (revisión del 24 nov: los
     arreglos van todos con «Revisando…» y una corrida viva quedaba sin latido). Si no se escribe, la corrida sigue igual. */
  let faseActual: string | null = run.currentPhase;
  let escritaEn = Date.now();
  const fase = (texto: string) => {
    if (texto === faseActual && Date.now() - escritaEn < LATIDO_MINIMO_MS) return;
    faseActual = texto;
    escritaEn = Date.now();
    void prisma.agentRun.update({ where: { id: run.id }, data: { currentPhase: texto } }).catch(() => {});
  };
  let principales = 0;
  /* Cada llamada, con streaming y su tope (`llamarConTope`): colgada, falla en minutos y se intenta una vez más. La
     principal es la del pedido entero (`MAX_TOKENS_DEL_RESUMEN`); las demás arreglan piezas. */
  const pedir = (pedido: Anthropic.Messages.MessageCreateParamsNonStreaming) => {
    const principal = pedido.max_tokens === MAX_TOKENS_DEL_RESUMEN;
    const vez = principal ? ++principales : 0;
    // Cada llamada late al empezar (la principal, con la fase que ya tiene; un arreglo, con «Revisando…»).
    fase(principal ? (faseActual ?? FASES_DEL_RESUMEN.escribiendo) : FASES_DEL_RESUMEN.revisando);
    return conContextoDeIA(ia, () =>
      llamarConTope(() => getAnthropic().messages.stream(pedido, { maxRetries: 1 }), principal ? TOPES_DEL_RESUMEN.principal : TOPES_DEL_RESUMEN.arreglo, {
        alPrimeraSenal: principal ? () => fase(vez > 1 ? FASES_DEL_RESUMEN.escribiendoOtraVez : FASES_DEL_RESUMEN.escribiendo) : undefined,
        alReintentar: () => fase(FASES_DEL_RESUMEN.otraVez),
      }),
    );
  };
  try {
    const corrida = await escribirElResumen(le, pedir);
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
      tituloDelRecorrido: escrito.tituloDelRecorrido ? { texto: escrito.tituloDelRecorrido } : null,
      operativas: escrito.operativas,
      pendientes: escrito.pendientes,
      // Con la firma de los niveles de hoy: si la escala cambia, la pantalla interna avisa que el Resumen quedó viejo.
      firmas: le.firmas,
      confirmar: escrito.confirmar,
      avisos: escrito.avisos,
      puntos: escrito.puntos,
      malLeidas: le.malLeidas,
      leidasEnteras: true,
    };
    fase(FASES_DEL_RESUMEN.guardando);
    const { guardado, antes } = await guardar(o.exploracionId, nuevo, le.ctx.reuniones);
    // El historial de versiones (21 nov): el de antes y el nuevo, después de soltar la fila. Nunca lanza.
    if (guardado) await guardarAlRehacer(o.exploracionId, { antes, nuevo: guardado, email: o.email });
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "DONE", currentPhase: null, output: JSON.stringify({ resumen: nuevo, descartados: escrito.descartados, uso }) },
    });
    // La descripción de cada área que falta o quedó vieja (16 nov): solo se escribía al crear el «Acceso», y en 5 de 9
    // páginas salía la de respaldo. No pisa las vigentes (una escrita a mano que quedó vieja, sí, como el botón de
    // siempre); si falla, el Resumen ya quedó.
    // Después de responder, como el «Acceso»: «Rehacer con IA» no espera por ellas (ya tarda unos 3 minutos).
    void generarDescripcionesDeLaEscala({ exploracionId: o.exploracionId, email: o.email, soloFaltantes: true })
      .then((d) => {
        if (!d.ok) console.error("[exploraciones/resumen-de-la-escala] la descripción de las áreas no se escribió:", d.error);
      })
      .catch((e) => console.error("[exploraciones/resumen-de-la-escala] la descripción de las áreas falló", e));
    // Sin volver a leer la exploración: los niveles son los de la lectura de arriba (si cambiaron mientras tanto, la
    // pantalla trae la página al día por su cuenta).
    return { ok: true, resumen: comoLoVeElCse(l, guardado), descartados: escrito.descartados, segundos: Math.round((Date.now() - t0) / 1000), uso };
  } catch (e) {
    // Colgada las dos veces (24 nov): dicho en palabras simples, sin «timeout».
    const mensaje = e instanceof LlamadaSinRespuesta ? ERROR_SIN_RESPUESTA : humanizeAgentError(e);
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "ERROR", currentPhase: null, output: JSON.stringify({ error: mensaje }) } }).catch(() => {});
    console.error("[exploraciones/resumen-de-la-escala] falló", e);
    return { ok: false, status: 502, error: mensaje };
  }
}

/**
 * Guarda con la fila bloqueada y releída: lo nuevo junto con lo que una persona escribió (también lo que escribió mientras
 * el agente trabajaba) y sin lo que quitó. Devuelve también el que había, tal como estaba, para el historial de versiones
 * (21 nov). Conserva las claves del Json que esta versión no conoce.
 */
async function guardar(
  exploracionId: string,
  nuevo: ResumenGuardado,
  reuniones: readonly ReunionParaElResumen[],
): Promise<{ guardado: ResumenGuardado | null; antes?: ResumenGuardado }> {
  return prisma.$transaction(async (tx) => {
    await bloquearFila(tx, exploracionId);
    const f = await tx.exploracionDeVenta.findUnique({ where: { id: exploracionId }, select: { contenido: true, archivadaEn: true } });
    if (!f || f.archivadaEn) return { guardado: null };
    const c = leerContenido(f.contenido);
    const resumenDeLaEscala = juntarConLoEditado(nuevo, c.resumenDeLaEscala, reuniones);
    await tx.exploracionDeVenta.update({
      where: { id: exploracionId },
      data: { contenido: conLoDesconocido(f.contenido, { ...c, resumenDeLaEscala }) },
    });
    return { guardado: resumenDeLaEscala, antes: c.resumenDeLaEscala };
  });
}

/** El contenido leído, sin perder las claves del Json que esta versión no conoce. */
function conLoDesconocido(raw: unknown, c: ReturnType<typeof leerContenido>): Prisma.InputJsonValue {
  const crudo = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return { ...crudo, ...c } as unknown as Prisma.InputJsonValue;
}

/** El candado de «Rehacer con IA», para «Usar esta versión» del historial (21 nov): mientras hay una corrida, no se cambia. */
export async function seRehaceElResumen(db: Pick<Prisma.TransactionClient, "agentRun">, exploracionId: string): Promise<boolean> {
  return !!(await corridaEnCurso(db, exploracionId));
}
