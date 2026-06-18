import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui";
import { requireInternalUser } from "@/lib/auth/supabase";
import { redirect } from "next/navigation";
import ICPSection from "./ICPSection";

// Depende del usuario logueado (sesión Supabase) → no cacheable.
export const dynamic = "force-dynamic";

export default async function ICPPage() {
  try {
    await requireInternalUser();
  } catch {
    redirect("/");
  }

  return (
    <AppShell>
      <div className="px-6 py-8">
        <PageHeader
          title="ICP"
          description="Perfil de Cliente Ideal, señales de intención y tiers objetivo"
        />
        <ICPSection />
      </div>
    </AppShell>
  );
}
