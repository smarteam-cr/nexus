import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { esLiderDeCs } from "@/lib/cs/acceso";
import { cargarCalibracion, cargarCargaDelEquipo, coberturaDeVariables } from "@/lib/carga/queries";
import Supuestos from "@/components/carga/Supuestos";
// Mismo contenedor que loading.tsx — la fuente única evita que page y skeleton deriven.
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export const dynamic = "force-dynamic";

// CÓMO SE CALCULA LA CARGA — los supuestos editables (2026-10-06) y, desde el 2026-10-07, lo que propone la
// calibración con lo que respondió el equipo. De la CSL y dirección, por ROL. Guardar pasa por POST
// /api/cs/carga/config; usar o descartar una propuesta, por POST /api/cs/carga/calibracion, con el mismo rol.
export default async function SupuestosDeLaCargaPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !esLiderDeCs(ctx.role)) redirect("/clients");

  const sp = await searchParams;
  const datos = await cargarCargaDelEquipo();
  const calibracion = await cargarCalibracion(datos.configuracion.config, datos.cuentas);
  const vista = sp.vista === "calibracion" || sp.vista === "historial" ? sp.vista : "supuestos";
  return (
    <Supuestos
      vistaInicial={vista}
      calibracion={calibracion}
      configuracion={datos.configuracion}
      personas={datos.personas}
      coberturaDeVariables={coberturaDeVariables(datos.cuentas)}
      tareasPorTipo={datos.tareasPorTipo}
      contenedor={SHELL_DEFAULT}
    />
  );
}
