"use client";

/**
 * EmpresasDeHubspot — «Planificar con una empresa»: todas las empresas del HubSpot de Smarteam, para
 * elegir con quién planificar una preventa.
 *
 * Son miles: se piden de a una página. Sin búsqueda, las de actividad de ventas más reciente; al
 * escribir, busca en HubSpot por nombre o dominio. Muestra VARIAS coincidencias para que el vendedor
 * elija: tomar la primera, como hacía el buscador de propuestas, abría la exploración de otra
 * empresa sin que nadie lo notara. Si la empresa ya tiene una exploración viva, se abre esa; si no,
 * «Planificar» la crea y arranca su preparación.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert, Skeleton } from "@/components/ui";
import { diaCorto } from "@/lib/exploraciones/fechas";
import { BotonBlanco } from "./FranjaDeSugerencias";

interface Empresa {
  id: string;
  nombre: string;
  dominio: string | null;
  industria: string | null;
  pais: string | null;
  ultimaActividad: string | null;
  esCliente: boolean;
  exploracionId: string | null;
}

interface Pagina {
  empresas?: Empresa[];
  siguiente?: string | null;
  error?: string;
}

export default function EmpresasDeHubspot({ puedeEditar }: { puedeEditar: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [empresas, setEmpresas] = useState<Empresa[] | null>(null);
  const [siguiente, setSiguiente] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abriendo, setAbriendo] = useState<string | null>(null);
  // Cada búsqueda nueva invalida lo que estaba en vuelo: una respuesta vieja no pisa la nueva.
  const pedido = useRef(0);

  const termino = q.trim();
  const buscando = termino.length >= 2;

  async function traer(after: string | null, n: number) {
    setCargando(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (buscando) params.set("q", termino);
      if (after) params.set("after", after);
      const res = await fetch(`/api/sales/exploraciones/empresas?${params}`);
      const data = (await res.json().catch(() => ({}))) as Pagina;
      if (n !== pedido.current) return;
      if (!res.ok) {
        setError(data.error ?? "No se pudo consultar HubSpot.");
        return;
      }
      setEmpresas((antes) => (after ? [...(antes ?? []), ...(data.empresas ?? [])] : (data.empresas ?? [])));
      setSiguiente(data.siguiente ?? null);
    } catch {
      if (n === pedido.current) setError("No se pudo consultar HubSpot. Revisa tu conexión.");
    } finally {
      if (n === pedido.current) setCargando(false);
    }
  }

  useEffect(() => {
    // Con una sola letra no se busca: sigue la lista de actividad reciente.
    if (termino.length === 1) return;
    const n = ++pedido.current;
    const t = setTimeout(() => void traer(null, n), buscando ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `traer` lee `termino`, que ya está en las dependencias
  }, [termino]);

  /**
   * «Planificar» abre la preventa y el agente la prepara solo. «Con una transcripción» es el flujo
   * liviano (Elías, 2026-10-06) para quien no llegó por el diagnóstico: no se prepara; se abre en
   * Exploración con «Sumar una sesión o transcripción» a la vista, y el agente lee lo que se suma.
   */
  async function abrir(e: Empresa, empezar: "preparar" | "transcripcion" = "preparar") {
    if (e.exploracionId) {
      router.push(`/sales/exploraciones/${e.exploracionId}`);
      return;
    }
    setAbriendo(e.id);
    setError(null);
    try {
      const res = await fetch("/api/sales/exploraciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: e.id, empezar }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        setError(data.error ?? "No se pudo abrir la preventa.");
        return;
      }
      router.push(empezar === "transcripcion" ? `/sales/exploraciones/${data.id}?pieza=exploracion&sumar=1` : `/sales/exploraciones/${data.id}`);
    } catch {
      setError("No se pudo abrir la preventa. Revisa tu conexión.");
    } finally {
      setAbriendo(null);
    }
  }

  return (
    <section id="planificar" data-recorrido="preventa.lista.planificar" className="scroll-mt-6 space-y-3 rounded-xl border border-line bg-surface p-5">
      <div>
        <h2 className="text-sm font-semibold text-fg">Planificar con una empresa</h2>
        <p className="text-xs text-fg-muted">Las del HubSpot de Smarteam. Busca por nombre o dominio; sin búsqueda, ves las de actividad más reciente.</p>
      </div>
      <label className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-[9px] text-fg-muted focus-within:border-brand">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 flex-shrink-0" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          id="buscar-empresa"
          value={q}
          onChange={(ev) => setQ(ev.target.value)}
          placeholder="Busca una empresa: acme o acme.com"
          aria-label="Buscar una empresa en HubSpot por nombre o dominio"
          className="min-w-0 flex-1 border-0 bg-transparent text-sm text-fg outline-none placeholder:text-fg-muted"
        />
      </label>
      {error && <Alert variant="danger">{error}</Alert>}

      {empresas === null && cargando ? (
        <div className="divide-y divide-line rounded-lg border border-line" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-1.5 px-3 py-2.5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-72" />
            </div>
          ))}
        </div>
      ) : empresas && empresas.length === 0 && !cargando ? (
        <p className="text-sm text-fg-muted">{buscando ? "No hay empresas con ese nombre o dominio en HubSpot." : "No hay empresas con actividad en HubSpot."}</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {(empresas ?? []).map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-fg">{e.nombre}</p>
                <p className="truncate text-xs text-fg-muted">
                  {[e.dominio, e.industria, e.pais].filter(Boolean).join(" · ") || "Sin dominio ni industria en HubSpot"}
                  {e.ultimaActividad ? ` · última actividad ${diaCorto(e.ultimaActividad)}` : ""}
                </p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                {e.esCliente && (
                  <span className="rounded-full border border-line bg-surface-hover px-2 py-px text-[11px] font-medium text-fg-secondary">Cliente</span>
                )}
                {e.exploracionId ? (
                  <BotonBlanco onClick={() => void abrir(e)}>Abrir preventa</BotonBlanco>
                ) : (
                  puedeEditar && (
                    <>
                      <button
                        type="button"
                        disabled={abriendo !== null}
                        title="Para quien no llegó por el diagnóstico: abre la preventa sin prepararla y suma la transcripción de la llamada"
                        onClick={() => void abrir(e, "transcripcion")}
                        className="px-1.5 py-1 text-xs font-semibold text-brand hover:underline disabled:opacity-50"
                      >
                        Con una transcripción
                      </button>
                      <BotonBlanco disabled={abriendo !== null} onClick={() => void abrir(e)}>
                        {abriendo === e.id ? "Abriendo…" : "Planificar"}
                      </BotonBlanco>
                    </>
                  )
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {siguiente && empresas && empresas.length > 0 && (
        <div className="flex justify-center">
          <button
            type="button"
            disabled={cargando}
            onClick={() => void traer(siguiente, pedido.current)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-50"
          >
            {cargando ? "Cargando…" : "Ver más"}
          </button>
        </div>
      )}
    </section>
  );
}
