"use client";

/**
 * components/tareas/VinculosDeLaTarea.tsx — «Vinculado», en el cajón de una tarea y en la página de un proyecto
 * (docs/tareas-plan.md §4.4).
 *
 * Registros que acompañan a la tarea (o al proyecto) sin cambiar para quién es: un registro de HubSpot (se pega el
 * enlace de su ficha), una propuesta comercial o una preventa (se buscan por nombre). Vincular no es sincronizar: nada
 * se escribe en HubSpot. El nombre y la etapa de un registro de HubSpot son una FOTO del día en que se vinculó:
 * «Actualizar» la vuelve a leer. Lo que no puedes abrir se ve sin título.
 */
import { useEffect, useState } from "react";
import { BotonBlanco, BotonTexto, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { diaCortoConSemana, horaDeCostaRica } from "@/lib/tareas/semana";
import type { DuenoDelVinculo, RegistroParaVincular, VinculoVista } from "@/lib/tareas/tipos";
import { apiTareas } from "./api";
import { Chip } from "./chips";

const NOMBRE_DEL_TIPO: Record<VinculoVista["tipo"], string> = { hubspot: "HubSpot", propuesta: "Propuesta", preventa: "Preventa" };

export function VinculosDeLaTarea({ tareaId, puedeEditar }: { tareaId: string; puedeEditar: boolean }) {
  return <Vinculos dueno={{ tipo: "tarea", id: tareaId }} puedeEditar={puedeEditar} />;
}

/** Los vínculos de una tarea o de un proyecto. */
export function Vinculos({ dueno, puedeEditar }: { dueno: DuenoDelVinculo; puedeEditar: boolean }) {
  const toast = useToast();
  const [actualizando, setActualizando] = useState<string | null>(null);
  const { tipo: duenoTipo, id: duenoId } = dueno;
  const [vinculos, setVinculos] = useState<VinculoVista[] | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [url, setUrl] = useState("");
  const [q, setQ] = useState("");
  const [encontrados, setEncontrados] = useState<RegistroParaVincular[]>([]);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    apiTareas
      .vinculos(duenoTipo === "tarea" ? { tipo: "tarea", id: duenoId } : { tipo: "proyecto", id: duenoId })
      .then((r) => vivo && setVinculos(r.vinculos))
      .catch(() => vivo && setVinculos([]));
    return () => {
      vivo = false;
    };
  }, [duenoTipo, duenoId]);

  useEffect(() => {
    if (!abierto || q.trim().length < 2) return;
    let vivo = true;
    const id = setTimeout(() => {
      apiTareas
        .registrosParaVincular(q.trim())
        .then((r) => vivo && setEncontrados(r.registros))
        .catch(() => vivo && setEncontrados([]));
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(id);
    };
  }, [q, abierto]);

  async function vincular(body: Parameters<typeof apiTareas.vincular>[1]) {
    setOcupado(true);
    try {
      setVinculos((await apiTareas.vincular(dueno, body)).vinculos);
      setUrl("");
      setQ("");
      setEncontrados([]);
      setAbierto(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo vincular.");
    } finally {
      setOcupado(false);
    }
  }

  async function quitar(v: VinculoVista) {
    try {
      setVinculos((await apiTareas.quitarVinculo(dueno, v.id)).vinculos);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo quitar.");
    }
  }

  async function actualizar(v: VinculoVista) {
    setActualizando(v.id);
    try {
      setVinculos((await apiTareas.actualizarVinculo(v.id)).vinculos);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar.");
    } finally {
      setActualizando(null);
    }
  }

  if (vinculos === null || (vinculos.length === 0 && !puedeEditar)) return null;

  return (
    <div className="space-y-2" data-recorrido="tareas.vinculos">
      <p className={ROTULO_DEL_SISTEMA}>Vinculado</p>
      {vinculos.length === 0 ? (
        <p className="text-xs text-fg-muted">Nada vinculado. Un negocio, un ticket o una propuesta que acompañe a {dueno.tipo === "tarea" ? "esta tarea" : "este proyecto"}.</p>
      ) : (
        <ul className="space-y-1.5">
          {vinculos.map((v) => (
            <li key={v.id} className="flex items-start gap-2 text-[13px]">
              <Chip>{NOMBRE_DEL_TIPO[v.tipo]}</Chip>
              <span className="min-w-0 flex-1">
                {v.etiqueta ? (
                  v.url ? (
                    <a href={v.url} target={v.tipo === "hubspot" ? "_blank" : undefined} rel={v.tipo === "hubspot" ? "noopener noreferrer" : undefined} className="text-fg hover:underline">
                      {v.etiqueta}
                    </a>
                  ) : (
                    <span className="text-fg">{v.etiqueta}</span>
                  )
                ) : (
                  <span className="text-fg-muted">Un registro que no puedes abrir</span>
                )}
                {v.detalle && <span className="block text-xs text-fg-muted">{v.detalle}</span>}
                {v.ausente && <span className="block text-xs text-warn-ink">Ya no está en HubSpot.</span>}
                {v.tipo === "hubspot" && v.etiqueta && (
                  <span className="block text-[11px] text-fg-muted">Así estaba el {diaCortoConSemana(horaDeCostaRica(v.fotoAt).fecha)}</span>
                )}
              </span>
              {v.puedeActualizar && (
                <BotonTexto onClick={() => void actualizar(v)} disabled={actualizando === v.id} title="Vuelve a leer el nombre y la etapa en HubSpot">
                  {actualizando === v.id ? "Leyendo…" : "Actualizar"}
                </BotonTexto>
              )}
              {v.puedeQuitar && <BotonTexto onClick={() => void quitar(v)}>Quitar</BotonTexto>}
            </li>
          ))}
        </ul>
      )}
      {puedeEditar &&
        (abierto ? (
          <div className="space-y-2 rounded-lg border border-line bg-surface-muted p-3">
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && url.trim() && void vincular({ tipo: "hubspot", url: url.trim() })}
                placeholder="Pega el enlace de la ficha en HubSpot"
                aria-label="Enlace de HubSpot"
                className="h-8 min-w-0 flex-1 rounded-md border border-line bg-surface px-2.5 text-[13px] text-fg outline-none placeholder:text-fg-muted"
              />
              <BotonBlanco onClick={() => void vincular({ tipo: "hubspot", url: url.trim() })} disabled={!url.trim() || ocupado}>
                Vincular
              </BotonBlanco>
            </div>
            <p className="text-xs text-fg-muted">Contactos, empresas, negocios, tickets, proyectos y objetos propios. Nada se escribe en HubSpot.</p>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="o busca una propuesta comercial o una preventa"
              aria-label="Buscar una propuesta o una preventa"
              className="h-8 w-full rounded-md border border-line bg-surface px-2.5 text-[13px] text-fg outline-none placeholder:text-fg-muted"
            />
            {q.trim().length >= 2 && (
              <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-md border border-line bg-surface">
                {encontrados.length === 0 ? (
                  <li className="px-2.5 py-2 text-xs text-fg-muted">Nada con ese nombre que puedas abrir.</li>
                ) : (
                  encontrados.map((r) => (
                    <li key={`${r.tipo}:${r.id}`}>
                      <button type="button" disabled={ocupado} onClick={() => void vincular({ tipo: r.tipo, id: r.id })} className="w-full px-2.5 py-1.5 text-left text-[13px] text-fg hover:bg-surface-hover">
                        <span className="text-xs text-fg-muted">{r.tipo === "propuesta" ? "Propuesta" : "Preventa"} · </span>
                        {r.etiqueta}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
            <BotonTexto onClick={() => setAbierto(false)}>Cancelar</BotonTexto>
          </div>
        ) : (
          <BotonTexto onClick={() => setAbierto(true)}>+ Vincular un registro</BotonTexto>
        ))}
    </div>
  );
}
