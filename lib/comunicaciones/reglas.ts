/**
 * lib/comunicaciones/reglas.ts — las reglas de la copia de las COMUNICACIONES de HubSpot (correos, notas y llamadas del
 * timeline de una empresa y de sus contactos). PURO: se prueba sin base ni HubSpot (reglas.test.ts).
 *
 * Iniciativa B de docs/roadmap.md; el plan, en docs/correos-en-el-contexto-plan.md. Lo que vive acá:
 *   · de qué cliente es una comunicación (invariante 1: de UNO, o de ninguno);
 *   · cómo se limpia el texto (sin HTML ni la cita del hilo) y qué se guarda;
 *   · qué correo merece que la IA lea sus compromisos (el filtro va ANTES, en código, para no gastar en cada correo);
 *   · el plan de la copia (crear, actualizar, dar de baja), sin borrar nunca una fila.
 */
import { createHash } from "node:crypto";

/** «reunion» (U7, 2026-10-25): una reunión de HubSpot con el resumen de Notetaker, que no llega por Meet (Zoom, Teams, o
 *  una de Meet cuya reunión en Nexus no tiene texto). Las reglas de cuándo se guarda: lib/comunicaciones/reuniones.ts. */
export const TIPOS_DE_COMUNICACION = ["correo", "nota", "llamada", "reunion"] as const;
export type TipoDeComunicacion = (typeof TIPOS_DE_COMUNICACION)[number];

export type DireccionDelCorreo = "enviado" | "recibido";

/** Se copia lo de los últimos 120 días (por la fecha de la comunicación). */
export const DIAS_DE_LA_VENTANA = 120;
/** Los compromisos solo se leen de un correo de los últimos 14 días: lo de antes ya no es un recordatorio. */
export const DIAS_PARA_LEER_COMPROMISOS = 14;
export const MAX_ASUNTO = 300;
export const MAX_TEXTO = 4_000;
/** Un correo con menos que esto no tiene un compromiso que leer. */
export const MIN_TEXTO_PARA_LEER = 40;
/** Cuántas veces se reintenta la lectura de compromisos de un correo que falló. */
export const MAX_INTENTOS_DE_COMPROMISOS = 3;

export const ROTULO_DEL_TIPO: Record<TipoDeComunicacion, string> = { correo: "Correo", nota: "Nota", llamada: "Llamada", reunion: "Reunión de HubSpot" };

/** «Correo enviado», «Correo recibido», «Nota», «Llamada», «Reunión de HubSpot». */
export function rotuloDeLaComunicacion(tipo: TipoDeComunicacion, direccion: DireccionDelCorreo | null): string {
  if (tipo !== "correo") return ROTULO_DEL_TIPO[tipo];
  return direccion === "recibido" ? "Correo recibido" : direccion === "enviado" ? "Correo enviado" : "Correo";
}

export { compromisosPrendidos, copiaPrendida, MOTIVO_COPIA_APAGADA, type Entorno } from "./banderas";

// ── La dirección de un correo ───────────────────────────────────────────────────

/** `hs_email_direction` de HubSpot: EMAIL y FORWARDED_EMAIL salen de Smarteam; INCOMING_EMAIL entra. */
export function direccionDelCorreo(hs: string | null | undefined): DireccionDelCorreo | null {
  const d = (hs ?? "").trim().toUpperCase();
  if (d === "INCOMING_EMAIL") return "recibido";
  if (d === "EMAIL" || d === "FORWARDED_EMAIL") return "enviado";
  return null;
}

// ── El texto ────────────────────────────────────────────────────────────────────

const ENTIDADES: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'" };

/** HTML a texto: saltos donde el HTML los pone, viñetas para las listas, sin etiquetas ni estilos. */
export function htmlATexto(html: string): string {
  return html
    .replace(/<\s*(style|script)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\n• ")
    .replace(/<\/\s*(p|div|ul|ol|li|tr|h[1-6]|blockquote)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(?:nbsp|amp|lt|gt|quot|apos|#39);/g, (e) => ENTIDADES[e] ?? e)
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n)));
}

/**
 * Donde empieza la cita del correo anterior: «El jue, 16 oct 2026 a las 10:00, Ana <…> escribió:», «On … wrote:»,
 * «-----Original Message-----», un bloque «De: … Enviado: …» o la primera línea que empieza con «>». Lo de ahí en adelante
 * es el hilo: ya está en su propio correo, y repetirlo confundiría quién dijo qué.
 */
const INICIO_DEL_HILO = [
  /^\s*(el|on)\s.{3,200}(escribi[oó]|wrote)\s*:\s*$/im,
  /^\s*-{2,}\s*(original message|mensaje original|forwarded message|mensaje reenviado)\s*-{2,}/im,
  /^\s*(de|from)\s*:.*\n\s*(enviado|sent|fecha|date)\s*:/im,
  /^\s*>/m,
];

/** El texto del correo sin la cita del hilo. */
export function sinElHilo(texto: string): string {
  let corte = texto.length;
  for (const re of INICIO_DEL_HILO) {
    const m = re.exec(texto);
    if (m && m.index < corte) corte = m.index;
  }
  return texto.slice(0, corte);
}

/** El texto listo para guardar: sin HTML, sin el hilo, sin espacios de más y cortado a `MAX_TEXTO`. null si no queda nada. */
export function limpiarTexto(crudo: { texto?: string | null; html?: string | null }, o: { sinHilo?: boolean } = {}): string | null {
  const base = crudo.texto?.trim() ? crudo.texto : crudo.html?.trim() ? htmlATexto(crudo.html) : "";
  if (!base) return null;
  const plano = /<[a-z][^>]*>/i.test(base) ? htmlATexto(base) : base;
  const sinHilo = o.sinHilo ? sinElHilo(plano.replace(/\r\n?/g, "\n")) : plano;
  const t = sinHilo
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!t) return null;
  return t.length > MAX_TEXTO ? `${t.slice(0, MAX_TEXTO - 1).trimEnd()}…` : t;
}

export function recortarAsunto(s: string | null | undefined): string | null {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > MAX_ASUNTO ? `${t.slice(0, MAX_ASUNTO - 1).trimEnd()}…` : t;
}

// ── De qué cliente es (invariante 1) ────────────────────────────────────────────

export type ClienteDeLaComunicacion =
  | { tipo: "uno"; clientId: string; por: "empresa" | "contacto" }
  | { tipo: "ambigua"; clientIds: string[] }
  | { tipo: "ninguno" };

/**
 * De qué cliente de Nexus es una comunicación. Primero las EMPRESAS de HubSpot a las que está asociada (las de un cliente
 * o un prospecto de Nexus): una → ese; dos o más clientes → ambigua (no se guarda). Sin ninguna empresa de un cliente,
 * los CONTACTOS asociados (la copia de contactos): de un solo cliente → ese; de dos o más → ambigua. Si no, de nadie.
 */
export function clienteDeLaComunicacion(
  a: { empresas: readonly string[]; contactos: readonly string[] },
  clientesPorEmpresa: ReadonlyMap<string, readonly string[]>,
  clientesPorContacto: ReadonlyMap<string, readonly string[]>,
): ClienteDeLaComunicacion {
  const porEmpresa = new Set(a.empresas.flatMap((e) => clientesPorEmpresa.get(e) ?? []));
  if (porEmpresa.size === 1) return { tipo: "uno", clientId: [...porEmpresa][0]!, por: "empresa" };
  if (porEmpresa.size > 1) return { tipo: "ambigua", clientIds: [...porEmpresa].sort() };
  const porContacto = new Set(a.contactos.flatMap((c) => clientesPorContacto.get(c) ?? []));
  if (porContacto.size === 1) return { tipo: "uno", clientId: [...porContacto][0]!, por: "contacto" };
  if (porContacto.size > 1) return { tipo: "ambigua", clientIds: [...porContacto].sort() };
  return { tipo: "ninguno" };
}

// ── La fila ─────────────────────────────────────────────────────────────────────

/** Lo que se guarda de una comunicación (sin el cliente ni el estado de sus compromisos). */
export interface DatosDeLaComunicacion {
  direccion: DireccionDelCorreo | null;
  ocurrioAt: Date;
  asunto: string | null;
  texto: string | null;
  autorEmail: string | null;
  deEmail: string | null;
  modificadoEnHubspot: Date | null;
  /** U7: con qué reunión de Meet se cruza (lib/comunicaciones/reuniones.ts). Solo una reunión o una llamada; no entra a la huella. */
  googleEventId?: string | null;
  codigoDeMeet?: string | null;
  /** U7: una llamada con lo que escribió la persona (su cuerpo): no se cruza con Meet, aunque tenga resumen. No se guarda. */
  conNotas?: boolean;
}

export function huellaDe(d: Pick<DatosDeLaComunicacion, "direccion" | "ocurrioAt" | "asunto" | "texto" | "autorEmail" | "deEmail">): string {
  const base = JSON.stringify([d.direccion, d.ocurrioAt.toISOString(), d.asunto ?? "", d.texto ?? "", d.autorEmail ?? "", d.deEmail ?? ""]);
  return createHash("sha256").update(base).digest("hex").slice(0, 32);
}

export interface ComunicacionLeida {
  tipo: TipoDeComunicacion;
  hubspotId: string;
  datos: DatosDeLaComunicacion;
  /** De qué cliente es (ya decidido con `clienteDeLaComunicacion`). */
  cliente: ClienteDeLaComunicacion;
}

export interface FilaExistente {
  tipo: TipoDeComunicacion;
  hubspotId: string;
  clientId: string;
  huella: string;
  vigente: boolean;
}

export interface PlanDeCopia {
  crear: { tipo: TipoDeComunicacion; hubspotId: string; clientId: string; datos: DatosDeLaComunicacion; huella: string }[];
  actualizar: { tipo: TipoDeComunicacion; hubspotId: string; clientId: string; datos: DatosDeLaComunicacion; huella: string; cambioDeCliente: boolean }[];
  /** Ya estaba y ahora es de dos clientes o de ninguno: queda `vigente = false`. */
  bajas: { tipo: TipoDeComunicacion; hubspotId: string }[];
  sinCambio: number;
  /** Las que son de dos o más clientes: no se guardan (invariante 1). */
  ambiguas: { tipo: TipoDeComunicacion; hubspotId: string; clientIds: string[] }[];
  /** Las que no son de ningún cliente de Nexus. */
  deNadie: number;
}

const k = (tipo: string, id: string) => `${tipo}:${id}`;

/** Qué hacer con lo que trajo la búsqueda. Lo que no vino no se toca: la búsqueda trae solo lo modificado. */
export function planDeCopia(existentes: readonly FilaExistente[], leidas: readonly ComunicacionLeida[]): PlanDeCopia {
  const porClave = new Map(existentes.map((e) => [k(e.tipo, e.hubspotId), e]));
  const plan: PlanDeCopia = { crear: [], actualizar: [], bajas: [], sinCambio: 0, ambiguas: [], deNadie: 0 };
  const vistas = new Set<string>();
  for (const l of leidas) {
    const clave = k(l.tipo, l.hubspotId);
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    const e = porClave.get(clave);
    if (l.cliente.tipo !== "uno") {
      if (l.cliente.tipo === "ambigua") plan.ambiguas.push({ tipo: l.tipo, hubspotId: l.hubspotId, clientIds: l.cliente.clientIds });
      else plan.deNadie++;
      if (e?.vigente) plan.bajas.push({ tipo: l.tipo, hubspotId: l.hubspotId });
      continue;
    }
    const huella = huellaDe(l.datos);
    if (!e) {
      plan.crear.push({ tipo: l.tipo, hubspotId: l.hubspotId, clientId: l.cliente.clientId, datos: l.datos, huella });
      continue;
    }
    if (e.huella === huella && e.clientId === l.cliente.clientId && e.vigente) {
      plan.sinCambio++;
      continue;
    }
    plan.actualizar.push({ tipo: l.tipo, hubspotId: l.hubspotId, clientId: l.cliente.clientId, datos: l.datos, huella, cambioDeCliente: e.clientId !== l.cliente.clientId });
  }
  return plan;
}

// ── ¿Merece que la IA lea sus compromisos? ──────────────────────────────────────

/** Una fecha escrita: «el martes», «15 de octubre», «15/10», «mañana», «la próxima semana», «a fin de mes». */
const UNA_FECHA =
  /\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|ma[nñ]ana|pasado ma[nñ]ana|esta semana|(la )?(pr[oó]xima|siguiente) semana|semana que viene|fin de mes|(el )?\d{1,2} de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|se(p)?tiembre|octubre|noviembre|diciembre)|\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?|monday|tuesday|wednesday|thursday|friday|tomorrow|next week)\b/i;

/** Una señal de compromiso: alguien dice qué va a hacer, o el correo recapitula lo acordado. */
const UN_COMPROMISO =
  /\b(agend(o|amos|aremos|ar|emos)|nos (reunimos|vemos|juntamos)|(te|les) (env[ií]o|enviar[eé]|enviamos|enviaremos|comparto|compartiremos|mando|mandar[eé])|quedamos|qued[oó] (agendad|pendiente)|acordamos|compromiso|entregaremos|entrega(mos|r[eé])|pr[oó]xim(o|os) pasos?|siguiente(s)? pasos?|minuta|confirmamos|programamos|coordinamos|(te|les) (confirmo|confirmaremos)|reuni[oó]n|sesi[oó]n|llamada|kick ?off)\b/i;

export type MotivoDeLaLectura = "lee" | "no_es_correo" | "no_es_enviado" | "vieja" | "sin_texto" | "sin_fecha_ni_compromiso" | "cuenta_sin_uso";

/**
 * ¿La IA lee los compromisos de esta comunicación? Solo un CORREO ENVIADO por Smarteam, de los últimos 14 días, con
 * texto, que nombra una fecha o un compromiso, y de una cuenta ACTIVA o USADA en Nexus (U8, decisión de Elías del 24 oct:
 * se copian todos los correos, que no gasta, y la IA lee solo los de las cuentas que lo necesitan; la regla de qué cuenta
 * lo necesita es `cuentaQueLeeLaIA`). Lo demás se decide acá sin gastar. Sin `cuentaActiva`, no se mira (como antes).
 */
export function motivoDeLaLectura(
  c: { tipo: TipoDeComunicacion; direccion: DireccionDelCorreo | null; ocurrioAt: Date; asunto: string | null; texto: string | null },
  ahora: Date,
  o: { cuentaActiva?: boolean } = {},
): MotivoDeLaLectura {
  if (c.tipo !== "correo") return "no_es_correo";
  if (c.direccion !== "enviado") return "no_es_enviado";
  if (+ahora - +c.ocurrioAt > DIAS_PARA_LEER_COMPROMISOS * 86_400_000) return "vieja";
  const texto = c.texto ?? "";
  if (texto.trim().length < MIN_TEXTO_PARA_LEER) return "sin_texto";
  const todo = `${c.asunto ?? ""}\n${texto}`;
  if (!UNA_FECHA.test(todo) && !UN_COMPROMISO.test(todo)) return "sin_fecha_ni_compromiso";
  if (o.cuentaActiva === false) return "cuenta_sin_uso";
  return "lee";
}

/**
 * La versión de lo que la copia lee de cada tipo. Cuando cambia lo que se guarda de un tipo, su punto de partida se olvida
 * UNA vez y la corrida siguiente relee sus 120 días. Versión 2 (U7, 2026-10-25): las llamadas suman el resumen de
 * Notetaker; las que se descartaron antes por no tener cuerpo (el 89 %) no volverían a entrar si el punto siguiera.
 */
export const VERSION_DEL_CURSOR = 2;
const TIPOS_QUE_CAMBIARON_EN_LA_VERSION: Record<number, readonly TipoDeComunicacion[]> = { 2: ["llamada", "reunion"] };

/** Los tipos cuyo punto de partida se olvida, si el guardado es de la versión `guardada` (sin versión = la 1). */
export function tiposQueSeReleen(guardada: number): Set<TipoDeComunicacion> {
  const out = new Set<TipoDeComunicacion>();
  for (let n = guardada + 1; n <= VERSION_DEL_CURSOR; n++) for (const t of TIPOS_QUE_CAMBIARON_EN_LA_VERSION[n] ?? []) out.add(t);
  return out;
}

/** Cuántos días para atrás cuenta el trabajo en Nexus de una cuenta sin proyecto activo (su preventa o su exploración). */
export const DIAS_DE_USO_EN_NEXUS = 90;

/**
 * ¿La IA lee los correos de esta cuenta? (U8.) Sí si tiene un proyecto activo (la cartera de Customer Success, un
 * desarrollo), o si alguien trabajó su preventa o su exploración en Nexus en los últimos `DIAS_DE_USO_EN_NEXUS` días.
 * Un prospecto que solo está en HubSpot, o un cliente sin nada abierto, no: sus correos se copian igual, y los enviados
 * de los últimos 14 días vuelven a la cola el día en que alguien abre algo (la copia los reactiva en cada corrida). Es la
 * opción conservadora (gasta menos); se anota en DECISIONS «HubSpot como contexto y como aviso».
 */
export function cuentaQueLeeLaIA(c: { proyectosActivos: number; ultimaExploracionAt: Date | null }, ahora: Date): boolean {
  if (c.proyectosActivos > 0) return true;
  return !!c.ultimaExploracionAt && +ahora - +c.ultimaExploracionAt <= DIAS_DE_USO_EN_NEXUS * 86_400_000;
}

/** El estado inicial de los compromisos de una fila nueva (o que cambió de texto). */
export function estadoInicialDeCompromisos(motivo: MotivoDeLaLectura): "pendiente" | "no_aplica" {
  return motivo === "lee" ? "pendiente" : "no_aplica";
}
