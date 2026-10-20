/**
 * lib/exploraciones/inicio.ts — lo que dice la página de inicio de la exploración (etapa A, diseño v13). PURO.
 *
 * La página de inicio (components/exploraciones/InicioDeLaExploracion.tsx) lista las sesiones, cada una
 * con su reunión y su estado, y deja sacarlas (en un prospecto, a «Fuera de la exploración») y
 * devolverlas. Lo que se escribe en cada fila, cómo se dice el estado de la guía de la próxima sesión y
 * qué operaciones arma «Sacar» y «Deshacer» viven acá, con su prueba: la pantalla solo los pinta.
 *
 * Las horas se arman a mano en la hora de Costa Rica (UTC−6, sin horario de verano): Node y Chrome
 * escriben distinto «10:00 a. m.», y el texto del servidor y el del navegador tienen que coincidir.
 */
import type { Operacion } from "./contenido";
import { aFecha, diaConSemana, hoyEnCostaRica } from "./fechas";
import { claveDeReunion, type CambiosDesdeLaGuia, type EstadoDeLaReunion, type PestanaDeSesion, type ReunionDeLaExploracion, type SesionPlaneada } from "./guia";

const SEIS_HORAS = 6 * 60 * 60 * 1000;

/** «10:00» en la hora de Costa Rica. null si la fecha no se entiende. */
export function horaDeCostaRica(iso: string): string | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms - SEIS_HORAS);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** «10:00 a 10:45» (o «10:00» sin el fin). "" si el inicio no se entiende. */
export function horario(inicio: string, fin?: string | null): string {
  const a = horaDeCostaRica(inicio);
  if (!a) return "";
  const b = fin ? horaDeCostaRica(fin) : null;
  return b && b !== a ? `${a} a ${b}` : a;
}

/** De dónde viene la reunión de una sesión, en la línea de datos. */
const ORIGEN: Record<ReunionDeLaExploracion["origen"], string> = { meet: "Google Meet", hubspot: "HubSpot", documento: "sumada a mano" };

/** Qué dejó la reunión, en la línea de datos: «con transcripción», «solo notas de Gemini», «6 min, casi sin conversación». */
function loQueDejo(r: ReunionDeLaExploracion): string | null {
  if (r.corta) return r.corta.minutos !== null ? `${r.corta.minutos} min, casi sin conversación` : "casi sin conversación";
  if (r.texto === "transcripcion") return "con transcripción";
  if (r.texto === "notas") return "solo notas de Gemini";
  if (r.texto === "nada") return "sin transcripción ni notas";
  return null;
}

/**
 * La línea de datos de una sesión en la lista del inicio (los tableros Main y Prospecto): con reunión,
 * su día, de dónde viene y qué dejó; unida a un evento que todavía no ocurre, su día y su hora «en el
 * calendario»; sin reunión, su día (o «sin fecha») y que la guía se puede preparar igual.
 */
export function datosDeLaSesion(p: Pick<PestanaDeSesion, "sesion" | "reunion" | "fecha" | "ligadaPor">, estado: EstadoDeLaReunion): string {
  const partes: string[] = [];
  const r = p.reunion;
  const e = p.sesion?.evento;
  if (r) {
    partes.push(diaConSemana(r.fecha), ORIGEN[r.origen]);
    const dejo = loQueDejo(r);
    if (dejo) partes.push(dejo);
    if (p.ligadaPor === "fecha") partes.push("ligada por fecha");
  } else if (e) {
    const hora = horaDeCostaRica(e.inicio);
    const dia = diaConSemana(e.inicio);
    if (estado === "cancelada") partes.push(dia, "cancelada en el calendario");
    else if (estado === "agendada") partes.push(hora ? `${dia}, ${hora}` : dia, "en el calendario");
    else partes.push(hora ? `${dia}, ${hora}` : dia, "Google Meet");
  } else {
    partes.push(p.fecha ? diaConSemana(p.fecha) : "sin fecha", "la guía se puede preparar igual");
  }
  return partes.join(" · ");
}

/** Cómo se pinta el estado de una sesión a la derecha de su fila: verde, ámbar o gris. */
export type TonoDeLaFila = "bien" | "atencion" | "neutro";

export interface EstadoDeLaFila {
  texto: string;
  tono: TonoDeLaFila;
  /** La reunión se puede leer con el agente («Leerla»). */
  leer: boolean;
}

/** El estado de una sesión a la derecha de su fila. null = sin reunión (la fila ofrece unirla). */
export function estadoDeLaFila(estado: EstadoDeLaReunion): EstadoDeLaFila | null {
  switch (estado) {
    case "leida":
      return { texto: "Leída", tono: "bien", leer: false };
    case "sinLeer":
    case "soloNotasSinLeer":
      return { texto: "Sin leer", tono: "atencion", leer: true };
    case "agendada":
      return { texto: "Agendada · se lee sola", tono: "neutro", leer: false };
    case "esperando":
      return { texto: "Esperando la transcripción", tono: "neutro", leer: false };
    case "sinTexto":
      return { texto: "Sin transcripción ni notas", tono: "atencion", leer: false };
    case "cancelada":
      return { texto: "Cancelada en el calendario", tono: "atencion", leer: false };
    case "corta":
      return { texto: "¿Qué pasó?", tono: "atencion", leer: false };
    case "noSeHizo":
      return { texto: "No se hizo", tono: "neutro", leer: false };
    case "sinReunion":
      return null;
  }
}

/** ¿La fila ofrece unir la sesión a una reunión? Sin reunión, o con la del calendario cancelada. */
export function pideUnirla(estado: EstadoDeLaReunion): boolean {
  return estado === "sinReunion" || estado === "cancelada";
}

/** Cuántas sesiones hay en cada estado, para el panel de la derecha («Las sesiones»). */
export interface ConteoDeLasSesiones {
  leidas: number;
  sinLeer: number;
  agendadas: number;
  sinReunion: number;
  /** Las que piden atención por otra cosa: casi sin conversación, sin texto, cancelada en el calendario. */
  atencion: number;
}

export function conteoDeLasSesiones(estados: readonly EstadoDeLaReunion[]): ConteoDeLasSesiones {
  const c: ConteoDeLasSesiones = { leidas: 0, sinLeer: 0, agendadas: 0, sinReunion: 0, atencion: 0 };
  for (const e of estados) {
    if (e === "leida") c.leidas++;
    else if (e === "sinLeer" || e === "soloNotasSinLeer") c.sinLeer++;
    else if (e === "agendada" || e === "esperando") c.agendadas++;
    else if (e === "sinReunion") c.sinReunion++;
    else if (e !== "noSeHizo") c.atencion++;
  }
  return c;
}

/** «1 punto» · «2 puntos». */
const puntos = (n: number) => (n === 1 ? "1 punto" : `${n} puntos`);

/**
 * El estado de la guía de la próxima sesión, en una línea chica debajo de «Preparar la sesión»: la de
 * base, al día o vieja (con lo primero que cambió). Sale de `cambiosDesdeLaGuia`.
 */
export function estadoCortoDeLaGuia(hayGuia: boolean, cambios: CambiosDesdeLaGuia | null): string {
  if (!hayGuia) return "la guía todavía es la de base";
  if (!cambios) return "la guía está al día";
  if (cambios.antesDelPlan) return "la guía está vieja: es de antes de «Lo que ya sabemos»";
  if (cambios.respondidas.length) return `la guía está vieja: ya se ${cambios.respondidas.length === 1 ? "respondió 1 punto" : `respondieron ${cambios.respondidas.length} puntos`}`;
  if (cambios.nuevas.length) return `la guía está vieja: ahora ${cambios.nuevas.length === 1 ? "falta 1 punto" : `faltan ${cambios.nuevas.length} puntos`} más`;
  if (cambios.dimensiones) return "la guía está vieja: cambiaron las dimensiones de la escala";
  return `la guía está vieja: te llevaste ${puntos(cambios.llevados)} de otra sesión`;
}

// ── Sacar y devolver sesiones ─────────────────────────────────────────────────

/** Lo que se sacó de una fila: la sesión (si era una sesión guardada) y las claves que quedaron fuera. */
export interface LoSacado {
  clave: string;
  sesion: SesionPlaneada | null;
  fuera: string[];
}

/**
 * «Sacar de la exploración»: quita las sesiones guardadas y, en un prospecto (donde cada reunión entra
 * sola), deja su reunión —y la fila de Meet de su evento— en `contenido.fuera`, para que no vuelva a
 * entrar sola. En un cliente o un proyecto nada entra solo: solo se quita la sesión. Devuelve las
 * operaciones y lo sacado, para poder deshacerlo.
 */
export function sacarDeLaExploracion(
  pestanas: readonly PestanaDeSesion[],
  claves: readonly string[],
  automaticas: boolean,
): { ops: Operacion[]; sacadas: LoSacado[] } {
  const elegidas = new Set(claves);
  const sacadas: LoSacado[] = pestanas
    .filter((p) => elegidas.has(p.clave))
    .map((p) => {
      const fuera = automaticas
        ? [
            ...(p.reunion && p.reunion.origen !== "documento" ? [claveDeReunion(p.reunion)] : []),
            ...(p.sesion?.evento ? [`meet:gmeet_${p.sesion.evento.id}`] : []),
          ]
        : [];
      return { clave: p.clave, sesion: p.sesion, fuera: [...new Set(fuera)] };
    });
  const ids = sacadas.flatMap((s) => (s.sesion ? [s.sesion.id] : []));
  const fuera = [...new Set(sacadas.flatMap((s) => s.fuera))];
  const ops: Operacion[] = [...(ids.length ? [{ op: "quitarSesiones" as const, ids }] : []), ...(fuera.length ? [{ op: "fuera" as const, claves: fuera, fuera: true }] : [])];
  return { ops, sacadas };
}

/** «Deshacer»: vuelve a poner las sesiones sacadas y saca sus claves de `fuera`. */
export function devolverALaExploracion(sacadas: readonly LoSacado[]): Operacion[] {
  const fuera = [...new Set(sacadas.flatMap((s) => s.fuera))];
  return [
    ...sacadas.flatMap((s) => (s.sesion ? [{ op: "agregarSesion" as const, sesion: s.sesion }] : [])),
    ...(fuera.length ? [{ op: "fuera" as const, claves: fuera, fuera: false }] : []),
  ];
}

/** La sesión nueva para una reunión que vuelve desde «Fuera de la exploración» («Agregar como sesión»). */
export function sesionDesdeLaReunion(r: Pick<ReunionDeLaExploracion, "id" | "origen" | "fecha">, id: string): SesionPlaneada {
  return { id, reunion: { id: r.id, origen: r.origen }, fecha: hoyEnCostaRica(aFecha(r.fecha)) };
}
