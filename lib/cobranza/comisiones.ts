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
  periodo: string; // "YYYY-MM"
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
 * Lo devengado, agrupado por persona × período × moneda.
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
): ComisionDevengada[] {
  interface Acc {
    teamMemberId: string;
    vendedorNombre: string;
    periodo: string;
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

    const periodo = periodoDeFecha(c.fechaCobro);
    const clave = `${regla.teamMemberId}::${periodo}::${c.moneda}`;
    let g = porGrupo.get(clave);
    if (!g) {
      g = {
        teamMemberId: regla.teamMemberId,
        vendedorNombre: regla.vendedorNombre,
        periodo,
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
        b.periodo.localeCompare(a.periodo) ||
        a.vendedorNombre.localeCompare(b.vendedorNombre) ||
        a.moneda.localeCompare(b.moneda),
    );
}

// ── CUÁNDO se paga la comisión ─────────────────────────────────────────────────
// Elías eligió «junto con el salario» y pidió explícitamente que quede armado
// para cambiarlo después («por ejemplo ponerlo en la primera semana de cada mes,
// o alguna configuración similar»). Por eso la regla NO está escrita adentro del
// panel ni de la mutación: vive acá, es pura, y cambiarla es cambiar una
// constante — con un test por política que dice qué hace cada una.

/** Las políticas que el sistema sabe resolver. */
export const POLITICAS_PAGO_COMISION = [
  /** La comisión del mes M se paga en la Q1 del mes M+1 (el 15 del siguiente). */
  "Q1_MES_SIGUIENTE",
  /** En la Q2 del MISMO mes (fin de mes). */
  "Q2_MISMO_MES",
  /** En la Q1 del MISMO mes (el 15). */
  "Q1_MISMO_MES",
] as const;

export type PoliticaPagoComision = (typeof POLITICAS_PAGO_COMISION)[number];

export const POLITICA_PAGO_COMISION_LABEL: Record<PoliticaPagoComision, string> = {
  Q1_MES_SIGUIENTE: "Con la quincena del 15 del mes siguiente",
  Q2_MISMO_MES: "Con la quincena de fin del mismo mes",
  Q1_MISMO_MES: "Con la quincena del 15 del mismo mes",
};

/**
 * La política VIGENTE. Es una constante y no una fila de configuración a
 * propósito: hoy hay una sola empresa y una sola forma de pagar, y una tabla de
 * settings para un valor que nadie cambió todavía es una pantalla que mantener
 * sin nadie que la use. El día que haga falta, esto pasa a leerse de la base y
 * `quincenaDePagoDeComision` no se entera — ya recibe la política por parámetro.
 *
 * ⚠ Por qué el mes SIGUIENTE y no el mismo: la comisión de marzo se calcula
 * sobre TODO lo cobrado en marzo, incluido el día 31. Pagarla el 30 de marzo
 * sería pagar un número que todavía no se puede saber. La Q1 de abril es la
 * primera planilla en la que el monto ya está cerrado.
 */
export const POLITICA_PAGO_COMISION: PoliticaPagoComision = "Q1_MES_SIGUIENTE";

/**
 * En qué quincena cae la comisión devengada en `periodo`.
 *
 * Devuelve solo el par (período, quincena) — NO busca la fila: si esa quincena
 * no existe en el libro, quien llama decide qué hacer (hoy: la liquida suelta y
 * lo dice). Mantenerla pura es lo que permite testear las tres políticas y el
 * salto de diciembre sin una base de datos.
 */
export function quincenaDePagoDeComision(
  periodo: string,
  politica: PoliticaPagoComision = POLITICA_PAGO_COMISION,
): { periodo: string; quincena: 1 | 2 } {
  if (politica === "Q2_MISMO_MES") return { periodo, quincena: 2 };
  if (politica === "Q1_MISMO_MES") return { periodo, quincena: 1 };
  return { periodo: periodoSiguiente(periodo), quincena: 1 };
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
