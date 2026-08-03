/**
 * app/(shell)/documentacion/page.tsx — el manual de Nexus para el equipo.
 *
 * La sección NO tiene gate en el sidebar (la ve todo el mundo, como Clientes o Sesiones), pero
 * el guard real va acá igual: el ítem del menú es cosmético y no autoriza nada
 * (ARCHITECTURE §1-UI punto 4).
 *
 * ── POR QUÉ TODO SE RENDERIZA DE UNA, SIN PESTAÑAS ───────────────────────────
 * Hasta el 2026-08-02 esto eran cuatro pestañas con el estado en `?s=`, y tres cuartas partes
 * del manual NO estaban en el DOM: el Ctrl+F del navegador —el único buscador que una
 * documentación de ~40 unidades necesita— veía la cuarta parte y devolvía "no encontrado" sin
 * avisar. Y como el panel se resolvía en el CLIENTE, un link con ancla llegaba antes de que el
 * destino existiera y el navegador no saltaba a ningún lado.
 *
 * Con todo servido desde el servidor y seguido: Ctrl+F alcanza el manual entero, `#doc-kickoff`
 * es un link que se pega en un chat, y la pantalla dejó de necesitar `useSearchParams` y su
 * `<Suspense>`. Es menos código del que había.
 *
 * ⚠ El `select` de agentes es DELIBERADAMENTE acotado y NO trae `systemPrompt` ni
 * `additionalInstructions`: los prompts son calibración interna y viven detrás del permiso de
 * `/agents`; esta pantalla no tiene ese permiso. Lo congela `lib/manual/manual.test.ts`.
 *
 * Tampoco trae `description`, y por la misma razón de fondo: es texto libre de la base que se
 * edita desde `/agents` sin deploy, sin test y sin regla de audiencia — llegó a publicar jerga
 * de desarrollador acá. La explicación de cada agente vive curada en `lib/manual/contenido.ts`.
 */
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireInternalUser } from "@/lib/auth/supabase";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { PageHeader } from "@/components/ui";
import IndiceDeSecciones from "@/components/manual/IndiceDeSecciones";
import ComoFunciona from "@/components/manual/ComoFunciona";
import Recorrido from "@/components/manual/Recorrido";
import Documentos from "@/components/manual/Documentos";
import Agentes from "@/components/manual/Agentes";
import HubSpot from "@/components/manual/HubSpot";
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

      <div className="lg:flex lg:items-start lg:gap-10">
        <IndiceDeSecciones className="mb-6 lg:mb-0 lg:sticky lg:top-6 lg:w-52 lg:shrink-0" />
        <div className="min-w-0 flex-1 max-w-3xl">
          <ComoFunciona />
          <Recorrido />
          <Documentos docs={armarDocumentos()} />
          <Agentes categorias={armarAgentes(filas)} />
          <HubSpot
            pipelines={armarPipelines()}
            grupos={armarPropiedades()}
            totalProps={totalPropiedades()}
          />
        </div>
      </div>
    </div>
  );
}
