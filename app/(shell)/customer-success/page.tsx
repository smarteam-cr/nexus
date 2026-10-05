import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { accessibleClientWhere } from "@/lib/auth/access";
import { esLiderDeCs } from "@/lib/cs/acceso";
import { cargarCarteraDeLaCsl } from "@/lib/cs/cartera";
import CsPanel from "@/components/cs/CsPanel";
// Mismo contenedor que loading.tsx — la fuente única evita que page y skeleton deriven.
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

// Depende del usuario logueado (rol) → no cacheable.
export const dynamic = "force-dynamic";

// ÉXITO DEL CLIENTE — la pantalla de la líder de Customer Success (rediseño 2026-10-04): la cartera
// en una línea, la entrega de proyectos y una pestaña por pregunta del lunes (a quién llamar, qué
// renueva, uso y licencias, crecimiento, equipo y nivel de partner).
//
// De la CSL y dirección, por ROL (`esLiderDeCs`, lib/cs/acceso.ts): muestra la cartera entera en
// dinero —MRR, comisión, puntos de partner—, que es dato de partner (términos con HubSpot) y no se
// delega por plantilla. Hasta el 2026-10-04 colgaba de la celda `customerSuccess.read` y el CSE
// entraba a ver sus cuentas.
export default async function CustomerSuccessPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !esLiderDeCs(ctx.role)) redirect("/clients");

  const where = await accessibleClientWhere(ctx.user);
  // ⚠ CURAR NO ES MIRAR. Refrescar señales y correr el vigía recorren la cartera entera y sus
  // endpoints siguen exigiendo `clientes.viewAll`. Sin esta bandera los botones se pintarían igual
  // y darían 403 si una plantilla le saca ese permiso a la CSL.
  const puedeCurar = await can(ctx.teamMember, "clientes", "viewAll");
  const data = await cargarCarteraDeLaCsl(where);

  return <CsPanel data={data} puedeCurar={puedeCurar} contenedor={SHELL_DEFAULT} />;
}
