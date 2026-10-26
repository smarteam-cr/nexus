"use client";

/**
 * components/canvas/ListaDeConstruccion.tsx — de lo planificado a lo construido (L4 etapa 5, 2026-10-27).
 *
 * Una franja plegada arriba de la Planificación: «Lista de construcción · 12 de 40 construidas». Abierta, todo lo que se
 * configura en HubSpot agrupado como va a Tareas, cada cosa con su estado (por construir · construido) y su enlace al
 * recurso en HubSpot; cada grupo con su tarea o el botón para mandarla. Es del equipo: el cliente no la ve ni sale en el
 * PDF. La regla vive en lib/planificacion/construccion.ts; la marca se guarda en la sección de cada cosa.
 *
 * UI interna: primitivas y tokens, tuteo.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Input, Select } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import {
  ESTADOS_DE_CONSTRUCCION,
  avanceDeConstruccion,
  conMarca,
  cosasParaConstruir,
  enlaceValido,
  gruposDeConstruccion,
  type CosaParaConstruir,
  type EstadoDeConstruccion,
} from "@/lib/planificacion/construccion";

interface Seccion {
  id: string;
  key: string;
  hidden: boolean;
  data: unknown;
  cardBlockId: string | null;
}

interface TareaDelGrupo {
  id: string;
  numero: number;
  estado: string;
}

export default function ListaDeConstruccion({
  projectId,
  canvasId,
  secciones,
  onMarcar,
}: {
  projectId: string;
  canvasId: string;
  secciones: Seccion[];
  onMarcar: (sectionId: string, cardBlockId: string | null, data: unknown) => unknown;
}) {
  const [abierta, setAbierta] = useState(false);
  const [tareas, setTareas] = useState<Record<string, TareaDelGrupo | null>>({});
  const [mandando, setMandando] = useState<string | null>(null);
  const toast = useToast();

  const cosas = useMemo(() => cosasParaConstruir(secciones), [secciones]);
  const grupos = useMemo(() => gruposDeConstruccion(cosas), [cosas]);
  const avance = avanceDeConstruccion(cosas);
  const ocultas = new Set(secciones.filter((s) => s.hidden).map((s) => s.key));

  const leerTareas = useCallback(async () => {
    const r = await fetch(`/api/projects/${projectId}/planificacion/construccion?canvasId=${canvasId}`).catch(() => null);
    if (!r?.ok) return;
    const j = (await r.json().catch(() => null)) as { grupos?: Array<{ clave: string; tarea: TareaDelGrupo | null }> } | null;
    setTareas(Object.fromEntries((j?.grupos ?? []).map((g) => [g.clave, g.tarea])));
  }, [projectId, canvasId]);
  useEffect(() => {
    if (abierta) void leerTareas();
  }, [abierta, leerTareas]);

  const marcar = (c: CosaParaConstruir, cambio: { estado?: EstadoDeConstruccion; enlace?: string }) => {
    const s = secciones.find((x) => x.key === c.seccion);
    if (!s) return;
    void onMarcar(s.id, s.cardBlockId, conMarca(s.data, c.clave, cambio, new Date().toISOString()));
  };

  const mandar = async (grupos?: string[]) => {
    setMandando(grupos?.[0] ?? "todo");
    try {
      const r = await fetch(`/api/projects/${projectId}/planificacion/construccion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canvasId, ...(grupos ? { grupos } : {}) }),
      });
      const j = (await r.json().catch(() => null)) as { error?: string; creadas?: Array<{ yaExistia: boolean }> } | null;
      if (!r.ok) {
        toast.error(j?.error ?? "No se pudo mandar a Tareas. Vuelve a intentarlo.");
        return;
      }
      const nuevas = (j?.creadas ?? []).filter((c) => !c.yaExistia).length;
      toast.success(nuevas ? `${nuevas === 1 ? "Quedó una tarea" : `Quedaron ${nuevas} tareas`} en Tareas, para ti y sin semana.` : "Ya estaban en Tareas.");
      await leerTareas();
    } catch {
      toast.error("Error de conexión.");
    } finally {
      setMandando(null);
    }
  };

  if (!cosas.length) return null;
  const sinTarea = grupos.filter((g) => g.construidas < g.cosas.length && !tareas[g.clave]).length;

  return (
    <section className="mx-auto w-full max-w-[960px] px-4 pt-3">
      <div className="rounded-lg border border-line bg-surface">
        <button
          type="button"
          onClick={() => setAbierta((v) => !v)}
          aria-expanded={abierta}
          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-hover"
        >
          <span className={ROTULO_DEL_SISTEMA}>Lista de construcción</span>
          <span className="text-xs text-fg-secondary">
            {avance.construidas} de {avance.total} construidas
          </span>
          <span className="ml-auto text-xs text-fg-muted">{abierta ? "Ocultar" : "Ver la lista"}</span>
        </button>

        {abierta && (
          <div className="space-y-4 border-t border-line px-4 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <p className="flex-1 text-xs text-fg-muted">
                Lo que hay que configurar en HubSpot, sacado de este documento. Marca lo construido y pega el enlace al
                recurso. Solo lo ve el equipo.
              </p>
              {sinTarea > 0 && (
                <Button size="sm" variant="primary" loading={mandando === "todo"} disabled={!!mandando} onClick={() => void mandar()}>
                  Mandar lo pendiente a Tareas
                </Button>
              )}
            </div>

            {grupos.map((g) => {
              const tarea = tareas[g.clave];
              return (
                <div key={g.clave} className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-fg">{g.titulo}</h3>
                    <span className="text-xs text-fg-muted">
                      {g.construidas} de {g.cosas.length}
                    </span>
                    <span className="ml-auto">
                      {tarea ? (
                        <a href={`/tareas?t=${encodeURIComponent(tarea.id)}`} className="text-xs text-brand hover:underline">
                          T-{tarea.numero} · {tarea.estado}
                        </a>
                      ) : (
                        <Button size="xs" variant="secondary" loading={mandando === g.clave} disabled={!!mandando} onClick={() => void mandar([g.clave])}>
                          Mandar a Tareas
                        </Button>
                      )}
                    </span>
                  </div>
                  <ul className="divide-y divide-line rounded-md border border-line">
                    {g.cosas.map((c) => (
                      <FilaDeCosa key={`${c.seccion}|${c.clave}|${c.enlace}`} cosa={c} oculta={ocultas.has(c.seccion)} onMarcar={(cambio) => marcar(c, cambio)} />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function FilaDeCosa({
  cosa,
  oculta,
  onMarcar,
}: {
  cosa: CosaParaConstruir;
  oculta: boolean;
  onMarcar: (cambio: { estado?: EstadoDeConstruccion; enlace?: string }) => void;
}) {
  // El borrador del enlace nace del guardado; si el guardado cambia, la fila se vuelve a montar (su `key` lo lleva).
  const [enlace, setEnlace] = useState(cosa.enlace);
  const valido = enlaceValido(enlace);
  const guardarEnlace = () => {
    if (!valido || enlace.trim() === cosa.enlace) return;
    onMarcar({ enlace: enlace.trim() });
  };
  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2">
      <div className="min-w-[180px] flex-1">
        <p className={cosa.estado === "construido" ? "text-sm text-fg-muted line-through" : "text-sm text-fg"}>{cosa.nombre}</p>
        <p className="text-xs text-fg-muted">
          {cosa.detalle}
          {oculta ? " · su sección está oculta para el cliente" : ""}
        </p>
      </div>
      <Select
        aria-label={`Estado de ${cosa.nombre}`}
        value={cosa.estado}
        onChange={(e) => onMarcar({ estado: e.target.value as EstadoDeConstruccion })}
        className="w-36"
      >
        {ESTADOS_DE_CONSTRUCCION.map((e) => (
          <option key={e.value} value={e.value}>
            {e.label}
          </option>
        ))}
      </Select>
      <div className="flex w-full items-center gap-2 sm:w-72">
        <Input
          aria-label={`Enlace en HubSpot de ${cosa.nombre}`}
          placeholder="Enlace en HubSpot"
          value={enlace}
          onChange={(e) => setEnlace(e.target.value)}
          onBlur={guardarEnlace}
          onKeyDown={(e) => {
            if (e.key === "Enter") guardarEnlace();
          }}
          className={valido ? undefined : "border-red-500/60"}
        />
        {cosa.enlace && enlaceValido(cosa.enlace) && (
          <a href={cosa.enlace} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs text-brand hover:underline">
            Abrir
          </a>
        )}
      </div>
    </li>
  );
}
