"use client";

/**
 * NuevaExploracion — buscar una empresa en el HubSpot de Smarteam y abrir su exploración.
 *
 * Muestra VARIAS coincidencias para que el vendedor elija: tomar la primera, como hacía el buscador
 * de propuestas, abría la exploración de otra empresa sin que nadie lo notara. Si la empresa ya
 * tiene una exploración viva, se abre esa.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Input, Modal } from "@/components/ui";

interface Coincidencia {
  id: string;
  nombre: string;
  dominio: string | null;
  industria: string | null;
  pais: string | null;
  exploracionId: string | null;
}

export default function NuevaExploracion({ variante = "primary" }: { variante?: "primary" | "secondary" }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [empresas, setEmpresas] = useState<Coincidencia[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abriendo, setAbriendo] = useState<string | null>(null);
  const pedido = useRef(0);

  useEffect(() => {
    if (!abierto) return;
    const termino = q.trim();
    if (termino.length < 2) {
      setEmpresas(null);
      return;
    }
    const n = ++pedido.current;
    const t = setTimeout(async () => {
      setBuscando(true);
      setError(null);
      try {
        const res = await fetch(`/api/sales/exploraciones/empresas?q=${encodeURIComponent(termino)}`);
        const data = (await res.json()) as { empresas?: Coincidencia[]; error?: string };
        if (n !== pedido.current) return;
        if (!res.ok) setError(data.error ?? "No se pudo buscar.");
        else setEmpresas(data.empresas ?? []);
      } catch {
        if (n === pedido.current) setError("No se pudo buscar. Revisa tu conexión.");
      } finally {
        if (n === pedido.current) setBuscando(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, abierto]);

  async function abrir(e: Coincidencia) {
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
      const data = (await res.json()) as { id?: string; error?: string };
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
    <>
      <Button variant={variante} onClick={() => setAbierto(true)}>
        Nueva exploración
      </Button>
      <Modal
        open={abierto}
        onClose={() => setAbierto(false)}
        title="Nueva exploración"
        description="Busca la empresa en el HubSpot de Smarteam por su nombre o su dominio."
        size="lg"
      >
        <div className="space-y-4">
          <Input
            autoFocus
            value={q}
            onChange={(ev) => setQ(ev.target.value)}
            placeholder="Por ejemplo: acme o acme.com"
            aria-label="Nombre o dominio de la empresa"
          />
          {error && <Alert variant="danger">{error}</Alert>}
          {buscando && <p className="text-xs text-fg-muted">Buscando en HubSpot…</p>}
          {empresas && empresas.length === 0 && !buscando && (
            <p className="text-sm text-fg-muted">No hay empresas con ese nombre o dominio en HubSpot.</p>
          )}
          {empresas && empresas.length > 0 && (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {empresas.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => abrir(e)}
                    disabled={abriendo !== null}
                    className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-hover disabled:opacity-60"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-fg">{e.nombre}</span>
                      <span className="block truncate text-xs text-fg-muted">
                        {[e.dominio, e.industria, e.pais].filter(Boolean).join(" · ") || "Sin dominio ni industria en HubSpot"}
                      </span>
                    </span>
                    <span className="flex-shrink-0 pt-0.5">
                      {abriendo === e.id ? (
                        <span className="text-xs text-fg-muted">Abriendo…</span>
                      ) : e.exploracionId ? (
                        <Badge variant="info" size="xs">
                          Ya tiene exploración
                        </Badge>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>
    </>
  );
}
