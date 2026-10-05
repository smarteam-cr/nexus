"use client";

/**
 * FichaDeAuditoria — la ficha de una auditoría como lienzo de trabajo (diseño del 2026-10-04,
 * claude.ai/artifact/XdbZne3ab1Q3qSLZ68s2tQ): a la izquierda las secciones con su estado, al centro
 * una sección por vez y a la derecha el panel con «Qué sigue», las lecturas, la conexión, el análisis
 * y las auditorías anteriores. Mismo molde y medidas que el lienzo de la exploración de venta.
 *
 * No decide nada: todo sale de `VistaDeAuditoria` (lib/auditoria-portal/vista.ts). Mientras la
 * auditoría se captura o se analiza, la página se refresca sola.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Skeleton, SkeletonPanel, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { BotonAzul, BotonBlanco, IconoDeSugerencia } from "@/components/exploraciones/FranjaDeSugerencias";
import { cifra } from "@/lib/auditoria-portal/cifras";
import {
  DE_CONFIGURACION,
  ETIQUETA_DE_LA_SECCION,
  SECCIONES_DE_LA_FICHA,
  type EstadoDeSeccion,
  type FilaDeLaBarra,
  type SeccionDeLaFicha,
  type VistaDeAuditoria,
} from "@/lib/auditoria-portal/vista";
import { SeccionCicloDeVida, SeccionPropietarios, SeccionResumen } from "./SeccionesDelPortal";
import { SeccionPipelines, SeccionPropiedades, SeccionUsuarios, SeccionWorkflows } from "./SeccionesDeConfiguracion";
import ComprobarAMano from "./ComprobarAMano";
import { useVolverACorrer } from "./AccionesDeLaAuditoria";

export interface AccionesDeLaFicha {
  ocupado: boolean;
  decidir: (ids: string[], estado: "confirmado" | "descartado" | "sugerido") => void;
  marcar: (clave: string, revisado: boolean) => void;
  regenerar: () => void;
  ir: (s: SeccionDeLaFicha) => void;
}

const PUNTO: Record<EstadoDeSeccion, string> = {
  completa: "bg-success",
  pendiente: "bg-warning",
  sin_leer: "bg-fg-muted/30",
};

const DE_QUE_VA: Record<SeccionDeLaFicha, string> = {
  resumen: "Lo que dice el portal hoy y lo que el análisis sugiere revisar.",
  ciclo: "Cuántos registros hay en cada etapa del portal y qué workflows las mueven.",
  propietarios: "Cómo se reparten los contactos y si la asignación acompaña a lo que se crea.",
  propiedades: "Las propiedades creadas en el portal y quién las creó.",
  pipelines: "Cómo están armados los pipelines de negocios y de tickets.",
  workflows: "Todos los workflows, con lo que los dispara y lo que hacen. Quién creó cada uno y cuántos registros inscribió no sale por API: está en «Comprobar a mano».",
  usuarios: "Quién tiene acceso al portal y quién ya no.",
  comprobar: "Lo que la auditoría no pudo leer y lo que la API de HubSpot no muestra. Márcalo a medida que lo revises.",
};

function FilaDelRiel({ fila, activa, sub, onClick }: { fila: FilaDeLaBarra; activa: boolean; sub?: boolean; onClick: () => void }) {
  const marca = fila.estado === "completa" ? "✓" : fila.estado === "pendiente" ? "●" : "○";
  return (
    <button
      type="button"
      aria-current={activa ? "page" : undefined}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 text-left transition-colors",
        sub ? "py-1.5 text-[13px]" : "py-2 text-sm",
        activa ? "bg-info-surface font-semibold text-brand" : "text-fg-secondary hover:bg-surface-hover hover:text-fg",
      )}
    >
      {sub ? (
        <span className={cn("w-3 flex-shrink-0 text-center", fila.estado === "completa" ? "text-success" : fila.estado === "pendiente" ? "text-warning" : "text-fg-muted")} aria-hidden="true">
          {marca}
        </span>
      ) : (
        <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", PUNTO[fila.estado])} aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1 truncate">{ETIQUETA_DE_LA_SECCION[fila.clave]}</span>
      {fila.sugeridas > 0 ? (
        <span className="inline-flex flex-shrink-0 items-center gap-1 text-xs text-brand" title={`${fila.sugeridas} hallazgos por confirmar`}>
          <IconoDeSugerencia className="h-[13px] w-[13px]" />
          {fila.sugeridas}
        </span>
      ) : (
        fila.aviso && <span className={cn("flex-shrink-0 text-xs", fila.estado === "pendiente" ? "text-warn-ink" : "text-fg-muted")}>{fila.aviso}</span>
      )}
    </button>
  );
}

function Riel({ vista, seccion, ir }: { vista: VistaDeAuditoria; seccion: SeccionDeLaFicha; ir: (s: SeccionDeLaFicha) => void }) {
  const fila = (clave: SeccionDeLaFicha) => vista.barra.find((f) => f.clave === clave)!;
  const config = DE_CONFIGURACION.map(fila);
  const estadoConfig: EstadoDeSeccion = config.some((f) => f.estado === "sin_leer") ? "sin_leer" : config.some((f) => f.estado === "pendiente") ? "pendiente" : "completa";
  return (
    <nav aria-label="Secciones de la auditoría" className="flex flex-wrap gap-0.5 lg:flex-col">
      {(["resumen", "ciclo", "propietarios"] as const).map((c) => (
        <div key={c} className="lg:w-full">
          <FilaDelRiel fila={fila(c)} activa={seccion === c} onClick={() => ir(c)} />
        </div>
      ))}
      <div className="lg:w-full">
        <div className="flex items-center gap-2.5 px-2.5 py-2 text-sm font-semibold text-fg">
          <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", PUNTO[estadoConfig])} aria-hidden="true" />
          Configuración
        </div>
        <div className="mb-1.5 ml-[18px] space-y-0.5 border-l border-line pl-2">
          {config.map((f) => (
            <FilaDelRiel key={f.clave} fila={f} sub activa={seccion === f.clave} onClick={() => ir(f.clave)} />
          ))}
        </div>
      </div>
      <div className="lg:w-full">
        <FilaDelRiel fila={fila("comprobar")} activa={seccion === "comprobar"} onClick={() => ir("comprobar")} />
      </div>
    </nav>
  );
}

function Bloque({ titulo, accion, children }: { titulo: string; accion?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{titulo}</h2>
        {accion}
      </div>
      {children}
    </section>
  );
}

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
const fechaYHora = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Panel({
  vista,
  seccion,
  acciones,
  volverACorrer,
  corriendo,
}: {
  vista: VistaDeAuditoria;
  seccion: SeccionDeLaFicha;
  acciones: AccionesDeLaFicha;
  volverACorrer: () => void;
  /** «Volver a correr» ya está creando la auditoría nueva: el botón no vuelve a apretarse. */
  corriendo: boolean;
}) {
  const sigue = vista.queSigue;
  // Si lo que sigue ya está en la pantalla abierta, el botón sobra (y sería el segundo azul).
  const mostrarAccion = sigue.accion && sigue.accion.a !== seccion;
  const correr = () => {
    if (!sigue.accion) return;
    const a = sigue.accion.a;
    if (a === "volver-a-correr") volverACorrer();
    else if (a === "volver-a-generar") acciones.regenerar();
    else acciones.ir(a);
  };
  const a = vista.analisis;
  const sugeridos = a?.hallazgos.filter((h) => h.estado === "sugerido").length ?? 0;
  const confirmados = a?.hallazgos.filter((h) => h.estado === "confirmado").length ?? 0;
  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-2 rounded-xl border border-info-line bg-info-surface p-3.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand">Qué sigue</h2>
        <p className="text-sm text-fg">{sigue.texto}</p>
        {mostrarAccion && sigue.accion && (
          <BotonAzul className="self-start" disabled={acciones.ocupado || corriendo} onClick={correr}>
            {sigue.accion.etiqueta}
          </BotonAzul>
        )}
      </section>

      <Bloque titulo="Lecturas">
        {vista.lecturas.intentos === 0 ? (
          <p className="text-[13px] text-fg-muted">Todavía no se leyó el portal.</p>
        ) : vista.lecturas.fallidas === 0 ? (
          <p className="text-[13px] font-medium text-success-ink">✓ Salieron las {cifra(vista.lecturas.intentos)}</p>
        ) : (
          <p className="text-[13px] font-medium text-warn-ink">
            ● {cifra(vista.lecturas.intentos - vista.lecturas.fallidas)} de {cifra(vista.lecturas.intentos)} salieron
          </p>
        )}
        {vista.capturadaEn && (
          <p className="text-xs text-fg-muted">
            {fechaYHora(vista.capturadaEn)}
            {vista.duracionMs ? ` · tardó ${Math.max(1, Math.round(vista.duracionMs / 1000))} s` : ""}
            {vista.creadaPor ? ` · la corrió ${vista.creadaPor}` : ""}
          </p>
        )}
      </Bloque>

      <Bloque titulo="Conexión">
        <p className="text-[13px] text-fg">{vista.conexion.tipo === "sistema" ? "Cuenta del sistema de Smarteam" : "Conexión del portal del cliente"}</p>
        <p className="text-xs text-fg-muted">
          {vista.conexion.permisos > 0 ? `${cifra(vista.conexion.permisos)} permisos concedidos. ` : ""}
          Solo lee: la auditoría no escribe en el portal.
        </p>
      </Bloque>

      <Bloque titulo="Análisis">
        {vista.estado === "analizando" ? (
          <p className="text-[13px] text-fg-muted">Se está generando…</p>
        ) : a ? (
          <>
            <p className="text-[13px] text-fg">Generado {fechaYHora(a.generadoEn)}</p>
            <p className="text-xs text-fg-muted">
              {cifra(a.hallazgos.length)} hallazgos · {cifra(confirmados)} confirmados · {cifra(sugeridos)} por revisar
              {a.descartadosPorCifras > 0 ? ` · ${cifra(a.descartadosPorCifras)} se cayeron por citar cifras que no están en los datos` : ""}
            </p>
          </>
        ) : (
          <p className="text-[13px] text-warn-ink">{vista.analisisError ?? "Sin análisis."}</p>
        )}
        {vista.estado === "lista" && (
          <>
            <BotonBlanco className="mt-1" disabled={acciones.ocupado} onClick={acciones.regenerar}>
              {a ? "Volver a generar" : "Generar el análisis"}
            </BotonBlanco>
            {confirmados > 0 && <p className="text-xs text-fg-muted">Al volver a generarlo, los confirmados se quedan.</p>}
          </>
        )}
      </Bloque>

      {vista.anteriores.length > 0 && (
        <Bloque titulo="Anteriores">
          <ul className="space-y-1">
            {vista.anteriores.map((x) => (
              <li key={x.id}>
                <Link href={`/audits/${x.id}`} className="text-[13px] text-fg hover:text-brand">
                  {fechaCorta(x.fecha)}
                  {x.contactos !== null ? ` · ${cifra(x.contactos)} contactos` : ""}
                </Link>
              </li>
            ))}
          </ul>
        </Bloque>
      )}
    </div>
  );
}

/** Mientras se lee el portal: la forma de la ficha, sin datos. */
function Capturando({ vista }: { vista: VistaDeAuditoria }) {
  return (
    <div className="space-y-5">
      <Alert variant="info" title={vista.estado === "capturando" ? "Leyendo el portal de HubSpot" : "Generando el análisis"}>
        {vista.estado === "capturando"
          ? "Se están leyendo el ciclo de vida, los propietarios, la actividad y la configuración. Suele tardar un par de minutos; la página se actualiza sola."
          : "El portal ya se leyó. El análisis con IA tarda un minuto más; la página se actualiza sola."}
      </Alert>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonPanel key={i} minH="min-h-[6.5rem]" bodyClassName="p-4">
            <Skeleton className="h-3 w-20" delay={i * 40} />
            <Skeleton className="mt-3 h-5 w-24" delay={i * 40 + 60} />
          </SkeletonPanel>
        ))}
      </div>
    </div>
  );
}

export default function FichaDeAuditoria({ vista, clientId }: { vista: VistaDeAuditoria; clientId: string | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const pedida = params.get("seccion");
  const inicial: SeccionDeLaFicha = (SECCIONES_DE_LA_FICHA as readonly string[]).includes(pedida ?? "") ? (pedida as SeccionDeLaFicha) : "resumen";
  const [seccion, setSeccion] = useState<SeccionDeLaFicha>(inicial);
  const [ocupado, setOcupado] = useState(false);
  const { correr: volverACorrer, corriendo } = useVolverACorrer(clientId);

  const enCurso = vista.estado === "capturando" || vista.estado === "analizando";
  useEffect(() => {
    if (!enCurso) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [enCurso, router]);

  const ir = useCallback(
    (s: SeccionDeLaFicha) => {
      setSeccion(s);
      const url = new URL(window.location.href);
      url.searchParams.set("seccion", s);
      window.history.replaceState(null, "", url.toString());
    },
    [],
  );

  const pedir = useCallback(
    async (ruta: string, init: RequestInit, exito?: string) => {
      setOcupado(true);
      try {
        const res = await fetch(ruta, { ...init, headers: { "Content-Type": "application/json" } });
        if (!res.ok) {
          const d = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(d.error ?? "No se pudo guardar");
        }
        if (exito) toast.success(exito);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo guardar");
      } finally {
        setOcupado(false);
      }
    },
    [router, toast],
  );

  const acciones: AccionesDeLaFicha = {
    ocupado,
    ir,
    // Con el análisis que se ve: si se generó otro mientras tanto, los ids (h1…) son de otros hallazgos.
    decidir: (ids, estado) =>
      void pedir(`/api/audits/${vista.id}/hallazgos`, { method: "PATCH", body: JSON.stringify({ ids, estado, generadoEn: vista.analisis?.generadoEn ?? "" }) }),
    marcar: (clave, revisado) => void pedir(`/api/audits/${vista.id}/comprobados`, { method: "PATCH", body: JSON.stringify({ clave, revisado }) }),
    regenerar: () => void pedir(`/api/audits/${vista.id}/insights`, { method: "POST" }, "El análisis se está generando de nuevo."),
  };

  const sinDatos = !vista.estadoDelPortal;

  return (
    <div className="flex-1 bg-surface-muted lg:grid lg:grid-cols-[14.5rem_minmax(0,1fr)] xl:grid-cols-[14.5rem_minmax(0,1fr)_18.75rem]">
      <aside className="border-b border-line bg-surface px-3 py-4 lg:sticky lg:top-0 lg:h-[calc(100vh-3.5rem)] lg:self-start lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <Riel vista={vista} seccion={seccion} ir={ir} />
      </aside>

      <main className="min-w-0 px-6 pb-10 pt-6 xl:px-8">
        <header className="mb-5">
          <h2 className="text-[22px] font-bold leading-7 text-fg">{ETIQUETA_DE_LA_SECCION[seccion]}</h2>
          <p className="mt-1 text-[13px] text-fg-muted">{DE_QUE_VA[seccion]}</p>
        </header>

        {(vista.estado === "fallo" || vista.estado === "perdida") && (
          <div className="mb-5">
            <Alert variant="danger" title="La auditoría no terminó">
              {vista.error ?? "Vuelve a correrla."}
            </Alert>
          </div>
        )}

        {sinDatos ? (
          enCurso ? <Capturando vista={vista} /> : null
        ) : (
          <>
            {seccion === "resumen" && <SeccionResumen vista={vista} acciones={acciones} />}
            {seccion === "ciclo" && <SeccionCicloDeVida vista={vista} acciones={acciones} />}
            {seccion === "propietarios" && <SeccionPropietarios vista={vista} acciones={acciones} />}
            {seccion === "propiedades" && <SeccionPropiedades vista={vista} acciones={acciones} />}
            {seccion === "pipelines" && <SeccionPipelines vista={vista} acciones={acciones} />}
            {seccion === "workflows" && <SeccionWorkflows vista={vista} acciones={acciones} />}
            {seccion === "usuarios" && <SeccionUsuarios vista={vista} acciones={acciones} />}
            {seccion === "comprobar" && <ComprobarAMano vista={vista} acciones={acciones} />}
          </>
        )}
      </main>

      <aside className="border-t border-line bg-surface-muted p-5 lg:col-span-2 xl:sticky xl:top-0 xl:col-span-1 xl:h-[calc(100vh-3.5rem)] xl:self-start xl:overflow-y-auto xl:border-l xl:border-t-0">
        <Panel vista={vista} seccion={seccion} acciones={acciones} volverACorrer={() => void volverACorrer()} corriendo={corriendo} />
      </aside>
    </div>
  );
}
