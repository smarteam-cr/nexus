/**
 * lib/exploraciones/guia-ajustes-server.ts — cambiar la guía de la PRÓXIMA sesión desde el servidor: «Regenerar» una
 * pregunta y los cambios que propone el asistente (lib/operaciones/guia-server.ts). SERVER-ONLY.
 *
 * Validaciones 69, 71 y 73 del roadmap (2026-10-18). Lo que se cambia vive en la sesión (`ajustesDeLaGuia`, en
 * `contenido`) y se escribe con la operación de siempre (`ajustarGuia`), con la fila bloqueada: el mismo camino que la
 * pantalla, así un cambio del asistente y uno a mano no se pisan. Las preguntas que se miran son las MISMAS que ve el
 * vendedor (la guía de la próxima, con el plan y con los ajustes: `preguntasDeLaProxima`).
 */
import "server-only";
import { getAnthropic } from "@/lib/anthropic";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { definicionEnElMarco, esTarjeta } from "./marco";
import { hoyEnCostaRica } from "./fechas";
import {
  focoDeLaGuia,
  nuevoIdDeSesion,
  pestanasDeSesiones,
  preguntasParaMostrar,
  procedenciasDeLaSesion,
  type PreguntaParaMostrar,
} from "./guia";
import {
  aplicarAjustes,
  apuntaDelTema,
  claveDePregunta,
  ErrorDeLaGuia,
  MAX_SUGERIDAS_DEL_OBJETIVO,
  nuevoIdDePropia,
  yaPropuestasParaElObjetivo,
  type CambioDeLaGuia,
} from "./ajustes-de-la-guia";

export { ErrorDeLaGuia };
import {
  avisoParaOtraVez,
  leerPreguntasDelObjetivo,
  leerUnaPregunta,
  pedidoDePreguntasDelObjetivo,
  pedidoDeUnaPregunta,
  type EntradaDelObjetivo,
  type EntradaDeUnaPregunta,
} from "./guia-pregunta-pedido";
import { AGENTE_DE_LA_EXPLORACION, contextoParaLaGuia, nombresDelEquipo, planDeLaGuiaDeLaSesion } from "./agente";
import { guiaDeAntesDelPlan } from "./plan-de-la-guia";
import { EQUIPOS, leerTemaDeEquipo, nombreDelTemaDeEquipo, temaDeEquipo } from "./equipos";
import { aplicarCambios, type FilaDeExploracion } from "./servidor";

/** El `origen` de cada llamada de «Regenerar»: así se ve aparte en el gasto de la IA. */
export const ORIGEN_DE_REGENERAR = "exploraciones/guia:regenerar-pregunta";


type BaseDeLaGuia = Awaited<ReturnType<typeof contextoParaLaGuia>>;

/**
 * El nombre de un tema: la tarjeta del marco, el tema de un equipo del cliente (con lo que busca, para que «Regenerar» y
 * las preguntas del objetivo sepan qué preguntarle a ese equipo) o la dimensión de la escala.
 */
function nombreDelTema(base: BaseDeLaGuia, para: string): string {
  if (esTarjeta(para)) return definicionEnElMarco(para, base.marco).etiqueta;
  const delEquipo = leerTemaDeEquipo(para);
  if (delEquipo) return `${nombreDelTemaDeEquipo(para)} (busca: ${delEquipo.definicion.busca})`;
  return base.escala.areas.flatMap((a) => a.dimensiones).find((d) => d.id === para)?.nombre ?? para;
}

/**
 * Las preguntas de la próxima sesión como las ve el vendedor (piezas-de-la-sesion.tsx › `useGuiaDeLaSesion`): la guía
 * guardada para esa sesión o la viva, sobre lo que falta HOY, con el plan en la preventa y con los ajustes de la sesión.
 * `sesionId` null = la próxima todavía no es sesión.
 */
export function preguntasDeLaProxima(base: BaseDeLaGuia): { sesionId: string | null; preguntas: PreguntaParaMostrar[] } {
  const { estado, escala, posiciones, marco, ctx, loLeido } = base;
  const sesionId = ctx.proxima.sesionId ?? null;
  const sesion = sesionId ? estado.contenido.sesiones.find((s) => s.id === sesionId) : undefined;
  const guia = (sesionId ? estado.propuesta.guias[sesionId] : null) ?? estado.propuesta.guia;
  /* Con el plan (la preventa, y un proyecto desde el 2026-10-19). La guía de un proyecto armada antes del plan se ve como
     se armó, con lo que falta hoy, hasta que alguien toque «Actualizar la guía» (plan-de-la-guia.ts › `guiaDeAntesDelPlan`). */
  const antesDelPlan = guiaDeAntesDelPlan(guia, marco.clave);
  const sinPlan = antesDelPlan ? focoDeLaGuia(estado.contenido.casillas, escala, estado.areas, posiciones, estado.contenido.aExplorar, marco) : null;
  const huecos = sinPlan ? sinPlan.huecos : ctx.huecos.map((h) => h.clave);
  const enfoque = sinPlan ? sinPlan.enfoque : ctx.enfoque.map((d) => d.id);
  // Con la fecha de la guía que se ve: lo leído después no la cambia sin aviso (igual que la pantalla).
  const plan = antesDelPlan ? null : planDeLaGuiaDeLaSesion(estado, loLeido.tests, escala, posiciones, sesionId, marco, { hasta: guia?.en ?? null, automaticas: base.automaticas });
  // Las procedencias salen de las sesiones guardadas (de qué sesión viene cada punto llevado): para las claves alcanza.
  const pestanas = pestanasDeSesiones(estado.contenido.sesiones, [], hoyEnCostaRica(base.ahora));
  const activa = pestanas.find((p) => p.clave === sesionId) ?? { clave: "nueva", sesion: null };
  const procedencias = procedenciasDeLaSesion(activa, pestanas);
  const preguntas = preguntasParaMostrar(guia, huecos, enfoque, escala, procedencias, marco, plan ?? undefined);
  return { sesionId, preguntas: aplicarAjustes(preguntas, sesion?.ajustesDeLaGuia, apuntaDelTema(escala)) };
}

/**
 * Aplica un cambio a la guía de la próxima sesión. Si la próxima todavía no es sesión, se crea (como al escribir su
 * objetivo). Con la fila bloqueada; si otro cambió lo confirmado entretanto, se reintenta una vez con la versión nueva.
 */
export async function ajustarLaGuia(exploracionId: string, cambio: CambioDeLaGuia, quienPide: string | null, base?: BaseDeLaGuia): Promise<FilaDeExploracion> {
  const b = base ?? (await contextoParaLaGuia(exploracionId));
  if (b.estado.archivada) throw new ErrorDeLaGuia(409, "La exploración está archivada: ya no se puede cambiar.");
  const sesionId = b.ctx.proxima.sesionId ?? nuevoIdDeSesion();
  let version = b.fila.version;
  for (let intento = 0; intento < 2; intento++) {
    const r = await aplicarCambios(exploracionId, version, [{ op: "ajustarGuia", sesionId, cambio }], b.general, { quienPide });
    if (r.estado === "ok") return r.fila;
    if (r.estado === "no-existe") throw new ErrorDeLaGuia(404, "Esa exploración no existe.");
    if (r.estado === "invalido") throw new ErrorDeLaGuia(400, r.error);
    version = r.fila.version;
  }
  throw new ErrorDeLaGuia(409, "La exploración cambió mientras tanto: vuelve a intentarlo.");
}

/**
 * «Regenerar» una pregunta: otra del mismo tema y el mismo paso, sin rearmar la guía. Una llamada corta (medida en
 * `LlmCall` con el agente de la exploración y `ORIGEN_DE_REGENERAR`), y otra más si la primera no sirvió (voseo, repetía
 * lo que el cliente ya dijo o era la misma). Lo nuevo queda como un cambio de la sesión, con la marca «regenerada».
 */
export async function regenerarPregunta(exploracionId: string, clave: string, quienPide: string | null): Promise<FilaDeExploracion> {
  const base = await contextoParaLaGuia(exploracionId);
  const { preguntas } = preguntasDeLaProxima(base);
  const p = preguntas.find((x) => claveDePregunta(x) === clave);
  if (!p) throw new ErrorDeLaGuia(404, "Esa pregunta ya no está en la guía: recarga la página.");
  const tema = p.apunta?.para ?? (p.tipo === "tarjeta" || p.tipo === "dimension" || p.tipo === "equipo" ? p.para : null);
  const dim = tema && !esTarjeta(tema) ? base.escala.areas.flatMap((a) => a.dimensiones).find((d) => d.id === tema) : undefined;
  const pos = tema ? base.posiciones[tema] : undefined;
  const entrada: EntradaDeUnaPregunta = {
    ctx: base.ctx,
    objetivo: {
      para: tema ?? p.para,
      nombre: tema ? nombreDelTema(base, tema) : (p.tema ?? "Pregunta de la guía"),
      ...(p.paso ? { paso: p.paso } : {}),
      motivo: p.motivo ?? null,
      ...(p.aValidar ? { aValidar: true } : {}),
      dimension: dim ? { pregunta: dim.pregunta, nivel: pos ? (base.escala.niveles.find((n) => n.letra === pos.nivel)?.nombre ?? pos.nivel) : null } : null,
      actual: p.pregunta,
      repreguntas: p.repreguntas,
    },
    otras: preguntas.filter((x) => x !== p).map((x) => x.pregunta),
  };
  const pedir = (aviso = "") =>
    conContextoDeIA(
      { agentSlug: AGENTE_DE_LA_EXPLORACION, agentRunId: null, clientId: base.fila.clientId, triggeredByEmail: quienPide, origen: ORIGEN_DE_REGENERAR },
      () => getAnthropic().messages.create(pedidoDeUnaPregunta(entrada, aviso)),
    );
  let l = leerUnaPregunta(await pedir(), entrada, base.ctx.saber);
  if (!l.ok) l = leerUnaPregunta(await pedir(avisoParaOtraVez(l)), entrada, base.ctx.saber);
  if (!l.ok) throw new ErrorDeLaGuia(502, "El agente no escribió una pregunta que sirva. Prueba de nuevo, o escríbela tú.");
  // De la guía o propia, queda marcada «Regenerada» (prueba 104: una propia regenerada seguía diciendo «Del asistente»).
  const cambio: CambioDeLaGuia = { tipo: "cambiar", clave, pregunta: l.pregunta, repreguntas: l.repreguntas, origen: "regenerada" };
  return ajustarLaGuia(exploracionId, cambio, quienPide, base);
}

/** El `origen` de cada llamada de las preguntas para el objetivo: así se ve aparte en el gasto de la IA. */
export const ORIGEN_DEL_OBJETIVO = "exploraciones/guia:preguntas-del-objetivo";

/** Los temas que puede llevar una pregunta nueva: las tarjetas del marco y las dimensiones de las áreas en juego. */
function temasDeLaGuia(base: BaseDeLaGuia): { id: string; nombre: string }[] {
  return [
    // Los del equipo del cliente de la próxima sesión primero (2026-10-23): son de lo que trata esa sesión.
    ...temasDelEquipoDeLaProxima(base),
    ...base.marco.tarjetas.map((k) => ({ id: k as string, nombre: definicionEnElMarco(k, base.marco).etiqueta })),
    ...base.escala.areas
      .filter((a) => base.estado.areas.includes(a.id))
      .flatMap((a) => a.dimensiones.filter((d) => d.aplica).map((d) => ({ id: d.id, nombre: `${d.nombre} (${a.nombre})` }))),
  ];
}

/** Los temas del equipo del cliente de la próxima sesión (`marketing.medicion`), con su nombre; vacío sin equipo. */
export function temasDelEquipoDeLaProxima(base: Pick<BaseDeLaGuia, "estado" | "ctx">): { id: string; nombre: string }[] {
  const sesionId = base.ctx.proxima.sesionId ?? null;
  const equipo = sesionId ? base.estado.contenido.sesiones.find((s) => s.id === sesionId)?.equipo : undefined;
  if (!equipo) return [];
  return EQUIPOS[equipo].temas.map((t) => ({ id: temaDeEquipo(equipo, t.tema), nombre: `${EQUIPOS[equipo].nombre} · ${t.nombre}` }));
}

/**
 * Lo que se le pide al agente para el objetivo de la próxima sesión, armado desde la base (sin llamar a nadie). Lo usan
 * `proponerPreguntasDelObjetivo` y la medición (scripts/medir-preguntas-del-objetivo.ts). `objetivo` reemplaza al de la
 * sesión (para medir con otro).
 */
export function entradaDelObjetivo(base: BaseDeLaGuia, objetivo?: string, equipo: readonly string[] = []): { sesionId: string | null; entrada: EntradaDelObjetivo | null } {
  const { sesionId, preguntas } = preguntasDeLaProxima(base);
  const sesion = sesionId ? base.estado.contenido.sesiones.find((s) => s.id === sesionId) : undefined;
  const elObjetivo = (objetivo ?? sesion?.objetivo ?? "").trim();
  if (!elObjetivo) return { sesionId, entrada: null };
  return {
    sesionId,
    entrada: {
      ctx: base.ctx,
      objetivo: elObjetivo,
      temas: temasDeLaGuia(base),
      guia: preguntas.map((p) => p.pregunta),
      yaPropuestas: yaPropuestasParaElObjetivo(sesion?.ajustesDeLaGuia, elObjetivo),
      equipo,
    },
  };
}

/**
 * Las preguntas nuevas para el objetivo de la próxima sesión (CEMACO, 2026-10-20): al guardar el objetivo, y cuando la
 * persona las vuelve a pedir. Una llamada corta (medida en `LlmCall` con el agente de la exploración y
 * `ORIGEN_DEL_OBJETIVO`), y otra más si de la primera salieron menos de dos que sirvan. Quedan en la sesión como
 * propuestas (`sugeridas`): la persona usa o descarta cada una.
 */
export async function proponerPreguntasDelObjetivo(exploracionId: string, quienPide: string | null): Promise<FilaDeExploracion> {
  const [base, equipo] = await Promise.all([contextoParaLaGuia(exploracionId), nombresDelEquipo()]);
  const { entrada } = entradaDelObjetivo(base, undefined, equipo);
  if (!entrada) throw new ErrorDeLaGuia(400, "Escribe el objetivo de la sesión primero.");
  const pedir = (aviso = "") =>
    conContextoDeIA(
      { agentSlug: AGENTE_DE_LA_EXPLORACION, agentRunId: null, clientId: base.fila.clientId, triggeredByEmail: quienPide, origen: ORIGEN_DEL_OBJETIVO },
      () => getAnthropic().messages.create(pedidoDePreguntasDelObjetivo(entrada, aviso)),
    );
  let l = leerPreguntasDelObjetivo(await pedir(), entrada, base.ctx.saber);
  if (l.preguntas.length < 2) {
    const aviso = l.fallas.length ? l.fallas.map(avisoParaOtraVez).filter((x, i, xs) => xs.indexOf(x) === i).join("") : "";
    const otra = leerPreguntasDelObjetivo(await pedir(aviso), { ...entrada, yaPropuestas: [...entrada.yaPropuestas, ...l.preguntas.map((p) => p.pregunta)] }, base.ctx.saber);
    l = { preguntas: [...l.preguntas, ...otra.preguntas].slice(0, MAX_SUGERIDAS_DEL_OBJETIVO), fallas: otra.fallas };
  }
  if (!l.preguntas.length) throw new ErrorDeLaGuia(502, "El agente no escribió preguntas que sirvan para este objetivo. Prueba de nuevo, o súmalas tú.");
  const cambio: CambioDeLaGuia = { tipo: "sugerir", objetivo: entrada.objetivo, preguntas: l.preguntas.map((p) => ({ id: nuevoIdDePropia(), ...p })) };
  return ajustarLaGuia(exploracionId, cambio, quienPide, base);
}
