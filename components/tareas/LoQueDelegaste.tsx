"use client";

/**
 * components/tareas/LoQueDelegaste.tsx — «Lo que delegaste» (Elías, 2026-10-09): lo que le pediste o asignaste a otras
 * personas, de tu equipo o de otros, y cómo va.
 *
 * Primero lo que pide atención (lo atrasado), después lo que la otra persona todavía no decide, lo que está en curso y
 * lo pendiente; al final, plegado, lo que se cerró en los últimos 30 días con su motivo. Cada fila dice quién la tiene,
 * para cuándo, su contexto y lo último que pasó. Se filtra por alcance (tu equipo u otros) y por persona. La tarea
 * abierta va en `?t=` y se abre en el mismo cajón de siempre.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EmptyState, PageHeader, Segmentado, Select } from "@/components/ui";
import { BotonBlanco, BotonTexto, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { estaAbierta } from "@/lib/tareas/estados";
import { diaCortoConSemana, diaYHora, rangoDeLaSemana } from "@/lib/tareas/semana";
import type { LoQueDelegasteDatos, MovimientoDeTarea, OpcionesDeTareas, TareaVista } from "@/lib/tareas/tipos";
import { apiTareas, EVENTO_TAREAS_CAMBIARON } from "./api";
import { Chip, ChipDeEstadoDelPedido } from "./chips";
import { CajonDeTarea } from "./CajonDeTarea";
import { Agendar } from "./Agendar";
import { BotonDelAsistente } from "./AsistenteDeTareas";

type Alcance = "todas" | "mi_equipo" | "otros";
type Grupo = "atrasadas" | "sinDecidir" | "enCurso" | "pendientes" | "cerradas";

const GRUPOS: { clave: Grupo; titulo: string; vacio?: string }[] = [
  { clave: "atrasadas", titulo: "Atrasadas" },
  { clave: "sinDecidir", titulo: "Todavía no deciden" },
  { clave: "enCurso", titulo: "En curso" },
  { clave: "pendientes", titulo: "Pendientes" },
  { clave: "cerradas", titulo: "Cerradas en los últimos 30 días" },
];

/** En qué grupo va: lo atrasado primero, aunque esté en curso. */
export function grupoDe(t: TareaVista, lunesDeHoy: string): Grupo {
  if (t.estado === "propuesta") return "sinDecidir";
  if (!estaAbierta(t.estado)) return "cerradas";
  if (t.atrasada || (!!t.semana && t.semana < lunesDeHoy)) return "atrasadas";
  return t.estado === "en_curso" ? "enCurso" : "pendientes";
}

/** El equipo de quien la tiene (o el del sprint, si nadie la tomó). */
const equipoDe = (t: TareaVista) => t.responsable?.equipo ?? t.equipo;

/** «Lidia Flores · Marketing» · «Por asignar en Ventas». */
function quienLaTiene(t: TareaVista): string {
  if (t.responsable) return `${t.responsable.nombre}${t.equipoNombre ? ` · ${t.equipoNombre}` : ""}`;
  return `Por asignar${t.equipoNombre ? ` en ${t.equipoNombre}` : ""}`;
}

/** «Semana del 12 al 16 oct» · «Más adelante» · y la fecha límite, si hay. */
function paraCuando(t: TareaVista): string | null {
  const partes: string[] = [];
  if (t.semana) partes.push(`Semana del ${rangoDeLaSemana(t.semana)}`);
  else if (estaAbierta(t.estado)) partes.push("Más adelante");
  if (t.venceEl) partes.push(`vence ${diaCortoConSemana(t.venceEl)}`);
  return partes.length ? partes.join(" · ") : null;
}

/** «Lidia: cambió el estado a en curso · vie 9 oct · 10:30». */
function textoDelMovimiento(m: MovimientoDeTarea): string {
  const texto = m.texto.charAt(0).toLowerCase() + m.texto.slice(1);
  return `${m.quien}: ${texto}${m.detalle ? ` (${m.detalle})` : ""} · ${diaYHora(m.cuando)}`;
}

export default function LoQueDelegaste({ inicial }: { inicial: LoQueDelegasteDatos }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();
  const [datos, setDatos] = useState(inicial);
  const [opciones, setOpciones] = useState<OpcionesDeTareas | null>(null);
  const [alcance, setAlcance] = useState<Alcance>("todas");
  const [persona, setPersona] = useState("");
  const [agendar, setAgendar] = useState<TareaVista[] | null>(null);
  const [ocupada, setOcupada] = useState<string | null>(null);

  useEffect(() => {
    apiTareas.opciones().then(setOpciones).catch(() => undefined);
  }, []);

  const tareaAbierta = params.get("t");
  const ponerParametro = useCallback(
    (clave: string, valor: string | null) => {
      const p = new URLSearchParams(params.toString());
      if (valor) p.set(clave, valor);
      else p.delete(clave);
      const q = p.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const refrescar = useCallback(async () => {
    try {
      setDatos(await apiTareas.delegadas());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar.");
    }
  }, [toast]);

  // Lo que cambia en otra pantalla (el chat, «+ Tarea») se ve acá sin recargar.
  useEffect(() => {
    const alCambiar = () => void refrescar();
    window.addEventListener(EVENTO_TAREAS_CAMBIARON, alCambiar);
    return () => window.removeEventListener(EVENTO_TAREAS_CAMBIARON, alCambiar);
  }, [refrescar]);

  async function retirar(t: TareaVista) {
    setOcupada(t.id);
    try {
      await apiTareas.decidir(t.id, t.version, { tipo: "retirar" });
      toast.success("Retiraste el pedido.");
      await refrescar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo retirar.");
    } finally {
      setOcupada(null);
    }
  }

  async function decidir(t: TareaVista, usarClienteSugerido: boolean) {
    try {
      await apiTareas.decidir(t.id, t.version, { tipo: "usar", usarClienteSugerido });
      ponerParametro("t", null);
      await refrescar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo decidir.");
    }
  }

  /** Las personas (y los equipos sin responsable) a las que les pediste algo, para el filtro. */
  const personas = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of datos.tareas) {
      if (t.responsable) m.set(t.responsable.email, t.responsable.nombre);
      else if (t.equipo) m.set(`equipo:${t.equipo}`, `Por asignar en ${t.equipoNombre ?? t.equipo}`);
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [datos.tareas]);

  const visibles = useMemo(
    () =>
      datos.tareas.filter((t) => {
        if (alcance === "mi_equipo" && equipoDe(t) !== datos.yo.equipo) return false;
        if (alcance === "otros" && equipoDe(t) === datos.yo.equipo) return false;
        if (persona && (t.responsable ? t.responsable.email !== persona : `equipo:${t.equipo}` !== persona)) return false;
        return true;
      }),
    [datos.tareas, datos.yo.equipo, alcance, persona],
  );

  const porGrupo = useMemo(() => {
    const g: Record<Grupo, TareaVista[]> = { atrasadas: [], sinDecidir: [], enCurso: [], pendientes: [], cerradas: [] };
    for (const t of visibles) g[grupoDe(t, datos.lunesDeHoy)].push(t);
    // Lo atrasado, de lo más viejo a lo más nuevo: es lo primero que hay que destrabar.
    g.atrasadas.sort((a, b) => (a.venceEl ?? a.semana ?? "").localeCompare(b.venceEl ?? b.semana ?? ""));
    return g;
  }, [visibles, datos.lunesDeHoy]);

  const abiertas = visibles.length - porGrupo.cerradas.length;

  return (
    <div className={cn(SHELL_DEFAULT, "space-y-5 pb-12")}>
      <PageHeader
        title="Lo que delegaste"
        description="Lo que le pediste o asignaste a otras personas, de tu equipo o de otros, y cómo va."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <BotonBlanco onClick={() => router.push("/tareas")}>Mis tareas</BotonBlanco>
            <BotonDelAsistente />
          </div>
        }
      />

      {datos.tareas.length === 0 ? (
        <EmptyState
          title="Todavía no delegaste nada"
          description="Cuando le pidas algo a otra persona o a otro equipo —con «+ Tarea», desde el chat o al leer una reunión— lo vas a ver acá, con cómo va."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Segmentado<Alcance>
              etiqueta="De qué equipo"
              valor={alcance}
              onCambio={setAlcance}
              opciones={[
                { clave: "todas", etiqueta: "Todas" },
                { clave: "mi_equipo", etiqueta: "Tu equipo" },
                { clave: "otros", etiqueta: "Otros equipos" },
              ]}
            />
            {personas.length > 1 && (
              <label className="flex items-center gap-2 text-xs text-fg-muted">
                Persona
                <Select value={persona} onChange={(e) => setPersona(e.target.value)} className="h-8 w-56 py-1 text-[13px]" aria-label="Persona">
                  <option value="">Todas las personas</option>
                  {personas.map(([valor, nombre]) => (
                    <option key={valor} value={valor}>
                      {nombre}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            <span className="text-xs tabular-nums text-fg-muted">
              {abiertas === 1 ? "1 abierta" : `${abiertas} abiertas`}
              {porGrupo.atrasadas.length ? ` · ${porGrupo.atrasadas.length === 1 ? "1 atrasada" : `${porGrupo.atrasadas.length} atrasadas`}` : ""}
            </span>
          </div>

          {visibles.length === 0 ? (
            <p className="text-[13px] text-fg-muted">Nada con ese filtro.</p>
          ) : (
            GRUPOS.map((g) =>
              porGrupo[g.clave].length === 0 ? null : (
                <GrupoDeLoDelegado key={g.clave} titulo={g.titulo} tareas={porGrupo[g.clave]} plegado={g.clave === "cerradas"} alerta={g.clave === "atrasadas"}>
                  {porGrupo[g.clave].map((t) => (
                    <FilaDeLoDelegado
                      key={t.id}
                      t={t}
                      movimiento={datos.movimientos[t.id] ?? null}
                      lunesDeHoy={datos.lunesDeHoy}
                      ocupada={ocupada === t.id}
                      onAbrir={() => ponerParametro("t", t.id)}
                      onRetirar={() => void retirar(t)}
                    />
                  ))}
                </GrupoDeLoDelegado>
              ),
            )
          )}
        </>
      )}

      <CajonDeTarea
        id={tareaAbierta}
        lunesDeHoy={datos.lunesDeHoy}
        opciones={opciones}
        onCerrar={() => ponerParametro("t", null)}
        onCambio={() => void refrescar()}
        onAgendar={(t) => setAgendar([t])}
        onDecidir={(t, usarClienteSugerido) => void decidir(t, usarClienteSugerido)}
      />
      {agendar && (
        <Agendar
          tareas={agendar}
          onCerrar={() => {
            setAgendar(null);
            void refrescar();
          }}
        />
      )}
    </div>
  );
}

function GrupoDeLoDelegado({ titulo, tareas, plegado, alerta, children }: { titulo: string; tareas: TareaVista[]; plegado: boolean; alerta: boolean; children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(!plegado);
  return (
    <section className="rounded-xl border border-line bg-surface">
      <button type="button" aria-expanded={abierto} onClick={() => setAbierto((x) => !x)} className="flex w-full items-center gap-2 border-b border-line px-4 py-2.5 text-left">
        <svg viewBox="0 0 24 24" className={cn("h-3.5 w-3.5 text-fg-muted transition-transform", abierto && "rotate-90")} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
        <span className={cn(ROTULO_DEL_SISTEMA, alerta && "text-danger-ink")}>{titulo}</span>
        <span className="text-xs tabular-nums text-fg-muted">{tareas.length}</span>
      </button>
      {abierto && <ul className="divide-y divide-line">{children}</ul>}
    </section>
  );
}

function FilaDeLoDelegado({
  t,
  movimiento,
  lunesDeHoy,
  ocupada,
  onAbrir,
  onRetirar,
}: {
  t: TareaVista;
  movimiento: MovimientoDeTarea | null;
  lunesDeHoy: string;
  ocupada: boolean;
  onAbrir: () => void;
  onRetirar: () => void;
}) {
  const cuando = paraCuando(t);
  const atrasada = grupoDe(t, lunesDeHoy) === "atrasadas";
  const cerrada = !estaAbierta(t.estado) && t.estado !== "propuesta";
  return (
    <li className={cn("flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-hover", ocupada && "opacity-60")}>
      <button type="button" onClick={onAbrir} className="min-w-0 flex-1 text-left">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className={cn("text-sm text-fg", t.estado === "hecha" && "text-fg-muted line-through decoration-line")}>{t.titulo}</span>
          <span className="text-[11px] tabular-nums text-fg-muted">T-{t.numero}</span>
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-fg-secondary">
          <span>{quienLaTiene(t)}</span>
          <ChipDeEstadoDelPedido t={t} />
          {atrasada && <Chip tono="rojo">Atrasada</Chip>}
          {cuando && <span className="text-fg-muted">{cuando}</span>}
          {t.cliente && <Chip>{t.cliente.nombre}</Chip>}
        </span>
        {t.contexto && <span className="mt-1 block line-clamp-2 text-[12.5px] leading-snug text-fg-secondary">{t.contexto}</span>}
        {cerrada && t.motivo && <span className="mt-1 block text-xs text-fg-muted">Motivo: «{t.motivo}»</span>}
        {movimiento && <span className="mt-1 block text-xs text-fg-muted">{textoDelMovimiento(movimiento)}</span>}
      </button>
      {t.acciones.retirar && (
        <BotonTexto disabled={ocupada} onClick={onRetirar}>
          Retirar el pedido
        </BotonTexto>
      )}
    </li>
  );
}
