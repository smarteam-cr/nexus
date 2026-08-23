"use client";

/**
 * SicopDetalle — todo lo que se sabe de UNA licitación, en un panel lateral.
 *
 * Tres bloques, en el orden en que se decide:
 *   1. LO QUE DIJO EL FILTRO de SICOP (score, confianza, razón) — la primera criba.
 *   2. LOS DATOS DEL PROCEDIMIENTO — monto, tipo, fechas límite: hechos del expediente.
 *   3. LA FICHA DE IA — qué es, si encaja, si se puede ganar, qué bloquea.
 *   4. EL HILO DE NOTAS con sus archivos — la fuente de todo lo de arriba.
 *
 * ⚠ EL FILTRO Y LA IA SON DOS OPINIONES, NO UNA. Se muestran separadas a propósito: el
 * 2026-08-23 se encontró una nota de «Análisis del filtro» escrita en el ticket equivocado
 * (el veredicto de una consultoría de marca pegado a un ticket de hosting). Fundirlas en un
 * número solo escondería justo el desacuerdo que hay que mirar.
 *
 * ⛔ NADA SE ESCONDE POR NO ENTENDERSE. Una nota que el lector no reconoce se muestra cruda, y
 * los campos que no están en el vocabulario conocido se listan igual. Si el scraper cambia de
 * formato, esta pantalla lo hace evidente en vez de quedarse callada.
 */
import { Alert, Badge, Drawer } from "@/components/ui";
import { hubspotTicketUrl } from "@/lib/hubspot/urls";
import { CLASE_LABEL, etiquetaDeArchivos, type NotaClasificada } from "@/lib/ventas/sicop-notas";
import { labelDeCategoria, type ArchivoDeLaFila, type EncajeSicop, type FilaSicop } from "@/lib/ventas/sicop-orden";
import type { SicopAdjuntoEstado } from "@prisma/client";

export const numero = new Intl.NumberFormat("es-CR", { maximumFractionDigits: 2 });

export const ENCAJE_META: Record<
  EncajeSicop,
  { corto: string; largo: string; variant: "success" | "warning" | "default" }
> = {
  DENTRO: { corto: "Dentro", largo: "Es de lo que vendemos", variant: "success" },
  DUDOSO: { corto: "Dudoso", largo: "Hay que mirarlo", variant: "warning" },
  FUERA: { corto: "Fuera", largo: "Fuera de alcance", variant: "default" },
};

export function fechaCorta(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

function pesoLegible(bytes: number | null): string | null {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * El estado de un archivo en palabras. Los seis dicen cosas distintas y con dueños distintos:
 * OCR, permiso de HubSpot y bug no se arreglan igual, así que no se colapsan en «falló».
 */
const ESTADO_ARCHIVO: Record<
  SicopAdjuntoEstado,
  { label: string; variant: "success" | "warning" | "destructive" | "info" | "default"; ayuda: string }
> = {
  PENDIENTE: { label: "sin bajar", variant: "default", ayuda: "Todavía no se intentó leerlo." },
  EXTRAIDO: { label: "leído", variant: "success", ayuda: "Se bajó y su texto entra al análisis." },
  SIN_TEXTO: {
    label: "escaneado",
    variant: "warning",
    ayuda: "Se bajó bien pero no tiene texto: es una imagen. Haría falta OCR.",
  },
  SIN_PERMISO: {
    label: "sin permiso",
    variant: "info",
    ayuda: "Falta autorizar el scope `files` en la app de HubSpot.",
  },
  DEMASIADO_GRANDE: { label: "muy grande", variant: "warning", ayuda: "Pasa el tope de 20 MB." },
  ERROR: { label: "falló", variant: "destructive", ayuda: "Algo se rompió al bajarlo." },
};

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="text-2xs uppercase tracking-widest text-fg-muted mb-1.5">{titulo}</p>
      <div className="text-xs text-fg-secondary leading-relaxed space-y-1.5">{children}</div>
    </section>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-fg-muted w-44 flex-shrink-0">{etiqueta}</span>
      <span className="min-w-0 flex-1 text-fg-secondary">{valor}</span>
    </div>
  );
}

// ── El panel ───────────────────────────────────────────────────────────────────

export default function SicopDetalle({
  fila,
  portalId,
  puedeAnalizar,
  corriendo,
  onCerrar,
  onAnalizar,
}: {
  fila: FilaSicop | null;
  portalId: string | null;
  puedeAnalizar: boolean;
  corriendo: boolean;
  onCerrar: () => void;
  onAnalizar: (profundo: boolean) => void;
}) {
  const url = fila ? hubspotTicketUrl(portalId, fila.id) : null;
  const l = fila?.lectura ?? null;
  const p = fila?.datosDelProcedimiento ?? null;
  const f = fila?.filtro ?? null;

  const sinPermiso = (fila?.archivos ?? []).filter((a) => a.estado === "SIN_PERMISO").length;
  const escaneados = (fila?.archivos ?? []).filter((a) => a.estado === "SIN_TEXTO").length;

  return (
    <Drawer
      open={!!fila}
      onClose={onCerrar}
      size="xl"
      title={fila?.asunto ?? ""}
      description={fila ? `${fila.etapa.label}${fila.procedimiento ? ` · ${fila.procedimiento}` : ""}` : undefined}
      footer={
        fila && (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-fg-muted hover:text-brand underline underline-offset-2"
              >
                Abrir el ticket en HubSpot
              </a>
            ) : (
              <span />
            )}
            {puedeAnalizar && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={corriendo}
                  onClick={() => onAnalizar(false)}
                  className="text-xs text-fg-muted hover:text-fg underline underline-offset-2 disabled:opacity-50"
                >
                  Volver a leer
                </button>
                <button
                  type="button"
                  disabled={corriendo}
                  onClick={() => onAnalizar(true)}
                  className="text-xs text-brand hover:text-brand-light underline underline-offset-2 disabled:opacity-50"
                  title="Baja los archivos, les saca el texto y se lo pasa a la IA"
                >
                  Analizar a fondo
                </button>
              </div>
            )}
          </div>
        )
      }
    >
      {fila && (
        <div className="space-y-5">
          {/* ── 1. El filtro del scraper ── */}
          <Bloque titulo="Lo que dijo el filtro de SICOP">
            {f ? (
              <>
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-lg font-semibold text-fg tabular-nums">{f.score ?? "—"}</p>
                    <p className="text-2xs uppercase tracking-widest text-fg-muted">Score</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-fg tabular-nums">{f.confianza ?? "—"}</p>
                    <p className="text-2xs uppercase tracking-widest text-fg-muted">Confianza</p>
                  </div>
                  {f.decision && (
                    <Badge variant="default" size="xs" title="La palabra exacta que usó el scraper">
                      {f.decision}
                    </Badge>
                  )}
                  {f.track && (
                    <Badge variant="default" size="xs" title="La taxonomía del scraper">
                      {f.track}
                    </Badge>
                  )}
                </div>
                {f.razon && <p>{f.razon}</p>}
              </>
            ) : (
              <p className="text-fg-muted">
                El scraper no dejó su nota de análisis en esta licitación.
              </p>
            )}
          </Bloque>

          {/* ── 2. Datos del procedimiento ── */}
          {p && (
            <Bloque titulo="Datos del procedimiento">
              {p.montoEstimado != null && (
                <Dato etiqueta="Monto estimado" valor={numero.format(p.montoEstimado)} />
              )}
              {p.tipoProcedimiento && <Dato etiqueta="Tipo" valor={p.tipoProcedimiento} />}
              {p.fechaAclaraciones && (
                <Dato etiqueta="Límite de aclaraciones" valor={fechaCorta(p.fechaAclaraciones)} />
              )}
              {p.fechaObjecion && (
                <Dato etiqueta="Límite de objeción" valor={fechaCorta(p.fechaObjecion)} />
              )}
              {p.admisibilidadObjecion && (
                <Dato etiqueta="Admisibilidad de objeción" valor={p.admisibilidadObjecion} />
              )}
              {p.multas && <Dato etiqueta="Multas" valor={p.multas} />}
            </Bloque>
          )}

          {/* ── 3. La ficha de IA ── */}
          <Bloque titulo="Lo que leyó la IA de Nexus">
            {!l && (
              <p className="text-fg-muted">
                Todavía no se leyó. Apretá «Volver a leer» o «Analizar a fondo» abajo.
              </p>
            )}
            {l?.error && (
              <Alert variant="danger" title="El análisis falló">
                {l.error}
              </Alert>
            )}
            {l && !l.error && (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={ENCAJE_META[l.encaje].variant} size="xs">
                    {ENCAJE_META[l.encaje].largo}
                  </Badge>
                  {l.profundo ? (
                    <Badge variant="info" size="xs" title="Leyó el contenido del cartel">
                      leyó {l.adjuntosLeidos} archivo(s)
                    </Badge>
                  ) : (
                    <Badge variant="default" size="xs" title="Salió del título y las notas">
                      sin el cartel
                    </Badge>
                  )}
                  {l.confianza != null && (
                    <span className="text-2xs text-fg-muted">
                      información disponible {l.confianza}/100
                    </span>
                  )}
                </div>
                {l.objeto && <p className="text-fg">{l.objeto}</p>}
                {l.categorias.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    {l.categorias.map((c) => (
                      <span
                        key={c}
                        className="rounded-full border border-line px-2 py-0.5 text-2xs text-fg-muted"
                      >
                        {labelDeCategoria(c)}
                      </span>
                    ))}
                  </div>
                )}
                {l.encajeRazon && <Dato etiqueta="Por qué encaja (o no)" valor={l.encajeRazon} />}
                {l.probabilidadRazon && (
                  <Dato etiqueta="Qué tan ganable se ve" valor={l.probabilidadRazon} />
                )}
                {l.bloqueantes.length > 0 && (
                  <div className="pt-1">
                    <p className="text-fg-muted mb-1">Lo que nos bloquea</p>
                    <ul className="space-y-1.5">
                      {l.bloqueantes.map((b, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <Badge
                            variant={b.severidad === "BLOQUEA" ? "destructive" : "warning"}
                            size="xs"
                            className="mt-0.5 flex-shrink-0"
                          >
                            {b.severidad === "BLOQUEA" ? "bloquea" : "riesgo"}
                          </Badge>
                          <span>
                            <span className="text-fg">{b.titulo}</span>
                            {b.detalle && <> — {b.detalle}</>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {l.evaluacion && (
                  <Dato
                    etiqueta="Cómo se evalúa"
                    valor={
                      <>
                        {l.evaluacion}
                        {l.pesoPrecio != null && (
                          <span className="text-fg-muted"> · el precio pesa {l.pesoPrecio}%</span>
                        )}
                      </>
                    }
                  />
                )}
                {l.entregables && <Dato etiqueta="Qué hay que entregar" valor={l.entregables} />}
                {l.plazos.length > 0 && (
                  <Dato
                    etiqueta="Fechas y plazos"
                    valor={
                      <ul>
                        {l.plazos.map((x, i) => (
                          <li key={i}>
                            {x.etiqueta}: {x.fecha ? fechaCorta(x.fecha) : (x.nota ?? "sin fecha")}
                          </li>
                        ))}
                      </ul>
                    }
                  />
                )}
              </>
            )}
          </Bloque>

          {/* ── 4. Notas y archivos ── */}
          {sinPermiso > 0 && (
            <Alert variant="info" title="El cartel está adjunto y no se puede bajar">
              {sinPermiso} archivo(s) esperan el scope <code>files</code> en la app de HubSpot.
              Hay que declararlo «Opcional» en la configuración de la app y volver a autorizar la
              conexión desde Configuración → Integraciones.
            </Alert>
          )}
          {escaneados > 0 && (
            <Alert variant="warning" title="Hay carteles escaneados">
              {escaneados} archivo(s) se bajaron bien pero no tienen texto: son imágenes. La IA no
              los puede leer sin OCR. Si el detalle importa, resumilo en una nota del ticket.
            </Alert>
          )}

          <Bloque titulo={`Notas y archivos (${fila.notas.length})`}>
            {fila.notas.length === 0 ? (
              <p className="text-fg-muted">Este ticket no tiene ninguna nota.</p>
            ) : (
              <ul className="space-y-3">
                {fila.notas.map((n) => (
                  <NotaEnHilo
                    key={n.id}
                    nota={n}
                    archivos={fila.archivos.filter((a) => a.hubspotNoteId === n.id)}
                    urlTicket={url}
                  />
                ))}
              </ul>
            )}
          </Bloque>
        </div>
      )}
    </Drawer>
  );
}

// ── Una nota del hilo ──────────────────────────────────────────────────────────

function NotaEnHilo({
  nota,
  archivos,
  urlTicket,
}: {
  nota: NotaClasificada;
  archivos: ArchivoDeLaFila[];
  urlTicket: string | null;
}) {
  /* Los campos que el lector NO reconoció. Se muestran igual: es la única forma de que un
     cambio de formato del scraper se vea en vez de desaparecer. */
  const extras = nota.campos.filter(
    (c) => !["decision", "score", "confianza", "razon"].includes(c.clave),
  );

  return (
    <li className="rounded-lg border border-line bg-surface-muted px-3 py-2.5 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={nota.clase === "HUMANA" ? "default" : "info"} size="xs">
          {CLASE_LABEL[nota.clase]}
        </Badge>
        {nota.autor && <span className="text-2xs text-fg-secondary">{nota.autor}</span>}
        {nota.creadaEl && <span className="text-2xs text-fg-muted">{fechaCorta(nota.creadaEl)}</span>}
        <span
          className={`ml-auto text-2xs ${nota.adjuntos > 0 ? "text-fg-secondary" : "text-fg-muted"}`}
        >
          {etiquetaDeArchivos(nota.adjuntos)}
        </span>
      </div>

      {nota.faltantes.length > 0 && (
        <p className="text-2xs text-warn-ink">
          ⚠ Esta nota dice ser «{CLASE_LABEL[nota.clase]}» pero le faltan:{" "}
          {nota.faltantes.join(", ")}. Puede que el scraper haya cambiado de formato.
        </p>
      )}

      {nota.texto ? (
        <p className="text-xs text-fg-secondary whitespace-pre-wrap leading-relaxed">{nota.texto}</p>
      ) : (
        <p className="text-xs text-fg-muted italic">Sin texto — la nota es solo el archivo.</p>
      )}

      {nota.clase !== "HUMANA" && extras.length > 0 && (
        <div className="pt-0.5 space-y-0.5">
          {extras.map((c) => (
            <p key={c.clave} className="text-2xs text-fg-muted">
              <span className="text-fg-secondary">{c.etiqueta}:</span> {c.valor}
            </p>
          ))}
        </div>
      )}

      {archivos.length > 0 && (
        <ul className="pt-1 space-y-1">
          {archivos.map((a) => {
            const meta = ESTADO_ARCHIVO[a.estado];
            /* ⚠ Sin permiso no hay `urlHubspot`, y NO se inventa una: se cae al ticket, que
               siempre existe. Una URL de File Manager armada a mano da un 404 adentro de
               HubSpot que se lee como falta de permisos y manda a buscar donde no es. */
            const destino = a.urlHubspot ?? urlTicket;
            return (
              <li key={a.id} className="flex items-center gap-2 text-2xs">
                <Badge variant={meta.variant} size="xs" title={meta.ayuda}>
                  {meta.label}
                </Badge>
                {destino ? (
                  <a
                    href={destino}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-fg-secondary hover:text-brand truncate"
                    title={a.urlHubspot ? "Abrir el archivo en HubSpot" : "Abrir el ticket en HubSpot"}
                  >
                    {a.nombre ?? `archivo ${a.hubspotFileId}`}
                  </a>
                ) : (
                  <span className="text-fg-secondary truncate">
                    {a.nombre ?? `archivo ${a.hubspotFileId}`}
                  </span>
                )}
                {pesoLegible(a.tamanoBytes) && (
                  <span className="text-fg-muted">{pesoLegible(a.tamanoBytes)}</span>
                )}
                {a.caracteres > 0 && (
                  <span className="text-fg-muted">{numero.format(a.caracteres)} caracteres</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
