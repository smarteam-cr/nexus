/**
 * lib/db/llaves-de-la-empresa.ts — las llaves que protegen de quién es cada reunión (R7, 2026-10-24). PURO.
 *
 * `check:esquema` mira tablas, columnas y valores de enum; no ve llaves foráneas. Si una de estas faltara, o borrara lo
 * que no debe, la base volvería a aceptar reuniones apuntando a una empresa borrada (o a llevárselas al borrar la
 * empresa) sin que nada lo dijera. INV48 (scripts/check-invariants.ts) lee de Postgres cada llave con lo que hace al
 * borrar (`pg_constraint.confdeltype`) y la compara con esta lista. Desde R7b (2026-10-24) también mira que
 * `Client.hubspotCompanyId` sea único: sin el índice, dos fichas vuelven a poder quedarse con la misma empresa.
 * Decisión: docs/DECISIONS.md › «Las llaves de la empresa». SQL: scripts/sql/2026-10-24-llaves-de-la-empresa.sql y
 * scripts/sql/2026-10-25-datos-de-la-empresa.sql (el índice).
 */

/** Lo que hace la llave al borrar la empresa, con la letra de `pg_constraint.confdeltype`: r = RESTRICT, n = SET NULL. */
export type AlBorrar = "r" | "n" | "a" | "c" | "d";

export const LLAVES_DE_LA_EMPRESA: readonly { nombre: string; alBorrar: AlBorrar }[] = [
  { nombre: "FirefliesSession_resolvedClientId_fkey", alBorrar: "r" },
  { nombre: "FirefliesSession_manualClientId_fkey", alBorrar: "n" },
];

const QUE_HACE: Record<AlBorrar, string> = { r: "RESTRICT", n: "SET NULL", a: "NO ACTION", c: "CASCADE", d: "SET DEFAULT" };

/** Lo que está mal, dadas las llaves que tiene la base con lo que hace cada una al borrar. Vacío = todo bien. */
export function problemasDeLasLlaves(enLaBase: readonly { nombre: string; alBorrar: string }[]): string[] {
  const porNombre = new Map(enLaBase.map((l) => [l.nombre, l.alBorrar]));
  const problemas: string[] = [];
  for (const llave of LLAVES_DE_LA_EMPRESA) {
    const actual = porNombre.get(llave.nombre);
    if (actual === undefined) problemas.push(`falta ${llave.nombre}`);
    else if (actual !== llave.alBorrar) {
      problemas.push(`${llave.nombre} hace ${QUE_HACE[actual as AlBorrar] ?? actual} al borrar y debe hacer ${QUE_HACE[llave.alBorrar]}`);
    }
  }
  return problemas;
}

/** Los índices únicos de la empresa (R7b): una empresa de HubSpot es de una sola ficha. */
export const INDICES_UNICOS_DE_LA_EMPRESA: readonly string[] = ["Client_hubspotCompanyId_key"];

/** Lo que falta, dados los índices de "Client" con si son únicos (`pg_index.indisunique`). Vacío = todo bien. */
export function problemasDeLosIndices(enLaBase: readonly { nombre: string; unico: boolean }[]): string[] {
  const porNombre = new Map(enLaBase.map((i) => [i.nombre, i.unico]));
  return INDICES_UNICOS_DE_LA_EMPRESA.flatMap((nombre) => {
    const unico = porNombre.get(nombre);
    if (unico === undefined) return [`falta ${nombre}`];
    return unico ? [] : [`${nombre} existe pero no es único`];
  });
}
