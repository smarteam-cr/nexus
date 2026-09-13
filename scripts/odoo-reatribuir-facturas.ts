/**
 * scripts/odoo-reatribuir-facturas.ts — deja cada factura del espejo de Odoo con la cuenta de su
 * vínculo. Por defecto SOLO MUESTRA lo que haría.
 *
 * Correr:
 *   npx tsx scripts/odoo-reatribuir-facturas.ts                       # muestra, no escribe
 *   $env:ALLOW_PROD_WRITE='1'; npx tsx scripts/odoo-reatribuir-facturas.ts --apply; Remove-Item Env:ALLOW_PROD_WRITE
 *
 * ── CUÁNDO HACE FALTA ───────────────────────────────────────────────────────────
 * Una sola vez, y solo si esto llega a producción ANTES de que vuelva Odoo. Desde el deploy,
 * confirmar un vínculo atribuye sus facturas en el acto; pero los 27 vínculos que Alex confirmó
 * el 3-sep son anteriores, y su efecto lo iba a escribir un sync que no volvió a correr. Medido el
 * 2026-09-12: 170 de 347 facturas esperando. Si Odoo vuelve primero, la primera corrida hace lo
 * mismo y este script sale vacío.
 *
 * ⛔ Nada de red: todo sale de la base. No autentica contra el ERP, no toca montos, estados,
 * fechas ni ningún `Cobro` (INV25). Escribe con `atribuirFacturasDelPartner` —la misma función que
 * usa la pantalla al confirmar— y firma `backfill:<quien confirmó el vínculo>`: la decisión es de
 * esa persona, pero la bitácora tiene que decir que no se aplicó en el momento.
 *
 * Éxito: INV30 pasa de rojo a verde.
 */
import "dotenv/config";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { reatribuciones } from "@/lib/cobranza/odoo/emparejado";
import { atribuirFacturasDelPartner } from "@/lib/cobranza/odoo/atribucion";

async function main() {
  const apply = resolverApply({ tablas: ["FacturaOdoo", "FacturaOdooCambio"] });

  const facturas = await prisma.facturaOdoo.findMany({
    select: { id: true, odooMoveId: true, numero: true, odooPartnerId: true, odooPartnerNombre: true, cuentaId: true, moveType: true },
    orderBy: { odooMoveId: "asc" },
  });
  const vinculos = await prisma.odooPartnerVinculo.findMany({
    select: { odooPartnerId: true, cuentaId: true, confirmadoPor: true, cuenta: { select: { client: { select: { name: true } } } } },
  });

  const cambios = reatribuciones(facturas, vinculos);
  const facturaDe = new Map(facturas.map((f) => [f.id, f]));
  const vinculoDe = new Map(vinculos.map((v) => [v.odooPartnerId, v]));

  /* Por cliente de Odoo: es la unidad de la decisión (un vínculo) y de la transacción. */
  const porPartner = new Map<number, typeof cambios>();
  for (const c of cambios) {
    const p = facturaDe.get(c.facturaId)?.odooPartnerId;
    if (p === undefined) continue;
    porPartner.set(p, [...(porPartner.get(p) ?? []), c]);
  }

  console.log(`\nReatribución del espejo de Odoo${apply ? "" : "  (solo muestra: no escribe)"}`);
  console.log(`  facturas en el espejo: ${facturas.length} · vínculos con cuenta: ${vinculos.filter((v) => v.cuentaId).length}`);
  console.log(`  cambiarían de cuenta: ${cambios.length}, de ${porPartner.size} cliente(s) de Odoo\n`);

  const firmaDe = (odooPartnerId: number): string => {
    const v = vinculoDe.get(odooPartnerId);
    if (!v?.cuentaId) return "backfill:sin-vinculo";
    return `backfill:${v.confirmadoPor ?? "sin-firma"}`;
  };

  for (const [odooPartnerId, lista] of porPartner) {
    const v = vinculoDe.get(odooPartnerId);
    const nombre = facturaDe.get(lista[0]!.facturaId)?.odooPartnerNombre ?? `#${odooPartnerId}`;
    const destino = v?.cuentaId ? `«${v.cuenta?.client.name ?? v.cuentaId}»` : "sin cuenta (no está vinculado)";
    const notas = lista.filter((c) => facturaDe.get(c.facturaId)?.moveType === "out_refund").length;
    console.log(
      `  · ${nombre} → ${destino}: ${lista.length} documento(s)${notas ? `, ${notas} nota(s) de crédito` : ""} · firma ${firmaDe(odooPartnerId)}`,
    );
  }

  if (!apply) {
    console.log(`\n(no se escribió nada. Para escribir: $env:ALLOW_PROD_WRITE='1'; npx tsx scripts/odoo-reatribuir-facturas.ts --apply)`);
    return;
  }

  let escritas = 0;
  for (const odooPartnerId of porPartner.keys()) {
    /* Una transacción por cliente: si se corta a mitad, lo hecho queda bien hecho y volver a
       correr el script sigue desde donde quedó (la función es idempotente). */
    const hechas = await prisma.$transaction((tx) => atribuirFacturasDelPartner(tx, odooPartnerId, firmaDe(odooPartnerId)));
    escritas += hechas.length;
  }

  const quedan = reatribuciones(
    await prisma.facturaOdoo.findMany({ select: { id: true, odooMoveId: true, numero: true, odooPartnerId: true, cuentaId: true } }),
    await prisma.odooPartnerVinculo.findMany({ select: { odooPartnerId: true, cuentaId: true } }),
  );
  console.log(`\n  escritas: ${escritas} · quedan por atribuir: ${quedan.length}${quedan.length ? " ⚠ volvé a correrlo" : " ✓"}`);
  console.log("  Siguiente: npm run check:invariants — INV30 tiene que dar verde.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
