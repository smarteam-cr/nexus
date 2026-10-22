"use client";

/**
 * components/finanzas/conciliacion/LoQueNoCuadra.tsx — Conciliación › «Lo que no cuadra», por documento (2026-10-22,
 * diseño en Claude Design «Lo que no cuadra · Conciliación», página «por documento»).
 *
 * Arriba, una frase con cuántas facturas de Odoo y de Mercury, cuántas cuotas de Nexus y cuántos depósitos no calzan,
 * y cuántos cambian lo cobrado; lo que Nexus ordenó solo; una tarjeta por documento. Después, una sección por documento
 * con sus razones: cuántos, cuánto, qué hacer y los primeros documentos. Cada razón se abre en su línea de siempre
 * (`renderLinea`), con sus «Desestimar», «Usar el monto de la factura» y «Abrir la cuenta». Aparte, lo que se le
 * pregunta a quien vendió y lo que es de contabilidad. El armado es lib/finanzas/conciliacion-por-documento.ts.
 */
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui";
import { textoDeMontos, type DiferenciaOdoo } from "@/lib/cobranza/odoo/diferencias";
import type { PorDocumento, Razon, Seccion, SeccionDeDocumento } from "@/lib/finanzas/conciliacion-por-documento";
import type { LoOrdenado, OrdenALaVista } from "@/lib/cobranza/libro/ordenar-server";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Cómo se llama cada sección y su documento. */
const DE_LA_SECCION: Record<SeccionDeDocumento, { tarjeta: string; uno: string; varios: string; titulo: (n: number) => string; columna: string }> = {
  ODOO: { tarjeta: "Odoo", uno: "factura", varios: "facturas", titulo: (n) => `Odoo · ${plural(n, "factura que no calza", "facturas que no calzan")} con Nexus`, columna: "Facturas" },
  MERCURY: { tarjeta: "Mercury", uno: "factura", varios: "facturas", titulo: (n) => `Mercury · ${plural(n, "factura que no calza", "facturas que no calzan")} con Nexus`, columna: "Facturas" },
  NEXUS: { tarjeta: "Nexus", uno: "cuota", varios: "cuotas", titulo: (n) => `Nexus · ${plural(n, "cuota que no calza", "cuotas que no calzan")} con Odoo ni Mercury`, columna: "Cuotas" },
  DEPOSITOS: { tarjeta: "Plata en Mercury", uno: "depósito", varios: "depósitos", titulo: (n) => `Plata que entró a Mercury · ${plural(n, "depósito", "depósitos")} sin factura`, columna: "Depósitos" },
  CUENTAS: { tarjeta: "Cuentas", uno: "cuenta", varios: "cuentas", titulo: (n) => `Cuentas por emparejar · ${n}`, columna: "Cuentas" },
  PREGUNTAS: { tarjeta: "Preguntas", uno: "factura", varios: "facturas", titulo: (n) => `Para quien vendió · ${plural(n, "factura que puede ser", "facturas que pueden ser")} la misma venta que una cuota`, columna: "Facturas" },
  CONTABILIDAD: { tarjeta: "Contabilidad", uno: "factura", varios: "facturas", titulo: () => "Para contabilidad, sin efecto en Nexus", columna: "Facturas" },
};

const de = (p: PorDocumento, s: SeccionDeDocumento) => p.secciones.find((x) => x.seccion === s)?.documentos ?? 0;
const DE_QUIEN = { ODOO: "de Odoo", MERCURY: "de Mercury", NEXUS: "de Nexus", DEPOSITOS: "de Mercury" } as const;

/** La frase de arriba: qué no calza, contado por documento, y cuánto de eso cambia lo cobrado. */
export function ResumenPorDocumento({ p }: { p: PorDocumento }) {
  const partes = (["ODOO", "MERCURY", "NEXUS", "DEPOSITOS"] as const)
    .filter((s) => de(p, s) > 0)
    .map((s) => `${plural(de(p, s), DE_LA_SECCION[s].uno, DE_LA_SECCION[s].varios)} ${DE_QUIEN[s]}`);
  const lista = partes.length > 1 ? `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}` : (partes[0] ?? "");
  const cuotasDeMercury = p.secciones.find((s) => s.seccion === "NEXUS")?.razones.find((r) => r.codigo === "MERCURY-COBRO-SIN-FACTURA");
  return (
    <section aria-label="Lo que encontró Nexus" className="rounded-2xl border border-info-line bg-info-surface px-5 py-4">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-info-ink">Lo que encontró Nexus</p>
      {p.porResolver === 0 ? (
        <p className="mt-1 text-sm leading-6 text-fg">Nexus, Odoo y Mercury calzan: no queda nada por resolver.</p>
      ) : (
        <>
          <p className="mt-1 text-[15px] leading-6 text-fg">
            Hoy no calzan con Nexus <strong className="font-semibold">{lista}</strong>.{" "}
            {p.cambianLoCobrado > 0 ? (
              <>
                Solo <strong className="font-semibold">{plural(p.cambianLoCobrado, "cambia", "cambian")} lo cobrado</strong>: están en rojo, arriba de su
                sección.
              </>
            ) : (
              "Ninguna cambia lo cobrado."
            )}
          </p>
          {cuotasDeMercury && (
            <p className="mt-1 text-sm text-fg-secondary">
              {plural(cuotasDeMercury.documentos, "cuota de Mercury está marcada facturada", "cuotas de Mercury están marcadas facturadas")} sin
              su factura ({textoDeMontos(cuotasDeMercury.montos)}): casi siempre son de una factura que cubre varios meses, en la lista de Mercury.
            </p>
          )}
        </>
      )}
    </section>
  );
}

const QUE_ORDENO: Record<OrdenALaVista["regla"], string> = {
  NUMERO_DE_MERCURY: "el número de su factura de Mercury",
  VARIAS_CUOTAS: "una factura que cubre varias cuotas",
  FACTURA_REEMPLAZADA: "la factura que reemplazó a una anulada",
};

/** «Nexus ordenó solo»: una línea, y la lista con «Deshacer» por factura. */
export function NexusOrdenoSolo({
  ordenado,
  puedeEditar,
  ocupado,
  onDeshacer,
}: {
  ordenado: LoOrdenado;
  puedeEditar: boolean;
  ocupado: string | null;
  onDeshacer: (grupo: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const os = ordenado.ordenes;
  if (os.length === 0) return null;
  const cuotas = os.reduce((s, o) => s + o.cuotas, 0);
  return (
    <section aria-labelledby="ordeno-solo" className="rounded-xl border border-line bg-surface px-5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p id="ordeno-solo" className="flex min-w-0 flex-1 items-center gap-2.5 text-sm text-fg">
          <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success-surface font-semibold text-success-ink">
            ✓
          </span>
          <span>
            <strong className="font-semibold">Nexus ordenó solo {plural(os.length, "factura", "facturas")}</strong> ({plural(cuotas, "cuota", "cuotas")}): les
            anotó su número cuando calzaba de una sola forma. Ninguna movió plata.
          </span>
        </p>
        <Button variant="secondary" size="sm" onClick={() => setAbierto((v) => !v)}>
          {abierto ? "Ocultar" : puedeEditar ? "Ver y deshacer" : "Ver la lista"}
        </Button>
      </div>
      {abierto && (
        <ul className="mt-3 max-h-96 divide-y divide-line overflow-y-auto rounded-xl border border-line">
          {os.map((o) => {
            const clave = `orden ${o.grupo}`;
            return (
              <li key={o.grupo} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-fg-secondary">{o.texto}</p>
                  <p className="text-xs text-fg-muted">
                    {QUE_ORDENO[o.regla]} · {o.fuente === "ODOO" ? "Odoo" : "Mercury"} ·{" "}
                    {new Date(o.creadoEn).toLocaleDateString("es-CR", { day: "numeric", month: "short" })}
                    {o.conMonto ? " · tomó el monto de la factura" : ""}
                  </p>
                </div>
                {puedeEditar && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    disabled={ocupado !== null}
                    title="Las cuotas vuelven a como estaban y Nexus no lo vuelve a ordenar. Queda en su bitácora con tu nombre."
                    onClick={() => onDeshacer(o.grupo)}
                  >
                    {ocupado === clave ? "Deshaciendo…" : "Deshacer"}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Una tarjeta por documento: cuántos no calzan. Un clic lleva a su sección. */
export function TarjetasPorDocumento({ p }: { p: PorDocumento }) {
  const tarjetas = p.secciones.filter((s) => ["ODOO", "MERCURY", "NEXUS", "DEPOSITOS"].includes(s.seccion));
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {tarjetas.map((s) => {
        const d = DE_LA_SECCION[s.seccion];
        const cobrado = new Set(s.razones.filter((r) => r.cambiaLoCobrado).flatMap((r) => r.claves)).size;
        return (
          <a key={s.seccion} href={`#doc-${s.seccion}`} className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-4 shadow-sm hover:bg-surface-hover">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-fg-muted">{d.tarjeta}</span>
            <span className="text-3xl font-light tabular-nums text-brand-dark">
              {s.documentos} <span className="text-[15px] font-medium">{s.documentos === 1 ? d.uno : d.varios}</span>
            </span>
            <span className="text-xs text-fg-muted">
              {cobrado > 0 && <span className="font-semibold text-danger-ink">{plural(cobrado, "cambia", "cambian")} lo cobrado · </span>}
              {plural(s.razones.length, "razón", "razones")}
            </span>
          </a>
        );
      })}
    </div>
  );
}

/** Una razón: qué pasa, cuántos, cuánto, qué hacer, los primeros documentos y, al abrirla, su línea con sus botones. */
function FilaDeRazon({ r, columna, renderLinea }: { r: Razon; columna: string; renderLinea: (l: DiferenciaOdoo) => ReactNode }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <div className={`border-t border-line py-3 first:border-t-0 ${r.cambiaLoCobrado ? "-mx-3 rounded-xl border-t-0 bg-danger-surface px-3" : ""}`}>
      <div className="grid grid-cols-[minmax(0,1fr)_4.5rem] gap-x-3 gap-y-1 md:grid-cols-[minmax(0,1fr)_4.5rem_10rem_13rem]">
        <div className="min-w-0">
          <p className="text-sm text-fg">
            {r.cambiaLoCobrado && (
              <span className="mr-1.5 rounded-full border border-danger-line bg-surface px-2 py-0.5 text-[11px] font-semibold text-danger-ink">Cambia lo cobrado</span>
            )}
            {r.razon}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {r.ejemplos.map((e, i) => (
              <span key={i} className="max-w-full truncate rounded-full bg-surface-muted px-2 py-0.5 text-xs tabular-nums text-fg-secondary">
                {e.texto}
              </span>
            ))}
            {r.mas > 0 && <span className="px-1 py-0.5 text-xs text-fg-muted">y {r.mas} más</span>}
          </div>
        </div>
        <div className="text-xl font-semibold tabular-nums text-fg" aria-label={`${r.documentos} ${columna.toLowerCase()}`}>
          {r.documentos}
        </div>
        <div className="col-span-2 text-sm tabular-nums text-fg md:col-span-1">{r.montos.length ? textoDeMontos(r.montos) : "—"}</div>
        <div className="col-span-2 flex flex-col items-start gap-1 md:col-span-1">
          <span className="text-sm font-medium text-brand">{r.queHacer}</span>
          <button type="button" onClick={() => setAbierta((v) => !v)} className="text-xs font-medium text-fg-secondary hover:underline">
            {abierta ? "Cerrar" : "Ver y resolver"}
          </button>
        </div>
      </div>
      {abierta && <div className="mt-3">{renderLinea(r.linea)}</div>}
    </div>
  );
}

/** Una sección por documento, con sus razones en tabla. */
export function SeccionPorDocumento({ s, renderLinea }: { s: Seccion; renderLinea: (l: DiferenciaOdoo) => ReactNode }) {
  const d = DE_LA_SECCION[s.seccion];
  return (
    <section id={`doc-${s.seccion}`} data-recorrido="fin.conciliacion.diferencia" aria-labelledby={`h-${s.seccion}`} className="scroll-mt-4 rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`h-${s.seccion}`} className="text-sm font-semibold text-fg">
          {d.titulo(s.documentos)}
        </h2>
        <span className="text-xs text-fg-muted">Cada {d.uno} se cuenta una vez, aunque tenga varias razones</span>
      </div>
      <div className="mt-3 hidden grid-cols-[minmax(0,1fr)_4.5rem_10rem_13rem] gap-x-3 border-b border-line pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-fg-muted md:grid">
        <span>Por qué no calza</span>
        <span>{d.columna}</span>
        <span>Monto</span>
        <span>Qué hacer</span>
      </div>
      <div className="mt-1">
        {s.razones.map((r) => (
          <FilaDeRazon key={r.codigo} r={r} columna={d.columna} renderLinea={renderLinea} />
        ))}
      </div>
    </section>
  );
}

/** Lo de contabilidad, plegado: no cambia nada en Nexus. */
export function ParaContabilidad({ s, renderLinea }: { s: Seccion; renderLinea: (l: DiferenciaOdoo) => ReactNode }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <section aria-labelledby="h-contabilidad" className="space-y-3 rounded-2xl border border-dashed border-line bg-surface-muted p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 basis-80 space-y-1">
          <h2 id="h-contabilidad" className="text-sm font-semibold text-fg-secondary">
            Para contabilidad, sin efecto en Nexus · {plural(s.documentos, "factura", "facturas")}
          </h2>
          <p className="text-xs text-fg-muted">{s.razones.map((r) => `${r.documentos} ${r.razon.charAt(0).toLowerCase()}${r.razon.slice(1)}`).join(" · ")}.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setAbierta((v) => !v)}>
          {abierta ? "Ocultar" : "Ver la lista"}
        </Button>
      </div>
      {abierta && <div className="space-y-3">{s.razones.map((r) => <div key={r.codigo}>{renderLinea(r.linea)}</div>)}</div>}
    </section>
  );
}

/** La columna de la derecha: qué compara la pantalla y qué toca cada caso en el resto de Nexus. */
export function ColumnaDeContexto() {
  const toca: Array<{ titulo: string; texto: string }> = [
    {
      titulo: "Pagada allá, por cobrar acá",
      texto: "Cobranza la muestra vencida, el vigía avisa, el punto de equilibrio cobra de menos y la comisión no se paga.",
    },
    { titulo: "Factura sin cuota", texto: "La facturación por cliente y la rentabilidad no la cuentan." },
    { titulo: "Cuota sin factura", texto: "No cambia nada hoy, pero el día que se pague no se cobra sola." },
    { titulo: "Depósito sin factura", texto: "Es plata que entró y Nexus no sabe de qué es." },
  ];
  return (
    <aside aria-label="Cómo se lee" className="space-y-4">
      <section className="space-y-2.5 rounded-2xl border border-line bg-surface p-5">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-fg-muted">Qué compara esta pantalla</p>
        <p className="text-sm text-fg">
          Odoo y Mercury dicen qué se facturó y qué se pagó. Nexus dice qué se vendió y qué cuotas se esperan. Acá se responden tres preguntas:
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-fg">
          <li>¿Cada factura tiene su cuota en Nexus?</li>
          <li>¿Cada cuota facturada tiene su factura?</li>
          <li>¿Lo pagado allá está cobrado acá?</li>
        </ol>
        <p className="text-xs text-fg-muted">Lo que no calza con alguna de las tres está a la izquierda, contado por factura, cuota o depósito.</p>
      </section>
      <section className="space-y-2.5 rounded-2xl border border-line bg-surface p-5">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-fg-muted">Qué toca en el resto de Nexus</p>
        {toca.map((x) => (
          <div key={x.titulo}>
            <p className="text-sm font-semibold text-fg">{x.titulo}</p>
            <p className="text-xs text-fg-secondary">{x.texto}</p>
          </div>
        ))}
      </section>
    </aside>
  );
}
