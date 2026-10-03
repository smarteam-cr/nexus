/**
 * /external/diagnostico — la dirección sin proyecto: no muestra contenido.
 *
 * No nombra ningún proyecto (ver el incidente del 2026-09-10 en app/external/cronograma/page.tsx):
 * lista los que este navegador ya abrió y deja elegir. La dirección de cada proyecto es
 * /external/diagnostico/[acceso].
 */
import type { Metadata } from "next";
import DireccionSinProyecto from "@/components/external/DireccionSinProyecto";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Smarteam",
  robots: { index: false, follow: false },
};

export default function ExternalDiagnosticoSinProyecto() {
  return <DireccionSinProyecto superficie="diagnostico" />;
}
