"use client";

/**
 * LlegaronPorElTest — las empresas cuyo contacto hizo el test de marketing y todavía no tienen exploración.
 *
 * Es lo que Marketing le pasa a Ventas: el prospecto hace el test y agenda la revisión del
 * diagnóstico en la agenda del vendedor. Un clic abre su exploración, que arranca preparándose sola.
 * Se lee de la nota que deja el test (desde el 2026-10-01; antes, de una propiedad que solo tenían 41
 * contactos). Los clientes van marcados; los que lo dejaron a medias, aparte y plegados: son leads más
 * fríos. Se pide al abrir la página (lee HubSpot): si HubSpot no responde, la sección lo dice y la
 * lista sigue funcionando.
 */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge, Button, Skeleton } from "@/components/ui";
import { diaCorto, diaYHora } from "@/lib/exploraciones/fechas";

interface Llegada {
  companyId: string;
  empresa: string;
  contacto: string | null;
  areaId: string | null;
  fecha: string;
  terminado: boolean;
  intentos: number;
  agendo: boolean;
  proxima: string | null;
  esCliente: boolean;
}

/** Cuántas se ven antes de «Ver todas». */
const A_LA_VISTA = 8;

export default function LlegaronPorElTest({ nombresDeAreas, puedeEditar }: { nombresDeAreas: Record<string, string>; puedeEditar: boolean }) {
  const router = useRouter();
  const [llegadas, setLlegadas] = useState<Llegada[] | null>(null);
  const [sinEmpresa, setSinEmpresa] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [abriendo, setAbriendo] = useState<string | null>(null);
  const [todas, setTodas] = useState(false);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const res = await fetch("/api/sales/exploraciones/sugerencias");
        const data = (await res.json().catch(() => ({}))) as { llegadas?: Llegada[]; sinEmpresa?: number; error?: string };
        if (!vivo) return;
        if (!res.ok) setError(data.error ?? "No se pudo consultar HubSpot.");
        else {
          setLlegadas(data.llegadas ?? []);
          setSinEmpresa(data.sinEmpresa ?? 0);
        }
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

  const terminaron = (llegadas ?? []).filter((l) => l.terminado);
  const aMedias = (llegadas ?? []).filter((l) => !l.terminado);
  const visibles = todas ? terminaron : terminaron.slice(0, A_LA_VISTA);

  const fila = (l: Llegada) => (
    <li key={l.companyId} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium text-fg">
          <span className="truncate">{l.empresa}</span>
          {l.esCliente && (
            <Badge variant="primary" size="xs">
              Cliente
            </Badge>
          )}
        </p>
        <p className="text-xs text-fg-muted">
          {l.contacto ?? "Sin nombre"}
          {l.areaId ? ` · test de ${nombresDeAreas[l.areaId] ?? "un área"}` : ""}
          {` · ${diaCorto(l.fecha)}`}
          {l.intentos > 1 ? ` · ${l.intentos} intentos` : ""}
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
          <Badge variant="warning" size="xs">
            Sin reunión agendada
          </Badge>
        )}
        {puedeEditar && (
          <Button size="sm" variant="secondary" loading={abriendo === l.companyId} disabled={abriendo !== null} onClick={() => void preparar(l)}>
            Planificar
          </Button>
        )}
      </div>
    </li>
  );

  return (
    <section className="mb-6 space-y-3 rounded-xl border border-brand/30 bg-brand/5 p-4">
      <div>
        <h2 className="text-sm font-semibold text-fg">Llegaron por el test{llegadas ? ` (${terminaron.length})` : ""}</h2>
        <p className="text-xs text-fg-muted">
          Su contacto hizo el test de marketing y todavía no tienen exploración. Prepárala antes de la revisión del diagnóstico. Lo más reciente, arriba.
        </p>
      </div>
      {error && <p className="text-xs text-danger-ink">{error}</p>}
      {llegadas === null && !error ? (
        <div className="space-y-2" aria-hidden>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <>
          {terminaron.length > 0 && <ul className="divide-y divide-line">{visibles.map(fila)}</ul>}
          {terminaron.length > A_LA_VISTA && (
            <Button size="xs" variant="ghost" onClick={() => setTodas((x) => !x)}>
              {todas ? "Ver menos" : `Ver las ${terminaron.length}`}
            </Button>
          )}
          {aMedias.length > 0 && (
            <details className="rounded-lg border border-line bg-surface px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-fg-secondary">
                Lo empezaron y no lo terminaron ({aMedias.length})
              </summary>
              <p className="mt-1 text-xs text-fg-muted">Leads más fríos: dejaron sus datos y no llegaron al resultado.</p>
              <ul className="divide-y divide-line">{aMedias.map(fila)}</ul>
            </details>
          )}
          {sinEmpresa > 0 && (
            <p className="text-2xs text-fg-muted">
              {sinEmpresa === 1 ? "Un intento no se muestra" : `${sinEmpresa} intentos no se muestran`} porque el contacto no tiene empresa en HubSpot: asócialo a su empresa para verlo acá.
            </p>
          )}
        </>
      )}
    </section>
  );
}
