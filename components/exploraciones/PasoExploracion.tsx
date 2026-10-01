"use client";

/**
 * PasoExploracion — la pestaña donde se prepara y se guía cada reunión (antes eran dos: Preparación
 * y Reuniones; se juntaron el 2026-10-01 a pedido de Elías).
 *
 * De arriba abajo: el agente, con quién se habla (industria, perfil, áreas en juego, cómo conectar y
 * su HubSpot), la guía de la reunión y lo demás que sale de las reuniones (el siguiente paso, el
 * portal, lo que nadie exploró). Lo que respondió el cliente en el marco de calificación vive arriba
 * de todo, en el resumen.
 */
import { Casilla } from "./Casilla";
import { useLienzo } from "./contexto";
import GuiaDeLasReuniones, { DatosDeLaMedicion, SinPortal } from "./GuiaDeLasReuniones";
import { AreasEnJuego, IndustriaYPerfil } from "./Identificacion";
import PanelDelAgente from "./PanelDelAgente";

function Seccion({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-fg">{titulo}</h2>
        {ayuda && <p className="text-xs text-fg-muted">{ayuda}</p>}
      </div>
      {children}
    </section>
  );
}

export default function PasoExploracion() {
  const { exp } = useLienzo();
  // Después de preparar, lo que más se usa es leer la reunión que pasó.
  const yaPreparo = exp.estado.propuesta.corridas.some((c) => c.modo === "preparar");

  return (
    <div className="space-y-8">
      <PanelDelAgente modoPrincipal={yaPreparo ? "leer" : "preparar"} />

      <Seccion titulo="Con quién hablas" ayuda="Se arma sola con lo que hay en HubSpot; corrígela si algo no calza.">
        <IndustriaYPerfil />
        <AreasEnJuego />
        <div className="grid gap-4 lg:grid-cols-2">
          <Casilla clave="contexto" />
          <Casilla clave="hubspotActual" />
        </div>
      </Seccion>

      <GuiaDeLasReuniones />

      <Seccion titulo="Lo que se vio y lo que sigue" ayuda="Lo propone el agente con la transcripción de cada reunión; úsalo, descártalo o complétalo a mano.">
        <Casilla clave="siguientePaso" />
        <div className="space-y-2">
          <Casilla clave="portal" />
          <SinPortal />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Casilla clave="noExplorado" />
          <Casilla clave="apertura" />
          <Casilla clave="producto" />
        </div>
      </Seccion>

      <Seccion titulo="Datos de la medición" ayuda="La escala los pide en toda medición, para poder comparar con el tiempo. El país y el tamaño salen de HubSpot.">
        <DatosDeLaMedicion />
      </Seccion>
    </div>
  );
}
