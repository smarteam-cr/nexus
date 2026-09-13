/**
 * lib/invariantes/odoo.ts — los invariantes del espejo de Odoo (extraídos de
 * scripts/check-invariants.ts en B-07, 2026-09-04).
 */
import { cumple, viola, type Invariante } from "./contrato";
import { reatribuciones } from "@/lib/cobranza/odoo/emparejado";

/**
 * INV23 · El espejo de Odoo sigue siendo un espejo. Toda `FacturaOdoo` guarda el monto en la
 * MONEDA NATIVA del documento. `convertir()` de lib/finanzas/equilibrio.ts es el único punto de
 * conversión del sistema, y este invariante vigila el lado de los datos: una moneda que no es la
 * del ERP significa que alguien escribió ahí sin pasar por el sync.
 *
 * ⚠ Y el neto no puede superar al total. Es la forma en que se detecta el error caro: los cobros
 * de Nexus están cargados SIN IVA y se comparan contra `montoNeto`; si alguien "arregla" el mapeo
 * cruzando los campos, 304 facturas quedan descuadradas por 13 % y nada avisa, porque los dos
 * números siguen siendo montos plausibles.
 * Remedio: revisar mapearFactura en lib/cobranza/odoo/espejo.ts y re-correr el sync.
 */
export const MONEDAS_DEL_ESPEJO = new Set(["USD", "CRC"]);

export const INV23: Invariante = {
  id: "23",
  nombre: "las facturas espejadas están en moneda nativa y con montos coherentes",
  async correr(db) {
    const facturasOdoo = await db.facturaOdoo.findMany({
      select: { numero: true, moneda: true, montoNeto: true, montoTotal: true, montoImpuesto: true },
    });
    const espejoRoto: string[] = [];
    for (const f of facturasOdoo) {
      if (!MONEDAS_DEL_ESPEJO.has(f.moneda)) {
        espejoRoto.push(`${f.numero}: moneda «${f.moneda}» que el espejo no conoce`);
        continue;
      }
      const neto = Number(f.montoNeto);
      const total = Number(f.montoTotal);
      // Con un céntimo de tolerancia: Odoo hace la aritmética en float.
      if (neto > total + 0.01) {
        espejoRoto.push(`${f.numero}: neto ${neto.toFixed(2)} mayor que el total ${total.toFixed(2)}`);
      }
    }
    if (espejoRoto.length > 0) {
      return viola(
        `✗ INV23 VIOLADO: ${espejoRoto.length} factura(s) espejadas con montos que el sync no pudo haber escrito:\n` +
          espejoRoto.slice(0, 20).map((d) => `    · ${d}`).join("\n") +
          `\n    Remedio: revisar mapearFactura en lib/cobranza/odoo/espejo.ts y re-correr el sync.`,
      );
    }
    return cumple(`✓ INV23: las ${facturasOdoo.length} facturas espejadas están en moneda nativa y con montos coherentes.`);
  },
};

/**
 * INV24 · Ninguna corrida del sync quedó muda. Existe porque cuando un job se rompe, el error
 * solo va al log del contenedor: nadie puede saber que «viene fallando hace tres días».
 *
 * Dos formas de quedar mudo, y las dos se vigilan:
 *   · una corrida que falló y NO guardó el texto del error → no se puede diagnosticar;
 *   · una corrida ABIERTA hace más de 6 horas → el proceso se murió a mitad y la fila quedó
 *     indistinguible de «todavía corriendo». Ese es el fallo que no se ve.
 * Remedio: revisar el log del contenedor de esa fecha y correr el sync a mano.
 */
export const INV24: Invariante = {
  id: "24",
  nombre: "las corridas del sync de Odoo dejaron su resultado escrito",
  async correr(db, ahora) {
    const HACE_7_DIAS = new Date(ahora.getTime() - 7 * 86_400_000);
    const HACE_6_HORAS = new Date(ahora.getTime() - 6 * 3_600_000);
    const corridas = await db.syncOdooCorrida.findMany({
      where: { iniciadaEn: { gte: HACE_7_DIAS } },
      select: { id: true, iniciadaEn: true, terminadaEn: true, ok: true, error: true, disparadaPor: true },
      orderBy: { iniciadaEn: "desc" },
    });
    const mudas = corridas
      .filter(
        (c) =>
          (c.terminadaEn === null && c.iniciadaEn < HACE_6_HORAS) ||
          (c.terminadaEn !== null && !c.ok && !c.error?.trim()),
      )
      .map((c) =>
        c.terminadaEn === null
          ? `${c.iniciadaEn.toISOString()} (${c.disparadaPor}): abierta hace más de 6 h — el proceso se murió a mitad`
          : `${c.iniciadaEn.toISOString()} (${c.disparadaPor}): falló y no guardó el error`,
      );
    if (mudas.length > 0) {
      return viola(
        `✗ INV24 VIOLADO: ${mudas.length} corrida(s) del sync de Odoo no dejaron rastro de por qué:\n` +
          mudas.map((d) => `    · ${d}`).join("\n") +
          `\n    Remedio: revisar el log del contenedor de esa fecha; correr el sync a mano desde /cobranza.`,
      );
    }
    return cumple(`✓ INV24: las ${corridas.length} corridas del sync de los últimos 7 días dejaron su resultado escrito.`);
  },
};

/**
 * INV30 · Toda factura VIGENTE del espejo tiene la cuenta de su vínculo, o ninguna si su cliente
 * de Odoo no está vinculado. (Salta del 28 al 30: `docs/database-refactoring-plan.md` reserva INV29.)
 *
 * La cuenta tiene tres escritores —confirmar o deshacer un vínculo, el sync y la reatribución
 * única— y cuando se desincronizan la pantalla no avisa: «Lo que no cuadra» acusa cobros sin
 * factura cuyas facturas están en el espejo, sin atribuir. Medido el 2026-09-12: 170 facturas de
 * los 27 clientes vinculados sin cuenta, y USD 237.355 acusados en falso durante diez días.
 *
 * La regla la decide `reatribuciones()` —la misma que usan los tres escritores—, así que el
 * invariante no puede discrepar con ellos por una segunda definición.
 * Remedio: `npx tsx scripts/odoo-reatribuir-facturas.ts` muestra qué cambiaría; con `--apply` y
 * ALLOW_PROD_WRITE=1 lo escribe.
 */
export const INV30: Invariante = {
  id: "30",
  nombre: "las facturas espejadas tienen la cuenta de su vínculo",
  async correr(db) {
    const conNombre = { select: { client: { select: { name: true } } } } as const;
    const facturas = await db.facturaOdoo.findMany({
      where: { estadoEspejo: "VIGENTE" },
      select: { id: true, odooMoveId: true, numero: true, odooPartnerId: true, odooPartnerNombre: true, cuentaId: true, cuenta: conNombre },
    });
    const vinculos = await db.odooPartnerVinculo.findMany({
      where: { cuentaId: { not: null } },
      select: { odooPartnerId: true, cuentaId: true, cuenta: conNombre },
    });

    const cambios = reatribuciones(facturas, vinculos);
    if (cambios.length > 0) {
      const facturaDe = new Map(facturas.map((f) => [f.id, f]));
      const nombreDeCuenta = new Map<string, string>();
      for (const x of [...facturas, ...vinculos]) if (x.cuentaId && x.cuenta) nombreDeCuenta.set(x.cuentaId, x.cuenta.client.name);
      const cuenta = (id: string | null) => (id ? `«${nombreDeCuenta.get(id) ?? id}»` : null);
      const sinCuenta = cambios.filter((c) => c.anterior === null).length;
      return viola(
        `✗ INV30 VIOLADO: ${cambios.length} factura(s) vigentes no tienen la cuenta de su vínculo (${sinCuenta} sin cuenta teniendo vínculo):\n` +
          cambios
            .slice(0, 20)
            .map((c) => {
              const quien = `${c.numero} (${facturaDe.get(c.facturaId)?.odooPartnerNombre ?? "?"})`;
              if (c.anterior === null) return `    · ${quien}: sin cuenta, y su vínculo dice ${cuenta(c.nuevo)}`;
              if (c.nuevo === null) return `    · ${quien}: está en ${cuenta(c.anterior)}, y su cliente de Odoo no está vinculado`;
              return `    · ${quien}: está en ${cuenta(c.anterior)}, y su vínculo dice ${cuenta(c.nuevo)}`;
            })
            .join("\n") +
          (cambios.length > 20 ? `\n    · …y ${cambios.length - 20} más` : "") +
          `\n    Remedio: npx tsx scripts/odoo-reatribuir-facturas.ts (muestra qué cambiaría; con --apply y ALLOW_PROD_WRITE=1 lo escribe).`,
      );
    }
    return cumple(`✓ INV30: las ${facturas.length} facturas vigentes del espejo tienen la cuenta de su vínculo.`);
  },
};
