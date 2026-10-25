"use client";

/**
 * EnOtraEmpresa — en el buscador de «Contexto adicional», las reuniones que quedaron en OTRA empresa con gente de un
 * dominio de esta, con «Mover a esta empresa» (T8, 2026-10-25). Las trae
 * GET /api/projects/[projectId]/session-candidates/en-otra-empresa (lo escrito filtra por título); mover escribe en
 * POST /api/sessions/[id]/empresa, que pide poder abrir las dos empresas. Después de mover, `onMovida` recarga la lista
 * del buscador: la reunión aparece entre las de la empresa, lista para elegirla.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { fetchJson } from "@/lib/api/fetch-json";

interface Fila {
  sessionId: string;
  titulo: string;
  fecha: string;
  empresa: { id: string; nombre: string };
  dominios: string[];
  conTexto: boolean;
}

interface Respuesta {
  clientId: string;
  reuniones: Fila[];
  ocultas: number;
}

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Costa_Rica" });

export function EnOtraEmpresa({ projectId, q, onMovida }: { projectId: string; q: string; onMovida: () => void }) {
  const toast = useToast();
  const [r, setR] = useState<(Respuesta & { clave: string }) | null>(null);
  const [moviendo, setMoviendo] = useState<string | null>(null);
  const [recargar, setRecargar] = useState(0);
  const clave = q.trim();

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetchJson<Respuesta>(`/api/projects/${projectId}/session-candidates/en-otra-empresa?q=${encodeURIComponent(clave)}`, { signal: ctrl.signal })
        .then((d) => setR({ ...d, clave }))
        .catch(() => {
          if (!ctrl.signal.aborted) setR({ clientId: "", reuniones: [], ocultas: 0, clave });
        });
    }, clave ? 300 : 0);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [projectId, clave, recargar]);

  if (!r || (r.reuniones.length === 0 && r.ocultas === 0)) return null;

  async function mover(f: Fila) {
    if (!r) return;
    setMoviendo(f.sessionId);
    try {
      const res = await fetchJson<{ mensaje: string }>(`/api/sessions/${encodeURIComponent(f.sessionId)}/empresa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "mover", clientId: r.clientId }),
      });
      toast.success(res.mensaje);
      setRecargar((n) => n + 1);
      onMovida();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo mover la reunión.");
    } finally {
      setMoviendo(null);
    }
  }

  return (
    <section aria-label="En otra empresa" className="mt-3 space-y-1.5">
      <p className="pt-2 text-[10px] font-semibold uppercase tracking-wider text-fg-muted">En otra empresa, con gente de esta empresa</p>
      <p className="text-[11px] text-fg-muted">
        Quedaron en otra empresa, pero en la reunión estuvo alguien de {[...new Set(r.reuniones.flatMap((f) => f.dominios))].map((d) => `@${d}`).join(", ") || "sus dominios"}.
        Si es de esta empresa, muévela y después elígela.
      </p>
      <ul className="space-y-1.5">
        {r.reuniones.map((f) => (
          <li key={f.sessionId} className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-fg">{f.titulo}</p>
              <p className="text-[11px] text-fg-muted">
                {fecha(f.fecha)} · hoy en {f.empresa.nombre} · {f.dominios.map((d) => `@${d}`).join(", ")}
                {f.conTexto ? "" : " · sin texto"}
              </p>
            </div>
            <Button variant="secondary" size="sm" loading={moviendo === f.sessionId} disabled={!!moviendo} onClick={() => void mover(f)}>
              Mover a esta empresa
            </Button>
          </li>
        ))}
      </ul>
      {r.ocultas > 0 && (
        <p className="text-[11px] text-fg-muted">
          {r.ocultas === 1 ? "Hay 1 más" : `Hay ${r.ocultas} más`} en empresas que no tienes asignadas: pídele a la líder de Customer Success que las revise.
        </p>
      )}
    </section>
  );
}
