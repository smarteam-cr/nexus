/**
 * lib/ai/presupuesto.ts — CUÁNTO PUEDE GASTAR NEXUS EN CLAUDE EN UN DÍA.
 *
 * Puro y sin dependencias: los límites, el corte del día y la decisión. Lo que necesita base
 * —cuánto se lleva gastado— vive en `guardia-de-presupuesto.ts`.
 *
 * ── LOS DOS PRESUPUESTOS, Y POR QUÉ NO ES UNO SOLO ───────────────────────────
 * La distinción que importa NO es por persona: es **humano vs. automático**.
 *
 * · **Automático** (nadie apretó un botón) es lo que puede dispararse solo, y ahí es donde un
 *   defecto se convierte en factura. Medido en este repo: `cs-watchdog-debounce` corre cada 60 s,
 *   `google-enrich-retry` cada 60 s y encadena 3 agentes por sesión, el auto-sync de Google Meet
 *   se dispara al navegar, y `reclassifyClientSessions` sale de 6 lugares distintos. Vara corta.
 * · **Humano** es alguien esperando un handoff. Cortarlo a la mitad es peor que el gasto. Vara larga.
 *
 * Hoy existen topes de CONCURRENCIA (`MAX_PROJECTS_PER_DEBOUNCE_TICK`, cooldowns, claims por día)
 * pero ninguno mira tokens ni dinero: un loop de llamadas baratas pasa por debajo de todos.
 *
 * ── ⚠ POR QUÉ EL DÍA Y NO EL MES ─────────────────────────────────────────────
 * Un tope mensual se entera del descontrol cuando ya se gastó el mes. El caso que esto existe para
 * cazar —algo que se disparó en loop— quema el presupuesto en horas, no en semanas.
 *
 * ── ⛔ LOS NÚMEROS DE ABAJO SON PROVISORIOS, Y SE INSTALAN APAGADOS ───────────
 * No se puede fijar un tope sensato antes de saber cuánto es lo normal: un número inventado corta
 * trabajo real o no corta nada. Por eso el default es AVISAR, no bloquear (`bloquea: false`), y
 * bloquear se enciende con `PRESUPUESTO_IA_BLOQUEA=1` después de una semana de medición real.
 */
import { crDateParts } from "@/lib/jobs/time";
import type { ClaseDeGasto } from "./contexto-de-corrida";

/** Provisorios — a calibrar con la primera semana de medición. Ver el docblock. */
export const PRESUPUESTO_DIARIO_USD: Record<ClaseDeGasto, number> = {
  automatico: 15,
  humano: 60,
};

/**
 * Costa Rica es UTC-6 TODO el año (no hay horario de verano), así que el arranque del día es la
 * fecha local a las 06:00 UTC. Se calcula desde `crDateParts` y no desde `getDate()` para que el
 * corte sea el mismo que usa el resto del sistema.
 */
export const OFFSET_CR_HORAS = 6;

export function inicioDelDiaCr(ahora: Date): Date {
  const { dateKey } = crDateParts(ahora);
  return new Date(`${dateKey}T0${OFFSET_CR_HORAS}:00:00.000Z`);
}

export interface LimitesDePresupuesto {
  automatico: number;
  humano: number;
  /** ⛔ `false` = solo avisa. El bloqueo se enciende con `PRESUPUESTO_IA_BLOQUEA=1`. */
  bloquea: boolean;
}

/** Lee la configuración del entorno, cayendo a los defaults provisorios ante cualquier basura. */
export function limitesDelEntorno(env: NodeJS.ProcessEnv = process.env): LimitesDePresupuesto {
  const num = (v: string | undefined, porDefecto: number): number => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : porDefecto;
  };
  return {
    automatico: num(env.PRESUPUESTO_IA_AUTOMATICO_USD_DIA, PRESUPUESTO_DIARIO_USD.automatico),
    humano: num(env.PRESUPUESTO_IA_HUMANO_USD_DIA, PRESUPUESTO_DIARIO_USD.humano),
    bloquea: env.PRESUPUESTO_IA_BLOQUEA === "1",
  };
}

export interface Veredicto {
  clase: ClaseDeGasto;
  limiteUsd: number;
  gastadoUsd: number;
  /** El presupuesto del día ya está agotado para esa clase. */
  excedido: boolean;
  /** Excedido Y el bloqueo encendido: recién acá la llamada no sale. */
  bloquea: boolean;
  mensaje: string | null;
}

/**
 * Decide sin efectos: qué pasa con una llamada de esta clase habiendo gastado `gastadoUsd` hoy.
 *
 * ⚠ `gastadoUsd` desconocido (`null`) NO excede. Si la lectura del gasto falla, el presupuesto no
 * puede afirmar que se agotó: un tope que corta por no haber podido leer la base tumbaría todos los
 * agentes por un problema que no es de gasto. El instrumento no puede ser la causa del incidente.
 */
export function evaluarPresupuesto(
  clase: ClaseDeGasto,
  gastadoUsd: number | null,
  limites: LimitesDePresupuesto,
): Veredicto {
  const limiteUsd = clase === "humano" ? limites.humano : limites.automatico;
  const gastado = gastadoUsd ?? 0;
  const excedido = gastadoUsd !== null && gastado >= limiteUsd;
  const bloquea = excedido && limites.bloquea;
  return {
    clase,
    limiteUsd,
    gastadoUsd: gastado,
    excedido,
    bloquea,
    mensaje: excedido
      ? `El presupuesto de IA ${clase === "humano" ? "de uso humano" : "automático"} del día se agotó: ` +
        `$${gastado.toFixed(2)} de $${limiteUsd.toFixed(2)}.` +
        (bloquea ? "" : " (modo aviso: la llamada sale igual)")
      : null,
  };
}

/**
 * El error que ve una corrida frenada por presupuesto. Nombre propio para que el mensaje que queda
 * en `AgentRun.status = ERROR` diga la causa real y no un fallo genérico de la API.
 */
export class PresupuestoDeIaAgotado extends Error {
  readonly clase: ClaseDeGasto;
  readonly limiteUsd: number;
  readonly gastadoUsd: number;

  constructor(v: Veredicto) {
    super(
      `${v.mensaje ?? "Presupuesto de IA agotado."} Se puede subir el tope con ` +
        `PRESUPUESTO_IA_${v.clase === "humano" ? "HUMANO" : "AUTOMATICO"}_USD_DIA, o apagar el ` +
        `bloqueo con PRESUPUESTO_IA_BLOQUEA=0.`,
    );
    this.name = "PresupuestoDeIaAgotado";
    this.clase = v.clase;
    this.limiteUsd = v.limiteUsd;
    this.gastadoUsd = v.gastadoUsd;
  }
}
