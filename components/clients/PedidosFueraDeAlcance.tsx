"use client";

/**
 * components/clients/PedidosFueraDeAlcance.tsx — lo que el cliente pidió en las reuniones y no está
 * en lo vendido (2026-10-02). Lo detecta el análisis post-sesión; el CSE decide qué es y Ventas lo
 * ve como oportunidad en /sales. Interno: nunca va a un documento del cliente.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { BotonBlanco } from "@/components/ui/sistema";
import { FilaDeAlrededor } from "./FilaDeAlrededor";

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
    <FilaDeAlrededor
      titulo="Pedidos fuera de alcance"
      ayuda="Lo que el cliente pidió en las reuniones y no estaba vendido."
      meta={sinDecidir > 0 ? `${sinDecidir} sin decidir` : `${pedidos.length} decidido${pedidos.length === 1 ? "" : "s"}`}
      metaTono={sinDecidir > 0 ? "atencion" : "neutro"}
      abierto={abierto}
      onAlternar={() => setAbierto((v) => !v)}
    >
      <ul className="space-y-2">
        {pedidos.map((p) => (
          <li key={p.id} className="rounded-lg border border-line bg-surface p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-fg">{p.pedido}</p>
                <p className="mt-0.5 text-xs text-fg-muted">
                  {[p.quienLoPidio && `Lo pidió: ${p.quienLoPidio}`, p.monto && `Monto: ${p.monto}`, ROTULO[p.estado] ?? p.estado]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {p.cita && <p className="mt-1 text-xs italic text-fg-secondary">«{p.cita}»</p>}
                {p.session && (
                  <Link href={`/sessions/${p.session.id}`} className="mt-1 inline-block text-xs text-brand hover:underline">
                    ↗ {p.session.title ?? "La reunión"}
                  </Link>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {ACCIONES.filter((a) => a.estado !== p.estado).map((a) => (
                  <BotonBlanco key={a.estado} onClick={() => void decidir(p.id, a.estado)}>
                    {a.label}
                  </BotonBlanco>
                ))}
              </div>
            </div>
          </li>
        ))}
        <li className="text-xs text-fg-muted">Los que quedan sin decidir o cotizados aparecen en Ventas como oportunidad.</li>
      </ul>
    </FilaDeAlrededor>
  );
}
