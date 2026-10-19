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
  nuevoIdDeSesion,
  pestanasDeSesiones,
  preguntasParaMostrar,
  procedenciasDeLaSesion,
  type PreguntaParaMostrar,
} from "./guia";
import { aplicarAjustes, apuntaDelTema, claveDePregunta, ErrorDeLaGuia, type CambioDeLaGuia } from "./ajustes-de-la-guia";

export { ErrorDeLaGuia };
import { avisoParaOtraVez, leerUnaPregunta, pedidoDeUnaPregunta, type EntradaDeUnaPregunta } from "./guia-pregunta-pedido";
import { AGENTE_DE_LA_EXPLORACION, contextoParaLaGuia, planDeLaGuiaDeLaPreventa } from "./agente";
import { aplicarCambios, type FilaDeExploracion } from "./servidor";

/** El `origen` de cada llamada de «Regenerar»: así se ve aparte en el gasto de la IA. */
export const ORIGEN_DE_REGENERAR = "exploraciones/guia:regenerar-pregunta";


type BaseDeLaGuia = Awaited<ReturnType<typeof contextoParaLaGuia>>;

/** El nombre de un tema: la tarjeta del marco o la dimensión de la escala. */
function nombreDelTema(base: BaseDeLaGuia, para: string): string {
  if (esTarjeta(para)) return definicionEnElMarco(para, base.marco).etiqueta;
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
  const huecos = ctx.huecos.map((h) => h.clave);
  const enfoque = ctx.enfoque.map((d) => d.id);
  const plan = marco.clave === "venta" ? planDeLaGuiaDeLaPreventa(estado, loLeido.tests, escala, posiciones, sesionId) : null;
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
  const tema = p.apunta?.para ?? (p.tipo === "tarjeta" || p.tipo === "dimension" ? p.para : null);
  const dim = tema && !esTarjeta(tema) ? base.escala.areas.flatMap((a) => a.dimensiones).find((d) => d.id === tema) : undefined;
  const pos = tema ? base.posiciones[tema] : undefined;
  const entrada: EntradaDeUnaPregunta = {
    ctx: base.ctx,
    objetivo: {
      para: tema ?? p.para,
      nombre: tema ? nombreDelTema(base, tema) : (p.tema ?? "Pregunta de la guía"),
      ...(p.paso ? { paso: p.paso } : {}),
      motivo: p.motivo ?? null,
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
