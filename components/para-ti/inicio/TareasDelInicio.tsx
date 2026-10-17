"use client";

/**
 * TareasDelInicio — tus tareas de hoy y, para Marketing, tus tareas internas (ficha D, 2026-10-17; diseño «Para ti ·
 * Ventas y CSE», la tarjeta «Tus tareas de hoy»).
 *
 * La casilla marca la tarea como hecha con las reglas de Tareas (PATCH /api/tareas/[id], con su versión: si otra
 * persona la cambió, 409 y se recarga). Una tarea de HubSpot se escribe allá enseguida.
 */
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/ui/Toast";
import { avisarCambioDeParaTi } from "../cuenta";
import type { TareaDelInicio } from "@/lib/mi-dia/inicio-server";
import { TARJETA, TITULO } from "./piezas";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const dia = (ymd: string) => `${Number(ymd.slice(8, 10))} ${MESES[Number(ymd.slice(5, 7)) - 1]}`;

const DE_DONDE: Record<string, string> = {
  hubspot: "HubSpot",
  reunion: "De una reunión",
  notas: "De una reunión",
  chat: "Del asistente",
  paso: "Siguiente paso",
  plantilla: "De una plantilla",
};

function Fila({ t, hoyISO, conAmbito }: { t: TareaDelInicio; hoyISO: string; conAmbito: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [hecha, setHecha] = useState(false);
  const [ocupada, setOcupada] = useState(false);
  const vencida = !!t.venceEl && t.venceEl < hoyISO;
  async function marcar() {
    setOcupada(true);
    setHecha(true);
    try {
      const res = await fetch(`/api/tareas/${encodeURIComponent(t.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "estado", version: t.version, hacia: "hecha" }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setHecha(false);
        toast.error(j?.error ?? "No se pudo marcar la tarea.");
        if (res.status === 409) router.refresh();
        return;
      }
      avisarCambioDeParaTi();
      router.refresh();
    } finally {
      setOcupada(false);
    }
  }
  const meta = [t.venceEl ? (t.venceEl === hoyISO ? "Hoy" : dia(t.venceEl)) : null, conAmbito ? t.ambito : DE_DONDE[t.origen] ?? null].filter(Boolean).join(" · ");
  return (
    <li className="flex items-start gap-2.5 border-t border-line px-1 py-[9px] transition-colors hover:bg-surface-muted">
      <input
        type="checkbox"
        aria-label={`Marcar hecha: ${t.titulo}`}
        checked={hecha}
        disabled={ocupada || hecha}
        onChange={marcar}
        className="mt-0.5 h-4 w-4 flex-none accent-primary"
      />
      <div className="min-w-0 flex-1">
        <Link href={`/tareas?t=${encodeURIComponent(t.id)}`} className={cn("block text-[13px] leading-[19px] transition-colors hover:text-brand", hecha ? "text-fg-muted line-through" : "text-fg")}>
          {!conAmbito && t.empresa ? `${t.empresa} · ` : ""}
          {t.titulo}
        </Link>
        <p className="text-xs text-fg-muted">
          {meta}
          {vencida && <span className="font-semibold text-warn-ink">{meta ? " · " : ""}vencida</span>}
        </p>
      </div>
    </li>
  );
}

export function TusTareasDeHoy({ tareas, total, hoyISO }: { tareas: TareaDelInicio[]; total: number; hoyISO: string }) {
  return (
    <section className={cn(TARJETA, "flex flex-col gap-2.5 p-5")} aria-labelledby="tareas-hoy-t">
      <div className="flex items-baseline justify-between">
        <h2 id="tareas-hoy-t" className={TITULO}>
          Tus tareas de hoy
        </h2>
        <Link href="/tareas" className="text-[13px] font-medium text-brand hover:text-brand-light">
          {total > tareas.length ? `Todas · ${total}` : "Todas"}
        </Link>
      </div>
      {tareas.length === 0 ? (
        <p className="border-t border-line pt-2.5 text-[13px] text-fg-muted">Nada vence hoy.</p>
      ) : (
        <ul className="flex flex-col">
          {tareas.map((t) => (
            <Fila key={t.id} t={t} hoyISO={hoyISO} conAmbito={false} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Marketing: las tareas abiertas tuyas y de tu sprint sin dueño, por ámbito (primero las internas). */
export function TusTareasInternas({ tareas, hoyISO }: { tareas: TareaDelInicio[]; hoyISO: string }) {
  const grupos = new Map<string, TareaDelInicio[]>();
  for (const t of tareas) grupos.set(t.ambito, [...(grupos.get(t.ambito) ?? []), t]);
  return (
    <section className={cn(TARJETA, "flex flex-col gap-3 p-5")} aria-labelledby="internas-t">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="internas-t" className={TITULO}>
          Tus tareas internas
        </h2>
        <span className="text-xs text-fg-muted">Smarteam, SmartAgro y demás trabajo interno</span>
      </div>
      {tareas.length === 0 ? (
        <p className="text-[13px] text-fg-muted">No tienes tareas abiertas. Las que te propongan las reuniones de tu equipo llegan a Tareas.</p>
      ) : (
        [...grupos].map(([ambito, ts]) => (
          <div key={ambito} className="flex flex-col">
            <p className="pb-1 text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-fg-muted">
              {ambito} · {ts.length}
            </p>
            <ul className="flex flex-col">
              {ts.slice(0, 8).map((t) => (
                <Fila key={t.id} t={t} hoyISO={hoyISO} conAmbito={false} />
              ))}
            </ul>
            {ts.length > 8 && (
              <Link href="/tareas" className="pt-1.5 text-xs font-medium text-brand hover:text-brand-light">
                Y {ts.length - 8} más en Tareas
              </Link>
            )}
          </div>
        ))
      )}
    </section>
  );
}
