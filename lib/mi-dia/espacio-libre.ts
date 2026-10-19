/**
 * lib/mi-dia/espacio-libre.ts — con qué llenar un espacio libre de la agenda del inicio (2026-10-19, prueba 8). PURO y
 * client-safe.
 *
 * Elías, probando «Para ti»: al tocar un espacio libre solo aparecía «crear un evento». Ahora Nexus sugiere con qué
 * usarlo, sin IA, y cada sugerencia llena el borrador con un clic:
 *   · las tareas tuyas que caben (las de «Con qué avanzar», en su orden: lo vencido, lo que vence hoy, la prioridad);
 *   · la reunión con una cuenta tuya que no tiene ninguna en los próximos 8 días, con los invitados de su última reunión;
 *   · el siguiente paso: el de Ventas de un negocio que cierra pronto, o la acción de la semana de una cuenta que no la
 *     tiene.
 * Como mucho `MAX_SUGERENCIAS_DEL_ESPACIO`, y una por cuenta (lo de una cuenta sin reunión gana sobre su acción).
 */
import { DIAS_PARA_LA_REUNION, HORA_FIN_LABORAL, MINUTOS_DE_UN_HUECO } from "./constantes";
import { instante, minutoDelDia, ordenarParaAvanzar, porqueAvanzar, type EventoParaLaGrilla, type TareaParaUnHueco } from "./inicio";

/** Lo que el inicio sabe para sugerir (lo que ya cargó para «Con qué avanzar», tus cuentas y tus negocios). */
export interface ParaSugerirEnElEspacio {
  tareas: readonly TareaParaUnHueco[];
  cuentas: readonly CuentaParaElEspacio[];
  negocios: readonly NegocioParaElEspacio[];
}

/** Cuántas sugerencias, como mucho, para un espacio. */
export const MAX_SUGERENCIAS_DEL_ESPACIO = 5;
/** Cuántas de ellas pueden ser tareas. */
const MAX_TAREAS = 3;

/** Una cuenta tuya, con lo que le falta esta semana. */
export interface CuentaParaElEspacio {
  clientId: string;
  empresa: string;
  sinReunion: boolean;
  sinAccion: boolean;
  /** Los correos del cliente de su última reunión. */
  invitados: readonly string[];
}

/** Un negocio que cierra pronto (Ventas), con su siguiente paso de Ventas o null. */
export interface NegocioParaElEspacio {
  clientId: string | null;
  empresa: string;
  paso: string | null;
}

export interface SugerenciaDelEspacio {
  clave: string;
  tipo: "tarea" | "reunion" | "paso";
  /** Lo que se lee en la lista. */
  texto: string;
  /** Por qué Nexus la sugiere. */
  porque: string;
  /** El título del evento que deja en el borrador. */
  titulo: string;
  cuenta: { id: string; nombre: string } | null;
  invitados: string[];
  tarea: { id: string; numero: number } | null;
  /** Cuánto dura el bloque (lo estimado de la tarea, nunca más que el espacio); null = lo que ya tiene el borrador. */
  minutos: number | null;
}

export function sugerenciasParaElEspacio(o: {
  inicio: string;
  fin: string;
  hoyISO: string;
  tareas?: readonly TareaParaUnHueco[];
  cuentas?: readonly CuentaParaElEspacio[];
  negocios?: readonly NegocioParaElEspacio[];
  max?: number;
}): SugerenciaDelEspacio[] {
  const max = o.max ?? MAX_SUGERENCIAS_DEL_ESPACIO;
  const largo = Math.max(0, Math.round((Date.parse(o.fin) - Date.parse(o.inicio)) / 60_000));
  const out: SugerenciaDelEspacio[] = [];
  const cuentasUsadas = new Set<string>();

  // Las tareas que caben: lo estimado no pasa del espacio (sin estimar, cabe).
  const caben = ordenarParaAvanzar(o.tareas ?? [], o.hoyISO).filter((t) => t.minutosEstimados == null || t.minutosEstimados <= largo);
  for (const t of caben.slice(0, MAX_TAREAS)) {
    out.push({
      clave: `tarea:${t.id}`,
      tipo: "tarea",
      texto: `T-${t.numero} · ${t.titulo}`,
      porque: `Tu tarea ${porqueAvanzar(t, o.hoyISO)}${t.empresa ? ` · ${t.empresa}` : ""}.`,
      titulo: `T-${t.numero} · ${t.titulo}`,
      cuenta: t.clientId && t.empresa ? { id: t.clientId, nombre: t.empresa } : null,
      invitados: [],
      tarea: { id: t.id, numero: t.numero },
      minutos: Math.min(largo || MINUTOS_DE_UN_HUECO, t.minutosEstimados ?? MINUTOS_DE_UN_HUECO),
    });
  }

  // Una reunión con cada cuenta que no tiene ninguna en los próximos días.
  for (const c of o.cuentas ?? []) {
    if (!c.sinReunion || cuentasUsadas.has(c.clientId)) continue;
    cuentasUsadas.add(c.clientId);
    out.push({
      clave: `reunion:${c.clientId}`,
      tipo: "reunion",
      texto: `Reunión con ${c.empresa}`,
      porque: `No tiene ninguna reunión en los próximos ${DIAS_PARA_LA_REUNION} días${c.invitados.length ? "; invita a quienes estuvieron en la última" : ""}.`,
      titulo: `Reunión con ${c.empresa}`,
      cuenta: { id: c.clientId, nombre: c.empresa },
      invitados: [...c.invitados],
      tarea: null,
      minutos: null,
    });
  }

  // El siguiente paso: el de Ventas de cada negocio, o la acción de la semana de una cuenta que no la tiene.
  for (const n of o.negocios ?? []) {
    const id = n.clientId ?? `negocio:${n.empresa}`;
    if (cuentasUsadas.has(id)) continue;
    cuentasUsadas.add(id);
    const titulo = n.paso ? `${n.paso} · ${n.empresa}` : `Definir el siguiente paso con ${n.empresa}`;
    out.push({
      clave: `paso:${id}`,
      tipo: "paso",
      texto: titulo,
      porque: n.paso ? "Es el siguiente paso de Ventas de un negocio que cierra pronto." : "El negocio cierra pronto y no tiene siguiente paso.",
      titulo,
      cuenta: n.clientId ? { id: n.clientId, nombre: n.empresa } : null,
      invitados: [],
      tarea: null,
      minutos: null,
    });
  }
  for (const c of o.cuentas ?? []) {
    if (!c.sinAccion || cuentasUsadas.has(c.clientId)) continue;
    cuentasUsadas.add(c.clientId);
    const titulo = `Preparar la acción de la semana con ${c.empresa}`;
    out.push({
      clave: `paso:${c.clientId}`,
      tipo: "paso",
      texto: titulo,
      porque: "La cuenta no tiene ninguna tarea con fecha esta semana.",
      titulo,
      cuenta: { id: c.clientId, nombre: c.empresa },
      invitados: [],
      tarea: null,
      minutos: null,
    });
  }

  // Las tareas primero, pero sin tapar lo demás: si sobran, se recortan las últimas tareas.
  if (out.length <= max) return out;
  const otras = out.filter((s) => s.tipo !== "tarea");
  const tareas = out.filter((s) => s.tipo === "tarea");
  const cuantasTareas = Math.max(1, max - otras.length);
  return [...tareas.slice(0, cuantasTareas), ...otras].slice(0, max);
}

/**
 * Hasta dónde llega el espacio donde se tocó la agenda: la primera reunión que empieza después de `inicio` ese día, o
 * el fin del horario laboral; nunca antes de `finMinimo` (lo que ya ocupa el borrador). Sirve para saber qué tareas caben.
 */
export function finDelEspacio(eventos: readonly EventoParaLaGrilla[], inicio: string, finMinimo: string): string {
  const { dia } = minutoDelDia(inicio);
  const desde = Date.parse(inicio);
  let fin = Math.max(Date.parse(instante(dia, HORA_FIN_LABORAL * 60)), Date.parse(finMinimo));
  for (const e of eventos) {
    const t = Date.parse(e.inicio);
    if (t > desde && minutoDelDia(e.inicio).dia === dia) fin = Math.min(fin, t);
  }
  return new Date(Math.max(fin, Date.parse(finMinimo))).toISOString();
}

/** ¿El borrador ya usa esta sugerencia? (Para marcarla en la lista.) */
export function usaLaSugerencia(b: { titulo: string; tarea?: { id: string } | null }, s: SugerenciaDelEspacio): boolean {
  if (s.tarea) return b.tarea?.id === s.tarea.id;
  return b.titulo.trim() === s.titulo;
}
