/**
 * lib/nexus-chat/acciones.ts — ACCIONES SUGERIDAS a una persona en una cuenta, según sus tareas y el siguiente paso de su
 * equipo (paso 3 del chat de Nexus en docs/roadmap.md). PURO, sin IA: cada acción sale de un dato y dice de cuál.
 *
 *   1. lo que prometió el cliente y está vencido (o vence en 3 días), cuando el seguimiento lo lleva esta persona:
 *      «Recuérdale…», con el mensaje de WhatsApp listo para copiar;
 *   2. sus tareas de Smarteam vencidas: revisarlas (cerrarlas o pasarlas de semana);
 *   3. el siguiente paso de su equipo en la cuenta, si no hay o se venció;
 *   4. lo suyo de esta semana.
 *
 * Como mucho 5, en ese orden. ⛔ Nexus no envía nada: el mensaje se copia o abre WhatsApp con el texto, y lo manda la
 * persona. El mensaje no lleva nada interno: solo el título de lo que quedaron y su fecha.
 */

export const MAX_ACCIONES = 5;
/** Lo del cliente que vence en estos días ya se recuerda. */
export const DIAS_ANTES_DE_RECORDAR = 3;

export interface TareaParaAcciones {
  numero: number;
  titulo: string;
  /** El estado crudo de Tareas (pendiente, en_curso…). */
  estado: string;
  /** Lunes `AAAA-MM-DD` de su semana, o null. */
  semana: string | null;
  venceEl: string | null;
  responsableEmail: string | null;
  lado: string;
}

export interface PasoParaAcciones {
  equipo: string;
  que: string;
  fecha: string | null;
}

export type TipoDeAccion = "recordar-al-cliente" | "revisar-tarea" | "siguiente-paso" | "esta-semana";

export interface AccionSugerida {
  tipo: TipoDeAccion;
  titulo: string;
  /** De dónde sale, en una línea. */
  porque: string;
  /** La tarea de la que sale, si sale de una. */
  tarea?: number;
  /** El mensaje de WhatsApp listo para copiar, y el enlace que abre WhatsApp con él. */
  whatsapp?: { texto: string; enlace: string };
  /** Lo que se le puede pedir al chat para resolverla. */
  pedirAlChat?: string;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «2026-10-20» → «20 oct». */
export function diaCorto(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return m && d ? `${d} ${MESES[m - 1]}` : iso;
}

function sumarDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Para cuándo es una tarea: su vencimiento, o el viernes de su semana. */
export function paraCuando(t: Pick<TareaParaAcciones, "venceEl" | "semana">): string | null {
  return t.venceEl ?? (t.semana ? sumarDias(t.semana, 4) : null);
}

/** El mensaje de WhatsApp para recordarle algo al cliente. Sin nada interno: lo que quedaron y para cuándo. */
export function mensajeDeRecordatorio(titulo: string, fecha: string | null): string {
  const m = /^recordarle\s+a\s+([\p{L}][\p{L}'-]*)\s+que\s+(.+)$/iu.exec(titulo.trim());
  const nombre = m ? m[1].charAt(0).toUpperCase() + m[1].slice(1) : null;
  const que = (m ? m[2] : titulo.trim().charAt(0).toLowerCase() + titulo.trim().slice(1)).replace(/[.\s]+$/, "");
  const lo = m ? `que ${que}` : `«${que}»`;
  return `Hola${nombre ? ` ${nombre}` : ""}, te escribo por lo que quedamos: ${lo}. ¿Cómo vas con eso?${fecha ? ` Lo teníamos para el ${diaCorto(fecha)}.` : ""} Cualquier cosa me avisas. ¡Gracias!`;
}

export function enlaceDeWhatsapp(texto: string): string {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}

export function accionesSugeridas(o: {
  persona: { email: string };
  cuenta: { nombre: string };
  /** Los equipos cuyo siguiente paso escribe esta persona, con su nombre visible. */
  equipos: ReadonlyArray<{ clave: string; nombre: string }>;
  /** Las tareas ABIERTAS de la cuenta que la persona ve. */
  tareas: readonly TareaParaAcciones[];
  /** Los siguientes pasos de la cuenta (de todos los equipos y objetos). */
  pasos: readonly PasoParaAcciones[];
  /** Hoy y el lunes de esta semana, `AAAA-MM-DD` en Costa Rica. */
  hoy: string;
  lunes: string;
}): AccionSugerida[] {
  const yo = o.persona.email.toLowerCase();
  const mias = o.tareas.filter((t) => (t.responsableEmail ?? "").toLowerCase() === yo && (t.estado === "pendiente" || t.estado === "en_curso"));
  const limite = sumarDias(o.hoy, DIAS_ANTES_DE_RECORDAR);
  const out: AccionSugerida[] = [];

  // 1. Lo que prometió el cliente (el seguimiento es mío): vencido o por vencer.
  for (const t of mias.filter((t) => t.lado === "cliente")) {
    const f = paraCuando(t);
    if (!f || f > limite) continue;
    const texto = mensajeDeRecordatorio(t.titulo, f);
    out.push({
      tipo: "recordar-al-cliente",
      titulo: `Recuérdale al cliente: ${t.titulo}`,
      porque: f < o.hoy ? `Lo prometió el cliente para el ${diaCorto(f)} y sigue abierto (T-${t.numero}).` : `Lo prometió el cliente para el ${diaCorto(f)} (T-${t.numero}).`,
      tarea: t.numero,
      whatsapp: { texto, enlace: enlaceDeWhatsapp(texto) },
      pedirAlChat: `Escríbeme un WhatsApp para recordarle al cliente la T-${t.numero}`,
    });
  }

  // 2. Lo mío de Smarteam, vencido.
  for (const t of mias.filter((t) => t.lado !== "cliente")) {
    const f = paraCuando(t);
    if (!f || f >= o.hoy) continue;
    out.push({
      tipo: "revisar-tarea",
      titulo: `Revisa la T-${t.numero}: ${t.titulo}`,
      porque: `Era para el ${diaCorto(f)}: ciérrala si ya está, o pásala de semana.`,
      tarea: t.numero,
      pedirAlChat: `La T-${t.numero} venció el ${diaCorto(f)}: ¿la cierro o la paso a la semana que viene?`,
    });
  }

  // 3. El siguiente paso de mi equipo.
  for (const e of o.equipos) {
    const delEquipo = o.pasos.filter((p) => p.equipo === e.clave);
    const vigente = delEquipo.find((p) => !p.fecha || p.fecha >= o.hoy);
    if (vigente) continue;
    const vencido = delEquipo[0];
    out.push({
      tipo: "siguiente-paso",
      titulo: `Fija el siguiente paso de ${e.nombre} con ${o.cuenta.nombre}`,
      porque: vencido ? `El que había («${vencido.que}») era para el ${diaCorto(vencido.fecha!)}.` : `${e.nombre} no tiene un siguiente paso en esta cuenta.`,
      pedirAlChat: `¿Cuál debería ser el siguiente paso de ${e.nombre} con ${o.cuenta.nombre}?`,
    });
  }

  // 4. Lo mío de esta semana (lo que no venció).
  const viernes = sumarDias(o.lunes, 4);
  for (const t of mias.filter((t) => t.lado !== "cliente")) {
    const f = paraCuando(t);
    if (!f || f < o.hoy || f > viernes) continue;
    out.push({ tipo: "esta-semana", titulo: `Esta semana: T-${t.numero} · ${t.titulo}`, porque: `Es para el ${diaCorto(f)}.`, tarea: t.numero });
  }

  return out.slice(0, MAX_ACCIONES);
}
