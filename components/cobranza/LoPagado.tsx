"use client";

/**
 * components/cobranza/LoPagado.tsx — Conciliación › «Lo pagado» (plan «Un solo libro financiero», paso 2, 2026-10-17).
 *
 * Cada mañana, lo que Odoo y Mercury ya dicen y Nexus todavía no: cuotas pagadas allá listas para cobrar (con el día
 * real del pago) y cuotas que se pegan a su factura. Quien concilia marca lo que ve bien y lo confirma de una vez, con su
 * firma. La lista la arma lib/cobranza/libro/hechos.ts, la misma regla que el script `aplicar-odoo-y-mercury.ts`.
 *
 * Desde el 2026-10-18 lo pagado y conciliado con el banco se cobra SOLO, después de las copias (job
 * `lo-pagado-daily`, firmado por el sistema): cada hora de 7:00 a 19:00 desde el 2026-10-21, y cada vez que alguien
 * aprieta «Actualizar desde Odoo y Mercury» (`recarga` sube y la lista se vuelve a leer). Acá queda lo que necesita a una persona —cada fila dice por qué— y lo que
 * todavía no cobró la vuelta de la hora. Los choques (cobrada en Nexus, impaga allá) solo se muestran: se arreglan en
 * Odoo o en Mercury, desde «Lo que no cuadra». ⛔ Nada de esto escribe en Odoo ni en Mercury.
 *
 * Cada sección dice qué es, cómo se resuelve y si entra en «Confirmar con mi firma» (2026-10-22, Elías: «que quede claro
 * para el usuario qué es lo que pasa»). Solo las dos primeras se confirman con la firma; «Sin el día del pago» y los
 * choques se resuelven fila por fila, desde la cuenta o en Odoo y Mercury, y cada fila trae su enlace.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, ConfirmDialog, EmptyState, ListSkeleton } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import { etiquetaMes, fmtFecha, fmtMonto } from "@/components/cobranza/format";

interface DeLaCuota {
  cuentaId: string;
  cuenta: string;
  periodo: string;
  monto: number;
  moneda: string;
}
interface AccionVista extends DeLaCuota {
  fuente: "ODOO" | "MERCURY";
  cobroId: string;
  numero: string;
  fechaEmision?: string;
  numeroFactura?: string;
  /** `porQueNoSolo` null = el sistema la cobra solo en la próxima vuelta; si no, por qué espera a una persona. */
  cobrar?: { fechaCobro: string; deDonde: string; porQueNoSolo: string | null };
  /** Ya estaba cobrada en Nexus y su factura está pagada allá: solo le falta el número. */
  yaCobrada?: true;
}
interface PegadoVisto extends DeLaCuota {
  fuente: "ODOO" | "MERCURY";
  cobroId: string;
  numero: string;
  fechaFactura: string;
}
interface Lista {
  acciones: AccionVista[];
  pagadasSinFecha: PegadoVisto[];
  choques: PegadoVisto[];
  conOdoo: boolean;
  /** Odoo no contestó al pedirle el día de los pagos: sus pagadas quedaron en «Sin el día del pago». */
  avisoOdoo: string | null;
  firma: string;
}
interface Confirmado {
  resultado: { escritas: number; saltadas: Array<{ cobroId: string; cuenta: string; motivo: string }> };
  /** null = se escribió, pero la lista no se pudo releer: se vuelve a pedir. */
  queda: Lista | null;
}

/** Los montos por moneda, nunca sumados entre monedas. */
function plata(xs: ReadonlyArray<{ monto: number; moneda: string }>): string {
  const t = new Map<string, number>();
  for (const x of xs) t.set(x.moneda, Math.round(((t.get(x.moneda) ?? 0) + x.monto) * 100) / 100);
  return [...t].map(([m, v]) => fmtMonto(v, m)).join(" + ") || "—";
}

const DE = { ODOO: "Odoo", MERCURY: "Mercury" } as const;

/** Cómo se resuelve una sección: con la firma de arriba, fila por fila, o del otro lado (Odoo o Mercury). */
type Salida = "firma" | "fila";

const SALIDA: Record<Salida, { etiqueta: string; clase: string }> = {
  firma: { etiqueta: "Entra en «Confirmar con mi firma»", clase: "border-info-line bg-info-surface text-info-ink" },
  fila: { etiqueta: "No entra en la firma: se resuelve fila por fila", clase: "border-warn-line bg-warn-surface text-warn-ink" },
};

function Seccion({
  titulo,
  que,
  pasos,
  salida,
  children,
}: {
  titulo: string;
  /** Qué es, en una o dos frases. */
  que: string;
  /** Cómo se resuelve, en orden. */
  pasos: string[];
  salida: Salida;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <header className="space-y-2 border-b border-line px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-fg">{titulo}</h3>
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${SALIDA[salida].clase}`}>{SALIDA[salida].etiqueta}</span>
        </div>
        <div className="grid gap-x-6 gap-y-1.5 text-xs md:grid-cols-2">
          <p className="text-fg-secondary">
            <span className="font-semibold text-fg">Qué es: </span>
            {que}
          </p>
          <div className="text-fg-secondary">
            <span className="font-semibold text-fg">Cómo se resuelve:</span>
            <ol className="mt-0.5 list-decimal space-y-0.5 pl-4">
              {pasos.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ol>
          </div>
        </div>
      </header>
      {children}
    </section>
  );
}

function Casilla({ marcada, onCambio, etiqueta, deshabilitada }: { marcada: boolean; onCambio: (v: boolean) => void; etiqueta: string; deshabilitada?: boolean }) {
  return (
    <input
      type="checkbox"
      className="h-4 w-4 accent-current"
      checked={marcada}
      disabled={deshabilitada}
      aria-label={etiqueta}
      onChange={(e) => onCambio(e.target.checked)}
    />
  );
}

export default function LoPagado({ puedeEditar, recarga = 0 }: { puedeEditar: boolean; recarga?: number }) {
  const toast = useToast();
  const [lista, setLista] = useState<Lista | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [cobrar, setCobrar] = useState<Set<string>>(new Set());
  const [pegar, setPegar] = useState<Set<string>>(new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [saltadas, setSaltadas] = useState<Confirmado["resultado"]["saltadas"]>([]);

  const tomar = useCallback((l: Lista) => {
    setLista(l);
    // Todo arranca marcado: es lo que Odoo y Mercury ya dicen. La persona desmarca lo que no ve bien.
    setCobrar(new Set(l.acciones.filter((a) => a.cobrar).map((a) => a.cobroId)));
    const sinFecha = new Set(l.pagadasSinFecha.map((p) => p.cobroId));
    setPegar(new Set(l.acciones.filter((a) => !a.cobrar && !sinFecha.has(a.cobroId)).map((a) => a.cobroId)));
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      tomar(await fetchJson<Lista>("/api/cobranza/libro"));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo armar la lista.");
    } finally {
      setCargando(false);
    }
  }, [tomar]);

  useEffect(() => {
    void cargar();
  }, [cargar, recarga]);

  const paraCobrar = useMemo(() => lista?.acciones.filter((a) => a.cobrar) ?? [], [lista]);
  /* ⚠ Una pagada sin el día del pago también viene como acción (para pegarla a su factura), pero no va en «Se pegan a su
     factura»: ese texto dice que todavía no están pagadas. Se ve solo en «Sin el día del pago». */
  const soloPegar = useMemo(() => {
    if (!lista) return [];
    const sinFecha = new Set(lista.pagadasSinFecha.map((p) => p.cobroId));
    return lista.acciones.filter((a) => !a.cobrar && !sinFecha.has(a.cobroId));
  }, [lista]);
  const marcadasCobrar = paraCobrar.filter((a) => cobrar.has(a.cobroId));
  const marcadasPegar = soloPegar.filter((a) => pegar.has(a.cobroId));
  const nada = marcadasCobrar.length + marcadasPegar.length === 0;

  const alternar = (set: Set<string>, poner: (s: Set<string>) => void, id: string, v: boolean) => {
    const n = new Set(set);
    if (v) n.add(id);
    else n.delete(id);
    poner(n);
  };

  const confirmar = async () => {
    try {
      const r = await fetchJson<Confirmado>("/api/cobranza/libro", {
        method: "POST",
        body: JSON.stringify({
          pegar: marcadasPegar.map((a) => a.cobroId),
          cobrar: marcadasCobrar.map((a) => ({ cobroId: a.cobroId, fechaCobro: a.cobrar!.fechaCobro })),
        }),
      });
      setConfirmando(false);
      setSaltadas(r.resultado.saltadas);
      if (r.queda) tomar({ ...r.queda, firma: lista?.firma ?? "" });
      else void cargar();
      if (r.resultado.saltadas.length === 0) toast.success(`Listo: ${r.resultado.escritas} ${r.resultado.escritas === 1 ? "cuota quedó" : "cuotas quedaron"} al día, con tu firma.`);
      else toast.error(`Se escribieron ${r.resultado.escritas}; ${r.resultado.saltadas.length} no, y abajo dice por qué.`);
    } catch (e) {
      setConfirmando(false);
      toast.error(e instanceof ApiError ? e.message : "No se pudo confirmar.");
    }
  };

  if (cargando && !lista) {
    return <ListSkeleton rows={6} />;
  }
  if (error && !lista) {
    return (
      <Alert variant="danger" title="No se pudo armar la lista">
        {error}{" "}
        <button type="button" onClick={() => void cargar()} className="font-semibold underline">
          Volver a intentar
        </button>
      </Alert>
    );
  }
  if (!lista) return null;

  const vacia = paraCobrar.length + soloPegar.length + lista.pagadasSinFecha.length + lista.choques.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <p className="min-w-0 max-w-3xl flex-[1_1_420px] text-sm text-fg-secondary">
          Lo que Odoo y Mercury ya dan por facturado o pagado y en Nexus todavía no. Lo pagado y conciliado con el banco se
          cobra solo cada hora, de 7:00 a 19:00, y al apretar «Actualizar desde Odoo y Mercury»; acá queda lo que necesita tu mirada, y cada fila dice por
          qué. Lo que confirmas queda a tu nombre en la bitácora de cada cuenta, y nada se escribe en Odoo ni en Mercury.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => void cargar()} disabled={cargando} title="Vuelve a leer la copia de Odoo y Mercury y el día de cada pago.">
            {cargando ? "Leyendo…" : "Volver a mirar"}
          </Button>
          {puedeEditar && !vacia && (
            <Button
              size="sm"
              onClick={() => setConfirmando(true)}
              disabled={nada}
              title="Confirma lo que dejaste marcado en «Pagadas allá, listas para cobrar» y en «Se pegan a su factura». «Sin el día del pago» y los choques no entran: se resuelven fila por fila."
            >
              Confirmar con mi firma
            </Button>
          )}
        </div>
      </div>

      {!lista.conOdoo && (
        <Alert variant="warning" title="Sin la clave de Odoo">
          Este servidor no puede pedirle a Odoo el día de cada pago: las facturas pagadas de Odoo quedan en «Sin el día del pago».
        </Alert>
      )}

      {lista.avisoOdoo && (
        <Alert variant="warning" title="Odoo no contestó">
          {lista.avisoOdoo} Lo de Mercury se ve igual. Vuelve a mirar en un rato.
        </Alert>
      )}

      {saltadas.length > 0 && (
        <Alert variant="warning" title="Lo que no se escribió">
          <ul className="list-disc pl-4">
            {saltadas.map((s) => (
              <li key={s.cobroId}>
                {s.cuenta}: {s.motivo}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {vacia ? (
        <EmptyState title="Todo al día" description="Lo que Odoo y Mercury dan por facturado o pagado ya está así en Nexus." />
      ) : (
        <>
          <Seccion
            titulo={`Pagadas allá, listas para cobrar · ${paraCobrar.length} · ${plata(paraCobrar)}`}
            salida="firma"
            que="Odoo (pagada o en proceso de pago) o Mercury («Paid», con su entrada de plata) dicen que el cliente pagó, y en Nexus la cuota sigue por cobrar. Se sabe qué día entró la plata."
            pasos={[
              "Las que no dicen nada al costado se cobran solas en la próxima hora, o ya mismo con «Actualizar desde Odoo y Mercury».",
              "Las que dicen por qué esperan: revísalas, deja marcadas las que ves bien y aprieta «Confirmar con mi firma». Quedan cobradas con el día real del pago.",
              "Si una no corresponde, desmárcala: se queda acá sin cambiar nada.",
            ]}
          >
            {paraCobrar.length === 0 ? (
              <p className="px-4 py-3 text-xs text-fg-muted">No hay cuotas pagadas allá que sigan por cobrar.</p>
            ) : (
              <Tabla
                filas={paraCobrar}
                marcadas={cobrar}
                puedeEditar={puedeEditar}
                onMarcar={(id, v) => alternar(cobrar, setCobrar, id, v)}
                onTodas={(v) => setCobrar(v ? new Set(paraCobrar.map((a) => a.cobroId)) : new Set())}
                ultima={(a) => (
                  <span className="flex flex-col" title={a.cobrar!.deDonde}>
                    <span>Cobrada el {fmtFecha(a.cobrar!.fechaCobro)}</span>
                    <span className={`text-xs ${a.cobrar!.porQueNoSolo ? "text-warn-ink" : "text-fg-muted"}`}>
                      {a.cobrar!.porQueNoSolo ?? "La cobra el sistema en la próxima hora, o ya mismo con «Actualizar desde Odoo y Mercury»."}
                    </span>
                  </span>
                )}
              />
            )}
          </Seccion>

          <Seccion
            titulo={`Se pegan a su factura · ${soloPegar.length} · ${plata(soloPegar)}`}
            salida="firma"
            que="No mueve plata. Odoo o Mercury tienen la factura de esta cuota (por su número, o porque es la única con ese monto exacto) y a la cuota le falta anotarla: todavía no está pagada, o ya estaba cobrada acá sin el número."
            pasos={[
              "Revisa que la factura sea de esa cuota (mismo mes y monto).",
              "Deja marcadas las que ves bien y aprieta «Confirmar con mi firma»: la cuota queda con el número y la fecha de la factura. Así, el día que se pague, se cobra sola.",
              "Si una no es de esa cuota, desmárcala y anota el número correcto desde la cuenta.",
            ]}
          >
            {soloPegar.length === 0 ? (
              <p className="px-4 py-3 text-xs text-fg-muted">Ninguna cuota espera su factura.</p>
            ) : (
              <Tabla
                filas={soloPegar}
                marcadas={pegar}
                puedeEditar={puedeEditar}
                onMarcar={(id, v) => alternar(pegar, setPegar, id, v)}
                onTodas={(v) => setPegar(v ? new Set(soloPegar.map((a) => a.cobroId)) : new Set())}
                ultima={(a) => (
                  <span>
                    {a.yaCobrada ? "Ya cobrada · " : ""}
                    {a.fechaEmision ? `Facturada el ${fmtFecha(a.fechaEmision)}` : "Solo el número"}
                  </span>
                )}
              />
            )}
          </Seccion>

          {lista.pagadasSinFecha.length > 0 && (
            <Seccion
              titulo={`Sin el día del pago · ${lista.pagadasSinFecha.length}`}
              salida="fila"
              que="Odoo o Mercury las dan pagadas, pero no hay una entrada de plata que lo pruebe: Nexus no sabe si la plata entró ni qué día. Por eso no se cobran solas ni con la firma (el día decide el mes del gráfico). Pasa, por ejemplo, cuando alguien la marca pagada en Mercury a mano o el cliente pagó a otra cuenta."
              pasos={[
                "Revisa en el banco si la plata entró y qué día.",
                "Si entró: «Registrar el pago» en esa fila, con la fecha real. Queda cobrada a tu nombre.",
                "Si no entró: pide que la corrijan en Mercury u Odoo (que no figure pagada). Sale sola de esta lista con la próxima copia.",
                "Si la entrada aparece después en Mercury, sale sola y se cobra en la hora siguiente.",
              ]}
            >
              <Filas filas={lista.pagadasSinFecha} accion="Registrar el pago" ayuda="Abre la cuenta en Cobranza: ahí registras el pago de esta cuota con el día en que entró la plata." />
            </Seccion>
          )}

          {lista.choques.length > 0 && (
            <Seccion
              titulo={`Choques · ${lista.choques.length} · ${plata(lista.choques)}`}
              salida="fila"
              que="Al revés: en Nexus la cuota está cobrada y Odoo o Mercury dicen que la factura no está pagada. Uno de los dos está mal, y Nexus no lo cambia solo."
              pasos={[
                "Revisa en el banco si el pago entró.",
                "Si entró: que lo registren en Odoo o en Mercury. El choque se va solo con la próxima copia.",
                "Si no entró: abre la cuenta y saca la cuota de Cobrado con el motivo. Vuelve a quedar por cobrar.",
              ]}
            >
              <Filas filas={lista.choques} accion="Abrir la cuenta" ayuda="Abre la cuenta en Cobranza, con esta cuota: ahí la sacas de Cobrado si el pago no entró." />
            </Seccion>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmando}
        onCancel={() => setConfirmando(false)}
        onConfirm={confirmar}
        variant="default"
        title="¿Confirmar con tu firma?"
        confirmLabel="Confirmar"
        description={[
          marcadasCobrar.length ? `Se cobran ${marcadasCobrar.length} ${marcadasCobrar.length === 1 ? "cuota" : "cuotas"} (${plata(marcadasCobrar)}) con el día real de cada pago.` : null,
          marcadasPegar.length ? `Se pegan ${marcadasPegar.length} ${marcadasPegar.length === 1 ? "cuota" : "cuotas"} a su factura.` : null,
          `Queda firmado por ${lista.firma} en la bitácora de cada cuenta.`,
        ]
          .filter(Boolean)
          .join(" ")}
      />
    </div>
  );
}

function Tabla({
  filas,
  marcadas,
  puedeEditar,
  onMarcar,
  onTodas,
  ultima,
}: {
  filas: AccionVista[];
  marcadas: Set<string>;
  puedeEditar: boolean;
  onMarcar: (id: string, v: boolean) => void;
  onTodas: (v: boolean) => void;
  ultima: (a: AccionVista) => React.ReactNode;
}) {
  const todas = filas.every((a) => marcadas.has(a.cobroId));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-fg-muted">
            <th className="w-10 px-4 py-1.5">{puedeEditar && <Casilla marcada={todas} onCambio={onTodas} etiqueta="Marcar todas" />}</th>
            <th className="px-2 py-1.5 font-medium">Cuenta</th>
            <th className="px-2 py-1.5 font-medium">Cuota</th>
            <th className="px-2 py-1.5 text-right font-medium">Monto</th>
            <th className="px-2 py-1.5 font-medium">Factura</th>
            <th className="px-4 py-1.5 font-medium">Queda</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((a) => (
            <tr key={a.cobroId} className="border-t border-line">
              <td className="px-4 py-2">
                {puedeEditar && <Casilla marcada={marcadas.has(a.cobroId)} onCambio={(v) => onMarcar(a.cobroId, v)} etiqueta={`Marcar ${a.cuenta} ${a.periodo}`} />}
              </td>
              <td className="px-2 py-2">
                <Link href={`/cobranza?cuenta=${a.cuentaId}`} className="font-medium text-fg hover:underline">
                  {a.cuenta}
                </Link>
              </td>
              <td className="px-2 py-2 text-fg-secondary">{etiquetaMes(a.periodo)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-fg">{fmtMonto(a.monto, a.moneda)}</td>
              <td className="px-2 py-2 text-fg-secondary">
                {a.numero} <span className="text-xs text-fg-muted">· {DE[a.fuente]}</span>
              </td>
              <td className="px-4 py-2 text-fg-secondary">{ultima(a)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Filas({ filas, accion, ayuda }: { filas: PegadoVisto[]; accion: string; ayuda: string }) {
  return (
    <ul>
      {filas.map((p) => (
        <li key={p.cobroId} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-4 py-2 text-sm first:border-t-0">
          <Link href={`/cobranza?cuenta=${p.cuentaId}`} className="font-medium text-fg hover:underline">
            {p.cuenta}
          </Link>
          <span className="text-fg-secondary">{etiquetaMes(p.periodo)}</span>
          <span className="tabular-nums text-fg">{fmtMonto(p.monto, p.moneda)}</span>
          <span className="text-fg-secondary">
            {p.numero} <span className="text-xs text-fg-muted">· {DE[p.fuente]} · del {fmtFecha(p.fechaFactura)}</span>
          </span>
          <Link
            href={`/cobranza?cuenta=${p.cuentaId}`}
            title={ayuda}
            className="ml-auto shrink-0 rounded-md px-2 py-1 text-xs font-medium text-brand hover:bg-surface-hover"
          >
            {accion}
          </Link>
        </li>
      ))}
    </ul>
  );
}
