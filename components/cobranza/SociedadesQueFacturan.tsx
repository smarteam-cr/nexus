"use client";

/**
 * components/cobranza/SociedadesQueFacturan.tsx
 *
 * A nombre de quién sale la factura de esta cuenta (etapa 12, 2026-09-13). Una empresa puede facturar con
 * varias sociedades: Grupo INB factura por Mercury como Quirinale Group y como Ingeniería Verde. Hasta hoy
 * cabía una sola razón social por cuenta, y fuera de Odoo no había dónde anotar la segunda.
 *
 * Las fichas de Odoo se muestran, pero se vinculan en Cobranza › Odoo (el emparejado mueve sus facturas). Las
 * de Mercury y QuickBooks se agregan y se sueltan acá, firmadas y con su línea en la bitácora.
 *
 * ⛔ Anotarlas no decide a quién se le factura cada cobro: eso se dice al marcarlo facturado.
 */
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { NOMBRE_DE_PLATAFORMA, type SociedadDeLaCuenta } from "@/lib/cobranza/sociedades";
import { INPUT_CLS, LABEL_CLS, SELECT_CLS } from "./format";

type PlataformaSinFicha = "MERCURY" | "OTRA";

export default function SociedadesQueFacturan({
  cuentaId,
  puedeEditar,
  tituloCls,
}: {
  cuentaId: string;
  /** `cobranza.write`: decide qué se dibuja. El permiso de verdad lo exige el endpoint. */
  puedeEditar: boolean;
  tituloCls: string;
}) {
  const toast = useToast();
  const [sociedades, setSociedades] = useState<SociedadDeLaCuenta[] | null>(null);
  const [plataforma, setPlataforma] = useState<PlataformaSinFicha>("MERCURY");
  const [nombre, setNombre] = useState("");
  const [cedula, setCedula] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const d = await fetchJson<{ sociedades: SociedadDeLaCuenta[] }>(`/api/cobranza/cuentas/${cuentaId}/sociedades`);
      setSociedades(d.sociedades);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudieron cargar las sociedades de la cuenta.");
    }
  }, [cuentaId, toast]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function agregar() {
    const n = nombre.trim();
    if (ocupado || n.length < 2) return;
    setOcupado("agregar");
    try {
      const r = await fetchJson<{ retomada: boolean }>(`/api/cobranza/cuentas/${cuentaId}/sociedades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plataforma, nombre: n, cedula: cedula.trim() || null }),
      });
      toast.success(
        r.retomada
          ? `«${n}» vuelve a facturarle a esta cuenta, a tu nombre.`
          : `«${n}» quedó como sociedad de la cuenta por ${NOMBRE_DE_PLATAFORMA[plataforma]}, a tu nombre.`,
      );
      setNombre("");
      setCedula("");
      await cargar();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo agregar la sociedad.");
    } finally {
      setOcupado(null);
    }
  }

  async function soltar(s: SociedadDeLaCuenta) {
    if (ocupado) return;
    setOcupado(s.id);
    try {
      await fetchJson(`/api/cobranza/cuentas/${cuentaId}/sociedades?sociedadId=${encodeURIComponent(s.id)}`, {
        method: "DELETE",
      });
      toast.success(`«${s.nombre}» ya no le factura a esta cuenta.`);
      await cargar();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo soltar la sociedad.");
    } finally {
      setOcupado(null);
    }
  }

  return (
    <section className="space-y-3">
      <h3 className={tituloCls}>Sociedades que facturan</h3>
      <p className="text-[11px] text-fg-muted">
        A nombre de quién sale la factura. Una empresa puede facturar con varias. A cuál se le facturó cada cobro se
        dice al marcarlo facturado: Nexus no lo elige.
      </p>

      {sociedades === null ? (
        <p className="text-xs text-fg-muted">Cargando…</p>
      ) : sociedades.length === 0 ? (
        <p className="text-xs text-fg-muted rounded-lg border border-dashed border-line px-3 py-3 text-center">
          Sin sociedades anotadas. Las fichas de Odoo se vinculan en Cobranza › Odoo; las de Mercury y QuickBooks se
          agregan acá.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {sociedades.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
              <span className="text-xs font-medium text-fg">{s.nombre}</span>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-line text-fg-muted">
                {NOMBRE_DE_PLATAFORMA[s.plataforma]}
              </span>
              {s.cedula && <span className="font-mono text-[10px] text-fg-muted">{s.cedula}</span>}
              {s.cobros > 0 && (
                <span className="text-[10px] text-fg-muted">
                  · {s.cobros} {s.cobros === 1 ? "cobro facturado" : "cobros facturados"}
                </span>
              )}
              <span className="ml-auto text-[10px] text-fg-muted">
                {s.conFicha
                  ? "Ficha de Odoo: se desvincula en Cobranza › Odoo"
                  : s.confirmadoPor
                    ? `Anotada por ${s.confirmadoPor}`
                    : null}
              </span>
              {!s.conFicha && puedeEditar && s.cobros === 0 && (
                <button
                  type="button"
                  disabled={ocupado !== null}
                  onClick={() => soltar(s)}
                  title="Deja de facturarle a esta cuenta. Queda en la bitácora a tu nombre."
                  className="text-[11px] text-fg-muted underline decoration-dotted hover:text-fg disabled:opacity-50"
                >
                  {ocupado === s.id ? "Soltando…" : "Soltar"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {puedeEditar && (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className={LABEL_CLS}>Plataforma</label>
            <select
              value={plataforma}
              onChange={(e) => setPlataforma(e.target.value === "OTRA" ? "OTRA" : "MERCURY")}
              className={SELECT_CLS}
            >
              <option value="MERCURY">{NOMBRE_DE_PLATAFORMA.MERCURY}</option>
              <option value="OTRA">{NOMBRE_DE_PLATAFORMA.OTRA}</option>
            </select>
          </div>
          <div className="min-w-48 flex-1">
            <label className={LABEL_CLS}>Nombre como sale en la factura</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Quirinale Group"
              className={INPUT_CLS}
            />
          </div>
          <div className="w-40">
            <label className={LABEL_CLS}>Cédula (opcional)</label>
            <input value={cedula} onChange={(e) => setCedula(e.target.value)} className={INPUT_CLS} />
          </div>
          <button
            type="button"
            onClick={agregar}
            disabled={ocupado !== null || nombre.trim().length < 2}
            className="text-xs font-medium px-3 py-2 rounded-lg border border-brand/30 text-brand bg-brand/10 hover:bg-brand/20 transition-colors disabled:opacity-50"
          >
            {ocupado === "agregar" ? "Agregando…" : "Agregar sociedad"}
          </button>
        </div>
      )}
    </section>
  );
}
