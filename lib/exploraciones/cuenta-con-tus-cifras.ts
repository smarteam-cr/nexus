/**
 * lib/exploraciones/cuenta-con-tus-cifras.ts — LA CUENTA CON TUS CIFRAS (24 nov, Elías: «el costo se calcula con las
 * cifras que dio el cliente»). PURO y client-safe.
 *
 * Una cifra «calculado» del Resumen de la escala no la escribe el modelo: el modelo da los FACTORES («10 clientes que se
 * van al mes», «US$ 85 de cuota»), cada uno con su cita de la empresa, y este código multiplica. Así la cuenta es siempre
 * la misma con los mismos números, y un número que la empresa no dijo no entra (lo verifica quien llama, contra la cita:
 * lib/exploraciones/resumen-de-la-escala.ts › `calculadaConSusCitas`).
 *
 * Solo multiplica: volumen × ticket, leads × conversión × ticket. Sumar o restar mezclaría períodos y datos de reuniones
 * distintas sin que se vea. Un porcentaje entra como tasa («14 %» es 0,14). Como mucho una moneda y un período (el mismo
 * en varios factores vale: «10 clientes al mes × US$ 85 al mes» da lo que se deja de cobrar al mes). Cada factor es UN
 * número: un rango («120 a 150») o una proporción («9 de 30») no entran (la cuenta saldría del primero y diría más de lo
 * que se sabe). El «=» dice el resultado exacto, sin redondear: el cliente puede rehacer la multiplicación.
 */
import { formatearNumero, monedaDe, numeroDe, tasaDe } from "./perdida";

/** Cuántos factores lleva una cuenta: con más, ya no se lee de un vistazo. */
export const MAX_FACTORES = 3;

export interface FactorDeLaCuenta {
  /** El número como lo dijo la empresa, con su moneda o su «%» («10», «US$ 85», «14 %»). */
  valor: string;
  /** Qué es, de 1 a 6 palabras («clientes que se van al mes», «de cuota»). */
  rotulo: string;
}

export type CuentaHecha = { ok: true; cifra: string; texto: string; resultado: number; moneda: string | null } | { ok: false; motivo: string };

/**
 * Los períodos que puede decir un factor, con cómo se reconocen y cómo se dicen al final de la cuenta. «al mes», «por mes»,
 * «cada mes» y «mensual» son el mismo (revisión del 24 nov: «anual» × «al mes» pasaba como un solo período).
 */
const PERIODOS: readonly { forma: RegExp; dicho: string }[] = [
  { forma: /\s*\b(?:(?:al|por|cada)\s+mes|mensual(?:es|mente)?)\b/i, dicho: "al mes" },
  { forma: /\s*\b(?:(?:al|por|cada)\s+a[nñ]o|anual(?:es|mente)?)\b/i, dicho: "al año" },
  { forma: /\s*\b(?:(?:a la|por|cada)\s+semana|semanal(?:es|mente)?)\b/i, dicho: "a la semana" },
  { forma: /\s*\b(?:(?:al|por|cada)\s+d[ií]a|diari[oa]s?|diariamente)\b/i, dicho: "al día" },
  { forma: /\s*\b(?:(?:al|por|cada)\s+trimestre|trimestral(?:es|mente)?)\b/i, dicho: "al trimestre" },
];
/** Los períodos que dice un texto (el número y su rótulo). */
const periodosDe = (texto: string) => PERIODOS.filter((p) => p.forma.test(texto));
const sinPeriodo = (texto: string) => PERIODOS.reduce((t, p) => t.replace(p.forma, ""), texto).replace(/\s+/g, " ").trim();
/** Los números de un valor («120 a 150» trae dos; «US$ 1.500» y «2,5 %», uno). */
const numerosDe = (v: string) => (v.match(/\d+(?:[.,]\d+)*/g) ?? []).length;

/** Un número de un factor: una tasa si trae «%»; si no, el número con su multiplicador («120 mil»). */
function valorDe(v: string): number | null {
  if (/%|por\s*ciento/i.test(v)) return tasaDe(v);
  return numeroDe(v);
}

/** El monto de un factor o del resultado: la moneda que dice el número o, si no la dice, su rótulo. */
export const monedaDelFactor = (f: FactorDeLaCuenta): string | null => monedaDe(f.valor) ?? monedaDe(f.rotulo);

/** El resultado EXACTO, con punto de miles y coma decimal: con moneda, sus centavos («US$ 112,50»); sin ella, hasta dos decimales. */
function exacto(n: number, moneda: string | null): string {
  const centavos = Math.round(n * 100) / 100;
  const [entero, decimal] = centavos.toFixed(2).split(".");
  const base = formatearNumero(Number(entero));
  if (decimal === "00") return `${moneda ? `${moneda} ` : ""}${base}`;
  return `${moneda ? `${moneda} ` : ""}${base},${moneda ? decimal : decimal.replace(/0$/, "")}`;
}

/**
 * La cuenta: multiplica los factores y la dice a la vista («10 clientes que se van × US$ 85 de cuota = US$ 850 al mes»).
 * Rechaza (con el motivo) una cuenta de menos de dos factores o más de `MAX_FACTORES`, un factor sin número o con más de
 * uno (un rango, una proporción), dos montos o dos períodos distintos. El mismo período en varios factores vale y se dice
 * una vez al final. El «=» es el resultado exacto, con sus centavos: el cliente puede rehacer la multiplicación.
 */
export function cuentaConTusCifras(factores: readonly FactorDeLaCuenta[]): CuentaHecha {
  if (factores.length < 2) return { ok: false, motivo: "una cuenta necesita por lo menos dos números" };
  if (factores.length > MAX_FACTORES) return { ok: false, motivo: `una cuenta lleva hasta ${MAX_FACTORES} números` };
  const varios = factores.find((f) => numerosDe(f.valor) !== 1);
  if (varios) return { ok: false, motivo: `«${varios.valor}» no es UN número (un rango o una proporción no entran en una cuenta)` };
  const valores = factores.map((f) => valorDe(f.valor));
  const sinNumero = factores.find((_, i) => valores[i] === null || !Number.isFinite(valores[i]!) || valores[i]! <= 0);
  if (sinNumero) return { ok: false, motivo: `«${sinNumero.valor}» no es un número` };
  const monedas = factores.map(monedaDelFactor).filter((m): m is string => !!m);
  if (monedas.length > 1) return { ok: false, motivo: "trae dos montos: no se multiplican" };
  const periodos = new Set(factores.flatMap((f) => periodosDe(`${f.valor} ${f.rotulo}`).map((p) => p.dicho)));
  if (periodos.size > 1) return { ok: false, motivo: "trae dos períodos distintos: no se multiplican" };
  const resultado = valores.reduce<number>((s, v) => s * v!, 1);
  const moneda = monedas[0] ?? null;
  const cifra = exacto(resultado, moneda);
  const dichos = factores.map((f) => [sinPeriodo(f.valor), sinPeriodo(f.rotulo)].filter(Boolean).join(" "));
  const periodo = [...periodos][0];
  return { ok: true, cifra, texto: `${dichos.join(" × ")} = ${cifra}${periodo ? ` ${periodo}` : ""}`, resultado, moneda };
}
