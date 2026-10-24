/**
 * lib/db/sql-en-pasadas.ts — aplica una lista de `.sql` en pasadas. PURO (recibe cómo aplicar cada uno).
 *
 * Los `scripts/sql/` posteriores al baseline se aplican en orden de nombre, pero ese orden no siempre respeta sus
 * dependencias: dos archivos del mismo día se ordenan por su nombre, no por cuál crea la tabla que el otro usa
 * (`2026-08-16-partner-comercial.sql` usa `ComisionPartner`, que crea `2026-08-16-planilla-tarjetas-comisiones.sql`).
 * En producción no importa (se aplicaron a mano, en el orden en que se escribieron); en una base local NUEVA el
 * bootstrap se caía. Lo encontró la revisión del roadmap del 2026-10-24 (paso cero).
 *
 * La regla: se aplican todos; los que fallan se reintentan en la pasada siguiente, porque el que crea su tabla ya pudo
 * correr. Si una pasada no logra aplicar NINGUNO de los que quedan, se aborta y se dice, de cada archivo que quedó, su
 * error: ahí ya no es un problema de orden, y el culpable puede no ser el primero por nombre (si A necesita algo de B
 * y B está roto, el error que importa es el de B). Funciona porque todo `.sql` tiene que poder correr dos veces.
 */
export interface FallaDeSql {
  archivo: string;
  detalle: string;
}

const detalleDe = (error: unknown) => (error instanceof Error ? error.message : String(error));

export async function aplicarEnPasadas(
  archivos: readonly string[],
  aplicar: (archivo: string) => Promise<void>,
): Promise<{ aplicados: string[]; pasadas: number }> {
  const aplicados: string[] = [];
  let pendientes = [...archivos];
  let pasadas = 0;
  while (pendientes.length > 0) {
    pasadas += 1;
    const fallaron: FallaDeSql[] = [];
    for (const archivo of pendientes) {
      try {
        await aplicar(archivo);
        aplicados.push(archivo);
      } catch (error) {
        fallaron.push({ archivo, detalle: detalleDe(error) });
      }
    }
    if (fallaron.length === pendientes.length) throw new ErrorDeSqlEnPasadas(fallaron);
    pendientes = fallaron.map((f) => f.archivo);
  }
  return { aplicados, pasadas };
}

/** Lo que quedó sin aplicar, cada archivo con el error de la última pasada. */
export class ErrorDeSqlEnPasadas extends Error {
  constructor(readonly fallas: FallaDeSql[]) {
    super(fallas.map((f) => `${f.archivo}: ${f.detalle}`).join(" · "));
    this.name = "ErrorDeSqlEnPasadas";
  }
}
