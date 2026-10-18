"use client";

/**
 * components/tareas/TareasDeLaCuenta.tsx — la ficha del cliente › La cuenta › Tareas (ficha A del roadmap, 2026-10-17).
 *
 * Todo lo que Smarteam tiene que hacer con esta empresa, de cualquier equipo, agrupado por equipo: qué es, para cuándo,
 * de quién y de dónde viene (una reunión con el cliente, el sprint interno, HubSpot o a mano). Arriba de cada equipo lo
 * que espera una decisión; al final, plegado, lo hecho en los últimos 30 días. Cada tarea se abre en el mismo cajón de
 * Tareas, sin salir de la ficha.
 *
 * Datos: GET /api/tareas/del-cliente/[clientId] (lib/tareas/consultas.ts › cargarTareasDeLaCuenta), con la regla de
 * visibilidad de todas las listas: nunca lo «Solo para mí» de otros. Arriba, «Próximas reuniones» (fase 2.2): las de los
 * próximos 8 días con quién de Smarteam va (./ProximasReunionesDeLaCuenta.tsx).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, EmptyState, Segmentado } from "@/components/ui";
import { SkeletonPanel, SkeletonText } from "@/components/ui/Skeleton";
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { agruparPorEquipo, paraCuando, type GrupoDeLaCuenta } from "@/lib/tareas/de-la-cuenta";
import { ORDEN_DE_ORIGEN, etiquetaDeOrigen, type ClaveDeOrigen } from "@/lib/tareas/origen";
import { diaCortoConSemana, lunesDeHoy as calcularLunesDeHoy, rangoDeLaSemana } from "@/lib/tareas/semana";
import type { OpcionesDeTareas, TareasDeLaCuentaDatos, TareaVista } from "@/lib/tareas/tipos";
import { apiTareas, EVENTO_TAREAS_CAMBIARON } from "./api";
import { Chip } from "./chips";
import { CajonDeTarea } from "./CajonDeTarea";
import { Agendar } from "./Agendar";
import ProximasReunionesDeLaCuenta from "./ProximasReunionesDeLaCuenta";

type FiltroDeOrigen = "todas" | ClaveDeOrigen;

export default function TareasDeLaCuenta({ clientId }: { clientId: string }) {
  const toast = useToast();
  const [datos, setDatos] = useState<TareasDeLaCuentaDatos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opciones, setOpciones] = useState<OpcionesDeTareas | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [agendar, setAgendar] = useState<TareaVista[] | null>(null);
  const [origen, setOrigen] = useState<FiltroDeOrigen>("todas");

  const cargar = useCallback(async () => {
    try {
      const d = await apiTareas.deLaCuenta(clientId);
      setDatos(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las tareas.");
    }
  }, [clientId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga al montar; el setState llega después del fetch
    void cargar();
    apiTareas.opciones(clientId).then(setOpciones).catch(() => undefined);
  }, [cargar, clientId]);

  // Lo que cambia en otra parte (el chat, «Nueva tarea») se ve acá sin recargar.
  useEffect(() => {
    const alCambiar = () => void cargar();
    window.addEventListener(EVENTO_TAREAS_CAMBIARON, alCambiar);
    return () => window.removeEventListener(EVENTO_TAREAS_CAMBIARON, alCambiar);
  }, [cargar]);

  async function decidir(t: TareaVista, usarClienteSugerido: boolean) {
    try {
      await apiTareas.decidir(t.id, t.version, { tipo: "usar", usarClienteSugerido });
      setAbierta(null);
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo decidir.");
    }
  }

  /** Los orígenes que hay, en su orden, para el filtro. */
  const origenes = useMemo(() => {
    const hay = new Set((datos?.tareas ?? []).map((t) => t.de.clave));
    return ORDEN_DE_ORIGEN.filter((c) => hay.has(c));
  }, [datos]);

  const grupos = useMemo(() => agruparPorEquipo((datos?.tareas ?? []).filter((t) => origen === "todas" || t.de.clave === origen)), [datos, origen]);

  const encabezado = (
    <div>
      <h2 className="text-[22px] font-bold leading-tight text-fg">Tareas</h2>
      <p className="mt-1 max-w-3xl text-[13px] text-fg-muted">
        Lo que Smarteam tiene que hacer con esta cuenta, de cualquier equipo: qué es, para cuándo, de quién y de dónde viene.
        Lo «Solo para mí» de otras personas no aparece.
      </p>
    </div>
  );

  if (error) {
    return (
      <div className="space-y-6 px-8 pb-10 pt-6">
        {encabezado}
        <Alert variant="danger">{error}</Alert>
      </div>
    );
  }
  if (!datos) {
    return (
      <div className="space-y-6 px-8 pb-10 pt-6" aria-busy="true">
        {encabezado}
        <SkeletonPanel minH="min-h-[220px]">
          <SkeletonText lines={5} />
        </SkeletonPanel>
        <SkeletonPanel minH="min-h-[160px]">
          <SkeletonText lines={4} />
        </SkeletonPanel>
      </div>
    );
  }

  const lunesDeHoy = calcularLunesDeHoy();
  const abiertas = datos.tareas.filter((t) => t.estado === "pendiente" || t.estado === "en_curso").length;
  const porDecidir = datos.tareas.filter((t) => t.estado === "propuesta").length;
  const atrasadas = datos.tareas.filter((t) => (t.estado === "pendiente" || t.estado === "en_curso") && t.atrasada).length;

  return (
    <div className="space-y-6 px-8 pb-10 pt-6">
      {encabezado}
      <ProximasReunionesDeLaCuenta clientId={clientId} />

      {datos.tareas.length === 0 ? (
        <EmptyState
          title="Sin tareas con esta cuenta"
          description="Cuando alguien anote una tarea para este cliente, o Nexus la proponga de una reunión, aparece acá con su equipo y de dónde viene."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <p className="text-[13px] text-fg-secondary">
              <span className="font-semibold text-fg">{abiertas}</span> abiertas
              {porDecidir > 0 && (
                <>
                  {" · "}
                  <span className="font-semibold text-fg">{porDecidir}</span> por decidir
                </>
              )}
              {atrasadas > 0 && (
                <>
                  {" · "}
                  <span className="font-semibold text-danger-ink">{atrasadas}</span> atrasadas
                </>
              )}
            </p>
            {origenes.length > 1 && (
              <Segmentado<FiltroDeOrigen>
                etiqueta="De dónde viene"
                valor={origen}
                onCambio={setOrigen}
                opciones={[{ clave: "todas", etiqueta: "Todas" }, ...origenes.map((c) => ({ clave: c, etiqueta: etiquetaDeOrigen(c) }))]}
              />
            )}
          </div>

          {datos.recortadas && <Alert variant="warning">Son muchas: se muestran las 300 que vencen antes.</Alert>}

          {grupos.length === 0 ? (
            <p className="text-[13px] text-fg-muted">Ninguna tarea viene de ahí.</p>
          ) : (
            grupos.map((g) => <GrupoDeEquipo key={g.clave ?? "sin"} g={g} hechasDesde={datos.hechasDesde} onAbrir={(t) => setAbierta(t.id)} />)
          )}
        </>
      )}

      <CajonDeTarea
        id={abierta}
        lunesDeHoy={lunesDeHoy}
        opciones={opciones}
        onCerrar={() => setAbierta(null)}
        onCambio={() => void cargar()}
        onAgendar={(t) => setAgendar([t])}
        onDecidir={(t, usarClienteSugerido) => void decidir(t, usarClienteSugerido)}
      />
      {agendar && (
        <Agendar
          tareas={agendar}
          onCerrar={() => {
            setAgendar(null);
            void cargar();
          }}
        />
      )}
    </div>
  );
}

function GrupoDeEquipo({ g, hechasDesde, onAbrir }: { g: GrupoDeLaCuenta; hechasDesde: string; onAbrir: (t: TareaVista) => void }) {
  const [verHechas, setVerHechas] = useState(false);
  return (
    <section aria-label={g.nombre} className="rounded-xl border border-line bg-surface">
      <header className="flex flex-wrap items-baseline gap-x-3 border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold text-fg">{g.nombre}</h3>
        <span className="text-xs text-fg-muted">
          {g.abiertas.length} {g.abiertas.length === 1 ? "abierta" : "abiertas"}
          {g.porDecidir.length > 0 ? ` · ${g.porDecidir.length} por decidir` : ""}
        </span>
      </header>
      {g.porDecidir.length > 0 && (
        <div className="border-b border-line">
          <p className={cn(ROTULO_DEL_SISTEMA, "px-4 pt-3")}>Por decidir</p>
          <ul className="divide-y divide-line">
            {g.porDecidir.map((t) => (
              <FilaDeLaCuenta key={t.id} t={t} onAbrir={onAbrir} />
            ))}
          </ul>
        </div>
      )}
      {g.abiertas.length > 0 ? (
        <ul className="divide-y divide-line">
          {g.abiertas.map((t) => (
            <FilaDeLaCuenta key={t.id} t={t} onAbrir={onAbrir} />
          ))}
        </ul>
      ) : (
        g.porDecidir.length === 0 && <p className="px-4 py-3 text-[13px] text-fg-muted">Nada abierto.</p>
      )}
      {g.hechas.length > 0 && (
        <div className="border-t border-line">
          <button type="button" aria-expanded={verHechas} onClick={() => setVerHechas((x) => !x)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs text-fg-muted hover:text-fg">
            <svg viewBox="0 0 24 24" className={cn("h-3.5 w-3.5 transition-transform", verHechas && "rotate-90")} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
            {g.hechas.length} {g.hechas.length === 1 ? "hecha" : "hechas"} desde el {diaCortoConSemana(hechasDesde)}
          </button>
          {verHechas && (
            <ul className="divide-y divide-line">
              {g.hechas.map((t) => (
                <FilaDeLaCuenta key={t.id} t={t} onAbrir={onAbrir} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/** «vence mié 22 oct» · «semana del 20 al 24 oct» · «más adelante». */
function textoDeCuando(t: TareaVista): string {
  if (t.estado === "hecha") return t.completadaAt ? `hecha ${diaCortoConSemana(t.completadaAt.slice(0, 10))}` : "hecha";
  if (t.venceEl) return `${t.atrasada ? "vencía" : "vence"} ${diaCortoConSemana(t.venceEl)}`;
  if (t.semana) return `semana del ${rangoDeLaSemana(t.semana)}`;
  return paraCuando(t) ?? "más adelante";
}

function FilaDeLaCuenta({ t, onAbrir }: { t: TareaVista; onAbrir: (t: TareaVista) => void }) {
  const hecha = t.estado === "hecha";
  const quien = t.responsable?.nombre ?? (t.equipoNombre ? `Por asignar en ${t.equipoNombre}` : "Por asignar");
  return (
    <li>
      <button type="button" onClick={() => onAbrir(t)} className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-hover">
        <span
          aria-hidden="true"
          className={cn(
            "mt-[5px] h-2.5 w-2.5 flex-shrink-0 rounded-full border",
            hecha ? "border-success-line bg-success-surface" : t.estado === "en_curso" ? "border-brand bg-brand" : t.estado === "propuesta" ? "border-info-line bg-info-surface" : "border-line",
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className={cn("text-sm text-fg", hecha && "text-fg-muted line-through decoration-line")}>{t.titulo}</span>
            <span className="text-[11px] tabular-nums text-fg-muted">T-{t.numero}</span>
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
            <span>{quien}</span>
            <span aria-hidden="true">·</span>
            <span className={cn(t.atrasada && !hecha && "font-medium text-danger-ink")}>{textoDeCuando(t)}</span>
            <Chip title="De dónde viene">
              {t.hubspot ? t.hubspot.rotulo : t.de.etiqueta}
            </Chip>
            {t.proyectoHubspot && <Chip title="Proyecto">{t.proyectoHubspot.nombre}</Chip>}
            {t.estado === "propuesta" && <Chip tono="ambar">Por decidir</Chip>}
          </span>
          {t.contexto && <span className="mt-1 block line-clamp-2 text-[12.5px] leading-snug text-fg-secondary">{t.contexto}</span>}
          {t.salioDe?.visible && t.salioDe.titulo && <span className="mt-0.5 block truncate text-[11px] text-fg-muted">De «{t.salioDe.titulo}»</span>}
        </span>
      </button>
    </li>
  );
}
