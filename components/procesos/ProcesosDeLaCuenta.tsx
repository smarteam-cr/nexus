"use client";

/**
 * components/procesos/ProcesosDeLaCuenta.tsx — LOS PROCESOS DEL CLIENTE: CÓMO TRABAJA HOY Y CÓMO VA
 * A TRABAJAR DESPUÉS DE LA IMPLEMENTACIÓN.
 *
 * El índice: arriba lo que encontró el agente (una sola vez), después una tarjeta por proceso con sus
 * dos mapas en miniatura, lo que se mencionó y no alcanzó para dibujar, y los mapas del formato
 * anterior que siguen en pie. Al abrir una tarjeta se ve el proceso (DetalleDelProceso).
 *
 * Datos: GET/POST /api/clients/[id]/procesos y PATCH/DELETE /api/clients/[id]/procesos/[blockId].
 * El mapeo corre en segundo plano: mientras corre, la pantalla consulta la corrida cada 4 s.
 */
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, ConfirmDialog, EmptyState, Spinner, useToast } from "@/components/ui";
import { SkeletonPanel, SkeletonText } from "@/components/ui/Skeleton";
import { BotonAzul, BotonBlanco, BotonEnlace, BotonTexto, IconoDeSugerencia, QueSigue, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useMe } from "@/hooks/useMe";
import { invalidateGps } from "@/lib/clients/gps-cache";
import { cn } from "@/lib/cn";
import { cuentasDelMapa, ETIQUETA_DE_AREA, type EstadoDelMapa, type IndiceDeProcesos, type MapaDeProceso } from "@/lib/procesos/mapa";
import { ChipDeEstado } from "./ChipDeEstado";
import DetalleDelProceso from "./DetalleDelProceso";
import type { EdicionDelPaso } from "./EditarPaso";
import { fechaCorta } from "./MapaPorCarriles";
import MiniMapa from "./MiniMapa";

const FlowchartViewer = dynamic(() => import("@/components/flowchart/FlowchartViewer").then((m) => m.default), {
  ssr: false,
  loading: () => <SkeletonPanel minH="min-h-[460px]" />,
});

interface MapaEnPantalla {
  blockId: string;
  editadoAMano: boolean;
  mapa: MapaDeProceso;
}
interface MapaAnterior {
  blockId: string;
  titulo: string;
  editadoAMano: boolean;
  data: { nodes?: unknown[]; edges?: unknown[]; description?: string } | null;
}
interface Corrida {
  id: string;
  estado: "RUNNING" | "DONE" | "ERROR" | "PENDING" | "ARCHIVED";
  fase: string | null;
  resultado: { procesos?: number; respetados?: number; reuniones?: number; hechos?: number } | null;
  cuando: string;
}
interface Datos {
  mapas: MapaEnPantalla[];
  anteriores: MapaAnterior[];
  indice: IndiceDeProcesos | null;
  corrida: Corrida | null;
}

async function leerError(r: Response, porDefecto: string): Promise<string> {
  const j = (await r.json().catch(() => null)) as { error?: unknown } | null;
  return typeof j?.error === "string" ? j.error : porDefecto;
}

function Esqueleto() {
  return (
    <div className="space-y-5">
      <SkeletonPanel minH="min-h-[96px]" bodyClassName="p-4">
        <SkeletonText lines={3} />
      </SkeletonPanel>
      {[0, 1].map((i) => (
        <SkeletonPanel key={i} minH="min-h-[190px]" bodyClassName="p-4 space-y-3">
          <SkeletonText lines={2} label />
        </SkeletonPanel>
      ))}
    </div>
  );
}

function TarjetaDelProceso({ m, onAbrir }: { m: MapaEnPantalla; onAbrir: () => void }) {
  const { mapa } = m;
  const c = cuentasDelMapa(mapa);
  const herramientasHoy = [...new Set(mapa.hoy.pasos.map((p) => p.herramienta).filter(Boolean))].slice(0, 4);
  const enHubspot = [...new Set(mapa.despues.pasos.map((p) => p.enHubspot).filter(Boolean))].slice(0, 3);
  const total = mapa.hoy.pasos.length + mapa.despues.pasos.length;
  return (
    <article className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-3.5">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-fg">{mapa.nombre}</h3>
            <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] font-medium text-fg-secondary">{ETIQUETA_DE_AREA[mapa.area]}</span>
            <ChipDeEstado estado={mapa.estado} />
            {m.editadoAMano && <span className="text-[11px] text-fg-muted">editado a mano</span>}
          </div>
          {mapa.queResuelve && <p className="max-w-3xl text-[13px] leading-relaxed text-fg-secondary">{mapa.queResuelve}</p>}
        </div>
        <BotonEnlace onClick={onAbrir}>Abrir →</BotonEnlace>
      </div>
      <button type="button" onClick={onAbrir} className="grid w-full gap-4 px-4 py-3.5 text-left md:grid-cols-[1fr_auto_1fr]">
        <div className="min-w-0 space-y-2">
          <span className={ROTULO_DEL_SISTEMA}>Hoy</span>
          <MiniMapa version={mapa.hoy} conDolor etiqueta={`Mapa de hoy: ${mapa.hoy.pasos.length} pasos`} />
          <p className="text-[13px] text-fg">
            {mapa.hoy.pasos.length} pasos · {c.responsablesHoy === 1 ? "1 responsable" : `${c.responsablesHoy} responsables`}
          </p>
          {c.dolores > 0 && <p className="text-xs text-warn-ink">{c.dolores === 1 ? "1 dolor" : `${c.dolores} dolores`}</p>}
          {herramientasHoy.length > 0 && <p className="text-xs text-fg-muted">{herramientasHoy.join(" · ")}</p>}
        </div>
        <span className="hidden self-center text-fg-muted md:block" aria-hidden="true">
          →
        </span>
        <div className="min-w-0 space-y-2">
          <span className={ROTULO_DEL_SISTEMA}>Después de la implementación</span>
          <MiniMapa version={mapa.despues} conDolor={false} etiqueta={`Mapa de después: ${mapa.despues.pasos.length} pasos`} />
          <p className="text-[13px] text-fg">
            {mapa.despues.pasos.length} pasos
            {c.loHaceElSistema > 0 ? ` · ${c.loHaceElSistema} los hace un sistema` : ""}
            {c.nuevos > 0 ? ` · ${c.nuevos === 1 ? "1 nuevo" : `${c.nuevos} nuevos`}` : ""}
          </p>
          {(mapa.cambios.length > 0 || mapa.despues.seVa.length > 0) && (
            <p className="text-xs text-fg-secondary">
              {mapa.cambios.length === 1 ? "1 cambio" : `${mapa.cambios.length} cambios`}
              {mapa.despues.seVa.length > 0 ? ` · ${mapa.despues.seVa.length} ${mapa.despues.seVa.length === 1 ? "paso de hoy se va" : "pasos de hoy se van"}` : ""}
            </p>
          )}
          {enHubspot.length > 0 && <p className="text-xs text-fg-muted">En HubSpot: {enHubspot.join(" · ")}</p>}
        </div>
      </button>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2.5 text-xs text-fg-muted">
        <span>
          {c.conCita} de {total} pasos con cita del cliente
          {c.supuestos ? ` · ${c.supuestos === 1 ? "1 supuesto" : `${c.supuestos} supuestos`}` : ""}
          {c.propuestos ? ` · ${c.propuestos === 1 ? "1 propuesto" : `${c.propuestos} propuestos`}` : ""}
        </span>
        {mapa.preguntas.length > 0 && (
          <span className="text-warn-ink">{mapa.preguntas.length === 1 ? "1 pregunta para el cliente" : `${mapa.preguntas.length} preguntas para el cliente`}</span>
        )}
      </div>
    </article>
  );
}

const DONDE_SE_USAN = [
  { doc: "Diagnóstico", que: "Lee los dos mapas y los dolores de hoy." },
  { doc: "Planificación", que: "Lee los dos mapas para «Cómo van a funcionar tus procesos»." },
  { doc: "Kickoff", que: "«Nuestros procesos» muestra Hoy, solo de los mapas validados con el cliente." },
  { doc: "Ejecución y Entrega", que: "Leen los dos mapas." },
];

export default function ProcesosDeLaCuenta({ clientId, slotDelPanel }: { clientId: string; slotDelPanel: HTMLElement | null }) {
  const toast = useToast();
  const me = useMe();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [errorDeCarga, setErrorDeCarga] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [arrancando, setArrancando] = useState(false);
  const [quitarAnterior, setQuitarAnterior] = useState<MapaAnterior | null>(null);
  const corriendo = datos?.corrida?.estado === "RUNNING";
  const corriaAntes = useRef(false);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/clients/${clientId}/procesos`, { cache: "no-store" });
      if (!r.ok) throw new Error(await leerError(r, "No se pudieron leer los procesos."));
      setDatos((await r.json()) as Datos);
      setErrorDeCarga(null);
    } catch (e) {
      setErrorDeCarga(e instanceof Error ? e.message : "No se pudieron leer los procesos.");
    }
  }, [clientId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Mientras el agente mapea, se consulta la corrida; al terminar avisa una vez.
  useEffect(() => {
    if (!corriendo) return;
    const t = setInterval(() => void cargar(), 4000);
    return () => clearInterval(t);
  }, [corriendo, cargar]);
  useEffect(() => {
    if (corriendo) {
      corriaAntes.current = true;
      return;
    }
    if (!corriaAntes.current || !datos?.corrida) return;
    corriaAntes.current = false;
    if (datos.corrida.estado === "DONE") {
      const n = datos.corrida.resultado?.procesos ?? datos.mapas.length;
      toast.success(n === 1 ? "Listo: 1 proceso mapeado." : `Listo: ${n} procesos mapeados.`);
      invalidateGps();
    } else if (datos.corrida.estado === "ERROR") {
      toast.error(datos.corrida.fase ?? "El mapeo falló.");
    }
  }, [corriendo, datos, toast]);

  const tieneProcesos = !!datos && (datos.mapas.length > 0 || datos.anteriores.length > 0);
  const permisos = me?.permissions?.sections?.procesos;
  const puedeMapear = tieneProcesos ? permisos?.regenerate === true : permisos?.generate === true;
  const puedeEditar = me !== null;

  const mapear = async () => {
    setArrancando(true);
    try {
      const r = await fetch(`/api/clients/${clientId}/procesos`, { method: "POST" });
      if (!r.ok) throw new Error(await leerError(r, "No se pudo arrancar el mapeo."));
      toast.info("El agente está leyendo las reuniones del cliente. Puede tardar varios minutos: puedes seguir trabajando.");
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo arrancar el mapeo.");
    } finally {
      setArrancando(false);
    }
  };

  const cambiarMapa = (blockId: string, mapa: MapaDeProceso) =>
    setDatos((d) => (d ? { ...d, mapas: d.mapas.map((m) => (m.blockId === blockId ? { ...m, mapa, editadoAMano: m.editadoAMano } : m)) } : d));

  const cambiarEstado = async (blockId: string, estado: EstadoDelMapa) => {
    setOcupado(true);
    try {
      const r = await fetch(`/api/clients/${clientId}/procesos/${blockId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "estado", estado }),
      });
      if (!r.ok) throw new Error(await leerError(r, "No se pudo cambiar el estado."));
      const { mapa } = (await r.json()) as { mapa: MapaDeProceso };
      cambiarMapa(blockId, mapa);
      invalidateGps();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cambiar el estado.");
    } finally {
      setOcupado(false);
    }
  };

  const editarPaso = async (blockId: string, cambio: EdicionDelPaso): Promise<string | null> => {
    const r = await fetch(`/api/clients/${clientId}/procesos/${blockId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "paso", ...cambio }),
    });
    if (!r.ok) return leerError(r, "No se pudo guardar el paso.");
    const { mapa } = (await r.json()) as { mapa: MapaDeProceso };
    setDatos((d) => (d ? { ...d, mapas: d.mapas.map((m) => (m.blockId === blockId ? { ...m, mapa, editadoAMano: true } : m)) } : d));
    return null;
  };

  const quitar = async (blockId: string) => {
    setOcupado(true);
    try {
      const r = await fetch(`/api/clients/${clientId}/procesos/${blockId}`, { method: "DELETE" });
      if (!r.ok) throw new Error(await leerError(r, "No se pudo quitar el mapa."));
      setAbierto(null);
      setDatos((d) => (d ? { ...d, mapas: d.mapas.filter((m) => m.blockId !== blockId), anteriores: d.anteriores.filter((m) => m.blockId !== blockId) } : d));
      invalidateGps();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo quitar el mapa.");
    } finally {
      setOcupado(false);
    }
  };

  const guardarAnterior = async (blockId: string, data: { nodes: unknown[]; edges: unknown[]; description?: string }) => {
    const r = await fetch(`/api/clients/${clientId}/procesos/${blockId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "anterior", data }),
    });
    if (!r.ok) throw new Error(await leerError(r, "No se pudo guardar el mapa."));
    setDatos((d) => (d ? { ...d, anteriores: d.anteriores.map((m) => (m.blockId === blockId ? { ...m, data, editadoAMano: true } : m)) } : d));
  };

  const elAbierto = abierto ? datos?.mapas.find((m) => m.blockId === abierto) : undefined;
  if (elAbierto) {
    return (
      <DetalleDelProceso
        key={elAbierto.blockId}
        mapa={elAbierto.mapa}
        editadoAMano={elAbierto.editadoAMano}
        puedeEditar={puedeEditar}
        slotDelPanel={slotDelPanel}
        ocupado={ocupado}
        onVolver={() => setAbierto(null)}
        onEstado={(estado) => void cambiarEstado(elAbierto.blockId, estado)}
        onPaso={(cambio) => editarPaso(elAbierto.blockId, cambio)}
        onQuitar={() => void quitar(elAbierto.blockId)}
      />
    );
  }

  const indice = datos?.indice ?? null;
  const borradores = datos?.mapas.filter((m) => m.mapa.estado === "borrador") ?? [];
  const totalPasos = datos?.mapas.reduce((s, m) => s + m.mapa.hoy.pasos.length + m.mapa.despues.pasos.length, 0) ?? 0;
  const delAgente = datos?.mapas.reduce((s, m) => s + cuentasDelMapa(m.mapa).supuestos + cuentasDelMapa(m.mapa).propuestos, 0) ?? 0;
  const hechos = indice?.sesiones.reduce((s, x) => s + x.hechos, 0) ?? 0;

  const botonDeMapear = (azul: boolean) => {
    if (!puedeMapear) return null;
    const texto = arrancando ? "Arrancando…" : tieneProcesos ? "Volver a mapear" : "Mapear procesos";
    return azul ? (
      <BotonAzul onClick={() => void mapear()} disabled={arrancando || corriendo}>
        {texto}
      </BotonAzul>
    ) : (
      <BotonBlanco onClick={() => void mapear()} disabled={arrancando || corriendo}>
        {texto}
      </BotonBlanco>
    );
  };

  let queSigue: React.ReactNode = null;
  if (datos && !corriendo) {
    if (!tieneProcesos) {
      queSigue = <QueSigue accion={botonDeMapear(true)}>El agente lee las reuniones del cliente enteras y arma cada proceso dos veces: cómo es hoy y cómo queda con HubSpot.</QueSigue>;
    } else if (borradores.length > 0) {
      queSigue = (
        <QueSigue accion={<BotonAzul onClick={() => setAbierto(borradores[0].blockId)}>Revisar {borradores[0].mapa.nombre}</BotonAzul>}>
          Revisa {borradores.length === 1 ? "el mapa" : `los ${borradores.length} mapas`} antes de mostrarlos: el cliente todavía no los validó
          {delAgente ? ` y ${delAgente} de los ${totalPasos} pasos los completó el agente o los propone Smarteam` : ""}.
        </QueSigue>
      );
    } else if (datos.mapas.some((m) => m.mapa.estado === "revisado")) {
      queSigue = <QueSigue>Muéstrale al cliente los mapas revisados y márcalos como validados: recién ahí entran al kickoff.</QueSigue>;
    } else if (datos.mapas.length === 0 && datos.anteriores.length > 0) {
      queSigue = (
        <QueSigue accion={botonDeMapear(true)}>
          Estos mapas son del formato anterior: no dicen de qué reunión sale cada paso ni cómo queda después. Vuelve a mapear para tener los dos.
        </QueSigue>
      );
    }
  }

  return (
    <div className="space-y-6">
      {slotDelPanel &&
        createPortal(
          <div className="flex flex-col gap-5">
            {queSigue}
            <section className="flex flex-col gap-2.5">
              <span className={ROTULO_DEL_SISTEMA}>Dónde se usan</span>
              <ul className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface">
                {DONDE_SE_USAN.map((d, i) => (
                  <li key={d.doc} className={cn("px-3 py-2", i > 0 && "border-t border-line")}>
                    <p className="text-[13px] font-medium text-fg">{d.doc}</p>
                    <p className="text-xs leading-relaxed text-fg-muted">{d.que}</p>
                  </li>
                ))}
              </ul>
            </section>
            {indice && indice.sesiones.length > 0 && (
              <section className="flex flex-col gap-2.5">
                <span className={ROTULO_DEL_SISTEMA}>De dónde salen</span>
                <ul className="flex max-h-[320px] flex-col overflow-y-auto rounded-xl border border-line bg-surface">
                  {indice.sesiones.map((s, i) => (
                    <li key={s.id} className={cn("flex items-start justify-between gap-3 px-3 py-2", i > 0 && "border-t border-line")}>
                      <span className="min-w-0 text-[13px] leading-snug text-fg">
                        {s.titulo} <span className="text-fg-muted">· {fechaCorta(s.fecha)}</span>
                      </span>
                      <span className="flex-shrink-0 text-xs tabular-nums text-fg-muted" title="Hechos con su cita">
                        {s.hechos}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs leading-relaxed text-fg-muted">
                  Lee cada reunión entera una vez. Al volver a mapear, solo lee las nuevas; lo que editaste a mano no se pisa.
                </p>
                {tieneProcesos && <div className="self-start">{botonDeMapear(false)}</div>}
              </section>
            )}
          </div>,
          slotDelPanel,
        )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[22px] font-bold leading-tight text-fg">Procesos</h2>
          <p className="mt-1 max-w-3xl text-[13px] text-fg-muted">
            Cómo trabaja el cliente hoy y cómo va a trabajar con HubSpot. Son de la cuenta: los leen el diagnóstico, la planificación y el kickoff de sus
            proyectos.
          </p>
        </div>
        {tieneProcesos && !slotDelPanel && botonDeMapear(false)}
      </div>

      {corriendo && datos?.corrida && (
        <div className="flex items-center gap-3 rounded-[10px] border border-info-line bg-info-surface px-3.5 py-2.5">
          <Spinner className="text-brand" />
          <p className="min-w-0 flex-1 text-[13px] text-brand">
            El agente está mapeando: {datos.corrida.fase ?? "arrancando"}. Puede tardar varios minutos; lo que editaste a mano no se pisa.
          </p>
        </div>
      )}
      {!corriendo && datos?.corrida?.estado === "ERROR" && (
        <Alert variant="danger" title="El último mapeo no terminó">
          {datos.corrida.fase ?? "Falló sin decir por qué."} Lo que ya estaba quedó igual.
        </Alert>
      )}

      {errorDeCarga && !datos && (
        <Alert variant="danger" title="No se pudieron leer los procesos" action={<BotonBlanco onClick={() => void cargar()}>Reintentar</BotonBlanco>}>
          {errorDeCarga}
        </Alert>
      )}

      {!datos && !errorDeCarga && <Esqueleto />}

      {datos && !tieneProcesos && !corriendo && (
        <EmptyState
          variant="dashed"
          title="Todavía no hay procesos mapeados"
          description="El agente lee las reuniones del cliente enteras y arma cada proceso dos veces: cómo lo hace hoy y cómo queda después de la implementación, con la cita de cada paso."
          // Con el panel a la vista, el botón azul es el de «Qué sigue»: uno solo por pantalla.
          action={slotDelPanel ? undefined : (botonDeMapear(true) ?? undefined)}
        />
      )}

      {indice && indice.resumen && (
        <section className="space-y-2 rounded-[10px] border border-info-line bg-info-surface px-4 py-3.5">
          <p className={cn(ROTULO_DEL_SISTEMA, "flex items-center gap-1.5 text-brand")}>
            <IconoDeSugerencia className="h-3.5 w-3.5" />
            Lo que encontró el agente
          </p>
          <p className="text-[13.5px] leading-relaxed text-fg">{indice.resumen}</p>
          <p className="text-xs text-fg-muted">
            Leyó {indice.sesiones.length === 1 ? "1 reunión entera" : `las ${indice.sesiones.length} reuniones enteras`}
            {hechos ? ` · ${hechos} hechos, cada uno con su cita` : ""} · {fechaCorta(indice.generadoEn.slice(0, 10))}
          </p>
        </section>
      )}

      {datos && datos.mapas.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-fg">
              Procesos mapeados <span className="font-normal text-fg-muted">{datos.mapas.length}</span>
            </h3>
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-fg-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-[7px] w-[7px] rounded-full bg-fg-muted" /> paso
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-[7px] w-[7px] rounded-full bg-warning" /> con dolor
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-[7px] w-[7px] rounded-full border-[1.5px] border-warning bg-surface" /> supuesto o propuesto
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-[7px] w-3 bg-surface-hover ring-1 ring-line" /> carril de un sistema
              </span>
            </div>
          </div>
          {datos.mapas.map((m) => (
            <TarjetaDelProceso key={m.blockId} m={m} onAbrir={() => setAbierto(m.blockId)} />
          ))}
        </section>
      )}

      {indice && indice.porLevantar.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-fg">
            Por levantar <span className="font-normal text-fg-muted">· se mencionaron, pero no alcanza para dibujarlos</span>
          </h3>
          <ul className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface">
            {indice.porLevantar.map((x, i) => (
              <li key={i} className={cn("space-y-0.5 px-4 py-3", i > 0 && "border-t border-line")}>
                <p className="text-[13.5px] font-medium text-fg">{x.nombre}</p>
                {x.falta && <p className="text-[13px] leading-relaxed text-fg-secondary">Falta: {x.falta}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {datos && datos.anteriores.length > 0 && (
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-fg">
              Mapas del formato anterior <span className="font-normal text-fg-muted">{datos.anteriores.length}</span>
            </h3>
            <p className="mt-0.5 text-xs text-fg-muted">
              {datos.anteriores.some((a) => a.editadoAMano)
                ? "Los que alguien editó a mano se quedan al volver a mapear; los demás los reemplaza el agente."
                : "Los reemplaza el agente al volver a mapear."}
            </p>
          </div>
          {datos.anteriores.map((a) => (
            <article key={a.blockId} className="overflow-hidden rounded-xl border border-line bg-surface">
              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <p className="min-w-0 truncate text-[13.5px] font-medium text-fg">
                  {a.titulo}
                  {a.editadoAMano && <span className="ml-2 text-[11px] font-normal text-fg-muted">editado a mano</span>}
                </p>
                {puedeEditar && (
                  <BotonTexto onClick={() => setQuitarAnterior(a)} disabled={ocupado}>
                    Quitar
                  </BotonTexto>
                )}
              </div>
              <div className="h-[460px] border-t border-line">
                <FlowchartViewer
                  data={{
                    title: "",
                    description: a.data?.description ?? "",
                    nodes: (a.data?.nodes ?? []) as Array<{ id: string; type: string; label: string; position?: { x: number; y: number } }>,
                    edges: (a.data?.edges ?? []) as Array<{ id?: string; source: string; target: string; label?: string }>,
                  }}
                  onSave={puedeEditar ? (u) => guardarAnterior(a.blockId, { nodes: u.nodes, edges: u.edges, description: u.description }) : undefined}
                />
              </div>
            </article>
          ))}
        </section>
      )}

      <ConfirmDialog
        open={!!quitarAnterior}
        title="¿Quitar este mapa?"
        description={quitarAnterior ? `Se borra «${quitarAnterior.titulo}» de los procesos del cliente.` : undefined}
        confirmLabel="Quitar"
        variant="destructive"
        onCancel={() => setQuitarAnterior(null)}
        onConfirm={() => {
          const a = quitarAnterior;
          setQuitarAnterior(null);
          if (a) void quitar(a.blockId);
        }}
      />
    </div>
  );
}
