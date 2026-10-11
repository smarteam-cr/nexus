import { redirect, notFound } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { accessibleClientWhere } from "@/lib/auth/access";
import { esLiderDeCs } from "@/lib/cs/acceso";
import { esCseDeLaCuenta } from "@/lib/cs/adopcion-del-cse-server";
import { soloLaAdopcion } from "@/lib/cs/adopcion-del-cse";
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
//
// La EXCEPCIÓN (2026-10-07, decisión de Elías): el CSE de la cuenta entra a la pestaña Adopción, que es
// adonde lo llevan los recordatorios de revisar la adopción. Solo esa pestaña, sin el panel y sin montos:
// la cuenta se vacía acá, en el servidor (`soloLaAdopcion`, lib/cs/adopcion-del-cse.ts).
export default async function CustomerSuccessAccountPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/clients");
  const lider = esLiderDeCs(ctx.role);
  const suCse = !lider && (await esCseDeLaCuenta(clientId, ctx.teamMember.email));
  if (!lider && !suCse) redirect("/clients");

  const where = await accessibleClientWhere(ctx.user);
  // Resolver la propuesta de salud del watchdog (Confirmar / Descartar) sigue exigiendo
  // `clientes.viewAll`. Sin la bandera, el chip se pintaría con botones que dan 403.
  const puedeCurar = await can(ctx.teamMember, "clientes", "viewAll");
  // El pase de cuenta (2026-10-09) pide lo mismo que reasignar el CSE en el listado de clientes.
  const puedeReasignar = await can(ctx.teamMember, "proyectos", "reasignarEncargado");
  const data = await loadCsAccount(clientId, where, true);
  if (!data) notFound();

  if (suCse) {
    return (
      <div className={SHELL_FULL}>
        <AccountView data={soloLaAdopcion(data)} puedeCurar={false} soloAdopcion />
      </div>
    );
  }

  // Solo la CSL y dirección llegan acá (el CSE salió arriba con la cuenta vaciada).
  data.puedeReasignar = puedeReasignar;
  return (
    <div className={SHELL_FULL}>
      {/* El agente vigía, en segundo plano, si hace más de 48 h que no revisa este cliente (D14). */}
      <DisparoDelVigia clientId={data.clientId} />
      <AccountView data={data} puedeCurar={puedeCurar} />
    </div>
  );
}
