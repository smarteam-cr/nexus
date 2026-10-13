/**
 * /sales/use-cases — el catálogo de casos de uso (rediseño del 2026-10-12, diseño «Catálogo de casos de uso»).
 *
 * Cada caso dice el resultado que obtiene el cliente y qué mueve en la Escala de Rendimiento. El catálogo vive en el
 * repo (lib/casos-de-uso/catalogo.ts), no en la base: esta pantalla lo muestra y lo que se quiera cambiar se sugiere
 * por Feedback. Lo ve quien vende y quien trabaja las preventas (`ventas.read` o `preventa.read`).
 */
import { redirect } from "next/navigation";
import CatalogoDeCasos from "@/components/casos-de-uso/CatalogoDeCasos";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { escalaDelCatalogo } from "@/lib/casos-de-uso/escala-server";
import { TIPOS_DE_CASO } from "@/lib/casos-de-uso/vista";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export const dynamic = "force-dynamic";

export default async function CasosDeUsoPage({ searchParams }: { searchParams: Promise<{ vista?: string; tipo?: string; dimension?: string }> }) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/clients");
  const [ventas, preventa] = await Promise.all([can(ctx.teamMember, "ventas", "read"), can(ctx.teamMember, "preventa", "read")]);
  if (!ventas && !preventa) redirect("/clients");

  const [{ vista, tipo, dimension }, leida] = await Promise.all([searchParams, escalaDelCatalogo()]);
  return (
    <div className={SHELL_DEFAULT}>
      <CatalogoDeCasos escala={leida?.escala ?? null} vistaInicial={vista === "escala" ? "escala" : "tipo"} tipoInicial={TIPOS_DE_CASO.find((t) => t.clave === tipo)?.clave ?? "todos"} dimensionInicial={dimension ?? null} />
    </div>
  );
}
