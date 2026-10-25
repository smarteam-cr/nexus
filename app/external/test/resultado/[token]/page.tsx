/**
 * /external/test/resultado/[token] — EL RESULTADO del test del diagnóstico de rendimiento (área O, 2026-10-26).
 *
 * La URL ES el secreto (token de 256 bits, como el cuestionario): es la dirección que va a HubSpot y a la preventa. Lo
 * que viaja después del `#` (el resultado comprimido para la preventa) el servidor nunca lo ve; la página se arma con el
 * resultado GUARDADO. Un token inventado o un test sin terminar dan el mismo 404 neutro.
 * `Referrer-Policy: no-referrer` para todo /external lo pone `next.config.ts`.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ExternalShell from "@/components/external/ExternalShell";
import ResultadoDelTestVista from "@/components/external/test/ResultadoDelTestVista";
import { getBrandLogos } from "@/lib/external/smarteam-logo";
import { resultadoPublico } from "@/lib/tests-diagnostico/servicio-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tu Diagnóstico de Rendimiento · Smarteam",
  robots: { index: false, follow: false },
};

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export default async function ResultadoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) notFound();
  const [res, logos] = await Promise.all([resultadoPublico(token), getBrandLogos()]);
  if (!res) notFound();
  const agenda = process.env.TESTS_ENLACE_DE_AGENDA?.trim() ?? "";
  return (
    <ExternalShell smarteamLogoUrl={logos.smarteam}>
      <ResultadoDelTestVista
        r={res.resultado}
        nombre={res.intento.nombre}
        empresa={res.intento.empresa}
        agenda={/^https:\/\//.test(agenda) ? agenda : null}
      />
    </ExternalShell>
  );
}
