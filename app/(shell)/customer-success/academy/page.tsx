import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { esLiderDeCs } from "@/lib/cs/acceso";
import { catalogoDeAcademy } from "@/lib/kickoff/academy-server";
import { CatalogoDeAcademy } from "@/components/academy/CatalogoDeAcademy";
// Mismo contenedor que loading.tsx — la fuente única evita que page y skeleton deriven.
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

// Depende del usuario logueado (rol) y del catálogo: no cacheable.
export const dynamic = "force-dynamic";

// HUBSPOT ACADEMY — el catálogo de listas de reproducción con que cada kickoff arma «Tu ruta en HubSpot Academy» (Q1 del
// roadmap, 2026-10-27, docs/kickoff-mejoras-plan.md). Lo ve todo el equipo interno (el CSE lo consulta al armar el kickoff);
// lo mantienen la líder de Customer Success y dirección, como el resto de Éxito del cliente.
export default async function AcademyPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/clients");
  const listas = await catalogoDeAcademy();
  return <CatalogoDeAcademy listasIniciales={listas} puedeEditar={esLiderDeCs(ctx.role)} contenedor={SHELL_DEFAULT} />;
}
