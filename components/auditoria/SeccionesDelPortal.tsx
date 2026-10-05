"use client";

/**
 * Las secciones del PORTAL de la ficha de una auditoría: Resumen, Ciclo de vida y Propietarios.
 *
 * Se leen como un informe: arriba lo que dice el análisis de la sección y sus hallazgos; debajo los
 * reportes, cada uno con su lectura arriba de los datos. Un reporte incompleto no se pinta a medias
 * (lib/auditoria-portal/estado.ts).
 */
import { useState } from "react";
import { Alert, Segmentado, useToast } from "@/components/ui";
import FranjaDeSugerencias, { BotonAzul, BotonBlanco, BotonTexto } from "@/components/exploraciones/FranjaDeSugerencias";
import { cifra, porcentaje } from "@/lib/auditoria-portal/cifras";
import type { Hallazgo, SeccionConLectura } from "@/lib/auditoria-portal/foto";
import { ETIQUETA_DEL_OBJETO } from "@/lib/auditoria-portal/inventario";
import { seccionDelHallazgo, type SeccionDeLaFicha, type VistaDeAuditoria } from "@/lib/auditoria-portal/vista";
import type { AccionesDeLaFicha } from "./FichaDeAuditoria";
import { Barras, ChipDeEstado, Cifra, FilaDeHallazgo, LecturaDelAnalisis, porSeveridad, Reporte, Rotulo, SinLeer, TarjetaDeHallazgo } from "./piezas";

type Props = { vista: VistaDeAuditoria; acciones: AccionesDeLaFicha };

/** La lectura del análisis sobre un reporte, si la hay. */
export const lecturaDe = (vista: VistaDeAuditoria, reporte: string) => vista.analisis?.lecturasDeReporte?.[reporte] ?? null;

/**
 * Se decide sobre los hallazgos solo con la auditoría «lista»: mientras se genera otro análisis, los
 * que se ven van a ser reemplazados (y sus ids, renumerados).
 */
const sinDecisiones = (vista: VistaDeAuditoria, acciones: AccionesDeLaFicha) => acciones.ocupado || vista.estado !== "lista";

/**
 * Lo de arriba de cada sección: la lectura del análisis y sus hallazgos, del más grave al que
 * funciona. Confirmar no los mueve; los descartados se esconden y se pueden volver a ver.
 */
export function AnalisisDeLaSeccion({ vista, acciones, seccion }: Props & { seccion: SeccionConLectura }) {
  const [verDescartados, setVerDescartados] = useState(false);
  const a = vista.analisis;
  if (!a) return null;
  const lectura = a.lecturasDeSeccion?.[seccion];
  const todos = a.hallazgos.filter((h) => seccionDelHallazgo(h.seccion) === seccion);
  const visibles = todos.filter((h) => h.estado !== "descartado").sort(porSeveridad);
  const descartados = todos.filter((h) => h.estado === "descartado");
  if (!lectura && todos.length === 0) return null;
  return (
    <div className="space-y-3">
      {lectura && <LecturaDelAnalisis>{lectura}</LecturaDelAnalisis>}
      <ListaDeHallazgos lista={visibles} vista={vista} acciones={acciones} />
      {descartados.length > 0 && (
        <div className="space-y-2">
          <BotonTexto onClick={() => setVerDescartados((v) => !v)}>
            {verDescartados ? "Ocultar los descartados" : `Ver ${descartados.length === 1 ? "el descartado" : `los ${descartados.length} descartados`}`}
          </BotonTexto>
          {verDescartados && <ListaDeHallazgos lista={descartados} vista={vista} acciones={acciones} />}
        </div>
      )}
    </div>
  );
}

function ListaDeHallazgos({ lista, vista, acciones, conSeccion }: { lista: Hallazgo[]; conSeccion?: boolean } & Props) {
  if (lista.length === 0) return null;
  return (
    <div className="space-y-2.5">
      {lista.map((h) => (
        <TarjetaDeHallazgo
          key={h.id}
          hallazgo={h}
          etiquetas={vista.analisis?.etiquetas ?? {}}
          conSeccion={conSeccion}
          ocupado={sinDecisiones(vista, acciones)}
          onDecidir={(estado) => acciones.decidir([h.id], estado)}
          onIrASeccion={conSeccion ? () => acciones.ir(seccionDelHallazgo(h.seccion)) : undefined}
        />
      ))}
    </div>
  );
}

// ── Resumen ──────────────────────────────────────────────────────────────────

export function SeccionResumen({ vista, acciones }: Props) {
  const toast = useToast();
  const e = vista.estadoDelPortal!;
  const enr = vista.enriquecimiento;
  const inv = vista.inventario;
  const a = vista.analisis;
  const vivos = (a?.hallazgos ?? []).filter((h) => h.estado !== "descartado").sort(porSeveridad);
  const sugeridos = vivos.filter((h) => h.estado === "sugerido");
  // Los de actividad y datos viven en el Resumen: acá van completos. Los demás, en una línea que lleva a su sección.
  const delResumen = vivos.filter((h) => seccionDelHallazgo(h.seccion) === "resumen");
  const deOtras = vivos.filter((h) => seccionDelHallazgo(h.seccion) !== "resumen");
  const cuenta = (s: Hallazgo["severidad"]) => vivos.filter((h) => h.severidad === s).length;
  const pipelinesDe = (o: "negocios" | "tickets") => inv?.pipelines?.filter((p) => p.objeto === o).length ?? null;
  const propias = inv?.propiedades?.porObjeto.reduce((s, o) => s + o.propias, 0) ?? null;
  const wfs = inv?.workflows ?? null;
  const personas = inv?.personas ?? null;
  const titular = a?.estado?.titular ?? "";
  const parrafo = a?.estado?.parrafo || a?.resumen || "";
  const copiarPreguntas = async () => {
    if (!a?.preguntas.length) return;
    try {
      await navigator.clipboard.writeText(a.preguntas.map((p, i) => `${i + 1}. ${p}`).join("\n"));
      toast.success("Preguntas copiadas.");
    } catch {
      toast.error("No se pudieron copiar.");
    }
  };

  return (
    <div className="space-y-6">
      {vista.estado === "analizando" && (
        <Alert variant="info" title="El análisis se está generando">
          Los datos del portal ya están. El informe aparece acá en un par de minutos; la página se actualiza sola.
        </Alert>
      )}
      {!a && vista.analisisError && vista.estado === "lista" && (
        <Alert variant="warning" title="El análisis no se pudo generar">
          {vista.analisisError} Puedes volver a generarlo desde el panel de la derecha.
        </Alert>
      )}

      {sugeridos.length > 0 && (
        <FranjaDeSugerencias
          acciones={
            <BotonAzul disabled={sinDecisiones(vista, acciones)} onClick={() => acciones.decidir(sugeridos.map((h) => h.id), "confirmado")}>
              {`Confirmar ${sugeridos.length === 1 ? "el hallazgo" : `los ${sugeridos.length}`}`}
            </BotonAzul>
          }
        >
          <strong>{`${sugeridos.length} ${sugeridos.length === 1 ? "hallazgo sugerido" : "hallazgos sugeridos"}`}</strong> por revisar. Cada uno está en su sección; confirmado, queda en el informe.
        </FranjaDeSugerencias>
      )}

      {a && (titular || parrafo) && (
        <LecturaDelAnalisis
          titulo="Estado del portal"
          pie={
            vivos.length > 0
              ? [cuenta("critico") && `${cuenta("critico")} ${cuenta("critico") === 1 ? "crítico" : "críticos"}`, cuenta("atencion") && `${cuenta("atencion")} de atención`, cuenta("bien") && `${cuenta("bien")} que ${cuenta("bien") === 1 ? "funciona" : "funcionan"}`]
                  .filter(Boolean)
                  .join(" · ")
              : undefined
          }
        >
          {titular && <p className="text-[17px] font-semibold leading-snug text-fg">{titular}</p>}
          {parrafo && <p className={titular ? "mt-1.5 text-fg-secondary" : undefined}>{parrafo}</p>}
          {!a.estado && (
            <p className="mt-2 text-xs text-fg-muted">Este análisis es de la versión anterior: vuelve a generarlo para ver el informe completo, con una lectura por reporte.</p>
          )}
        </LecturaDelAnalisis>
      )}

      {delResumen.length > 0 && (
        <section className="space-y-2">
          <Rotulo ia>Actividad y calidad de los datos</Rotulo>
          <ListaDeHallazgos lista={delResumen} vista={vista} acciones={acciones} />
        </section>
      )}

      {deOtras.length > 0 && (
        <section className="space-y-2">
          <Rotulo ia>{`En las demás secciones · ${deOtras.length}`}</Rotulo>
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            {deOtras.map((h) => (
              <FilaDeHallazgo key={h.id} hallazgo={h} onIr={() => acciones.ir(seccionDelHallazgo(h.seccion))} />
            ))}
          </div>
          <p className="text-xs text-fg-muted">El detalle de cada uno, con por qué importa y qué hacer, está en su sección.</p>
        </section>
      )}

      {a && a.preguntas.length > 0 && (
        <section className="space-y-2">
          <Rotulo ia accion={<BotonBlanco onClick={() => void copiarPreguntas()}>Copiar las preguntas</BotonBlanco>}>
            {`Preguntas para el cliente · ${a.preguntas.length}`}
          </Rotulo>
          <ol className="list-decimal space-y-1.5 rounded-xl border border-line bg-surface py-4 pl-9 pr-4 text-sm text-fg">
            {a.preguntas.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
        </section>
      )}

      <Reporte titulo="El portal hoy" lectura={lecturaDe(vista, "portal.hoy")} plano>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Cifra
            rotulo="Contactos"
            valor={e.totales.contactos}
            nota={enr?.contacts.neverContacted != null && e.totales.contactos ? `${cifra(enr.contacts.neverContacted)} sin ninguna actividad (${porcentaje(enr.contacts.neverContacted, e.totales.contactos)})` : undefined}
          />
          <Cifra rotulo="Empresas" valor={e.totales.empresas} nota={enr?.companies.active30d != null ? `${cifra(enr.companies.active30d)} con actividad en 30 días` : undefined} />
          <Cifra rotulo="Negocios" valor={e.totales.negocios} nota={pipelinesDe("negocios") !== null ? `en ${cifra(pipelinesDe("negocios")!)} pipelines` : undefined} />
          <Cifra rotulo="Tickets" valor={e.totales.tickets} nota={pipelinesDe("tickets") !== null ? `en ${cifra(pipelinesDe("tickets")!)} pipelines` : undefined} />
        </div>
      </Reporte>

      <Reporte titulo="Cómo está configurado" lectura={lecturaDe(vista, "portal.configuracion")} plano>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <button type="button" className="text-left" onClick={() => acciones.ir("propiedades")}>
            <Cifra
              rotulo="Propiedades propias"
              valor={propias}
              nota={vista.derivados.creadores ? `${cifra(vista.derivados.creadores.deQuienesYaNoEstan)} de gente que ya no tiene usuario` : undefined}
            />
          </button>
          <button type="button" className="text-left" onClick={() => acciones.ir("workflows")}>
            <Cifra
              rotulo="Workflows"
              valor={wfs ? wfs.length : null}
              nota={wfs ? `${cifra(wfs.filter((w) => w.encendido).length)} encendidos · ${cifra(vista.cruces.cadenas.length)} cadenas entre ellos` : undefined}
            />
          </button>
          <button type="button" className="text-left" onClick={() => acciones.ir("usuarios")}>
            <Cifra
              rotulo="Usuarios con acceso"
              valor={personas ? personas.filter((p) => p.activo).length : null}
              nota={personas ? `${cifra(personas.filter((p) => p.activo && p.superAdmin).length)} Super Admin · ${cifra(personas.filter((p) => !p.activo).length)} ya no están` : undefined}
            />
          </button>
          <button type="button" className="text-left" onClick={() => acciones.ir("comprobar")}>
            <div className="h-full rounded-xl border border-dashed border-line bg-surface-muted p-4">
              <p className="text-[13px] text-fg-secondary">Apps conectadas, plan y reportes</p>
              <p className="mt-1 text-xs text-fg-muted">No salen por API. Se revisan en «Comprobar a mano».</p>
            </div>
          </button>
        </div>
      </Reporte>

      {vista.contexto && (
        <p className="text-xs text-fg-muted">
          El análisis también leyó lo que Nexus sabe del cliente: {vista.contexto.fuentes.map((f) => `${f.documento} (${f.proyecto})`).join(" · ")}.
        </p>
      )}
    </div>
  );
}

// ── Ciclo de vida ────────────────────────────────────────────────────────────

const EMBUDO = [
  { value: "lead", label: "Lead" },
  { value: "marketingqualifiedlead", label: "MQL" },
  { value: "salesqualifiedlead", label: "SQL" },
  { value: "opportunity", label: "Oportunidad" },
  { value: "customer", label: "Cliente" },
];

export function SeccionCicloDeVida({ vista, acciones }: Props) {
  const [objeto, setObjeto] = useState<"contactos" | "empresas">("contactos");
  const e = vista.estadoDelPortal!;
  const etapas = objeto === "contactos" ? e.contactosPorEtapa : e.empresasPorEtapa;
  const total = objeto === "contactos" ? e.totales.contactos : e.totales.empresas;
  const wfs = vista.inventario?.workflows ?? null;
  const tocanEtapa = wfs ? wfs.filter((w) => w.detalle?.cambiaEtapa) : null;
  const etiquetaDeEtapa = new Map((e.contactosPorEtapa ?? []).map((x) => [x.value, x.label]));

  let embudo: { label: string; count: number; saltada: boolean }[] = [];
  if (e.contactosPorEtapa) {
    const de = (v: string) => e.contactosPorEtapa!.find((x) => x.value === v)?.count ?? 0;
    const pasos = EMBUDO.map((s) => ({ label: s.label, count: de(s.value) }));
    // Una etapa intermedia se «salta» si tiene menos de una décima parte que cualquiera de las de más adelante.
    embudo = pasos.map((p, i) => ({
      ...p,
      saltada: i > 0 && i < pasos.length - 1 && pasos.slice(i + 1).some((q) => q.count > 0 && p.count < q.count / 10),
    }));
  }
  const saltadas = embudo.filter((p) => p.saltada);

  return (
    <div className="space-y-6">
      <AnalisisDeLaSeccion vista={vista} acciones={acciones} seccion="ciclo" />

      {!etapas || total === null ? (
        <SinLeer titulo={`${objeto === "contactos" ? "Contactos" : "Empresas"} por etapa del ciclo de vida`} />
      ) : (
        <Reporte
          titulo={`${objeto === "contactos" ? "Contactos" : "Empresas"} por etapa`}
          subtitulo={`Las ${cifra(etapas.length)} etapas que usa el portal · ${cifra(total)} ${objeto} · sin etapa: ${cifra(Math.max(0, total - etapas.reduce((s, x) => s + x.count, 0)))}`}
          lectura={lecturaDe(vista, objeto === "contactos" ? "ciclo.contactos" : "ciclo.empresas")}
          accion={
            <Segmentado
              etiqueta="Objeto"
              opciones={[
                { clave: "contactos", etiqueta: "Contactos" },
                { clave: "empresas", etiqueta: "Empresas" },
              ]}
              valor={objeto}
              onCambio={setObjeto}
            />
          }
        >
          <Barras filas={etapas.map((x) => ({ etiqueta: x.label, valor: x.count }))} total={total} />
        </Reporte>
      )}

      {embudo.length > 0 && (
        <Reporte titulo="Del lead al cliente" subtitulo="Las mismas etapas de los contactos, en el orden en que se supone que avanzan." lectura={lecturaDe(vista, "ciclo.embudo")}>
          <div className="grid gap-2 sm:grid-cols-5">
            {embudo.map((p) => (
              <div key={p.label} className={p.saltada ? "rounded-lg border border-warn-line bg-warn-surface px-3 py-2.5" : "rounded-lg border border-line px-3 py-2.5"}>
                <p className={p.saltada ? "text-xs text-warn-ink" : "text-xs text-fg-muted"}>{p.label}</p>
                <p className={p.saltada ? "text-lg font-semibold tabular-nums text-warn-ink" : "text-lg font-semibold tabular-nums text-fg"}>{cifra(p.count)}</p>
              </div>
            ))}
          </div>
          {saltadas.length > 0 && (
            <p className="text-xs text-warn-ink">
              Se saltan {saltadas.map((p) => p.label).join(" y ")}: tienen muchos menos contactos que las etapas que vienen después.
            </p>
          )}
        </Reporte>
      )}

      <Reporte
        titulo={`Workflows que cambian la etapa${tocanEtapa ? ` · ${cifra(tocanEtapa.length)}` : ""}`}
        subtitulo="De todos los objetos. El detalle de cada uno está en «Workflows»."
        lectura={lecturaDe(vista, "ciclo.workflows")}
      >
        {tocanEtapa === null ? (
          <p className="text-[13px] text-fg-muted">No se pudo leer la lista de workflows.</p>
        ) : tocanEtapa.length === 0 ? (
          <p className="text-[13px] text-fg-muted">Ninguno: la etapa se cambia a mano o desde otra herramienta.</p>
        ) : (
          <div className="space-y-1.5">
            {tocanEtapa.map((w) => (
              <div key={w.id} className="flex flex-wrap items-center gap-2.5 rounded-lg border border-line px-3 py-2.5">
                <span className="min-w-0 flex-1 text-[13px] text-fg">{w.nombre}</span>
                {(w.detalle?.poneCicloDeVida ?? []).map((v) => (
                  <ChipDeEstado key={v} tono="neutro">
                    Pone «{etiquetaDeEtapa.get(v) ?? v}»
                  </ChipDeEstado>
                ))}
                <ChipDeEstado tono="neutro">{ETIQUETA_DEL_OBJETO[w.objeto]}</ChipDeEstado>
                <span className={w.encendido ? "text-xs text-success-ink" : "text-xs text-fg-muted"}>{w.encendido ? "● Encendido" : "○ Apagado"}</span>
              </div>
            ))}
          </div>
        )}
      </Reporte>
    </div>
  );
}

// ── Propietarios ─────────────────────────────────────────────────────────────

export function SeccionPropietarios({ vista, acciones }: Props) {
  const e = vista.estadoDelPortal!;
  const p = e.propietarios;
  const total = e.totales.contactos;
  if (p.estado !== "completo" || total === null) {
    return (
      <div className="space-y-6">
        <AnalisisDeLaSeccion vista={vista} acciones={acciones} seccion="propietarios" />
        <SinLeer titulo="Asignación de propietarios" />
      </div>
    );
  }
  const d = p.datos;
  const creados = d.monthlyCreated.reduce((s, m) => s + m.count, 0);
  const asignados = d.monthlyAssignments.reduce((s, m) => s + m.count, 0);
  const asignadosPorMes = new Map(d.monthlyAssignments.map((m) => [m.month, m.count]));
  return (
    <div className="space-y-6">
      <AnalisisDeLaSeccion vista={vista} acciones={acciones} seccion="propietarios" />

      <Reporte titulo="Con y sin propietario" lectura={lecturaDe(vista, "propietarios.asignacion")} plano>
        <div className="grid gap-3 sm:grid-cols-3">
          <Cifra rotulo="Con propietario" valor={d.totalAssigned} nota={porcentaje(d.totalAssigned, total)} />
          <Cifra rotulo="Sin propietario" valor={d.unassigned} nota={porcentaje(d.unassigned, total)} />
          <Cifra rotulo="Propietarios con contactos" valor={d.owners.length} />
        </div>
      </Reporte>

      <Reporte titulo="Contactos por propietario" subtitulo={`Los diez con más contactos asignados, sobre ${cifra(total)} contactos.`} lectura={lecturaDe(vista, "propietarios.reparto")}>
        <Barras filas={d.owners.slice(0, 10).map((o) => ({ etiqueta: o.ownerName, valor: o.contactCount }))} total={total} />
      </Reporte>

      <Reporte
        titulo="Últimos 12 meses"
        subtitulo={`Se crearon ${cifra(creados)} contactos y hubo ${cifra(asignados)} asignaciones de propietario.`}
        lectura={lecturaDe(vista, "propietarios.doce_meses")}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-[13px]">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                <th className="py-1.5 pr-3 font-semibold">Mes</th>
                <th className="py-1.5 pr-3 text-right font-semibold">Creados</th>
                <th className="py-1.5 text-right font-semibold">Asignados</th>
              </tr>
            </thead>
            <tbody>
              {d.monthlyCreated.map((m) => (
                <tr key={m.month} className="border-t border-line">
                  <td className="py-1.5 pr-3 text-fg-secondary">{m.label}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-fg">{cifra(m.count)}</td>
                  <td className="py-1.5 text-right tabular-nums text-fg">{cifra(asignadosPorMes.get(m.month) ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Reporte>
    </div>
  );
}

export type { SeccionDeLaFicha };
