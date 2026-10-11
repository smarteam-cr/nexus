"use client";

/**
 * components/tareas/DependenciasDeLaTarea.tsx — «Esperando a» y «La esperan», en el cajón de una tarea (docs/tareas-plan.md
 * §5.7). Mientras una que la bloquea esté abierta, la tarea espera; cuando queda hecha, a su responsable le llega el
 * aviso. Se agrega con «+ Esperar a…», buscando entre las tareas que ves (por texto o T-#). Una que no ves sale sin
 * título. Si la que espera pasó a una semana posterior, lo dice sin mover nada.
 */
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BotonTexto, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { rangoDeLaSemana } from "@/lib/tareas/semana";
import type { RelacionVista, TareaVista } from "@/lib/tareas/tipos";
import { apiTareas } from "./api";
import { Chip } from "./chips";

export function DependenciasDeLaTarea({ t, puedeEditar, onCambio }: { t: TareaVista; puedeEditar: boolean; onCambio: (t: TareaVista) => void }) {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [buscando, setBuscando] = useState(false);
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<TareaVista[]>([]);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!buscando || q.trim().length < 2) return;
    let vivo = true;
    const id = setTimeout(() => {
      apiTareas
        .buscar(q.trim())
        .then((r) => vivo && setResultados(r.tareas.filter((x) => x.id !== t.id && !t.esperando.some((e) => e.id === x.id))))
        .catch(() => vivo && setResultados([]));
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(id);
    };
  }, [q, buscando, t.id, t.esperando]);

  function abrir(id: string) {
    const p = new URLSearchParams(params.toString());
    p.set("t", id);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  }

  async function esperar(otra: TareaVista) {
    setOcupado(true);
    try {
      const r = await apiTareas.esperarA(t.id, otra.id);
      onCambio(r.tarea);
      setBuscando(false);
      setQ("");
      setResultados([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setOcupado(false);
    }
  }

  async function quitar(r: RelacionVista) {
    setOcupado(true);
    try {
      onCambio((await apiTareas.dejarDeEsperar(t.id, r.id)).tarea);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo quitar.");
    } finally {
      setOcupado(false);
    }
  }

  if (!t.esperando.length && !t.laEsperan.length && !puedeEditar) return null;

  const fila = (r: RelacionVista, conQuitar: boolean) => (
    <li key={r.id} className="flex items-start gap-2 text-[13px]">
      <button type="button" onClick={() => abrir(r.id)} className="min-w-0 flex-1 text-left text-fg hover:underline">
        <span className="tabular-nums text-fg-muted">T-{r.numero}</span> {r.titulo ?? "Una tarea que no ves"}
        {r.abierta && t.semana && r.semana && r.semana > t.semana && (
          <span className="block text-xs text-warn-ink">Pasó a la semana del {rangoDeLaSemana(r.semana)}: esta todavía la espera.</span>
        )}
      </button>
      <Chip tono={r.abierta ? "ambar" : "verde"}>{r.abierta ? "Abierta" : "Hecha"}</Chip>
      {conQuitar && puedeEditar && (
        <BotonTexto onClick={() => void quitar(r)} disabled={ocupado}>
          Quitar
        </BotonTexto>
      )}
    </li>
  );

  return (
    <div className="space-y-2" data-recorrido="tareas.dependencias">
      <p className={ROTULO_DEL_SISTEMA}>Esperando a</p>
      {t.esperando.length ? <ul className="space-y-1.5">{t.esperando.map((r) => fila(r, true))}</ul> : <p className="text-xs text-fg-muted">No espera a ninguna tarea.</p>}
      {puedeEditar &&
        (buscando ? (
          <div className="space-y-1.5">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setBuscando(false);
                }
              }}
              placeholder="Busca por texto o T-#"
              aria-label="Buscar la tarea que espera"
              className="h-8 w-full rounded-md border border-line bg-surface px-2.5 text-[13px] text-fg outline-none placeholder:text-fg-muted"
            />
            {q.trim().length >= 2 && (
              <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-md border border-line bg-surface">
                {resultados.length === 0 ? (
                  <li className="px-2.5 py-2 text-xs text-fg-muted">Ninguna tarea con eso.</li>
                ) : (
                  resultados.slice(0, 8).map((x) => (
                    <li key={x.id}>
                      <button type="button" disabled={ocupado} onClick={() => void esperar(x)} className="w-full px-2.5 py-1.5 text-left text-[13px] text-fg hover:bg-surface-hover">
                        <span className="tabular-nums text-fg-muted">T-{x.numero}</span> {x.titulo}
                        {x.responsable && <span className="text-xs text-fg-muted"> · {x.responsable.nombre}</span>}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
            <BotonTexto onClick={() => setBuscando(false)}>Cancelar</BotonTexto>
          </div>
        ) : (
          <BotonTexto onClick={() => setBuscando(true)}>+ Esperar a…</BotonTexto>
        ))}
      {t.laEsperan.length > 0 && (
        <>
          <p className={ROTULO_DEL_SISTEMA}>La esperan</p>
          <ul className="space-y-1.5">{t.laEsperan.map((r) => fila(r, false))}</ul>
        </>
      )}
    </div>
  );
}
