/**
 * lib/cobranza/mercury/saldos.ts — leer el saldo de cada cuenta de Mercury (2026-11-13). PURO: ni base ni reloj.
 *
 * Mercury dice dos saldos por cuenta (medido el 2026-11-13): `currentBalance` (el contable) y `availableBalance` (lo que
 * se puede usar: descuenta lo enviado que todavía no se asentó). La caja usa el DISPONIBLE: ese día la cuenta principal
 * tenía US$13.606 contables y US$3.228 disponibles, porque había US$10.000 enviados en camino. Contar el contable
 * sería contar dos veces una plata que ya salió.
 */

export interface SaldoDeMercury {
  mercuryAccountId: string;
  /** «Mercury Checking ••6736», o el apodo si la cuenta lo tiene. */
  nombre: string;
  disponible: number;
  contable: number | null;
  /** La razón social dueña de la cuenta (texto). */
  sociedad: string | null;
}

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Una cuenta de la API. null = no se pudo leer (sin id o sin saldo disponible), o la cuenta no está activa. */
export function mapearSaldo(c: Record<string, unknown>): SaldoDeMercury | null {
  const id = texto(c.id);
  const disponible = numero(c.availableBalance);
  if (!id || disponible === null) return null;
  if (texto(c.status) && texto(c.status) !== "active") return null;
  const nombre = texto(c.name) ?? "Mercury";
  const apodo = texto(c.nickname);
  return {
    mercuryAccountId: id,
    nombre: apodo ? `${nombre} (${apodo})` : nombre,
    disponible,
    contable: numero(c.currentBalance),
    sociedad: texto(c.legalBusinessName),
  };
}
