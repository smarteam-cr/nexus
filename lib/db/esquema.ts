/**
 * lib/db/esquema.ts — ¿la base está ATRÁS del código?
 *
 * ── EL HUECO QUE ESTO TAPA ───────────────────────────────────────────────────
 * En este repo las migraciones son SQL a mano que aplica una persona DESPUÉS del deploy
 * (ARCHITECTURE Parte 0 · cap. D). O sea que siempre hay una ventana —minutos u horas— en la
 * que el código ya pide una tabla o una columna que la base todavía no tiene. Sin una guarda,
 * esa ventana es un 500 en la cara del usuario, y un 500 no se lee como «falta correr un
 * script»: se lee como «el módulo está roto», que manda a arreglar lo que no está roto.
 *
 * ⚠ SON DOS CÓDIGOS, NO UNO. Se descubrió el 2026-08-23: el módulo SICOP ya se cuidaba de
 * P2021 (tabla ausente) y aun así la pantalla reventaba, porque la segunda migración agregaba
 * COLUMNAS a una tabla que sí existía — y eso es P2022. Cuidar solo el primero da una falsa
 * sensación de red: funciona para una tabla nueva y falla justo para el caso más común, que
 * es agregarle un campo a algo que ya está.
 *
 * ⚠ DUCK-TYPING, NO `instanceof`. Con driver adapters (`@prisma/adapter-pg`, que es lo que
 * usa Nexus) puede haber dos copias del client en memoria y `instanceof
 * PrismaClientKnownRequestError` devolver false para un error que SÍ lo es. El `code` alcanza
 * y no miente. Es el mismo patrón que ya usa `lib/business-cases/use-cases.ts`.
 */

/** Códigos de Prisma y de Postgres para «eso que pedís todavía no existe acá». */
const CODIGOS = new Set([
  "P2021", // Prisma: la tabla no existe
  "42P01", // Postgres: undefined_table
  "P2022", // Prisma: la columna no existe
  "42703", // Postgres: undefined_column
]);

/**
 * true = la base no tiene todavía la tabla o la columna que el código pide, casi siempre
 * porque falta aplicar un `.sql` de `scripts/sql/`.
 *
 * El llamador degrada con un aviso que NOMBRA el archivo pendiente. Nunca se silencia: una
 * pantalla que se ve vacía sin decir por qué es peor que una que dice qué falta.
 */
export function esquemaDesactualizado(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  if (code && CODIGOS.has(code)) return true;
  /* Red de último recurso para cuando el error viaja envuelto y pierde el `code` — pasa al
     cruzar el borde del driver adapter. */
  const msg = e instanceof Error ? e.message : "";
  return /does not exist in the current database|no existe la (relación|columna)/i.test(msg);
}
