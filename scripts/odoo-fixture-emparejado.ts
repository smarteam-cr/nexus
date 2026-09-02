/**
 * scripts/odoo-fixture-emparejado.ts
 *
 * Regenera `lib/cobranza/__fixtures__/odoo-emparejado.json`: las cuentas reales de Nexus con
 * sus montos, y los clientes reales de Odoo con su cédula.
 *
 * Correr: `npx tsx scripts/odoo-fixture-emparejado.ts`
 *
 * ── POR QUÉ ESTO EXISTE ─────────────────────────────────────────────────────────
 * El emparejado da **6 de 49** resuelto solo, y ese número es el que decide la forma de la
 * pantalla. Si un día alguien afloja el matcher para «mejorarlo», el test tiene que ponerse
 * rojo y obligarlo a declarar por qué — y para eso el test necesita los nombres de verdad,
 * no un caso inventado que siempre da lo que uno espera.
 *
 * ⚠ Es SOLO LECTURA en las dos puntas. No escribe en Odoo ni en la base de Nexus.
 *
 * De paso es la primera prueba del transporte nuevo contra el ERP real: si esto corre, la
 * etapa 1 está conectada de verdad.
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/db/prisma";
import { crearTransporteXmlRpc, configDesdeEntorno } from "@/lib/cobranza/odoo/transporte-xmlrpc";
import {
  ODOO_CAMPOS_PARTNER,
  ODOO_CAMPOS_FACTURA,
  dominioClientes,
  dominioFacturasVenta,
} from "@/lib/cobranza/odoo/transporte";
import { mapearFactura, many2one, textoOdoo } from "@/lib/cobranza/odoo/espejo";

const DESTINO = join(process.cwd(), "lib", "cobranza", "__fixtures__", "odoo-emparejado.json");

async function main() {
  const t = crearTransporteXmlRpc(configDesdeEntorno());

  const partnersCrudos = await t.buscarYLeer("res.partner", dominioClientes(), ODOO_CAMPOS_PARTNER, {
    order: "id asc",
  });
  const partners = partnersCrudos.map((p) => ({
    odooPartnerId: Number(p.id),
    nombre: textoOdoo(p.name) ?? "",
    vat: textoOdoo(p.vat),
    customerRank: Number(p.customer_rank ?? 0),
  }));

  const facturasCrudas = await t.buscarYLeer("account.move", dominioFacturasVenta(), ODOO_CAMPOS_FACTURA, {
    order: "id asc",
  });
  const montosOdoo: Array<{ odooPartnerId: number; montoNeto: number; moneda: string }> = [];
  const rechazos: string[] = [];
  for (const c of facturasCrudas) {
    const r = mapearFactura(c);
    if ("rechazo" in r) {
      rechazos.push(r.rechazo);
      continue;
    }
    /* Solo las facturas propiamente dichas: una nota de crédito por el mismo monto que un
       cobro apuntaría al partner correcto por la razón equivocada. */
    if (r.factura.moveType !== "out_invoice") continue;
    montosOdoo.push({
      odooPartnerId: r.factura.odooPartnerId,
      montoNeto: r.factura.montoNeto,
      moneda: r.factura.moneda,
    });
  }

  const cuentasDb = await prisma.cuentaFinanciera.findMany({
    select: {
      id: true,
      cedulaJuridica: true,
      client: { select: { name: true } },
      cobros: { select: { monto: true } },
    },
  });
  const cuentas = cuentasDb.map((c) => ({
    cuentaId: c.id,
    nombre: c.client.name,
    cedulaJuridica: c.cedulaJuridica,
    montos: [...new Set(c.cobros.map((x) => Number(x.monto)))].sort((a, b) => a - b),
  }));

  const fixture = {
    _generadoPor: "scripts/odoo-fixture-emparejado.ts",
    _nota:
      "Datos REALES de solo lectura, tomados de erp.smarteamcr.com y de la base de Nexus. Si cambian los conteos del test, es porque cambió el matcher o cambió el negocio: hay que decidir cuál de los dos.",
    partners,
    cuentas,
    montosOdoo,
    conteos: {
      partners: partners.length,
      cuentas: cuentas.length,
      facturasLeidas: facturasCrudas.length,
      montosUsados: montosOdoo.length,
      rechazos: rechazos.length,
    },
  };

  writeFileSync(DESTINO, JSON.stringify(fixture, null, 2), "utf8");
  console.log(`[fixture] ${DESTINO}`);
  console.log(`  partners=${partners.length} cuentas=${cuentas.length} facturas=${facturasCrudas.length} montos=${montosOdoo.length}`);
  if (rechazos.length) {
    console.log(`  ⚠ ${rechazos.length} facturas rechazadas por el espejo:`);
    for (const r of rechazos.slice(0, 20)) console.log(`     · ${r}`);
  }
  // Sirve para verificar a ojo que el transporte trajo lo que se esperaba.
  const conVat = partners.filter((p) => (p.vat ?? "").trim()).length;
  console.log(`  partners con vat: ${conVat}/${partners.length}`);
  console.log(`  moneda de las facturas: ${[...new Set(montosOdoo.map((m) => m.moneda))].join(", ")}`);
  console.log(`  many2one de control: ${JSON.stringify(many2one(facturasCrudas[0]?.partner_id))}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? `${e.name}: ${e.message}` : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
