/**
 * lib/exploraciones/correo-de-seguimiento.ts — el correo que se le manda al cliente después de una
 * reunión de exploración (Elías, 2026-10-07): qué entendimos, lo que se acordó y los próximos pasos (la
 * minuta), las preguntas que quedaron abiertas y la próxima reunión, o una sesión extra para profundizar.
 * PURO: lo usan el servidor (qué va al agente, cómo se arma el texto) y la pantalla (avisos y enlace).
 *
 * El correo lo LEE EL CLIENTE. La defensa no es el prompt: al agente solo le llega lo que el cliente
 * puede leer (`insumosDelCorreo`): lo que leyó de la reunión, lo que respondió el cliente y lo que quedó
 * abierto, sin el presupuesto ni quién decide, sin las objeciones, las hipótesis, los niveles de la escala
 * ni las notas libres del vendedor. Lo arma el agente y lo revisa y lo manda una persona: Nexus no envía.
 *
 * Desde la memoria de la cuenta (etapa 3, 2026-10-10) también le llegan, de ESA reunión, los acuerdos y las decisiones
 * de su minuta (sin riesgos) y los compromisos que guardó su lectura de seguimiento (sin la cita), y lo que Nexus ya
 * sabe de la cuenta con el alcance del cliente (la ficha confirmada, sin lo interno ni la postura). ⛔ Nunca lee Tareas.
 */
import { claveDeNotaDePregunta } from "./notas-de-sesion";
import { normalizarTexto, propuestaVigente, type EstadoDeExploracion, type LecturaDeReunion } from "./contenido";
import { proximaReunion, separarPregunta, type GuiaDeLaSesion, type SesionPlaneada } from "./guia";
import { voseoEnProsa } from "@/lib/ui/voseo-formas";
import { esDeNuestroEquipo, esRecursoDeCalendario } from "@/lib/sessions/dominio-propio";
import { recortarTranscripcion } from "@/lib/sessions/recortar-transcripcion";

export const MAX_ASUNTO_DEL_CORREO = 200;
export const MAX_CUERPO_DEL_CORREO = 10_000;
export const MAX_DESTINATARIOS = 10;
/** Cuántas preguntas abiertas se le ofrecen al agente para elegir. */
export const MAX_PREGUNTAS_ABIERTAS = 10;
/** Cuántas van en el correo: más no se contestan por correo. */
export const MAX_PREGUNTAS_EN_EL_CORREO = 4;

/**
 * Lo que se habla en la reunión pero no se le escribe al cliente: el presupuesto y quién decide (lo
 * interno de la exploración, como en la propuesta). Una pregunta que apunta acá no va al correo.
 */
const PARA_INTERNO: ReadonlySet<string> = new Set(["presupuesto", "autoridad", "objeciones", "particularidades", "hipotesis", "apertura"]);

export function esParaInterno(para: string | undefined | null): boolean {
  return !!para && PARA_INTERNO.has(para);
}

// ── A quién va ────────────────────────────────────────────────────────────────

const NO_ES_UNA_PERSONA = /no-?reply|notetaker|fireflies|otter\.ai|calendar-notification|@resource\.|@group\./i;
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Los correos del cliente que estuvieron en la reunión: sin Smarteam, sin salas ni grabadores. */
export function paraDeLaReunion(participantes: readonly string[]): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const p of participantes) {
    const e = p.trim().toLowerCase();
    if (!CORREO.test(e) || esDeNuestroEquipo(e) || esRecursoDeCalendario(e) || NO_ES_UNA_PERSONA.test(e) || vistos.has(e)) continue;
    vistos.add(e);
    out.push(e);
  }
  return out.slice(0, MAX_DESTINATARIOS);
}

// ── Lo que se le da al agente ─────────────────────────────────────────────────

/** Un compromiso de ESTA reunión, como lo guardó la lectura de seguimiento: sin la cita. */
export interface CompromisoDelCorreo {
  texto: string;
  lado: "cliente" | "smarteam";
  /** El nombre de quien se comprometió, si se dijo. */
  quien: string | null;
  /** AAAA-MM-DD, si se dijo. */
  fecha: string | null;
}

export interface InsumosDelCorreo {
  /** Lo que el agente ya leyó de la reunión (su resumen), si la leyó. */
  resumen: string | null;
  /**
   * La minuta de ESTA reunión: solo los acuerdos y las decisiones (nunca los riesgos), y sin los que traen un monto.
   * Solo de una reunión de Meet que fue CON EL CLIENTE; si no, null.
   */
  minuta: { acuerdos: string[]; decisiones: string[] } | null;
  /** Los compromisos que dejó la lectura de seguimiento de ESTA reunión, de los dos lados, sin la cita. Nunca de Tareas. */
  compromisos: CompromisoDelCorreo[];
  /**
   * Lo que Nexus ya sabe de la cuenta (lib/memoria, alcance del cliente: la ficha confirmada sin lo interno ni la
   * postura), para no repreguntar. "" si no hay nada.
   */
  cuenta: string;
  /** Lo que respondió el cliente: de la lectura y de lo que se anotó en «En vivo», pregunta por pregunta. */
  respuestas: { pregunta: string; respuesta: string }[];
  /** Lo de «Quedó abierto»: lo que no se preguntó, lo que el agente vio que se dijo sin explorar y lo llevado a la próxima sesión. */
  preguntasAbiertas: string[];
  /** El siguiente paso acordado, si tiene fecha y no pasó. */
  siguientePaso: { que: string; fecha: string | null; conQuien: string | null } | null;
  /** La próxima reunión con fecha: la próxima sesión planeada o, si no hay, la agenda de HubSpot. */
  proxima: { titulo: string | null; fecha: string } | null;
}

/** La pregunta de un punto de «Quedó abierto»: sin «No se preguntó.» y, si trae «Qué preguntar:», solo la pregunta. */
export function textoDeLaPreguntaAbierta(t: string): string {
  const sinPrefijo = t.replace(/^\s*no se pregunt[oó]\.\s*/i, "");
  const { dicho, pregunta } = separarPregunta(sinPrefijo);
  return (pregunta ?? dicho).trim();
}

function preguntaDeLaGuia(guia: GuiaDeLaSesion | null | undefined, para: string): string | null {
  if (!guia) return null;
  const p = guia.preguntas.find((x) => x.para === para)?.pregunta;
  if (p) return p;
  const v = guia.loVendido?.find((x) => x.id === para);
  return v ? `${v.tema}: ${v.pregunta}` : null;
}

/**
 * Lo que el agente del correo puede leer de la exploración, y nada más. `sesionId` es la sesión de la
 * reunión (sin ella, una reunión suelta: no hay respuestas anotadas ni puntos llevados).
 */
export function insumosDelCorreo(
  estado: EstadoDeExploracion,
  o: {
    lectura: LecturaDeReunion | null;
    sesionId: string | null;
    hoy: string;
    agenda: readonly { titulo: string; inicio: string }[];
    /** Lo que dejó la reunión (su minuta y los compromisos de su lectura de seguimiento). Lo lee el servidor. */
    deLaReunion?: { minuta?: InsumosDelCorreo["minuta"]; compromisos?: readonly CompromisoDelCorreo[] };
    /** La memoria de la cuenta, ya armada con el alcance del cliente. */
    cuenta?: string;
  },
): InsumosDelCorreo {
  const c = estado.contenido;
  const lectura = o.lectura;
  const guia = o.sesionId ? estado.propuesta.guias[o.sesionId] : null;

  // Lo que respondió el cliente: lo que leyó el agente y lo que se anotó durante la reunión.
  const respuestas: InsumosDelCorreo["respuestas"] = [];
  for (const x of lectura?.cobertura ?? []) {
    if (x.respondida && x.detalle && !esParaInterno(x.para)) respuestas.push({ pregunta: x.pregunta, respuesta: x.detalle });
  }
  if (o.sesionId) {
    const prefijo = claveDeNotaDePregunta(o.sesionId, "");
    for (const [k, v] of Object.entries(c.notas)) {
      if (!k.startsWith(prefijo) || !v.trim()) continue;
      const para = k.slice(prefijo.length);
      if (!para || esParaInterno(para)) continue;
      const pregunta = lectura?.cobertura.find((x) => x.para === para)?.pregunta ?? preguntaDeLaGuia(guia, para);
      if (pregunta) respuestas.push({ pregunta, respuesta: v.trim().slice(0, 600) });
    }
  }

  /* Lo que quedó abierto, lo mismo que muestra «Quedó abierto»: lo planeado que no se preguntó, lo que el
     agente vio que se dijo en ESTA reunión sin explorar (sin descartar) y lo que se llevó a la próxima sesión. */
  const candidatas: string[] = [];
  for (const x of lectura?.cobertura ?? []) if (!x.respondida && !esParaInterno(x.para)) candidatas.push(x.pregunta);
  if (lectura) {
    for (const it of propuestaVigente(estado)) {
      const deEsta = it.fuentes.some((f) => f.etiqueta === lectura.etiqueta);
      if (deEsta && it.destino.tipo === "casilla" && it.destino.clave === "noExplorado" && typeof it.valor === "string") {
        candidatas.push(textoDeLaPreguntaAbierta(it.valor));
      }
    }
  }
  if (o.sesionId) {
    for (const s of c.sesiones) {
      for (const t of s.explorar ?? []) {
        if (s.explorarDe?.[t] !== o.sesionId || esParaInterno(s.explorarPara?.[t])) continue;
        candidatas.push(textoDeLaPreguntaAbierta(t));
      }
    }
  }
  const vistas = new Set<string>();
  const preguntasAbiertas = candidatas.filter((t) => {
    const k = normalizarTexto(t);
    if (!k || vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });

  const paso = c.casillas.siguientePaso;
  const siguientePaso =
    paso?.que?.trim() && paso.fecha && paso.fecha >= o.hoy ? { que: paso.que.trim(), fecha: paso.fecha, conQuien: paso.conQuien?.trim() || null } : null;

  const otras: SesionPlaneada[] = c.sesiones.filter((s) => s.id !== o.sesionId);
  const futura = o.agenda.filter((a) => a.inicio.slice(0, 10) >= o.hoy);
  const p = proximaReunion(otras, futura, o.hoy);
  /* El título de un evento del calendario no viaja al correo (el evento puede venir de cualquier calendario
     y nombrar a otro cliente): va el que escribió la persona en la sesión, o el de la agenda de HubSpot de la
     empresa. Sin ninguno, el correo dice solo la fecha. */
  const titulo = p.desde === "sesion" ? otras.find((s) => s.id === p.sesionId)?.titulo?.trim() || null : p.titulo;
  const proxima = p.fecha && p.fecha.slice(0, 10) >= o.hoy ? { titulo, fecha: p.fecha } : null;

  const minuta = o.deLaReunion?.minuta ?? null;
  return {
    resumen: lectura?.resumen?.trim() || null,
    minuta: minuta && (minuta.acuerdos.length || minuta.decisiones.length) ? minuta : null,
    compromisos: (o.deLaReunion?.compromisos ?? []).slice(0, MAX_COMPROMISOS_EN_LOS_INSUMOS),
    cuenta: o.cuenta?.trim() ?? "",
    respuestas: respuestas.slice(0, 16),
    preguntasAbiertas: preguntasAbiertas.slice(0, MAX_PREGUNTAS_ABIERTAS),
    siguientePaso,
    proxima,
  };
}

/**
 * La reunión que lee el agente: las notas (resumen, decisiones y próximos pasos) y la transcripción.
 * Si no entra, se queda el principio y, sobre todo, el FINAL de la transcripción: ahí se acuerda qué sigue.
 * Vive en lib/sessions/recortar-transcripcion.ts (lo usa también el avance del cronograma); acá se reexporta.
 */
export const recortarLaReunion = recortarTranscripcion;

// ── Lo que dejó la reunión (memoria de la cuenta, etapa 3) ─────────────────────

/** Cuántos compromisos de la reunión se le dan al agente (la lectura guarda como mucho 8). */
export const MAX_COMPROMISOS_EN_LOS_INSUMOS = 8;

/** Los ítems de un campo Json de la minuta: [{ text }] o strings. */
function itemsDeLaMinuta(v: unknown): string[] {
  const lista = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
  return lista
    .map((x) => (typeof x === "string" ? x : x && typeof x === "object" && typeof (x as { text?: unknown }).text === "string" ? (x as { text: string }).text : ""))
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * De la minuta de la reunión, lo que puede ir al correo: los acuerdos y las decisiones, sin los riesgos y sin lo que trae
 * un monto (los precios van en la propuesta). null si no queda nada.
 */
export function minutaParaElCorreo(m: { agreements: unknown; decisions: unknown } | null | undefined): InsumosDelCorreo["minuta"] {
  if (!m) return null;
  const limpio = (v: unknown) => itemsDeLaMinuta(v).filter((t) => !MONTO.test(t)).slice(0, 10);
  const acuerdos = limpio(m.agreements);
  const decisiones = limpio(m.decisions);
  return acuerdos.length || decisiones.length ? { acuerdos, decisiones } : null;
}

/**
 * Los compromisos que guardó la lectura de seguimiento de la reunión (`AgentRun.output` del agente post-sesión: la salida
 * `{ salida: { compromisos } }`), sin la cita ni el correo de quien se comprometió, y sin lo que trae un monto. Tolera
 * una salida vieja, a medias o rota: lo que no se entiende no va. Nunca sale de Tareas.
 */
export function compromisosDeLaLectura(output: unknown): CompromisoDelCorreo[] {
  let crudo: unknown = output;
  if (typeof output === "string") {
    try {
      crudo = JSON.parse(output);
    } catch {
      return [];
    }
  }
  const salida = crudo && typeof crudo === "object" ? (crudo as { salida?: unknown }).salida : null;
  const lista = salida && typeof salida === "object" ? (salida as { compromisos?: unknown }).compromisos : null;
  if (!Array.isArray(lista)) return [];
  const out: CompromisoDelCorreo[] = [];
  for (const c of lista) {
    if (!c || typeof c !== "object") continue;
    const x = c as Record<string, unknown>;
    const texto = typeof x.que === "string" ? x.que.trim() : "";
    if (!texto || MONTO.test(texto) || (x.quien !== "CLIENTE" && x.quien !== "SMARTEAM")) continue;
    const quien = typeof x.responsable === "string" && x.responsable.trim() ? x.responsable.trim().slice(0, 80) : null;
    const fecha = typeof x.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.fecha) ? x.fecha : null;
    out.push({ texto: texto.slice(0, 300), lado: x.quien === "SMARTEAM" ? "smarteam" : "cliente", quien, fecha });
    if (out.length >= MAX_COMPROMISOS_EN_LOS_INSUMOS) break;
  }
  return out;
}

// ── El texto ──────────────────────────────────────────────────────────────────

/** Lo que escribe el agente, en partes. El correo lo arma `componerElCorreo`. */
export interface PartesDelCorreo {
  asunto: string;
  saludo: string;
  apertura: string;
  entendimos: string[];
  acuerdos: string[];
  proximosPasos: { que: string; quien: string; cuando: string }[];
  preguntas: string[];
  agenda: string;
  cierre: string;
}

/** El correo entero, en texto plano (pega bien en cualquier cliente de correo). */
export function componerElCorreo(p: PartesDelCorreo, firma: string | null): { asunto: string; cuerpo: string } {
  const bloques: string[] = [p.saludo, p.apertura];
  if (p.entendimos.length) bloques.push(["Lo que entendimos", ...p.entendimos.map((x) => `• ${x}`)].join("\n"));
  if (p.acuerdos.length) bloques.push(["Lo que acordamos", ...p.acuerdos.map((x) => `• ${x}`)].join("\n"));
  if (p.proximosPasos.length) {
    bloques.push(
      [
        "Próximos pasos",
        ...p.proximosPasos.map((x) => {
          const quien = [x.quien, x.cuando].filter((s) => s.trim()).join(", ");
          return `• ${x.que.replace(/\.$/, "")}${quien ? ` — ${quien}` : ""}`;
        }),
      ].join("\n"),
    );
  }
  if (p.preguntas.length) bloques.push(["Preguntas que quedaron abiertas", ...p.preguntas.map((x, i) => `${i + 1}. ${x}`)].join("\n"));
  bloques.push(p.agenda, p.cierre, firma ? `${firma}\nSmarteam` : "El equipo de Smarteam");
  const cuerpo = bloques
    .map((b) => b.trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MAX_CUERPO_DEL_CORREO);
  return { asunto: p.asunto.trim().slice(0, MAX_ASUNTO_DEL_CORREO), cuerpo };
}

/** El voseo del correo: solo lo que casi seguro lo es (lib/ui/voseo-formas.ts › `voseoEnProsa`). */
export function voseoEnElCorreo(texto: string): string[] {
  return voseoEnProsa(texto);
}

const MONTO = /(?:US\$|USD|\$|₡|€)\s?\d|\b\d[\d.,]*\s?(?:mil\s+)?(?:d[oó]lares|colones|euros|usd)\b/i;
const POR_COMPLETAR = /\[[^\]\n]{1,40}\]/;

/**
 * Lo que conviene mirar antes de mandarlo: un monto (los precios van en la propuesta), un espacio por
 * completar y el voseo. Solo avisa: el correo lo manda una persona.
 */
export function avisosDelCorreo(asunto: string, cuerpo: string): string[] {
  const texto = `${asunto}\n${cuerpo}`;
  const avisos: string[] = [];
  if (MONTO.test(texto)) avisos.push("Menciona un monto: revisa que no sea un precio. Los precios van en la propuesta.");
  const hueco = POR_COMPLETAR.exec(texto);
  if (hueco) avisos.push(`Tiene un espacio por completar: ${hueco[0]}.`);
  const voseo = voseoEnElCorreo(texto);
  if (voseo.length) avisos.push(`Tiene voseo (${voseo.slice(0, 4).map((w) => `«${w}»`).join(", ")}): al cliente se le tutea.`);
  return avisos;
}

/** Hasta dónde un enlace `mailto:` abre bien en Outlook y en Windows. */
const LARGO_DEL_ENLACE = 1900;

/**
 * El enlace que abre el correo del navegador o de la computadora. Si con el cuerpo no entra, va sin él
 * (`conCuerpo: false`): la pantalla lo copia antes y dice que se pegue.
 */
export function enlaceDeCorreo(para: readonly string[], asunto: string, cuerpo: string): { href: string; conCuerpo: boolean } {
  // Las direcciones ya pasaron `paraDeLaReunion` (sin espacios ni signos raros): van tal cual.
  const base = `mailto:${para.join(",")}?subject=${encodeURIComponent(asunto)}`;
  const completo = `${base}&body=${encodeURIComponent(cuerpo)}`;
  return completo.length <= LARGO_DEL_ENLACE ? { href: completo, conCuerpo: true } : { href: base, conCuerpo: false };
}
