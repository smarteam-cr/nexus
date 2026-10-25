/**
 * scripts/partner-columnas.ts — llena las columnas nuevas de la copia de Partner (U29) desde el crudo que ya está en
 * la base, sin esperar a la próxima copia diaria.
 *
 *   npx tsx scripts/partner-columnas.ts            → SIMULACRO: cuántos registros y filas semanales cambiarían.
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/partner-columnas.ts --apply
 *
 * Va DESPUÉS de aplicar scripts/sql/2026-10-25-comisiones-partner.sql. Idempotente: la segunda corrida no cambia nada.
 * No llama a HubSpot: lee `ClientPartnerSnapshot.properties` con la misma función que la copia
 * (lib/cs/partner-columnas.ts). A `PartnerUsageSnapshot` le llena solo la fila de la semana en que se copió cada
 * registro: las semanas de antes no tienen el crudo de su momento, y copiar el de hoy inventaría historia.
 */
import "dotenv/config";
import { Prisma } from "@prisma/client";
import { imprimirDestino, resolverApply } from "./lib/guard";
import { createScriptDb } from "./lib/db";
import { columnasDePartner, semanaIso } from "../lib/cs/partner-columnas";

async function main() {
  imprimirDestino();
  const apply = resolverApply({ tablas: ["ClientPartnerSnapshot", "PartnerUsageSnapshot"] });
  const { prisma, close } = createScriptDb();
  try {
    console.log(apply ? "MODO APPLY" : "SIMULACRO (nada se escribe; --apply para escribir)");
    const snaps = await prisma.clientPartnerSnapshot.findMany({
      select: {
        hubspotPartnerClientId: true, fetchedAt: true, properties: true, mrrManaged: true,
        isManaged: true, isSold: true, soldMrr: true, projectedCommission: true, mrrByHub: true,
      },
    });
    let registros = 0;
    let semanales = 0;
    for (const s of snaps) {
      const col = columnasDePartner((s.properties ?? {}) as Record<string, unknown>);
      const mrrByHub = col.mrrByHub ? (col.mrrByHub as Prisma.InputJsonValue) : Prisma.DbNull;
      const cambia =
        s.isManaged !== col.isManaged || s.isSold !== col.isSold || s.soldMrr !== col.soldMrr ||
        s.projectedCommission !== col.projectedCommission || (s.mrrByHub === null) !== (col.mrrByHub === null);
      if (cambia) {
        registros++;
        if (apply) {
          await prisma.clientPartnerSnapshot.update({
            where: { hubspotPartnerClientId: s.hubspotPartnerClientId },
            data: { ...col, mrrByHub },
          });
        }
      }
      const semana = semanaIso(s.fetchedAt);
      const fila = await prisma.partnerUsageSnapshot.findUnique({
        where: { hubspotPartnerClientId_weekKey: { hubspotPartnerClientId: s.hubspotPartnerClientId, weekKey: semana } },
        select: { id: true, soldMrr: true, projectedCommission: true, isManaged: true },
      });
      if (fila && fila.soldMrr === null && fila.projectedCommission === null && fila.isManaged === null) {
        semanales++;
        if (apply) {
          await prisma.partnerUsageSnapshot.update({
            where: { id: fila.id },
            data: { isManaged: col.isManaged, mrrManaged: s.mrrManaged, soldMrr: col.soldMrr, projectedCommission: col.projectedCommission, mrrByHub },
          });
        }
      }
    }
    console.log(`registros de Partner: ${snaps.length} · ${registros} ${apply ? "actualizados" : "cambiarían"}`);
    console.log(`filas semanales (la semana de la última copia de cada registro): ${semanales} ${apply ? "llenadas" : "se llenarían"}`);
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
