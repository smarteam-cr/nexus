"use client";

/**
 * components/finanzas/equilibrio/RendimientoCobranza.tsx
 *
 * «Rendimiento de cobranza», arriba del punto de equilibrio. Lo pidió Elías el 2026-09-14 al poner la
 * tarjeta «Cuentas por cobrar» al lado del resumen del Excel de Alex y no poder compararlas: la tarjeta
 * junta monedas pasadas a dólares y va sin IVA, y el Excel separa monedas y va con IVA.
 *
 * Tres decisiones:
 *  1. **Cada moneda en la suya, sin convertir**, como el Excel. La tarjeta de abajo convierte para
 *     poder sumar con el resto del reporte; acá no se suma nada entre monedas.
 *  2. **La diferencia con el Excel se explica en causas que suman al centavo** (`enLaCalleContraExcel`),
 *     cada una con adónde ir a resolverla. El detalle factura por factura va plegado: se lee en
 *     segundos y se trabaja desplegando. La lista no se corta: si es larga, scrollea.
 *  3. **No guarda nada ni escribe nada.** Una diferencia se cierra arreglando el dato en Cobranza, y
 *     desaparece sola en la próxima carga.
 */
import Link from "next/link";
import { fmtFecha, fmtMonto } from "@/components/cobranza/format";
import type { CobranzaDeMoneda } from "@/lib/cobranza/antiguedad";
import {
  rendimientoPorMoneda,
  type CausaConMonto,
  type CausaDeDiferencia,
  type ComparacionConExcel,
  type EnLaCalleContraExcel,
  type RendimientoDeMoneda,
} from "@/lib/finanzas/cobranza-contra-excel";

const NOMBRE_MONEDA: Record<string, string> = { USD: "Dólares", CRC: "Colones" };

/** 0,797 → «79,7 %». null = no hay nada facturado: una raya, no un cero. */
const pct = (x: number | null) =>
  x === null ? "—" : `${(x * 100).toLocaleString("es-CR", { maximumFractionDigits: 1 })} %`;

/** El signo delante del símbolo: «−$4 026,67», no «$-4 026,67». */
const conSigno = (n: number, moneda: string) => (n < 0 ? `−${fmtMonto(-n, moneda)}` : fmtMonto(n, moneda));

const IMPORTAR = "/cobranza/importar";

const CAUSA: Record<CausaDeDiferencia, { titulo: string; accion: string; href: string | null }> = {
  SIN_CUENTA: {
    titulo: "Empresas que Nexus no tiene como cuenta",
    accion: "Elegí la cuenta, o creala, en Cobranza › Importar",
    href: IMPORTAR,
  },
  SIN_FACTURA: {
    titulo: "Contratos de QuickBooks y «No inscritos», sin factura",
    accion: "Nexus cuenta solo lo facturado: cargalos en Cobranza › Importar",
    href: IMPORTAR,
  },
  FALTA_CARGAR: {
    titulo: "Facturas que Nexus no tiene como facturadas",
    accion: "Cargalas en Cobranza › Importar",
    href: IMPORTAR,
  },
  IVA: {
    titulo: "IVA: el Excel lo incluye y Nexus no",
    accion: "No hay nada que arreglar",
    href: null,
  },
  NO_CUADRA: {
    titulo: "Nexus y el Excel dicen otra cosa",
    accion: "Revisalas en Cobranza › Odoo › «Lo que no cuadra»",
    href: "/cobranza/odoo?pestana=no-cuadra",
  },
};

export default function RendimientoCobranza({
  anio,
  cobranza,
  deAniosAnteriores,
  excel,
}: {
  anio: number;
  cobranza: Readonly<Record<string, CobranzaDeMoneda>>;
  deAniosAnteriores: Readonly<Record<string, { porCobrar: number; vencido: number; facturas: number }>>;
  excel: ComparacionConExcel;
}) {
  const filas = rendimientoPorMoneda({ cobranza, deAniosAnteriores, excel });
  if (filas.length === 0) return null;

  return (
    <section aria-labelledby="rendimiento-cobranza" className="rounded-xl border border-line bg-surface overflow-hidden">
      <div className="px-4 py-2.5 bg-surface-muted border-b border-line">
        <h3 id="rendimiento-cobranza" className="text-sm font-medium text-fg">
          Rendimiento de cobranza {anio}
        </h3>
        <p className="text-[11px] text-fg-muted mt-0.5">
          Facturas emitidas en {anio}, cada moneda por separado y sin convertir. Nexus guarda los montos sin IVA;
          el Excel de Alex, con IVA. <EstadoDelExcel excel={excel} />
        </p>
      </div>
      <div className={`grid divide-y divide-line ${filas.length > 1 ? "md:grid-cols-2 md:divide-y-0 md:divide-x" : ""}`}>
        {filas.map((f) => (
          <Moneda key={f.moneda} f={f} />
        ))}
      </div>
    </section>
  );
}

function EstadoDelExcel({ excel }: { excel: ComparacionConExcel }) {
  switch (excel.estado) {
    case "OK":
      return (
        <>
          Al lado, lo que dice el último Excel, subido el {fmtFecha(excel.subidoEl)}.
          {excel.filasIlegibles > 0 && (
            <span className="text-warn-ink">
              {" "}
              {excel.filasIlegibles} {excel.filasIlegibles === 1 ? "fila no se pudo leer" : "filas no se pudieron leer"}: sus
              montos pueden faltar.
            </span>
          )}
        </>
      );
    case "SIN_EXCEL":
      return (
        <>
          Todavía no se subió el Excel de Alex: cuando se suba en{" "}
          <Link href={IMPORTAR} className="text-brand hover:underline">
            Cobranza › Importar
          </Link>
          , acá se compara.
        </>
      );
    case "SIN_RESUMEN":
      return (
        <span className="text-warn-ink">
          El último Excel, subido el {fmtFecha(excel.subidoEl)}, no trae la pestaña «Compendio de Facturación General»: sin
          ella no hay contra qué comparar.
        </span>
      );
    case "ERROR":
      return <span className="text-warn-ink">{excel.mensaje} La cobranza de Nexus se muestra igual.</span>;
  }
}

function Fila({ etiqueta, valor, porcentaje, fuerte }: { etiqueta: string; valor: string; porcentaje?: string; fuerte?: boolean }) {
  return (
    <>
      <dt className={`text-[12px] ${fuerte ? "text-fg font-medium" : "text-fg-secondary"}`}>{etiqueta}</dt>
      <dd className={`tabular-nums text-right text-fg ${fuerte ? "text-base font-semibold" : "text-sm"}`}>{valor}</dd>
      <dd className="text-[11px] tabular-nums text-fg-muted text-right">{porcentaje ?? ""}</dd>
    </>
  );
}

function Moneda({ f }: { f: RendimientoDeMoneda }) {
  const m = f.moneda;
  const antes = f.deAniosAnteriores;
  return (
    <div className="px-4 py-3 min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-fg-muted">{NOMBRE_MONEDA[m] ?? m}</p>
      <dl className="mt-1.5 grid grid-cols-[1fr_auto_3.5rem] gap-x-3 gap-y-0.5 items-baseline">
        <Fila etiqueta="Facturado" valor={fmtMonto(f.facturado, m)} />
        <Fila etiqueta="Cobrado" valor={fmtMonto(f.cobrado, m)} porcentaje={pct(f.pctCobrado)} />
        <Fila etiqueta="En la calle" valor={fmtMonto(f.enLaCalle, m)} porcentaje={pct(f.pctEnLaCalle)} fuerte />
      </dl>
      {f.enLaCalle > 0 && (
        <p className="text-[11px] text-fg-muted mt-1 tabular-nums">
          <span className="text-danger-ink">{fmtMonto(f.vencido, m)} vencido</span> · {fmtMonto(f.enPlazo, m)} todavía en
          plazo
        </p>
      )}
      {/* El par del %: lo mismo sin lo que el cliente todavía no debe. Es el «sin las cuentas que no se
          han vencido» del Excel, con el criterio de vencido de Nexus (los días de crédito de la cuenta). */}
      {f.pctSinLoEnPlazo !== null && f.enPlazo > 0 && (
        <p className="text-[11px] text-fg-muted tabular-nums">Sin contar lo que está en plazo: {pct(f.pctSinLoEnPlazo)} cobrado</p>
      )}
      {antes && (
        <p className="text-[11px] text-warn-ink tabular-nums mt-0.5">
          Además, {fmtMonto(antes.porCobrar, m)} de {antes.facturas} {antes.facturas === 1 ? "factura" : "facturas"} de años
          anteriores sin cobrar ({fmtMonto(antes.vencido, m)} vencido). No suma arriba.
        </p>
      )}
      {f.excel && <ContraExcel e={f.excel} />}
    </div>
  );
}

function ContraExcel({ e }: { e: EnLaCalleContraExcel }) {
  const m = e.moneda;
  const causasConPlata = e.causas.filter((c) => c.monto !== 0);
  return (
    <div className="mt-3 pt-2.5 border-t border-line">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-[12px] text-fg-secondary">En la calle según el Excel</p>
        <p className="text-sm tabular-nums text-fg">{fmtMonto(e.excel, m)}</p>
      </div>
      {e.causas.length === 0 ? (
        <p className="text-[11px] text-success-ink">Coincide con Nexus, factura por factura.</p>
      ) : (
        <>
          <p className="text-[11px] text-fg-muted tabular-nums">
            {e.diferencia === 0
              ? "Suman lo mismo, pero hay diferencias que se compensan:"
              : `${e.diferencia > 0 ? "El Excel cuenta" : "Nexus cuenta"} ${fmtMonto(Math.abs(e.diferencia), m)} más. Por qué:`}
          </p>
          <ul className="mt-1 space-y-1.5">
            {(causasConPlata.length > 0 ? causasConPlata : e.causas).map((c) => (
              <Causa key={c.causa} c={c} moneda={m} />
            ))}
          </ul>
          <details className="mt-2">
            <summary className="cursor-pointer select-none text-[11px] text-brand hover:underline">
              Ver factura por factura
            </summary>
            <Detalle causas={e.causas} moneda={m} />
          </details>
        </>
      )}
    </div>
  );
}

function Causa({ c, moneda }: { c: CausaConMonto; moneda: string }) {
  const meta = CAUSA[c.causa];
  return (
    <li>
      <div className="flex items-baseline gap-2 text-[12px]">
        <span className="text-fg-secondary min-w-0">{meta.titulo}</span>
        <span className="ml-auto tabular-nums text-fg whitespace-nowrap">{conSigno(c.monto, moneda)}</span>
      </div>
      {meta.href ? (
        <Link href={meta.href} className="text-[10px] text-brand hover:underline">
          {meta.accion} →
        </Link>
      ) : (
        <p className="text-[10px] text-fg-muted">{meta.accion}</p>
      )}
    </li>
  );
}

function Detalle({ causas, moneda }: { causas: readonly CausaConMonto[]; moneda: string }) {
  return (
    <div className="mt-1.5 space-y-2">
      <p className="text-[10px] text-fg-muted">
        En positivo, lo que el Excel cuenta de más; en negativo, lo que cuenta Nexus. Una línea en cero no mueve la
        diferencia, pero igual hay que arreglarla.
      </p>
      {causas.map((c) => (
        <div key={c.causa}>
          <p className="text-[10px] uppercase tracking-wide text-fg-muted">
            {CAUSA[c.causa].titulo} · {c.partidas.length}
          </p>
          <ul
            className={`mt-0.5 rounded-lg border border-line bg-surface-muted/60 divide-y divide-line/60 ${
              c.partidas.length > 8 ? "max-h-72 overflow-y-auto" : ""
            }`}
          >
            {c.partidas.map((p, k) => (
              <li key={k} className="px-2.5 py-1 flex items-baseline gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-fg-secondary break-words">
                    {p.cliente}
                    {p.numero ? ` · ${p.numero}` : ""}
                  </p>
                  <p className="text-[10px] text-fg-muted break-words">{p.que}</p>
                </div>
                <span className="text-[11px] tabular-nums text-fg whitespace-nowrap">{conSigno(p.monto, moneda)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
