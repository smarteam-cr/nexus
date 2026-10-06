import { notFound, redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { esLiderDeCs } from "@/lib/cs/acceso";
import { cargarCargaDelEquipo } from "@/lib/carga/queries";
import UnoAUno from "@/components/carga/UnoAUno";
// Mismo contenedor que loading.tsx — la fuente única evita que page y skeleton deriven.
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export const dynamic = "force-dynamic";

// LA 1:1 — la carga de una persona de CS, sus cuentas y el simulador de traspasos (2026-10-06). De la CSL y
// dirección, por ROL, como el resto de Éxito del cliente.
export default async function UnoAUnoPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !esLiderDeCs(ctx.role)) redirect("/clients");

  const { id } = await params;
  const datos = await cargarCargaDelEquipo();
  const persona = datos.personas.find((p) => p.id === id);
  if (!persona) notFound();
  return <UnoAUno persona={persona} equipo={datos.personas} cuentas={datos.cuentas} config={datos.configuracion.config} contenedor={SHELL_DEFAULT} />;
}
