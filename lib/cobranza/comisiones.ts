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
