"use client";

/**
 * «Renovaciones» — lo que renueva en 30, 60 o 90 días, una fila por cuenta y fecha. Si un cliente
 * renueva Marketing en marzo y Sales en julio, sale dos veces. El monto es la suma de lo que paga
 * cada hub que renueva; el cambio esperado lo calcula HubSpot (negativo = baja de plan).
 */
import { useState } from "react";
import Link from "next/link";
import { EmptyState, Segmentado } from "@/components/ui";
import { cn } from "@/lib/cn";
import { enCuanto, fmtCambio, fmtDia, fmtMonto } from "@/lib/cs/formato";
import { esEnDolares, type FilaDeRenovacion } from "@/lib/cs/cartera-reglas";
import { UMBRALES } from "@/lib/cs/lectura-partner";
import { Avatar, CajaDeTabla, Chip, EncabezadoDeTabla, GrupoDeTabla, Salud } from "../piezas";

type Ventana = "30" | "60" | "90";

const COLUMNAS = "grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)_92px_100px_112px_100px_minmax(0,1fr)_30px]";

const TRAMOS: Array<{ desde: number; hasta: number; titulo: string }> = [
  { desde: 0, hasta: 30, titulo: "Próximos 30 días" },
  { desde: 31, hasta: 60, titulo: "De 31 a 60 días" },
  { desde: 61, hasta: 90, titulo: "De 61 a 90 días" },
];

function sumaUsd(filas: FilaDeRenovacion[], campo: "montoMensual" | "cambioEsperado"): number {
  return filas.filter(esEnDolares).reduce((s, f) => s + (f[campo] ?? 0), 0);
}

export default function Renovaciones({ filas, hoy }: { filas: FilaDeRenovacion[]; hoy: string }) {
  const [ventana, setVentana] = useState<Ventana>("90");
  const tope = Number(ventana);
  const visibles = filas.filter((f) => f.dias <= tope);
  const baja = sumaUsd(visibles.filter((f) => (f.cambioEsperado ?? 0) < 0), "cambioEsperado");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmentado<Ventana>
          etiqueta="Ventana de renovaciones"
          valor={ventana}
          onCambio={setVentana}
          opciones={(["30", "60", "90"] as const).map((v) => ({ clave: v, etiqueta: `${v} días`, cuenta: filas.filter((f) => f.dias <= Number(v)).length }))}
        />
        {visibles.length > 0 && (
          <span className="text-[13px] text-fg-secondary">
            Renuevan <b className="font-semibold text-fg">{fmtMonto(sumaUsd(visibles, "montoMensual"))} al mes</b>
            {baja < 0 && (
              <>
                {" "}
                · HubSpot espera que bajen <b className="font-semibold text-warn-ink">{fmtMonto(-baja)}</b>
              </>
            )}
          </span>
        )}
      </div>

      {visibles.length === 0 ? (
        <EmptyState title={`Nada renueva en ${ventana} días`} description="Las fechas salen de HubSpot Partner y de lo cargado a mano en la información de cada cliente." />
      ) : (
        <CajaDeTabla minimo="min-w-[1040px]">
          <EncabezadoDeTabla columnas={COLUMNAS}>
            <span>Cuenta</span>
            <span>Qué renueva y cómo se usa</span>
            <span>Fecha</span>
            <span className="text-right">Al mes</span>
            <span className="text-right">Cambio esperado</span>
            <span>Salud</span>
            <span>Conversación</span>
            <span>CSE</span>
          </EncabezadoDeTabla>
          {TRAMOS.filter((t) => t.desde <= tope).map((t, k) => {
            const delTramo = visibles.filter((f) => f.dias >= t.desde && f.dias <= t.hasta);
            if (delTramo.length === 0) return null;
            return (
              <div key={t.titulo}>
                <GrupoDeTabla titulo={`${t.titulo} · ${delTramo.length}`} detalle={`${fmtMonto(sumaUsd(delTramo, "montoMensual"))} al mes`} primero={k === 0} />
                {delTramo.map((f, i) => {
                  const usos = f.hubs.filter((h) => h.uso !== null);
                  const usoBajo = usos.some((h) => (h.uso ?? 100) < UMBRALES.usoBajo);
                  return (
                    <Link
                      key={`${f.clientId}-${f.fecha}-${f.moneda ?? ""}`}
                      href={`/customer-success/${f.clientId}`}
                      className={cn("grid items-center gap-4 px-4 py-3.5 text-fg transition-colors hover:bg-surface-hover", COLUMNAS, i > 0 && "border-t border-line")}
                    >
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="truncate text-sm font-semibold">{f.nombre}</span>
                        {f.cancelacion && (
                          <span>
                            <Chip tono="atencion">Cancelación registrada</Chip>
                          </span>
                        )}
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-[13px]">{f.hubs.length ? f.hubs.map((h) => `${h.nombre}${h.plan ? ` ${h.plan}` : ""}`).join(" · ") : "La suscripción"}</span>
                        {usos.length > 0 && (
                          <span className={cn("text-xs", usoBajo ? "text-warn-ink" : "text-fg-muted")}>
                            {usos.map((h) => `uso de ${h.nombre.replace(" Hub", "")} ${h.uso}`).join(" · ")}
                          </span>
                        )}
                      </span>
                      <span className="flex flex-col">
                        <span className="text-[13px]">{fmtDia(f.fecha, hoy)}</span>
                        <span className={cn("text-xs", f.dias <= 30 ? "text-warn-ink" : "text-fg-muted")}>{enCuanto(f.fecha, hoy)}</span>
                      </span>
                      <span className="text-right text-[13px] tabular-nums">{f.montoMensual !== null ? fmtMonto(f.montoMensual, f.moneda) : "—"}</span>
                      <span
                        className={cn(
                          "text-right text-[13px] tabular-nums",
                          f.cambioEsperado === null || f.cambioEsperado === 0 ? "text-fg-muted" : f.cambioEsperado < 0 ? "text-warn-ink" : "text-success-ink",
                        )}
                      >
                        {f.cambioEsperado === null ? "sin dato" : f.cambioEsperado === 0 ? "sin cambio" : fmtCambio(f.cambioEsperado, f.moneda)}
                      </span>
                      <Salud salud={f.salud} />
                      <span className="text-[13px] text-fg-secondary">{f.conversacion}</span>
                      <Avatar nombre={f.cse?.nombre ?? null} />
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </CajaDeTabla>
      )}
      <p className="text-xs text-fg-muted">
        Una fila por cuenta y fecha: si un cliente renueva hubs en fechas distintas, sale una vez por fecha. El monto es la suma de
        lo que paga cada hub que renueva, en una sola moneda: si el mismo día renueva algo en otra moneda, va en otra fila. Los
        totales de arriba son en dólares.
      </p>
    </div>
  );
}
