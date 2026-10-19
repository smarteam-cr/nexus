/**
 * lib/cobranza/libro/hechos.ts — «Odoo y Mercury mandan» (etapa del plan «Un solo libro financiero», 2026-10-16). PURO.
 *
 * Decisión de Alex en la reunión del 16-oct: Odoo y Mercury son la verdad de lo facturado y lo cobrado, y Nexus
 * explica, cobra y proyecta. Este módulo decide, para cada cuota de Nexus, qué hecho de Odoo o de Mercury la alcanza:
 *
 *  · LA FACTURA SE PEGA SOLA. La cuota que tiene anotado el número de su factura se queda con esa. La que no lo tiene
 *    se queda con la factura de su misma cuenta, moneda y monto exacto, si es la única que calza y está cerca en la
 *    fecha. Si se pega, la cuota queda facturada con ese número (firma del sistema). Una cuota YA COBRADA también
 *    recibe su número, pero solo si la factura está pagada allá (2026-10-18): impaga es un choque y no se toca.
 *  · LO PAGADO ALLÁ SE COBRA ACÁ. Odoo: «pagada» o «en proceso de pago» (Alex: ya tiene la referencia y la fecha de
 *    la transferencia; conciliar contra el estado de cuenta es el segundo paso del contador). Mercury: «Paid». La fecha
 *    del cobro es la del pago real, nunca la del día en que corre esto.
 *    Desde el 2026-10-18 (decisión de Elías) lo pagado Y conciliado con el banco se cobra SOLO, cada día, firmado por
 *    el sistema (`sistema:odoo`, `sistema:mercury`): ver `paraCobrarSolo`. Lo que no es seguro (Odoo «en proceso de
 *    pago», una entrada de Mercury encontrada solo por el monto, un día del pago raro) sigue en «Lo pagado» para que lo
 *    confirme una persona, con su nombre.
 *  · LOS CHOQUES NO SE TOCAN. Cobrada en Nexus e impaga allá: no se revierte sola. Queda en «Lo que no cuadra» para que
 *    María José lo resuelva en Odoo o en Mercury (la recomendación aprobada el 16-oct).
 *
 * ⛔ Lo que este módulo NO hace: nunca saca una cuota de COBRADO, nunca cambia un monto, nunca pega una factura cuyo
 * monto no calza (eso es «monto distinto», una pregunta), nunca reparte una factura entre cuotas que no la anotaron.
 *
 * La regla del monto exacto es MÁS estricta que la de «Lo que no cuadra» (`cruzar`), a propósito: ahí un par dudoso se
 * muestra y una persona lo mira; acá se ESCRIBE. Medido el 2026-10-16: con la ventana de 180 días, Ferretería Noelito
 * de noviembre y diciembre se pegaban a dos facturas de junio por el mismo monto.
 */
import { cruzar, esDocumentoVivo, type CobroParaCruzar, type FacturaParaCruzar } from "@/lib/cobranza/odoo/diferencias";
import { entradasDeFacturasConDetalle, type EntradaParaCruzar, type FacturaMercuryParaCruzar } from "@/lib/cobranza/mercury/diferencias";
import { numeroDeMercury } from "@/lib/cobranza/mercury/espejo";
import { normalizarNumeroFactura, plataformaDelNumero } from "@/lib/cobranza/numero-factura";

/** Odoo: lo que cuenta como pagado (decisión 2 del 16-oct: «en proceso de pago» = pagado). */
export const PAGADA_EN_ODOO: readonly string[] = ["paid", "in_payment"];

/**
 * Días entre la fecha de la cuota y la de la factura para pegarla por monto. Una quincena larga a cada lado más el mes:
 * Odoo emite hasta 15 días después de lo que Nexus programa (medido el 2026-09-12, `DIAS_DE_GRACIA_DEL_ESPEJO`).
 */
export const VENTANA_POR_MONTO_DIAS = 45;

export type Fuente = "ODOO" | "MERCURY";

export interface CobroDelLibro extends CobroParaCruzar {
  /** Dónde se factura: la plataforma anotada en el cobro o, sin ella, la vía de la cuenta. */
  plataforma: string | null;
}

/** Una cuota con su factura, y cómo se encontró. */
export interface Pegado {
  fuente: Fuente;
  cobroId: string;
  facturaId: string;
  numero: string;
  /** `YYYY-MM-DD` de la factura. */
  fechaFactura: string;
  via: "numero" | "monto";
  /** Cuántas cuotas comparten esa factura (solo por número). */
  cuotas: number;
  pagada: boolean;
  impaga: boolean;
  /**
   * Pagada Y conciliada con el banco: en Odoo, `paid` (el contador la concilió con el estado de cuenta); en Mercury,
   * `Paid` (Mercury es el banco). «En proceso de pago» de Odoo está pagada pero no conciliada.
   */
  conciliada: boolean;
}

export interface EntradaDelLibro {
  cobros: readonly CobroDelLibro[];
  facturasOdoo: readonly FacturaParaCruzar[];
  facturasMercury: readonly FacturaMercuryParaCruzar[];
  /** mercuryCustomerId → cuentaId, solo los clientes emparejados y no ignorados. */
  cuentaDeClienteMercury: ReadonlyMap<string, string>;
  /** Las entradas de plata de Mercury, para saber qué día se pagó una factura. */
  entradasMercury: readonly EntradaParaCruzar[];
  /** `YYYY-MM-DD`: lo que corre hoy no pega cuotas de meses que todavía no llegan. */
  hoy: string;
}

const dias = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
const centavos = (n: number) => Math.round(n * 100);
const deLaPlataforma = (c: CobroDelLibro, p: Fuente) => (c.plataforma === p && !c.numeroFactura) || plataformaDelNumero(c.numeroFactura) === p;

/**
 * ¿Se puede pegar por monto sin adivinar? Que la cuota ya haya llegado, que la factura esté cerca, y que ninguna otra
 * factura libre esté tan cerca de la cuota ni otra cuota sin número tan cerca de la factura: dos candidatos igual de
 * buenos es una moneda al aire, y esto escribe. Las cuotas mensuales del mismo monto no se estorban: la de un mes antes
 * está a 30 días, la suya a 2.
 */
export function pegaPorMontoSinDudas(
  c: { id: string; cuentaId: string; moneda: string; monto: number; fechaProgramada: string; periodo: string },
  f: { id: string; fecha: string; cuentaId: string; moneda: string; monto: number },
  cuotasSinNumero: ReadonlyArray<{ id: string; cuentaId: string; moneda: string; monto: number; fechaProgramada: string }>,
  facturasLibres: ReadonlyArray<{ id: string; fecha: string; cuentaId: string; moneda: string; monto: number }>,
  hoy: string,
): boolean {
  if (c.periodo > hoy.slice(0, 7)) return false;
  const distancia = Math.abs(dias(f.fecha, c.fechaProgramada));
  if (distancia > VENTANA_POR_MONTO_DIAS) return false;
  const mismas = (x: { cuentaId: string; moneda: string; monto: number }) =>
    x.cuentaId === c.cuentaId && x.moneda === c.moneda && centavos(x.monto) === centavos(c.monto);
  const otraFactura = facturasLibres.some((x) => x.id !== f.id && mismas(x) && Math.abs(dias(x.fecha, c.fechaProgramada)) <= distancia);
  const otraCuota = cuotasSinNumero.some((x) => x.id !== c.id && mismas(x) && Math.abs(dias(f.fecha, x.fechaProgramada)) <= distancia);
  return !otraFactura && !otraCuota;
}

/** Odoo: el cruce de «Lo que no cuadra», recortado a lo que se puede escribir. */
export function pegarOdoo(e: EntradaDelLibro): Pegado[] {
  const cobros = e.cobros.filter((c) => deLaPlataforma(c, "ODOO"));
  const porId = new Map(cobros.map((c) => [c.id, c]));
  const facturas = new Map(e.facturasOdoo.map((f) => [f.id, f]));
  const cruce = cruzar(cobros, e.facturasOdoo);
  const esPorNumero = (cobroId: string, facturaId: string) => {
    const c = porId.get(cobroId)!;
    return !!c.numeroFactura && normalizarNumeroFactura(c.numeroFactura) === normalizarNumeroFactura(facturas.get(facturaId)!.numero);
  };
  /* Una factura que alguna cuota anotó por número ya tiene dueña, aunque el monto no calce. */
  const conDuena = new Set([
    ...cruce.pares.filter((p) => esPorNumero(p.cobroId, p.facturaId)).map((p) => p.facturaId),
    ...cruce.montosDistintos.filter((m) => m.porNumero).map((m) => m.facturaId),
  ]);
  const cuotasSinNumero = cobros.filter((c) => !c.numeroFactura);
  const facturasLibres = e.facturasOdoo
    .filter((f) => f.cuentaId && esDocumentoVivo(f) && !conDuena.has(f.id))
    .map((f) => ({ id: f.id, fecha: f.invoiceDate, cuentaId: f.cuentaId!, moneda: f.moneda, monto: f.montoNeto }));
  const out: Pegado[] = [];
  for (const p of cruce.pares) {
    const c = porId.get(p.cobroId)!;
    const f = facturas.get(p.facturaId)!;
    const porNumero = esPorNumero(p.cobroId, p.facturaId);
    if (!porNumero) {
      const libre = { id: f.id, fecha: f.invoiceDate, cuentaId: f.cuentaId!, moneda: f.moneda, monto: f.montoNeto };
      if (!pegaPorMontoSinDudas(c, libre, cuotasSinNumero, facturasLibres, e.hoy)) continue;
    }
    out.push({
      fuente: "ODOO",
      cobroId: c.id,
      facturaId: f.id,
      numero: f.numero,
      fechaFactura: f.invoiceDate,
      via: porNumero ? "numero" : "monto",
      cuotas: p.cuotas,
      pagada: PAGADA_EN_ODOO.includes(f.paymentState) && f.montoResidual <= 0.005,
      impaga: f.paymentState === "not_paid" || f.paymentState === "partial",
      conciliada: f.paymentState === "paid" && f.montoResidual <= 0.005,
    });
  }
  return out;
}

/** Mercury: primero por número (varias cuotas con el mismo número = una factura compartida), después por monto. */
export function pegarMercury(e: EntradaDelLibro): Pegado[] {
  const vivas = e.facturasMercury.filter((f) => f.estado !== "Cancelled");
  const conCuenta = vivas
    .map((f) => ({ f, cuentaId: e.cuentaDeClienteMercury.get(f.mercuryCustomerId) ?? null }))
    .filter((x): x is { f: FacturaMercuryParaCruzar; cuentaId: string } => x.cuentaId !== null);
  const porNumero = new Map(conCuenta.map((x) => [numeroDeMercury(x.f.numero), x]));
  const cobros = e.cobros.filter((c) => deLaPlataforma(c, "MERCURY"));
  /* Reservadas: toda factura cuyo número anota alguna cuota, de cualquier plataforma o estado. Pegar por monto una
     factura que ya es de otra cuota sería contar la misma plata dos veces. */
  const reservadas = new Set<string>();
  for (const c of e.cobros) {
    const x = c.numeroFactura ? porNumero.get(numeroDeMercury(c.numeroFactura)) : undefined;
    if (x) reservadas.add(x.f.id);
  }
  const estado = (f: FacturaMercuryParaCruzar) => ({
    pagada: f.estado === "Paid",
    impaga: f.estado === "Unpaid" || f.estado === "Processing",
    conciliada: f.estado === "Paid",
  });
  const out: Pegado[] = [];

  // 1 · Por número, en la misma cuenta; una compartida solo si sus cuotas suman la factura.
  const grupos = new Map<string, CobroDelLibro[]>();
  for (const c of cobros) {
    if (!c.numeroFactura) continue;
    const x = porNumero.get(numeroDeMercury(c.numeroFactura));
    if (!x || x.cuentaId !== c.cuentaId || x.f.moneda !== c.moneda) continue;
    grupos.set(x.f.id, [...(grupos.get(x.f.id) ?? []), c]);
  }
  for (const [facturaId, cs] of grupos) {
    const x = conCuenta.find((y) => y.f.id === facturaId)!;
    if (centavos(cs.reduce((n, c) => n + c.monto, 0)) !== centavos(x.f.monto)) continue;
    for (const c of cs) {
      out.push({ fuente: "MERCURY", cobroId: c.id, facturaId, numero: x.f.numero, fechaFactura: x.f.invoiceDate, via: "numero", cuotas: cs.length, ...estado(x.f) });
    }
  }

  // 2 · Por monto exacto, sin dudas.
  const cuotasLibres = cobros.filter((c) => !c.numeroFactura);
  const facturasLibres = conCuenta
    .filter((x) => !reservadas.has(x.f.id))
    .map((x) => ({ id: x.f.id, fecha: x.f.invoiceDate, cuentaId: x.cuentaId, moneda: x.f.moneda, monto: x.f.monto }));
  const usadas = new Set<string>();
  for (const c of [...cuotasLibres].sort((a, b) => a.fechaProgramada.localeCompare(b.fechaProgramada) || a.id.localeCompare(b.id))) {
    const candidatas = facturasLibres.filter(
      (f) => !usadas.has(f.id) && f.cuentaId === c.cuentaId && f.moneda === c.moneda && centavos(f.monto) === centavos(c.monto),
    );
    const f = candidatas.sort((a, b) => Math.abs(dias(a.fecha, c.fechaProgramada)) - Math.abs(dias(b.fecha, c.fechaProgramada)) || a.id.localeCompare(b.id))[0];
    if (!f) continue;
    if (!pegaPorMontoSinDudas(c, f, cuotasLibres, facturasLibres, e.hoy)) continue;
    usadas.add(f.id);
    const x = conCuenta.find((y) => y.f.id === f.id)!;
    out.push({ fuente: "MERCURY", cobroId: c.id, facturaId: f.id, numero: x.f.numero, fechaFactura: x.f.invoiceDate, via: "monto", cuotas: 1, ...estado(x.f) });
  }
  return out;
}

/** Lo que hay que escribirle a una cuota. Cada campo ausente = no se toca. */
export interface Accion {
  fuente: Fuente;
  cobroId: string;
  numero: string;
  /** Marcar facturado con la fecha de la factura (la cuota todavía no lo estaba). */
  fechaEmision?: string;
  /** Anotar el número (la cuota no lo tenía). */
  numeroFactura?: string;
  /**
   * Pasar a cobrado, con el día del pago. `porQueNoSolo`: por qué este cobro NO se cobra solo cada día y espera a que
   * lo confirme una persona en «Lo pagado» (null = es seguro: pagado, conciliado con el banco y con un día del pago que
   * cuadra). Lo decide `dudaDelCobro`.
   */
  cobrar?: { fechaCobro: string; deDonde: string; porQueNoSolo: string | null };
  /**
   * La cuota ya estaba cobrada en Nexus y su factura está pagada allá: solo le falta el número (o la fecha de la
   * factura). Nunca lleva `cobrar`. Si al escribir ya no está cobrada, no se toca: alguien la sacó de Cobrado.
   */
  yaCobrada?: true;
}

/** Días que una entrada de plata puede ir ANTES de su factura (la misma regla de `entradasDeFacturas`). */
const DIAS_ANTES_DE_LA_FACTURA = 3;

/**
 * Por qué un pago no es seguro para cobrarse solo, o null si lo es (2026-10-18). Las cuatro dudas, en este orden:
 *  · Odoo «en proceso de pago»: el asistente registró el depósito, pero el contador todavía no lo concilió con el banco.
 *  · Mercury, la entrada de plata se ató a la factura solo por el monto: el nombre de quien pagó no se parece al cliente.
 *  · El día del pago es posterior a hoy: no pasó todavía.
 *  · El día del pago es muy anterior a la factura: un anticipo o un pago mal conciliado; lo mira una persona.
 */
export function dudaDelCobro(
  p: { fuente: Fuente; conciliada: boolean; fechaFactura: string },
  fechaCobro: string,
  hoy: string,
  mercuryPorNombre: boolean,
): string | null {
  if (p.fuente === "ODOO" && !p.conciliada) return "Odoo la da «en proceso de pago»: todavía no está conciliada con el banco.";
  if (p.fuente === "MERCURY" && !mercuryPorNombre) return "La entrada de plata en Mercury se encontró solo por el monto, no por el nombre de quien pagó.";
  if (fechaCobro > hoy) return `El día del pago (${fechaCobro}) es posterior a hoy.`;
  if (dias(p.fechaFactura, fechaCobro) > DIAS_ANTES_DE_LA_FACTURA) return `El día del pago (${fechaCobro}) es anterior a la factura (${p.fechaFactura}).`;
  return null;
}

export interface Decision {
  acciones: Accion[];
  /** Pagadas allá sin el día del pago: no se cobran hasta tenerlo (la fecha decide el mes del gráfico). */
  pagadasSinFecha: Pegado[];
  /** Cobradas en Nexus e impagas allá: no se tocan. Las muestra «Lo que no cuadra». */
  choques: Pegado[];
}

/**
 * Qué escribir. `fechasDePagoOdoo` (facturaId → `YYYY-MM-DD`) la arma quien habla con Odoo: el día del movimiento del
 * banco con que se concilió. Para Mercury el día sale de su entrada de plata; si no se encuentra, la factura va a
 * `pagadasSinFecha` (no se cobra con una fecha aproximada).
 */
export function decidir(e: EntradaDelLibro, pegados: readonly Pegado[], fechasDePagoOdoo: ReadonlyMap<string, string>): Decision {
  const cobros = new Map(e.cobros.map((c) => [c.id, c]));
  const entradas = entradasDeFacturasConDetalle(e.facturasMercury, e.entradasMercury);
  const out: Decision = { acciones: [], pagadasSinFecha: [], choques: [] };
  for (const p of pegados) {
    const c = cobros.get(p.cobroId);
    if (!c) continue;
    if (c.estado === "COBRADO") {
      if (p.impaga) {
        out.choques.push(p);
      } else if (p.pagada && (!c.numeroFactura || !c.fechaEmision)) {
        /* Cobrada acá y pagada allá: los dos dicen lo mismo, así que la cuota recibe el número de su factura (2026-10-18,
           prueba 36). Antes se saltaba y una cuota cobrada nunca recibía su número: Corrugando 0221, Servica 0268.
           ⛔ Con la factura impaga NO: es un choque, y anotarle el número fijaría un pareo por monto que puede ser de
           otra factura (Juanva 0197 y 0230, con dos facturas de diciembre del mismo monto). */
        const a: Accion = { fuente: p.fuente, cobroId: c.id, numero: p.numero, yaCobrada: true };
        if (!c.fechaEmision) a.fechaEmision = p.fechaFactura;
        if (!c.numeroFactura) a.numeroFactura = p.numero;
        out.acciones.push(a);
      }
      continue;
    }
    const a: Accion = { fuente: p.fuente, cobroId: c.id, numero: p.numero };
    if (!c.fechaEmision) a.fechaEmision = p.fechaFactura;
    if (!c.numeroFactura) a.numeroFactura = p.numero;
    if (p.pagada) {
      let fecha: string | null = null;
      let deDonde = "";
      let porNombre = false;
      if (p.fuente === "ODOO") {
        fecha = fechasDePagoOdoo.get(p.facturaId) ?? null;
        deDonde = "el pago con que Odoo concilió la factura";
      } else {
        // ⚠ Sin la entrada de plata no hay día del pago: el día en que la factura cambió en Mercury es una aproximación
        // y DECISIONS prohíbe aproximar la fecha de pago (decide el mes del gráfico). Va a `pagadasSinFecha`.
        const x = entradas.get(p.facturaId);
        fecha = x?.entrada.fecha ?? null;
        porNombre = x?.porNombre ?? false;
        deDonde = "la entrada de plata en Mercury";
      }
      if (!fecha) {
        out.pagadasSinFecha.push(p);
      } else {
        a.cobrar = { fechaCobro: fecha, deDonde, porQueNoSolo: dudaDelCobro(p, fecha, e.hoy, porNombre) };
      }
    }
    if (a.fechaEmision || a.numeroFactura || a.cobrar) out.acciones.push(a);
  }
  return out;
}

/* ── Lo que se cobra solo (2026-10-18, decisión de Elías: «cobrar sin firma, cada día y solo») ───────────────────── */

export interface CobroSolo {
  /** Lo que se escribe solo: cobrar, y pegar la factura si la cuota no la tenía. */
  acciones: Accion[];
  /** Lo pagado que NO se cobra solo, con el porqué. Espera en «Lo pagado» a que lo confirme una persona. */
  quedan: Array<{ accion: Accion; motivo: string }>;
}

/**
 * De lo decidido, lo que el job diario cobra sin una persona. Entra SOLO lo que tiene `cobrar` sin dudas
 * (`dudaDelCobro`). Lo que solo se pega a su factura no lo toca el job: eso lo confirma quien concilia.
 *
 * `retiradas`: cuotas que una persona sacó de Cobrado alguna vez. El job no las vuelve a cobrar aunque Odoo o Mercury
 * sigan diciendo «pagada»: si alguien dijo que no entró, manda lo que dijo (se cobran a mano en «Lo pagado»).
 * ⛔ Nunca entra lo de `pagadasSinFecha` ni un choque: `decidir` no les pone `cobrar`.
 */
export function paraCobrarSolo(acciones: readonly Accion[], retiradas: ReadonlySet<string>): CobroSolo {
  const out: CobroSolo = { acciones: [], quedan: [] };
  for (const a of acciones) {
    if (!a.cobrar) continue;
    if (retiradas.has(a.cobroId)) {
      out.quedan.push({ accion: a, motivo: "Una persona la sacó de Cobrado: el sistema no la vuelve a cobrar sola." });
    } else if (a.cobrar.porQueNoSolo) {
      out.quedan.push({ accion: a, motivo: a.cobrar.porQueNoSolo });
    } else {
      out.acciones.push(a);
    }
  }
  return out;
}

/** Las facturas de Odoo pagadas cuya cuota hay que cobrar: las únicas a las que hay que pedirles el día del pago. */
export function facturasOdooParaFechar(e: EntradaDelLibro, pegados: readonly Pegado[]): string[] {
  const cobros = new Map(e.cobros.map((c) => [c.id, c]));
  return [...new Set(pegados.filter((p) => p.fuente === "ODOO" && p.pagada && cobros.get(p.cobroId)?.estado !== "COBRADO").map((p) => p.facturaId))];
}

/* ── Lo que eligió quien confirma (la pantalla de cada mañana, 2026-10-17) ─────────────────────────────────────── */

/**
 * Lo que la persona vio y marcó en la lista: qué cuotas pegar a su factura y cuáles cobrar, cada una con el día del pago
 * que se le mostró. El servidor vuelve a decidir todo antes de escribir y aplica SOLO la intersección: lo que no está acá
 * no se toca, aunque la lista nueva lo traiga.
 */
export interface SeleccionDelLibro {
  pegar: readonly string[];
  cobrar: ReadonlyArray<{ cobroId: string; fechaCobro: string }>;
}

export interface AccionesElegidas {
  acciones: Accion[];
  /** Lo marcado que ya no se puede aplicar como se vio, con el porqué. No se escribe. */
  cambiaron: Array<{ cobroId: string; motivo: string }>;
}

/**
 * Recorta la decisión de hoy a lo que la persona marcó.
 *
 *  · Cobrar una cuota también la pega a su factura: es la misma factura, y una cuota cobrada sin factura no se puede
 *    explicar después.
 *  · ⚠ Si el día del pago cambió desde que se mostró la lista (Odoo concilió con otro movimiento, Mercury cambió la
 *    entrada), esa cuota NO se cobra: la fecha decide el mes del gráfico y la persona firmó otra. Se pega igual.
 *  · Lo marcado que ya no está en la decisión (alguien la cobró a mano, la factura dejó de estar pagada) se informa.
 */
export function accionesElegidas(acciones: readonly Accion[], sel: SeleccionDelLibro): AccionesElegidas {
  const pegar = new Set(sel.pegar);
  const cobrar = new Map(sel.cobrar.map((c) => [c.cobroId, c.fechaCobro]));
  const porId = new Map(acciones.map((a) => [a.cobroId, a]));
  const out: AccionesElegidas = { acciones: [], cambiaron: [] };
  for (const id of new Set([...pegar, ...cobrar.keys()])) {
    if (!porId.has(id)) out.cambiaron.push({ cobroId: id, motivo: "ya no está en la lista: alguien la tocó o la factura cambió" });
  }
  for (const a of acciones) {
    const quiereCobrar = cobrar.has(a.cobroId);
    const quierePegar = pegar.has(a.cobroId) || quiereCobrar;
    if (!quierePegar) continue;
    const elegida: Accion = { fuente: a.fuente, cobroId: a.cobroId, numero: a.numero };
    if (a.fechaEmision) elegida.fechaEmision = a.fechaEmision;
    if (a.numeroFactura) elegida.numeroFactura = a.numeroFactura;
    if (a.yaCobrada) elegida.yaCobrada = true;
    if (quiereCobrar) {
      const vista = cobrar.get(a.cobroId)!;
      if (!a.cobrar) out.cambiaron.push({ cobroId: a.cobroId, motivo: "ya no figura pagada allá: no se cobró" });
      else if (a.cobrar.fechaCobro !== vista) {
        out.cambiaron.push({ cobroId: a.cobroId, motivo: `el día del pago cambió (se vio el ${vista}, hoy dice el ${a.cobrar.fechaCobro}): no se cobró` });
      } else elegida.cobrar = a.cobrar;
    }
    if (elegida.fechaEmision || elegida.numeroFactura || elegida.cobrar) out.acciones.push(elegida);
  }
  return out;
}
