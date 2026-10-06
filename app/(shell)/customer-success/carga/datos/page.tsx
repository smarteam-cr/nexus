import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { esLiderDeCs } from "@/lib/cs/acceso";
import { cargarCargaDelEquipo } from "@/lib/carga/queries";
import QueDatosHay from "@/components/carga/QueDatosHay";
// Mismo contenedor que loading.tsx — la fuente única evita que page y skeleton deriven.
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export const dynamic = "force-dynamic";

// QUÉ DATOS HAY — lo que el cálculo de la carga ya puede usar y lo que falta, medido en la base cada vez que se abre
// (2026-10-06). De la CSL y dirección, por ROL.
export default async function DatosDeLaCargaPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !esLiderDeCs(ctx.role)) redirect("/clients");

  const datos = await cargarCargaDelEquipo();
  return (
    <QueDatosHay
      filas={datos.cobertura.filas}
      resumen={datos.cobertura.resumen}
      medidoEn={datos.medidoEn}
      supuestosGuardables={!datos.configuracion.sinTabla}
      contenedor={SHELL_DEFAULT}
    />
  );
}
