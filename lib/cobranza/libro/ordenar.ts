/**
 * lib/cobranza/libro/ordenar.ts — lo que Nexus ordena solo en «Lo que no cuadra» (2026-10-22). PURO.
 *
 * Pedido de Elías (2026-10-21, revisando Conciliación): «¿no debería Nexus limpiarse solo con lo que traen Odoo y
 * Mercury?». El simulacro de ese día, en solo lectura, midió que 35 de las 156 filas eran papeles que se ordenan sin
 * adivinar y sin mover plata: cuotas sin el número de su factura. Estas son las tres reglas que pasaron:
 *
 *  · NUMERO_DE_MERCURY. Una cuota sin número de Mercury y UNA factura de Mercury de su cuenta, misma moneda, el mismo
 *    monto con hasta US$1 de diferencia y a 60 días o menos. Se exige que la factura sea la más cercana a la cuota Y la
 *    cuota la más cercana a la factura, sin empate: las cuotas mensuales iguales (ACCCSA, Noelito) se ordenan solas
 *    porque cada una está a días de la suya y a un mes de las demás. Si difiere en centavos, la cuota toma el monto de
 *    la factura (ACCCSA 712 → 712,50, el pedido de Alex del 2026-10-05).
 *  · VARIAS_CUOTAS. Una factura (Odoo o Mercury) que ninguna cuota anotó y que suma EXACTO entre 2 y 5 cuotas libres de
 *    su cuenta, de hasta 6 meses antes a 1 después. Solo si hay UNA combinación y ninguna de sus cuotas calza también
 *    con otra factura: Fundauna FAC/2026/0359 calza con 4 combinaciones porque septiembre y octubre tienen los mismos
 *    montos, y elegir ahí es adivinar qué mes se cobró.
 *  · FACTURA_REEMPLAZADA. La cuota anota un número de Odoo que ya no está vigente (revertida o que la copia no tiene) y
 *    la cuenta tiene UNA factura vigente libre por el mismo monto, hasta 90 días después (Honda, 0347 → 0348).
 *
 * ⛔ NUNCA MUEVE PLATA. Una orden solo vale si después nada cambia de estado: factura pagada allá ⇒ todas sus cuotas ya
 * cobradas acá; factura sin pagar ⇒ ninguna cobrada (eso sería un choque, y los choques no se tocan: hechos.ts). Una
 * factura pagada en parte, o en otro estado, no se ordena. Lo que no pasa queda en `dudosas`, para una persona.
 * ⛔ Nunca marca facturada una cuota sin cobrar: solo anota el número en las que ya lo están. Una cobrada sin fecha de
 * emisión recibe la de la factura, como hace el libro al pegar.
 * ⛔ Lo que una persona deshizo no se vuelve a ordenar (`deshechas`: `cobroId|número`).
 *
 * Etapa 1 del diagnóstico del 22 oct (tres casos que quedaban para una persona sin necesitarla):
 *  · La factura reemplazada mira JUNTAS las cuotas que anotan el mismo número muerto: Fundauna anotaba la 0357
 *    (₡5.413.604, revertida con la NC/2026/0024) en sus dos cuotas de septiembre, y la 0359 que la reemplazó el mismo día
 *    es la suma exacta de las dos. Se mira antes que «varias cuotas», porque el número anulado es evidencia.
 *  · Las cuotas GEMELAS (misma cuenta, moneda, monto, mes, estado y fechas) no son una duda: cambiar una por otra no
 *    cambia nada. Teamnet tiene dos cuotas de agosto de US$2.000 y dos facturas iguales del 11 sep.
 *  · Una factura partida en cuotas puede diferir por redondeo, hasta US$1, si no hay ninguna combinación exacta:
 *    PRIMO 3 × 1.666,67 = 5.000,01 contra INV-31 por 5.000. Los montos no se tocan.
 *
 * La escritura y el deshacer viven en ordenar-server.ts.
 */
import { esDocumentoVivo, type FacturaParaCruzar } from "@/lib/cobranza/odoo/diferencias";
import type { FacturaMercuryParaCruzar } from "@/lib/cobranza/mercury/diferencias";
import { numeroDeMercury } from "@/lib/cobranza/mercury/espejo";
import { centavos } from "@/lib/cobranza/montos";
import { normalizarNumeroFactura, plataformaDelNumero } from "@/lib/cobranza/numero-factura";
import { PAGADA_EN_ODOO, type CobroDelLibro, type EntradaDelLibro, type Fuente } from "./hechos";

export type ReglaDeOrden = "NUMERO_DE_MERCURY" | "VARIAS_CUOTAS" | "FACTURA_REEMPLAZADA";

/** Hasta cuánto difiere una cuota de su factura de Mercury para ordenarla sola, en centavos (US$1). */
export const CENTAVOS_DE_TOLERANCIA_MERCURY = 100;
/** Días entre la cuota y su factura de Mercury. Los mismos que «Lo que no cuadra» de Mercury. */
export const DIAS_NUMERO_DE_MERCURY = 60;
/** Una factura que cubre varias cuotas: cuántas como mucho, y cuántas candidatas se miran antes de rendirse. */
export const CUOTAS_POR_FACTURA = { min: 2, max: 5, candidatas: 16 } as const;
/** Hasta cuánto puede diferir por redondeo una factura partida en cuotas, en centavos (US$1). */
export const CENTAVOS_DE_REDONDEO = 100;
/** Días después de la factura anulada en los que se busca la que la reemplaza. */
export const DIAS_FACTURA_REEMPLAZADA = 90;

export interface CuotaOrdenada {
  cobroId: string;
  periodo: string;
  /** El número que tenía (null = ninguno). */
  numeroAntes: string | null;
  montoAntes: number;
  /** Solo si cambia: el de la factura. */
  montoDespues?: number;
  /** Solo si no tenía fecha de emisión (una cuota cobrada): la de la factura. */
  fechaEmision?: string;
}

export interface Orden {
  regla: ReglaDeOrden;
  fuente: Fuente;
  cuentaId: string;
  cuenta: string;
  numero: string;
  moneda: string;
  cuotas: CuotaOrdenada[];
  /** Lo que se ve en la pantalla y en la bitácora de cada cuota. */
  texto: string;
}

/** Una factura que se parece a un papel por ordenar pero que Nexus no ordena: la mira una persona. */
export interface Dudosa {
  fuente: Fuente;
  cuentaId: string;
  cuenta: string;
  numero: string;
  texto: string;
}

export interface DecisionDeOrden {
  ordenes: Orden[];
  dudosas: Dudosa[];
}

/** La clave de lo que una persona deshizo: esa cuota con ese número no se vuelve a ordenar. */
export const claveDeshecha = (cobroId: string, numero: string) => `${cobroId}|${normalizarNumeroFactura(numero) ?? numero}`;

const dias = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
const mes = (ymd: string) => Number(ymd.slice(0, 4)) * 12 + Number(ymd.slice(5, 7)) - 1;
const fmt = (n: number, moneda: string) =>
  `${moneda === "CRC" ? "₡" : moneda === "USD" ? "US$" : `${moneda} `}${n.toLocaleString("es-CR", { maximumFractionDigits: 2 })}`;
const enMeses = (cs: readonly { periodo: string }[]) => cs.map((c) => c.periodo).join(", ");

/** ¿La cuota puede caer dentro de lo que factura una factura de esa fecha? De 6 meses antes a 1 después. */
const enLaVentana = (c: CobroDelLibro, fechaFactura: string) => {
  const m = mes(`${c.periodo}-01`);
  return m >= mes(fechaFactura) - 6 && m <= mes(fechaFactura) + 1;
};

/**
 * Las combinaciones de `min`..`max` cuotas que suman `objetivo` centavos, con hasta `tolerancia` de diferencia. Corta a
 * las 24: con tantas, ya es «varias».
 */
export function combinacionesExactas<T extends { monto: number }>(cands: readonly T[], objetivo: number, tolerancia = 0): T[][] {
  const out: T[][] = [];
  const xs = [...cands].sort((a, b) => b.monto - a.monto);
  const rec = (i: number, elegidas: T[], suma: number) => {
    if (out.length >= 24) return;
    if (Math.abs(suma - objetivo) <= tolerancia && elegidas.length >= CUOTAS_POR_FACTURA.min) {
      out.push([...elegidas]);
      return;
    }
    if (elegidas.length >= CUOTAS_POR_FACTURA.max || suma > objetivo + tolerancia) return;
    for (let k = i; k < xs.length; k++) rec(k + 1, [...elegidas, xs[k]!], suma + centavos(xs[k]!.monto));
  };
  if (objetivo > 0) rec(0, [], 0);
  return out;
}

/** Dos cuotas gemelas: misma cuenta, moneda, monto, mes, estado y fechas. Cambiar una por otra no cambia nada. */
export const claveDeGemela = (c: CobroDelLibro) =>
  [c.cuentaId, c.moneda, centavos(c.monto), c.periodo, c.estado, c.fechaEmision ?? "", c.fechaProgramada].join("|");

/**
 * Las combinaciones de cuotas de una factura: las exactas y, si no hay ninguna, las que difieren por redondeo. Dos
 * combinaciones que solo cambian una cuota por su gemela cuentan como una. Devuelve como mucho 4 (4 = «4 o más»).
 */
export function combinacionesDeCuotas(cands: readonly CobroDelLibro[], objetivo: number): CobroDelLibro[][] {
  const exactas = combinacionesExactas(cands, objetivo);
  const todas = exactas.length ? exactas : combinacionesExactas(cands, objetivo, CENTAVOS_DE_REDONDEO);
  const vistas = new Map<string, CobroDelLibro[]>();
  for (const k of todas) {
    const clave = k.map(claveDeGemela).sort().join(" + ");
    if (!vistas.has(clave)) vistas.set(clave, k);
  }
  return [...vistas.values()].slice(0, 4);
}

/**
 * ¿Ordenarla mueve plata o crea un choque? Pagada allá ⇒ todas cobradas acá; sin pagar ⇒ ninguna cobrada. Cualquier
 * otra cosa (pagada en parte, en proceso, cuotas mezcladas) es para una persona. Devuelve el porqué, o null si se puede.
 */
export function porQueNoSeOrdena(pagada: boolean, impaga: boolean, cuotas: readonly Pick<CobroDelLibro, "estado" | "fechaEmision">[]): string | null {
  if (!pagada && !impaga) return "la factura está pagada en parte o en proceso de pago";
  if (pagada && cuotas.some((c) => c.estado !== "COBRADO")) return "la factura está pagada y alguna cuota sigue por cobrar: ordenarla la cobraría";
  if (impaga && cuotas.some((c) => c.estado === "COBRADO")) return "la factura no está pagada y alguna cuota ya está cobrada";
  if (cuotas.some((c) => c.estado !== "COBRADO" && !c.fechaEmision)) return "alguna cuota todavía no está marcada facturada";
  return null;
}

const pagadaOdoo = (f: FacturaParaCruzar) => PAGADA_EN_ODOO.includes(f.paymentState);
const impagaOdoo = (f: FacturaParaCruzar) => f.paymentState === "not_paid";
const pagadaMercury = (f: FacturaMercuryParaCruzar) => f.estado === "Paid";
const impagaMercury = (f: FacturaMercuryParaCruzar) => f.estado === "Unpaid" || f.estado === "Overdue";

const cuota = (c: CobroDelLibro, fechaFactura: string, montoFactura?: number): CuotaOrdenada => ({
  cobroId: c.id,
  periodo: c.periodo,
  numeroAntes: c.numeroFactura,
  montoAntes: c.monto,
  ...(montoFactura !== undefined && centavos(montoFactura) !== centavos(c.monto) ? { montoDespues: montoFactura } : {}),
  ...(c.fechaEmision ? {} : { fechaEmision: fechaFactura }),
});

/** Lo que Nexus ordena solo hoy, y lo que se parece pero queda para una persona. */
export function decidirOrden(e: EntradaDelLibro, deshechas: ReadonlySet<string>): DecisionDeOrden {
  const ordenes: Orden[] = [];
  const dudosas: Dudosa[] = [];
  const usadas = new Set<string>();
  const nombre = new Map(e.cobros.map((c) => [c.cuentaId, c.cuentaNombre]));
  const yaDeshecha = (cs: readonly CobroDelLibro[], numero: string) => cs.some((c) => deshechas.has(claveDeshecha(c.id, numero)));

  const tomar = (o: Orden, cs: readonly CobroDelLibro[]): boolean => {
    if (cs.some((c) => usadas.has(c.id)) || yaDeshecha(cs, o.numero)) return false;
    for (const c of cs) usadas.add(c.id);
    ordenes.push(o);
    return true;
  };
  const dudar = (fuente: Fuente, cuentaId: string, numero: string, texto: string) =>
    dudosas.push({ fuente, cuentaId, cuenta: nombre.get(cuentaId) ?? "?", numero, texto });

  /* ── Odoo ─────────────────────────────────────────────────────────────────────────────────────────────── */
  const vigentes = e.facturasOdoo.filter((f) => f.cuentaId && esDocumentoVivo(f) && f.state === "posted");
  const numerosVigentes = new Set(vigentes.map((f) => normalizarNumeroFactura(f.numero)!));
  const porNumeroOdoo = new Map(e.facturasOdoo.map((f) => [normalizarNumeroFactura(f.numero)!, f]));
  /* Dónde se facturó lo dice la cuota (`plataformaFactura`) o su número, no la vía de la cuenta: ACCCSA cobra por Odoo y
     sus cuotas de enero a abril se facturaron en Mercury. */
  const cobrosOdoo = e.cobros.filter((c) => c.plataformaFactura !== "MERCURY" && plataformaDelNumero(c.numeroFactura) !== "MERCURY");
  const anotadasOdoo = new Set(
    e.cobros.map((c) => normalizarNumeroFactura(c.numeroFactura)).filter((n): n is string => !!n && numerosVigentes.has(n)),
  );
  const libreOdoo = (c: CobroDelLibro) => !c.numeroFactura || !numerosVigentes.has(normalizarNumeroFactura(c.numeroFactura)!);

  /* FACTURA_REEMPLAZADA: un número de Odoo que ya no es una factura vigente. Las cuotas que anotan el mismo número
     muerto se miran juntas: primero la factura que suma exacto todas; si no hay, una por una, por el mismo monto. */
  const conNumeroMuerto = new Map<string, CobroDelLibro[]>();
  for (const c of cobrosOdoo) {
    const n = normalizarNumeroFactura(c.numeroFactura);
    if (!n || plataformaDelNumero(n) !== "ODOO" || numerosVigentes.has(n)) continue;
    const k = `${c.cuentaId}|${c.moneda}|${n}`;
    conNumeroMuerto.set(k, [...(conNumeroMuerto.get(k) ?? []), c]);
  }
  for (const cs of conNumeroMuerto.values()) {
    const c0 = cs[0]!;
    const n = normalizarNumeroFactura(c0.numeroFactura)!;
    const vieja = porNumeroOdoo.get(n);
    const desde = vieja?.invoiceDate ?? cs.map((c) => c.fechaEmision ?? c.fechaProgramada).sort()[0]!;
    const libre = (f: FacturaParaCruzar) =>
      f.cuentaId === c0.cuentaId &&
      f.moneda === c0.moneda &&
      !anotadasOdoo.has(normalizarNumeroFactura(f.numero)!) &&
      dias(f.invoiceDate, desde) >= 0 &&
      dias(f.invoiceDate, desde) <= DIAS_FACTURA_REEMPLAZADA;
    const estado = vieja ? (vieja.paymentState === "reversed" ? "revertida" : "anulada") : "no está en Odoo";
    const total = cs.reduce((a, c) => a + centavos(c.monto), 0);
    const enteras = vigentes.filter((f) => libre(f) && centavos(f.montoNeto) === total);
    if (enteras.length > 1) {
      dudar("ODOO", c0.cuentaId, n, `${n} ya no está vigente y hay ${enteras.length} facturas que podrían reemplazarla`);
      continue;
    }
    const reemplazos: Array<{ f: FacturaParaCruzar; cs: CobroDelLibro[] }> = [];
    if (enteras[0]) reemplazos.push({ f: enteras[0], cs });
    else {
      for (const c of cs) {
        const cands = vigentes.filter((f) => libre(f) && centavos(f.montoNeto) === centavos(c.monto));
        if (cands.length > 1) dudar("ODOO", c.cuentaId, n, `${n} ya no está vigente y hay ${cands.length} facturas que podrían reemplazarla`);
        else if (cands[0]) reemplazos.push({ f: cands[0], cs: [c] });
      }
      /* Dos cuotas que apuntarían a la misma factura: eso ya no es un reemplazo de una por una. */
      const repetidas = new Set(reemplazos.map((r) => r.f.id).filter((id, i, xs) => xs.indexOf(id) !== i));
      if (repetidas.size) {
        dudar("ODOO", c0.cuentaId, n, `${n} ya no está vigente y sus cuotas calzan con la misma factura`);
        reemplazos.splice(0, reemplazos.length, ...reemplazos.filter((r) => !repetidas.has(r.f.id)));
      }
    }
    for (const { f, cs: deEsta } of reemplazos) {
      const no = porQueNoSeOrdena(pagadaOdoo(f), impagaOdoo(f), deEsta);
      if (no) {
        dudar("ODOO", c0.cuentaId, f.numero, `${n} → ${f.numero}: ${no}`);
        continue;
      }
      const texto =
        deEsta.length === 1
          ? `${c0.cuentaNombre}, cuota de ${deEsta[0]!.periodo}: anotaba la ${n} (${estado}); es la ${f.numero}, por el mismo monto.`
          : `${c0.cuentaNombre}, cuotas de ${enMeses(deEsta)}: anotaban la ${n} (${estado}); es la ${f.numero}, que suma exacto las ${deEsta.length}.`;
      if (
        tomar(
          {
            regla: "FACTURA_REEMPLAZADA",
            fuente: "ODOO",
            cuentaId: c0.cuentaId,
            cuenta: c0.cuentaNombre,
            numero: f.numero,
            moneda: c0.moneda,
            cuotas: deEsta.map((c) => cuota(c, f.invoiceDate)),
            texto,
          },
          deEsta,
        )
      )
        anotadasOdoo.add(normalizarNumeroFactura(f.numero)!);
    }
  }

  /* VARIAS_CUOTAS en Odoo. */
  const variasOdoo = vigentes
    .filter((f) => !anotadasOdoo.has(normalizarNumeroFactura(f.numero)!))
    .map((f) => {
      const cands = cobrosOdoo.filter((c) => c.cuentaId === f.cuentaId && c.moneda === f.moneda && libreOdoo(c) && enLaVentana(c, f.invoiceDate));
      return { f, combos: cands.length > CUOTAS_POR_FACTURA.candidatas ? [] : combinacionesDeCuotas(cands, centavos(f.montoNeto)) };
    })
    .filter((x) => x.combos.length > 0);
  ordenarVarias(
    variasOdoo.map((x) => ({
      fuente: "ODOO" as const,
      cuentaId: x.f.cuentaId!,
      numero: x.f.numero,
      moneda: x.f.moneda,
      monto: x.f.montoNeto,
      fecha: x.f.invoiceDate,
      pagada: pagadaOdoo(x.f),
      impaga: impagaOdoo(x.f),
      combos: x.combos,
    })),
  );

  /* ── Mercury ──────────────────────────────────────────────────────────────────────────────────────────── */
  const cuentaDe = (f: FacturaMercuryParaCruzar) => e.cuentaDeClienteMercury.get(f.mercuryCustomerId) ?? null;
  const vivasM = e.facturasMercury.filter((f) => f.estado !== "Cancelled" && cuentaDe(f));
  const cobrosM = e.cobros.filter((c) => c.plataformaFactura !== "ODOO" && plataformaDelNumero(c.numeroFactura) !== "ODOO");
  const anotadasM = new Set(e.cobros.map((c) => numeroDeMercury(c.numeroFactura)).filter((n): n is string => !!n));
  const libreM = (c: CobroDelLibro) => !numeroDeMercury(c.numeroFactura) && !c.numeroFactura;

  /* NUMERO_DE_MERCURY: el par más cercano de los dos lados, sin empate. */
  const sinNumero = cobrosM.filter((c) => libreM(c) && (c.fechaEmision || c.estado === "COBRADO") && !usadas.has(c.id));
  const facturasLibres = vivasM.filter((f) => !anotadasM.has(numeroDeMercury(f.numero) ?? f.numero));
  const calza = (c: CobroDelLibro, f: FacturaMercuryParaCruzar) =>
    cuentaDe(f) === c.cuentaId &&
    f.moneda === c.moneda &&
    Math.abs(centavos(f.monto) - centavos(c.monto)) <= CENTAVOS_DE_TOLERANCIA_MERCURY &&
    Math.abs(dias(f.invoiceDate, c.fechaEmision ?? c.fechaProgramada)) <= DIAS_NUMERO_DE_MERCURY;
  const distancia = (c: CobroDelLibro, f: FacturaMercuryParaCruzar) =>
    Math.abs(dias(f.invoiceDate, c.fechaEmision ?? c.fechaProgramada)) * 1000 + Math.abs(centavos(f.monto) - centavos(c.monto));
  /** El único más cercano de una lista, o null si no hay o hay empate. */
  const elMasCercano = <T,>(xs: readonly T[], d: (x: T) => number): T | null => {
    const orden = [...xs].sort((a, b) => d(a) - d(b));
    if (!orden.length) return null;
    if (orden.length > 1 && d(orden[0]!) === d(orden[1]!)) return null;
    return orden[0]!;
  };
  /* Se empareja por clases: las cuotas gemelas juntas y las facturas iguales (cuenta, moneda, monto, fecha y estado)
     juntas. Una clase de cuotas y una de facturas del mismo tamaño, las más cercanas entre sí, se reparten en orden. */
  const agrupar = <T,>(xs: readonly T[], clave: (x: T) => string) => {
    const m = new Map<string, T[]>();
    for (const x of xs) m.set(clave(x), [...(m.get(clave(x)) ?? []), x]);
    return [...m.values()];
  };
  const clasesDeCuotas = agrupar(sinNumero, claveDeGemela).map((cs) => [...cs].sort((a, b) => a.id.localeCompare(b.id)));
  const clasesDeFacturas = agrupar(facturasLibres, (f) => [cuentaDe(f), f.moneda, centavos(f.monto), f.invoiceDate, f.estado].join("|")).map((fs) =>
    [...fs].sort((a, b) => a.numero.localeCompare(b.numero)),
  );
  const pares: Array<{ c: CobroDelLibro; f: FacturaMercuryParaCruzar }> = [];
  for (const cs of clasesDeCuotas) {
    const fs = elMasCercano(clasesDeFacturas.filter((x) => calza(cs[0]!, x[0]!)), (x) => distancia(cs[0]!, x[0]!));
    if (!fs) continue;
    const deVuelta = elMasCercano(clasesDeCuotas.filter((x) => calza(x[0]!, fs[0]!)), (x) => distancia(x[0]!, fs[0]!));
    if (deVuelta !== cs || cs.length !== fs.length) continue;
    cs.forEach((c, i) => pares.push({ c, f: fs[i]! }));
  }
  for (const { c, f } of pares) {
    const no = porQueNoSeOrdena(pagadaMercury(f), impagaMercury(f), [c]);
    if (no) {
      dudar("MERCURY", c.cuentaId, f.numero, `${f.numero} para la cuota de ${c.periodo}: ${no}`);
      continue;
    }
    const q = cuota(c, f.invoiceDate, f.monto);
    if (
      tomar(
        {
          regla: "NUMERO_DE_MERCURY",
          fuente: "MERCURY",
          cuentaId: c.cuentaId,
          cuenta: c.cuentaNombre,
          numero: f.numero,
          moneda: c.moneda,
          cuotas: [q],
          texto:
            `${c.cuentaNombre}, cuota de ${c.periodo}: es la ${f.numero} de Mercury.` +
            (q.montoDespues !== undefined ? ` El monto pasa de ${fmt(c.monto, c.moneda)} a ${fmt(f.monto, f.moneda)}, el de la factura.` : ""),
        },
        [c],
      )
    )
      anotadasM.add(numeroDeMercury(f.numero) ?? f.numero);
  }

  /* VARIAS_CUOTAS en Mercury. */
  const variasM = vivasM
    .filter((f) => !anotadasM.has(numeroDeMercury(f.numero) ?? f.numero))
    .map((f) => {
      const cuentaId = cuentaDe(f)!;
      const cands = cobrosM.filter((c) => c.cuentaId === cuentaId && c.moneda === f.moneda && libreM(c) && !usadas.has(c.id) && enLaVentana(c, f.invoiceDate));
      return { f, cuentaId, combos: cands.length > CUOTAS_POR_FACTURA.candidatas ? [] : combinacionesDeCuotas(cands, centavos(f.monto)) };
    })
    .filter((x) => x.combos.length > 0);
  ordenarVarias(
    variasM.map((x) => ({
      fuente: "MERCURY" as const,
      cuentaId: x.cuentaId,
      numero: x.f.numero,
      moneda: x.f.moneda,
      monto: x.f.monto,
      fecha: x.f.invoiceDate,
      pagada: pagadaMercury(x.f),
      impaga: impagaMercury(x.f),
      combos: x.combos,
    })),
  );

  return { ordenes, dudosas };

  /** Una factura con varias cuotas se ordena si su combinación es única y ninguna de sus cuotas calza con otra factura. */
  function ordenarVarias(
    xs: ReadonlyArray<{ fuente: Fuente; cuentaId: string; numero: string; moneda: string; monto: number; fecha: string; pagada: boolean; impaga: boolean; combos: CobroDelLibro[][] }>,
  ) {
    /* Por clase de gemelas: si dos facturas pueden tomar cuotas gemelas, eso es una duda aunque no sea la misma fila. */
    const uso = new Map<string, number>();
    for (const x of xs) for (const k of new Set(x.combos.flat().map(claveDeGemela))) uso.set(k, (uso.get(k) ?? 0) + 1);
    for (const x of xs) {
      const unica = x.combos.length === 1 && x.combos[0]!.every((c) => uso.get(claveDeGemela(c)) === 1);
      if (!unica) {
        dudar(
          x.fuente,
          x.cuentaId,
          x.numero,
          x.combos.length === 1
            ? `${x.numero} (${fmt(x.monto, x.moneda)}) calza con cuotas que también calzan con otra factura`
            : `${x.numero} (${fmt(x.monto, x.moneda)}) calza con ${x.combos.length > 3 ? "4 o más" : x.combos.length} combinaciones de cuotas: ${x.combos
                .slice(0, 2)
                .map(enMeses)
                .join(" o ")}`,
        );
        continue;
      }
      const cs = [...x.combos[0]!].sort((a, b) => a.periodo.localeCompare(b.periodo));
      const no = porQueNoSeOrdena(x.pagada, x.impaga, cs);
      if (no) {
        dudar(x.fuente, x.cuentaId, x.numero, `${x.numero}: ${no}`);
        continue;
      }
      tomar(
        {
          regla: "VARIAS_CUOTAS",
          fuente: x.fuente,
          cuentaId: x.cuentaId,
          cuenta: nombre.get(x.cuentaId) ?? "?",
          numero: x.numero,
          moneda: x.moneda,
          cuotas: cs.map((c) => cuota(c, x.fecha)),
          texto: `${nombre.get(x.cuentaId) ?? "?"}: la ${x.numero} (${fmt(x.monto, x.moneda)}) cubre las cuotas de ${enMeses(cs)}, ${
            centavos(x.monto) === cs.reduce((a, c) => a + centavos(c.monto), 0) ? "que suman exacto" : `que suman ${fmt(cs.reduce((a, c) => a + c.monto, 0), x.moneda)} (redondeo)`
          }.`,
        },
        cs,
      );
    }
  }
}
