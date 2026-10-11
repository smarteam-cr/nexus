/**
 * components/tareas/TareasSinElSql.tsx — lo que muestra una pantalla de Tareas cuando a la base le falta el SQL del
 * módulo (o el proceso corre con el cliente de Prisma de antes). Un aviso que nombra el archivo, nunca un 500: un error
 * se lee como «Tareas está roto», y lo que falta es correr un script.
 *
 * Pasa en el `dev:prod` (el 3004: cliente regenerado contra la base de producción, todavía sin el SQL) y en una base
 * local atrasada. En producción no: `/api/health` frena un deploy con la base atrasada.
 */
import { Alert } from "@/components/ui";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { SQL_DE_TAREAS } from "@/lib/tareas/estados";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

/** Marca de «falta el SQL» para el `.catch` de la carga de una página. */
export const SIN_EL_SQL = Symbol("sin-el-sql-de-tareas");

/** Para el `.catch` de la carga: la tabla o la columna que falta da la marca; cualquier otro error sigue subiendo. */
export function siFaltaElSql(e: unknown): typeof SIN_EL_SQL {
  if (esquemaDesactualizado(e)) {
    console.error(`[tareas] a la base le falta algo de ${SQL_DE_TAREAS}: ${e instanceof Error ? e.message : e}`);
    return SIN_EL_SQL;
  }
  throw e;
}

export function TareasSinElSql() {
  return (
    <div className={SHELL_DEFAULT}>
      <Alert variant="warning" title="Tareas todavía no está disponible">
        A esta base le falta {SQL_DE_TAREAS} (y, si recién se aplicó, regenerar el cliente de Prisma y reiniciar el
        servidor).
      </Alert>
    </div>
  );
}
