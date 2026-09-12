"use client";

/**
 * components/documentacion/BuscadorDocs.tsx — el buscador de la base (Ctrl+K).
 *
 * Una base de conocimiento se usa buscando, no navegando: el árbol sirve cuando ya sabés dónde
 * está algo. Busca en el título y en el texto de cada página, sin tildes ni mayúsculas, y muestra
 * dónde está cada resultado (su ruta) y el pedazo donde coincide.
 *
 * ⚠ Ctrl+K dentro del editor con texto seleccionado es «crear enlace» de BlockNote, y se respeta:
 * robarle ese atajo rompería una función del editor para ganar una que ya tiene su botón.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/api/fetch-json";
import { Modal, Spinner } from "@/components/ui";
import { cn } from "@/lib/cn";

interface Resultado {
  id: string;
  slug: string;
  titulo: string;
  icono: string | null;
  fragmento: string | null;
  ruta: string[];
}

const ESPERA_MS = 200;

export default function BuscadorDocs({ abierto, onCambiar }: { abierto: boolean; onCambiar: (v: boolean) => void }) {
  const router = useRouter();
  const [consulta, setConsulta] = useState("");
  const [resultados, setResultados] = useState<Resultado[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [activo, setActivo] = useState(0);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* El atajo global. Se monta una vez por pantalla de Documentación (lo hace el layout). */
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "k" || !(e.ctrlKey || e.metaKey)) return;
      const enEditor = document.activeElement?.closest(".bn-editor");
      const conSeleccion = !window.getSelection()?.isCollapsed;
      if (enEditor && conSeleccion) return; // es «crear enlace» de BlockNote
      e.preventDefault();
      onCambiar(true);
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [onCambiar]);

  useEffect(() => {
    if (!abierto) {
      setConsulta("");
      setResultados(null);
      setActivo(0);
    }
  }, [abierto]);

  const buscar = useCallback((texto: string) => {
    if (reloj.current) clearTimeout(reloj.current);
    if (texto.trim().length < 2) {
      setResultados(null);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    reloj.current = setTimeout(async () => {
      try {
        const r = await fetchJson<{ resultados: Resultado[] }>(
          `/api/documentacion/buscar?q=${encodeURIComponent(texto)}`,
        );
        setResultados(r.resultados);
        setActivo(0);
      } catch {
        setResultados([]);
      } finally {
        setBuscando(false);
      }
    }, ESPERA_MS);
  }, []);

  const abrir = (r: Resultado) => {
    onCambiar(false);
    router.push(`/documentacion/${r.slug}`);
  };

  return (
    <Modal open={abierto} onClose={() => onCambiar(false)} size="lg" title="Buscar en la documentación">
      <input
        autoFocus
        value={consulta}
        placeholder="Escribí al menos dos letras…"
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted"
        onChange={(e) => {
          setConsulta(e.target.value);
          buscar(e.target.value);
        }}
        onKeyDown={(e) => {
          if (!resultados || resultados.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActivo((i) => (i + 1) % resultados.length);
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActivo((i) => (i - 1 + resultados.length) % resultados.length);
          }
          if (e.key === "Enter") {
            e.preventDefault();
            const elegido = resultados[activo];
            if (elegido) abrir(elegido);
          }
        }}
      />

      <div className="mt-3 max-h-[50vh] overflow-y-auto">
        {buscando && (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        )}

        {!buscando && resultados !== null && resultados.length === 0 && (
          <p className="py-6 text-center text-sm text-fg-muted">
            Nada coincide con «{consulta}».
          </p>
        )}

        {!buscando && resultados !== null && resultados.length > 0 && (
          <ul className="space-y-1">
            {resultados.map((r, i) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => abrir(r)}
                  onMouseEnter={() => setActivo(i)}
                  className={cn(
                    "w-full rounded-lg px-3 py-2 text-left transition-colors",
                    i === activo ? "bg-surface-active" : "hover:bg-surface-hover",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span aria-hidden="true">{r.icono ?? "📄"}</span>
                    <span className="truncate text-sm font-medium text-fg">{r.titulo}</span>
                    {r.ruta.length > 0 && (
                      <span className="truncate text-2xs text-fg-muted">en {r.ruta.join(" › ")}</span>
                    )}
                  </div>
                  {r.fragmento && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-fg-secondary">{r.fragmento}</p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {resultados === null && !buscando && (
          <p className="py-6 text-center text-xs text-fg-muted">
            Busca por título y por texto — también encuentra lo que se arma solo desde Nexus.
          </p>
        )}
      </div>
    </Modal>
  );
}
