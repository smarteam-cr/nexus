/**
 * lib/contexto/sugerencias-del-documento.ts — LAS REUNIONES QUE NEXUS SUGIERE para un documento del proyecto
 * (etapa 7 de la memoria de la cuenta; DECISIONS «Los documentos leen la memoria y solo las reuniones elegidas»).
 * PURO y client-safe: lo arma lib/contexto/sugerencias-del-documento-server.ts y lo prueban sin base.
 *
 * Desde la etapa 7, los seis documentos (`DESTINOS_SOLO_ELEGIDAS`) leen SOLO las reuniones que eligió una persona. Lo
 * que antes hacía el modo sugerido (meter toda reunión con el cliente) lo hacen estas sugerencias: se CALCULAN al leer,
 * se muestran arriba de la lista con «Usar» y «Descartar», y nunca escriben nada. `true` es el candado humano
 * (lib/sessions/session-project-locks.ts): solo lo escribe el clic de una persona.
 *
 * ── QUÉ SE SUGIERE ───────────────────────────────────────────────────────────
 *  · En el DIAGNÓSTICO, las reuniones de las sesiones de la exploración viva del proyecto: la que una persona unió a
 *    la sesión (elegida a mano, o la gemela de Meet de una de HubSpot) o la de su evento del calendario
 *    (`sesionUnidaALaReunion`). La ligadura por fecha NO cuenta: es una adivinanza. Motivo: «Sesión N de la
 *    exploración», con el mismo número que la pantalla de la exploración (`pestanasDeSesiones`).
 *  · En el DIAGNÓSTICO, desde el 2026-10-24 (L1 etapa 2 del roadmap, Liliana con CEMACO): TODAS las demás reuniones del
 *    proyecto CON EL CLIENTE (las de puertas adentro esperan un «Usar») que dejaron texto —transcripción o, sin ella, notas de Gemini (`lib/sessions/tiene-texto.ts`, el predicado
 *    único)—, sin tope. Motivo: «Reunión del proyecto» (y «solo notas» si no hay transcripción). Como las de la
 *    exploración, ENTRAN SOLAS (`reunionesQueEntranSolasAlDiagnostico`) y el panel las muestra con «Sacar»: quedaban
 *    fuera la Alineación, el Handoff y «Caso CEMACO» porque nadie las había elegido.
 *  · En TODOS, las reuniones con hechos abiertos que el registro de destinos (lib/seguimiento/destinos.ts) rutea a ese
 *    documento. Motivo: la frase del hecho más reciente.
 *  · En TODOS, después de las otras dos y sin repetirlas, las reuniones que el documento leía con la REGLA VIEJA (el
 *    modo sugerido de antes de la etapa 7: con el cliente, sin tocar, ya ocurrida; lib/contexto/migracion-de-reuniones.ts),
 *    las `SUGERIDAS_DE_LA_REGLA_VIEJA` más recientes. Motivo: «Reunión con el cliente en este proyecto». Así el panel
 *    tiene sugerencias desde el día del deploy (la tabla de hechos todavía no existía) y también en un proyecto nuevo.
 *    La migración del 2026-10-10 eligió las 6 más recientes con algo que leer de cada documento con contenido (no en
 *    el kickoff ni en las integraciones de antes del 2026-10-07, que no leían reuniones); el resto aparece acá.
 *    ⚠ La X sobre una elegida la deja en `null`, así que reaparece acá en el acto (suele ser de las más recientes):
 *    para que no vuelva, «Descartar». Pendiente de Elías si la X debe escribir `false` (DECISIONS › «La migración»).
 *
 * ── QUÉ NO ───────────────────────────────────────────────────────────────────
 *  · Una elegida (`true`): ya entra. Una desestimada (`false`): alguien ya dijo que no.
 *  · Una que todavía no ocurrió: no tiene nada que leer.
 *  · Una que no es de la membresía del proyecto: las reuniones vienen del chokepoint (`getProjectMemberSessions`), y
 *    una sesión de la exploración o un hecho que apunte a otra no se ofrece (así nunca se sugiere la de otro cliente).
 *  · Fuera de los seis documentos (el handoff, el cronograma, la exploración): nada.
 */
import { pestanasDeSesiones, type ReunionDeLaExploracion, type SesionPlaneada } from "@/lib/exploraciones/guia";
import { hoyEnCostaRica } from "@/lib/exploraciones/fechas";
import { sesionUnidaALaReunion } from "@/lib/exploraciones/lectura";
import { esReunionDePuertasAdentro } from "@/lib/sessions/candidatas-internas";
import { esSoloElegidas, type DestinoDeContexto } from "@/lib/sessions/destinos-de-contexto";
import { etiquetaDeSala } from "@/lib/sessions/etiqueta-de-sala";
import { queLeiaConLaReglaVieja } from "./migracion-de-reuniones";
import type { ClaseDeTexto } from "@/lib/sessions/tiene-texto";
import type { ClaveDeEquipo } from "@/lib/exploraciones/equipos";

/** Una reunión de la membresía del proyecto (la trae el chokepoint), con el afinado de ESTE documento. */
export interface ReunionDelProyecto {
  id: string;
  titulo: string;
  /** ms. */
  fecha: number;
  /** Quiénes estuvieron, con el organizador. */
  participantes: readonly string[];
  /** El afinado de este documento: `true` elegida, `false` desestimada, `null` sin tocar. */
  afinado: boolean | null;
}

/** Un hecho abierto ruteado a este documento: de qué reunión salió y qué dice. */
export interface HechoQueSugiere {
  /** null = un hecho que no salió de una reunión: no sugiere ninguna. */
  sessionId: string | null;
  frase: string;
}

export interface EntradaDeSugerencias {
  /** La membresía del proyecto (chokepoint), con el afinado del documento. */
  reuniones: readonly ReunionDelProyecto[];
  /** Las sesiones de la exploración viva del proyecto. Solo cuentan en el diagnóstico. */
  sesionesDeLaExploracion?: readonly SesionPlaneada[];
  /**
   * Los dominios de Smarteam: una reunión de puertas adentro no se liga sola a una sesión (para numerarlas) ni se sugiere
   * por la regla vieja (solo las con el cliente).
   */
  dominiosPropios?: ReadonlySet<string>;
  /** Los hechos abiertos que el registro rutea a este documento, el más reciente primero. */
  hechos?: readonly HechoQueSugiere[];
  /**
   * La clase de texto de cada reunión de la membresía (`claseDeTexto`, lib/sessions/tiene-texto.ts). Solo cuenta en el
   * diagnóstico: con ella entran solas las del proyecto con texto. Sin ella, ninguna por esta vía.
   */
  clasesDeTexto?: ReadonlyMap<string, ClaseDeTexto>;
  /**
   * ¿Se suma la regla vieja? `false` = no se sabe la sala (el servidor no pudo leer los dominios de Smarteam): sin
   * saber si fue con el cliente, no se sugiere. Por defecto sí.
   */
  reglaVieja?: boolean;
  /** ms. */
  ahora: number;
}

/**
 * `reunion`: la leía la regla vieja (una reunión con el cliente en este proyecto). `proyecto`: una reunión del proyecto con
 * texto, que en el diagnóstico entra sola (L1 etapa 2, 2026-10-24).
 */
export type FuenteDeLaSugerencia = "exploracion" | "proyecto" | "hecho" | "reunion";

/** Las fuentes que ENTRAN SOLAS al diagnóstico (el panel las muestra con «Sacar»); las demás esperan un «Usar». */
export const FUENTES_QUE_ENTRAN_SOLAS: readonly FuenteDeLaSugerencia[] = ["exploracion", "proyecto"];

/** El motivo de una reunión del proyecto que entra sola al diagnóstico. */
export function motivoDeLaReunionConTexto(clase: ClaseDeTexto): string {
  return clase === "solo_notas" ? "Reunión del proyecto · solo notas de Gemini" : "Reunión del proyecto";
}

export interface SugerenciaDeReunion {
  sessionId: string;
  /** Por qué la sugiere Nexus, en una línea. */
  motivo: string;
  fuente: FuenteDeLaSugerencia;
}

/** Cuántas sugerencias como mucho: más no se revisan, y la lista de abajo es la que importa. */
export const TOPE_DE_SUGERENCIAS = 10;
/** El largo del motivo que sale de un hecho (la frase del hecho, recortada). */
export const LARGO_DEL_MOTIVO = 160;
/** Cuántas sugiere como mucho la regla vieja (las más recientes que no sugirió otra fuente). */
export const SUGERIDAS_DE_LA_REGLA_VIEJA = 8;
/** El motivo de una sugerencia de la regla vieja. */
export const MOTIVO_DE_LA_REGLA_VIEJA = "Reunión con el cliente en este proyecto";

function recortar(texto: string, largo: number): string {
  const t = texto.replace(/\s+/g, " ").trim();
  return t.length <= largo ? t : `${t.slice(0, largo - 1).trimEnd()}…`;
}

/** «Sesión 2 de la exploración». */
export function motivoDeLaSesion(numero: number): string {
  return `Sesión ${numero} de la exploración`;
}

/** La frase del hecho más reciente y, si hay más de la misma reunión, cuántos. */
export function motivoDeLosHechos(frases: readonly string[]): string {
  const primera = recortar(frases[0] ?? "", LARGO_DEL_MOTIVO);
  const mas = frases.length - 1;
  return mas > 0 ? `${primera} (y ${mas} ${mas === 1 ? "hecho más" : "hechos más"})` : primera;
}

/**
 * Las reuniones de la membresía que son la de una sesión de la exploración, con el número de la sesión. Puro. Solo lo
 * que una persona unió o el evento del calendario (`sesionUnidaALaReunion`); una sesión que «no se hizo» no cuenta.
 * El número sale de `pestanasDeSesiones`, la misma regla que pinta la pantalla de la exploración.
 */
export function reunionesDeLasSesiones(
  sesiones: readonly SesionPlaneada[],
  reuniones: readonly Pick<ReunionDelProyecto, "id" | "titulo" | "fecha" | "participantes">[],
  ahora: number,
  dominiosPropios: ReadonlySet<string> = new Set(),
): { sessionId: string; numero: number; equipo?: ClaveDeEquipo }[] {
  if (!sesiones.length || !reuniones.length) return [];
  const comoExploracion: ReunionDeLaExploracion[] = reuniones.map((r) => ({
    id: r.id,
    titulo: r.titulo,
    fecha: new Date(r.fecha).toISOString(),
    origen: "meet",
    leida: false,
    ...(esReunionDePuertasAdentro({ participants: [...r.participantes] }, dominiosPropios) ? { puertasAdentro: true as const } : {}),
  }));
  const numeros = new Map<string, number>();
  for (const p of pestanasDeSesiones(sesiones, comoExploracion, hoyEnCostaRica(new Date(ahora)))) {
    if (p.sesion && !p.noSeHizo && p.numero > 0) numeros.set(p.sesion.id, p.numero);
  }
  const out: { sessionId: string; numero: number; equipo?: ClaveDeEquipo }[] = [];
  const usadas = new Set<string>();
  for (const s of sesiones) {
    const numero = numeros.get(s.id);
    if (!numero) continue;
    const r = reuniones.find((x) => !usadas.has(x.id) && sesionUnidaALaReunion(s, { id: x.id, fecha: new Date(x.fecha).toISOString() }));
    if (!r) continue;
    usadas.add(r.id);
    // El equipo del cliente de la sesión (lib/exploraciones/equipos.ts): el diagnóstico lee por equipo (L5, 2026-10-25).
    out.push({ sessionId: r.id, numero, ...(s.equipo ? { equipo: s.equipo } : {}) });
  }
  return out.sort((a, b) => a.numero - b.numero);
}

/**
 * LAS SUGERENCIAS DE UN DOCUMENTO. Puro. Primero las sesiones de la exploración (solo el diagnóstico, por número),
 * después las reuniones con hechos abiertos (en el orden de los hechos: el más reciente primero) y al final las que
 * leía la regla vieja (las más recientes, con el cliente). Una reunión se sugiere una sola vez. Nunca una elegida, una
 * desestimada, una futura ni una que no sea de la membresía.
 */
export function sugerenciasDelDocumento(destino: DestinoDeContexto, e: EntradaDeSugerencias): SugerenciaDeReunion[] {
  if (!esSoloElegidas(destino)) return [];
  const libres = new Map(e.reuniones.filter((r) => r.afinado === null && r.fecha <= e.ahora).map((r) => [r.id, r]));
  if (!libres.size) return [];
  const out = new Map<string, SugerenciaDeReunion>();

  if (destino === "diagnostico" && e.sesionesDeLaExploracion?.length) {
    // Se numera contra TODA la membresía (también las elegidas): el número tiene que ser el de la pantalla.
    for (const { sessionId, numero } of reunionesDeLasSesiones(e.sesionesDeLaExploracion, e.reuniones, e.ahora, e.dominiosPropios)) {
      if (libres.has(sessionId) && !out.has(sessionId)) {
        out.set(sessionId, { sessionId, motivo: motivoDeLaSesion(numero), fuente: "exploracion" });
      }
    }
  }

  /* Las del proyecto con texto (L1 etapa 2): sin tope, de la más reciente a la más vieja. Van fuera del tope de las
     sugerencias porque entran solas: el panel las muestra todas, cada una con su «Sacar». */
  const entranSolas: SugerenciaDeReunion[] = [];
  /* Solo las que fueron CON EL CLIENTE (la revisión del 25 oct): el diagnóstico lo lee el cliente, y una reunión de puertas
     adentro (la Alineación, el Handoff, una revisión de precio) entra solo si una persona la elige con «Usar». Sin los
     dominios de Smarteam no se sabe la sala: no entra ninguna sola. */
  if (destino === "diagnostico" && e.clasesDeTexto && e.dominiosPropios) {
    const propiosDeLaSala = e.dominiosPropios;
    const conTexto = [...libres.values()]
      .filter((r) => !out.has(r.id) && (e.clasesDeTexto!.get(r.id) ?? "nada") !== "nada")
      .filter((r) => etiquetaDeSala({ participants: [...r.participantes] }, propiosDeLaSala) === "CON EL CLIENTE")
      .sort((a, b) => b.fecha - a.fecha || a.id.localeCompare(b.id));
    for (const r of conTexto) {
      entranSolas.push({ sessionId: r.id, motivo: motivoDeLaReunionConTexto(e.clasesDeTexto.get(r.id)!), fuente: "proyecto" });
    }
  }
  const yaVan = new Set([...out.keys(), ...entranSolas.map((s) => s.sessionId)]);

  const porReunion = new Map<string, string[]>();
  for (const h of e.hechos ?? []) {
    const frase = h.frase?.trim();
    if (!h.sessionId || !frase || !libres.has(h.sessionId) || yaVan.has(h.sessionId)) continue;
    porReunion.set(h.sessionId, [...(porReunion.get(h.sessionId) ?? []), frase]);
  }
  for (const [sessionId, frases] of porReunion) {
    if (!out.has(sessionId)) out.set(sessionId, { sessionId, motivo: motivoDeLosHechos(frases), fuente: "hecho" });
  }

  /* Las que entran solas van primero (las de la exploración, después las del proyecto) y no cuentan para el tope: el tope
     es de lo que espera un «Usar». */
  const conLasSolas = (resto: SugerenciaDeReunion[]): SugerenciaDeReunion[] => {
    const solasExploracion = resto.filter((s) => s.fuente === "exploracion");
    const otras = resto.filter((s) => s.fuente !== "exploracion");
    return [...solasExploracion, ...entranSolas, ...otras.slice(0, TOPE_DE_SUGERENCIAS)];
  };

  // La regla vieja: las con el cliente, sin tocar y ya ocurridas (`libres` ya dejó afuera elegidas y desestimadas).
  if (e.reglaVieja === false) return conLasSolas([...out.values()]);
  const propios = e.dominiosPropios ?? new Set<string>();
  const deLaReglaVieja = queLeiaConLaReglaVieja(
    [...libres.values()].map((r) => ({ ...r, conElCliente: etiquetaDeSala({ participants: [...r.participantes] }, propios) === "CON EL CLIENTE" })),
    e.ahora,
  ).filter((r) => !out.has(r.id) && !yaVan.has(r.id));
  for (const r of deLaReglaVieja.slice(0, SUGERIDAS_DE_LA_REGLA_VIEJA)) {
    out.set(r.id, { sessionId: r.id, motivo: MOTIVO_DE_LA_REGLA_VIEJA, fuente: "reunion" });
  }

  return conLasSolas([...out.values()]);
}
