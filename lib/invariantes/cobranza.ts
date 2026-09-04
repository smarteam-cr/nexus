/**
 * lib/invariantes/cobranza.ts — los invariantes de la plata: quién confirmó, quién facturó, y
 * qué quedó colgando (extraídos de scripts/check-invariants.ts en B-07, 2026-09-04).
 */
import { cumple, viola, type Invariante } from "./contrato";

/**
 * INV3 · Ningún Cobro COBRADO sin confirmadoPor (Cobranza: el humano confirma lo que mueve
 * dinero; chokepoint único lib/cobranza/mutations.ts#cambiarEstadoCobro).
 */
export const INV3: Invariante = {
  id: "3",
  nombre: "todo Cobro COBRADO tiene confirmadoPor",
  async correr(db) {
    const cobradosSinConfirmar = await db.cobro.count({ where: { estado: "COBRADO", confirmadoPor: null } });
    if (cobradosSinConfirmar > 0) {
      return viola(
        `✗ INV3 VIOLADO: ${cobradosSinConfirmar} Cobro(s) en estado COBRADO sin confirmadoPor (¿alguien escribió estado sin pasar por el chokepoint?).`,
      );
    }
    return cumple("✓ INV3: todo Cobro COBRADO tiene confirmadoPor.");
  },
};

/**
 * INV5 · Ningún Cobro con fechaEmision sin facturadoPor (espejo de INV3 — Tanda B, 2026-07):
 * "Marcar facturado" es auditable igual que COBRADO; mismo chokepoint.
 */
export const INV5: Invariante = {
  id: "5",
  nombre: "todo Cobro con fechaEmision tiene facturadoPor",
  async correr(db) {
    const facturadosSinAutoria = await db.cobro.count({ where: { fechaEmision: { not: null }, facturadoPor: null } });
    if (facturadosSinAutoria > 0) {
      return viola(
        `✗ INV5 VIOLADO: ${facturadosSinAutoria} Cobro(s) con fechaEmision sin facturadoPor (¿alguien escribió fechaEmision sin pasar por el chokepoint?).`,
      );
    }
    return cumple("✓ INV5: todo Cobro con fechaEmision tiene facturadoPor.");
  },
};

/**
 * INV18 · Ningún PagoPlanilla PAGADO sin confirmadoPor (libro de planilla — espejo EXACTO de
 * INV3; chokepoint: lib/cobranza/mutations.ts#pagarQuincena).
 */
export const INV18: Invariante = {
  id: "18",
  nombre: "toda quincena PAGADA del libro tiene confirmadoPor",
  async correr(db) {
    const quincenasSinConfirmar = await db.pagoPlanilla.count({ where: { estado: "PAGADO", confirmadoPor: null } });
    if (quincenasSinConfirmar > 0) {
      return viola(
        `✗ INV18 VIOLADO: ${quincenasSinConfirmar} quincena(s) del libro en estado PAGADO sin confirmadoPor (¿alguien escribió el estado sin pasar por el chokepoint?).`,
      );
    }
    return cumple("✓ INV18: toda quincena PAGADA del libro tiene confirmadoPor.");
  },
};

/**
 * INV20 · Ninguna ComisionPartner COBRADA sin confirmadoPor (espejo de INV3 y INV18; chokepoint:
 * lib/cobranza/mutations.ts#cambiarEstadoComisionPartner). Hace falta por lo mismo que en los
 * cobros: `scripts/import-comisiones-partner.ts` escribe filas POR FUERA de las mutations, y "esta
 * plata entró" es una afirmación que tiene que quedar firmada por alguien.
 */
export const INV20: Invariante = {
  id: "20",
  nombre: "toda comisión de aliado COBRADA tiene confirmadoPor",
  async correr(db) {
    const comisionesSinConfirmar = await db.comisionPartner.count({ where: { estado: "COBRADO", confirmadoPor: null } });
    if (comisionesSinConfirmar > 0) {
      return viola(
        `✗ INV20 VIOLADO: ${comisionesSinConfirmar} comisión(es) de aliado en estado COBRADO sin confirmadoPor (¿alguien escribió el estado sin pasar por el chokepoint?).`,
      );
    }
    return cumple("✓ INV20: toda comisión de aliado COBRADA tiene confirmadoPor.");
  },
};

/**
 * INV25 · Odoo nunca confirma plata. El espejo PROPONE que un cobro pasó a verde; confirmarlo
 * sigue siendo de una persona con nombre. Misma doctrina que INV3 y que el importador de
 * comisiones.
 *
 * ⚠ Se vigila el DATO y no el código —eso lo hace guardas.test.ts—: un script suelto o una
 * consulta a mano pueden escribir lo que el código no escribe. Y el modo en que esto se rompería
 * de verdad es alguien "destrabando" 176 cobros de un saque con un UPDATE.
 * Remedio: revertir esos cobros a POR_COBRAR y confirmarlos uno por uno desde la UI.
 */
export const INV25: Invariante = {
  id: "25",
  nombre: "ningún cobro fue confirmado por el sync",
  async correr(db) {
    const confirmadosPorMaquina = await db.cobro.findMany({
      where: {
        OR: [
          { confirmadoPor: { startsWith: "odoo", mode: "insensitive" } },
          { confirmadoPor: { startsWith: "sync", mode: "insensitive" } },
          { confirmadoPor: { startsWith: "cron", mode: "insensitive" } },
        ],
      },
      select: { id: true, monto: true, moneda: true, confirmadoPor: true, cuenta: { select: { client: { select: { name: true } } } } },
    });
    if (confirmadosPorMaquina.length > 0) {
      const plata = confirmadosPorMaquina.reduce((a, c) => a + Number(c.monto), 0);
      return viola(
        `✗ INV25 VIOLADO: ${confirmadosPorMaquina.length} cobro(s) por ${plata.toFixed(2)} los confirmó una máquina, no una persona:\n` +
          confirmadosPorMaquina
            .slice(0, 20)
            .map((c) => `    · ${c.cuenta.client.name}: ${c.moneda} ${Number(c.monto).toFixed(2)} — confirmadoPor="${c.confirmadoPor}"`)
            .join("\n") +
          `\n    Remedio: revertirlos a POR_COBRAR y confirmarlos uno por uno desde /cobranza.`,
      );
    }
    return cumple("✓ INV25: ningún cobro fue confirmado por el sync — la plata la sigue confirmando una persona.");
  },
};

/**
 * INV26 · Ninguna alerta apunta a un cobro que ya no existe. `AlertaCobro.cobroId` es un String
 * SUELTO, sin llave foránea, y a propósito: `cobroId = null` ya significa «alerta a nivel
 * cuenta», así que un `SetNull` convertiría en silencio la alerta de un cobro borrado en una de la
 * cuenta entera. El precio de esa decisión es que nada impide que el cobro desaparezca y la
 * alerta quede apuntando al vacío.
 *
 * ⚠ Y desaparecen: `generateCobros` borra los sobrantes cuando cambia el acuerdo de pago, y
 * `deleteServicio` cascadea. Lo que cierra el agujero es `cerrarAlertasDeCobros`, llamada desde
 * los dos caminos; esto vigila que no vuelva a abrirse por un tercero.
 *
 * ⚠⚠ Solo se miran las ABIERTAS y VISTAS, y esa condición NO es un relajamiento: es la diferencia
 * entre vigilar algo y quedar en rojo para siempre. `cerrarAlertasDeCobros` cierra con RESUELTA
 * **conservando `cobroId` a propósito** —la supresión de 7 días de `upsertAlertas` lee esas
 * filas— y después borra el cobro. Sin este filtro, la primera regeneración que borre un cobro
 * con alerta deja el invariante en rojo permanente. Un tablero que no puede volver a verde deja
 * de leerse, y se lleva puestos a los otros 27 que están al lado.
 */
export const INV26: Invariante = {
  id: "26",
  nombre: "ninguna alerta viva apunta a un cobro que ya no existe",
  async correr(db) {
    const alertasConCobro = await db.alertaCobro.findMany({
      where: { cobroId: { not: null }, estado: { in: ["ABIERTA", "VISTA"] } },
      select: { id: true, cobroId: true, tipo: true, estado: true, cuenta: { select: { client: { select: { name: true } } } } },
    });
    const cobrosVivos = new Set((await db.cobro.findMany({ select: { id: true } })).map((c) => c.id));
    const huerfanas = alertasConCobro.filter((a) => !cobrosVivos.has(a.cobroId ?? ""));
    if (huerfanas.length > 0) {
      return viola(
        `✗ INV26 VIOLADO: ${huerfanas.length} alerta(s) apuntan a un cobro que ya no existe:\n` +
          huerfanas
            .slice(0, 20)
            .map((a) => `    · ${a.cuenta.client.name}: ${a.tipo} (${a.estado}) → cobro ${a.cobroId}`)
            .join("\n") +
          `\n    Remedio: cerrarlas con cerrarAlertasDeCobros (RESUELTA + motivo + autor). Si están así,` +
          `\n    alguien borró cobros sin pasar por ese chokepoint. Ver lib/cobranza/mutations.ts.`,
      );
    }
    return cumple(`✓ INV26: las ${alertasConCobro.length} alertas de cobro vivas apuntan a cobros que existen.`);
  },
};

/**
 * INV27 · La autoría de una factura vive y muere entera. `facturadoPor` y `facturadoEn` son un
 * solo hecho: quién emitió y cuándo. Uno sin el otro no es media respuesta, es una respuesta
 * rota — y la Fase 0 midió que ya había víctimas del revert destructivo, que limpiaba la fecha de
 * emisión y dejaba el nombre colgando.
 *
 * ⚠ `fechaEmision` es un campo distinto y puede faltar legítimamente (un cobro programado no
 * tiene ninguno de los tres). Lo que no puede pasar es tener uno de la pareja sin el otro.
 */
export const INV27: Invariante = {
  id: "27",
  nombre: "la autoría de facturación está entera o ausente",
  async correr(db) {
    const autoriaRota = await db.cobro.findMany({
      where: {
        OR: [
          { facturadoPor: { not: null }, facturadoEn: null },
          { facturadoPor: null, facturadoEn: { not: null } },
        ],
      },
      select: { id: true, numCuota: true, facturadoPor: true, facturadoEn: true, cuenta: { select: { client: { select: { name: true } } } } },
    });
    if (autoriaRota.length > 0) {
      return viola(
        `✗ INV27 VIOLADO: ${autoriaRota.length} cobro(s) tienen media autoría de facturación:\n` +
          autoriaRota
            .slice(0, 20)
            .map(
              (c) =>
                `    · ${c.cuenta.client.name} #${c.numCuota ?? "?"}: por=${c.facturadoPor ?? "—"} en=${
                  c.facturadoEn ? c.facturadoEn.toISOString().slice(0, 10) : "—"
                }`,
            )
            .join("\n") +
          `\n    Remedio: limpiar los dos, o reponer el que falta desde BitacoraCobro.` +
          `\n    Toda escritura de esta pareja pasa por cambiarEstadoCobroTx: si esto está en rojo, alguien la esquivó.`,
      );
    }
    return cumple("✓ INV27: la autoría de facturación está entera o ausente, nunca a medias.");
  },
};

/**
 * INV28 · Ninguna factura soltada fuera de Odoo se queda esperando para siempre. Es la línea que
 * evita que «Nexus no escribe en el ERP» se convierta en «Nexus pide y nadie hace». Una
 * liberación de ODOO la cierra el sync solo; una de MERCURY u OTRA solo la cierra una persona, y
 * si nadie la cierra el documento sigue emitido contra un cliente que ya no lo debe.
 *
 * ⚠ El umbral son 15 días porque la cobranza de esta casa trabaja en tandas quincenales: algo que
 * sobrevivió una tanda entera es algo que nadie está mirando, no algo que va en camino. Subirlo
 * solo hace que el aviso llegue más tarde; no arregla nada.
 */
export const DIAS_DE_LIBERACION = 15;

export const INV28: Invariante = {
  id: "28",
  nombre: `ninguna factura soltada fuera de Odoo lleva más de ${DIAS_DE_LIBERACION} días sin resolver`,
  async correr(db, ahora) {
    const limiteLiberacion = new Date(ahora.getTime() - DIAS_DE_LIBERACION * 86_400_000);
    const liberacionesViejas = await db.facturaLiberada.findMany({
      where: { resueltaEn: null, plataforma: { not: "ODOO" }, liberadaEn: { lt: limiteLiberacion } },
      select: {
        id: true, clienteNombre: true, monto: true, moneda: true, plataforma: true, decision: true,
        referenciaExterna: true, liberadaEn: true, liberadaPor: true,
      },
      orderBy: { liberadaEn: "asc" },
    });
    if (liberacionesViejas.length > 0) {
      return viola(
        `✗ INV28 VIOLADO: ${liberacionesViejas.length} factura(s) soltadas fuera de Odoo llevan más de ${DIAS_DE_LIBERACION} días sin anular:\n` +
          liberacionesViejas
            .slice(0, 20)
            .map(
              (l) =>
                `    · ${l.clienteNombre}: ${l.moneda} ${Number(l.monto).toFixed(2)} — ${l.plataforma} ${l.decision.toLowerCase()}` +
                ` ${l.referenciaExterna ?? "(sin número)"} · soltada ${l.liberadaEn.toISOString().slice(0, 10)} por ${l.liberadaPor}`,
            )
            .join("\n") +
          `\n    Remedio: anular el documento en su plataforma y marcarlo resuelto en /cobranza/odoo` +
          `\n    → «Lo que no cuadra» → «Ya está anulada». Nada lo verifica por vos: no hay espejo de esa plataforma.`,
      );
    }
    return cumple(`✓ INV28: ninguna factura soltada fuera de Odoo lleva más de ${DIAS_DE_LIBERACION} días sin resolver.`);
  },
};
