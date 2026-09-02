/**
 * lib/cobranza/odoo/sync.ts
 *
 * El espejo: trae las facturas de Odoo y las deja al lado de los cobros de Nexus. Server-only.
 *
 * ⛔ **Solo lectura hacia Odoo, siempre.** Nexus no escribe una sola línea en el ERP.
 * ⛔ **No toca ningún `Cobro`** (INV25). Espeja hechos; el semáforo se propone aparte.
 *
 * ── LA CORRIDA SE REGISTRA ANTES DE EMPEZAR ─────────────────────────────────────
 * `CronJobState` guarda ESTADO, no historia: una fila por job, el claim se estampa antes de
 * correr, y no hay campo de error. Con eso **no se puede decir «viene fallando hace tres
 * días»** — y hoy, cuando un job se rompe, el error solo va al log del contenedor.
 *
 * Por eso cada corrida abre su propia fila en `SyncOdooCorrida` y la cierra pase lo que pase.
 * Una fila abierta hace horas ES el hallazgo: significa que el proceso se murió a mitad.
 *
 * ⚠ Este archivo NO lleva `server-only`, a diferencia de `servicio.ts`. Lo corre el scheduler
 * (Node, sin React) y tiene que poder invocarse desde un script para diagnosticar. Es la misma
 * razón por la que `lib/ventas/sync-ganadas.ts` tampoco lo lleva.
 */
import { prisma } from "@/lib/db/prisma";
import { crearTransporteXmlRpc, configDesdeEntorno } from "./transporte-xmlrpc";
import {
  ODOO_CAMPOS_FACTURA,
  OdooError,
  dominioFacturasDesde,
  dominioFacturasVenta,
  explicarFallo,
  type OdooTransport,
} from "./transporte";
import { calcularDeltas, esCorridaParcial, mapearFactura, type Delta, type FacturaEspejada } from "./espejo";

export interface ResultadoSync {
  corridaId: string;
  ok: boolean;
  parcial: boolean;
  facturasVistas: number;
  creadas: number;
  actualizadas: number;
  desaparecidas: number;
  cambios: number;
  rechazadas: string[];
  sinCuenta: number;
  movidasDesdeLaUltima: number | null;
  error: string | null;
  duracionMs: number;
}

/**
 * ⚠ Se lee TODO el universo en cada corrida, no solo lo que cambió.
 *
 * Son 347 facturas: la lectura completa cuesta un par de segundos. Y una corrida incremental
 * **no puede detectar lo que desapareció** —una factura borrada en Odoo no le mueve el
 * `write_date` a ninguna otra—, así que el modo incremental tendría que convivir con un modo
 * completo periódico y con la pregunta de cuál corrió la última vez. A este volumen eso es
 * complejidad sin beneficio.
 *
 * El filtro por `write_date` sí se usa: para CONTAR cuántas se movieron y dejarlo anotado en
 * la corrida. Es el dato que un humano quiere ver primero cuando algo no cuadra.
 */
export async function sincronizarOdoo(opts: {
  disparadaPor: string;
  transporte?: OdooTransport;
}): Promise<ResultadoSync> {
  const t0 = Date.now();
  const corrida = await prisma.syncOdooCorrida.create({
    data: { disparadaPor: opts.disparadaPor },
    select: { id: true },
  });

  const res: ResultadoSync = {
    corridaId: corrida.id,
    ok: false,
    parcial: false,
    facturasVistas: 0,
    creadas: 0,
    actualizadas: 0,
    desaparecidas: 0,
    cambios: 0,
    rechazadas: [],
    sinCuenta: 0,
    movidasDesdeLaUltima: null,
    error: null,
    duracionMs: 0,
  };

  try {
    const t = opts.transporte ?? crearTransporteXmlRpc(configDesdeEntorno());

    const ultima = await prisma.syncOdooCorrida.findFirst({
      where: { ok: true, id: { not: corrida.id } },
      orderBy: { iniciadaEn: "desc" },
      select: { iniciadaEn: true },
    });
    if (ultima) {
      res.movidasDesdeLaUltima = await t.contar("account.move", dominioFacturasDesde(ultima.iniciadaEn));
    }

    const crudas = await t.buscarYLeer("account.move", dominioFacturasVenta(), ODOO_CAMPOS_FACTURA, {
      order: "id asc",
    });
    res.facturasVistas = crudas.length;

    const vistas: FacturaEspejada[] = [];
    for (const c of crudas) {
      const r = mapearFactura(c);
      if ("rechazo" in r) res.rechazadas.push(r.rechazo);
      else vistas.push(r.factura);
    }

    const conocidas = await prisma.facturaOdoo.count({ where: { estadoEspejo: "VIGENTE" } });
    res.parcial = esCorridaParcial(vistas.length, conocidas);

    /* ⛔ Una corrida parcial NO reclasifica nada. El modo en que este sync hace daño no es
       fallando: es teniendo ÉXITO con la mitad de los datos y concluyendo que las otras 200
       facturas ya no existen. */
    if (res.parcial) {
      res.error = `La lectura trajo ${vistas.length} facturas contra ${conocidas} conocidas (menos de la mitad): no se espeja nada.`;
      await cerrar(corrida.id, res, t0);
      return res;
    }

    const vinculos = await prisma.odooPartnerVinculo.findMany({
      where: { cuentaId: { not: null } },
      select: { odooPartnerId: true, cuentaId: true },
    });
    const cuentaDe = new Map(vinculos.map((v) => [v.odooPartnerId, v.cuentaId!]));

    const previas = await prisma.facturaOdoo.findMany({
      where: { odooMoveId: { in: vistas.map((f) => f.odooMoveId) } },
      select: {
        id: true,
        odooMoveId: true,
        montoTotal: true,
        montoResidual: true,
        paymentState: true,
        state: true,
        invoiceDate: true,
        cuentaId: true,
        estadoEspejo: true,
      },
    });
    const previaDe = new Map(previas.map((p) => [p.odooMoveId, p]));
    const ahora = new Date();
    const sinCambio: string[] = [];
    const altas: Array<{ odooMoveId: number; numero: string; moneda: string; montoTotal: number }> = [];
    const nuevas: Array<Record<string, unknown>> = [];

    for (const f of vistas) {
      const cuentaId = cuentaDe.get(f.odooPartnerId) ?? null;
      if (!cuentaId) res.sinCuenta++;

      const datos = {
        numero: f.numero,
        moveType: f.moveType,
        state: f.state,
        paymentState: f.paymentState,
        invoiceDate: new Date(`${f.invoiceDate}T00:00:00Z`),
        invoiceDateDue: f.invoiceDateDue ? new Date(`${f.invoiceDateDue}T00:00:00Z`) : null,
        montoNeto: f.montoNeto,
        montoTotal: f.montoTotal,
        montoResidual: f.montoResidual,
        montoImpuesto: f.montoImpuesto,
        montoTotalSigned: f.montoTotalSigned,
        moneda: f.moneda,
        odooPartnerId: f.odooPartnerId,
        odooPartnerNombre: f.odooPartnerNombre,
        cuentaId,
        estadoEspejo: "VIGENTE" as const,
        sincronizadoEn: ahora,
      };

      const previa = previaDe.get(f.odooMoveId);
      if (!previa) {
        /* La primera corrida son 347 altas. De a una tardaban un minuto; juntas, una llamada. */
        nuevas.push({ odooMoveId: f.odooMoveId, ...datos });
        altas.push({ odooMoveId: f.odooMoveId, numero: f.numero, moneda: f.moneda, montoTotal: f.montoTotal });
        res.creadas++;
        continue;
      }

      const deltas: Delta[] = calcularDeltas(
        {
          montoTotal: Number(previa.montoTotal),
          montoResidual: Number(previa.montoResidual),
          paymentState: previa.paymentState,
          state: previa.state,
          invoiceDate: previa.invoiceDate.toISOString().slice(0, 10),
          cuentaId: previa.cuentaId,
        },
        f,
        cuentaId,
      );

      /* Una que había DESAPARECIDO y volvió también es un cambio: se registra para que la
         resurrección no pase inadvertida. */
      const revivio = previa.estadoEspejo === "DESAPARECIDA";
      if (!deltas.length && !revivio) {
        /* ⚠ NO se escribe una fila por factura sin cambios. Medido en la primera corrida: 347
           escrituras de a una contra Supabase tardan 63 s, y la corrida diaria en régimen es
           casi toda «sin cambios» — o sea un minuto de ida y vuelta para estampar una fecha.
           Se juntan y salen en un solo `updateMany` al final. */
        sinCambio.push(previa.id);
        continue;
      }

      await prisma.facturaOdoo.update({ where: { id: previa.id }, data: datos });
      for (const d of deltas) {
        await prisma.facturaOdooCambio.create({
          data: {
            facturaId: previa.id,
            odooMoveId: f.odooMoveId,
            numero: f.numero,
            tipo: d.tipo,
            anterior: d.anterior,
            nuevo: d.nuevo,
          },
        });
      }
      res.actualizadas++;
      res.cambios += deltas.length;
    }

    if (nuevas.length) {
      await prisma.facturaOdoo.createMany({ data: nuevas as never, skipDuplicates: true });
      const creadas = await prisma.facturaOdoo.findMany({
        where: { odooMoveId: { in: altas.map((a) => a.odooMoveId) } },
        select: { id: true, odooMoveId: true },
      });
      const idDe = new Map(creadas.map((c) => [c.odooMoveId, c.id]));
      await prisma.facturaOdooCambio.createMany({
        data: altas.map((a) => ({
          facturaId: idDe.get(a.odooMoveId) ?? null,
          odooMoveId: a.odooMoveId,
          numero: a.numero,
          tipo: "ALTA" as const,
          nuevo: `${a.moneda} ${a.montoTotal.toFixed(2)}`,
        })),
      });
    }
    if (sinCambio.length) {
      await prisma.facturaOdoo.updateMany({ where: { id: { in: sinCambio } }, data: { sincronizadoEn: ahora } });
    }

    /* ⛔ NUNCA se borra una fila: se marca. Una factura que Odoo dejó de devolver puede ser
       un borrado real, un cambio de permisos o un filtro que quedó mal — y la que se borró es
       justamente la que hace falta para entender por qué un cobro quedó sin factura. */
    const vistosIds = vistas.map((f) => f.odooMoveId);
    const desaparecidas = await prisma.facturaOdoo.findMany({
      where: { estadoEspejo: "VIGENTE", odooMoveId: { notIn: vistosIds } },
      select: { id: true, odooMoveId: true, numero: true },
    });
    for (const d of desaparecidas) {
      await prisma.facturaOdoo.update({ where: { id: d.id }, data: { estadoEspejo: "DESAPARECIDA" } });
      await prisma.facturaOdooCambio.create({
        data: {
          facturaId: d.id,
          odooMoveId: d.odooMoveId,
          numero: d.numero,
          tipo: "DESAPARECIDA",
          anterior: "VIGENTE",
          nuevo: "DESAPARECIDA",
        },
      });
    }
    res.desaparecidas = desaparecidas.length;
    res.ok = true;
  } catch (e) {
    /* El texto del error se GUARDA. Es la diferencia entre «viene fallando hace tres días
       porque cambió la contraseña» y «no sé, no anda». */
    res.error =
      e instanceof OdooError ? `${explicarFallo(e.clase)} | ${e.message}` : e instanceof Error ? e.message : String(e);
  }

  await cerrar(corrida.id, res, t0);
  return res;
}

async function cerrar(corridaId: string, res: ResultadoSync, t0: number): Promise<void> {
  res.duracionMs = Date.now() - t0;
  await prisma.syncOdooCorrida.update({
    where: { id: corridaId },
    data: {
      terminadaEn: new Date(),
      ok: res.ok,
      parcial: res.parcial,
      facturasVistas: res.facturasVistas,
      creadas: res.creadas,
      actualizadas: res.actualizadas,
      desaparecidas: res.desaparecidas,
      vinculadas: res.facturasVistas - res.sinCuenta,
      error: res.error,
      duracionMs: res.duracionMs,
    },
  });
}

/** Lo que la pantalla de cobranza necesita para decir «el espejo está al día» o no. */
export async function ultimaCorrida(): Promise<{
  iniciadaEn: string;
  terminadaEn: string | null;
  ok: boolean;
  parcial: boolean;
  error: string | null;
  facturasVistas: number;
  creadas: number;
  actualizadas: number;
  desaparecidas: number;
  disparadaPor: string;
} | null> {
  const c = await prisma.syncOdooCorrida.findFirst({ orderBy: { iniciadaEn: "desc" } });
  if (!c) return null;
  return {
    iniciadaEn: c.iniciadaEn.toISOString(),
    terminadaEn: c.terminadaEn?.toISOString() ?? null,
    ok: c.ok,
    parcial: c.parcial,
    error: c.error,
    facturasVistas: c.facturasVistas,
    creadas: c.creadas,
    actualizadas: c.actualizadas,
    desaparecidas: c.desaparecidas,
    disparadaPor: c.disparadaPor,
  };
}
