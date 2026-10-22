"use client";

/**
 * components/finanzas/conciliacion/LoQueNoCuadra.tsx — las piezas del rediseño de Conciliación › «Lo que no cuadra»
 * (2026-10-22, diseño en Claude Design «Lo que no cuadra · Conciliación», con los datos del 22 oct).
 *
 * Arriba, una frase con lo que hay hoy y lo que Nexus ordenó solo; después cuatro tarjetas (una por grupo:
 * lib/finanzas/conciliacion.ts › `agruparDiferencias`), los grupos con sus líneas, la historia plegada y, al costado, qué
 * toca cada cosa en Nexus y cómo se cierra. Las líneas siguen siendo las de `DiferenciasOdoo` (con sus «Desestimar»,
 * «Usar el monto de la factura» y «Abrir la cuenta»): acá solo cambia cómo se ordenan y se cuentan.
 */
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui";
import { textoDeMontos } from "@/lib/cobranza/odoo/diferencias";
import type { GrupoArmado, GrupoDeConciliacion } from "@/lib/finanzas/conciliacion";
import type { LoOrdenado, OrdenALaVista } from "@/lib/cobranza/libro/ordenar-server";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Lo que dice cada grupo en su tarjeta y en su encabezado. */
export const TEXTO_DEL_GRUPO: Record<GrupoDeConciliacion, { titulo: string; tarjeta: string; sub: string; punto: string }> = {
  COBRADO: {
    titulo: "Cambia lo que Nexus da por cobrado",
    tarjeta: "Plata que ya entró y Nexus todavía da por cobrar. Mueve Cobranza, las alertas, el punto de equilibrio y las comisiones.",
    sub: "empieza por acá",
    punto: "bg-danger-ink",
  },
  NO_VE: {
    titulo: "Facturado que Nexus no ve",
    tarjeta: "Facturas sin cuenta o sin cuota. No entran en la facturación por cliente ni en la rentabilidad.",
    sub: "se resuelve emparejando o cargando la cuota",
    punto: "bg-warn-ink",
  },
  PREGUNTAR: {
    titulo: "Hay que preguntar",
    tarjeta: "Ventas que pueden estar contadas dos veces y plata que entró sin factura. Lo decide una persona.",
    sub: "nadie lo arregla tecleando",
    punto: "bg-brand",
  },
  PAPELES: {
    titulo: "Papeles por ordenar",
    tarjeta: "Lo que Nexus no pudo ordenar solo: había más de una forma o faltaba un dato. Si no se ordena, el día que se pague no se cobra sola.",
    sub: "no mueven plata hoy",
    punto: "bg-fg-muted",
  },
  HISTORIA: { titulo: "Historia sin efecto hoy", tarjeta: "", sub: "", punto: "bg-line" },
};

/** La frase de arriba: cuántas filas hay, cuántas mueven plata y lo que Nexus ordenó solo. */
export function ResumenDeHoy({ grupos, ordenadas }: { grupos: readonly GrupoArmado[]; ordenadas: number }) {
  const de = (g: GrupoDeConciliacion) => grupos.find((x) => x.grupo === g)?.filas ?? 0;
  const total = grupos.reduce((n, g) => n + g.filas, 0);
  const cobrado = de("COBRADO");
  return (
    <section aria-label="Lo que hay hoy" className="rounded-2xl border border-info-line bg-info-surface px-5 py-4">
      <p className="text-sm leading-6 text-fg">
        {total === 0 ? (
          "Nexus, Odoo y Mercury cuadran: no queda nada por resolver con este filtro."
        ) : (
          <>
            Hoy hay <strong className="font-semibold">{plural(total, "fila", "filas")}</strong> entre Odoo y Mercury.{" "}
            {cobrado > 0 ? (
              <>
                Solo <strong className="font-semibold">{plural(cobrado, "cambia", "cambian")}</strong> plata que ya se ve en otras pantallas: empieza por
                el grupo 1.
              </>
            ) : (
              "Ninguna cambia plata que ya se vea en otras pantallas."
            )}{" "}
            {de("PAPELES") > 0 && <>{plural(de("PAPELES"), "es un papel", "son papeles")} sin efecto hoy</>}
            {de("PAPELES") > 0 && de("HISTORIA") > 0 && " y "}
            {de("HISTORIA") > 0 && <>{plural(de("HISTORIA"), "es historia", "son historia")} de antes</>}
            {(de("PAPELES") > 0 || de("HISTORIA") > 0) && "."}
          </>
        )}
        {ordenadas > 0 && (
          <span className="text-fg-secondary">
            {" "}
            Además, Nexus ordenó solo {plural(ordenadas, "factura", "facturas")} en los últimos 30 días.
          </span>
        )}
      </p>
    </section>
  );
}

const QUE_ORDENO: Record<OrdenALaVista["regla"], (n: number, cuotas: number) => string> = {
  NUMERO_DE_MERCURY: (_n, cuotas) => `${plural(cuotas, "cuota recibió", "cuotas recibieron")} el número de su factura de Mercury`,
  VARIAS_CUOTAS: (n, cuotas) => `${plural(n, "factura que cubre", "facturas que cubren")} varias cuotas, anotadas en cada una (${cuotas} cuotas)`,
  FACTURA_REEMPLAZADA: (n) => `${plural(n, "cuota pasó", "cuotas pasaron")} de una factura anulada a la que la reemplaza`,
};

/** «Nexus ordenó solo»: lo que se ordenó sin una persona, con «Deshacer» por factura. */
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
  const reglas = (["NUMERO_DE_MERCURY", "VARIAS_CUOTAS", "FACTURA_REEMPLAZADA"] as const)
    .map((r) => {
      const de = os.filter((o) => o.regla === r);
      return { r, n: de.length, cuotas: de.reduce((s, o) => s + o.cuotas, 0), conMonto: de.filter((o) => o.conMonto).length };
    })
    .filter((x) => x.n > 0);
  return (
    <section aria-labelledby="ordeno-solo" className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 basis-[28rem] gap-3">
          <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success-surface font-semibold text-success-ink">
            ✓
          </span>
          <div className="min-w-0 space-y-1.5">
            <h2 id="ordeno-solo" className="text-sm font-semibold text-fg">
              Nexus ordenó solo {plural(os.length, "factura", "facturas")}
            </h2>
            <ul className="space-y-0.5 text-sm text-fg-secondary">
              {reglas.map((x) => (
                <li key={x.r}>
                  {QUE_ORDENO[x.r](x.n, x.cuotas)}
                  {x.conMonto > 0 && <> · en {plural(x.conMonto, "una", "varias")} tomó el monto de la factura (centavos)</>}.
                </li>
              ))}
            </ul>
            <p className="text-xs text-fg-muted">
              Ninguna movió plata: solo anota el número cuando la factura calza exacto y de una sola forma, y la cuota no cambia de estado. Si hay
              duda, queda abajo para una persona.
            </p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setAbierto((v) => !v)}>
          {abierto ? "Ocultar" : puedeEditar ? "Ver y deshacer" : "Ver la lista"}
        </Button>
      </div>
      {abierto && (
        <ul className="mt-4 max-h-96 divide-y divide-line overflow-y-auto rounded-xl border border-line">
          {os.map((o) => {
            const clave = `orden ${o.grupo}`;
            return (
              <li key={o.grupo} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-fg-secondary">{o.texto}</p>
                  <p className="text-xs text-fg-muted">
                    {o.fuente === "ODOO" ? "Odoo" : "Mercury"} · {new Date(o.creadoEn).toLocaleDateString("es-CR", { day: "numeric", month: "short" })}
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

/** Las cuatro tarjetas de arriba: cuántas filas y cuánta plata tiene cada grupo. Un clic lleva al grupo. */
export function TarjetasDeGrupos({ grupos }: { grupos: readonly GrupoArmado[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {grupos
        .filter((g) => g.grupo !== "HISTORIA")
        .map((g, i) => {
          const t = TEXTO_DEL_GRUPO[g.grupo];
          return (
            <a
              key={g.grupo}
              href={`#grupo-${g.grupo}`}
              className="flex flex-col gap-1.5 rounded-2xl border border-line bg-surface p-4 shadow-sm hover:bg-surface-hover"
            >
              <span className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-fg-muted">
                <span aria-hidden="true" className={`h-2 w-2 rounded-full ${t.punto}`} />
                {i + 1} · {t.titulo}
              </span>
              <span className="text-3xl font-light tabular-nums text-brand-dark">{g.filas}</span>
              {g.plata.length > 0 && <span className="text-sm tabular-nums text-fg">{textoDeMontos(g.plata)}</span>}
              <span className="text-xs text-fg-muted">{t.tarjeta}</span>
            </a>
          );
        })}
    </div>
  );
}

/** El marco de un grupo: su número, su título, cuántas filas y lo que tiene adentro. */
export function SeccionDeGrupo({ grupo, numero, children }: { grupo: GrupoArmado; numero: number; children: ReactNode }) {
  const t = TEXTO_DEL_GRUPO[grupo.grupo];
  return (
    <section id={`grupo-${grupo.grupo}`} aria-labelledby={`g-${grupo.grupo}`} className="scroll-mt-4 space-y-3 rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`g-${grupo.grupo}`} className="text-sm font-semibold text-fg">
          {numero} · {t.titulo}
        </h2>
        <span className="text-xs text-fg-muted">
          {plural(grupo.lineas.length, "cosa", "cosas")} · {plural(grupo.filas, "fila", "filas")} · {t.sub}
        </span>
      </div>
      {children}
    </section>
  );
}

/** La historia, plegada: no cambia nada hoy. */
export function Historia({ grupo, children }: { grupo: GrupoArmado; children: ReactNode }) {
  const [abierta, setAbierta] = useState(false);
  if (grupo.filas === 0) return null;
  return (
    <section aria-labelledby="g-historia" className="space-y-3 rounded-2xl border border-dashed border-line bg-surface-muted p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 basis-80 space-y-1">
          <h2 id="g-historia" className="text-sm font-semibold text-fg-secondary">
            Historia sin efecto hoy · {plural(grupo.filas, "fila", "filas")}
          </h2>
          <p className="text-xs text-fg-muted">
            Pagos que Odoo no tiene conciliados con el banco (para contabilidad), monedas ya corregidas y facturas sin impuesto. No cambian
            ningún número de hoy.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setAbierta((v) => !v)}>
          {abierta ? "Ocultar la historia" : "Ver la historia"}
        </Button>
      </div>
      {abierta && <div className="space-y-3">{children}</div>}
    </section>
  );
}

/** Las facturas que se parecen a un papel por ordenar pero que Nexus no ordena: más de una forma de leerlas. */
export function FacturasDudosas({ dudosas }: { dudosas: LoOrdenado["dudosas"] }) {
  if (dudosas.length === 0) return null;
  return (
    <article className="space-y-2 rounded-xl border border-line bg-surface-muted p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-fg">{plural(dudosas.length, "factura que Nexus no ordenó sola", "facturas que Nexus no ordenó solo")}</h3>
        <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-fg-secondary">elige una persona</span>
      </div>
      <ul className="space-y-1 text-sm text-fg-secondary">
        {dudosas.map((d) => (
          <li key={`${d.fuente} ${d.numero} ${d.cuentaId}`}>
            <strong className="font-semibold text-fg">{d.cuenta}</strong> · {d.texto}
          </li>
        ))}
      </ul>
      <p className="text-xs text-fg-muted">
        Casi siempre son cuotas iguales que se repiten mes a mes: la factura podría ser de varios meses y Nexus no adivina. Para que no vuelva a
        pasar, al marcar una cuota facturada anota el número de la factura.
      </p>
    </article>
  );
}

/** La columna de la derecha: qué toca cada cosa en Nexus y cómo se cierra. */
export function ColumnaDeContexto() {
  const toca: Array<{ punto: string; titulo: string; texto: string }> = [
    {
      punto: "bg-danger-ink",
      titulo: "Una cuota por cobrar que ya se pagó",
      texto: "Cobranza la muestra vencida, el vigía avisa «facturas vencidas», el punto de equilibrio cobra de menos y la comisión no se paga.",
    },
    { punto: "bg-warn-ink", titulo: "Una factura sin cuenta o sin cuota", texto: "La facturación por cliente y la rentabilidad de la cuenta no la cuentan." },
    { punto: "bg-brand", titulo: "Una venta contada dos veces", texto: "Infla lo vendido y la comisión de quien vendió." },
    { punto: "bg-fg-muted", titulo: "Un papel sin ordenar", texto: "No cambia nada hoy. Cuando el cliente pague, no se cobra sola." },
  ];
  return (
    <aside aria-label="Qué toca cada cosa" className="space-y-4">
      <section className="space-y-3 rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-fg-muted">Qué toca cada cosa en Nexus</p>
        <p className="text-sm text-fg-secondary">Las otras pantallas leen las mismas cuotas. Por eso una cosa de acá se nota también allá.</p>
        {toca.map((x) => (
          <div key={x.titulo} className="space-y-1">
            <span className="flex items-center gap-2 text-sm font-semibold text-fg">
              <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${x.punto}`} />
              {x.titulo}
            </span>
            <span className="block pl-4 text-xs text-fg-secondary">{x.texto}</span>
          </div>
        ))}
      </section>
      <section className="space-y-3 rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-fg-muted">Cómo se cierra una cosa</p>
        <ol className="list-decimal space-y-2 pl-4 text-sm text-fg">
          <li>
            <strong className="font-semibold">Lo ordena Nexus solo:</strong> cuando la factura calza exacto y de una sola forma, cada hora. Queda
            arriba, en «Nexus ordenó solo», y se puede deshacer.
          </li>
          <li>
            <strong className="font-semibold">Se arregla en Nexus:</strong> con el botón de la fila o «Abrir la cuenta». Sale de la lista al momento.
          </li>
          <li>
            <strong className="font-semibold">Se arregla en Odoo o en Mercury:</strong> sale sola en la siguiente lectura, cada hora o al tocar
            «Actualizar».
          </li>
          <li>
            <strong className="font-semibold">Hay que preguntar:</strong> quien decide la desestima con el motivo. Queda en «Desestimadas», con quién y
            cuándo, y se puede deshacer.
          </li>
        </ol>
      </section>
    </aside>
  );
}
