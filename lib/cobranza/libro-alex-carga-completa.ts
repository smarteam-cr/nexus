/**
 * lib/cobranza/libro-alex-carga-completa.ts
 *
 * La carga del Excel de Alexander entera, en una corrida: qué cambia en Nexus, en qué orden, con qué firma y
 * qué queda para una persona. PURO: sin Prisma, sin red, sin reloj. Lo orquesta
 * scripts/aplicar-excel-de-alexander.ts con las mismas funciones que usan las pantallas.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────────
 * El Excel de Alex es el medio para poner Nexus al día: cobros, estado de cobranza, números de factura y lo
 * que falta cargar. Con las pantallas eran cuatro lugares y cientos de clics (67 «Es esta», las reversiones de
 * a una, las promesas de a una, «Aplicar» grupo por grupo), sin un lugar donde ver todo lo que iba a cambiar
 * antes de cambiarlo. Acá está el plan completo; el script lo muestra sin escribir y, con permiso, lo aplica.
 *
 * ── LOS PASOS, EN ORDEN ──────────────────────────────────────────────────────────
 *  1. Devolver a por cobrar las tres facturas que Alex decidió (`VUELVEN_A_POR_COBRAR`), con motivo y con la fecha de
 *     emisión de su factura: lo mismo que «Sacar de Cobrado». Si ya volvieron con otra fecha, se corrige solo la fecha.
 *  2. Anotar los números de factura que propone el Excel: lo mismo que «Es esta». Los que propone la copia de
 *     Odoo por monto los confirma una persona.
 *  3. Cargar por cobrar, con número, las facturas que Nexus no tiene, y escribir las anotaciones: lo mismo que
 *     «Aplicar» (`decidirCarga` y, en el script, `aplicarLote`).
 *  4. Registrar las promesas de pago que traen fecha en la anotación: lo mismo que «Registrar promesa».
 *  5. Solo con una firma dada a propósito (`--cobrar-con-firma`): registrar como cobradas las que el Excel da
 *     pagadas, con la fecha de pago del Excel. Sin esa firma se listan y no se tocan.
 * Cada paso se calcula sobre lo que deja el anterior —en memoria en el simulacro, releyendo la base al
 * aplicar—, así correrlo dos veces no cambia nada la segunda (`sinCambios`).
 *
 * ── ⛔ LO QUE NO HACE ────────────────────────────────────────────────────────────
 *  · No toca montos: el neto de Nexus contra el total con IVA del Excel no es una diferencia (decisión 3).
 *  · No saca de Cobrado nada fuera de las tres de Alex (decisión 1): lo lista para una persona.
 *  · No carga Insider (no es cartera, decisión 6), ni planes de pago (Kaizen, JCB), ni QuickBooks o No
 *    inscritos: no traen número ni fecha de factura.
 *  · No elige una cuenta por parecido, no empareja clientes de Odoo y no decide el IVA de una factura de Odoo
 *    que la copia no tiene.
 *  · No carga una factura que puede ser una cuota que Nexus ya tiene en otro mes o en otra cuenta: medido el
 *    2026-09-13, unas 30 de las 78 que faltaban ya estaban así, y cargarlas duplicaba cartera.
 *  · No inventa fechas: sin fecha de pago en el Excel no hay cobrado; sin fecha en la anotación no hay promesa.
 */
import path from "node:path";
import {
  centavos,
  compararLibro,
  fmtMontoLibro,
  indexarContexto,
  nombreDelPeriodo,
  subconjuntoUnico,
  VUELVEN_A_POR_COBRAR,
  type CobroParaLibro,
  type ContextoLibro,
  type FormaDeAtadura,
  type IndiceLibro,
  type PropuestaDelLibro,
} from "./libro-alex";
import {
  anotacionesNuevas,
  decidirCarga,
  descripcionDelServicioDelLibro,
  montoACargar,
  planDelLibro,
  type AnotacionDeCobro,
  type CobroACargar,
  type FacturaDelLibroACargar,
  type GrupoDelLibro,
  type IvaDelLibro,
  type PedidoDeAplicacion,
  type PedidoDeGrupo,
} from "./libro-alex-aplicar";
import type { FilaLibro } from "./libro-alex-lectura";
import { esDocumentoVivo, facturasDeVariasCuotas, montosPorMoneda, type MontoEnMoneda } from "./odoo/diferencias";
import { proponerNumeros, type PatchDeNumero } from "./odoo/numero-propuesta";
import { candidatasPorNombre } from "./sociedades";
import { laMismaVenta, textoDeLaMismaVenta } from "./venta-duplicada";

/* ── Los argumentos ─────────────────────────────────────────────────────────────── */

export type ArgumentosDeCarga = {
  /** La ruta del Excel, tal como la escribió quien corre el script. */
  archivo: string;
  /** true = escribe. Solo con --apply, --firma, --respaldo y ALLOW_PROD_WRITE=1 en el mismo comando. */
  aplicar: boolean;
  /** El correo de quien aplica: firma cada cambio y la bitácora. */
  firma: string | null;
  /** Carpeta absoluta, fuera del repo, donde se guardan las filas antes de tocarlas. */
  respaldo: string | null;
  /** El correo de quien da por cobradas las que el Excel da pagadas. null = no se tocan. */
  cobrarConFirma: string | null;
};

/** Un correo, y no una firma de cargador (`import:…`): ese «:» es lo que la delata. */
const EMAIL = /^[^\s@:]+@[^\s@:]+\.[^\s@:]+$/;

export const USO_DEL_SCRIPT = [
  "Uso:",
  "  npx tsx scripts/aplicar-excel-de-alexander.ts <ruta.xlsx>                       (simulacro: no escribe nada)",
  "  npx tsx scripts/aplicar-excel-de-alexander.ts <ruta.xlsx> --cobrar-con-firma=<correo>   (simulacro con los cobrados)",
  "  ALLOW_PROD_WRITE=1 npx tsx scripts/aplicar-excel-de-alexander.ts <ruta.xlsx> --apply --firma=<correo> --respaldo=<carpeta fuera del repo> [--cobrar-con-firma=<correo>]",
].join("\n");

/**
 * Lee los argumentos y decide si el script puede escribir. ⛔ Escribe solo con las cuatro cosas juntas:
 * `--apply`, `--firma`, `--respaldo` fuera del repo y `ALLOW_PROD_WRITE=1`. Una bandera que no se conoce corta
 * todo: `--aplly` no puede terminar en un simulacro que alguien lea como aplicado.
 */
export function leerArgumentos(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  raizDelRepo: string,
): { ok: true; args: ArgumentosDeCarga } | { ok: false; error: string } {
  const posicionales: string[] = [];
  let aplicar = false;
  let firma: string | null = null;
  let respaldo: string | null = null;
  let cobrarConFirma: string | null = null;
  for (const a of argv) {
    if (a === "--apply") aplicar = true;
    else if (a.startsWith("--firma=")) firma = a.slice("--firma=".length).trim();
    else if (a.startsWith("--respaldo=")) respaldo = a.slice("--respaldo=".length).trim();
    else if (a.startsWith("--cobrar-con-firma=")) cobrarConFirma = a.slice("--cobrar-con-firma=".length).trim();
    else if (a.startsWith("--")) {
      return { ok: false, error: `No conozco «${a}». Se aceptan --apply, --firma=, --respaldo= y --cobrar-con-firma=.` };
    } else posicionales.push(a);
  }
  const [archivo, ...sobran] = posicionales;
  if (!archivo) return { ok: false, error: "Falta la ruta del Excel de Alexander (.xlsx)." };
  if (sobran.length) return { ok: false, error: `Sobra «${sobran[0]}»: va una sola ruta de Excel.` };
  if (!/\.xlsx$/i.test(archivo)) return { ok: false, error: `«${archivo}» no es un .xlsx.` };
  if (firma !== null && !EMAIL.test(firma)) {
    return { ok: false, error: `--firma tiene que ser el correo de una persona (llegó «${firma}»).` };
  }
  if (cobrarConFirma !== null && !EMAIL.test(cobrarConFirma)) {
    return { ok: false, error: `--cobrar-con-firma tiene que ser el correo de una persona (llegó «${cobrarConFirma}»).` };
  }
  if (!aplicar) {
    return { ok: true, args: { archivo, aplicar, firma, respaldo: respaldo ? path.resolve(respaldo) : null, cobrarConFirma } };
  }
  if (!firma) return { ok: false, error: "--apply exige --firma=<correo>: cada cambio queda firmado por quien lo aplica." };
  if (!respaldo) {
    return { ok: false, error: "--apply exige --respaldo=<carpeta fuera del repo>: antes de escribir se guardan ahí las filas que se tocan." };
  }
  const destino = path.resolve(respaldo);
  const relativo = path.relative(path.resolve(raizDelRepo), destino);
  if (relativo === "" || (!relativo.startsWith("..") && !path.isAbsolute(relativo))) {
    return { ok: false, error: "La carpeta del respaldo tiene que estar fuera del repo: son datos de clientes y no van a git." };
  }
  if (env.ALLOW_PROD_WRITE !== "1") {
    return { ok: false, error: "--apply exige ALLOW_PROD_WRITE=1 en el mismo comando." };
  }
  return { ok: true, args: { archivo, aplicar: true, firma, respaldo: destino, cobrarConFirma } };
}

/* ── El mismo libro ─────────────────────────────────────────────────────────────── */

const CAMPOS_DE_FILA = [
  "hoja",
  "fila",
  "seccion",
  "numero",
  "cliente",
  "proyecto",
  "fechaFactura",
  "fechaVencimiento",
  "fechaPago",
  "total",
  "pendiente",
  "moneda",
  "estado",
  "periodo",
  "color",
  "anotacion",
  "origen",
] as const satisfies ReadonlyArray<keyof FilaLibro>;

/**
 * La huella de un libro leído: dos lotes con la misma huella son el mismo Excel. Por campos en orden fijo y no
 * con `JSON.stringify` de la fila: la base guarda la fila como jsonb, que no conserva el orden de las llaves.
 */
export function huellaDelLibro(filas: readonly FilaLibro[]): string {
  return JSON.stringify(filas.map((f) => CAMPOS_DE_FILA.map((k) => f[k] ?? null)));
}

/* ── El plan ────────────────────────────────────────────────────────────────────── */

/** El id que lleva en el plan un cobro que todavía no existe: el de una factura que se carga en esta corrida. */
export const PREFIJO_COBRO_NUEVO = "nuevo:";

/** Lo que cada paso manda al chokepoint del cobro (`cambiarEstadoCobro`). Por tipo, nada más que esto. */
export type PatchDeCobro = {
  estado?: "POR_COBRAR" | "COBRADO";
  fechaEmision?: string;
  fechaCobro?: string;
  promesaPago?: string;
  reversion?: { motivo: string; numeroFactura?: string };
};

type CuotaDelPlan = {
  cobroId: string;
  cuentaId: string;
  cuentaNombre: string;
  periodo: string;
  monto: number;
  moneda: string;
  estado: string;
};

export type ReversionDelExcel = CuotaDelPlan & { numero: string; confirmadoPor: string | null; patch: PatchDeCobro };
/**
 * Una de las tres de Alex que ya está por cobrar con otra fecha de emisión que la de su factura. Medido el 2026-09-14:
 * la primera corrida las devolvió con la fecha de quincena (IIA FAC/2026/0295: 30-jun contra el 10-jun de la factura),
 * y los días de atraso salían mal.
 */
export type FechaDelExcel = CuotaDelPlan & {
  numero: string;
  antes: string | null;
  fecha: string;
  fuente: string;
  patch: { fechaEmision: string };
};
export type NumeroDelExcel = CuotaDelPlan & { numero: string; cambiaFechaEmision: boolean; patch: PatchDeNumero };
export type CargaDelExcel = {
  clave: string;
  numero: string;
  cuentaId: string;
  cuentaNombre: string;
  periodo: string;
  fechaFactura: string;
  /** Neto, sin IVA. */
  monto: number;
  moneda: string;
  pagadaSegunLibro: boolean;
  /** La línea de la anotación que va a la bitácora del cobro nuevo, si la trae. */
  anotacion: string | null;
};
export type PromesaDelExcel = {
  cobroId: string;
  cuentaId: string;
  cuentaNombre: string;
  numero: string | null;
  periodo: string | null;
  monto: number | null;
  moneda: string | null;
  promesa: string;
  antes: string | null;
  anotacion: string;
};
export type PagadaDelExcel = CuotaDelPlan & { numero: string | null; fechaPago: string; fuente: string };

export type MotivoParaUnaPersona =
  | "SIN_CUENTA"
  | "POSIBLE_DUPLICADO"
  | "FALTA_IVA"
  | "COBRADO_SIN_PAGAR"
  | "NO_COINCIDE"
  | "ESPERA_DECISION"
  | "REVISAR"
  | "FECHA_FUTURA"
  | "NUMERO_DE_LA_COPIA"
  | "PAGADA_SIN_FECHA"
  | "ANOTACION_SIN_COBRO"
  | "CARGAR_A_MANO"
  | "RECHAZADA";

export type ParaUnaPersona = {
  motivo: MotivoParaUnaPersona;
  clave: string;
  cliente: string;
  numero: string | null;
  monto: number | null;
  moneda: string | null;
  detalle: string;
};

export type NoSeCargaDelExcel = { clave: string; cliente: string; numero: string | null; monto: number | null; moneda: string | null; motivo: string };

export type LineaDeBitacora = { cuentaId: string; cobroId: string | null; contenido: string };

export type OpcionesDelPlan = {
  /** `YYYY-MM-DD` en Costa Rica: decide qué factura o fecha de pago es futura. */
  hoyISO: string;
  /** El día en que se subió el lote: «este mes» de una anotación. */
  referenciaISO: string;
  /** Quien aplica: va en el texto de la carga. */
  firma: string;
  /** Quien da por cobradas las pagadas. null = no se tocan. */
  cobrarConFirma: string | null;
  /** Las anotaciones del libro que ya están en la bitácora: no se escriben dos veces. */
  bitacora: readonly LineaDeBitacora[];
};

export type PlanDeCargaCompleta = {
  reversiones: ReversionDelExcel[];
  /** La fecha de emisión que pasa a la de su factura, en las de Alex que ya estaban por cobrar. */
  fechas: FechaDelExcel[];
  numeros: NumeroDelExcel[];
  cargas: CargaDelExcel[];
  /** Lo que se le pasa a `aplicarLote`: solo lo que `decidirCarga` acepta hoy. */
  pedido: PedidoDeAplicacion;
  /** Las anotaciones sobre cobros que ya existen (las de las facturas nuevas van con su carga). */
  anotaciones: AnotacionDeCobro[];
  promesas: PromesaDelExcel[];
  /** Lo que el Excel da pagado y Nexus no. Se registra solo con `cobrarConFirma`. */
  pagadas: PagadaDelExcel[];
  paraUnaPersona: ParaUnaPersona[];
  noSeCarga: NoSeCargaDelExcel[];
  /** true = no hay nada que escribir: es lo que tiene que dar la segunda corrida. */
  sinCambios: boolean;
  /** Cómo quedaría Nexus después de aplicar el plan. Sirve para probar que la segunda corrida no hace nada. */
  contextoFinal: ContextoLibro;
  bitacoraFinal: LineaDeBitacora[];
};

/** Las ataduras que se pueden usar para mover algo: por el número, o por un monto exacto. */
const ATADURAS_SEGURAS: ReadonlySet<FormaDeAtadura> = new Set(["NUMERO", "FECHA_DE_EMISION", "MES", "MES_VARIOS"]);

/**
 * ¿Las cuotas atadas a esta factura son de verdad las suyas? Por el número o por un monto exacto, y sin
 * «Monto:» entre las diferencias. ⚠ «La única del mes» (`MES_UNICO`) no alcanza: Iberorutas 0328 caía en la
 * cuota de US$150.
 */
export function atadoSeguro(p: Pick<PropuestaDelLibro, "atadura" | "diferencias" | "cobros">): boolean {
  return p.cobros.length > 0 && p.atadura !== null && ATADURAS_SEGURAS.has(p.atadura) && !p.diferencias.some((d) => d.startsWith("Monto:"));
}

/**
 * El IVA con que se carga un grupo. null = no hace falta (la copia de Odoo trae el neto) o no se sabe.
 * ⚠ Mercury es la plataforma de los clientes del exterior: sus facturas no llevan el IVA de Costa Rica. Medido el
 * 2026-09-13: las facturas de Mercury del Excel valen lo mismo que su cuota en Nexus, ninguna por 13 % más.
 */
export function ivaParaLaCarga(g: Pick<GrupoDelLibro, "pideIva" | "ivaSugerido" | "plataforma">): IvaDelLibro | null {
  if (!g.pideIva) return null;
  if (g.ivaSugerido) return g.ivaSugerido;
  return g.plataforma === "MERCURY" ? "SIN_IVA" : null;
}

/**
 * Cuántos días alrededor de la factura se busca una cuota que ya puede ser ella: cuatro meses, la misma ventana
 * que «Lo que no cuadra» usa para las facturas de varias cuotas. Medido el 2026-09-13: Selvatura facturó enero a
 * marzo el 5-may (110 días), y con 100 días la carga la habría duplicado.
 */
export const DIAS_DE_VENTANA_DUPLICADO = 120;
/** En otra cuenta la evidencia es más débil: un mes y medio. */
const DIAS_DE_VENTANA_OTRA_CUENTA = 45;

const DIA = 86_400_000;
const dias = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DIA;
const ESTADO_EN_PALABRAS: Readonly<Record<string, string>> = { PROGRAMADO: "programada", POR_COBRAR: "por cobrar", COBRADO: "cobrada" };
const NOMBRE_DE_MONEDA: Readonly<Record<string, string>> = { USD: "dólares", CRC: "colones" };

/**
 * Los cobros que un documento del libro ya ató con seguridad y no pueden ser otra factura. ⚠ Sin los atados
 * por ser «la única cuota del mes» (`MES_UNICO`): esa atadura muestra una diferencia, no dice de quién es la
 * cuota. Medido el 2026-09-13: la cuota de abril de TEC-AE estaba atada así a la 0272, y sin ella la carga no
 * veía que FAC/2026/0298 (4.860) es marzo + abril + mayo.
 */
export function cobrosAtadosConSeguridad(propuestas: Iterable<Pick<PropuestaDelLibro, "atadura" | "cobros">>): Set<string> {
  const out = new Set<string>();
  for (const p of propuestas) {
    if (p.atadura === "MES_UNICO") continue;
    for (const c of p.cobros) out.add(c.id);
  }
  return out;
}

/** ¿Dos montos son el mismo con una tolerancia de un dólar o del 5 %? ACCCSA 712,50 contra 712; MTS 440 contra 420. */
const parecidos = (a: number, b: number) => Math.abs(centavos(a) - centavos(b)) <= Math.max(100, Math.round(centavos(b) * 0.05));

/**
 * ¿Nexus ya tiene esta factura cargada como otra cosa, o la factura misma está mal? Busca, en este orden:
 *  0. en la copia de Odoo, una factura viva del mismo cliente por el mismo importe en la otra moneda: una de las
 *     dos salió en la moneda equivocada (Servica FAC/2026/0231, ₡90 contra FAC/2026/0268, US$90);
 *  1. sin número y sin atar con seguridad a otro documento del libro, una cuota de la misma cuenta y moneda, a
 *     hasta `DIAS_DE_VENTANA_DUPLICADO` días, parecida al neto o al total;
 *  2. dos o tres cuotas de esa cuenta que suman el neto (Construtecho INV-15 = 4.560 + 550 + 2.280);
 *  3. una cuota de otra cuenta cuyo nombre se parece al de la factura (Librería Internacional está dos veces);
 *  4. la misma venta en otro servicio de la cuenta (`laMismaVenta`): cuotas sin número a pocos días que juntas o por
 *     separado pueden ser esta factura, o un servicio sin cobros que arranca cerca. Medido el 2026-09-14: Real Shipping
 *     INV-9 (6.000) contra sus cuotas de 1.500 + 1.500, que no suman la factura, y Alliance RH INV-46 contra la entrada
 *     de «Capacitación Sales».
 * Devuelve el porqué en palabras, o null. ⚠ No frena por las dudas: la factura va a la lista de una persona.
 */
export function posibleDuplicado(
  f: Pick<FacturaDelLibroACargar, "numero" | "cliente" | "fechaFactura" | "moneda" | "total">,
  monto: number,
  cuentaId: string,
  idx: IndiceLibro,
  atados: ReadonlySet<string>,
): string | null {
  const documento = idx.facturaPorNumero.get(f.numero);
  if (documento) {
    const gemela = [...idx.facturaPorNumero.values()].find(
      (o) =>
        o.numero !== documento.numero &&
        o.odooPartnerId === documento.odooPartnerId &&
        o.moneda !== documento.moneda &&
        centavos(o.montoNeto) === centavos(documento.montoNeto) &&
        esDocumentoVivo(o),
    );
    if (gemela) {
      return `Odoo tiene para el mismo cliente ${gemela.numero} por el mismo importe en ${NOMBRE_DE_MONEDA[gemela.moneda] ?? gemela.moneda}: una de las dos salió en la moneda equivocada. Resolvelo en Odoo antes de cargarla (Cobranza › Odoo › «Lo que no cuadra»).`;
    }
  }
  const libres = (id: string, ventana: number) =>
    (idx.cobrosPorCuenta.get(id) ?? []).filter(
      (c) =>
        !atados.has(c.id) &&
        !c.numeroFactura &&
        c.estado !== "SIN_DATO" &&
        c.moneda === f.moneda &&
        dias(c.fechaEmision ?? c.fechaProgramada, f.fechaFactura) <= ventana,
    );
  const parecida = (c: CobroParaLibro) => parecidos(c.monto, monto) || parecidos(c.monto, f.total);
  const cuota = (c: CobroParaLibro) =>
    `${nombreDelPeriodo(c.periodo)} por ${fmtMontoLibro(c.monto, c.moneda)} (${ESTADO_EN_PALABRAS[c.estado] ?? c.estado})`;
  const nombre = idx.cuentaPorId.get(cuentaId)?.nombre ?? "La cuenta";

  const propias = libres(cuentaId, DIAS_DE_VENTANA_DUPLICADO);
  const una = propias.find(parecida);
  if (una) {
    return `${nombre} ya tiene una cuota sin número de ${cuota(una)}: puede ser esta factura. Si lo es, anotale el número en vez de cargarla.`;
  }
  const suma = subconjuntoUnico(propias, (c) => centavos(c.monto), centavos(monto), 2, 3);
  if (suma === "varios") {
    return `${nombre} tiene varias combinaciones de cuotas sin número que suman ${fmtMontoLibro(monto, f.moneda)}: puede ser esta factura. Decidí cuáles cubre antes de cargar otra.`;
  }
  if (suma) {
    return `${nombre} ya tiene ${suma.length} cuotas sin número que suman ${fmtMontoLibro(monto, f.moneda)} (${suma.map(cuota).join(" + ")}): puede ser esta factura.`;
  }
  for (const candidata of candidatasPorNombre(f.cliente, idx.sociedades)) {
    if (candidata.id === cuentaId || candidata.via === "SIGLAS") continue;
    const ajena = libres(candidata.id, DIAS_DE_VENTANA_OTRA_CUENTA).find(parecida);
    if (ajena) {
      return `La cuenta «${idx.cuentaPorId.get(candidata.id)?.nombre ?? candidata.id}» tiene una cuota sin número de ${cuota(ajena)}: puede ser esta misma factura en otra cuenta. Resolvé cuál es la cuenta antes de cargar.`;
    }
  }
  const venta = laMismaVenta(
    { cuentaId, numero: f.numero, fecha: f.fechaFactura, monto, moneda: f.moneda, cobroIds: [], servicioIds: [] },
    (idx.cobrosPorCuenta.get(cuentaId) ?? []).filter((c) => !atados.has(c.id)),
    idx.serviciosPorCuenta.get(cuentaId) ?? [],
  );
  if (venta) {
    return `${nombre} tiene, a pocos días y en otro servicio, ${textoDeLaMismaVenta(venta)}: puede ser la misma venta, y cargar esta factura la contaría dos veces. Decidilo antes de cargarla.`;
  }
  return null;
}

/**
 * Las cuotas que suma una factura del Excel que la comparación ató solo por ser la única del mes, con la regla de «Lo que
 * no cuadra» (`facturasDeVariasCuotas`): así la carga y la página dicen lo mismo. null = no hay una combinación única.
 *
 * Medido el 2026-09-14: la carga dejó escrito «Marcala facturada con FAC/2026/0328» sobre la cuota de US$150 de Iberorutas,
 * y la página —con razón— dice que la 0328 (US$7.100) es mayo + junio (3.550 cada una). Lo mismo con Honda FAC/2026/0311
 * (US$1.000 = mayo + junio de 500). ⛔ Propone y nada más: el número lo anota una persona.
 */
export function cuotasQueCubre(
  p: Pick<PropuestaDelLibro, "numero" | "cuenta" | "neto" | "total" | "moneda" | "fechaFactura">,
  idx: IndiceLibro,
  atados: ReadonlySet<string>,
): CobroParaLibro[] | null {
  const objetivo = p.neto ?? p.total;
  if (!p.numero || !p.cuenta || objetivo === null || !p.fechaFactura || !p.moneda) return null;
  const espejo = idx.facturaPorNumero.get(p.numero);
  const factura = {
    id: p.numero,
    odooMoveId: espejo?.odooMoveId ?? 0,
    cuentaId: p.cuenta.cuentaId,
    moneda: p.moneda,
    invoiceDate: espejo?.invoiceDate ?? p.fechaFactura,
    montoNeto: objetivo,
    moveType: espejo?.moveType ?? "out_invoice",
    state: espejo?.state ?? "posted",
    paymentState: espejo?.paymentState ?? "not_paid",
  };
  /* Las cuotas facturadas que ningún otro documento del libro ató con seguridad: las mismas que mira la página. */
  const cuotas = (idx.cobrosPorCuenta.get(p.cuenta.cuentaId) ?? []).filter(
    (c) => !atados.has(c.id) && c.estado !== "SIN_DATO" && (c.fechaEmision !== null || c.estado === "COBRADO"),
  );
  const [v] = facturasDeVariasCuotas([factura], cuotas);
  return v ? v.cobros : null;
}

const cuotaEnPalabras = (c: Pick<CobroParaLibro, "periodo" | "monto" | "moneda" | "estado">) =>
  `${nombreDelPeriodo(c.periodo)} por ${fmtMontoLibro(c.monto, c.moneda)} (${ESTADO_EN_PALABRAS[c.estado] ?? c.estado})`;

/** Lo que se le dice a una persona de una factura que cubre varias cuotas y la comparación ató a otra. */
export function textoDeCuotasQueCubre(p: Pick<PropuestaDelLibro, "numero" | "cliente" | "cuenta" | "neto" | "total" | "moneda" | "cobros">, cubre: readonly CobroParaLibro[]): string {
  const [unica] = p.cobros;
  return (
    `Monto: el libro dice ${fmtMontoLibro(p.neto ?? p.total, p.moneda)}${p.neto === null ? "" : " neto"} y la factura cubre ${cubre.length} cuotas de ${p.cuenta?.nombre ?? p.cliente}: ` +
    `${cubre.map(cuotaEnPalabras).join(" + ")}. Es lo mismo que propone Cobranza › Odoo › «Lo que no cuadra»: anotá ${p.numero ?? "el número"} en cada una desde el cronograma` +
    (unica ? `, no en la cuota de ${nombreDelPeriodo(unica.periodo)} por ${fmtMontoLibro(unica.monto, unica.moneda)}, que no es de esta factura.` : ".")
  );
}

/** El texto de la bitácora de una fecha de emisión que pasa a la de su factura. Nombra la firma y de dónde sale. */
export function textoDeFechaDelExcel(f: Pick<FechaDelExcel, "numero" | "antes" | "fecha" | "fuente">, firma: string): string {
  return (
    `${firma} corrigió la fecha de emisión de ${f.antes ?? "(sin fecha)"} a ${f.fecha}, la de la factura ${f.numero} según el Excel de Alexander (${f.fuente}). ` +
    "Es una de las tres facturas que Alex decidió devolver a por cobrar el 2026-09-12; volvió con la fecha de la quincena."
  );
}

/** El texto de la bitácora de un cobro que se da por cobrado desde el Excel. Nombra la firma y el comprobante. */
export function textoDeCobradoDelExcel(p: Pick<PagadaDelExcel, "numero" | "fechaPago" | "fuente">, firma: string): string {
  return (
    `${firma} registró este cobro como cobrado desde el Excel de Alexander (${p.fuente}): ` +
    `${p.numero ? `la factura ${p.numero}` : "la factura"} figura pagada el ${p.fechaPago}. ` +
    "El comprobante es ese Excel; si aparece el depósito, anotale su referencia."
  );
}

function conCambios(ctx: ContextoLibro, cambios: ReadonlyMap<string, Partial<CobroParaLibro>>): ContextoLibro {
  if (!cambios.size) return ctx;
  return {
    ...ctx,
    cobros: ctx.cobros.map((c) => {
      const x = cambios.get(c.id);
      return x ? { ...c, ...x } : c;
    }),
  };
}

function conCobrosNuevos(ctx: ContextoLibro, cobros: readonly CobroACargar[]): ContextoLibro {
  if (!cobros.length) return ctx;
  const nuevos: CobroParaLibro[] = cobros.map((c) => ({
    id: `${PREFIJO_COBRO_NUEVO}${c.numero}`,
    cuentaId: c.cuentaId,
    servicioId: `${PREFIJO_COBRO_NUEVO}${c.cuentaId}:${c.moneda}`,
    servicio: descripcionDelServicioDelLibro(c.moneda),
    periodo: c.periodo,
    fechaProgramada: c.fechaFactura,
    fechaEmision: c.fechaFactura,
    monto: c.monto,
    moneda: c.moneda,
    estado: c.estado,
    confirmadoPor: null,
    numeroFactura: c.numero,
    sinNumeroFacturaMotivo: null,
    numCuota: null,
    promesaPago: null,
  }));
  return { ...ctx, cobros: [...ctx.cobros, ...nuevos] };
}

const SECCIONES_DE_FACTURA: ReadonlySet<string> = new Set(["ODOO", "MERCURY", "COMPENDIO"]);
const fuenteDe = (p: Pick<PropuestaDelLibro, "fuentes">) => {
  const [f] = p.fuentes;
  return f ? `«${f.hoja}» fila ${f.fila}` : "el Excel";
};

/** La fecha de pago que dicen las pestañas de este documento. `distintas` = no dicen la misma. */
function fechaDePago(filas: readonly FilaLibro[], p: Pick<PropuestaDelLibro, "fuentes">): { fecha: string | null; distintas: boolean } {
  const suyas = new Set(p.fuentes.map((f) => `${f.hoja}#${f.fila}`));
  const fechas = [
    ...new Set(filas.filter((f) => suyas.has(`${f.hoja}#${f.fila}`)).flatMap((f) => (f.fechaPago ? [f.fechaPago] : []))),
  ].sort();
  return { fecha: fechas[0] ?? null, distintas: fechas.length > 1 };
}

/**
 * El plan completo, sobre lo que Nexus tiene en `ctx`. Cada paso ve lo que dejó el anterior.
 */
export function planDeCargaCompleta(filas: readonly FilaLibro[], ctx0: ContextoLibro, o: OpcionesDelPlan): PlanDeCargaCompleta {
  const paraUnaPersona: ParaUnaPersona[] = [];
  const vistas = new Set<string>();
  /** Los documentos cuyo pendiente ya dice su motivo: el repaso del final no los vuelve a listar. */
  const explicados = new Set<string>();
  const aPersona = (x: ParaUnaPersona, explica = true) => {
    if (explica) explicados.add(x.clave);
    const llave = `${x.clave}|${x.motivo}|${x.detalle}`;
    if (vistas.has(llave)) return;
    vistas.add(llave);
    paraUnaPersona.push(x);
  };
  const dePropuesta = (p: PropuestaDelLibro) => ({ clave: p.clave, cliente: p.cliente, numero: p.numero, monto: p.neto ?? p.total, moneda: p.moneda });

  /* ── 1. Las tres que Alex devuelve a por cobrar, con la fecha de su factura ────────── */
  const reversiones: ReversionDelExcel[] = [];
  const fechas: FechaDelExcel[] = [];
  for (const p of compararLibro(filas, ctx0).filas) {
    if (!p.numero || !p.cuenta || !VUELVEN_A_POR_COBRAR.has(p.numero)) continue;
    const devolver = p.accion === "SACAR_DE_COBRADO";
    if (!atadoSeguro(p)) {
      if (!devolver) continue;
      aPersona({
        ...dePropuesta(p),
        motivo: "NO_COINCIDE",
        detalle:
          "Es una de las tres facturas que Alex devuelve a por cobrar, pero su cuota no está atada por el número ni por el monto exacto: sacala de Cobrado a mano, desde el cronograma.",
      });
      continue;
    }
    for (const c of p.cobros) {
      if (c.estado !== "COBRADO") {
        /* ⚠ Ya volvió a por cobrar: se corrige solo la fecha, si no es la de su factura. Sin esto, la primera corrida
           (2026-09-14) dejaba la fecha de quincena para siempre, porque ya no hay nada que sacar de Cobrado. */
        if (p.fechaFactura && c.fechaEmision !== p.fechaFactura) {
          fechas.push({
            cobroId: c.id,
            cuentaId: p.cuenta.cuentaId,
            cuentaNombre: p.cuenta.nombre,
            periodo: c.periodo,
            monto: c.monto,
            moneda: c.moneda,
            estado: c.estado,
            numero: p.numero,
            antes: c.fechaEmision,
            fecha: p.fechaFactura,
            fuente: fuenteDe(p),
            patch: { fechaEmision: p.fechaFactura },
          });
        }
        continue;
      }
      if (!devolver) continue;
      /* ⭐ La fecha de la factura manda sobre la que tenía el cobro: la de quincena no es la de ningún documento. */
      const fechaEmision = p.fechaFactura ?? c.fechaEmision;
      if (!fechaEmision) {
        aPersona({ ...dePropuesta(p), motivo: "NO_COINCIDE", detalle: "Vuelve a por cobrar, pero ni el cobro ni el Excel dicen cuándo se emitió la factura." });
        continue;
      }
      reversiones.push({
        cobroId: c.id,
        cuentaId: p.cuenta.cuentaId,
        cuentaNombre: p.cuenta.nombre,
        periodo: c.periodo,
        monto: c.monto,
        moneda: c.moneda,
        estado: c.estado,
        numero: p.numero,
        confirmadoPor: c.confirmadoPor,
        patch: {
          estado: "POR_COBRAR",
          ...(fechaEmision === c.fechaEmision ? {} : { fechaEmision }),
          reversion: {
            motivo: `El Excel de Alexander la da sin pagar (${fuenteDe(p)}). Es una de las tres facturas que Alex decidió devolver a por cobrar el 2026-09-12.`,
            ...(c.numeroFactura ? {} : { numeroFactura: p.numero }),
          },
        },
      });
    }
  }
  const ctx1 = conCambios(
    ctx0,
    new Map([
      ...reversiones.map((r): [string, Partial<CobroParaLibro>] => [
        r.cobroId,
        {
          estado: "POR_COBRAR",
          confirmadoPor: null,
          ...(r.patch.fechaEmision ? { fechaEmision: r.patch.fechaEmision } : {}),
          ...(r.patch.reversion?.numeroFactura ? { numeroFactura: r.patch.reversion.numeroFactura } : {}),
        },
      ]),
      ...fechas.map((f): [string, Partial<CobroParaLibro>] => [f.cobroId, { fechaEmision: f.fecha }]),
    ]),
  );

  /* ── 2. Los números de factura que dice el Excel ─────────────────────────────────── */
  const numeros: NumeroDelExcel[] = [];
  for (const q of proponerNumeros(filas, ctx1, o.hoyISO).cuotas) {
    if (q.opcion.origen !== "LIBRO") {
      aPersona(
        {
          motivo: "NUMERO_DE_LA_COPIA",
          clave: `${q.opcion.numero}|${q.cobroId}`,
          cliente: q.cuentaNombre,
          numero: q.opcion.numero,
          monto: q.monto,
          moneda: q.moneda,
          detalle: `${q.opcion.detalle}. El Excel no nombra esa cuota: si es esa factura, confirmala con «Es esta» en Cobranza › Importar › Números.`,
        },
        false,
      );
      continue;
    }
    numeros.push({
      cobroId: q.cobroId,
      cuentaId: q.cuentaId,
      cuentaNombre: q.cuentaNombre,
      periodo: q.periodo,
      monto: q.monto,
      moneda: q.moneda,
      estado: q.estado,
      numero: q.opcion.numero,
      cambiaFechaEmision: q.opcion.patch.fechaEmision !== undefined,
      patch: q.opcion.patch,
    });
  }
  const ctx2 = conCambios(
    ctx1,
    new Map(
      numeros.map((n): [string, Partial<CobroParaLibro>] => [
        n.cobroId,
        { numeroFactura: n.numero, ...(n.patch.fechaEmision ? { fechaEmision: n.patch.fechaEmision } : {}) },
      ]),
    ),
  );

  /* ── 3. Las facturas que Nexus no tiene, y las anotaciones ───────────────────────── */
  const plan2 = planDelLibro(filas, ctx2, o.referenciaISO);
  const idx2 = indexarContexto(ctx2);
  const propuestas2 = new Map(compararLibro(filas, ctx2).filas.map((p) => [p.clave, p]));
  const atados2 = cobrosAtadosConSeguridad(propuestas2.values());
  const grupos: PedidoDeGrupo[] = [];
  for (const g of plan2.grupos) {
    const deFactura = (f: FacturaDelLibroACargar) => ({ clave: f.clave, cliente: g.cliente, numero: f.numero, monto: f.neto ?? f.total, moneda: f.moneda });
    if (!g.cuenta) {
      const detalle =
        (g.cuentasPosibles.length
          ? `Nexus no elige la cuenta de «${g.cliente}» por parecido: puede ser ${g.cuentasPosibles.map((c) => c.nombre).join(", ")}. Elegila en Cobranza › Importar › Aplicar.`
          : `Ninguna cuenta de Nexus es «${g.cliente}»: dala de alta con «Nueva empresa», o elegí la que es, y después cargala.`) +
        (g.clienteDeOdoo ? ` Su cliente de Odoo, «${g.clienteDeOdoo}», está sin emparejar.` : "");
      for (const f of g.facturas) aPersona({ ...deFactura(f), motivo: "SIN_CUENTA", detalle });
      continue;
    }
    const iva = ivaParaLaCarga(g);
    const facturas: string[] = [];
    for (const f of g.facturas) {
      const monto = montoACargar(f, iva);
      if (monto === null) {
        aPersona({
          ...deFactura(f),
          motivo: "FALTA_IVA",
          detalle: `Decí si el total de «${g.cliente}» trae IVA: la copia de Odoo no tiene esta factura y Nexus guarda los montos sin IVA.`,
        });
        continue;
      }
      if (f.fechaFactura > o.hoyISO) {
        aPersona({ ...deFactura(f), motivo: "FECHA_FUTURA", detalle: `La factura tiene fecha ${f.fechaFactura}: se carga cuando se emita.` });
        continue;
      }
      const duplicado = posibleDuplicado(f, monto, g.cuenta.cuentaId, idx2, atados2);
      if (duplicado) {
        aPersona({ ...deFactura(f), monto, motivo: "POSIBLE_DUPLICADO", detalle: duplicado });
        continue;
      }
      facturas.push(f.clave);
    }
    if (facturas.length) grupos.push({ clave: g.clave, cuentaId: g.cuenta.cuentaId, iva, facturas });
  }

  /* 3b. Una factura del Excel que ya está anotada en un cobro y puede ser una venta que Nexus tenía en otro servicio: la
     misma regla que antes de cargar, sobre lo cargado. ⛔ No revierte nada: queda para una persona. Medido el 2026-09-14:
     Real Shipping INV-9 y Alliance RH INV-46 entraron cobradas en la primera corrida y el detector no las vio. */
  const cobroPorId2 = new Map(ctx2.cobros.map((c) => [c.id, c]));
  for (const p of propuestas2.values()) {
    if (p.atadura !== "NUMERO" || !p.numero || !p.cuenta || p.veredicto === "NO_ES_CARTERA") continue;
    const suyos = p.cobros.flatMap((a) => cobroPorId2.get(a.id) ?? []);
    const [primero] = suyos;
    const [fecha] = suyos.map((c) => c.fechaEmision ?? c.fechaProgramada).sort();
    if (!primero || !fecha) continue;
    const monto = Math.round(suyos.reduce((a, c) => a + c.monto, 0) * 100) / 100;
    const venta = laMismaVenta(
      {
        cuentaId: p.cuenta.cuentaId,
        numero: p.numero,
        fecha,
        monto,
        moneda: primero.moneda,
        cobroIds: suyos.map((c) => c.id),
        servicioIds: [...new Set(suyos.map((c) => c.servicioId))],
      },
      (idx2.cobrosPorCuenta.get(p.cuenta.cuentaId) ?? []).filter((c) => !atados2.has(c.id)),
      idx2.serviciosPorCuenta.get(p.cuenta.cuentaId) ?? [],
    );
    if (!venta) continue;
    const estados = [...new Set(suyos.map((c) => ESTADO_EN_PALABRAS[c.estado] ?? c.estado))].join(", ");
    aPersona({
      ...dePropuesta(p),
      monto,
      moneda: primero.moneda,
      motivo: "POSIBLE_DUPLICADO",
      detalle: `${p.cuenta.nombre} ya tiene cargada la factura ${p.numero} (${fmtMontoLibro(monto, primero.moneda)}, ${estados}) y, a pocos días y en otro servicio, ${textoDeLaMismaVenta(venta)}: puede ser la misma venta contada dos veces. Nexus no revierte nada: decidilo en el cronograma de la cuenta (también sale en Cobranza › Odoo › «Lo que no cuadra»).`,
    });
  }

  /* Una anotación va a la bitácora solo si el cobro es de verdad el de esa factura. ⛔ Nunca la de un plan de
     pagos que espera decisión (Kaizen: «no tocar»). */
  const seguraParaAnotar = (a: AnotacionDeCobro, p: PropuestaDelLibro | undefined) =>
    !!p &&
    p.accion !== "ESPERA_DECISION" &&
    p.veredicto !== "REVISAR" &&
    p.veredicto !== "NO_ES_CARTERA" &&
    (a.cobroId === null || atadoSeguro(p));
  const anotacionesPendientes = anotacionesNuevas(plan2.anotaciones, o.bitacora);
  const anotaciones = anotacionesPendientes.filter((a) => seguraParaAnotar(a, propuestas2.get(a.documento)));
  for (const a of anotacionesPendientes) {
    const p = propuestas2.get(a.documento);
    if (!p || seguraParaAnotar(a, p) || p.accion === "ESPERA_DECISION" || p.veredicto === "NO_ES_CARTERA") continue;
    const cubre = cuotasQueCubre(p, idx2, atados2);
    aPersona(
      {
        ...dePropuesta(p),
        motivo: "ANOTACION_SIN_COBRO",
        detalle: cubre
          ? `La anotación «${a.anotacion}» no se escribe sola: la factura cubre ${cubre.map(cuotaEnPalabras).join(" + ")}, y esas cuotas se confirman anotándoles ${p.numero ?? "el número"} desde el cronograma.`
          : `La anotación «${a.anotacion}» no se escribe sola: la cuota a la que iría no está atada a esta factura por el número ni por el monto exacto.`,
      },
      false,
    );
  }

  const pedido: PedidoDeAplicacion = { grupos, anotaciones: anotaciones.map((a) => a.clave) };
  const decision = decidirCarga(plan2, pedido, ctx2, o.firma);
  for (const r of decision.rechazos) {
    aPersona({ motivo: "RECHAZADA", clave: r.clave, cliente: r.cliente, numero: r.numero, monto: null, moneda: null, detalle: r.motivo });
  }
  const aceptadas = new Set(decision.cobros.map((c) => c.clave));
  const pedidoFinal: PedidoDeAplicacion = {
    grupos: grupos.map((g) => ({ ...g, facturas: g.facturas.filter((k) => aceptadas.has(k)) })).filter((g) => g.facturas.length > 0),
    anotaciones: pedido.anotaciones,
  };
  const cargas: CargaDelExcel[] = decision.cobros.map((c) => ({
    clave: c.clave,
    numero: c.numero,
    cuentaId: c.cuentaId,
    cuentaNombre: c.cuentaNombre,
    periodo: c.periodo,
    fechaFactura: c.fechaFactura,
    monto: c.monto,
    moneda: c.moneda,
    pagadaSegunLibro: c.pagadaSegunLibro,
    anotacion: c.anotacion,
  }));
  const ctx3 = conCobrosNuevos(ctx2, decision.cobros);
  const bitacoraFinal: LineaDeBitacora[] = [
    ...o.bitacora,
    ...decision.anotaciones.map((a) => ({ cuentaId: a.cuentaId, cobroId: a.cobroId, contenido: a.texto })),
    ...decision.cobros.flatMap((c) =>
      c.anotacion ? [{ cuentaId: c.cuentaId, cobroId: `${PREFIJO_COBRO_NUEVO}${c.numero}`, contenido: c.anotacion }] : [],
    ),
  ];

  /* ── 4. Las promesas de pago con fecha ───────────────────────────────────────────── */
  const plan3 = planDelLibro(filas, ctx3, o.referenciaISO);
  const cmp3 = compararLibro(filas, ctx3);
  const propuestas3 = new Map(cmp3.filas.map((p) => [p.clave, p]));
  const promesas: PromesaDelExcel[] = [];
  const conPromesa = new Set<string>();
  for (const a of plan3.anotaciones) {
    if (!a.cobroId || !a.promesaPropuesta || a.promesaPropuesta === a.promesaActual || a.estado === "COBRADO") continue;
    if (conPromesa.has(a.cobroId) || !seguraParaAnotar(a, propuestas3.get(a.documento))) continue;
    conPromesa.add(a.cobroId);
    promesas.push({
      cobroId: a.cobroId,
      cuentaId: a.cuentaId,
      cuentaNombre: a.cuentaNombre,
      numero: a.numero,
      periodo: a.periodo,
      monto: a.monto,
      moneda: a.moneda,
      promesa: a.promesaPropuesta,
      antes: a.promesaActual,
      anotacion: a.anotacion,
    });
  }
  const ctx4 = conCambios(ctx3, new Map(promesas.map((x): [string, Partial<CobroParaLibro>] => [x.cobroId, { promesaPago: x.promesa }])));

  /* ── 5. Lo que el Excel da pagado y Nexus no ─────────────────────────────────────── */
  const pagadas: PagadaDelExcel[] = [];
  const conPago = new Set<string>();
  for (const p of cmp3.filas) {
    if (p.estadoLibro !== "PAGADO" || !SECCIONES_DE_FACTURA.has(p.seccion) || !p.cuenta) continue;
    if (p.veredicto === "REVISAR" || p.veredicto === "NO_ES_CARTERA") continue;
    const sinCobrar = p.cobros.filter((c) => c.estado !== "COBRADO" && c.estado !== "SIN_DATO");
    if (!sinCobrar.length) continue;
    if (!atadoSeguro(p)) {
      aPersona({
        ...dePropuesta(p),
        motivo: "NO_COINCIDE",
        detalle: "El Excel la da pagada, pero su cuota no está atada a esta factura por el número ni por el monto exacto: registrá el pago a mano, con el comprobante.",
      });
      continue;
    }
    const pago = fechaDePago(filas, p);
    if (!pago.fecha || pago.distintas || pago.fecha > o.hoyISO) {
      aPersona({
        ...dePropuesta(p),
        motivo: "PAGADA_SIN_FECHA",
        detalle: pago.distintas
          ? "El Excel la da pagada, pero sus pestañas no dicen la misma fecha de pago: registrá el pago con el comprobante."
          : pago.fecha
            ? `El Excel la da pagada con fecha futura (${pago.fecha}): registrá el pago cuando entre.`
            : "El Excel la da pagada pero no dice cuándo se pagó: registrá el pago con el comprobante.",
      });
      continue;
    }
    conPago.add(p.clave);
    for (const c of sinCobrar) {
      pagadas.push({
        cobroId: c.id,
        cuentaId: p.cuenta.cuentaId,
        cuentaNombre: p.cuenta.nombre,
        periodo: c.periodo,
        monto: c.monto,
        moneda: c.moneda,
        estado: c.estado,
        numero: p.numero,
        fechaPago: pago.fecha,
        fuente: fuenteDe(p),
      });
    }
  }
  const firmaDeCobro = o.cobrarConFirma;
  const ctx5 =
    firmaDeCobro === null
      ? ctx4
      : conCambios(ctx4, new Map(pagadas.map((x): [string, Partial<CobroParaLibro>] => [x.cobroId, { estado: "COBRADO", confirmadoPor: firmaDeCobro }])));

  /* ── 6. Lo que queda: lo que la comparación todavía no da por igual ───────────────── */
  const noSeCarga: NoSeCargaDelExcel[] = [];
  const filas5 = compararLibro(filas, ctx5).filas;
  const idx5 = indexarContexto(ctx5);
  const atados5 = cobrosAtadosConSeguridad(filas5);
  for (const p of filas5) {
    if (explicados.has(p.clave)) continue;
    const anotado = p.anotacion ? ` Anotación del Excel: «${p.anotacion}».` : "";
    switch (p.veredicto) {
      case "COINCIDE":
        break;
      case "NO_ES_CARTERA":
        noSeCarga.push({ clave: p.clave, cliente: p.cliente, numero: p.numero, monto: p.neto ?? p.total, moneda: p.moneda, motivo: p.propuesta });
        break;
      case "SIN_FACTURA":
        if (p.diferencias.length) aPersona({ ...dePropuesta(p), motivo: "NO_COINCIDE", detalle: `${p.diferencias.join(" ")} ${p.propuesta}${anotado}` });
        break;
      case "REVISAR":
        aPersona({ ...dePropuesta(p), motivo: p.accion === "ESPERA_DECISION" ? "ESPERA_DECISION" : "REVISAR", detalle: `${p.propuesta}${anotado}` });
        break;
      case "FALTA_EN_NEXUS":
      case "SIN_CUENTA":
        aPersona({
          ...dePropuesta(p),
          motivo: SECCIONES_DE_FACTURA.has(p.seccion) ? "SIN_CUENTA" : "CARGAR_A_MANO",
          detalle: `${p.propuesta}${anotado}`,
        });
        break;
      case "NO_COINCIDE": {
        /* Una factura atada solo por ser la única del mes que cubre varias cuotas: se dice cuáles, como la página, y no
           «marcala facturada» sobre una cuota que no es suya. */
        const cubre = !atadoSeguro(p) && p.diferencias.some((d) => d.startsWith("Monto:")) ? cuotasQueCubre(p, idx5, atados5) : null;
        if (cubre) {
          aPersona({ ...dePropuesta(p), motivo: "NO_COINCIDE", detalle: `${textoDeCuotasQueCubre(p, cubre)}${anotado}` });
          break;
        }
        /* Sin firma de cobro, «la da pagada» ya está en su propia lista: no se repite acá. */
        const diferencias =
          firmaDeCobro === null && conPago.has(p.clave) ? p.diferencias.filter((d) => !d.startsWith("El libro la da pagada")) : p.diferencias;
        if (!diferencias.length) break;
        /* «Coincide. Falta anotarle el número» es la propuesta de una fila cuya única acción era el número: al lado
           de una diferencia de monto se lee al revés. */
        const propuesta = p.propuesta.startsWith("Coincide") ? "" : ` ${p.propuesta}`;
        aPersona({
          ...dePropuesta(p),
          motivo: p.accion === "REVISAR_COBRADO" ? "COBRADO_SIN_PAGAR" : "NO_COINCIDE",
          detalle: `${diferencias.join(" ")}${propuesta}${anotado}`.trim(),
        });
        break;
      }
    }
  }

  const sinCambios =
    reversiones.length === 0 &&
    fechas.length === 0 &&
    numeros.length === 0 &&
    cargas.length === 0 &&
    anotaciones.length === 0 &&
    promesas.length === 0 &&
    (firmaDeCobro === null || pagadas.length === 0);

  return {
    reversiones,
    fechas,
    numeros,
    cargas,
    pedido: pedidoFinal,
    anotaciones,
    promesas,
    pagadas,
    paraUnaPersona,
    noSeCarga,
    sinCambios,
    contextoFinal: ctx5,
    bitacoraFinal,
  };
}

/* ── El resumen para leer ───────────────────────────────────────────────────────── */

export type GrupoDelResumen = { titulo: string; cantidad: number; montos: MontoEnMoneda[]; notas: string[] };

export const ETIQUETA_PARA_UNA_PERSONA: Readonly<Record<MotivoParaUnaPersona, string>> = {
  SIN_CUENTA: "facturas de clientes sin cuenta elegida en Nexus",
  POSIBLE_DUPLICADO: "facturas que pueden ser una cuota o una venta que Nexus ya tiene",
  FALTA_IVA: "facturas sin decir si el total trae IVA",
  COBRADO_SIN_PAGAR: "cobradas en Nexus y sin pagar en el Excel, fuera de las tres de Alex",
  NO_COINCIDE: "facturas donde Nexus y el Excel no dicen lo mismo",
  ESPERA_DECISION: "planes de pago que esperan decisión",
  REVISAR: "facturas que Nexus no puede decidir solo",
  FECHA_FUTURA: "facturas con fecha futura",
  NUMERO_DE_LA_COPIA: "números propuestos por la copia de Odoo, no por el Excel",
  PAGADA_SIN_FECHA: "pagadas sin fecha de pago clara en el Excel",
  ANOTACION_SIN_COBRO: "anotaciones que no tienen una cuota segura donde ir",
  CARGAR_A_MANO: "servicios de QuickBooks o No inscritos, que se cargan a mano",
  RECHAZADA: "facturas que la carga rechazó",
};

const ORDEN_PARA_UNA_PERSONA: readonly MotivoParaUnaPersona[] = [
  "COBRADO_SIN_PAGAR",
  "POSIBLE_DUPLICADO",
  "SIN_CUENTA",
  "FALTA_IVA",
  "NO_COINCIDE",
  "PAGADA_SIN_FECHA",
  "NUMERO_DE_LA_COPIA",
  "ANOTACION_SIN_COBRO",
  "ESPERA_DECISION",
  "REVISAR",
  "FECHA_FUTURA",
  "CARGAR_A_MANO",
  "RECHAZADA",
];

/** El plan en grupos, cada uno con su cantidad y su plata por moneda. ⛔ Nunca una suma de colones con dólares. */
export function resumenDelPlan(plan: PlanDeCargaCompleta, cobrarConFirma: string | null): GrupoDelResumen[] {
  const grupo = (titulo: string, xs: ReadonlyArray<{ monto: number | null; moneda: string | null }>, notas: string[] = []): GrupoDelResumen => ({
    titulo,
    cantidad: xs.length,
    montos: montosPorMoneda(xs.flatMap((x) => (x.monto !== null && x.moneda ? [{ monto: x.monto, moneda: x.moneda }] : []))),
    notas,
  });
  const anotacionesDeCargas = plan.cargas.filter((c) => c.anotacion).length;
  const out: GrupoDelResumen[] = [
    grupo("Vuelven a por cobrar, con motivo: las tres que decidió Alex", plan.reversiones),
    grupo("Fechas de emisión que pasan a la de su factura, en las tres de Alex que ya estaban por cobrar", plan.fechas),
    grupo("Números de factura del Excel que se anotan en su cuota", plan.numeros, [
      `${plan.numeros.filter((n) => n.cambiaFechaEmision).length} cambian también la fecha de emisión a la del documento`,
    ]),
    grupo("Facturas que Nexus no tiene y se cargan por cobrar, con número (neto)", plan.cargas, [
      `${plan.cargas.filter((c) => c.pagadaSegunLibro).length} de ellas el Excel las da pagadas`,
    ]),
    {
      titulo: "Anotaciones del Excel que van a la bitácora",
      cantidad: plan.anotaciones.length + anotacionesDeCargas,
      montos: [],
      notas: [`${plan.anotaciones.length} en cobros que ya existen y ${anotacionesDeCargas} con las facturas que se cargan`],
    },
    grupo("Promesas de pago con fecha que se registran", plan.promesas),
    grupo(
      cobrarConFirma
        ? `Pagadas según el Excel que se registran cobradas con la firma de ${cobrarConFirma}`
        : "Pagadas según el Excel: sin --cobrar-con-firma se listan y no se tocan",
      plan.pagadas,
    ),
  ];
  for (const motivo of ORDEN_PARA_UNA_PERSONA) {
    const xs = plan.paraUnaPersona.filter((x) => x.motivo === motivo);
    if (xs.length) out.push(grupo(`Queda para una persona · ${ETIQUETA_PARA_UNA_PERSONA[motivo]}`, xs));
  }
  if (plan.noSeCarga.length) out.push(grupo("No se carga: no es cartera, o Odoo la tiene anulada", plan.noSeCarga));
  return out;
}
