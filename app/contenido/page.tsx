/**
 * /contenido — el motor de generación de ideas: CTAs (cadena completa / solo
 * ingesta / regenerar con lo guardado), estado de la última corrida, stats de
 * posts e historial. Lectura universal; los CTAs solo para editores.
 */
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui";
import { requireInternalUser } from "@/lib/auth/supabase";
import { isMarketingEditor } from "@/lib/auth/marketing-roles";
import EngineClient from "./EngineClient";

export const dynamic = "force-dynamic";

export default async function ContenidoPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/");

  return (
    <AppShell>
      <div className="px-6 py-8">
        <PageHeader
          title="Contenido"
          description="Motor de ideas: scrapea la inspiración de LinkedIn y genera ideas de contenido y campañas con IA"
        />
        <div className="mt-6">
          <EngineClient canEdit={isMarketingEditor(ctx.role)} />
        </div>
      </div>
    </AppShell>
  );
}
