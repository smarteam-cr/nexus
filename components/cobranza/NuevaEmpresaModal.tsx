"use client";

/**
 * components/cobranza/NuevaEmpresaModal.tsx
 *
 * Alta de una empresa LIVIANA + su cuenta financiera desde el panel de cartera
 * (AccountSource "manual" — puerto 1). Para las cuentas que hoy viven solo en el
 * Sheet y no tienen proyecto en Nexus. Al crear, refresca la cartera y abre el
 * CuentaDrawer de la cuenta nueva para seguir configurando.
 *
 * Etapa 12 (2026-09-13): si ya hay empresas que se le parecen —de cualquier tipo, por dominio o por
 * nombre—, el servidor responde 409 con la lista y acá se pregunta si es alguna. Elegir una le abre la
 * cuenta a esa; «no es ninguna» crea la nueva. Nexus no elige por la persona: la misma empresa ya estaba
 * dos veces en 4 casos, y unir dos por parecido sería el error opuesto.
 */
import { useState } from "react";
import { Alert, Modal } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import {
  COBRANZA_TIPOS_CUENTA,
  COBRANZA_VIAS_COBRO,
  COBRANZA_MONEDAS,
  TIPO_CUENTA_LABEL,
} from "@/lib/cobranza/schema";
import { CLIENT_KIND_META } from "@/lib/clients/kind";
import type { EmpresaParecida } from "@/lib/cobranza/empresas-parecidas";
import { VIA_COBRO_LABEL, INPUT_CLS, SELECT_CLS, LABEL_CLS } from "./format";
import { DEFAULT_CREDITO_DIAS } from "@/lib/cobranza/engine";

/** La lista que manda el 409, validada: un payload inesperado no puede romper el modal. */
function parecidasDe(payload: unknown): EmpresaParecida[] | null {
  if (!payload || typeof payload !== "object" || !("parecidas" in payload)) return null;
  const lista = payload.parecidas;
  if (!Array.isArray(lista)) return null;
  return lista.filter(
    (p): p is EmpresaParecida =>
      !!p && typeof p === "object" && typeof p.id === "string" && typeof p.nombre === "string" && typeof p.kind === "string",
  );
}

const etiquetaDeTipo = (kind: string) =>
  kind in CLIENT_KIND_META ? CLIENT_KIND_META[kind as keyof typeof CLIENT_KIND_META].label : kind;

export default function NuevaEmpresaModal({
  open,
  onClose,
  onCreated,
  inicial,
}: {
  open: boolean;
  onClose: () => void;
  /** Recibe el cuentaId nuevo para abrir el drawer + refrescar la cartera. */
  onCreated: (cuentaId: string) => void;
  /**
   * Lo que ya se sabe de la empresa: aplicar el libro de Alex la abre con el nombre en factura. Solo precarga;
   * la persona lo corrige y las parecidas se preguntan igual. Se lee al montar.
   */
  inicial?: { nombre: string; tipo: string; viaCobro: string; moneda: string };
}) {
  const toast = useToast();
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [dominio, setDominio] = useState("");
  const [correoCobro, setCorreoCobro] = useState("");
  const [tipo, setTipo] = useState(inicial?.tipo ?? "NACIONAL");
  const [viaCobro, setViaCobro] = useState(inicial?.viaCobro ?? "ODOO");
  const [moneda, setMoneda] = useState(inicial?.moneda ?? "CRC");
  const [diaCobroAncla, setDiaCobroAncla] = useState("");
  const [creditoDias, setCreditoDias] = useState("");
  const [saving, setSaving] = useState(false);
  /** Las empresas parecidas que devolvió el servidor. null = todavía no hubo que preguntar. */
  const [parecidas, setParecidas] = useState<EmpresaParecida[] | null>(null);

  function reset() {
    setNombre("");
    setDominio("");
    setCorreoCobro("");
    setTipo("NACIONAL");
    setViaCobro("ODOO");
    setMoneda("CRC");
    setDiaCobroAncla("");
    setCreditoDias("");
    setParecidas(null);
  }

  async function crear(decision: { empresaExistenteId?: string; noEsNingunaParecida?: boolean } = {}) {
    if (saving) return;
    if (nombre.trim().length < 2) {
      toast.error("Indicá el nombre de la empresa.");
      return;
    }
    setSaving(true);
    try {
      const d = await fetchJson<{ cuentaId: string; clientCreado: boolean }>(
        "/api/cobranza/cuentas/crear-empresa",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nombre: nombre.trim(),
            dominio: dominio.trim().toLowerCase() || null,
            correoCobro: correoCobro.trim().toLowerCase() || null,
            tipo,
            viaCobro,
            moneda,
            diaCobroAncla: diaCobroAncla.trim() ? Number(diaCobroAncla) : null,
            creditoDias: creditoDias.trim() ? Number(creditoDias) : null,
            ...decision,
          }),
        },
      );
      toast.success(
        d.clientCreado
          ? "Empresa creada con su cuenta. Completá los servicios."
          : "La empresa ya existía — se abrió su cuenta.",
      );
      reset();
      onCreated(d.cuentaId);
    } catch (e) {
      const lista = e instanceof ApiError && e.status === 409 ? parecidasDe(e.payload) : null;
      if (lista && lista.length > 0) setParecidas(lista);
      else toast.error(e instanceof ApiError ? e.message : "No se pudo crear la empresa.");
    } finally {
      setSaving(false);
    }
  }

  const compartenDominio = !!parecidas?.some((p) => p.via === "DOMINIO");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nueva empresa"
      description="Alta de una cuenta de cobro sin proyecto en Nexus (ej. suscripciones que hoy viven solo en el Sheet)."
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-xs text-fg-muted hover:text-fg px-2 py-1.5"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => crear()}
            disabled={saving || parecidas !== null}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-brand/30 text-brand bg-brand/10 hover:bg-brand/20 transition-colors disabled:opacity-50"
          >
            {saving ? "Creando…" : "Crear empresa"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {parecidas && (
          <Alert variant="warning" title="Ya hay empresas que se le parecen">
            <p className="text-xs">
              ¿Es alguna de estas? Crear otra deja la misma empresa dos veces, con sus cobros repartidos entre las
              dos.
            </p>
            <ul className="mt-2 space-y-1">
              {parecidas.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface px-2 py-1.5">
                  <span className="text-xs font-medium text-fg">{p.nombre}</span>
                  <span className="text-[10px] text-fg-muted">
                    {etiquetaDeTipo(p.kind)} · {p.via === "DOMINIO" ? "mismo dominio" : "nombre parecido"}
                    {p.cuentaId ? " · ya tiene cuenta de cobro" : ""}
                  </span>
                  {p.kind === "CLIENTE" ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => crear({ empresaExistenteId: p.id })}
                      className="ml-auto text-[11px] font-medium px-2 py-1 rounded-md border border-brand/30 text-brand bg-brand/10 hover:bg-brand/20 disabled:opacity-50"
                    >
                      {p.cuentaId ? "Es esta: abrir su cuenta" : "Es esta: abrirle la cuenta"}
                    </button>
                  ) : (
                    <span className="ml-auto text-[10px] text-fg-muted">
                      Si es esta, pasala a Cliente en su ficha y volvé a intentar.
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {compartenDominio ? (
              <p className="mt-2 text-xs">
                Una comparte el dominio: si es otra empresa, sacá el dominio y volvé a crear.
              </p>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={() => crear({ noEsNingunaParecida: true })}
                className="mt-2 text-[11px] font-medium underline decoration-dotted hover:opacity-80 disabled:opacity-50"
              >
                No es ninguna: crear «{nombre.trim()}»
              </button>
            )}
          </Alert>
        )}
        <div>
          <label className={LABEL_CLS}>Nombre de la empresa</label>
          <input
            value={nombre}
            onChange={(e) => {
              setNombre(e.target.value);
              setParecidas(null);
            }}
            placeholder="Ej. Ferretería Noelitto"
            className={INPUT_CLS}
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL_CLS}>Dominio (opcional)</label>
            <input
              value={dominio}
              onChange={(e) => {
                setDominio(e.target.value);
                setParecidas(null);
              }}
              placeholder="empresa.com"
              className={INPUT_CLS}
            />
            <p className="mt-1 text-[10px] text-fg-muted">
              Con dominio, las sesiones del cliente se vinculan solas.
            </p>
          </div>
          <div>
            <label className={LABEL_CLS}>Correo de cobro (opcional)</label>
            <input
              value={correoCobro}
              onChange={(e) => setCorreoCobro(e.target.value)}
              placeholder="pagos@empresa.com"
              className={INPUT_CLS}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL_CLS}>Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={SELECT_CLS}>
              {COBRANZA_TIPOS_CUENTA.map((t) => (
                <option key={t} value={t}>{TIPO_CUENTA_LABEL[t] ?? t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>Vía de cobro</label>
            <select value={viaCobro} onChange={(e) => setViaCobro(e.target.value)} className={SELECT_CLS}>
              {COBRANZA_VIAS_COBRO.map((t) => (
                <option key={t} value={t}>{VIA_COBRO_LABEL[t] ?? t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>Moneda</label>
            <select value={moneda} onChange={(e) => setMoneda(e.target.value)} className={SELECT_CLS}>
              {COBRANZA_MONEDAS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>Crédito (días, opcional)</label>
            <input
              type="number"
              min={1}
              max={365}
              value={creditoDias}
              onChange={(e) => setCreditoDias(e.target.value)}
              placeholder={`Vacío = default (${DEFAULT_CREDITO_DIAS} días)`}
              className={INPUT_CLS}
            />
          </div>
        </div>
        <div>
          <label className={LABEL_CLS}>Día de cobro ancla (1–31, opcional)</label>
          <input
            type="number"
            min={1}
            max={31}
            value={diaCobroAncla}
            onChange={(e) => setDiaCobroAncla(e.target.value)}
            placeholder="1–31 · vacío = día del arranque"
            className={INPUT_CLS}
          />
        </div>
      </div>
    </Modal>
  );
}
