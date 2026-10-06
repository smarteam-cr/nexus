import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { esLiderDeCs } from "@/lib/cs/acceso";
import { cargarCargaDelEquipo } from "@/lib/carga/queries";
import { senalesParaLaUnoAUno } from "@/lib/carga/senales";
import CargaDelEquipo from "@/components/carga/CargaDelEquipo";
// Mismo contenedor que loading.tsx — la fuente única evita que page y skeleton deriven.
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

// Depende del usuario logueado (rol) y de la hora: no cacheable.
export const dynamic = "force-dynamic";

// CARGA DEL EQUIPO — la utilización de cada persona de CS, para la 1:1 de la CSL (2026-10-06). De la CSL y dirección,
// por ROL, como el resto de Éxito del cliente. Sin montos: el dinero vive en Finanzas › Rentabilidad.
export default async function CargaDelEquipoPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !esLiderDeCs(ctx.role)) redirect("/clients");

  const datos = await cargarCargaDelEquipo();
  const senales = senalesParaLaUnoAUno(datos.personas, datos.sinCse, datos.configuracion.config, datos.futuras[0]?.lunes ?? datos.hoy);
  return <CargaDelEquipo datos={datos} senales={senales} contenedor={SHELL_DEFAULT} />;
}
