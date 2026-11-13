"use client";

/**
 * components/finanzas/caja/FormularioDeCompromiso.tsx — anotar o editar un pago comprometido, o apartar plata.
 *
 * Los campos cambian con la categoría, porque cada escenario de la política necesita otra cosa: el A (servicios
 * profesionales) la fecha de la factura y el cobro del que depende; el B (artículos físicos) el pedido, la entrega y el
 * adelanto; lo demás, una fecha. Una reserva pide solo para cuándo.
 */
import { useState } from "react";
import { Button, Field, Input, Modal, Segmentado, Selector, Textarea } from "@/components/ui";
import { CATEGORIAS_DE_PAGO, ETIQUETA_DE_CATEGORIA, REGLA_DE_ESCENARIO, escenarioDe, type CategoriaDePago } from "@/lib/finanzas/caja/politica";
import type { CompromisoDTO } from "@/lib/finanzas/caja/caja-server";

export interface DatosDelFormulario {
  tipo: "PAGO" | "RESERVA";
  concepto: string;
  beneficiario: string | null;
  categoria: CategoriaDePago;
  monto: number;
  moneda: "CRC" | "USD";
  fecha: string | null;
  facturaRecibidaEl: string | null;
  entregadoEl: string | null;
  adelantoPct: number;
  cobroId: string | null;
  sociedad: string | null;
  nota: string | null;
}

interface Props {
  abierto: boolean;
  inicial: CompromisoDTO | null;
  tipoNuevo: "PAGO" | "RESERVA";
  cobros: Array<{ id: string; etiqueta: string }>;
  comisionistasElDia7: boolean;
  onCerrar: () => void;
  onGuardar: (d: DatosDelFormulario) => Promise<void>;
}

const vacio = (s: string) => (s.trim() ? s.trim() : null);

export default function FormularioDeCompromiso({ abierto, inicial, tipoNuevo, cobros, comisionistasElDia7, onCerrar, onGuardar }: Props) {
  const [tipo, setTipo] = useState<"PAGO" | "RESERVA">(inicial?.tipo ?? tipoNuevo);
  const [concepto, setConcepto] = useState(inicial?.concepto ?? "");
  const [beneficiario, setBeneficiario] = useState(inicial?.beneficiario ?? "");
  const [categoria, setCategoria] = useState<CategoriaDePago>(inicial?.categoria ?? (tipoNuevo === "RESERVA" ? "OTRO" : "SERVICIOS_PROFESIONALES"));
  const [monto, setMonto] = useState(inicial ? String(inicial.monto) : "");
  const [moneda, setMoneda] = useState<"CRC" | "USD">(inicial?.moneda ?? "USD");
  const [fecha, setFecha] = useState(inicial?.fechaISO ?? "");
  const [factura, setFactura] = useState(inicial?.facturaRecibidaISO ?? "");
  const [entregado, setEntregado] = useState(inicial?.entregadoISO ?? "");
  const [adelanto, setAdelanto] = useState(String(inicial?.adelantoPct ?? 0));
  const [cobroId, setCobroId] = useState<string | null>(inicial?.cobroId ?? null);
  const [sociedad, setSociedad] = useState(inicial?.sociedad ?? "");
  const [nota, setNota] = useState(inicial?.nota ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const escenario = tipo === "PAGO" ? escenarioDe(categoria, { comisionistasElDia7 }) : null;
  const usaCobro = escenario === "A" || escenario === "MES_VENCIDO";

  async function guardar() {
    const n = Number(monto.replace(/,/g, ""));
    if (!concepto.trim()) return setError("Di qué es.");
    if (!Number.isFinite(n) || n <= 0) return setError("El monto tiene que ser mayor que cero.");
    if (tipo === "RESERVA" && !fecha) return setError("Una reserva necesita para cuándo es.");
    setError(null);
    setGuardando(true);
    try {
      await onGuardar({
        tipo,
        concepto: concepto.trim(),
        beneficiario: tipo === "PAGO" ? vacio(beneficiario) : null,
        categoria: tipo === "PAGO" ? categoria : "OTRO",
        monto: n,
        moneda,
        fecha: fecha || null,
        facturaRecibidaEl: tipo === "PAGO" && escenario !== "FECHA_FIJA" ? factura || null : null,
        entregadoEl: escenario === "B" ? entregado || null : null,
        adelantoPct: escenario === "B" ? Math.max(0, Math.min(50, Number(adelanto) || 0)) : 0,
        cobroId: usaCobro ? cobroId : null,
        sociedad: vacio(sociedad),
        nota: vacio(nota),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      open={abierto}
      onClose={onCerrar}
      title={inicial ? "Editar" : tipo === "RESERVA" ? "Apartar plata" : "Anotar un pago comprometido"}
      description={
        tipo === "RESERVA"
          ? "La plata apartada deja de contar como libre desde hoy y sale del banco el día que es para."
          : "La fecha de pago la pone la política según la categoría. Si ya sabes el día, anótalo y manda tu fecha."
      }
      footer={
        <div className="flex items-center justify-end gap-2">
          {error && <span className="mr-auto text-xs text-danger-ink">{error}</span>}
          <Button variant="secondary" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {!inicial && (
          <Segmentado
            etiqueta="Qué es"
            valor={tipo}
            onCambio={setTipo}
            opciones={[
              { clave: "PAGO", etiqueta: "Un pago" },
              { clave: "RESERVA", etiqueta: "Plata apartada" },
            ]}
          />
        )}
        <Field label={tipo === "RESERVA" ? "Para qué es" : "Qué se paga"} required>
          <Input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder={tipo === "RESERVA" ? "Ej. Aguinaldo de diciembre" : "Ej. Desarrollo de integración de octubre"} />
        </Field>
        {tipo === "PAGO" && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="A quién">
                <Input value={beneficiario} onChange={(e) => setBeneficiario(e.target.value)} placeholder="Proveedor o persona" />
              </Field>
              <Field label="Categoría" hint={escenario ? REGLA_DE_ESCENARIO[escenario] : undefined}>
                <Selector
                  etiqueta="Categoría"
                  placeholder="Elige la categoría"
                  valor={categoria}
                  onElegir={(v) => setCategoria(v as CategoriaDePago)}
                  opciones={CATEGORIAS_DE_PAGO.map((c) => ({ value: c, label: ETIQUETA_DE_CATEGORIA[c] }))}
                />
              </Field>
            </div>
          </>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Monto" required>
            <Input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" placeholder="0" />
          </Field>
          <Field label="Moneda">
            <Segmentado
              etiqueta="Moneda"
              valor={moneda}
              onCambio={setMoneda}
              opciones={[
                { clave: "USD", etiqueta: "Dólares" },
                { clave: "CRC", etiqueta: "Colones" },
              ]}
            />
          </Field>
        </div>
        <Field
          label={tipo === "RESERVA" ? "Para cuándo" : "Fecha de pago (si ya la sabes)"}
          required={tipo === "RESERVA"}
          hint={tipo === "PAGO" && escenario !== "FECHA_FIJA" ? "Vacía, la calcula la política." : tipo === "PAGO" ? "Vacía, se cuenta hoy hasta que la anotes." : undefined}
        >
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Field>
        {tipo === "PAGO" && escenario !== "FECHA_FIJA" && (
          <Field label={escenario === "B" ? "Día del pedido o la factura" : "Día en que llegó la factura"} hint={escenario === "A" ? "Del 1 al 3 se paga el 7; después, el 7 del mes siguiente." : undefined}>
            <Input type="date" value={factura} onChange={(e) => setFactura(e.target.value)} />
          </Field>
        )}
        {escenario === "B" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Adelanto (%)" hint="De 0 a 50 %. Sale el viernes del pedido.">
              <Input value={adelanto} onChange={(e) => setAdelanto(e.target.value)} inputMode="numeric" />
            </Field>
            <Field label="Día en que llegó" hint="El resto sale el viernes del corte de la entrega.">
              <Input type="date" value={entregado} onChange={(e) => setEntregado(e.target.value)} />
            </Field>
          </div>
        )}
        {usaCobro && (
          <Field label="Espera que pague el cliente" hint="Si el pago depende de un cobro, sale hasta que el cliente pague.">
            <div className="flex items-center gap-2">
              <Selector
                etiqueta="Cobro del cliente"
                placeholder="No depende de un cobro"
                valor={cobroId}
                onElegir={(v) => setCobroId(v)}
                opciones={cobros.map((c) => ({ value: c.id, label: c.etiqueta }))}
                minimoParaBuscar={5}
                className="min-w-0 flex-1"
              />
              {cobroId && (
                <Button size="xs" variant="secondary" onClick={() => setCobroId(null)}>
                  Quitar
                </Button>
              )}
            </div>
          </Field>
        )}
        <Field label="Sociedad" hint="La que paga o donde está la plata, si aplica.">
          <Input value={sociedad} onChange={(e) => setSociedad(e.target.value)} />
        </Field>
        <Field label="Nota">
          <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} />
        </Field>
      </div>
    </Modal>
  );
}
