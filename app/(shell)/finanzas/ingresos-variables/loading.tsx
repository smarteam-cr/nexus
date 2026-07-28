/**
 * Loading de /finanzas/ingresos-variables.
 *
 * FORMA REAL: PageHeader CON acción ("Registrar ingreso") · banner de contexto ·
 * fila de 4 pills + total a la derecha · tabla de 6 columnas con toolbar de
 * buscador (sin acciones).
 */
import { PageHeaderSkeleton, SkeletonTabs, SkeletonPanel, Skeleton, TableSkeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function IngresosVariablesLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <PageHeaderSkeleton titleWidth="w-52" descWidth="w-96 max-w-full" action />

      <div className="space-y-4">
        {/* Banner "Dinero que entró fuera del ciclo quincenal…" (2 líneas) */}
        <SkeletonPanel minH="min-h-[52px]" bodyClassName="px-3 py-2 space-y-1.5">
          <Skeleton className="h-3 w-full max-w-[560px]" />
          <Skeleton className="h-3 w-72 max-w-full" delay={40} />
        </SkeletonPanel>

        {/* Pills Todos | Registrados | Pagos puntuales | Rescatados + total */}
        <div className="flex items-center gap-1.5">
          <SkeletonTabs count={4} variant="pill" className="gap-1.5" />
          <Skeleton className="h-3 w-32 ml-auto" delay={80} />
        </div>

        {/* Cliente · Concepto · Tipo · Entró · Atraso · Monto */}
        <TableSkeleton columns={6} rows={8} toolbar />
      </div>
    </div>
  );
}
