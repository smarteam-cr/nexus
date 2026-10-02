/**
 * lib/cobranza/mercury/diferencias.ts
 *
 * Todo lo que no cuadra entre Nexus y Mercury, en una sola lista, cada línea con dónde se arregla, los pasos y la plata
 * que mueve. PURO: sin Prisma, sin red y sin reloj. Entra lo medido, sale la lista.
 *
 * ── EL CONTRATO ES EL DE ODOO (lib/cobranza/odoo/diferencias.ts) ────────────────────
 * Las líneas son `DiferenciaOdoo`: la misma pantalla las muestra, con el mismo «Está bien así» fila por fila y la
 * misma huella. Pedido de Elías (2026-10-02): «que tenga todas las inconsistencias, que se puedan resolver o por lo
 * menos haya un mensaje, y que cada vez que corra vuelvan a aparecer». Por eso:
 *   1. **Todo se DETECTA en cada carga**: nada se guarda como «hallazgo». Lo que se arregla en Mercury o en Nexus sale
 *      solo con la copia siguiente; lo que no, sigue ahí.
 *   2. **Marcar no arregla nada**: saca la fila de la lista con motivo y firma, y si cambia uno de sus números
 *      (monto, estado, número), vuelve sola.
 *   3. **Cada línea dice dónde se arregla y cómo**, en pasos.
 *
 * ⛔ Nunca convierte moneda ni suma monedas entre sí: cada cifra con la suya.
 */
import { identidadDeFila, type DocumentoDeFila } from "@/lib/finanzas/inconsistencias";
import {
  filasQueVolvieron,
  indiceDeMarcas,
  montosPorMoneda,
  separarMarcadas,
  textoDeMontos,
  type ClaveDeDocumento,
  type DiferenciaOdoo,
  type FilaMarcada,
  type MarcaDeFila,
  type PlataDeLinea,
} from "../odoo/diferencias";
import { numeroDeMercury, nombreDeQuienPago } from "./espejo";
import { nombresParecidos } from "./emparejado";

/* ── Lo que entra ───────────────────────────────────────────────────────────────── */

export interface FacturaMercuryParaCruzar {
  id: string;
  numero: string;
  /** `YYYY-MM-DD`. */
  invoiceDate: string;
  dueDate: string | null;
  monto: number;
  moneda: string;
  /** Unpaid · Paid · Cancelled · Processing. */
  estado: string;
  mercuryCustomerId: string;
  clienteNombre: string;
  /** `YYYY-MM-DD` del último cambio en Mercury: para una pagada, casi siempre el día que se marcó pagada. */
  actualizadaEn: string;
}

export interface ClienteMercuryParaCruzar {
  mercuryCustomerId: string;
  nombre: string;
  cuentaId: string | null;
  ignorado: boolean;
}

export interface CuentaParaCruzarMercury {
  id: string;
  nombre: string;
  /** ODOO, MERCURY u OTRA. */
  via: string;
}

export interface CobroParaCruzarMercury {
  id: string;
  cuentaId: string;
  periodo: string;
  /** `YYYY-MM-DD`. */
  fechaProgramada: string;
  /** `YYYY-MM-DD` o null si no está facturado. */
  fechaEmision: string | null;
  monto: number;
  moneda: string;
  estado: string;
  numeroFactura: string | null;
}

/** Una entrada de plata de un cliente (ya filtrada con `esEntradaDeCliente`). */
export interface EntradaParaCruzar {
  id: string;
  monto: number;
  /** `YYYY-MM-DD`. */
  fecha: string;
  quien: string;
}

export interface EstadoMercury {
  facturas: readonly FacturaMercuryParaCruzar[];
  clientes: readonly ClienteMercuryParaCruzar[];
  cuentas: readonly CuentaParaCruzarMercury[];
  cobros: readonly CobroParaCruzarMercury[];
  entradas: readonly EntradaParaCruzar[];
  /** Las marcas «está bien así» vigentes de las líneas de Mercury. */
  marcas: readonly MarcaDeFila[];
  /** El día de la última copia buena de Mercury (`YYYY-MM-DD`), o null. */
  copiaAl: string | null;
}

/* ── Las reglas finas ───────────────────────────────────────────────────────────── */

const centavos = (n: number) => Math.round(n * 100);
const DIA = 86_400_000;
const dias = (a: string, b: string) => (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DIA;
const plata = (monto: number, moneda: string) => textoDeMontos([{ monto, moneda }]);
const facturas_ = (n: number) => (n === 1 ? "1 factura" : `${n} facturas`);
const cobros_ = (n: number) => (n === 1 ? "1 cobro" : `${n} cobros`);
const ESTADO: Record<string, string> = { Unpaid: "sin pagar", Paid: "pagada", Cancelled: "anulada", Processing: "en proceso de pago" };
const estadoDe = (e: string) => ESTADO[e] ?? e;
const ESTADO_COBRO: Record<string, string> = { PROGRAMADO: "programado", POR_COBRAR: "por cobrar", COBRADO: "cobrado" };
const estadoCobro = (e: string) => ESTADO_COBRO[e] ?? e.toLowerCase();

/**
 * Una transferencia llega con la comisión del banco descontada: medido el 2026-10-02, Visual Branding pagó US$1.760 por
 * una factura de US$1.780. Se acepta hasta un 3 % menos —al menos US$20, a lo sumo US$60—, nunca más.
 * «Cómo funciona» dice estos mismos números: si cambian acá, cambian allá.
 */
export const COMISION_DEL_BANCO = { proporcion: 0.03, minimo: 20, maximo: 60 } as const;
/** Una entrada se ata a una factura pagada desde unos días antes de la factura hasta este plazo después. */
export const DIAS_PARA_PAGAR = 150;
/** Un cobro facturado en Nexus en estos días antes de la última copia todavía puede no estar en Mercury. */
export const DIAS_DE_GRACIA_MERCURY = 3;

export function pagaLaFactura(entrada: number, factura: number): boolean {
  const { proporcion, minimo, maximo } = COMISION_DEL_BANCO;
  const tolerancia = Math.min(maximo, Math.max(minimo, factura * proporcion));
  return entrada <= factura + 0.005 && entrada >= factura - tolerancia;
}

/**
 * Las entradas de plata que corresponden a facturas pagadas, una por factura: mismo monto (o con la comisión
 * descontada), desde 3 días antes de la factura hasta `DIAS_PARA_PAGAR` después, y primero las de nombre parecido al
 * cliente.
 */
export function entradasDeFacturas(
  facturas: readonly FacturaMercuryParaCruzar[],
  entradas: readonly EntradaParaCruzar[],
): Map<string, EntradaParaCruzar> {
  const out = new Map<string, EntradaParaCruzar>();
  const usadas = new Set<string>();
  const pagadas = [...facturas].filter((f) => f.estado === "Paid").sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate));
  for (const conNombre of [true, false]) {
    for (const f of pagadas) {
      if (out.has(f.id)) continue;
      const candidata = entradas
        .filter(
          (e) =>
            !usadas.has(e.id) &&
            pagaLaFactura(e.monto, f.monto) &&
            dias(e.fecha, f.invoiceDate) >= -3 &&
            dias(e.fecha, f.invoiceDate) <= DIAS_PARA_PAGAR &&
            (!conNombre || nombresParecidos(nombreDeQuienPago(e.quien), f.clienteNombre)),
        )
        .sort((a, b) => Math.abs(a.monto - f.monto) - Math.abs(b.monto - f.monto) || a.fecha.localeCompare(b.fecha))[0];
      if (candidata) {
        out.set(f.id, candidata);
        usadas.add(candidata.id);
      }
    }
  }
  return out;
}

/* ── La lista ───────────────────────────────────────────────────────────────────── */

type Documento = DocumentoDeFila<ClaveDeDocumento>;
type LineaNueva = Omit<
  DiferenciaOdoo,
  "aceptada" | "marcadas" | "tituloDeMarcadas" | "volvieron" | "montoEnJuego" | "yaContadoEn" | "documentos" | "plata"
> & { plata?: PlataDeLinea[]; documentos?: string[] };

const huellaDeFactura = (f: FacturaMercuryParaCruzar) => [f.numero, f.estado, centavos(f.monto), f.moneda].join("|");
const huellaDeCobro = (c: CobroParaCruzarMercury) =>
  [c.estado, c.fechaEmision ?? "", centavos(c.monto), c.moneda, numeroDeMercury(c.numeroFactura) ?? ""].join("|");
const docFactura = (f: FacturaMercuryParaCruzar): Documento => ({ clave: `fm:${f.id}`, huella: huellaDeFactura(f) });
const docCobro = (c: CobroParaCruzarMercury): Documento => ({ clave: `c:${c.id}`, huella: huellaDeCobro(c) });

const SEVERIDAD_ORDEN: Readonly<Record<string, number>> = { ALTA: 0, MEDIA: 1, BAJA: 2 };

export function detectarDiferenciasMercury(e: EstadoMercury): DiferenciaOdoo[] {
  const out: DiferenciaOdoo[] = [];
  const marcas = indiceDeMarcas(e.marcas);

  /**
   * Arma una línea dos veces —con lo pendiente y con lo ya marcado—, igual que «Lo que no cuadra» de Odoo: el título, la
   * plata y la cantidad hablan de lo que queda por resolver, y lo marcado va a «Marcadas» con su «Deshacer».
   */
  const agregar = <T>(codigo: string, cosas: readonly T[], documentosDe: (x: T) => readonly Documento[], armar: (xs: readonly T[]) => LineaNueva) => {
    if (!cosas.length) return;
    const marcada = (x: T) => {
      const ds = documentosDe(x);
      return ds.length > 0 && ds.every((d) => marcas.vigente(codigo, d.clave, d.huella) !== undefined);
    };
    const pendientes = cosas.filter((x) => !marcada(x));
    const yaMarcadas = cosas.filter(marcada);
    const abierta = pendientes.length ? armar(pendientes) : null;
    const cerrada = yaMarcadas.length ? armar(yaMarcadas) : null;
    const base = (abierta ?? cerrada)!;
    const { pendientes: sinSuMarca, marcadas } = separarMarcadas(codigo, cerrada?.items ?? [], marcas);
    const items = [...(abierta?.items ?? []), ...sinSuMarca];
    const montos = abierta?.montos ?? [];
    const documentos = [...new Set([abierta, cerrada].flatMap((l) => (l ? l.documentos ?? (l.plata ?? []).map((p) => p.clave) : [])))];
    out.push({
      ...base,
      items,
      montos,
      plata: abierta?.plata ?? [],
      documentos,
      marcadas: marcadas as FilaMarcada[],
      ...(cerrada ? { tituloDeMarcadas: cerrada.titulo } : {}),
      volvieron: filasQueVolvieron(codigo, items, marcas),
      montoEnJuego: montos.length ? Math.max(...montos.map((m) => m.monto)) : null,
      aceptada: items.length === 0,
    });
  };

  const cuentaDelCliente = new Map(e.clientes.map((c) => [c.mercuryCustomerId, c.cuentaId]));
  const ignorado = new Set(e.clientes.filter((c) => c.ignorado).map((c) => c.mercuryCustomerId));
  const nombreCuenta = new Map(e.cuentas.map((c) => [c.id, c.nombre]));
  const vivas = e.facturas.filter((f) => f.estado !== "Cancelled");
  const facturaPorNumero = new Map(e.facturas.map((f) => [f.numero.toUpperCase(), f]));
  const cuentaDe = (f: FacturaMercuryParaCruzar) => cuentaDelCliente.get(f.mercuryCustomerId) ?? null;
  const pago = entradasDeFacturas(e.facturas, e.entradas);

  /* Los cobros que nombran una factura de Mercury, por factura. */
  const cobrosDeFactura = new Map<string, CobroParaCruzarMercury[]>();
  const conNumeroInexistente: CobroParaCruzarMercury[] = [];
  for (const c of e.cobros) {
    const n = numeroDeMercury(c.numeroFactura);
    if (!n) continue;
    const f = facturaPorNumero.get(n);
    if (!f) conNumeroInexistente.push(c);
    else cobrosDeFactura.set(f.id, [...(cobrosDeFactura.get(f.id) ?? []), c]);
  }
  const textoCobro = (c: CobroParaCruzarMercury) =>
    `${nombreCuenta.get(c.cuentaId) ?? "?"} · cuota de ${c.periodo} por ${plata(c.monto, c.moneda)} · ${estadoCobro(c.estado)}`;
  const textoFactura = (f: FacturaMercuryParaCruzar) =>
    `${f.numero} · ${f.clienteNombre} · ${plata(f.monto, f.moneda)} · ${estadoDe(f.estado)} · del ${f.invoiceDate}`;

  /* ── 1. Facturas de clientes sin emparejar ──────────────────────────────────────── */
  /* Como «Pagadas sin cuenta» de Odoo: un cliente sin cuenta que solo tiene facturas pagadas no es plata por cobrar, y
     ya está en «Emparejar» (medido el 2026-10-02: 9 de los 14 clientes sin cuenta). Al emparejarlo, sus facturas se
     cruzan como las demás. */
  const sinCuenta = vivas.filter((f) => !cuentaDe(f) && !ignorado.has(f.mercuryCustomerId));
  const clientesSinCuenta = [...new Set(sinCuenta.map((f) => f.mercuryCustomerId))].map((id) => sinCuenta.filter((f) => f.mercuryCustomerId === id));
  const porCliente = clientesSinCuenta.filter((g) => g.some((f) => f.estado !== "Paid"));
  const soloPagadas = clientesSinCuenta.length - porCliente.length;
  agregar("MERCURY-SIN-CUENTA", porCliente, (fs) => fs.map(docFactura), (grupos) => {
    const fs = grupos.flat();
    const porCobrar = fs.filter((f) => f.estado !== "Paid");
    return {
      codigo: "MERCURY-SIN-CUENTA",
      severidad: "ALTA",
      titulo: `${facturas_(fs.length)} de Mercury de ${grupos.length === 1 ? "un cliente que no está" : `${grupos.length} clientes que no están`} en ninguna cuenta de Nexus`,
      detalle: `Mercury las emitió, pero su cliente no está emparejado con una cuenta: no cuentan en la cobranza de Nexus ni en el punto de equilibrio. Por cobrar: ${textoDeMontos(montosPorMoneda(porCobrar))}.${soloPagadas ? ` Otros ${soloPagadas === 1 ? "1 cliente sin cuenta tiene" : `${soloPagadas} clientes sin cuenta tienen`} todo pagado: no se cuentan acá, están en «Emparejar».` : ""}`,
      montos: montosPorMoneda(porCobrar),
      plata: porCobrar.map((f) => ({ clave: `fm:${f.id}`, moneda: f.moneda, monto: f.monto })),
      documentos: fs.map((f) => `fm:${f.id}`),
      donde: "NEXUS",
      atajo: { etiqueta: "Ir a emparejar", tab: "emparejar" },
      pasos: [
        "Ve a la pestaña «Emparejar» de esta misma pantalla.",
        "Si la empresa ya tiene cuenta en Nexus, aprieta «Es de una cuenta de Nexus» y elígela: sus facturas pasan a esa cuenta en el momento.",
        "Si todavía no tiene cuenta, créala en Cobranza con «Nueva empresa» y vuelve acá a emparejarla.",
        "Si no es cliente nuestro, márcalo «No es cliente nuestro»: deja de aparecer.",
      ],
      queSignificaAceptar: "«Está bien así» solo quita estas filas de la lista: las facturas siguen fuera de la cobranza de Nexus. Casi nunca es lo correcto: lo que corresponde es emparejar.",
      queHacer: "Emparejar el cliente de Mercury con su cuenta de Nexus.",
      resuelve: "COBRANZA",
      items: grupos.map((g) => {
        const pendiente = g.filter((f) => f.estado !== "Paid");
        return {
          texto: `${g[0]!.clienteNombre} · ${facturas_(g.length)}: ${g.map((f) => f.numero).join(", ")}`,
          nota: pendiente.length ? `Por cobrar: ${textoDeMontos(montosPorMoneda(pendiente))}` : "Todas pagadas",
          ...(pendiente.length ? { monto: pendiente.reduce((s, f) => s + f.monto, 0), moneda: pendiente[0]!.moneda } : {}),
          fila: identidadDeFila(`cliente:${g[0]!.mercuryCustomerId}`, g.map(docFactura)),
        };
      }),
    };
  });

  /* ── 2. Cuentas de Mercury sin cliente de Mercury ───────────────────────────────── */
  const conCliente = new Set(e.clientes.flatMap((c) => (c.cuentaId ? [c.cuentaId] : [])));
  const cuentasSolas = e.cuentas.filter((c) => c.via === "MERCURY" && !conCliente.has(c.id));
  agregar("MERCURY-CUENTA-SIN-CLIENTE", cuentasSolas, (c) => [{ clave: `cuenta:${c.id}`, huella: "sin-cliente" }], (cs) => ({
    codigo: "MERCURY-CUENTA-SIN-CLIENTE",
    severidad: "MEDIA",
    titulo: `${cs.length === 1 ? "1 cuenta que factura" : `${cs.length} cuentas que facturan`} por Mercury sin su cliente de Mercury`,
    detalle: "Sin el cliente de Mercury, Nexus no puede ver sus facturas ni comparar sus cobros con lo que Mercury dice.",
    montos: [],
    documentos: cs.map((c) => `cuenta:${c.id}`),
    donde: "NEXUS",
    atajo: { etiqueta: "Ir a emparejar", tab: "emparejar" },
    pasos: [
      "Ve a la pestaña «Emparejar» y busca el cliente de Mercury de esta cuenta (Mercury usa la razón social).",
      "Si la cuenta no factura por Mercury, cambia su vía de cobro en su ficha de Cobranza.",
      "Si factura por Mercury pero todavía no se le emitió ninguna factura, márcala «Está bien así» con ese motivo.",
    ],
    queSignificaAceptar: "Que esta cuenta todavía no tiene facturas en Mercury. Si mañana le emiten una, hay que emparejarla igual.",
    queHacer: "Emparejar la cuenta con su cliente de Mercury.",
    resuelve: "COBRANZA",
    items: cs.map((c) => ({ texto: c.nombre, fila: identidadDeFila(`cuenta:${c.id}`, [{ clave: `cuenta:${c.id}` as ClaveDeDocumento, huella: "sin-cliente" }]) })),
  }));

  /* ── 3. Cobros con un número que no existe en Mercury ───────────────────────────── */
  agregar("MERCURY-NUMERO-INEXISTENTE", conNumeroInexistente, (c) => [docCobro(c)], (cs) => ({
    codigo: "MERCURY-NUMERO-INEXISTENTE",
    severidad: "ALTA",
    titulo: `${cobros_(cs.length)} con un número de factura que no existe en Mercury`,
    detalle: "El número anotado en el cobro no es de ninguna factura de Mercury: está mal tecleado, o la factura se emitió en otro lado.",
    montos: montosPorMoneda(cs),
    plata: cs.map((c) => ({ clave: `c:${c.id}`, moneda: c.moneda, monto: c.monto })),
    donde: "NEXUS",
    pasos: [
      "Busca la factura en Mercury, en su sección de facturas, por el cliente y el monto.",
      "Abre el cobro en Cobranza y corrige el número de factura.",
      "Si la factura no se emitió en Mercury, anota dónde se emitió en el cobro.",
    ],
    queSignificaAceptar: "Que el número es correcto aunque Mercury no lo tenga (una factura de otra plataforma con forma de Mercury).",
    queHacer: "Corregir el número de factura del cobro.",
    resuelve: "COBRANZA",
    items: cs.map((c) => ({
      texto: textoCobro(c),
      nota: `Anotado: ${c.numeroFactura}`,
      monto: c.monto,
      moneda: c.moneda,
      fila: identidadDeFila(`c:${c.id}`, [docCobro(c)]),
    })),
  }));

  /* ── 4. El número es de una factura de otra cuenta ──────────────────────────────── */
  const deOtraCuenta = [...cobrosDeFactura].flatMap(([fid, cs]) => {
    const f = e.facturas.find((x) => x.id === fid)!;
    const cuenta = cuentaDe(f);
    return cuenta ? cs.filter((c) => c.cuentaId !== cuenta).map((c) => ({ c, f, cuenta })) : [];
  });
  agregar("MERCURY-NUMERO-DE-OTRA-CUENTA", deOtraCuenta, (x) => [docCobro(x.c), docFactura(x.f)], (xs) => ({
    codigo: "MERCURY-NUMERO-DE-OTRA-CUENTA",
    severidad: "ALTA",
    titulo: `${cobros_(xs.length)} con el número de una factura que Mercury le emitió a otra cuenta`,
    detalle: "O el número del cobro está mal, o el cliente de Mercury está emparejado con la cuenta equivocada.",
    montos: montosPorMoneda(xs.map((x) => x.c)),
    plata: xs.map((x) => ({ clave: `c:${x.c.id}`, moneda: x.c.moneda, monto: x.c.monto })),
    donde: "NEXUS",
    pasos: [
      "Mira en Mercury a quién se le emitió la factura.",
      "Si el cobro tiene el número equivocado, corrígelo en Cobranza.",
      "Si el cliente de Mercury está emparejado con la cuenta equivocada, desvincúlalo en «Emparejar» y vincúlalo con la correcta.",
    ],
    queSignificaAceptar: "Que la factura cubre cobros de dos cuentas. Es raro: casi siempre es un número mal tecleado.",
    queHacer: "Corregir el número del cobro o el emparejado del cliente.",
    resuelve: "COBRANZA",
    items: xs.map((x) => ({
      texto: textoCobro(x.c),
      nota: `${x.f.numero} es de ${x.f.clienteNombre}, emparejado con ${nombreCuenta.get(x.cuenta) ?? "otra cuenta"}`,
      monto: x.c.monto,
      moneda: x.c.moneda,
      fila: identidadDeFila(`c:${x.c.id}`, [docCobro(x.c), docFactura(x.f)]),
    })),
  }));

  /* Desde acá, solo las facturas con su cuenta y los cobros de esa misma cuenta. */
  const deSuCuenta = (f: FacturaMercuryParaCruzar) => (cobrosDeFactura.get(f.id) ?? []).filter((c) => c.cuentaId === cuentaDe(f));

  /* ── 5. Pagada en Mercury, por cobrar en Nexus ──────────────────────────────────── */
  const pagadasSinCobrar = e.facturas
    .filter((f) => f.estado === "Paid" && cuentaDe(f))
    .map((f) => ({ f, cs: deSuCuenta(f).filter((c) => c.estado !== "COBRADO") }))
    .filter((x) => x.cs.length > 0);
  agregar("MERCURY-PAGADA-SIN-COBRAR", pagadasSinCobrar, (x) => [docFactura(x.f), ...x.cs.map(docCobro)], (xs) => ({
    codigo: "MERCURY-PAGADA-SIN-COBRAR",
    severidad: "ALTA",
    titulo: `${facturas_(xs.length)} pagadas en Mercury que en Nexus siguen por cobrar`,
    detalle: "Mercury ya las da pagadas. En Nexus sus cobros siguen abiertos: el semáforo los acusa y el punto de equilibrio no cuenta esa plata como cobrada.",
    montos: montosPorMoneda(xs.flatMap((x) => x.cs)),
    plata: xs.flatMap((x) => x.cs.map((c) => ({ clave: `c:${c.id}`, moneda: c.moneda, monto: c.monto }))),
    donde: "NEXUS",
    pasos: [
      "Abre el cobro en Cobranza y registra el pago, con el día que entró la plata (la fila lo dice cuando se encontró el movimiento).",
      "Si el cliente pagó menos por la comisión del banco, el cobro igual se registra completo: la comisión es un gasto.",
    ],
    queSignificaAceptar: "Que en Mercury figura pagada pero la plata no entró. Revísalo con Alex antes de marcar.",
    queHacer: "Registrar el pago en Nexus.",
    resuelve: "COBRANZA",
    items: xs.map((x) => {
      const p = pago.get(x.f.id);
      return {
        texto: `${textoFactura(x.f)} → ${x.cs.map(textoCobro).join("; ")}`,
        nota: p ? `Entró el ${p.fecha}: ${plata(p.monto, x.f.moneda)} de ${nombreDeQuienPago(p.quien)}` : `Mercury la marcó pagada el ${x.f.actualizadaEn}; no se encontró el movimiento`,
        monto: x.cs.reduce((s, c) => s + c.monto, 0),
        moneda: x.f.moneda,
        fila: identidadDeFila(`fm:${x.f.id}`, [docFactura(x.f), ...x.cs.map(docCobro)]),
      };
    }),
  }));

  /* ── 6. Cobrada en Nexus, sin pagar en Mercury ──────────────────────────────────── */
  const cobradasSinPagar = e.facturas
    .filter((f) => (f.estado === "Unpaid" || f.estado === "Processing") && cuentaDe(f))
    .map((f) => ({ f, cs: deSuCuenta(f).filter((c) => c.estado === "COBRADO") }))
    .filter((x) => x.cs.length > 0);
  agregar("MERCURY-COBRADO-SIN-PAGAR", cobradasSinPagar, (x) => [docFactura(x.f), ...x.cs.map(docCobro)], (xs) => ({
    codigo: "MERCURY-COBRADO-SIN-PAGAR",
    severidad: "ALTA",
    titulo: `${facturas_(xs.length)} sin pagar en Mercury con su cobro cobrado en Nexus`,
    detalle: "Uno de los dos está mal: o la plata entró y en Mercury no se registró el pago de la factura, o el cobro se marcó cobrado sin que entrara.",
    montos: montosPorMoneda(xs.map((x) => x.f)),
    plata: xs.map((x) => ({ clave: `fm:${x.f.id}`, moneda: x.f.moneda, monto: x.f.monto })),
    donde: "MERCURY",
    pasos: [
      "Busca en Mercury, en los movimientos, si entró la plata de esa factura.",
      "Si entró: márcala pagada en Mercury. Con la copia siguiente la línea se cierra sola.",
      "Si no entró: el cobro no está cobrado. Ábrelo en Cobranza y sácalo de cobrado, con el motivo.",
    ],
    queSignificaAceptar: "Que la plata entró por otro lado y la factura queda así en Mercury. Déjalo escrito en el motivo.",
    queHacer: "Registrar el pago en Mercury o revertir el cobro en Nexus.",
    resuelve: "COBRANZA",
    items: xs.map((x) => ({
      texto: `${textoFactura(x.f)} → ${x.cs.map(textoCobro).join("; ")}`,
      monto: x.f.monto,
      moneda: x.f.moneda,
      fila: identidadDeFila(`fm:${x.f.id}`, [docFactura(x.f), ...x.cs.map(docCobro)]),
    })),
  }));

  /* ── 7. Anulada en Mercury, con un cobro que la sigue nombrando ─────────────────── */
  const anuladasConCobro = e.facturas
    .filter((f) => f.estado === "Cancelled")
    .map((f) => ({ f, cs: cobrosDeFactura.get(f.id) ?? [] }))
    .filter((x) => x.cs.length > 0);
  agregar("MERCURY-ANULADA-CON-COBRO", anuladasConCobro, (x) => [docFactura(x.f), ...x.cs.map(docCobro)], (xs) => ({
    codigo: "MERCURY-ANULADA-CON-COBRO",
    severidad: "ALTA",
    titulo: `${facturas_(xs.length)} anuladas en Mercury que un cobro de Nexus sigue nombrando`,
    detalle: "La factura ya no vale en Mercury, pero el cobro dice que es la suya.",
    montos: montosPorMoneda(xs.flatMap((x) => x.cs)),
    plata: xs.flatMap((x) => x.cs.map((c) => ({ clave: `c:${c.id}`, moneda: c.moneda, monto: c.monto }))),
    donde: "NEXUS",
    pasos: [
      "Mira en Mercury si se emitió otra factura en su lugar.",
      "Si hay otra: anota su número en el cobro.",
      "Si no: revierte la factura del cobro en Cobranza (vuelve a estar por facturar).",
    ],
    queSignificaAceptar: "Que el cobro igual corresponde a esa factura anulada. Casi nunca es así.",
    queHacer: "Anotar la factura nueva en el cobro o revertir su factura.",
    resuelve: "COBRANZA",
    items: xs.map((x) => ({
      texto: `${textoFactura(x.f)} → ${x.cs.map(textoCobro).join("; ")}`,
      monto: x.cs.reduce((s, c) => s + c.monto, 0),
      moneda: x.f.moneda,
      fila: identidadDeFila(`fm:${x.f.id}`, [docFactura(x.f), ...x.cs.map(docCobro)]),
    })),
  }));

  /* ── 8. El monto de la factura no es el de sus cobros ───────────────────────────── */
  const montosDistintos = vivas
    .filter((f) => cuentaDe(f))
    .map((f) => ({ f, cs: deSuCuenta(f) }))
    .filter((x) => x.cs.length > 0 && x.cs.every((c) => c.moneda === x.f.moneda) && centavos(x.cs.reduce((s, c) => s + c.monto, 0)) !== centavos(x.f.monto));
  const monedaDistinta = vivas
    .filter((f) => cuentaDe(f))
    .map((f) => ({ f, cs: deSuCuenta(f) }))
    .filter((x) => x.cs.some((c) => c.moneda !== x.f.moneda));
  agregar("MERCURY-MONTO-DISTINTO", [...montosDistintos, ...monedaDistinta], (x) => [docFactura(x.f), ...x.cs.map(docCobro)], (xs) => ({
    codigo: "MERCURY-MONTO-DISTINTO",
    severidad: "MEDIA",
    titulo: `${facturas_(xs.length)} de Mercury por otro monto que sus cobros`,
    detalle: "Una factura puede cubrir varias cuotas: acá la suma de los cobros que la nombran no da el monto de la factura (o está en otra moneda).",
    montos: [],
    documentos: xs.flatMap((x) => [`fm:${x.f.id}`, ...x.cs.map((c) => `c:${c.id}`)]),
    donde: "PREGUNTANDO",
    pasos: [
      "Compara la factura de Mercury con el plan de pago del servicio en Nexus.",
      "Si la factura está bien, corrige los cobros (monto o número) en Cobranza.",
      "Si la factura está mal, corrígela o anúlala en Mercury y emite la buena.",
    ],
    queSignificaAceptar: "Que la diferencia es correcta: un descuento, un ajuste o un pago parcial acordado.",
    queHacer: "Corregir los cobros o la factura.",
    resuelve: "COBRANZA",
    items: xs.map((x) => ({
      texto: `${textoFactura(x.f)} → ${x.cs.map(textoCobro).join("; ")}`,
      nota: `Factura ${plata(x.f.monto, x.f.moneda)} · cobros ${textoDeMontos(montosPorMoneda(x.cs))}`,
      fila: identidadDeFila(`fm:${x.f.id}`, [docFactura(x.f), ...x.cs.map(docCobro)]),
    })),
  }));

  /* ── 9 y 10. Cobros facturados sin número, y facturas sin cobro ─────────────────── */
  /* Un cobro facturado (o cobrado) de una cuenta con cliente de Mercury y sin número de Mercury: se le busca su factura
     entre las que ningún cobro nombra, de la misma moneda, de un cliente de esa cuenta, a 60 días, y por el mismo monto
     con hasta US$1 de diferencia: medido el 2026-10-02, los cobros de ACCCSA dicen US$712 y sus facturas US$712,50. */
  const nombradas = new Set(cobrosDeFactura.keys());
  const libres = vivas.filter((f) => cuentaDe(f) && !nombradas.has(f.id));
  const tomadas = new Set<string>();
  const sinNumero = e.cobros
    .filter((c) => conCliente.has(c.cuentaId) && (c.fechaEmision || c.estado === "COBRADO") && !numeroDeMercury(c.numeroFactura))
    .sort((a, b) => a.fechaProgramada.localeCompare(b.fechaProgramada));
  const propuesta = new Map<string, FacturaMercuryParaCruzar>();
  const diferencia = (f: FacturaMercuryParaCruzar, c: CobroParaCruzarMercury) => Math.abs(centavos(f.monto) - centavos(c.monto));
  for (const c of sinNumero) {
    const ref = c.fechaEmision ?? c.fechaProgramada;
    const f = libres
      .filter((x) => !tomadas.has(x.id) && cuentaDe(x) === c.cuentaId && x.moneda === c.moneda && diferencia(x, c) <= 100 && Math.abs(dias(x.invoiceDate, ref)) <= 60)
      .sort((a, b) => diferencia(a, c) - diferencia(b, c) || Math.abs(dias(a.invoiceDate, ref)) - Math.abs(dias(b.invoiceDate, ref)))[0];
    if (f) {
      propuesta.set(c.id, f);
      tomadas.add(f.id);
    }
  }
  const faltaNumero = sinNumero.filter((c) => propuesta.has(c.id)).map((c) => ({ c, f: propuesta.get(c.id)! }));
  agregar("MERCURY-FALTA-NUMERO", faltaNumero, (x) => [docCobro(x.c), docFactura(x.f)], (xs) => ({
    codigo: "MERCURY-FALTA-NUMERO",
    severidad: "MEDIA",
    titulo: `${cobros_(xs.length)} facturados sin el número de su factura de Mercury`,
    detalle: "Mercury tiene una factura de esa cuenta por el mismo monto y en fechas cercanas que ningún otro cobro nombra. Con el número anotado, Nexus compara el cobro con su factura.",
    montos: [],
    documentos: xs.flatMap((x) => [`c:${x.c.id}`, `fm:${x.f.id}`]),
    donde: "NEXUS",
    pasos: ["Abre el cobro en Cobranza y anota el número que propone la fila.", "Si no es esa factura, márcala «Está bien así» con el motivo."],
    queSignificaAceptar: "Que esa factura no es la de este cobro.",
    queHacer: "Anotar el número de factura en el cobro.",
    resuelve: "COBRANZA",
    items: xs.map((x) => ({
      texto: textoCobro(x.c),
      nota: `Es la ${x.f.numero} del ${x.f.invoiceDate} por ${plata(x.f.monto, x.f.moneda)} (${estadoDe(x.f.estado)})${
        diferencia(x.f, x.c) ? `. El cobro dice ${plata(x.c.monto, x.c.moneda)}: corrígelo también` : ""
      }`,
      fila: identidadDeFila(`c:${x.c.id}`, [docCobro(x.c), docFactura(x.f)]),
    })),
  }));

  /* Facturados sin número y sin factura posible, de cuentas que facturan por Mercury, emitidos antes de la última copia. */
  const cuentaMercury = new Set(e.cuentas.filter((c) => c.via === "MERCURY").map((c) => c.id));
  const sinFactura = sinNumero.filter(
    (c) =>
      !propuesta.has(c.id) &&
      cuentaMercury.has(c.cuentaId) &&
      c.fechaEmision &&
      (!e.copiaAl || dias(e.copiaAl, c.fechaEmision) >= DIAS_DE_GRACIA_MERCURY),
  );
  agregar("MERCURY-COBRO-SIN-FACTURA", sinFactura, (c) => [docCobro(c)], (cs) => ({
    codigo: "MERCURY-COBRO-SIN-FACTURA",
    severidad: "MEDIA",
    titulo: `${cobros_(cs.length)} facturados en Nexus sin una factura en Mercury por ese monto`,
    detalle: "El cobro dice que se facturó, pero Mercury no tiene una factura de esa cuenta por ese monto en fechas cercanas.",
    montos: montosPorMoneda(cs),
    plata: cs.map((c) => ({ clave: `c:${c.id}`, moneda: c.moneda, monto: c.monto })),
    donde: "MERCURY",
    pasos: [
      "Busca la factura en Mercury por el cliente.",
      "Si existe: anota su número en el cobro (si el monto es otro, corrige el cobro).",
      "Si no se emitió: emítela en Mercury, o revierte la factura del cobro en Cobranza.",
    ],
    queSignificaAceptar: "Que se facturó fuera de Mercury. Anota dónde en el cobro.",
    queHacer: "Emitir la factura o corregir el cobro.",
    resuelve: "COBRANZA",
    items: cs.map((c) => ({ texto: textoCobro(c), nota: `Facturado el ${c.fechaEmision}`, monto: c.monto, moneda: c.moneda, fila: identidadDeFila(`c:${c.id}`, [docCobro(c)]) })),
  }));

  /* Historia, la misma regla que Odoo: una factura YA PAGADA de antes del primer cobro que Nexus tiene de su cuenta (o de
     un año anterior, si la cuenta no tiene cobros) es de antes de que Nexus planificara la cuenta. Medido el 2026-10-02:
     las tres de ACCCSA de diciembre de 2025. ⚠ Una sin pagar nunca es historia: es plata que alguien debe. */
  const primerCobro = new Map<string, string>();
  for (const c of e.cobros) {
    const p = primerCobro.get(c.cuentaId);
    if (p === undefined || c.fechaProgramada < p) primerCobro.set(c.cuentaId, c.fechaProgramada);
  }
  const esHistoria = (f: FacturaMercuryParaCruzar) => {
    if (f.estado !== "Paid") return false;
    const p = primerCobro.get(cuentaDe(f)!);
    if (p !== undefined) return f.invoiceDate < p;
    return e.copiaAl !== null && f.invoiceDate.slice(0, 4) < e.copiaAl.slice(0, 4);
  };
  const sinCobroOHistoria = libres.filter((f) => !tomadas.has(f.id));
  const historia = sinCobroOHistoria.filter(esHistoria).length;
  const sinCobro = sinCobroOHistoria.filter((f) => !esHistoria(f));
  agregar("MERCURY-FACTURA-SIN-COBRO", sinCobro, (f) => [docFactura(f)], (fs) => {
    const porCobrar = fs.filter((f) => f.estado !== "Paid");
    return {
      codigo: "MERCURY-FACTURA-SIN-COBRO",
      severidad: porCobrar.length ? "ALTA" : "MEDIA",
      titulo: `${facturas_(fs.length)} de Mercury que ningún cobro de Nexus tiene`,
      detalle: `Son de clientes emparejados, pero ningún cobro de su cuenta las nombra ni coincide con ellas: Nexus no las cuenta.${porCobrar.length ? ` Por cobrar: ${textoDeMontos(montosPorMoneda(porCobrar))}.` : ""}${historia ? ` No se cuentan ${historia === 1 ? "1 factura ya pagada" : `${historia} facturas ya pagadas`} de antes del primer cobro que Nexus tiene de su cuenta: son historia.` : ""}`,
      montos: montosPorMoneda(porCobrar),
      plata: porCobrar.map((f) => ({ clave: `fm:${f.id}`, moneda: f.moneda, monto: f.monto })),
      documentos: fs.map((f) => `fm:${f.id}`),
      donde: "NEXUS",
      pasos: [
        "Abre la cuenta en Cobranza y busca la cuota que corresponde a la factura.",
        "Si la cuota existe: márcala facturada con este número.",
        "Si no existe: agrega el servicio o la cuota que falta, y márcala facturada con este número.",
      ],
      queSignificaAceptar: "Que esta factura no es venta de Smarteam (un reembolso, un cobro a nombre de otro).",
      queHacer: "Cargar o marcar facturada la cuota que corresponde.",
      resuelve: "COBRANZA",
      items: fs.map((f) => ({
        texto: textoFactura(f),
        nota: `Cuenta: ${nombreCuenta.get(cuentaDe(f)!) ?? "?"}`,
        monto: f.monto,
        moneda: f.moneda,
        fila: identidadDeFila(`fm:${f.id}`, [docFactura(f)]),
      })),
    };
  });

  /* ── 11. Plata que entró y no es de ninguna factura ─────────────────────────────── */
  const usadas = new Set([...pago.values()].map((m) => m.id));
  const primera = [...e.facturas].sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate))[0]?.invoiceDate ?? null;
  const sueltas = e.entradas.filter((m) => !usadas.has(m.id) && (!primera || m.fecha >= primera));
  const docEntrada = (m: EntradaParaCruzar): Documento => ({ clave: `mov:${m.id}`, huella: [centavos(m.monto), m.fecha].join("|") });
  agregar("MERCURY-ENTRADA-SIN-FACTURA", sueltas, (m) => [docEntrada(m)], (ms) => ({
    codigo: "MERCURY-ENTRADA-SIN-FACTURA",
    severidad: "BAJA",
    titulo: `${ms.length === 1 ? "1 entrada de plata" : `${ms.length} entradas de plata`} en Mercury que no corresponden a ninguna factura pagada`,
    detalle: "Plata que entró de alguien que no es una cuenta propia, y que no se pudo atar a una factura de Mercury pagada. Puede ser el pago de varias facturas juntas, de una factura que en Mercury sigue sin pagar, o un ingreso que no es venta.",
    montos: [],
    documentos: ms.map((m) => `mov:${m.id}`),
    donde: "PREGUNTANDO",
    pasos: [
      "Mira de quién es y de qué es.",
      "Si paga una factura que en Mercury sigue sin pagar: márcala pagada en Mercury.",
      "Si paga varias facturas juntas, o no es venta (un reembolso, un aporte): márcala «Está bien así» diciendo qué es.",
    ],
    queSignificaAceptar: "Que se sabe de qué es esa plata. Escríbelo en el motivo: es lo que queda para el cierre del mes.",
    queHacer: "Identificar de qué es la plata.",
    resuelve: "COBRANZA",
    items: ms.map((m) => ({ texto: `${m.fecha} · ${nombreDeQuienPago(m.quien) || "(sin nombre)"}`, monto: m.monto, moneda: "USD", fila: identidadDeFila(`mov:${m.id}`, [docEntrada(m)]) })),
  }));

  return out.sort(
    (a, b) => Number(a.aceptada) - Number(b.aceptada) || (SEVERIDAD_ORDEN[a.severidad] ?? 9) - (SEVERIDAD_ORDEN[b.severidad] ?? 9),
  );
}

/** Lo que se le cuenta a quien mira, arriba de la lista (la misma forma que «Lo que no cuadra» de Odoo). */
export function medidoMercury(e: EstadoMercury): {
  cobros: number;
  facturas: number;
  otrosDocumentos: number;
  cuentasSinVinculo: number;
  cuentasTotales: number;
} {
  const conCliente = new Set(e.clientes.flatMap((c) => (c.cuentaId ? [c.cuentaId] : [])));
  const mercury = e.cuentas.filter((c) => c.via === "MERCURY");
  return {
    cobros: e.cobros.filter((c) => conCliente.has(c.cuentaId) || mercury.some((m) => m.id === c.cuentaId)).length,
    facturas: e.facturas.filter((f) => f.estado !== "Cancelled").length,
    otrosDocumentos: e.facturas.filter((f) => f.estado === "Cancelled").length,
    cuentasSinVinculo: mercury.filter((c) => !conCliente.has(c.id)).length,
    cuentasTotales: mercury.length,
  };
}
