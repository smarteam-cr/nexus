/**
 * /external/test/resultado/anterior — un RESULTADO DE LA APLICACIÓN VIEJA, reabierto en Nexus (O6 etapa 1, 2026-10-26).
 *
 * Cuando se apague la página vieja, nginx manda `dev.smarteamcr.com/diagnostico-rendimiento/resultado.html#…` acá (el
 * navegador conserva el `#`). Sin `?a&n`, el navegador lee el `#` y vuelve con solo el área, las letras y la fecha
 * (components/external/test/LeerResultadoAnterior.tsx); con ellas, el resultado se arma con la escala de HOY y el
 * mismo cálculo del test nuevo (lib/tests-diagnostico/resultado-anterior.ts). No lee la base: no hay nada de nadie que
 * mostrar, solo lo que trae la dirección. La página dice que es un test de otra fecha, leído con la escala de hoy.
 */
import type { Metadata } from "next";
import ExternalShell from "@/components/external/ExternalShell";
import LeerResultadoAnterior from "@/components/external/test/LeerResultadoAnterior";
import ResultadoDelTestVista from "@/components/external/test/ResultadoDelTestVista";
import { leerEscalaVigente } from "@/lib/escala/documento/vigente";
import { getBrandLogos } from "@/lib/external/smarteam-logo";
import { leerNivelesDelResultadoAnterior, resultadoDelTestAnterior } from "@/lib/tests-diagnostico/resultado-anterior";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tu Diagnóstico de Rendimiento · Smarteam",
  robots: { index: false, follow: false },
};

const fechaLarga = (f: string) =>
  new Intl.DateTimeFormat("es-CR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${f}T12:00:00Z`));

export default async function ResultadoAnteriorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [q, logos] = await Promise.all([searchParams, getBrandLogos()]);
  const leidos = leerNivelesDelResultadoAnterior({ a: q.a, n: q.n, f: q.f });
  if (!leidos) {
    return (
      <ExternalShell smarteamLogoUrl={logos.smarteam}>
        {/* Con `a` o `n` en la dirección pero mal formados, no hay `#` que leer: se dice de una vez. */}
        <LeerResultadoAnterior ilegible={q.a !== undefined || q.n !== undefined} />
      </ExternalShell>
    );
  }
  const vigente = await leerEscalaVigente();
  const r = "escala" in vigente ? resultadoDelTestAnterior(vigente.escala, leidos) : null;
  const agenda = process.env.TESTS_ENLACE_DE_AGENDA?.trim() ?? "";
  return (
    <ExternalShell smarteamLogoUrl={logos.smarteam}>
      {r ? (
        <>
          <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 20px 0", fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}>
            <p style={{ margin: 0, padding: "12px 16px", borderRadius: 12, background: "#f6f8fc", border: "1px solid #dfe5f1", color: "#5b6a8a", fontSize: 14, lineHeight: 1.6 }}>
              {leidos.fecha ? `Hiciste este test el ${fechaLarga(leidos.fecha)}. ` : "Este es un test que hiciste antes. "}
              Lo leemos con la versión de hoy de la escala, así que el nivel puede no ser idéntico al que viste ese día.
            </p>
          </div>
          <ResultadoDelTestVista r={r} nombre={null} empresa={null} agenda={/^https:\/\//.test(agenda) ? agenda : null} sinCorreo />
        </>
      ) : (
        // El enlace estaba bien: lo que no se pudo es armar el resultado (sin escala publicada, o una que ya no tiene el área).
        <LeerResultadoAnterior ilegible motivo="nexus" />
      )}
    </ExternalShell>
  );
}
