/**
 * Loading skeleton de /agents.
 *
 * FORMA REAL (page.tsx → AgentsClient): `px-6 py-8` (= SHELL_DEFAULT; el AgentsClient lo
 * tiene escrito a mano con ese valor) · PageHeader con acción "Nuevo agente" · y el catálogo
 * agrupado POR CATEGORÍA (`space-y-8`, cada sección con su título + contador, una línea de
 * descripción, y su propia tabla).
 *
 * Desajustes corregidos contra la pantalla real:
 *  - el header estaba armado a mano con dos <Skeleton> → PageHeaderSkeleton (con `action`:
 *    el botón existe para SUPER_ADMIN y reservarlo evita que el header se re-acomode; no
 *    cambia la altura de la fila para el resto).
 *  - prometía UNA tabla plana CON toolbar; la pantalla real trae VARIAS tablas agrupadas y
 *    SIN buscador (las <Table> de agentes no reciben `search` ni `filters`, así que Table no
 *    dibuja toolbar). La fila del buscador desaparecía al resolver y todo subía ~60px.
 */
import { PageHeaderSkeleton, Skeleton, TableSkeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function AgentsLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <PageHeaderSkeleton titleWidth="w-32" descWidth="w-[32rem] max-w-full" action />

      <div className="space-y-8">
        {[0, 1].map((s) => (
          <section key={s}>
            {/* Título de la categoría + contador */}
            <div className="mb-2 flex items-baseline gap-2">
              <Skeleton className="h-3.5 w-40" delay={s * 80} />
              <Skeleton className="h-2.5 w-6" delay={s * 80 + 40} />
            </div>
            {/* Descripción de la categoría */}
            <Skeleton className="h-2.5 w-80 max-w-full mb-3" delay={s * 80 + 80} />
            {/* Agente · Estado · Salida · Disparador · Corridas · acciones */}
            <TableSkeleton columns={6} rows={4} />
          </section>
        ))}
      </div>
    </div>
  );
}
