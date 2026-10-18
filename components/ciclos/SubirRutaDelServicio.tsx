"use client";

/**
 * «Subir al cliente» de la RUTA DEL SERVICIO (SmartLoop, docs/smartloop-plan.md, etapa 7): los ciclos del servicio y sus
 * casos de uso como Gantt, en /external/ciclos/[acceso]. Va en el panel del Resumen de un proyecto recurrente, al lado de
 * los hitos; también se publica desde «Acceso» (la fila «Ruta del servicio»).
 *
 * Subir congela una foto (sin el porqué de los casos, sin notas internas, sin citas, sin montos): lo que cambie después
 * llega al cliente cuando se vuelve a subir. Dejar de compartir corta al instante.
 */
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { BotonBlanco, BotonTexto } from "@/components/ui/sistema";

interface Estado {
  published: boolean;
  publishedAt: string | null;
  clientUrl: string | null;
  hasAccess: boolean;
}

const DIA = new Intl.DateTimeFormat("es-CR", { day: "numeric", month: "short", timeZone: "America/Costa_Rica" });
const ROTULO = "text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-fg-muted";

export default function SubirRutaDelServicio({ projectId, refresco }: { projectId: string; refresco?: number }) {
  const toast = useToast();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const r = await fetch(`/api/projects/${projectId}/publish-ciclos`, { cache: "no-store" }).catch(() => null);
    setEstado(r?.ok ? ((await r.json()) as Estado) : null);
  }, [projectId]);
  useEffect(() => {
    void cargar();
  }, [cargar, refresco]);

  const cambiar = async (subir: boolean) => {
    setOcupado(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/publish-ciclos`, { method: subir ? "POST" : "DELETE" });
      const cuerpo = (await r.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!r.ok) {
        toast.error(cuerpo?.message ?? cuerpo?.error ?? "No se pudo cambiar la publicación.");
        return;
      }
      toast.success(subir ? "Listo: el cliente ve la ruta del servicio de hoy." : "La ruta del servicio dejó de estar compartida.");
      await cargar();
    } finally {
      setOcupado(false);
    }
  };

  if (!estado) return null;
  return (
    <section className="flex flex-col gap-2">
      <span className={ROTULO}>Ruta del servicio para el cliente</span>
      <p className="text-[13px] leading-[1.45] text-fg-secondary">
        {estado.published && estado.publishedAt
          ? `Compartida desde el ${DIA.format(new Date(estado.publishedAt))}. Lo que cambie después lo ve cuando la vuelvas a subir.`
          : "Los ciclos y sus casos de uso como Gantt, sin notas internas ni montos. Todavía no la compartiste."}
      </p>
      {!estado.hasAccess ? (
        <p className="text-xs text-fg-muted">Primero genera el acceso del cliente en «Acceso», arriba del proyecto.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <BotonBlanco onClick={() => void cambiar(true)} disabled={ocupado}>
            {estado.published ? "Volver a subir" : "Subir al cliente"}
          </BotonBlanco>
          {estado.published && (
            <BotonTexto onClick={() => void cambiar(false)} disabled={ocupado}>
              Dejar de compartir
            </BotonTexto>
          )}
        </div>
      )}
    </section>
  );
}
