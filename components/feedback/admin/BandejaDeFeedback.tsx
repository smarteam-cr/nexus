"use client";

/**
 * La Bandeja de /feedback: cada reporte con su captura, lo que se mandó con él y qué se hace con él.
 *
 * Diseño «Feedback · rediseño completo» (Claude Design, 2026-10-06), con el esqueleto de Clientes y Preventa
 * (Disposicion.tsx): en la fila de herramientas, qué mostrar (Sin revisar · Te respondieron · Cerrados), el
 * buscador y los filtros; debajo, la lista y el reporte en un solo marco, como un correo; a la derecha, a toda la
 * altura, «Qué sigue» y las TRES salidas de un reporte —«Llevar a la hoja de ruta» (el único botón azul),
 * «Responder y cerrar» y «No se hará»— con lo que ayuda a decidir. Un reporte llega a la hoja de ruta solo por acá.
 *
 * El tema al que se parece va en el panel. NO es una sugerencia de un agente (sale de contar palabras en común,
 * lib/feedback/parecidos.ts), así que va sin la chispa y dice qué comparten.
 *
 * Lo que se manda desde la escala (2026-10-05, lib/feedback/escala.ts) llega a la misma bandeja: arriba de la
 * captura muestra el criterio, lo que se leía y lo que dice hoy; al llevarlo a la hoja de ruta pide la fila de
 * «Cambios pendientes» del manual. «De dónde» filtra pantallas o escala.
 *
 * La Bandeja es para lo que espera una decisión tuya (2026-10-06, pedido de Elías): lo sin revisar y lo cerrado
 * en lo que la persona te volvió a escribir. Lo que llevas a la hoja de ruta SALE de acá y vive en su tema: el
 * panel del tema muestra el reporte entero y su conversación (las piezas son las de DetalleDelReporte.tsx). Lo
 * cerrado (respondido o «No se hará») queda en «Cerrados», para buscarlo o deshacerlo.
 *
 * Lo que queda por hacer (sin revisar o en la hoja de ruta) tiene «Generar prompt»: el prompt para arreglarlo
 * con Claude Code, armado con lo que ya cargó la bandeja (lib/feedback/prompt.ts).
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/ui/EmptyState";
import { Segmentado } from "@/components/ui/Segmentado";
import { QueSigue, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import type { DatosDeBandeja, ReporteDeBandeja, ReporteDetalle } from "@/lib/feedback/queries";
import { COLUMNA, enlaceAlTema, estadoParaElAutor, haceCuanto, numeroDeReporte, TIPO, TIPOS_DE_FEEDBACK, type TipoDeFeedback } from "@/lib/feedback/reglas";
import { ChipDeEstado, EnlaceDeRuta, IconoDeTipo, Iniciales } from "../piezas";
import { promptDeReporte, reporteParaPromptDesdeElDetalle } from "@/lib/feedback/prompt";
import { Captura, Conversacion, LoQueSeLeia, LoQueSeMando, postJson } from "./DetalleDelReporte";
import { Buscador, DisposicionDeFeedback, FiltroDeMenu } from "./Disposicion";
import DialogoLlevar from "./DialogoLlevar";
import DialogoPrompt from "./DialogoPrompt";

type Filtro = "sin" | "respondieron" | "cerrados";
export type Origen = "todos" | "pantallas" | "escala";

const cerrado = (r: ReporteDeBandeja) => r.estado === "respondido" || r.estado === "no_se_hara";

const NOMBRE_DEL_ESTADO: Record<string, string> = {
  sin_revisar: "Sin revisar",
  en_hoja: "En la hoja de ruta",
  respondido: "Respondido",
  no_se_hara: "No se hará",
};

const OPCIONES_DE_TIPO: { clave: TipoDeFeedback | "todos"; nombre: string }[] = [
  { clave: "todos", nombre: "Todos los tipos" },
  ...TIPOS_DE_FEEDBACK.map((t) => ({ clave: t, nombre: TIPO[t].nombre })),
];
const OPCIONES_DE_ORIGEN: { clave: Origen; nombre: string }[] = [
  { clave: "todos", nombre: "De todas partes" },
  { clave: "pantallas", nombre: "De las pantallas" },
  { clave: "escala", nombre: "De la escala" },
];

/** Botón blanco del sistema, en dos tamaños. */
const BOTON_BLANCO =
  "rounded-lg border border-line bg-surface px-3 py-[7px] text-[13px] font-semibold text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-50";
const BOTON_BLANCO_CHICO =
  "rounded-md border border-line bg-surface px-2.5 py-[5px] text-xs font-semibold text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg";

export default function BandejaDeFeedback({
  encabezado,
  datos,
  reporteInicial,
  origenInicial = "todos",
}: {
  /** El título y las pestañas (los arma la página). */
  encabezado: ReactNode;
  datos: DatosDeBandeja;
  reporteInicial: string | null;
  /** `/feedback?origen=escala`: desde el botón «Feedback» de la escala. */
  origenInicial?: Origen;
}) {
  const router = useRouter();
  const toast = useToast();
  const [filtro, setFiltro] = useState<Filtro>(() => {
    const inicial = reporteInicial ? datos.reportes.find((r) => r.id === reporteInicial) : null;
    return inicial && cerrado(inicial) ? "cerrados" : "sin";
  });
  const [tipo, setTipo] = useState<TipoDeFeedback | "todos">("todos");
  const [origen, setOrigen] = useState<Origen>(origenInicial);
  const [busqueda, setBusqueda] = useState("");
  const [sel, setSel] = useState<string | null>(
    reporteInicial ?? datos.reportes.find((r) => r.estado === "sin_revisar")?.id ?? datos.reportes.find((r) => r.estado !== "en_hoja")?.id ?? null,
  );
  const [detalle, setDetalle] = useState<ReporteDetalle | null>(null);
  const [dialogo, setDialogo] = useState(false);
  const [verPrompt, setVerPrompt] = useState(false);
  const [descartadas, setDescartadas] = useState<Set<string>>(new Set());

  const temasPorId = useMemo(() => new Map(datos.temas.map((t) => [t.id, t])), [datos.temas]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return datos.reportes.filter((r) => {
      // El elegido se queda a la vista aunque ya no sea de este filtro: así se ve lo que se decidió.
      const elegido = r.id === sel;
      // Lo que está en la hoja de ruta vive en su tema, no acá.
      if (r.estado === "en_hoja" && !elegido) return false;
      if (filtro === "sin" && r.estado !== "sin_revisar" && !elegido) return false;
      if (filtro === "respondieron" && !r.respondio && !elegido) return false;
      if (filtro === "cerrados" && !cerrado(r) && !elegido) return false;
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
    setVerPrompt(false);
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

  const cuentaRespondieron = datos.reportes.filter((r) => r.respondio && r.estado !== "en_hoja").length;
  const cuentaCerrados = datos.reportes.filter(cerrado).length;
  const conFiltros = tipo !== "todos" || origen !== "todos" || busqueda.trim() !== "";
  const quitarFiltros = () => {
    setTipo("todos");
    setOrigen("todos");
    setBusqueda("");
  };

  const sugerencia = actual?.sugerencia && !descartadas.has(actual.id) ? actual.sugerencia : null;
  const temaSugerido = sugerencia ? (temasPorId.get(sugerencia.temaId) ?? null) : null;
  const nombreDe = (r: ReporteDeBandeja) => r.autor.nombre.split(" ")[0];

  const herramientas = (
    <>
      <div data-recorrido="feedback.bandeja.filtros">
        <Segmentado<Filtro>
          etiqueta="Qué mostrar"
          valor={filtro}
          onCambio={setFiltro}
          opciones={[
            { clave: "sin", etiqueta: "Sin revisar", cuenta: datos.sinRevisar },
            { clave: "respondieron", etiqueta: "Te respondieron", cuenta: cuentaRespondieron },
            { clave: "cerrados", etiqueta: "Cerrados", cuenta: cuentaCerrados },
          ]}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Buscador valor={busqueda} onCambio={setBusqueda} placeholder="Buscar por texto, persona o criterio" etiqueta="Buscar reportes" />
        <FiltroDeMenu<TipoDeFeedback | "todos"> etiqueta="Tipo" valor={tipo} opciones={OPCIONES_DE_TIPO} onCambio={setTipo} />
        <FiltroDeMenu<Origen> etiqueta="De dónde" valor={origen} opciones={OPCIONES_DE_ORIGEN} onCambio={setOrigen} />
      </div>
    </>
  );

  // ── Lo que va en el marco ──
  let marco: ReactNode;
  if (datos.reportes.length === 0) {
    marco = (
      <MarcoVacio>
        <EmptyState
          icon={<Icono d="M4 13h4l2 3h4l2-3h4 M4 13V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />}
          title="Todavía nadie mandó feedback"
          description="Cada persona del equipo lo manda desde «Feedback», en el pie del menú. Para empezar, pídele su opinión a alguien."
          action={
            <Link href="/feedback?vista=encuestas" className={BOTON_BLANCO}>
              Pedir una opinión
            </Link>
          }
        />
      </MarcoVacio>
    );
  } else if (visibles.length === 0) {
    marco = (
      <MarcoVacio>
        {conFiltros ? (
          <EmptyState
            title="Nada con esos filtros"
            description="Prueba con otro tipo, otro origen u otra búsqueda."
            action={
              <button type="button" onClick={quitarFiltros} className={BOTON_BLANCO}>
                Quitar los filtros
              </button>
            }
          />
        ) : filtro === "sin" ? (
          <EmptyState
            icon={<Icono d="M5 13l4 4L19 7" className="h-6 w-6 text-success" />}
            title="Nada sin revisar"
            description="Revisaste todo lo que llegó. Lo que llevaste a la hoja de ruta sigue en su tema."
            action={
              <span className="flex items-center gap-3">
                {cuentaCerrados > 0 && (
                  <button type="button" onClick={() => setFiltro("cerrados")} className={BOTON_BLANCO}>
                    Ver {cuentaCerrados === 1 ? "el cerrado" : `los ${cuentaCerrados} cerrados`}
                  </button>
                )}
                <Link href="/feedback?vista=hoja" className="text-[13px] font-semibold text-brand hover:text-brand-light">
                  Ir a la hoja de ruta
                </Link>
              </span>
            }
          />
        ) : filtro === "respondieron" ? (
          <EmptyState title="Nadie te volvió a escribir" description="Cuando alguien conteste en un reporte que cerraste, aparece acá." />
        ) : (
          <EmptyState title="Todavía no cerraste ningún reporte" description="Lo que respondes o marcas como «No se hará» queda acá, para buscarlo o deshacerlo." />
        )}
      </MarcoVacio>
    );
  } else {
    marco = (
      <div className="overflow-hidden rounded-xl border border-line bg-surface lg:grid lg:h-[calc(100vh-15rem)] lg:min-h-[560px] lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* ── La lista ── */}
        <section aria-label="Reportes" data-recorrido="feedback.bandeja.lista" className="flex max-h-[420px] flex-col overflow-y-auto border-b border-line lg:max-h-none lg:border-b-0 lg:border-r">
          {visibles.map((r) => (
            <FilaDeReporte key={r.id} r={r} actual={r.id === sel} conSugerencia={!!r.sugerencia && !descartadas.has(r.id)} onElegir={() => elegir(r.id)} />
          ))}
          <p className="px-3.5 py-3 text-xs text-fg-muted">
            {filtro === "cerrados"
              ? "Lo cerrado queda acá para buscarlo o deshacerlo."
              : "Lo más nuevo arriba. Al decidir, el reporte sale de acá: lo que llevas a la hoja de ruta sigue en su tema."}
          </p>
        </section>

        {/* ── El reporte ── */}
        <section aria-label="El reporte" data-recorrido="feedback.bandeja.reporte" className="flex min-w-0 flex-col lg:overflow-hidden">
          {!actual ? (
            <div className="flex flex-1 items-center justify-center p-10">
              <p className="text-[13px] text-fg-muted">Elige un reporte de la lista.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-6 py-3.5">
                <span className="text-[13px] font-semibold tabular-nums text-fg-secondary">{numeroDeReporte(actual.numero)}</span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-px text-xs font-medium text-fg-secondary">
                  <IconoDeTipo tipo={actual.tipo} />
                  {TIPO[actual.tipo].nombre}
                </span>
                {actual.tipo === "falla" && actual.meFrena && (
                  <span className="rounded-full border border-warn-line bg-warn-surface px-2.5 py-px text-xs font-semibold text-warn-ink">Le frena el trabajo</span>
                )}
                {actual.estado !== "sin_revisar" && (
                  <span className="rounded-full border border-line bg-surface px-2.5 py-px text-xs font-semibold text-fg-secondary">{NOMBRE_DEL_ESTADO[actual.estado] ?? actual.estado}</span>
                )}
                <span className="flex-1" />
                {detalle?.id === actual.id && (
                  <EnlaceDeRuta ruta={detalle.ruta} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand hover:text-brand-light">
                    Abrir «{actual.pantalla}»
                    <Icono d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" className="h-[13px] w-[13px]" />
                  </EnlaceDeRuta>
                )}
              </div>

              <div className="flex-1 space-y-6 p-6 lg:overflow-y-auto">
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <Iniciales texto={actual.autor.iniciales} className="h-8 w-8 text-[11px]" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-fg">{actual.autor.nombre}</p>
                      <p className="text-xs text-fg-muted">
                        {actual.autor.rol} · {haceCuanto(actual.creado)} · desde «{actual.pantalla}»
                      </p>
                    </div>
                  </div>
                  <p className="max-w-[720px] whitespace-pre-wrap break-words text-[15px] leading-[1.55] text-fg">«{actual.cuerpo}»</p>
                </div>

                {actual.escala && <LoQueSeLeia detalle={detalle} />}
                <Captura detalle={detalle} />
                <LoQueSeMando detalle={detalle} />
                <Conversacion
                  detalle={detalle}
                  nombre={nombreDe(actual)}
                  onEnviado={refrescar}
                  onResponderYCerrar={(t) => decidir({ accion: "responder", respuesta: t }, "Respondido y cerrado.")}
                />
              </div>
            </>
          )}
        </section>
      </div>
    );
  }

  // ── El panel ──
  const panel = (
    <>
      <QueSigue
        accion={
          masViejo && masViejo.id !== sel ? (
            <button type="button" onClick={() => elegir(masViejo.id)} className="text-[13px] font-semibold text-brand hover:text-brand-light">
              Abrir el más viejo →
            </button>
          ) : datos.sinRevisar === 0 ? (
            <Link href="/feedback?vista=personas" className="text-[13px] font-semibold text-brand hover:text-brand-light">
              Ver quién no reporta →
            </Link>
          ) : undefined
        }
      >
        {datos.sinRevisar === 0
          ? "Nadie espera una respuesta tuya. Mira la hoja de ruta o pídele su opinión a alguien que hace rato no reporta."
          : `${datos.sinRevisar} sin revisar.${masViejo ? ` El más viejo es de ${nombreDe(masViejo)}, ${haceCuanto(masViejo.creado)}.` : ""}`}
      </QueSigue>

      {actual && visibles.length > 0 && (
        <>
          <div data-recorrido="feedback.bandeja.salidas">
            <Salidas actual={actual} detalle={detalle} onLlevar={() => setDialogo(true)} decidir={decidir} />
          </div>

          {sugerencia && temaSugerido && actual.estado === "sin_revisar" && (
            <div className="space-y-2 rounded-xl border border-line bg-surface p-3.5">
              <p className={ROTULO_DEL_SISTEMA}>Se parece a un tema · {COLUMNA[temaSugerido.columna].nombre}</p>
              <p className="text-sm font-semibold leading-[1.35] text-fg">{temaSugerido.titulo}</p>
              <p className="text-xs text-fg-muted">
                Comparten: {sugerencia.enComun.join(", ")} · {temaSugerido.personas} {temaSugerido.personas === 1 ? "persona lo pidió" : "personas lo pidieron"}
              </p>
              <span className="flex items-center gap-3 pt-0.5">
                <button
                  type="button"
                  // Lo de la escala lleva la fila del manual: pasa por el diálogo, con este tema ya elegido.
                  onClick={() =>
                    actual.escala ? setDialogo(true) : void decidir({ accion: "llevar", temaId: temaSugerido.id, avisar: true }, `Llevado a «${temaSugerido.titulo}».`)
                  }
                  className={BOTON_BLANCO_CHICO}
                >
                  Sumarlo a este tema
                </button>
                <button type="button" onClick={() => setDescartadas((s) => new Set(s).add(actual.id))} className="text-xs text-fg-muted hover:text-fg">
                  No es eso
                </button>
              </span>
            </div>
          )}

          {(actual.estado === "sin_revisar" || actual.estado === "en_hoja") && (
            <div data-recorrido="feedback.bandeja.prompt" className="space-y-1.5">
              <p className={ROTULO_DEL_SISTEMA}>Para Claude Code</p>
              <button
                type="button"
                disabled={detalle?.id !== actual.id}
                onClick={() => setVerPrompt(true)}
                className={cn(BOTON_BLANCO, "flex w-full items-center justify-center gap-2 disabled:cursor-wait")}
              >
                <Icono d="M8 9l-4 3 4 3M16 9l4 3-4 3M13.5 6l-3 12" className="h-[15px] w-[15px]" />
                Generar prompt
              </button>
              <p className="text-xs text-fg-muted">Lo que se pidió, dónde y lo que se habló, para aplicarlo en Claude Code.</p>
            </div>
          )}

          <DeLaMismaPersona actual={actual} datos={datos} onElegir={elegir} />

          <div className="space-y-1">
            <p className={ROTULO_DEL_SISTEMA}>Esta pantalla</p>
            <p className="text-[13px] text-fg-secondary">
              «{actual.pantalla}» recibió {datos.porPantalla[actual.pantalla] ?? 1} {(datos.porPantalla[actual.pantalla] ?? 1) === 1 ? "reporte" : "reportes"} en 30 días.
            </p>
          </div>
        </>
      )}
    </>
  );

  return (
    <>
      <DisposicionDeFeedback encabezado={encabezado} herramientas={herramientas} panel={panel} etiquetaPanel="Decidir">
        {marco}
      </DisposicionDeFeedback>

      {verPrompt && actual && detalle?.id === actual.id && (
        <DialogoPrompt
          sobre={numeroDeReporte(actual.numero)}
          prompt={promptDeReporte(reporteParaPromptDesdeElDetalle(detalle))}
          error={null}
          onCerrar={() => setVerPrompt(false)}
        />
      )}

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
    </>
  );
}

/** El marco cuando no hay lista que mostrar: la misma caja, con lo que pasa y qué se puede hacer. */
function MarcoVacio({ children }: { children: ReactNode }) {
  return <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-line bg-surface">{children}</div>;
}

function Icono({ d, className = "h-6 w-6" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** Una fila de la lista, como en un correo: tipo y pantalla, el texto y quién lo mandó. */
function FilaDeReporte({ r, actual, conSugerencia, onElegir }: { r: ReporteDeBandeja; actual: boolean; conSugerencia: boolean; onElegir: () => void }) {
  const decidido = r.estado !== "sin_revisar";
  const sinAbrir = r.sinAbrir && !actual && !decidido;
  return (
    <button
      type="button"
      onClick={onElegir}
      aria-current={actual ? "true" : undefined}
      className={cn(
        "flex w-full flex-none flex-col gap-1.5 border-b border-line px-3.5 py-3 text-left transition-colors",
        actual ? "bg-info-surface" : "bg-surface hover:bg-surface-hover",
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
      <span className={cn("line-clamp-2 text-[13px] leading-[1.4] text-fg", sinAbrir && "font-semibold")}>{r.cuerpo}</span>
      <span className="flex w-full flex-wrap items-center gap-1.5">
        <Iniciales texto={r.autor.iniciales} className="h-5 w-5 text-[9px]" />
        <span className="text-xs text-fg-secondary">{r.autor.nombre}</span>
        {r.tipo === "falla" && r.meFrena && (
          <span className="rounded-full border border-warn-line bg-warn-surface px-[7px] text-[11px] font-semibold text-warn-ink">Le frena</span>
        )}
        {decidido && <span className="rounded-full border border-line bg-surface px-[7px] text-[11px] font-semibold text-fg-secondary">{NOMBRE_DEL_ESTADO[r.estado] ?? r.estado}</span>}
        {/* En ámbar, como los mensajes sin leer de «Para ti»: alguien te escribió y espera de ti. */}
        {r.respondio && <span className="rounded-full border border-warn-line bg-warn-surface px-[7px] text-[11px] font-semibold text-warn-ink">Te respondió</span>}
        {conSugerencia && !decidido && <span className="text-[11px] text-fg-muted">· se parece a un tema</span>}
        {sinAbrir && <span aria-label="sin abrir" className="ml-auto h-[7px] w-[7px] rounded-full bg-brand" />}
      </span>
    </button>
  );
}

/** Lo demás que mandó la misma persona: lo que está en la hoja de ruta se abre en su tema. */
function DeLaMismaPersona({ actual, datos, onElegir }: { actual: ReporteDeBandeja; datos: DatosDeBandeja; onElegir: (id: string) => void }) {
  const otros = datos.reportes.filter((r) => r.autor.email === actual.autor.email && r.id !== actual.id).slice(0, 3);
  const total = datos.porPersona[actual.autor.email] ?? 1;
  return (
    <div className="space-y-2">
      <p className={ROTULO_DEL_SISTEMA}>
        De {actual.autor.nombre.split(" ")[0]} · {total} {total === 1 ? "reporte" : "reportes"}
      </p>
      {otros.length === 0 && <p className="text-xs text-fg-muted">Es lo único que mandó.</p>}
      {otros.map((r) => {
        const contenido = (
          <>
            <span className="line-clamp-2 text-xs leading-[1.4] text-fg-secondary">{r.cuerpo}</span>
            <span className="flex-none rounded-full border border-line bg-surface px-2 text-[11px] font-semibold text-fg-secondary">{NOMBRE_DEL_ESTADO[r.estado] ?? r.estado}</span>
          </>
        );
        const clase = "flex w-full items-start justify-between gap-2 rounded-lg border border-line bg-surface px-2.5 py-2 text-left transition-colors hover:bg-surface-hover";
        // Lo que está en la hoja de ruta se abre en su tema: la Bandeja no lo muestra.
        return r.estado === "en_hoja" ? (
          <Link key={r.id} href={enlaceAlTema(r)} className={clase}>
            {contenido}
          </Link>
        ) : (
          <button key={r.id} type="button" onClick={() => onElegir(r.id)} className={clase}>
            {contenido}
          </button>
        );
      })}
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
      <div className="space-y-2.5">
        <p className={ROTULO_DEL_SISTEMA}>Qué haces con {numeroDeReporte(actual.numero)}</p>
        <button
          type="button"
          onClick={onLlevar}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3.5 py-[9px] text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
        >
          <Icono d="M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v5h-4z" className="h-4 w-4" />
          Llevar a la hoja de ruta
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => document.querySelector<HTMLTextAreaElement>("#feedback-conversacion textarea")?.focus()}
            className={BOTON_BLANCO}
          >
            Responder y cerrar
          </button>
          <button type="button" onClick={() => setMotivo((m) => (m === null ? "" : null))} aria-expanded={motivo !== null} className={BOTON_BLANCO}>
            No se hará
          </button>
        </div>
        {motivo === null ? (
          <p className="text-xs leading-[1.45] text-fg-muted">
            A la hoja de ruta, lo sumas a un tema o creas uno. Al cerrar, {nombre} ve tu respuesta o el motivo en «Para ti».
          </p>
        ) : (
          <div className="space-y-2 rounded-xl border border-line bg-surface p-3">
            <p className="text-[13px] font-semibold text-fg">No se hará</p>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              autoFocus
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
                className={BOTON_BLANCO}
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
            {/* Link y no <a>: con <a> se recargaba la página entera (el menú, «Para ti», todo). */}
            <Link href={enlaceAlTema(actual)} className="text-xs font-semibold text-brand hover:text-brand-light">
              Abrirlo en su tema
            </Link>
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
