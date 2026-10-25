/**
 * scripts/comisiones-hubspot-estimado.ts — la comisión del próximo pago de HubSpot, armada desde HubSpot Partner (U25).
 *
 *   npx tsx scripts/comisiones-hubspot-estimado.ts            → SIMULACRO: el estimado por cuenta, la fila de ese pago
 *                                                                y qué haría --apply. No escribe nada.
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/comisiones-hubspot-estimado.ts --apply
 *                                                              → escribe la fila. A diferencia del job diario, TOMA el
 *                                                                estimado que escribió una persona (los US$51.000 de
 *                                                                noviembre): desde ahí lo pone al día el job.
 *
 * Nunca toca una comisión cobrada ni una con el monto real de la factura (lib/cobranza/comision-hubspot.ts).
 */
import "dotenv/config";
import { imprimirDestino, resolverApply } from "./lib/guard";
import { createScriptDb } from "./lib/db";
import { comisionesDeHubspot, escribirEstimado, planDelEstimado } from "../lib/cobranza/comision-hubspot-server";
import { comprobarContraElUltimoPago } from "../lib/cobranza/comision-hubspot";
import { crDateParts } from "../lib/jobs/time";

const usd = (n: number) => `US$${n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function main() {
  imprimirDestino();
  const apply = resolverApply({ tablas: ["ComisionPartner"] });
  const { prisma, close } = createScriptDb();
  try {
    const ahora = new Date();
    const hoy = crDateParts(ahora).dateKey;
    const plan = await planDelEstimado(prisma, hoy, ahora, { tomarLaManual: true });
    console.log(apply ? "MODO APPLY" : "SIMULACRO (nada se escribe; --apply para escribir)");
    console.log(`última copia de Partner: ${plan.ultimaCopia?.toISOString() ?? "nunca"}${plan.copiaFresca ? "" : " (vieja)"}`);
    const e = plan.estimado;
    if (e) {
      console.log(`\npago del ${e.pago.fecha} · trimestre ${e.pago.trimestre} · meses ${e.pago.meses.join(", ")}`);
      console.log(`comisión mensual de hoy: ${usd(e.mensual)} en ${e.cuentas.length} cuentas`);
      console.log(`estimado del trimestre:  ${usd(e.total)}`);
      for (const o of e.otrasMonedas) console.log(`  (aparte, sin sumar: ${o.mensual} ${o.moneda} al mes en ${o.cuentas} cuentas)`);
      console.log("\n— por cuenta (meses del trimestre en que la venta ya existía) —");
      for (const c of e.cuentas) {
        console.log(
          `  ${usd(c.aporte).padStart(14)}  ${c.meses} × ${usd(c.comisionMensual).padEnd(12)} ${c.nombre}` +
            `${c.ventaDesde ? ` · vendida desde ${c.ventaDesde}` : ""}${c.gestionada ? " · gestionada" : ""}`,
        );
      }
    }
    console.log("\n— la comisión de ese pago en Finanzas —");
    if (plan.filas.length === 0) console.log("  no hay ninguna anotada");
    for (const f of plan.filas) {
      console.log(
        `  ${f.id}: ${f.fecha} · ${usd(f.monto)} ${f.moneda} · ${f.estado} · ${f.montoEsProyeccion ? "estimada" : "monto real"}` +
          `${f.montoDesdePartner ? " · la arma Partner" : " · escrita a mano"}`,
      );
    }
    const d = plan.decision;
    console.log(
      `\nqué hace --apply: ${d.accion === "crear" ? "la anota estimada" : d.accion === "actualizar" ? (d.tomaLaManual ? "toma la estimada a mano y la pone al día" : "la pone al día") : `nada (${d.motivo})`}`,
    );

    const cobradas = await comisionesDeHubspot(prisma, plan.aliado?.id ?? null, { estado: "COBRADO" }, {
      partnerId: true, partner: true, fecha: true, monto: true, estado: true, moneda: true,
    });
    const comp = comprobarContraElUltimoPago(
      plan.cuentas,
      cobradas.map((c) => ({ fecha: c.fecha.toISOString().slice(0, 10), monto: Number(c.monto), estado: c.estado, moneda: c.moneda })),
    );
    if (comp) {
      console.log(
        `comprobación: con las cuentas de hoy, el pago del ${comp.fecha} (${comp.trimestre}) se habría estimado en ${usd(comp.estimadoConLasDeHoy)}; ` +
          `entró ${usd(comp.cobrado)} (${comp.diferenciaPct > 0 ? "+" : ""}${comp.diferenciaPct} %).`,
      );
    }

    if (!apply) return;
    // Escribe lo que el simulacro de arriba acaba de mostrar (la guarda frena si la fila cambió en el medio).
    const r = await escribirEstimado(prisma, plan, ahora);
    if (r.escrito) console.log(`\n✓ comisión ${r.escrito.accion} (${r.escrito.id}): ${r.escrito.antes === null ? "—" : usd(r.escrito.antes)} → ${usd(r.escrito.despues)}`);
    else console.log(`\nno se escribió nada: ${r.aviso ?? (r.plan.decision.accion === "nada" ? r.plan.decision.motivo : "sin cambios")}`);
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
