import { redirect, notFound } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { accessibleClientWhere } from "@/lib/auth/access";
import { esLiderDeCs } from "@/lib/cs/acceso";
import { loadCsAccount } from "@/lib/cs/load-account";
import AccountView from "@/components/cs/account/AccountView";
import DisparoDelVigia from "@/components/cs/DisparoDelVigia";
// Mismo contenedor que loading.tsx — la fuente única evita que page y skeleton deriven.
import { SHELL_FULL } from "@/lib/ui/page-shell";

export const dynamic = "force-dynamic";

// LA FICHA DE UNA CUENTA en Éxito del cliente (rediseño 2026-10-04; en pestañas desde el
// 2026-10-05): Estado de la cuenta · Adopción · Renovación · Proyectos · Resultados ·
// Conversaciones, con el panel de contexto a la derecha. La pestaña viaja en `?pestana=`.
//
// De la CSL y dirección, por ROL (`esLiderDeCs`, lib/cs/acceso.ts), igual que el índice. Si el
// cliente no pasa el where del usuario → 404.
export default async function CustomerSuccessAccountPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !esLiderDeCs(ctx.role)) redirect("/clients");

  const where = await accessibleClientWhere(ctx.user);
  // Resolver la propuesta de salud del watchdog (Confirmar / Descartar) sigue exigiendo
  // `clientes.viewAll`. Sin la bandera, el chip se pintaría con botones que dan 403.
  const puedeCurar = await can(ctx.teamMember, "clientes", "viewAll");
  const data = await loadCsAccount(clientId, where, true);
  if (!data) notFound();

  return (
    <div className={SHELL_FULL}>
      {/* El agente vigía, en segundo plano, si hace más de 48 h que no revisa este cliente (D14). */}
      <DisparoDelVigia clientId={data.clientId} />
      <AccountView data={data} puedeCurar={puedeCurar} />
    </div>
  );
}
