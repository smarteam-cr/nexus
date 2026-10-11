import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { veRentabilidad, veSuCarga } from "@/lib/rentabilidad/acceso";
import { cargarTuCarga } from "@/lib/carga/queries";
import { misPreguntasPendientes } from "@/lib/tiempos/preguntas";
import { tiemposDisponible } from "@/lib/tiempos/servidor";
import TuCarga from "@/components/carga/TuCarga";
// Mismo contenedor que loading.tsx — la fuente única evita que page y skeleton deriven.
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

// Depende del usuario logueado y de la hora: no cacheable.
export const dynamic = "force-dynamic";

// TU CARGA — las horas de quien lleva cuentas, SOLO las suyas (2026-10-07). La abren el CSE y la CSL desde el menú;
// dirección la ve como la cuarta pestaña de Rentabilidad. ⛔ La persona sale de la SESIÓN, nunca de la dirección:
// no hay forma de pedir la carga de otra persona por acá (lo vigila lib/rentabilidad/acceso.test.ts).
export default async function TuCargaPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !veSuCarga(ctx.role)) redirect("/para-ti");

  const email = ctx.user.email;
  const [datos, preguntas] = await Promise.all([cargarTuCarga(email), tiemposDisponible() ? misPreguntasPendientes(email) : Promise.resolve([])]);
  return <TuCarga datos={datos} preguntas={preguntas} contenedor={SHELL_DEFAULT} conRentabilidad={veRentabilidad(ctx.role)} />;
}
