/**
 * lib/cobranza/mercury/emparejado.ts
 *
 * Qué cuenta de Nexus es cada cliente de Mercury. PURO: sin Prisma, sin red y sin reloj. Propone; confirma una persona.
 *
 * ── POR QUÉ HACE FALTA (medido el 2026-10-02) ──────────────────────────────────────
 * Mercury guarda la razón social y Nexus el nombre comercial: de 30 clientes, solo 7 se parecen al nombre de su cuenta.
 * «SOLUCIONES, ANALITICOS Y SERVICIOS TEAM» es Teamnet; «Javier Noel López Pravia» es Ferretería Noelito. Sin el
 * emparejado, ninguna factura de Mercury es de ninguna cuenta y no hay con qué cruzar los cobros.
 *
 * ── LAS SEÑALES, de la más segura a la menos ────────────────────────────────────────
 * 1. NUMERO: los cobros de UNA sola cuenta tienen anotados números de facturas de ese cliente. Es la evidencia que dejó
 *    una persona al marcar facturado; no tiene falsos positivos salvo un número mal tecleado.
 * 2. NOMBRE: el nombre del cliente, sin forma jurídica ni puntuación (`claveFactura`), es el de la cuenta, el de su
 *    razón social o el de una sociedad de Mercury que ya le factura; o uno contiene al otro.
 * 3. MONTO: montos de sus facturas que solo aparecen en los cobros de UNA cuenta que factura por Mercury. Es la más
 *    débil, y se muestra con su evidencia para que nadie confirme a ciegas.
 */
import { claveFactura } from "../sociedades";
import { numeroDeMercury } from "./espejo";

export type ViaMercury = "NUMERO" | "NOMBRE" | "MONTO" | "MANUAL";

export interface ClienteParaEmparejar {
  mercuryCustomerId: string;
  nombre: string;
  cuentaId: string | null;
  ignorado: boolean;
}

export interface FacturaParaEmparejar {
  numero: string;
  mercuryCustomerId: string;
  monto: number;
  moneda: string;
  estado: string;
}

export interface CuentaParaEmparejar {
  cuentaId: string;
  nombre: string;
  razonSocial: string | null;
  /** Los nombres de sus sociedades de Mercury ya anotadas. */
  sociedadesMercury: readonly string[];
  /** ODOO, MERCURY u OTRA. */
  via: string;
}

export interface CobroParaEmparejar {
  cuentaId: string;
  monto: number;
  moneda: string;
  numeroFactura: string | null;
}

export interface PropuestaMercury {
  cuentaId: string;
  cuentaNombre: string;
  via: Exclude<ViaMercury, "MANUAL">;
  /** Por qué se propone, en palabras: lo que permite distinguir un acierto de una casualidad. */
  evidencia: string;
}

const ORDEN: Record<PropuestaMercury["via"], number> = { NUMERO: 0, NOMBRE: 1, MONTO: 2 };
const centavos = (n: number) => Math.round(n * 100);

/** ¿Los dos nombres son la misma empresa? Igual sin forma jurídica, o uno contiene al otro (con al menos 5 letras). */
export function nombresParecidos(a: string, b: string): boolean {
  const [x, y] = [claveFactura(a), claveFactura(b)];
  if (!x || !y) return false;
  if (x === y) return true;
  const [corto, largo] = x.length <= y.length ? [x, y] : [y, x];
  return corto.replace(/\s/g, "").length >= 5 && ` ${largo} `.includes(` ${corto} `);
}

/**
 * Las propuestas para cada cliente SIN decidir (ni emparejado ni marcado ajeno), de la más segura a la menos. Una
 * cuenta aparece una sola vez por cliente, con su mejor señal.
 */
export function proponerCuentas(
  clientes: readonly ClienteParaEmparejar[],
  facturas: readonly FacturaParaEmparejar[],
  cuentas: readonly CuentaParaEmparejar[],
  cobros: readonly CobroParaEmparejar[],
): Map<string, PropuestaMercury[]> {
  const out = new Map<string, PropuestaMercury[]>();
  const nombreDe = new Map(cuentas.map((c) => [c.cuentaId, c.nombre]));
  const viaDe = new Map(cuentas.map((c) => [c.cuentaId, c.via]));

  /* Qué cuentas tienen anotado cada número, y qué montos tiene cada cuenta (por moneda). */
  const cuentasDelNumero = new Map<string, Set<string>>();
  const cuentasDelMonto = new Map<string, Set<string>>();
  for (const c of cobros) {
    const n = numeroDeMercury(c.numeroFactura);
    if (n) cuentasDelNumero.set(n, (cuentasDelNumero.get(n) ?? new Set()).add(c.cuentaId));
    const k = `${c.moneda}|${centavos(c.monto)}`;
    cuentasDelMonto.set(k, (cuentasDelMonto.get(k) ?? new Set()).add(c.cuentaId));
  }

  for (const cl of clientes) {
    if (cl.cuentaId || cl.ignorado) continue;
    const suyas = facturas.filter((f) => f.mercuryCustomerId === cl.mercuryCustomerId && f.estado !== "Cancelled");
    const propuestas = new Map<string, PropuestaMercury>();
    const proponer = (p: PropuestaMercury) => {
      const ya = propuestas.get(p.cuentaId);
      if (!ya || ORDEN[p.via] < ORDEN[ya.via]) propuestas.set(p.cuentaId, p);
    };

    /* 1. NUMERO */
    const porCuenta = new Map<string, string[]>();
    for (const f of suyas) {
      const n = numeroDeMercury(f.numero);
      const cs = n ? cuentasDelNumero.get(n) : undefined;
      if (cs?.size === 1) {
        const [cuentaId] = [...cs];
        porCuenta.set(cuentaId!, [...(porCuenta.get(cuentaId!) ?? []), f.numero]);
      }
    }
    for (const [cuentaId, numeros] of porCuenta) {
      proponer({
        cuentaId,
        cuentaNombre: nombreDe.get(cuentaId) ?? cuentaId,
        via: "NUMERO",
        evidencia: `${numeros.length === 1 ? `La ${numeros[0]} está anotada` : `${numeros.join(", ")} están anotadas`} en cobros de esta cuenta.`,
      });
    }

    /* 2. NOMBRE */
    for (const c of cuentas) {
      const igualA = [c.nombre, c.razonSocial, ...c.sociedadesMercury].find((n): n is string => !!n && nombresParecidos(cl.nombre, n));
      if (igualA) {
        proponer({
          cuentaId: c.cuentaId,
          cuentaNombre: c.nombre,
          via: "NOMBRE",
          evidencia: igualA === c.nombre ? "El nombre es el de la cuenta." : `El nombre es el de «${igualA}», de esta cuenta.`,
        });
      }
    }

    /* 3. MONTO: montos de sus facturas que solo tiene una cuenta. ⚠ Solo entre las cuentas que facturan por Mercury:
       medido el 2026-10-02, abierto a todas proponía Honda Costa Rica para Patagonia Camp por un cobro de US$4.000. */
    const montoPorCuenta = new Map<string, string[]>();
    for (const f of suyas) {
      const cs = cuentasDelMonto.get(`${f.moneda}|${centavos(f.monto)}`);
      if (cs?.size === 1) {
        const [cuentaId] = [...cs];
        if (viaDe.get(cuentaId!) !== "MERCURY") continue;
        const texto = `${f.numero} por ${f.moneda === "USD" ? "US$" : `${f.moneda} `}${f.monto.toLocaleString("es-CR")}`;
        montoPorCuenta.set(cuentaId!, [...(montoPorCuenta.get(cuentaId!) ?? []), texto]);
      }
    }
    for (const [cuentaId, textos] of montoPorCuenta) {
      proponer({
        cuentaId,
        cuentaNombre: nombreDe.get(cuentaId) ?? cuentaId,
        via: "MONTO",
        evidencia: `Solo esta cuenta tiene un cobro por el monto de ${textos.slice(0, 3).join(", ")}${textos.length > 3 ? "…" : ""}.`,
      });
    }

    const lista = [...propuestas.values()].sort((a, b) => ORDEN[a.via] - ORDEN[b.via] || a.cuentaNombre.localeCompare(b.cuentaNombre, "es"));
    if (lista.length) out.set(cl.mercuryCustomerId, lista);
  }
  return out;
}

/** Las cuentas que facturan por Mercury y no tienen ningún cliente de Mercury emparejado. */
export function cuentasSinClienteDeMercury<T extends { cuentaId: string; via: string }>(
  cuentas: readonly T[],
  clientes: readonly Pick<ClienteParaEmparejar, "cuentaId">[],
): T[] {
  const con = new Set(clientes.flatMap((c) => (c.cuentaId ? [c.cuentaId] : [])));
  return cuentas.filter((c) => c.via === "MERCURY" && !con.has(c.cuentaId));
}
