/**
 * app/(shell)/documentacion/page.tsx — el manual de Nexus para el equipo.
 *
 * La sección NO tiene gate en el sidebar (la ve todo el mundo, como Clientes o Sesiones), pero
 * el guard real va acá igual: el ítem del menú es cosmético y no autoriza nada
 * (ARCHITECTURE §1-UI punto 4).
 *
 * ⚠ El `select` de agentes es DELIBERADAMENTE acotado y NO trae `systemPrompt` ni
 * `additionalInstructions`: los prompts son calibración interna y viven detrás del permiso de
 * `/agents`; esta pantalla no tiene ese permiso. Lo congela `lib/manual/manual.test.ts`.
 */
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireInternalUser } from "@/lib/auth/supabase";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { PageHeader } from "@/components/ui";
import ManualClient from "@/components/manual/ManualClient";
import {
  armarDocumentos,
  armarAgentes,
  armarPipelines,
  armarPropiedades,
  totalPropiedades,
} from "@/lib/manual/armar";

// El contenido cambia con el código, no con el minuto: se revalida seguido pero no en cada visita.
export const revalidate = 300;

export default async function DocumentacionPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/clients");

  const filas = await prisma.agent.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      agentType: true,
      agentGroup: true,
    },
  });

  return (
    <div className={SHELL_DEFAULT}>
      <PageHeader
        title="Documentación"
        description="Cómo funciona Nexus, qué hace cada documento y cómo se conecta con HubSpot."
      />
      {/* `useSearchParams` obliga a un límite de Suspense en una página server. */}
      <Suspense>
        <ManualClient
          documentos={armarDocumentos()}
          agentes={armarAgentes(filas)}
          pipelines={armarPipelines()}
          propiedades={armarPropiedades()}
          totalPropiedades={totalPropiedades()}
        />
      </Suspense>
    </div>
  );
}
