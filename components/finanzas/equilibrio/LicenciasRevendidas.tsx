"use client";

/**
 * components/finanzas/equilibrio/LicenciasRevendidas.tsx — las licencias revendidas en el punto de equilibrio (plan «Un
 * solo libro financiero», etapa «Servicio y licencia», 2026-10-17).
 *
 * Qué contratos revenden licencias, qué parte de cada uno es servicio de Smarteam, cuánto se le paga al proveedor, y
 * cómo cuentan en el equilibrio: solo el servicio (Alex, 16-oct) o el ingreso entero con la licencia como gasto (Marco,
 * 16-oct). Lo decide dirección acá mismo. La regla: lib/finanzas/licencias.ts. Reemplaza el aviso fijo de kölbi.
 */
import { useEffect, useState } from "react";
import { Alert, Button, Drawer, Input, ListSkeleton, Modal, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import { fmtMontoLibro, parseMontoLocal } from "@/lib/cobranza/montos";
import {
  parteDeServicioDe,
  problemasDeLicencia,
  PROVEEDORES_SUGERIDOS,
  type DatosDeLicencia,
  type LicenciaDeContrato,
  type ModoLicencias,
  type ResumenDeLicencia,
} from "@/lib/finanzas/licencias";
import { MESES_DEL_CONTRATO, type ResumenDeLoVendido } from "@/lib/finanzas/lo-vendido";

export interface LicenciasDelReporte {
  modo: ModoLicencias;
  decision: { modo: ModoLicencias; decididoPor: string; decididoEn: string } | null;
  contratos: ResumenDeLicencia[];
  sinCosto: number;
  /** Lo vendido según las propuestas ganadas. Opcional: un reporte armado antes de 2026-10-18 no lo trae. */
  dePropuestas?: ResumenDeLoVendido;
}

const BOTON = "shrink-0 rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-fg-secondary hover:bg-surface-hover";

const QUE_ES: Record<ModoLicencias, string> = {
  SOLO_SERVICIO: "Cuenta solo el servicio: de lo facturado a estos contratos entra la parte de servicio, y la licencia ni suma ni resta.",
  INGRESO_Y_COSTO: "Cuenta todo lo facturado como ingreso, y lo que se le paga al proveedor sale como gasto (rubro «licencias revendidas»).",
};

export default function LicenciasRevendidas({
  licencias,
  pagosAHubspot,
  anio,
  nombres,
  onCambio,
}: {
  licencias: LicenciasDelReporte;
  /** Los pagos grandes de Mercury a HubSpot del año: la evidencia de lo que se paga por las licencias. */
  pagosAHubspot?: { total: number; pagos: number };
  anio: number;
  nombres: Record<string, string>;
  /** Se cargó, editó o decidió algo: el reporte se vuelve a armar. */
  onCambio: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [decidiendo, setDecidiendo] = useState(false);
  const firmo = licencias.decision ? (nombres[licencias.decision.decididoPor.toLowerCase()] ?? licencias.decision.decididoPor) : null;

  return (
    <section aria-label="Licencias revendidas" className="flex flex-col rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 px-5 pb-3 pt-4">
        <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-0.5">
          <h2 className="text-lg font-semibold text-fg">Licencias revendidas</h2>
          <span className="text-xs text-fg-muted">
            {QUE_ES[licencias.modo]}{" "}
            {licencias.decision ? `Lo decidió ${firmo}.` : "Nadie lo decidió todavía: rige lo que estaba con kölbi."}
          </span>
        </div>
        <button type="button" className={BOTON} onClick={() => setDecidiendo(true)}>
          {licencias.decision ? "Cambiar cómo cuentan" : "Decidir cómo cuentan"}
        </button>
        <button type="button" className={BOTON} onClick={() => setEditando(true)}>
          Contratos
        </button>
      </div>

      {licencias.contratos.length === 0 ? (
        <p className="border-t border-line px-5 py-3 text-[13px] text-fg-muted">
          Ningún contrato cargado: todo lo facturado cuenta como servicio. Carga los que revenden licencias en «Contratos».
        </p>
      ) : (
        <ul>
          {licencias.contratos.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-3.5 gap-y-1 border-t border-line px-5 py-2.5 text-[13px]">
              <span className="min-w-0 flex-[1_1_220px] font-semibold text-fg">
                {c.cuentaNombre} · {c.moneda}
              </span>
              <span className="text-fg-secondary">{c.pctServicio.toLocaleString("es-CR")} % servicio</span>
              <span className="text-fg-secondary">
                {c.costoMensual === null ? (
                  <span className="text-warn-ink">sin el costo de {c.proveedor}</span>
                ) : (
                  `${c.proveedor}: ${fmtMontoLibro(c.costoMensual, c.costoMoneda)} al mes`
                )}
              </span>
              <span className="text-xs text-fg-muted">{c.fuente}</span>
            </li>
          ))}
        </ul>
      )}

      {licencias.modo === "INGRESO_Y_COSTO" && licencias.sinCosto > 0 && (
        <div className="border-t border-line px-5 py-3">
          <Alert variant="warning" title={`${licencias.sinCosto === 1 ? "Un contrato" : `${licencias.sinCosto} contratos`} sin lo que se le paga al proveedor`}>
            Cuentan el ingreso entero sin su gasto: el margen sale más alto de lo que es. Carga el costo en «Contratos».
          </Alert>
        </div>
      )}
      {licencias.dePropuestas && licencias.dePropuestas.ganadas > 0 && <LoVendidoDeLasPropuestas resumen={licencias.dePropuestas} />}
      {pagosAHubspot && pagosAHubspot.total > 0 && (
        <p className="border-t border-line px-5 py-2.5 text-xs text-fg-muted">
          En {anio} salieron de Mercury {fmtMontoLibro(pagosAHubspot.total, "USD")} a HubSpot en{" "}
          {pagosAHubspot.pagos === 1 ? "un pago grande" : `${pagosAHubspot.pagos} pagos grandes`}: sirve para comprobar el costo cargado.
        </p>
      )}

      {editando && (
        <EditorDeContratos
          onClose={() => setEditando(false)}
          onCambio={() => {
            onCambio();
          }}
        />
      )}
      {decidiendo && (
        <DecidirLicencias
          actual={licencias.modo}
          onClose={() => setDecidiendo(false)}
          onDecidido={() => {
            setDecidiendo(false);
            onCambio();
          }}
        />
      )}
    </section>
  );
}

/**
 * Lo vendido según las propuestas ganadas (lib/finanzas/lo-vendido.ts): cuánto es servicio, cuánto licencia y el margen
 * de las que factura Smarteam. Las que traen el dato completo ya están en la lista de contratos de arriba (dicen
 * «Propuesta…» como fuente); las demás dicen por qué no entran, y siguen con la carga a mano.
 */
function LoVendidoDeLasPropuestas({ resumen }: { resumen: ResumenDeLoVendido }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="border-t border-line px-5 py-3">
      <button
        type="button"
        className="flex w-full flex-wrap items-baseline gap-x-2 text-left text-[13px]"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
      >
        <span className="font-semibold text-fg">Lo vendido según las propuestas ganadas</span>
        <span className="text-xs text-fg-muted">
          {resumen.ganadas === 1 ? "1 ganada" : `${resumen.ganadas} ganadas`} · {resumen.conLicencias} con licencias ·{" "}
          {resumen.entran === 1 ? "1 entra" : `${resumen.entran} entran`} como contrato
        </span>
        <span className="ml-auto text-xs font-semibold text-brand">{abierto ? "Ocultar" : "Ver"}</span>
      </button>
      {abierto && (
        <ul className="mt-2 flex flex-col">
          {resumen.propuestas.map((p) => (
            <li key={p.businessCaseId} className="flex flex-wrap items-baseline gap-x-3.5 gap-y-0.5 border-t border-line py-2 text-[13px]">
              <span className="min-w-0 flex-[1_1_220px]">
                <span className="font-semibold text-fg">{p.clienteNombre}</span>
                <span className="text-fg-muted"> · {p.nombre} · ganada el {p.fechaCierre}</span>
              </span>
              <span className="text-fg-secondary">Servicio {fmtMontoLibro(p.servicioEnElContrato, p.moneda)}</span>
              <span className="text-fg-secondary">Licencias {fmtMontoLibro(p.licenciasEnElContrato, p.moneda)}</span>
              {p.margenEnElContrato !== null && (
                <span className="text-fg-secondary">Margen {fmtMontoLibro(p.margenEnElContrato, p.moneda)}</span>
              )}
              <span className={cn("basis-full text-xs", p.entra ? "text-fg-muted" : "text-warn-ink")}>
                {p.entra ? "Entra como contrato: reemplaza a la carga a mano en sus meses." : p.porQueNoEntra}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-xs text-fg-muted">
        Cuenta {MESES_DEL_CONTRATO} meses desde el cierre. Una propuesta entra solo si Ventas anotó el precio de lista de cada licencia que factura Smarteam.
      </p>
    </div>
  );
}

/** La decisión de dirección: cómo cuentan las licencias. Va firmada (/api/finanzas/decisiones, solo Super Admin). */
export function DecidirLicencias({ actual, onClose, onDecidido }: { actual: ModoLicencias; onClose: () => void; onDecidido: () => void }) {
  const toast = useToast();
  const [modo, setModo] = useState<ModoLicencias>(actual);
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  async function guardar() {
    setGuardando(true);
    try {
      await fetchJson("/api/finanzas/decisiones", {
        method: "POST",
        body: JSON.stringify({ clave: "licencias-en-equilibrio", valor: modo, nota: nota.trim() || null }),
      });
      toast.success(modo === "SOLO_SERVICIO" ? "Decidido: de las licencias cuenta solo el servicio." : "Decidido: cuenta todo lo facturado y la licencia sale como gasto.");
      onDecidido();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar la decisión.");
    } finally {
      setGuardando(false);
    }
  }
  const opcion = (v: ModoLicencias, t: string) => (
    <label className={cn("flex cursor-pointer items-start gap-2.5 rounded-lg border p-3", modo === v ? "border-brand bg-info-surface" : "border-line")}>
      <input type="radio" name="licencias" checked={modo === v} onChange={() => setModo(v)} className="mt-0.5" />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-fg">{t}</span>
        <span className="text-[13px] leading-[19px] text-fg-secondary">{QUE_ES[v]}</span>
      </span>
    </label>
  );
  return (
    <Modal
      open
      onClose={onClose}
      title="¿Cómo cuentan las licencias revendidas?"
      description="Cambia lo facturado, el gasto y el margen de los contratos con licencias. La caja no cambia: lo que entró, entró."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => void guardar()} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar la decisión"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2.5">
        {opcion("SOLO_SERVICIO", "Solo el servicio (Alex, 16-oct)")}
        {opcion("INGRESO_Y_COSTO", "Ingreso completo y la licencia como gasto (Marco, 16-oct)")}
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-fg">Por qué (opcional)</span>
          <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} maxLength={1000} />
        </label>
      </div>
    </Modal>
  );
}

/* ── El editor de contratos ─────────────────────────────────────────────────────────────────────────────────────── */

type Formulario = Record<keyof Omit<DatosDeLicencia, "costoMoneda" | "moneda">, string> & { moneda: "USD" | "CRC"; costoMoneda: "" | "USD" | "CRC" };

const VACIO: Formulario = {
  cuentaId: "",
  moneda: "USD",
  montoContrato: "",
  montoServicio: "",
  proveedor: "HubSpot",
  costoMonto: "",
  costoMoneda: "",
  costoCadaMeses: "",
  desde: "",
  hasta: "",
  fuente: "",
  notas: "",
};

/**
 * «70.000», «161.700,50» o «161700.50», con la regla del importador (`parseMontoLocal`): un separador solo seguido de
 * exactamente 3 dígitos es de miles; con 1-2, decimal; con los dos, el último es el decimal. Vacío = null. Un texto
 * que no es un número da NaN, para que `problemasDeLicencia` lo marque y no se guarde un 0 en silencio.
 */
const numero = (s: string) => {
  const t = s.trim();
  if (t === "") return null;
  return parseMontoLocal(t) ?? Number.NaN;
};

function aDatos(f: Formulario): DatosDeLicencia {
  return {
    cuentaId: f.cuentaId,
    moneda: f.moneda,
    montoContrato: numero(f.montoContrato) ?? 0,
    montoServicio: numero(f.montoServicio) ?? 0,
    proveedor: f.proveedor,
    costoMonto: numero(f.costoMonto),
    costoMoneda: f.costoMoneda || null,
    costoCadaMeses: numero(f.costoCadaMeses),
    desde: f.desde || null,
    hasta: f.hasta || null,
    fuente: f.fuente,
    notas: f.notas || null,
  };
}

function deContrato(l: LicenciaDeContrato): Formulario {
  return {
    cuentaId: l.cuentaId,
    moneda: l.moneda === "CRC" ? "CRC" : "USD",
    montoContrato: String(l.montoContrato),
    montoServicio: String(l.montoServicio),
    proveedor: l.proveedor,
    costoMonto: l.costoMonto === null ? "" : String(l.costoMonto),
    costoMoneda: l.costoMoneda === "CRC" || l.costoMoneda === "USD" ? l.costoMoneda : "",
    costoCadaMeses: l.costoCadaMeses === null ? "" : String(l.costoCadaMeses),
    desde: l.desde ?? "",
    hasta: l.hasta ?? "",
    fuente: l.fuente,
    notas: l.notas ?? "",
  };
}

function EditorDeContratos({ onClose, onCambio }: { onClose: () => void; onCambio: () => void }) {
  const toast = useToast();
  const [datos, setDatos] = useState<{ contratos: LicenciaDeContrato[]; cuentas: Array<{ cuentaId: string; nombre: string }> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** null = la lista; "nuevo" = un contrato nuevo; un id = editar ese. */
  const [abierto, setAbierto] = useState<string | null>(null);
  const [f, setF] = useState<Formulario>(VACIO);
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    try {
      setDatos(await fetchJson("/api/cobranza/licencias"));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudieron cargar los contratos.");
    }
  };
  useEffect(() => {
    void cargar();
  }, []);

  const abrir = (l: LicenciaDeContrato | null) => {
    setAbierto(l ? l.id : "nuevo");
    setF(l ? deContrato(l) : VACIO);
  };

  const problemas = abierto ? problemasDeLicencia(aDatos(f)) : [];
  const pct = (() => {
    const d = aDatos(f);
    return d.montoContrato > 0 && Number.isFinite(d.montoServicio) ? Math.round(parteDeServicioDe(d) * 1000) / 10 : null;
  })();

  const guardar = async () => {
    if (abierto === "nuevo" && !f.cuentaId) {
      toast.error("Elige la cuenta.");
      return;
    }
    setGuardando(true);
    try {
      const d = aDatos(f);
      if (abierto === "nuevo") await fetchJson("/api/cobranza/licencias", { method: "POST", body: JSON.stringify(d) });
      else {
        const { cuentaId: _cuenta, ...resto } = d;
        void _cuenta;
        await fetchJson(`/api/cobranza/licencias/${abierto}`, { method: "PATCH", body: JSON.stringify(resto) });
      }
      toast.success("Guardado. El punto de equilibrio se vuelve a armar.");
      setAbierto(null);
      await cargar();
      onCambio();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  const archivar = async (l: LicenciaDeContrato) => {
    try {
      await fetchJson(`/api/cobranza/licencias/${l.id}`, { method: "DELETE" });
      toast.success(`Archivado: ${l.cuentaNombre} (${l.moneda}) vuelve a contar todo como servicio.`);
      await cargar();
      onCambio();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo archivar.");
    }
  };

  /** Con `monedaDelMonto`, debajo del campo va el número que se va a guardar: «70.000» no puede leerse como 70 sin que se vea. */
  const campo = (k: keyof Formulario, etiqueta: string, ayuda?: string, tipo = "text", monedaDelMonto?: string) => {
    const leido = monedaDelMonto !== undefined && f[k].trim() !== "" ? numero(f[k]) : null;
    return (
      <label className="flex flex-col gap-1">
        <span className="text-[13px] font-medium text-fg">{etiqueta}</span>
        <Input type={tipo} value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} />
        {leido !== null && (
          <span className={cn("text-xs", Number.isFinite(leido) ? "text-fg-secondary" : "text-danger-ink")}>
            {Number.isFinite(leido) ? `Se guarda: ${fmtMontoLibro(leido, monedaDelMonto ?? null)}` : "No se entiende el número."}
          </span>
        )}
        {ayuda && <span className="text-xs text-fg-muted">{ayuda}</span>}
      </label>
    );
  };

  return (
    <Drawer open onClose={onClose} size="lg" title="Contratos con licencias revendidas">
      {error && <Alert variant="danger" title="No se pudieron cargar">{error}</Alert>}
      {!datos && !error && <ListSkeleton rows={3} />}
      {datos && abierto === null && (
        <div className="space-y-3">
          <p className="text-sm text-fg-secondary">
            Uno por cuenta y moneda. Los números van sin IVA y salen del contrato (el anexo, la propuesta). Lo que se le paga al
            proveedor se usa si dirección decide contar el ingreso completo.
          </p>
          {datos.contratos.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line px-3 py-2 text-[13px]">
              <span className="min-w-0 flex-[1_1_200px] font-semibold text-fg">
                {l.cuentaNombre} · {l.moneda}
              </span>
              <span className="text-fg-secondary">
                servicio {fmtMontoLibro(l.montoServicio, l.moneda)} de {fmtMontoLibro(l.montoContrato, l.moneda)}
              </span>
              <button type="button" className={BOTON} onClick={() => abrir(l)}>
                Editar
              </button>
              <button type="button" className={BOTON} onClick={() => void archivar(l)}>
                Archivar
              </button>
            </div>
          ))}
          <Button variant="primary" size="sm" onClick={() => abrir(null)}>
            Cargar un contrato
          </Button>
        </div>
      )}
      {datos && abierto !== null && (
        <div className="space-y-3">
          {abierto === "nuevo" ? (
            <label className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-fg">Cuenta</span>
              <Select value={f.cuentaId} onChange={(e) => setF((x) => ({ ...x, cuentaId: e.target.value }))}>
                <option value="">Elige la cuenta…</option>
                {datos.cuentas.map((c) => (
                  <option key={c.cuentaId} value={c.cuentaId}>
                    {c.nombre}
                  </option>
                ))}
              </Select>
            </label>
          ) : (
            <p className="text-sm font-semibold text-fg">{datos.contratos.find((l) => l.id === abierto)?.cuentaNombre}</p>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-fg">Moneda en que se le factura</span>
            <Select value={f.moneda} onChange={(e) => setF((x) => ({ ...x, moneda: e.target.value as "USD" | "CRC" }))}>
              <option value="USD">Dólares</option>
              <option value="CRC">Colones</option>
            </Select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            {campo("montoContrato", "Total del contrato", "Sin IVA.", "text", f.moneda)}
            {campo("montoServicio", "De eso, servicio de Smarteam", pct === null ? undefined : `${pct.toLocaleString("es-CR")} % del contrato.`, "text", f.moneda)}
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-fg">Proveedor de la licencia</span>
            <Input list="proveedores-licencia" value={f.proveedor} onChange={(e) => setF((x) => ({ ...x, proveedor: e.target.value }))} />
            <datalist id="proveedores-licencia">
              {PROVEEDORES_SUGERIDOS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
          <div className="grid grid-cols-3 gap-3">
            {campo("costoMonto", "Lo que se le paga", "Vacío si no se sabe.", "text", f.costoMoneda || f.moneda)}
            <label className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-fg">Moneda</span>
              <Select value={f.costoMoneda} onChange={(e) => setF((x) => ({ ...x, costoMoneda: e.target.value as Formulario["costoMoneda"] }))}>
                <option value="">—</option>
                <option value="USD">Dólares</option>
                <option value="CRC">Colones</option>
              </Select>
            </label>
            {campo("costoCadaMeses", "Cada cuántos meses", "3 = trimestral.")}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {campo("desde", "Rige desde", "Vacío = desde siempre.", "date")}
            {campo("hasta", "Hasta", "Vacío = sin fin.", "date")}
          </div>
          {campo("fuente", "De dónde salen los números", "El anexo y la página, la propuesta.")}
          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-fg">Notas</span>
            <Textarea rows={2} value={f.notas} onChange={(e) => setF((x) => ({ ...x, notas: e.target.value }))} />
          </label>
          {problemas.length > 0 && (
            <ul className="list-disc pl-5 text-xs text-warn-ink">
              {problemas.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={() => void guardar()} disabled={guardando || problemas.length > 0}>
              {guardando ? "Guardando…" : "Guardar"}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setAbierto(null)}>
              Volver
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}
