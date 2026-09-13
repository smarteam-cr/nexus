/**
 * lib/cobranza/odoo/atribucion.ts
 *
 * La ÚNICA escritura del emparejado sobre el espejo: poner en cada factura de un cliente de Odoo
 * la cuenta de su vínculo, con su fila CUENTA firmada en la bitácora. Qué cambiar lo decide
 * `reatribuciones()` (emparejado.ts, puro); acá solo se escribe.
 *
 * ── POR QUÉ NO ESPERA AL SYNC ───────────────────────────────────────────────────
 * Antes la cuenta la resolvía el sync en cada corrida, y vincular no tocaba ninguna factura. Con
 * el ERP rechazando el usuario desde el 2-sep, las 27 cuentas que Alex emparejó el 3-sep no
 * llegaron nunca a la pantalla: 347 de 347 facturas sin cuenta. Reatribuir no necesita red —el
 * mapa vive en `OdooPartnerVinculo`, que es base local— así que se hace en el acto.
 *
 * ⛔ Escribe `FacturaOdoo.cuentaId` y la bitácora CUENTA. Nada más: ni montos, ni estados, ni
 * fechas, ni un `Cobro` (INV25). Lo vigila `guardas.test.ts` sobre este archivo.
 *
 * ⚠ Sin `server-only`, igual que sync.ts: también la usa `scripts/odoo-reatribuir-facturas.ts`.
 */
import type { Prisma } from "@prisma/client";
import type { prisma } from "@/lib/db/prisma";
import { reatribuciones, type Reatribucion } from "./emparejado";

type Db = Prisma.TransactionClient | typeof prisma;

/** Cómo se escribe la cuenta en la bitácora. El mismo formato que usa el sync. */
const enBitacora = (cuentaId: string | null) => cuentaId ?? "(ninguno)";

/**
 * Deja las facturas de UN cliente de Odoo con la cuenta de su vínculo (o sin cuenta, si no lo
 * tiene) y devuelve lo que cambió.
 *
 * ⚠ Hay que llamarla DENTRO de la transacción que cambia el vínculo, y después de cambiarlo: lee
 * el vínculo con la misma conexión, así que ve el valor recién escrito. Llamada afuera, un
 * desvincular concurrente podía dejar las facturas con la cuenta vieja.
 *
 * `firma` va a `registradoPor`: el email de quien confirmó, o `backfill:<quien>` en la
 * reatribución única. Sin eso la bitácora no distingue «lo movió Odoo» de «lo movió una persona».
 */
export async function atribuirFacturasDelPartner(
  db: Db,
  odooPartnerId: number,
  firma: string,
): Promise<Reatribucion[]> {
  const vinculo = await db.odooPartnerVinculo.findUnique({
    where: { odooPartnerId },
    select: { odooPartnerId: true, cuentaId: true },
  });
  const facturas = await db.facturaOdoo.findMany({
    where: { odooPartnerId },
    select: { id: true, odooMoveId: true, numero: true, odooPartnerId: true, cuentaId: true },
    orderBy: { odooMoveId: "asc" },
  });

  const cambios = reatribuciones(facturas, vinculo ? [vinculo] : []);
  if (!cambios.length) return cambios;

  /* Un solo partner ⇒ una sola cuenta destino. Se agrupa igual por `nuevo` para no depender de
     eso: si mañana alguien llama esto con otra forma, no escribe la cuenta de una en otra. */
  const porDestino = new Map<string | null, string[]>();
  for (const c of cambios) porDestino.set(c.nuevo, [...(porDestino.get(c.nuevo) ?? []), c.facturaId]);
  for (const [cuentaId, ids] of porDestino) {
    await db.facturaOdoo.updateMany({ where: { id: { in: ids } }, data: { cuentaId } });
  }

  await db.facturaOdooCambio.createMany({
    data: cambios.map((c) => ({
      facturaId: c.facturaId,
      odooMoveId: c.odooMoveId,
      numero: c.numero,
      tipo: "CUENTA" as const,
      anterior: enBitacora(c.anterior),
      nuevo: enBitacora(c.nuevo),
      registradoPor: firma,
    })),
  });
  return cambios;
}
