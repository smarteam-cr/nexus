/**
 * lib/seguimiento/hechos/estado.ts — el CICLO DE VIDA de un hecho (memoria de la cuenta, etapa 6). PURO y client-safe:
 * lo usan el escritor de los hechos (lib/seguimiento/hechos-server.ts), las novedades, la memoria y las pruebas.
 *
 * ── DOS NIVELES ──────────────────────────────────────────────────────────────────────────────
 *  · Un estado POR DESTINO, en `HechoDeReunion.destinos` (JSON): pendiente · usado · desestimado · delegado.
 *    «Delegado» quiere decir que su ciclo vive en el destino: la propuesta de la ficha, la `CsAlert`, la etapa sugerida,
 *    el borrador de avance o el juicio del vigía. «Uso de Nexus» lo mide ahí, no en el hecho.
 *  · Un estado GENERAL (`HechoDeReunion.estado`), con los del ciclo de vida de lo propuesto: pendiente · usado ·
 *    desestimado · vencido. «Vencido» se calcula (30 días sin usar) y no se escribe: no hace falta un job.
 *
 * El general sale de los destinos (`estadoGeneral`): pendiente mientras alguno espera a una persona; usado si alguno se
 * usó; desestimado si todos se desestimaron. Un hecho cuyos destinos están todos delegados queda «pendiente» en general
 * (nadie tiene que decidir nada sobre el hecho mismo), pero no es una novedad ni entra a la memoria como pendiente
 * (`esperaAUnaPersona`). La base exige que usado y desestimado lleven quién y cuándo (CHECK `HechoDeReunion_decidido`).
 */
import { DIAS_PARA_VENCER } from "./tipos";

export const ESTADOS_DEL_DESTINO = ["pendiente", "usado", "desestimado", "delegado"] as const;
export type EstadoDelDestino = (typeof ESTADOS_DEL_DESTINO)[number];

export const ESTADOS_DEL_HECHO = ["pendiente", "usado", "desestimado", "vencido"] as const;
export type EstadoDelHecho = (typeof ESTADOS_DEL_HECHO)[number];
/** Lo que se escribe en la base: «vencido» se calcula. */
export type EstadoGuardado = Exclude<EstadoDelHecho, "vencido">;

/** A dónde quedó delegado un destino: lo que hace falta para encontrarlo. */
export type RefDelDestino =
  | { tipo: "ficha"; campos: string[] }
  | { tipo: "alerta"; id: string }
  | { tipo: "vigia" }
  | { tipo: "etapa"; projectId: string; stageId: string | null }
  | { tipo: "avance"; projectId: string }
  | { tipo: "procesos"; agentRunId: string | null };

/** Un destino de un hecho, como se guarda en `HechoDeReunion.destinos`. La clave es la del registro (lib/seguimiento/destinos.ts). */
export interface DestinoDelHecho {
  clave: string;
  estado: EstadoDelDestino;
  ref?: RefDelDestino | null;
  decididoPorEmail?: string | null;
  /** ISO. */
  decididoAt?: string | null;
  nota?: string | null;
}

const esEstadoDelDestino = (v: unknown): v is EstadoDelDestino => typeof v === "string" && (ESTADOS_DEL_DESTINO as readonly string[]).includes(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function leerRef(v: unknown): RefDelDestino | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  switch (o.tipo) {
    case "ficha":
      return { tipo: "ficha", campos: Array.isArray(o.campos) ? o.campos.filter((c): c is string => typeof c === "string") : [] };
    case "alerta":
      return typeof o.id === "string" ? { tipo: "alerta", id: o.id } : null;
    case "vigia":
      return { tipo: "vigia" };
    case "etapa":
      return typeof o.projectId === "string" ? { tipo: "etapa", projectId: o.projectId, stageId: texto(o.stageId) } : null;
    case "avance":
      return typeof o.projectId === "string" ? { tipo: "avance", projectId: o.projectId } : null;
    case "procesos":
      return { tipo: "procesos", agentRunId: texto(o.agentRunId) };
    default:
      return null;
  }
}

/** Lee el JSON de la base con tolerancia: lo que no se entiende se descarta, nunca revienta. */
export function leerDestinos(json: unknown): DestinoDelHecho[] {
  if (!Array.isArray(json)) return [];
  const out: DestinoDelHecho[] = [];
  const vistas = new Set<string>();
  for (const x of json) {
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    const o = x as Record<string, unknown>;
    const clave = texto(o.clave);
    if (!clave || vistas.has(clave) || !esEstadoDelDestino(o.estado)) continue;
    vistas.add(clave);
    out.push({ clave, estado: o.estado, ref: leerRef(o.ref), decididoPorEmail: texto(o.decididoPorEmail), decididoAt: texto(o.decididoAt), nota: texto(o.nota) });
  }
  return out;
}

/** El estado general que corresponde a estos destinos (sin «vencido», que se calcula al leer). */
export function estadoGeneral(destinos: readonly DestinoDelHecho[]): EstadoGuardado {
  if (!destinos.length) return "pendiente";
  if (destinos.some((d) => d.estado === "pendiente")) return "pendiente";
  if (destinos.some((d) => d.estado === "usado")) return "usado";
  if (destinos.every((d) => d.estado === "desestimado")) return "desestimado";
  return "pendiente";
}

/**
 * ¿Espera a una persona? Sin destinos (queda solo en la tarjeta de la reunión) o con alguno pendiente. Un hecho con
 * todos sus destinos delegados (o desestimados) no espera a nadie: ni es una novedad ni entra a la memoria como pendiente.
 */
export function esperaAUnaPersona(destinos: readonly DestinoDelHecho[]): boolean {
  return !destinos.length || destinos.some((d) => d.estado === "pendiente");
}

/** ¿Todos sus destinos quedaron delegados? (su ciclo vive en el destino: ya está en la ficha, la alerta, la etapa…). */
export function soloDelegado(destinos: readonly DestinoDelHecho[]): boolean {
  return destinos.length > 0 && destinos.every((d) => d.estado === "delegado");
}

const DIA_MS = 86_400_000;

/** ¿Se venció? Un hecho pendiente con más de 30 días desde que Nexus lo propuso. */
export function estaVencido(h: { estado: string; createdAt: Date | string }, ahora: Date): boolean {
  if (h.estado !== "pendiente") return false;
  const desde = typeof h.createdAt === "string" ? Date.parse(h.createdAt) : h.createdAt.getTime();
  return !Number.isNaN(desde) && +ahora - desde > DIAS_PARA_VENCER * DIA_MS;
}

/** El estado como se lee: el guardado, o «vencido» si pasó el plazo. */
export function estadoVisible(h: { estado: string; createdAt: Date | string }, ahora: Date): EstadoDelHecho {
  if (estaVencido(h, ahora)) return "vencido";
  return h.estado === "usado" || h.estado === "desestimado" ? h.estado : "pendiente";
}

/** Lo que hay que escribir en la fila después de un cambio en sus destinos. */
export interface CambioDelHecho {
  destinos: DestinoDelHecho[];
  estado: EstadoGuardado;
  decididoPorEmail: string | null;
  decididoAt: Date | null;
  nota: string | null;
}

/** El general y quién lo decidió, a partir de los destinos nuevos. Un general decidido conserva su decisión anterior. */
function cerrar(
  destinos: DestinoDelHecho[],
  antes: { estado: string; decididoPorEmail: string | null; decididoAt: Date | null; nota: string | null },
  quien: string,
  ahora: Date,
  nota: string | null,
): CambioDelHecho {
  const estado = estadoGeneral(destinos);
  if (estado === "pendiente") return { destinos, estado, decididoPorEmail: null, decididoAt: null, nota: antes.nota };
  if (antes.estado === estado && antes.decididoAt) return { destinos, estado, decididoPorEmail: antes.decididoPorEmail, decididoAt: antes.decididoAt, nota: antes.nota };
  return { destinos, estado, decididoPorEmail: quien, decididoAt: ahora, nota: nota ?? antes.nota };
}

export type AccionSobreElDestino = "usar" | "desestimar";

/**
 * Una persona decide UN destino (una novedad: «Listo» o el acuerdo del chat que la llevaba la usan; «No aplica» la
 * desestima). Solo se decide un destino pendiente: uno ya decidido o delegado no se toca (null = nada que cambiar).
 */
export function decidirDestino(
  h: { destinos: unknown; estado: string; decididoPorEmail: string | null; decididoAt: Date | null; nota: string | null },
  clave: string,
  accion: AccionSobreElDestino,
  quien: string,
  ahora: Date,
  nota: string | null = null,
): CambioDelHecho | null {
  const destinos = leerDestinos(h.destinos);
  const i = destinos.findIndex((d) => d.clave === clave);
  if (i < 0 || destinos[i].estado !== "pendiente") return null;
  const nuevos = destinos.map((d, k) =>
    k === i ? { ...d, estado: (accion === "usar" ? "usado" : "desestimado") as EstadoDelDestino, decididoPorEmail: quien, decididoAt: ahora.toISOString(), nota: nota?.trim() || null } : d,
  );
  return cerrar(nuevos, h, quien, ahora, nota?.trim() || null);
}

/** Un destino quedó en manos de su módulo (la propuesta de la ficha, la alerta, la etapa…). Solo desde pendiente. */
export function delegarDestino(destinos: readonly DestinoDelHecho[], clave: string, ref: RefDelDestino): DestinoDelHecho[] {
  return destinos.map((d) => (d.clave === clave && d.estado === "pendiente" ? { ...d, estado: "delegado" as const, ref } : d));
}

/** Los destinos delegados de un hecho (con lo que hace falta para encontrarlos en su módulo). */
export function destinosDelegados(json: unknown): DestinoDelHecho[] {
  return leerDestinos(json).filter((d) => d.estado === "delegado");
}

/**
 * La reunión cambió de dueño (o el hecho quedó en un cliente que no es el suyo): lo pendiente se desestima con la nota,
 * firmado por el sistema. Lo delegado se desestima SOLO si ya se retiró de su módulo (`retirados`: la propuesta de la
 * ficha, la alerta, la etapa sugerida…): lo que no se pudo retirar sigue delegado, el hecho sigue vivo («pendiente») e
 * INV45 lo sigue mostrando. Lo usado no se toca. Con todo cerrado, el general queda desestimado salvo que algo ya se
 * haya usado. null si el hecho ya estaba cerrado o no cambia nada.
 */
export function desestimarPorCambioDeDueno(
  h: { destinos: unknown; estado: string; decididoPorEmail: string | null; decididoAt: Date | null; nota: string | null },
  quien: string,
  ahora: Date,
  nota: string,
  retirados: ReadonlySet<string> = new Set(),
): CambioDelHecho | null {
  if (h.estado !== "pendiente") return null;
  let cambio = false;
  const destinos = leerDestinos(h.destinos).map((d) => {
    if (d.estado === "pendiente" || (d.estado === "delegado" && retirados.has(d.clave))) {
      cambio = true;
      return { ...d, estado: "desestimado" as const, decididoPorEmail: quien, decididoAt: ahora.toISOString(), nota };
    }
    return d;
  });
  const quedaDelegado = destinos.some((d) => d.estado === "delegado");
  // Sin destinos (solo en la tarjeta) también se cierra: el hecho no es de este cliente.
  if (!cambio && (quedaDelegado || destinos.length)) return null;
  if (quedaDelegado) return { destinos, estado: "pendiente", decididoPorEmail: null, decididoAt: null, nota };
  const estado: EstadoGuardado = destinos.some((d) => d.estado === "usado") ? "usado" : "desestimado";
  return { destinos, estado, decididoPorEmail: quien, decididoAt: ahora, nota };
}
