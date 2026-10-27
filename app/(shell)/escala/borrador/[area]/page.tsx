/**
 * app/(shell)/escala/borrador/[area]/page.tsx — el EDITOR del borrador: el borrador de la escala con
 * sus mismas vistas, donde tocar un criterio, un nivel o una dimensión lo cambia.
 *
 * Solo los super admin; sin borrador abierto, lleva a /escala/borrador para abrirlo. Muestra cuánto
 * feedback llegó de cada cosa (lo ve quien lo revisa, que es quien edita), para cambiar con eso a la vista.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { aplicarEdicion } from "@/lib/escala/documento/edicion";
import { perfilDesdeUrl } from "@/lib/escala/documento/perfil";
import { versionesPublicadas } from "@/lib/escala/documento/vigente";
import { puedeEditarLaEscala } from "@/lib/escala/datos/reglas";
import { escalaDelBorrador } from "@/lib/escala/datos/servidor";
import { leerMapaDeHerramientasVigente } from "@/lib/escala/herramientas/vigente";
import { herramientasDesdeUrl } from "@/lib/escala/herramientas/vista";
import { conteosQueSeVen, datosDeLaVista, vistaDesdeUrl } from "@/lib/escala/vista";
import { contarPorAncla, contarPorArea } from "@/lib/feedback/escala-server";
import EditorDelBorrador from "@/components/escala/borrador/EditorDelBorrador";

export const metadata: Metadata = { title: "Editar el borrador de la escala" };

type Params = Record<string, string | string[] | undefined>;
const uno = (sp: Params, k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);

export default async function EditarElBorrador({ params, searchParams }: { params: Promise<{ area: string }>; searchParams: Promise<Params> }) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/clients");
  if (!puedeEditarLaEscala(ctx.role)) redirect("/escala");

  const [{ area: slug }, sp, borrador] = await Promise.all([params, searchParams, escalaDelBorrador()]);
  if (!borrador) redirect("/escala/borrador");

  const escala = aplicarEdicion(borrador.escala, uno(sp, "industria"));
  const area = escala.areas.find((a) => a.slug === slug);
  if (!area) redirect(`/escala/borrador/${escala.areas[0].slug}`);

  const [conteos, porArea, versiones, mapa] = await Promise.all([contarPorAncla(area.id), contarPorArea(), versionesPublicadas(), leerMapaDeHerramientasVigente()]);

  return (
    <div className={SHELL_DEFAULT}>
      {/* `key` por área, industria y revisión: después de guardar, la pantalla arranca con lo nuevo. */}
      <EditorDelBorrador
        key={`${area.id}:${escala.edicion?.slug ?? "general"}`}
        version={borrador.version}
        revision={borrador.revision}
        datos={datosDeLaVista({ escala, area, publicadaEn: borrador.actualizadaEn, aviso: null, versiones, comoCambia: null, mapa })}
        conteos={conteosQueSeVen(conteos, escala, area)}
        porArea={porArea}
        abiertosEnTotal={0}
        esRevisor
        inicial={{
          vista: vistaDesdeUrl(uno(sp, "vista")),
          perfil: perfilDesdeUrl({ cierre: uno(sp, "cierre"), despues: uno(sp, "despues"), trafico: uno(sp, "trafico") }),
          dimension: uno(sp, "dim"),
          celda: uno(sp, "celda"),
          ancla: uno(sp, "c"),
          herramientas: herramientasDesdeUrl(uno(sp, "h")),
        }}
      />
    </div>
  );
}
