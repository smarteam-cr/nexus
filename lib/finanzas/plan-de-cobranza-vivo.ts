/**
 * lib/finanzas/plan-de-cobranza-vivo.ts
 *
 * Los tres números en vivo de /finanzas/plan-de-cobranza: qué tan vieja es la copia de Odoo,
 * cuántas facturas de Odoo tienen su cuenta y cuántos cobros siguen en Cobrado con la firma de la
 * importación. Dicen si lo que falta ya se hizo sin preguntarle a nadie: el primero cambia cuando
 * vuelve la copia de Odoo (volvió el 2026-09-13), el segundo cuando Alex empareja clientes y el tercero cuando Alex devuelve los 3.
 *
 * ⚠ Solo campos que ya existían en producción ANTES de los cambios de base de esta tanda, y cada
 * consulta con `select`/`count` explícito: la página puede publicarse antes que el SQL.
 *
 * ⚠ Cada número se lee por separado y un fallo lo deja en null: la página es un resumen, no puede
 * caerse por un conteo. El fallo va a Sentry para que no quede mudo.
 */
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/db/prisma";
import { espejoVencido } from "@/lib/cobranza/odoo/espejo";
import { ultimaCorridaOk } from "@/lib/cobranza/odoo/sync";
import { PREFIJO_FIRMA_DE_IMPORTACION } from "@/lib/cobranza/reversion-cobro";

export interface EstadoDelPlan {
  /** null = no se pudo leer. */
  espejo: {
    /** Cuándo empezó la última corrida buena; null = nunca hubo una. */
    ultimaBuenaISO: string | null;
    horasDesdeLaUltimaBuena: number | null;
    /** `espejoVencido()`: la misma regla que Cobranza › Odoo e INV31. */
    vencido: boolean;
  } | null;
  facturas: { conCuenta: number; vigentes: number } | null;
  verdes: { deImportacion: number; cobrados: number } | null;
}

async function leer<T>(numero: string, consulta: () => Promise<T>): Promise<T | null> {
  try {
    return await consulta();
  } catch (err) {
    console.error(`[plan-de-cobranza] no se pudo leer «${numero}»:`, err);
    Sentry.captureException(err, { tags: { pantalla: "plan-de-cobranza", numero } });
    return null;
  }
}

export async function loadEstadoDelPlan(ahora: Date = new Date()): Promise<EstadoDelPlan> {
  const [espejo, facturas, verdes] = await Promise.all([
    leer("espejo", async () => {
      const ultimaOk = await ultimaCorridaOk();
      return {
        ultimaBuenaISO: ultimaOk?.toISOString() ?? null,
        horasDesdeLaUltimaBuena: ultimaOk ? Math.floor((ahora.getTime() - ultimaOk.getTime()) / 3_600_000) : null,
        vencido: espejoVencido(ultimaOk, ahora),
      };
    }),
    leer("facturas", async () => {
      // Solo las VIGENTES: una factura que desapareció de Odoo no tiene cuenta que ganar.
      const [conCuenta, vigentes] = await Promise.all([
        prisma.facturaOdoo.count({ where: { estadoEspejo: "VIGENTE", cuentaId: { not: null } } }),
        prisma.facturaOdoo.count({ where: { estadoEspejo: "VIGENTE" } }),
      ]);
      return { conCuenta, vigentes };
    }),
    leer("verdes", async () => {
      const [deImportacion, cobrados] = await Promise.all([
        prisma.cobro.count({ where: { estado: "COBRADO", confirmadoPor: { startsWith: PREFIJO_FIRMA_DE_IMPORTACION } } }),
        prisma.cobro.count({ where: { estado: "COBRADO" } }),
      ]);
      return { deImportacion, cobrados };
    }),
  ]);
  return { espejo, facturas, verdes };
}
