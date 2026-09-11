/**
 * /external/kickoff — la dirección VIEJA, sin proyecto. Ya no muestra contenido.
 *
 * Era el destino por defecto después de poner la contraseña, así que quedó en favoritos y en
 * historiales. No nombra ningún proyecto (ver el incidente del 2026-09-10 en
 * app/external/cronograma/page.tsx): lista los que este navegador ya abrió y deja elegir. La
 * dirección de cada proyecto es /external/kickoff/[acceso].
 */
import type { Metadata } from "next";
import DireccionSinProyecto from "@/components/external/DireccionSinProyecto";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Smarteam",
  robots: { index: false, follow: false },
};

export default function ExternalKickoffSinProyecto() {
  return <DireccionSinProyecto superficie="kickoff" />;
}
