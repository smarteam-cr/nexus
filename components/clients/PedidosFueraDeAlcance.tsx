"use client";

/**
 * components/clients/PedidosFueraDeAlcance.tsx — lo que el cliente pidió en las reuniones y no está
 * en lo vendido (2026-10-02). Lo detecta el análisis post-sesión; el CSE decide qué es y Ventas lo
 * ve como oportunidad en /sales. Interno: nunca va a un documento del cliente.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";

interface Pedido {
  id: string;
  pedido: string;
  quienLoPidio: string | null;
  estado: string;
  monto: string | null;
  cita: string | null;
  decididoPor: string | null;
  session: { id: string; title: string | null; date: string } | null;
}

const ROTULO: Record<string, string> = {
  PEDIDO: "Sin decidir",
  COTIZADO: "Cotizado",
  APROBADO: "Aprobado",
  INCLUIDO: "Ya estaba incluido",
  DESCARTADO: "Descartado",
};

const ACCIONES: Array<{ estado: string; label: string }> = [
  { estado: "COTIZADO", label: "Cotizar" },
  { estado: "INCLUIDO", label: "Ya estaba incluido" },
  { estado: "DESCARTADO", label: "Descartar" },
];

export default function PedidosFueraDeAlcance({ projectId }: { projectId: string }) {
  const toast = useToast();
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/projects/${projectId}/pedidos-fuera-de-alcance`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((d) => {
        if (vivo) setPedidos(d?.pedidos ?? []);
      });
    return () => {
      vivo = false;
    };
  }, [projectId]);

  if (!pedidos || pedidos.length === 0) return null;
  const sinDecidir = pedidos.filter((p) => p.estado === "PEDIDO").length;

  const decidir = async (id: string, estado: string) => {
    const antes = pedidos;
    setPedidos(pedidos.map((p) => (p.id === id ? { ...p, estado } : p)));
    const r = await fetch(`/api/projects/${projectId}/pedidos-fuera-de-alcance`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, estado }),
    }).catch(() => null);
    if (!r?.ok) {
      setPedidos(antes);
      toast.error("No se pudo guardar la decisión.");
    }
  };

  return (
    <div className="border-t border-line px-5 py-3">
      <button type="button" onClick={() => setAbierto((v) => !v)} className="flex items-center gap-1.5 text-xs font-semibold text-fg hover:text-brand">
        <svg className={`w-3 h-3 transition-transform ${abierto ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        Pedidos fuera de alcance que salieron en las reuniones
        {sinDecidir > 0 && (
          <span className="text-[9px] font-bold uppercase tracking-wider text-info-ink bg-info-surface border border-info-line rounded-full px-1.5 py-0.5">
            {sinDecidir} sin decidir
          </span>
        )}
      </button>
      {abierto && (
        <ul className="mt-2 space-y-2">
          {pedidos.map((p) => (
            <li key={p.id} className="rounded-lg border border-line bg-surface p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-fg">{p.pedido}</p>
                  <p className="mt-0.5 text-[11px] text-fg-muted">
                    {[p.quienLoPidio && `Lo pidió: ${p.quienLoPidio}`, p.monto && `Monto: ${p.monto}`, ROTULO[p.estado] ?? p.estado]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {p.cita && <p className="mt-1 text-[11px] italic text-fg-secondary">«{p.cita}»</p>}
                  {p.session && (
                    <Link href={`/sessions/${p.session.id}`} className="mt-1 inline-block text-[10px] text-brand hover:underline">
                      ↗ {p.session.title ?? "La reunión"}
                    </Link>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {ACCIONES.filter((a) => a.estado !== p.estado).map((a) => (
                    <button key={a.estado} type="button" onClick={() => void decidir(p.id, a.estado)}
                      className="text-[11px] px-2 py-0.5 rounded-md border border-line text-fg-secondary hover:bg-surface-hover">
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            </li>
          ))}
          <li className="text-[10px] text-fg-muted">Los que quedan sin decidir o cotizados aparecen en Ventas como oportunidad.</li>
        </ul>
      )}
    </div>
  );
}
