/**
 * components/manual/ComoFunciona.tsx — la sección de entrada del manual.
 *
 * Qué es Nexus, qué te ahorra y dónde termina. Es lo único 100% escrito a mano de la pantalla
 * porque ninguna estructura del código lo sabe.
 */
import { QUE_ES, QUE_TE_AHORRA, QUE_NO_HACE } from "@/lib/manual/contenido";
import { Bloque, Seccion } from "./Piezas";

export default function ComoFunciona() {
  return (
    <Seccion id="como-funciona" titulo="Cómo funciona">
      <Bloque b={QUE_ES} />
      <Bloque b={QUE_TE_AHORRA} />
      <Bloque b={QUE_NO_HACE} />
    </Seccion>
  );
}
