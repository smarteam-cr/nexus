/**
 * lib/exploraciones/perdida-de-la-escala.ts — LA PÉRDIDA VALIDADA, como la usa la escala que ve el cliente (20 nov, Elías:
 * «que el cliente vea cuánto le cuesta quedarse igual, en cifras dichas por él»). PURO y client-safe.
 *
 * La pérdida la calcula y la guarda la preventa (lib/exploraciones/perdida.ts, `PerdidaValidada`): con las
 * cifras de Negocio y Embudo que dijo el cliente y una meta suya («de 4 % a 7 % de conversión»), Nexus hace la cuenta; quien
 * lleva la preventa la valida con el cliente y queda en `contenido.perdida` con su cuenta y cuándo se validó.
 *
 * ⛔ ESTE ES EL ÚNICO LUGAR que la lee para la escala (el Resumen, la página de cada área y el agente del Resumen pasan por
 * acá). Lee el Json crudo, con tolerancia (un campo roto no rompe la página): si la forma cambia, se corrige esta función.
 * Solo sale con monto la VALIDADA (con `validadaEn`): una cuenta que nadie confirmó con el cliente no es una cifra suya, y
 * va como «por validar», sin el monto (la coordinación, 20 nov). Solo el Resumen y la página de cada área: la propuesta, el
 * correo de seguimiento y el handoff no la leen.
 */
import { leerContenido } from "./esquemas";
import { calcularLaPerdida, formatearMonto } from "./perdida";

/** La pérdida lista para la página: la cifra en grande, su rótulo y la cuenta que la explica. */
export interface PerdidaDeLaEscala {
  /** «US$ 15.000». */
  cifra: string;
  /** «al mes por no llegar a «subir la conversión»». */
  rotulo: string;
  /** La cuenta, a la vista: «200 leads al mes × (7 % − 4 %) de conversión × US$ 2.500 de ticket = US$ 15.000 al mes». */
  cuenta: string;
  /** La meta del cliente de la que sale la brecha. */
  meta: string;
  /** La huella de las cifras de la cuenta: ata lo que una persona escribió o quitó a ESTA cuenta. */
  huella: string;
  /** Cuándo se validó con el cliente (ISO). */
  validadaEn: string;
}

const MAX = 600;
const cadena = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, MAX) : "");

/** Lo que la escala sabe de la pérdida: la validada (con su monto) y, si hay una cuenta sin validar, de qué meta sale. */
export interface LaPerdidaEnLaEscala {
  validada: PerdidaDeLaEscala | null;
  /** Hay una cuenta hecha con las cifras de hoy que nadie validó con el cliente: va «por validar», sin monto. */
  porValidar: { meta: string } | null;
}

/**
 * LA función: la pérdida de una exploración (su `contenido` crudo) como la usa la escala. Una validada cuya cuenta ya no es
 * la de las cifras de hoy (la empresa corrigió su ticket, sus leads o su meta después de validarla) no sale con su monto:
 * va «por validar», como en la preventa (`perdidaDeLaExploracion`).
 */
export function perdidaDeLaEscala(contenido: unknown): LaPerdidaEnLaEscala {
  const guardada = validadaDe(contenido);
  let calculo: ReturnType<typeof calcularLaPerdida> = null;
  if (contenido && typeof contenido === "object" && !Array.isArray(contenido)) {
    try {
      calculo = calcularLaPerdida(leerContenido(contenido).casillas);
    } catch {
      calculo = null;
    }
  }
  const vieja = !!guardada && !!calculo && calculo.huella !== guardada.huella;
  const validada = vieja ? null : guardada;
  const porValidar = !validada && calculo ? { meta: calculo.meta.replace(/[«»]/g, "").slice(0, 200) } : null;
  return { validada, porValidar };
}

/** La pérdida validada (su `contenido` crudo), o null si no hay una validada con su cuenta. */
function validadaDe(contenido: unknown): PerdidaDeLaEscala | null {
  if (!contenido || typeof contenido !== "object" || Array.isArray(contenido)) return null;
  const p = (contenido as Record<string, unknown>).perdida;
  if (!p || typeof p !== "object" || Array.isArray(p)) return null;
  const x = p as Record<string, unknown>;
  const monto = typeof x.montoAlMes === "number" && Number.isFinite(x.montoAlMes) ? x.montoAlMes : null;
  const validadaEn = cadena(x.validadaEn);
  const cuenta = cadena(x.cuenta);
  const huella = cadena(x.huella);
  if (!monto || monto <= 0 || !validadaEn || Number.isNaN(Date.parse(validadaEn)) || !cuenta || !huella) return null;
  const moneda = typeof x.moneda === "string" && x.moneda.trim() ? x.moneda.trim().slice(0, 8) : null;
  const meta = cadena(x.meta);
  return {
    // El mismo monto que muestra la preventa: tres cifras significativas y punto de miles.
    cifra: formatearMonto(monto, moneda),
    rotulo: meta ? `al mes por no llegar a «${meta.replace(/[«»]/g, "")}»` : "al mes",
    cuenta,
    meta,
    huella: huella.replace(/[^A-Za-z0-9]/g, "").slice(0, 40),
    validadaEn,
  };
}

/** Lo que lee el agente del Resumen: orienta qué pesa (no la escribe él; la pone la página). */
export function perdidaParaElAgente(l: LaPerdidaEnLaEscala): string {
  const p = l.validada;
  if (!p) return "";
  return `La pérdida que la empresa VALIDÓ con quien lleva la preventa (sale sola en la página, en la fila de Ventas: NO escribas su número; úsala para saber qué pesa): pierde ~${p.cifra} ${p.rotulo}. La cuenta, con sus cifras: ${p.cuenta}.`;
}
