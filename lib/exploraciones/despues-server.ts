/**
 * lib/exploraciones/despues-server.ts — Nexus propone el desafío principal y los temas por retomar de una sesión desde
 * lo que leyó de su reunión (2026-11-06, punto 15; despues-de-la-sesion.ts). SERVIDOR.
 *
 * Lee solo lo de ESTA exploración: la lectura de la reunión guardada en su propuesta (de la misma empresa por cómo se
 * leyó: el chokepoint de sesiones), la agenda de la sesión y sus notas. No guarda nada: la pantalla lo muestra para que
 * la persona lo confirme o lo cambie.
 */
import { getAnthropic } from "@/lib/anthropic";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { estaAveriguada } from "./agenda";
import { resultadoAveriguado } from "./resultado";
import { textoDeConQuien } from "./contexto-de-la-exploracion";
import { leerLoQueDejo, pedidoDeLoQueDejo, type DesafioDeLaSesion, type TemaPorRetomar } from "./despues-de-la-sesion";
import { EQUIPOS } from "./equipos";
import { claveDeNotaDeSesion } from "./notas-de-sesion";
import { estadoDesdeFila, leerExploracion } from "./servidor";
import { formasDeVoseo } from "@/lib/ui/voseo-formas";

export const AGENTE_DE_LO_QUE_DEJO = "exploracion-lo-que-dejo-la-sesion";

export async function proponerLoQueDejo(o: {
  exploracionId: string;
  sesionId: string;
  /** La clave de su reunión (`meet:…`, `hubspot:…`, `documento:…`). */
  reunion: string;
  email: string | null;
}): Promise<{ ok: true; desafio: DesafioDeLaSesion; retomar: TemaPorRetomar[] } | { ok: false; status: number; error: string }> {
  const lectura = await leerExploracion(o.exploracionId);
  if (lectura.estado !== "ok") return { ok: false, status: 404, error: "La exploración ya no existe." };
  const fila = lectura.fila;
  const estado = estadoDesdeFila(fila);
  const leida = estado.propuesta.lecturas[o.reunion];
  if (!leida?.resumen?.trim()) return { ok: false, status: 409, error: "Esta reunión todavía no se leyó: escribe tú el desafío, o léela primero." };
  const sesion = estado.contenido.sesiones.find((s) => s.id === o.sesionId) ?? null;
  // La reunión tiene que ser la de esa sesión (si la sesión ya la tiene unida): no se mezcla una sesión con otra.
  if (sesion?.reunion && `${sesion.reunion.origen}:${sesion.reunion.id}` !== o.reunion) return { ok: false, status: 400, error: "Esa reunión no es la de esta sesión." };
  const agenda = sesion ? estado.propuesta.guias[sesion.id]?.agenda : undefined;
  const cosas = agenda ? agenda.bloques.flatMap((b) => b.averiguar) : [];
  const personas = [
    ...estado.contenido.sesiones.map((s) => textoDeConQuien(s.conQuien)).filter((x): x is string => !!x),
    ...estado.contenido.sesiones.map((s) => (s.equipo ? `Equipo: ${EQUIPOS[s.equipo].nombre}` : null)).filter((x): x is string => !!x),
  ];
  const ctx = {
    empresa: fila.client.name,
    objetivoDeLaExploracion: estado.contenido.contexto?.objetivo ?? null,
    objetivoDeLaSesion: sesion?.objetivo ?? leida.objetivo ?? null,
    conQuien: textoDeConQuien(sesion?.conQuien),
    resumen: leida.resumen.slice(0, 6000),
    averiguado: cosas.filter((c) => estaAveriguada(c, sesion?.hechas)).map((c) => c.que),
    sinAveriguar: cosas.filter((c) => !estaAveriguada(c, sesion?.hechas)).map((c) => c.que),
    notas: sesion ? (estado.contenido.notas[claveDeNotaDeSesion(sesion.id)] ?? "").slice(0, 2000) || null : null,
    personas: [...new Set(personas)].slice(0, 12),
    resultadoSinMarcar: resultadoAveriguado(agenda, sesion?.hechas) === false,
  };
  const ia = { agentSlug: AGENTE_DE_LO_QUE_DEJO, clientId: fila.clientId, projectId: fila.projectId, triggeredByEmail: o.email, origen: "exploraciones/despues:lo-que-dejo" };
  const pedir = (aviso = "") => conContextoDeIA(ia, () => getAnthropic().messages.create(pedidoDeLoQueDejo(ctx, aviso)));
  let r = leerLoQueDejo(await pedir());
  const voseo = (x: typeof r) => (x ? formasDeVoseo([x.desafio.texto, ...x.desafio.falta, ...x.retomar.flatMap((t) => [t.tema, t.donde])].join("\n")).filter((w) => !/r[áa]s?$/i.test(w)) : []);
  if (voseo(r).length) {
    const otra = leerLoQueDejo(await pedir(`\n\nEn tu intento anterior escribiste en voseo (${voseo(r).slice(0, 5).join(", ")}). Escribe todo en tuteo.`));
    if (otra) r = otra;
  }
  if (!r) return { ok: false, status: 502, error: "Nexus no devolvió el desafío. Vuelve a intentarlo." };
  return { ok: true, ...r };
}
