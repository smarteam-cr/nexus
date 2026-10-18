"use client";

/**
 * components/landing/inversion-costo.tsx — el renglón INTERNO de una línea de licencia (2026-10-18): el precio de lista
 * que Smarteam le paga al proveedor, quién le cobra la licencia al cliente y el margen.
 *
 * Solo existe en el EDITOR (`GrupoTabla` lo monta con `editable`): el cliente nunca lo ve, y además lo que guarda lo
 * sacan del snapshot, del PDF y de la propuesta publicada (`sinLoInterno`, lib/landing/inversion-costo.ts). Se pinta
 * como chrome de edición —punteado, gris— para que nadie lo lea como parte del documento.
 */
import { Editable } from "./inline";
import {
  cadaCostoDe,
  margenDeLinea,
  quienFacturaDe,
  textoDeMargen,
  type LineaConCosto,
} from "@/lib/landing/inversion-costo";
import type { Contrato } from "@/lib/landing/inversion";

export function CostoDeLicencia({
  linea,
  moneda,
  contrato,
  onCambio,
}: {
  linea: LineaConCosto;
  /** La moneda con que SUMA la sección (la declarada o la deducida). */
  moneda: string;
  contrato: Contrato;
  onCambio: (siguiente: LineaConCosto) => void;
}) {
  const margen = margenDeLinea(linea, moneda, contrato);
  const quien = quienFacturaDe(linea);
  const tono =
    margen.estado === "ok"
      ? margen.margen.min < 0
        ? " stl-inv-costo-margen--neg"
        : " stl-inv-costo-margen--ok"
      : "";
  return (
    <span className="stl-inv-costo" title="Interno: el cliente no lo ve. Llega a Finanzas cuando la propuesta se gana.">
      <span className="stl-inv-costo-rot">Interno · precio de lista del proveedor</span>
      <span className="stl-inv-costo-campos">
        <Editable
          as="span"
          className="stl-inv-num"
          editable
          value={linea.costoLista ?? ""}
          placeholder="lo que se le paga ($800)"
          onCommit={(v) => {
            if (v.trim() === (linea.costoLista ?? "").trim()) return;
            onCambio({ ...linea, costoLista: v });
          }}
        />
        <Editable
          as="span"
          className="stl-inv-num"
          editable
          value={linea.costoMoneda ?? ""}
          placeholder={moneda || "moneda"}
          onCommit={(v) => {
            const codigo = v.trim().toUpperCase();
            if (codigo === (linea.costoMoneda ?? "").trim().toUpperCase()) return;
            onCambio({ ...linea, costoMoneda: codigo });
          }}
        />
        <select
          className="stl-inv-recur"
          aria-label="Cada cuánto se le paga al proveedor"
          value={cadaCostoDe(linea)}
          onChange={(e) => onCambio({ ...linea, costoCada: e.target.value })}
        >
          <option value="mensual">al mes</option>
          <option value="anual">al año</option>
          <option value="unica">una vez</option>
        </select>
        <select
          className="stl-inv-recur"
          aria-label="Quién le cobra la licencia al cliente"
          value={quien ?? ""}
          onChange={(e) => onCambio({ ...linea, quienFactura: e.target.value })}
        >
          <option value="">¿Quién la factura?</option>
          <option value="smarteam">La factura Smarteam (reventa)</option>
          <option value="proveedor">El cliente le paga al proveedor</option>
        </select>
      </span>
      <span className={`stl-inv-costo-margen${tono}`}>{textoDeMargen(margen, moneda)}</span>
    </span>
  );
}
