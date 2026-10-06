/**
 * app/(shell)/escala/[area]/page.tsx — un área de la Escala de Rendimiento: matriz, por dimensión o
 * mapa, con los filtros de perfil y de herramientas. Desde cada criterio, nivel o dimensión se manda
 * feedback con el panel de siempre (2026-10-05); cuánto llegó de cada cosa lo ve quien lo revisa.
 *
 * La escala se lee de la versión PUBLICADA en Nexus (nunca del repo: la imagen no lleva .md) y se
 * baja al navegador solo el área que se mira. Es interna: la ve todo el equipo, nadie de afuera.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { leerDocumentoPublicado, leerEscalaVigente, versionesPublicadas } from "@/lib/escala/documento/vigente";
import { leerComoCambia } from "@/lib/escala/documento/manual";
import { perfilDesdeUrl } from "@/lib/escala/documento/perfil";
// Desde el 2026-10-05 lo que se dice de la escala son reportes de Feedback: se cuentan de ahí.
import type { ConteosPorClave } from "@/lib/feedback/escala";
import { contarPorAncla, contarPorArea } from "@/lib/feedback/escala-server";
import { esRevisorDeFeedback } from "@/lib/feedback/reglas";
import { esResponsable } from "@/lib/escala/responsable";
import { aplicarEdicion } from "@/lib/escala/documento/edicion";
import { conteosQueSeVen, datosDeLaVista, vistaDesdeUrl } from "@/lib/escala/vista";
import { leerMapaDeHerramientasVigente } from "@/lib/escala/herramientas/vigente";
import { herramientasDesdeUrl } from "@/lib/escala/herramientas/vista";
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

  // La industria elegida (`?industria=ecommerce-retail`): la misma escala, dicha con su edición. Una
  // clave que la escala no tiene se ignora: se ve la general.
  const escala = aplicarEdicion(vigente.escala, uno(sp, "industria"));
  const area = escala.areas.find((a) => a.slug === slug);
  if (!area) redirect(`/escala/${escala.areas[0].slug}`);

  // Cuánto feedback llegó de cada cosa: solo para quien lo revisa (lo que manda cada uno es privado,
  // como todo el feedback; lo suyo lo ve en «Mis reportes»).
  const esRevisor = esRevisorDeFeedback(ctx.role);
  const nada = async (): Promise<ConteosPorClave> => ({});
  const [conteos, porArea, versiones, manual, mapa] = await Promise.all([
    esRevisor ? contarPorAncla(area.id) : nada(),
    esRevisor ? contarPorArea() : nada(),
    versionesPublicadas(),
    leerDocumentoPublicado("manual"),
    leerMapaDeHerramientasVigente(),
  ]);
  const abiertosEnTotal = Object.values(porArea).reduce((s, c) => s + c.abiertos, 0);

  return (
    <div className={SHELL_DEFAULT}>
      {/* `key` por área y por industria: al cambiar cualquiera de las dos la pantalla arranca de
          nuevo desde la URL (la dimensión o la celda elegidas son de ESA área, y una edición trae
          su perfil habitual); la vista y el perfil viajan en la URL. */}
      <VistaDeLaEscala
        key={`${area.id}:${escala.edicion?.slug ?? "general"}`}
        datos={datosDeLaVista({
          escala,
          area,
          publicadaEn: vigente.publicadaEn,
          aviso: vigente.aviso,
          versiones,
          comoCambia: leerComoCambia(manual?.texto),
          mapa,
        })}
        conteos={conteosQueSeVen(conteos, escala, area)}
        porArea={porArea}
        abiertosEnTotal={abiertosEnTotal}
        esRevisor={esRevisor}
        inicial={{
          vista: vistaDesdeUrl(uno(sp, "vista")),
          perfil: perfilDesdeUrl({ cierre: uno(sp, "cierre"), despues: uno(sp, "despues") }),
          dimension: uno(sp, "dim"),
          celda: uno(sp, "celda"),
          ancla: uno(sp, "c"),
          herramientas: herramientasDesdeUrl(uno(sp, "h")),
        }}
      />
    </div>
  );
}
