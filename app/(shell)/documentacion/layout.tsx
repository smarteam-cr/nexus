/**
 * app/(shell)/documentacion/layout.tsx — el armazón de la base de conocimiento.
 *
 * Dos columnas: el árbol de páginas a la izquierda (persiste al navegar entre páginas, como en
 * Notion) y la página a la derecha. En pantallas chicas el árbol se esconde y se abre desde el
 * encabezado de la página.
 *
 * ⚠ Este layout es PRESENTACIÓN: el guard de cada página va en su propio `page.tsx` (regla del
 * shell). El de acá existe igual porque el árbol ya consulta la base.
 *
 * El árbol va dentro de `<Suspense>`: su consulta no debe demorar el contenido de la página.
 */
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { arbolDePaginas } from "@/lib/documentacion/consultas";
import { ListSkeleton } from "@/components/ui";
import ArbolDePaginas from "@/components/documentacion/ArbolDePaginas";

async function PanelDelArbol({
  puedeEscribir,
  puedeAdministrar,
}: {
  puedeEscribir: boolean;
  puedeAdministrar: boolean;
}) {
  const arbol = await arbolDePaginas();
  return (
    <ArbolDePaginas
      arbol={arbol}
      puedeEscribir={puedeEscribir}
      puedeAdministrar={puedeAdministrar}
    />
  );
}

export default async function LayoutDeDocumentacion({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/clients");

  const [puedeEscribir, puedeAdministrar] = await Promise.all([
    can(ctx.teamMember, "documentacion", "write"),
    can(ctx.teamMember, "documentacion", "manage"),
  ]);

  return (
    <div className="flex items-start">
      <aside className="sticky top-0 hidden h-[calc(100vh-1px)] w-64 shrink-0 overflow-y-auto border-r border-line bg-surface-muted px-2 py-4 lg:block">
        <Suspense fallback={<ListSkeleton rows={6} lines={1} compact />}>
          <PanelDelArbol puedeEscribir={puedeEscribir} puedeAdministrar={puedeAdministrar} />
        </Suspense>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
