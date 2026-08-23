"use client";

/**
 * SicopClient — el tablero de licitaciones: filtrar, ordenar y leer la ficha de cada una.
 *
 * Decisiones que valen el comentario:
 *  · Los CINCO criterios de prioridad son botones, no una regla del código (decisión de
 *    Elías, 2026-08-23). «Etapa» agrupa como el proceso de HubSpot; los otros cuatro
 *    aplanan la lista en un ranking.
 *  · Dos cortes vienen encendidos —esconder lo que ya cerró y lo que la IA marcó FUERA—
 *    porque 41 de las 45 licitaciones de hoy caen en uno de los dos. Pero la línea de
 *    estado DICE cuántas está escondiendo y las revela de un clic: un filtro por default
 *    que no se anuncia es una mentira cómoda.
 *  · «Sin analizar» NO se esconde nunca. Una licitación que nadie leyó todavía no está
 *    descartada: está sin mirar, y esconderla sería perder una venta por trabajo pendiente.
 *  · El presupuesto del CRM se muestra sin moneda y sin redondear (el campo mezcla monedas
 *    y magnitudes cargadas a mano); el monto que estima la IA sí lleva su moneda cuando la
 *    pudo leer del texto.
 */
import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, EmptyState, Spinner } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import { hubspotTicketUrl } from "@/lib/hubspot/urls";
import {
  CATEGORIAS_SICOP,
  FILTRO_VACIO,
  ORDENES_SICOP,
  contarOcultas,
  fechaLimiteDe,
  filtrarLicitaciones,
  labelDeCategoria,
  montoComparable,
  ordenarLicitaciones,
  type EncajeSicop,
  type EtapaDeLaFila,
  type FilaSicop,
  type FiltroSicop,
  type LecturaSicop,
  type OrdenSicop,
} from "@/lib/ventas/sicop-orden";

const numero = new Intl.NumberFormat("es-CR", { maximumFractionDigits: 2 });

const ENCAJE_META: Record<
  EncajeSicop,
  { corto: string; largo: string; variant: "success" | "warning" | "default" }
> = {
  DENTRO: { corto: "Dentro", largo: "Es de lo que vendemos", variant: "success" },
  DUDOSO: { corto: "Dudoso", largo: "Hay que mirarlo", variant: "warning" },
  FUERA: { corto: "Fuera", largo: "Fuera de alcance", variant: "default" },
};

const ENCAJES: EncajeSicop[] = ["DENTRO", "DUDOSO", "FUERA"];

function fecha(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

// ── Átomos ─────────────────────────────────────────────────────────────────────

function Chip({
  activo,
  onClick,
  children,
  title,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={activo}
      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
        activo
          ? "border-brand/30 bg-brand/10 text-brand font-medium"
          : "border-line bg-surface text-fg-muted hover:text-fg hover:bg-surface-hover"
      }`}
    >
      {children}
    </button>
  );
}

function Puntaje({ valor, etiqueta }: { valor: number | null; etiqueta: string }) {
  return (
    <div className="text-right leading-tight">
      <p className="text-sm font-semibold text-fg tabular-nums">{valor == null ? "—" : valor}</p>
      <p className="text-2xs uppercase tracking-widest text-fg-muted">{etiqueta}</p>
    </div>
  );
}

// ── Pantalla ───────────────────────────────────────────────────────────────────

export default function SicopClient({
  filas,
  etapas,
  soportado,
  errorHubspot,
  portalId,
  tablaAusente,
  puedeAnalizar,
}: {
  filas: FilaSicop[];
  etapas: EtapaDeLaFila[];
  soportado: boolean;
  errorHubspot: string | null;
  portalId: string | null;
  tablaAusente: boolean;
  puedeAnalizar: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [orden, setOrden] = useState<OrdenSicop>("etapa");
  const [filtro, setFiltro] = useState<FiltroSicop>(FILTRO_VACIO);
  const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set());
  const [plegadas, setPlegadas] = useState<Set<string>>(
    () => new Set(etapas.filter((e) => e.cerrada).map((e) => e.id)),
  );
  const [analizando, setAnalizando] = useState(false);
  const [, startTransition] = useTransition();

  /* Una sola instante para toda la pasada: si cada fila llamara a `new Date()`, dos filas
     comparadas en el mismo orden podrían usar relojes distintos. */
  const hoy = useMemo(() => new Date(), []);

  const visibles = useMemo(
    () => ordenarLicitaciones(filtrarLicitaciones(filas, filtro), orden, hoy),
    [filas, filtro, orden, hoy],
  );
  const ocultas = useMemo(() => contarOcultas(filas, filtro), [filas, filtro]);

  const sinLeer = filas.filter((f) => !f.lectura).length;
  const movidas = filas.filter((f) => f.lectura && f.movidoDespues).length;
  const conError = filas.filter((f) => f.lectura?.error).length;
  const pendientes = sinLeer + movidas + conError;

  const analizar = useCallback(
    async (cuerpo: { ticketId?: string; forzar?: boolean }) => {
      setAnalizando(true);
      try {
        const { resultado } = await fetchJson<{
          resultado: { analizadas: number; intactas: number; fallidas: number; pendientes: number };
        }>("/api/sales/sicop/analizar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cuerpo),
        });
        const partes = [`${resultado.analizadas} leída(s)`];
        if (resultado.intactas) partes.push(`${resultado.intactas} sin cambios`);
        if (resultado.fallidas) partes.push(`${resultado.fallidas} con error`);
        if (resultado.pendientes) partes.push(`${resultado.pendientes} quedaron para la próxima`);
        toast.success(partes.join(" · "));
        startTransition(() => router.refresh());
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "No se pudo correr el análisis.");
      } finally {
        setAnalizando(false);
      }
    },
    [router, toast],
  );

  const alternarFila = (id: string) =>
    setAbiertas((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  // ── Cortes duros ─────────────────────────────────────────────────────────────

  if (!soportado) {
    return (
      <Alert variant="warning" title="Falta el permiso de tickets en HubSpot">
        La app conectada no tiene autorizado el scope <code>crm.objects.tickets.read</code>, así
        que el pipeline «Gobiernos» no se puede leer. Se resuelve re-autorizando la app desde
        Configuración → Integraciones.
      </Alert>
    );
  }
  if (errorHubspot) {
    return (
      <Alert variant="danger" title="No se pudo leer el pipeline «Gobiernos»">
        {errorHubspot}
      </Alert>
    );
  }
  if (etapas.length === 0) {
    return (
      <EmptyState
        variant="dashed"
        title="El pipeline «Gobiernos» no devolvió etapas"
        description="Puede que lo hayan renombrado o archivado en HubSpot."
      />
    );
  }

  const porEtapa = etapas.map((e) => ({
    etapa: e,
    filas: visibles.filter((f) => f.etapa.id === e.id),
  }));

  return (
    <div className="space-y-4">
      {tablaAusente && (
        <Alert variant="warning" title="Falta aplicar la migración de la lectura">
          La tabla <code>SicopLectura</code> todavía no existe, así que no hay dónde guardar lo
          que la IA lee. Corré <code>scripts/sql/2026-08-23-sicop-lectura.sql</code>. Mientras
          tanto la pantalla muestra las licitaciones sin interpretar.
        </Alert>
      )}

      {/* ── Orden + búsqueda + acción ── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-2xs uppercase tracking-widest text-fg-muted mr-1">Ordenar por</span>
          {ORDENES_SICOP.map((o) => (
            <Chip key={o.key} activo={orden === o.key} onClick={() => setOrden(o.key)} title={o.ayuda}>
              {o.label}
            </Chip>
          ))}
        </div>

        <div className="flex-1 lg:min-w-[14rem]">
          <input
            type="search"
            value={filtro.texto}
            onChange={(e) => setFiltro((f) => ({ ...f, texto: e.target.value }))}
            placeholder="Buscar por objeto, institución o nro de procedimiento…"
            className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>

        {puedeAnalizar && (
          <Button
            variant={pendientes > 0 ? "primary" : "secondary"}
            size="sm"
            disabled={analizando || tablaAusente}
            onClick={() => analizar({})}
            title={
              pendientes > 0
                ? "Lee con IA las licitaciones nuevas y las que cambiaron desde la última corrida"
                : "No hay nada nuevo que leer"
            }
          >
            {analizando ? <Spinner size="xs" /> : null}
            {analizando ? "Leyendo…" : pendientes > 0 ? `Analizar (${pendientes})` : "Todo leído"}
          </Button>
        )}
      </div>

      {/* ── Filtros ── */}
      <div className="rounded-xl border border-line bg-surface-muted px-4 py-3 space-y-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-2xs uppercase tracking-widest text-fg-muted mr-1 w-16">Encaje</span>
          {ENCAJES.map((e) => (
            <Chip
              key={e}
              activo={filtro.encajes.includes(e)}
              title={ENCAJE_META[e].largo}
              onClick={() =>
                setFiltro((f) => ({
                  ...f,
                  encajes: f.encajes.includes(e)
                    ? f.encajes.filter((x) => x !== e)
                    : [...f.encajes, e],
                  // Filtrar POR «Fuera» y a la vez esconder lo que está fuera no muestra
                  // nada y se lee como que la pantalla está rota.
                  verDescartadas: e === "FUERA" ? true : f.verDescartadas,
                }))
              }
            >
              {ENCAJE_META[e].corto}
            </Chip>
          ))}
        </div>

        <div className="flex items-start gap-1.5 flex-wrap">
          <span className="text-2xs uppercase tracking-widest text-fg-muted mr-1 w-16 pt-1.5">
            Servicio
          </span>
          {CATEGORIAS_SICOP.map((c) => (
            <Chip
              key={c.key}
              activo={filtro.categorias.includes(c.key)}
              onClick={() =>
                setFiltro((f) => ({
                  ...f,
                  categorias: f.categorias.includes(c.key)
                    ? f.categorias.filter((x) => x !== c.key)
                    : [...f.categorias, c.key],
                }))
              }
            >
              {c.label}
            </Chip>
          ))}
        </div>

        <div className="flex items-center gap-3 flex-wrap pt-0.5">
          <label className="flex items-center gap-1.5 text-xs text-fg-secondary">
            <input
              type="checkbox"
              checked={filtro.soloEnJuego}
              onChange={(e) => setFiltro((f) => ({ ...f, soloEnJuego: e.target.checked }))}
              className="accent-[color:var(--brand)]"
            />
            Solo lo que sigue en juego
          </label>
          <label className="flex items-center gap-1.5 text-xs text-fg-secondary">
            <input
              type="checkbox"
              checked={filtro.verDescartadas}
              onChange={(e) => setFiltro((f) => ({ ...f, verDescartadas: e.target.checked }))}
              className="accent-[color:var(--brand)]"
            />
            Ver lo que la IA descartó
          </label>
          <select
            value={filtro.etapas[0] ?? ""}
            onChange={(e) =>
              setFiltro((f) => ({ ...f, etapas: e.target.value ? [e.target.value] : [] }))
            }
            className="rounded-lg border border-line bg-surface px-2 py-1 text-xs text-fg"
          >
            <option value="">Todas las etapas</option>
            {etapas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
          {(filtro.texto.trim().length > 0 ||
            filtro.categorias.length > 0 ||
            filtro.encajes.length > 0 ||
            filtro.etapas.length > 0) && (
            <button
              type="button"
              onClick={() => setFiltro((f) => ({ ...FILTRO_VACIO, soloEnJuego: f.soloEnJuego }))}
              className="text-xs text-fg-muted hover:text-fg underline underline-offset-2"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* ── Qué se está escondiendo ── */}
      <p className="text-xs text-fg-muted">
        Mostrando <span className="text-fg-secondary tabular-nums">{visibles.length}</span> de{" "}
        <span className="tabular-nums">{filas.length}</span>
        {ocultas.porCerrada > 0 && (
          <>
            {" · "}
            <button
              type="button"
              onClick={() => setFiltro((f) => ({ ...f, soloEnJuego: false }))}
              className="underline underline-offset-2 hover:text-fg"
            >
              {ocultas.porCerrada} ya cerradas
            </button>
          </>
        )}
        {ocultas.porDescartada > 0 && (
          <>
            {" · "}
            <button
              type="button"
              onClick={() => setFiltro((f) => ({ ...f, verDescartadas: true }))}
              className="underline underline-offset-2 hover:text-fg"
            >
              {ocultas.porDescartada} descartadas por la IA
            </button>
          </>
        )}
        {sinLeer > 0 && <> · {sinLeer} sin analizar</>}
      </p>

      {/* ── La lista ── */}
      {visibles.length === 0 ? (
        <EmptyState
          variant="dashed"
          title="Ninguna licitación pasa estos filtros"
          description="Probá quitar algún corte, o mostrar las que ya cerraron."
        />
      ) : orden === "etapa" ? (
        <div className="space-y-3">
          {porEtapa.map(({ etapa, filas: suyas }) => (
            <SeccionEtapa
              key={etapa.id}
              etapa={etapa}
              filas={suyas}
              portalId={portalId}
              plegada={plegadas.has(etapa.id)}
              onAlternar={() =>
                setPlegadas((prev) => {
                  const s = new Set(prev);
                  if (s.has(etapa.id)) s.delete(etapa.id);
                  else s.add(etapa.id);
                  return s;
                })
              }
              abiertas={abiertas}
              onAlternarFila={alternarFila}
              hoy={hoy}
              puedeAnalizar={puedeAnalizar && !tablaAusente}
              analizando={analizando}
              onReleer={(id) => analizar({ ticketId: id, forzar: true })}
            />
          ))}
        </div>
      ) : (
        <ul className="rounded-xl border border-line bg-surface divide-y divide-line overflow-hidden">
          {visibles.map((f) => (
            <FilaLicitacion
              key={f.id}
              fila={f}
              portalId={portalId}
              mostrarEtapa
              abierta={abiertas.has(f.id)}
              onAlternar={() => alternarFila(f.id)}
              hoy={hoy}
              puedeAnalizar={puedeAnalizar && !tablaAusente}
              analizando={analizando}
              onReleer={() => analizar({ ticketId: f.id, forzar: true })}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Sección por etapa ──────────────────────────────────────────────────────────

function SeccionEtapa({
  etapa,
  filas,
  portalId,
  plegada,
  onAlternar,
  abiertas,
  onAlternarFila,
  hoy,
  puedeAnalizar,
  analizando,
  onReleer,
}: {
  etapa: EtapaDeLaFila;
  filas: FilaSicop[];
  portalId: string | null;
  plegada: boolean;
  onAlternar: () => void;
  abiertas: Set<string>;
  onAlternarFila: (id: string) => void;
  hoy: Date;
  puedeAnalizar: boolean;
  analizando: boolean;
  onReleer: (id: string) => void;
}) {
  const vacia = filas.length === 0;
  const desplegada = !plegada && !vacia;

  return (
    <section className="rounded-xl border border-line bg-surface overflow-hidden">
      <button
        type="button"
        onClick={onAlternar}
        disabled={vacia}
        className={`w-full flex items-center gap-2.5 px-4 py-3 text-left transition-colors ${
          vacia ? "cursor-default" : "hover:bg-surface-hover"
        }`}
      >
        <svg
          className={`w-3.5 h-3.5 flex-shrink-0 text-fg-muted transition-transform ${
            desplegada ? "rotate-90" : ""
          } ${vacia ? "opacity-0" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className={`text-sm font-medium truncate ${vacia ? "text-fg-muted" : "text-fg"}`}>
          {etapa.label}
        </span>
        {etapa.cerrada && (
          <Badge variant="default" size="xs">
            cierra
          </Badge>
        )}
        <span className="ml-auto text-xs tabular-nums text-fg-muted flex-shrink-0">
          {filas.length}
        </span>
      </button>

      {desplegada && (
        <ul className="border-t border-line divide-y divide-line">
          {filas.map((f) => (
            <FilaLicitacion
              key={f.id}
              fila={f}
              portalId={portalId}
              abierta={abiertas.has(f.id)}
              onAlternar={() => onAlternarFila(f.id)}
              hoy={hoy}
              puedeAnalizar={puedeAnalizar}
              analizando={analizando}
              onReleer={() => onReleer(f.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Fila ───────────────────────────────────────────────────────────────────────

function FilaLicitacion({
  fila,
  portalId,
  mostrarEtapa = false,
  abierta,
  onAlternar,
  hoy,
  puedeAnalizar,
  analizando,
  onReleer,
}: {
  fila: FilaSicop;
  portalId: string | null;
  mostrarEtapa?: boolean;
  abierta: boolean;
  onAlternar: () => void;
  hoy: Date;
  puedeAnalizar: boolean;
  analizando: boolean;
  onReleer: () => void;
}) {
  const url = hubspotTicketUrl(portalId, fila.id);
  const l = fila.lectura;
  const limite = fechaLimiteDe(fila, hoy);
  const usd = montoComparable(fila);

  const meta: string[] = [];
  if (l?.institucion) meta.push(l.institucion);
  if (fila.tipoContratacion) meta.push(fila.tipoContratacion);
  if (l?.monto != null) meta.push(`${numero.format(l.monto)} ${l.moneda ?? "(moneda sin declarar)"}`);
  else if (fila.presupuestoCrm != null) meta.push(`Presupuesto CRM ${numero.format(fila.presupuestoCrm)}`);
  if (fila.responsable) meta.push(fila.responsable);

  const bloqueos = (l?.bloqueantes ?? []).filter((b) => b.severidad === "BLOQUEA").length;

  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {l ? (
              <Badge variant={ENCAJE_META[l.encaje].variant} size="xs" title={ENCAJE_META[l.encaje].largo}>
                {ENCAJE_META[l.encaje].corto}
              </Badge>
            ) : (
              <Badge variant="default" size="xs" title="Todavía nadie la leyó con IA">
                Sin analizar
              </Badge>
            )}
            {mostrarEtapa && (
              <span className="text-2xs text-fg-muted uppercase tracking-widest">{fila.etapa.label}</span>
            )}
            {bloqueos > 0 && (
              <Badge variant="destructive" size="xs" title="Requisitos que hoy no cumplimos">
                {bloqueos} bloqueante{bloqueos > 1 ? "s" : ""}
              </Badge>
            )}
            {l?.pesoPrecio === 100 && (
              <Badge variant="warning" size="xs" title="Adjudica solo por precio">
                100% precio
              </Badge>
            )}
            {(l?.adjuntosSinLeer ?? 0) > 0 && (
              <Badge
                variant="info"
                size="xs"
                title="El cartel está subido a HubSpot como archivo. La IA no lo puede abrir: lo que leyó salió solo del texto."
              >
                {l!.adjuntosSinLeer} sin leer
              </Badge>
            )}
            {limite && (
              <span className="text-2xs text-fg-muted" title="El plazo futuro más cercano">
                cierra {fecha(limite)}
              </span>
            )}
          </div>

          <p className="text-sm text-fg leading-snug mt-1">
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-brand transition-colors"
                title="Abrir el ticket en HubSpot"
              >
                {fila.asunto}
              </a>
            ) : (
              fila.asunto
            )}
          </p>

          {l?.objeto && <p className="text-xs text-fg-secondary mt-1 leading-relaxed">{l.objeto}</p>}
          {fila.procedimiento && (
            <p className="text-2xs font-mono text-fg-muted mt-0.5 truncate">{fila.procedimiento}</p>
          )}
          {meta.length > 0 && <p className="text-xs text-fg-muted mt-1">{meta.join(" · ")}</p>}

          {(l?.categorias.length ?? 0) > 0 && (
            <div className="flex items-center gap-1 flex-wrap mt-1.5">
              {l!.categorias.map((c) => (
                <span
                  key={c}
                  className="rounded-full border border-line px-2 py-0.5 text-2xs text-fg-muted"
                >
                  {labelDeCategoria(c)}
                </span>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={onAlternar}
            className="mt-2 text-2xs text-fg-muted hover:text-fg underline underline-offset-2"
          >
            {abierta ? "Ocultar la ficha" : "Ver la ficha completa"}
          </button>
        </div>

        <div className="flex-shrink-0 flex items-start gap-4">
          <Puntaje valor={l?.puntajeEncaje ?? null} etiqueta="Encaje" />
          <Puntaje valor={l?.probabilidad ?? null} etiqueta="Ganable" />
        </div>
      </div>

      {abierta && (
        <FichaDeLectura
          fila={fila}
          lectura={l}
          usd={usd}
          puedeAnalizar={puedeAnalizar}
          analizando={analizando}
          onReleer={onReleer}
        />
      )}
    </li>
  );
}

// ── La ficha ───────────────────────────────────────────────────────────────────

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-2xs uppercase tracking-widest text-fg-muted mb-1">{titulo}</p>
      <div className="text-xs text-fg-secondary leading-relaxed">{children}</div>
    </div>
  );
}

function FichaDeLectura({
  fila,
  lectura,
  usd,
  puedeAnalizar,
  analizando,
  onReleer,
}: {
  fila: FilaSicop;
  lectura: LecturaSicop | null;
  usd: number | null;
  puedeAnalizar: boolean;
  analizando: boolean;
  onReleer: () => void;
}) {
  return (
    <div className="mt-3 rounded-lg border border-line bg-surface-muted px-4 py-3 space-y-3">
      {!lectura && (
        <p className="text-xs text-fg-secondary">
          Esta licitación todavía no se leyó con IA. Apretá «Analizar» arriba y va a entrar en la
          próxima corrida.
        </p>
      )}

      {lectura?.error && (
        <Alert variant="danger" title="El análisis falló">
          {lectura.error}
        </Alert>
      )}

      {lectura && lectura.adjuntosSinLeer > 0 && (
        <Alert variant="info" title="El cartel está adjunto y la IA no lo leyó">
          Hay {lectura.adjuntosSinLeer} archivo(s) colgados de este ticket —casi seguro el
          cartel— que la lectura no puede abrir.{" "}
          {lectura.notasLeidas === 0
            ? "Y no hay ninguna nota con texto: todo lo de abajo salió del título."
            : "Lo de abajo salió solo del texto de las notas."}{" "}
          Si hace falta el detalle, resumilo en una nota del ticket y volvé a leer.
        </Alert>
      )}

      {lectura && !lectura.error && (
        <>
          {lectura.encajeRazon && <Bloque titulo="Por qué encaja (o no)">{lectura.encajeRazon}</Bloque>}
          {lectura.probabilidadRazon && (
            <Bloque titulo="Qué tan ganable se ve">{lectura.probabilidadRazon}</Bloque>
          )}

          {lectura.bloqueantes.length > 0 && (
            <Bloque titulo="Lo que nos bloquea">
              <ul className="space-y-1.5">
                {lectura.bloqueantes.map((b, i) => (
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
            </Bloque>
          )}

          {lectura.evaluacion && (
            <Bloque titulo="Cómo se evalúa">
              {lectura.evaluacion}
              {lectura.pesoPrecio != null && (
                <span className="text-fg-muted"> · el precio pesa {lectura.pesoPrecio}%</span>
              )}
            </Bloque>
          )}

          {lectura.entregables && <Bloque titulo="Qué hay que entregar">{lectura.entregables}</Bloque>}

          {lectura.plazos.length > 0 && (
            <Bloque titulo="Fechas y plazos">
              <ul className="space-y-0.5">
                {lectura.plazos.map((p, i) => (
                  <li key={i}>
                    <span className="text-fg">{p.etiqueta}:</span>{" "}
                    {p.fecha ? fecha(p.fecha) : (p.nota ?? "sin fecha")}
                    {p.fecha && p.nota ? <span className="text-fg-muted"> — {p.nota}</span> : null}
                  </li>
                ))}
              </ul>
            </Bloque>
          )}

          {fila.motivoPerdida && <Bloque titulo="Motivo de pérdida (CRM)">{fila.motivoPerdida}</Bloque>}
        </>
      )}

      {/* ── De dónde salió esto ── */}
      <div className="flex items-center justify-between gap-3 pt-1 border-t border-line flex-wrap">
        <p className="text-2xs text-fg-muted">
          {lectura ? (
            <>
              Leído {fecha(lectura.analizadoEl)}
              {lectura.modelo ? ` con ${lectura.modelo}` : ""}
              {` · ${lectura.notasLeidas} nota(s) con texto`}
              {lectura.adjuntosSinLeer > 0 && ` · ${lectura.adjuntosSinLeer} archivo(s) sin leer`}
              {lectura.fuenteTruncada && " · fuente recortada por tamaño"}
              {lectura.confianza != null && ` · información disponible ${lectura.confianza}/100`}
              {usd != null && ` · ~US$${numero.format(Math.round(usd))} para comparar`}
              {fila.movidoDespues && " · el ticket se movió después de leerlo"}
            </>
          ) : (
            "Sin lectura guardada."
          )}
        </p>
        {puedeAnalizar && (
          <button
            type="button"
            disabled={analizando}
            onClick={onReleer}
            className="text-2xs text-fg-muted hover:text-fg underline underline-offset-2 disabled:opacity-50"
          >
            Volver a leer esta
          </button>
        )}
      </div>
    </div>
  );
}
