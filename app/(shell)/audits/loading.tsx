/**
 * Loading skeleton de /audits.
 *
 * FORMA REAL (page.tsx → AuditsTable): `px-6 py-8` (= SHELL_DEFAULT; el page.tsx lo tiene
 * escrito a mano con ese valor) · PageHeader SIN acción (el botón "Nueva auditoría" solo
 * existe dentro del EmptyState, cuando no hay ninguna) · tabla de 5 columnas
 * (Auditoría · Contactos · Empresas · Negocios · Creada) con buscador → toolbar.
 *
 * Desajuste corregido: el header estaba armado a mano con dos <Skeleton> sueltos → pasa a
 * PageHeaderSkeleton, sin `action` (reservar un botón que la pantalla real no tiene dejaba
 * un fantasma a la derecha del título).
 */
import { PageHeaderSkeleton, TableSkeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function AuditsLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <PageHeaderSkeleton titleWidth="w-52" descWidth="w-[34rem] max-w-full" />
      <TableSkeleton columns={5} rows={8} toolbar />
    </div>
  );
}
