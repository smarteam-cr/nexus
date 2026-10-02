/**
 * lib/cobranza/mercury/sync.ts
 *
 * La copia de Mercury: trae sus facturas, sus clientes y los movimientos de sus cuentas y los deja en Nexus. Mismo
 * molde que la copia de Odoo (lib/cobranza/odoo/sync.ts), con las mismas promesas:
 *
 * ⛔ Solo lectura hacia Mercury, siempre: el token no puede escribir.
 * ⛔ No toca ningún `Cobro`. Lo que no cuadra se DETECTA aparte (diferencias.ts) y lo resuelve una persona.
 * - Cada corrida abre su fila en `SyncMercuryCorrida` y la cierra pase lo que pase: una abierta hace horas ES el
 *   hallazgo (el proceso murió a mitad).
 * - Una sola copia a la vez (candado en `CronJobState`, el de Odoo es el molde).
 * - Se lee TODO antes de escribir nada: si Mercury no contesta, no queda una copia a medias.
 * - Una lectura con menos de la mitad de lo conocido no copia nada; nunca se borra una fila.
 *
 * Sin `server-only`, como la de Odoo: la corre el scheduler y un script.
 */
import { prisma } from "@/lib/db/prisma";
import { configDesdeEntorno, crearTransporteHttp } from "./transporte-http";
import { MercuryError, MOVIMIENTOS_DESDE, explicarFallo, type MercuryFalloClase, type MercuryTransport } from "./transporte";
import {
  esBorradoMasivo,
  esCorridaParcial,
  espejoVencido,
  facturaCambio,
  mapearCliente,
  mapearFactura,
  mapearMovimiento,
  movimientoCambio,
  type ClienteDeMercury,
  type FacturaDeMercury,
  type MovimientoDeMercury,
} from "./espejo";

export interface ResultadoSyncMercury {
  corridaId: string;
  ok: boolean;
  parcial: boolean;
  facturasVistas: number;
  clientesVistos: number;
  movimientosVistos: number;
  creadas: number;
  actualizadas: number;
  desaparecidas: number;
  clientesNuevos: number;
  movimientosNuevos: number;
  rechazadas: string[];
  error: string | null;
  clase: MercuryFalloClase | null;
  duracionMs: number;
  /** true = otra copia estaba corriendo: esta no leyó ni escribió nada, y no dejó fila. */
  enCurso?: boolean;
}

export interface OpcionesDeCopiaMercury {
  disparadaPor: string;
  transporte?: MercuryTransport;
  /** Cuánto se espera cada respuesta: corto cuando la pide una persona con el botón. */
  esperaMs?: number;
}

const CANDADO = "mercury-espejo-candado";
const CANDADO_VENCE_MS = 10 * 60 * 1000;

async function tomarCandado(ahora: Date): Promise<boolean> {
  await prisma.cronJobState.createMany({ data: [{ id: CANDADO }], skipDuplicates: true });
  const tomado = await prisma.cronJobState.updateMany({
    where: { id: CANDADO, OR: [{ lastRunAt: null }, { lastRunAt: { lt: new Date(ahora.getTime() - CANDADO_VENCE_MS) } }] },
    data: { lastRunAt: ahora },
  });
  return tomado.count === 1;
}

/** ⛔ Nunca lanza: corre en un `finally`. */
async function soltarCandado(): Promise<void> {
  await prisma.cronJobState.updateMany({ where: { id: CANDADO }, data: { lastRunAt: null } }).catch(() => {});
}

function vacio(corridaId: string): ResultadoSyncMercury {
  return {
    corridaId,
    ok: false,
    parcial: false,
    facturasVistas: 0,
    clientesVistos: 0,
    movimientosVistos: 0,
    creadas: 0,
    actualizadas: 0,
    desaparecidas: 0,
    clientesNuevos: 0,
    movimientosNuevos: 0,
    rechazadas: [],
    error: null,
    clase: null,
    duracionMs: 0,
  };
}

export async function sincronizarMercury(opts: OpcionesDeCopiaMercury): Promise<ResultadoSyncMercury> {
  if (!(await tomarCandado(new Date()))) {
    return { ...vacio(""), enCurso: true, error: "Ya hay una copia de Mercury en curso." };
  }
  try {
    return await copiar(opts);
  } finally {
    await soltarCandado();
  }
}

const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const isoDia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

async function copiar(opts: OpcionesDeCopiaMercury): Promise<ResultadoSyncMercury> {
  const t0 = Date.now();
  const corrida = await prisma.syncMercuryCorrida.create({ data: { disparadaPor: opts.disparadaPor }, select: { id: true } });
  const res = vacio(corrida.id);
  try {
    const t = opts.transporte ?? crearTransporteHttp({ ...configDesdeEntorno(), ...(opts.esperaMs ? { timeoutMs: opts.esperaMs } : {}) });

    /* ── 1. Leer todo antes de escribir nada ─────────────────────────────────────── */
    const [crudasF, crudosC, crudosM] = await Promise.all([t.facturas(), t.clientes(), t.movimientos(MOVIMIENTOS_DESDE)]);
    res.facturasVistas = crudasF.length;
    res.clientesVistos = crudosC.length;
    res.movimientosVistos = crudosM.length;

    const facturas: FacturaDeMercury[] = [];
    for (const c of crudasF) {
      const r = mapearFactura(c);
      if ("rechazo" in r) res.rechazadas.push(r.rechazo);
      else facturas.push(r.factura);
    }
    const clientes = crudosC.flatMap((c) => mapearCliente(c) ?? []);
    const movimientos = crudosM.flatMap((c) => mapearMovimiento(c) ?? []);

    const [conocidasF, conocidosC] = await Promise.all([
      prisma.facturaMercury.count({ where: { estadoEspejo: "VIGENTE" } }),
      prisma.clienteMercury.count({ where: { estadoEspejo: "VIGENTE" } }),
    ]);
    res.parcial = esCorridaParcial(facturas.length, conocidasF) || esCorridaParcial(clientes.length, conocidosC);
    if (res.parcial) {
      res.error = `La lectura trajo ${facturas.length} facturas y ${clientes.length} clientes contra ${conocidasF} y ${conocidosC} conocidos (menos de la mitad): no se copió nada.`;
      return res;
    }

    const ahora = new Date();
    const nombreDe = new Map(clientes.map((c) => [c.mercuryCustomerId, c.nombre]));

    /* ── 2. Los clientes primero: las facturas nombran a su cliente ──────────────── */
    res.clientesNuevos = await copiarClientes(clientes, ahora);

    /* ── 3. Las facturas ─────────────────────────────────────────────────────────── */
    const previas = await prisma.facturaMercury.findMany({
      select: {
        id: true,
        mercuryInvoiceId: true,
        numero: true,
        invoiceDate: true,
        dueDate: true,
        monto: true,
        moneda: true,
        estado: true,
        mercuryCustomerId: true,
        canceladaEn: true,
        actualizadaEnMercury: true,
        estadoEspejo: true,
      },
    });
    const previaDe = new Map(previas.map((p) => [p.mercuryInvoiceId, p]));
    const sinCambio: string[] = [];
    const nuevas: FacturaDeMercury[] = [];
    for (const f of facturas) {
      const datos = {
        numero: f.numero,
        invoiceDate: dia(f.invoiceDate),
        dueDate: f.dueDate ? dia(f.dueDate) : null,
        monto: f.monto,
        moneda: f.moneda,
        estado: f.estado,
        mercuryCustomerId: f.mercuryCustomerId,
        clienteNombre: nombreDe.get(f.mercuryCustomerId) ?? "(cliente que Mercury ya no devuelve)",
        canceladaEn: f.canceladaEn ? new Date(f.canceladaEn) : null,
        creadaEnMercury: new Date(f.creadaEnMercury),
        actualizadaEnMercury: new Date(f.actualizadaEnMercury),
        estadoEspejo: "VIGENTE",
        sincronizadoEn: ahora,
      };
      const p = previaDe.get(f.mercuryInvoiceId);
      if (!p) {
        nuevas.push(f);
        continue;
      }
      const cambio = facturaCambio(
        {
          numero: p.numero,
          invoiceDate: isoDia(p.invoiceDate)!,
          dueDate: isoDia(p.dueDate),
          monto: Number(p.monto),
          moneda: p.moneda,
          estado: p.estado,
          mercuryCustomerId: p.mercuryCustomerId,
          canceladaEn: p.canceladaEn?.toISOString() ?? null,
          actualizadaEnMercury: p.actualizadaEnMercury.toISOString(),
          estadoEspejo: p.estadoEspejo,
        },
        f,
      );
      if (!cambio) {
        sinCambio.push(p.id);
        continue;
      }
      await prisma.facturaMercury.update({ where: { id: p.id }, data: datos });
      res.actualizadas++;
    }
    if (nuevas.length) {
      const r = await prisma.facturaMercury.createMany({
        data: nuevas.map((f) => ({
          mercuryInvoiceId: f.mercuryInvoiceId,
          numero: f.numero,
          invoiceDate: dia(f.invoiceDate),
          dueDate: f.dueDate ? dia(f.dueDate) : null,
          monto: f.monto,
          moneda: f.moneda,
          estado: f.estado,
          mercuryCustomerId: f.mercuryCustomerId,
          clienteNombre: nombreDe.get(f.mercuryCustomerId) ?? "(cliente que Mercury ya no devuelve)",
          canceladaEn: f.canceladaEn ? new Date(f.canceladaEn) : null,
          creadaEnMercury: new Date(f.creadaEnMercury),
          actualizadaEnMercury: new Date(f.actualizadaEnMercury),
          sincronizadoEn: ahora,
        })),
        skipDuplicates: true,
      });
      res.creadas = r.count;
    }
    if (sinCambio.length) await prisma.facturaMercury.updateMany({ where: { id: { in: sinCambio } }, data: { sincronizadoEn: ahora } });

    /* ⛔ Nunca se borra: se marca. De las CRUDAS, no de las leídas: una que Mercury devuelve y no se pudo leer no
       desapareció (la lección del espejo de Odoo). */
    const vistas = crudasF.map((c) => String(c.id ?? "")).filter(Boolean);
    const desaparecidas = await prisma.facturaMercury.findMany({
      where: { estadoEspejo: "VIGENTE", mercuryInvoiceId: { notIn: vistas } },
      select: { id: true },
    });
    if (esBorradoMasivo(desaparecidas.length, conocidasF)) {
      res.error = `${desaparecidas.length} facturas dejaron de venir de golpe (de ${conocidasF} conocidas): no parece un borrado, no se marcó ninguna.`;
      res.clase = "PROTOCOLO";
      return res;
    }
    if (desaparecidas.length) {
      const r = await prisma.facturaMercury.updateMany({
        where: { id: { in: desaparecidas.map((d) => d.id) } },
        data: { estadoEspejo: "DESAPARECIDA" },
      });
      res.desaparecidas = r.count;
    }

    /* ── 4. Los movimientos: altas y cambios (un movimiento no desaparece: cambia de estado) ── */
    res.movimientosNuevos = await copiarMovimientos(movimientos, ahora);

    res.ok = true;
  } catch (e) {
    res.error = e instanceof MercuryError ? `${explicarFallo(e.clase)} | ${e.message}` : e instanceof Error ? e.message : String(e);
    res.clase = e instanceof MercuryError ? e.clase : "PROTOCOLO";
  } finally {
    await cerrar(corrida.id, res, t0);
  }
  return res;
}

/**
 * Deja la lista de clientes como Mercury la tiene: altas, y nombre/correo/país al día. ⛔ No toca el emparejado
 * (`cuentaId`, `ignorado`): eso es de una persona. El que deja de venir queda DESAPARECIDO, con su emparejado intacto.
 */
async function copiarClientes(clientes: readonly ClienteDeMercury[], ahora: Date): Promise<number> {
  const guardados = await prisma.clienteMercury.findMany({
    select: { id: true, mercuryCustomerId: true, nombre: true, correo: true, pais: true, estadoEspejo: true },
  });
  const guardadoDe = new Map(guardados.map((g) => [g.mercuryCustomerId, g]));
  const nuevos = clientes.filter((c) => !guardadoDe.has(c.mercuryCustomerId));
  if (nuevos.length) {
    await prisma.clienteMercury.createMany({
      data: nuevos.map((c) => ({ mercuryCustomerId: c.mercuryCustomerId, nombre: c.nombre, correo: c.correo, pais: c.pais, sincronizadoEn: ahora })),
      skipDuplicates: true,
    });
  }
  const sinCambio: string[] = [];
  for (const c of clientes) {
    const g = guardadoDe.get(c.mercuryCustomerId);
    if (!g) continue;
    if (g.nombre === c.nombre && g.correo === c.correo && g.pais === c.pais && g.estadoEspejo === "VIGENTE") {
      sinCambio.push(g.id);
      continue;
    }
    await prisma.clienteMercury.update({
      where: { id: g.id },
      data: { nombre: c.nombre, correo: c.correo, pais: c.pais, estadoEspejo: "VIGENTE", sincronizadoEn: ahora },
    });
  }
  if (sinCambio.length) await prisma.clienteMercury.updateMany({ where: { id: { in: sinCambio } }, data: { sincronizadoEn: ahora } });
  const vistos = clientes.map((c) => c.mercuryCustomerId);
  const idos = guardados.filter((g) => g.estadoEspejo === "VIGENTE" && !vistos.includes(g.mercuryCustomerId));
  if (idos.length && !esBorradoMasivo(idos.length, guardados.length)) {
    await prisma.clienteMercury.updateMany({ where: { id: { in: idos.map((g) => g.id) } }, data: { estadoEspejo: "DESAPARECIDA" } });
  }
  return nuevos.length;
}

async function copiarMovimientos(movimientos: readonly MovimientoDeMercury[], ahora: Date): Promise<number> {
  const previos = await prisma.movimientoMercury.findMany({
    where: { mercuryTransactionId: { in: movimientos.map((m) => m.mercuryTransactionId) } },
    select: { id: true, mercuryTransactionId: true, monto: true, estado: true, posteadoEn: true, contraparteNombre: true, nota: true, memoExterno: true },
  });
  const previoDe = new Map(previos.map((p) => [p.mercuryTransactionId, p]));
  const datosDe = (m: MovimientoDeMercury) => ({
    mercuryAccountId: m.mercuryAccountId,
    monto: m.monto,
    estado: m.estado,
    tipo: m.tipo,
    contraparteNombre: m.contraparteNombre,
    contraparteId: m.contraparteId,
    descripcionBanco: m.descripcionBanco,
    nota: m.nota,
    memoExterno: m.memoExterno,
    conTarjeta: m.conTarjeta,
    creadoEnMercury: new Date(m.creadoEnMercury),
    posteadoEn: m.posteadoEn ? new Date(m.posteadoEn) : null,
    sincronizadoEn: ahora,
  });
  const nuevos = movimientos.filter((m) => !previoDe.has(m.mercuryTransactionId));
  if (nuevos.length) {
    await prisma.movimientoMercury.createMany({
      data: nuevos.map((m) => ({ mercuryTransactionId: m.mercuryTransactionId, ...datosDe(m) })),
      skipDuplicates: true,
    });
  }
  for (const m of movimientos) {
    const p = previoDe.get(m.mercuryTransactionId);
    if (!p) continue;
    const cambio = movimientoCambio(
      {
        monto: Number(p.monto),
        estado: p.estado,
        posteadoEn: p.posteadoEn?.toISOString() ?? null,
        contraparteNombre: p.contraparteNombre,
        nota: p.nota,
        memoExterno: p.memoExterno,
      },
      m,
    );
    if (cambio) await prisma.movimientoMercury.update({ where: { id: p.id }, data: datosDe(m) });
  }
  return nuevos.length;
}

async function cerrar(corridaId: string, res: ResultadoSyncMercury, t0: number): Promise<void> {
  res.duracionMs = Date.now() - t0;
  await prisma.syncMercuryCorrida.update({
    where: { id: corridaId },
    data: {
      terminadaEn: new Date(),
      ok: res.ok,
      parcial: res.parcial,
      facturasVistas: res.facturasVistas,
      clientesVistos: res.clientesVistos,
      movimientosVistos: res.movimientosVistos,
      creadas: res.creadas,
      actualizadas: res.actualizadas,
      desaparecidas: res.desaparecidas,
      clientesNuevos: res.clientesNuevos,
      error: res.rechazadas.length
        ? [res.error, `${res.rechazadas.length} facturas no se pudieron leer: ${res.rechazadas.slice(0, 20).join("; ")}`].filter(Boolean).join(" | ")
        : res.error,
      duracionMs: res.duracionMs,
    },
  });
}

/** Cuándo empezó la última copia BUENA: lo emitido después, la copia todavía no lo vio. */
export async function ultimaCorridaOkMercury(): Promise<Date | null> {
  const c = await prisma.syncMercuryCorrida.findFirst({ where: { ok: true }, orderBy: { iniciadaEn: "desc" }, select: { iniciadaEn: true } });
  return c?.iniciadaEn ?? null;
}

/** La línea de «de cuándo es la copia», con la misma forma que la de Odoo para que la pantalla sea la misma. */
export async function ultimaCorridaMercury(ahora: Date = new Date()): Promise<{
  iniciadaEn: string;
  terminadaEn: string | null;
  ok: boolean;
  parcial: boolean;
  error: string | null;
  ultimaOkEn: string | null;
  horasDesdeLaUltimaBuena: number | null;
  vencido: boolean;
} | null> {
  const [c, ok] = await Promise.all([prisma.syncMercuryCorrida.findFirst({ orderBy: { iniciadaEn: "desc" } }), ultimaCorridaOkMercury()]);
  if (!c) return null;
  return {
    iniciadaEn: c.iniciadaEn.toISOString(),
    terminadaEn: c.terminadaEn?.toISOString() ?? null,
    ok: c.ok,
    parcial: c.parcial,
    error: c.error,
    ultimaOkEn: ok?.toISOString() ?? null,
    horasDesdeLaUltimaBuena: ok ? Math.floor((ahora.getTime() - ok.getTime()) / 3_600_000) : null,
    vencido: espejoVencido(ok, ahora),
  };
}
