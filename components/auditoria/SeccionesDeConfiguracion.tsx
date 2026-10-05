"use client";

/**
 * Las secciones de CONFIGURACIÓN de la ficha de una auditoría: Propiedades, Pipelines, Workflows y
 * Usuarios. Es el inventario de lo que dejó armado el partner anterior, leído por API, presentado
 * como informe: arriba lo que dice el análisis y sus hallazgos; después cada reporte con su lectura;
 * al final el inventario completo. Lo que la API no muestra (quién creó un workflow, cuántos
 * registros inscribió, apps conectadas) no se inventa: va a «Comprobar a mano».
 */
import { useMemo, useState } from "react";
import { Segmentado } from "@/components/ui";
import { BotonTexto } from "@/components/exploraciones/FranjaDeSugerencias";
import { cn } from "@/lib/cn";
import { cifra, porcentaje } from "@/lib/auditoria-portal/cifras";
import { etapaQueAcumula, mapaDeEtapas, type EtapaUbicada } from "@/lib/auditoria-portal/cruces";
import {
  dominiosConAcceso,
  ETIQUETA_DEL_OBJETO,
  propiedadesEnChoque,
  type PersonaDelPortal,
  type PipelineLeido,
  type WorkflowLeido,
} from "@/lib/auditoria-portal/inventario";
import { idDeReporteDePipeline } from "@/lib/auditoria-portal/reportes";
import type { VistaDeAuditoria } from "@/lib/auditoria-portal/vista";
import type { AccionesDeLaFicha } from "./FichaDeAuditoria";
import { Barras, Chip, ChipDeEstado, Cifra, Reporte, Rotulo, SinLeer } from "./piezas";
import { AnalisisDeLaSeccion, lecturaDe } from "./SeccionesDelPortal";

type Props = { vista: VistaDeAuditoria; acciones: AccionesDeLaFicha };

const fecha = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "—";

/** Tabla simple con la cabecera del sistema (11 px, 0,08em). */
function TablaSimple({ cabecera, children, ancho = "min-w-[36rem]", plana }: { cabecera: { texto: string; derecha?: boolean }[]; children: React.ReactNode; ancho?: string; plana?: boolean }) {
  return (
    <div className={cn("overflow-x-auto", plana ? "-mx-1" : "rounded-xl border border-line bg-surface")}>
      <table className={`w-full text-[13px] ${ancho}`}>
        <thead>
          <tr className={cn("border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted", !plana && "bg-surface-muted")}>
            {cabecera.map((c) => (
              <th key={c.texto} className={c.derecha ? "px-3 py-2 text-right font-semibold" : "px-3 py-2 font-semibold"}>
                {c.texto}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** Cuántas filas mostrar de una lista larga, con «Ver todas». */
function useRecorte<T>(lista: T[], primeras = 25) {
  const [todas, setTodas] = useState(false);
  const visibles = todas ? lista : lista.slice(0, primeras);
  const pie =
    lista.length > primeras ? (
      <div className="flex items-center justify-between gap-2 px-1 pt-2 text-xs text-fg-muted">
        <span>{todas ? `${cifra(lista.length)} en total` : `${cifra(visibles.length)} de ${cifra(lista.length)}`}</span>
        <BotonTexto onClick={() => setTodas((v) => !v)}>{todas ? "Ver menos" : "Ver todas"}</BotonTexto>
      </div>
    ) : null;
  return { visibles, pie };
}

/** Encendido / apagado, como texto con su punto (no es un estado de tarea). */
function Encendido({ si }: { si: boolean }) {
  return <span className={si ? "text-xs text-success-ink" : "text-xs text-fg-muted"}>{si ? "● Encendido" : "○ Apagado"}</span>;
}

// ── Propiedades ──────────────────────────────────────────────────────────────

export function SeccionPropiedades({ vista, acciones }: Props) {
  const inv = vista.inventario;
  const [objeto, setObjeto] = useState<"todas" | "contactos" | "empresas" | "negocios" | "tickets">("todas");
  const personas = useMemo(() => new Map((inv?.personas ?? []).map((p) => [p.usuarioId, p])), [inv?.personas]);
  const propias = useMemo(
    () =>
      [...(inv?.propiedades?.propias ?? [])]
        .filter((p) => objeto === "todas" || p.objeto === objeto)
        .sort((a, b) => (b.creadaEn ?? "").localeCompare(a.creadaEn ?? "")),
    [inv?.propiedades, objeto],
  );
  const { visibles, pie } = useRecorte(propias);
  if (!inv?.propiedades) {
    return (
      <div className="space-y-6">
        <AnalisisDeLaSeccion vista={vista} acciones={acciones} seccion="propiedades" />
        <SinLeer titulo="Propiedades del portal" />
      </div>
    );
  }
  const c = vista.derivados.creadores;
  const cuenta = (o: string) => inv.propiedades!.propias.filter((p) => o === "todas" || p.objeto === o).length;
  return (
    <div className="space-y-6">
      <AnalisisDeLaSeccion vista={vista} acciones={acciones} seccion="propiedades" />

      <Reporte titulo="Propiedades propias por objeto" subtitulo="Las que creó el portal, sobre el total de cada objeto (incluidas las de HubSpot)." lectura={lecturaDe(vista, "propiedades.por_objeto")} plano>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {inv.propiedades.porObjeto.map((o) => (
            <Cifra key={o.objeto} rotulo={`De ${ETIQUETA_DEL_OBJETO[o.objeto].toLowerCase()}`} valor={o.propias} nota={`de ${cifra(o.total)} propiedades en total`} />
          ))}
        </div>
      </Reporte>

      {c && c.conCreador > 0 && (
        <Reporte
          titulo="Quién las creó"
          subtitulo={`${cifra(c.conCreador)} con creador registrado · ${cifra(c.sinCreador)} sin creador (una integración, una importación o HubSpot no lo guarda) · ${cifra(c.deQuienesYaNoEstan)} de gente que ya no tiene usuario`}
          lectura={lecturaDe(vista, "propiedades.creadores")}
        >
          {c.porPersona.length > 0 && (
            <TablaSimple cabecera={[{ texto: "Persona" }, { texto: "Dominio" }, { texto: "Sigue en el portal" }, { texto: "Propiedades", derecha: true }]} ancho="min-w-[30rem]" plana>
              {c.porPersona.slice(0, 15).map((p) => (
                <tr key={`${p.nombre}-${p.dominio}`} className="border-t border-line first:border-t-0">
                  <td className="px-3 py-2 text-fg">{p.nombre}</td>
                  <td className="px-3 py-2 text-fg-secondary">{p.dominio ?? "—"}</td>
                  <td className="px-3 py-2">{p.activo ? <span className="text-fg-secondary">Sí</span> : <ChipDeEstado tono="atencion">Ya no está</ChipDeEstado>}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-fg">{cifra(p.propiedades)}</td>
                </tr>
              ))}
            </TablaSimple>
          )}
        </Reporte>
      )}

      <section className="space-y-2">
        <Rotulo>Inventario de propiedades propias</Rotulo>
        <Segmentado
          etiqueta="Objeto"
          opciones={(["todas", "contactos", "empresas", "negocios", "tickets"] as const).map((o) => ({
            clave: o,
            etiqueta: `${o === "todas" ? "Todas" : ETIQUETA_DEL_OBJETO[o]} · ${cifra(cuenta(o))}`,
          }))}
          valor={objeto}
          onCambio={setObjeto}
        />
        {propias.length === 0 ? (
          <p className="text-[13px] text-fg-muted">Ninguna propiedad propia en este objeto.</p>
        ) : (
          <>
            <TablaSimple cabecera={[{ texto: "Propiedad" }, { texto: "Objeto" }, { texto: "Tipo" }, { texto: "Creada" }, { texto: "Por" }]}>
              {visibles.map((p) => {
                const quien: PersonaDelPortal | undefined = p.creadorId ? personas.get(p.creadorId) : undefined;
                return (
                  <tr key={`${p.objeto}:${p.nombre}`} className="border-t border-line first:border-t-0">
                    <td className="px-3 py-2">
                      <p className="text-fg">{p.etiqueta}</p>
                      <p className="font-mono text-[11px] text-fg-muted">{p.nombre}</p>
                    </td>
                    <td className="px-3 py-2 text-fg-secondary">{ETIQUETA_DEL_OBJETO[p.objeto]}</td>
                    <td className="px-3 py-2 text-fg-secondary">
                      {p.tipo}
                      {p.calculada && (
                        <span className="ml-1.5">
                          <ChipDeEstado tono="neutro">Calculada</ChipDeEstado>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-fg-secondary">{fecha(p.creadaEn)}</td>
                    <td className="px-3 py-2 text-fg-secondary">
                      {quien ? (
                        <span className={quien.activo ? undefined : "text-warn-ink"}>
                          {quien.nombre}
                          {quien.activo ? "" : " (ya no está)"}
                        </span>
                      ) : p.creadorId ? (
                        <span className="text-warn-ink">Usuario {p.creadorId} (ya no está)</span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </TablaSimple>
            {pie}
          </>
        )}
      </section>
    </div>
  );
}

// ── Pipelines ────────────────────────────────────────────────────────────────

/** La tira de etapas en orden: registros, probabilidad, si cierra; la vacía punteada, la que acumula marcada. */
function TiraDeEtapas({ p }: { p: PipelineLeido }) {
  const acumula = etapaQueAcumula(p);
  const total = p.etapas.reduce((s, e) => s + (e.registros ?? 0), 0);
  return (
    <ol className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(8.75rem,1fr))]">
      {p.etapas.map((e, i) => {
        const vacia = e.registros === 0;
        const marcada = !!acumula && !e.cerrada && e.nombre === acumula.nombre && acumula.registros / acumula.deAbiertos >= 0.4;
        return (
          <li
            key={e.id || `${p.id}-${i}`}
            className={cn(
              "flex flex-col gap-1 rounded-lg border px-3 py-2.5",
              marcada ? "border-warn-line bg-warn-surface" : vacia ? "border-dashed border-line" : "border-line bg-surface",
            )}
          >
            <span className="flex items-center justify-between gap-1.5 text-[11px] text-fg-muted">
              <span className="tabular-nums">{i + 1}</span>
              {e.cerrada && <span className="font-semibold uppercase tracking-[0.06em]">Cierra</span>}
            </span>
            <span className="text-[13px] font-medium leading-snug text-fg" title={e.nombre}>
              {e.nombre}
            </span>
            <span className={cn("text-lg font-semibold tabular-nums", vacia ? "text-fg-muted" : marcada ? "text-warn-ink" : "text-fg")}>
              {e.registros === null ? "—" : cifra(e.registros)}
            </span>
            <span className="text-[11px] text-fg-muted">
              {[total && e.registros !== null ? porcentaje(e.registros, total) : null, e.probabilidad !== null ? `prob. ${e.probabilidad} %` : null].filter(Boolean).join(" · ") || " "}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function AutomatizacionDeEtapas({ p, vista, porId }: { p: PipelineLeido; vista: VistaDeAuditoria; porId: Map<string, WorkflowLeido> }) {
  const filas = (vista.cruces.automatizacion[p.id] ?? []).filter((a) => a.alEntrar.length || a.laPonen.length);
  const nombreDeEtapa = new Map(p.etapas.map((e) => [e.id, e.nombre]));
  const nombre = (id: string) => porId.get(id)?.nombre ?? "Un workflow que no se pudo leer";
  if (filas.length === 0) {
    return <p className="text-xs text-fg-muted">Ningún workflow encendido corre al entrar a sus etapas ni las pone: este pipeline se mueve a mano.</p>;
  }
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Automatización por etapa</p>
      <div className="divide-y divide-line rounded-lg border border-line">
        {filas.map((a) => (
          <div key={a.etapaId} className="grid gap-x-4 gap-y-1 px-3 py-2 text-[13px] sm:grid-cols-[10rem_minmax(0,1fr)]">
            <span className="font-medium text-fg">{nombreDeEtapa.get(a.etapaId) ?? "Otra etapa"}</span>
            <span className="space-y-0.5 text-fg-secondary">
              {a.laPonen.length > 0 && <span className="block">La ponen: {a.laPonen.map(nombre).join(" · ")}</span>}
              {a.alEntrar.length > 0 && <span className="block">Al entrar corren: {a.alEntrar.map(nombre).join(" · ")}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function subtituloDelPipeline(p: PipelineLeido): string {
  const de = p.objeto;
  const partes: string[] = [];
  if (p.registros === null) partes.push("No se pudieron contar los registros");
  else partes.push(`${cifra(p.registros)} ${de}`);
  if (p.abiertos != null) partes.push(`${cifra(p.abiertos)} abiertos`);
  if (p.abiertos && p.sinActividad != null) partes.push(`${cifra(p.sinActividad)} abiertos sin actividad en 90 días (${porcentaje(p.sinActividad, p.abiertos)})`);
  if (p.abiertos && p.sinCambios != null) partes.push(`${cifra(p.sinCambios)} sin ningún cambio`);
  if (p.creadoEn) partes.push(`creado ${fecha(p.creadoEn)}`);
  if (p.cambiadoEn) partes.push(`último cambio ${fecha(p.cambiadoEn)}`);
  return partes.join(" · ");
}

export function SeccionPipelines({ vista, acciones }: Props) {
  const inv = vista.inventario;
  const porId = useMemo(() => new Map((inv?.workflows ?? []).map((w) => [w.id, w])), [inv?.workflows]);
  if (!inv?.pipelines) {
    return (
      <div className="space-y-6">
        <AnalisisDeLaSeccion vista={vista} acciones={acciones} seccion="pipelines" />
        <SinLeer titulo="Pipelines de negocios y de tickets" />
      </div>
    );
  }
  const conDisparo = (inv.workflows ?? []).some((w) => w.detalle?.disparadoPor);
  const grupos = (["negocios", "tickets"] as const).map((o) => ({ objeto: o, pipelines: inv.pipelines!.filter((p) => p.objeto === o) }));
  const comparacion = vista.cruces.comparacion;
  return (
    <div className="space-y-6">
      <AnalisisDeLaSeccion vista={vista} acciones={acciones} seccion="pipelines" />

      {comparacion.length > 0 && (
        <Reporte
          titulo="La Planificación contra el portal"
          subtitulo="Las etapas que se acordaron con el cliente en la Planificación, frente a las del pipeline del portal que más se le parece."
          lectura={lecturaDe(vista, "pipelines.planificacion")}
        >
          <div className="space-y-3">
            {comparacion.map((c) => (
              <div key={c.planeado} className="space-y-1.5 rounded-lg border border-line px-3 py-2.5">
                <p className="text-[13px] text-fg">
                  <span className="font-semibold">{c.planeado}</span>
                  <span className="text-fg-muted"> → </span>
                  {c.enPortal ? `«${c.enPortal.nombre}» en el portal` : <span className="text-warn-ink">no hay un pipeline de ese tipo en el portal</span>}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {c.coinciden.map((e) => (
                    <ChipDeEstado key={`c-${e}`} tono="neutro">
                      {e}
                    </ChipDeEstado>
                  ))}
                  {c.faltanEnElPortal.map((e) => (
                    <ChipDeEstado key={`f-${e}`} tono="atencion" title="Está en la Planificación y no en el portal">
                      Falta: {e}
                    </ChipDeEstado>
                  ))}
                  {c.soloEnElPortal.map((e) => (
                    <ChipDeEstado key={`s-${e}`} tono="punteado" title="Está en el portal y no en la Planificación">
                      Solo en el portal: {e}
                    </ChipDeEstado>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Reporte>
      )}

      {grupos.map((g) => (
        <section key={g.objeto} className="space-y-3">
          <Rotulo>{`Pipelines de ${g.objeto} · ${cifra(g.pipelines.length)}`}</Rotulo>
          {g.pipelines.length === 0 ? (
            <p className="text-[13px] text-fg-muted">Sin pipelines de {g.objeto}.</p>
          ) : (
            g.pipelines.map((p) => (
              <Reporte key={p.id} titulo={p.nombre} subtitulo={subtituloDelPipeline(p)} lectura={lecturaDe(vista, idDeReporteDePipeline(p.id))}>
                <TiraDeEtapas p={p} />
                {p.registros === 0 && <p className="text-xs text-warn-ink">Sin ningún registro: puede ser un pipeline de prueba o uno que se dejó de usar.</p>}
                {conDisparo && <AutomatizacionDeEtapas p={p} vista={vista} porId={porId} />}
              </Reporte>
            ))
          )}
        </section>
      ))}

      {inv.objetosPersonalizados && inv.objetosPersonalizados.length > 0 && (
        <section className="space-y-2">
          <Rotulo>{`Objetos personalizados · ${cifra(inv.objetosPersonalizados.length)}`}</Rotulo>
          <div className="flex flex-wrap gap-1.5">
            {inv.objetosPersonalizados.map((o) => (
              <Chip key={o}>{o}</Chip>
            ))}
          </div>
          <p className="text-xs text-fg-muted">Objetos que el portal agregó al CRM. Cada uno arrastra propiedades, asociaciones y a veces integraciones propias.</p>
        </section>
      )}
    </div>
  );
}

// ── Workflows ────────────────────────────────────────────────────────────────

type FiltroDeWorkflows = "todos" | "encendidos" | "etapa" | "viejos" | "chocan" | "reinscriben";

const DISPARADOR: Record<NonNullable<WorkflowLeido["detalle"]>["disparador"], string> = {
  evento: "Por evento",
  criterios: "Por criterios",
  manual: "A mano",
  otro: "Otro",
};

/** Con qué se dispara, en palabras. Sin `disparadoPor` (foto anterior), el tipo de disparador. */
function seDisparaCon(w: WorkflowLeido, etapas: Map<string, EtapaUbicada>): string {
  const d = w.detalle;
  if (!d) return "—";
  if (d.disparador === "manual") return "A mano";
  const p = d.disparadoPor;
  if (!p) return DISPARADOR[d.disparador];
  const partes = [
    p.formularios ? (p.formularios > 1 ? `${cifra(p.formularios)} formularios` : "Un formulario") : "",
    p.eventos > p.formularios ? "Un evento" : "",
    p.listas ? "Estar en una lista" : "",
    p.etapas.length ? `La etapa ${p.etapas.slice(0, 2).map((id) => `«${etapas.get(id)?.etapa ?? "otra"}»`).join(", ")}${p.etapas.length > 2 ? "…" : ""}` : "",
    p.propiedades.length ? `${p.propiedades.slice(0, 3).join(", ")}${p.propiedades.length > 3 ? "…" : ""}` : "",
  ].filter(Boolean);
  return partes.join(" · ") || DISPARADOR[d.disparador];
}

export function SeccionWorkflows({ vista, acciones }: Props) {
  const wfs = vista.inventario?.workflows ?? null;
  const pipelines = vista.inventario?.pipelines ?? null;
  const [filtro, setFiltro] = useState<FiltroDeWorkflows>("todos");
  const viejos = useMemo(() => new Set(vista.derivados.workflowsSinCambiosHaceUnAnio), [vista.derivados.workflowsSinCambiosHaceUnAnio]);
  const choques = useMemo(() => (wfs ? propiedadesEnChoque(wfs) : []), [wfs]);
  const enChoque = useMemo(() => new Set(choques.flatMap((c) => c.workflows)), [choques]);
  const etapas = useMemo(() => mapaDeEtapas(pipelines ?? []), [pipelines]);
  const filtrados = useMemo(() => {
    if (!wfs) return [];
    const pasa = (w: WorkflowLeido) =>
      filtro === "todos" ||
      (filtro === "encendidos" && w.encendido) ||
      (filtro === "etapa" && !!(w.detalle?.cambiaEtapa || w.detalle?.poneEtapas?.length)) ||
      (filtro === "viejos" && viejos.has(w.id)) ||
      (filtro === "chocan" && enChoque.has(w.id)) ||
      (filtro === "reinscriben" && w.encendido && !!w.detalle?.reinscribe);
    return wfs.filter(pasa).sort((a, b) => Number(b.encendido) - Number(a.encendido) || a.nombre.localeCompare(b.nombre, "es"));
  }, [wfs, filtro, viejos, enChoque]);
  const { visibles, pie } = useRecorte(filtrados, 30);
  const porId = useMemo(() => new Map((wfs ?? []).map((w) => [w.id, w])), [wfs]);

  if (!wfs) {
    return (
      <div className="space-y-6">
        <AnalisisDeLaSeccion vista={vista} acciones={acciones} seccion="workflows" />
        <SinLeer titulo="Workflows del portal" />
      </div>
    );
  }
  const nombre = (id: string) => porId.get(id)?.nombre ?? "Un workflow que no se pudo leer";
  const encendidos = wfs.filter((w) => w.encendido);
  const sinDetalle = wfs.filter((w) => w.detalle === null).length;
  const conCodigo = wfs.filter((w) => w.detalle?.conCodigo || w.detalle?.conWebhook).length;
  const conDisparo = encendidos.filter((w) => w.detalle?.disparadoPor);
  const cuentaDisparo = (f: (d: NonNullable<WorkflowLeido["detalle"]>) => boolean) => conDisparo.filter((w) => f(w.detalle!)).length;
  const { cadenas, bucles, avisos, masEditados } = vista.cruces;
  const porQue = (c: (typeof cadenas)[number]) => {
    if (c.tipo === "pasa") return "lo llama";
    if (c.tipo === "etapa") {
      const e = etapas.get(c.por);
      return e ? `al poner «${e.etapa}» de «${e.pipeline}»` : "al poner una etapa";
    }
    return `al escribir ${c.por}`;
  };
  const cuenta: Record<FiltroDeWorkflows, number> = {
    todos: wfs.length,
    encendidos: encendidos.length,
    etapa: wfs.filter((w) => w.detalle?.cambiaEtapa || w.detalle?.poneEtapas?.length).length,
    viejos: viejos.size,
    chocan: enChoque.size,
    reinscriben: encendidos.filter((w) => w.detalle?.reinscribe).length,
  };
  const ETIQUETA: Record<FiltroDeWorkflows, string> = {
    todos: "Todos",
    encendidos: "Encendidos",
    etapa: "Cambian una etapa",
    viejos: "Sin cambios hace un año",
    chocan: "Escriben lo mismo",
    reinscriben: "Se reinscriben",
  };

  return (
    <div className="space-y-6">
      <AnalisisDeLaSeccion vista={vista} acciones={acciones} seccion="workflows" />

      <Reporte titulo="Los workflows en números" lectura={lecturaDe(vista, "workflows.panorama")} plano>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Cifra rotulo="Workflows" valor={wfs.length} nota={`${cifra(encendidos.length)} encendidos · ${cifra(wfs.length - encendidos.length)} apagados`} />
          <Cifra rotulo="Sin cambios hace un año" valor={viejos.size} nota="Encendidos o apagados" />
          <Cifra rotulo="Con código o webhook" valor={conCodigo} nota="Dependen de algo fuera de HubSpot" />
          <Cifra rotulo="Cadenas entre ellos" valor={cadenas.length} nota="Uno dispara o llama a otro" />
        </div>
        {sinDetalle > 0 && (
          <p className="text-xs text-warn-ink">
            De {cifra(sinDetalle)} {sinDetalle === 1 ? "workflow" : "workflows"} no se pudo leer el detalle: se sabe que existen, no qué hacen.
          </p>
        )}
      </Reporte>

      {conDisparo.length > 0 && (
        <Reporte
          titulo="Qué los dispara"
          subtitulo={`De los ${cifra(conDisparo.length)} encendidos. Un workflow puede dispararse por más de una cosa. Se reinscriben (un registro puede pasar varias veces): ${cifra(cuenta.reinscriben)}.`}
          lectura={lecturaDe(vista, "workflows.disparadores")}
        >
          <Barras
            filas={[
              { etiqueta: "Un formulario", valor: cuentaDisparo((d) => (d.disparadoPor?.formularios ?? 0) > 0) },
              { etiqueta: "Otros eventos", valor: cuentaDisparo((d) => (d.disparadoPor?.eventos ?? 0) > (d.disparadoPor?.formularios ?? 0)) },
              { etiqueta: "Una propiedad", valor: cuentaDisparo((d) => (d.disparadoPor?.propiedades.length ?? 0) > 0) },
              { etiqueta: "Una etapa de pipeline", valor: cuentaDisparo((d) => (d.disparadoPor?.etapas.length ?? 0) > 0) },
              { etiqueta: "Estar en una lista", valor: cuentaDisparo((d) => (d.disparadoPor?.listas ?? 0) > 0) },
              { etiqueta: "A mano", valor: cuentaDisparo((d) => d.disparador === "manual") },
            ]}
            total={conDisparo.length}
          />
        </Reporte>
      )}

      {(cadenas.length > 0 || bucles.length > 0) && (
        <Reporte
          titulo={`Cadenas entre workflows · ${cifra(cadenas.length)}`}
          subtitulo="Un workflow escribe la propiedad o pone la etapa que dispara a otro, o lo llama. Cambiar el primero cambia lo que hace el segundo."
          lectura={lecturaDe(vista, "workflows.cadenas")}
        >
          {bucles.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-warn-ink">Posibles bucles · {cifra(bucles.length)}</p>
              {bucles.map((b) => (
                <div key={`${b.workflows.join("|")}:${b.por}`} className="rounded-lg border border-warn-line bg-warn-surface px-3 py-2 text-[13px] text-fg">
                  {b.workflows.map(nombre).join(" ↔ ")}
                  <span className="text-fg-muted"> · por {etapas.get(b.por) ? `la etapa «${etapas.get(b.por)!.etapa}»` : b.por}</span>
                </div>
              ))}
              <p className="text-xs text-fg-muted">Se reinscriben y escriben lo que los dispara, o se disparan entre sí. HubSpot frena algunos casos solo: se revisa en el portal.</p>
            </div>
          )}
          {cadenas.length > 0 && (
            <div className="divide-y divide-line rounded-lg border border-line">
              {cadenas.slice(0, 20).map((c) => (
                <div key={`${c.desde}>${c.hacia}>${c.tipo}>${c.por}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-2 text-[13px]">
                  <span className="text-fg">{nombre(c.desde)}</span>
                  <span className="text-fg-muted" aria-hidden="true">
                    →
                  </span>
                  <span className="text-fg">{nombre(c.hacia)}</span>
                  <span className="text-xs text-fg-muted">{porQue(c)}</span>
                </div>
              ))}
            </div>
          )}
          {cadenas.length > 20 && <p className="text-xs text-fg-muted">Y {cifra(cadenas.length - 20)} más.</p>}
        </Reporte>
      )}

      {avisos && avisos.length > 0 && (
        <Reporte
          titulo="Avisos a personas que ya no están"
          subtitulo="Workflows encendidos que avisan o reparten registros entre personas sin usuario en el portal: esos avisos no le llegan a nadie."
          lectura={lecturaDe(vista, "workflows.avisos")}
        >
          <div className="divide-y divide-line rounded-lg border border-line">
            {avisos.map((a) => (
              <div key={`${a.workflowId}:${a.tipo}`} className="grid gap-x-4 gap-y-0.5 px-3 py-2 text-[13px] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <span className="text-fg">{nombre(a.workflowId)}</span>
                <span className="text-fg-secondary">
                  {a.tipo === "avisa" ? "Avisa a " : "Rota entre "}
                  {a.usuarios.map((u) => u.nombre ?? "un usuario que ya no aparece").join(", ")}
                </span>
              </div>
            ))}
          </div>
        </Reporte>
      )}

      {choques.length > 0 && (
        <Reporte
          titulo="La misma propiedad, escrita por varios"
          subtitulo="Dos o más workflows encendidos escriben la misma propiedad: gana el último que corre."
          lectura={lecturaDe(vista, "workflows.choques")}
        >
          <div className="divide-y divide-line rounded-lg border border-line">
            {choques.slice(0, 10).map((c) => (
              <div key={c.propiedad} className="grid gap-x-4 gap-y-0.5 px-3 py-2 text-[13px] sm:grid-cols-[12rem_minmax(0,1fr)]">
                <span className="font-mono text-[12px] text-fg">{c.propiedad}</span>
                <span className="text-fg-secondary">{c.workflows.map(nombre).join(" · ")}</span>
              </div>
            ))}
          </div>
          {choques.length > 10 && <p className="text-xs text-fg-muted">Y {cifra(choques.length - 10)} propiedades más.</p>}
        </Reporte>
      )}

      {masEditados.length > 0 && (
        <Reporte
          titulo="Los más editados"
          subtitulo="Cuántas versiones guardó HubSpot de cada uno. Muchas versiones suelen ser lógica de negocio que se fue ajustando a prueba y error."
          lectura={lecturaDe(vista, "workflows.mas_editados")}
        >
          <TablaSimple cabecera={[{ texto: "Workflow" }, { texto: "Versiones", derecha: true }, { texto: "Último cambio" }]} ancho="min-w-[28rem]" plana>
            {masEditados.map((id) => {
              const w = porId.get(id);
              if (!w) return null;
              return (
                <tr key={id} className="border-t border-line first:border-t-0">
                  <td className="px-3 py-2">
                    <p className="text-fg">{w.nombre}</p>
                    <Encendido si={w.encendido} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-fg">{cifra(w.versiones ?? 0)}</td>
                  <td className="px-3 py-2 text-fg-secondary">{fecha(w.cambiadoEn)}</td>
                </tr>
              );
            })}
          </TablaSimple>
        </Reporte>
      )}

      <section className="space-y-2">
        <Rotulo>Inventario de workflows</Rotulo>
        <Segmentado
          etiqueta="Filtrar workflows"
          opciones={(Object.keys(ETIQUETA) as FiltroDeWorkflows[]).map((k) => ({
            clave: k,
            etiqueta: `${ETIQUETA[k]} · ${cifra(cuenta[k])}`,
            deshabilitada: k !== "todos" && cuenta[k] === 0,
          }))}
          valor={filtro}
          onCambio={setFiltro}
        />
        {filtrados.length === 0 ? (
          <p className="text-[13px] text-fg-muted">Ningún workflow con este filtro.</p>
        ) : (
          <>
            <TablaSimple cabecera={[{ texto: "Workflow" }, { texto: "Objeto" }, { texto: "Se dispara con" }, { texto: "Qué hace" }, { texto: "Último cambio" }]} ancho="min-w-[52rem]">
              {visibles.map((w) => (
                <tr key={w.id} className="border-t border-line align-top first:border-t-0">
                  <td className="px-3 py-2">
                    <p className="text-fg">{w.nombre}</p>
                    <Encendido si={w.encendido} />
                  </td>
                  <td className="px-3 py-2 text-fg-secondary">{ETIQUETA_DEL_OBJETO[w.objeto]}</td>
                  <td className="px-3 py-2 text-fg-secondary">
                    {seDisparaCon(w, etapas)}
                    {w.detalle?.reinscribe && <p className="text-xs text-fg-muted">Se reinscribe</p>}
                  </td>
                  <td className="px-3 py-2">
                    {w.detalle ? (
                      <>
                        <p className="text-fg-secondary">{w.detalle.queHace.length > 0 ? w.detalle.queHace.join(" · ") : "Sin acciones"}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {w.detalle.conCodigo && <ChipDeEstado tono="neutro">Código</ChipDeEstado>}
                          {w.detalle.conWebhook && (
                            <ChipDeEstado tono="neutro" title={w.detalle.webhookDominios?.join(", ")}>
                              {w.detalle.webhookDominios?.length ? `Webhook · ${w.detalle.webhookDominios[0]}` : "Webhook"}
                            </ChipDeEstado>
                          )}
                          {w.detalle.ramas > 0 && <ChipDeEstado tono="neutro">{`${cifra(w.detalle.ramas)} ${w.detalle.ramas === 1 ? "rama" : "ramas"}`}</ChipDeEstado>}
                          {(w.detalle.pasaA?.length ?? 0) > 0 && <ChipDeEstado tono="neutro">{`Llama a ${(w.detalle.pasaA ?? []).map(nombre).join(", ")}`}</ChipDeEstado>}
                          {enChoque.has(w.id) && <ChipDeEstado tono="atencion">Escribe lo mismo que otro</ChipDeEstado>}
                        </div>
                      </>
                    ) : (
                      <span className="text-xs text-fg-muted">No se pudo leer el detalle</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-fg-secondary">
                    {fecha(w.cambiadoEn)}
                    {w.versiones && w.versiones > 1 ? <p className="text-xs text-fg-muted">{cifra(w.versiones)} versiones</p> : null}
                    {viejos.has(w.id) && <p className="text-xs text-warn-ink">Hace más de un año</p>}
                  </td>
                </tr>
              ))}
            </TablaSimple>
            {pie}
          </>
        )}
      </section>
    </div>
  );
}

// ── Usuarios ─────────────────────────────────────────────────────────────────

export function SeccionUsuarios({ vista, acciones }: Props) {
  const inv = vista.inventario;
  const [verInactivos, setVerInactivos] = useState(false);
  if (!inv?.personas) {
    return (
      <div className="space-y-6">
        <AnalisisDeLaSeccion vista={vista} acciones={acciones} seccion="usuarios" />
        <SinLeer titulo="Usuarios del portal" />
      </div>
    );
  }
  const personas = inv.personas;
  const activos = personas.filter((p) => p.activo);
  const inactivos = personas.filter((p) => !p.activo);
  const dominios = dominiosConAcceso(personas);
  const lista = [...activos.sort((a, b) => Number(b.superAdmin) - Number(a.superAdmin) || a.nombre.localeCompare(b.nombre, "es")), ...(verInactivos ? inactivos : [])];
  return (
    <div className="space-y-6">
      <AnalisisDeLaSeccion vista={vista} acciones={acciones} seccion="usuarios" />

      <Reporte titulo="Quién tiene acceso" lectura={lecturaDe(vista, "usuarios.acceso")} plano>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Cifra rotulo="Usuarios activos" valor={activos.length} />
          <Cifra rotulo="Super Admin" valor={activos.filter((p) => p.superAdmin).length} nota="Pueden cambiar cualquier cosa del portal" />
          <Cifra rotulo="Ya no están" valor={inactivos.length} nota="Desactivados, pero dueños de registros o de configuración" />
          <Cifra rotulo="Dominios con acceso" valor={dominios.filter((d) => d.activos > 0).length} nota="Empresas distintas con usuarios activos" />
        </div>
      </Reporte>

      <Reporte
        titulo="Por dominio"
        subtitulo="Solo se guarda el dominio del correo, nunca el correo. Un dominio de otra agencia con usuarios activos es acceso que el cliente quizá no sabe que sigue abierto."
        lectura={lecturaDe(vista, "usuarios.dominios")}
      >
        <TablaSimple cabecera={[{ texto: "Dominio" }, { texto: "Activos", derecha: true }, { texto: "Super Admin", derecha: true }, { texto: "Ya no están", derecha: true }]} ancho="min-w-[28rem]" plana>
          {dominios.map((d) => (
            <tr key={d.dominio} className="border-t border-line first:border-t-0">
              <td className="px-3 py-2 text-fg">{d.dominio}</td>
              <td className="px-3 py-2 text-right tabular-nums text-fg">{cifra(d.activos)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-fg">{cifra(d.superAdmins)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-fg-muted">{cifra(d.inactivos)}</td>
            </tr>
          ))}
        </TablaSimple>
      </Reporte>

      <Reporte titulo="Equipos" lectura={inv.equipos ? lecturaDe(vista, "usuarios.equipos") : null}>
        {inv.equipos === null ? (
          <p className="text-[13px] text-fg-muted">No se pudieron leer los equipos: la conexión no tiene ese permiso. Se revisan en Configuración › Usuarios y equipos.</p>
        ) : inv.equipos.length === 0 ? (
          <p className="text-[13px] text-fg-muted">El portal no tiene equipos armados.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {inv.equipos.map((e) => (
              <Chip key={e.nombre}>
                {e.nombre} · {cifra(e.miembros)}
              </Chip>
            ))}
          </div>
        )}
      </Reporte>

      <section className="space-y-2">
        <Rotulo
          accion={
            inactivos.length > 0 ? (
              <BotonTexto onClick={() => setVerInactivos((v) => !v)}>{verInactivos ? "Ocultar los que ya no están" : `Ver los ${cifra(inactivos.length)} que ya no están`}</BotonTexto>
            ) : undefined
          }
        >
          Personas
        </Rotulo>
        <TablaSimple cabecera={[{ texto: "Nombre" }, { texto: "Dominio" }, { texto: "Acceso" }]} ancho="min-w-[28rem]">
          {lista.map((p) => (
            <tr key={p.usuarioId} className="border-t border-line first:border-t-0">
              <td className="px-3 py-2 text-fg">{p.nombre}</td>
              <td className="px-3 py-2 text-fg-secondary">{p.dominio ?? "—"}</td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap items-center gap-1">
                  {p.activo ? <span className="text-fg-secondary">Activo</span> : <ChipDeEstado tono="punteado">Ya no está</ChipDeEstado>}
                  {p.activo && p.superAdmin && <ChipDeEstado tono="neutro">Super Admin</ChipDeEstado>}
                </div>
              </td>
            </tr>
          ))}
        </TablaSimple>
      </section>
    </div>
  );
}
