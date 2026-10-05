"use client";

/**
 * «Equipo» — cómo está cada CSE, para las reuniones uno a uno: cuentas, lo que gestiona al mes,
 * cuántas en riesgo, el uso promedio de su cartera y el avance de sus proyectos en Nexus. Al lado,
 * el CSM de HubSpot con quien más coordina.
 *
 * Una cuenta con dos CSE cuenta para quien lleva más proyectos en ella (si no, la plata se
 * contaría dos veces). Los atrasos y bloqueos son POR PROYECTO, de quien lo lleva.
 */
import { EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fmtMonto, plural } from "@/lib/cs/formato";
import { UMBRALES } from "@/lib/cs/lectura-partner";
import type { FilaDeEquipo } from "@/lib/cs/cartera-reglas";
import { Avatar, Barra, CajaDeTabla, EncabezadoDeTabla } from "../piezas";

const COLUMNAS = "grid-cols-[minmax(0,1.2fr)_70px_110px_86px_96px_140px_84px_88px_minmax(0,1.1fr)]";

export default function Equipo({
  equipo,
}: {
  equipo: { filas: FilaDeEquipo[]; proyectosSinCse: number; deBaja: { nombre: string; proyectos: number }[] };
}) {
  if (equipo.filas.length === 0 && equipo.proyectosSinCse === 0) {
    return <EmptyState title="Sin CSE asignados" description="Ningún proyecto activo tiene un CSE en HubSpot." />;
  }
  const n = (x: number, alerta = false) => <span className={cn("text-right tabular-nums", alerta && x > 0 && "font-semibold text-warn-ink")}>{x}</span>;
  return (
    <div className="space-y-3">
      <CajaDeTabla minimo="min-w-[1060px]">
        <EncabezadoDeTabla columnas={COLUMNAS}>
          <span>CSE</span>
          <span className="text-right">Cuentas</span>
          <span className="text-right">Gestiona al mes</span>
          <span className="text-right">En riesgo</span>
          <span>Uso promedio</span>
          <span>Avance de proyectos</span>
          <span className="text-right">Atrasados</span>
          <span className="text-right">Bloqueados</span>
          <span>CSM de HubSpot</span>
        </EncabezadoDeTabla>
        {equipo.filas.map((f, i) => (
          <div key={f.email ?? f.nombre} className={cn("grid items-center gap-4 px-4 py-3.5 text-[13px] text-fg", COLUMNAS, i > 0 && "border-t border-line")}>
            <span className="flex min-w-0 items-center gap-2">
              <Avatar nombre={f.nombre} />
              <span className="truncate text-sm font-semibold">{f.nombre}</span>
            </span>
            {n(f.cuentas)}
            <span className="text-right tabular-nums">{fmtMonto(f.mrr)}</span>
            {n(f.enRiesgo, true)}
            <span className={cn("tabular-nums", f.usoPromedio !== null && f.usoPromedio < UMBRALES.usoBajo && "text-warn-ink")}>
              {f.usoPromedio ?? <span className="text-fg-muted">sin dato</span>}
            </span>
            {f.avance !== null ? (
              <span className="flex items-center gap-2">
                <Barra valor={f.avance * 100} ancho="w-16" />
                <span className="tabular-nums">{Math.round(f.avance * 100)} %</span>
              </span>
            ) : (
              <span className="text-fg-muted">sin cronograma</span>
            )}
            {n(f.atrasados, true)}
            {n(f.bloqueados, true)}
            <span className="truncate text-fg-secondary">{f.csmFrecuente ? `${f.csmFrecuente.nombre} en ${f.csmFrecuente.cuentas}` : "—"}</span>
          </div>
        ))}
        {equipo.proyectosSinCse > 0 && (
          <div className={cn("grid items-center gap-4 bg-warn-surface px-4 py-3.5 text-[13px]", COLUMNAS, equipo.filas.length > 0 && "border-t border-line")}>
            <span className="flex items-center gap-2">
              <Avatar nombre={null} />
              <span className="text-sm font-semibold text-warn-ink">Sin CSE asignado</span>
            </span>
            <span className="col-span-7 text-warn-ink">
              {plural(equipo.proyectosSinCse, "proyecto activo", "proyectos activos")} sin encargado en HubSpot
              {equipo.deBaja.length > 0
                ? `, ${equipo.deBaja.reduce((s, d) => s + d.proyectos, 0)} de gente que ya no está en el equipo: ${equipo.deBaja.map((d) => `${d.nombre} (${d.proyectos})`).join(", ")}.`
                : "."}
            </span>
            <span className="text-warn-ink">asignar en HubSpot</span>
          </div>
        )}
      </CajaDeTabla>
      <p className="text-xs text-fg-muted">
        Una cuenta con dos CSE cuenta para quien lleva más proyectos en ella. El avance sale de los cronogramas de Nexus; el CSM es
        el de HubSpot que más se repite en sus cuentas.
      </p>
    </div>
  );
}
