"use client";

/**
 * PasoQuedo — lo que quedó de las reuniones: el nivel de cada área en juego (con qué va primero),
 * adónde quiere llegar el cliente y si hay un negocio real, lo que se vio, y los datos que la
 * escala pide guardar con toda medición.
 */
import { useState } from "react";
import { Button, Input } from "@/components/ui";
import type { Medicion } from "@/lib/exploraciones/contenido";
import { Casilla } from "./Casilla";
import { useLienzo } from "./contexto";
import { NivelDelArea, QueVaPrimero } from "./NivelDelArea";

function Grupo({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: React.ReactNode }) {
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

export default function PasoQuedo() {
  const { exp } = useLienzo();
  const areas = exp.estado.areas;
  return (
    <div className="space-y-8">
      <Grupo
        titulo="El nivel de cada área"
        ayuda="Estimado, como el chequeo de la escala: cada dimensión por mejor ajuste; la capa queda en su dimensión más débil y el área en su capa más baja."
      >
        {areas.length === 0 ? (
          <p className="text-sm text-fg-muted">Elige primero las áreas en juego (paso «Preparación»).</p>
        ) : (
          <div className="space-y-4">
            {areas.map((id) => (
              <NivelDelArea key={id} areaId={id} />
            ))}
            <QueVaPrimero />
          </div>
        )}
      </Grupo>

      <Grupo titulo="Adónde quiere llegar y si hay un negocio real" ayuda="Metas, planes, retos y tiempos; presupuesto y quién decide; qué pasa si no actúa y qué cambia si lo logra.">
        <Casilla clave="metas" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Casilla clave="retos" />
          <Casilla clave="planes" />
          <Casilla clave="consecuencias" />
          <Casilla clave="implicaciones" />
          <Casilla clave="tiempos" />
          <Casilla clave="presupuesto" />
        </div>
        <Casilla clave="autoridad" />
      </Grupo>

      <Grupo titulo="Lo que se vio y lo que sigue">
        <div className="space-y-2">
          <Casilla clave="portal" />
          <SinPortal />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Casilla clave="noExplorado" />
          <Casilla clave="producto" />
          <Casilla clave="apertura" />
          <Casilla clave="siguientePaso" />
        </div>
      </Grupo>

      <Grupo titulo="Datos de la medición" ayuda="La escala los pide en toda medición, para poder comparar con el tiempo.">
        <DatosDeLaMedicion />
      </Grupo>
    </div>
  );
}
