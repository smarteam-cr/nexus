import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { esLiderDeCs, veSeguimientoDeCuentas } from "@/lib/cs/acceso";
import { crDateParts } from "@/lib/jobs/time";
import { cargarSeguimientoDeCuentas } from "@/lib/mi-dia/seguimiento-server";
import { leerMotivosDelEquipo, leerPrioridades } from "@/lib/cs/prioridad-de-cuenta-server";
import { prioridadesVisibles } from "@/lib/cs/prioridad-de-cuenta";
import SeguimientoDeCuentas from "@/components/cs/SeguimientoDeCuentas";
import { PrioridadesDeLaCartera } from "@/components/cs/CheckDePrioridad";
// Mismo contenedor que loading.tsx — la fuente única evita que page y skeleton deriven.
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

// Depende del usuario logueado (rol, sus cuentas) y de su calendario: no cacheable.
export const dynamic = "force-dynamic";

// SEGUIMIENTO DE CUENTAS (2026-10-19, lib/mi-dia/seguimiento.ts): por cuenta, la próxima sesión, el siguiente paso, los
// temas que se están tratando y la última reunión. La única página de Éxito del cliente que también es del CSE
// (`veSeguimientoDeCuentas`, lib/cs/acceso.ts): el CSE ve sus cuentas, sin montos ni datos de HubSpot Partner; la CSL y
// dirección, toda la cartera.
export default async function SeguimientoDeCuentasPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !veSeguimientoDeCuentas(ctx.role)) redirect("/clients");

  const ahora = new Date();
  const hoyISO = crDateParts(ahora).dateKey;
  const data = await cargarSeguimientoDeCuentas(ctx.teamMember, { ahora, hoyISO });
  const lider = esLiderDeCs(ctx.role);
  const [prioridades, puedeMarcar, motivos] = await Promise.all([
    leerPrioridades(data.filas.map((f) => f.clientId)),
    // La ruta de la marca pide el rol del área además de la celda: el CSE ve el check de sus cuentas y no lo cambia.
    lider ? can(ctx.teamMember, "customerSuccess", "marcarPrioridad") : false,
    lider ? leerMotivosDelEquipo() : [],
  ]);
  return (
    <PrioridadesDeLaCartera iniciales={prioridadesVisibles(prioridades.porCliente)} motivos={motivos} puedeMarcar={puedeMarcar} ordenaLaLista={false}>
      <SeguimientoDeCuentas data={data} hoyISO={hoyISO} conCartera={lider} contenedor={SHELL_DEFAULT} />
    </PrioridadesDeLaCartera>
  );
}
