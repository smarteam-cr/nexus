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
 *
 * ── «ESTÁ BIEN ASÍ», FILA POR FILA (2026-09-25) ─────────────────────────────────
 * Cada fila tiene su «Está bien así» con motivo, y el de la línea marca una por una las filas que muestra, con el
 * mismo motivo. Se propone el último motivo usado. Lo marcado sale de su línea y queda en «Marcadas», al final, con
 * quién, cuándo, por qué y «Deshacer». Hasta ese día la marca era de la línea entera: una fila nueva la reabría con
 * todo lo ya revisado adentro, y «Volver a abrir» la borraba sin dejar rastro. Marcar y deshacer piden edición.
 *
 * ── LO PENDIENTE SE QUEDA (2026-09-25) ──────────────────────────────────────────
 * Cada línea muestra, cuenta y suma solo sus filas pendientes (el detector la arma así), y una sin filas pendientes
 * no está entre las abiertas. «Cosas por resolver» y el número de la pestaña son FILAS pendientes, del mismo
 * `resumenDeDiferencias`, y bajan al marcar sin recargar la página: esta pestaña se lo avisa a OdooClient.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, EmptyState, Input, Spinner } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import {
  resumenDeDiferencias,
  textoDeMontos,
  type DiferenciaOdoo,
  type DondeSeArregla,
  type FilaQueVolvio,
  type ItemDiferencia,
  type MarcaDeFila,
} from "@/lib/cobranza/odoo/diferencias";
import { fmtFecha } from "./format";

/** Una factura soltada cerrada a mano con «Ya está anulada» (`AnuladaAMano`, servicio.ts). */
interface AnuladaAMano {
  liberacionId: string;
  texto: string;
  nota: string;
  /** null = se cerró antes de que «Ya está anulada» pidiera motivo. */
  motivo: string | null;
  por: string | null;
  en: string;
}
interface Respuesta {
  inconsistencias: DiferenciaOdoo[];
  anuladas: AnuladaAMano[];
  /** El último motivo que usó quien mira (o, si nunca marcó, el último de cualquiera). */
  ultimosMotivos: { bienAsi: string | null; anulada: string | null };
  medido: {
    cobros: number;
    facturas: number;
    otrosDocumentos: number;
    cuentasSinVinculo: number;
    cuentasTotales: number;
    espejoAl: string | null;
  };
}
interface ResultadoDeMarcar {
  marcadas: number;
  cambiaron: Array<{ clave: string; texto: string | null }>;
  yaMarcadas: number;
}

/** El motivo tiene que decir algo: el servidor exige lo mismo. */
const MOTIVO_MINIMO = 5;

/** Dónde se arregla, en palabras de quien lo va a hacer. El pie recibe el día de la última copia buena de Odoo. */
const DONDE: Record<DondeSeArregla, { label: string; chip: string; pie: (espejoAl: string | null) => string }> = {
  /* ⚠ Decía «al día siguiente el sync trae el cambio»: la copia de Odoo estuvo sin actualizarse del 2 al
     13-sep. Un pie con la fecha real no promete lo que no se cumple. */
  ODOO: {
    label: "Se arregla en Odoo",
    chip: "text-violet-600 bg-violet-500/10 border-violet-500/30",
    pie: (espejoAl) =>
      `Con la próxima copia de Odoo la línea se actualiza sola${espejoAl ? ` (la última buena es del ${espejoAl})` : ""}.`,
  },
  /* ⚠ Su pie dice lo contrario que el de ODOO a propósito: acá NO hay copia que cierre la
     línea. Si dijera lo mismo, alguien anularía la factura en Mercury y esperaría para siempre
     a que la lista se limpie sola. */
  MERCURY: {
    label: "Se arregla fuera de Odoo",
    chip: "text-cyan-600 bg-cyan-500/10 border-cyan-500/30",
    pie: () => "Nexus no tiene copia de esa plataforma: hay que volver acá y marcarla resuelta a mano.",
  },
  NEXUS: {
    label: "Se arregla en Nexus",
    chip: "text-brand bg-brand/10 border-brand/30",
    pie: () => "El cambio se ve en la próxima carga de esta pantalla.",
  },
  PREGUNTANDO: {
    label: "Falta un dato de negocio",
    chip: "text-amber-600 bg-amber-500/10 border-amber-500/30",
    pie: () => "Esto no se resuelve tecleando: alguien tiene que responder una pregunta.",
  },
};

const SEV: Record<string, string> = {
  ALTA: "text-red-600 bg-red-500/10 border-red-500/30",
  MEDIA: "text-amber-600 bg-amber-500/10 border-amber-500/30",
  BAJA: "text-fg-muted bg-surface-muted border-line",
};

const filas = (n: number) => (n === 1 ? "1 fila" : `${n} filas`);
const enLineas = (n: number) => (n === 1 ? "1 línea" : `${n} líneas`);

export default function DiferenciasOdoo({
  onIrAEmparejar,
  onPendientes,
  puedeEditar = true,
}: {
  onIrAEmparejar?: () => void;
  /**
   * Las filas pendientes, cada vez que la lista se carga o se recarga (después de marcar o deshacer). OdooClient las
   * usa para el número de la pestaña y «Cómo funciona», que hasta el 2026-09-25 quedaban fijos hasta recargar.
   */
  onPendientes?: (filas: number) => void;
  /**
   * `cobranza.write`. Apagado, la lista se lee igual pero no se ofrecen los controles que
   * escriben: «Está bien así», «Ya está anulada» y sus «Deshacer».
   *
   * ⚠ Default `true`: el enforcement vive en el endpoint, y un default `false` haría que un
   * montaje que se olvide de pasarlo se vea roto en vez de seguro.
   */
  puedeEditar?: boolean;
}) {
  const toast = useToast();
  const [data, setData] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  /* Una escritura a la vez: la clave de la que está en curso, para decir «Guardando…» en su botón. */
  const [ocupado, setOcupado] = useState<string | null>(null);
  /* El motivo que se propone: el que vino del servidor, y después el último que usaste acá. */
  const [motivos, setMotivos] = useState<{ bienAsi: string; anulada: string }>({ bienAsi: "", anulada: "" });

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetchJson<Respuesta>("/api/cobranza/odoo/diferencias");
      setData(r);
      setMotivos((m) => ({
        bienAsi: m.bienAsi || (r.ultimosMotivos.bienAsi ?? ""),
        anulada: m.anulada || (r.ultimosMotivos.anulada ?? ""),
      }));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudieron cargar las diferencias.");
    } finally {
      setCargando(false);
    }
  }, [toast]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Manda una escritura, recarga la lista y devuelve la respuesta; null si falló (ya avisó). */
  const enviar = useCallback(
    async <T,>(clave: string, body: Record<string, unknown>): Promise<T | null> => {
      setOcupado(clave);
      try {
        const r = await fetchJson<T>("/api/cobranza/odoo/diferencias", { method: "POST", body: JSON.stringify(body) });
        await cargar();
        return r;
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
        return null;
      } finally {
        setOcupado(null);
      }
    },
    [cargar, toast],
  );

  /* ⭐ Cada fila viaja con la huella que ves: si cambió antes del clic, el servidor no la marca y lo dice. */
  const marcar = useCallback(
    async (inc: DiferenciaOdoo, items: readonly ItemDiferencia[], motivo: string, clave: string) => {
      const r = await enviar<ResultadoDeMarcar>(clave, {
        accion: "marcar",
        linea: inc.codigo,
        motivo,
        filas: items.map((i) => ({ clave: i.fila.clave, huella: i.fila.huella })),
      });
      if (!r) return false;
      setMotivos((m) => ({ ...m, bienAsi: motivo }));
      if (r.marcadas > 0) {
        toast.success(
          r.marcadas === 1
            ? "Listo: la fila sale de la lista y queda en «Marcadas»."
            : `Listo: ${r.marcadas} filas salen de la lista y quedan en «Marcadas».`,
        );
      }
      if (r.cambiaron.length > 0) {
        toast.info(
          r.cambiaron.length === 1
            ? "Una fila cambió antes de tu clic y no se marcó: sigue en la lista para que la revises con sus números de ahora."
            : `${r.cambiaron.length} filas cambiaron antes de tu clic y no se marcaron: siguen en la lista para que las revises con sus números de ahora.`,
        );
      }
      if (r.yaMarcadas > 0 && r.marcadas === 0 && r.cambiaron.length === 0) {
        toast.info("Alguien ya la había marcado con estos mismos números.");
      }
      return true;
    },
    [enviar, toast],
  );

  const deshacer = useCallback(
    async (ids: readonly string[], clave: string) => {
      if (await enviar(clave, { accion: "deshacer-marcas", ids })) {
        toast.success("Vuelve a la lista. Queda anotado que la deshiciste.");
      }
    },
    [enviar, toast],
  );

  const anular = useCallback(
    async (inc: DiferenciaOdoo, liberacionId: string, nota: string, clave: string) => {
      const r = await enviar(clave, { accion: "resolver-liberacion", liberacionId, linea: inc.codigo, nota });
      if (!r) return false;
      setMotivos((m) => ({ ...m, anulada: nota }));
      toast.success("Anotado. Esa factura sale de la lista y queda en «Marcadas».");
      return true;
    },
    [enviar, toast],
  );

  const reabrir = useCallback(
    async (liberacionId: string, clave: string) => {
      if (await enviar(clave, { accion: "reabrir-liberacion", liberacionId })) {
        toast.success("La factura vuelve a la lista. Queda anotado quién la había cerrado y que la reabriste.");
      }
    },
    [enviar, toast],
  );

  /* ⚠ El titular suma por moneda y cuenta cada documento UNA vez aunque lo miren varias líneas
     (`resumenDeDiferencias`, con sus pruebas). Hasta el 2026-09-13 decía «121 693 746» sumando colones
     con dólares y contaba dos veces ₡26 millones. */
  const resumen = useMemo(() => resumenDeDiferencias(data?.inconsistencias ?? []), [data]);
  /* Una línea sin filas pendientes no es trabajo: sus filas están en «Marcadas». */
  const abiertas = useMemo(() => (data?.inconsistencias ?? []).filter((i) => i.items.length > 0), [data]);
  /* En «Marcadas» también las que tienen filas que volvieron porque cambió un número: se dice por qué volvieron. */
  const conMarcadas = useMemo(
    () => (data?.inconsistencias ?? []).filter((i) => i.marcadas.length > 0 || i.volvieron.length > 0),
    [data],
  );
  /* ⭐ El número de la pestaña sale de acá después de cada carga: marcar una fila lo baja sin recargar la página. */
  useEffect(() => {
    if (data) onPendientes?.(resumen.filas);
  }, [data, resumen.filas, onPendientes]);
  /* «Ya contado en» con el título de la otra línea: el código (ODOO-SIN-CUENTA) no lo entiende nadie. */
  const tituloDe = useMemo(
    () => new Map((data?.inconsistencias ?? []).map((i) => [i.codigo, i.titulo] as const)),
    [data],
  );

  if (cargando && !data) {
    return (
      <div className="flex items-center gap-3 py-10 text-sm text-fg-muted">
        <Spinner /> Cruzando cobros con facturas…
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-surface px-4 py-3 text-sm">
        <p className="text-fg">
          {/* ⚠ FILAS, no líneas (2026-09-25): una línea con una fila pendiente no pesa lo mismo que una con treinta. */}
          {resumen.filas === 0 ? (
            "Nexus y Odoo cuadran."
          ) : (
            <>
              <strong className="text-lg tabular-nums">{resumen.filas}</strong> cosas por resolver en{" "}
              {enLineas(resumen.abiertas)}, las más urgentes primero.
            </>
          )}
        </p>
        {resumen.plata.length > 0 && (
          <p className="mt-1 text-fg">
            Lo que no cuadra suma <span className="font-medium tabular-nums">{textoDeMontos(resumen.plata)}</span>
            <span className="text-fg-muted">, sin IVA.</span>
          </p>
        )}
        <p className="mt-0.5 text-xs text-fg-muted">
          {/* ⚠ Dicho explícitamente: es lo que evita que alguien lea el titular como «la empresa tiene
              60 millones en riesgo», o que sume las dos monedas a mano. */}
          {resumen.plata.length > 0 &&
            "Cada moneda por separado y cada documento contado una vez, aunque lo miren varias líneas; no es plata perdida. "}
          Cruzado sobre {data.medido.cobros} cobros de Nexus y {data.medido.facturas} facturas de Odoo
          {data.medido.otrosDocumentos > 0 && <> (más {data.medido.otrosDocumentos} notas de crédito o documentos anulados)</>}.
          {data.medido.cuentasSinVinculo > 0 && (
            <>
              {" "}
              Faltan emparejar {data.medido.cuentasSinVinculo} de {data.medido.cuentasTotales} clientes que facturan
              por Odoo.
            </>
          )}
          {data.medido.espejoAl && <> Última copia buena de Odoo: {data.medido.espejoAl}.</>}
        </p>
      </div>

      {abiertas.length === 0 && conMarcadas.length === 0 && data.anuladas.length === 0 ? (
        <EmptyState
          title="No hay nada que resolver"
          description="Todos los cobros de Nexus tienen su factura en Odoo y los montos coinciden."
        />
      ) : (
        abiertas.map((inc) => (
          <Linea
            key={inc.codigo}
            inc={inc}
            tituloDe={tituloDe}
            espejoAl={data.medido.espejoAl}
            ocupado={ocupado}
            puedeEditar={puedeEditar}
            motivos={motivos}
            onIrAEmparejar={onIrAEmparejar}
            onMarcar={(items, motivo, clave) => marcar(inc, items, motivo, clave)}
            onAnular={(liberacionId, nota, clave) => anular(inc, liberacionId, nota, clave)}
          />
        ))
      )}

      {/* ⭐ Fija al final y visible, no plegada: lo marcado tiene que poder encontrarse —con quién, cuándo y por
          qué— y deshacerse, aunque su línea ya no tenga nada pendiente. Si se escondiera, una fila quedaría fuera de
          la lista para siempre por un clic. */}
      {(conMarcadas.length > 0 || data.anuladas.length > 0) && (
        <Marcadas
          lineas={conMarcadas}
          anuladas={data.anuladas}
          ocupado={ocupado}
          puedeEditar={puedeEditar}
          onDeshacer={deshacer}
          onReabrir={reabrir}
        />
      )}
    </div>
  );
}

/* ── Una línea, con su salida ────────────────────────────────────────────────────── */

/** Qué se está marcando en esta línea: todas sus filas, una fila, o el cierre «Ya está anulada» de una fila. */
type Editando = { tipo: "grupo" } | { tipo: "fila"; clave: string } | { tipo: "anular"; clave: string } | null;

function Linea({
  inc,
  tituloDe,
  espejoAl,
  ocupado,
  puedeEditar,
  motivos,
  onIrAEmparejar,
  onMarcar,
  onAnular,
}: {
  inc: DiferenciaOdoo;
  /** El título de cada línea por su código, para decir «ya contado en» con palabras. */
  tituloDe: ReadonlyMap<string, string>;
  /** Día de la última copia buena de Odoo, para el pie de las líneas que se cierran solas. */
  espejoAl: string | null;
  /** La escritura en curso, si hay una: mientras tanto no se ofrece otra. */
  ocupado: string | null;
  /** `cobranza.write`: sin esto la línea se lee, pero no se marca ni se cierra nada. */
  puedeEditar: boolean;
  motivos: { bienAsi: string; anulada: string };
  onIrAEmparejar?: () => void;
  /** Marca «está bien así» estas filas, con el mismo motivo. true = se guardó (aunque alguna haya cambiado). */
  onMarcar: (items: readonly ItemDiferencia[], motivo: string, clave: string) => Promise<boolean>;
  /** «Ya está anulada» de una factura soltada. Solo lo usan las líneas con `accionPorItem`. */
  onAnular: (liberacionId: string, nota: string, clave: string) => Promise<boolean>;
}) {
  const [verDetalle, setVerDetalle] = useState(false);
  const [editando, setEditando] = useState<Editando>(null);
  const donde = DONDE[inc.donde];
  const n = inc.items.length;
  const claveDelGrupo = `grupo ${inc.codigo}`;
  /* Las filas que alguien ya había marcado y volvieron porque cambió un número: la fila lo dice, para que no parezca
     que la marca se perdió. */
  const volvio = new Map(inc.volvieron.map((v) => [v.item.fila.clave, v] as const));
  const cerrarSi = (ok: boolean) => {
    if (ok) setEditando(null);
  };

  return (
    <div className="rounded-lg border border-line bg-surface">
      <div className="border-b border-line p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-xs ${SEV[inc.severidad] ?? SEV.BAJA}`}>
            {inc.severidad.toLowerCase()}
          </span>
          <span className={`rounded-full border px-2 py-0.5 text-xs ${donde.chip}`}>{donde.label}</span>
          {inc.montos.length > 0 && (
            <span className="ml-auto text-sm tabular-nums text-fg-secondary">
              {/* ⛔ Cada cifra con su moneda y nunca sumadas: «72 493 914» sin moneda eran colones puestos
                  al lado de dólares. */}
              {textoDeMontos(inc.montos)}
              {/* La línea que ya cuenta esta plata desde otro ángulo. Sin decirlo, el lector
                  suma dos veces lo mismo. */}
              {inc.yaContadoEn && (
                <span className="ml-1 text-xs text-fg-muted">
                  (ya contado en «{tituloDe.get(inc.yaContadoEn) ?? "otra línea"}»)
                </span>
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
        <p className="mt-2 text-xs text-fg-muted">{inc.pie ?? donde.pie(espejoAl)}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {inc.atajo && onIrAEmparejar && (
            <Button size="sm" onClick={onIrAEmparejar}>
              {inc.atajo.etiqueta}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setVerDetalle((v) => !v)}>
            {verDetalle ? "Ocultar" : `Ver las ${n}`}
          </Button>
          {inc.marcadas.length > 0 && (
            <span className="text-xs text-fg-muted">
              {inc.marcadas.length === 1 ? "1 fila marcada" : `${inc.marcadas.length} filas marcadas`} «está bien
              así»: están en «Marcadas», al final.
            </span>
          )}
          {puedeEditar && n > 0 && editando?.tipo !== "grupo" && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              disabled={ocupado !== null}
              onClick={() => setEditando({ tipo: "grupo" })}
            >
              {n === 1 ? "Está bien así" : `Las ${n} están bien así`}
            </Button>
          )}
        </div>

        {/* ⚠ Lo que significa marcar se dice ANTES de marcar, junto al campo. El control de antes era un
            desplegable de códigos sin ninguna explicación. */}
        {editando?.tipo === "grupo" && (
          <FormularioDeMotivo
            titulo={`Marcar «está bien así» ${n === 1 ? "la fila" : `las ${n} filas`} de esta línea`}
            ayuda={`${inc.queSignificaAceptar} Se marca cada fila por separado, con los números que ves ahora: si una cambió antes de tu clic, esa no se marca y te avisamos; si cambia después, vuelve sola. Quedan en «Marcadas», al final, donde se pueden deshacer.`}
            placeholder="Por qué están bien así (queda con tu nombre)"
            inicial={motivos.bienAsi}
            guardando={ocupado === claveDelGrupo}
            deshabilitado={ocupado !== null}
            onConfirmar={async (motivo) => cerrarSi(await onMarcar(inc.items, motivo, claveDelGrupo))}
            onCancelar={() => setEditando(null)}
          />
        )}

        {verDetalle && (
          <div className="mt-3 max-h-96 overflow-y-auto rounded-md border border-line">
            {inc.items.map((it) => {
              const clave = it.fila.clave;
              const claveDeFila = `fila ${inc.codigo} ${clave}`;
              const enEdicion = editando && editando.tipo !== "grupo" && editando.clave === clave ? editando.tipo : null;
              const regreso = volvio.get(clave);
              return (
                <div key={clave} className="border-b border-line px-3 py-1.5 last:border-0">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-fg-secondary" title={it.texto}>
                        {it.texto}
                      </div>
                      {it.nota && <div className="truncate text-xs text-fg-muted">{it.nota}</div>}
                      {regreso && <div className="text-xs text-warn-ink">{textoDeRegreso(regreso)}</div>}
                    </div>
                    {/* Sin moneda no se muestra el número: el texto de la fila ya lo dice con palabras. */}
                    {it.monto !== undefined && it.moneda && (
                      <span className="shrink-0 text-xs tabular-nums text-fg-muted">
                        {textoDeMontos([{ moneda: it.moneda, monto: it.monto }])}
                      </span>
                    )}
                    {/* ⚠ «Ya está anulada» solo aparece en las líneas que ningún sync puede cerrar. Poder marcar
                        «hecho» algo que el espejo verifica sería poder esconderlo. */}
                    {puedeEditar && !enEdicion && inc.accionPorItem && it.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={ocupado !== null}
                        title={inc.accionPorItem.ayuda}
                        onClick={() => setEditando({ tipo: "anular", clave })}
                        className="shrink-0"
                      >
                        {inc.accionPorItem.etiqueta}
                      </Button>
                    )}
                    {puedeEditar && !enEdicion && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={ocupado !== null}
                        title="Sale de esta línea con sus números de hoy. Si alguno cambia, vuelve sola."
                        onClick={() => setEditando({ tipo: "fila", clave })}
                        className="shrink-0"
                      >
                        Está bien así
                      </Button>
                    )}
                  </div>
                  {enEdicion === "fila" && (
                    <FormularioDeMotivo
                      titulo="Marcar esta fila «está bien así»"
                      ayuda="Sale de esta línea con sus números de hoy: si alguno cambia, vuelve sola. En otras líneas sigue a la vista."
                      placeholder="Por qué está bien así (queda con tu nombre)"
                      inicial={motivos.bienAsi}
                      guardando={ocupado === claveDeFila}
                      deshabilitado={ocupado !== null}
                      onConfirmar={async (motivo) => cerrarSi(await onMarcar([it], motivo, claveDeFila))}
                      onCancelar={() => setEditando(null)}
                    />
                  )}
                  {enEdicion === "anular" && it.id && (
                    <FormularioDeMotivo
                      titulo="Marcar esta factura «Ya está anulada»"
                      ayuda={`${inc.accionPorItem?.ayuda ?? ""} Queda con tu nombre y tu motivo en «Marcadas», donde se puede deshacer.`}
                      placeholder="Cómo y dónde se anuló (queda con tu nombre)"
                      inicial={motivos.anulada}
                      guardando={ocupado === claveDeFila}
                      deshabilitado={ocupado !== null}
                      onConfirmar={async (nota) => {
                        if (it.id) cerrarSi(await onAnular(it.id, nota, claveDeFila));
                      }}
                      onCancelar={() => setEditando(null)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * El campo del motivo, con lo que significa marcar dicho antes de marcar. Propone el último motivo usado,
 * seleccionado: si sirve, se confirma; si no, se escribe encima.
 */
function FormularioDeMotivo({
  titulo,
  ayuda,
  placeholder,
  inicial,
  guardando,
  deshabilitado,
  onConfirmar,
  onCancelar,
}: {
  titulo: string;
  ayuda: string;
  placeholder: string;
  inicial: string;
  guardando: boolean;
  deshabilitado: boolean;
  onConfirmar: (motivo: string) => void | Promise<void>;
  onCancelar: () => void;
}) {
  const [motivo, setMotivo] = useState(inicial);
  const valido = motivo.trim().length >= MOTIVO_MINIMO;
  const confirmar = () => {
    if (valido && !deshabilitado) void onConfirmar(motivo.trim());
  };
  return (
    <div className="mt-2 rounded-md border border-line bg-surface-muted p-3">
      <p className="text-sm text-fg">{titulo}</p>
      <p className="mt-0.5 text-xs text-fg-muted">{ayuda}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Input
          autoFocus
          value={motivo}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setMotivo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirmar();
            if (e.key === "Escape") onCancelar();
          }}
          placeholder={placeholder}
          className="min-w-64 flex-1 text-sm"
        />
        <Button size="sm" disabled={deshabilitado || !valido} onClick={confirmar}>
          {guardando ? "Guardando…" : "Confirmar"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
      {inicial !== "" && motivo === inicial && (
        <p className="mt-1 text-xs text-fg-muted">Es el último motivo que se usó: cámbialo si no aplica.</p>
      )}
    </div>
  );
}

/* ── Lo marcado, a la vista y con «Deshacer» ──────────────────────────────────────── */

/** Las marcas de una fila, por acto: mismo motivo, misma persona, mismo día. Casi siempre es uno solo. */
function actosDe(f: { marcas: readonly MarcaDeFila[] }): Array<{ motivo: string; por: string; en: string }> {
  const vistos = new Map<string, { motivo: string; por: string; en: string }>();
  for (const m of f.marcas) {
    const k = [m.motivo, m.marcadaPor, m.marcadaEn.slice(0, 10)].join("\n");
    if (!vistos.has(k)) vistos.set(k, { motivo: m.motivo, por: m.marcadaPor, en: m.marcadaEn });
  }
  return [...vistos.values()];
}

/** Qué dice una fila que volvió: quién la había marcado, cuándo y por qué, y que cambió un número desde entonces. */
function textoDeRegreso(v: FilaQueVolvio): string {
  const actos = actosDe(v).map((a) => `«${a.motivo}», ${a.por}, ${fmtFecha(a.en)}`);
  return `Volvió porque cambió un número desde que se marcó${actos.length ? ` (${actos.join("; ")})` : ""}.`;
}

function Marcadas({
  lineas,
  anuladas,
  ocupado,
  puedeEditar,
  onDeshacer,
  onReabrir,
}: {
  lineas: readonly DiferenciaOdoo[];
  anuladas: readonly AnuladaAMano[];
  ocupado: string | null;
  puedeEditar: boolean;
  onDeshacer: (ids: readonly string[], clave: string) => void;
  onReabrir: (liberacionId: string, clave: string) => void;
}) {
  const total = lineas.reduce((a, l) => a + l.marcadas.length, 0) + anuladas.length;
  const volvieron = lineas.reduce((a, l) => a + l.volvieron.length, 0);
  return (
    <div className="rounded-lg border border-line bg-surface">
      <div className="px-4 py-3">
        <h3 className="text-sm font-semibold text-fg">
          Marcadas ({filas(total)})
          {volvieron > 0 && (
            <span className="font-normal text-warn-ink"> · {volvieron === 1 ? "1 volvió" : `${volvieron} volvieron`} porque cambió</span>
          )}
        </h3>
        <p className="mt-0.5 text-xs text-fg-muted">
          Lo que alguien revisó y dijo que está bien así, o que ya se anuló. Sale de su línea mientras sus números no
          cambien: si cambian, vuelve sola y aquí se dice que volvió. «Deshacer» lo devuelve a la lista y queda anotado
          quién lo hizo.
        </p>
      </div>

      {lineas.map((l) => (
        <div key={l.codigo} className="border-t border-line px-4 py-2">
          {/* El título contado sobre lo marcado: el de la línea cuenta lo que le queda pendiente. */}
          <p className="text-xs font-medium text-fg-secondary">
            {l.tituloDeMarcadas ?? l.titulo}
            {l.marcadas.length > 0 && <span className="font-normal text-fg-muted"> · {filas(l.marcadas.length)}</span>}
          </p>
          {/* ⭐ Las que volvieron: están otra vez arriba, en su línea. Acá se dice por qué, con la marca que tenían. */}
          {l.volvieron.map((v) => (
            <div key={`volvio ${v.item.fila.clave}`} className="border-b border-line py-1.5">
              <div className="truncate text-sm text-fg-secondary" title={v.item.texto}>
                {v.item.texto}
              </div>
              <div className="text-xs text-warn-ink">
                Volvió porque cambió un número desde que se marcó: está otra vez en su línea, arriba.
              </div>
              {actosDe(v).map((a) => (
                <div key={[a.motivo, a.por, a.en].join("\n")} className="text-xs text-fg-muted">
                  Estaba marcada: «{a.motivo}» · {a.por} · {fmtFecha(a.en)}
                </div>
              ))}
            </div>
          ))}
          <div className="mt-1 max-h-80 overflow-y-auto">
            {l.marcadas.map((f) => {
              const clave = `deshacer ${l.codigo} ${f.item.fila.clave}`;
              return (
                <div
                  key={f.item.fila.clave}
                  className="flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-line py-1.5 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-fg-secondary" title={f.item.texto}>
                      {f.item.texto}
                    </div>
                    {f.item.nota && <div className="truncate text-xs text-fg-muted">{f.item.nota}</div>}
                    {actosDe(f).map((a) => (
                      <div key={[a.motivo, a.por, a.en].join("\n")} className="text-xs text-fg-muted">
                        «{a.motivo}» · {a.por} · {fmtFecha(a.en)}
                      </div>
                    ))}
                  </div>
                  {puedeEditar && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      disabled={ocupado !== null}
                      title="La fila vuelve a su línea. Queda anotado que la deshiciste."
                      onClick={() => onDeshacer(f.marcas.map((m) => m.id), clave)}
                    >
                      {ocupado === clave ? "Guardando…" : "Deshacer"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {anuladas.length > 0 && (
        <div className="border-t border-line px-4 py-2">
          <p className="text-xs font-medium text-fg-secondary">
            Facturas soltadas cerradas con «Ya está anulada»{" "}
            <span className="font-normal text-fg-muted">· {filas(anuladas.length)}</span>
          </p>
          <div className="mt-1 max-h-80 overflow-y-auto">
            {anuladas.map((a) => {
              const clave = `reabrir ${a.liberacionId}`;
              return (
                <div
                  key={a.liberacionId}
                  className="flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-line py-1.5 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-fg-secondary" title={a.texto}>
                      {a.texto}
                    </div>
                    <div className="truncate text-xs text-fg-muted">{a.nota}</div>
                    <div className="text-xs text-fg-muted">
                      {a.motivo ? `«${a.motivo}»` : "Sin motivo: se cerró antes de que se pidiera"} · {a.por ?? "sin firma"} ·{" "}
                      {fmtFecha(a.en)}
                    </div>
                  </div>
                  {puedeEditar && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      disabled={ocupado !== null}
                      title="La factura vuelve a la lista de lo que hay que anular. Queda anotado quién la había cerrado y que la reabriste."
                      onClick={() => onReabrir(a.liberacionId, clave)}
                    >
                      {ocupado === clave ? "Guardando…" : "Deshacer"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
