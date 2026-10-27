/**
 * /sales/analisis — «Análisis de la venta» (S7, 2026-10-27; docs/analizador-reuniones-venta-plan.md › «El rediseño de
 * Elías (2026-10-26)»). Vive en Ventas, colgada de la Preventa: el análisis de cada prospecto está en su preventa (la pieza
 * «Análisis» y «Cómo trabajaste esta sesión»), y acá queda lo que es de todo el equipo.
 *
 *   · «Por vendedor»: la tendencia de cada vendedor en los últimos 90 días, mes a mes (lib/analizador-venta/tendencia.ts).
 *   · «El criterio»: el proceso consultivo escrito que mira el analizador y el posicionamiento, para que Elías y Andrés
 *     lo revisen.
 * Antes era Sesiones › «Reuniones de venta» (/sessions/venta), que se retiró (S6): la lista por empresa la reemplaza la
 * pieza «Análisis» de cada preventa.
 *
 * Quién la ve: solo los super admin (`veLaTendenciaDelEquipo`: compara a los vendedores); el resto vuelve a la Preventa.
 * El análisis de cada preventa lo ve quien entra a ella (2026-10-28).
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { PageHeader } from "@/components/ui";
import { ChipDeCabecera } from "@/components/cs/piezas";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { cn } from "@/lib/cn";
import { veLaTendenciaDelEquipo } from "@/lib/analizador-venta/reglas";
import { tendenciaDelEquipo } from "@/lib/analizador-venta/tendencia-server";
import { empresaQueUsaNexus, perfilDe } from "@/lib/smarteam/contexto";
import { ElCriterio } from "@/components/analizador-venta/ElCriterio";
import { PestanasDelAnalisis } from "@/components/analizador-venta/PestanasDelAnalisis";
import { TendenciaPorVendedor } from "@/components/analizador-venta/TendenciaPorVendedor";

export const dynamic = "force-dynamic";

/** El periodo de la tendencia: tres meses. */
const DIAS = 90;

const primero = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AnalisisDeLaVentaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/clients");
  if (!veLaTendenciaDelEquipo(ctx.role)) redirect("/sales/exploraciones");
  const sp = await searchParams;
  const vista = primero(sp.vista) === "criterio" ? "criterio" : "vendedores";

  return (
    <div className={cn(SHELL_DEFAULT, "space-y-6")}>
      <PageHeader
        title="Análisis de la venta"
        crumbs={[{ label: "Ventas", href: "/business-cases" }, { label: "Preventa", href: "/sales/exploraciones" }, { label: "Análisis de la venta" }]}
        badges={<ChipDeCabecera>Solo super admin</ChipDeCabecera>}
        description="Cómo explora y conversa cada vendedor, mes a mes, y el criterio consultivo con que se analiza cada sesión. Coaching, no evaluación."
      />
      <PestanasDelAnalisis vista={vista} />
      {vista === "vendedores" ? <PorVendedor /> : <Criterio />}
    </div>
  );
}

async function PorVendedor() {
  return <TendenciaPorVendedor t={await tendenciaDelEquipo({ dias: DIAS })} />;
}

async function Criterio() {
  const nuestra = await empresaQueUsaNexus();
  const perfil = nuestra ? await perfilDe(nuestra.id) : null;
  return <ElCriterio positionStatement={perfil?.positionStatement ?? null} />;
}
