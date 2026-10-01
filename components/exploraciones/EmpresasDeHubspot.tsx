"use client";

/**
 * EmpresasDeHubspot — todas las empresas del HubSpot de Smarteam, para elegir con quién planificar.
 *
 * Son miles: se piden de a una página. Sin búsqueda, las de actividad de ventas más reciente; al
 * escribir, busca en HubSpot por nombre o dominio. Muestra VARIAS coincidencias para que el vendedor
 * elija: tomar la primera, como hacía el buscador de propuestas, abría la exploración de otra
 * empresa sin que nadie lo notara. Si la empresa ya tiene una exploración viva, se abre esa; si no,
 * «Planificar» la crea y arranca su preparación.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Input, Skeleton } from "@/components/ui";
import { diaCorto } from "@/lib/exploraciones/fechas";

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

  async function abrir(e: Empresa) {
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
        body: JSON.stringify({ companyId: e.id }),
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

  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div>
        <h2 className="text-sm font-semibold text-fg">Todas las empresas</h2>
        <p className="text-xs text-fg-muted">
          Las del HubSpot de Smarteam. Busca por nombre o dominio y elige con quién planificar; sin búsqueda, ves las de actividad más reciente.
        </p>
      </div>
      <Input
        value={q}
        onChange={(ev) => setQ(ev.target.value)}
        placeholder="Busca una empresa: acme o acme.com"
        aria-label="Buscar una empresa en HubSpot por nombre o dominio"
      />
      {error && <Alert variant="danger">{error}</Alert>}

      {empresas === null && cargando ? (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : empresas && empresas.length === 0 && !cargando ? (
        <p className="text-sm text-fg-muted">{buscando ? "No hay empresas con ese nombre o dominio en HubSpot." : "No hay empresas con actividad en HubSpot."}</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {(empresas ?? []).map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-fg">{e.nombre}</p>
                <p className="truncate text-xs text-fg-muted">
                  {[e.dominio, e.industria, e.pais].filter(Boolean).join(" · ") || "Sin dominio ni industria en HubSpot"}
                  {e.ultimaActividad ? ` · última actividad ${diaCorto(e.ultimaActividad)}` : ""}
                </p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                {e.esCliente && (
                  <Badge size="xs" variant="default">
                    Cliente
                  </Badge>
                )}
                {e.exploracionId ? (
                  <Button size="sm" variant="secondary" onClick={() => void abrir(e)}>
                    Abrir exploración
                  </Button>
                ) : (
                  puedeEditar && (
                    <Button size="sm" variant="secondary" loading={abriendo === e.id} disabled={abriendo !== null} onClick={() => void abrir(e)}>
                      Planificar
                    </Button>
                  )
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {siguiente && empresas && empresas.length > 0 && (
        <div className="flex justify-center">
          <Button size="sm" variant="secondary" loading={cargando} onClick={() => void traer(siguiente, pedido.current)}>
            Ver más
          </Button>
        </div>
      )}
    </section>
  );
}
