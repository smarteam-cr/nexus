/**
 * /finanzas/costos/herramientas — la hoja de herramientas, retirada el 2026-10-18 (decisión de Elías sobre docs/finanzas-simplificacion.md): ya no
 * está en el menú desde el 2026-10-03 y su contenido vive en /finanzas/recurrentes. Lleva ahí a quien llegue por un enlace viejo.
 *
 * ⚠ Sigue siendo de costos: el gate `isCostosRole` va ANTES del redirect (P4 de lib/cobranza/costos-privacy.test.ts),
 * aunque no cargue nada. Los salarios se ven en Planilla › Salarios.
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { isCostosRole } from "@/lib/auth/cobranza-roles";

export const dynamic = "force-dynamic";

export default async function Page() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !isCostosRole(ctx.role)) redirect("/clients");
  redirect("/finanzas/recurrentes");
}
