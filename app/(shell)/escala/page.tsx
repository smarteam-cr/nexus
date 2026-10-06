/**
 * app/(shell)/escala/page.tsx — la entrada de la sección: lleva a la primera área publicada.
 * Sin versión publicada (o sin el SQL), dice qué falta.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { leerEscalaVigente } from "@/lib/escala/documento/vigente";
import { esResponsable } from "@/lib/escala/responsable";
import EscalaSinPublicar from "@/components/escala/EscalaSinPublicar";

export const metadata: Metadata = { title: "Escala de Rendimiento" };

export default async function Escala() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/clients");

  const vigente = await leerEscalaVigente();
  if (vigente.estado === "ok") redirect(`/escala/${vigente.escala.areas[0].slug}`);

  return (
    <div className={SHELL_DEFAULT}>
      <EscalaSinPublicar estado={vigente.estado} responsable={esResponsable(ctx.user.email)} />
    </div>
  );
}
