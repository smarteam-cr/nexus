/**
 * Loading skeleton de /team.
 *
 * FORMA REAL (page.tsx → TeamManager): contenedor angosto (`max-w-3xl mx-auto px-6 py-8` =
 * SHELL_NARROW; el page.tsx lo tiene escrito a mano con ESE mismo valor) · encabezado
 * título+descripción, SIN acción · y dentro de un `space-y-4`: la barra de ayuda delineada
 * (siempre presente) y la tabla.
 *
 * Se unifica con el estado de carga PROPIO de TeamManager (`TableSkeleton columns={3}
 * rows={5} toolbar`): los dos se ven uno tras otro —primero este loading, después el gate
 * client-side mientras hace fetch de /api/team— así que hablar formas distintas hacía que la
 * pantalla cambiara antes de mostrar nada. Antes eran `rows={6}` y sin toolbar: la tabla
 * perdía una fila y GANABA la fila del buscador al montar (doble salto).
 *
 * NO se reserva la fila de pestañas Miembros/Plantillas: solo la ve SUPER_ADMIN y en el
 * server del loading todavía no se sabe el rol — reservarla dejaría un fantasma para todos
 * los demás.
 */
import { PageHeaderSkeleton, SkeletonPanel, Skeleton, TableSkeleton } from "@/components/ui";
import { SHELL_NARROW } from "@/lib/ui/page-shell";

export default function TeamLoading() {
  return (
    <div className={SHELL_NARROW}>
      <PageHeaderSkeleton titleWidth="w-24" descWidth="w-96 max-w-full" />

      <div className="space-y-4">
        {/* Barra de ayuda (rounded-lg border px-3 py-2, texto xs) */}
        <SkeletonPanel minH="min-h-[16px]" className="rounded-lg" bodyClassName="px-3 py-2">
          <Skeleton className="h-2.5 w-3/4" />
        </SkeletonPanel>

        {/* Miembro · Rol · Área — misma forma que el gate de TeamManager */}
        <TableSkeleton columns={3} rows={5} toolbar />
      </div>
    </div>
  );
}
