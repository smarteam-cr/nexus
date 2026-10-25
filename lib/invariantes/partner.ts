/**
 * lib/invariantes/partner.ts — el invariante de la copia de HubSpot Partner y la comisión que sale de ella (U25 y
 * U29, 2026-10-25).
 */
import { cumple, viola, type Invariante } from "./contrato";
import { HISTORIAL_CONTINUO_DESDE, semanasConHueco } from "@/lib/cs/partner-columnas";
import { copiaFresca, DIAS_MAXIMOS_DE_LA_COPIA } from "@/lib/cobranza/comision-hubspot";
import { planDelEstimado } from "@/lib/cobranza/comision-hubspot-server";
import { crDateParts } from "@/lib/jobs/time";
import { esquemaDesactualizado } from "@/lib/db/esquema";

/** El SQL que crea las columnas que INV50 lee. */
export const SQL_DE_INV50 = "scripts/sql/2026-10-25-comisiones-partner.sql";

/** Una semana con menos filas que esta fracción de los registros de la última copia cuenta como hueco. */
export const FRACCION_MINIMA_DE_LA_SEMANA = 0.5;
/** Desde cuántos días antes del pago se exige que la comisión esté anotada (el trimestre ya cerró 45 días antes). */
export const DIAS_ANTES_DEL_PAGO = 45;

const diasEntre = (desdeISO: string, hastaISO: string) =>
  Math.round((Date.parse(`${hastaISO}T00:00:00Z`) - Date.parse(`${desdeISO}T00:00:00Z`)) / 86400000);

/**
 * INV50 · La copia de Partner guarda su historial semana a semana sin huecos, y la comisión del próximo pago de
 * HubSpot está anotada y al día.
 *
 *   a. Historial: cada semana completa desde la 41 de 2026 (`HISTORIAL_CONTINUO_DESDE`) tiene filas de uso para al
 *      menos la mitad de los registros de la última copia. El plan pide 8 semanas seguidas: hasta el 2026-10-24 había
 *      4 de 16 (la copia estuvo apagada de julio a octubre, y ese hueco no se puede llenar).
 *   b. Comisión: con la copia fresca y el pago a 45 días o menos, la comisión de HubSpot de ese pago está anotada; si
 *      la arma Partner, su último cálculo tiene a lo sumo `DIAS_MAXIMOS_DE_LA_COPIA` + 1 días. Una que escribió una
 *      persona, o con el monto real, cumple: ahí manda quien la escribió.
 *
 * Sin copia de Partner en esta base (la local, la de pruebas) cumple: no hay de qué avisar.
 */
export const INV50: Invariante = {
  id: "50",
  nombre: "la copia de Partner guarda su historial semanal y la comisión de HubSpot del próximo pago está al día",
  async correr(db, ahora) {
    try {
      return await correrInv50(db, ahora);
    } catch (e) {
      if (!esquemaDesactualizado(e)) throw e;
      return cumple(`✓ INV50: no aplica todavía — esta base no tiene las columnas de la comisión de Partner (falta ${SQL_DE_INV50}).`);
    }
  },
};

async function correrInv50(db: Parameters<Invariante["correr"]>[0], ahora: Date) {
  const ultima = await db.clientPartnerSnapshot.aggregate({ _max: { fetchedAt: true } });
  const ultimaCopia = ultima._max.fetchedAt;
  if (!ultimaCopia) return cumple("✓ INV50: no hay copia de HubSpot Partner en esta base: no hay historial ni comisión de qué avisar.");

  const lineas: string[] = [];
  let ok = true;

  // a. El historial semanal.
  const registros = await db.clientPartnerSnapshot.count({
    where: { fetchedAt: { gte: new Date(ultimaCopia.getTime() - 2 * 86400000) } },
  });
  const porSemana = await db.partnerUsageSnapshot.groupBy({ by: ["weekKey"], _count: { _all: true } });
  const filas = new Map(porSemana.map((s) => [s.weekKey, s._count._all]));
  const minimo = Math.max(1, Math.ceil(registros * FRACCION_MINIMA_DE_LA_SEMANA));
  const huecos = semanasConHueco(filas, HISTORIAL_CONTINUO_DESDE, ahora, minimo);
  if (huecos.length > 0) {
    ok = false;
    lineas.push(
      `✗ INV50 VIOLADO: el historial de uso de Partner tiene ${huecos.length} semana(s) sin copia: ${huecos.join(", ")} ` +
        `(menos de ${minimo} filas de ${registros} registros).` +
        `\n    Remedio: Integraciones › Jobs del servidor dice si cs-partner-daily está apagado o falla. HubSpot no guarda el uso de` +
        ` semanas pasadas: un hueco no se rellena, se evita que haya otro.`,
    );
  } else {
    lineas.push(`✓ INV50: el historial de uso de Partner no tiene huecos desde la semana 41 de 2026 (${registros} registros en la última copia).`);
  }

  // b. La comisión del próximo pago de HubSpot.
  const hoyISO = crDateParts(ahora).dateKey;
  const plan = await planDelEstimado(db, hoyISO, ahora);
  const pago = plan.estimado?.pago;
  const remedio = `\n    Remedio: Integraciones › Jobs del servidor dice si comisiones-hubspot-estimado está apagado o falla; a mano: npx tsx scripts/comisiones-hubspot-estimado.ts --apply.`;
  if (!copiaFresca(ultimaCopia, ahora) || !pago) {
    lineas.push(`✓ INV50: la comisión de HubSpot no se revisa: la copia de Partner no es fresca (la cubre el aviso de la copia).`);
  } else if (diasEntre(hoyISO, pago.fecha) > DIAS_ANTES_DEL_PAGO) {
    lineas.push(`✓ INV50: el pago de HubSpot del ${pago.fecha} está a más de ${DIAS_ANTES_DEL_PAGO} días: todavía no se exige anotado.`);
  } else if (plan.filas.length === 0) {
    if (plan.estimado && plan.estimado.total > 0) {
      ok = false;
      lineas.push(`✗ INV50 VIOLADO: la comisión de HubSpot del ${pago.fecha} (${pago.trimestre}) no está anotada y Partner la estima en US$${plan.estimado.total}.${remedio}`);
    } else {
      lineas.push(`✓ INV50: HubSpot no proyecta comisión para el pago del ${pago.fecha}.`);
    }
  } else {
    const filas = await db.comisionPartner.findMany({
      where: { id: { in: plan.filas.map((f) => f.id) } },
      select: { id: true, estado: true, montoEsProyeccion: true, montoDesdePartner: true, detalleDePartner: true },
    });
    const viejas = filas.filter((f) => {
      if (f.estado === "COBRADO" || !f.montoEsProyeccion || !f.montoDesdePartner) return false;
      const calculado = (f.detalleDePartner as { calculadoEn?: string } | null)?.calculadoEn;
      const ms = calculado ? Date.parse(calculado) : NaN;
      return !Number.isFinite(ms) || ahora.getTime() - ms > (DIAS_MAXIMOS_DE_LA_COPIA + 1) * 86400000;
    });
    if (viejas.length > 0) {
      ok = false;
      lineas.push(`✗ INV50 VIOLADO: la comisión estimada de HubSpot del ${pago.fecha} no se puso al día en más de ${DIAS_MAXIMOS_DE_LA_COPIA + 1} días.${remedio}`);
    } else {
      const desdePartner = filas.some((f) => f.montoDesdePartner && f.montoEsProyeccion);
      lineas.push(
        `✓ INV50: la comisión de HubSpot del ${pago.fecha} está anotada${desdePartner ? " y la arma Partner" : " (con monto real o escrito a mano)"}.`,
      );
    }
  }
  return ok ? cumple(...lineas) : viola(...lineas);
}
