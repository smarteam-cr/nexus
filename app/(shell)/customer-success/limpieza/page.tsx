import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { esLiderDeCs } from "@/lib/cs/acceso";
import { cargarListaDeLimpieza } from "@/lib/limpieza/lista-server";
import { porResponsable } from "@/lib/limpieza/reglas";
import { ListaDeLimpieza } from "@/components/limpieza/ListaDeLimpieza";
// Mismo contenedor que loading.tsx — la fuente única evita que page y skeleton deriven.
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

// Depende del usuario logueado (rol) y de la hora: no cacheable.
export const dynamic = "force-dynamic";

// LIMPIEZA DE HUBSPOT — lo que hay que poner al día en HubSpot, por responsable (2026-10-16, fase 0.5 de
// docs/nexus-sistema-de-trabajo-plan.md). De la CSL y dirección, por ROL, como el resto de Éxito del cliente: cada
// persona ve lo suyo en «Para ti».
export default async function LimpiezaDeHubspotPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !esLiderDeCs(ctx.role)) redirect("/clients");

  const grupos = porResponsable(await cargarListaDeLimpieza());
  return <ListaDeLimpieza grupos={grupos} contenedor={SHELL_DEFAULT} />;
}
