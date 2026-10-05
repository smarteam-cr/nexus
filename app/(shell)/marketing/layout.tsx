/**
 * /marketing — layout del área: solo el contenedor. Cada página pone su propio encabezado (rediseño del
 * 2026-10-04: antes había un PageHeader «Marketing» igual para todas y pestañas del grupo activo; ahora el submenú
 * del sidebar lleva a cada página y cada una dice cómo se llama). LECTURA universal (cualquier rol interno); la
 * EDICIÓN la gatean las páginas (canEdit) y la API (guardMarketingEditor). Por eso acá solo se exige login.
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export const dynamic = "force-dynamic";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/");

  return <div className={SHELL_DEFAULT}>{children}</div>;
}
