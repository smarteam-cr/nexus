"use client";

/**
 * LlegaronPorElTest — las empresas cuyo contacto terminó el test de marketing en los últimos 30 días.
 *
 * Es lo que Marketing le pasa a Ventas: el prospecto hace el test y agenda la revisión del
 * diagnóstico en la agenda del vendedor. Un clic abre su exploración, que arranca preparándose sola.
 * Se pide al abrir la página (lee HubSpot): si HubSpot no responde, la sección lo dice y la lista
 * sigue funcionando.
 */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge, Button, Skeleton } from "@/components/ui";
import { diaCorto, diaYHora } from "@/lib/exploraciones/fechas";

interface Llegada {
  companyId: string;
  empresa: string;
  dominio: string | null;
  contacto: string;
  areaId: string | null;
  fecha: string | null;
  agendo: boolean;
  proxima: string | null;
}


export default function LlegaronPorElTest({ nombresDeAreas, puedeEditar }: { nombresDeAreas: Record<string, string>; puedeEditar: boolean }) {
  const router = useRouter();
  const [llegadas, setLlegadas] = useState<Llegada[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abriendo, setAbriendo] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const res = await fetch("/api/sales/exploraciones/sugerencias");
        const data = (await res.json().catch(() => ({}))) as { llegadas?: Llegada[]; error?: string };
        if (!vivo) return;
        if (!res.ok) setError(data.error ?? "No se pudo consultar HubSpot.");
        else setLlegadas(data.llegadas ?? []);
      } catch {
        if (vivo) setError("No se pudo consultar HubSpot. Revisa tu conexión.");
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  async function preparar(l: Llegada) {
    setAbriendo(l.companyId);
    setError(null);
    try {
      const res = await fetch("/api/sales/exploraciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: l.companyId }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        setError(data.error ?? "No se pudo abrir la exploración.");
        return;
      }
      router.push(`/sales/exploraciones/${data.id}`);
    } catch {
      setError("No se pudo abrir la exploración. Revisa tu conexión.");
    } finally {
      setAbriendo(null);
    }
  }

  if (llegadas !== null && llegadas.length === 0 && !error) return null;

  return (
    <section className="mb-6 space-y-3 rounded-xl border border-line bg-surface p-4">
      <div>
        <h2 className="text-sm font-semibold text-fg">Llegaron por el test</h2>
        <p className="text-xs text-fg-muted">
          Su contacto terminó el test de marketing en los últimos 30 días y todavía no tienen exploración. Prepárala antes de la revisión del diagnóstico.
        </p>
      </div>
      {error && <p className="text-xs text-danger-ink">{error}</p>}
      {llegadas === null && !error ? (
        <div className="space-y-2" aria-hidden>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {(llegadas ?? []).map((l) => (
            <li key={l.companyId} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-fg">{l.empresa}</p>
                <p className="text-xs text-fg-muted">
                  {l.contacto}
                  {l.areaId ? ` · test de ${nombresDeAreas[l.areaId] ?? "un área"}` : ""}
                  {l.fecha ? ` · ${diaCorto(l.fecha)}` : ""}
                </p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                {l.proxima ? (
                  <Badge variant="success" size="xs">
                    Reunión {diaYHora(l.proxima)}
                  </Badge>
                ) : l.agendo ? (
                  <Badge variant="success" size="xs">
                    Agendó la revisión
                  </Badge>
                ) : (
                  <Badge variant="warning" size="xs">Sin reunión agendada</Badge>
                )}
                {puedeEditar && (
                  <Button size="sm" variant="secondary" loading={abriendo === l.companyId} disabled={abriendo !== null} onClick={() => void preparar(l)}>
                    Preparar
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
