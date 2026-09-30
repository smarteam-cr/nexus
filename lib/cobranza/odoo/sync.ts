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
  ODOO_CAMPOS_PARTNER,
  OdooError,
  dominioClientes,
  dominioFacturasDesde,
  dominioFacturasVenta,
  explicarFallo,
  type OdooFalloClase,
  type OdooTransport,
} from "./transporte";
import {
  calcularDeltas,
  esBorradoMasivo,
  esCorridaParcial,
  espejoVencido,
  evidenciaDesactualizada,
  mapearFactura,
  textoOdoo,
  type Delta,
  type FacturaEspejada,
  type TipoCambioBitacora,
} from "./espejo";
import { cambiosDeLaLista, reatribuciones, type PartnerOdoo } from "./emparejado";

/** El separador del detalle de rechazos. Constante para no pelear con el escapado. */
const SALTO = String.fromCharCode(10);

export interface ResultadoSync {
  corridaId: string;
  ok: boolean;
  parcial: boolean;
  facturasVistas: number;
  /** Las que además se pudieron LEER. `facturasVistas - espejadas` = rechazadas. */
  espejadas: number;
  creadas: number;
  actualizadas: number;
  desaparecidas: number;
  cambios: number;
  rechazadas: string[];
  sinCuenta: number;
  movidasDesdeLaUltima: number | null;
  error: string | null;
  /**
   * ⚠ QUÉ CLASE de fallo fue. Sin esto el llamador no puede distinguir «se cayó la red»
   * —reintentar tiene sentido— de «Odoo rechazó el usuario», donde reintentar cada minuto es
   * exactamente lo que profundiza el bloqueo del ERP.
   */
  clase: OdooFalloClase | null;
  duracionMs: number;
  /** Clientes de Odoo que entraron a la lista para emparejar en esta copia (`recordarClientes`). */
  clientesNuevos: number;
  /**
   * true = otra copia estaba corriendo —la de la mañana, o la que pidió otra persona con «Actualizar desde Odoo»—.
   * Esta no leyó Odoo ni escribió nada, y no dejó fila en `SyncOdooCorrida`: no es una corrida fallida, es una que
   * no hizo falta.
   */
  enCurso?: boolean;
}

/* ── El candado: una sola copia a la vez ───────────────────────────────────────── */

/**
 * Desde el 2026-09-29 la copia también la pide una persona con un botón. Dos copias a la vez leen lo mismo, calculan
 * los mismos cambios contra la misma base y los anotan dos veces en la bitácora. El candado es una fila de
 * `CronJobState` con compare-and-set, el mismo molde que `ventas-ganadas-sync-lock`.
 */
const CANDADO = "odoo-espejo-candado";
/** Una copia tarda segundos. Si el proceso murió con el candado puesto, a los 10 minutos se da por suelto. */
const CANDADO_VENCE_MS = 10 * 60 * 1000;

async function tomarCandado(ahora: Date): Promise<boolean> {
  /* La fila tiene que existir para que el compare-and-set de abajo tenga contra qué comparar. `skipDuplicates` y no
     `upsert`: dos copias que llegan a la vez la primera vez chocaban al crearla, y aunque el choque se atajaba, Prisma
     lo dejaba escrito en el log como un error que no era (medido contra la base local). */
  await prisma.cronJobState.createMany({ data: [{ id: CANDADO }], skipDuplicates: true });
  const tomado = await prisma.cronJobState.updateMany({
    where: {
      id: CANDADO,
      OR: [{ lastRunAt: null }, { lastRunAt: { lt: new Date(ahora.getTime() - CANDADO_VENCE_MS) } }],
    },
    data: { lastRunAt: ahora },
  });
  return tomado.count === 1;
}

/** ⛔ Nunca lanza: corre en un `finally`, y un fallo al soltar no puede tapar el resultado de la copia. */
async function soltarCandado(): Promise<void> {
  await prisma.cronJobState.updateMany({ where: { id: CANDADO }, data: { lastRunAt: null } }).catch(() => {});
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
export async function sincronizarOdoo(opts: OpcionesDeCopia): Promise<ResultadoSync> {
  if (!(await tomarCandado(new Date()))) {
    return { ...resultadoVacio(""), enCurso: true, error: "Ya hay una copia de Odoo en curso." };
  }
  try {
    return await copiar(opts);
  } finally {
    await soltarCandado();
  }
}

export interface OpcionesDeCopia {
  disparadaPor: string;
  transporte?: OdooTransport;
  /**
   * Cuánto se espera cada respuesta de Odoo, en ms. La copia de la mañana usa el de la configuración (60 s); la que
   * pide una persona con el botón, uno corto: una pantalla esperando tres minutos a un ERP que no contesta se lee
   * como que Nexus se colgó.
   */
  esperaMs?: number;
}

function resultadoVacio(corridaId: string): ResultadoSync {
  return {
    corridaId,
    ok: false,
    parcial: false,
    facturasVistas: 0,
    espejadas: 0,
    creadas: 0,
    actualizadas: 0,
    desaparecidas: 0,
    cambios: 0,
    rechazadas: [],
    sinCuenta: 0,
    movidasDesdeLaUltima: null,
    error: null,
    clase: null,
    duracionMs: 0,
    clientesNuevos: 0,
  };
}

async function copiar(opts: OpcionesDeCopia): Promise<ResultadoSync> {
  const t0 = Date.now();
  const corrida = await prisma.syncOdooCorrida.create({
    data: { disparadaPor: opts.disparadaPor },
    select: { id: true },
  });

  const res = resultadoVacio(corrida.id);

  try {
    const t =
      opts.transporte ??
      crearTransporteXmlRpc({ ...configDesdeEntorno(), ...(opts.esperaMs ? { timeoutMs: opts.esperaMs } : {}) });

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

    /* ⭐ La lista de clientes de Odoo viaja con la copia (2026-09-29). Se lee acá, junto con las facturas y ANTES de
       escribir nada: si Odoo no contesta, la corrida falla entera y no queda una copia a medias. */
    const crudosCliente = await t.buscarYLeer("res.partner", dominioClientes(), ODOO_CAMPOS_PARTNER, {
      order: "id asc",
    });

    const vistas: FacturaEspejada[] = [];
    for (const c of crudas) {
      const r = mapearFactura(c);
      if ("rechazo" in r) res.rechazadas.push(r.rechazo);
      else vistas.push(r.factura);
    }

    res.espejadas = vistas.length;

    const conocidas = await prisma.facturaOdoo.count({ where: { estadoEspejo: "VIGENTE" } });
    res.parcial = esCorridaParcial(vistas.length, conocidas);

    /* ⛔ Una corrida parcial NO reclasifica nada. El modo en que este sync hace daño no es
       fallando: es teniendo ÉXITO con la mitad de los datos y concluyendo que las otras 200
       facturas ya no existen. */
    if (res.parcial) {
      res.error = `La lectura trajo ${vistas.length} facturas contra ${conocidas} conocidas (menos de la mitad): no se copió nada.`;
      return res;
    }

    const previas = await prisma.facturaOdoo.findMany({
      where: { odooMoveId: { in: vistas.map((f) => f.odooMoveId) } },
      select: {
        id: true,
        odooMoveId: true,
        montoTotal: true,
        montoNeto: true,
        montoResidual: true,
        montoMonedaCompania: true,
        moneda: true,
        paymentState: true,
        state: true,
        invoiceDate: true,
        cuentaId: true,
        estadoEspejo: true,
      },
    });
    const previaDe = new Map(previas.map((p) => [p.odooMoveId, p]));

    /**
     * ⚠⚠ Los vínculos se leen DESPUÉS de las facturas guardadas, y la cuenta se escribe SOLO en
     * las facturas donde cambia. Desde el 2026-09-12 confirmar un vínculo atribuye las facturas
     * en el acto, así que el sync ya no es el único que escribe la cuenta.
     *
     * Antes era al revés: vínculos primero y `cuentaId` en cada fila que tuviera algún delta. Si
     * alguien confirmaba un cliente mientras corría el sync —un minuto contra Supabase—, la
     * corrida pisaba la atribución recién hecha con el mapa viejo y la dejaba sin cuenta.
     *
     * Con este orden, una confirmación que llega después de leer las previas no genera delta
     * (previa y vínculo dicen lo mismo) y la fila no se toca. ⚠ Queda una ventana: desvincular
     * DURANTE la escritura puede reponer la cuenta vieja. Se corrige en la corrida siguiente y
     * INV30 lo marca mientras dura.
     */
    const vinculos = await prisma.odooPartnerVinculo.findMany({
      where: { cuentaId: { not: null } },
      select: { odooPartnerId: true, cuentaId: true },
    });
    const cuentaQueCambia = new Map(
      reatribuciones(
        vistas.map((f) => ({
          id: String(f.odooMoveId),
          odooMoveId: f.odooMoveId,
          numero: f.numero,
          odooPartnerId: f.odooPartnerId,
          cuentaId: previaDe.get(f.odooMoveId)?.cuentaId ?? null,
        })),
        vinculos,
      ).map((r) => [r.odooMoveId, r.nuevo]),
    );

    const ahora = new Date();
    const sinCambio: string[] = [];
    const altas: Array<{ odooMoveId: number; numero: string; moneda: string; montoTotal: number }> = [];
    const nuevas: Array<Record<string, unknown>> = [];

    for (const f of vistas) {
      const previa = previaDe.get(f.odooMoveId);
      const cambiaCuenta = cuentaQueCambia.has(f.odooMoveId);
      const cuentaId = cambiaCuenta ? (cuentaQueCambia.get(f.odooMoveId) ?? null) : (previa?.cuentaId ?? null);
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
        montoMonedaCompania: f.montoMonedaCompania,
        moneda: f.moneda,
        odooPartnerId: f.odooPartnerId,
        odooPartnerNombre: f.odooPartnerNombre,
        estadoEspejo: "VIGENTE" as const,
        sincronizadoEn: ahora,
      };

      if (!previa) {
        /* La primera corrida son 347 altas. De a una tardaban un minuto; juntas, una llamada. */
        nuevas.push({ odooMoveId: f.odooMoveId, ...datos, cuentaId });
        altas.push({ odooMoveId: f.odooMoveId, numero: f.numero, moneda: f.moneda, montoTotal: f.montoTotal });
        res.creadas++;
        continue;
      }

      const deltas: Delta[] = calcularDeltas(
        {
          montoTotal: Number(previa.montoTotal),
          montoNeto: Number(previa.montoNeto),
          moneda: previa.moneda,
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
      /* La evidencia del tipo de cambio no va a la bitácora, pero tampoco puede quedarse vieja: si
         solo cambió ella, la fila se reescribe sin anotar nada (ver `evidenciaDesactualizada`). */
      const evidenciaVieja = evidenciaDesactualizada(
        previa.montoMonedaCompania === null ? null : Number(previa.montoMonedaCompania),
        f.montoMonedaCompania,
      );
      if (!deltas.length && !revivio && !evidenciaVieja) {
        /* ⚠ NO se escribe una fila por factura sin cambios. Medido en la primera corrida: 347
           escrituras de a una contra Supabase tardan 63 s, y la corrida diaria en régimen es
           casi toda «sin cambios» — o sea un minuto de ida y vuelta para estampar una fecha.
           Se juntan y salen en un solo `updateMany` al final. */
        sinCambio.push(previa.id);
        continue;
      }

      /* ⚠ La resurrección SÍ deja rastro. El comentario de arriba lo prometía y el código no lo
         hacía: con `deltas` vacío el bucle no iteraba, así que una factura que volvía de
         DESAPARECIDA se reactivaba sin una sola línea que lo dijera. */
      const aEscribir: Array<{ tipo: TipoCambioBitacora; anterior: string; nuevo: string }> = revivio
        ? [{ tipo: "DESAPARECIDA" as const, anterior: "DESAPARECIDA", nuevo: "VIGENTE" }, ...deltas]
        : deltas;

      /* ⛔ La fila y su bitácora en UNA escritura anidada, no en dos sueltas. Si el proceso
         moría entre las dos, la fila quedaba con los valores nuevos y la corrida siguiente ya
         no encontraba deltas: el cambio se perdía para siempre y re-correr el sync no lo
         reparaba. Es el peor caso de re-ejecución — parece idempotente y consumió el evento. */
      await prisma.facturaOdoo.update({
        where: { id: previa.id },
        data: {
          ...datos,
          /* Solo si cambió: escribirla siempre es lo que pisaba una atribución hecha a mitad de
             la corrida (ver arriba). */
          ...(cambiaCuenta ? { cuentaId } : {}),
          /* Sin bitácora cuando lo único que cambió es la evidencia del tipo de cambio. */
          ...(aEscribir.length
            ? {
                cambios: {
                  create: aEscribir.map((d) => ({
                    odooMoveId: f.odooMoveId,
                    numero: f.numero,
                    tipo: d.tipo,
                    anterior: d.anterior,
                    nuevo: d.nuevo,
                  })),
                },
              }
            : {}),
        },
      });
      /* Los contadores se suman DESPUÉS de escribir: sumarlos antes hace que la corrida
         reporte trabajo que no llegó a pasar. */
      res.actualizadas++;
      res.cambios += aEscribir.length;
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
    /**
     * ⚠⚠ De las CRUDAS, no de las mapeadas. Éste es el defecto que siete auditorías
     * independientes encontraron por separado.
     *
     * Una factura que Odoo SÍ devuelve pero que `mapearFactura` rechaza —le falta la fecha, el
     * partner o la moneda— salía de `vistas`, y el sync concluía que había desaparecido del
     * ERP. La marcaba DESAPARECIDA, con lo que sale del cronograma del cliente y de la mesa
     * del CFO, **y la bitácora afirmaba que Odoo la borró, que es falso**.
     *
     * Odoo la sigue devolviendo. Que no la sepamos leer es un problema nuestro, y se cuenta
     * aparte en `rechazadas`.
     */
    const vistosIds = crudas.map((c) => Number(c.id)).filter((n) => Number.isFinite(n) && n > 0);
    const desaparecidas = await prisma.facturaOdoo.findMany({
      where: { estadoEspejo: "VIGENTE", odooMoveId: { notIn: vistosIds } },
      select: { id: true, odooMoveId: true, numero: true },
    });
    if (esBorradoMasivo(desaparecidas.length, conocidas)) {
      /* ⚠ No se marca ninguna. Perder la marca de una borrada de verdad es recuperable —vuelve
         en la corrida siguiente—; marcar 200 vivas como desaparecidas vacía el cronograma de
         medio año y nadie sabe por qué. */
      res.error = `${desaparecidas.length} facturas dejaron de venir de golpe (de ${conocidas} conocidas). Eso no parece un borrado: no se marcó ninguna como desaparecida.`;
      res.clase = "PROTOCOLO";
      return res;
    }
    for (const d of desaparecidas) {
      await prisma.facturaOdoo.update({
        where: { id: d.id },
        data: {
          estadoEspejo: "DESAPARECIDA",
          cambios: {
            create: {
              odooMoveId: d.odooMoveId,
              numero: d.numero,
              tipo: "DESAPARECIDA",
              anterior: "VIGENTE",
              nuevo: "DESAPARECIDA",
            },
          },
        },
      });
      /* Adentro del bucle: asignar el total después hacía que un corte a mitad reportara cero
         desaparecidas habiendo marcado la mitad. */
      res.desaparecidas++;
    }

    /* Al final, con las facturas ya guardadas: un cliente nuevo de Odoo queda para emparejar esa misma mañana, o en
       el momento si alguien pidió la copia con el botón. */
    res.clientesNuevos = await recordarClientes(
      crudosCliente.flatMap((p) => {
        const odooPartnerId = Number(p.id);
        const nombre = textoOdoo(p.name);
        if (!Number.isFinite(odooPartnerId) || odooPartnerId <= 0 || !nombre) return [];
        return [{ odooPartnerId, nombre, vat: textoOdoo(p.vat), customerRank: Number(p.customer_rank ?? 0) }];
      }),
      new Set(vistas.map((f) => f.odooPartnerId)),
    );
    res.ok = true;
  } catch (e) {
    /* El texto del error se GUARDA. Es la diferencia entre «viene fallando hace tres días
       porque cambió la contraseña» y «no sé, no anda». */
    res.error =
      e instanceof OdooError ? `${explicarFallo(e.clase)} | ${e.message}` : e instanceof Error ? e.message : String(e);
    res.clase = e instanceof OdooError ? e.clase : "PROTOCOLO";
  } finally {
    /* ⛔ En `finally`, no después del catch. Si algo tira fuera del try —o alguien agrega un
       `return` temprano— la fila queda ABIERTA para siempre, y una corrida abierta es
       indistinguible de una que sigue corriendo. Es justo lo que vigila INV24: el fallo que
       no se ve. */
    await cerrar(corrida.id, res, t0);
  }

  return res;
}

/**
 * Deja la lista de clientes de Odoo como Odoo la tiene hoy, sin tocar las fichas que ya tienen decisión. Qué entra y
 * qué se renombra lo decide `cambiosDeLaLista` (emparejado.ts, pura): acá solo se escribe. Devuelve cuántas entraron.
 *
 * ⚠ Se escribe solo lo que cambió. Hasta el 2026-09-29 el botón «Actualizar lista desde Odoo» hacía una escritura por
 * cada cliente, cambiara o no: 88 idas y vueltas a la base para que casi siempre no pasara nada.
 */
async function recordarClientes(deOdoo: readonly PartnerOdoo[], conFacturas: ReadonlySet<number>): Promise<number> {
  const guardadas = await prisma.odooPartnerVinculo.findMany({
    where: { odooPartnerId: { not: null } },
    select: { odooPartnerId: true, odooPartnerNombre: true, odooVat: true, cuentaId: true, ignorado: true },
  });
  const { nuevas, renombradas } = cambiosDeLaLista(
    deOdoo,
    guardadas.flatMap((g) =>
      g.odooPartnerId === null
        ? []
        : [{ odooPartnerId: g.odooPartnerId, nombre: g.odooPartnerNombre, vat: g.odooVat, decidida: g.cuentaId !== null || g.ignorado }],
    ),
    conFacturas,
  );
  if (nuevas.length) {
    await prisma.odooPartnerVinculo.createMany({
      data: nuevas.map((p) => ({ odooPartnerId: p.odooPartnerId, odooPartnerNombre: p.nombre, odooVat: p.vat })),
      skipDuplicates: true,
    });
  }
  for (const p of renombradas) {
    /* El filtro se repite en la escritura: si alguien la vinculó mientras corría la copia, no se le pisa el nombre. */
    await prisma.odooPartnerVinculo.updateMany({
      where: { odooPartnerId: p.odooPartnerId, cuentaId: null, ignorado: false },
      data: { odooPartnerNombre: p.nombre, odooVat: p.vat },
    });
  }
  return nuevas.length;
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
      /* ⚠ Sobre las MAPEADAS, no sobre las crudas. `facturasVistas` cuenta lo que Odoo devolvió
         y `sinCuenta` solo lo que se pudo leer: restarlas inflaba el número exactamente en la
         cantidad de rechazadas, y ese número va a pantalla. */
      vinculadas: Math.max(0, res.espejadas - res.sinCuenta),
      rechazadas: res.rechazadas.length,
      detalleRechazos: res.rechazadas.length ? res.rechazadas.slice(0, 50).join(SALTO) : null,
      error: res.error,
      duracionMs: res.duracionMs,
    },
  });
}

/**
 * Cuándo empezó la última corrida BUENA del espejo. Es lo único que «Lo que no cuadra» le pide al
 * sync para no acusar en falso: lo facturado después, el espejo todavía no lo pudo ver.
 *
 * ⚠ `iniciadaEn` y no `terminadaEn`: la lectura de Odoo se hace al principio, así que un documento
 * emitido mientras la corrida escribía no entró.
 */
export async function ultimaCorridaOk(): Promise<Date | null> {
  const c = await prisma.syncOdooCorrida.findFirst({
    where: { ok: true },
    orderBy: { iniciadaEn: "desc" },
    select: { iniciadaEn: true },
  });
  return c?.iniciadaEn ?? null;
}

/**
 * Lo que la pantalla de cobranza necesita para decir «el espejo está al día» o no.
 *
 * ⚠ La ÚLTIMA corrida y la última BUENA son dos preguntas. Hasta el 2026-09-12 la pantalla solo
 * tenía la primera y decía «Espejo actualizado el 2-sep» con la fecha de una corrida que había
 * fallado, sobre una copia que llevaba diez días sin refrescarse.
 */
export async function ultimaCorrida(ahora: Date = new Date()): Promise<{
  iniciadaEn: string;
  terminadaEn: string | null;
  ok: boolean;
  parcial: boolean;
  error: string | null;
  facturasVistas: number;
  /** Las que además se pudieron LEER. `facturasVistas - espejadas` = rechazadas. */
  espejadas: number;
  creadas: number;
  actualizadas: number;
  desaparecidas: number;
  disparadaPor: string;
  /** Cuándo empezó la última corrida BUENA; null = nunca hubo una. */
  ultimaOkEn: string | null;
  /** Horas enteras desde la última corrida buena; null = nunca hubo una. */
  horasDesdeLaUltimaBuena: number | null;
  /** `espejoVencido()`: la misma regla que INV31. */
  vencido: boolean;
} | null> {
  const [c, ok] = await Promise.all([
    prisma.syncOdooCorrida.findFirst({ orderBy: { iniciadaEn: "desc" } }),
    ultimaCorridaOk(),
  ]);
  if (!c) return null;
  return {
    ultimaOkEn: ok?.toISOString() ?? null,
    horasDesdeLaUltimaBuena: ok ? Math.floor((ahora.getTime() - ok.getTime()) / 3_600_000) : null,
    vencido: espejoVencido(ok, ahora),
    iniciadaEn: c.iniciadaEn.toISOString(),
    terminadaEn: c.terminadaEn?.toISOString() ?? null,
    ok: c.ok,
    parcial: c.parcial,
    error: c.error,
    facturasVistas: c.facturasVistas,
    espejadas: c.facturasVistas - c.rechazadas,
    creadas: c.creadas,
    actualizadas: c.actualizadas,
    desaparecidas: c.desaparecidas,
    disparadaPor: c.disparadaPor,
  };
}
