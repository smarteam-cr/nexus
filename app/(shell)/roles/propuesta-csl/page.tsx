/**
 * /roles/propuesta-csl — la PROPUESTA de contratación del Customer Success Lead.
 * SOLO SUPER_ADMIN, igual que el resto de /roles: lleva una oferta salarial.
 *
 * Segmento estático: gana sobre `/roles/[id]`, así que no colisiona con un rol
 * que llegara a tener ese id.
 *
 * Contenido HARDCODEADO en lib/propuestas/csl.ts — ver el porqué ahí.
 */
import { BackLink } from "@/components/ui";
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import PropuestaView from "@/components/roles/PropuestaView";
import { PROPUESTA_CSL_HERO, PROPUESTA_CSL_CONTENT } from "@/lib/propuestas/csl";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export const dynamic = "force-dynamic";

export default async function PropuestaCslPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || ctx.role !== "SUPER_ADMIN") redirect("/clients");

  return (
    <div className={SHELL_DEFAULT}>
      <BackLink href="/roles">Roles</BackLink>
      <PropuestaView hero={PROPUESTA_CSL_HERO} content={PROPUESTA_CSL_CONTENT} />
    </div>
  );
}
