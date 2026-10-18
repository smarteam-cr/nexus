"use client";

/**
 * components/rentabilidad/OrigenDeLosMeses.tsx — de dónde salen los meses de Rentabilidad: su FOTO (lo que el cálculo
 * decía al cerrar el mes, lib/rentabilidad/foto.ts) o EN VIVO (con los datos de hoy). SOLO DIRECCIÓN, como la página.
 *
 * Cada mes dice cuál es. Un mes sin foto se puede fotografiar acá; volver a tomar una foto pide el motivo, que queda en
 * la fila. El job la toma solo el día 3 de cada mes.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Textarea } from "@/components/ui";
import { BotonAzul, BotonBlanco, BotonTexto } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { resumenDelOrigen } from "@/lib/rentabilidad/foto";
import type { OrigenDelMes } from "@/lib/rentabilidad/tipos";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** «3 sep 2026» (armado a mano: `Intl` escribe distinto en Node y en el navegador). */
const dia = (iso: string) => {
  const d = new Date(Date.parse(iso) - 6 * 3_600_000);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const quien = (por: string | null) => (!por ? "" : por === "sistema" ? "el sistema" : por.split("@")[0]);

export default function OrigenDeLosMeses({ origenes }: { origenes: OrigenDelMes[] }) {
  const router = useRouter();
  const toast = useToast();
  const [abierto, setAbierto] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState<string | null>(null);
  if (!origenes.length) return null;

  const tomar = async (mes: string, reemplazar: boolean) => {
    if (reemplazar && !motivo.trim()) {
      toast.error("Para volver a tomar la foto, escribe por qué.");
      return;
    }
    setGuardando(mes);
    try {
      const r = await fetch("/api/cobranza/costos/foto-del-margen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mes, reemplazar, motivo: reemplazar ? motivo.trim() : undefined }),
      });
      const cuerpo = (await r.json().catch(() => ({}))) as { error?: string; cuentas?: number };
      if (!r.ok) throw new Error(cuerpo.error ?? "No se pudo tomar la foto.");
      toast.success(`Foto tomada: ${cuerpo.cuentas ?? 0} cuenta(s). El mes ya no cambia con los datos de hoy.`);
      setAbierto(null);
      setMotivo("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo tomar la foto.");
    } finally {
      setGuardando(null);
    }
  };

  return (
    <section className="space-y-2 rounded-xl border border-line bg-surface py-3" aria-label="De dónde salen los meses">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4">
        <h2 className="text-sm font-semibold text-fg">De dónde salen los números</h2>
        <p className="text-xs text-fg-muted">{resumenDelOrigen(origenes)}</p>
      </div>
      <ul className="divide-y divide-line">
        {origenes.map((o) => (
          <li key={o.mes} className="px-4 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="w-16 font-semibold text-fg">{o.etiqueta}</span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-[2px] text-xs font-medium",
                    o.origen === "foto" ? "border-line bg-surface-muted text-fg-secondary" : "border-warn-line bg-warn-surface text-warn-ink",
                  )}
                >
                  {o.origen === "foto" ? "Desde su foto" : "En vivo"}
                </span>
                <span className="text-xs text-fg-muted">
                  {o.origen === "foto" && o.tomadaAt
                    ? `Tomada el ${dia(o.tomadaAt)} por ${quien(o.tomadaPor)}${o.motivo ? ` · ${o.motivo}` : ""}`
                    : "Sin foto: se calcula con los datos de hoy y puede cambiar."}
                </span>
              </span>
              {abierto === o.mes ? null : o.origen === "vivo" ? (
                <BotonBlanco onClick={() => void tomar(o.mes, false)} disabled={guardando !== null}>
                  {guardando === o.mes ? "Tomando…" : "Tomar la foto"}
                </BotonBlanco>
              ) : (
                <BotonTexto
                  onClick={() => {
                    setAbierto(o.mes);
                    setMotivo("");
                  }}
                  disabled={guardando !== null}
                >
                  Volver a tomar
                </BotonTexto>
              )}
            </div>
            {abierto === o.mes && (
              <div className="mt-2 space-y-2">
                <label className="block">
                  <span className="text-xs text-fg-muted">La foto nueva reemplaza la de {o.etiqueta} con los datos de hoy. ¿Por qué?</span>
                  <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={500} placeholder="Por ejemplo: se cargó tarde la planilla del mes" />
                </label>
                <span className="flex flex-wrap justify-end gap-2">
                  <BotonTexto onClick={() => setAbierto(null)} disabled={guardando !== null}>
                    Cancelar
                  </BotonTexto>
                  <BotonAzul onClick={() => void tomar(o.mes, true)} disabled={guardando !== null}>
                    {guardando === o.mes ? "Tomando…" : "Volver a tomar la foto"}
                  </BotonAzul>
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="px-4 text-xs text-fg-muted">
        La foto guarda lo que el cálculo decía del mes al cerrarlo, con los supuestos y el tipo de cambio de ese momento. Nexus la toma sola el día 3 de cada mes. El mes en curso no
        entra en Rentabilidad: solo los meses cerrados.
      </p>
    </section>
  );
}
