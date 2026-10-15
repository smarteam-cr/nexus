/**
 * lib/tareas-hubspot/reglas.ts — las reglas de las tareas de HubSpot en Tareas internas (2026-10-15, etapa 3 de
 * docs/mi-dia-plan.md). PURO.
 *
 * Decisiones de Elías (2026-10-14): las tareas de HubSpot se leen y se escriben (todas, también las de las secuencias), y
 * cada una dice que viene de HubSpot. Viven en la misma lista, semana y agenda que las de Nexus (`Tarea` con
 * `origen = "hubspot"`). Las que nacen en Nexus NO se crean en HubSpot.
 *
 * Se sincronizan cinco campos: título, estado, vencimiento, prioridad y responsable. Cada tarea guarda lo ÚLTIMO EN QUE
 * NEXUS Y HUBSPOT ESTUVIERON DE ACUERDO (`hubspotAcordado`), y cada corrida compara los tres, campo por campo:
 *   · cambió solo HubSpot → se aplica en Nexus;
 *   · cambió solo Nexus → se escribe en HubSpot;
 *   · cambiaron los dos (y distinto) → gana el último que cambió, y queda en la historia de la tarea.
 * *Por qué no la fecha de modificación de HubSpot:* HubSpot la mueve solo (el día del vencimiento, al mandar el
 * recordatorio), así que «HubSpot la cambió» no se puede leer de ahí.
 */
import type { Prioridad } from "@/lib/tareas/estados";

/** El estado, en lo que se puede sincronizar: «Ya no se hará» no existe en HubSpot. */
export type EstadoSincronizado = "pendiente" | "en_curso" | "hecha";

export interface ValoresSincronizados {
  titulo: string;
  estado: EstadoSincronizado;
  /** `YYYY-MM-DD`, en hora de Costa Rica. */
  vence: string | null;
  prioridad: Prioridad;
  /** Correo del responsable en Nexus. */
  responsable: string | null;
}

export type CampoSincronizado = keyof ValoresSincronizados;
export const CAMPOS_SINCRONIZADOS: readonly CampoSincronizado[] = ["titulo", "estado", "vence", "prioridad", "responsable"];

export const NOMBRE_DEL_CAMPO: Record<CampoSincronizado, string> = {
  titulo: "el título",
  estado: "el estado",
  vence: "el vencimiento",
  prioridad: "la prioridad",
  responsable: "el responsable",
};

/* ── De HubSpot a Nexus ──────────────────────────────────────────────────────────────── */

export const PROPIEDADES_DE_LA_TAREA = [
  "hs_task_subject",
  "hs_task_body",
  "hs_task_status",
  "hs_task_priority",
  "hs_task_type",
  "hs_timestamp",
  "hs_task_completion_date",
  "hs_lastmodifieddate",
  "hs_createdate",
  "hubspot_owner_id",
  "hs_task_sequence_id",
  "hs_task_sequence_step_number",
  "hs_task_sequence_step_enrollment_id",
] as const;

export type PropsDeTarea = Partial<Record<(typeof PROPIEDADES_DE_LA_TAREA)[number], string | null>>;

export function estadoDeHubspot(status: string | null | undefined): EstadoSincronizado {
  if (status === "COMPLETED") return "hecha";
  if (status === "IN_PROGRESS") return "en_curso";
  // NOT_STARTED, WAITING, DEFERRED y lo que no se conozca.
  return "pendiente";
}

export function estadoParaHubspot(e: EstadoSincronizado): string {
  return e === "hecha" ? "COMPLETED" : e === "en_curso" ? "IN_PROGRESS" : "NOT_STARTED";
}

export function prioridadDeHubspot(p: string | null | undefined): Prioridad {
  return p === "HIGH" ? "alta" : p === "LOW" ? "baja" : "media";
}

export function prioridadParaHubspot(p: Prioridad): string {
  return p === "alta" ? "HIGH" : p === "baja" ? "LOW" : "MEDIUM";
}

const CR_MS = 6 * 3_600_000;

/** Un instante de HubSpot (ISO o milisegundos) → el día en Costa Rica, y los minutos desde su medianoche. */
export function diaYMinutoCR(v: string | null | undefined): { dia: string; minuto: number } | null {
  if (!v) return null;
  const t = /^\d{10,}$/.test(v) ? Number(v) : Date.parse(v);
  if (!Number.isFinite(t)) return null;
  const local = new Date(t - CR_MS);
  return { dia: local.toISOString().slice(0, 10), minuto: local.getUTCHours() * 60 + local.getUTCMinutes() };
}

/** El instante que se le manda a HubSpot: el día nuevo a la misma hora de Costa Rica que tenía (sin hora, 7:00). */
export function venceParaHubspot(dia: string, minutoCR: number | null): string {
  const minuto = minutoCR ?? 7 * 60;
  return new Date(Date.parse(`${dia}T00:00:00.000Z`) + CR_MS + minuto * 60_000).toISOString();
}

/** Las notas de HubSpot vienen en HTML: se pasan a texto, sin etiquetas y con los saltos de línea. */
export function textoDelCuerpo(html: string | null | undefined): string | null {
  if (!html) return null;
  const t = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return t ? t.slice(0, 4000) : null;
}

export function valoresDeHubspot(p: PropsDeTarea, correoDe: (ownerId: string | null) => string | null): ValoresSincronizados {
  return {
    titulo: (p.hs_task_subject ?? "").trim() || "(tarea de HubSpot sin título)",
    estado: estadoDeHubspot(p.hs_task_status),
    vence: diaYMinutoCR(p.hs_timestamp)?.dia ?? null,
    prioridad: prioridadDeHubspot(p.hs_task_priority),
    responsable: correoDe((p.hubspot_owner_id ?? "").trim() || null),
  };
}

/** Lo de HubSpot que se muestra y no se sincroniza: el tipo, la secuencia, el registro asociado. */
export interface DatosDeHubspot {
  tipo: string | null;
  /** La tarea la creó una secuencia: su paso. */
  secuencia: { id: string; paso: number | null } | null;
  /** La hora de Costa Rica del vencimiento (minutos desde medianoche): se conserva al cambiar el día. */
  venceMinutoCR: number | null;
  /** El registro al que está asociada, para el enlace: el negocio, si no la empresa, si no el proyecto. */
  registro: { objeto: "deal" | "company" | "0-970"; id: string } | null;
}

export function datosDeHubspot(p: PropsDeTarea, registro: DatosDeHubspot["registro"]): DatosDeHubspot {
  const seq = (p.hs_task_sequence_id ?? "").trim() || (p.hs_task_sequence_step_enrollment_id ?? "").trim();
  const paso = Number(p.hs_task_sequence_step_number);
  return {
    tipo: (p.hs_task_type ?? "").trim() || null,
    secuencia: seq ? { id: seq, paso: Number.isFinite(paso) && paso > 0 ? paso : null } : null,
    venceMinutoCR: diaYMinutoCR(p.hs_timestamp)?.minuto ?? null,
    registro,
  };
}

/** Lee `hubspotDatos` (Json) con tolerancia. */
export function leerDatosDeHubspot(v: unknown): DatosDeHubspot {
  const d = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const seq = d.secuencia && typeof d.secuencia === "object" ? (d.secuencia as Record<string, unknown>) : null;
  const reg = d.registro && typeof d.registro === "object" ? (d.registro as Record<string, unknown>) : null;
  return {
    tipo: typeof d.tipo === "string" ? d.tipo : null,
    secuencia: seq && typeof seq.id === "string" ? { id: seq.id, paso: typeof seq.paso === "number" ? seq.paso : null } : null,
    venceMinutoCR: typeof d.venceMinutoCR === "number" ? d.venceMinutoCR : null,
    registro:
      reg && typeof reg.id === "string" && (reg.objeto === "deal" || reg.objeto === "company" || reg.objeto === "0-970")
        ? { objeto: reg.objeto, id: reg.id }
        : null,
  };
}

/** Lee `hubspotAcordado` (Json). null = nunca se acordó nada (la tarea es de antes o el dato está roto). */
export function leerAcordado(v: unknown): ValoresSincronizados | null {
  if (!v || typeof v !== "object") return null;
  const d = v as Record<string, unknown>;
  if (typeof d.titulo !== "string" || typeof d.estado !== "string") return null;
  const estado = d.estado === "hecha" || d.estado === "en_curso" ? d.estado : "pendiente";
  const prioridad = d.prioridad === "alta" || d.prioridad === "baja" ? d.prioridad : "media";
  return {
    titulo: d.titulo,
    estado,
    vence: typeof d.vence === "string" ? d.vence : null,
    prioridad,
    responsable: typeof d.responsable === "string" ? d.responsable : null,
  };
}

/* ── La comparación de los tres ──────────────────────────────────────────────────────── */

export interface Comparacion {
  /** Lo que se aplica en Nexus (cambió en HubSpot). */
  aNexus: Partial<ValoresSincronizados>;
  /** Lo que se escribe en HubSpot (cambió en Nexus). */
  aHubspot: Partial<ValoresSincronizados>;
  /** Los campos que cambiaron en los dos lados, y quién ganó. */
  conflictos: Array<{ campo: CampoSincronizado; gano: "nexus" | "hubspot" }>;
  /** Lo acordado después de aplicar todo. */
  acordado: ValoresSincronizados;
}

/**
 * `nexus` = lo que dice la tarea de Nexus, con `estado: null` si está en un estado que HubSpot no tiene («Ya no se
 * hará»): ese campo no se escribe en HubSpot, pero lo que cambie allá sí se aplica.
 */
export function comparar(
  acordado: ValoresSincronizados | null,
  nexus: Omit<ValoresSincronizados, "estado"> & { estado: EstadoSincronizado | null },
  hubspot: ValoresSincronizados,
  cambioNexusAt: Date,
  cambioHubspotAt: Date,
): Comparacion {
  const r: Comparacion = { aNexus: {}, aHubspot: {}, conflictos: [], acordado: { ...hubspot } };
  for (const campo of CAMPOS_SINCRONIZADOS) {
    const h = hubspot[campo];
    const n = nexus[campo];
    const a = acordado ? acordado[campo] : h;
    // Cada campo lleva su propio tipo; el valor sale del mismo campo de los otros dos lados.
    const set = (obj: Partial<ValoresSincronizados>, k: CampoSincronizado, v: unknown) => {
      (obj as Record<string, unknown>)[k] = v;
    };
    if (campo === "estado" && n === null) {
      // «Ya no se hará» en Nexus: HubSpot no lo tiene. Solo entra lo que cambie allá.
      if (h !== a) set(r.aNexus, campo, h);
      set(r.acordado, campo, h);
      continue;
    }
    const nv = n;
    if (nv === h) {
      set(r.acordado, campo, h);
      continue;
    }
    const cambioNexus = nv !== a;
    const cambioHubspot = h !== a;
    if (cambioHubspot && !cambioNexus) {
      set(r.aNexus, campo, h);
      set(r.acordado, campo, h);
    } else if (cambioNexus && !cambioHubspot) {
      set(r.aHubspot, campo, nv);
      set(r.acordado, campo, nv);
    } else {
      const ganaNexus = +cambioNexusAt >= +cambioHubspotAt;
      r.conflictos.push({ campo, gano: ganaNexus ? "nexus" : "hubspot" });
      if (ganaNexus) {
        set(r.aHubspot, campo, nv);
        set(r.acordado, campo, nv);
      } else {
        set(r.aNexus, campo, h);
        set(r.acordado, campo, h);
      }
    }
  }
  return r;
}

/** Las propiedades de HubSpot de lo que se escribe allá. El responsable sin usuario de HubSpot no se escribe. */
export function propiedadesParaHubspot(
  cambios: Partial<ValoresSincronizados>,
  datos: DatosDeHubspot,
  ownerDe: (email: string | null) => string | null,
): { properties: Record<string, string>; sinOwner: boolean } {
  const properties: Record<string, string> = {};
  let sinOwner = false;
  if (cambios.titulo !== undefined) properties.hs_task_subject = cambios.titulo;
  if (cambios.estado !== undefined) properties.hs_task_status = estadoParaHubspot(cambios.estado);
  if (cambios.vence !== undefined) properties.hs_timestamp = cambios.vence ? venceParaHubspot(cambios.vence, datos.venceMinutoCR) : "";
  if (cambios.prioridad !== undefined) properties.hs_task_priority = prioridadParaHubspot(cambios.prioridad);
  if (cambios.responsable !== undefined) {
    const owner = ownerDe(cambios.responsable);
    if (owner) properties.hubspot_owner_id = owner;
    else sinOwner = true;
  }
  return { properties, sinOwner };
}

/** «HubSpot» o «HubSpot · secuencia (paso 2)»: cómo se dice de dónde viene. */
export function rotuloDeHubspot(d: DatosDeHubspot): string {
  if (!d.secuencia) return "HubSpot";
  return d.secuencia.paso ? `HubSpot · secuencia (paso ${d.secuencia.paso})` : "HubSpot · secuencia";
}

/** Cada cuánto se copian: el job corre cada 15 minutos. */
export const MINUTOS_ENTRE_COPIAS = 15;
/** Las completadas que se traen: las de esta semana para atrás. */
export const DIAS_DE_COMPLETADAS = 7;
