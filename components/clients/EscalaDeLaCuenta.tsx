"use client";

/**
 * components/clients/EscalaDeLaCuenta.tsx — La cuenta › La escala (2026-10-12, pedido de Elías; ficha B, 2026-10-17;
 * «Actualizar escala», 2026-10-18; escala única, 2026-10-28).
 *
 * ESCALA ÚNICA (pedido de Elías, 28 oct: «debería ser la misma escala… que se comparta realmente entre módulos de
 * preventa o de clientes»). La escala de un cliente es la MISMA pieza que la de la preventa: el lienzo de la preventa en
 * modo `cuenta` (LienzoDeExploracion + PasoEscala), sobre la exploración de «Información del cliente»
 * (lib/exploraciones/escala-de-la-cuenta.ts). Se elige la industria (la edición), el perfil y las áreas igual; cada
 * dimensión se abre, se ve su evidencia y se elige su nivel igual; lo que propone el agente aparece arriba para usar o
 * descartar igual. Ver docs/escala-unica-plan.md.
 *
 * Lo que es solo de la ficha, y vive acá:
 *   · al abrirla por primera vez parte de lo medido en la preventa o en la Exploración de un proyecto (POST `abrir`);
 *   · el agente es «Actualizar escala» (modo `posicionar`): lee todo lo que Nexus sabe de la cuenta —la memoria, las
 *     reuniones que alguien eligió primero—, con una venta y un proyecto como contexto si se eligen, y solo PROPONE;
 *   · «Guardar esta versión» con su momento («al vender», «al arrancar», «hoy») y su venta;
 *   · el camino de crecimiento con los casos de la biblioteca;
 *   · la escala en el tiempo: las versiones de TODA la empresa y la de hoy de la preventa y de cada proyecto, en solo
 *     lectura. Cada versión se compara solo con la anterior de su misma escala (la cuenta con la cuenta), y una edición
 *     no se compara con otra: cambiarla es un punto de partida nuevo. Se pone al día sola al confirmar un nivel.
 * Lo propio de la preventa (la propuesta comercial, el vendedor, la próxima sesión) no aparece.
 * Datos: GET/POST /api/clients/[id]/escala.
 */
import Link from "next/link";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, EmptyState, Select, useToast } from "@/components/ui";
import { SkeletonPanel, SkeletonText } from "@/components/ui/Skeleton";
import { BotonAzul, BotonBlanco, BotonEnlace, IconoDeSugerencia, QueSigue, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { PUNTO_DE_NIVEL, nombreDe } from "@/components/escala/niveles";
import LienzoDeExploracion from "@/components/exploraciones/LienzoDeExploracion";
import { useLienzo } from "@/components/exploraciones/contexto";
import { useCorrida } from "@/components/exploraciones/useCorrida";
import { caminoDeCrecimiento } from "@/lib/casos-de-uso/camino";
import type { EscalaDeLaCuenta as LaEscalaDeLaCuenta } from "@/lib/exploraciones/escala-de-la-cuenta";
import type { EscalaDeLaEmpresa } from "@/lib/exploraciones/escala-de-la-empresa";
import { diaYHora } from "@/lib/exploraciones/fechas";
import {
  anteriorDeLaMismaVara,
  anteriorDeSuEscala,
  cambiosEntreFotos,
  deDondeSaleElNivel,
  ETIQUETA_DEL_ORIGEN,
  fotoDeLaExploracion,
  fraseDelCambio,
  huellaDeLaFoto,
  type AreaDeLaFoto,
  type FotoDeLaEscala,
} from "@/lib/exploraciones/foto-de-la-escala";
import { ETIQUETA_DEL_MOMENTO, MOMENTOS_DE_LA_VERSION, type MomentoDeLaVersion } from "@/lib/exploraciones/posicionar";
import type { VersionGuardada } from "@/lib/exploraciones/versiones-de-la-escala";
import type { Letra } from "@/lib/escala/documento/tipos";

type Datos = EscalaDeLaEmpresa & {
  puede?: { preventa: boolean; exploracion: boolean };
  sePuedeProbar?: boolean;
  cuenta?: LaEscalaDeLaCuenta | null;
  faltaAbrir?: boolean;
};
type Ok = Extract<Datos, { estado: "ok" }>;
type Niveles = { letra: Letra; nombre: string }[];

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** La fecha en la hora de Costa Rica (UTC-6), armada a mano: así servidor y navegador dicen lo mismo. */
function fecha(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 6 * 3_600_000);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
/** «2026-10-18» → «18 oct 2026», sin pasar por la zona horaria. */
function elDia(dia: string): string {
  const [a, m, d] = dia.slice(0, 10).split("-").map(Number);
  return a && m && d ? `${d} ${MESES[m - 1]} ${a}` : dia;
}

const VAR_DE_NIVEL: Record<Letra, string> = { D: "deficiente", I: "inicial", F: "funcional", E: "eficiente", O: "optimo" };

function Nivel({ letra, niveles, hipotesis }: { letra: Letra | null; niveles: Niveles; hipotesis?: boolean }) {
  if (!letra) return <span className="text-[13px] text-fg-muted">Sin nivel</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] text-fg">
      <span
        aria-hidden="true"
        className={cn("h-2.5 w-2.5 flex-shrink-0 rounded-full", hipotesis ? "border-2 bg-transparent" : PUNTO_DE_NIVEL[letra])}
        style={hipotesis ? { borderColor: `var(--color-nivel-${VAR_DE_NIVEL[letra]})` } : undefined}
      />
      {nombreDe(niveles, letra)}
      {letra === "F" && <span className="rounded-full border border-line bg-surface px-1.5 text-[11px] text-fg-muted">La base</span>}
    </span>
  );
}

function ChipDeClase({ clase }: { clase: "evidencia" | "hipotesis" | null }) {
  if (clase === "evidencia")
    return <span className="inline-flex rounded-full border border-success-line bg-success-surface px-2 py-px text-[11px] font-semibold text-success-ink">✓ Con evidencia</span>;
  if (clase === "hipotesis")
    return <span className="inline-flex rounded-full border border-warn-line bg-warn-surface px-2 py-px text-[11px] font-semibold text-warn-ink">○ Hipótesis</span>;
  return null;
}

/** Un área de una versión guardada (solo lectura): cada dimensión y de dónde sale su nivel. */
function AreaConEvidencia({ a, niveles }: { a: AreaDeLaFoto; niveles: Niveles }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-[15px] font-semibold text-fg">{a.nombre}</h4>
        <span className="flex items-baseline gap-2">
          <Nivel letra={a.nivel} niveles={niveles} />
          {a.puntaje !== null && <span className="text-xs tabular-nums text-fg-muted">{a.puntaje} de 100</span>}
        </span>
      </div>
      {(["base", "produccion"] as const).map((capa) => (
        <div key={capa} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2 border-b border-line pb-1">
            <span className={ROTULO_DEL_SISTEMA}>{a.capas[capa].nombre}</span>
            <Nivel letra={a.capas[capa].nivel} niveles={niveles} />
          </div>
          <ul className="flex flex-col">
            {a.dimensiones
              .filter((d) => d.capa === capa)
              .map((d) => {
                const frena = !!a.frena?.dimensiones.includes(d.id);
                const conDetalle = !!(d.nivel && (d.cita || d.porQue || d.fuente));
                const abierto = abierta === d.id;
                return (
                  <li key={d.id} className={cn("flex flex-col py-1 text-[13px]", !d.aplica && "opacity-60")}>
                    <button
                      type="button"
                      disabled={!conDetalle}
                      aria-expanded={conDetalle ? abierto : undefined}
                      onClick={() => setAbierta(abierto ? null : d.id)}
                      className="flex items-baseline justify-between gap-3 text-left disabled:cursor-default"
                    >
                      <span className="min-w-0 text-fg-secondary">
                        <span className="tabular-nums text-fg-muted">{d.id}</span> {d.nombre}
                        {frena && <span className="ml-1.5 rounded-full border border-warn-line bg-warn-surface px-1.5 text-[11px] font-semibold text-warn-ink">La frena</span>}
                      </span>
                      {d.aplica ? <Nivel letra={d.nivel} niveles={niveles} hipotesis={d.clase === "hipotesis"} /> : <span className="text-xs text-fg-muted">No aplica</span>}
                    </button>
                    {d.aplica && d.nivel && (
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
                        <ChipDeClase clase={d.clase} />
                        {deDondeSaleElNivel(d.fuente)}
                      </span>
                    )}
                    {abierto && (
                      <div className="mt-1.5 flex flex-col gap-1 rounded-lg border border-line bg-surface-muted px-3 py-2">
                        {d.cita && <p className="text-[13px] italic text-fg-secondary">«{d.cita}»</p>}
                        {d.porQue && <p className="text-[13px] text-fg-secondary">{d.porQue}</p>}
                        {d.riesgo && <p className="text-xs text-warn-ink">Dejó ver un riesgo: no se estima por encima de Funcional.</p>}
                      </div>
                    )}
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </section>
  );
}

// ── El agente de la cuenta: «Actualizar escala» ──────────────────────────────

/**
 * En el lugar del agente de la preventa (leer la última reunión, preparar): «Actualizar escala» lee todo lo que Nexus
 * sabe de la cuenta y PROPONE niveles en esta misma escala. Con qué venta y con qué proyecto como contexto, si se eligen.
 * La corrida la sigue el mismo seguimiento del lienzo (useCorrida): al terminar, lo propuesto aparece arriba.
 */
function AgenteDeLaCuenta({ clientId, datos }: { clientId: string; datos: Ok }) {
  const { exp, puedeEditar } = useLienzo();
  const { corrida, corriendo, seguir } = useCorrida();
  const toast = useToast();
  // El proyecto sugerido: el del objetivo por defecto, si es un proyecto (el vivo más reciente).
  const deProyecto = datos.objetivos.filter((o) => o.tipo === "proyecto" && o.projectId);
  const sugerido = deProyecto.find((o) => o.clave === datos.porDefecto)?.projectId ?? null;
  const [proyectoId, setProyectoId] = useState<string | null>(sugerido);
  const objetivo = datos.objetivos.find((o) => o.clave === (proyectoId ? `proyecto:${proyectoId}` : "cuenta"));
  const [ventaId, setVentaId] = useState<string | null | undefined>(undefined);
  const venta = ventaId === undefined ? (objetivo?.ventaSugerida ?? null) : ventaId;
  const [lanzando, setLanzando] = useState(false);
  const ultima = [...exp.estado.propuesta.corridas].reverse().find((c) => c.modo === "posicionar");

  const actualizar = async () => {
    setLanzando(true);
    try {
      const r = await fetch(`/api/clients/${clientId}/escala`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "actualizar", objetivo: "cuenta", ventaId: venta, proyectoId }),
      });
      const j = (await r.json().catch(() => null)) as { error?: string; yaCorria?: boolean } | null;
      if (!r.ok) throw new Error(j?.error ?? "No se pudo lanzar el agente.");
      toast.info(j?.yaCorria ? "El agente ya estaba ubicando esta escala: cuando termine, lo propuesto aparece arriba." : "El agente está leyendo todo lo que Nexus sabe de la cuenta…");
      void seguir();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo lanzar el agente.");
    } finally {
      setLanzando(false);
    }
  };

  return (
    <section aria-label="Actualizar escala" className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-fg">El agente</h3>
          <p className="text-xs text-fg-muted">
            {ultima
              ? `Última vez: ${diaYHora(ultima.en)} · ${ultima.propuestos === 0 ? "nada nuevo que proponer" : `${ultima.propuestos} ${ultima.propuestos === 1 ? "nivel propuesto" : "niveles propuestos"}`}`
              : "Lee todo lo que Nexus sabe de la cuenta y propone niveles; tú usas o descartas."}
          </p>
        </div>
        {puedeEditar && (
          <BotonAzul disabled={lanzando || corriendo} onClick={() => void actualizar()}>
            {corriendo ? "Ubicando…" : "Actualizar escala"}
          </BotonAzul>
        )}
      </div>
      {puedeEditar && (deProyecto.length > 0 || datos.ventas.length > 0) && (
        <div className="flex flex-wrap items-end gap-3">
          {deProyecto.length > 0 && (
            <label className="flex min-w-[220px] flex-col gap-1 text-xs text-fg-muted">
              Con el contexto de
              <Select
                value={proyectoId ?? ""}
                disabled={lanzando || corriendo}
                onChange={(e) => {
                  setProyectoId(e.target.value || null);
                  setVentaId(undefined);
                }}
              >
                <option value="">Toda la cuenta, sin un proyecto</option>
                {deProyecto.map((o) => (
                  <option key={o.clave} value={o.projectId!}>
                    {o.etiqueta}
                    {o.detalle ? ` · ${o.detalle}` : ""}
                  </option>
                ))}
              </Select>
            </label>
          )}
          {datos.ventas.length > 0 && (
            <label className="flex min-w-[220px] flex-col gap-1 text-xs text-fg-muted">
              Venta
              <Select value={venta ?? ""} disabled={lanzando || corriendo} onChange={(e) => setVentaId(e.target.value || null)}>
                <option value="">Sin una venta en particular</option>
                {datos.ventas.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nombre} · ganada el {elDia(v.fechaCierre)}
                  </option>
                ))}
              </Select>
            </label>
          )}
        </div>
      )}
      {corriendo && (
        <p className="text-xs text-fg-secondary" role="status">
          {corrida?.etiqueta ?? "El agente está trabajando"}: {corrida?.fase ?? "empezando…"}
        </p>
      )}
      {corrida?.estado === "ERROR" && <Alert variant="danger">{corrida.error}</Alert>}
      <p className="text-xs text-fg-muted">
        Lee lo vendido, el handoff y los cuestionarios del proyecto que elijas, las reuniones ya leídas (primero las que alguien unió a una sesión), las
        tareas, el cronograma, HubSpot y la memoria de la cuenta. Propone solo con lo que dijo o hizo el cliente, y nada se confirma solo. Cuesta entre
        US$0,05 y US$0,20.
      </p>
    </section>
  );
}

// ── Lo de la ficha, debajo de la escala ───────────────────────────────────────

/** El camino de crecimiento: qué sigue, con los casos de la biblioteca que lo mueven. Sale de la escala de ahora. */
function CaminoDeCrecimiento({
  casos,
  ocupado,
  onSumar,
}: {
  casos: { titulos: Set<string>; puedeEditar: boolean };
  ocupado: boolean;
  onSumar: (titulo: string, cuerpo: Record<string, unknown>) => void;
}) {
  const { exp, escala } = useLienzo();
  const niveles = escala.niveles;
  const nombre = (l: Letra) => nombreDe(niveles, l);
  const camino = caminoDeCrecimiento(fotoDeLaExploracion(escala, exp.estado).areas, nombre);
  if (!camino.length) return null;
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-fg">El camino de crecimiento</h3>
        <p className="text-xs text-fg-muted">Qué sigue en la escala y por qué, con los casos de la biblioteca que lo mueven. Sale de lo confirmado: sin IA.</p>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {camino.map((p) => (
          <article key={p.areaId} className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="text-[14px] font-semibold text-fg">{p.areaNombre}</h4>
              {p.nivel && p.siguiente && (
                <span className="flex items-center gap-1.5 text-xs text-fg-muted">
                  <Nivel letra={p.nivel} niveles={niveles} /> → <Nivel letra={p.siguiente} niveles={niveles} />
                </span>
              )}
            </div>
            <p className="text-[13px] text-fg-secondary">{p.porQue}</p>
            {p.casos.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {p.casos.map((c) => {
                  const ya = casos.titulos.has(c.caso.titulo.trim().toLowerCase());
                  return (
                    <li key={c.caso.id} className="flex items-start gap-2.5 rounded-lg border border-info-line bg-info-surface px-3 py-2">
                      <IconoDeSugerencia className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-brand" />
                      <div className="min-w-0 flex-1">
                        <Link href={`/sales/use-cases/${c.caso.id}`} className="text-[13px] font-medium text-fg hover:underline">
                          {c.caso.titulo}
                        </Link>
                        <p className="text-xs text-fg-secondary">{c.razon}</p>
                      </div>
                      {ya ? (
                        <span className="flex-shrink-0 text-xs text-fg-muted">Ya está en Casos de uso</span>
                      ) : (
                        casos.puedeEditar && (
                          <BotonBlanco
                            disabled={ocupado}
                            onClick={() =>
                              onSumar(c.caso.titulo, {
                                resultado: c.caso.promesa,
                                porque: c.razon,
                                mueve: c.mueve.map((m) => ({ area: p.areaNombre, dimension: m.dimension, nivel: nombre(m.hasta) })),
                              })
                            }
                          >
                            Sumar a los sugeridos
                          </BotonBlanco>
                        )
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

/** Una fila de la historia: una versión guardada o la escala de hoy de otra exploración (solo lectura). */
interface FilaDeLaHistoria {
  clave: string;
  titulo: string;
  /** El día de la posición (puede ser del pasado). */
  fecha: string;
  foto: FotoDeLaEscala;
  /** Contra qué se compara: la anterior de la misma edición; o, si la anterior es de otra, un punto de partida nuevo. */
  anterior: { fecha: string; foto: FotoDeLaEscala } | null;
  puntoDePartida: { desdeEdicion: string | null } | null;
  /** Lo que propuso el agente en esa exploración y nadie revisó, y dónde se revisa. */
  pendientes?: { cuantos: number; abrir: React.ReactNode };
}

/** De dónde sale una posición: la preventa, la cuenta entera («Información del cliente») o la Exploración de un proyecto. */
const deDondeEn = (datos: Ok) => (p: { proyecto: { id: string; nombre: string } | null }) =>
  !p.proyecto ? "La escala de la preventa" : p.proyecto.id === datos.contenedorId ? "La escala de la cuenta" : `La Exploración de «${p.proyecto.nombre}»`;

function filasDeLaHistoria(datos: Ok, cuentaId: string | null, abrir: (exploracionId: string) => React.ReactNode): FilaDeLaHistoria[] {
  const deDonde = deDondeEn(datos);
  const cuandoDe = (v: VersionGuardada) => (v.diaDeLaPosicion ? `${v.diaDeLaPosicion}T12:00:00-06:00` : v.fecha);
  const versiones = datos.versiones.map((v, i, todas): FilaDeLaHistoria => {
    // Solo con la anterior de la MISMA escala (lib/exploraciones/foto-de-la-escala.ts › anteriorDeSuEscala).
    const previa = anteriorDeSuEscala(todas, i);
    const { anterior, puntoDePartida } = anteriorDeLaMismaVara(v.foto, previa ? [previa] : []);
    const origen = v.nota && v.creadoPorEmail === "sistema" ? "Primera versión" : ETIQUETA_DEL_ORIGEN[v.origen];
    return {
      clave: v.id,
      titulo: [v.momento ? ETIQUETA_DEL_MOMENTO[v.momento] : null, origen + (v.ciclo ? ` · ciclo ${v.ciclo.numero}` : ""), v.venta ? `venta «${v.venta.nombre}»` : null, deDonde(v)]
        .filter(Boolean)
        .join(" · "),
      fecha: cuandoDe(v),
      foto: v.foto,
      anterior: anterior ? { fecha: cuandoDe(anterior), foto: anterior.foto } : null,
      puntoDePartida,
    };
  });
  // La escala de HOY de las otras exploraciones de la empresa (la preventa, cada proyecto): la de la cuenta está arriba.
  const hoy = datos.posiciones
    .filter((p) => p.exploracionId !== cuentaId)
    .map((p): FilaDeLaHistoria => {
      const foto: FotoDeLaEscala = { formato: 1, escalaVersion: null, edicion: p.edicion, areas: p.areas };
      // Contra la última versión de esa exploración que dice algo distinto (la del día puede ser igual a la de hoy).
      const ultima = datos.versiones.find((v) => v.exploracionId === p.exploracionId && huellaDeLaFoto(v.foto) !== huellaDeLaFoto(foto));
      const { anterior, puntoDePartida } = anteriorDeLaMismaVara(foto, ultima ? [ultima] : []);
      const exp = datos.exploraciones.find((e) => e.id === p.exploracionId);
      return {
        clave: `hoy:${p.exploracionId}`,
        titulo: `Hoy · ${deDonde(p)}`,
        fecha: p.fecha,
        foto,
        anterior: anterior ? { fecha: cuandoDe(anterior), foto: anterior.foto } : null,
        puntoDePartida,
        ...(exp?.propuestos.length ? { pendientes: { cuantos: exp.propuestos.length, abrir: abrir(exp.id) } } : {}),
      };
    });
  return [...hoy, ...versiones];
}

/** La escala en el tiempo: las versiones de toda la empresa y la de hoy de la preventa y de cada proyecto. */
function HistoriaDeLaEscala({ filas, niveles }: { filas: FilaDeLaHistoria[]; niveles: Niveles }) {
  const [elegida, setElegida] = useState<string | null>(null);
  if (!filas.length) return null;
  const vista = filas.find((f) => f.clave === elegida) ?? null;
  const nombre = (l: Letra) => nombreDe(niveles, l);
  const cambios = vista?.anterior ? cambiosEntreFotos(vista.anterior.foto, vista.foto) : [];
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-fg">La escala en el tiempo</h3>
        <p className="text-xs text-fg-muted">
          Se guarda una versión al confirmar un nivel (una por día), al presentar el diagnóstico de un ciclo y con «Guardar esta versión». Lo que propone el
          agente no entra hasta que lo usas. Una edición no se compara con otra: cambiarla es un punto de partida nuevo.
        </p>
      </div>
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {filas.map((v) => (
          <li key={v.clave}>
            <button
              type="button"
              aria-pressed={v.clave === elegida}
              onClick={() => setElegida(v.clave === elegida ? null : v.clave)}
              className={cn("flex w-full flex-wrap items-baseline justify-between gap-3 px-4 py-2.5 text-left text-[13px] hover:bg-surface-hover", v.clave === elegida && "bg-surface-muted")}
            >
              <span className="text-fg-secondary">
                <span className="tabular-nums text-fg">{fecha(v.fecha)}</span> · {v.titulo}
                {v.foto.edicion ? ` · edición ${v.foto.edicion}` : ""}
                {v.puntoDePartida && <span className="ml-1.5 rounded-full border border-line bg-surface-muted px-1.5 text-[11px] font-semibold text-fg-secondary">Punto de partida</span>}
                {v.pendientes && <span className="ml-1.5 text-xs text-brand">{v.pendientes.cuantos === 1 ? "1 nivel propuesto sin revisar" : `${v.pendientes.cuantos} niveles propuestos sin revisar`}</span>}
              </span>
              <span className="flex flex-wrap gap-3">
                {v.foto.areas.map((a) => (
                  <span key={a.id} className="inline-flex items-baseline gap-1.5">
                    <span className="text-fg-muted">{a.nombre}</span>
                    <Nivel letra={a.nivel} niveles={niveles} />
                  </span>
                ))}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {vista && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] text-fg-secondary">
              <span className="font-medium text-fg">{vista.titulo}</span> · {fecha(vista.fecha)}
              {vista.foto.edicion ? ` · edición ${vista.foto.edicion}` : ""}
            </p>
            <span className="flex items-center gap-2">
              {vista.pendientes?.abrir}
              <BotonEnlace onClick={() => setElegida(null)}>Cerrar</BotonEnlace>
            </span>
          </div>
          {vista.puntoDePartida ? (
            <section className="rounded-xl border border-line bg-surface-muted px-4 py-3">
              <p className={ROTULO_DEL_SISTEMA}>Punto de partida nuevo</p>
              <p className="mt-1 text-[13px] text-fg-secondary">
                Antes se medía con {vista.puntoDePartida.desdeEdicion ? `la edición ${vista.puntoDePartida.desdeEdicion}` : "la escala general"}: una edición no
                se compara con otra, así que desde acá se mide de nuevo.
              </p>
            </section>
          ) : (
            vista.anterior && (
              <section className="rounded-xl border border-line bg-surface-muted px-4 py-3">
                <p className={ROTULO_DEL_SISTEMA}>Qué cambió desde el {fecha(vista.anterior.fecha)}</p>
                {cambios.length ? (
                  <ul className="mt-1.5 flex flex-col gap-0.5 text-[13px] text-fg-secondary">
                    {cambios.slice(0, 8).map((c) => (
                      <li key={c.dimensionId}>
                        <span className="text-fg-muted">{c.areaNombre} ·</span> {fraseDelCambio(c, nombre)}
                      </li>
                    ))}
                    {cambios.length > 8 && <li className="text-xs text-fg-muted">y {cambios.length - 8} más</li>}
                  </ul>
                ) : (
                  <p className="mt-1 text-[13px] text-fg-muted">Nada: los mismos niveles.</p>
                )}
              </section>
            )
          )}
          <div className="grid gap-4 xl:grid-cols-2">
            {vista.foto.areas.map((a) => (
              <AreaConEvidencia key={a.id} a={a} niveles={niveles} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * La historia se pone al día sola: cuando se confirma algo en la escala (sube la versión de la exploración), se vuelve a
 * pedir, un rato después, porque la versión del día la guarda el servidor por su cuenta (anotarVersionDelCambio).
 */
function AlDiaConLaEscala({ alCambiar }: { alCambiar: () => void }) {
  const { exp } = useLienzo();
  const primera = useRef(exp.version);
  const alCambiarRef = useRef(alCambiar);
  useEffect(() => {
    alCambiarRef.current = alCambiar;
  }, [alCambiar]);
  useEffect(() => {
    if (exp.version === primera.current) return;
    primera.current = exp.version;
    const t = setTimeout(() => alCambiarRef.current(), 2500);
    return () => clearTimeout(t);
  }, [exp.version]);
  return null;
}

/** «Qué sigue» en el panel de la derecha de la ficha, con la escala de ahora. */
function QueSigueDeLaCuenta({ slot, accion }: { slot: HTMLElement | null; accion: React.ReactNode }) {
  const { pendientes, mapa, exp } = useLienzo();
  if (!slot) return null;
  const propuestos = pendientes.filter((it) => it.destino.tipo === "nivel").length;
  const enJuego = mapa.chequeo.areas.filter((a) => exp.estado.areas.includes(a.id));
  const sinNivel = enJuego.filter((a) => a.faltan.length > 0).map((a) => a.nombre);
  const hipotesis = Object.values(mapa.posiciones).some((p) => p.clase === "hipotesis");
  const texto = propuestos
    ? `El agente propuso ${propuestos === 1 ? "un nivel" : `${propuestos} niveles`}: úsalos en la escala o descártalos.`
    : !Object.keys(exp.estado.contenido.chequeo).length
      ? "La empresa todavía no está ubicada: toca «Actualizar escala» para que el agente proponga dónde está con lo que Nexus ya sabe."
      : sinNivel.length
        ? `Faltan dimensiones sin nivel en ${sinNivel.join(" y ")}.`
        : hipotesis
          ? "Hay niveles que son hipótesis: confírmalos con el cliente en la Exploración del proyecto."
          : null;
  if (!texto) return null;
  return createPortal(<QueSigue accion={accion}>{texto}</QueSigue>, slot);
}

export default function EscalaDeLaCuenta({
  clientId,
  slotDelPanel,
  onAbrirExploracion,
}: {
  clientId: string;
  slotDelPanel: HTMLElement | null;
  /** Abre la Exploración de un proyecto (ahí se explora con el cliente, sesión por sesión). */
  onAbrirExploracion: (projectId: string) => void;
}) {
  const toast = useToast();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [abriendo, setAbriendo] = useState(false);
  const intentoAbrir = useRef(false);
  const [casos, setCasos] = useState<{ titulos: Set<string>; puedeEditar: boolean }>({ titulos: new Set(), puedeEditar: false });
  // «Guardar esta versión»: de qué momento y de qué venta.
  const [guardando, setGuardando] = useState(false);
  const [momento, setMomento] = useState<MomentoDeLaVersion>("hoy");
  // undefined = la del proyecto, si la tiene (la saca el servidor de su trato de HubSpot).
  const [ventaParaGuardar, setVentaParaGuardar] = useState<string | null | undefined>(undefined);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/clients/${clientId}/escala`, { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? "No se pudo cargar la escala de la empresa.");
      setDatos(j as Datos);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la escala de la empresa.");
    }
  }, [clientId]);

  const cargarCasos = useCallback(async () => {
    const r = await fetch(`/api/clients/${clientId}/casos-de-uso`, { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return;
    const j = (await r.json().catch(() => null)) as { casos?: { titulo: string; estado: string }[]; puedeEditar?: boolean } | null;
    setCasos({ titulos: new Set((j?.casos ?? []).filter((c) => c.estado !== "descartado").map((c) => c.titulo.trim().toLowerCase())), puedeEditar: !!j?.puedeEditar });
  }, [clientId]);

  useEffect(() => {
    void cargar();
    void cargarCasos();
  }, [cargar, cargarCasos]);

  /** Abre la escala de la cuenta: la crea si no está y, si nunca midió nada, parte de lo medido en la preventa o en un proyecto. */
  const abrir = useCallback(async () => {
    setAbriendo(true);
    try {
      const r = await fetch(`/api/clients/${clientId}/escala`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "abrir" }) });
      const j = (await r.json().catch(() => null)) as { error?: string; traidas?: number; desde?: string | null; afuera?: number; noSeTrajo?: boolean } | null;
      if (!r.ok) throw new Error(j?.error ?? "No se pudo abrir la escala de la cuenta.");
      if (j?.noSeTrajo) toast.error("No se pudo traer lo ya medido: alguien cambió la escala al mismo tiempo. Recarga para intentarlo de nuevo.");
      else if (j?.traidas)
        toast.success(
          `La escala de la cuenta parte de lo medido en ${j.desde ?? "la preventa"}: ${j.traidas === 1 ? "una dimensión" : `${j.traidas} dimensiones`}.` +
            (j.afuera ? ` ${j.afuera === 1 ? "Una cosa no existe" : `${j.afuera} cosas no existen`} en esta escala y no se trajo.` : ""),
        );
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo abrir la escala de la cuenta.");
    } finally {
      setAbriendo(false);
    }
  }, [clientId, cargar, toast]);

  // Quien puede trabajarla la abre al entrar (una vez), como la Exploración de un proyecto.
  const puede = datos?.puede ?? { preventa: false, exploracion: false };
  useEffect(() => {
    if (!datos || datos.estado !== "ok" || !datos.faltaAbrir || !puede.exploracion || intentoAbrir.current) return;
    intentoAbrir.current = true;
    void abrir();
  }, [datos, puede.exploracion, abrir]);

  const ok = datos && datos.estado === "ok" ? datos : null;
  const cuenta = ok?.cuenta ?? null;

  const guardarVersion = async () => {
    if (!cuenta) return;
    setOcupado(true);
    try {
      const r = await fetch(`/api/clients/${clientId}/escala`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "guardar", exploracionId: cuenta.exploracion.id, momento, ...(ventaParaGuardar ? { ventaId: ventaParaGuardar } : {}) }),
      });
      const j = (await r.json().catch(() => null)) as { error?: string; igual?: boolean } | null;
      if (!r.ok) throw new Error(j?.error ?? "No se pudo guardar la versión.");
      toast.success(j?.igual ? "Esta versión ya estaba guardada: nada cambió desde la última." : "Versión guardada.");
      setGuardando(false);
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar la versión.");
    } finally {
      setOcupado(false);
    }
  };

  const sumarCaso = async (titulo: string, cuerpo: Record<string, unknown>) => {
    setOcupado(true);
    try {
      const r = await fetch(`/api/clients/${clientId}/casos-de-uso`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo, deLaEscala: true, ...cuerpo }),
      });
      const j = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) throw new Error(j?.error ?? "No se pudo sumar el caso de uso.");
      toast.success("Quedó como sugerido en La cuenta › Casos de uso.");
      await cargarCasos();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo sumar el caso de uso.");
    } finally {
      setOcupado(false);
    }
  };

  // Dónde se revisa lo propuesto en otra exploración: la preventa en su página, un proyecto en su Exploración.
  const abrirExp = useCallback(
    (exploracionId: string) => {
      const e = ok?.exploraciones.find((x) => x.id === exploracionId);
      if (!e || e.esLaCuenta) return null;
      return e.proyecto ? (
        <BotonBlanco onClick={() => onAbrirExploracion(e.proyecto!.id)}>Abrir la Exploración</BotonBlanco>
      ) : (
        <Link href={`/sales/exploraciones/${e.id}?pieza=escala`} className="rounded-md border border-line bg-surface px-2.5 py-[5px] text-xs font-medium text-fg-secondary hover:bg-surface-hover hover:text-fg">
          Abrir la preventa
        </Link>
      );
    },
    [ok, onAbrirExploracion],
  );
  const historia = useMemo(() => (ok ? filasDeLaHistoria(ok, cuenta?.exploracion.id ?? null, abrirExp) : []), [ok, cuenta, abrirExp]);

  const encabezado = (acciones?: React.ReactNode) => (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-[22px] font-bold leading-tight text-fg">La escala</h2>
        <p className="mt-1 text-[13px] text-fg-muted">
          La misma escala de la preventa: dónde está la empresa en cada área, de dónde sale cada nivel y cómo se movió desde que nos compró. Para el equipo:
          el cliente no la ve.
        </p>
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </div>
  );

  if (error) {
    return (
      <div className="space-y-6 px-8 pb-10 pt-6">
        {encabezado()}
        <Alert variant="danger">{error}</Alert>
      </div>
    );
  }
  if (!datos) {
    return (
      <div className="space-y-6 px-8 pb-10 pt-6" aria-busy="true">
        {encabezado()}
        <SkeletonPanel minH="min-h-[260px]">
          <SkeletonText lines={4} />
        </SkeletonPanel>
      </div>
    );
  }
  if (datos.estado === "sin-escala") {
    return (
      <div className="space-y-6 px-8 pb-10 pt-6">
        {encabezado()}
        <Alert variant="warning">Todavía no hay una versión publicada de la escala.</Alert>
      </div>
    );
  }

  const niveles = cuenta?.escala.niveles ?? datos.niveles;
  const exploracionDeProyecto = datos.exploraciones.find((e) => e.proyecto && !e.esLaCuenta) ?? null;
  const acciones = (
    <>
      {cuenta && puede.exploracion && !guardando && (
        <BotonBlanco disabled={ocupado} onClick={() => setGuardando(true)}>
          Guardar esta versión
        </BotonBlanco>
      )}
      {datos.sePuedeProbar && (cuenta || datos.exploraciones.length > 0) && (
        <Link
          href={`/escala/probar?cliente=${clientId}`}
          className="text-[13px] font-medium text-brand hover:underline"
          title="Compara el nivel que da la escala con el que crees tú o su CSE. Así se prueba la escala antes de publicar la próxima versión."
        >
          Probar la escala
        </Link>
      )}
    </>
  );

  const panelDeGuardar = guardando && cuenta && (
    <section aria-label="Guardar esta versión" className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4">
      <label className="flex flex-col gap-1 text-xs text-fg-muted">
        De qué momento es
        <Select value={momento} disabled={ocupado} onChange={(e) => setMomento(e.target.value as MomentoDeLaVersion)}>
          {MOMENTOS_DE_LA_VERSION.map((m) => (
            <option key={m} value={m}>
              {ETIQUETA_DEL_MOMENTO[m]}
            </option>
          ))}
        </Select>
      </label>
      {datos.ventas.length > 0 && (
        <label className="flex min-w-[220px] flex-col gap-1 text-xs text-fg-muted">
          Venta
          <Select value={ventaParaGuardar ?? ""} disabled={ocupado} onChange={(e) => setVentaParaGuardar(e.target.value || undefined)}>
            <option value="">La del proyecto, si la tiene</option>
            {datos.ventas.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nombre} · ganada el {elDia(v.fechaCierre)}
              </option>
            ))}
          </Select>
        </label>
      )}
      <BotonBlanco disabled={ocupado} onClick={() => void guardarVersion()}>
        Guardar
      </BotonBlanco>
      <BotonEnlace onClick={() => setGuardando(false)}>Cancelar</BotonEnlace>
      <p className="basis-full text-xs text-fg-muted">
        «Al vender» la fecha con el día en que se ganó la venta; «al arrancar», con el arranque del proyecto. Así se ve cuánto se movió la empresa desde que nos
        compró.
      </p>
    </section>
  );

  return (
    <div className="space-y-6 px-8 pb-10 pt-6">
      {encabezado(acciones)}
      {panelDeGuardar}
      {cuenta ? (
        <LienzoDeExploracion
          key={cuenta.exploracion.id}
          inicial={cuenta.exploracion}
          escala={cuenta.escala}
          puedeEditar={puede.exploracion}
          puedeProponer={false}
          cuenta={{
            alRefrescar: () => void cargar(),
            agente: <AgenteDeLaCuenta clientId={clientId} datos={datos} />,
            despues: (
              <>
                <AlDiaConLaEscala alCambiar={() => void cargar()} />
                <QueSigueDeLaCuenta slot={slotDelPanel} accion={exploracionDeProyecto ? abrirExp(exploracionDeProyecto.id) : null} />
                <CaminoDeCrecimiento casos={casos} ocupado={ocupado} onSumar={(t, c) => void sumarCaso(t, c)} />
                <HistoriaDeLaEscala filas={historia} niveles={niveles} />
              </>
            ),
          }}
        />
      ) : abriendo ? (
        <SkeletonPanel minH="min-h-[420px]">
          <SkeletonText lines={4} />
        </SkeletonPanel>
      ) : (
        <>
          <EmptyState
            title="La escala de la cuenta todavía no está abierta"
            description={
              puede.exploracion
                ? "Al abrirla parte de lo ya medido en la preventa o en la Exploración de un proyecto, si lo hay. Después, «Actualizar escala» lee todo lo que Nexus sabe y propone dónde está; tú usas lo que esté bien."
                : historia.length
                  ? "La abre quien puede trabajar la exploración del cliente. Abajo está lo medido en la preventa y en cada proyecto."
                  : "La abre quien puede trabajar la exploración del cliente."
            }
            action={
              puede.exploracion ? (
                <BotonAzul disabled={abriendo} onClick={() => void abrir()}>
                  Abrir la escala
                </BotonAzul>
              ) : undefined
            }
          />
          <HistoriaDeLaEscala filas={historia} niveles={niveles} />
        </>
      )}
    </div>
  );
}
