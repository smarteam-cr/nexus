/**
 * lib/timeline/lo-vendido.ts — LO VENDIDO DEL PROYECTO, para la IA del cronograma (2026-11-18). PURO.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
 * Caso RC Inmobiliaria · DocuSign (queja de Alejandro Salas): el CSE confirmó 4 semanas vendidas y nada del cronograma
 * lo tomó. «Generar cronograma» no toca duraciones y el paso 1 de «Regenerar todo» no recibía los límites: solo los
 * leían el handoff y el chat. Las tareas, además, salían de la regla genérica del prompt («2 a 5 por semana»): 32 tareas
 * y 14 sesiones contra 9 vendidas.
 *
 * Lo vendido es UN solo lugar, con dos partes:
 *  · los límites (semanas, fecha, horas): confirmados o, si nadie confirmó, propuestos con su cita verificada
 *    (`limitesVigentes`, la misma regla del aviso);
 *  · la propuesta del proyecto con sus casos de uso y las actividades de cada uno, con sus horas con el cliente e
 *    internas (el catálogo de casos de uso, lib/casos-de-uso/).
 *
 * ── PREPARADO PARA EL CAMBIO 1 ───────────────────────────────────────────────
 * Hoy la propuesta sale de lo que ya existe (lib/timeline/lo-vendido-server.ts › `propuestaDelProyecto`). Cuando el CSE
 * pueda elegir qué venta es de este proyecto (el cambio 1, por decidir), solo cambia esa función: los bloques de abajo
 * y sus lectores (el paso 1 y el paso 2) no se tocan.
 *
 * Decisiones (Elías, 2026-11-18): el plan puede pasarse de lo vendido, pero AVISA; el revisor de fases puede JUNTAR
 * fases solo con un límite CONFIRMADO que el plan pasa; las tareas salen de las actividades, no de una regla genérica.
 * DECISIONS «El cronograma sale de lo vendido».
 */
import { fmtYmd, limitesVigentes, pasaUnLimiteConfirmado, type LimiteVigente, type LimitesParaRevisar, type RevisionDeLimites } from "./limites";
import { plural } from "./weeks";

/** Una actividad vendida, con sus horas en ESTE caso (las veces incluidas). */
export interface ActividadVendida {
  nombre: string;
  veces: number;
  /** Horas con el cliente (sesiones). */
  conElCliente: number;
  /** Horas de Smarteam a solas. */
  internas: number;
}

export interface CasoVendido {
  titulo: string;
  actividades: ActividadVendida[];
}

export interface PropuestaVendida {
  id: string;
  nombre: string;
  publicada: boolean;
}

export interface LoVendido {
  semanas: LimiteVigente<number> | null;
  fecha: LimiteVigente<string> | null;
  horas: LimiteVigente<number> | null;
  /** La duración vendida se cuenta sin la Semana 0 (Customer Success). */
  conSemanaCero: boolean;
  propuesta: PropuestaVendida | null;
  casos: CasoVendido[];
}

export const SIN_LO_VENDIDO: LoVendido = { semanas: null, fecha: null, horas: null, conSemanaCero: true, propuesta: null, casos: [] };

/** Los límites vigentes de lo guardado + la propuesta: lo que arma `cargarLoVendido`. */
export function loVendidoDe(i: {
  limites: (LimitesParaRevisar & { conSemanaCero: boolean }) | null;
  propuesta: PropuestaVendida | null;
  casos: readonly CasoVendido[];
}): LoVendido {
  const v = i.limites ? limitesVigentes(i.limites) : null;
  return {
    semanas: v?.duracion ?? null,
    fecha: v?.fecha ?? null,
    horas: v?.horas ?? null,
    conSemanaCero: i.limites?.conSemanaCero ?? true,
    propuesta: i.propuesta,
    casos: i.casos.filter((c) => c.actividades.length > 0),
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const fmtH = (n: number) => (Number.isInteger(r1(n)) ? String(r1(n)) : r1(n).toFixed(1).replace(".", ","));

/**
 * Los títulos de los casos de uso de una propuesta PUBLICADA (la sección `casos_de_uso`, `data.items[].title`): lo que el
 * cliente ya vio. [] sin la sección o sin casos.
 */
export function titulosDeLosCasosDeLaPropuesta(publishedSnapshot: unknown): string[] {
  const esObjeto = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
  if (!esObjeto(publishedSnapshot) || !Array.isArray(publishedSnapshot.sections)) return [];
  const seccion = publishedSnapshot.sections.find((s) => esObjeto(s) && s.key === "casos_de_uso");
  if (!esObjeto(seccion) || !Array.isArray(seccion.blocks)) return [];
  const titulos: string[] = [];
  for (const b of seccion.blocks) {
    const items = esObjeto(b) && esObjeto(b.data) && Array.isArray(b.data.items) ? b.data.items : [];
    for (const it of items) {
      const t = esObjeto(it) && typeof it.title === "string" ? it.title.trim() : "";
      if (t && !titulos.includes(t)) titulos.push(t);
    }
  }
  return titulos;
}

/** Las horas de los casos vendidos: con el cliente e internas. */
export function horasDeLosCasos(casos: readonly CasoVendido[]): { conElCliente: number; internas: number } {
  let conElCliente = 0;
  let internas = 0;
  for (const c of casos) for (const a of c.actividades) {
    conElCliente += a.conElCliente;
    internas += a.internas;
  }
  return { conElCliente: r1(conElCliente), internas: r1(internas) };
}

/** ¿Hay algo vendido que decir? Sin nada, los bloques no suman ni un carácter (el mensaje queda como antes). */
export function hayLoVendido(lv: LoVendido): boolean {
  return !!(lv.semanas || lv.fecha || lv.horas || lv.casos.length > 0);
}

const origen = (l: LimiteVigente<unknown>) => (l.origen === "confirmado" ? "confirmado" : "lo propuso la IA del handoff; sin confirmar");

/** Las líneas de los límites, en palabras (las comparten los dos bloques). */
function lineasDeLosLimites(lv: LoVendido): string[] {
  const out: string[] = [];
  if (lv.semanas) out.push(`- Semanas vendidas: ${lv.semanas.valor}${lv.conSemanaCero ? " (sin contar la Semana 0)" : ""} — ${origen(lv.semanas)}.`);
  if (lv.horas) out.push(`- Horas vendidas para este proyecto: ${lv.horas.valor} — ${origen(lv.horas)}.`);
  if (lv.fecha) out.push(`- Fecha límite: ${fmtYmd(lv.fecha.valor)} — ${origen(lv.fecha)}.`);
  return out;
}

/** Los casos con sus actividades, en palabras. */
function lineasDeLosCasos(lv: LoVendido): string[] {
  if (lv.casos.length === 0) return [];
  const out: string[] = [];
  if (lv.propuesta) out.push(`Propuesta: «${lv.propuesta.nombre}»${lv.propuesta.publicada ? "" : " (sin publicar)"}.`);
  for (const c of lv.casos) {
    out.push(`Caso de uso «${c.titulo}»:`);
    for (const a of c.actividades) {
      const partes = [
        a.conElCliente > 0 ? `${fmtH(a.conElCliente)} h con el cliente` : null,
        a.internas > 0 ? `${fmtH(a.internas)} h internas` : null,
      ].filter(Boolean);
      out.push(`  · ${a.nombre}${a.veces > 1 ? ` (×${a.veces})` : ""}${partes.length > 0 ? ` — ${partes.join(", ")}` : " — horas por definir"}`);
    }
  }
  const h = horasDeLosCasos(lv.casos);
  out.push(`Total de las actividades: ${fmtH(h.conElCliente)} h con el cliente y ${fmtH(h.internas)} h internas.`);
  return out;
}

/**
 * ⭐ El bloque del PASO 1 (el revisor de fases de «Regenerar todo» y de «Ajustar el plan a lo vendido»). Dice lo
 * vendido, cómo queda el plan de hoy contra eso, y si puede JUNTAR fases: solo con un límite CONFIRMADO que el plan pasa
 * (decisión de Elías, 2026-11-18). El armador lo vuelve a exigir (`puedeJuntar`): esto es lo que lee el modelo, no la
 * guarda. null si no hay nada vendido y no se pidió ajustar.
 */
export function bloqueDeLoVendidoParaLaEstructura(i: {
  loVendido: LoVendido;
  revision: RevisionDeLimites | null;
  ajustar: boolean;
}): string | null {
  const lv = i.loVendido;
  if (!hayLoVendido(lv) && !i.ajustar) return null;
  const r = i.revision;
  const lineas = ["=== LO VENDIDO DE ESTE PROYECTO (dato del sistema) ===", ...lineasDeLosLimites(lv)];
  if (r) {
    const hoy: string[] = [];
    if (r.duracion) hoy.push(`dura ${plural(r.duracion.delPlan, "semana", "semanas")}${lv.conSemanaCero && r.semanasDeArranque > 0 ? " sin la Semana 0" : ""}`);
    if (r.horas && r.horas.delPlan !== null) hoy.push(`sus tareas suman ${fmtH(r.horas.delPlan)} horas`);
    if (r.fecha?.cierre) hoy.push(`termina el ${fmtYmd(r.fecha.cierre)}`);
    if (hoy.length > 0) lineas.push(`Hoy el plan ${hoy.join(", ")}: ${r.seSale ? "SE PASA de lo vendido" : "cabe en lo vendido"}.`);
  }
  lineas.push(...lineasDeLosCasos(lv));
  const puedeJuntar = !!r && pasaUnLimiteConfirmado(r);
  lineas.push(
    puedeJuntar
      ? 'JUNTAR FASES: el plan pasa un límite CONFIRMADO, así que puedes juntar una fase SIN EMPEZAR en otra SIN EMPEZAR ({"tipo":"juntar"}), cuando las dos son el mismo trabajo partido (dos bloques de plantillas, dos rondas de lo mismo) o cuando así el plan entra en lo vendido. La que recibe puede alargarse ("durationWeeks"). Nunca juntes la Semana 0 ni una fase empezada, terminada o suspendida.'
      : "JUNTAR FASES: NO. No hay un límite confirmado que el plan pase; si te parece que dos fases sobran, dilo en observaciones.",
  );
  if (i.ajustar) {
    lineas.push(
      "EL CSE PIDIÓ AJUSTAR EL PLAN A LO VENDIDO: propone los cambios de fases y tiempos que hacen falta para que el plan entre en lo vendido: poner en paralelo lo que no depende de otra fase (con \"inicioSemana\"), acortar una fase sin empezar, o juntar fases si se puede. Esto cuenta como un pedido explícito de las instrucciones del CSE (cítalo como «Instrucciones del CSE: ajustar a lo vendido»). Si no se puede sin tocar trabajo empezado, dilo en observaciones.",
    );
  }
  return lineas.join("\n");
}

/**
 * ⭐ El bloque del PASO 2 (el detalle: «Generar cronograma» y las tareas de «Regenerar todo»). Las tareas salen de las
 * actividades vendidas, cada una con sus horas, y esto REEMPLAZA la regla de «2 a 5 tareas por semana» del prompt (que
 * vive en la base y no se re-siembra: KNOWN-ERRORS). Sin casos de uso, el tope lo ponen las horas o las semanas
 * vendidas. null si no hay nada vendido: el mensaje queda byte a byte como antes.
 */
export function bloqueDeLoVendidoParaElDetalle(lv: LoVendido): string | null {
  /* Solo con algo que MIDA el trabajo: casos con actividades u horas vendidas (revisión del 2026-11-18). Con solo semanas o
     una fecha límite no hay de dónde sacar las tareas ni sus horas: el detalle sigue como antes (sus reglas de siempre). */
  if (lv.casos.length === 0 && !lv.horas) return null;
  const lineas = [
    "",
    "",
    "=== LO VENDIDO Y SUS ACTIVIDADES (regla del sistema: reemplaza la de «2 a 5 tareas por semana» de tus instrucciones) ===",
    ...lineasDeLosLimites(lv),
    ...lineasDeLosCasos(lv),
  ];
  if (lv.casos.length > 0) {
    lineas.push(
      "- Las tareas SALEN DE ESTAS ACTIVIDADES: cada actividad es una tarea (o una por cada vez, si va ×N). Una actividad con horas con el cliente es una sesión (\"type\": \"SESSION\"); una solo interna es una tarea de Smarteam (\"type\": \"TASK\"). Ponla en la fase que hace ese trabajo.",
      "- Las horas de cada línea son el TOTAL de todas sus veces: si una actividad ×9 suma 18 h y la partes en 9 tareas, cada una lleva 2 h (nunca 18).",
      "- No agregues trabajo que ninguna actividad cubre, salvo lo que el cliente tiene que entregar para que se pueda hacer (accesos, documentos, aprobaciones) y lo que pidan las instrucciones del CSE.",
      "- ⛔ El título y la nota de una tarea los LEE EL CLIENTE: describe el trabajo de su proyecto, sin horas, sin precios y sin los nombres internos de las actividades. Las horas van SOLO en \"horas\".",
    );
  } else {
    lineas.push("- No hay casos de uso vendidos con actividades: arma solo el trabajo que dicen el handoff y el material, sin tareas típicas de relleno.");
  }
  lineas.push(
    '- A cada tarea de Smarteam (o de los dos) agrégale "horas": las horas de Smarteam estimadas para ese trabajo. Una tarea que hace solo el cliente va sin "horas": no gasta lo vendido.',
  );
  const deLosCasos = horasDeLosCasos(lv.casos);
  const tope = lv.horas ? lv.horas.valor : lv.casos.length > 0 ? r1(deLosCasos.conElCliente + deLosCasos.internas) : null;
  if (tope !== null) lineas.push(`- La suma de las "horas" de todas las tareas no pasa de ${fmtH(tope)}. Si el trabajo no entra, no lo estires: dilo en observaciones.`);
  if (lv.semanas) lineas.push(`- Las tareas van dentro de las ${lv.semanas.valor} semanas vendidas.`);
  return lineas.join("\n");
}
