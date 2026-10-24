/**
 * lib/db/llaves-de-la-empresa.ts — las llaves que protegen de quién es cada reunión (R7, 2026-10-24). PURO.
 *
 * `check:esquema` mira tablas, columnas y valores de enum; no ve llaves foráneas. Si una de estas faltara, la base
 * volvería a aceptar reuniones apuntando a una empresa borrada sin que nada lo dijera. INV48 (scripts/check-invariants.ts)
 * lee lo que tiene Postgres y usa esta lista. Cuando R7b vuelva único `Client.hubspotCompanyId`, su índice se suma aquí.
 * Decisión: docs/DECISIONS.md › «Las llaves de la empresa». SQL: scripts/sql/2026-10-24-llaves-de-la-empresa.sql.
 */
export const LLAVES_DE_LA_EMPRESA = {
  llavesForaneas: ["FirefliesSession_resolvedClientId_fkey", "FirefliesSession_manualClientId_fkey"],
  indicesUnicos: [] as string[],
};

/** Las que faltan, dados los nombres de llaves foráneas e índices que tiene la base. */
export function llavesQueFaltan(enLaBase: { llavesForaneas: readonly string[]; indices: readonly string[] }): string[] {
  const fks = new Set(enLaBase.llavesForaneas);
  const indices = new Set(enLaBase.indices);
  return [
    ...LLAVES_DE_LA_EMPRESA.llavesForaneas.filter((n) => !fks.has(n)),
    ...LLAVES_DE_LA_EMPRESA.indicesUnicos.filter((n) => !indices.has(n)),
  ];
}
