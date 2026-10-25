/**
 * lib/invariantes/banco-odoo.ts — el invariante de la copia del banco de Odoo sin conciliar (U15, 2026-10-26).
 */
import { cumple, viola, type Invariante } from "./contrato";
import { CLAVE_COPIA_DEL_BANCO, ultimaCopiaBuenaDelBanco } from "@/lib/cobranza/odoo/banco-copia";

/** Cuánto puede quedarse atrás la copia del banco de la última copia buena de las facturas. Las dos corren juntas. */
export const HORAS_DE_ATRASO_DEL_BANCO = 3;

const cuando = (d: Date) => `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;

/**
 * INV60 · La copia del banco de Odoo no se queda atrás de la de las facturas.
 *
 * Las líneas del banco sin conciliar se copian al final de cada copia buena de Odoo, con la misma sesión
 * (lib/cobranza/odoo/banco-copia.ts). Esa parte nunca tumba la copia de las facturas, a propósito: el cobro de lo pagado
 * depende de ellas. El costo es que puede fallar callada. Este invariante es lo que la hace hablar: si la última copia
 * buena de las facturas es más de `HORAS_DE_ATRASO_DEL_BANCO` horas más nueva que la última buena del banco, Alex está
 * mirando líneas del banco viejas.
 *
 * Que la copia de las facturas corra lo vigila INV31; acá, sin ninguna copia buena de facturas, cumple. Sin ninguna
 * corrida del banco en esta base (antes del primer deploy de U15, la local) también cumple.
 */
export const INV60: Invariante = {
  id: "60",
  nombre: "la copia del banco de Odoo no se queda atrás de la copia de las facturas",
  async correr(db) {
    const [facturas, banco] = await Promise.all([
      db.syncOdooCorrida.findFirst({ where: { ok: true }, orderBy: { iniciadaEn: "desc" }, select: { iniciadaEn: true } }),
      db.cronJobState.findUnique({ where: { id: CLAVE_COPIA_DEL_BANCO }, select: { lastResult: true } }),
    ]);
    if (!banco) return cumple("✓ INV60: la copia del banco de Odoo no corrió nunca en esta base: no hay de qué avisar.");
    if (!facturas) return cumple("✓ INV60: no hay copia buena de las facturas de Odoo (la vigila INV31).");
    const ultimaBuena = ultimaCopiaBuenaDelBanco(banco.lastResult);
    const remedio =
      `\n    Remedio: el error de la última corrida está en CronJobState «${CLAVE_COPIA_DEL_BANCO}» (lastResult.error); ` +
      "la copia del banco corre al final de cada copia de Odoo (Integraciones › Jobs del servidor › odoo-espejo-daily).";
    if (!ultimaBuena) {
      return viola(`✗ INV60 VIOLADO: la copia del banco de Odoo corrió y nunca terminó bien: las líneas sin conciliar no están en Nexus.${remedio}`);
    }
    const atraso = facturas.iniciadaEn.getTime() - ultimaBuena.getTime();
    if (atraso <= HORAS_DE_ATRASO_DEL_BANCO * 3_600_000) {
      return cumple(`✓ INV60: la última copia buena del banco de Odoo es del ${cuando(ultimaBuena)}, al día con la de las facturas.`);
    }
    return viola(
      `✗ INV60 VIOLADO: la última copia buena del banco de Odoo es del ${cuando(ultimaBuena)} y la de las facturas, del ` +
        `${cuando(facturas.iniciadaEn)}: Alex está viendo líneas del banco viejas.${remedio}`,
    );
  },
};
