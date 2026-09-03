"use client";

/**
 * components/cobranza/DiferenciasOdoo.tsx
 *
 * Lo que no cuadra entre Nexus y Odoo, ordenado por plata, **con su salida en cada línea**.
 *
 * ── POR QUÉ NO REUSA `InconsistenciasPanel` ─────────────────────────────────────
 * Se intentó, y era la decisión escrita en el plan. No sobrevivió al contacto con el uso: ese
 * panel no admite acciones por línea, así que «marcar como está bien así» quedó como un
 * formulario suelto abajo de todo, con **un desplegable de códigos** (`ODOO-SIN-CUENTA`,
 * `ODOO-MONEDA`) separado de las líneas sobre las que actuaba. Nadie podía saber qué hacía.
 *
 * Reusar un componente no vale un control que la gente no entiende. Acá la acción vive **en la
 * línea**, con su nombre y con lo que significa aceptarla escrito al lado del botón.
 *
 * ── Y CADA LÍNEA DICE CÓMO SE CIERRA ────────────────────────────────────────────
 * En qué sistema se arregla —Odoo, Nexus, o preguntando— y los pasos, en orden. Una lista de
 * diferencias sin salida se lee, se asiente, y no se cierra nunca.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, EmptyState, Input, Spinner } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import type { DiferenciaOdoo, DondeSeArregla } from "@/lib/cobranza/odoo/diferencias";

interface Aceptada {
  clave: string;
  motivo: string;
  aceptadaPor: string;
  aceptadaEn: string;
}
interface Respuesta {
  inconsistencias: DiferenciaOdoo[];
  aceptadas: Aceptada[];
  medido: { cobros: number; facturas: number; cuentasSinVinculo: number; cuentasTotales: number };
}

/** Dónde se arregla, en palabras de quien lo va a hacer. */
const DONDE: Record<DondeSeArregla, { label: string; chip: string; pie: string }> = {
  ODOO: {
    label: "Se arregla en Odoo",
    chip: "text-violet-600 bg-violet-500/10 border-violet-500/30",
    pie: "Al día siguiente el sync trae el cambio y la línea desaparece sola.",
  },
  /* ⚠ Su pie dice lo contrario que el de ODOO a propósito: acá NO hay sync que cierre la
     línea. Si dijera lo mismo, alguien anularía la factura en Mercury y esperaría para siempre
     a que la lista se limpie sola. */
  MERCURY: {
    label: "Se arregla fuera de Odoo",
    chip: "text-cyan-600 bg-cyan-500/10 border-cyan-500/30",
    pie: "Ningún sync ve esta plataforma: hay que volver acá y marcarla resuelta a mano.",
  },
  NEXUS: {
    label: "Se arregla en Nexus",
    chip: "text-brand bg-brand/10 border-brand/30",
    pie: "El cambio se ve en la próxima carga de esta pantalla.",
  },
  PREGUNTANDO: {
    label: "Falta un dato de negocio",
    chip: "text-amber-600 bg-amber-500/10 border-amber-500/30",
    pie: "Esto no se resuelve tecleando: alguien tiene que responder una pregunta.",
  },
};

const SEV: Record<string, string> = {
  ALTA: "text-red-600 bg-red-500/10 border-red-500/30",
  MEDIA: "text-amber-600 bg-amber-500/10 border-amber-500/30",
  BAJA: "text-fg-muted bg-surface-muted border-line",
};

const miles = (n: number) => n.toLocaleString("es-CR", { maximumFractionDigits: 0 });

export default function DiferenciasOdoo({ onIrAEmparejar }: { onIrAEmparejar?: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [verCerradas, setVerCerradas] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setData(await fetchJson<Respuesta>("/api/cobranza/odoo/diferencias"));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudieron cargar las diferencias.");
    } finally {
      setCargando(false);
    }
  }, [toast]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const enviar = useCallback(
    async (body: Record<string, unknown>, clave: string, exito: string) => {
      setGuardando(clave);
      try {
        await fetchJson("/api/cobranza/odoo/diferencias", { method: "POST", body: JSON.stringify(body) });
        toast.success(exito);
        await cargar();
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
      } finally {
        setGuardando(null);
      }
    },
    [cargar, toast],
  );

  /* El titular NO suma las líneas marcadas `yaContadoEn`: son subconjuntos de otra y contarlas
     daría una cifra que no existe. Y no se mezclan monedas. */
  const enJuego = useMemo(
    () =>
      (data?.inconsistencias ?? [])
        .filter((i) => !i.yaContadoEn && !i.aceptada)
        .reduce((a, i) => a + (i.montoEnJuego ?? 0), 0),
    [data],
  );
  const abiertas = useMemo(() => (data?.inconsistencias ?? []).filter((i) => !i.aceptada), [data]);
  const cerradas = useMemo(() => (data?.inconsistencias ?? []).filter((i) => i.aceptada), [data]);

  if (cargando && !data) {
    return (
      <div className="flex items-center gap-3 py-10 text-sm text-fg-muted">
        <Spinner /> Cruzando cobros con facturas…
      </div>
    );
  }
  if (!data) return null;

  const aceptadaDe = new Map(data.aceptadas.map((a) => [a.clave, a]));

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-surface px-4 py-3 text-sm">
        <p className="text-fg">
          {abiertas.length === 0 ? (
            "Nexus y Odoo cuadran."
          ) : (
            <>
              <strong className="text-lg tabular-nums">{abiertas.length}</strong> cosas por resolver, la
              más cara primero.
            </>
          )}
        </p>
        <p className="mt-0.5 text-xs text-fg-muted">
          Cruzado sobre {data.medido.cobros} cobros de Nexus y {data.medido.facturas} facturas de Odoo.
          {data.medido.cuentasSinVinculo > 0 && (
            <> Faltan emparejar {data.medido.cuentasSinVinculo} de {data.medido.cuentasTotales} cuentas.</>
          )}
          {enJuego > 0 && (
            <>
              {" "}
              Suman <span className="tabular-nums">{miles(enJuego)}</span> en la moneda que más mueve cada línea —{" "}
              {/* ⚠ Dicho explícitamente: es lo que evita que alguien lea el titular como «la
                  empresa tiene 60 millones en riesgo». */}
              no es un total en una sola moneda ni es plata perdida.
            </>
          )}
        </p>
      </div>

      {abiertas.length === 0 && cerradas.length === 0 ? (
        <EmptyState
          title="No hay nada que resolver"
          description="Todos los cobros de Nexus tienen su factura en Odoo y los montos coinciden."
        />
      ) : (
        abiertas.map((inc) => (
          <Linea
            key={inc.codigo}
            inc={inc}
            aceptada={aceptadaDe.get(inc.codigo)}
            guardando={guardando === inc.codigo}
            onIrAEmparejar={onIrAEmparejar}
            onAceptar={(motivo) =>
              enviar(
                { accion: "aceptar", clave: inc.codigo, motivo },
                inc.codigo,
                "Listo, esa línea queda cerrada.",
              )
            }
            onReabrir={() => enviar({ accion: "reabrir", clave: inc.codigo }, inc.codigo, "Vuelve a la lista.")}
            onResolverItem={(id) =>
              enviar(
                { accion: "resolver-liberacion", liberacionId: id },
                inc.codigo,
                "Anotado. Esa factura sale de la lista.",
              )
            }
          />
        ))
      )}

      {/* ⚠ Las aceptadas siguen a la vista, plegadas. Si se ocultaran del todo no habría forma
          de volver a abrirlas: quedarían cerradas para siempre por un clic. */}
      {cerradas.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setVerCerradas((v) => !v)}
            className="flex w-full items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-left text-sm text-fg-secondary hover:bg-surface-hover"
          >
            <span className="text-fg-muted">{verCerradas ? "▾" : "▸"}</span>
            {cerradas.length} marcadas «está bien así»
            <span className="text-xs text-fg-muted">— vuelven solas si los montos cambian</span>
          </button>
          {verCerradas && (
            <div className="mt-2 space-y-2">
              {cerradas.map((inc) => (
                <Linea
                  key={inc.codigo}
                  inc={inc}
                  aceptada={aceptadaDe.get(inc.codigo)}
                  guardando={guardando === inc.codigo}
                  onIrAEmparejar={onIrAEmparejar}
                  onAceptar={() => undefined}
                  onReabrir={() => enviar({ accion: "reabrir", clave: inc.codigo }, inc.codigo, "Vuelve a la lista.")}
                  /* ⚠ Acá había `() => undefined`: el botón se dibujaba igual y el clic no hacía
                     NADA — sin toast, sin error, sin deshabilitarse. Que la línea esté marcada
                     «está bien así» no anula la factura: sigue emitida y sigue contando. */
                  onResolverItem={(id) =>
                    enviar(
                      { accion: "resolver-liberacion", liberacionId: id },
                      inc.codigo,
                      "Anotado. Esa factura sale de la lista.",
                    )
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Una línea, con su salida ────────────────────────────────────────────────────── */

function Linea({
  inc,
  aceptada,
  guardando,
  onAceptar,
  onReabrir,
  onIrAEmparejar,
  onResolverItem,
}: {
  inc: DiferenciaOdoo;
  aceptada?: Aceptada;
  guardando: boolean;
  onAceptar: (motivo: string) => void;
  onReabrir: () => void;
  onIrAEmparejar?: () => void;
  /** Cerrar UNA fila del detalle. Solo lo usan las líneas con `accionPorItem`. */
  onResolverItem: (liberacionId: string) => void;
}) {
  const [verDetalle, setVerDetalle] = useState(false);
  const [aceptando, setAceptando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const donde = DONDE[inc.donde];

  return (
    <div className="rounded-lg border border-line bg-surface">
      <div className="border-b border-line p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-xs ${SEV[inc.severidad] ?? SEV.BAJA}`}>
            {inc.severidad.toLowerCase()}
          </span>
          <span className={`rounded-full border px-2 py-0.5 text-xs ${donde.chip}`}>{donde.label}</span>
          {inc.montoEnJuego !== null && (
            <span className="ml-auto text-sm tabular-nums text-fg-secondary">
              {miles(inc.montoEnJuego)}
              {/* La línea que ya cuenta esta plata desde otro ángulo. Sin decirlo, el lector
                  suma dos veces lo mismo. */}
              {inc.yaContadoEn && (
                <span className="ml-1 text-xs text-fg-muted">(ya contado en {inc.yaContadoEn})</span>
              )}
            </span>
          )}
        </div>
        <h3 className="mt-1.5 text-sm font-semibold text-fg">{inc.titulo}</h3>
        <p className="mt-1 text-sm text-fg-secondary">{inc.detalle}</p>
      </div>

      <div className="p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Cómo se arregla</h4>
        <ol className="mt-1.5 space-y-1">
          {inc.pasos.map((paso, i) => (
            <li key={i} className="flex gap-2 text-sm text-fg-secondary">
              <span className="shrink-0 tabular-nums text-fg-muted">{i + 1}.</span>
              <span>{paso}</span>
            </li>
          ))}
        </ol>
        {/* La línea puede tener su propia historia de cierre; el pie del `donde` es el default. */}
        <p className="mt-2 text-xs text-fg-muted">{inc.pie ?? donde.pie}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {inc.atajo && onIrAEmparejar && (
            <Button size="sm" onClick={onIrAEmparejar}>
              {inc.atajo.etiqueta}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setVerDetalle((v) => !v)}>
            {verDetalle ? "Ocultar" : `Ver las ${inc.items.length}`}
          </Button>
          {!aceptada && !aceptando && (
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setAceptando(true)}>
              Está bien así
            </Button>
          )}
        </div>

        {/* ⚠ Lo que significa aceptar se dice ANTES de aceptar, junto al campo. El control
            anterior era un desplegable de códigos sin ninguna explicación. */}
        {aceptando && !aceptada && (
          <div className="mt-3 rounded-md border border-line bg-surface-muted p-3">
            <p className="text-sm text-fg">Marcar esta línea como «está bien así»</p>
            <p className="mt-0.5 text-xs text-fg-muted">
              {inc.queSignificaAceptar} Se guarda con los números de hoy: si cambian, la línea vuelve sola.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Input
                autoFocus
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Por qué está bien así (queda registrado con tu nombre)"
                className="min-w-64 flex-1 text-sm"
              />
              <Button size="sm" disabled={guardando || motivo.trim().length < 5} onClick={() => onAceptar(motivo)}>
                {guardando ? "Guardando…" : "Confirmar"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAceptando(false);
                  setMotivo("");
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {aceptada && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface-muted p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-fg">Marcada «está bien así»</p>
              <p className="mt-0.5 text-xs text-fg-muted">
                {aceptada.motivo} · {aceptada.aceptadaPor} · {aceptada.aceptadaEn.slice(0, 10)}
              </p>
            </div>
            <Button variant="ghost" size="sm" disabled={guardando} onClick={onReabrir}>
              Volver a abrir
            </Button>
          </div>
        )}

        {verDetalle && (
          <div className="mt-3 max-h-96 overflow-y-auto rounded-md border border-line">
            {inc.items.map((it, i) => (
              <div key={i} className="flex items-start gap-3 border-b border-line px-3 py-1.5 last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-fg-secondary" title={it.texto}>
                    {it.texto}
                  </div>
                  {it.nota && <div className="truncate text-xs text-fg-muted">{it.nota}</div>}
                </div>
                {it.monto !== undefined && (
                  <span className="shrink-0 text-xs tabular-nums text-fg-muted">{miles(it.monto)}</span>
                )}
                {/* ⚠ Solo aparece en las líneas que ningún sync puede cerrar. Poder marcar
                    «hecho» algo que el espejo verifica sería poder esconderlo. */}
                {inc.accionPorItem && it.id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={guardando}
                    title={inc.accionPorItem.ayuda}
                    onClick={() => onResolverItem(it.id!)}
                    className="shrink-0"
                  >
                    {inc.accionPorItem.etiqueta}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
