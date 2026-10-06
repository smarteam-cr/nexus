import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { esLiderDeCs } from "@/lib/cs/acceso";
import { cargarCargaDelEquipo, coberturaDeVariables } from "@/lib/carga/queries";
import Supuestos from "@/components/carga/Supuestos";
// Mismo contenedor que loading.tsx — la fuente única evita que page y skeleton deriven.
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export const dynamic = "force-dynamic";

// CÓMO SE CALCULA LA CARGA — los supuestos editables (2026-10-06). De la CSL y dirección, por ROL. Guardar pasa por
// POST /api/cs/carga/config, con el mismo rol.
export default async function SupuestosDeLaCargaPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !esLiderDeCs(ctx.role)) redirect("/clients");

  const datos = await cargarCargaDelEquipo();
  return (
    <Supuestos
      configuracion={datos.configuracion}
      personas={datos.personas}
      coberturaDeVariables={coberturaDeVariables(datos.cuentas)}
      tareasPorTipo={datos.tareasPorTipo}
      contenedor={SHELL_DEFAULT}
    />
  );
}
