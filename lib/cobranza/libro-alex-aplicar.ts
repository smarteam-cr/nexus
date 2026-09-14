/**
 * lib/cobranza/libro-alex-aplicar.ts
 *
 * Aplicar el libro de Alex (etapa 13): qué facturas del libro entran a Nexus, en qué cuenta, por cuánto y
 * con qué anotación. PURO: sin Prisma, sin red, sin reloj. Lo escribe libro-alex-aplicar-server.ts, y la
 * comparación que lo alimenta es libro-alex.ts.
 *
 * ── LO QUE CARGA ─────────────────────────────────────────────────────────────────
 * Las facturas del libro que Nexus no tiene: las pestañas con número (Odoo, Mercury y el Compendio) que la
 * comparación da «falta en Nexus» o «sin cuenta». Una por cobro, POR COBRAR, con su fecha de emisión, su
 * número y la sociedad del documento, dentro de un servicio «Facturación importada del libro de Alex» por
 * cuenta y moneda. Sin plan y sin número de cuota: el motor no lo reescribe al regenerar.
 *
 * ── ⛔ LO QUE NO HACE ────────────────────────────────────────────────────────────
 * 1. Nunca escribe COBRADO ni fecha de cobro: `CobroACargar.estado` solo puede ser POR_COBRAR. Una factura
 *    que el libro da por pagada no se tilda sola; si Alex la carga, entra por cobrar y el pago lo registra
 *    quien lo ve, con el comprobante. Así entraron 83 verdes por el color de una celda de este libro.
 * 2. No elige la cuenta de un cliente que solo se parece por nombre: la propone si llegó por un hecho (el
 *    número anotado, el cliente de Odoo) o por el nombre exacto, y si no la elige Alex. Una cuenta nueva la
 *    da de alta Alex con «Nueva empresa», que pregunta por las parecidas.
 * 3. No decide el IVA. Nexus guarda montos netos: el neto del espejo si la factura está; si no, Alex dice si
 *    el total del libro trae IVA. Solo se sugiere ÷ 1,13 donde la comparación ya lo aplica (factura de Odoo
 *    de una cuenta nacional que factura con IVA).
 * 4. No convierte una anotación en promesa: si el texto trae una fecha la propone, y la registra Alex.
 * 5. No carga QuickBooks, «No inscritos» ni planes de pago: no traen número ni fecha de factura. Se cargan
 *    desde la cuenta, con su servicio y su plan.
 * 6. No empareja clientes de Odoo: eso también mueve sus facturas, y lo hace Alex en Cobranza › Odoo.
 */
import {
  agruparDocumentos,
  asignarCuotas,
  compararLibro,
  esDeOdoo,
  esFactura,
  fmtMontoLibro,
  indexarContexto,
  IVA_COSTA_RICA,
  nombreDelPeriodo,
  resolverCuenta,
  type ContextoLibro,
  type CuentaResuelta,
  type DocumentoLibro,
  type FuenteDelLibro,
  type IndiceLibro,
  type PropuestaDelLibro,
  type ViaDeCuenta,
} from "./libro-alex";
import { claveFactura, claveSociedad, identidadDelNombre, type PlataformaDeCobro } from "./sociedades";
import { normalizarTexto, type EstadoLibro, type FilaLibro } from "./libro-alex-lectura";

const round2 = (n: number) => Math.round(n * 100) / 100;

/* ── La fecha que trae una anotación ─────────────────────────────────────────────── */

const MES_DE_NOMBRE: Readonly<Record<string, number>> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};
const MESES_RE = Object.keys(MES_DE_NOMBRE).join("|");
const FIN = "(?:finales|final|fin)";

const dosDigitos = (n: number) => String(n).padStart(2, "0");
const ultimoDia = (anio: number, mes: number) => new Date(Date.UTC(anio, mes, 0)).getUTCDate();

function fechaReal(anio: number, mes: number, dia: number): string | null {
  if (!Number.isInteger(anio) || mes < 1 || mes > 12 || dia < 1 || dia > ultimoDia(anio, mes)) return null;
  return `${anio}-${dosDigitos(mes)}-${dosDigitos(dia)}`;
}

const diasEntre = (desdeISO: string, hastaISO: string) =>
  Math.round((Date.parse(`${hastaISO}T00:00:00Z`) - Date.parse(`${desdeISO}T00:00:00Z`)) / 86_400_000);

/**
 * La fecha que promete una anotación del libro, o null si no trae una.
 *
 *   «Ya está con promesa de pago para este mes 15 de setiembre» → 15-sep
 *   «realizan el pago a final de este mes»                       → el último día del mes de la referencia
 *   «Promesa de Pago esta semana tras presentación de prueba»    → null: una semana no es una fecha
 *
 * `referenciaISO` es el día en que se subió el libro: «este mes» es el mes en que Alex lo escribió, no el de
 * la factura (la de AMVAC es de agosto y dice «este mes 15 de setiembre»). Sin año escrito va el de la
 * referencia, o el siguiente si la fecha quedaría más de medio año atrás («15 de enero» escrito en diciembre).
 *
 * ⚠ Es una PROPUESTA: la promesa la registra Alex. Un texto que no se entiende da null, nunca una fecha
 * inventada.
 */
export function fechaDeAnotacion(texto: string | null | undefined, referenciaISO: string): string | null {
  if (!texto) return null;
  const t = normalizarTexto(texto);
  const [anioRef = Number.NaN, mesRef = Number.NaN] = referenciaISO.split("-").map(Number);
  if (!Number.isFinite(anioRef) || !Number.isFinite(mesRef)) return null;

  const conAnio = (mes: number, dia: number, anio: number | null): string | null => {
    if (anio !== null) return fechaReal(anio, mes, dia);
    const este = fechaReal(anioRef, mes, dia);
    if (!este) return null;
    return diasEntre(referenciaISO, este) < -183 ? fechaReal(anioRef + 1, mes, dia) : este;
  };

  /* 1. «15 de setiembre», «15 setiembre de 2026». */
  const conNombre = t.match(new RegExp(`\\b(\\d{1,2})\\s+(?:de\\s+)?(${MESES_RE})\\b(?:\\s+(?:de\\s+|del\\s+)?(\\d{4}))?`));
  if (conNombre) {
    const mes = MES_DE_NOMBRE[conNombre[2] ?? ""];
    return mes ? conAnio(mes, Number(conNombre[1]), conNombre[3] ? Number(conNombre[3]) : null) : null;
  }

  /* 2. `2026-09-15`. */
  const iso = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return fechaReal(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  /* 3. «15/09», «15/09/2026»: el día primero, como se escribe en Costa Rica. */
  const barras = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b/);
  if (barras) {
    const anio = barras[3] ? (barras[3].length === 2 ? 2000 + Number(barras[3]) : Number(barras[3])) : null;
    return conAnio(Number(barras[2]), Number(barras[1]), anio);
  }

  /* 4. «a finales de octubre». */
  const finDeMes = t.match(new RegExp(`\\b${FIN}\\s+de\\s+(${MESES_RE})\\b`));
  if (finDeMes) {
    const mes = MES_DE_NOMBRE[finDeMes[1] ?? ""];
    return mes ? conAnio(mes, ultimoDia(anioRef, mes), null) : null;
  }

  /* 5. «a final del próximo mes», «fin del mes que viene». */
  if (new RegExp(`\\b${FIN}\\s+del?\\s+(?:(?:proximo|siguiente)\\s+mes|mes\\s+(?:que\\s+viene|siguiente|proximo))\\b`).test(t)) {
    const anio = mesRef === 12 ? anioRef + 1 : anioRef;
    const mes = mesRef === 12 ? 1 : mesRef + 1;
    return fechaReal(anio, mes, ultimoDia(anio, mes));
  }

  /* 6. «a final de este mes», «fin de mes». */
  if (new RegExp(`\\b${FIN}\\s+del?\\s+(?:este\\s+)?mes\\b`).test(t)) return fechaReal(anioRef, mesRef, ultimoDia(anioRef, mesRef));

  return null;
}

/**
 * Lo que va a la bitácora del cobro por una anotación del libro. Sin quién ni cuándo a propósito: es la
 * llave de que aplicar dos veces deje una sola entrada (quién la cargó ya queda en `usuarioEmail`).
 * ⛔ A la bitácora, nunca a `Cobro.notas`: ahí está de dónde vino cada cobro importado.
 */
export function textoDeAnotacion(numero: string | null, cliente: string, anotacion: string): string {
  return `${INICIO_DE_ANOTACION}${numero ? `la factura ${numero}` : `«${cliente}»`}: «${anotacion.trim()}»`;
}

/** Cómo empieza toda anotación del libro en la bitácora: con esto se leen las ya escritas sin armar el plan antes. */
export const INICIO_DE_ANOTACION = "Anotación del libro de Alex sobre ";

/**
 * Las anotaciones que todavía no están en la bitácora de su cobro (o de su cuenta, `cobroId` null), una vez
 * cada una.
 */
export function anotacionesNuevas<T extends { cuentaId: string; cobroId: string | null; texto: string }>(
  pedidas: readonly T[],
  existentes: readonly { cuentaId: string; cobroId: string | null; contenido: string }[],
): T[] {
  const llaveDe = (cuentaId: string, cobroId: string | null, texto: string) => JSON.stringify([cuentaId, cobroId ?? "", texto]);
  const ya = new Set(existentes.map((e) => llaveDe(e.cuentaId, e.cobroId, e.contenido)));
  const out: T[] = [];
  for (const a of pedidas) {
    const llave = llaveDe(a.cuentaId, a.cobroId, a.texto);
    if (ya.has(llave)) continue;
    ya.add(llave);
    out.push(a);
  }
  return out;
}

/* ── El plan ────────────────────────────────────────────────────────────────────── */

export type IvaDelLibro = "SIN_IVA" | "CON_IVA";

/** El servicio sin plan que agrupa las facturas cargadas del libro, uno por cuenta y moneda. */
export const descripcionDelServicioDelLibro = (moneda: string) => `Facturación importada del libro de Alex (${moneda})`;

export type FacturaDelLibroACargar = {
  /** El número: la clave del documento en la comparación. */
  clave: string;
  numero: string;
  /** Como sale en la factura. */
  cliente: string;
  fuentes: FuenteDelLibro[];
  /** `YYYY-MM` */
  periodo: string;
  /** `YYYY-MM-DD`: es la fecha de emisión y la programada del cobro. */
  fechaFactura: string;
  moneda: "CRC" | "USD";
  /** El total del libro, con IVA si lo lleva. */
  total: number;
  /** El total ÷ 1,13, por si Alex dice que el libro trae IVA. */
  totalSinIva: number;
  /** El neto del espejo de Odoo. null = no está en el espejo: el monto depende del IVA que diga Alex. */
  neto: number | null;
  estadoLibro: EstadoLibro | null;
  pagadaSegunLibro: boolean;
  anotacion: string | null;
  promesaPropuesta: string | null;
  avisos: string[];
  /** true = la pantalla la tilda sola: sin pagar y sin cuotas del mes que puedan ser la misma. */
  sugerida: boolean;
};

export type GrupoDelLibro = {
  /** `PLATAFORMA:claveFactura`. */
  clave: string;
  /** El nombre en factura, como lo trae el libro. */
  cliente: string;
  plataforma: PlataformaDeCobro;
  /** Para «Nueva empresa»: el nombre de la factura sin la cédula ni lo que va entre paréntesis. */
  nombreSugerido: string;
  tipoSugerido: "NACIONAL" | "INTERNACIONAL";
  monedaSugerida: "CRC" | "USD";
  /** La cuenta que Nexus ya sabe por un hecho o por el nombre exacto. null = la elige Alex. */
  cuenta: CuentaResuelta | null;
  cuentasPosibles: CuentaResuelta[];
  /** El cliente de Odoo sin emparejar: después de cargar, se empareja en Cobranza › Odoo. */
  clienteDeOdoo: string | null;
  /** Alguna factura no está en el espejo: hay que decir si el libro trae IVA. */
  pideIva: boolean;
  ivaSugerido: IvaDelLibro | null;
  facturas: FacturaDelLibroACargar[];
};

export type NoSeCarga = { clave: string; cliente: string; numero: string | null; motivo: string };

export type AnotacionDeCobro = {
  /** `documento|cobro` (o `documento|cuenta`): la llave con que se pide. */
  clave: string;
  documento: string;
  numero: string | null;
  /** Como lo nombra el libro. */
  cliente: string;
  cuentaId: string;
  cuentaNombre: string;
  /**
   * null = va a la bitácora de la CUENTA: la fila del libro es un servicio (QuickBooks, «No inscritos», un plan
   * de pagos) y habla de todas sus cuotas. Una línea por cuota le dejaba a Bluesat la misma frase doce veces.
   */
  cobroId: string | null;
  /** Las cuotas de Nexus de las que habla. */
  cuotas: number;
  periodo: string | null;
  monto: number | null;
  moneda: string | null;
  estado: string | null;
  fechaEmision: string | null;
  anotacion: string;
  texto: string;
  promesaPropuesta: string | null;
  promesaActual: string | null;
};

export type PlanDelLibro = {
  referenciaISO: string;
  grupos: GrupoDelLibro[];
  anotaciones: AnotacionDeCobro[];
  noSeCargan: NoSeCarga[];
  /** Los cobros que la comparación ya ató a algún documento del libro: no pueden ser otra factura. */
  cobrosAtados: string[];
};

/** Por dónde se llega a una cuenta que se puede proponer. Las de parte del nombre o siglas las elige Alex. */
const VIAS_QUE_PROPONEN: ReadonlySet<ViaDeCuenta> = new Set(["NUMERO", "ODOO", "CEDULA", "NOMBRE", "ALIAS"]);

type Cargable = { tipo: "cargable" } | { tipo: "no-aplica" } | { tipo: "no"; motivo: string };

/**
 * Si un documento se carga. «No aplica» = ya está en Nexus (coincida o no): lo trabajan «Fila por fila» y
 * «Números», no la carga.
 */
function cargable(p: PropuestaDelLibro, doc: DocumentoLibro): Cargable {
  if (p.veredicto === "COINCIDE" || p.veredicto === "NO_COINCIDE" || p.veredicto === "SIN_FACTURA") return { tipo: "no-aplica" };
  if (p.veredicto === "NO_ES_CARTERA") return { tipo: "no", motivo: p.propuesta };
  const f = doc.principal;
  if (!esFactura(f)) {
    return {
      tipo: "no",
      motivo:
        p.seccion === "PLAN_DE_PAGO"
          ? p.propuesta
          : "QuickBooks y «No inscritos» no traen número ni fecha de factura: se cargan desde la cuenta, con su servicio y su plan.",
    };
  }
  const deCuenta = p.veredicto === "FALTA_EN_NEXUS" || p.veredicto === "SIN_CUENTA" || (p.veredicto === "REVISAR" && p.accion === "EMPAREJAR");
  if (!deCuenta) return { tipo: "no", motivo: p.propuesta };
  if (!f.numero) return { tipo: "no", motivo: "El libro no trae el número de la factura." };
  if (!f.fechaFactura) return { tipo: "no", motivo: "El libro no trae la fecha de la factura: sin ella no se puede marcar facturada." };
  if (f.moneda !== "CRC" && f.moneda !== "USD") return { tipo: "no", motivo: "El libro no dice la moneda de la factura." };
  if (f.total === null || f.total <= 0) return { tipo: "no", motivo: "El libro no trae el total de la factura." };
  return { tipo: "cargable" };
}

type GrupoEnArmado = Omit<GrupoDelLibro, "cuenta" | "cuentasPosibles" | "pideIva" | "ivaSugerido" | "facturas"> & {
  items: Array<{ p: PropuestaDelLibro; f: FacturaDelLibroACargar; posibles: CuentaResuelta[] }>;
};

/**
 * Las cuotas de la cuenta que pueden ser esta misma factura: del mismo mes y moneda, sin número y sin atar a
 * otro documento del libro. No frenan la carga: la destildan y lo dicen.
 */
function cuotasQuePuedenSerLaMisma(
  f: FacturaDelLibroACargar,
  cuentaId: string,
  idx: IndiceLibro,
  atados: ReadonlySet<string>,
): string | null {
  const delMes = (idx.cobrosPorCuenta.get(cuentaId) ?? []).filter(
    (c) => c.periodo === f.periodo && c.moneda === f.moneda && !c.numeroFactura && c.estado !== "SIN_DATO" && !atados.has(c.id),
  );
  if (!delMes.length) return null;
  const nombre = idx.cuentaPorId.get(cuentaId)?.nombre ?? "La cuenta";
  return (
    `${nombre} tiene ${delMes.length === 1 ? "una cuota" : `${delMes.length} cuotas`} de ${nombreDelPeriodo(f.periodo)} sin número ` +
    `(${delMes.map((c) => fmtMontoLibro(c.monto, c.moneda)).join(" + ")}): si es esta factura, anotale el número desde el cronograma en vez de cargar otra.`
  );
}

/**
 * El plan de carga: la comparación de siempre, partida en grupos por nombre en factura y plataforma, con lo
 * que se propone y lo que tiene que decir Alex. Lo que no se carga, con su motivo.
 */
export function planDelLibro(filas: readonly FilaLibro[], ctx: ContextoLibro, referenciaISO: string): PlanDelLibro {
  const idx = indexarContexto(ctx);
  const documentos = new Map(agruparDocumentos(filas).map((d) => [d.clave, d]));
  const { filas: propuestas } = compararLibro(filas, ctx);
  const cobroPorId = new Map(ctx.cobros.map((c) => [c.id, c]));
  const atados = new Set(propuestas.flatMap((p) => p.cobros.map((c) => c.id)));

  const grupos = new Map<string, GrupoEnArmado>();
  const anotaciones: AnotacionDeCobro[] = [];
  const noSeCargan: NoSeCarga[] = [];

  for (const p of propuestas) {
    const doc = documentos.get(p.clave);
    if (!doc) continue;

    /* Las anotaciones de lo que Nexus ya tiene van a la bitácora de SU cobro; las de un servicio, a la de la cuenta. */
    if (p.anotacion && p.veredicto !== "NO_ES_CARTERA" && p.cobros.length > 0) {
      const texto = textoDeAnotacion(p.numero, p.cliente, p.anotacion);
      const primera = p.cobros[0] ? cobroPorId.get(p.cobros[0].id) : undefined;
      const cuentaDelServicio = p.cuenta?.cuentaId ?? primera?.cuentaId;
      if (!esFactura(doc.principal) && cuentaDelServicio) {
        anotaciones.push({
          clave: `${p.clave}|cuenta`,
          documento: p.clave,
          numero: null,
          cliente: p.cliente,
          cuentaId: cuentaDelServicio,
          cuentaNombre: idx.cuentaPorId.get(cuentaDelServicio)?.nombre ?? cuentaDelServicio,
          cobroId: null,
          cuotas: p.cobros.length,
          periodo: null,
          monto: null,
          moneda: null,
          estado: null,
          fechaEmision: null,
          anotacion: p.anotacion,
          texto,
          promesaPropuesta: null,
          promesaActual: null,
        });
      }
      for (const atado of esFactura(doc.principal) ? p.cobros : []) {
        const c = cobroPorId.get(atado.id);
        if (!c) continue;
        anotaciones.push({
          clave: `${p.clave}|${c.id}`,
          documento: p.clave,
          numero: p.numero,
          cliente: p.cliente,
          cuotas: 1,
          cuentaId: c.cuentaId,
          cuentaNombre: idx.cuentaPorId.get(c.cuentaId)?.nombre ?? c.cuentaId,
          cobroId: c.id,
          periodo: c.periodo,
          monto: c.monto,
          moneda: c.moneda,
          estado: c.estado,
          fechaEmision: c.fechaEmision,
          anotacion: p.anotacion,
          texto,
          promesaPropuesta: c.estado === "COBRADO" ? null : fechaDeAnotacion(p.anotacion, referenciaISO),
          promesaActual: c.promesaPago,
        });
      }
    }

    const decision = cargable(p, doc);
    if (decision.tipo === "no-aplica") continue;
    if (decision.tipo === "no") {
      noSeCargan.push({ clave: p.clave, cliente: p.cliente, numero: p.numero, motivo: decision.motivo });
      continue;
    }

    const principal = doc.principal;
    const numero = principal.numero ?? p.clave;
    const plataforma: PlataformaDeCobro = esDeOdoo(principal) ? "ODOO" : "MERCURY";
    const claveGrupo = `${plataforma}:${claveFactura(p.cliente) || normalizarTexto(p.cliente)}`;
    const res = resolverCuenta(doc, idx);
    const posibles = res.tipo === "una" ? [res.cuenta] : res.tipo === "ninguna" ? [] : res.posibles;
    const total = principal.total ?? 0;
    const moneda = principal.moneda === "CRC" ? "CRC" : "USD";
    /* ⚠ El neto de la copia de Odoo vale aunque la comparación no haya resuelto la cuenta. Medido el 2026-09-13:
       el plan pedía el IVA en 26 facturas de Odoo que la copia ya traía, y en 5 exentas (Fruitpoint 0222 y 0297,
       Transportes Refrigerados HL 0306, Amvac 0331, Juanva 0230) dividir por 1,13 las habría cargado mal. */
    const espejo = idx.facturaPorNumero.get(numero);
    const f: FacturaDelLibroACargar = {
      clave: p.clave,
      numero,
      cliente: p.cliente,
      fuentes: p.fuentes,
      periodo: principal.periodo ?? (principal.fechaFactura ?? "").slice(0, 7),
      fechaFactura: principal.fechaFactura ?? "",
      moneda,
      total,
      totalSinIva: round2(total / IVA_COSTA_RICA),
      neto: p.netoFuente === "ESPEJO" ? p.neto : espejo && espejo.moneda === moneda ? espejo.montoNeto : null,
      estadoLibro: p.estadoLibro,
      pagadaSegunLibro: p.estadoLibro === "PAGADO",
      anotacion: p.anotacion,
      promesaPropuesta: fechaDeAnotacion(p.anotacion, referenciaISO),
      avisos: [...p.avisos],
      sugerida: false,
    };

    let g = grupos.get(claveGrupo);
    if (!g) {
      g = {
        clave: claveGrupo,
        cliente: p.cliente,
        plataforma,
        /* Sin el paréntesis: a veces es el nombre comercial («(Construtecho)») y a veces el país («(COSTA RICA)»).
           Alex lo corrige en «Nueva empresa». */
        nombreSugerido: identidadDelNombre(p.cliente).nombre,
        tipoSugerido: plataforma === "ODOO" ? "NACIONAL" : "INTERNACIONAL",
        monedaSugerida: moneda,
        clienteDeOdoo: null,
        items: [],
      };
      grupos.set(claveGrupo, g);
    }
    if (res.tipo === "sin-emparejar") g.clienteDeOdoo = res.clienteDeOdoo;
    g.items.push({ p, f, posibles });
  }

  const armados: GrupoDelLibro[] = [...grupos.values()].map((g) => {
    const cuentas = g.items.map((x) => x.p.cuenta);
    const primera = cuentas[0];
    const unaSola =
      primera && cuentas.every((c) => c && c.cuentaId === primera.cuentaId) && cuentas.every((c) => c && VIAS_QUE_PROPONEN.has(c.via))
        ? primera
        : null;
    const vistas = new Set<string>(unaSola ? [unaSola.cuentaId] : []);
    const cuentasPosibles: CuentaResuelta[] = [];
    for (const c of g.items.flatMap((x) => [...(x.p.cuenta ? [x.p.cuenta] : []), ...x.posibles])) {
      if (vistas.has(c.cuentaId)) continue;
      vistas.add(c.cuentaId);
      cuentasPosibles.push(c);
    }
    const sinEspejo = g.items.filter((x) => x.f.neto === null);
    const ivaSugerido: IvaDelLibro | null =
      unaSola && sinEspejo.length > 0 && sinEspejo.every((x) => x.p.netoFuente === "IVA_13") ? "CON_IVA" : null;
    const facturas = g.items
      .map(({ f }) => {
        const aviso = unaSola ? cuotasQuePuedenSerLaMisma(f, unaSola.cuentaId, idx, atados) : null;
        const avisos = [
          ...f.avisos,
          ...(aviso ? [aviso] : []),
          ...(f.pagadaSegunLibro
            ? ["El libro la da pagada: no se tilda sola. Si la cargás entra por cobrar, y el pago lo registra quien lo vea, con el comprobante."]
            : []),
        ];
        return { ...f, avisos, sugerida: !f.pagadaSegunLibro && !aviso };
      })
      .sort((a, b) => a.fechaFactura.localeCompare(b.fechaFactura) || a.numero.localeCompare(b.numero));
    const enColones = facturas.filter((f) => f.moneda === "CRC").length;
    return {
      clave: g.clave,
      cliente: g.cliente,
      plataforma: g.plataforma,
      nombreSugerido: g.nombreSugerido,
      tipoSugerido: g.tipoSugerido,
      monedaSugerida: enColones > facturas.length / 2 ? "CRC" : "USD",
      cuenta: unaSola,
      cuentasPosibles,
      clienteDeOdoo: g.clienteDeOdoo,
      pideIva: sinEspejo.length > 0,
      ivaSugerido,
      facturas,
    };
  });

  /* Primero lo que espera una cuenta: es lo que frena todo lo demás. */
  armados.sort((a, b) => Number(a.cuenta !== null) - Number(b.cuenta !== null) || a.cliente.localeCompare(b.cliente, "es"));

  return { referenciaISO, grupos: armados, anotaciones, noSeCargan, cobrosAtados: [...atados] };
}

/* ── Lo que pide Alex, decidido ──────────────────────────────────────────────────── */

export type PedidoDeGrupo = { clave: string; cuentaId: string; iva: IvaDelLibro | null; facturas: readonly string[] };
export type PedidoDeAplicacion = { grupos: readonly PedidoDeGrupo[]; anotaciones: readonly string[] };

export type SociedadDelCobro = {
  plataforma: PlataformaDeCobro;
  /** Sin la cédula pegada, con el alias entre paréntesis si lo trae. */
  nombre: string;
  cedula: string | null;
  /** La ficha de Odoo del documento, si la hay. Las de Mercury no tienen. */
  odooPartnerId: number | null;
};

export type CobroACargar = {
  clave: string;
  numero: string;
  grupo: string;
  cuentaId: string;
  cuentaNombre: string;
  sociedad: SociedadDelCobro;
  periodo: string;
  fechaFactura: string;
  /** Neto, sin IVA. */
  monto: number;
  moneda: "CRC" | "USD";
  /** ⛔ Nunca otro: lo cobrado lo confirma una persona con el comprobante (INV3). */
  estado: "POR_COBRAR";
  pagadaSegunLibro: boolean;
  /** La línea de la carga en la bitácora del cobro. */
  bitacora: string;
  /** La de la anotación, si la trae. */
  anotacion: string | null;
  avisos: string[];
};

export type CargaDecidida = { cobros: CobroACargar[]; anotaciones: AnotacionDeCobro[]; rechazos: NoSeCarga[] };

/** El monto que entra: el neto del espejo, o el total según el IVA que dijo Alex. null = falta decirlo. */
export function montoACargar(f: Pick<FacturaDelLibroACargar, "neto" | "total" | "totalSinIva">, iva: IvaDelLibro | null): number | null {
  if (f.neto !== null) return f.neto;
  if (iva === "CON_IVA") return f.totalSinIva;
  if (iva === "SIN_IVA") return f.total;
  return null;
}

function sociedadDelDocumento(f: FacturaDelLibroACargar, plataforma: PlataformaDeCobro, idx: IndiceLibro): SociedadDelCobro {
  const ident = identidadDelNombre(f.cliente);
  let odooPartnerId: number | null = null;
  if (plataforma === "ODOO") {
    odooPartnerId = idx.facturaPorNumero.get(f.numero)?.odooPartnerId ?? null;
    if (odooPartnerId === null) {
      const clave = claveSociedad(f.cliente);
      const fichas = [...idx.vinculoPorPartner.values()].filter((v) => !v.ignorado && claveSociedad(v.odooPartnerNombre) === clave);
      if (fichas.length === 1 && fichas[0]) odooPartnerId = fichas[0].odooPartnerId;
    }
  }
  return { plataforma, nombre: ident.alias ? `${ident.nombre} (${ident.alias})` : ident.nombre, cedula: ident.cedula, odooPartnerId };
}

function textoDeCarga(f: FacturaDelLibroACargar, monto: number, iva: IvaDelLibro | null, sociedad: SociedadDelCobro, byEmail: string): string {
  const fuente = f.fuentes[0];
  const deDonde = fuente ? ` («${fuente.hoja}» fila ${fuente.fila})` : "";
  const neto =
    f.neto !== null ? "el neto del espejo de Odoo" : iva === "CON_IVA" ? "el total ÷ 1,13: el libro trae IVA" : "el libro no trae IVA";
  return (
    `${byEmail} cargó la factura ${f.numero} desde el libro de Alex${deDonde}: ${fmtMontoLibro(f.total, f.moneda)} en el libro y ` +
    `${fmtMontoLibro(monto, f.moneda)} sin IVA (${neto}). Entra por cobrar, facturada a «${sociedad.nombre}» el ${f.fechaFactura}.` +
    (f.pagadaSegunLibro ? " ⚠ El libro la da pagada: si entró la plata, registrá el pago en este cobro con el comprobante." : "")
  );
}

/**
 * Lo que pidió Alex, contra el plan de HOY (el servidor lo vuelve a armar antes de decidir). Devuelve los
 * cobros a cargar y lo que se rechaza con su motivo. Nada de acá escribe.
 *
 * Se rechaza:
 *  · un grupo o una factura que el plan ya no trae (alguien la cargó en otra pestaña);
 *  · una cuenta que no existe, o una factura sin el IVA dicho;
 *  · un número que ya está en otra cuenta, o una factura de Odoo cuyo cliente de Odoo está emparejado con
 *    otra cuenta (el documento dice de quién es);
 *  · una factura que la cuenta elegida ya tiene: por número, por cuotas facturadas ese día que suman su monto
 *    o por la cuota del mes con el mismo monto. Solo cuentan las cuotas que ningún otro documento del libro ató.
 */
export function decidirCarga(
  plan: PlanDelLibro,
  pedido: PedidoDeAplicacion,
  ctx: ContextoLibro,
  byEmail: string,
): CargaDecidida {
  const idx = indexarContexto(ctx);
  const atados = new Set(plan.cobrosAtados);
  /* El reparto mira solo las cuotas libres: una cuota que ya es de otra factura del libro no puede ser esta. */
  const idxLibres = indexarContexto({ ...ctx, cobros: ctx.cobros.filter((c) => !atados.has(c.id)) });
  const grupos = new Map(plan.grupos.map((g) => [g.clave, g]));
  const rechazos: NoSeCarga[] = [];
  const candidatos: Array<{ g: GrupoDelLibro; f: FacturaDelLibroACargar; cuentaId: string; monto: number; iva: IvaDelLibro | null }> = [];
  const pedidas = new Set<string>();

  for (const pg of pedido.grupos) {
    const g = grupos.get(pg.clave);
    for (const claveFactura of pg.facturas) {
      const f = g?.facturas.find((x) => x.clave === claveFactura);
      const rechazar = (motivo: string) =>
        rechazos.push({ clave: claveFactura, cliente: g?.cliente ?? pg.clave, numero: f?.numero ?? claveFactura, motivo });
      if (!g || !f) {
        rechazar("El libro ya no la trae para cargar: puede que alguien la haya cargado. Volvé a abrir «Aplicar».");
        continue;
      }
      if (pedidas.has(claveFactura)) {
        rechazar("Llegó dos veces en el mismo pedido.");
        continue;
      }
      pedidas.add(claveFactura);
      const cuenta = idx.cuentaPorId.get(pg.cuentaId);
      if (!cuenta) {
        rechazar("Esa cuenta ya no existe: elegí otra.");
        continue;
      }
      const monto = montoACargar(f, pg.iva);
      if (monto === null || monto <= 0) {
        rechazar(`Decí si los montos de «${g.cliente}» traen IVA: Nexus guarda los montos sin IVA.`);
        continue;
      }
      const enOtra = (idx.cobrosPorNumero.get(f.numero) ?? []).find((c) => c.cuentaId !== cuenta.cuentaId);
      if (enOtra) {
        rechazar(
          `La factura ${f.numero} ya está anotada en ${idx.cuentaPorId.get(enOtra.cuentaId)?.nombre ?? "otra cuenta"}: un documento le cobra a un solo cliente.`,
        );
        continue;
      }
      const espejo = idx.facturaPorNumero.get(f.numero);
      const cuentaDeLaFicha = espejo ? idx.vinculoPorPartner.get(espejo.odooPartnerId)?.cuentaId : null;
      if (cuentaDeLaFicha && cuentaDeLaFicha !== cuenta.cuentaId) {
        rechazar(
          `En Odoo la factura ${f.numero} es de «${espejo?.odooPartnerNombre ?? f.cliente}», emparejado con ${idx.cuentaPorId.get(cuentaDeLaFicha)?.nombre ?? "otra cuenta"}: cargala en esa cuenta, o corregí el emparejado en Cobranza › Odoo.`,
        );
        continue;
      }
      candidatos.push({ g, f, cuentaId: cuenta.cuentaId, monto, iva: pg.iva });
    }
  }

  const { asignadas, ambiguas } = asignarCuotas(
    candidatos.map((x) => ({
      clave: x.f.clave,
      cuentaId: x.cuentaId,
      numero: x.f.numero,
      objetivo: x.monto,
      moneda: x.f.moneda,
      periodo: x.f.periodo,
      fechaFactura: x.f.fechaFactura,
    })),
    idxLibres,
    { porNumero: true, unicaDelMes: false },
  );

  const cobros: CobroACargar[] = [];
  for (const x of candidatos) {
    const cuentaNombre = idx.cuentaPorId.get(x.cuentaId)?.nombre ?? x.cuentaId;
    const rechazar = (motivo: string) => rechazos.push({ clave: x.f.clave, cliente: x.g.cliente, numero: x.f.numero, motivo });
    const ya = asignadas.get(x.f.clave);
    if (ya) {
      rechazar(
        ya.forma === "NUMERO"
          ? `${cuentaNombre} ya tiene la factura ${x.f.numero} anotada: no se carga dos veces.`
          : `${cuentaNombre} ya tiene ${ya.cobros.length === 1 ? "la cuota" : `${ya.cobros.length} cuotas`} de ${nombreDelPeriodo(x.f.periodo)} por ` +
              `${ya.cobros.map((c) => fmtMontoLibro(c.monto, c.moneda)).join(" + ")}: es esta factura. Anotale el número desde el cronograma en vez de cargar otra.`,
      );
      continue;
    }
    if (ambiguas.has(x.f.clave)) {
      rechazar(`Más de una combinación de cuotas de ${cuentaNombre} suma esta factura: decidí en el cronograma cuáles cubre.`);
      continue;
    }
    const sociedad = sociedadDelDocumento(x.f, x.g.plataforma, idx);
    cobros.push({
      clave: x.f.clave,
      numero: x.f.numero,
      grupo: x.g.clave,
      cuentaId: x.cuentaId,
      cuentaNombre,
      sociedad,
      periodo: x.f.periodo,
      fechaFactura: x.f.fechaFactura,
      monto: x.monto,
      moneda: x.f.moneda,
      estado: "POR_COBRAR",
      pagadaSegunLibro: x.f.pagadaSegunLibro,
      bitacora: textoDeCarga(x.f, x.monto, x.iva, sociedad, byEmail),
      anotacion: x.f.anotacion ? textoDeAnotacion(x.f.numero, x.f.cliente, x.f.anotacion) : null,
      avisos: x.f.avisos,
    });
  }

  const porClave = new Map(plan.anotaciones.map((a) => [a.clave, a]));
  const anotaciones = [...new Set(pedido.anotaciones)].flatMap((k) => {
    const a = porClave.get(k);
    return a ? [a] : [];
  });

  return { cobros, anotaciones, rechazos };
}
