/**
 * lib/cobranza/libro-alex.ts
 *
 * El libro de Alex contra Nexus, fila por fila. PURO: recibe las filas ya leídas
 * (libro-alex-lectura.ts) y lo que Nexus tiene (cuentas, cobros, espejo de Odoo, aliados), y devuelve
 * UNA PROPUESTA POR DOCUMENTO del libro: si coincide, qué no coincide y qué haría una persona.
 *
 * ── ⭐ LA REGLA MADRE ────────────────────────────────────────────────────────────
 * Si la importación vieja de Nexus y el libro no coinciden, MANDA EL LIBRO (decisión de Alex,
 * 2026-09-12). Por eso cada propuesta empuja a Nexus hacia el libro, nunca al revés. Con una
 * excepción que decidió él mismo: lo cobrado se queda cobrado, salvo tres facturas.
 *
 * ── ⛔ LO QUE ESTO NO HACE ───────────────────────────────────────────────────────
 * No escribe nada, y ninguna propuesta es «pasalo a Cobrado». La plata que entró la confirma una
 * persona con nombre desde el cronograma (INV3): así entraron 83 cobros en verde por el color de una
 * celda de este mismo libro. Lo más que dice una propuesta es «si entró, registralo vos».
 *
 * ── LO QUE HAY QUE SABER PARA LEERLO ─────────────────────────────────────────────
 * 1. El mismo documento está en varias pestañas (el mes de Odoo y la «Hoja 9»; Mercury y «Operación
 *    Recaudo»; todas en el Compendio). Se agrupa por número y se avisa cuando las pestañas no dicen lo
 *    mismo. El Compendio solo aporta lo que no está en ninguna otra.
 * 2. El monto que se compara es el NETO, sin IVA, como los cobros de Nexus. El del espejo si la factura
 *    está; si no, total ÷ 1,13 solo para una factura de Odoo de una cuenta nacional que ya facturó con
 *    IVA; si no, queda vacío y se compara el total del libro tal cual, con «confirmar IVA» si la
 *    diferencia es justo el 13 %.
 * 3. ⛔ En «No inscritos» el libro llama «pagado» a total menos adeudado: no es un depósito (Areya
 *    figura con 10.900 pagados y su facturación empieza en septiembre). Nunca se propone como cobrado.
 * 4. Una fila puede cubrir varias cuotas o varios servicios: Bluesat 950 = 250 + 700; ALMOTEC, una
 *    factura de 6.900 neto para tres cuotas de 2.300 facturadas el mismo día.
 */
import { esDocumentoVivo } from "./odoo/diferencias";
import { centavos, fmtMontoLibro, IVA_COSTA_RICA, subconjuntoUnico } from "./montos";
import { candidatasPorNombre, claveSociedad, type SociedadConocida, type ViaDeNombre } from "./sociedades";
import { normalizarTexto, type ColorLibro, type EstadoLibro, type FilaLibro, type SeccionLibro } from "./libro-alex-lectura";

/* ── Lo que Nexus tiene ─────────────────────────────────────────────────────────── */

export type CuentaParaLibro = {
  cuentaId: string;
  nombre: string;
  razonSocial: string | null;
  cedulaJuridica: string | null;
  /** NACIONAL | INTERNACIONAL */
  tipo: string;
  /** ODOO | MERCURY | OTRA (QuickBooks) */
  viaCobro: string;
};

export type VinculoParaLibro = {
  odooPartnerId: number;
  odooPartnerNombre: string;
  cuentaId: string | null;
  ignorado: boolean;
};

export type FacturaParaLibro = {
  odooMoveId: number;
  numero: string;
  odooPartnerId: number;
  odooPartnerNombre: string;
  moneda: string;
  montoNeto: number;
  montoImpuesto: number;
  moveType: string;
  state: string;
  paymentState: string;
  /** `YYYY-MM-DD` */
  invoiceDate: string;
};

export type CobroParaLibro = {
  id: string;
  cuentaId: string;
  servicioId: string;
  servicio: string;
  periodo: string;
  /** `YYYY-MM-DD` */
  fechaProgramada: string;
  fechaEmision: string | null;
  monto: number;
  moneda: string;
  estado: string;
  /** Quién lo puso en Cobrado. `import:…` = lo pintó el color de una celda, no una persona. */
  confirmadoPor: string | null;
  numeroFactura: string | null;
  sinNumeroFacturaMotivo: string | null;
  numCuota: number | null;
  /** `YYYY-MM-DD`. La fecha que Nexus ya tiene anotada: aplicar el libro la muestra al lado de la del texto. */
  promesaPago: string | null;
};

export type ContextoLibro = {
  cuentas: readonly CuentaParaLibro[];
  vinculos: readonly VinculoParaLibro[];
  facturas: readonly FacturaParaLibro[];
  cobros: readonly CobroParaLibro[];
  /** Nombres de los aliados comerciales (HubSpot, Atom Chat, Cooby). */
  aliados: readonly string[];
};

/* ── Decisiones de Alex ─────────────────────────────────────────────────────────── */

/**
 * Documentos del libro que no son venta a un cliente (decisión 6, 2026-09-12). El fondo de marketing de
 * Insider (US$5.346,91) se facturó por Mercury, pero es plata de un aliado: va a Finanzas › Ingresos
 * variables (etapa 10). Contarlo como cartera infla la venta y el % de cobranza.
 */
export const NO_SON_CARTERA: ReadonlyMap<string, string> = new Map([
  ["INV-26", "Es el fondo de marketing de Insider: no es venta a un cliente. Se carga en Finanzas › Ingresos variables."],
  ["INV-27", "Es el fondo de marketing de Insider: no es venta a un cliente. Se carga en Finanzas › Ingresos variables."],
]);

/**
 * Lo cobrado se queda cobrado, SALVO estas tres facturas, que vuelven a por cobrar (decisión 1): Global
 * Supply feb, IIA jun y Seléctrica jun. Las revierte Alex con «Sacar de Cobrado»; cuando lo haga, Nexus y
 * el libro coinciden y esta lista deja de pesar. Cualquier otro Cobrado que el libro dé sin pagar se
 * muestra para revisar, no para sacar.
 */
export const VUELVEN_A_POR_COBRAR: ReadonlySet<string> = new Set(["FAC/2026/0206", "FAC/2026/0295", "FAC/2026/0302"]);

/* ── Números ────────────────────────────────────────────────────────────────────── */

/* El IVA, los centavos, el formato y la búsqueda de combinaciones viven en montos.ts: «Lo que no cuadra»
   (odoo/diferencias.ts) también los usa, y este módulo ya importa de allá. Se re-exportan para no mover a
   nadie que los traía de acá. */
export { centavos, fmtMontoLibro, IVA_COSTA_RICA, subconjuntoUnico };
const round2 = (n: number) => Math.round(n * 100) / 100;

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** «2026-06» → «junio de 2026». */
export function nombreDelPeriodo(periodo: string | null): string {
  if (!periodo) return "sin mes";
  const [anio, mes] = periodo.split("-");
  const nombre = MESES[Number(mes) - 1];
  return nombre && anio ? `${nombre} de ${anio}` : periodo;
}

/* ── Índice ─────────────────────────────────────────────────────────────────────── */

export type IndiceLibro = {
  cuentaPorId: ReadonlyMap<string, CuentaParaLibro>;
  vinculoPorPartner: ReadonlyMap<number, VinculoParaLibro>;
  facturaPorNumero: ReadonlyMap<string, FacturaParaLibro>;
  /** En orden de fecha programada y cuota: el reparto no cambia entre dos aperturas. */
  cobrosPorCuenta: ReadonlyMap<string, readonly CobroParaLibro[]>;
  cobrosPorNumero: ReadonlyMap<string, readonly CobroParaLibro[]>;
  /** Cuentas con alguna factura del espejo que llevó impuesto. */
  cuentasConIva: ReadonlySet<string>;
  sociedades: readonly SociedadConocida[];
  aliados: readonly SociedadConocida[];
};

const agregar = <K, V>(m: Map<K, V[]>, k: K, v: V) => m.set(k, [...(m.get(k) ?? []), v]);

export function indexarContexto(ctx: ContextoLibro): IndiceLibro {
  const vinculoPorPartner = new Map(ctx.vinculos.map((v) => [v.odooPartnerId, v]));
  const cobrosPorCuenta = new Map<string, CobroParaLibro[]>();
  const cobrosPorNumero = new Map<string, CobroParaLibro[]>();
  const orden = [...ctx.cobros].sort(
    (a, b) =>
      a.fechaProgramada.localeCompare(b.fechaProgramada) || (a.numCuota ?? 0) - (b.numCuota ?? 0) || a.id.localeCompare(b.id),
  );
  for (const c of orden) {
    agregar(cobrosPorCuenta, c.cuentaId, c);
    if (c.numeroFactura) agregar(cobrosPorNumero, c.numeroFactura, c);
  }
  const cuentasConIva = new Set<string>();
  for (const f of ctx.facturas) {
    const cuentaId = vinculoPorPartner.get(f.odooPartnerId)?.cuentaId;
    if (cuentaId && f.montoImpuesto > 0) cuentasConIva.add(cuentaId);
  }
  return {
    cuentaPorId: new Map(ctx.cuentas.map((c) => [c.cuentaId, c])),
    vinculoPorPartner,
    facturaPorNumero: new Map(ctx.facturas.map((f) => [f.numero, f])),
    cobrosPorCuenta,
    cobrosPorNumero,
    cuentasConIva,
    sociedades: ctx.cuentas.map((c) => ({ id: c.cuentaId, nombres: [c.nombre, c.razonSocial], cedula: c.cedulaJuridica })),
    aliados: ctx.aliados.map((a) => ({ id: a, nombres: [a] })),
  };
}

/* ── Documentos ─────────────────────────────────────────────────────────────────── */

export type DocumentoLibro = {
  /** El número, o `hoja#fila` en las secciones sin número. */
  clave: string;
  principal: FilaLibro;
  fuentes: readonly FilaLibro[];
};

const SECCIONES_CON_NUMERO: ReadonlySet<SeccionLibro> = new Set(["ODOO", "MERCURY", "COMPENDIO"]);
export const esFactura = (f: FilaLibro) => SECCIONES_CON_NUMERO.has(f.seccion);

/**
 * Agrupa por número lo que está en varias pestañas. El Compendio pone números inventados a las
 * secciones sin factura (NOINS-1, QBS-8): esas filas se dejan, porque la pestaña de origen ya las trae.
 */
export function agruparDocumentos(filas: readonly FilaLibro[]): DocumentoLibro[] {
  const grupos = new Map<string, FilaLibro[]>();
  for (const f of filas) {
    if (f.seccion === "COMPENDIO") {
      const origen = normalizarTexto(f.origen ?? "");
      if (origen.includes("no inscritos") || origen.includes("qbs")) continue;
    }
    const clave = esFactura(f) && f.numero ? f.numero : `${f.hoja}#${f.fila}`;
    agregar(grupos, clave, f);
  }
  const documentos: DocumentoLibro[] = [];
  for (const [clave, fuentes] of grupos) {
    const principal = fuentes.find((f) => f.seccion !== "COMPENDIO") ?? fuentes[0];
    if (principal) documentos.push({ clave, principal, fuentes });
  }
  return documentos;
}

export const esDeOdoo = (f: FilaLibro) =>
  f.seccion === "ODOO" || (f.seccion === "COMPENDIO" && normalizarTexto(f.origen ?? "").startsWith("odoo"));

/** Una nota de crédito o una factura que Odoo anuló o revirtió no es algo que cobrar ni un número de cobro. */
export function documentoSinCobro(doc: DocumentoLibro, idx: IndiceLibro): "NOTA_DE_CREDITO" | "ANULADA" | null {
  const f = doc.principal;
  const factura = f.numero ? idx.facturaPorNumero.get(f.numero) : undefined;
  if ((factura && factura.moveType === "out_refund") || (f.total !== null && f.total < 0)) return "NOTA_DE_CREDITO";
  if (factura && !esDocumentoVivo(factura)) return "ANULADA";
  return null;
}

/* ── No es cartera ──────────────────────────────────────────────────────────────── */

export type AccionDelLibro =
  | "NINGUNA"
  /** Una de las tres que Alex decidió devolver a por cobrar: una persona la saca de Cobrado con motivo. */
  | "SACAR_DE_COBRADO"
  /** El libro la da sin pagar y Nexus en Cobrado, fuera de las tres decididas: se revisa, no se saca. */
  | "REVISAR_COBRADO"
  /** El libro la da por pagada: si entró la plata, la confirma una persona con el comprobante. */
  | "REVISAR_PAGO"
  | "MARCAR_FACTURADO"
  | "AGREGAR_NUMERO"
  | "CARGAR_COBRO"
  | "CARGAR_CUENTA"
  | "EMPAREJAR"
  | "CARGAR_PLAN"
  | "CONFIRMAR_IVA"
  | "INGRESO_NO_VENTA"
  | "COMISION_DE_ALIADO"
  | "ESPERA_DECISION";

export function motivoNoCartera(doc: DocumentoLibro, idx: IndiceLibro): { accion: AccionDelLibro; texto: string } | null {
  const f = doc.principal;
  const decision = f.numero ? NO_SON_CARTERA.get(f.numero) : undefined;
  if (decision) return { accion: "INGRESO_NO_VENTA", texto: decision };
  const aliado = candidatasPorNombre(f.cliente, idx.aliados).find((c) => c.via === "NOMBRE" || c.via === "PARCIAL");
  if (aliado) {
    return {
      accion: "COMISION_DE_ALIADO",
      texto: `${aliado.id} es aliado: lo que paga es comisión de aliado (Cobranza › Aliados), no cartera de un cliente.`,
    };
  }
  return null;
}

/* ── Cuenta ─────────────────────────────────────────────────────────────────────── */

/** Por dónde se llegó a la cuenta. NUMERO y ODOO son hechos; las de nombre, candidatas. */
export type ViaDeCuenta = "NUMERO" | "ODOO" | ViaDeNombre;
export type CuentaResuelta = { cuentaId: string; nombre: string; via: ViaDeCuenta };

export type ResolucionDeCuenta =
  | { tipo: "una"; cuenta: CuentaResuelta }
  | { tipo: "varias"; posibles: CuentaResuelta[] }
  /** El cliente de Odoo existe y no está emparejado con ninguna cuenta. */
  | { tipo: "sin-emparejar"; clienteDeOdoo: string; posibles: CuentaResuelta[] }
  | { tipo: "ninguna" };

export function resolverCuenta(doc: DocumentoLibro, idx: IndiceLibro): ResolucionDeCuenta {
  const f = doc.principal;
  const resuelta = (cuentaId: string, via: ViaDeCuenta): CuentaResuelta => ({
    cuentaId,
    nombre: idx.cuentaPorId.get(cuentaId)?.nombre ?? cuentaId,
    via,
  });
  const porNombre = () => candidatasPorNombre(f.cliente, idx.sociedades).map((c) => resuelta(c.id, c.via));

  /* 1. Alguien ya anotó este número en un cobro: es el hecho más fuerte que hay. */
  if (f.numero) {
    const cuentas = [...new Set((idx.cobrosPorNumero.get(f.numero) ?? []).map((c) => c.cuentaId))];
    if (cuentas.length === 1 && cuentas[0]) return { tipo: "una", cuenta: resuelta(cuentas[0], "NUMERO") };
  }

  /* 2. La factura está en el espejo: su cliente de Odoo dice la cuenta, por el vínculo (no por
        `FacturaOdoo.cuentaId`, que puede ir un paso atrás). */
  const factura = f.numero ? idx.facturaPorNumero.get(f.numero) : undefined;
  if (factura) {
    const cuentaId = idx.vinculoPorPartner.get(factura.odooPartnerId)?.cuentaId;
    if (cuentaId) return { tipo: "una", cuenta: resuelta(cuentaId, "ODOO") };
    return { tipo: "sin-emparejar", clienteDeOdoo: factura.odooPartnerNombre, posibles: porNombre() };
  }

  /* 3. Factura de Odoo que el espejo todavía no trae (las de septiembre): el nombre del libro es el del
        cliente de Odoo, tal cual. */
  if (esDeOdoo(f)) {
    const clave = claveSociedad(f.cliente);
    const vinculos = [...idx.vinculoPorPartner.values()].filter((v) => !v.ignorado && claveSociedad(v.odooPartnerNombre) === clave);
    const cuentas = [...new Set(vinculos.flatMap((v) => (v.cuentaId ? [v.cuentaId] : [])))];
    if (cuentas.length === 1 && cuentas[0]) return { tipo: "una", cuenta: resuelta(cuentas[0], "ODOO") };
    if (!cuentas.length && vinculos[0]) {
      return { tipo: "sin-emparejar", clienteDeOdoo: vinculos[0].odooPartnerNombre, posibles: porNombre() };
    }
  }

  /* 4. Por el nombre: candidatas, nunca una elección. */
  const posibles = porNombre();
  if (posibles.length === 1 && posibles[0]) return { tipo: "una", cuenta: posibles[0] };
  if (posibles.length > 1) return { tipo: "varias", posibles };
  return { tipo: "ninguna" };
}

/* ── Neto ───────────────────────────────────────────────────────────────────────── */

export type NetoDelDocumento = { monto: number | null; fuente: "ESPEJO" | "IVA_13" | null };

export function netoDelDocumento(doc: DocumentoLibro, cuentaId: string | null, idx: IndiceLibro): NetoDelDocumento {
  const f = doc.principal;
  const factura = f.numero ? idx.facturaPorNumero.get(f.numero) : undefined;
  if (factura && (!f.moneda || factura.moneda === f.moneda)) return { monto: factura.montoNeto, fuente: "ESPEJO" };
  const cuenta = cuentaId ? idx.cuentaPorId.get(cuentaId) : undefined;
  /* ÷1,13 solo en una factura de Odoo: es la plataforma que factura con el IVA de Costa Rica. Un total de
     QuickBooks o de «No inscritos» es el monto del contrato, y dividirlo inventaba una diferencia (Bluesat). */
  if (f.total !== null && esDeOdoo(f) && cuenta?.tipo === "NACIONAL" && idx.cuentasConIva.has(cuenta.cuentaId)) {
    return { monto: round2(f.total / IVA_COSTA_RICA), fuente: "IVA_13" };
  }
  return { monto: null, fuente: null };
}

/* ── Qué cuotas cubre cada factura ──────────────────────────────────────────────── */

export type FormaDeAtadura = "NUMERO" | "FECHA_DE_EMISION" | "MES" | "MES_VARIOS" | "MES_UNICO";

export type PedidoDeCuotas = {
  clave: string;
  cuentaId: string;
  numero: string | null;
  /** El neto, o el total del libro si el neto no se sabe. */
  objetivo: number | null;
  moneda: string | null;
  periodo: string | null;
  fechaFactura: string | null;
};

export type CuotasAsignadas = { cobros: CobroParaLibro[]; forma: FormaDeAtadura };

export function pedidoDeCuotas(doc: DocumentoLibro, cuentaId: string, neto: NetoDelDocumento): PedidoDeCuotas {
  const f = doc.principal;
  return {
    clave: doc.clave,
    cuentaId,
    numero: f.numero,
    objetivo: neto.monto ?? f.total,
    moneda: f.moneda,
    periodo: f.periodo,
    fechaFactura: f.fechaFactura,
  };
}

/**
 * Reparte las cuotas de Nexus entre las facturas del libro, de la señal más fuerte a la más débil, y con
 * TODAS las facturas en cada señal antes de bajar a la siguiente:
 *  0. el número ya anotado en el cobro (si `porNumero`);
 *  1. cuotas marcadas facturadas el MISMO DÍA de la factura que suman su monto, una o varias (ALMOTEC);
 *  2. la cuota del mismo mes con el mismo monto;
 *  3. varias cuotas del mismo mes que la suman (dos servicios en una factura);
 *  4. la única cuota libre del mes aunque el monto no dé (si `unicaDelMes`), para mostrar la diferencia.
 *
 * ⚠ Por señal y no factura por factura. Hecho factura por factura, Ecoquintas de junio (pagada) se
 * llevaba por el mes las dos cuotas que Alex facturó el 3-sep con FAC/2026/0336, y Atlas INV-47 (7.350)
 * se llevaba por ser la única del mes la cuota de 2.450 que es de INV-50.
 *
 * Con dos combinaciones posibles no se ata: la clave queda en `ambiguas`. Una cuota con número no entra
 * al reparto, salvo por el paso 0.
 */
export function asignarCuotas(
  pedidos: readonly PedidoDeCuotas[],
  idx: IndiceLibro,
  opciones: { porNumero: boolean; unicaDelMes: boolean },
): { asignadas: Map<string, CuotasAsignadas>; ambiguas: Set<string> } {
  const asignadas = new Map<string, CuotasAsignadas>();
  const ambiguas = new Set<string>();
  const usados = new Set<string>();
  const orden = [...pedidos].sort((a, b) => (a.numero ?? a.clave).localeCompare(b.numero ?? b.clave));
  const asignar = (p: PedidoDeCuotas, cobros: CobroParaLibro[], forma: FormaDeAtadura) => {
    asignadas.set(p.clave, { cobros, forma });
    for (const c of cobros) usados.add(c.id);
    ambiguas.delete(p.clave);
  };
  const libres = (p: PedidoDeCuotas) =>
    (idx.cobrosPorCuenta.get(p.cuentaId) ?? []).filter(
      (c) => !usados.has(c.id) && c.estado !== "SIN_DATO" && !c.numeroFactura && (!p.moneda || c.moneda === p.moneda),
    );
  const pendientes = () => orden.filter((p) => !asignadas.has(p.clave));

  if (opciones.porNumero) {
    for (const p of orden) {
      const conNumero = p.numero ? (idx.cobrosPorNumero.get(p.numero) ?? []).filter((c) => c.cuentaId === p.cuentaId) : [];
      if (conNumero.length) asignar(p, [...conNumero], "NUMERO");
    }
  }
  for (const p of pendientes()) {
    if (p.objetivo === null || !p.fechaFactura) continue;
    const mismoDia = libres(p).filter((c) => c.fechaEmision === p.fechaFactura);
    const r = subconjuntoUnico(mismoDia, (c) => centavos(c.monto), centavos(p.objetivo), 1, 6);
    if (r === "varios") ambiguas.add(p.clave);
    else if (r) asignar(p, r, "FECHA_DE_EMISION");
  }
  for (const p of pendientes()) {
    if (p.objetivo === null) continue;
    const meta = centavos(p.objetivo);
    const exacta = libres(p).find((c) => c.periodo === p.periodo && centavos(c.monto) === meta);
    if (exacta) asignar(p, [exacta], "MES");
  }
  for (const p of pendientes()) {
    if (p.objetivo === null) continue;
    const delMes = libres(p).filter((c) => c.periodo === p.periodo);
    const r = subconjuntoUnico(delMes, (c) => centavos(c.monto), centavos(p.objetivo), 2, 4);
    if (r === "varios") ambiguas.add(p.clave);
    else if (r) asignar(p, r, "MES_VARIOS");
  }
  if (opciones.unicaDelMes) {
    for (const p of pendientes()) {
      if (ambiguas.has(p.clave)) continue;
      const delMes = libres(p).filter((c) => c.periodo === p.periodo);
      if (delMes.length === 1 && delMes[0]) asignar(p, [delMes[0]], "MES_UNICO");
    }
  }
  return { asignadas, ambiguas };
}

/* ── La propuesta ───────────────────────────────────────────────────────────────── */

export type Veredicto =
  | "COINCIDE"
  | "NO_COINCIDE"
  /** Nexus no puede decidirlo solo: varias cuentas, varias combinaciones o el IVA. */
  | "REVISAR"
  /** La cuenta está y el cobro no. */
  | "FALTA_EN_NEXUS"
  | "SIN_CUENTA"
  /** «No inscritos»: firmado y sin factura. */
  | "SIN_FACTURA"
  | "NO_ES_CARTERA";

export const VEREDICTOS: readonly Veredicto[] = [
  "NO_COINCIDE",
  "REVISAR",
  "FALTA_EN_NEXUS",
  "SIN_CUENTA",
  "SIN_FACTURA",
  "NO_ES_CARTERA",
  "COINCIDE",
];

export type FuenteDelLibro = { hoja: string; fila: number; color: ColorLibro; estado: EstadoLibro | null };

export type CobroAtado = {
  id: string;
  periodo: string;
  monto: number;
  moneda: string;
  estado: string;
  confirmadoPor: string | null;
  fechaEmision: string | null;
  numeroFactura: string | null;
  servicio: string;
  numCuota: number | null;
};

export type PropuestaDelLibro = {
  clave: string;
  seccion: SeccionLibro;
  fuentes: FuenteDelLibro[];
  cliente: string;
  proyecto: string | null;
  numero: string | null;
  periodo: string | null;
  fechaFactura: string | null;
  moneda: string | null;
  /** El total del libro («Total en moneda», con IVA si lo lleva). Nunca el pendiente de Odoo. */
  total: number | null;
  neto: number | null;
  netoFuente: NetoDelDocumento["fuente"];
  estadoLibro: EstadoLibro | null;
  /**
   * Total menos adeudado, en QuickBooks y No inscritos. ⛔ Es una resta del libro, no un depósito:
   * se muestra, nunca se propone como cobrado.
   */
  pagadoSegunLibro: number | null;
  anotacion: string | null;
  cuenta: CuentaResuelta | null;
  cuentasPosibles: CuentaResuelta[];
  cobros: CobroAtado[];
  /** «950 = 250 + 700»: la cuota del libro partida en los servicios de Nexus que la cubren. */
  desglose: number[] | null;
  veredicto: Veredicto;
  accion: AccionDelLibro;
  propuesta: string;
  diferencias: string[];
  avisos: string[];
};

export type ComparacionDelLibro = {
  filas: PropuestaDelLibro[];
  conteo: Record<Veredicto, number>;
};

const ETIQUETA_ESTADO: Record<EstadoLibro, string> = { PAGADO: "pagada", SIN_PAGAR: "sin pagar", ACTIVA: "activa (fecha futura)" };
const ETIQUETA_COLOR: Record<ColorLibro, string> = {
  VENCIDA: "amarilla (vencida)",
  EN_GRACIA: "verde (en gracia)",
  SIN_COLOR: "sin color",
  OTRO: "de otro color",
};

const atado = (c: CobroParaLibro): CobroAtado => ({
  id: c.id,
  periodo: c.periodo,
  monto: c.monto,
  moneda: c.moneda,
  estado: c.estado,
  confirmadoPor: c.confirmadoPor,
  fechaEmision: c.fechaEmision,
  numeroFactura: c.numeroFactura,
  servicio: c.servicio,
  numCuota: c.numCuota,
});

/** Lo que dicen las pestañas cuando no dicen lo mismo. El Compendio no opina: es un resumen. */
function contradicciones(doc: DocumentoLibro): string[] {
  const propias = doc.fuentes.filter((f) => f.seccion !== "COMPENDIO");
  const avisos: string[] = [];
  const conEstado = propias.filter((f) => f.estado !== null);
  const primeraEstado = conEstado[0];
  const otroEstado = conEstado.find((f) => f.estado !== primeraEstado?.estado);
  if (primeraEstado?.estado && otroEstado?.estado) {
    avisos.push(
      `Las pestañas no dicen lo mismo: «${primeraEstado.hoja}» fila ${primeraEstado.fila} la da ${ETIQUETA_ESTADO[primeraEstado.estado]} y «${otroEstado.hoja}» fila ${otroEstado.fila}, ${ETIQUETA_ESTADO[otroEstado.estado]}.`,
    );
  }
  const conColor = propias.filter((f) => f.color !== "OTRO");
  const primeraColor = conColor[0];
  const otroColor = conColor.find((f) => f.color !== primeraColor?.color);
  if (primeraColor && otroColor) {
    avisos.push(
      `Las pestañas no la pintan igual: «${primeraColor.hoja}» fila ${primeraColor.fila} ${ETIQUETA_COLOR[primeraColor.color]} y «${otroColor.hoja}» fila ${otroColor.fila} ${ETIQUETA_COLOR[otroColor.color]}.`,
    );
  }
  return avisos;
}

/** Sin estado en la pestaña (una factura que solo está en el Compendio): lo dice su pendiente. */
function estadoDelDocumento(f: FilaLibro): EstadoLibro | null {
  if (f.estado) return f.estado;
  if (f.seccion !== "COMPENDIO" || f.pendiente === null) return null;
  return f.pendiente > 0 ? "SIN_PAGAR" : "PAGADO";
}

function base(doc: DocumentoLibro): PropuestaDelLibro {
  const f = doc.principal;
  return {
    clave: doc.clave,
    seccion: f.seccion,
    fuentes: doc.fuentes.map((x) => ({ hoja: x.hoja, fila: x.fila, color: x.color, estado: x.estado })),
    cliente: f.cliente,
    proyecto: f.proyecto,
    numero: f.numero,
    periodo: f.periodo,
    fechaFactura: f.fechaFactura,
    moneda: f.moneda,
    total: f.total,
    neto: null,
    netoFuente: null,
    estadoLibro: estadoDelDocumento(f),
    pagadoSegunLibro:
      (f.seccion === "QUICKBOOKS" || f.seccion === "NO_INSCRITOS") && f.total !== null && f.pendiente !== null
        ? round2(f.total - f.pendiente)
        : null,
    anotacion: f.anotacion,
    cuenta: null,
    cuentasPosibles: [],
    cobros: [],
    desglose: null,
    veredicto: "REVISAR",
    accion: "NINGUNA",
    propuesta: "",
    diferencias: [],
    avisos: contradicciones(doc),
  };
}

/** De dos acciones, la que más importa. Sacar de Cobrado primero: es plata que Nexus da por entrada. */
const PRIORIDAD: readonly AccionDelLibro[] = [
  "SACAR_DE_COBRADO",
  "REVISAR_COBRADO",
  "REVISAR_PAGO",
  "MARCAR_FACTURADO",
  "CONFIRMAR_IVA",
  "AGREGAR_NUMERO",
  "NINGUNA",
];
const masImportante = (acciones: readonly AccionDelLibro[]): AccionDelLibro =>
  PRIORIDAD.find((a) => acciones.includes(a)) ?? "NINGUNA";

/** Una cuenta que no se pudo resolver sola. */
function sinCuenta(p: PropuestaDelLibro, res: Exclude<ResolucionDeCuenta, { tipo: "una" }>): PropuestaDelLibro {
  const nombres = (xs: CuentaResuelta[]) => xs.map((x) => x.nombre).join(", ");
  if (res.tipo === "sin-emparejar") {
    return {
      ...p,
      cuentasPosibles: res.posibles,
      veredicto: "SIN_CUENTA",
      accion: "EMPAREJAR",
      propuesta:
        `El cliente de Odoo «${res.clienteDeOdoo}» no está emparejado con ninguna cuenta. Emparejalo en Cobranza › Odoo` +
        (res.posibles.length ? ` (puede ser ${nombres(res.posibles)})` : "; si la cuenta no existe, hay que cargarla") +
        ".",
    };
  }
  if (res.tipo === "varias") {
    return {
      ...p,
      cuentasPosibles: res.posibles,
      veredicto: "REVISAR",
      accion: "EMPAREJAR",
      propuesta: `Hay ${res.posibles.length} cuentas que pueden ser esta: ${nombres(res.posibles)}. Nexus no elige: decidí cuál es.`,
    };
  }
  return {
    ...p,
    veredicto: "SIN_CUENTA",
    accion: p.seccion === "NO_INSCRITOS" ? "CARGAR_PLAN" : "CARGAR_CUENTA",
    propuesta:
      p.seccion === "NO_INSCRITOS"
        ? `Firmado y sin factura, y ninguna cuenta de Nexus se llama «${p.cliente}». Cargá la cuenta, el servicio y el plan: queda programado hasta confirmar que hay factura.`
        : `Ninguna cuenta de Nexus se llama «${p.cliente}». Puede faltar, o estar con otro nombre: la sociedad que factura no siempre es la empresa.`,
  };
}

/* ── Facturas (Odoo, Mercury, Compendio) ────────────────────────────────────────── */

const TEXTO_DE_ACCION: Partial<Record<AccionDelLibro, (numero: string | null, fecha: string | null) => string>> = {
  SACAR_DE_COBRADO: () =>
    "Alex decidió que esta vuelve a por cobrar: sacala de Cobrado desde el cronograma de la cuenta, con el motivo y la fecha real de la factura. Lo hace una persona; Nexus no la mueve solo.",
  REVISAR_COBRADO: () =>
    "Lo cobrado se queda cobrado salvo tres facturas que Alex ya identificó, y esta no es una de ellas. Si tampoco se depositó, sacala de Cobrado desde el cronograma, con motivo: lo decide una persona.",
  REVISAR_PAGO: () =>
    "Si la plata entró, registrá el pago desde el cronograma con el comprobante: lo confirma quien lo ve. Nexus no la pasa a Cobrado por el libro.",
  MARCAR_FACTURADO: (numero, fecha) => `Marcala facturada con el número ${numero ?? "de la factura"} y la fecha ${fecha ?? "del documento"}.`,
  CONFIRMAR_IVA: () => "Confirmá si el monto lleva IVA antes de corregir nada: Nexus guarda los montos sin IVA.",
  AGREGAR_NUMERO: (numero) => `Coincide. Falta anotarle el número ${numero ?? ""}: está propuesto en la pestaña «Números».`,
  NINGUNA: () => "Coincide.",
};

function proponerFactura(
  doc: DocumentoLibro,
  cuenta: CuentaResuelta,
  p0: PropuestaDelLibro,
  neto: NetoDelDocumento,
  asignada: CuotasAsignadas | null,
  ambigua: boolean,
): PropuestaDelLibro {
  const f = doc.principal;
  const p: PropuestaDelLibro = { ...p0, cuenta, neto: neto.monto, netoFuente: neto.fuente };
  if (cuenta.via === "SIGLAS") p.avisos.push(`La cuenta «${cuenta.nombre}» sale solo por las siglas: confirmala antes de tocar nada.`);
  const objetivo = neto.monto ?? f.total;

  if (!asignada && ambigua) {
    return {
      ...p,
      veredicto: "REVISAR",
      propuesta: `Hay más de una combinación de cuotas de ${cuenta.nombre} que suma ${fmtMontoLibro(objetivo, f.moneda)}. Nexus no elige: decidí cuáles cubre esta factura.`,
    };
  }
  if (!asignada) {
    return {
      ...p,
      veredicto: "FALTA_EN_NEXUS",
      accion: "CARGAR_COBRO",
      propuesta:
        `${cuenta.nombre} no tiene un cobro de ${nombreDelPeriodo(f.periodo)} por ${fmtMontoLibro(objetivo, f.moneda)}` +
        `${neto.monto === null ? "" : " neto"}. Manda el libro: falta cargarlo, por cobrar y con su número.`,
    };
  }

  const cobros = asignada.cobros;
  p.cobros = cobros.map(atado);
  if (cobros.length > 1) {
    p.avisos.push(`Una sola factura para ${cobros.length} cuotas de Nexus: ${cobros.map((c) => fmtMontoLibro(c.monto, c.moneda)).join(" + ")}.`);
  }

  const diferencias: string[] = [];
  const acciones: AccionDelLibro[] = [];
  const suma = round2(cobros.reduce((s, c) => s + c.monto, 0));
  const estado = estadoDelDocumento(f);
  const cobrados = cobros.filter((c) => c.estado === "COBRADO");
  const sinCobrar = cobros.filter((c) => c.estado !== "COBRADO");

  if (objetivo !== null && centavos(objetivo) !== centavos(suma)) {
    /* «Confirmar IVA» solo cuando la diferencia ES el 13 %: 712,50 contra 712 es un monto distinto, no un impuesto. */
    const pareceIva = neto.monto === null && f.total !== null && centavos(f.total / IVA_COSTA_RICA) === centavos(suma);
    if (pareceIva) {
      diferencias.push(
        `El libro dice ${fmtMontoLibro(f.total, f.moneda)} y Nexus ${fmtMontoLibro(suma, f.moneda)}: la diferencia es el 13 %. Confirmá si la factura lleva IVA.`,
      );
      acciones.push("CONFIRMAR_IVA");
    } else {
      diferencias.push(
        `Monto: el libro dice ${fmtMontoLibro(objetivo, f.moneda)}${neto.monto === null ? "" : " neto"} y Nexus tiene ${fmtMontoLibro(suma, f.moneda)}.`,
      );
    }
  }
  if ((estado === "SIN_PAGAR" || estado === "ACTIVA") && cobrados.length) {
    const firmas = [...new Set(cobrados.map((c) => c.confirmadoPor ?? "sin firma"))].join(", ");
    diferencias.push(
      `Nexus tiene ${cobrados.length === 1 ? "el cobro" : `${cobrados.length} cobros`} en Cobrado (lo confirmó ${firmas}) y el libro la da ${ETIQUETA_ESTADO[estado]}.`,
    );
    acciones.push(f.numero !== null && VUELVEN_A_POR_COBRAR.has(f.numero) ? "SACAR_DE_COBRADO" : "REVISAR_COBRADO");
  }
  if (estado === "PAGADO" && sinCobrar.length) {
    diferencias.push(
      `El libro la da pagada y en Nexus ${sinCobrar.length === 1 ? "el cobro sigue" : `${sinCobrar.length} cobros siguen`} sin cobrar.`,
    );
    acciones.push("REVISAR_PAGO");
  }
  const sinFacturar = cobros.filter((c) => !c.fechaEmision);
  if (sinFacturar.length) {
    diferencias.push(`En Nexus ${sinFacturar.length === 1 ? "el cobro no está marcado" : `${sinFacturar.length} cobros no están marcados`} facturado.`);
    acciones.push("MARCAR_FACTURADO");
  }
  const otroNumero = cobros.find((c) => c.numeroFactura && f.numero && c.numeroFactura !== f.numero);
  if (otroNumero) diferencias.push(`Nexus le anotó otro número: ${otroNumero.numeroFactura}.`);
  if (f.numero && cobros.some((c) => !c.numeroFactura)) acciones.push("AGREGAR_NUMERO");

  const accion = masImportante(acciones);
  return {
    ...p,
    diferencias,
    accion,
    veredicto: diferencias.length === 0 ? "COINCIDE" : accion === "CONFIRMAR_IVA" && diferencias.length === 1 ? "REVISAR" : "NO_COINCIDE",
    propuesta: TEXTO_DE_ACCION[accion]?.(f.numero, f.fechaFactura) ?? "",
  };
}

/* ── Servicios (QuickBooks, No inscritos, planes de pago) ───────────────────────── */

type ServicioDelLibro = { servicioId: string; descripcion: string; moneda: string; cobros: CobroParaLibro[]; total: number };

function serviciosDeCuenta(cuentaId: string, idx: IndiceLibro): ServicioDelLibro[] {
  const porServicio = new Map<string, CobroParaLibro[]>();
  for (const c of idx.cobrosPorCuenta.get(cuentaId) ?? []) agregar(porServicio, c.servicioId, c);
  return [...porServicio].map(([servicioId, cobros]) => ({
    servicioId,
    descripcion: cobros[0]?.servicio ?? "",
    moneda: cobros[0]?.moneda ?? "",
    cobros,
    total: round2(cobros.reduce((s, c) => s + c.monto, 0)),
  }));
}

const palabrasDe = (s: string) => new Set(normalizarTexto(s).split(/[^a-z0-9]+/).filter((p) => p.length >= 4));

/**
 * Los servicios de la cuenta que suman el total de la fila. Si hay más de una combinación, desempata el
 * nombre del proyecto; si igual no queda una sola, no se ata a ninguna.
 */
function atarServicios(f: FilaLibro, servicios: readonly ServicioDelLibro[]): ServicioDelLibro[] | "varios" | null {
  if (f.total === null) return null;
  const candidatos = servicios.filter((s) => !f.moneda || s.moneda === f.moneda);
  const meta = centavos(f.total);
  const r = subconjuntoUnico(candidatos, (s) => centavos(s.total), meta, 1, 4);
  if (r !== "varios") return r;
  const delProyecto = palabrasDe(f.proyecto ?? "");
  const conNombre = candidatos.filter((s) => [...palabrasDe(s.descripcion)].some((p) => delProyecto.has(p)));
  return conNombre.length ? subconjuntoUnico(conNombre, (s) => centavos(s.total), meta, 1, 4) : "varios";
}

/** La cuota de cada mes, si es la misma en todos: «950 = 250 + 700». */
function desgloseDeCuota(servicios: readonly ServicioDelLibro[]): number[] | null {
  const porMes = new Map<string, number>();
  for (const s of servicios) for (const c of s.cobros) porMes.set(c.periodo, round2((porMes.get(c.periodo) ?? 0) + c.monto));
  if (new Set([...porMes.values()].map(centavos)).size !== 1) return null;
  const cuotas: number[] = [];
  for (const s of servicios) {
    const primera = s.cobros[0];
    if (!primera || new Set(s.cobros.map((c) => centavos(c.monto))).size !== 1) return null;
    cuotas.push(primera.monto);
  }
  return cuotas.sort((a, b) => a - b);
}

function proponerServicio(doc: DocumentoLibro, cuenta: CuentaResuelta, idx: IndiceLibro, p0: PropuestaDelLibro): PropuestaDelLibro {
  const f = doc.principal;
  const p: PropuestaDelLibro = { ...p0, cuenta };
  if (p.pagadoSegunLibro !== null && p.pagadoSegunLibro > 0 && f.seccion === "NO_INSCRITOS") {
    p.avisos.push(
      `El libro da ${fmtMontoLibro(p.pagadoSegunLibro, f.moneda)} por pagado, pero en «No inscritos» eso es total menos adeudado, no un depósito: no se propone como cobrado.`,
    );
  }

  const atados = atarServicios(f, serviciosDeCuenta(cuenta.cuentaId, idx));

  if (f.seccion === "PLAN_DE_PAGO") {
    const servicios = Array.isArray(atados) ? atados : [];
    return {
      ...p,
      cobros: servicios.flatMap((s) => s.cobros.map(atado)),
      veredicto: "REVISAR",
      accion: "ESPERA_DECISION",
      propuesta:
        "Plan de pagos sobre una deuda ya facturada: espera la decisión del cliente (una sola factura o una por cada depósito). Hasta entonces no se toca nada." +
        (servicios.length ? "" : ` Ningún servicio de ${cuenta.nombre} suma ${fmtMontoLibro(f.total, f.moneda)}.`),
    };
  }

  if (atados === "varios") {
    return {
      ...p,
      veredicto: "REVISAR",
      accion: f.seccion === "NO_INSCRITOS" ? "CARGAR_PLAN" : "NINGUNA",
      propuesta: `Hay más de una combinación de servicios de ${cuenta.nombre} que suma ${fmtMontoLibro(f.total, f.moneda)}. Decidí cuáles son.`,
    };
  }
  if (!atados) {
    return {
      ...p,
      veredicto: "FALTA_EN_NEXUS",
      accion: f.seccion === "NO_INSCRITOS" ? "CARGAR_PLAN" : "CARGAR_COBRO",
      propuesta:
        f.seccion === "NO_INSCRITOS"
          ? `${cuenta.nombre} no tiene un servicio que sume ${fmtMontoLibro(f.total, f.moneda)}. Cargá el servicio y su plan: queda programado hasta confirmar que hay factura.`
          : `${cuenta.nombre} no tiene cobros que sumen ${fmtMontoLibro(f.total, f.moneda)}. Manda el libro: cargalos por cobrar; al marcar facturado, «no tengo el número» (QuickBooks no numera en el libro).`,
    };
  }

  const cobros = atados.flatMap((s) => s.cobros);
  const desglose = atados.length > 1 ? desgloseDeCuota(atados) : null;
  const q: PropuestaDelLibro = { ...p, cobros: cobros.map(atado), desglose };
  if (atados.length > 1) {
    q.avisos.push(
      `Una fila del libro para ${atados.length} servicios de Nexus: ${atados.map((s) => s.descripcion).join(" y ")}` +
        (desglose
          ? ` (cuota de ${fmtMontoLibro(round2(desglose.reduce((a, b) => a + b, 0)), f.moneda)} = ${desglose.map((d) => fmtMontoLibro(d, null)).join(" + ")}).`
          : "."),
    );
  }
  const cobrados = cobros.filter((c) => c.estado === "COBRADO");

  if (f.seccion === "NO_INSCRITOS") {
    const diferencias: string[] = [];
    if (cobrados.length) diferencias.push(`Nexus tiene ${cobrados.length} cuota(s) en Cobrado de un servicio que el libro lista sin factura.`);
    const facturados = cobros.filter((c) => c.fechaEmision);
    if (facturados.length) diferencias.push(`Nexus tiene ${facturados.length} cuota(s) marcadas facturadas y el libro no las tiene inscritas.`);
    return {
      ...q,
      diferencias,
      veredicto: "SIN_FACTURA",
      accion: "NINGUNA",
      propuesta: "Nexus ya lo tiene cargado. Queda programado hasta confirmar que hay factura.",
    };
  }

  /* QuickBooks: facturado allá, sin número en el libro. */
  const diferencias: string[] = [];
  const acciones: AccionDelLibro[] = [];
  const pendienteNexus = round2(cobros.filter((c) => c.estado !== "COBRADO").reduce((s, c) => s + c.monto, 0));
  if (f.pendiente !== null && centavos(f.pendiente) !== centavos(pendienteNexus)) {
    diferencias.push(`El libro deja ${fmtMontoLibro(f.pendiente, f.moneda)} adeudado y Nexus ${fmtMontoLibro(pendienteNexus, f.moneda)} sin cobrar.`);
    if (f.pendiente > pendienteNexus && cobrados.length) acciones.push("REVISAR_COBRADO");
    if (f.pendiente < pendienteNexus) acciones.push("REVISAR_PAGO");
  }
  if (cobros.some((c) => !c.fechaEmision)) {
    diferencias.push("En Nexus hay cuotas sin marcar facturadas.");
    acciones.push("MARCAR_FACTURADO");
  }
  const accion = masImportante(acciones);
  return {
    ...q,
    diferencias,
    accion,
    veredicto: diferencias.length ? "NO_COINCIDE" : "COINCIDE",
    propuesta:
      accion === "REVISAR_COBRADO"
        ? "El libro deja más adeudado que Nexus y Nexus tiene cuotas en Cobrado. Si no se depositaron, se sacan de Cobrado desde el cronograma, con motivo: lo decide una persona."
        : accion === "REVISAR_PAGO"
          ? "Si la plata entró, registrá el pago desde el cronograma con el comprobante. Nexus no la pasa a Cobrado por el libro."
          : accion === "MARCAR_FACTURADO"
            ? "Marcá facturadas las cuotas con «no tengo el número»: QuickBooks no numera en el libro."
            : "Coincide.",
  };
}

/* ── Entrada ────────────────────────────────────────────────────────────────────── */

export function compararLibro(filas: readonly FilaLibro[], ctx: ContextoLibro): ComparacionDelLibro {
  const idx = indexarContexto(ctx);
  const documentos = agruparDocumentos(filas);
  const porClave = new Map<string, PropuestaDelLibro>();
  const facturas: Array<{ doc: DocumentoLibro; cuenta: CuentaResuelta; p: PropuestaDelLibro; neto: NetoDelDocumento }> = [];

  for (const doc of documentos) {
    const p = base(doc);
    const noCartera = motivoNoCartera(doc, idx);
    if (noCartera) {
      porClave.set(doc.clave, { ...p, veredicto: "NO_ES_CARTERA", accion: noCartera.accion, propuesta: noCartera.texto });
      continue;
    }
    const res = resolverCuenta(doc, idx);
    if (res.tipo !== "una") {
      porClave.set(doc.clave, sinCuenta(p, res));
      continue;
    }
    if (!esFactura(doc.principal)) {
      porClave.set(doc.clave, proponerServicio(doc, res.cuenta, idx, p));
      continue;
    }
    const sinCobro = documentoSinCobro(doc, idx);
    if (sinCobro) {
      const conNumero = doc.principal.numero ? (idx.cobrosPorNumero.get(doc.principal.numero) ?? []) : [];
      porClave.set(doc.clave, {
        ...p,
        cuenta: res.cuenta,
        cobros: conNumero.map(atado),
        veredicto: sinCobro === "NOTA_DE_CREDITO" ? "REVISAR" : conNumero.length ? "NO_COINCIDE" : "NO_ES_CARTERA",
        propuesta:
          sinCobro === "NOTA_DE_CREDITO"
            ? "Es una nota de crédito: no es algo que cobrar. Qué factura anula lo dice la conciliación de Odoo."
            : conNumero.length
              ? "Odoo la tiene anulada o revertida y Nexus la tiene anotada en un cobro. Soltala con «Cuadrar cronograma»."
              : "Odoo la tiene anulada o revertida: no hay nada que cobrar.",
      });
      continue;
    }
    facturas.push({ doc, cuenta: res.cuenta, p, neto: netoDelDocumento(doc, res.cuenta.cuentaId, idx) });
  }

  const { asignadas, ambiguas } = asignarCuotas(
    facturas.map((x) => pedidoDeCuotas(x.doc, x.cuenta.cuentaId, x.neto)),
    idx,
    { porNumero: true, unicaDelMes: true },
  );
  for (const { doc, cuenta, p, neto } of facturas) {
    porClave.set(doc.clave, proponerFactura(doc, cuenta, p, neto, asignadas.get(doc.clave) ?? null, ambiguas.has(doc.clave)));
  }

  const filasOut = documentos.flatMap((d) => {
    const p = porClave.get(d.clave);
    return p ? [p] : [];
  });
  const conteo: Record<Veredicto, number> = {
    COINCIDE: 0,
    NO_COINCIDE: 0,
    REVISAR: 0,
    FALTA_EN_NEXUS: 0,
    SIN_CUENTA: 0,
    SIN_FACTURA: 0,
    NO_ES_CARTERA: 0,
  };
  for (const p of filasOut) conteo[p.veredicto] += 1;
  return { filas: filasOut, conteo };
}
