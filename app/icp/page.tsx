import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui";
import { requireInternalUser } from "@/lib/auth/supabase";
import { redirect } from "next/navigation";
import { getIcpItemsGrouped, ICP_SEED } from "@/lib/marketing";
import ICPView, { type IcpViewGroup } from "@/components/marketing/ICPView";

// Depende del usuario logueado (sesión Supabase) → no cacheable.
export const dynamic = "force-dynamic";

export default async function ICPPage() {
  try {
    await requireInternalUser();
  } catch {
    redirect("/");
  }

  // El contenido vive en la tabla IcpItem (editable en /marketing/icp). Red de
  // seguridad: si la tabla está vacía (seed no corrido), renderiza el seed en
  // memoria — esta página nunca queda en blanco.
  const grouped = await getIcpItemsGrouped();
  const isEmpty = grouped.every((g) => g.items.length === 0);
  const groups: IcpViewGroup[] = isEmpty
    ? ICP_SEED.map(({ section, items }) => ({
        section,
        items: items.map((label, i) => ({ id: `${section}-${i}`, label })),
      }))
    : grouped;

  return (
    <AppShell>
      <div className="px-6 py-8">
        <PageHeader
          title="ICP"
          description="Perfil de Cliente Ideal, señales de intención y tiers objetivo"
        />
        <ICPView groups={groups} />
      </div>
    </AppShell>
  );
}
