/**
 * /sessions/venta — «Reuniones de venta» (S1 y S2 del analizador, docs/analizador-reuniones-venta-plan.md).
 *
 * Por empresa (un prospecto, o un cliente en una conversación de venta): todas sus reuniones de venta de los últimos 90
 * días con fecha y quién vendió, las que no dejaron transcripción a la vista con su motivo, y cómo fue cada una si ya se
 * analizó (qué se exploró y qué quedó sin explorar, de reunión en reunión). Y «El criterio»: el proceso consultivo escrito
 * que mira el analizador, el posicionamiento y las reuniones de referencia, para que Elías y Andrés lo revisen.
 *
 * Quién la ve: solo los super admin mientras se prueba (`veElAnalizador`); el resto vuelve a Sesiones. `?empresa=<id>`
 * abre esa empresa. Sin el SQL del analizador se ve igual, sin análisis.
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { PageHeader } from "@/components/ui";
import { ChipDeCabecera } from "@/components/cs/piezas";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { cn } from "@/lib/cn";
import { veElAnalizador } from "@/lib/analizador-venta/reglas";
import { reunionesDeVenta } from "@/lib/analizador-venta/reuniones-de-venta-server";
import { reunionesDeReferencia } from "@/lib/analizador-venta/referencia-server";
import { empresaQueUsaNexus, perfilDe } from "@/lib/smarteam/contexto";
import { ElCriterio, ListaPorEmpresa } from "@/components/sessions/venta/ReunionesDeVenta";
import { PestanasDeVenta } from "@/components/sessions/venta/PestanasDeVenta";

export const dynamic = "force-dynamic";

const primero = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ReunionesDeVentaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/clients");
  if (!veElAnalizador(ctx.role)) redirect("/sessions");
  const sp = await searchParams;
  const vista = primero(sp.vista) === "criterio" ? "criterio" : "empresas";
  const empresa = primero(sp.empresa) ?? null;

  return (
    <div className={cn(SHELL_DEFAULT, "space-y-6")}>
      <PageHeader
        title="Reuniones de venta"
        backHref="/sessions/salud"
        backLabel="Salud de las reuniones"
        badges={<ChipDeCabecera>En prueba: solo super admin</ChipDeCabecera>}
        description="Cada reunión con un prospecto, o con un cliente en una conversación de venta: quién vendió, si dejó transcripción y qué tan consultiva fue. Coaching, no evaluación."
      />
      <PestanasDeVenta vista={vista} />
      {vista === "empresas" ? <PorEmpresa empresa={empresa} /> : <Criterio />}
    </div>
  );
}

async function PorEmpresa({ empresa }: { empresa: string | null }) {
  const empresas = await reunionesDeVenta({ dias: 90 });
  return <ListaPorEmpresa empresas={empresas} abierta={empresa} />;
}

async function Criterio() {
  const [nuestra, referencias] = await Promise.all([empresaQueUsaNexus(), reunionesDeReferencia()]);
  const perfil = nuestra ? await perfilDe(nuestra.id) : null;
  return <ElCriterio positionStatement={perfil?.positionStatement ?? null} referencias={referencias} />;
}
