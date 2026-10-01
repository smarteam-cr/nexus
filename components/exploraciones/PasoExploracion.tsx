"use client";

/**
 * PasoExploracion — la pestaña donde se prepara y se guía cada reunión (antes eran dos: Preparación
 * y Reuniones; se juntaron el 2026-10-01 a pedido de Elías).
 *
 * De arriba abajo: el agente, con quién se habla (industria, perfil, áreas en juego, cómo conectar y
 * su HubSpot), las sesiones que planea el vendedor, la guía de la PRÓXIMA y lo demás que sale de las
 * reuniones (el siguiente paso, el portal, lo que nadie exploró). Lo que respondió el cliente en el
 * marco de calificación vive arriba de todo, en el resumen.
 */
import { useState } from "react";
import { Button, Input } from "@/components/ui";
import type { Medicion } from "@/lib/exploraciones/contenido";
import { Casilla } from "./Casilla";
import { useLienzo } from "./contexto";
import GuiaDeLaProxima from "./GuiaDeLaProxima";
import { AreasEnJuego, IndustriaYPerfil } from "./Identificacion";
import PanelDelAgente from "./PanelDelAgente";
import Sesiones from "./Sesiones";

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

function DatosDeLaMedicion() {
  const { exp, cambiar, puedeEditar } = useLienzo();
  const guardada = exp.estado.contenido.medicion;
  const [m, setM] = useState<Medicion>(guardada);
  const [vista, setVista] = useState(guardada);
  if (vista !== guardada) {
    setVista(guardada);
    setM(guardada);
  }
  const campo = (k: keyof Medicion, etiqueta: string, placeholder: string) => (
    <label className="space-y-1.5">
      <span className="block text-xs font-medium text-fg-secondary">{etiqueta}</span>
      <Input
        value={m[k] ?? ""}
        disabled={!puedeEditar}
        placeholder={placeholder}
        onChange={(e) => setM((x) => ({ ...x, [k]: e.target.value }))}
        onBlur={() => {
          if ((m[k] ?? "") !== (guardada[k] ?? "")) void cambiar([{ op: "medicion", medicion: { [k]: (m[k] ?? "").trim() } }]);
        }}
      />
    </label>
  );
  return (
    <div className="grid gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-3">
      {campo("pais", "País", "Por ejemplo, Costa Rica")}
      {campo("personasEmpresa", "Personas en la empresa", "Por ejemplo, 120")}
      {campo("personasEquipo", "Personas en el equipo que se mira", "Por ejemplo, 6")}
    </div>
  );
}

function SinPortal() {
  const { exp, cambiar, puedeEditar, guardando } = useLienzo();
  const sin = exp.estado.contenido.sinPortal;
  if (!puedeEditar && !sin) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-line px-3 py-2 text-xs text-fg-muted">
      <span>{sin ? "Marcado: el prospecto no usa HubSpot (no hay portal que mirar)." : "¿No usa HubSpot? Márcalo: cuenta como portal revisado."}</span>
      {puedeEditar && (
        <Button size="xs" variant="secondary" disabled={guardando} onClick={() => void cambiar([{ op: "sinPortal", valor: !sin }])}>
          {sin ? "Sí usa HubSpot" : "No usa HubSpot"}
        </Button>
      )}
    </div>
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

      <Sesiones />
      <GuiaDeLaProxima />

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
