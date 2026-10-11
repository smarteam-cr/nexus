"use client";

/**
 * PasoExploracion — las sesiones con el cliente.
 *
 * Abre en la página de inicio (InicioDeLaExploracion, etapa A, diseño v13): la próxima sesión, las
 * sesiones con su reunión y su estado, «+ Agregar sesión», las fuentes manuales y las instrucciones.
 * Elegida una sesión, su preparación, su «en vivo» y su análisis (SesionesDeExploracion) y, al final,
 * plegado, el historial del agente. La escala, las áreas en juego y los datos de la medición viven en
 * «La escala»; con quién se habla y cómo conectar, en Preparación.
 */
import InicioDeLaExploracion from "./InicioDeLaExploracion";
import { HistorialDelAgente } from "./PanelDelAgente";
import SesionesDeExploracion from "./SesionesDeExploracion";
import { useLienzo } from "./contexto";

export default function PasoExploracion() {
  const { sesion } = useLienzo();
  if (sesion.enInicio) return <InicioDeLaExploracion />;
  return (
    <div className="space-y-8">
      <SesionesDeExploracion />
      <HistorialDelAgente />
    </div>
  );
}
