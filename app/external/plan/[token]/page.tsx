/**
 * /external/plan/[token] — EL PLAN GENERAL de una cuenta, para el cliente (2026-11-19, kölbi): los loops de todos sus
 * proyectos como un solo cronograma, pintado con el MISMO render del cronograma compartible. Mismo modelo que La escala: la URL es el secreto (256 bits), sin contraseña, y lo que se
 * ve es la foto PUBLICADA, nunca los cronogramas vivos.
 *
 * Toda la seguridad vive en `planParaElToken` (chokepoint fail-closed, re-chequea en CADA render). `force-dynamic` no es
 * decoración: sin él, revocar no surtiría efecto. `noindex`: la URL circula por correo.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ExternalShell from "@/components/external/ExternalShell";
import TimelineLanding from "@/components/external/TimelineLanding";
import { PAGINA_DEL_PLAN } from "@/lib/external/pagina-del-cliente";
import { planParaElToken } from "@/lib/external/plan-view";
import { getSmarteamLogoUrl } from "@/lib/external/smarteam-logo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Genérico a propósito: el título de la pestaña viaja en historiales y capturas.
  title: "Plan de trabajo · Smarteam",
  robots: { index: false, follow: false },
};

export default async function PlanDelClientePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [d, smarteamLogoUrl] = await Promise.all([planParaElToken(token), getSmarteamLogoUrl()]);
  // Un 404 neutro: no distingue un token inválido de uno revocado.
  if (!d) notFound();
  return (
    <ExternalShell smarteamLogoUrl={smarteamLogoUrl}>
      {/* El MISMO render del cronograma compartible de un proyecto: el plan es un cronograma hecho con los loops. */}
      <TimelineLanding
        clientName={d.clientName}
        clientLogoUrl={d.clientLogoUrl}
        clientLogoScale={d.clientLogoScale}
        timeline={d.timeline ?? { exists: false, anchorStartDate: null, phases: [] }}
        titulo={PAGINA_DEL_PLAN.titulo}
        textoVacio={PAGINA_DEL_PLAN.vacio}
      />
    </ExternalShell>
  );
}
