/**
 * Loading skeleton de /clients — replica la ESTRUCTURA final de la página
 * (PageHeader con acción + fila de pestañas Mis clientes/Compartido/Todos +
 * tabla de 8 columnas con toolbar) para que al resolver el RSC nada se mueva.
 * Se pinta bajo el layout del route group (shell) → nace CON sidebar.
 */
import { PageHeaderSkeleton, Skeleton, TableSkeleton } from "@/components/ui";

export default function ClientsLoading() {
  return (
    <div className="px-6 py-8">
      <PageHeaderSkeleton titleWidth="w-32" descWidth="w-80" action />

      {/* Pestañas Mis clientes / Compartido / Todos */}
      <div className="flex items-center gap-2 mb-4">
        <Skeleton className="h-7 w-28" rounded="lg" />
        <Skeleton className="h-7 w-24" rounded="lg" delay={60} />
        <Skeleton className="h-7 w-20" rounded="lg" delay={120} />
      </div>

      {/* Cliente · Última actividad · Próxima reunión · CSE · Reunión ventas · Sesión CSE · Proyectos · acciones */}
      <TableSkeleton columns={8} rows={9} toolbar />
    </div>
  );
}
