/**
 * Loading skeleton de /roles.
 *
 * FORMA REAL (page.tsx → RolesIndexClient): `px-6 py-8` (= SHELL_DEFAULT, escrito a mano en
 * el page.tsx con ese valor) · PageHeader SIN acción · y dentro del `space-y-6` del cliente:
 * una fila propia con el botón "+ Nuevo rol" alineado a la DERECHA, y debajo la lista de
 * puestos (filas delineadas con título + resumen y los enlaces de acción a la derecha).
 *
 * Desajuste corregido: el loading pasaba `action` al PageHeaderSkeleton, o sea prometía el
 * botón PEGADO al título; en la pantalla real el botón vive en su propia fila debajo del
 * header. Al resolver, el botón saltaba de línea y la lista subía ~52px. Ahora el botón se
 * reserva donde realmente está. Se agregó además `trailing` en las filas (los enlaces
 * "Abrir y editar / Desactivar / Borrar") y se igualó `rows={3}` con el ListSkeleton que el
 * propio RolesIndexClient pinta mientras hace fetch de /api/roles.
 */
import { PageHeaderSkeleton, Skeleton, ListSkeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function RolesLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <PageHeaderSkeleton titleWidth="w-20" descWidth="w-[34rem] max-w-full" />

      <div className="space-y-6">
        {/* "+ Nuevo rol" — fila propia, alineado a la derecha */}
        <div className="flex justify-end">
          <Skeleton className="h-9 w-28" rounded="lg" />
        </div>

        <ListSkeleton rows={3} lines={2} trailing />
      </div>
    </div>
  );
}
