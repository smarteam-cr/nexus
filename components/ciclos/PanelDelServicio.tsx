"use client";

/**
 * Lo que el Resumen de un proyecto RECURRENTE suma a su panel derecho (2026-10-12, pedido de Elías, del diseño del
 * servicio recurrente): lo que debe el cliente, los hitos y las sesiones fijas. Sale del cronograma y del calendario
 * (GET /api/projects/[id]/panel-del-servicio); no guarda nada.
 */
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { PanelDelServicio as Datos } from "@/lib/servicios/panel-del-servicio-server";
import SubirRutaDelServicio from "./SubirRutaDelServicio";

const DIA = new Intl.DateTimeFormat("es-CR", { day: "numeric", month: "short", timeZone: "America/Costa_Rica" });
const DIA_Y_HORA = new Intl.DateTimeFormat("es-CR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Costa_Rica",
});
const dia = (iso: string | null) => (iso ? DIA.format(new Date(iso)) : "sin fecha");

const ROTULO = "text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-fg-muted";

export default function PanelDelServicio({ projectId, refresco, onAbrirCronograma }: { projectId: string; refresco?: number; onAbrirCronograma?: () => void }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let vivo = true;
    fetch(`/api/projects/${projectId}/panel-del-servicio`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: Datos) => {
        if (vivo) {
          setDatos(j);
          setError(false);
        }
      })
      .catch(() => {
        if (vivo) setError(true);
      });
    return () => {
      vivo = false;
    };
  }, [projectId, refresco]);

  if (error) return null;
  if (!datos) {
    return (
      <div className="space-y-2" aria-busy="true">
        <div className="skeleton-shimmer h-4 w-32 rounded" />
        <div className="skeleton-shimmer h-4 rounded" />
        <div className="skeleton-shimmer h-4 w-3/4 rounded" />
      </div>
    );
  }

  return (
    <>
      <section className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <span className={ROTULO}>Lo que debe el cliente</span>
          {datos.debe.total > datos.debe.items.length && onAbrirCronograma && (
            <button type="button" onClick={onAbrirCronograma} className="text-[11px] text-brand hover:text-brand-light">
              Ver las {datos.debe.total}
            </button>
          )}
        </div>
        {datos.debe.items.length === 0 ? (
          <p className="text-[13px] text-fg-muted">El cronograma no tiene entregas pendientes del cliente.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {datos.debe.items.map((d, k) => (
              <li key={k} className="flex items-start gap-2 text-[13px] text-fg-secondary">
                <span
                  className={cn(
                    "mt-px flex-shrink-0 rounded-full border px-1.5 text-[11px] tabular-nums",
                    d.atrasada ? "border-danger-line bg-danger-surface text-danger-ink" : "border-line bg-surface text-fg-secondary",
                  )}
                  title={d.atrasada ? "Ya venció" : "Vence"}
                >
                  {dia(d.vence)}
                </span>
                <span className="min-w-0">
                  {d.titulo}
                  <span className="text-fg-muted"> · {d.fase}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {datos.hitos.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <span className={ROTULO}>Hitos</span>
          <ul className="flex flex-col gap-1.5">
            {datos.hitos.map((h, k) => (
              <li key={k} className="flex items-baseline gap-2 text-[13px]">
                <span className="inline-flex min-w-[74px] flex-shrink-0 items-center gap-1.5 tabular-nums text-fg-secondary">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "h-2 w-2 flex-shrink-0 rounded-full",
                      h.estado === "hecho" && "bg-success",
                      h.estado === "atrasado" && "bg-destructive",
                      h.estado === "proximo" && "border-2 border-brand",
                      h.estado === "pendiente" && "border border-line",
                    )}
                  />
                  {dia(h.fin)}
                </span>
                <span className={cn("min-w-0", h.estado === "proximo" ? "font-semibold text-fg" : "text-fg-secondary")}>
                  {h.fase}
                  {h.estado === "atrasado" && <span className="text-danger-ink"> · atrasado</span>}
                  {h.estado === "proximo" && <span className="font-normal text-fg-muted"> · el próximo</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2.5">
        <span className={ROTULO}>Sesiones fijas</span>
        {datos.sesiones.fijas.length === 0 ? (
          <p className="text-[13px] text-fg-muted">{datos.sesiones.aviso ?? "No hay reuniones de una serie con la empresa en las próximas 6 semanas."}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {datos.sesiones.fijas.map((s) => (
              <li key={s.titulo} className="text-[13px] text-fg-secondary">
                <span className="text-fg">{s.titulo}</span>
                <span className="text-fg-muted">
                  {s.cada ? ` · ${s.cada}` : ""} · próxima {DIA_Y_HORA.format(new Date(s.proxima))}
                </span>
              </li>
            ))}
          </ul>
        )}
        <span className="text-[11px] text-fg-muted">Leídas de las series de Google Calendar.</span>
      </section>

      <SubirRutaDelServicio projectId={projectId} refresco={refresco} />
    </>
  );
}
