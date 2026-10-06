"use client";

/**
 * La Bandeja de /feedback: cada reporte con su captura, lo que se mandó con él y qué se hace con él.
 *
 * Tres columnas (sistema «Nexus · interfaz interna»): la lista a la izquierda, el reporte al centro y, a
 * la derecha, «Qué sigue» y las TRES salidas de un reporte —«Llevar a la hoja de ruta» (el único botón
 * azul), «Responder y cerrar» y «No se hará»—. Un reporte llega a la hoja de ruta solo por acá.
 *
 * Arriba del reporte va, si hay, el tema al que se parece. NO es una sugerencia de un agente (sale de
 * contar palabras en común, lib/feedback/parecidos.ts), así que va sin la chispa y dice qué comparten.
 *
 * Lo que se manda desde la escala (2026-10-05, lib/feedback/escala.ts) llega a la misma bandeja: arriba
 * de la captura muestra el criterio, lo que se leía y lo que dice hoy; al llevarlo a la hoja de ruta pide
 * la fila de «Cambios pendientes» del manual. «De dónde» filtra pantallas o escala.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Segmentado } from "@/components/ui/Segmentado";
import { QueSigue, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import type { DatosDeBandeja, ReporteDeBandeja, ReporteDetalle } from "@/lib/feedback/queries";
import { COLUMNA, estadoParaElAutor, haceCuanto, numeroDeReporte, TIPO, TIPOS_DE_FEEDBACK, type TipoDeFeedback } from "@/lib/feedback/reglas";
import { ChipDeEstado, EnlaceDeRuta, Hilo, IconoDeTipo, Iniciales, MarcaNumerada } from "../piezas";
import DialogoLlevar from "./DialogoLlevar";
import PanelLateral from "@/components/ui/PanelLateral";

type Filtro = "sin" | "respondieron" | "todos";
export type Origen = "todos" | "pantallas" | "escala";

const NOMBRE_DEL_ESTADO: Record<string, string> = {
  sin_revisar: "Sin revisar",
  en_hoja: "En la hoja de ruta",
  respondido: "Respondido",
  no_se_hara: "No se hará",
};

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = (await r.json().catch(() => null)) as { error?: string } | null;
    return r.ok ? { ok: true } : { ok: false, error: d?.error ?? "No se pudo guardar." };
  } catch {
    return { ok: false, error: "No hay conexión." };
  }
}

export default function BandejaDeFeedback({
  datos,
  reporteInicial,
  origenInicial = "todos",
}: {
  datos: DatosDeBandeja;
  reporteInicial: string | null;
  /** `/feedback?origen=escala`: desde el botón «Feedback» de la escala. */
  origenInicial?: Origen;
}) {
  const router = useRouter();
  const toast = useToast();
  const [filtro, setFiltro] = useState<Filtro>(reporteInicial ? "todos" : "sin");
  const [tipo, setTipo] = useState<TipoDeFeedback | "todos">("todos");
  const [origen, setOrigen] = useState<Origen>(origenInicial);
  const [busqueda, setBusqueda] = useState("");
  const [sel, setSel] = useState<string | null>(reporteInicial ?? datos.reportes.find((r) => r.estado === "sin_revisar")?.id ?? datos.reportes[0]?.id ?? null);
  const [detalle, setDetalle] = useState<ReporteDetalle | null>(null);
  const [dialogo, setDialogo] = useState(false);
  const [descartadas, setDescartadas] = useState<Set<string>>(new Set());

  const temasPorId = useMemo(() => new Map(datos.temas.map((t) => [t.id, t])), [datos.temas]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return datos.reportes.filter((r) => {
      if (filtro === "sin" && r.estado !== "sin_revisar" && r.id !== sel) return false;
      if (filtro === "respondieron" && !r.respondio) return false;
      if (tipo !== "todos" && r.tipo !== tipo) return false;
      if (origen === "escala" && !r.escala) return false;
      if (origen === "pantallas" && r.escala) return false;
      if (q && !`${r.cuerpo} ${r.autor.nombre} ${r.pantalla} ${r.escala?.ancla ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [datos.reportes, filtro, tipo, origen, busqueda, sel]);

  const actual = datos.reportes.find((r) => r.id === sel) ?? null;

  const cargarDetalle = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/feedback/${id}`, { cache: "no-store" });
      const d = (await r.json().catch(() => null)) as { reporte?: ReporteDetalle } | null;
      setDetalle(d?.reporte ?? null);
    } catch {
      setDetalle(null);
    }
  }, []);

  useEffect(() => {
    if (!sel) return;
    let vivo = true;
    fetch(`/api/feedback/${sel}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { reporte?: ReporteDetalle } | null) => {
        if (vivo) setDetalle(d?.reporte ?? null);
      })
      .catch(() => {
        if (vivo) setDetalle(null);
      });
    return () => {
      vivo = false;
    };
  }, [sel]);

  /** Cambiar de reporte: el detalle anterior se va enseguida (no se ve uno con la captura del otro). */
  const elegir = useCallback((id: string) => {
    setDetalle(null);
    setSel(id);
  }, []);

  const refrescar = useCallback(async () => {
    router.refresh();
    if (sel) await cargarDetalle(sel);
  }, [router, sel, cargarDetalle]);

  const decidir = useCallback(
    async (body: unknown, exito: string) => {
      if (!sel) return false;
      const r = await postJson(`/api/feedback/${sel}/decision`, body);
      if (!r.ok) {
        toast.error(r.error ?? "No se pudo guardar.");
        return false;
      }
      toast.success(exito);
      await refrescar();
      return true;
    },
    [sel, toast, refrescar],
  );

  const masViejo = useMemo(
    () => [...datos.reportes].filter((r) => r.estado === "sin_revisar").sort((a, b) => a.creado.localeCompare(b.creado))[0] ?? null,
    [datos.reportes],
  );

  if (datos.reportes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface-muted p-8 text-center">
        <p className="text-sm font-semibold text-fg">Todavía nadie mandó feedback.</p>
        <p className="mt-1 text-[13px] text-fg-muted">
          Cada persona del equipo lo manda desde «Feedback», en el pie del menú. Para empezar, pídele su opinión a alguien en «Personas».
        </p>
      </div>
    );
  }

  const sugerencia = actual?.sugerencia && !descartadas.has(actual.id) ? actual.sugerencia : null;
  const temaSugerido = sugerencia ? temasPorId.get(sugerencia.temaId) ?? null : null;

  return (
    <div className="-mx-6 flex flex-wrap items-stretch border-y border-line">
      {/* ── La lista ── */}
      <section aria-label="Reportes" className="flex w-full flex-col gap-3 border-line bg-surface p-4 lg:w-[360px] lg:flex-none lg:border-r">
        <Segmentado<Filtro>
          etiqueta="Cuáles"
          valor={filtro}
          onCambio={setFiltro}
          opciones={[
            { clave: "sin", etiqueta: "Sin revisar", cuenta: datos.sinRevisar },
            { clave: "respondieron", etiqueta: "Te respondieron", cuenta: datos.reportes.filter((r) => r.respondio).length },
            { clave: "todos", etiqueta: "Todos", cuenta: datos.reportes.length },
          ]}
        />
        <div className="flex gap-2">
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoDeFeedback | "todos")}
            aria-label="Tipo"
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 py-[7px] text-[13px] text-fg-secondary"
          >
            <option value="todos">Todos los tipos</option>
            {TIPOS_DE_FEEDBACK.map((t) => (
              <option key={t} value={t}>
                {TIPO[t].nombre}
              </option>
            ))}
          </select>
          <select
            value={origen}
            onChange={(e) => setOrigen(e.target.value as Origen)}
            aria-label="De dónde"
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 py-[7px] text-[13px] text-fg-secondary"
          >
            <option value="todos">De todas partes</option>
            <option value="pantallas">De las pantallas</option>
            <option value="escala">De la escala</option>
          </select>
        </div>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por texto, persona o criterio…"
          aria-label="Buscar reportes"
          className="w-full rounded-lg border border-line bg-surface px-2.5 py-[7px] text-[13px] text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none"
        />
        <div className="space-y-1.5">
          {visibles.length === 0 && <p className="rounded-lg border border-dashed border-line p-3 text-[13px] text-fg-muted">Nada por acá con ese filtro.</p>}
          {visibles.map((r) => (
            <FilaDeReporte key={r.id} r={r} actual={r.id === sel} conSugerencia={!!r.sugerencia && !descartadas.has(r.id)} onElegir={() => elegir(r.id)} />
          ))}
        </div>
        <p className="text-xs text-fg-muted">Lo más nuevo arriba. Un reporte sale de «Sin revisar» cuando decides qué hacer con él.</p>
      </section>

      {/* ── El reporte ── */}
      <section aria-label="El reporte" className="min-w-0 flex-[999_1_520px] space-y-5 bg-surface-muted p-6">
        {!actual ? (
          <p className="text-[13px] text-fg-muted">Elige un reporte de la lista.</p>
        ) : (
          <>
            {sugerencia && temaSugerido && actual.estado === "sin_revisar" && (
              <div className="flex flex-wrap items-start gap-3 rounded-[10px] border border-line bg-surface px-3.5 py-3">
                <div className="min-w-[240px] flex-1 space-y-0.5">
                  <p className={ROTULO_DEL_SISTEMA}>Se parece a un tema · {COLUMNA[temaSugerido.columna].nombre}</p>
                  <p className="text-sm font-semibold text-fg">{temaSugerido.titulo}</p>
                  <p className="text-xs text-fg-muted">
                    Comparten: {sugerencia.enComun.join(", ")} · {temaSugerido.personas} {temaSugerido.personas === 1 ? "persona" : "personas"} lo pidieron
                  </p>
                </div>
                <div className="flex flex-none items-center gap-1 self-center">
                  <button type="button" onClick={() => setDescartadas((s) => new Set(s).add(actual.id))} className="rounded px-2 py-[5px] text-xs text-fg-muted hover:text-fg">
                    No es eso
                  </button>
                  <button
                    type="button"
                    // Lo de la escala lleva la fila del manual: pasa por el diálogo, con este tema ya elegido.
                    onClick={() =>
                      actual.escala ? setDialogo(true) : void decidir({ accion: "llevar", temaId: temaSugerido.id, avisar: true }, `Llevado a «${temaSugerido.titulo}».`)
                    }
                    className="rounded-md border border-line bg-surface px-2.5 py-[5px] text-xs font-semibold text-fg-secondary hover:bg-surface-hover hover:text-fg"
                  >
                    Llevarlo ahí
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <Iniciales texto={actual.autor.iniciales} className="h-8 w-8 text-[11px]" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-fg">{actual.autor.nombre}</p>
                  <p className="text-xs text-fg-muted">
                    {actual.autor.rol} · {haceCuanto(actual.creado)} · {numeroDeReporte(actual.numero)}
                  </p>
                </div>
                <span className="flex-1" />
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs font-medium text-fg-secondary">
                  <IconoDeTipo tipo={actual.tipo} />
                  {TIPO[actual.tipo].nombre}
                </span>
                {actual.tipo === "falla" && actual.meFrena && (
                  <span className="rounded-full border border-warn-line bg-warn-surface px-2.5 py-0.5 text-xs font-semibold text-warn-ink">Le frena el trabajo</span>
                )}
              </div>
              <p className="whitespace-pre-wrap break-words text-[15px] leading-[1.55] text-fg">«{actual.cuerpo}»</p>
            </div>

            {actual.escala && <LoQueSeLeia detalle={detalle} />}
            <Captura detalle={detalle} />
            <LoQueSeMando detalle={detalle} />
            <Conversacion detalle={detalle} nombre={actual.autor.nombre.split(" ")[0]} onEnviado={refrescar} onResponderYCerrar={(t) => decidir({ accion: "responder", respuesta: t }, "Respondido y cerrado.")} />
          </>
        )}
      </section>

      {/* ── Decidir ── */}
      <PanelLateral etiqueta="Decidir" ancho="lg:w-[310px] lg:flex-none" className="w-full p-5" gap="gap-5">
        <QueSigue
          accion={
            masViejo && masViejo.id !== sel ? (
              <button type="button" onClick={() => elegir(masViejo.id)} className="text-[13px] font-semibold text-brand hover:text-brand-light">
                Abrir el más viejo →
              </button>
            ) : undefined
          }
        >
          {datos.sinRevisar === 0
            ? "No hay nada sin revisar. Mira la hoja de ruta o pídele su opinión a alguien que hace rato no reporta."
            : `${datos.sinRevisar} sin revisar.${masViejo ? ` El más viejo es de ${masViejo.autor.nombre.split(" ")[0]}, ${haceCuanto(masViejo.creado)}.` : ""}`}
        </QueSigue>

        {actual && (
          <Salidas
            actual={actual}
            detalle={detalle}
            onLlevar={() => setDialogo(true)}
            decidir={decidir}
          />
        )}

        {actual && (
          <div className="space-y-2">
            <p className={ROTULO_DEL_SISTEMA}>
              De {actual.autor.nombre.split(" ")[0]} · {datos.porPersona[actual.autor.email] ?? 1} {(datos.porPersona[actual.autor.email] ?? 1) === 1 ? "reporte" : "reportes"}
            </p>
            {datos.reportes
              .filter((r) => r.autor.email === actual.autor.email && r.id !== actual.id)
              .slice(0, 3)
              .map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => elegir(r.id)}
                  className="flex w-full items-start justify-between gap-2 rounded-lg border border-line bg-surface px-2.5 py-2 text-left hover:bg-surface-hover"
                >
                  <span className="line-clamp-2 text-xs leading-[1.4] text-fg-secondary">{r.cuerpo}</span>
                  <span className="flex-none rounded-full border border-line bg-surface px-2 text-[11px] font-semibold text-fg-secondary">{NOMBRE_DEL_ESTADO[r.estado] ?? r.estado}</span>
                </button>
              ))}
          </div>
        )}

        {actual && (
          <div className="space-y-1">
            <p className={ROTULO_DEL_SISTEMA}>Esta pantalla</p>
            <p className="text-[13px] text-fg-secondary">
              «{actual.pantalla}» recibió {datos.porPantalla[actual.pantalla] ?? 1} {(datos.porPantalla[actual.pantalla] ?? 1) === 1 ? "reporte" : "reportes"} en 30 días.
            </p>
          </div>
        )}
      </PanelLateral>

      {dialogo && actual && (
        <DialogoLlevar
          // Se arma de nuevo cuando llega lo que se comentó en la escala: la fila del manual se propone desde ahí.
          key={detalle?.id === actual.id && detalle.escala ? "con-escala" : "sin-escala"}
          reporte={actual}
          escala={detalle?.id === actual.id ? (detalle.escala ?? null) : null}
          temas={datos.temas}
          sugerido={sugerencia?.temaId ?? null}
          onCerrar={() => setDialogo(false)}
          onLlevar={async (body, exito) => {
            const ok = await decidir(body, exito);
            if (ok) setDialogo(false);
          }}
        />
      )}
    </div>
  );
}

function FilaDeReporte({ r, actual, conSugerencia, onElegir }: { r: ReporteDeBandeja; actual: boolean; conSugerencia: boolean; onElegir: () => void }) {
  const decidido = r.estado !== "sin_revisar";
  return (
    <button
      type="button"
      onClick={onElegir}
      aria-current={actual ? "true" : undefined}
      className={cn(
        "flex w-full flex-col gap-1.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
        actual ? "border-info-line bg-info-surface" : "border-line bg-surface hover:bg-surface-hover",
      )}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-fg-muted">
          <IconoDeTipo tipo={r.tipo} />
          <span className="truncate">
            {TIPO[r.tipo].nombre} · {r.pantalla}
            {r.escala ? ` · ${r.escala.ancla}` : ""}
          </span>
        </span>
        <span className="flex-none text-xs text-fg-muted">{haceCuanto(r.creado)}</span>
      </span>
      <span className={cn("line-clamp-2 text-[13px] leading-[1.4] text-fg", r.sinAbrir && !actual && !decidido && "font-semibold")}>{r.cuerpo}</span>
      <span className="flex flex-wrap items-center gap-1.5">
        <Iniciales texto={r.autor.iniciales} className="h-5 w-5 text-[9px]" />
        <span className="text-xs text-fg-secondary">{r.autor.nombre}</span>
        {r.tipo === "falla" && r.meFrena && (
          <span className="rounded-full border border-warn-line bg-warn-surface px-[7px] text-[11px] font-semibold text-warn-ink">Le frena</span>
        )}
        {decidido && <span className="rounded-full border border-line bg-surface px-[7px] text-[11px] font-semibold text-fg-secondary">{NOMBRE_DEL_ESTADO[r.estado] ?? r.estado}</span>}
        {r.respondio && <span className="text-[11px] font-semibold text-brand">Te respondió</span>}
        {conSugerencia && !decidido && <span className="text-[11px] text-fg-muted">· se parece a un tema</span>}
        {r.sinAbrir && !actual && !decidido && <span aria-label="sin abrir" className="ml-auto h-[7px] w-[7px] rounded-full bg-brand" />}
      </span>
    </button>
  );
}

function Captura({ detalle }: { detalle: ReporteDetalle | null }) {
  if (!detalle) return <div className="skeleton-shimmer h-[320px] rounded-xl border border-line" aria-hidden="true" />;
  if (!detalle.capturaUrl) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface p-4 text-[13px] text-fg-muted">
        No mandó captura: queda solo la dirección de la pantalla.{" "}
        <EnlaceDeRuta ruta={detalle.ruta} className="font-semibold text-brand hover:text-brand-light">
          Ir a la pantalla
        </EnlaceDeRuta>
      </div>
    );
  }
  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-surface">
      <a href={detalle.capturaUrl} target="_blank" rel="noreferrer" className="block border-b border-line">
        {/* eslint-disable-next-line @next/next/no-img-element -- enlace firmado de Storage */}
        <img src={detalle.capturaUrl} alt={`Captura de «${detalle.pantalla}»`} className="max-h-[420px] w-full object-cover object-top" />
      </a>
      <figcaption className="flex flex-wrap items-center gap-3 px-3.5 py-2.5 text-xs text-fg-muted">
        <span>
          Captura · {haceCuanto(detalle.creado)} · {detalle.pantalla}
        </span>
        {detalle.marcas.map((m) => (
          <span key={m.n} className="inline-flex items-center gap-1.5 text-fg-secondary">
            <MarcaNumerada n={m.n} className="h-4 w-4 text-[9px]" />
            {m.descripcion}
          </span>
        ))}
        <span className="flex-1" />
        <a href={detalle.capturaUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand hover:text-brand-light">
          Abrir en tamaño real
        </a>
        <EnlaceDeRuta ruta={detalle.ruta} className="font-semibold text-brand hover:text-brand-light">
          Ir a la pantalla
        </EnlaceDeRuta>
      </figcaption>
    </figure>
  );
}

/**
 * Mandado desde la escala: qué criterio, lo que se leía al mandarlo y, si cambió, lo que dice hoy; con qué
 * versión, edición y perfil. Va arriba de la captura.
 */
function LoQueSeLeia({ detalle }: { detalle: ReporteDetalle | null }) {
  if (!detalle) return <div className="skeleton-shimmer h-[180px] rounded-xl border border-line" aria-hidden="true" />;
  const e = detalle.escala;
  if (!e) return null;
  const cambio = e.textoDeHoy !== null && e.textoDeHoy !== e.textoAnclado;
  const hechos: { k: string; v: string }[] = [
    { k: "Versión de la escala", v: e.versionVigente && e.versionVigente !== e.version ? `${e.version} (hoy rige la ${e.versionVigente})` : e.version },
    { k: "Edición", v: e.edicion ?? "La escala general" },
    { k: "Perfil en la pantalla", v: e.perfil ?? "Sin filtrar" },
  ];
  return (
    <div className="space-y-2">
      <p className={ROTULO_DEL_SISTEMA}>Sobre la escala</p>
      <div className="space-y-3 rounded-xl border border-line bg-surface px-4 py-3.5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
          <span className="rounded-full border border-line bg-surface px-[7px] text-[11px] font-semibold tabular-nums leading-[18px] text-fg-secondary">{e.ancla}</span>
          {e.ruta ?? "Ya no existe en la versión vigente"}
          <span className="flex-1" />
          <EnlaceDeRuta ruta={detalle.ruta} className="font-semibold text-brand hover:text-brand-light">
            Ver en la escala
          </EnlaceDeRuta>
        </p>
        <p className="text-sm leading-relaxed text-fg">«{e.textoAnclado}»</p>
        {e.textoDeHoy === null ? (
          <p className="rounded-lg border border-warn-line bg-warn-surface px-3 py-2 text-xs text-warn-ink">Ese texto ya no existe en la versión vigente.</p>
        ) : (
          cambio && (
            <p className="rounded-lg border border-warn-line bg-warn-surface px-3 py-2 text-xs leading-relaxed text-warn-ink">
              <span className="font-semibold">Hoy dice: </span>
              {e.textoDeHoy}
            </p>
          )
        )}
        <dl className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5 border-t border-line pt-3">
          {hechos.map((h) => (
            <div key={h.k} className="min-w-0 space-y-0.5">
              <dt className="text-xs text-fg-muted">{h.k}</dt>
              <dd className="break-words text-[13px] text-fg-secondary">{h.v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function LoQueSeMando({ detalle }: { detalle: ReporteDetalle | null }) {
  if (!detalle) return null;
  const hechos: { k: string; v: string; alerta?: boolean }[] = [
    { k: "Pantalla", v: detalle.pantalla },
    { k: "Dirección", v: detalle.ruta },
    { k: "Navegador", v: [detalle.navegador, detalle.ventana].filter(Boolean).join(" · ") || "Sin dato" },
    { k: "Versión de Nexus", v: detalle.version ?? "Sin dato" },
    {
      k: "Errores de la pantalla",
      v: detalle.errores.length ? detalle.errores.map((e) => `«${e.mensaje}» (${e.hace})`).join(" · ") : "Ninguno",
      alerta: detalle.errores.length > 0,
    },
    { k: "Marcas", v: detalle.marcas.length ? detalle.marcas.map((m) => `${m.n} · ${m.descripcion}`).join(" · ") : "Ninguna" },
  ];
  return (
    <div className="space-y-2">
      <p className={ROTULO_DEL_SISTEMA}>Lo que se mandó con el reporte</p>
      <dl className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5 rounded-xl border border-line bg-surface px-4 py-3.5">
        {hechos.map((h) => (
          <div key={h.k} className="min-w-0 space-y-0.5">
            <dt className="text-xs text-fg-muted">{h.k}</dt>
            <dd className={cn("break-words text-[13px]", h.alerta ? "text-warn-ink" : "text-fg-secondary")}>{h.v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Conversacion({
  detalle,
  nombre,
  onEnviado,
  onResponderYCerrar,
}: {
  detalle: ReporteDetalle | null;
  nombre: string;
  onEnviado: () => Promise<void>;
  onResponderYCerrar: (texto: string) => Promise<boolean>;
}) {
  const toast = useToast();
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const campo = useRef<HTMLTextAreaElement>(null);
  if (!detalle) return null;
  const abierto = detalle.estado === "sin_revisar" || detalle.estado === "en_hoja";

  const responder = async () => {
    if (!texto.trim() || enviando) return;
    setEnviando(true);
    const r = await postJson(`/api/feedback/${detalle.id}/mensajes`, { cuerpo: texto });
    setEnviando(false);
    if (!r.ok) {
      toast.error(r.error ?? "No se pudo mandar.");
      return;
    }
    setTexto("");
    await onEnviado();
  };

  return (
    <div className="space-y-2.5" id="feedback-conversacion">
      <p className={ROTULO_DEL_SISTEMA}>Conversación</p>
      {detalle.mensajes.length === 0 ? (
        <p className="text-[13px] text-fg-muted">Todavía no le respondiste a {nombre}.</p>
      ) : (
        <div className="rounded-xl border border-line bg-surface p-4">
          <Hilo mensajes={detalle.mensajes} yoReporte={false} haceCuanto={(iso) => haceCuanto(iso)} />
        </div>
      )}
      <div className="space-y-2.5 rounded-xl border border-line bg-surface p-3">
        <textarea
          ref={campo}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          placeholder={`Responderle a ${nombre}… (por ejemplo, para pedirle más detalle)`}
          aria-label="Respuesta"
          className="w-full resize-y border-0 bg-transparent text-sm leading-[1.45] text-fg placeholder:text-fg-muted focus:outline-none"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-fg-muted">Le llega como aviso en «Para ti».</span>
          <span className="flex items-center gap-1">
            {abierto && detalle.estado === "sin_revisar" && (
              <button
                type="button"
                disabled={!texto.trim() || enviando}
                onClick={async () => {
                  setEnviando(true);
                  const ok = await onResponderYCerrar(texto);
                  setEnviando(false);
                  if (ok) setTexto("");
                }}
                className="rounded px-2 py-[7px] text-[13px] text-fg-secondary hover:text-fg disabled:opacity-50"
              >
                Responder y cerrar
              </button>
            )}
            <button
              type="button"
              disabled={!texto.trim() || enviando}
              onClick={() => void responder()}
              className="rounded-lg border border-line bg-surface px-3 py-[7px] text-[13px] font-semibold text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-50"
            >
              Responder
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

function Salidas({
  actual,
  detalle,
  onLlevar,
  decidir,
}: {
  actual: ReporteDeBandeja;
  detalle: ReporteDetalle | null;
  onLlevar: () => void;
  decidir: (body: unknown, exito: string) => Promise<boolean>;
}) {
  const [motivo, setMotivo] = useState<string | null>(null);
  const nombre = actual.autor.nombre.split(" ")[0];

  if (actual.estado === "sin_revisar") {
    return (
      <div className="space-y-3">
        <p className={ROTULO_DEL_SISTEMA}>Qué haces con este reporte</p>
        <div className="space-y-1">
          <button
            type="button"
            onClick={onLlevar}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3.5 py-[9px] text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
              <path d="M4 6h10M4 12h16M4 18h7" />
              <path d="M17 3l3 3-3 3" />
            </svg>
            Llevar a la hoja de ruta
          </button>
          <p className="text-xs text-fg-muted">Lo sumas a un tema que ya existe o creas uno nuevo. Es la única forma de que algo llegue a la hoja de ruta.</p>
        </div>
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => document.querySelector<HTMLTextAreaElement>("#feedback-conversacion textarea")?.focus()}
            className="w-full rounded-lg border border-line bg-surface px-3.5 py-2 text-[13px] font-semibold text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
          >
            Responder y cerrar
          </button>
          <p className="text-xs text-fg-muted">Para dudas, o cuando lo que pide ya existe. Se escribe en la conversación.</p>
        </div>
        {motivo === null ? (
          <div className="space-y-1">
            <button type="button" onClick={() => setMotivo("")} className="py-0.5 text-[13px] font-semibold text-fg-secondary hover:text-fg">
              No se hará
            </button>
            <p className="text-xs text-fg-muted">Con el motivo: {nombre} lo ve.</p>
          </div>
        ) : (
          <div className="space-y-2 rounded-xl border border-line bg-surface p-3">
            <p className="text-[13px] font-semibold text-fg">No se hará</p>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              placeholder={`El motivo, en una o dos frases. ${nombre} lo ve tal cual.`}
              aria-label="Motivo"
              className="w-full resize-y rounded-lg border border-line bg-surface px-2.5 py-2 text-[13px] text-fg placeholder:text-fg-muted focus:border-brand focus:outline-none"
            />
            <span className="flex items-center gap-2">
              <button
                type="button"
                disabled={motivo.trim().length < 3}
                onClick={async () => {
                  if (await decidir({ accion: "no_se_hara", motivo }, "Cerrado: no se hará.")) setMotivo(null);
                }}
                className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] font-semibold text-fg-secondary hover:bg-surface-hover hover:text-fg disabled:opacity-50"
              >
                Cerrar con este motivo
              </button>
              <button type="button" onClick={() => setMotivo(null)} className="text-xs text-fg-muted hover:text-fg">
                Cancelar
              </button>
            </span>
          </div>
        )}
      </div>
    );
  }

  const tema = detalle?.tema ?? null;
  return (
    <div className="space-y-2">
      <p className={ROTULO_DEL_SISTEMA}>Qué se decidió</p>
      {actual.estado === "en_hoja" && (
        <div className="space-y-1.5 rounded-xl border border-line bg-surface p-3">
          <p className={ROTULO_DEL_SISTEMA}>En la hoja de ruta</p>
          <p className="text-sm font-semibold text-fg">{tema?.titulo ?? "…"}</p>
          {tema && <ChipDeEstado estado={estadoParaElAutor({ estado: "en_hoja", tema })} />}
          {tema && <p className="text-xs text-fg-secondary">{nombre} lo ve así: su reporte sigue al tema.</p>}
          {detalle?.escala?.cambio && (
            <div className="space-y-0.5 border-t border-line pt-2 text-xs text-fg-secondary">
              <p className="font-semibold text-fg">La fila del manual</p>
              <p>
                <span className="text-fg-muted">Qué cambiaría · </span>
                {detalle.escala.cambio.que}
              </p>
              {detalle.escala.cambio.caso && (
                <p>
                  <span className="text-fg-muted">Caso · </span>
                  {detalle.escala.cambio.caso}
                </p>
              )}
              <p>
                <span className="text-fg-muted">Qué decisión cambiaría · </span>
                {detalle.escala.cambio.decision}
              </p>
            </div>
          )}
          <span className="flex flex-wrap gap-3 pt-0.5">
            <a href="/feedback?vista=hoja" className="text-xs font-semibold text-brand hover:text-brand-light">
              Abrir la hoja de ruta
            </a>
            <button type="button" onClick={onLlevar} className="text-xs font-semibold text-brand hover:text-brand-light">
              Cambiar de tema
            </button>
            <button type="button" onClick={() => void decidir({ accion: "deshacer" }, "Volvió a «Sin revisar».")} className="text-xs text-fg-muted hover:text-fg">
              Sacarlo
            </button>
          </span>
        </div>
      )}
      {actual.estado === "respondido" && (
        <div className="space-y-1.5 rounded-xl border border-success-line bg-success-surface p-3">
          <p className="text-[13px] font-semibold text-success-ink">✓ Respondido y cerrado</p>
          <button type="button" onClick={() => void decidir({ accion: "deshacer" }, "Volvió a «Sin revisar».")} className="text-xs font-semibold text-success-ink">
            Deshacer
          </button>
        </div>
      )}
      {actual.estado === "no_se_hara" && (
        <div className="space-y-1.5 rounded-xl border border-line bg-surface p-3">
          <p className="text-[13px] font-semibold text-fg">✕ No se hará</p>
          {detalle?.motivoCierre && <p className="text-xs text-fg-secondary">{detalle.motivoCierre}</p>}
          <button type="button" onClick={() => void decidir({ accion: "deshacer" }, "Volvió a «Sin revisar».")} className="text-xs text-fg-muted hover:text-fg">
            Deshacer
          </button>
        </div>
      )}
    </div>
  );
}
