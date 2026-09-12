"use client";

/**
 * components/documentacion/PapeleraDocs.tsx — lo archivado, y cómo devolverlo.
 *
 * En esta base nada se borra: archivar manda la página y sus subpáginas a la papelera con un mismo
 * LOTE, y restaurar devuelve ese grupo entero. Por eso la lista se agrupa por lote y no por página
 * suelta: devolver solo la madre dejaría a las hijas invisibles acá adentro.
 *
 * Ver la papelera es de todo el equipo; devolver algo al árbol es del liderazgo.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchJson } from "@/lib/api/fetch-json";
import { Modal, Spinner, useToast } from "@/components/ui";

interface PaginaArchivada {
  id: string;
  slug: string;
  titulo: string;
  icono: string | null;
  archivadaAt: string;
  archivadaLote: string | null;
  editadaPorEmail: string | null;
}

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CR", { day: "2-digit", month: "short", year: "numeric" });

export default function PapeleraDocs({
  abierta,
  puedeRestaurar,
  onCerrar,
}: {
  abierta: boolean;
  puedeRestaurar: boolean;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [paginas, setPaginas] = useState<PaginaArchivada[] | null>(null);
  const [restaurando, setRestaurando] = useState<string | null>(null);

  useEffect(() => {
    if (!abierta) return;
    let vivo = true;
    setPaginas(null);
    fetchJson<{ paginas: PaginaArchivada[] }>("/api/documentacion/papelera")
      .then((r) => vivo && setPaginas(r.paginas))
      .catch(() => vivo && setPaginas([]));
    return () => {
      vivo = false;
    };
  }, [abierta]);

  const restaurar = async (lote: string) => {
    setRestaurando(lote);
    try {
      const r = await fetchJson<{ cuantas: number }>("/api/documentacion/papelera/restaurar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lote }),
      });
      toast.success(r.cuantas === 1 ? "Página restaurada." : `${r.cuantas} páginas restauradas.`);
      setPaginas((previas) => (previas ?? []).filter((p) => p.archivadaLote !== lote));
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo restaurar.");
    } finally {
      setRestaurando(null);
    }
  };

  /* Un grupo por lote; las archivadas antes de que existieran los lotes caen en su propio grupo. */
  const grupos = new Map<string, PaginaArchivada[]>();
  for (const p of paginas ?? []) {
    const clave = p.archivadaLote ?? `sola:${p.id}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), p]);
  }

  return (
    <Modal
      open={abierta}
      onClose={onCerrar}
      size="lg"
      title="Papelera"
      description="Acá esperan las páginas archivadas. Nada se borra definitivamente."
    >
      {paginas === null ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : grupos.size === 0 ? (
        <p className="py-8 text-center text-sm text-fg-muted">La papelera está vacía.</p>
      ) : (
        <ul className="max-h-[55vh] space-y-2 overflow-y-auto">
          {[...grupos.entries()].map(([lote, delGrupo]) => (
            <li
              key={lote}
              className="flex items-start gap-3 rounded-lg border border-line bg-surface p-3"
            >
              <div className="min-w-0 flex-1">
                {delGrupo.map((p) => (
                  <p key={p.id} className="truncate text-sm text-fg">
                    <span aria-hidden="true">{p.icono ?? "📄"}</span> {p.titulo}
                  </p>
                ))}
                <p className="mt-1 text-2xs text-fg-muted">
                  Archivada el {fecha(delGrupo[0].archivadaAt)}
                  {delGrupo[0].editadaPorEmail ? ` por ${delGrupo[0].editadaPorEmail}` : ""}
                  {delGrupo.length > 1 ? ` · ${delGrupo.length} páginas` : ""}
                </p>
              </div>
              {puedeRestaurar && delGrupo[0].archivadaLote && (
                <button
                  type="button"
                  onClick={() => void restaurar(delGrupo[0].archivadaLote as string)}
                  disabled={restaurando !== null}
                  className="shrink-0 rounded-md border border-line px-2 py-1 text-2xs text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-50"
                >
                  {restaurando === delGrupo[0].archivadaLote ? "Restaurando…" : "Restaurar"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
