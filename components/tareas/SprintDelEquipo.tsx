"use client";

/**
 * components/tareas/SprintDelEquipo.tsx — la reunión del sprint de un equipo y quiénes están (ficha A del roadmap,
 * 2026-10-17).
 *
 * En el panel de la Semana del equipo: qué reuniones lee Nexus solas y lo último que leyó. Quien lidera el sprint lo
 * configura en un diálogo: elige la serie de su reunión (una reunión recurrente de su calendario, del equipo), si es
 * planning o cierre, y quiénes están. Desde ahí, cada reunión nueva de esa serie se lee sola cuando termina y propone
 * como mucho 5 tareas por persona.
 *
 * Datos: /api/tareas/fuentes (lib/tareas/fuentes-server.ts). Al montarse le pide a Nexus que mire las series
 * (POST /api/tareas/fuentes/mirar, como mucho cada 10 minutos en el servidor).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Interruptor, Modal, Select } from "@/components/ui";
import { SkeletonText } from "@/components/ui/Skeleton";
import { BotonAzul, BotonBlanco, BotonTexto, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { NOMBRE_DEL_ROL } from "@/lib/tareas/fuentes";
import { MAX_PROPUESTAS_POR_PERSONA_POR_REUNION } from "@/lib/tareas/reglas";
import { diaYHora } from "@/lib/tareas/semana";
import type { FuenteVista, SprintDelEquipoDatos } from "@/lib/tareas/tipos";
import { apiTareas } from "./api";
import { Chip } from "./chips";

type Rol = FuenteVista["rol"];
const ROLES: Rol[] = ["planning", "cierre", "ambos"];

function lineaDeLaUltima(f: FuenteVista): string | null {
  const u = f.ultimas[0];
  if (!u) return null;
  const que =
    u.estado === "lista" || u.estado === "sin_ia"
      ? `${u.propuestas} ${u.propuestas === 1 ? "propuesta" : "propuestas"}${u.porAsignar ? ` y ${u.porAsignar} por asignar` : ""}${u.sinLugar ? ` (${u.sinLugar} quedaron sin proponer)` : ""}`
      : u.estado === "leyendo"
        ? "leyendo"
        : u.estado === "sin_texto"
          ? "todavía sin notas"
          : u.estado === "error"
            ? "no se pudo leer"
            : u.estado;
  return `Última: «${u.titulo}» · ${diaYHora(u.fecha)} · ${que}`;
}

export function SprintDelEquipo({ equipo }: { equipo: string }) {
  const toast = useToast();
  const [datos, setDatos] = useState<SprintDelEquipoDatos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [configurar, setConfigurar] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const d = await apiTareas.sprint(equipo);
      setDatos(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el sprint.");
    }
  }, [equipo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga al montar; el setState llega después del fetch
    void cargar();
    // Que Nexus mire si terminó una reunión de las series (el servidor lo hace como mucho cada 10 minutos).
    apiTareas.mirarSeries().catch(() => undefined);
  }, [cargar]);

  if (error) return <p className="text-[13px] text-fg-muted">{error}</p>;
  if (!datos) return <SkeletonText lines={2} />;

  return (
    <section className="space-y-2" data-recorrido="equipo.sprint">
      <div className="flex items-center justify-between gap-2">
        <p className={ROTULO_DEL_SISTEMA}>La reunión del sprint</p>
        {datos.puedeConfigurar && <BotonTexto onClick={() => setConfigurar(true)}>Configurar</BotonTexto>}
      </div>
      {datos.fuentes.length === 0 ? (
        <p className="text-[13px] text-fg-muted">
          {datos.puedeConfigurar
            ? "Elige la reunión de tu sprint: Nexus la lee sola cuando termina y le propone a cada persona sus tareas."
            : "Quien lidera el sprint todavía no eligió la reunión que Nexus lee."}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {datos.fuentes.map((f) => (
            <li key={f.id} className="rounded-lg border border-line bg-surface px-3 py-2">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className={cn("text-[13px] font-medium", f.activa ? "text-fg" : "text-fg-muted")}>{f.titulo}</span>
                {!f.activa && <Chip tono="ambar">Pausada</Chip>}
              </span>
              <span className="mt-0.5 block text-xs text-fg-muted">
                {f.cuando} · {NOMBRE_DEL_ROL[f.rol]} · {f.personas.length} {f.personas.length === 1 ? "persona" : "personas"}
              </span>
              {!f.activa && f.pausadaMotivo && <span className="mt-0.5 block text-xs text-warn-ink">{f.pausadaMotivo}</span>}
              {lineaDeLaUltima(f) && <span className="mt-0.5 block text-xs text-fg-muted">{lineaDeLaUltima(f)}</span>}
            </li>
          ))}
        </ul>
      )}
      {configurar && (
        <ConfigurarSprint
          datos={datos}
          onCerrar={() => setConfigurar(false)}
          onCambio={(d) => {
            if (d) setDatos(d);
            else void cargar();
          }}
          onError={(m) => toast.error(m)}
        />
      )}
    </section>
  );
}

function ConfigurarSprint({
  datos,
  onCerrar,
  onCambio,
  onError,
}: {
  datos: SprintDelEquipoDatos;
  onCerrar: () => void;
  onCambio: (d?: SprintDelEquipoDatos) => void;
  onError: (mensaje: string) => void;
}) {
  const toast = useToast();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [rolDe, setRolDe] = useState<Record<string, Rol>>({});
  // Quiénes están: los de la primera serie (todas guardan la misma lista) o, sin series, los de su área y quien lidera.
  const inicial = useMemo(() => (datos.fuentes[0] ? datos.fuentes[0].personas.map((p) => p.email) : datos.personasPorDefecto), [datos]);
  const [personas, setPersonas] = useState<Set<string>>(() => new Set(inicial));
  const [busca, setBusca] = useState("");
  const personasCambiaron = useMemo(() => {
    const a = new Set(inicial);
    return a.size !== personas.size || [...personas].some((e) => !a.has(e));
  }, [inicial, personas]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    // Las elegidas primero; después el resto, por nombre.
    return [...datos.personas]
      .filter((p) => !q || p.nombre.toLowerCase().includes(q) || p.email.includes(q))
      .sort((a, b) => Number(personas.has(b.email)) - Number(personas.has(a.email)) || a.nombre.localeCompare(b.nombre, "es"));
  }, [datos.personas, busca, personas]);

  async function conOcupado(clave: string, fn: () => Promise<void>) {
    setOcupado(clave);
    try {
      await fn();
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setOcupado(null);
    }
  }

  const activas = datos.fuentes.filter((f) => f.activa).length;

  return (
    <Modal
      open
      onClose={onCerrar}
      size="lg"
      title={`El sprint de ${datos.nombre}`}
      description={`Nexus lee sola cada reunión de estas series cuando termina, y le propone a cada persona como mucho ${MAX_PROPUESTAS_POR_PERSONA_POR_REUNION} tareas por reunión. Nada entra solo: cada persona decide.`}
      footer={<BotonBlanco onClick={onCerrar}>Listo</BotonBlanco>}
    >
      <div className="space-y-6">
        <section className="space-y-2">
          <p className={ROTULO_DEL_SISTEMA}>Reuniones que lee Nexus</p>
          {datos.fuentes.length === 0 ? (
            <p className="text-[13px] text-fg-muted">Todavía ninguna. Elige abajo la reunión de tu sprint.</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {datos.fuentes.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-fg">{f.titulo}</span>
                    <span className="block text-xs text-fg-muted">
                      {f.cuando} · la lee como {f.dueno.nombre}
                    </span>
                  </span>
                  <Select
                    value={f.rol}
                    aria-label="Qué es la reunión"
                    className="h-8 w-40 py-1 text-[13px]"
                    disabled={ocupado !== null}
                    onChange={(e) => {
                      const rol = e.target.value as Rol;
                      void conOcupado(f.id, async () => {
                        await apiTareas.cambiarSerie(f.id, { rol });
                        onCambio();
                      });
                    }}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {NOMBRE_DEL_ROL[r]}
                      </option>
                    ))}
                  </Select>
                  <Interruptor
                    activo={f.activa}
                    etiqueta={f.activa ? "Pausar la lectura" : "Reanudar la lectura"}
                    texto={f.activa ? "Se lee sola" : "Pausada"}
                    deshabilitado={ocupado !== null}
                    onCambio={(activa) =>
                      void conOcupado(f.id, async () => {
                        await apiTareas.cambiarSerie(f.id, { activa });
                        onCambio();
                      })
                    }
                  />
                  <BotonTexto
                    disabled={ocupado !== null}
                    onClick={() =>
                      void conOcupado(f.id, async () => {
                        await apiTareas.quitarSerie(f.id);
                        toast.success("Nexus dejó de leer esa reunión. Lo que ya leyó queda.");
                        onCambio();
                      })
                    }
                  >
                    Quitar
                  </BotonTexto>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <p className={ROTULO_DEL_SISTEMA}>Sumar la reunión del sprint</p>
          {activas >= datos.maxSeries ? (
            <Alert variant="info">Un sprint lee como mucho {datos.maxSeries} reuniones. Pausa o quita una para sumar otra.</Alert>
          ) : datos.candidatas.length === 0 ? (
            <p className="text-[13px] text-fg-muted">
              No encuentro reuniones del equipo que se repitan en tu calendario de las últimas cinco semanas. Tienen que ser
              recurrentes, solo con gente de Smarteam, y haber pasado por Meet.
            </p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {datos.candidatas.map((c) => {
                const ya = c.yaLaLee === datos.nombre;
                const rol = rolDe[c.sessionId] ?? c.rolSugerido;
                return (
                  <li key={c.sessionId} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-fg">{c.titulo}</span>
                      <span className="block text-xs text-fg-muted">
                        {c.cuando} · {c.participantes} personas · la última fue el {diaYHora(c.inicio)}
                        {c.yaLaLee ? ` · ya la lee ${c.yaLaLee}` : ""}
                      </span>
                    </span>
                    <Select
                      value={rol}
                      aria-label="Qué es la reunión"
                      className="h-8 w-40 py-1 text-[13px]"
                      onChange={(e) => setRolDe((r) => ({ ...r, [c.sessionId]: e.target.value as Rol }))}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {NOMBRE_DEL_ROL[r]}
                        </option>
                      ))}
                    </Select>
                    <BotonAzul
                      disabled={ocupado !== null || ya}
                      title={ya ? "Tu sprint ya la lee" : undefined}
                      onClick={() =>
                        void conOcupado(c.sessionId, async () => {
                          const r = await apiTareas.sumarSerie({ equipo: datos.equipo, sessionId: c.sessionId, rol, personas: [...personas] });
                          toast.success("Listo: Nexus la lee sola cuando termine la próxima.");
                          onCambio(r.sprint);
                        })
                      }
                    >
                      {ocupado === c.sessionId ? "Sumando…" : "Que Nexus la lea"}
                    </BotonAzul>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className={ROTULO_DEL_SISTEMA}>Quiénes están · {personas.size}</p>
            {datos.fuentes.length > 0 && personasCambiaron && (
              <BotonBlanco
                disabled={ocupado !== null}
                onClick={() =>
                  void conOcupado("personas", async () => {
                    for (const f of datos.fuentes) await apiTareas.cambiarSerie(f.id, { personas: [...personas] });
                    toast.success("Guardado: quiénes están en el sprint.");
                    onCambio();
                  })
                }
              >
                Guardar quiénes están
              </BotonBlanco>
            )}
          </div>
          <p className="text-xs text-fg-muted">
            Lo que la reunión le propone a alguien de esta lista queda en tu sprint, aunque sea de otra área. A quien no está
            le llega como un pedido de tu equipo.
          </p>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar a alguien del equipo"
            aria-label="Buscar a alguien del equipo"
            className="h-8 w-full rounded-md border border-line bg-surface px-2.5 text-[13px] text-fg outline-none placeholder:text-fg-muted"
          />
          <ul className="max-h-56 divide-y divide-line overflow-y-auto rounded-md border border-line">
            {filtradas.map((p) => (
              <li key={p.email}>
                <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-[13px] text-fg hover:bg-surface-hover">
                  <input
                    type="checkbox"
                    className="h-[15px] w-[15px] flex-none accent-brand"
                    checked={personas.has(p.email)}
                    onChange={(e) =>
                      setPersonas((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.add(p.email);
                        else n.delete(p.email);
                        return n;
                      })
                    }
                  />
                  <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Modal>
  );
}
