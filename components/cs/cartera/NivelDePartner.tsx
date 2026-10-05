"use client";

/**
 * «Nivel de partner» — qué cuentas sostienen el nivel de Smarteam como partner de HubSpot:
 * puntos por cuenta (vendidos y gestionados), las relaciones gestionadas que vencen (sus puntos se
 * pierden), las cuentas compartidas con otro partner (los puntos se dividen) y la comisión que
 * proyecta HubSpot.
 *
 * ⚠ Los puntos los calcula HubSpot y en la copia de julio venían sin actualizar desde el
 * 26 nov 2025: siempre viajan con su fecha y la pantalla avisa cuando son viejos.
 */
import { Alert, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { diasEntre, enCuanto, fmtDia, fmtMonto, miles, plural } from "@/lib/cs/formato";
import type { FilaDeNivel } from "@/lib/cs/cartera-reglas";
import { CajaDeTabla, Chip, EncabezadoDeTabla, Punto } from "../piezas";

const COLUMNAS = "grid-cols-[minmax(0,1.3fr)_96px_104px_130px_110px_150px_110px]";

interface Nivel {
  filas: FilaDeNivel[];
  totales: { total: number; vendidos: number; gestionados: number; comision: number; porVencer: number; puntosEnJuego: number; compartidas: number };
  actualizadoEn: string | null;
  comisionCalculadaEn: string | null;
}

function Estadistica({ numero, etiqueta, detalle, atencion }: { numero: string; etiqueta: string; detalle: string; atencion?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-line bg-surface px-4 py-3.5">
      <span className="flex items-center gap-1.5">
        {atencion && <Punto color="ambar" />}
        <span className="text-[22px] font-bold leading-7 tabular-nums text-fg">{numero}</span>
      </span>
      <span className="text-[13px] font-medium text-fg">{etiqueta}</span>
      <span className="text-xs text-fg-muted">{detalle}</span>
    </div>
  );
}

export default function NivelDePartner({ nivel, hoy }: { nivel: Nivel; hoy: string }) {
  if (nivel.filas.length === 0) {
    return <EmptyState title="Sin puntos de partner" description="HubSpot Partner no trajo puntos ni comisión para las cuentas de la cartera." />;
  }
  const viejos = !nivel.actualizadoEn || diasEntre(nivel.actualizadoEn, hoy) > 60;
  const t = nivel.totales;
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-fg-secondary">Qué cuentas sostienen el nivel de Smarteam como partner de HubSpot.</p>
      {viejos && (
        <Alert variant="warning" title={nivel.actualizadoEn ? `HubSpot no actualiza los puntos desde el ${fmtDia(nivel.actualizadoEn, hoy)}.` : "HubSpot no trajo la fecha de los puntos."}>
          Se muestran con esa fecha.{nivel.comisionCalculadaEn ? ` La comisión proyectada es del ${fmtDia(nivel.comisionCalculadaEn, hoy)}.` : ""}
        </Alert>
      )}
      <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        <Estadistica numero={miles(t.total)} etiqueta="puntos de nivel" detalle={`${miles(t.vendidos)} vendidos · ${miles(t.gestionados)} gestionados`} />
        <Estadistica
          numero={String(t.porVencer)}
          atencion={t.porVencer > 0}
          etiqueta="relaciones gestionadas por vencer"
          detalle={`${plural(Math.round(t.puntosEnJuego), "punto", "puntos")} en juego en 60 días`}
        />
        <Estadistica numero={String(t.compartidas)} etiqueta="cuentas compartidas" detalle="con otro partner: los puntos se dividen" />
        <Estadistica
          numero={fmtMonto(t.comision)}
          etiqueta="comisión proyectada"
          detalle={nivel.comisionCalculadaEn ? `según HubSpot, al ${fmtDia(nivel.comisionCalculadaEn, hoy)}` : "según HubSpot"}
        />
      </div>
      <CajaDeTabla minimo="min-w-[940px]">
        <EncabezadoDeTabla columnas={COLUMNAS}>
          <span>Cuenta</span>
          <span className="text-right">Vendidos</span>
          <span className="text-right">Gestionados</span>
          <span>Mercado</span>
          <span>Compartida</span>
          <span>Relación vence</span>
          <span className="text-right">Comisión</span>
        </EncabezadoDeTabla>
        {nivel.filas.map((f, i) => {
          const pronto = f.relacionVence ? diasEntre(hoy, f.relacionVence) <= 30 && diasEntre(hoy, f.relacionVence) >= 0 : false;
          return (
            <div key={f.clientId} className={cn("grid items-center gap-4 px-4 py-3.5 text-[13px] tabular-nums text-fg", COLUMNAS, i > 0 && "border-t border-line")}>
              <span className="truncate text-sm font-semibold">{f.nombre}</span>
              <span className="text-right">{f.vendidos !== null ? miles(f.vendidos) : "—"}</span>
              <span className="text-right">{f.gestionados !== null ? miles(f.gestionados) : "—"}</span>
              <span className="text-fg-secondary">{f.mercado ?? "—"}</span>
              <span>{f.compartida ? <Chip tono="atencion">Sí · otro partner</Chip> : "No"}</span>
              <span className={cn(pronto ? "font-semibold text-warn-ink" : "text-fg-secondary")}>
                {f.relacionVence ? `${fmtDia(f.relacionVence, hoy)}${pronto ? ` · ${enCuanto(f.relacionVence, hoy)}` : ""}` : "—"}
              </span>
              <span className="text-right">{f.comision !== null ? fmtMonto(f.comision) : "—"}</span>
            </div>
          );
        })}
      </CajaDeTabla>
    </div>
  );
}
