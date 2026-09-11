/**
 * /external/cronograma — la dirección VIEJA, sin proyecto. Ya no muestra contenido.
 *
 * Era a donde se llegaba después de poner la contraseña, así que quedó en favoritos, en
 * historiales y en al menos un mensaje reenviado: el incidente del 2026-09-10, en que Elías abrió
 * «el cronograma de Judesur» y vio el de Wherex porque su navegador tenía abierto Wherex. No nombra
 * ningún proyecto, así que no puede elegir uno: lista los que este navegador ya abrió y deja que la
 * persona elija. La dirección de cada proyecto es /external/cronograma/[acceso].
 */
import type { Metadata } from "next";
import DireccionSinProyecto from "@/components/external/DireccionSinProyecto";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Smarteam",
  robots: { index: false, follow: false },
};

export default function ExternalCronogramaSinProyecto() {
  return <DireccionSinProyecto superficie="cronograma" />;
}
