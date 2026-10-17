"use client";

/**
 * components/clients/EscalaDeLaCuenta.tsx — La cuenta › La escala (2026-10-12, pedido de Elías; ficha B, 2026-10-17).
 *
 * Dónde está la empresa en cada área de la escala, venga o no de una preventa, para el EQUIPO (el cliente no la ve):
 *   · cada nivel con DE DÓNDE SALE: la fuente, la frase del cliente y el porqué;
 *   · la escala en el tiempo: cada versión con su fecha (al confirmar un nivel, al presentar el diagnóstico de un
 *     ciclo, o «Guardar esta versión»), y qué cambió desde la anterior;
 *   · «Regenerar con el agente» (lee todo lo que Nexus sabe y PROPONE niveles: se usan en La escala de la exploración) y
 *     «Activar el agente» en un proyecto sin exploración;
 *   · el camino de crecimiento: qué sigue en la escala, por qué, y los casos de la biblioteca que lo mueven, para
 *     sumarlos como sugeridos a los casos de uso de la cuenta.
 * Datos: GET/POST /api/clients/[id]/escala (lib/exploraciones/escala-de-la-empresa.ts y versiones-de-la-escala.ts).
 */
import Link from "next/link";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, EmptyState, useToast } from "@/components/ui";
import { SkeletonPanel, SkeletonText } from "@/components/ui/Skeleton";
import { BotonAzul, BotonBlanco, BotonEnlace, IconoDeSugerencia, QueSigue, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { PUNTO_DE_NIVEL, nombreDe } from "@/components/escala/niveles";
import { caminoDeCrecimiento } from "@/lib/casos-de-uso/camino";
import type { EscalaDeLaEmpresa, PosicionDeLaEmpresa } from "@/lib/exploraciones/escala-de-la-empresa";
import { cambiosEntreFotos, deDondeSaleElNivel, ETIQUETA_DEL_ORIGEN, fraseDelCambio, huellaDeLaFoto, type AreaDeLaFoto, type FotoDeLaEscala } from "@/lib/exploraciones/foto-de-la-escala";
import type { VersionGuardada } from "@/lib/exploraciones/versiones-de-la-escala";
import type { Letra } from "@/lib/escala/documento/tipos";

type Datos = EscalaDeLaEmpresa & { puede?: { preventa: boolean; exploracion: boolean } };
type Niveles = { letra: Letra; nombre: string }[];

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** La fecha en la hora de Costa Rica (UTC-6), armada a mano: así servidor y navegador dicen lo mismo. */
function fecha(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 6 * 3_600_000);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
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

const deDonde = (p: { proyecto: { nombre: string } | null }) => (p.proyecto ? `La Exploración de «${p.proyecto.nombre}»` : "La escala de la preventa");

/** Un área con cada dimensión y de dónde sale su nivel. */
function AreaConEvidencia({ a, niveles }: { a: AreaDeLaFoto; niveles: Niveles }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-fg">{a.nombre}</h3>
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
      <p className="text-xs text-fg-muted">
        {a.conNivel} de {a.aplican} dimensiones con nivel · {a.conEvidencia} con evidencia. El área queda en su capa más baja, y la capa en su dimensión más
        débil. Toca una dimensión para ver de dónde sale.
      </p>
    </section>
  );
}

/** La foto que se mira: la de hoy de una exploración o una versión guardada. */
interface Vista {
  clave: string;
  titulo: string;
  fecha: string;
  edicion: string | null;
  areas: AreaDeLaFoto[];
  exploracionId: string | null;
  /** Contra qué se mide «qué cambió». */
  anterior: { fecha: string; foto: FotoDeLaEscala } | null;
}

function vistas(datos: Extract<Datos, { estado: "ok" }>): Vista[] {
  const deVersion = (v: VersionGuardada, i: number, todas: VersionGuardada[]): Vista => {
    const previa = todas.slice(i + 1).find((x) => x.exploracionId === v.exploracionId) ?? todas[i + 1] ?? null;
    return {
      clave: v.id,
      titulo: `${v.nota && v.creadoPorEmail === "sistema" ? "Primera versión" : ETIQUETA_DEL_ORIGEN[v.origen]}${v.ciclo ? ` · ciclo ${v.ciclo.numero}` : ""} · ${deDonde(v)}`,
      fecha: v.fecha,
      edicion: v.foto.edicion,
      areas: v.foto.areas,
      exploracionId: v.exploracionId,
      anterior: previa ? { fecha: previa.fecha, foto: previa.foto } : null,
    };
  };
  const hoy = datos.posiciones.map((p: PosicionDeLaEmpresa): Vista => {
    // Contra la última versión de esa exploración que dice algo distinto (la del día puede ser igual a la de hoy).
    const actual = huellaDeLaFoto({ formato: 1, escalaVersion: null, edicion: p.edicion, areas: p.areas });
    const ultima = datos.versiones.find((v) => v.exploracionId === p.exploracionId && huellaDeLaFoto(v.foto) !== actual);
    return {
      clave: `hoy:${p.exploracionId}`,
      titulo: `Hoy · ${deDonde(p)}`,
      fecha: p.fecha,
      edicion: p.edicion,
      areas: p.areas,
      exploracionId: p.exploracionId,
      anterior: ultima ? { fecha: ultima.fecha, foto: ultima.foto } : null,
    };
  });
  return [...hoy, ...datos.versiones.map(deVersion)];
}

export default function EscalaDeLaCuenta({
  clientId,
  slotDelPanel,
  onAbrirExploracion,
}: {
  clientId: string;
  slotDelPanel: HTMLElement | null;
  /** Abre la Exploración de un proyecto (ahí se confirma cada nivel con su evidencia). */
  onAbrirExploracion: (projectId: string) => void;
}) {
  const toast = useToast();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elegida, setElegida] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [corrida, setCorrida] = useState<{ exploracionId: string; projectId: string | null } | null>(null);
  const [fase, setFase] = useState<string | null>(null);
  const [casos, setCasos] = useState<{ titulos: Set<string>; puedeEditar: boolean }>({ titulos: new Set(), puedeEditar: false });

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

  // Sigue la corrida del agente hasta que termine (cada 3 s), y después recarga.
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);
  useEffect(() => {
    if (!corrida) return;
    let parar = false;
    const vuelta = async () => {
      while (!parar && vivo.current) {
        await new Promise((r) => setTimeout(r, 3000));
        const r = await fetch(`/api/sales/exploraciones/${corrida.exploracionId}/agente`, { cache: "no-store" }).catch(() => null);
        const j = (await r?.json().catch(() => null)) as { corrida?: { estado: string; fase: string | null; propuestos: number | null; error: string | null } | null } | null;
        const c = j?.corrida;
        if (!c) continue;
        if (c.estado === "RUNNING") {
          setFase(c.fase);
          continue;
        }
        parar = true;
        setFase(null);
        setCorrida(null);
        if (c.estado === "ERROR") toast.error(c.error ?? "El agente no pudo terminar.");
        else
          toast.success(
            c.propuestos
              ? `El agente propuso ${c.propuestos} ${c.propuestos === 1 ? "cosa" : "cosas"}: revísalas y úsalas en La escala de la exploración.`
              : "El agente terminó: no encontró nada nuevo para proponer.",
          );
        void cargar();
      }
    };
    void vuelta();
    return () => {
      parar = true;
    };
  }, [corrida, cargar, toast]);

  const ok = datos && datos.estado === "ok" ? datos : null;
  const lista = useMemo(() => (ok ? vistas(ok) : []), [ok]);
  const vista = lista.find((v) => v.clave === elegida) ?? lista[0] ?? null;

  const pedir = async (cuerpo: Record<string, unknown>, projectId: string | null): Promise<void> => {
    setOcupado(true);
    try {
      const r = await fetch(`/api/clients/${clientId}/escala`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
      const j = (await r.json().catch(() => null)) as { error?: string; igual?: boolean; exploracionId?: string } | null;
      if (!r.ok) throw new Error(j?.error ?? "No se pudo completar el pedido.");
      if (cuerpo.accion === "guardar") {
        toast.success(j?.igual ? "Esta versión ya estaba guardada: nada cambió desde la última." : "Versión guardada.");
        await cargar();
      } else if (j?.exploracionId) {
        toast.info("El agente está leyendo todo lo que Nexus sabe de la empresa…");
        setFase("Empezando…");
        setCorrida({ exploracionId: j.exploracionId, projectId });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo completar el pedido.");
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

  const encabezado = (acciones?: React.ReactNode) => (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-[22px] font-bold leading-tight text-fg">La escala</h2>
        <p className="mt-1 text-[13px] text-fg-muted">Dónde está la empresa en cada área, de dónde sale cada nivel y cómo se movió. Para el equipo: el cliente no la ve.</p>
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

  const puede = datos.puede ?? { preventa: false, exploracion: false };
  const niveles = datos.niveles;
  const nombre = (l: Letra) => nombreDe(niveles, l);
  const proyecto = datos.proyectos[0] ?? null;
  // Desde dónde se regenera: la exploración de lo que se mira o, si no, la más reciente.
  const exp = datos.exploraciones.find((e) => e.id === vista?.exploracionId) ?? datos.exploraciones[0] ?? null;
  const puedeTrabajar = (e: { origen: "preventa" | "proyecto" } | null) => !!e && (e.origen === "preventa" ? puede.preventa : puede.exploracion);
  const sinExploracionEnProyecto = !exp && !!proyecto && puede.exploracion;
  const abrirExp = (e: { id: string; origen: "preventa" | "proyecto"; proyecto: { id: string } | null }) =>
    e.proyecto ? (
      <BotonBlanco onClick={() => onAbrirExploracion(e.proyecto!.id)}>Abrir la Exploración</BotonBlanco>
    ) : (
      <Link href={`/sales/exploraciones/${e.id}?pieza=escala`} className="rounded-md border border-line bg-surface px-2.5 py-[5px] text-xs font-medium text-fg-secondary hover:bg-surface-hover hover:text-fg">
        Abrir la preventa
      </Link>
    );

  const acciones = (
    <>
      {fase && (
        <span className="inline-flex items-center gap-1.5 text-xs text-brand">
          <IconoDeSugerencia className="h-3.5 w-3.5" />
          {fase}
        </span>
      )}
      {exp && puedeTrabajar(exp) && (
        <BotonBlanco
          disabled={ocupado || !!corrida}
          onClick={() => void pedir({ accion: "regenerar", exploracionId: exp.id }, exp.proyecto?.id ?? null)}
          title="El agente lee todo lo que Nexus sabe de la empresa y propone niveles. Nada se confirma solo."
        >
          Regenerar con el agente
        </BotonBlanco>
      )}
      {sinExploracionEnProyecto && (
        <BotonBlanco disabled={ocupado || !!corrida} onClick={() => void pedir({ accion: "activar", projectId: proyecto!.id }, proyecto!.id)}>
          Activar el agente en «{proyecto!.nombre}»
        </BotonBlanco>
      )}
      {vista?.exploracionId && vista.clave.startsWith("hoy:") && puedeTrabajar(datos.exploraciones.find((e) => e.id === vista.exploracionId) ?? null) && (
        <BotonBlanco disabled={ocupado} onClick={() => void pedir({ accion: "guardar", exploracionId: vista.exploracionId }, null)}>
          Guardar esta versión
        </BotonBlanco>
      )}
    </>
  );

  const cambios = vista && vista.anterior ? cambiosEntreFotos(vista.anterior.foto, { formato: 1, escalaVersion: null, edicion: vista.edicion, areas: vista.areas }) : [];
  const camino = vista ? caminoDeCrecimiento(vista.areas, nombre) : [];

  const queSigue = !vista
    ? exp
      ? "Todavía no hay ningún nivel confirmado. Regenera con el agente y confirma lo que proponga en La escala de la exploración."
      : sinExploracionEnProyecto
        ? `La empresa no está posicionada: activa el agente en «${proyecto!.nombre}» para que proponga dónde está con lo que Nexus ya sabe.`
        : "La empresa todavía no está posicionada en la escala."
    : vista.areas.some((a) => a.conNivel < a.aplican)
      ? `Faltan dimensiones sin nivel en ${vista.areas.filter((a) => a.conNivel < a.aplican).map((a) => a.nombre).join(" y ")}.`
      : vista.areas.some((a) => a.conEvidencia < a.conNivel)
        ? "Hay niveles que son hipótesis: confírmalos con el cliente en la próxima sesión."
        : null;

  return (
    <div className="space-y-6 px-8 pb-10 pt-6">
      {encabezado(acciones)}
      {slotDelPanel && queSigue && createPortal(<QueSigue accion={exp ? abrirExp(exp) : null}>{queSigue}</QueSigue>, slotDelPanel)}

      {!vista ? (
        <EmptyState
          title="La empresa todavía no está posicionada en la escala"
          description="Sin una posición con fecha no hay de dónde partir ni cómo medir cuánto se movió. Se posiciona confirmando cada nivel en La escala de la Exploración de un proyecto (o de la preventa), con el cuestionario de la escala o en el Diagnóstico. El agente puede proponer los niveles con lo que Nexus ya sabe."
          action={
            exp ? (
              abrirExp(exp)
            ) : sinExploracionEnProyecto ? (
              <BotonAzul disabled={ocupado} onClick={() => void pedir({ accion: "activar", projectId: proyecto!.id }, proyecto!.id)}>
                Activar el agente en «{proyecto!.nombre}»
              </BotonAzul>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] text-fg-secondary">
              <span className="font-medium text-fg">{vista.titulo}</span> · {fecha(vista.fecha)}
              {vista.edicion ? ` · edición ${vista.edicion}` : ""}
            </p>
            {!vista.clave.startsWith("hoy:") && <BotonEnlace onClick={() => setElegida(null)}>Volver a la de hoy</BotonEnlace>}
          </div>

          {vista.anterior && (
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
          )}

          <div className="grid gap-4 xl:grid-cols-2">
            {vista.areas.map((a) => (
              <AreaConEvidencia key={a.id} a={a} niveles={niveles} />
            ))}
          </div>

          {camino.length > 0 && (
            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-fg">El camino de crecimiento</h3>
                <p className="text-xs text-fg-muted">Qué sigue en la escala y por qué, con los casos de la biblioteca que lo mueven. Sale de esta foto: sin IA.</p>
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
                                      void sumarCaso(c.caso.titulo, {
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
          )}

          {lista.length > 1 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-fg">La escala en el tiempo</h3>
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {lista.map((v) => (
                  <li key={v.clave}>
                    <button
                      type="button"
                      aria-pressed={v.clave === vista.clave}
                      onClick={() => setElegida(v.clave)}
                      className={cn("flex w-full flex-wrap items-baseline justify-between gap-3 px-4 py-2.5 text-left text-[13px] hover:bg-surface-hover", v.clave === vista.clave && "bg-surface-muted")}
                    >
                      <span className="text-fg-secondary">
                        <span className="tabular-nums text-fg">{fecha(v.fecha)}</span> · {v.titulo}
                      </span>
                      <span className="flex flex-wrap gap-3">
                        {v.areas.map((a) => (
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
              <p className="text-xs text-fg-muted">Se guarda una versión al confirmar un nivel (una por día), al presentar el diagnóstico de un ciclo y con «Guardar esta versión».</p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
