"use client";

/**
 * «Ciclos anteriores» de un proyecto recurrente (docs/smartloop-plan.md, etapa 4; ficha E): cada ciclo cerrado con lo
 * que dejó su sesión de aprendizaje —la meta evaluada, cada caso de uso con lo medido y su decisión, la propuesta del
 * siguiente ciclo, su cronograma como quedó— y sus documentos CONGELADOS: la foto protegida que se tomó al cerrar.
 * «Ver cómo quedó» abre esa foto (GET /api/projects/[id]/versiones/[versionId]), solo para leer.
 */
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui";
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { nombreDelCiclo } from "@/lib/servicios/ciclo";
import { ETIQUETA_DE_DECISION, ETIQUETA_DE_RESULTADO } from "@/lib/servicios/cierre";
import type { CicloCerradoVista } from "@/lib/servicios/ciclos-server";

const FECHA = new Intl.DateTimeFormat("es-CR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fecha = (iso: string | null) => (iso ? FECHA.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)) : null);

interface SeccionDeLaFoto {
  key: string;
  label: string;
  titleOverride: string | null;
  blocks: Array<{ content: string | null; data: unknown }>;
}

/** Todo el texto de una sección de la foto, aplanado para leerlo. */
function textoDe(s: SeccionDeLaFoto): string[] {
  const partes: string[] = [];
  const juntar = (v: unknown) => {
    if (typeof v === "string") {
      if (v.trim() && !/^https?:\/\//.test(v)) partes.push(v.trim());
    } else if (Array.isArray(v)) v.forEach(juntar);
    else if (v && typeof v === "object") Object.values(v as Record<string, unknown>).forEach(juntar);
  };
  for (const b of s.blocks) {
    if (b.content) partes.push(b.content);
    juntar(b.data);
  }
  return partes;
}

function FotoDelDocumento({ projectId, versionId, nombre, onCerrar }: { projectId: string; versionId: string; nombre: string; onCerrar: () => void }) {
  const [secciones, setSecciones] = useState<SeccionDeLaFoto[] | null | "error">(null);
  useEffect(() => {
    let vivo = true;
    fetch(`/api/projects/${projectId}/versiones/${versionId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { version: { secciones: SeccionDeLaFoto[] } }) => {
        if (vivo) setSecciones(j.version.secciones);
      })
      .catch(() => {
        if (vivo) setSecciones("error");
      });
    return () => {
      vivo = false;
    };
  }, [projectId, versionId]);
  return (
    <Modal open onClose={onCerrar} title={`${nombre} · como quedó al cerrar el ciclo`} size="lg">
      {secciones === "error" ? (
        <p className="text-[13px] text-danger-ink">No se pudo abrir la foto del documento.</p>
      ) : !secciones ? (
        <div className="space-y-2" aria-busy="true">
          <div className="skeleton-shimmer h-4 w-48 rounded" />
          <div className="skeleton-shimmer h-10 rounded-lg" />
        </div>
      ) : (
        <div className="max-h-[60vh] space-y-4 overflow-y-auto">
          {secciones.map((s) => {
            const texto = textoDe(s);
            if (texto.length === 0) return null;
            return (
              <section key={s.key} className="space-y-1">
                <h3 className="text-sm font-semibold text-fg">{s.titleOverride || s.label}</h3>
                {texto.map((t, i) => (
                  <p key={i} className="whitespace-pre-line text-[13px] text-fg-secondary">
                    {t}
                  </p>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

export default function CiclosAnteriores({ projectId, cerrados }: { projectId: string; cerrados: CicloCerradoVista[] }) {
  const [abierta, setAbierta] = useState<{ versionId: string; nombre: string } | null>(null);
  if (cerrados.length === 0) return null;
  return (
    <section className="space-y-3" data-recorrido="ciclo.anteriores">
      <h2 className="text-sm font-semibold text-fg">Ciclos anteriores</h2>
      <ul className="space-y-3">
        {cerrados.map((c) => {
          const cierre = c.cierre;
          return (
            <li key={c.numero} className="space-y-3 rounded-xl border border-line bg-surface p-4">
              <div>
                <p className="text-[13px] font-semibold text-fg">{nombreDelCiclo(c)}</p>
                <p className="text-xs text-fg-muted">
                  {c.desde && c.hasta ? `${fecha(c.desde)} al ${fecha(c.hasta)}` : "Sin fechas"}
                  {c.cerradoAt ? ` · cerrado el ${fecha(c.cerradoAt)}` : ""}
                  {cierre?.via === "importado" ? " · traído de la propuesta vendida" : ""}
                </p>
              </div>

              {cierre?.meta || c.meta ? (
                <p className="text-[13px] text-fg-secondary">
                  <span className="text-fg">Meta:</span> {cierre?.meta ?? c.meta}
                  {cierre?.metaResultado ? <span className="text-fg-muted"> · {ETIQUETA_DE_RESULTADO[cierre.metaResultado]}</span> : null}
                  {cierre?.metaEvaluada ? <span className="block text-xs text-fg-muted">{cierre.metaEvaluada}</span> : null}
                </p>
              ) : null}

              {cierre && cierre.casos.length > 0 && (
                <div className="space-y-1">
                  <p className={ROTULO_DEL_SISTEMA}>Casos de uso</p>
                  <ul className="space-y-1">
                    {cierre.casos.map((k) => (
                      <li key={k.id} className="text-[13px] text-fg-secondary">
                        <span className="text-fg">{k.titulo}</span>
                        <span className="text-fg-muted"> · {ETIQUETA_DE_DECISION[k.decision]}</span>
                        {k.criterioMedido ? <span className="block text-xs text-fg-muted">Medido: {k.criterioMedido}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {cierre?.siguienteCiclo ? (
                <p className="text-[13px] text-fg-secondary">
                  <span className="text-fg">Lo que se propuso para el siguiente:</span> {cierre.siguienteCiclo}
                </p>
              ) : null}

              {cierre && cierre.documentos.some((d) => d.versionId) && (
                <div className="space-y-1">
                  <p className={ROTULO_DEL_SISTEMA}>Documentos congelados</p>
                  <ul className="flex flex-wrap gap-2">
                    {cierre.documentos
                      .filter((d) => d.versionId)
                      .map((d) => (
                        <li key={d.canvasId}>
                          <button
                            type="button"
                            onClick={() => setAbierta({ versionId: d.versionId!, nombre: d.nombre })}
                            className="rounded-full border border-line px-2.5 py-0.5 text-xs text-fg-secondary hover:bg-surface-hover"
                          >
                            {d.nombre} · ver cómo quedó
                          </button>
                        </li>
                      ))}
                  </ul>
                </div>
              )}

              {!cierre && <p className="text-xs text-fg-muted">Este ciclo se cerró antes de que Nexus guardara el cierre: no tiene lo medido ni sus documentos congelados.</p>}
            </li>
          );
        })}
      </ul>
      {abierta && <FotoDelDocumento projectId={projectId} versionId={abierta.versionId} nombre={abierta.nombre} onCerrar={() => setAbierta(null)} />}
    </section>
  );
}
