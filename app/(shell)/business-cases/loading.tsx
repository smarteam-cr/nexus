/**
 * Loading skeleton de /business-cases.
 *
 * FORMA REAL (page.tsx): `px-6 py-8` (= SHELL_DEFAULT, escrito a mano en el page.tsx con ese
 * valor) · encabezado a mano (h1 "Ventas — Business Cases" + descripción, con el link al
 * catálogo y el botón "Nuevo business case" a la derecha) · y la lista en `mt-6 space-y-2`:
 * filas delineadas `rounded-xl px-4 py-3` con nombre + cliente y, a la derecha, los chips de
 * tipo y estado.
 *
 * Ajustes: el ancho del título correspondía a un título más corto del que hay, y las filas no
 * reservaban la zona de chips de la derecha (`trailing`) — al llegar los datos aparecían dos
 * píldoras que el skeleton no anunciaba. El `mb-6` de PageHeaderSkeleton equivale al `mt-6`
 * que el page pone sobre la lista.
 */
import { PageHeaderSkeleton, ListSkeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function BusinessCasesLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <PageHeaderSkeleton titleWidth="w-56" descWidth="w-72" action />
      <ListSkeleton rows={5} lines={2} trailing />
    </div>
  );
}
