"use client";

/**
 * components/clients/EscalaDeLaCuenta.tsx — La cuenta › La escala (2026-10-12, pedido de Elías; ficha B, 2026-10-17;
 * «Actualizar escala», 2026-10-18).
 *
 * Dónde está la empresa en cada área de la escala, venga o no de una preventa, para el EQUIPO (el cliente no la ve):
 *   · «Actualizar escala»: se elige sobre qué se ubica (un proyecto, la preventa o la cuenta entera) y con qué venta, y
 *     el agente lee TODO lo que Nexus sabe (lo vendido, las reuniones, las tareas, el cronograma, la memoria, HubSpot) y
 *     PROPONE niveles. Lo dispara una persona, por cliente: nunca corre solo ni para todos;
 *   · lo propuesto se usa acá mismo, uno por uno o todos, por el PATCH de la exploración (el mismo escritor de siempre,
 *     que deja la versión del día). Lo propuesto nunca entra a la historia; lo confirmado, sí;
 *   · con qué edición y perfil se mide, por qué, qué cambia frente a la general y un clic para corregirlo;
 *   · cada nivel con DE DÓNDE SALE: la fuente, la frase del cliente y el porqué;
 *   · la escala en el tiempo, amarrada a la venta: cada versión dice de qué venta y de qué momento es («al vender»,
 *     «al arrancar», «hoy»), y qué cambió desde la anterior;
 *   · el camino de crecimiento: qué sigue y los casos de la biblioteca que lo mueven.
 * Datos: GET/POST /api/clients/[id]/escala (lib/exploraciones/escala-de-la-empresa.ts, posicionar.ts y
 * versiones-de-la-escala.ts).
 */
import Link from "next/link";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, EmptyState, Select, useToast } from "@/components/ui";
import { SkeletonPanel, SkeletonText } from "@/components/ui/Skeleton";
import { BotonAzul, BotonBlanco, BotonEnlace, IconoDeSugerencia, QueSigue, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { PUNTO_DE_NIVEL, nombreDe } from "@/components/escala/niveles";
import { caminoDeCrecimiento } from "@/lib/casos-de-uso/camino";
import type { EscalaDeLaEmpresa, ExploracionDeLaEmpresa, PosicionDeLaEmpresa } from "@/lib/exploraciones/escala-de-la-empresa";
import { cambiosEntreFotos, deDondeSaleElNivel, ETIQUETA_DEL_ORIGEN, fraseDelCambio, huellaDeLaFoto, type AreaDeLaFoto, type FotoDeLaEscala } from "@/lib/exploraciones/foto-de-la-escala";
import {
  ETIQUETA_DEL_MOMENTO,
  MOMENTOS_DE_LA_VERSION,
  NOMBRE_DEL_CIERRE,
  NOMBRE_DEL_DESPUES,
  type MomentoDeLaVersion,
  type NivelPropuesto,
} from "@/lib/exploraciones/posicionar";
import type { VersionGuardada } from "@/lib/exploraciones/versiones-de-la-escala";
import { CIERRES, DESPUES, type Cierre, type Despues, type Letra } from "@/lib/escala/documento/tipos";

type Datos = EscalaDeLaEmpresa & { puede?: { preventa: boolean; exploracion: boolean } };
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
  /** El día que se lee al lado del título: el de la posición (puede ser del pasado). */
  fecha: string;
  edicion: string | null;
  areas: AreaDeLaFoto[];
  exploracionId: string | null;
  /** Contra qué se mide «qué cambió». */
  anterior: { fecha: string; foto: FotoDeLaEscala } | null;
}

/** De dónde sale una posición: la preventa, la cuenta entera («Información del cliente») o la Exploración de un proyecto. */
const deDondeEn = (datos: Ok) => (p: { proyecto: { id: string; nombre: string } | null }) =>
  !p.proyecto ? "La escala de la preventa" : p.proyecto.id === datos.contenedorId ? "La escala de la cuenta" : `La Exploración de «${p.proyecto.nombre}»`;

function vistas(datos: Ok): Vista[] {
  const deDonde = deDondeEn(datos);
  const cuandoDe = (v: VersionGuardada) => (v.diaDeLaPosicion ? `${v.diaDeLaPosicion}T12:00:00-06:00` : v.fecha);
  const deVersion = (v: VersionGuardada, i: number, todas: VersionGuardada[]): Vista => {
    const previa = todas.slice(i + 1).find((x) => x.exploracionId === v.exploracionId) ?? todas[i + 1] ?? null;
    const origen = v.nota && v.creadoPorEmail === "sistema" ? "Primera versión" : ETIQUETA_DEL_ORIGEN[v.origen];
    return {
      clave: v.id,
      titulo: [v.momento ? ETIQUETA_DEL_MOMENTO[v.momento] : null, origen + (v.ciclo ? ` · ciclo ${v.ciclo.numero}` : ""), v.venta ? `venta «${v.venta.nombre}»` : null, deDonde(v)]
        .filter(Boolean)
        .join(" · "),
      fecha: cuandoDe(v),
      edicion: v.foto.edicion,
      areas: v.foto.areas,
      exploracionId: v.exploracionId,
      anterior: previa ? { fecha: cuandoDe(previa), foto: previa.foto } : null,
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
      anterior: ultima ? { fecha: cuandoDe(ultima), foto: ultima.foto } : null,
    };
  });
  return [...hoy, ...datos.versiones.map(deVersion)];
}

/** Lo que propuso el agente en una exploración, para usarlo acá mismo. Nada se confirma solo. */
function LoQuePropone({
  exp,
  deDonde,
  niveles,
  puedeUsar,
  ocupado,
  onCambiar,
}: {
  exp: ExploracionDeLaEmpresa;
  /** «La Exploración de «X»», «La escala de la cuenta»: dónde queda lo que se usa. */
  deDonde: string;
  niveles: Niveles;
  puedeUsar: boolean;
  ocupado: boolean;
  onCambiar: (operaciones: Record<string, unknown>[], aviso: string) => Promise<void>;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);
  if (!exp.propuestos.length) return null;
  const todos = exp.propuestos;
  return (
    <section aria-label="Lo que propone el agente" className="flex flex-col gap-2 rounded-xl border border-info-line bg-info-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-[13px] text-fg">
          <IconoDeSugerencia className="h-4 w-4 text-brand" />
          El agente propone {todos.length === 1 ? "un nivel" : `${todos.length} niveles`} en {deDonde}. Nada se confirma solo: lo que uses queda en la historia.
        </p>
        {puedeUsar && (
          <BotonAzul
            disabled={ocupado}
            onClick={() => void onCambiar([{ op: "usarVarias", items: todos.map((p) => ({ itemId: p.itemId })) }], `Usaste ${todos.length === 1 ? "el nivel" : `los ${todos.length} niveles`}.`)}
          >
            {todos.length === 1 ? "Usar el nivel" : `Usar los ${todos.length}`}
          </BotonAzul>
        )}
      </div>
      <ul className="flex flex-col gap-1.5">
        {todos.map((p: NivelPropuesto) => {
          const abierto = abierta === p.itemId;
          return (
            <li key={p.itemId} className="flex flex-col gap-1 rounded-lg border border-line bg-surface px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 text-[13px] text-fg-secondary">
                  <span className="text-fg-muted">{p.areaNombre} ·</span> {p.dimensionNombre}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {p.actual && p.actual !== p.nivel && (
                    <span className="flex items-center gap-1 text-xs text-fg-muted">
                      <Nivel letra={p.actual} niveles={niveles} /> →
                    </span>
                  )}
                  <Nivel letra={p.nivel} niveles={niveles} hipotesis={p.hipotesis} />
                  {puedeUsar && (
                    <>
                      <BotonEnlace disabled={ocupado} onClick={() => void onCambiar([{ op: "descartar", itemIds: [p.itemId] }], "Descartado: no se vuelve a proponer.")}>
                        Descartar
                      </BotonEnlace>
                      <BotonBlanco disabled={ocupado} onClick={() => void onCambiar([{ op: "usar", itemId: p.itemId }], "Nivel usado.")}>
                        Usar
                      </BotonBlanco>
                    </>
                  )}
                </span>
              </div>
              {p.porQue && <p className="text-[13px] text-fg-secondary">{p.porQue}</p>}
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
                {p.hipotesis && <ChipDeClase clase="hipotesis" />}
                <span>De dónde sale: {p.fuentes.join(" · ") || "sin fuente"}</span>
                {(p.cita || p.descripcionDelNivel) && (
                  <BotonEnlace onClick={() => setAbierta(abierto ? null : p.itemId)} aria-expanded={abierto}>
                    {abierto ? "Ocultar" : "Ver la frase y el nivel"}
                  </BotonEnlace>
                )}
              </div>
              {abierto && (
                <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface-muted px-3 py-2">
                  {p.cita && <p className="text-[13px] italic text-fg-secondary">«{p.cita}»</p>}
                  {p.descripcionDelNivel && (
                    <p className="text-xs text-fg-muted">
                      {nombreDe(niveles, p.nivel)}, con las palabras de su industria: {p.descripcionDelNivel}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** «Se mide con la edición X y el perfil Y, porque…», con lo que cambia frente a la general y un clic para corregirlo. */
function ConQueSeMide({
  exp,
  ediciones,
  puedeCorregir,
  ocupado,
  onCambiar,
}: {
  exp: ExploracionDeLaEmpresa;
  ediciones: { slug: string; nombre: string }[];
  puedeCorregir: boolean;
  ocupado: boolean;
  onCambiar: (operaciones: Record<string, unknown>[], aviso: string) => Promise<void>;
}) {
  const m = exp.modelo;
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [edicion, setEdicion] = useState(m.edicion?.slug ?? "");
  const [cierre, setCierre] = useState<Cierre | "">(m.cierre ?? "");
  const [despues, setDespues] = useState<Despues | "">(m.despues ?? "");
  const guardar = async () => {
    const ops: Record<string, unknown>[] = [];
    if ((edicion || null) !== (m.edicion?.slug ?? null)) ops.push({ op: "edicion", edicion: edicion || null });
    // Elegir la edición trae su perfil habitual; el perfil que se eligió a mano va después y gana.
    if (cierre && despues && (cierre !== m.cierre || despues !== m.despues || ops.length)) ops.push({ op: "perfil", cierre, despues });
    if (!ops.length) {
      setCorrigiendo(false);
      return;
    }
    await onCambiar(ops, "Listo: la escala se lee con la edición y el perfil nuevos.");
    setCorrigiendo(false);
  };
  return (
    <section aria-label="Con qué se mide" className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-fg">{m.titulo}</p>
          <p className="mt-0.5 text-[13px] text-fg-secondary">{m.porQue}</p>
        </div>
        <span className="flex items-center gap-2">
          {m.quien && (
            <span className="rounded-full border border-line bg-surface-muted px-2 py-px text-[11px] text-fg-muted">{m.quien === "persona" ? "La eligió una persona" : "Automática"}</span>
          )}
          {puedeCorregir && !corrigiendo && <BotonBlanco onClick={() => setCorrigiendo(true)}>Corregir</BotonBlanco>}
        </span>
      </div>
      {m.queCambia.length > 0 && (
        <ul className="flex list-disc flex-col gap-0.5 pl-5 text-[13px] text-fg-secondary">
          {m.queCambia.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      {m.habitualDistinto && <p className="text-xs text-fg-muted">{m.habitualDistinto}</p>}
      {corrigiendo && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface-muted p-3">
          <label className="flex min-w-[200px] flex-col gap-1 text-xs text-fg-muted">
            Industria
            <Select value={edicion} disabled={ocupado} onChange={(e) => setEdicion(e.target.value)}>
              <option value="">Escala general</option>
              {ediciones.map((e) => (
                <option key={e.slug} value={e.slug}>
                  {e.nombre}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            Cómo vende
            <Select value={cierre} disabled={ocupado} onChange={(e) => setCierre(e.target.value as Cierre | "")}>
              <option value="">Sin elegir</option>
              {CIERRES.map((c) => (
                <option key={c} value={c}>
                  {NOMBRE_DEL_CIERRE[c]}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            Después de la venta
            <Select value={despues} disabled={ocupado} onChange={(e) => setDespues(e.target.value as Despues | "")}>
              <option value="">Sin elegir</option>
              {DESPUES.map((d) => (
                <option key={d} value={d}>
                  {NOMBRE_DEL_DESPUES[d]}
                </option>
              ))}
            </Select>
          </label>
          <BotonBlanco disabled={ocupado || (!!cierre !== !!despues)} onClick={() => void guardar()}>
            Guardar
          </BotonBlanco>
          <BotonEnlace onClick={() => setCorrigiendo(false)}>Cancelar</BotonEnlace>
          <p className="basis-full text-xs text-fg-muted">
            Desde ahora el agente ya no la cambia. Las preguntas de la exploración y la lectura de cada nivel usan esta edición y este perfil.
          </p>
        </div>
      )}
    </section>
  );
}

export default function EscalaDeLaCuenta({
  clientId,
  slotDelPanel,
  onAbrirExploracion,
}: {
  clientId: string;
  slotDelPanel: HTMLElement | null;
  /** Abre la Exploración de un proyecto (ahí también se confirma cada nivel con su evidencia). */
  onAbrirExploracion: (projectId: string) => void;
}) {
  const toast = useToast();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elegida, setElegida] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [corrida, setCorrida] = useState<{ exploracionId: string } | null>(null);
  const [fase, setFase] = useState<string | null>(null);
  const [casos, setCasos] = useState<{ titulos: Set<string>; puedeEditar: boolean }>({ titulos: new Set(), puedeEditar: false });
  // «Actualizar escala»: sobre qué se ubica y con qué venta.
  const [actualizando, setActualizando] = useState(false);
  const [objetivo, setObjetivo] = useState<string | null>(null);
  const [ventaId, setVentaId] = useState<string | null | undefined>(undefined);
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
    const desde = Date.now();
    let fallos = 0;
    // Si la consulta falla 5 veces seguidas, o pasan 10 minutos, se deja de mirar y se avisa: no se pregunta para siempre.
    const rendirse = (mensaje: string) => {
      parar = true;
      setFase(null);
      setCorrida(null);
      toast.error(mensaje);
    };
    const vuelta = async () => {
      while (!parar && vivo.current) {
        await new Promise((r) => setTimeout(r, 3000));
        if (parar || !vivo.current) break;
        if (Date.now() - desde > 10 * 60_000) {
          rendirse("El agente sigue sin terminar después de 10 minutos. Recarga la página en un rato para ver lo que propuso.");
          break;
        }
        const r = await fetch(`/api/sales/exploraciones/${corrida.exploracionId}/agente`, { cache: "no-store" }).catch(() => null);
        const j = r?.ok
          ? ((await r.json().catch(() => null)) as { corrida?: { estado: string; fase: string | null; propuestos: number | null; error: string | null } | null } | null)
          : null;
        const c = j?.corrida;
        if (!c) {
          fallos += 1;
          if (fallos >= 5) {
            rendirse("No se pudo saber cómo va el agente. Recarga la página en un rato para ver lo que propuso.");
            break;
          }
          continue;
        }
        fallos = 0;
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
              ? `El agente propuso ${c.propuestos} ${c.propuestos === 1 ? "nivel" : "niveles"}: revísalos acá abajo y usa los que estén bien.`
              : "El agente terminó sin nada nuevo: o ya está todo confirmado, o no hay nada que haya dicho el cliente para respaldar un nivel.",
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

  const pedir = async (cuerpo: Record<string, unknown>): Promise<void> => {
    setOcupado(true);
    try {
      const r = await fetch(`/api/clients/${clientId}/escala`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
      const j = (await r.json().catch(() => null)) as { error?: string; igual?: boolean; exploracionId?: string } | null;
      if (!r.ok) throw new Error(j?.error ?? "No se pudo completar el pedido.");
      if (cuerpo.accion === "guardar") {
        toast.success(j?.igual ? "Esta versión ya estaba guardada: nada cambió desde la última." : "Versión guardada.");
        setGuardando(false);
        await cargar();
      } else if (j?.exploracionId) {
        toast.info("El agente está leyendo todo lo que Nexus sabe de la empresa…");
        setActualizando(false);
        setFase("Empezando…");
        setCorrida({ exploracionId: j.exploracionId });
        // Lo que proponga se ve en la exploración sobre la que se ubicó.
        setElegida(`hoy:${j.exploracionId}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo completar el pedido.");
    } finally {
      setOcupado(false);
    }
  };

  /** Usar, descartar o corregir la edición: por el PATCH de la exploración (el mismo escritor de La escala de la exploración). */
  const cambiarEn = (exp: ExploracionDeLaEmpresa) => async (operaciones: Record<string, unknown>[], aviso: string) => {
    setOcupado(true);
    try {
      const r = await fetch(`/api/sales/exploraciones/${exp.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: exp.version, operaciones }),
      });
      const j = (await r.json().catch(() => null)) as { error?: string } | null;
      if (r.status === 409) {
        toast.error("Alguien cambió la escala mientras la mirabas. Se cargó lo último: vuelve a intentarlo.");
      } else if (!r.ok) {
        throw new Error(j?.error ?? "No se pudo guardar.");
      } else {
        toast.success(aviso);
      }
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
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
        <p className="mt-1 text-[13px] text-fg-muted">Dónde está la empresa en cada área, de dónde sale cada nivel y cómo se movió desde que nos compró. Para el equipo: el cliente no la ve.</p>
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
  const puedeTrabajar = (e: { origen: "preventa" | "proyecto" } | null) => !!e && (e.origen === "preventa" ? puede.preventa : puede.exploracion);

  // Sobre qué se ubica: lo elegido, o el que sugiere el servidor. La venta: la elegida o la que sugiere ese objetivo.
  const objetivoActual = datos.objetivos.find((o) => o.clave === objetivo) ?? datos.objetivos.find((o) => o.clave === datos.porDefecto) ?? null;
  const ventaActual = ventaId === undefined ? (objetivoActual?.ventaSugerida ?? null) : ventaId;
  const puedeActualizar = (o: typeof objetivoActual) => !!o && (o.tipo === "preventa" ? puede.preventa : puede.exploracion);

  // La exploración que se trabaja: la de lo que se mira o, si no, la del objetivo elegido, o la más reciente.
  const exp: ExploracionDeLaEmpresa | null =
    datos.exploraciones.find((e) => e.id === vista?.exploracionId) ??
    datos.exploraciones.find((e) => e.id === objetivoActual?.exploracionId) ??
    datos.exploraciones[0] ??
    null;
  const abrirExp = (e: ExploracionDeLaEmpresa) =>
    e.esLaCuenta ? null : e.proyecto ? (
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
      {vista?.exploracionId && vista.clave.startsWith("hoy:") && puedeTrabajar(datos.exploraciones.find((e) => e.id === vista.exploracionId) ?? null) && !guardando && (
        <BotonBlanco disabled={ocupado} onClick={() => setGuardando(true)}>
          Guardar esta versión
        </BotonBlanco>
      )}
      {(puede.exploracion || puede.preventa) && !actualizando && (
        <BotonAzul disabled={ocupado || !!corrida} onClick={() => setActualizando(true)} title="El agente lee todo lo que Nexus sabe de la empresa y propone niveles. Nada se confirma solo.">
          Actualizar escala
        </BotonAzul>
      )}
    </>
  );

  const nombreDeVenta = (v: { nombre: string; fechaCierre: string }) => `${v.nombre} · ganada el ${elDia(v.fechaCierre)}`;
  const selectorDeVenta = (valor: string | null, cambiar: (v: string | null) => void, primera = "Sin una venta en particular") => (
    <label className="flex min-w-[220px] flex-col gap-1 text-xs text-fg-muted">
      Venta
      <Select value={valor ?? ""} disabled={ocupado} onChange={(e) => cambiar(e.target.value || null)}>
        <option value="">{primera}</option>
        {datos.ventas.map((v) => (
          <option key={v.id} value={v.id}>
            {nombreDeVenta(v)}
          </option>
        ))}
      </Select>
    </label>
  );

  const panelDeActualizar = actualizando && (
    <section aria-label="Actualizar escala" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <div>
        <p className="text-[14px] font-semibold text-fg">Actualizar escala</p>
        <p className="mt-0.5 text-[13px] text-fg-secondary">
          El agente lee todo lo que Nexus sabe de la empresa: lo vendido (las ventas, la propuesta y el handoff), las reuniones ya leídas en resumen, las
          tareas, el cronograma, los cuestionarios, el test, HubSpot y la memoria. Propone niveles solo con lo que dijo o hizo el cliente, y nada se confirma
          solo. No marca nada como leído ni cambia la guía de la exploración. Cuesta entre US$0,05 y US$0,20.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[240px] flex-col gap-1 text-xs text-fg-muted">
          Sobre qué se ubica
          <Select
            value={objetivoActual?.clave ?? ""}
            disabled={ocupado}
            onChange={(e) => {
              setObjetivo(e.target.value);
              setVentaId(undefined);
            }}
          >
            {datos.objetivos.map((o) => (
              <option key={o.clave} value={o.clave}>
                {o.etiqueta}
                {o.detalle ? ` · ${o.detalle}` : ""}
              </option>
            ))}
          </Select>
        </label>
        {datos.ventas.length > 0 && selectorDeVenta(ventaActual, setVentaId)}
        <BotonAzul
          disabled={ocupado || !!corrida || !puedeActualizar(objetivoActual)}
          onClick={() => void pedir({ accion: "actualizar", objetivo: objetivoActual?.clave, ventaId: ventaActual })}
          title={puedeActualizar(objetivoActual) ? undefined : "No tienes permiso para trabajar esa exploración."}
        >
          Actualizar
        </BotonAzul>
        <BotonEnlace onClick={() => setActualizando(false)}>Cancelar</BotonEnlace>
      </div>
      {objetivoActual?.tipo === "cuenta" && !objetivoActual.exploracionId && (
        <p className="text-xs text-fg-muted">Como no hay un proyecto en particular, lo propuesto queda en la escala de la cuenta (dentro de «Información del cliente»).</p>
      )}
    </section>
  );

  const panelDeGuardar = guardando && vista?.exploracionId && (
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
      {datos.ventas.length > 0 && selectorDeVenta(ventaParaGuardar ?? null, (v) => setVentaParaGuardar(v ?? undefined), "La del proyecto, si la tiene")}
      <BotonBlanco
        disabled={ocupado}
        onClick={() => void pedir({ accion: "guardar", exploracionId: vista.exploracionId, momento, ...(ventaParaGuardar ? { ventaId: ventaParaGuardar } : {}) })}
      >
        Guardar
      </BotonBlanco>
      <BotonEnlace onClick={() => setGuardando(false)}>Cancelar</BotonEnlace>
      <p className="basis-full text-xs text-fg-muted">
        «Al vender» la fecha con el día en que se ganó la venta; «al arrancar», con el arranque del proyecto. Así se ve cuánto se movió la empresa desde que nos
        compró.
      </p>
    </section>
  );

  const cambios = vista && vista.anterior ? cambiosEntreFotos(vista.anterior.foto, { formato: 1, escalaVersion: null, edicion: vista.edicion, areas: vista.areas }) : [];
  const camino = vista ? caminoDeCrecimiento(vista.areas, nombre) : [];

  const propuestosEnTotal = datos.exploraciones.reduce((n, e) => n + e.propuestos.length, 0);
  const queSigue = propuestosEnTotal
    ? `El agente propuso ${propuestosEnTotal === 1 ? "un nivel" : `${propuestosEnTotal} niveles`}: úsalos acá o descártalos.`
    : !vista
      ? "La empresa todavía no está posicionada: toca «Actualizar escala» para que el agente proponga dónde está con lo que Nexus ya sabe."
      : vista.areas.some((a) => a.conNivel < a.aplican)
        ? `Faltan dimensiones sin nivel en ${vista.areas.filter((a) => a.conNivel < a.aplican).map((a) => a.nombre).join(" y ")}.`
        : vista.areas.some((a) => a.conEvidencia < a.conNivel)
          ? "Hay niveles que son hipótesis: confírmalos con el cliente en la próxima sesión."
          : null;

  return (
    <div className="space-y-6 px-8 pb-10 pt-6">
      {encabezado(acciones)}
      {slotDelPanel && queSigue && createPortal(<QueSigue accion={exp ? abrirExp(exp) : null}>{queSigue}</QueSigue>, slotDelPanel)}
      {panelDeActualizar}
      {panelDeGuardar}
      {datos.exploraciones
        .filter((e) => e.propuestos.length > 0)
        .map((e) => (
          <LoQuePropone key={e.id} exp={e} deDonde={deDondeEn(datos)(e).replace(/^La /, "la ")} niveles={niveles} puedeUsar={puedeTrabajar(e)} ocupado={ocupado} onCambiar={cambiarEn(e)} />
        ))}
      {exp && <ConQueSeMide key={`${exp.id}:${exp.version}`} exp={exp} ediciones={datos.ediciones} puedeCorregir={puedeTrabajar(exp)} ocupado={ocupado} onCambiar={cambiarEn(exp)} />}

      {!vista ? (
        <EmptyState
          title="La empresa todavía no está posicionada en la escala"
          description="Sin una posición con fecha no hay de dónde partir ni cómo medir cuánto se movió. «Actualizar escala» lee lo vendido, las reuniones, las tareas y todo lo que Nexus sabe, y propone dónde está; tú usas lo que esté bien."
          action={
            (puede.exploracion || puede.preventa) && !actualizando ? (
              <BotonAzul disabled={ocupado || !!corrida} onClick={() => setActualizando(true)}>
                Actualizar escala
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
              <p className="text-xs text-fg-muted">
                Se guarda una versión al confirmar un nivel (una por día), al presentar el diagnóstico de un ciclo y con «Guardar esta versión», que se puede
                fechar «al vender» o «al arrancar». Lo que propone el agente no entra hasta que lo usas.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
