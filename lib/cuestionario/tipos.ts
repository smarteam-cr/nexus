/**
 * lib/cuestionario/tipos.ts — la forma del cuestionario previo, compartida por el servidor, el
 * panel del CSE y la página del cliente. Módulo PURO (sin Prisma, sin server-only).
 *
 * Lo que vive en JSON (`preguntas`, `respuestas`, `etapas`) se valida SIEMPRE al leer con los
 * `leer*` de abajo: la columna es de la base y la puede tocar un script o el chat. Un valor con
 * forma rara se descarta, no revienta la página del cliente.
 */

/** Cuándo espera el CSE la respuesta: antes de las sesiones, o conversada en una sesión. */
export type Momento = "previo" | "sesion";

export interface Pregunta {
  id: string;
  categoria: string;
  texto: string;
  /** Ejemplo de respuesta esperada: baja la ambigüedad sin escribir la respuesta por el cliente. */
  ejemplo?: string;
  momento: Momento;
}

/**
 * De dónde salió el valor de una respuesta. El CSE lo ve al lado de cada una: no pesa igual lo
 * que el cliente escribió que lo que Nexus dedujo del handoff.
 * `conversacion` queda reservado para el entrevistador (fase 2).
 */
export type Origen = "prellenado" | "cliente" | "cse" | "conversacion";

export interface Respuesta {
  valor: string;
  origen: Origen;
  /** El cliente prefiere conversarla en sesión en vez de escribirla. */
  enSesion?: boolean;
  /** El cliente confirmó el valor prellenado tal cual. */
  confirmada?: boolean;
  actualizadoAt: string;
}

export type Respuestas = Record<string, Respuesta>;

export interface Etapa {
  id: string;
  nombre: string;
  respuestas: Respuestas;
}

export type TipoPestana = "normal" | "etapas";

/** La pestaña tal como se guarda (sin adjuntos ni responsable, que son filas aparte). */
export interface PestanaData {
  key: string;
  titulo: string;
  descripcion: string | null;
  tipo: TipoPestana;
  preguntas: Pregunta[];
}

const ORIGENES: ReadonlySet<string> = new Set(["prellenado", "cliente", "cse", "conversacion"]);

function esObjeto(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function texto(v: unknown, max: number): string | null {
  return typeof v === "string" ? v.slice(0, max) : null;
}

export function leerPreguntas(raw: unknown): Pregunta[] {
  if (!Array.isArray(raw)) return [];
  const vistos = new Set<string>();
  const out: Pregunta[] = [];
  for (const p of raw) {
    if (!esObjeto(p)) continue;
    const id = texto(p.id, 80);
    const t = texto(p.texto, 2000);
    if (!id || !t || vistos.has(id)) continue;
    vistos.add(id);
    out.push({
      id,
      categoria: texto(p.categoria, 120) ?? "",
      texto: t,
      ...(texto(p.ejemplo, 2000) ? { ejemplo: texto(p.ejemplo, 2000)! } : {}),
      momento: p.momento === "sesion" ? "sesion" : "previo",
    });
  }
  return out;
}

export function leerRespuestas(raw: unknown): Respuestas {
  if (!esObjeto(raw)) return {};
  const out: Respuestas = {};
  for (const [id, r] of Object.entries(raw)) {
    if (!esObjeto(r)) continue;
    const valor = texto(r.valor, 20_000) ?? "";
    const origen = typeof r.origen === "string" && ORIGENES.has(r.origen) ? (r.origen as Origen) : "cliente";
    out[id.slice(0, 80)] = {
      valor,
      origen,
      ...(r.enSesion === true ? { enSesion: true } : {}),
      ...(r.confirmada === true ? { confirmada: true } : {}),
      actualizadoAt: texto(r.actualizadoAt, 40) ?? new Date(0).toISOString(),
    };
  }
  return out;
}

export function leerEtapas(raw: unknown): Etapa[] {
  if (!Array.isArray(raw)) return [];
  const out: Etapa[] = [];
  const vistos = new Set<string>();
  for (const e of raw.slice(0, 40)) {
    if (!esObjeto(e)) continue;
    const id = texto(e.id, 80);
    if (!id || vistos.has(id)) continue;
    vistos.add(id);
    out.push({ id, nombre: texto(e.nombre, 200) ?? "", respuestas: leerRespuestas(e.respuestas) });
  }
  return out;
}

/** ¿La respuesta cuenta como contestada? Pasarla a sesión también cuenta: es una decisión. */
export function estaContestada(r: Respuesta | undefined): boolean {
  if (!r) return false;
  return r.enSesion === true || r.valor.trim().length > 0;
}
