/**
 * lib/cobranza/comisiones.ts — el cálculo PURO de la comisión de vendedor.
 *
 * Sin Prisma, sin red, sin `new Date()` implícito: entra data, sale data. Lo que
 * decide qué comisión se devengó vive acá y en ningún otro lado.
 *
 * ⚠ La comisión DEVENGADA no es una fila: es esta función corriendo sobre los
 * cobros COBRADO. Se refutó el diseño de escribirla al cobrar —
 * `cambiarEstadoCobro` no tiene transacción, no es el único escritor de COBRADO
 * (el importador metió 87 cobros por su cuenta) y el revert no deja bitácora —,
 * así que había tres formas de tener un cobro sin su comisión y ningún
 * invariante que lo viera. Derivada, un revert simplemente cambia el resultado.
 *
 * ⚠ La base es lo COBRADO (decisión de Elías), no lo facturado, y el reloj es
 * `fechaCobro`: el día que entró la plata. Ese día decide qué regla estaba
 * vigente y a qué período pertenece.
 *
 * ⚠ CRC y USD nunca se suman ni se convierten (regla transversal del módulo):
 * una persona con cobros en las dos monedas devenga DOS comisiones.
 */

export interface ReglaComision {
  id: string;
  teamMemberId: string;
  vendedorNombre: string;
  /** null = la regla general, vale para todos los clientes. */
  clientId: string | null;
  /** Puntos porcentuales: 10 = 10%. */
  porcentaje: number;
  vigenteDesde: string; // ISO YYYY-MM-DD
  vigenteHasta: string | null;
}

export interface CobroComisionable {
  id: string;
  clientId: string;
  clienteNombre: string;
  fechaCobro: string; // ISO YYYY-MM-DD — el día que entró la plata
  monto: number;
  moneda: string;
}

export interface DetalleComision {
  cobroId: string;
  clienteNombre: string;
  fechaCobro: string;
  monto: number;
}

export interface ComisionDevengada {
  teamMemberId: string;
  vendedorNombre: string;
  /**
   * "YYYY-MM" de la planilla que PAGA, no del mes en que se cobró.
   *
   * ⚠ Cambió de significado el 2026-08-16 con la corrección de Alexander: antes
   * era el mes de devengo. Un cobro del 15 de julio y uno del 31 de julio son del
   * mismo mes y caen en planillas distintas, así que agrupar por mes de devengo
   * mezclaba dos pagos en una sola línea. Se pudo cambiar sin migrar nada porque
   * no había ninguna comisión liquidada todavía.
   */
  periodo: string;
  /** 1 = la del 15 · 2 = la de fin de mes. Parte de la identidad del grupo. */
  quincena: 1 | 2;
  /** El día exacto en que se paga, ISO. Es el que se muestra. */
  fechaPago: string;
  moneda: string;
  /** Suma de los cobros que la produjeron. */
  base: number;
  porcentaje: number;
  monto: number;
  cobroIds: string[];
  detalle: DetalleComision[];
  /**
   * Cuántos porcentajes distintos entraron en el grupo. > 1 significa que la
   * regla cambió a mitad de período: el `porcentaje` de arriba es el promedio
   * ponderado y no sirve para rehacer la cuenta a mano — el detalle sí.
   */
  porcentajesDistintos: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** "2026-08-14" → "2026-08". */
export function periodoDeFecha(fechaISO: string): string {
  return fechaISO.slice(0, 7);
}

/**
 * La regla que aplica a un cobro. **La más específica gana**: una regla de ESE
 * cliente le gana a la general, aunque la general sea más nueva. Entre dos de la
 * misma especificidad manda la de `vigenteDesde` más reciente — así corregir un
 * porcentaje es cargar una regla nueva, no editar la vieja y perder la historia.
 *
 * Devuelve `null` cuando nadie tiene regla vigente ese día: sin regla no hay
 * comisión, y no se inventa un porcentaje por defecto.
 */
export function reglaParaCobro(
  reglas: ReglaComision[],
  clientId: string,
  fechaISO: string,
): ReglaComision | null {
  const vigentes = reglas.filter(
    (r) => r.vigenteDesde <= fechaISO && (r.vigenteHasta === null || r.vigenteHasta >= fechaISO),
  );
  const delCliente = vigentes.filter((r) => r.clientId === clientId);
  const candidatas = delCliente.length > 0 ? delCliente : vigentes.filter((r) => r.clientId === null);
  if (candidatas.length === 0) return null;

  // Desempate estable: `vigenteDesde` más reciente y, si empatan, el id — dos
  // corridas sobre la misma data tienen que dar la misma comisión.
  return [...candidatas].sort((a, b) =>
    a.vigenteDesde === b.vigenteDesde
      ? b.id.localeCompare(a.id)
      : b.vigenteDesde.localeCompare(a.vigenteDesde),
  )[0];
}

/**
 * Lo devengado, agrupado por persona × QUINCENA DE PAGO × moneda.
 *
 * ⚠ El grupo es el PAGO, no el mes de devengo. La regla la corrigió Alexander:
 * la comisión se paga en el primer fin de mes posterior a que el cliente pagó,
 * así que dos cobros del mismo mes pueden caer en planillas distintas y hay que
 * separarlos desde acá — si se agruparan por mes de devengo, la pantalla
 * prometería un pago que la planilla no puede hacer.
 *
 * Efecto secundario deseable: cada grupo es "todo lo que entró estrictamente
 * antes del 30", que ES un número que se puede saber el 30. Agrupar por mes de
 * devengo obligaba a esperar al mes siguiente para cerrarlo.
 *
 * `yaLiquidados` son los cobros que ya se pagaron en una liquidación anterior:
 * se excluyen para no pagar dos veces lo mismo. Es un Set de ids, no una fecha
 * de corte — liquidar es un acto explícito y puede quedar un cobro viejo sin
 * liquidar sin que eso arrastre a los nuevos.
 */
export function devengarComisiones(
  cobros: CobroComisionable[],
  reglas: ReglaComision[],
  yaLiquidados: ReadonlySet<string> = new Set(),
  politica: PoliticaPagoComision = POLITICA_PAGO_COMISION,
): ComisionDevengada[] {
  interface Acc {
    teamMemberId: string;
    vendedorNombre: string;
    periodo: string;
    quincena: 1 | 2;
    fechaPago: string;
    moneda: string;
    base: number;
    monto: number;
    cobroIds: string[];
    detalle: DetalleComision[];
    porcentajes: Set<number>;
  }
  const porGrupo = new Map<string, Acc>();

  for (const c of cobros) {
    if (yaLiquidados.has(c.id)) continue;
    if (c.monto <= 0) continue;
    const regla = reglaParaCobro(reglas, c.clientId, c.fechaCobro);
    if (!regla) continue;

    const pago = quincenaDePagoDeComision(c.fechaCobro, politica);
    const clave = `${regla.teamMemberId}::${pago.periodo}::${pago.quincena}::${c.moneda}`;
    let g = porGrupo.get(clave);
    if (!g) {
      g = {
        teamMemberId: regla.teamMemberId,
        vendedorNombre: regla.vendedorNombre,
        periodo: pago.periodo,
        quincena: pago.quincena,
        fechaPago: pago.fechaProgramada,
        moneda: c.moneda,
        base: 0,
        monto: 0,
        cobroIds: [],
        detalle: [],
        porcentajes: new Set(),
      };
      porGrupo.set(clave, g);
    }
    g.base += c.monto;
    // Se redondea POR COBRO: es lo que muestra el detalle, y así la suma que ve
    // la persona es exactamente la que se le paga.
    g.monto += round2((c.monto * regla.porcentaje) / 100);
    g.cobroIds.push(c.id);
    g.detalle.push({
      cobroId: c.id,
      clienteNombre: c.clienteNombre,
      fechaCobro: c.fechaCobro,
      monto: c.monto,
    });
    g.porcentajes.add(regla.porcentaje);
  }

  return [...porGrupo.values()]
    .map((g) => {
      const base = round2(g.base);
      const monto = round2(g.monto);
      return {
        teamMemberId: g.teamMemberId,
        vendedorNombre: g.vendedorNombre,
        periodo: g.periodo,
        quincena: g.quincena,
        fechaPago: g.fechaPago,
        moneda: g.moneda,
        base,
        // Con un solo porcentaje es EL porcentaje; con varios es el efectivo
        // (ponderado), y `porcentajesDistintos` avisa que no se puede rehacer
        // la cuenta con un solo número.
        porcentaje: base > 0 ? round2((monto / base) * 100) : 0,
        monto,
        cobroIds: g.cobroIds,
        detalle: g.detalle.sort((a, b) => a.fechaCobro.localeCompare(b.fechaCobro)),
        porcentajesDistintos: g.porcentajes.size,
      };
    })
    .sort(
      (a, b) =>
        b.fechaPago.localeCompare(a.fechaPago) ||
        a.vendedorNombre.localeCompare(b.vendedorNombre) ||
        a.moneda.localeCompare(b.moneda),
    );
}

// ── CUÁNDO se paga la comisión ─────────────────────────────────────────────────
// La regla la corrigió Alexander Arrieta (2026-08-16): «los pagos de comisiones
// se hacen los 30 de acuerdo al pago de los clientes… por las fechas de pagos de
// los clientes que no son exactas». Elías lo cerró así: «se hacen el SIGUIENTE 30
// después de que el cliente pague».
//
// ⚠ Eso NO es «la comisión del mes M se paga tal día»: el disparador es la fecha
// en que entró la plata de CADA cobro, no el mes al que pertenece. Un cobro del
// 15 de julio y uno del 31 de julio son del mismo mes y se pagan en planillas
// distintas. Por eso la política recibe una FECHA y no un período, y por eso
// `devengarComisiones` agrupa por la quincena de pago y no por el mes de devengo.
//
// Elías pidió explícitamente que quede armado para cambiarlo después («por
// ejemplo ponerlo en la primera semana de cada mes»). Por eso la regla NO está
// escrita adentro del panel ni de la mutación: vive acá, es pura, y cambiarla es
// cambiar una constante — con un test por política que dice qué hace cada una.

/** Las políticas que el sistema sabe resolver. */
export const POLITICAS_PAGO_COMISION = [
  /** La vigente: el primer fin de mes ESTRICTAMENTE posterior al cobro. */
  "SIGUIENTE_FIN_DE_MES",
  /** La primera quincena (15 o fin de mes) estrictamente posterior al cobro. */
  "SIGUIENTE_QUINCENA",
  /** El fin del mes SIGUIENTE al del cobro: un mes entero de colchón. */
  "FIN_DE_MES_SIGUIENTE",
] as const;

export type PoliticaPagoComision = (typeof POLITICAS_PAGO_COMISION)[number];

export const POLITICA_PAGO_COMISION_LABEL: Record<PoliticaPagoComision, string> = {
  SIGUIENTE_FIN_DE_MES: "El siguiente fin de mes después de que el cliente pague",
  SIGUIENTE_QUINCENA: "La siguiente quincena (15 o fin de mes) después del pago",
  FIN_DE_MES_SIGUIENTE: "El fin del mes siguiente al del pago del cliente",
};

/**
 * La política VIGENTE. Es una constante y no una fila de configuración a
 * propósito: hoy hay una sola empresa y una sola forma de pagar, y una tabla de
 * settings para un valor que nadie cambió todavía es una pantalla que mantener
 * sin nadie que la use. El día que haga falta, esto pasa a leerse de la base y
 * `quincenaDePagoDeComision` no se entera — ya recibe la política por parámetro.
 *
 * ⚠ Por qué ESTRICTAMENTE posterior y no «el 30 del mes del cobro»: de los 101
 * cobros COBRADO que hay hoy, 17 caen el último día de su mes. Con un «mismo
 * mes» esos 17 tendrían la comisión programada el mismo día en que entró la
 * plata — o sea pagada antes de estar confirmada. «El SIGUIENTE 30» los manda a
 * la planilla de después, que es exactamente lo que dijo Alexander.
 */
export const POLITICA_PAGO_COMISION: PoliticaPagoComision = "SIGUIENTE_FIN_DE_MES";

export interface QuincenaDePago {
  /** "YYYY-MM" de la planilla que paga. */
  periodo: string;
  /** 1 = la del 15 · 2 = la de fin de mes. */
  quincena: 1 | 2;
  /** El día exacto en que se paga, ISO. Es el que se muestra. */
  fechaProgramada: string;
}

/**
 * En qué quincena de planilla cae la comisión de un cobro pagado en `fechaCobro`.
 *
 * Devuelve solo el destino — NO busca la fila: si esa quincena no existe en el
 * libro, quien llama decide qué hacer (hoy: la liquida suelta y lo dice).
 * Mantenerla pura es lo que permite testear las tres políticas, el salto de
 * diciembre y los meses de 28/30/31 días sin una base de datos.
 */
export function quincenaDePagoDeComision(
  fechaCobro: string,
  politica: PoliticaPagoComision = POLITICA_PAGO_COMISION,
): QuincenaDePago {
  const periodo = fechaCobro.slice(0, 7);
  const finDeMes = finDeMesISO(periodo);

  if (politica === "FIN_DE_MES_SIGUIENTE") return q2De(periodoSiguiente(periodo));

  if (politica === "SIGUIENTE_QUINCENA") {
    const quince = `${periodo}-15`;
    if (fechaCobro < quince) return { periodo, quincena: 1, fechaProgramada: quince };
    if (fechaCobro < finDeMes) return q2De(periodo);
    return { periodo: periodoSiguiente(periodo), quincena: 1, fechaProgramada: `${periodoSiguiente(periodo)}-15` };
  }

  // SIGUIENTE_FIN_DE_MES — la vigente.
  if (fechaCobro < finDeMes) return q2De(periodo);
  return q2De(periodoSiguiente(periodo));
}

function q2De(periodo: string): QuincenaDePago {
  return { periodo, quincena: 2, fechaProgramada: finDeMesISO(periodo) };
}

/**
 * El último día de "YYYY-MM", ISO. Aritmética de calendario a mano, sin `Date`:
 * el módulo entero evita husos horarios porque un `new Date("2026-07-31")` en
 * UTC-6 se lee como el 30 y correría todas las comisiones un día.
 */
export function finDeMesISO(periodo: string): string {
  const anio = Number(periodo.slice(0, 4));
  const mes = Number(periodo.slice(5, 7));
  const largos = [31, esBisiesto(anio) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const dia = largos[mes - 1] ?? 30;
  return `${periodo}-${String(dia).padStart(2, "0")}`;
}

function esBisiesto(anio: number): boolean {
  return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
}

/** "2026-12" → "2027-01". Aritmética de calendario, sin `Date` (y sin husos). */
export function periodoSiguiente(periodo: string): string {
  const anio = Number(periodo.slice(0, 4));
  const mes = Number(periodo.slice(5, 7));
  if (!Number.isFinite(anio) || !Number.isFinite(mes) || mes < 1 || mes > 12) return periodo;
  return mes === 12
    ? `${anio + 1}-01`
    : `${anio}-${String(mes + 1).padStart(2, "0")}`;
}
