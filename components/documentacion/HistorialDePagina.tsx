"use client";

/**
 * components/documentacion/HistorialDePagina.tsx — las versiones de una página.
 *
 * Una base que escribe el equipo necesita poder volver atrás: sin esto, un borrado de media
 * página es definitivo y nadie se anima a editar lo ajeno.
 *
 * Las fotos las saca el servidor al guardar (una por sesión de escritura, o una por persona), así
 * que acá solo se listan y se restauran. Restaurar guarda antes una foto de lo actual: también se
 * puede deshacer.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/api/fetch-json";
import { Drawer, Spinner, useToast } from "@/components/ui";

interface Version {
  id: string;
  version: number;
  titulo: string;
  motivo: string;
  autorEmail: string | null;
  createdAt: string;
}

const MOTIVO: Record<string, string> = {
  autoguardado: "Guardado",
  "antes-de-restaurar": "Antes de restaurar",
  semilla: "Carga inicial",
  "antes-de-forzar": "Antes de recargar la plantilla",
};

const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-CR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function HistorialDePagina({
  paginaId,
  abierto,
  puedeRestaurar,
  onCerrar,
}: {
  paginaId: string;
  abierto: boolean;
  puedeRestaurar: boolean;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [versiones, setVersiones] = useState<Version[] | null>(null);
  const [restaurando, setRestaurando] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    setVersiones(null);
    fetchJson<{ versiones: Version[] }>(`/api/documentacion/paginas/${paginaId}/versiones`)
      .then((r) => vivo && setVersiones(r.versiones))
      .catch(() => vivo && setVersiones([]));
    return () => {
      vivo = false;
    };
  }, [abierto, paginaId]);

  const restaurar = async (versionId: string) => {
    setRestaurando(versionId);
    try {
      await fetchJson(`/api/documentacion/paginas/${paginaId}/versiones/${versionId}/restaurar`, {
        method: "POST",
      });
      toast.success("Página restaurada.");
      onCerrar();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo restaurar.");
    } finally {
      setRestaurando(null);
    }
  };

  return (
    <Drawer
      open={abierto}
      onClose={onCerrar}
      title="Historial de cambios"
      description="Cada foto es un momento guardado de esta página."
      size="sm"
    >
      {versiones === null ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : versiones.length === 0 ? (
        <p className="py-8 text-center text-sm text-fg-muted">
          Todavía no hay versiones anteriores. La primera se guarda cuando alguien edita.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {versiones.map((v) => (
            <li key={v.id} className="flex items-baseline gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-fg">{v.titulo}</p>
                <p className="mt-0.5 text-2xs text-fg-muted">
                  {fecha(v.createdAt)} · {MOTIVO[v.motivo] ?? v.motivo}
                  {v.autorEmail ? ` · ${v.autorEmail}` : ""}
                </p>
              </div>
              {puedeRestaurar && (
                <button
                  type="button"
                  onClick={() => void restaurar(v.id)}
                  disabled={restaurando !== null}
                  className="shrink-0 rounded-md border border-line px-2 py-1 text-2xs text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-50"
                >
                  {restaurando === v.id ? "Restaurando…" : "Restaurar"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}
