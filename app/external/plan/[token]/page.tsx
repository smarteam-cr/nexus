/**
 * /external/plan/[token] — EL PLAN GENERAL de una cuenta, para el cliente (2026-11-19, kölbi): los loops de todos sus
 * proyectos como un solo gantt. Mismo modelo que La escala: la URL es el secreto (256 bits), sin contraseña, y lo que se
 * ve es la foto PUBLICADA, nunca los cronogramas vivos.
 *
 * Toda la seguridad vive en `planParaElToken` (chokepoint fail-closed, re-chequea en CADA render). `force-dynamic` no es
 * decoración: sin él, revocar no surtiría efecto. `noindex`: la URL circula por correo.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ExternalShell from "@/components/external/ExternalShell";
import PlanGeneralLanding from "@/components/external/PlanGeneralLanding";
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
      <PlanGeneralLanding clientName={d.clientName} clientLogoUrl={d.clientLogoUrl} clientLogoScale={d.clientLogoScale} foto={d.foto} />
    </ExternalShell>
  );
}
