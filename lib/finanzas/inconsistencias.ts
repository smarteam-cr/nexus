/**
 * lib/finanzas/inconsistencias.ts
 *
 * La lista de todo lo que no cuadra, en un solo lugar y en lenguaje de negocio: lo que
 * hay que sentarse a resolver con el CFO para terminar de llenar los vacíos.
 *
 * PURO: cero Prisma, cero red, cero `new Date()`. Entra el estado medido, sale la lista.
 *
 * ── POR QUÉ ESTA LISTA EXISTE ───────────────────────────────────────────────────
 * El reporte ya avisaba de sus propios huecos, pero repartidos: un aviso en la curva,
 * otro en la confiabilidad del dato, otro que solo salía por consola al correr un script.
 * Nadie podía sentarse con el CFO y decir "son estas doce cosas, en este orden, y estas
 * cuatro las decidís vos". Eso es lo único que hace este módulo.
 *
 * ── DOS REGLAS ──────────────────────────────────────────────────────────────────
 *  1. Todo lo que se lista se DETECTA, no se escribe a mano. Una lista hardcodeada de
 *     hallazgos envejece sola: sigue mostrando lo que ya se arregló y calla lo nuevo.
 *  2. Cada línea dice CUÁNTA PLATA MUEVE y QUIÉN LA RESUELVE. Una inconsistencia sin
 *     monto no se puede priorizar, y una sin dueño no se resuelve nunca.
 */

/** Quién puede cerrar el punto. Es la columna que convierte la lista en una agenda. */
export type QuienResuelve =
  | "SISTEMA" // se arregla con código o corriendo algo; no hace falta decidir nada
  | "COBRANZA" // alguien tiene que cargar o corregir un dato en Nexus
  | "DIRECCION"; // es una decisión de negocio: solo el dueño la toma

export type Severidad = "ALTA" | "MEDIA" | "BAJA";

export interface Inconsistencia {
  codigo: string;
  severidad: Severidad;
  /** Qué es, en pocas palabras. */
  titulo: string;
  /** Qué pasa y por qué importa, en lenguaje de negocio. */
  detalle: string;
  /** Cuánta plata mueve. null = no se puede cuantificar. */
  montoEnJuego: number | null;
  /**
   * El código de la línea que YA cuenta esta misma plata desde otro ángulo.
   *
   * ⚠ EXISTE POR UN ERROR QUE NO SE CAÍA SOLO: el titular decía "$437.579,78 en juego" y
   * sumaba $28.880 dos veces, porque «ventas de empresas que no existen en Nexus» es un
   * TERCIO de «ventas sin respaldo en cobranza», no una categoría paralela. Como la
   * columna visible sumaba exacto al titular, quien lo verificara a mano confirmaba el
   * número inflado. La línea conserva su monto —sirve para dimensionarla— pero
   * `resumirInconsistencias` la deja fuera del total.
   */
  yaContadoEn?: string;
  /** La acción concreta que la cierra. */
  queHacer: string;
  resuelve: QuienResuelve;
  /** El detalle fino: nombres, meses, clientes. Para poder actuar sin buscar. */
  items: string[];
}

/** El estado medido que hace falta para armar la lista. */
export interface EstadoParaAuditar {
  anio: number;
  /** Meses del año con el egreso incompleto, y qué les falta. */
  mesesParciales: Array<{ periodo: string; faltantes: string[] }>;
  /** Lo facturado del año, para poder dar proporciones. */
  facturadoTotal: number;
  /** Ventas ganadas sin respaldo completo en cobranza, por clase. */
  ventas: {
    vendido: number;
    sinCobranza: { cuantas: number; monto: number };
    parcial: { cuantas: number; monto: number };
    sinCliente: { cuantas: number; monto: number };
    sinMonto: { cuantas: number; items: string[] };
    resueltasPorNombre: { cuantas: number; items: string[] };
    fueraDePipeline: { cuantas: number; monto: number };
    /** Nombres de las ventas descubiertas más caras, para poder empezar por ahí. */
    peoresDescubiertas: string[];
  };
  /** Comisiones de aliado que ya deberían haber entrado y no están confirmadas. */
  comisionesVencidas: Array<{ partner: string; monto: number; fecha: string }>;
  /** Servicios activos que nunca generaron un cobro. */
  serviciosSinCobros: { cuantas: number; monto: number; items: string[] };
  /** Clientes con cuenta de cobranza pero sin empresa de HubSpot ligada. */
  cuentasSinEmpresa: { cuantas: number; items: string[] };
  /**
   * Clientes que facturan en el año y cuya ÚNICA venta ganada está en un pipeline que
   * no cuenta como venta propia (hoy: Shared Selling). No es un error de dato: es la
   * evidencia de que ese pipeline sí produce facturación, y por eso lo decide dirección.
   */
  facturaSoloFueraDePipeline: { cuantas: number; facturado: number; cobrado: number; items: string[] };
  /**
   * Clientes que facturan y cuya venta está registrada a nombre de otra empresa del
   * mismo grupo (la madre, o una hermana). La plata y la venta existen las dos; lo que
   * falta es el vínculo, así que hoy se cuentan como hueco sin serlo.
   */
  facturaDeGrupo: { cuantas: number; facturado: number; items: string[] };
  /** Cobros marcados como cobrados sin la fecha en que entró la plata. */
  cobradosSinFecha: { cuantas: number; total: number };
  /** Meses del año sin tipo de cambio cargado. */
  periodosSinTasa: string[];
  /** Conceptos cuya moneda se dedujo del formato en vez de leerse. */
  monedaInferida: string[];
  /** Ventas en otra moneda donde la tasa de Nexus y la de HubSpot no coinciden. */
  desviosDeCambio: Array<{ concepto: string; segunNexus: number; segunHubspot: number }>;
  /** true = en algún mes conviven cargo de tarjeta y herramientas (posible doble conteo). */
  tarjetaYHerramientas: { hay: boolean; periodos: string[] };
  /** Los dos criterios de reserva de aguinaldo, si difieren. */
  aguinaldo: { segunNexus: number; segunExcel: number } | null;
  /** Hoy, "YYYY-MM-DD". Entra por parámetro: este módulo no lee el reloj. */
  hoyISO: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => "$" + n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const listar = (xs: readonly string[], max = 8) =>
  xs.length <= max ? xs.join(" · ") : `${xs.slice(0, max).join(" · ")} y ${xs.length - max} más`;

/**
 * Arma la lista completa, ordenada por la plata que mueve.
 *
 * Lo que NO aparece es tan importante como lo que sí: una inconsistencia que se resolvió
 * desaparece sola de la lista en la siguiente carga, porque todo se deriva del estado.
 */
export function detectarInconsistencias(e: EstadoParaAuditar): Inconsistencia[] {
  const out: Inconsistencia[] = [];

  // ── Ventas que no llegaron a cobranza ───────────────────────────────────────
  const descubierto = round2(e.ventas.sinCobranza.monto + e.ventas.parcial.monto + e.ventas.sinCliente.monto);
  if (descubierto > 0) {
    out.push({
      codigo: "VENTAS_SIN_COBRANZA",
      severidad: "ALTA",
      titulo: "Ventas ganadas que no están en cobranza",
      detalle:
        `Se ganaron ${money(e.ventas.vendido)} este año y ${money(descubierto)} no tienen respaldo en cobranza. ` +
        `Son tres situaciones distintas: ${e.ventas.sinCobranza.cuantas} ventas de clientes sin nada cargado ` +
        `(${money(e.ventas.sinCobranza.monto)}), ${e.ventas.parcial.cuantas} de clientes que facturan menos de lo ` +
        `que vendieron (${money(e.ventas.parcial.monto)}) y ${e.ventas.sinCliente.cuantas} de empresas que ni ` +
        `existen en Nexus (${money(e.ventas.sinCliente.monto)}). Las tres se listan abajo por separado; el monto ` +
        `de acá ya las incluye a las tres.`,
      montoEnJuego: descubierto,
      queHacer:
        "Revisar una por una: cargar la cuenta y el plan de cobro donde falte, o marcar la venta como que no genera facturación (continuidad, add-on, renovación).",
      resuelve: "COBRANZA",
      items: e.ventas.peoresDescubiertas,
    });
  }

  // ── Egresos incompletos ─────────────────────────────────────────────────────
  if (e.mesesParciales.length > 0) {
    out.push({
      codigo: "EGRESO_INCOMPLETO",
      severidad: "ALTA",
      titulo: `${e.mesesParciales.length} de 12 meses con el gasto incompleto`,
      detalle:
        "Esos meses quedan fuera del promedio que define el piso mensual, y su brecha se ve mejor de lo que es " +
        "porque falta parte del costo. El piso se calcula solo con los meses completos.",
      montoEnJuego: null,
      queHacer:
        "Cargar lo que falta en cada mes. Lo de enero a marzo no es recuperable del Excel (ese bloque tiene las fórmulas rotas y mezcla monedas): si hace falta, hay que reconstruirlo de otra fuente.",
      resuelve: "COBRANZA",
      items: e.mesesParciales.map((m) => `${m.periodo}: falta ${m.faltantes.join(", ")}`),
    });
  }

  // ── Comisiones de aliado ya vencidas ────────────────────────────────────────
  const vencidas = e.comisionesVencidas.filter((c) => c.fecha <= e.hoyISO);
  if (vencidas.length > 0) {
    const monto = round2(vencidas.reduce((n, c) => n + c.monto, 0));
    out.push({
      codigo: "COMISIONES_VENCIDAS",
      severidad: "ALTA",
      titulo: "Comisiones de aliados cuya fecha ya pasó",
      detalle:
        `Están registradas como esperadas y su fecha ya venció. Hasta que alguien confirme contra el banco, ` +
        `el reporte las cuenta como ingreso devengado pero NO como caja.`,
      montoEnJuego: monto,
      queHacer: "Mirar el banco y marcarlas cobradas (o corregir la fecha esperada si se movieron).",
      resuelve: "DIRECCION",
      items: vencidas.map((c) => `${c.partner} · ${money(c.monto)} · esperada el ${c.fecha}`),
    });
  }

  // ── Ventas sin cliente ──────────────────────────────────────────────────────
  if (e.ventas.sinCliente.cuantas > 0) {
    out.push({
      codigo: "VENTA_SIN_CLIENTE",
      severidad: "MEDIA",
      titulo: "Ventas de empresas que no existen en Nexus",
      detalle:
        "La venta está ganada en HubSpot pero su empresa no tiene ficha en Nexus, así que no hay dónde colgarle " +
        "la facturación. Suelen ser clientes nuevos que nadie dio de alta todavía.",
      montoEnJuego: e.ventas.sinCliente.monto,
      yaContadoEn: "VENTAS_SIN_COBRANZA",
      queHacer: "Crear el cliente en Nexus, o ligar la venta a la empresa que corresponda si es una sub-empresa de un grupo.",
      resuelve: "COBRANZA",
      items: [],
    });
  }

  // ── Ventas colgadas de otra empresa ─────────────────────────────────────────
  if (e.ventas.resueltasPorNombre.cuantas > 0) {
    out.push({
      codigo: "VENTA_EN_OTRA_EMPRESA",
      severidad: "MEDIA",
      titulo: "Ventas registradas en una empresa distinta de la que factura",
      detalle:
        "La venta se pudo ligar por el nombre, no por la empresa: en HubSpot cuelga de otra ficha. Pasa cuando hay " +
        "empresas duplicadas, y cuando la venta se registra en la casa matriz y la facturación va contra la filial " +
        "(el grupo con sus sub-empresas). Mientras siga así, cada cruce automático las va a volver a perder.",
      montoEnJuego: null,
      queHacer: "Unificar las empresas duplicadas en HubSpot, o dejar registrada en Nexus la relación matriz–filial.",
      resuelve: "DIRECCION",
      items: e.ventas.resueltasPorNombre.items,
    });
  }

  // ── Ventas sin monto ────────────────────────────────────────────────────────
  if (e.ventas.sinMonto.cuantas > 0) {
    out.push({
      codigo: "VENTA_SIN_MONTO",
      severidad: "MEDIA",
      titulo: "Ventas ganadas sin monto cargado en HubSpot",
      detalle:
        "Están ganadas pero nadie les puso el valor, así que no suman al vendido del año. El sistema las guarda con " +
        "el monto en blanco en vez de ponerlas en cero: la venta existe, lo que falta es el número.",
      montoEnJuego: null,
      queHacer: "Completar el monto en HubSpot, o confirmar que esas oportunidades no tienen valor propio.",
      resuelve: "DIRECCION",
      items: e.ventas.sinMonto.items,
    });
  }

  // ── Servicios sin cobros ────────────────────────────────────────────────────
  if (e.serviciosSinCobros.cuantas > 0) {
    out.push({
      codigo: "SERVICIO_SIN_COBROS",
      severidad: "MEDIA",
      titulo: "Servicios vendidos que nunca generaron un cobro",
      detalle:
        "Están cargados en cobranza con su monto, pero no tienen ni una cuota programada. No aparecen en ninguna " +
        "cifra del reporte: ni facturado, ni por cobrar, ni pendiente.",
      montoEnJuego: e.serviciosSinCobros.monto,
      queHacer: "Definirles el plan de pago para que se materialicen las cuotas, o darlos de baja si no van a facturarse.",
      resuelve: "COBRANZA",
      items: e.serviciosSinCobros.items,
    });
  }

  // ── Cuentas sin empresa de HubSpot ──────────────────────────────────────────
  if (e.cuentasSinEmpresa.cuantas > 0) {
    out.push({
      codigo: "CUENTA_SIN_EMPRESA",
      severidad: "MEDIA",
      titulo: "Clientes de cobranza sin empresa de HubSpot ligada",
      detalle:
        "Sin ese vínculo, ninguna venta de ese cliente se puede cruzar automáticamente: sus ventas van a aparecer " +
        "siempre como huecos aunque estén facturadas.",
      montoEnJuego: null,
      queHacer: "Ligar cada uno a su empresa de HubSpot desde la ficha del cliente.",
      resuelve: "COBRANZA",
      items: e.cuentasSinEmpresa.items,
    });
  }

  // ── Venta compartida sin decidir ────────────────────────────────────────────
  if (e.ventas.fueraDePipeline.cuantas > 0) {
    out.push({
      codigo: "PIPELINE_SIN_DECIDIR",
      severidad: "MEDIA",
      titulo: "Venta compartida con HubSpot: falta decidir si cuenta",
      detalle:
        `Hay ${e.ventas.fueraDePipeline.cuantas} tratos ganados por ${money(e.ventas.fueraDePipeline.monto)} en el ` +
        "circuito de venta compartida. Hoy NO se cuentan como venta propia, porque son registro de oportunidad y no " +
        "facturación de la casa. El dato está guardado: si se decide que cuentan, es prender un filtro.",
      montoEnJuego: e.ventas.fueraDePipeline.monto,
      queHacer: "Decidir si esos tratos son venta propia. Si lo son, el vendido del año cambia de golpe.",
      resuelve: "DIRECCION",
      items: [],
    });
  }

  // ── Cobros sin fecha de cobro ───────────────────────────────────────────────
  if (e.cobradosSinFecha.cuantas > 0) {
    const p = Math.round((e.cobradosSinFecha.cuantas / Math.max(1, e.cobradosSinFecha.total)) * 100);
    out.push({
      codigo: "COBRADO_SIN_FECHA",
      severidad: p > 15 ? "ALTA" : "MEDIA",
      titulo: "Cobros marcados como cobrados sin fecha de cobro",
      detalle:
        `${e.cobradosSinFecha.cuantas} de ${e.cobradosSinFecha.total} cobros (${p}%) no dicen cuándo entró la plata, ` +
        "así que se imputan al mes en que se facturaron. En esa proporción, la curva de cobrado no es estrictamente " +
        "una curva de caja.",
      montoEnJuego: null,
      queHacer: "Completar la fecha de cobro de esos registros.",
      resuelve: "COBRANZA",
      items: [],
    });
  }

  // ── Tipo de cambio ──────────────────────────────────────────────────────────
  if (e.periodosSinTasa.length > 0) {
    out.push({
      codigo: "SIN_TIPO_DE_CAMBIO",
      severidad: "ALTA",
      titulo: "Meses sin tipo de cambio cargado",
      detalle:
        "Todo lo que esté en otra moneda en esos meses queda FUERA de los totales. No se aproxima con la tasa de " +
        "otro mes: se declara y se deja afuera.",
      montoEnJuego: null,
      queHacer: "Cargar la tasa de esos meses.",
      resuelve: "COBRANZA",
      items: e.periodosSinTasa,
    });
  }

  if (e.desviosDeCambio.length > 0) {
    const dif = round2(e.desviosDeCambio.reduce((n, d) => n + Math.abs(d.segunHubspot - d.segunNexus), 0));
    out.push({
      codigo: "DESVIO_DE_CAMBIO",
      severidad: "BAJA",
      titulo: "La tasa de HubSpot y la de Nexus no coinciden",
      detalle:
        "Para lo que está en otra moneda, HubSpot convierte con su propia tasa y Nexus con la que se cargó a mano. " +
        "Las dos cifras son defendibles, pero son distintas, y conviene que sea una decisión y no una casualidad.",
      montoEnJuego: dif,
      queHacer: "Elegir cuál manda y dejarlo escrito: la tasa del banco central del mes, o la que ya usa el CRM.",
      resuelve: "DIRECCION",
      items: e.desviosDeCambio.map(
        (d) => `${d.concepto}: ${money(d.segunNexus)} según Nexus · ${money(d.segunHubspot)} según HubSpot`,
      ),
    });
  }

  // ── Doble conteo posible ────────────────────────────────────────────────────
  if (e.tarjetaYHerramientas.hay) {
    out.push({
      codigo: "TARJETA_SOLAPA_HERRAMIENTAS",
      severidad: "ALTA",
      titulo: "El cargo de tarjeta y las herramientas se suman los dos",
      detalle:
        "Si parte de las herramientas se paga con esa tarjeta, el piso mensual está contando esa plata dos veces. " +
        "El solape no se puede medir con los datos actuales: no hay registro de qué herramienta se paga con qué tarjeta.",
      montoEnJuego: null,
      queHacer: "Confirmar si el cargo de tarjeta es propio (comisiones, intereses) o incluye las herramientas.",
      resuelve: "DIRECCION",
      items: e.tarjetaYHerramientas.periodos,
    });
  }

  // ── Criterio de aguinaldo ───────────────────────────────────────────────────
  if (e.aguinaldo && Math.abs(e.aguinaldo.segunNexus - e.aguinaldo.segunExcel) > 0.01) {
    out.push({
      codigo: "AGUINALDO_CRITERIO",
      severidad: "BAJA",
      titulo: "Dos criterios para la reserva de aguinaldo",
      detalle:
        `El reporte reserva ${money(e.aguinaldo.segunNexus)} al mes: el total del año repartido en doce. La hoja de ` +
        `egresos lo reparte en diez, que sobre ese mismo total serían ${money(e.aguinaldo.segunExcel)}. Ninguno de ` +
        `los dos es un error: son dos criterios. (El número que muestra la hoja además parte de un total distinto, ` +
        `porque le proyecta a una persona un aguinaldo que el libro de planilla no respalda.)`,
      montoEnJuego: round2(Math.abs(e.aguinaldo.segunNexus - e.aguinaldo.segunExcel) * 12),
      queHacer: "Elegir uno. El de doce refleja el costo mensual real; el de diez llega a diciembre con colchón.",
      resuelve: "DIRECCION",
      items: [],
    });
  }

  // ── Moneda deducida ─────────────────────────────────────────────────────────
  if (e.monedaInferida.length > 0) {
    out.push({
      codigo: "MONEDA_INFERIDA",
      severidad: "BAJA",
      titulo: "Conceptos cuya moneda se dedujo, no se leyó",
      detalle:
        "La hoja de origen no declara la moneda de esos montos y el sistema la dedujo del formato de la celda. " +
        "Si alguno estuviera en la otra moneda, su costo estaría mal por un factor de cientos.",
      montoEnJuego: null,
      queHacer: "Confirmar la moneda de esos conceptos en la hoja de egresos.",
      resuelve: "COBRANZA",
      items: e.monedaInferida,
    });
  }

  // ── Factura, pero la venta está en un pipeline que no cuenta ────────────────
  if (e.facturaSoloFueraDePipeline.cuantas > 0) {
    const f = e.facturaSoloFueraDePipeline;
    out.push({
      codigo: "FACTURA_SOLO_FUERA_DE_PIPELINE",
      severidad: "ALTA",
      titulo: "Clientes que facturan y cuya única venta es de Shared Selling",
      detalle:
        `${f.cuantas} clientes llegaron por un trato de Shared Selling, no tienen ninguna venta propia, y aun así ` +
        `Smarteam les facturó ${money(f.facturado)} este año, de los cuales ${money(f.cobrado)} ya entraron al banco. ` +
        `Hoy el reporte no cuenta esos tratos como venta, así que esa facturación aparece como si hubiera salido de la nada ` +
        `y engorda el hueco entre lo vendido y lo cobrado. La pregunta no es de dato sino de definición: si el trabajo se ` +
        `factura y se cobra, ¿la venta cuenta como propia?`,
      montoEnJuego: f.facturado,
      // Es la MISMA relación comercial que ya cuenta la línea de los tratos sin decidir,
      // mirada del lado de la factura en vez del lado de la venta.
      yaContadoEn: "PIPELINE_SIN_DECIDIR",
      queHacer:
        "Decidir si Shared Selling cuenta como venta propia. Si la respuesta es sí, es un solo cambio de bandera " +
        "(esVentaPropia en lib/ventas/pipelines.ts) y el vendido del año sube de golpe; si es no, esta facturación " +
        "necesita otra explicación.",
      resuelve: "DIRECCION",
      items: f.items,
    });
  }

  // ── Factura el hijo, vendió la madre ───────────────────────────────────────
  if (e.facturaDeGrupo.cuantas > 0) {
    out.push({
      codigo: "FACTURA_DE_GRUPO",
      severidad: "MEDIA",
      titulo: "La empresa que factura y la que vendió son del mismo grupo",
      detalle:
        "La venta se registró a nombre de la empresa madre y la facturación cuelga de una hija (o al revés). Las dos " +
        "cosas existen y son correctas por separado; lo que falta es el vínculo, y sin él el reporte cuenta la venta " +
        "como no cobrada y la factura como sin venta — el mismo dinero contado mal dos veces.",
      montoEnJuego: e.facturaDeGrupo.facturado,
      // La venta de la madre ya se cuenta como descubierta en la línea de arriba: es la
      // misma plata vista desde la hija.
      yaContadoEn: "VENTAS_SIN_COBRANZA",
      queHacer: "Confirmar qué empresas son del mismo grupo y ligarlas, para que la venta y su facturación se encuentren.",
      resuelve: "COBRANZA",
      items: e.facturaDeGrupo.items,
    });
  }

  // El orden es la agenda: primero lo que más plata mueve; lo no cuantificable, después,
  // ordenado por severidad. Una lista alfabética obligaría a leerla entera para priorizar.
  const peso: Record<Severidad, number> = { ALTA: 0, MEDIA: 1, BAJA: 2 };
  return out.sort((a, b) => {
    if (a.montoEnJuego !== null && b.montoEnJuego !== null) return b.montoEnJuego - a.montoEnJuego;
    if (a.montoEnJuego !== null) return -1;
    if (b.montoEnJuego !== null) return 1;
    return peso[a.severidad] - peso[b.severidad];
  });
}

/** El titular de la sección: cuántas hay, cuánta plata mueven y cuántas decide dirección. */
export function resumirInconsistencias(xs: readonly Inconsistencia[]): {
  cuantas: number;
  montoTotal: number;
  porSeveridad: Record<Severidad, number>;
  paraDireccion: number;
} {
  return {
    cuantas: xs.length,
    // Solo la plata DISTINTA: las líneas marcadas `yaContadoEn` miran el mismo dinero
    // desde otro ángulo y sumarlas infla el titular sin que nada avise.
    montoTotal: round2(xs.reduce((n, x) => n + (x.yaContadoEn ? 0 : (x.montoEnJuego ?? 0)), 0)),
    porSeveridad: {
      ALTA: xs.filter((x) => x.severidad === "ALTA").length,
      MEDIA: xs.filter((x) => x.severidad === "MEDIA").length,
      BAJA: xs.filter((x) => x.severidad === "BAJA").length,
    },
    paraDireccion: xs.filter((x) => x.resuelve === "DIRECCION").length,
  };
}

export { listar as listarItems };
