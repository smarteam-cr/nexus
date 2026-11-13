/**
 * lib/sociedades/ajustes-contables.ts — el resultado operativo contra el contable (2026-11-13). PURO.
 *
 * En octubre de 2026 se vio un déficit que no era real: eran períodos sin liquidar, IVA rectificado y etiquetas mal
 * puestas en Odoo. Un mes con ajustes contables pendientes queda MARCADO para que nadie lea su resultado como pérdida.
 *
 * ── DE DÓNDE SALE LA MARCA ───────────────────────────────────────────────────────
 * La pone una persona en el cierre del mes (`CierreMes.ajustesContablesPendientes`, con su nota). Odoo no la puede
 * dar sola: un IVA por rectificar o una etiqueta mal puesta no se distinguen de un asiento correcto desde la API.
 * Lo que sí se ve en Odoo son INDICIOS, y se muestran al lado para ayudar a decidir (`senalesDelMes`):
 *   · documentos del mes en borrador (Odoo no los cuenta: el mes está incompleto);
 *   · líneas del mes que siguen en una cuenta puente (la de suspenso del banco, los cobros y pagos sin aplicar);
 *   · líneas del mes en cuentas cuyo código y tipo no dicen la misma clase (catalogo.ts): un gasto con etiqueta de
 *     ingreso cambia el resultado;
 *   · traslados entre cuentas propias sin su otra mitad (entre-sociedades.ts).
 * Medido el 2026-11-13: octubre tenía 6 documentos en borrador y 27 líneas en cuentas puente.
 * Un indicio no marca el mes: lo decide la persona.
 */

/** Las cuentas puente de una compañía de Odoo 17: suspenso del banco, cobros sin aplicar y pagos sin aplicar. */
export const ODOO_CAMPOS_COMPANIA = [
  "id",
  "name",
  "currency_id",
  "transfer_account_id",
  "account_journal_suspense_account_id",
  "account_journal_payment_debit_account_id",
  "account_journal_payment_credit_account_id",
] as const;

export interface CompaniaOdoo {
  id: number;
  nombre: string;
  moneda: string | null;
  cuentaDeTraslado: number | null;
  /** Las cuentas puente que no se cuentan como resultado: suspenso, cobros y pagos sin aplicar. */
  cuentasPuente: number[];
}

function idDe(v: unknown): number | null {
  if (!Array.isArray(v) || v.length < 1) return null;
  const n = Number(v[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Una fila de `res.company` → lo que se usa. Un campo que la versión de Odoo no tenga llega `undefined` y se ignora. */
export function mapearCompania(c: Record<string, unknown>): CompaniaOdoo | null {
  const id = Number(c.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  const moneda = Array.isArray(c.currency_id) && typeof c.currency_id[1] === "string" ? c.currency_id[1] : null;
  const puentes = [
    idDe(c.account_journal_suspense_account_id),
    idDe(c.account_journal_payment_debit_account_id),
    idDe(c.account_journal_payment_credit_account_id),
  ].filter((n): n is number => n !== null);
  return {
    id,
    nombre: typeof c.name === "string" ? c.name : `Compañía ${id}`,
    moneda,
    cuentaDeTraslado: idDe(c.transfer_account_id),
    cuentasPuente: [...new Set(puentes)],
  };
}

/** El primer día del mes y el primero del siguiente, para un dominio de Odoo (`date >= desde` y `date < hasta`). */
export function rangoDelMes(periodo: string): { desde: string; hasta: string } {
  const [a, m] = periodo.split("-").map(Number) as [number, number];
  const sig = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
  return { desde: `${periodo}-01`, hasta: `${sig}-01` };
}

export interface DatosDeOdooDelMes {
  borradores: Array<{ nombre: string; tipo: string }>;
  /** Líneas del mes sin conciliar en una cuenta puente, por cuenta. */
  enPuente: Array<{ cuenta: string; n: number }>;
  /** Líneas del mes en cuentas con el código y el tipo cruzados, por cuenta. */
  malClasificadas: Array<{ cuenta: string; n: number }>;
  /** Traslados propios del mes sin su otra mitad (de la copia de Nexus). */
  trasladosSueltos: number;
}

export interface SenalContable {
  clave: "borradores" | "puente" | "clasificacion" | "traslados";
  titulo: string;
  detalle: string;
  n: number;
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);

/** Los indicios del mes, en palabras. Vacío = Odoo no muestra nada raro (no quiere decir que no haya ajustes). */
export function senalesDelMes(d: DatosDeOdooDelMes): SenalContable[] {
  const out: SenalContable[] = [];
  if (d.borradores.length > 0) {
    const tipos = [...new Set(d.borradores.map((b) => NOMBRE_DEL_DOCUMENTO[b.tipo] ?? "asientos"))];
    out.push({
      clave: "borradores",
      titulo: `${plural(d.borradores.length, "documento", "documentos")} del mes en borrador en Odoo`,
      detalle: `Odoo no los cuenta todavía (${tipos.join(", ")}): ${d.borradores.slice(0, 4).map((b) => b.nombre).join(", ")}${d.borradores.length > 4 ? "…" : ""}.`,
      n: d.borradores.length,
    });
  }
  const puente = d.enPuente.reduce((s, c) => s + c.n, 0);
  if (puente > 0) {
    out.push({
      clave: "puente",
      titulo: `${plural(puente, "línea", "líneas")} del mes en cuentas puente`,
      detalle: `Plata del banco o cobros y pagos que todavía no se aplicaron: ${d.enPuente.map((c) => `${c.cuenta} (${c.n})`).join(", ")}.`,
      n: puente,
    });
  }
  const mal = d.malClasificadas.reduce((s, c) => s + c.n, 0);
  if (mal > 0) {
    out.push({
      clave: "clasificacion",
      titulo: `${plural(mal, "línea", "líneas")} en cuentas con la clase cruzada`,
      detalle: `El código de la cuenta dice una clase y su tipo otra, así que pueden sumar al resultado del lado equivocado: ${d.malClasificadas.map((c) => `${c.cuenta} (${c.n})`).join(", ")}.`,
      n: mal,
    });
  }
  if (d.trasladosSueltos > 0) {
    out.push({
      clave: "traslados",
      titulo: `${plural(d.trasladosSueltos, "traslado", "traslados")} entre cuentas propias sin su otra mitad`,
      detalle: "Salió de una cuenta y no se ve dónde entró (o al revés). Se revisan en Finanzas › Sociedades.",
      n: d.trasladosSueltos,
    });
  }
  return out;
}

const NOMBRE_DEL_DOCUMENTO: Record<string, string> = {
  out_invoice: "facturas",
  out_refund: "notas de crédito",
  in_invoice: "facturas de proveedor",
  in_refund: "notas de crédito de proveedor",
  entry: "asientos",
};

export interface MarcaDeAjustes {
  pendientes: boolean;
  nota: string | null;
  por: string | null;
  /** AAAA-MM-DD de Costa Rica. */
  en: string | null;
}

/** La frase que acompaña el resultado de un mes marcado, donde se lea. */
export function textoDeLaMarca(m: Pick<MarcaDeAjustes, "nota">): string {
  const base = "Tiene ajustes contables pendientes: un déficit de este mes no es una pérdida real hasta que se ajuste.";
  return m.nota ? `${base} ${m.nota}` : base;
}
