"use client";

/**
 * «Nueva auditoría»: elige el portal y la corre. Con solo el portal de Smarteam conectado es un botón;
 * con portales de clientes conectados, un menú. La corrida sigue en segundo plano: la ficha se abre
 * enseguida y se actualiza sola mientras se lee el portal.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, useToast } from "@/components/ui";

export interface PortalParaAuditar {
  /** `null` = el portal de Smarteam (la cuenta del sistema). */
  clientId: string | null;
  nombre: string;
}

const CLASE =
  "inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-60";

function Mas() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export default function NuevaAuditoria({ portales }: { portales: PortalParaAuditar[] }) {
  const router = useRouter();
  const toast = useToast();
  const [creando, setCreando] = useState(false);

  const correr = async (clientId: string | null) => {
    setCreando(true);
    try {
      const res = await fetch("/api/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clientId ? { clientId } : {}),
      });
      const d = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !d.id) throw new Error(d.error ?? "No se pudo crear la auditoría");
      router.push(`/audits/${d.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear la auditoría");
      setCreando(false);
    }
  };

  if (portales.length <= 1) {
    return (
      <button type="button" className={CLASE} disabled={creando || portales.length === 0} onClick={() => void correr(portales[0]?.clientId ?? null)}>
        <Mas />
        {creando ? "Creando…" : "Nueva auditoría"}
      </button>
    );
  }
  return (
    <Menu
      align="end"
      panelWidth="w-64"
      triggerClassName={CLASE}
      aria-label="Elegir el portal a auditar"
      trigger={
        <>
          <Mas />
          {creando ? "Creando…" : "Nueva auditoría"}
        </>
      }
      header={<p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">¿Qué portal?</p>}
      items={portales.map((p) => ({
        key: p.clientId ?? "smarteam",
        label: p.nombre,
        disabled: creando,
        onSelect: () => void correr(p.clientId),
      }))}
    />
  );
}
