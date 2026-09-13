"use client";

/**
 * components/cobranza/MarcarFacturadoDialog.tsx — «Marcar facturado» y «Agregar número» (Reloj 1).
 *
 * La factura nace con número (etapa 7, 2026-09-12). Hasta entonces este diálogo pedía solo la fecha
 * y el número se podía pegar recién al registrar el pago: 144 cobros facturados, ninguno con número.
 * Ahora:
 *   · cuenta que factura por Odoo → se ELIGE el documento del espejo (lib/cobranza/odoo/candidatas.ts:
 *     clientes de Odoo vinculados, misma moneda, vigentes, sin notas de crédito ni números ya usados,
 *     el monto exacto primero). La fecha de emisión sale del documento. Si todavía no está en el
 *     espejo, se teclea, con aviso.
 *   · Mercury o QuickBooks → se teclea, con aviso si el número tiene forma de otra plataforma.
 *   · siempre existe «No tengo el número», con el motivo: queda consultable, no en blanco.
 *
 * Con el cobro ya facturado (los 144 de antes) es «Agregar número»: se conserva la fecha que tenía,
 * salvo que se elija un documento con otra, que pasa a ser la del documento y el diálogo lo dice.
 *
 * Etapa 12 (2026-09-13): también dice DÓNDE se emitió y A QUÉ SOCIEDAD. Elegir un documento del espejo
 * es decir Odoo y su cliente. Tecleado, la plataforma arranca en la de la cuenta —a la vista, se cambia— y
 * la sociedad se elige de las de la cuenta: con dos o más en esa plataforma no se puede guardar sin elegir.
 * ⛔ El diálogo nunca la elige solo, ni con una sola sociedad.
 *
 * Presentacional en lo que escribe: entrega los datos y el caller hace el PATCH. La regla la aplica el
 * chokepoint `cambiarEstadoCobro` (lib/cobranza/numero-factura.ts), que firma con el email de quien
 * confirma; un 409 «ese número ya está en otra cuenta» vuelve como toast desde el caller.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, Modal } from "@/components/ui";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import {
  avisoDePlataforma,
  MOTIVO_SIN_NUMERO_MAX,
  MOTIVO_SIN_NUMERO_MIN,
  NUMERO_FACTURA_MAX,
  normalizarNumeroFactura,
} from "@/lib/cobranza/numero-factura";
import type { CandidatasDeCobro } from "@/lib/cobranza/odoo/candidatas";
import {
  esPlataformaDeCobro,
  NOMBRE_DE_PLATAFORMA,
  PLATAFORMAS_DE_COBRO,
  type PlataformaDeCobro,
} from "@/lib/cobranza/sociedades";
import { fmtFecha, fmtMonto, INPUT_CLS, SELECT_CLS } from "./format";

/** Shape mínimo del cobro a facturar — CobroDTO y ColaCobroRow lo satisfacen. */
export interface CobroFacturarRef {
  id: string;
  monto: number;
  moneda: string;
  fechaProgramada: string;
  numCuota?: number | null;
  periodo?: string;
  clienteNombre?: string;
  /** Con fecha, el diálogo agrega o cambia el número de una factura ya marcada. */
  fechaEmision?: string | null;
  numeroFactura?: string | null;
}

/** Lo que va en el PATCH del cobro. Número y motivo son excluyentes: uno de los dos viaja en null. */
export interface DatosDeFactura {
  fechaEmision: string;
  numeroFactura: string | null;
  sinNumeroFacturaMotivo: string | null;
  /** Etapa 12: dónde se emitió y a qué sociedad. Los dice quien factura; null = no lo dijo. */
  plataformaFactura: PlataformaDeCobro | null;
  sociedadFacturadaId: string | null;
}

/** El toast después del PATCH, igual en la cola y en el cronograma. `null` = se revirtió la factura. */
export function mensajeDeFactura(datos: DatosDeFactura | null, numeroAnterior: string | null): string {
  if (!datos) {
    return numeroAnterior ? `Factura revertida. El número ${numeroAnterior} quedó en la bitácora.` : "Factura revertida.";
  }
  if (datos.numeroFactura) return `Factura ${datos.numeroFactura} anotada a tu nombre.`;
  return "Quedó facturada sin número, con el motivo a tu nombre.";
}

type Forma = "espejo" | "teclear" | "sinNumero";

export default function MarcarFacturadoDialog({
  cobro,
  todayISO,
  onCancel,
  onConfirm,
}: {
  cobro: CobroFacturarRef;
  todayISO: string;
  onCancel: () => void;
  onConfirm: (data: DatosDeFactura) => void;
}) {
  const yaFacturado = !!cobro.fechaEmision;
  const [datos, setDatos] = useState<CandidatasDeCobro | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [forma, setForma] = useState<Forma>("teclear");
  const [elegida, setElegida] = useState<string | null>(null);
  const [numero, setNumero] = useState(cobro.numeroFactura ?? "");
  const [fecha, setFecha] = useState(cobro.fechaEmision ?? todayISO);
  const [motivo, setMotivo] = useState("");
  const [plataforma, setPlataforma] = useState<PlataformaDeCobro | null>(null);
  const [sociedadId, setSociedadId] = useState<string | null>(null);
  const leidoPara = useRef<string | null>(null);

  useEffect(() => {
    if (leidoPara.current === cobro.id) return; // StrictMode/re-render: una sola lectura
    leidoPara.current = cobro.id;
    (async () => {
      try {
        const d = await fetchJson<CandidatasDeCobro>(`/api/cobranza/cobros/${cobro.id}/facturas-candidatas`);
        setDatos(d);
        if (d.candidatas.length > 0) setForma("espejo");
        /* Lo que ya estaba anotado; si no, la plataforma de la cuenta, a la vista y cambiable. La sociedad no
           se precarga nunca desde la cuenta: la dice quien factura. */
        setPlataforma(d.plataformaFactura ?? (esPlataformaDeCobro(d.via) ? d.via : null));
        setSociedadId(d.sociedadFacturadaId);
      } catch (e) {
        setErrorCarga(e instanceof ApiError ? e.message : "No se pudo leer el espejo de Odoo.");
      } finally {
        setCargando(false);
      }
    })();
  }, [cobro.id]);

  const via = datos?.via ?? null;
  const hayLista = !!datos && datos.candidatas.length > 0;
  const candidata = forma === "espejo" ? (datos?.candidatas.find((f) => f.numero === elegida) ?? null) : null;
  const numeroNormalizado = normalizarNumeroFactura(numero);
  const enLaLista = !!numeroNormalizado && !!datos?.candidatas.some((f) => f.numero === numeroNormalizado);

  /* Etapa 12: un documento elegido del espejo es Odoo y su cliente; si no, lo que diga la persona. */
  const plataformaFinal: PlataformaDeCobro | null = candidata ? "ODOO" : plataforma;
  const sociedadesDeLaPlataforma = (datos?.sociedades ?? []).filter((s) => s.plataforma === plataformaFinal);
  const sociedadFinal = candidata
    ? candidata.sociedadId
    : sociedadesDeLaPlataforma.some((s) => s.id === sociedadId)
      ? sociedadId
      : null;
  const faltaSociedad = !candidata && sociedadesDeLaPlataforma.length >= 2 && !sociedadFinal;
  const aviso = forma === "teclear" && plataformaFinal ? avisoDePlataforma(numeroNormalizado, plataformaFinal) : null;

  /* La fecha de un documento elegido es la del documento: no se valida contra hoy, es un hecho de Odoo. */
  const fechaFinal = candidata ? candidata.invoiceDate : fecha;
  const fechaValida = candidata ? true : !!fecha && fecha <= todayISO;
  const valido =
    fechaValida &&
    !faltaSociedad &&
    (forma === "espejo"
      ? !!candidata
      : forma === "teclear"
        ? !!numeroNormalizado && numeroNormalizado.length <= NUMERO_FACTURA_MAX
        : motivo.trim().length >= MOTIVO_SIN_NUMERO_MIN);

  function confirmar() {
    onConfirm({
      fechaEmision: fechaFinal,
      numeroFactura: forma === "espejo" ? (candidata?.numero ?? null) : forma === "teclear" ? numeroNormalizado : null,
      sinNumeroFacturaMotivo: forma === "sinNumero" ? motivo.trim() : null,
      plataformaFactura: plataformaFinal,
      sociedadFacturadaId: sociedadFinal,
    });
  }

  const descripcion =
    (cobro.clienteNombre ? `${cobro.clienteNombre} · ` : "") +
    fmtMonto(cobro.monto, cobro.moneda) +
    (cobro.numCuota != null ? ` · cuota #${cobro.numCuota}` : "") +
    ` · programado ${fmtFecha(cobro.fechaProgramada)}. Queda a tu nombre.`;

  const titulo = !yaFacturado
    ? "Marcar facturado"
    : cobro.numeroFactura
      ? "Cambiar el número de factura"
      : "Agregar el número de factura";

  return (
    <Modal
      open
      onClose={onCancel}
      size="md"
      z="z-[70]"
      title={titulo}
      description={descripcion}
      footer={
        <>
          <button type="button" onClick={onCancel} className="text-xs text-fg-muted hover:text-fg px-2 py-1.5">
            Cancelar
          </button>
          <button
            type="button"
            disabled={!valido || cargando}
            onClick={confirmar}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-brand/30 text-brand bg-brand/10 hover:bg-brand/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {yaFacturado ? "Guardar" : "Marcar facturado"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {cargando && <p className="text-xs text-fg-muted">Buscando las facturas de este cliente en el espejo de Odoo…</p>}
        {errorCarga && (
          <Alert variant="warning">
            <p className="text-xs">{errorCarga} Podés teclear el número igual.</p>
          </Alert>
        )}

        {via === "ODOO" && datos && !hayLista && (
          <Alert variant="info">
            <p className="text-xs">
              {datos.clientesDeOdoo === 0
                ? "Esta cuenta todavía no está emparejada con un cliente de Odoo, así que no hay facturas para elegir. Tecleá el número."
                : `El espejo de Odoo no tiene facturas de este cliente en ${cobro.moneda} sin usar${
                    datos.espejoAl ? ` (última lectura buena: ${fmtFecha(datos.espejoAl)})` : ""
                  }. Tecleá el número.`}
            </p>
          </Alert>
        )}

        {hayLista && datos && (
          <div>
            <p className="text-[11px] font-medium text-fg-muted mb-1">Elegí la factura en Odoo</p>
            <ul className="max-h-56 overflow-y-auto space-y-1 pr-1">
              {datos.candidatas.map((f) => {
                const activa = forma === "espejo" && elegida === f.numero;
                return (
                  <li key={f.numero}>
                    <button
                      type="button"
                      aria-pressed={activa}
                      onClick={() => {
                        setForma("espejo");
                        setElegida(f.numero);
                      }}
                      className={`w-full text-left rounded-lg border px-2.5 py-1.5 transition-colors ${
                        activa ? "border-brand bg-brand/10" : "border-line bg-surface hover:bg-surface-hover"
                      }`}
                    >
                      <span className="flex flex-wrap items-center gap-x-2 text-xs">
                        <span className="font-medium text-fg">{f.numero}</span>
                        <span className="text-fg-secondary">{fmtFecha(f.invoiceDate)}</span>
                        <span className="text-fg tabular-nums">{fmtMonto(f.montoNeto, f.moneda)}</span>
                        {f.montoExacto && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-success-line bg-success-surface text-success-ink">
                            monto exacto
                          </span>
                        )}
                      </span>
                      <span className="block text-[10px] text-fg-muted">{f.odooPartnerNombre}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-1 text-[10px] text-fg-muted">Montos sin IVA, igual que los cobros.</p>
          </div>
        )}

        {!cargando && (
          <div className="flex flex-wrap gap-1.5">
            {hayLista && (
              <OpcionForma activa={forma === "espejo"} onClick={() => setForma("espejo")}>
                De la lista de Odoo
              </OpcionForma>
            )}
            <OpcionForma activa={forma === "teclear"} onClick={() => setForma("teclear")}>
              {hayLista ? "No está en la lista: lo tecleo" : "Teclear el número"}
            </OpcionForma>
            <OpcionForma activa={forma === "sinNumero"} onClick={() => setForma("sinNumero")}>
              No tengo el número
            </OpcionForma>
          </div>
        )}

        {forma === "teclear" && !cargando && (
          <div>
            <label className="block text-[11px] font-medium text-fg-muted mb-1">Número de la factura</label>
            <input
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder={
                plataformaFinal === "MERCURY"
                  ? "INV-16"
                  : plataformaFinal === "OTRA"
                    ? "El número que dice QuickBooks"
                    : "FAC/2026/0206"
              }
              maxLength={NUMERO_FACTURA_MAX}
              className={INPUT_CLS}
              autoFocus
            />
            {numeroNormalizado && numeroNormalizado !== numero.trim() && (
              <p className="mt-1 text-[10px] text-fg-muted">Se guarda como {numeroNormalizado}.</p>
            )}
            {plataformaFinal === "ODOO" && numeroNormalizado && datos && (
              <p className="mt-1 text-[10px] text-warn-ink">
                {enLaLista
                  ? "Esa factura está en la lista de arriba: elegila ahí y la fecha sale del documento."
                  : `No está en el espejo de Odoo${
                      datos.espejoAl ? ` (última lectura buena: ${fmtFecha(datos.espejoAl)})` : ""
                    }. Se guarda igual; revisá que sea el número del documento.`}
              </p>
            )}
            {aviso && <p className="mt-1 text-[10px] text-warn-ink">{aviso}</p>}
          </div>
        )}

        {forma === "sinNumero" && (
          <div>
            <label className="block text-[11px] font-medium text-fg-muted mb-1">¿Por qué no tenés el número?</label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              maxLength={MOTIVO_SIN_NUMERO_MAX}
              placeholder="Ej.: QuickBooks no numera las facturas en el libro"
              className={INPUT_CLS}
              autoFocus
            />
            <p className="mt-1 text-[10px] text-fg-muted">
              Queda marcada a tu nombre. Cuando tengas el número, lo cambiás desde el cronograma de la cuenta.
            </p>
          </div>
        )}

        {/* Etapa 12: dónde y a quién. Con un documento del espejo lo dice el documento (abajo). */}
        {!cargando && !candidata && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-fg-muted mb-1">¿Dónde se emitió?</label>
              <select
                value={plataforma ?? ""}
                onChange={(e) => setPlataforma(esPlataformaDeCobro(e.target.value) ? e.target.value : null)}
                className={SELECT_CLS}
              >
                <option value="">Sin decir</option>
                {PLATAFORMAS_DE_COBRO.map((p) => (
                  <option key={p} value={p}>
                    {NOMBRE_DE_PLATAFORMA[p]}
                  </option>
                ))}
              </select>
            </div>
            {sociedadesDeLaPlataforma.length > 0 && (
              <div>
                <label className="block text-[11px] font-medium text-fg-muted mb-1">¿A qué sociedad se le facturó?</label>
                <select
                  value={sociedadFinal ?? ""}
                  onChange={(e) => setSociedadId(e.target.value || null)}
                  className={SELECT_CLS}
                >
                  <option value="">{sociedadesDeLaPlataforma.length >= 2 ? "Elegí la sociedad" : "Sin anotar"}</option>
                  {sociedadesDeLaPlataforma.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
        {faltaSociedad && plataformaFinal && (
          <p className="text-[10px] text-warn-ink">
            Esta cuenta factura por {NOMBRE_DE_PLATAFORMA[plataformaFinal]} con {sociedadesDeLaPlataforma.length} sociedades:
            elegí a cuál se le facturó. Nexus no lo adivina.
          </p>
        )}

        {candidata ? (
          <p className="text-[11px] text-fg-secondary">
            Emitida el {fmtFecha(candidata.invoiceDate)}, según Odoo, a nombre de «{candidata.odooPartnerNombre}».
            {yaFacturado && cobro.fechaEmision !== candidata.invoiceDate
              ? ` La fecha de emisión del cobro pasa de ${fmtFecha(cobro.fechaEmision)} a esa.`
              : ""}
          </p>
        ) : (
          forma !== "espejo" &&
          !cargando && (
            <div>
              <label className="block text-[11px] font-medium text-fg-muted mb-1">¿Cuándo se emitió la factura?</label>
              <input
                type="date"
                value={fecha}
                max={todayISO}
                onChange={(e) => setFecha(e.target.value)}
                className={INPUT_CLS}
              />
            </div>
          )
        )}
      </div>
    </Modal>
  );
}

function OpcionForma({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={activa}
      onClick={onClick}
      className={`text-[11px] font-medium px-2 py-1 rounded-md border transition-colors ${
        activa ? "border-brand/30 text-brand bg-brand/10" : "border-line text-fg-secondary hover:bg-surface-hover"
      }`}
    >
      {children}
    </button>
  );
}
