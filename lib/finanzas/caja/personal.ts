/**
 * lib/finanzas/caja/personal.ts — lo que la caja paga a las PERSONAS, en una sola línea por corte (2026-11-13). PURO.
 *
 * ── POR QUÉ ─────────────────────────────────────────────────────────────────────
 * «Dónde está la plata» la ve quien tiene «Caja y pagos» (`tesoreria`), que no es el permiso de salarios ni el de
 * comisiones. La primera versión mostraba la planilla una línea por moneda y las comisiones de vendedor una línea por día
 * y moneda con «(1 persona)»: si una sola persona cobra en dólares, la línea en dólares ES su salario; si un solo vendedor
 * cobra comisión esa quincena, la línea es su comisión (revisión del 13 de noviembre).
 *
 * ── LA REGLA ────────────────────────────────────────────────────────────────────
 * Salarios y comisiones de vendedor van juntos como «Personal», UNA línea por corte (quincena o mes), en UNA moneda: la
 * que más pesa de las dos en todo el horizonte, con lo de la otra pasado con el tipo de cambio de venta del BCCR (el
 * mismo con que la caja dice «en dólares»). Así una línea siempre junta a toda la planilla del corte, nunca a una persona.
 *
 * La caja sigue cuadrando: lo de personal se resta del mismo corte en que caía, y lo libre «en dólares» no cambia ni un
 * centavo. Lo que cambia es de qué moneda sale: lo de la otra moneda se cuenta en la que más pesa. Es el costo de no
 * mostrar un salario; se dice en la pantalla.
 *
 * ⚠ LO QUE NO QUEDA GARANTIZADO: sin NINGÚN tipo de cambio en la base (ni del BCCR ni cargado a mano) no se puede
 * convertir, y va una línea por moneda. Si una moneda tiene una sola persona, esa línea es su salario. No pasa en
 * producción (la copia del BCCR es diaria y hay tasas a mano desde 2025); queda escrito para que nadie lo descubra con un
 * salario.
 */
import type { Moneda } from "./proyeccion";

/** Una cosa que se le paga a una persona: medio salario de una quincena, o una comisión. */
export interface PartidaDePersonal {
  corteKey: string;
  /** Quién (el id de la persona, o el del costo si el salario no está ligado a nadie). Solo para contar; no viaja. */
  persona: string;
  moneda: Moneda;
  monto: number;
}

/** Lo de personal de un corte, ya junto. */
export interface PersonalDelCorte {
  corteKey: string;
  moneda: Moneda;
  monto: number;
  /** Cuántas personas hay detrás. Solo para las pruebas: no viaja al navegador. */
  personas: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** La moneda en que va lo de personal: la que más pesa (en dólares) en todo el horizonte. Colones si empatan. */
export function monedaDelPersonal(partidas: readonly PartidaDePersonal[], crcPorUsd: number): Moneda {
  let crc = 0;
  let usd = 0;
  for (const p of partidas) {
    if (p.moneda === "CRC") crc += p.monto / crcPorUsd;
    else usd += p.monto;
  }
  return usd > crc ? "USD" : "CRC";
}

/** Junta lo de personal de cada corte. Con tipo de cambio: una entrada por corte, en una moneda. Sin él: una por moneda. */
export function juntarPersonal(partidas: readonly PartidaDePersonal[], crcPorUsd: number | null): PersonalDelCorte[] {
  const tc = crcPorUsd && crcPorUsd > 0 ? crcPorUsd : null;
  const destino = tc ? monedaDelPersonal(partidas, tc) : null;
  const grupos = new Map<string, { corteKey: string; moneda: Moneda; monto: number; personas: Set<string> }>();
  for (const p of partidas) {
    if (p.monto === 0) continue;
    const moneda = destino ?? p.moneda;
    let monto = p.monto;
    if (destino && p.moneda !== destino) monto = destino === "CRC" ? p.monto * tc! : p.monto / tc!;
    const k = `${p.corteKey}|${moneda}`;
    const g = grupos.get(k) ?? { corteKey: p.corteKey, moneda, monto: 0, personas: new Set<string>() };
    g.monto += monto;
    g.personas.add(p.persona);
    grupos.set(k, g);
  }
  return [...grupos.values()].map((g) => ({
    corteKey: g.corteKey,
    moneda: g.moneda,
    monto: round2(g.monto),
    personas: g.personas.size,
  }));
}

/** En qué corte cae un día: el que lo contiene; lo de antes del primero, en el primero; lo de después del último, en ninguno. */
export function corteDelDia<T extends { key: string; desdeISO: string; hastaISO: string }>(cortes: readonly T[], fechaISO: string): T | null {
  if (cortes.length === 0) return null;
  if (fechaISO < cortes[0]!.desdeISO) return cortes[0]!;
  return cortes.find((c) => fechaISO >= c.desdeISO && fechaISO <= c.hastaISO) ?? null;
}
