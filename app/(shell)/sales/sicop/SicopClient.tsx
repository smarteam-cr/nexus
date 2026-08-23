"use client";

/**
 * SicopClient — ANÁLISIS DE LICITACIÓN: la tabla y lo que se hace con ella.
 *
 * Reemplaza al tablero por etapa (decisión de Elías, 2026-08-23): mismo vocabulario que
 * `/clients` —`Table` con búsqueda, columnas ordenables y `Tabs` de vista— para que sea la
 * misma pantalla de siempre y no una forma nueva que haya que aprender.
 *
 * Cuatro decisiones que valen el comentario:
 *  · ORDENA POR SCORE Y CONFIANZA del scraper, en ese orden. Es lo que pidió Elías
 *    («deberían priorizar siempre»); la etapa pasó a ser una columna más.
 *  · «Sin analizar» NO se esconde nunca. Una licitación que nadie leyó todavía no está
 *    descartada: está sin mirar, y esconderla sería perder una venta por trabajo pendiente.
 *  · La vista «En juego» viene puesta y ESCONDE cosas — la línea de estado dice cuántas y las
 *    revela de un clic. Un filtro por default que no se anuncia es una mentira cómoda.
 *  · La selección múltiple existe porque analizar A FONDO cuesta ~5× una lectura normal: lo
 *    dispara una persona sobre lo que eligió, no una corrida automática sobre las 45.
 */
import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, EmptyState, Spinner, Table, Tabs, type TableColumn } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import {
  CATEGORIAS_SICOP,
  FILTRO_VACIO,
  contarOcultas,
  fechaLimiteDe,
  filtrarLicitaciones,
  montoComparable,
  type EtapaDeLaFila,
  type FilaSicop,
  type FiltroSicop,
} from "@/lib/ventas/sicop-orden";
import SicopDetalle, { ENCAJE_META, fechaCorta, numero } from "./SicopDetalle";

/** Las tres vistas gruesas. Cada una es un PRESET del filtro que ya estaba probado. */
type Vista = "enJuego" | "todas" | "descartadas";

const VISTAS: Record<Vista, (base: FiltroSicop) => FiltroSicop> = {
  enJuego: (b) => ({ ...b, soloEnJuego: true, verDescartadas: false, encajes: [] }),
  todas: (b) => ({ ...b, soloEnJuego: false, verDescartadas: true, encajes: [] }),
  /* «Descartadas» tiene que APAGAR el corte que las esconde, o mostraría cero y se leería
     como que la pantalla está rota. */
  descartadas: (b) => ({ ...b, soloEnJuego: false, verDescartadas: true, encajes: ["FUERA"] }),
};

const AYUDA_VISTA: Record<Vista, string> = {
  enJuego: "Las que siguen vivas en el pipeline y la IA no descartó.",
  todas: "Todo el pipeline, incluidas las cerradas y las descartadas.",
  descartadas: "Solo lo que la IA marcó fuera de alcance. Revisalo si algo no cuadra.",
};

function Puntaje({ valor }: { valor: number | null | undefined }) {
  if (valor == null) return <span className="text-fg-muted">—</span>;
  return <span className="tabular-nums text-fg">{valor}</span>;
}

export default function SicopClient({
  filas,
  etapas,
  soportado,
  errorHubspot,
  portalId,
  esquemaAtrasado,
  esquemaDeArchivosAtrasado,
  puedeAnalizar,
}: {
  filas: FilaSicop[];
  etapas: EtapaDeLaFila[];
  soportado: boolean;
  errorHubspot: string | null;
  portalId: string | null;
  esquemaAtrasado: boolean;
  esquemaDeArchivosAtrasado: boolean;
  puedeAnalizar: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [vista, setVista] = useState<Vista>("enJuego");
  const [categorias, setCategorias] = useState<string[]>([]);
  const [etapaId, setEtapaId] = useState("");
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set());
  const [abierta, setAbierta] = useState<string | null>(null);
  const [corriendo, setCorriendo] = useState(false);
  const [, startTransition] = useTransition();

  /* Un solo instante para toda la pasada: si cada fila llamara a `new Date()`, dos filas
     comparadas en el mismo orden podrían usar relojes distintos. */
  const hoy = useMemo(() => new Date(), []);

  const filtro = useMemo<FiltroSicop>(
    () => VISTAS[vista]({ ...FILTRO_VACIO, categorias, etapas: etapaId ? [etapaId] : [] }),
    [vista, categorias, etapaId],
  );
  const visibles = useMemo(() => filtrarLicitaciones(filas, filtro), [filas, filtro]);
  const ocultas = useMemo(() => contarOcultas(filas, filtro), [filas, filtro]);

  const conteos = useMemo(
    () => ({
      enJuego: filtrarLicitaciones(filas, VISTAS.enJuego(FILTRO_VACIO)).length,
      todas: filas.length,
      descartadas: filas.filter((f) => f.lectura?.encaje === "FUERA").length,
    }),
    [filas],
  );

  const sinLeer = filas.filter((f) => !f.lectura).length;
  const pendientes =
    sinLeer + filas.filter((f) => f.lectura && (f.movidoDespues || f.lectura.error)).length;

  const detalle = abierta ? (filas.find((f) => f.id === abierta) ?? null) : null;

  const analizar = useCallback(
    async (cuerpo: { ticketIds?: string[]; forzar?: boolean; profundo?: boolean }) => {
      setCorriendo(true);
      try {
        const { resultado } = await fetchJson<{
          resultado: {
            analizadas: number;
            intactas: number;
            fallidas: number;
            pendientes: number;
            archivos: { leidos: number; sinTexto: number; sinPermiso: number; fallidos: number };
          };
        }>("/api/sales/sicop/analizar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cuerpo),
        });
        const partes = [`${resultado.analizadas} leída(s)`];
        if (resultado.intactas) partes.push(`${resultado.intactas} sin cambios`);
        if (resultado.archivos.leidos) partes.push(`${resultado.archivos.leidos} archivo(s) leídos`);
        /* Los tres desenlaces de un archivo tienen dueños distintos y por eso se cuentan
           aparte: OCR, permiso y bug no se arreglan igual. */
        if (resultado.archivos.sinTexto) partes.push(`${resultado.archivos.sinTexto} sin texto (escaneados)`);
        if (resultado.archivos.sinPermiso) partes.push(`${resultado.archivos.sinPermiso} sin permiso`);
        if (resultado.fallidas) partes.push(`${resultado.fallidas} con error`);
        if (resultado.pendientes) partes.push(`${resultado.pendientes} para la próxima`);
        toast.success(partes.join(" · "));
        setMarcadas(new Set());
        startTransition(() => router.refresh());
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "No se pudo correr el análisis.");
      } finally {
        setCorriendo(false);
      }
    },
    [router, toast],
  );

  const alternarMarca = (id: string) =>
    setMarcadas((prev) => {
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

  // ── Columnas ─────────────────────────────────────────────────────────────────

  const columnas: TableColumn<FilaSicop>[] = [
    {
      key: "marca",
      header: "",
      /* ⚠ NUNCA `w-[1%]`. La tabla es `table-fixed`, así que el ancho se toma LITERAL: 1% de
         ~1.900px son 19px y el contenido se DESBORDA sobre la columna vecina. Con cuatro
         columnas numéricas seguidas eso pintó los cuatro encabezados encima del otro. Todas
         las tablas del repo declaran anchos concretos; esta también. */
      width: "w-12",
      render: (f) => (
        <input
          type="checkbox"
          checked={marcadas.has(f.id)}
          onChange={() => alternarMarca(f.id)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Marcar ${f.asunto}`}
          className="accent-[color:var(--brand)] align-middle"
        />
      ),
    },
    {
      key: "licitacion",
      header: "Licitación",
      sortValue: (f) => f.asunto.toLowerCase(),
      render: (f) => (
        <div className="min-w-0 max-w-xl">
          <p className="text-fg leading-snug">{f.asunto}</p>
          {f.lectura?.objeto && (
            <p className="text-2xs text-fg-muted mt-0.5 line-clamp-2">{f.lectura.objeto}</p>
          )}
          <div className="flex items-center gap-1.5 flex-wrap mt-1">
            {f.lectura ? (
              <Badge variant={ENCAJE_META[f.lectura.encaje].variant} size="xs">
                {ENCAJE_META[f.lectura.encaje].corto}
              </Badge>
            ) : (
              <Badge variant="default" size="xs" title="Todavía nadie la leyó con IA">
                Sin analizar
              </Badge>
            )}
            {f.lectura?.profundo && (
              <Badge variant="info" size="xs" title="La IA leyó el cartel, no solo el título">
                a fondo
              </Badge>
            )}
            {f.archivos.length > 0 && (
              <span className="text-2xs text-fg-muted" title="Archivos colgados del ticket">
                {f.archivos.length} archivo{f.archivos.length > 1 ? "s" : ""}
              </span>
            )}
            {f.notasIncompletas > 0 && (
              <span
                className="text-2xs text-warn-ink"
                title="Una nota del scraper no trae todos sus campos: puede haber cambiado de formato"
              >
                nota incompleta
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "score",
      header: "Score",
      align: "right",
      width: "w-24",
      headerHint: "Lo que puntuó el filtro automático de SICOP, de 0 a 100.",
      sortValue: (f) => f.filtro?.score ?? null,
      render: (f) => <Puntaje valor={f.filtro?.score} />,
    },
    {
      key: "confianza",
      header: "Confianza",
      align: "right",
      width: "w-28",
      headerHint: "Cuánta seguridad declaró el filtro sobre su propio puntaje.",
      sortValue: (f) => f.filtro?.confianza ?? null,
      render: (f) => <Puntaje valor={f.filtro?.confianza} />,
    },
    {
      key: "encaje",
      header: "Encaje",
      align: "right",
      width: "w-24",
      hideOnMobile: true,
      headerHint: "Lo que puntuó la IA de Nexus leyendo el ticket. Es otra opinión, no la misma.",
      sortValue: (f) => f.lectura?.puntajeEncaje ?? null,
      render: (f) => <Puntaje valor={f.lectura?.puntajeEncaje} />,
    },
    {
      key: "ganable",
      header: "Ganable",
      align: "right",
      width: "w-24",
      hideOnMobile: true,
      headerHint: "Probabilidad de ganarla mirando requisitos y criterio de evaluación.",
      sortValue: (f) => f.lectura?.probabilidad ?? null,
      render: (f) => <Puntaje valor={f.lectura?.probabilidad} />,
    },
    {
      key: "monto",
      header: "Monto",
      align: "right",
      width: "w-32",
      hideOnMobile: true,
      headerHint: "Estimado. Los colones se pasan a dólares SOLO para poder comparar.",
      sortValue: (f) => montoComparable(f),
      render: (f) => {
        const m = f.lectura?.monto ?? f.datosDelProcedimiento?.montoEstimado ?? null;
        if (m == null) return <span className="text-fg-muted">—</span>;
        return (
          <span className="tabular-nums text-fg-secondary whitespace-nowrap">
            {numero.format(m)} {f.lectura?.moneda ?? ""}
          </span>
        );
      },
    },
    {
      key: "cierre",
      header: "Cierre",
      width: "w-28",
      hideOnMobile: true,
      headerHint: "El plazo FUTURO más cercano. Lo ya vencido no cuenta.",
      sortValue: (f) => fechaLimiteDe(f, hoy),
      render: (f) => {
        const l = fechaLimiteDe(f, hoy);
        return l ? (
          <span className="text-fg-secondary whitespace-nowrap">{fechaCorta(l)}</span>
        ) : (
          <span className="text-fg-muted">—</span>
        );
      },
    },
    {
      key: "etapa",
      header: "Etapa",
      width: "w-48",
      hideOnMobile: true,
      sortValue: (f) => f.etapa.orden,
      render: (f) => (
        <span className={f.etapa.cerrada ? "text-fg-muted" : "text-fg-secondary"}>
          {f.etapa.label}
        </span>
      ),
    },
  ];

  const todasMarcadas = visibles.length > 0 && visibles.every((f) => marcadas.has(f.id));

  return (
    <div className="space-y-4">
      {esquemaAtrasado && (
        <Alert variant="warning" title="La lectura de IA no está disponible">
          Falta aplicar <code>scripts/sql/2026-08-23-sicop-adjuntos.sql</code>, o el servidor
          está corriendo con un cliente de Prisma anterior al modelo —después de aplicar la
          migración hay que correr <code>npx prisma generate</code> y{" "}
          <strong>reiniciar el server</strong>: el cliente de Prisma no entra por HMR—. La
          lista de licitaciones sigue funcionando igual.
        </Alert>
      )}
      {esquemaDeArchivosAtrasado && !esquemaAtrasado && (
        <Alert variant="warning" title="Los archivos no están disponibles">
          No se pueden registrar ni leer los archivos del cartel: falta aplicar{" "}
          <code>scripts/sql/2026-08-23-sicop-adjuntos.sql</code>, o el server quedó con un
          cliente de Prisma viejo (<code>npx prisma generate</code> y reiniciar).
        </Alert>
      )}

      <Table
        columns={columnas}
        rows={visibles}
        rowKey={(f) => f.id}
        onRowClick={(f) => setAbierta(f.id)}
        initialSort={{ key: "score", dir: "desc" }}
        search={{
          placeholder: "Buscar por objeto, institución o nro de procedimiento…",
          getText: (f) =>
            [f.asunto, f.procedimiento, f.lectura?.objeto, f.lectura?.institucion, f.detalle]
              .filter(Boolean)
              .join(" · "),
        }}
        filters={
          <>
            <Tabs
              aria-label="Vista de licitaciones"
              variant="pill"
              value={vista}
              onChange={(k) => setVista(k as Vista)}
              items={(["enJuego", "todas", "descartadas"] as Vista[]).map((k) => ({
                key: k,
                label: k === "enJuego" ? "En juego" : k === "todas" ? "Todas" : "Descartadas",
                count: conteos[k],
                title: AYUDA_VISTA[k],
              }))}
            />
            <select
              value={etapaId}
              onChange={(e) => setEtapaId(e.target.value)}
              className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-fg"
              aria-label="Etapa"
            >
              <option value="">Todas las etapas</option>
              {etapas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
            <select
              value={categorias[0] ?? ""}
              onChange={(e) => setCategorias(e.target.value ? [e.target.value] : [])}
              className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-fg"
              aria-label="Servicio"
            >
              <option value="">Todos los servicios</option>
              {CATEGORIAS_SICOP.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
            {visibles.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  setMarcadas(todasMarcadas ? new Set() : new Set(visibles.map((f) => f.id)))
                }
                className="text-xs text-fg-muted hover:text-fg underline underline-offset-2"
              >
                {todasMarcadas ? "Desmarcar todo" : "Marcar todo"}
              </button>
            )}
          </>
        }
        action={
          puedeAnalizar ? (
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={corriendo || esquemaAtrasado}
                onClick={() => analizar({ ticketIds: [...marcadas] })}
                title="Lee el título y las notas. No baja archivos."
              >
                {corriendo ? <Spinner size="xs" /> : null}
                {marcadas.size > 0 ? `Analizar (${marcadas.size})` : `Analizar pendientes (${pendientes})`}
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={corriendo || esquemaAtrasado || marcadas.size === 0}
                onClick={() => analizar({ ticketIds: [...marcadas], profundo: true })}
                title="Baja los archivos del cartel, les saca el texto y se lo pasa a la IA. Cuesta ~5× más."
              >
                A fondo ({marcadas.size})
              </Button>
            </div>
          ) : undefined
        }
        empty={
          <EmptyState
            variant="dashed"
            title="Ninguna licitación pasa estos filtros"
            description="Probá la vista «Todas», o quitá el filtro de etapa o servicio."
          />
        }
      />

      {/* ── Qué se está escondiendo ── */}
      <p className="text-xs text-fg-muted">
        Mostrando <span className="text-fg-secondary tabular-nums">{visibles.length}</span> de{" "}
        <span className="tabular-nums">{filas.length}</span>
        {ocultas.porCerrada > 0 && (
          <>
            {" · "}
            <button
              type="button"
              onClick={() => setVista("todas")}
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
              onClick={() => setVista("descartadas")}
              className="underline underline-offset-2 hover:text-fg"
            >
              {ocultas.porDescartada} descartadas por la IA
            </button>
          </>
        )}
        {sinLeer > 0 && <> · {sinLeer} sin analizar</>}
      </p>

      <SicopDetalle
        fila={detalle}
        portalId={portalId}
        puedeAnalizar={puedeAnalizar}
        corriendo={corriendo}
        onCerrar={() => setAbierta(null)}
        onAnalizar={(profundo) => analizar({ ticketIds: [detalle!.id], forzar: true, profundo })}
      />
    </div>
  );
}
