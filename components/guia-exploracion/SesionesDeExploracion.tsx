"use client";

/**
 * components/guia-exploracion/SesionesDeExploracion.tsx — las SESIONES de la exploración (2026-10-05,
 * diseño «Clientes · rediseño», tablero 5).
 *
 * Qué preguntar en cada sesión y con quién. UNA PESTAÑA POR SESIÓN, como en la preventa (pedido de
 * Elías, 2026-10-05): las del plan y, en azul con la chispa, las que propone el agente. Las pestañas
 * las pinta ExploracionConCuestionario (junto con «Cuestionarios»): este componente le cuenta cuáles
 * hay (`onEstado`) y pinta la que esté elegida. Cada pregunta lleva su letra (a qué apunta), la
 * repregunta y, una vez hecha, lo que averiguaste: eso va como sugerencia a Información del cliente
 * y la pregunta dice a qué campo llegó. Lo que sugiere el agente va en azul: arriba la franja con todo
 * junto; en cada pestaña, lo suyo (la «ya respondida» dentro de su pregunta, la contradicción en la
 * próxima sesión). Nada de lo que hace el agente pisa lo confirmado.
 *
 * Una contradicción se cierra conversándola, así que necesita una sesión: si todavía no hay ninguna
 * en el plan, se muestra en la primera que propone el agente y se usan juntas. Sin ninguna sesión,
 * solo se puede descartar (antes se ofrecía «Llevar a la sesión» y el servidor lo rechazaba).
 *
 * La columna derecha (Qué sigue, lo que ya dice Información del cliente, la escala de la sesión y el
 * agente) la pinta este componente por portal en el panel de la ficha. Sin panel, el «Qué sigue» y el
 * agente quedan arriba de las sesiones.
 *
 * El molde y el porqué, en lib/guia-exploracion/contenido.ts.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/components/ui/Toast";
import { PUNTO_DE_NIVEL } from "@/components/escala/niveles";
import { BotonAzul, BotonBlanco, BotonTexto, FranjaDeSugerencias, IconoDeSugerencia, QueSigue, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { CAMPOS_DE_LA_FICHA, EVENTO_FICHA_CAMBIO } from "@/lib/clients/ficha";
import { cn } from "@/lib/cn";
import {
  clave as claveDeTexto,
  dimensionDelObjetivo,
  letraDelObjetivo,
  proximaSesion,
  tituloSinNumero,
  type ItemPropuesto,
  type OperacionDeGuia,
  type PreguntaDeSesion,
  type Sesion,
} from "@/lib/guia-exploracion/contenido";
import type { VistaDeLaGuia } from "@/lib/guia-exploracion/servidor";
import type { Letra } from "@/lib/escala/documento/tipos";
import { SENTINEL_SERVICE_TYPE } from "@/lib/projects/kind";

type Vista = VistaDeLaGuia & { averiguadoALaFicha?: number };
/** Guarda las operaciones; devuelve las sesiones como quedaron, o null si no se pudo. */
type Cambiar = (ops: OperacionDeGuia[], ok?: string) => Promise<Vista | null>;
type ValorDeSesion = { titulo?: string; objetivo?: string; conQuien?: string; preguntas?: Array<{ texto: string; repregunta?: string; objetivo?: string }> };

const INPUT =
  "w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none";

const ETIQUETA_DEL_CAMPO = new Map(CAMPOS_DE_LA_FICHA.map((c) => [c.clave as string, c.etiqueta]));

/** La pestaña para agregar una sesión a mano (va al final de las sesiones). */
export const AGREGAR_SESION = "__agregar";

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CR", { day: "numeric", month: "short", timeZone: "America/Costa_Rica" });
}

function enUnaLinea(item: ItemPropuesto): string {
  const f = item.fuentes.find((x) => x.cita) ?? item.fuentes[0];
  if (!f) return "";
  return f.cita ? `${f.etiqueta} · «${f.cita.length > 90 ? `${f.cita.slice(0, 89)}…` : f.cita}»` : f.etiqueta;
}

/** Una pestaña de sesión: del plan (`propuesta: false`) o propuesta por el agente. */
export interface PestanaDeSesion {
  /** El id de la sesión, o el de la propuesta del agente. */
  clave: string;
  numero: number;
  titulo: string;
  propuesta: boolean;
  hechas: number;
  total: number;
  /** Sugerencias del agente que esperan en esa pestaña (una sesión del plan). */
  sugeridas: number;
}

/** Lo que el padre necesita para pintar las pestañas. */
export interface EstadoDeLasSesiones {
  pestanas: PestanaDeSesion[];
  /** La pestaña que se está mostrando (la elegida, o la de por defecto). null = no hay sesiones. */
  activa: string | null;
  hechas: number;
  total: number;
}

export default function SesionesDeExploracion({
  projectId,
  clientId,
  slotDelPanel,
  elegida,
  onElegir,
  onEstado,
}: {
  projectId: string;
  clientId: string;
  /** La columna derecha de la ficha; null si está oculta. */
  slotDelPanel: HTMLElement | null;
  /** La pestaña que eligió la persona (null = la de por defecto: la próxima sesión). */
  elegida: string | null;
  onElegir: (clave: string) => void;
  onEstado?: (e: EstadoDeLasSesiones) => void;
}) {
  const toast = useToast();
  const pathname = usePathname();
  const [v, setV] = useState<Vista | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const refrescos = useRef<number[]>([]);
  const ultimoEstado = useRef("");
  const hrefDeLaFicha = `${pathname}?tab=${SENTINEL_SERVICE_TYPE}`;

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/guia-exploracion`, { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      toast.error(data?.error ?? "No se pudieron cargar las sesiones.");
      return;
    }
    setV(data);
  }, [projectId, toast]);

  useEffect(() => {
    void cargar();
    const timers = refrescos.current;
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [cargar]);

  const enCurso = !!v?.corrida.enCurso;
  useEffect(() => {
    if (!enCurso) return;
    const t = setInterval(() => void cargar(), 4000);
    return () => clearInterval(t);
  }, [enCurso, cargar]);

  /** Lo averiguado vuelve de la ficha en unos segundos: se recarga para mostrar a qué campo llegó. */
  const esperarLaFicha = useCallback(() => {
    for (const ms of [9000, 25000]) {
      refrescos.current.push(
        window.setTimeout(() => {
          void cargar();
          window.dispatchEvent(new CustomEvent(EVENTO_FICHA_CAMBIO, { detail: { clientId } }));
        }, ms),
      );
    }
  }, [cargar, clientId]);

  const cambiar: Cambiar = useCallback(
    async (ops, ok) => {
      if (!v) return null;
      setOcupado(true);
      try {
        const res = await fetch(`/api/projects/${projectId}/guia-exploracion`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version: v.version, operaciones: ops }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          toast.error(data?.error ?? "No se pudo guardar.");
          if (res.status === 409) void cargar();
          return null;
        }
        setV(data);
        if (ok) toast.success(ok);
        if (data?.averiguadoALaFicha > 0) esperarLaFicha();
        return data as Vista;
      } finally {
        setOcupado(false);
      }
    },
    [projectId, toast, v, cargar, esperarLaFicha],
  );

  const lanzar = async (modo: "preparar" | "leer") => {
    setOcupado(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/guia-exploracion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modo }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error ?? "No se pudo arrancar el agente.");
        return;
      }
      setV(data);
      toast.info(modo === "preparar" ? "Preparando las sesiones… tarda alrededor de un minuto." : "Leyendo la reunión…");
    } finally {
      setOcupado(false);
    }
  };

  // ── Las pestañas ───────────────────────────────────────────────────────────
  const c = v?.contenido ?? { sesiones: [] };
  const pend = v?.pendientes ?? [];
  const proxima = proximaSesion(c);
  const sesionesNuevas = pend.filter((i) => i.destino.tipo === "sesion");
  const respondidas = pend.filter((i) => i.destino.tipo === "respondida");
  const contradicciones = pend.filter((i) => i.destino.tipo === "contradiccion");
  /** Dónde esperan las contradicciones: la próxima sesión del plan (o la última); sin plan, la primera propuesta. */
  const claveDeLasContradicciones = proxima?.id ?? c.sesiones[c.sesiones.length - 1]?.id ?? sesionesNuevas[0]?.id ?? null;

  const pestanas: PestanaDeSesion[] = [
    ...c.sesiones.map((s, i) => ({
      clave: s.id,
      numero: i + 1,
      titulo: tituloSinNumero(s.titulo),
      propuesta: false,
      hechas: s.preguntas.filter((q) => q.hecha).length,
      total: s.preguntas.length,
      sugeridas:
        respondidas.filter((r) => r.destino.tipo === "respondida" && r.destino.sesionId === s.id).length +
        (claveDeLasContradicciones === s.id ? contradicciones.length : 0),
    })),
    ...sesionesNuevas.map((it, j) => {
      const val = it.valor as ValorDeSesion;
      return {
        clave: it.id,
        numero: c.sesiones.length + j + 1,
        titulo: tituloSinNumero(val.titulo ?? ""),
        propuesta: true,
        hechas: 0,
        total: val.preguntas?.length ?? 0,
        sugeridas: 0,
      };
    }),
  ];
  const porDefecto = proxima?.id ?? c.sesiones[c.sesiones.length - 1]?.id ?? sesionesNuevas[0]?.id ?? null;
  const activa =
    elegida === AGREGAR_SESION ? AGREGAR_SESION : elegida && pestanas.some((p) => p.clave === elegida) ? elegida : porDefecto;
  const hechas = pestanas.reduce((n, p) => n + (p.propuesta ? 0 : p.hechas), 0);
  const total = pestanas.reduce((n, p) => n + (p.propuesta ? 0 : p.total), 0);

  const firma = v ? JSON.stringify({ pestanas, activa, hechas, total } satisfies EstadoDeLasSesiones) : "";
  useEffect(() => {
    if (!firma || firma === ultimoEstado.current) return;
    ultimoEstado.current = firma;
    onEstado?.(JSON.parse(firma) as EstadoDeLasSesiones);
  }, [firma, onEstado]);

  if (!v) return <div className="py-10 text-center text-sm text-fg-muted">Cargando las sesiones…</div>;

  /** La pestaña donde vive una sugerencia. */
  const pestanaDe = (i: ItemPropuesto): string | null =>
    i.destino.tipo === "respondida" ? i.destino.sesionId : i.destino.tipo === "sesion" ? i.id : claveDeLasContradicciones;

  const revisarUnaPorUna = () => {
    const primera = v.pendientes[0];
    if (!primera) return;
    const p = pestanaDe(primera);
    if (p) onElegir(p);
    window.setTimeout(() => {
      document.querySelector(`[data-sugerencia="${primera.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  };

  // Una contradicción sin ninguna sesión (ni del plan ni propuesta) no tiene dónde quedar: no se ofrece.
  const contradiccionesUsables = claveDeLasContradicciones ? contradicciones : [];
  const usables = [...sesionesNuevas, ...respondidas, ...contradiccionesUsables].slice(0, 30);
  const usarTodas = () => {
    // Primero las sesiones nuevas: una contradicción necesita una sesión donde quedar.
    void cambiar(
      usables.map((i) => ({ op: "usar" as const, itemId: i.id })),
      usables.length === 1 ? "Listo: quedó en las sesiones." : `Listo: ${usables.length} sugerencias quedaron en las sesiones.`,
    );
  };

  const resumenDeSugerencias = [
    respondidas.length ? `${respondidas.length} ${respondidas.length === 1 ? "pregunta que una reunión ya respondió" : "preguntas que una reunión ya respondió"}` : "",
    contradicciones.length ? `${contradicciones.length} ${contradicciones.length === 1 ? "contradicción" : "contradicciones"}` : "",
    sesionesNuevas.length ? `${sesionesNuevas.length} ${sesionesNuevas.length === 1 ? "sesión nueva" : "sesiones nuevas"}` : "",
  ].filter(Boolean);

  const sesionActiva = c.sesiones.find((s) => s.id === activa) ?? null;
  const propuestaActiva = sesionesNuevas.find((i) => i.id === activa) ?? null;
  const numeroActivo = pestanas.find((p) => p.clave === activa)?.numero ?? 0;

  /** Usar una sesión propuesta (y, si se pidió, las contradicciones con ella) y quedarse en su pestaña. */
  const usarSesion = async (item: ItemPropuesto, conContradicciones: boolean) => {
    const ops: OperacionDeGuia[] = [{ op: "usar", itemId: item.id }];
    if (conContradicciones) ops.push(...contradicciones.map((i) => ({ op: "usar" as const, itemId: i.id })));
    const nv = await cambiar(
      ops,
      conContradicciones && contradicciones.length ? "Listo: la sesión quedó en el plan, con las contradicciones." : "Listo: la sesión quedó en el plan.",
    );
    if (!nv) return;
    const titulo = claveDeTexto(tituloSinNumero((item.valor as ValorDeSesion).titulo ?? ""));
    const nueva = nv.contenido.sesiones.find((s) => claveDeTexto(tituloSinNumero(s.titulo)) === titulo);
    if (nueva) onElegir(nueva.id);
  };

  const queSigue = queSigueDeLasSesiones(v, proxima, ocupado, lanzar, revisarUnaPorUna);
  const agente = <Agente v={v} ocupado={ocupado} lanzar={lanzar} />;

  return (
    <div className="space-y-4">
      {!slotDelPanel && (
        <div className="space-y-3">
          {queSigue}
          {agente}
        </div>
      )}

      {v.corrida.error && (
        <p className="rounded-lg border border-danger-line bg-danger-surface px-3 py-2 text-[13px] text-danger-ink">
          El agente no pudo terminar: {v.corrida.error}
        </p>
      )}

      {v.pendientes.length > 0 && (
        <div data-recorrido="exploracion.propuestas">
          <FranjaDeSugerencias
            acciones={
              <>
                <BotonBlanco onClick={revisarUnaPorUna} disabled={ocupado}>
                  Revisar una por una
                </BotonBlanco>
                {usables.length > 0 && (
                  <BotonAzul onClick={usarTodas} disabled={ocupado}>
                    {usables.length === 1 ? "Usar" : `Usar las ${usables.length}`}
                  </BotonAzul>
                )}
              </>
            }
          >
            El agente sugiere {v.pendientes.length === 1 ? "una cosa" : `${v.pendientes.length} cosas`} en las sesiones: {unirConY(resumenDeSugerencias)}.
          </FranjaDeSugerencias>
        </div>
      )}

      {activa === AGREGAR_SESION ? (
        <SesionAMano
          numero={c.sesiones.length + 1}
          ocupado={ocupado}
          onAgregar={async (o) => {
            const nv = await cambiar([{ op: "agregarSesion", ...o }], "Listo: la sesión quedó en el plan.");
            const nueva = nv?.contenido.sesiones[nv.contenido.sesiones.length - 1];
            if (nueva) onElegir(nueva.id);
            return !!nv;
          }}
          onCancelar={porDefecto ? () => onElegir(porDefecto) : undefined}
        />
      ) : sesionActiva ? (
        <PanelDeSesion
          key={sesionActiva.id}
          sesion={sesionActiva}
          numero={numeroActivo}
          respondidas={respondidas}
          contradicciones={claveDeLasContradicciones === sesionActiva.id ? contradicciones : []}
          hrefDeLaFicha={hrefDeLaFicha}
          ocupado={ocupado}
          cambiar={cambiar}
        />
      ) : propuestaActiva ? (
        <SesionPropuesta
          key={propuestaActiva.id}
          item={propuestaActiva}
          numero={numeroActivo}
          contradicciones={claveDeLasContradicciones === propuestaActiva.id ? contradicciones : []}
          ocupado={ocupado}
          onUsar={(conContradicciones) => void usarSesion(propuestaActiva, conContradicciones)}
          onDescartar={(id) => void cambiar([{ op: "descartar", itemIds: [id] }])}
        />
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-dashed border-line bg-surface-muted px-6 py-8 text-center">
            <p className="text-sm font-semibold text-fg">Todavía no hay plan de sesiones.</p>
            <p className="mx-auto mt-1 max-w-[460px] text-[13px] text-fg-muted">
              El agente lo arma con el handoff, el kickoff, los cuestionarios y lo que ya dice Información del cliente: qué preguntar en
              cada sesión y con quién. También puedes agregar una a mano.
            </p>
          </div>
          {contradicciones.length > 0 && (
            <ul className="space-y-1.5">
              {contradicciones.map((i) => (
                <SugerenciaEnLinea
                  key={i.id}
                  item={i}
                  rotulo="Se contradicen · agrega una sesión para llevarla ahí"
                  ocupado={ocupado}
                  onDescartar={() => void cambiar([{ op: "descartar", itemIds: [i.id] }])}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {slotDelPanel &&
        createPortal(
          <>
            {queSigue}
            <PanelDeLaFicha v={v} hrefDeLaFicha={hrefDeLaFicha} />
            <EscalaDeLaSesion v={v} sesion={sesionActiva ?? proxima} />
            {agente}
          </>,
          slotDelPanel,
        )}
    </div>
  );
}

function unirConY(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

// ── Qué sigue y el agente ────────────────────────────────────────────────────

function queSigueDeLasSesiones(
  v: Vista,
  proxima: Sesion | null,
  ocupado: boolean,
  lanzar: (modo: "preparar" | "leer") => void,
  revisar: () => void,
): ReactNode {
  if (v.corrida.enCurso) {
    return <QueSigue>{v.corrida.modo === "leer" ? "El agente está leyendo la reunión…" : "El agente está preparando las sesiones…"}</QueSigue>;
  }
  if (v.contenido.sesiones.length === 0 && v.pendientes.every((i) => i.destino.tipo !== "sesion")) {
    return (
      <QueSigue
        accion={
          <BotonAzul onClick={() => lanzar("preparar")} disabled={ocupado} className="inline-flex items-center gap-1.5">
            <IconoDeSugerencia className="h-3.5 w-3.5" />
            Preparar las sesiones
          </BotonAzul>
        }
      >
        Arma el plan de sesiones: el agente propone qué preguntar y con quién, sin repetir lo que ya dicen el handoff e Información del cliente.
      </QueSigue>
    );
  }
  if (v.reunionSinLeer && v.contenido.sesiones.length > 0) {
    return (
      <QueSigue
        accion={
          <BotonAzul onClick={() => lanzar("leer")} disabled={ocupado}>
            Leer la reunión del {fechaCorta(v.reunionSinLeer.fecha)}
          </BotonAzul>
        }
      >
        La reunión «{v.reunionSinLeer.titulo}» del {fechaCorta(v.reunionSinLeer.fecha)} todavía no se leyó. Léela: el agente marca las preguntas que quedaron respondidas.
      </QueSigue>
    );
  }
  if (v.pendientes.length > 0) {
    return (
      <QueSigue accion={<BotonAzul onClick={revisar}>Revisar una por una</BotonAzul>}>
        El agente sugiere {v.pendientes.length === 1 ? "una cosa" : `${v.pendientes.length} cosas`} en las sesiones. Revísalas antes de la próxima reunión.
      </QueSigue>
    );
  }
  if (proxima) {
    const faltan = proxima.preguntas.filter((q) => !q.hecha).length;
    return (
      <QueSigue>
        La próxima es «{tituloSinNumero(proxima.titulo)}»{proxima.conQuien ? `, con ${proxima.conQuien}` : ""}: {faltan === 1 ? "una pregunta sin hacer" : `${faltan} preguntas sin hacer`}.
      </QueSigue>
    );
  }
  return <QueSigue>Todas las preguntas del plan ya se hicieron. Si hace falta otra sesión, agrégala con «+ Sesión».</QueSigue>;
}

function Agente({ v, ocupado, lanzar }: { v: Vista; ocupado: boolean; lanzar: (modo: "preparar" | "leer") => void }) {
  const hay = v.contenido.sesiones.length > 0;
  return (
    <section data-recorrido="exploracion.agente" className="flex flex-col gap-2.5">
      <span className={ROTULO_DEL_SISTEMA}>El agente</span>
      <div className="flex flex-wrap gap-2">
        {hay && (
          <BotonBlanco onClick={() => lanzar("preparar")} disabled={ocupado || v.corrida.enCurso} className="inline-flex items-center gap-1.5">
            <IconoDeSugerencia className="h-3.5 w-3.5 text-brand" />
            Volver a proponer
          </BotonBlanco>
        )}
        {hay && (
          <BotonBlanco
            onClick={() => lanzar("leer")}
            disabled={ocupado || v.corrida.enCurso || !v.reunionSinLeer}
            title={v.reunionSinLeer ? "Lee la última reunión del proyecto y propone qué preguntas quedaron respondidas" : "No hay reuniones nuevas del proyecto para leer"}
          >
            Leer la última reunión
          </BotonBlanco>
        )}
      </div>
      <p className="text-[11px] text-fg-muted">
        Propone; tú decides. Lo que ya marcaste no se pisa. Lo nuevo del cliente que sale de cada reunión va a Información del cliente.
      </p>
    </section>
  );
}

// ── La columna derecha: lo que ya dice Información del cliente y la escala ───

function PanelDeLaFicha({ v, hrefDeLaFicha }: { v: Vista; hrefDeLaFicha: string }) {
  return (
    <section data-recorrido="exploracion.ficha" className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className={ROTULO_DEL_SISTEMA}>Ya lo sabemos · no repreguntar</span>
        <Link href={hrefDeLaFicha} className="text-[11px] text-brand hover:text-brand-light">
          Información del cliente
        </Link>
      </div>
      {v.ficha.propuestas > 0 && (
        <Link
          href={hrefDeLaFicha}
          className="flex items-center gap-2 rounded-lg border border-info-line bg-info-surface px-3 py-2 text-[13px] text-brand hover:text-brand-light"
        >
          <IconoDeSugerencia className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="min-w-0 flex-1">
            {v.ficha.propuestas === 1 ? "Una sugerencia espera" : `${v.ficha.propuestas} sugerencias esperan`} en Información del cliente
          </span>
          <span aria-hidden="true">→</span>
        </Link>
      )}
      {v.ficha.sabido.length > 0 ? (
        <ul className="flex flex-col gap-2 rounded-xl border border-line bg-surface px-3 py-2.5">
          {v.ficha.sabido.map((s) => (
            <li key={s.etiqueta} className="text-[13px] leading-[1.45]">
              <span className="font-semibold text-fg">{s.etiqueta}: </span>
              <span className="text-fg-secondary">{s.texto}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-fg-muted">
          {v.ficha.confirmada
            ? "La ficha está confirmada pero vacía."
            : "La ficha del cliente todavía no está confirmada. Lo que se sabe del cliente se confirma en Información del cliente."}
        </p>
      )}
    </section>
  );
}

/** Las dimensiones de la escala a las que apuntan las preguntas de la sesión abierta (o de la próxima). */
function EscalaDeLaSesion({ v, sesion }: { v: Vista; sesion: Sesion | null }) {
  if (!v.escala.disponible || !sesion) return null;
  const ids = [...new Set(sesion.preguntas.map((q) => dimensionDelObjetivo(q.objetivo)).filter((x): x is string => !!x))];
  const dims = ids.map((id) => v.escala.dimensiones.find((d) => d.id === id)).filter((d): d is NonNullable<typeof d> => !!d);
  if (!dims.length) return null;
  return (
    <section className="flex flex-col gap-2.5">
      <span className={ROTULO_DEL_SISTEMA}>La escala en «{tituloSinNumero(sesion.titulo)}»</span>
      <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface px-3">
        {dims.map((d) => (
          <li key={d.id} className="flex flex-col gap-1 py-2">
            <div className="flex items-center justify-between gap-2 text-[13px]">
              <span className="min-w-0 text-fg">{d.nombre}</span>
              {d.previo ? (
                <span className="inline-flex flex-shrink-0 items-center gap-1.5 text-fg-secondary" title={d.previo.fuente === "test" ? "Del test en línea" : "De la preventa"}>
                  <span className={cn("h-2 w-2 rounded-full", PUNTO_DE_NIVEL[d.previo.letra as Letra])} />
                  {d.previo.nivel}
                </span>
              ) : (
                <span className="flex-shrink-0 text-fg-muted">sin punto de partida</span>
              )}
            </div>
            {(d.cuestionario.length > 0 || d.desacuerdo) && (
              <p className="text-xs text-fg-muted">
                {d.cuestionario.map((r) => `${r.persona.split(" ")[0]}: ${r.nivel ?? "—"}`).join(" · ")}
                {d.desacuerdo && <span className="ml-1 font-semibold text-warn-ink">{d.desacuerdo === "se-contradicen" ? "· se contradicen" : "· difieren"}</span>}
              </p>
            )}
          </li>
        ))}
      </ul>
      <span className="text-[11px] text-fg-muted">
        Las preguntas con E apuntan a estas dimensiones. El nivel lo pone el Diagnóstico, con lo que se escuche en la sesión.
      </span>
    </section>
  );
}

// ── Una sesión del plan ──────────────────────────────────────────────────────

function letrasDe(preguntas: ReadonlyArray<{ objetivo?: string }>) {
  return [
    ...new Map(
      preguntas
        .map((q) => letraDelObjetivo(q.objetivo))
        .filter((x): x is NonNullable<typeof x> => !!x)
        .map((l) => [l.letra, l]),
    ).values(),
  ];
}

function PanelDeSesion({
  sesion: s,
  numero,
  respondidas,
  contradicciones,
  hrefDeLaFicha,
  ocupado,
  cambiar,
}: {
  sesion: Sesion;
  numero: number;
  respondidas: ItemPropuesto[];
  contradicciones: ItemPropuesto[];
  hrefDeLaFicha: string;
  ocupado: boolean;
  cambiar: Cambiar;
}) {
  const hechas = s.preguntas.filter((q) => q.hecha).length;
  const completa = s.preguntas.length > 0 && hechas === s.preguntas.length;
  const letras = letrasDe(s.preguntas);

  return (
    <section data-recorrido="exploracion.sesion" className="flex flex-col gap-3.5 rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-[240px] flex-1 flex-col gap-1">
          <h3 className="text-[15px] font-semibold leading-5 text-fg">
            Sesión {numero} · {tituloSinNumero(s.titulo)}
          </h3>
          {s.objetivo && <p className="text-[13px] text-fg-secondary">{s.objetivo}</p>}
        </div>
        <span className={cn("flex-shrink-0 text-xs", completa ? "font-semibold text-success-ink" : "text-fg-muted")}>
          {completa ? "✓ " : ""}
          {hechas} de {s.preguntas.length} preguntadas
        </span>
      </div>

      <label className="flex items-center gap-2 text-xs text-fg-muted">
        <span className="flex-shrink-0">Con quién</span>
        <input
          className={cn(INPUT, "py-1 text-[13px]")}
          defaultValue={s.conQuien}
          placeholder="A quién invitar y por qué"
          onBlur={(e) => e.target.value !== s.conQuien && void cambiar([{ op: "editar", lista: "sesiones", id: s.id, campos: { conQuien: e.target.value } }])}
        />
      </label>

      {contradicciones.length > 0 && (
        <ul className="space-y-1.5">
          {contradicciones.map((i) => (
            <SugerenciaEnLinea
              key={i.id}
              item={i}
              rotulo="Se contradicen"
              accion="Llevar a esta sesión"
              ocupado={ocupado}
              onUsar={() => void cambiar([{ op: "usar", itemId: i.id, sesionId: s.id }], "Listo: la contradicción quedó como pregunta de esta sesión.")}
              onDescartar={() => void cambiar([{ op: "descartar", itemIds: [i.id] }])}
            />
          ))}
        </ul>
      )}

      {s.preguntas.length === 0 ? (
        <p className="text-[13px] text-fg-muted">Esta sesión todavía no tiene preguntas.</p>
      ) : (
        <ol className="flex flex-col">
          {s.preguntas.map((q, i) => (
            <FilaDePregunta
              key={q.id}
              sesionId={s.id}
              pregunta={q}
              primera={i === 0}
              respondida={respondidas.find((r) => r.destino.tipo === "respondida" && r.destino.preguntaId === q.id) ?? null}
              hrefDeLaFicha={hrefDeLaFicha}
              ocupado={ocupado}
              cambiar={cambiar}
            />
          ))}
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <AgregarEnLinea
          texto="+ Agregar una pregunta"
          placeholder="La pregunta, abierta y con ejemplos…"
          ocupado={ocupado}
          onAgregar={async (texto) => !!(await cambiar([{ op: "agregarPregunta", sesionId: s.id, texto }]))}
        />
        <span className="flex-1" />
        {letras.length > 0 && <span className="text-xs text-fg-muted">{letras.map((l) => `${l.letra} ${l.corto}`).join(" · ")}</span>}
      </div>
    </section>
  );
}

function FilaDePregunta({
  sesionId,
  pregunta: q,
  primera,
  respondida,
  hrefDeLaFicha,
  ocupado,
  cambiar,
}: {
  sesionId: string;
  pregunta: PreguntaDeSesion;
  primera: boolean;
  respondida: ItemPropuesto | null;
  hrefDeLaFicha: string;
  ocupado: boolean;
  cambiar: Cambiar;
}) {
  const letra = letraDelObjetivo(q.objetivo);
  const campos = (q.fichaCampos ?? []).map((k) => ETIQUETA_DEL_CAMPO.get(k) ?? k);
  return (
    <li className={cn("flex items-start gap-3 py-3.5", !primera && "border-t border-line")}>
      <button
        type="button"
        role="checkbox"
        aria-checked={q.hecha}
        aria-label={q.hecha ? "Marcar como no preguntada" : "Marcar como preguntada"}
        disabled={ocupado}
        onClick={() => void cambiar([{ op: "marcarPregunta", sesionId, preguntaId: q.id, hecha: !q.hecha }])}
        className={cn(
          "mt-1 inline-flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-[5px] text-xs font-bold transition-colors disabled:opacity-50",
          q.hecha ? "border border-success-line bg-success-surface text-success-ink" : "border-[1.5px] border-line bg-surface hover:border-brand",
        )}
      >
        {q.hecha ? "✓" : ""}
      </button>
      <span
        title={letra?.ayuda ?? "Sin objetivo"}
        className="inline-flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-[7px] bg-surface-hover text-[11px] font-semibold text-fg-secondary"
      >
        {letra?.letra ?? "·"}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-[14.5px] font-semibold leading-[21px] text-fg">{q.texto}</span>
        {q.repregunta && <span className="text-[13px] text-fg-muted">Si sale vaga: {q.repregunta}</span>}
        {q.hecha && (
          <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface-muted px-2.5 py-2">
            <span className={ROTULO_DEL_SISTEMA}>Lo que averiguaste</span>
            <textarea
              className="min-h-[40px] w-full resize-y border-0 bg-transparent p-0 text-[13px] text-fg placeholder:text-fg-muted focus:outline-none"
              rows={2}
              defaultValue={q.respuesta ?? ""}
              placeholder="Anótalo: va como sugerencia a Información del cliente."
              onBlur={(e) => {
                // El servidor guarda la respuesta en una línea: se compara igual, o cada salida del campo guardaría de nuevo.
                if (e.target.value.replace(/\s+/g, " ").trim() !== (q.respuesta ?? "")) {
                  void cambiar([{ op: "marcarPregunta", sesionId, preguntaId: q.id, hecha: true, respuesta: e.target.value }]);
                }
              }}
            />
            {campos.length > 0 && (
              <span className="text-xs text-fg-muted">
                Llegó como sugerencia a Información del cliente › {campos.join(", ")} ·{" "}
                <Link href={hrefDeLaFicha} className="font-medium text-brand hover:text-brand-light">
                  ver
                </Link>
              </span>
            )}
          </div>
        )}
        {respondida && (
          <ul>
            <SugerenciaEnLinea
              item={respondida}
              rotulo="Ya respondida"
              accion="Usar como respuesta"
              ocupado={ocupado}
              onUsar={() => void cambiar([{ op: "usar", itemId: respondida.id }])}
              onDescartar={() => void cambiar([{ op: "descartar", itemIds: [respondida.id] }])}
            />
          </ul>
        )}
      </div>
      {!q.hecha && (
        <BotonTexto onClick={() => void cambiar([{ op: "quitar", lista: "sesiones", id: q.id }])} disabled={ocupado} title="Quitar la pregunta del plan">
          Quitar
        </BotonTexto>
      )}
    </li>
  );
}

// ── Lo que propone el agente ─────────────────────────────────────────────────

function SugerenciaEnLinea({
  item,
  rotulo,
  accion,
  ocupado,
  onUsar,
  onDescartar,
}: {
  item: ItemPropuesto;
  rotulo: string;
  /** Sin acción (p. ej. una contradicción sin sesión donde llevarla), solo se puede descartar. */
  accion?: string;
  ocupado: boolean;
  onUsar?: () => void;
  onDescartar: () => void;
}) {
  const val = item.valor as Record<string, unknown>;
  const texto = String(val.respuesta ?? val.texto ?? "");
  return (
    <li data-sugerencia={item.id} className="flex items-start gap-2.5 rounded-lg border border-info-line bg-info-surface py-2.5 pl-3 pr-2.5">
      <IconoDeSugerencia className="mt-[3px] h-[15px] w-[15px] flex-shrink-0 text-brand" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-xs font-semibold text-brand">{rotulo}</span>
        <span className="text-[13px] leading-[1.45] text-fg">{texto}</span>
        <span className="truncate text-xs text-fg-muted">{enUnaLinea(item)}</span>
      </div>
      <div className="flex flex-shrink-0 items-center gap-1">
        <BotonTexto onClick={onDescartar} disabled={ocupado}>
          Descartar
        </BotonTexto>
        {accion && onUsar && (
          <BotonAzul onClick={onUsar} disabled={ocupado} className="px-[11px] py-[5px]">
            {accion}
          </BotonAzul>
        )}
      </div>
    </li>
  );
}

/** Una sesión que propone el agente, en su pestaña: se lee entera y se usa o se descarta. */
function SesionPropuesta({
  item,
  numero,
  contradicciones,
  ocupado,
  onUsar,
  onDescartar,
}: {
  item: ItemPropuesto;
  numero: number;
  /** Las contradicciones, si esta es la sesión donde esperan (todavía no hay ninguna en el plan). */
  contradicciones: ItemPropuesto[];
  ocupado: boolean;
  /** `conContradicciones`: usar también las contradicciones, como preguntas de esta sesión. */
  onUsar: (conContradicciones: boolean) => void;
  onDescartar: (id: string) => void;
}) {
  const val = item.valor as ValorDeSesion;
  const preguntas = val.preguntas ?? [];
  const letras = letrasDe(preguntas);
  return (
    <section data-recorrido="exploracion.sesion" data-sugerencia={item.id} className="flex flex-col gap-3.5 rounded-xl border border-info-line bg-info-surface p-5">
      <div className="flex flex-wrap items-center gap-2">
        <IconoDeSugerencia className="h-[15px] w-[15px] flex-shrink-0 text-brand" />
        <span className="text-xs font-semibold text-brand">El agente propone esta sesión</span>
        <span className="flex-1" />
        <BotonTexto onClick={() => onDescartar(item.id)} disabled={ocupado}>
          Descartar
        </BotonTexto>
        <BotonAzul onClick={() => onUsar(false)} disabled={ocupado} className="px-[11px] py-[5px]">
          Usar la sesión
        </BotonAzul>
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="text-[15px] font-semibold leading-5 text-fg">
          Sesión {numero} · {tituloSinNumero(val.titulo ?? "")}
        </h3>
        {(val.conQuien || val.objetivo) && (
          <p className="text-[13px] text-fg-secondary">
            {val.conQuien ? `Con ${val.conQuien}. ` : ""}
            {val.objetivo}
          </p>
        )}
      </div>

      {preguntas.length > 0 && (
        <ol className="flex flex-col rounded-lg border border-line bg-surface px-3">
          {preguntas.map((q, n) => {
            const letra = letraDelObjetivo(q.objetivo);
            return (
              <li key={n} className={cn("flex items-start gap-3 py-2.5", n > 0 && "border-t border-line")}>
                <span
                  title={letra?.ayuda ?? "Sin objetivo"}
                  className="inline-flex h-[24px] w-[24px] flex-shrink-0 items-center justify-center rounded-[7px] bg-surface-hover text-[11px] font-semibold text-fg-secondary"
                >
                  {letra?.letra ?? "·"}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[13.5px] leading-5 text-fg">{q.texto}</span>
                  {q.repregunta && <span className="text-xs text-fg-muted">Si sale vaga: {q.repregunta}</span>}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {contradicciones.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-fg-muted">
            {contradicciones.length === 1 ? "Esta contradicción se lleva" : "Estas contradicciones se llevan"} a la sesión al usarla: el plan todavía no tiene otra.
          </span>
          <ul className="space-y-1.5">
            {contradicciones.map((i) => (
              <SugerenciaEnLinea key={i.id} item={i} rotulo="Se contradicen" ocupado={ocupado} onDescartar={() => onDescartar(i.id)} />
            ))}
          </ul>
          <div>
            <BotonBlanco onClick={() => onUsar(true)} disabled={ocupado}>
              Usar la sesión con {contradicciones.length === 1 ? "la contradicción" : `las ${contradicciones.length} contradicciones`}
            </BotonBlanco>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">{enUnaLinea(item)}</span>
        {letras.length > 0 && <span className="text-xs text-fg-muted">{letras.map((l) => `${l.letra} ${l.corto}`).join(" · ")}</span>}
      </div>
    </section>
  );
}

// ── Agregar a mano ───────────────────────────────────────────────────────────

/** La pestaña «+ Sesión»: una sesión nueva escrita a mano. */
function SesionAMano({
  numero,
  ocupado,
  onAgregar,
  onCancelar,
}: {
  numero: number;
  ocupado: boolean;
  onAgregar: (o: { titulo: string; conQuien: string; objetivo: string }) => Promise<boolean>;
  onCancelar?: () => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [conQuien, setConQuien] = useState("");
  const [objetivo, setObjetivo] = useState("");
  return (
    <form
      className="flex flex-col gap-3.5 rounded-xl border border-line bg-surface p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (titulo.trim()) await onAgregar({ titulo, conQuien, objetivo });
      }}
    >
      <h3 className="text-[15px] font-semibold leading-5 text-fg">Sesión {numero} · nueva</h3>
      <label className="flex flex-col gap-1 text-xs text-fg-muted">
        De qué se trata
        <input autoFocus className={INPUT} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej.: Datos del ERP y arquitectura de cliente" maxLength={120} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-fg-muted">
        Con quién
        <input className={INPUT} value={conQuien} onChange={(e) => setConQuien(e.target.value)} placeholder="A quién invitar y por qué" maxLength={300} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-fg-muted">
        Para qué
        <textarea className={cn(INPUT, "min-h-[60px] resize-y")} value={objetivo} onChange={(e) => setObjetivo(e.target.value)} placeholder="Qué hay que entender en esta sesión" maxLength={400} />
      </label>
      <p className="text-xs text-fg-muted">Las preguntas se agregan después, en la pestaña de la sesión.</p>
      <div className="flex justify-end gap-2">
        {onCancelar && <BotonBlanco onClick={onCancelar}>Cancelar</BotonBlanco>}
        <button
          type="submit"
          disabled={ocupado || !titulo.trim()}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          Agregar la sesión
        </button>
      </div>
    </form>
  );
}

function AgregarEnLinea({
  texto,
  placeholder,
  ocupado,
  onAgregar,
}: {
  texto: string;
  placeholder: string;
  ocupado: boolean;
  onAgregar: (t: string) => Promise<boolean>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [t, setT] = useState("");
  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="self-start py-1 text-xs text-fg-muted transition-colors hover:text-fg">
        {texto}
      </button>
    );
  }
  return (
    <form
      className="flex w-full max-w-[560px] gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (t.trim() && (await onAgregar(t))) {
          setT("");
          setAbierto(false);
        }
      }}
    >
      <input autoFocus className={INPUT} placeholder={placeholder} value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setAbierto(false)} />
      <BotonBlanco onClick={() => setAbierto(false)}>Cancelar</BotonBlanco>
      <button type="submit" disabled={ocupado || !t.trim()} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50">
        Agregar
      </button>
    </form>
  );
}
