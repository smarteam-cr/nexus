/**
 * lib/db/escritura-sql-cruda.ts — QUÉ CUENTA COMO ESCRIBIR SQL CRUDO EN LA BASE.
 *
 * Un solo dueño para dos consumidores: INV12 (`scripts/check-invariants.ts`) y el trinquete
 * `lib/db/guard-de-escritura.test.ts`. Los dos miraban `prisma.x.update(...)`, `$executeRaw` y los
 * scripts con `--apply`, y ninguno veía `pool.query(`ALTER TABLE …`)`: así vivieron meses tres
 * scripts de la migración de roles que hacían ALTER/UPDATE contra producción sin guard y sin
 * `--apply` (auditoría 2026-09-03, A-09) — y el primero ASCENDÍA a SUPER_ADMIN a todo ADMIN, porque
 * el enum cambió después de escribirlos. Se borraron; esto es lo que impide que vuelvan.
 *
 * El VERBO decide, no la llamada: `pool.query(`SELECT …`)` (inspect-delivery-sessions.ts) no es
 * escritura y no necesita guard. Límite conocido y aceptado: una consulta armada en una variable
 * (`pool.query(sql)`) no se ve — el guard sigue siendo obligatorio igual; esto es la red, no la regla.
 */

/** `pool.query(` / `client.query(` seguido —con o sin salto de línea y comilla— de un verbo de escritura. */
export const ESCRITURA_SQL_CRUDA =
  /(?:pool|client)\.query\(\s*[`"']?\s*(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE)\b/i;

export function escribeSqlCrudo(src: string): boolean {
  return ESCRITURA_SQL_CRUDA.test(src);
}
