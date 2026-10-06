"use client";

/**
 * LlegaronPorElTest — el panel de la derecha del listado de preventas: las empresas cuyo contacto hizo
 * el test de marketing y todavía no tienen preventa. Es la bandeja de entrada del vendedor.
 *
 * Es lo que Marketing le pasa a Ventas: el prospecto hace el test y agenda la revisión del
 * diagnóstico en la agenda del vendedor. Un clic abre su preventa, que arranca preparándose sola.
 * Se lee de la nota que deja el test (desde el 2026-10-01; antes, de una propiedad que solo tenían 41
 * contactos). Los clientes van marcados; los que lo dejaron a medias, aparte y plegados: son leads más
 * fríos. Se pide al abrir la página (lee HubSpot): si HubSpot no responde, el panel lo dice y la
 * lista sigue funcionando.
 *
 * Arriba va «Qué sigue»: cuántos hicieron el test y no tienen reunión, o el próximo que la tiene.
 */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { diaConSemana, diaCorto } from "@/lib/exploraciones/fechas";
import { BotonBlanco } from "./FranjaDeSugerencias";

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

/** Cuántas se ven antes de «Ver las N». */
const A_LA_VISTA = 5;

const ROTULO = "text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted";

/** «jue 8 oct · 10:00». */
function reunion(iso: string): string {
  const hora = new Date(iso).toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Costa_Rica" });
  return `${diaConSemana(iso)} · ${hora}`;
}

function QueSigue({ llegadas }: { llegadas: Llegada[] }) {
  const terminaron = llegadas.filter((l) => l.terminado);
  const sinReunion = terminaron.filter((l) => !l.proxima && !l.agendo);
  const conReunion = terminaron.filter((l) => l.proxima).sort((a, b) => (a.proxima ?? "").localeCompare(b.proxima ?? ""));
  let texto: string | null = null;
  if (sinReunion.length === 1) texto = `${sinReunion[0].empresa} hizo el test y no tiene reunión: prepara su preventa antes de llamarla.`;
  else if (sinReunion.length > 1) texto = `${sinReunion.length} empresas hicieron el test y no tienen reunión: prepara su preventa antes de llamarlas.`;
  else if (conReunion[0]) texto = `${conReunion[0].empresa} tiene reunión el ${diaConSemana(conReunion[0].proxima as string)}: planifica su preventa primero.`;
  if (!texto) return null;
  return (
    <section data-recorrido="que-sigue" className="flex flex-col gap-2 rounded-xl border border-info-line bg-info-surface p-3.5">
      <p className={cn(ROTULO, "text-brand")}>Qué sigue</p>
      <p className="text-sm leading-[1.4] text-fg">{texto}</p>
    </section>
  );
}

export default function LlegaronPorElTest({ nombresDeAreas, puedeEditar }: { nombresDeAreas: Record<string, string>; puedeEditar: boolean }) {
  const router = useRouter();
  const [llegadas, setLlegadas] = useState<Llegada[] | null>(null);
  const [sinEmpresa, setSinEmpresa] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [abriendo, setAbriendo] = useState<string | null>(null);
  const [todas, setTodas] = useState(false);
  const [frias, setFrias] = useState(false);

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
        setError(data.error ?? "No se pudo abrir la preventa.");
        return;
      }
      router.push(`/sales/exploraciones/${data.id}`);
    } catch {
      setError("No se pudo abrir la preventa. Revisa tu conexión.");
    } finally {
      setAbriendo(null);
    }
  }

  const terminaron = (llegadas ?? []).filter((l) => l.terminado);
  const aMedias = (llegadas ?? []).filter((l) => !l.terminado);
  const visibles = todas ? terminaron : terminaron.slice(0, A_LA_VISTA);

  const detalle = (l: Llegada) =>
    [l.contacto ?? "Sin nombre", l.areaId ? `test de ${nombresDeAreas[l.areaId] ?? "un área"}` : null, diaCorto(l.fecha), l.intentos > 1 ? `${l.intentos} intentos` : null]
      .filter(Boolean)
      .join(" · ");

  const boton = (l: Llegada) =>
    puedeEditar && (
      <BotonBlanco className="flex-shrink-0" disabled={abriendo !== null} onClick={() => void preparar(l)}>
        {abriendo === l.companyId ? "Abriendo…" : "Planificar"}
      </BotonBlanco>
    );

  return (
    <div className="flex flex-col gap-4">
      {llegadas && <QueSigue llegadas={llegadas} />}

      <div data-recorrido="preventa.lista.test" className="space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className={ROTULO}>Llegaron por el test{llegadas ? ` · ${terminaron.length}` : ""}</p>
          {terminaron.length > A_LA_VISTA && (
            <button type="button" onClick={() => setTodas((x) => !x)} className="text-[11px] text-brand hover:text-brand-light">
              {todas ? "Ver menos" : `Ver las ${terminaron.length}`}
            </button>
          )}
        </div>
        <p className="text-xs text-fg-muted">Su contacto hizo el test de marketing y todavía no tienen preventa. Lo más reciente, arriba.</p>
      </div>

      {error && <p className="text-xs text-danger-ink">{error}</p>}

      {llegadas === null && !error ? (
        <div className="flex flex-col gap-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2 rounded-xl border border-line bg-surface p-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-52" />
              <Skeleton className="h-5 w-32" rounded="full" />
            </div>
          ))}
        </div>
      ) : llegadas && terminaron.length === 0 ? (
        <p className="text-[13px] text-fg-muted">Nadie hizo el test sin tener ya su preventa.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {visibles.map((l) => (
            <div key={l.companyId} className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{l.empresa}</span>
                {l.esCliente && (
                  <span className="flex-shrink-0 rounded-full border border-line bg-surface-hover px-2 py-px text-[11px] font-medium text-fg-secondary">Cliente</span>
                )}
              </div>
              <span className="text-xs text-fg-muted">{detalle(l)}</span>
              <div className="flex items-center justify-between gap-2">
                {l.proxima || l.agendo ? (
                  <span className="whitespace-nowrap rounded-full border border-success-line bg-success-surface px-2 py-0.5 text-[11px] font-semibold text-success-ink">
                    {l.proxima ? `Reunión ${reunion(l.proxima)}` : "Agendó la revisión"}
                  </span>
                ) : (
                  <span className="whitespace-nowrap rounded-full border border-warn-line bg-warn-surface px-2 py-0.5 text-[11px] font-semibold text-warn-ink">
                    Sin reunión agendada
                  </span>
                )}
                {boton(l)}
              </div>
            </div>
          ))}
        </div>
      )}

      {aMedias.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setFrias((x) => !x)}
            aria-expanded={frias}
            className="flex w-full items-center justify-between rounded-lg border border-line bg-surface px-3 py-[9px] text-[13px] text-fg-secondary transition-colors hover:bg-surface-hover"
          >
            <span>Lo empezaron y no lo terminaron · {aMedias.length}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cn("h-3.5 w-3.5 transition-transform", frias && "rotate-180")} aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {frias && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs text-fg-muted">Leads más fríos: dejaron sus datos y no llegaron al resultado.</p>
              {aMedias.map((l) => (
                <div key={l.companyId} className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-line bg-surface px-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-fg">{l.empresa}</span>
                    <span className="block truncate text-xs text-fg-muted">{detalle(l)}</span>
                  </span>
                  {boton(l)}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {sinEmpresa > 0 && (
        <p className="text-[11px] text-fg-muted">
          {sinEmpresa === 1 ? "Un intento no se muestra" : `${sinEmpresa} intentos no se muestran`} porque el contacto no tiene empresa en HubSpot: asócialo a su
          empresa para verlo acá.
        </p>
      )}
    </div>
  );
}
