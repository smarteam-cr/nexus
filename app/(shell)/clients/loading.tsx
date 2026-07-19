/**
 * Loading skeleton de /clients.
 *
 * FORMA REAL (page.tsx → ClientsGrid): `px-6 py-8` (= SHELL_DEFAULT, escrito a mano en el
 * page.tsx con ese valor) · PageHeader con acción "Business cases" · y dentro del `space-y-3`
 * del grid: la fila de píldoras (Todos / Mis clientes / Compartido) y la tabla de 8 columnas
 * con buscador + filtros → toolbar. Se pinta bajo el layout del route group (shell) → nace
 * CON sidebar.
 *
 * Desajustes corregidos:
 *  - la fila de píldoras estaba armada a mano con tres <Skeleton> → SkeletonTabs
 *    variant="pill" (mismo widget, una sola implementación), con el `gap-1.5` y el
 *    `flex-wrap` de la fila real en vez del `gap-2` por defecto.
 *  - la separación pestañas↔tabla era `mb-4`; el ClientsGrid usa `space-y-3` → 12px, no 16.
 *  - la descripción es cortita ("N clientes"), no `w-80`.
 *
 * Nota: las píldoras NO se renderizan para SUPER_ADMIN (`canFilter = !isSuperAdmin`), pero el
 * rol no se conoce todavía acá; se reservan porque son el caso mayoritario.
 */
import { PageHeaderSkeleton, SkeletonTabs, TableSkeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function ClientsLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <PageHeaderSkeleton titleWidth="w-24" descWidth="w-28" action />

      <div className="space-y-3">
        {/* Todos / Mis clientes / Compartido */}
        <SkeletonTabs count={3} variant="pill" className="gap-1.5 flex-wrap" />

        {/* Cliente · Última actividad · Próxima reunión · CSE · Reunión ventas · Sesión CSE · Proyectos · acciones */}
        <TableSkeleton columns={8} rows={9} toolbar />
      </div>
    </div>
  );
}
