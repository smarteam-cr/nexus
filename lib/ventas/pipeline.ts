/**
 * lib/ventas/pipeline.ts — las reglas de Ventas › Pipeline (feedback 9 de Marco Salas, 2026-10-30). PURO y client-safe.
 *
 * Un reporte: los negocios abiertos de todo Ventas, cuáles no tienen siguiente paso y qué prometió Smarteam a esas
 * empresas. Nexus NO intenta confirmar si algo se mandó: solo mira tareas y reuniones, igual que Customer Success.
 *
 * SIN SIGUIENTE PASO. La regla es UNA: `tieneSiguientePasoDeVentas` (lib/ventas/negocios.ts). Acá solo se le da la tarea
 * de la cuenta además de la del negocio (`pasosParaLaRegla`). Medido el 2026-10-30: las 10 tareas abiertas de Ventas sobre
 * las empresas de los 80 negocios activos estaban en la cuenta y ninguna ligada al negocio, así que mirando solo el negocio
 * los 80 salían sin siguiente paso. Una reunión ya contaba para todos los negocios de su empresa: la tarea, igual.
 *
 * COMPROMISOS. Un compromiso es una tarea que dejó la lectura de seguimiento de una reunión (lib/tareas/seguimiento.ts),
 * del lado de Smarteam: `elegirLoEsencial` ya pasó ahí lo que el cliente espera de Smarteam (`loEsperaDeSmarteam`). Los
 * plazos son los del aviso de las 48 horas (lib/comunicaciones/sin-agendar.ts).
 */
import { DIAS_QUE_AVISA, esCompromisoConElCliente, esReunionPrometida, HORAS_PARA_AVISAR } from "@/lib/comunicaciones/sin-agendar";
import { estaVencido, type SiguientePasoVisto } from "@/lib/siguiente-paso/reglas";
import { diasHasta, esPausado, fechaCorta, pasoDeVentas, tieneSiguientePasoDeVentas, TEXTO_DE_SENAL, type NegocioVisto, type ReunionDelNegocio } from "./negocios";

export type MarcaDelPaso = "sin-siguiente-paso" | "siguiente-paso-vencido";

export const TEXTO_DE_LA_MARCA: Record<MarcaDelPaso, string> = {
  "sin-siguiente-paso": TEXTO_DE_SENAL["sin-siguiente-paso"],
  "siguiente-paso-vencido": TEXTO_DE_SENAL["siguiente-paso-vencido"],
};

/**
 * Los pasos con que se juzga un negocio: los suyos, y si no tiene uno de Ventas vigente, el de Ventas de su empresa. Si
 * los dos vencieron, queda el del negocio.
 */
export function pasosParaLaRegla(delNegocio: readonly SiguientePasoVisto[], deLaEmpresa: readonly SiguientePasoVisto[], hoyISO: string): SiguientePasoVisto[] {
  const propio = pasoDeVentas({ pasos: [...delNegocio] });
  if (propio && !estaVencido(propio, hoyISO)) return [...delNegocio];
  const deLaCuenta = pasoDeVentas({ pasos: [...deLaEmpresa] });
  if (!deLaCuenta || (propio && estaVencido(deLaCuenta, hoyISO))) return [...delNegocio];
  return [deLaCuenta, ...delNegocio.filter((p) => p.equipo !== "ventas")];
}

/** null = tiene siguiente paso. */
export function marcaDelPaso(n: { pasos?: SiguientePasoVisto[]; reunion?: ReunionDelNegocio | null }, hoyISO: string): MarcaDelPaso | null {
  if (tieneSiguientePasoDeVentas(n, hoyISO)) return null;
  return pasoDeVentas(n) ? "siguiente-paso-vencido" : "sin-siguiente-paso";
}

/** Un negocio pausado no se está vendiendo: no entra al pipeline (DECISIONS, 2026-10-14). */
export function negociosDelPipeline<T extends Pick<NegocioVisto, "etapa">>(negocios: readonly T[]): { activos: T[]; pausados: number } {
  const activos = negocios.filter((n) => !esPausado(n));
  return { activos, pausados: negocios.length - activos.length };
}

/** Los que no tienen siguiente paso van primero; después, el cierre más cercano y, a igual fecha, el de más monto. */
export function ordenarNegocios<T extends Pick<NegocioVisto, "fechaCierre" | "monto"> & { marca: MarcaDelPaso | null }>(negocios: readonly T[]): T[] {
  return [...negocios].sort(
    (a, b) => Number(!a.marca) - Number(!b.marca) || (a.fechaCierre ?? "9999").localeCompare(b.fechaCierre ?? "9999") || (b.monto ?? 0) - (a.monto ?? 0),
  );
}

/** vencido = su tarea venció · sin-tomar = nunca llegó a ser tarea · reciente = todavía se puede tomar · en-tareas = al día. */
export type EstadoDelCompromiso = "vencido" | "sin-tomar" | "reciente" | "en-tareas";

export const ESTADOS_SIN_CUMPLIR: readonly EstadoDelCompromiso[] = ["vencido", "sin-tomar"];

export interface TareaDelCompromiso {
  titulo: string;
  estado: string;
  lado: string;
  origen: string;
  origenId: string | null;
  responsableEmail: string | null;
  /** `YYYY-MM-DD`. */
  venceEl: string | null;
  creadaAt: Date;
  /** Nexus cree que es la misma que otra tarea: la tarea sí existe. */
  mismaQueId: string | null;
}

export interface ReunionesDeLaEmpresa {
  /** ISO: la última reunión que ocurrió. */
  ultima: string | null;
  /** ISO: la próxima agendada. */
  proxima: string | null;
}

const ABIERTAS = new Set(["pendiente", "en_curso"]);
/** «Enviar la presentación», «Compartir la grabación de la demo»: nombran una reunión, pero se entregan, no se agendan. */
const UNA_ENTREGA = /^\s*(enviar|mandar|compartir|pasar|preparar|entregar|actualizar|revisar)\w*\b/i;
const SIN_TOMAR = new Set(["propuesta", "vencida"]);

/** ¿Se cumple agendando una reunión? */
export function esReunionPorAgendar(titulo: string): boolean {
  return esReunionPrometida(titulo) && !UNA_ENTREGA.test(titulo);
}

/**
 * ¿En qué está lo que prometió Smarteam en una reunión? null = no se muestra: otro lado, un correo, una decisión de una
 * persona (hecha, rechazada, «Ya no se hará»), lo que lleva más de 21 días sin tomar (ahí ya es limpieza, igual que el
 * aviso) o una reunión prometida que ya ocurrió o está agendada.
 */
export function estadoDelCompromiso(t: TareaDelCompromiso, reuniones: ReunionesDeLaEmpresa, hoyISO: string, ahora: Date): EstadoDelCompromiso | null {
  if (t.lado !== "smarteam" || t.origen === "correo" || !esCompromisoConElCliente(t)) return null;
  const abierta = ABIERTAS.has(t.estado);
  if (abierta && t.venceEl && diasHasta(t.venceEl, hoyISO) < 0) return "vencido";
  if (abierta && t.responsableEmail) return "en-tareas";
  if (!abierta && !SIN_TOMAR.has(t.estado)) return null;
  if (t.mismaQueId) return null;
  // Solo lo que nadie tomó, como el aviso. Una tarea con dueño se cumple haciéndola, aunque haya reunión.
  if (esReunionPorAgendar(t.titulo) && (reuniones.proxima || (reuniones.ultima && Date.parse(reuniones.ultima) >= +t.creadaAt))) return null;
  const horas = (+ahora - +t.creadaAt) / 3_600_000;
  if (horas > DIAS_QUE_AVISA * 24) return null;
  return horas < HORAS_PARA_AVISAR && t.estado !== "vencida" ? "reciente" : "sin-tomar";
}

/** La primera reunión de cada empresa, entre varios calendarios. */
export function primeraReunionDeCadaEmpresa(calendarios: ReadonlyArray<ReadonlyMap<string, ReunionDelNegocio>>): Map<string, ReunionDelNegocio> {
  const out = new Map<string, ReunionDelNegocio>();
  for (const cal of calendarios) {
    for (const [clientId, r] of cal) {
      const previa = out.get(clientId);
      if (!previa || Date.parse(r.inicio) < Date.parse(previa.inicio)) out.set(clientId, r);
    }
  }
  return out;
}

/** Cuántos compromisos sin cumplir tiene cada empresa. */
export function sinCumplirPorEmpresa(compromisos: ReadonlyArray<{ clientId: string; estado: EstadoDelCompromiso }>): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of compromisos) if (ESTADOS_SIN_CUMPLIR.includes(c.estado)) out.set(c.clientId, (out.get(c.clientId) ?? 0) + 1);
  return out;
}

/** Los compromisos de las empresas de esos negocios: «Mis negocios» deja solo lo de las suyas. */
export function compromisosDeLosNegocios<T extends { clientId: string }>(compromisos: readonly T[], negocios: ReadonlyArray<{ clientId: string | null }>): T[] {
  const empresas = new Set(negocios.flatMap((n) => (n.clientId ? [n.clientId] : [])));
  return compromisos.filter((c) => empresas.has(c.clientId));
}

/** Lo que dice la pantalla de un compromiso. */
export function textoDelCompromiso(e: EstadoDelCompromiso, venceEl: string | null): string {
  if (e === "vencido") return venceEl ? `Su tarea venció el ${fechaCorta(venceEl)}` : "Su tarea venció";
  if (e === "sin-tomar") return "Nunca se volvió tarea";
  return e === "reciente" ? "Sin decidir todavía" : "En Tareas";
}

const PESO: Record<EstadoDelCompromiso, number> = { vencido: 0, "sin-tomar": 1, reciente: 2, "en-tareas": 3 };

/** Lo sin cumplir primero; dentro, lo más nuevo. */
export function ordenarCompromisos<T extends { estado: EstadoDelCompromiso; creadaAt: string }>(compromisos: readonly T[]): T[] {
  return [...compromisos].sort((a, b) => PESO[a.estado] - PESO[b.estado] || b.creadaAt.localeCompare(a.creadaAt));
}
