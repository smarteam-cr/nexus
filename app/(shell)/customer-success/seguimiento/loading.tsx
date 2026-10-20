/**
 * Esqueleto de /customer-success/seguimiento — la carga lee el calendario de quien lleva cada cuenta.
 *
 * FORMA REAL (page.tsx → SeguimientoDeCuentas): cabecera · la fila de filtros (el selector y los dos botones) · la línea
 * con los conteos · UNA tarjeta con la fila de títulos y una fila por cuenta (cuenta, próxima sesión, siguiente paso,
 * temas y última reunión). Los títulos se saben antes de cargar: se pintan de verdad.
 */
import { PageHeaderSkeleton, Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

const COLUMNAS = "lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.6fr)_minmax(0,0.9fr)]";
const ROTULO = "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-fg-muted";

export default function SeguimientoDeCuentasLoading() {
  return (
    <div className={cn(SHELL_DEFAULT, "space-y-6")}>
      <PageHeaderSkeleton titleWidth="w-56" descWidth="w-[36rem]" />
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-9 w-44" />
      </div>
      <Skeleton className="h-3 w-[40rem] max-w-full" />
      <section className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className={cn("hidden gap-x-5 border-b border-line bg-surface-muted px-4 py-2 lg:grid", COLUMNAS)}>
          <span className={ROTULO}>Cuenta</span>
          <span className={ROTULO}>Próxima sesión</span>
          <span className={ROTULO}>Siguiente paso</span>
          <span className={ROTULO}>Temas que se están tratando</span>
          <span className={ROTULO}>Última reunión</span>
        </div>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={cn("grid min-h-[108px] grid-cols-1 gap-x-5 gap-y-2.5 border-t border-line px-4 py-3.5 first:border-t-0", COLUMNAS)}>
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" delay={i * 40} />
              <Skeleton className="h-3 w-28" delay={i * 40} />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-28" delay={i * 40} />
              <Skeleton className="h-3 w-36" delay={i * 40} />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-40" delay={i * 40} />
              <Skeleton className="h-3 w-28" delay={i * 40} />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-full" delay={i * 40} />
              <Skeleton className="h-3 w-4/5" delay={i * 40} />
              <Skeleton className="h-3 w-3/5" delay={i * 40} />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-24" delay={i * 40} />
              <Skeleton className="h-3 w-32" delay={i * 40} />
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
