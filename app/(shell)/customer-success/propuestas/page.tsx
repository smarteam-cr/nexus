import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { esLiderDeCs } from "@/lib/cs/acceso";
import { hoyEnCostaRica } from "@/lib/cs/cartera";
import { cargarPropuestasDelVigia } from "@/lib/cs/propuestas-del-vigia-server";
import { PropuestasDelVigia } from "@/components/cs/PropuestasDelVigia";
// Mismo contenedor que loading.tsx — la fuente única evita que page y skeleton deriven.
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

// Depende del usuario logueado (rol) y de lo que el vigía propuso hasta ahora: no cacheable.
export const dynamic = "force-dynamic";

// PROPUESTAS DEL VIGÍA — el único lugar donde se decide una propuesta de salud (2026-10-19, lib/cs/propuestas-del-vigia.ts).
// De la CSL y dirección, por ROL, como el resto de Éxito del cliente. Decidir pide la celda de la ruta
// (`clientes.viewAll`): sin ella, la lista se ve sin los botones.
export default async function PropuestasDelVigiaPage({ searchParams }: { searchParams: Promise<{ proyecto?: string }> }) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !esLiderDeCs(ctx.role)) redirect("/clients");

  const [{ proyecto }, propuestas, puedeCurar] = await Promise.all([
    searchParams,
    cargarPropuestasDelVigia(),
    can(ctx.teamMember, "clientes", "viewAll"),
  ]);
  return (
    <PropuestasDelVigia
      propuestas={propuestas}
      pedida={typeof proyecto === "string" ? proyecto : null}
      puedeCurar={puedeCurar}
      hoy={hoyEnCostaRica()}
      contenedor={SHELL_DEFAULT}
    />
  );
}
