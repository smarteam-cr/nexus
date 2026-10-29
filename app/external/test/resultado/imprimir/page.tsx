/**
 * /external/test/resultado/imprimir?t=<token> — EL RESULTADO DEL TEST, PARA EL PDF (28 oct).
 *
 * La abre el motor de PDF (lib/print/pdf-runner.ts, desde /api/external/test/[token]/pdf): la misma vista del resultado
 * en modo `pdf` (sin botones ni calendario) y la señal de «listo» que espera el motor. Pública como el resultado: la llave
 * es el token, que viene en la consulta para que el log del motor no lo escriba (lib/tests-diagnostico/pagina-del-resultado.ts). Un token
 * inválido, inventado o de un test sin terminar da el mismo 404 neutro.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PdfReadySignal from "@/components/print/PdfReadySignal";
import ResultadoDelTestVista from "@/components/external/test/ResultadoDelTestVista";
import { enlaceDeLaAgenda, TOKEN_DEL_RESULTADO } from "@/lib/tests-diagnostico/pagina-del-resultado";
import { resultadoPublico } from "@/lib/tests-diagnostico/servicio-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tu Diagnóstico de Rendimiento · Smarteam",
  robots: { index: false, follow: false },
};

export default async function ImprimirResultadoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { t } = await searchParams;
  if (typeof t !== "string" || !TOKEN_DEL_RESULTADO.test(t)) notFound();
  const res = await resultadoPublico(t);
  if (!res) notFound();
  const agenda = enlaceDeLaAgenda(process.env.TESTS_ENLACE_DE_AGENDA);
  const { intento: i, resultado: r } = res;
  return (
    <>
      <PdfReadySignal />
      <ResultadoDelTestVista
        r={r}
        nombre={i.nombre}
        empresa={i.empresa}
        dominio={i.dominio}
        fecha={i.terminadoAt}
        agenda={agenda}
        modo="pdf"
      />
    </>
  );
}
