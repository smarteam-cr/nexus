"use client";

/**
 * components/clients/PedidosFueraDeAlcance.tsx — lo que el cliente pidió en las reuniones de ESTE
 * proyecto y no está en lo vendido (2026-10-02). Lo detecta el análisis post-sesión y el CSE lo
 * confirma o lo descarta (2026-10-07): al confirmarlo les avisamos a Customer Success y al vendedor.
 * Todas las del cliente, con su seguimiento, están en La cuenta › Fuera de alcance
 * (SolicitudesFueraDeAlcance). Interno: nunca va a un documento del cliente.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { BotonBlanco } from "@/components/ui/sistema";
import { FilaDeAlrededor } from "./FilaDeAlrededor";
import { avisarDelAviso } from "./SolicitudesFueraDeAlcance";
import {
  accionesDeSolicitud,
  ROTULO_DE_SOLICITUD,
  urlDeSolicitudes,
  type EstadoDeSolicitud,
} from "@/lib/sessions/solicitudes-fuera-de-alcance";
import type { ResultadoDelAviso, SolicitudEnPantalla } from "@/lib/sessions/solicitudes-server";

export default function PedidosFueraDeAlcance({ projectId, clientId }: { projectId: string; clientId: string }) {
  const toast = useToast();
  const [pedidos, setPedidos] = useState<SolicitudEnPantalla[] | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);

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
  const porRevisar = pedidos.filter((p) => p.estado === "PEDIDO").length;

  const decidir = async (id: string, estado: EstadoDeSolicitud) => {
    setOcupado(id);
    try {
      const r = await fetch(`/api/projects/${projectId}/pedidos-fuera-de-alcance`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, estado }),
      });
      if (!r.ok) throw new Error();
      const { solicitud, aviso } = (await r.json()) as { solicitud: SolicitudEnPantalla; aviso: ResultadoDelAviso | null };
      setPedidos((xs) => (xs ? xs.map((p) => (p.id === id ? solicitud : p)) : xs));
      avisarDelAviso(toast, aviso);
    } catch {
      toast.error("No se pudo guardar la decisión.");
    } finally {
      setOcupado(null);
    }
  };

  return (
    <FilaDeAlrededor
      titulo="Pedidos fuera de alcance"
      ayuda="Lo que el cliente pidió en las reuniones y no estaba vendido."
      meta={porRevisar > 0 ? `${porRevisar} por revisar` : `${pedidos.length} revisado${pedidos.length === 1 ? "" : "s"}`}
      metaTono={porRevisar > 0 ? "atencion" : "neutro"}
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
                  {[p.quienLoPidio && `Lo pidió: ${p.quienLoPidio}`, p.monto && `Monto: ${p.monto}`, ROTULO_DE_SOLICITUD[p.estado]]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {p.cita && <p className="mt-1 text-xs italic text-fg-secondary">«{p.cita}»</p>}
                {p.nota && <p className="mt-1 text-xs text-fg-secondary">Seguimiento: {p.nota}</p>}
                {p.reunion && (
                  <Link href={`/sessions/${p.reunion.id}`} className="mt-1 inline-block text-xs text-brand hover:underline">
                    ↗ {p.reunion.titulo ?? "La reunión"}
                  </Link>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {accionesDeSolicitud(p.estado).map((a) => (
                  <BotonBlanco key={a.estado} disabled={ocupado === p.id} onClick={() => void decidir(p.id, a.estado)}>
                    {a.label}
                  </BotonBlanco>
                ))}
              </div>
            </div>
          </li>
        ))}
        <li className="text-xs text-fg-muted">
          Al confirmar una les avisamos a Customer Success y al vendedor, y Ventas la ve como oportunidad.{" "}
          <Link href={urlDeSolicitudes(clientId)} className="text-brand hover:underline">
            Ver todas las del cliente y su seguimiento
          </Link>
        </li>
      </ul>
    </FilaDeAlrededor>
  );
}
