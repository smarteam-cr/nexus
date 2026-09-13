/**
 * lib/invariantes/cobranza.ts — los invariantes de la plata: quién confirmó, quién facturó, y
 * qué quedó colgando (extraídos de scripts/check-invariants.ts en B-07, 2026-09-04).
 */
import { cumple, viola, type Invariante } from "./contrato";
import { corteVencido, DIAS_MAXIMOS_ENTRE_CORTES } from "@/lib/cobranza/antiguedad";
import { diffDays } from "@/lib/cobranza/engine";
import { crDateParts } from "@/lib/jobs/time";

/**
 * INV32 · El último corte de cartera tiene como mucho 17 días (lo máximo que hay entre dos cortes).
 * (INV31 es la frescura del espejo de Odoo, en lib/invariantes/odoo.ts.)
 *
 * El corte quincenal es el único que abre las alertas de falta facturar, cuentas sin datos y
 * catch-ups, y el que alimenta las tendencias de Reportes. Nunca se encendió en el VPS, y nada lo
 * decía: al 2026-09-12 había un solo corte, del 24-jul, y el tablero de alertas era una foto de ese
 * día. Desde ese día los vencidos y las promesas incumplidas se refrescan cada noche
 * (lib/cobranza/alertas-refresco.ts), así que el mensaje ya no puede decir que TODAS las alertas son
 * la foto del corte.
 *
 * El día del corte se cuenta en hora de Costa Rica: un corte guardado a las 21:49 CR ya es el día
 * siguiente en UTC, y contar en UTC le regalaba un día. La regla es `corteVencido()`, la misma que
 * pinta el aviso en la pestaña Corte quincenal.
 * ⚠ Nace en rojo hasta que se encienda el corte automático. Sin ningún corte en la historia cumple.
 */
export const INV32: Invariante = {
  id: "32",
  nombre: `el último corte de cartera tiene ${DIAS_MAXIMOS_ENTRE_CORTES} días o menos`,
  async correr(db, ahora) {
    const ultimo = await db.snapshotCartera.findFirst({
      orderBy: { capturedAt: "desc" },
      select: { capturedAt: true, triggeredBy: true },
    });
    if (!ultimo) return cumple("✓ INV32: todavía no hay cortes de cartera: no hay foto vieja de la que avisar.");
    const diaDelCorte = crDateParts(ultimo.capturedAt).dateKey;
    const hoy = crDateParts(ahora).dateKey;
    if (!corteVencido(diaDelCorte, hoy)) return cumple(`✓ INV32: el último corte de cartera es del ${diaDelCorte}.`);
    return viola(
      `✗ INV32 VIOLADO: el último corte de cartera es del ${diaDelCorte} (hace ${diffDays(diaDelCorte, hoy)} días, por ${ultimo.triggeredBy ?? "?"}): ` +
        `las tendencias de Reportes y las alertas de falta facturar, cuentas sin datos y catch-ups son una foto de ese día (los vencidos y las promesas incumplidas se refrescan cada noche).` +
        `\n    Remedio: encender el corte automático (COBRANZA_CRON_ENABLED=1 en el .env del VPS; Integraciones › Jobs del servidor dice si está apagado).` +
        `\n    Un corte a mano desde Cobranza › Corte quincenal lo pone en verde, pero no reemplaza al automático.`,
    );
  },
};

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

/**
 * INV33 · Ningún número de factura está en dos cuentas (etapa 7, 2026-09-12). Un documento le cobra a
 * UN cliente: el mismo número en dos cuentas es un error de captura o un emparejado mal hecho, y
 * cualquiera de los dos hace perseguir la misma factura dos veces. En la MISMA cuenta sí se repite:
 * una factura que cubre varias cuotas.
 *
 * El chokepoint da 409 antes de escribir (lib/cobranza/numero-factura.ts); esto vigila el DATO, por si
 * un script o una consulta a mano lo escriben por fuera.
 * ⚠ Antes de scripts/sql/2026-09-12-7-numero-de-factura.sql la columna no existe: sale «no verificable».
 */
export const INV33: Invariante = {
  id: "33",
  nombre: "ningún número de factura está en dos cuentas",
  async correr(db) {
    const conNumero = await db.cobro.findMany({
      where: { numeroFactura: { not: null } },
      select: { numeroFactura: true, cuentaId: true, cuenta: { select: { client: { select: { name: true } } } } },
    });
    const cuentasPorNumero = new Map<string, Map<string, string>>();
    for (const c of conNumero) {
      if (!c.numeroFactura) continue;
      const cuentas = cuentasPorNumero.get(c.numeroFactura) ?? new Map<string, string>();
      cuentas.set(c.cuentaId, c.cuenta.client.name);
      cuentasPorNumero.set(c.numeroFactura, cuentas);
    }
    const repetidos = [...cuentasPorNumero.entries()].filter(([, cuentas]) => cuentas.size > 1);
    if (repetidos.length > 0) {
      return viola(
        `✗ INV33 VIOLADO: ${repetidos.length} número(s) de factura están en más de una cuenta:\n` +
          repetidos
            .slice(0, 20)
            .map(([numero, cuentas]) => `    · ${numero}: ${[...cuentas.values()].join(" · ")}`)
            .join("\n") +
          `\n    Remedio: en el cronograma de la cuenta que no es la dueña del documento, corregir el número del cobro.` +
          `\n    El chokepoint lo frena con un 409: si esto está en rojo, alguien escribió el número por fuera.`,
      );
    }
    return cumple(`✓ INV33: los ${cuentasPorNumero.size} números de factura están cada uno en una sola cuenta.`);
  },
};

/**
 * INV34 · Todo número de factura tiene autor y factura (etapa 7, 2026-09-12). El número —o la marca
 * «no tengo el número»— es una afirmación sobre un documento y vale lo que vale quien la hizo: el
 * mismo espíritu que INV5 para la fecha de emisión. Y no hay número sin factura: revertirla lo limpia.
 *
 * Tres roturas: número o marca sin autor · autoría colgando sin número ni marca · número o marca en
 * un cobro sin fecha de emisión. (Número y marca juntos no se miran: lo impide el CHECK del SQL.)
 * ⚠ Antes de scripts/sql/2026-09-12-7-numero-de-factura.sql las columnas no existen: sale «no verificable».
 */
export const INV34: Invariante = {
  id: "34",
  nombre: "todo número de factura tiene autor y factura",
  async correr(db) {
    const filas = await db.cobro.findMany({
      where: {
        OR: [
          { numeroFactura: { not: null } },
          { sinNumeroFacturaMotivo: { not: null } },
          { numeroFacturaPor: { not: null } },
          { numeroFacturaEn: { not: null } },
        ],
      },
      select: {
        numCuota: true,
        numeroFactura: true,
        sinNumeroFacturaMotivo: true,
        numeroFacturaPor: true,
        numeroFacturaEn: true,
        fechaEmision: true,
        cuenta: { select: { client: { select: { name: true } } } },
      },
    });
    const rotos: string[] = [];
    for (const f of filas) {
      const dato = f.numeroFactura ?? (f.sinNumeroFacturaMotivo ? "«no tengo el número»" : null);
      const cobro = `${f.cuenta.client.name} #${f.numCuota ?? "?"}`;
      if (!dato) {
        rotos.push(`    · ${cobro}: firma de número (${f.numeroFacturaPor ?? "—"}) sin número ni marca`);
        continue;
      }
      if (!f.numeroFacturaPor || !f.numeroFacturaEn) {
        rotos.push(
          `    · ${cobro}: ${dato} sin autor entero (por=${f.numeroFacturaPor ?? "—"} en=${
            f.numeroFacturaEn ? f.numeroFacturaEn.toISOString().slice(0, 10) : "—"
          })`,
        );
      }
      if (!f.fechaEmision) rotos.push(`    · ${cobro}: ${dato} en un cobro sin fecha de emisión`);
    }
    if (rotos.length > 0) {
      return viola(
        `✗ INV34 VIOLADO: ${rotos.length} rotura(s) en los números de factura:\n` +
          rotos.slice(0, 20).join("\n") +
          `\n    Remedio: reponer la firma desde BitacoraCobro (cada número deja su línea con el correo de quien lo puso),` +
          `\n    o revertir la factura y volver a marcarla. Toda escritura del número pasa por cambiarEstadoCobroTx.`,
      );
    }
    return cumple(`✓ INV34: los ${filas.length} números de factura (o marcas «no tengo el número») tienen autor y factura.`);
  },
};

/**
 * INV35 · Ninguna factura está cargada como cobro y como plata que no es venta (etapa 10, 2026-09-12).
 * El mismo documento en `Cobro.numeroFactura` y en `IngresoVariable.referenciaExterna` cuenta la misma
 * plata dos veces: como venta en lo facturado y otra vez en la caja. Es el riesgo que dejó el fondo de
 * marketing de Insider (INV-26 + INV-27), que el Compendio cuenta como venta.
 *
 * El alta de un ingreso da 409 si su número ya es de un cobro (lib/cobranza/mutations.ts). El orden
 * inverso —marcar facturado un cobro con un número ya cargado como ingreso— no lo frena nadie: por eso
 * esto mira el DATO. Los dos lados se normalizan con la misma función, así que se comparan tal cual.
 * ⚠ Antes de scripts/sql/2026-09-12-10-ingreso-no-venta.sql la columna no existe: sale «no verificable».
 */
export const INV35: Invariante = {
  id: "35",
  nombre: "ninguna factura está cargada como cobro y como plata que no es venta",
  async correr(db) {
    const ingresos = await db.ingresoVariable.findMany({
      where: { referenciaExterna: { not: null } },
      select: { referenciaExterna: true, concepto: true },
    });
    const conceptoPorReferencia = new Map<string, string>();
    for (const i of ingresos) if (i.referenciaExterna) conceptoPorReferencia.set(i.referenciaExterna, i.concepto);
    if (conceptoPorReferencia.size === 0) {
      return cumple("✓ INV35: ningún ingreso que no es venta trae número de documento: no hay con qué chocar.");
    }
    const cobros = await db.cobro.findMany({
      where: { numeroFactura: { in: [...conceptoPorReferencia.keys()] } },
      select: { numeroFactura: true, cuenta: { select: { client: { select: { name: true } } } } },
    });
    const choques = new Map<string, Set<string>>();
    for (const c of cobros) {
      // Se vuelve a mirar acá y no solo en el `where`: el dato manda, no la forma de la consulta.
      if (!c.numeroFactura || !conceptoPorReferencia.has(c.numeroFactura)) continue;
      const clientes = choques.get(c.numeroFactura) ?? new Set<string>();
      clientes.add(c.cuenta.client.name);
      choques.set(c.numeroFactura, clientes);
    }
    if (choques.size > 0) {
      return viola(
        `✗ INV35 VIOLADO: ${choques.size} documento(s) están cargados como cobro y como plata que no es venta:\n` +
          [...choques.entries()]
            .slice(0, 20)
            .map(
              ([numero, clientes]) =>
                `    · ${numero}: «${conceptoPorReferencia.get(numero)}» en Ingresos variables · cobro de ${[...clientes].join(" · ")}`,
            )
            .join("\n") +
          `\n    Remedio: decidir si esa plata es venta. Si lo es, borrar el ingreso; si no, corregir el cobro en Cobranza.`,
      );
    }
    return cumple(`✓ INV35: los ${conceptoPorReferencia.size} documentos de Ingresos variables no están cargados como cobro.`);
  },
};

/**
 * INV36 · A quién se facturó un cobro es una sociedad de SU cuenta y de la plataforma anotada, y el cobro está
 * facturado (etapa 12, 2026-09-13). Una factura anotada a una sociedad de otra cuenta hace perseguir la plata
 * con el nombre equivocado; una plataforma que no es la de su sociedad manda a buscar el documento al sistema
 * equivocado.
 *
 * El chokepoint no deja escribirlo (`resolverSociedad`), y desvincular o soltar una sociedad con cobros da 409:
 * esto vigila el DATO, por si un script o una consulta a mano lo escriben por fuera.
 * ⚠ Antes de scripts/sql/2026-09-12-12-sociedades-facturadoras.sql las columnas no existen: sale «no verificable».
 */
export const INV36: Invariante = {
  id: "36",
  nombre: "a quién se facturó un cobro es una sociedad de su cuenta, y el cobro está facturado",
  async correr(db) {
    const filas = await db.cobro.findMany({
      where: { OR: [{ plataformaFactura: { not: null } }, { sociedadFacturadaId: { not: null } }] },
      select: {
        numCuota: true,
        cuentaId: true,
        fechaEmision: true,
        plataformaFactura: true,
        cuenta: { select: { client: { select: { name: true } } } },
        sociedadFacturada: { select: { odooPartnerNombre: true, cuentaId: true, plataforma: true } },
      },
    });
    const rotos: string[] = [];
    for (const f of filas) {
      const cobro = `${f.cuenta.client.name} #${f.numCuota ?? "?"}`;
      if (!f.fechaEmision) rotos.push(`    · ${cobro}: dice a quién o dónde se facturó y no está facturado`);
      const s = f.sociedadFacturada;
      if (!s) continue;
      if (s.cuentaId !== f.cuentaId) {
        rotos.push(`    · ${cobro}: facturado a «${s.odooPartnerNombre}», que no le factura a esta cuenta`);
      }
      if (s.plataforma !== f.plataformaFactura) {
        rotos.push(`    · ${cobro}: «${s.odooPartnerNombre}» factura por ${s.plataforma} y el cobro dice ${f.plataformaFactura ?? "—"}`);
      }
    }
    if (rotos.length > 0) {
      return viola(
        `✗ INV36 VIOLADO: ${rotos.length} rotura(s) en a quién se facturó:\n` +
          rotos.slice(0, 20).join("\n") +
          `\n    Remedio: en el cronograma de la cuenta, «cambiar» la factura y elegir la sociedad de nuevo (queda en la bitácora).` +
          `\n    Toda escritura pasa por cambiarEstadoCobroTx: si esto está en rojo, alguien escribió por fuera.`,
      );
    }
    return cumple(`✓ INV36: los ${filas.length} cobros con sociedad o plataforma anotada están facturados y a una sociedad de su cuenta.`);
  },
};
