/**
 * app/(shell)/escala/borrador/page.tsx — el borrador de la próxima versión de la escala.
 *
 * Solo los super admin: abren el borrador desde la versión publicada, le suben cambios (un `.md`
 * editado), ven la bitácora y lo publican con las mismas pruebas del script. Al resto lo lleva a la
 * escala publicada. docs/escala/plan-escala-como-datos.md.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { puedeEditarLaEscala } from "@/lib/escala/datos/reglas";
import { estadoDelBorrador } from "@/lib/escala/datos/servidor";
import PantallaDelBorrador from "@/components/escala/borrador/PantallaDelBorrador";

export const metadata: Metadata = { title: "Borrador de la escala" };

export default async function BorradorDeLaEscala() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/clients");
  if (!puedeEditarLaEscala(ctx.role)) redirect("/escala");

  return (
    <div className={SHELL_DEFAULT}>
      <PantallaDelBorrador estado={await estadoDelBorrador()} />
    </div>
  );
}
