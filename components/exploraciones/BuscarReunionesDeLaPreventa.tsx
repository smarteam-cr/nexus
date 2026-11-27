"use client";

/**
 * BuscarReunionesDeLaPreventa — el selector de «+ Agregar sesión» de la exploración (etapa A, 2026-10-09,
 * tablero Agregar.dc.html: «Buscar una reunión»). Hasta ese día era el buscador del «Contexto adicional»
 * y sumaba reuniones a una lista general (`reunionElegida`); ahora es la UNA puerta para agregar
 * sesiones, o para unir una sesión que ya está a su reunión (`modo.tipo === "unir"`).
 *
 * Las secciones, según para qué se abrió (`modo.ver`):
 *   · «Agendadas · próximas 6 semanas»: en tu calendario y en el de quien lleva la exploración, con
 *     alguien de la empresa invitado (en la preventa, también la agenda de HubSpot). Agregada, la sesión se
 *     une a su evento y Nexus espera su transcripción. La de una serie usa solo esa fecha.
 *   · «De la empresa · ya pasaron»: cada una con qué texto dejó (transcripción, solo notas de Gemini o
 *     nada: se lee cuando sumes la minuta). En la preventa, también las grabadas en HubSpot; si la copia de
 *     Meet no tiene transcripción y la reunión está en HubSpot, lo dice (la grabación está allá).
 *   · «Sumado a mano»: una minuta o una sesión que no quedó grabada, para unirla a una sesión a propósito.
 *   · «De tu calendario»: con 3 letras o más se busca en todo tu calendario. Una sin cliente se adopta al
 *     agregarla; una de otro cliente se muestra con su motivo y no se puede usar.
 * Una que ya es sesión lo dice («Ya es la sesión N»). Agregar pasa por el servidor
 * (POST /api/sales/exploraciones/[id]/sesiones), que relee el evento en Google y decide de quién es.
 * Las que ya pasaron se pueden marcar y agregar EN BLOQUE (Elías, 2026-11-17), y de paso pedir que el agente las lea:
 * entran a su cola de lectura, una por corrida y en orden de fecha (lib/exploraciones/cola-de-lectura.ts).
 * En la preventa de un CLIENTE (24 nov, «lo que ya sabemos»), arriba de las que ya pasaron: «Reuniones de trabajo
 * sugeridas», las que Nexus sugiere por cuánto habló el cliente (lib/exploraciones/reuniones-de-trabajo.ts). Se suman como
 * REUNIÓN DE TRABAJO (`deLoQueYaSabemos`): cuentan para ubicar la escala y para el Resumen, y la página del cliente no las
 * presenta como sesiones de diagnóstico. Las de la lista de siempre entran como sesión de diagnóstico.
 */
import { useEffect, useState } from "react";
import { Modal, useToast } from "@/components/ui";
import { BotonAzul, BotonBlanco, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import type { AgendadaDelSelector } from "@/lib/exploraciones/calendario";
import type { ReunionDeLaEmpresa } from "@/lib/exploraciones/fuentes";
import { EQUIPOS } from "@/lib/exploraciones/equipos";
import type { ReunionDeTrabajoSugerida } from "@/lib/exploraciones/reuniones-de-trabajo";
import { partirDeLoQueYaSabemos } from "@/lib/exploraciones/posicionar";
import { diaConAnio, diaConSemana } from "@/lib/exploraciones/fechas";
import { horaDeCostaRica } from "@/lib/exploraciones/inicio";
import { mismaReunion } from "@/lib/exploraciones/lectura";
import { coincideConLaBusqueda, MIN_BUSQUEDA_CALENDARIO } from "@/lib/sessions/candidatas-internas";
import { resumirSala, textoDeSala } from "@/lib/sessions/participantes";
import { useLienzo, type ModoDelSelector } from "./contexto";
import { useCorrida } from "./useCorrida";
import { useSesiones } from "./useSesiones";

interface DelCalendario {
  sessionId: string;
  title: string;
  date: string;
  participants: string[];
  organizerEmail: string | null;
  sinTranscripcion: boolean;
  sinDuenio: boolean;
  soloEquipo?: boolean;
  motivoNoAdoptable: string | null;
  /** «Fue por Zoom» (2026-11-27). Sin el campo (un servidor viejo), de Meet. */
  avisoDePlataforma?: string | null;
  sinNadieDelCliente?: boolean;
}

/** Lo que se dice debajo del título: por dónde fue y si no hubo nadie del cliente (2026-11-27). */
function avisosDeLaFila(s: { avisoDePlataforma?: string | null; sinNadieDelCliente?: boolean }): string[] {
  return [s.avisoDePlataforma ?? null, s.sinNadieDelCliente ? "sin nadie del cliente" : null].filter((x): x is string => !!x);
}

interface RespuestaDeReuniones {
  deLaEmpresa: ReunionDeLaEmpresa[];
  calendario: { sesiones: DelCalendario[]; hayMas: boolean };
  /** En la preventa: las reuniones de HubSpot que ya pasaron. */
  deHubspot?: { id: string; titulo: string; inicio: string; leida: boolean }[];
}

interface RespuestaDeAgendadas {
  agendadas: AgendadaDelSelector[];
  aviso: string | null;
}

/** Una reunión pasada marcada para agregar en bloque: qué se manda, su fecha y, si el agente la puede leer, su id de Meet. */
interface Marcada {
  cuerpo: Agregar;
  fecha: string;
  leer: string | null;
}

/** Lo que se manda a POST …/sesiones (sin `paraSesionId`, que pone el modo). */
type Agregar =
  | { tipo: "agendada"; evento: { id: string; calendario: string; serie?: boolean } }
  | { tipo: "agendada"; origen: "hubspot"; sessionId: string }
  | { tipo: "pasada"; sessionId: string; deLoQueYaSabemos?: true }
  | { tipo: "pasada"; origen: "hubspot" | "documento"; sessionId: string };

function IconoDeCalendario({ activo }: { activo: boolean }) {
  return (
    <svg className={cn("h-4 w-4 flex-none", activo ? "text-brand" : "text-fg-muted")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

/** Una píldora chica junto al título («se repite», «con transcripción»). */
function Pildora({ tono = "neutro", children }: { tono?: "neutro" | "bien" | "atencion"; children: React.ReactNode }) {
  const clases = {
    neutro: "border-line bg-surface-muted text-fg-secondary",
    bien: "border-success-line bg-success-surface text-success-ink",
    atencion: "border-warn-line bg-warn-surface text-warn-ink",
  }[tono];
  return <span className={cn("inline-flex flex-none rounded-full border px-2 py-px text-[11px] font-semibold", clases)}>{children}</span>;
}

/** Una fila del selector: ícono (en las agendadas), título y su fecha, la línea de abajo y, a la derecha, el botón o el motivo. */
function Fila({
  icono,
  titulo,
  fecha,
  pildora,
  abajo,
  apagada = false,
  derecha,
}: {
  icono?: React.ReactNode;
  titulo: string;
  fecha: string;
  pildora?: React.ReactNode;
  abajo: string;
  apagada?: boolean;
  derecha: React.ReactNode;
}) {
  return (
    <li className={cn("flex items-center gap-3 rounded-[10px] border border-line px-3.5 py-3", apagada ? "bg-surface-muted" : "bg-surface")}>
      {icono}
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("min-w-0 truncate text-sm font-medium", apagada ? "text-fg-muted" : "text-fg")}>{titulo || "Sin título"}</span>
          <span className="flex-none text-[11px] text-fg-muted">{fecha}</span>
          {pildora}
        </div>
        {abajo && <div className="truncate text-xs text-fg-muted">{abajo}</div>}
      </div>
      <div className="flex-none">{derecha}</div>
    </li>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <li className="list-none">
      <p className={cn(ROTULO_DEL_SISTEMA, "pb-2 pt-1")}>{titulo}</p>
      <ul className="space-y-2">{children}</ul>
    </li>
  );
}

const fechaYHora = (iso: string) => [diaConSemana(iso), horaDeCostaRica(iso)].filter(Boolean).join(" · ");

export default function BuscarReunionesDeLaPreventa({ modo, onCerrar }: { modo: ModoDelSelector | null; onCerrar: () => void }) {
  const { exp, recargar, sesion, documentos } = useLienzo();
  const { pestanas } = useSesiones();
  const toast = useToast();
  const abierto = modo !== null;
  const ver = modo?.tipo === "nueva" ? modo.ver : undefined;
  const conAgendadas = abierto && ver !== "pasadas";
  const conPasadas = abierto && ver !== "agendadas";
  const unir = modo?.tipo === "unir" ? modo.sesionId : null;
  // La preventa de un cliente sugiere sus reuniones de trabajo (24 nov), solo al agregar una sesión nueva.
  const conLoQueYaSabemos = conPasadas && !unir && !exp.projectId && partirDeLoQueYaSabemos(exp.empresa.kind);

  const [busqueda, setBusqueda] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [marcadas, setMarcadas] = useState<Map<string, Marcada>>(new Map());
  const { lanzar } = useCorrida();
  // En bloque, solo al AGREGAR (unir es una sesión a una reunión).
  const enBloque = !unir;
  // Cada respuesta se guarda con la clave que la pidió: una vieja nunca se pinta debajo de una búsqueda nueva.
  const [datos, setDatos] = useState<{ clave: string; r: RespuestaDeReuniones | null; error?: boolean } | null>(null);
  const [agendadas, setAgendadas] = useState<{ r: RespuestaDeAgendadas | null; error?: boolean } | null>(null);
  const [deTrabajo, setDeTrabajo] = useState<{ sugeridas: ReunionDeTrabajoSugerida[] | null; error?: string } | null>(null);
  const q = busqueda.trim();
  const clave = conPasadas ? (q.length >= MIN_BUSQUEDA_CALENDARIO ? q : "") : null;
  const pendientes = clave !== null && datos?.clave !== clave;

  useEffect(() => {
    if (clave === null) return;
    const ctrl = new AbortController();
    const t = setTimeout(
      () => {
        fetch(`/api/sales/exploraciones/${exp.id}/reuniones?q=${encodeURIComponent(clave)}`, { signal: ctrl.signal })
          .then((r) => {
            if (!r.ok) throw new Error(String(r.status));
            return r.json() as Promise<RespuestaDeReuniones>;
          })
          .then((r) => setDatos({ clave, r }))
          .catch(() => {
            if (!ctrl.signal.aborted) setDatos({ clave, r: null, error: true });
          });
      },
      clave ? 300 : 0,
    );
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [clave, exp.id]);

  // Las agendadas, una vez por apertura (el servidor las guarda 2 minutos).
  useEffect(() => {
    if (!conAgendadas) return;
    const ctrl = new AbortController();
    fetch(`/api/sales/exploraciones/${exp.id}/agendadas`, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<RespuestaDeAgendadas>;
      })
      .then((r) => setAgendadas({ r }))
      .catch(() => {
        if (!ctrl.signal.aborted) setAgendadas({ r: null, error: true });
      });
    return () => ctrl.abort();
  }, [conAgendadas, exp.id]);

  // Las reuniones de trabajo sugeridas, una vez por apertura (contar quién habló lee cada transcripción).
  useEffect(() => {
    if (!conLoQueYaSabemos) return;
    const ctrl = new AbortController();
    fetch(`/api/sales/exploraciones/${exp.id}/reuniones-de-trabajo`, { signal: ctrl.signal })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { sugeridas?: ReunionDeTrabajoSugerida[]; error?: string };
        // Sin acceso a la empresa (403) el servidor dice por qué: se muestra tal cual.
        if (!r.ok) throw new Error(j.error ?? "No se pudieron sugerir las reuniones de trabajo. Prueba de nuevo en un momento.");
        return j.sugeridas ?? [];
      })
      .then((sugeridas) => setDeTrabajo({ sugeridas }))
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setDeTrabajo({ sugeridas: null, error: e instanceof Error ? e.message : "No se pudieron sugerir las reuniones de trabajo." });
      });
    return () => ctrl.abort();
  }, [conLoQueYaSabemos, exp.id]);

  /* Qué reunión ya es la sesión N (la de Meet o de HubSpot de cada sesión, y en un prospecto también las
     que entraron solas). Una de Meet sin transcripción que también está en HubSpot cuenta como esa. */
  const numeroDe = new Map<string, number>();
  const deHubspot: { fecha: string; numero: number }[] = [];
  for (const p of pestanas) {
    if (!p.reunion || p.noSeHizo) continue;
    numeroDe.set(`${p.reunion.origen}:${p.reunion.id}`, p.numero);
    if (p.reunion.origen === "hubspot") deHubspot.push({ fecha: p.reunion.fecha, numero: p.numero });
  }
  const yaEs = (sessionId: string, fecha: string, sinTranscripcion: boolean): number | null =>
    numeroDe.get(`meet:${sessionId}`) ?? (sinTranscripcion ? (deHubspot.find((h) => mismaReunion(h.fecha, fecha))?.numero ?? null) : null);

  const r = datos?.clave === clave ? datos.r : null;
  const deLaEmpresa = (r?.deLaEmpresa ?? []).filter((s) => coincideConLaBusqueda(s, q));
  /* Las grabadas en HubSpot: la misma reunión cuenta una vez, así que no se lista la que tiene su copia de
     Meet con transcripción o notas (esa se agrega desde Meet). */
  const deMeetConTexto = (r?.deLaEmpresa ?? []).filter((s) => s.texto !== "nada");
  const grabadasEnHubspot = (r?.deHubspot ?? [])
    .filter((h) => !deMeetConTexto.some((s) => mismaReunion(s.date, h.inicio)))
    .filter((h) => coincideConLaBusqueda({ title: h.titulo, participants: [] }, q));
  const enHubspot = (fecha: string) => (r?.deHubspot ?? []).some((h) => mismaReunion(h.inicio, fecha));
  /* Lo sumado a mano (una minuta, una sesión que no quedó grabada): se puede unir a una sesión a propósito. Sin eso,
     una sesión que se apoyaba en una minuta de otro día no tenía cómo volver a tenerla. */
  const sumadoAMano = documentos.filter((d) => coincideConLaBusqueda({ title: d.titulo, participants: [] }, q));
  const enLaEmpresa = new Set(deLaEmpresa.map((s) => s.sessionId));
  const delCalendario = (r?.calendario.sesiones ?? []).filter((s) => !enLaEmpresa.has(s.sessionId) && coincideConLaBusqueda(s, q));
  const listaDeAgendadas = (agendadas?.r?.agendadas ?? []).filter((a) => !q || coincideConLaBusqueda({ title: a.titulo, participants: [] }, q));

  const cerrar = () => {
    onCerrar();
    setBusqueda("");
    setMarcadas(new Map());
    // La próxima vez se vuelven a pedir (con el esqueleto mientras tanto).
    setAgendadas(null);
    setDeTrabajo(null);
  };

  const agregar = async (id: string, cuerpo: Agregar) => {
    setOcupado(id);
    try {
      const res = await fetch(`/api/sales/exploraciones/${exp.id}/sesiones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...cuerpo, ...(unir ? { paraSesionId: unir } : {}) }),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string; sesionId?: string };
      if (!res.ok) {
        toast.error(d.error ?? "No se pudo agregar la sesión.");
        return;
      }
      toast.success(unir ? "Listo: la sesión quedó unida a esa reunión." : "Sesión agregada a la exploración.");
      await recargar();
      if (modo?.tipo === "nueva" && modo.elegir && d.sesionId) {
        sesion.elegir(d.sesionId);
        sesion.ponerMomento(d.sesionId, "antes");
      }
      cerrar();
    } catch {
      toast.error("No se pudo agregar la sesión: revisa la conexión.");
    } finally {
      setOcupado(null);
    }
  };

  const boton = (id: string, cuerpo: Agregar, title?: string) => (
    <BotonBlanco className="font-semibold" disabled={ocupado !== null} title={title} onClick={() => void agregar(id, cuerpo)}>
      {ocupado === id ? "Agregando…" : unir ? "Unir a esta sesión" : cuerpo.tipo === "pasada" && "deLoQueYaSabemos" in cuerpo && cuerpo.deLoQueYaSabemos ? "Sumar como reunión de trabajo" : "Agregar como sesión"}
    </BotonBlanco>
  );
  const yaEsLa = (n: number) => <span className="text-xs text-fg-muted">Ya es la sesión {n}</span>;

  /** `excluye`: la misma reunión marcada en la otra lista (24 nov): marcarla aquí la desmarca allá, y entra con UNA clase. */
  const alternar = (id: string, m: Marcada, excluye?: string) =>
    setMarcadas((antes) => {
      const nuevas = new Map(antes);
      if (nuevas.has(id)) nuevas.delete(id);
      else {
        nuevas.set(id, m);
        if (excluye) nuevas.delete(excluye);
      }
      return nuevas;
    });
  /** La casilla de una reunión pasada que se puede agregar (va donde las agendadas llevan su ícono). */
  const casilla = (id: string, m: Marcada, titulo: string, excluye?: string) =>
    enBloque ? (
      <input
        type="checkbox"
        className="h-4 w-4 flex-none accent-[var(--color-brand)]"
        checked={marcadas.has(id)}
        disabled={ocupado !== null}
        onChange={() => alternar(id, m, excluye)}
        aria-label={`Marcar «${titulo || "Sin título"}» para agregarla`}
      />
    ) : undefined;
  /** La clave de una reunión marcada como reunión de trabajo (la de la lista de siempre es su id: entra de diagnóstico). */
  const deTrabajoClave = (sessionId: string) => `trabajo:${sessionId}`;

  /**
   * Agrega las marcadas, de la más vieja a la más nueva (así quedan numeradas en orden), una por una: cada alta se aplica
   * sobre lo último. Con `yLeer`, las que dejaron transcripción o notas entran a la cola del agente en ese mismo orden.
   */
  const agregarMarcadas = async (yLeer: boolean) => {
    const lista = [...marcadas.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
    setOcupado("bloque");
    let agregadas = 0;
    const errores: string[] = [];
    const paraLeer: string[] = [];
    try {
      for (const m of lista) {
        try {
          const res = await fetch(`/api/sales/exploraciones/${exp.id}/sesiones`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(m.cuerpo),
          });
          if (res.ok) {
            agregadas++;
            if (m.leer) paraLeer.push(m.leer);
          } else {
            const d = (await res.json().catch(() => ({}))) as { error?: string };
            errores.push(d.error ?? "No se pudo agregar una de las sesiones.");
          }
        } catch {
          errores.push("Se cortó la conexión agregando una de las sesiones.");
        }
      }
      await recargar();
      if (agregadas) toast.success(agregadas === 1 ? "Se agregó 1 sesión." : `Se agregaron ${agregadas} sesiones.`);
      if (errores.length) toast.error(`${errores.length === 1 ? "Una no se pudo agregar" : `${errores.length} no se pudieron agregar`}: ${errores[0]}`);
      if (yLeer && paraLeer.length) await lanzar("leer", { sesionIds: paraLeer });
      if (!errores.length) cerrar();
      else setMarcadas(new Map());
    } finally {
      setOcupado(null);
    }
  };
  const marcadasParaLeer = [...marcadas.values()].filter((m) => m.leer).length;

  const ayuda =
    ver === "agendadas"
      ? "Lo que tienes agendado con la empresa en las próximas 6 semanas: agrégalo como sesión y Nexus espera su transcripción."
      : ver === "pasadas"
        ? `Las reuniones de la empresa que ya pasaron. Con ${MIN_BUSQUEDA_CALENDARIO} letras o más se busca en todo tu calendario.`
        : `Arriba, lo que tienes agendado con la empresa: agrégalo como sesión y Nexus espera su transcripción. Después, las reuniones que ya pasaron. Con ${MIN_BUSQUEDA_CALENDARIO} letras o más se busca en todo tu calendario.`;

  const cargandoAgendadas = conAgendadas && !agendadas;
  const sinNada =
    !cargandoAgendadas && !pendientes && listaDeAgendadas.length === 0 && deLaEmpresa.length === 0 && delCalendario.length === 0 && !agendadas?.r?.aviso;

  return (
    <Modal open={abierto} onClose={cerrar} title={unir ? "Unir la sesión a una reunión" : "Buscar una reunión"} size="xl">
      <input
        type="search"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder={ver === "agendadas" ? "Buscar por título…" : "Buscar en la empresa y en tu calendario — título, persona o dominio…"}
        aria-label="Buscar una reunión"
        aria-describedby="ayuda-buscar-reunion"
        autoFocus
        className="mb-1.5 h-11 w-full rounded-[10px] border border-line bg-surface-muted px-3.5 text-sm text-fg focus:border-brand focus:outline-none"
      />
      <p id="ayuda-buscar-reunion" className="mb-3 text-xs leading-[18px] text-fg-muted">
        {datos?.error ? <span className="text-warn-ink">No se pudo buscar. Prueba de nuevo en un momento.</span> : clave ? `Se buscó en todo tu calendario${r?.calendario.hayMas ? " — hay más resultados: afina la búsqueda" : ""}.` : ayuda}
      </p>
      <ul className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
        {conAgendadas && (
          <Seccion titulo="Agendadas · próximas 6 semanas">
            {cargandoAgendadas ? (
              <li className="h-12 rounded-[10px] skeleton-shimmer" aria-label="Buscando las agendadas" />
            ) : agendadas?.error ? (
              <li className="text-xs text-warn-ink">No se pudieron leer las agendadas. Prueba de nuevo en un momento.</li>
            ) : (
              <>
                {agendadas?.r?.aviso && <li className="text-xs text-fg-muted">{agendadas.r.aviso}</li>}
                {listaDeAgendadas.length === 0 && !agendadas?.r?.aviso && <li className="text-xs text-fg-muted">No hay reuniones agendadas con la empresa en las próximas 6 semanas.</li>}
                {listaDeAgendadas.map((a) =>
                  a.origen === "calendario" ? (
                    <Fila
                      key={`c-${a.calendario}-${a.id}`}
                      icono={<IconoDeCalendario activo={a.yaEsLaSesion === null} />}
                      titulo={a.titulo}
                      fecha={fechaYHora(a.inicio)}
                      pildora={a.serie ? <Pildora>se repite</Pildora> : undefined}
                      abajo={[`${a.internos} de Smarteam`, `${a.externos} de afuera`, a.serie ? "se usa solo esa fecha" : null].filter(Boolean).join(" · ")}
                      apagada={a.yaEsLaSesion !== null}
                      derecha={a.yaEsLaSesion !== null ? yaEsLa(a.yaEsLaSesion) : boton(`c-${a.id}`, { tipo: "agendada", evento: { id: a.id, calendario: a.calendario, ...(a.serie ? { serie: true } : {}) } })}
                    />
                  ) : (
                    <Fila
                      key={`h-${a.id}`}
                      icono={<IconoDeCalendario activo={a.yaEsLaSesion === null} />}
                      titulo={a.titulo}
                      fecha={fechaYHora(a.inicio)}
                      abajo="De la agenda de HubSpot"
                      apagada={a.yaEsLaSesion !== null}
                      derecha={a.yaEsLaSesion !== null ? yaEsLa(a.yaEsLaSesion) : boton(`h-${a.id}`, { tipo: "agendada", origen: "hubspot", sessionId: a.id })}
                    />
                  ),
                )}
              </>
            )}
          </Seccion>
        )}

        {conLoQueYaSabemos && !q && (
          <Seccion titulo="Reuniones de trabajo sugeridas">
            {!deTrabajo ? (
              <li className="h-12 rounded-[10px] skeleton-shimmer" aria-label="Buscando las reuniones de trabajo" />
            ) : deTrabajo.error ? (
              <li className="text-xs text-warn-ink">{deTrabajo.error}</li>
            ) : !deTrabajo.sugeridas?.length ? (
              <li className="text-xs text-fg-muted">Todavía no hay reuniones con transcripción donde haya hablado la empresa.</li>
            ) : (
              <>
                <li className="text-xs leading-[18px] text-fg-muted">
                  Las reuniones con la empresa donde más habló el cliente. Súmalas como reunión de trabajo: cuentan para ubicar la escala y para el Resumen, y el cliente
                  no las ve como sesiones de diagnóstico. No se leen al sumarlas: «Ubicar con lo que ya sabemos» las lee enteras.
                </li>
                {deTrabajo.sugeridas.map((s) => {
                  const n = yaEs(s.sessionId, s.fecha, false);
                  const cuerpo: Agregar = { tipo: "pasada", sessionId: s.sessionId, deLoQueYaSabemos: true };
                  return (
                    <Fila
                      key={`trabajo-${s.sessionId}`}
                      /* Una reunión entra con UNA clase: marcarla aquí la desmarca en «De la empresa» (y al revés). Sin
                         lectura: el lector de una sesión la tomaría como de diagnóstico (revisión del 24 nov). */
                      icono={n === null ? casilla(deTrabajoClave(s.sessionId), { cuerpo, fecha: s.fecha, leer: null }, s.titulo, s.sessionId) : undefined}
                      titulo={s.titulo}
                      fecha={diaConAnio(s.fecha)}
                      pildora={<Pildora tono={s.pocoDelCliente ? "atencion" : "bien"}>habló el cliente {s.delCliente} %</Pildora>}
                      abajo={[s.equipo ? `parece de ${EQUIPOS[s.equipo].nombre}` : null, s.pocoDelCliente ? "la empresa habló poco: el Resumen la leería mal" : null].filter(Boolean).join(" · ")}
                      apagada={n !== null}
                      derecha={n !== null ? yaEsLa(n) : boton(`trabajo-${s.sessionId}`, cuerpo)}
                    />
                  );
                })}
              </>
            )}
          </Seccion>
        )}

        {conPasadas && (
          <Seccion titulo={conLoQueYaSabemos ? "De la empresa · ya pasaron (como sesión de diagnóstico)" : "De la empresa · ya pasaron"}>
            {pendientes && !r ? (
              <li className="h-12 rounded-[10px] skeleton-shimmer" aria-label="Buscando las reuniones" />
            ) : deLaEmpresa.length === 0 ? (
              <li className="text-xs text-fg-muted">{q ? `Ninguna reunión de la empresa coincide con «${q}».` : "Todavía no hay reuniones con la empresa."}</li>
            ) : (
              deLaEmpresa.map((s) => {
                const n = yaEs(s.sessionId, s.date, s.sinTranscripcion);
                const sala = textoDeSala(resumirSala(s.participants, s.organizerEmail));
                const despues =
                  s.texto === "nada"
                    ? enHubspot(s.date)
                      ? "la grabación está en HubSpot: agrégala desde ahí"
                      : s.avisoDePlataforma
                        ? "pega la transcripción en la reunión y se lee"
                        : "se lee cuando sumes la minuta"
                    : s.conMinuta
                      ? "leída al llegar"
                      : null;
                return (
                  <Fila
                    key={s.sessionId}
                    icono={
                      n === null
                        ? casilla(s.sessionId, { cuerpo: { tipo: "pasada", sessionId: s.sessionId }, fecha: s.date, leer: s.texto === "nada" ? null : s.sessionId }, s.title, deTrabajoClave(s.sessionId))
                        : undefined
                    }
                    titulo={s.title}
                    fecha={diaConAnio(s.date)}
                    pildora={
                      s.texto === "transcripcion" ? (
                        <Pildora tono="bien">con transcripción</Pildora>
                      ) : s.texto === "notas" ? (
                        <Pildora>solo notas de Gemini</Pildora>
                      ) : s.avisoDePlataforma ? (
                        <Pildora tono="atencion">{s.avisoDePlataforma.toLowerCase()} · sin texto</Pildora>
                      ) : (
                        <Pildora tono="atencion">sin grabación ni notas</Pildora>
                      )
                    }
                    abajo={[s.sinNadieDelCliente ? "sin nadie del cliente" : null, sala, despues].filter(Boolean).join(" · ")}
                    apagada={n !== null}
                    derecha={n !== null ? yaEsLa(n) : boton(s.sessionId, { tipo: "pasada", sessionId: s.sessionId })}
                  />
                );
              })
            )}
            {grabadasEnHubspot.map((h) => {
              const n = numeroDe.get(`hubspot:${h.id}`) ?? null;
              return (
                <Fila
                  key={`hubspot-${h.id}`}
                  icono={n === null ? casilla(`hubspot-${h.id}`, { cuerpo: { tipo: "pasada", origen: "hubspot", sessionId: h.id }, fecha: h.inicio, leer: null }, h.titulo) : undefined}
                  titulo={h.titulo}
                  fecha={diaConAnio(h.inicio)}
                  pildora={<Pildora tono="bien">grabada en HubSpot</Pildora>}
                  abajo={h.leida ? "De HubSpot · el agente ya la leyó" : "De HubSpot · todavía sin leer"}
                  apagada={n !== null}
                  derecha={n !== null ? yaEsLa(n) : boton(`hubspot-${h.id}`, { tipo: "pasada", origen: "hubspot", sessionId: h.id })}
                />
              );
            })}
          </Seccion>
        )}

        {conPasadas && sumadoAMano.length > 0 && (
          <Seccion titulo="Sumado a mano">
            {sumadoAMano.map((d) => {
              const n = numeroDe.get(`documento:${d.id}`) ?? null;
              const fecha = d.fecha ?? d.creadoEn;
              return (
                <Fila
                  key={`documento-${d.id}`}
                  icono={n === null ? casilla(`documento-${d.id}`, { cuerpo: { tipo: "pasada", origen: "documento", sessionId: d.id }, fecha, leer: null }, d.titulo) : undefined}
                  titulo={d.titulo}
                  fecha={diaConAnio(fecha)}
                  pildora={<Pildora>{d.origen === "archivo" ? "archivo" : "texto pegado"}</Pildora>}
                  abajo={d.fecha ? "" : "sin fecha de sesión: cuenta el día en que se sumó"}
                  apagada={n !== null}
                  derecha={n !== null ? yaEsLa(n) : boton(`documento-${d.id}`, { tipo: "pasada", origen: "documento", sessionId: d.id })}
                />
              );
            })}
          </Seccion>
        )}

        {conPasadas && delCalendario.length > 0 && (
          <Seccion titulo="De tu calendario">
            {delCalendario.map((s) => {
              const n = yaEs(s.sessionId, s.date, s.sinTranscripcion);
              const sala = textoDeSala(resumirSala(s.participants, s.organizerEmail));
              const noSePuede = !!s.motivoNoAdoptable;
              return (
                <Fila
                  key={s.sessionId}
                  icono={n === null && !noSePuede ? casilla(s.sessionId, { cuerpo: { tipo: "pasada", sessionId: s.sessionId }, fecha: s.date, leer: s.sinTranscripcion ? null : s.sessionId }, s.title) : undefined}
                  titulo={s.title}
                  fecha={diaConAnio(s.date)}
                  pildora={s.sinDuenio && !noSePuede ? <Pildora>{s.soloEquipo === false ? "sin cliente asignado" : "reunión del equipo"}</Pildora> : undefined}
                  abajo={(noSePuede ? s.motivoNoAdoptable : [...avisosDeLaFila(s), sala].filter(Boolean).join(" · ")) ?? ""}
                  apagada={noSePuede || n !== null}
                  derecha={
                    n !== null ? (
                      yaEsLa(n)
                    ) : noSePuede ? (
                      <span className="text-xs text-fg-muted">No se puede usar</span>
                    ) : (
                      boton(s.sessionId, { tipo: "pasada", sessionId: s.sessionId }, s.sinDuenio ? "No es de ningún cliente todavía: al agregarla queda como reunión de esta empresa." : undefined)
                    )
                  }
                />
              );
            })}
          </Seccion>
        )}

        {sinNada && q && <li className="list-none text-xs text-fg-muted">Ninguna reunión coincide con «{q}».</li>}
      </ul>
      {marcadas.size > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <p className="text-xs text-fg-muted">
            {marcadas.size === 1 ? "1 marcada" : `${marcadas.size} marcadas`} · se agregan en orden de fecha
          </p>
          <div className="flex items-center gap-2">
            <BotonBlanco disabled={ocupado !== null} onClick={() => void agregarMarcadas(false)}>
              {marcadas.size === 1 ? "Agregar la sesión" : `Agregar las ${marcadas.size}`}
            </BotonBlanco>
            {marcadasParaLeer > 0 && (
              <BotonAzul disabled={ocupado !== null} onClick={() => void agregarMarcadas(true)} title="El agente las lee una detrás de otra, cada una entera">
                {ocupado === "bloque" ? "Agregando…" : marcadas.size === 1 ? "Agregar y leerla" : `Agregar las ${marcadas.size} y leerlas`}
              </BotonAzul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
