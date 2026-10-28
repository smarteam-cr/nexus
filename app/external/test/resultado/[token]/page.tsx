/**
 * /external/test/resultado/[token] — EL RESULTADO del test del diagnóstico de rendimiento (área O, 2026-10-26).
 *
 * La URL ES el secreto (token de 256 bits, como el cuestionario): es la dirección que va a HubSpot y a la preventa. Lo
 * que viaja después del `#` (el resultado comprimido para la preventa) el servidor nunca lo ve; la página se arma con el
 * resultado GUARDADO. Un token inventado o un test sin terminar dan el mismo 404 neutro.
 * `Referrer-Policy: no-referrer` para todo /external lo pone `next.config.ts`.
 *
 * Desde el 28 oct se ve como el resultado de la aplicación vieja (ResultadoDelTestVista) y se baja en PDF: el botón pide
 * `/api/external/test/[token]/pdf`, que imprime /external/test/resultado/imprimir.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ResultadoDelTestVista from "@/components/external/test/ResultadoDelTestVista";
import { rutaDelPdf, TOKEN_DEL_RESULTADO } from "@/lib/tests-diagnostico/pagina-del-resultado";
import { resultadoPublico } from "@/lib/tests-diagnostico/servicio-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tu Diagnóstico de Rendimiento · Smarteam",
  robots: { index: false, follow: false },
};

export default async function ResultadoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_DEL_RESULTADO.test(token)) notFound();
  const res = await resultadoPublico(token);
  if (!res) notFound();
  const agenda = process.env.TESTS_ENLACE_DE_AGENDA?.trim() ?? "";
  const { intento: i, resultado: r } = res;
  return (
    <ResultadoDelTestVista
      r={r}
      nombre={i.nombre}
      empresa={i.empresa}
      dominio={i.dominio}
      fecha={i.terminadoAt}
      agenda={/^https:\/\//.test(agenda) ? agenda : null}
      pdf={rutaDelPdf(token)}
    />
  );
}
