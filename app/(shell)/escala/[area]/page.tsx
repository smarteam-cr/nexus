/**
 * app/(shell)/escala/[area]/page.tsx — un área de la Escala de Rendimiento: matriz, por dimensión o
 * mapa, con el filtro de perfil y los comentarios del equipo.
 *
 * La escala se lee de la versión PUBLICADA en Nexus (nunca del repo: la imagen no lleva .md) y se
 * baja al navegador solo el área que se mira. Es interna: la ve todo el equipo, nadie de afuera.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { leerEscalaVigente, versionesPublicadas } from "@/lib/escala/documento/vigente";
import { perfilDesdeUrl } from "@/lib/escala/documento/perfil";
import { comentariosDisponibles, contarPorAncla, contarPorArea } from "@/lib/escala/comentarios/consultas";
import { esResponsable } from "@/lib/escala/comentarios/reglas";
import { datosDeLaVista, vistaDesdeUrl } from "@/lib/escala/vista";
import VistaDeLaEscala from "@/components/escala/VistaDeLaEscala";
import EscalaSinPublicar from "@/components/escala/EscalaSinPublicar";

export const metadata: Metadata = { title: "Escala de Rendimiento" };

type Params = Record<string, string | string[] | undefined>;
const uno = (sp: Params, k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);

export default async function PaginaDeLaEscala({
  params,
  searchParams,
}: {
  params: Promise<{ area: string }>;
  searchParams: Promise<Params>;
}) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/clients");

  const [{ area: slug }, sp, vigente] = await Promise.all([params, searchParams, leerEscalaVigente()]);
  const responsable = esResponsable(ctx.user.email);
  if (vigente.estado !== "ok") {
    return (
      <div className={SHELL_DEFAULT}>
        <EscalaSinPublicar estado={vigente.estado} responsable={responsable} />
      </div>
    );
  }

  const area = vigente.escala.areas.find((a) => a.slug === slug);
  if (!area) redirect(`/escala/${vigente.escala.areas[0].slug}`);

  const [conteos, porArea, versiones] = await Promise.all([contarPorAncla(area.id), contarPorArea(), versionesPublicadas()]);
  const abiertosEnTotal = Object.values(porArea).reduce((s, c) => s + c.abiertos, 0);

  return (
    <div className={SHELL_DEFAULT}>
      {/* `key` por área: al cambiar de área la pantalla arranca de nuevo (la dimensión o la celda
          elegidas son de ESA área); la vista y el perfil viajan en la URL. */}
      <VistaDeLaEscala
        key={area.id}
        datos={datosDeLaVista({ escala: vigente.escala, area, publicadaEn: vigente.publicadaEn, aviso: vigente.aviso, versiones })}
        conteos={conteos}
        porArea={porArea}
        abiertosEnTotal={abiertosEnTotal}
        yo={{ email: ctx.user.email, nombre: ctx.teamMember.name, foto: ctx.teamMember.photoUrl }}
        esResponsable={responsable}
        comentariosDisponibles={comentariosDisponibles()}
        inicial={{
          vista: vistaDesdeUrl(uno(sp, "vista")),
          perfil: perfilDesdeUrl({ cierre: uno(sp, "cierre"), despues: uno(sp, "despues") }),
          dimension: uno(sp, "dim"),
          celda: uno(sp, "celda"),
          ancla: uno(sp, "c"),
        }}
      />
    </div>
  );
}
