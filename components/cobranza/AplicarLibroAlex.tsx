"use client";

/**
 * components/cobranza/AplicarLibroAlex.tsx — «Aplicar», dentro del lote del libro de Alex (etapa 13).
 *
 * Carga en Nexus las facturas del libro que Nexus no tiene (lib/cobranza/libro-alex-aplicar.ts). Por cada
 * nombre en factura, Alex elige la cuenta (o la da de alta con «Nueva empresa»), dice si los totales traen IVA
 * y tilda qué facturas entran. Entran POR COBRAR, facturadas, con su número y a nombre de quien aplica.
 *
 * ⛔ Nada entra como cobrado. Una factura que el libro da pagada no se tilda sola; si se carga, el pago lo
 * registra quien lo vea, en el cronograma y con el comprobante. Nexus no elige la cuenta de un nombre que solo
 * se parece, no decide el IVA y no convierte una anotación en promesa: la propone y la registra Alex.
 *
 * El POST lleva cuenta, IVA, facturas y anotaciones: por forma no tiene lugar para un estado, y el servidor
 * vuelve a armar el plan antes de cargar. Lo vigila libro-alex-aplicar.test.ts sobre este archivo.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import type { AnotacionDeCobro, FacturaDelLibroACargar, GrupoDelLibro, IvaDelLibro } from "@/lib/cobranza/libro-alex-aplicar";
import type { RespuestaDeAplicar, ResultadoDeAplicar } from "@/lib/cobranza/libro-alex-aplicar-server";
import NuevaEmpresaModal from "./NuevaEmpresaModal";
import { etiquetaMes, fmtFecha, fmtMonto, SELECT_CLS } from "./format";

type Decision = { cuentaId: string; iva: IvaDelLibro | null; tildadas: ReadonlySet<string> };

const PLATAFORMA_LABEL: Record<string, string> = { ODOO: "Odoo", MERCURY: "Mercury", OTRA: "QuickBooks" };
const ESTADO_COBRO: Record<string, string> = { PROGRAMADO: "Programado", POR_COBRAR: "Por cobrar", COBRADO: "Cobrado", SIN_DATO: "Sin dato" };
const ESTADO_LIBRO: Record<string, string> = { PAGADO: "pagada", SIN_PAGAR: "sin pagar", ACTIVA: "activa" };
const VIA_LABEL: Record<string, string> = {
  NUMERO: "por el número anotado",
  ODOO: "por el cliente de Odoo",
  CEDULA: "por la cédula",
  NOMBRE: "por el nombre",
  ALIAS: "por el nombre entre paréntesis",
};

const BTN_PRIMARY =
  "text-xs font-medium px-3 py-1.5 rounded-lg border border-brand/30 text-brand bg-brand/10 hover:bg-brand/20 disabled:opacity-50 disabled:cursor-not-allowed";
const BTN_GHOST =
  "text-xs font-medium px-3 py-1.5 rounded-lg border border-line text-fg-secondary hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed";

/** Lo que entra de una factura. La misma cuenta que `montoACargar`: la decide el servidor, acá solo se muestra. */
function montoQueEntra(f: FacturaDelLibroACargar, iva: IvaDelLibro | null): number | null {
  if (f.neto !== null) return f.neto;
  if (iva === "CON_IVA") return f.totalSinIva;
  if (iva === "SIN_IVA") return f.total;
  return null;
}

const decisionInicial = (g: GrupoDelLibro): Decision => ({
  cuentaId: g.cuenta?.cuentaId ?? "",
  iva: g.ivaSugerido,
  tildadas: new Set(g.facturas.filter((f) => f.sugerida).map((f) => f.clave)),
});

export default function AplicarLibroAlex({ importId }: { importId: string }) {
  const toast = useToast();
  const [datos, setDatos] = useState<RespuestaDeAplicar | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [decisiones, setDecisiones] = useState<Record<string, Decision>>({});
  const [anotar, setAnotar] = useState<ReadonlySet<string>>(new Set());
  const [creandoPara, setCreandoPara] = useState<GrupoDelLibro | null>(null);
  const [aplicando, setAplicando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoDeAplicar | null>(null);
  const [promesasHechas, setPromesasHechas] = useState<Record<string, string>>({});
  const [guardandoPromesa, setGuardandoPromesa] = useState<string | null>(null);
  const [verNoSeCargan, setVerNoSeCargan] = useState(false);

  useEffect(() => {
    let vigente = true;
    (async () => {
      try {
        const d = await fetchJson<RespuestaDeAplicar>(`/api/cobranza/import/${importId}/aplicar`);
        if (!vigente) return;
        setDatos(d);
        setError(null);
        /* Al volver a armar el plan, lo que Alex ya eligió se conserva; lo que se cargó deja de estar. */
        setDecisiones((antes) =>
          Object.fromEntries(
            d.plan.grupos.map((g) => {
              const previa = antes[g.clave];
              if (!previa) return [g.clave, decisionInicial(g)];
              const siguen = new Set(g.facturas.map((f) => f.clave));
              return [g.clave, { ...previa, tildadas: new Set([...previa.tildadas].filter((c) => siguen.has(c))) }];
            }),
          ),
        );
        const ya = new Set(d.yaAnotadas);
        setAnotar(new Set(d.plan.anotaciones.filter((a) => !ya.has(a.clave)).map((a) => a.clave)));
      } catch (e) {
        if (vigente) setError(e instanceof ApiError ? e.message : "No se pudo armar el plan de carga.");
      }
    })();
    return () => {
      vigente = false;
    };
  }, [importId, version]);

  /* Un grupo entra en la carga cuando tiene cuenta y todas sus facturas tildadas tienen monto. Los demás
     esperan su decisión sin frenar a los listos: Alex aplica por partes, a medida que da de alta las cuentas. */
  const listos = useMemo(() => {
    const grupos: Array<{ clave: string; cuentaId: string; iva: IvaDelLibro | null; facturas: string[] }> = [];
    const porMoneda = new Map<string, number>();
    const esperan: string[] = [];
    for (const g of datos?.plan.grupos ?? []) {
      const d = decisiones[g.clave];
      const tildadas = d ? g.facturas.filter((f) => d.tildadas.has(f.clave)) : [];
      if (!d || !tildadas.length) continue;
      if (!d.cuentaId) {
        esperan.push(`la cuenta de «${g.cliente}»`);
        continue;
      }
      const montos = tildadas.map((f) => montoQueEntra(f, d.iva));
      if (montos.some((m) => m === null)) {
        esperan.push(`si «${g.cliente}» trae IVA`);
        continue;
      }
      tildadas.forEach((f, i) => porMoneda.set(f.moneda, (porMoneda.get(f.moneda) ?? 0) + (montos[i] ?? 0)));
      grupos.push({ clave: g.clave, cuentaId: d.cuentaId, iva: d.iva, facturas: tildadas.map((f) => f.clave) });
    }
    return { grupos, facturas: grupos.reduce((n, g) => n + g.facturas.length, 0), porMoneda, esperan };
  }, [datos, decisiones]);

  function cambiar(clave: string, cambio: Partial<Decision>) {
    setDecisiones((ds) => {
      const d = ds[clave];
      return d ? { ...ds, [clave]: { ...d, ...cambio } } : ds;
    });
  }

  function tildar(grupo: string, factura: string, si: boolean) {
    setDecisiones((ds) => {
      const d = ds[grupo];
      if (!d) return ds;
      const tildadas = new Set(d.tildadas);
      if (si) tildadas.add(factura);
      else tildadas.delete(factura);
      return { ...ds, [grupo]: { ...d, tildadas } };
    });
  }

  function anotarUna(clave: string, si: boolean) {
    setAnotar((s) => {
      const n = new Set(s);
      if (si) n.add(clave);
      else n.delete(clave);
      return n;
    });
  }

  async function aplicar() {
    if (!datos || aplicando) return;
    setAplicando(true);
    try {
      const r = await fetchJson<ResultadoDeAplicar>(`/api/cobranza/import/${importId}/aplicar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grupos: listos.grupos, anotaciones: [...anotar] }),
      });
      setResultado(r);
      toast.success(
        r.cargadas.length
          ? `${r.cargadas.length} ${r.cargadas.length === 1 ? "factura cargada" : "facturas cargadas"} por cobrar, a tu nombre.`
          : "No se cargó ninguna factura: mirá el detalle.",
      );
      setVersion((v) => v + 1);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cargar el libro.");
    } finally {
      setAplicando(false);
    }
  }

  async function registrarPromesa(a: AnotacionDeCobro) {
    const fecha = a.promesaPropuesta;
    if (!fecha || !a.cobroId || guardandoPromesa) return;
    setGuardandoPromesa(a.clave);
    try {
      await fetchJson(`/api/cobranza/cobros/${a.cobroId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promesaPago: fecha }),
      });
      setPromesasHechas((p) => ({ ...p, [a.clave]: fecha }));
      toast.success(`Promesa del ${fmtFecha(fecha)} registrada en ${a.cuentaNombre}.`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo registrar la promesa.");
    } finally {
      setGuardandoPromesa(null);
    }
  }

  if (error) {
    return (
      <Alert variant="warning">
        <p className="text-xs">{error}</p>
      </Alert>
    );
  }
  if (!datos) return <p className="text-xs text-fg-muted">Armando qué facturas del libro faltan en Nexus…</p>;

  const { plan, cuentas, faltaSql } = datos;
  const sinCuenta = plan.grupos.filter((g) => !g.cuenta).length;
  const totalFacturas = plan.grupos.reduce((n, g) => n + g.facturas.length, 0);
  const yaAnotadas = new Set(datos.yaAnotadas);
  const bloqueado = faltaSql.length > 0 || aplicando || listos.facturas + anotar.size === 0;

  return (
    <div className="space-y-3">
      <Alert variant="info">
        <p className="text-xs">
          Cargá las facturas del libro que Nexus no tiene. Entran por cobrar, facturadas con su número y a tu nombre, en un
          servicio «Facturación importada del libro de Alex» de la cuenta. Nada entra como cobrado: si el libro la da pagada, no
          se tilda sola, y el pago lo registra quien lo vea, con el comprobante. Montos sin IVA, igual que los cobros.
        </p>
      </Alert>
      {faltaSql.length > 0 && (
        <Alert variant="warning">
          <p className="text-xs">
            Todavía no se puede cargar: falta correr {faltaSql.join(" y ")}. El plan se ve igual.
          </p>
        </Alert>
      )}

      <p className="text-[11px] text-fg-muted">
        {totalFacturas} facturas del libro que Nexus no tiene, de {plan.grupos.length} nombres en factura · {sinCuenta} sin una
        cuenta propuesta · libro subido el {fmtFecha(plan.referenciaISO)}
      </p>

      {plan.grupos.length === 0 && <p className="text-xs text-fg-muted">No quedan facturas del libro por cargar.</p>}

      <ul className="space-y-3">
        {plan.grupos.map((g) => {
          const d = decisiones[g.clave] ?? decisionInicial(g);
          const posibles = [...(g.cuenta ? [g.cuenta] : []), ...g.cuentasPosibles];
          const idsPosibles = new Set(posibles.map((c) => c.cuentaId));
          return (
            <li key={g.clave} className="rounded-xl border border-line bg-surface p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-line bg-surface-muted text-fg-muted">
                  {PLATAFORMA_LABEL[g.plataforma] ?? g.plataforma}
                </span>
                <span className="min-w-0 text-xs font-semibold text-fg">{g.cliente}</span>
                <span className="text-[11px] text-fg-muted">
                  {g.facturas.length === 1 ? "1 factura" : `${g.facturas.length} facturas`}
                </span>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-fg-muted">Cuenta en Nexus</label>
                  <div className="flex gap-2">
                    <select
                      value={d.cuentaId}
                      onChange={(e) => cambiar(g.clave, { cuentaId: e.target.value })}
                      className={`${SELECT_CLS} min-w-0 flex-1`}
                    >
                      <option value="">— elegí la cuenta —</option>
                      {posibles.length > 0 && (
                        <optgroup label="Puede ser">
                          {posibles.map((c) => (
                            <option key={c.cuentaId} value={c.cuentaId}>
                              {c.nombre}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      <optgroup label="Todas las cuentas">
                        {cuentas
                          .filter((c) => !idsPosibles.has(c.id))
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nombre}
                            </option>
                          ))}
                      </optgroup>
                    </select>
                    <button type="button" onClick={() => setCreandoPara(g)} className={BTN_GHOST}>
                      Nueva empresa
                    </button>
                  </div>
                  {g.cuenta && d.cuentaId === g.cuenta.cuentaId && (
                    <p className="text-[10px] text-fg-muted">Propuesta {VIA_LABEL[g.cuenta.via] ?? ""}. Si no es, elegí otra.</p>
                  )}
                  {!g.cuenta && (
                    <p className="text-[10px] text-fg-muted">
                      Nexus no la elige: {posibles.length ? "hay candidatas por el nombre, confirmá cuál es" : "ninguna cuenta se llama así"}.
                      Si la empresa no existe, dala de alta.
                    </p>
                  )}
                  {g.clienteDeOdoo && (
                    <p className="text-[10px] text-warn-ink">
                      El cliente de Odoo «{g.clienteDeOdoo}» no está emparejado. Después de cargar, emparejalo en{" "}
                      <Link href="/cobranza/odoo" className="underline decoration-dotted">
                        Cobranza › Odoo
                      </Link>
                      .
                    </p>
                  )}
                </div>
                {g.pideIva && (
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-fg-muted">¿Los totales del libro traen IVA?</label>
                    <select
                      value={d.iva ?? ""}
                      onChange={(e) =>
                        cambiar(g.clave, { iva: e.target.value === "CON_IVA" || e.target.value === "SIN_IVA" ? e.target.value : null })
                      }
                      className={SELECT_CLS}
                    >
                      <option value="">— decilo antes de cargar —</option>
                      <option value="SIN_IVA">No: entran tal cual</option>
                      <option value="CON_IVA">Sí, el 13 %: entran ÷ 1,13</option>
                    </select>
                    {g.ivaSugerido && d.iva === g.ivaSugerido && (
                      <p className="text-[10px] text-fg-muted">Propuesto: la cuenta es nacional y ya factura con IVA en Odoo.</p>
                    )}
                  </div>
                )}
              </div>

              <ul className="space-y-1.5">
                {g.facturas.map((f) => {
                  const monto = montoQueEntra(f, d.iva);
                  const tildada = d.tildadas.has(f.clave);
                  return (
                    <li key={f.clave} className="rounded-lg border border-line bg-surface-muted px-3 py-2 space-y-1">
                      <label className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <input
                          type="checkbox"
                          checked={tildada}
                          onChange={(e) => tildar(g.clave, f.clave, e.target.checked)}
                          className="h-3.5 w-3.5"
                        />
                        <span className="font-semibold text-fg">{f.numero}</span>
                        <span className="text-fg-secondary">
                          {fmtFecha(f.fechaFactura)} · {etiquetaMes(f.periodo)}
                        </span>
                        <span className="text-fg-secondary">{fmtMonto(f.total, f.moneda)} en el libro</span>
                        <span className={monto === null ? "text-warn-ink" : "text-fg"}>
                          {monto === null
                            ? "entra cuando digas el IVA"
                            : `entra ${fmtMonto(monto, f.moneda)}${f.neto !== null ? " (neto del espejo)" : ""}`}
                        </span>
                        {f.estadoLibro && (
                          <span
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                              f.pagadaSegunLibro
                                ? "border-info-line bg-info-surface text-info-ink"
                                : "border-warn-line bg-warn-surface text-warn-ink"
                            }`}
                          >
                            {ESTADO_LIBRO[f.estadoLibro] ?? f.estadoLibro} según el libro
                          </span>
                        )}
                      </label>
                      {f.anotacion && (
                        <p className="pl-6 text-[11px] text-fg-secondary">
                          «{f.anotacion}»
                          {f.promesaPropuesta &&
                            ` · trae fecha: ${fmtFecha(f.promesaPropuesta)}. Después de cargarla, la promesa se registra abajo.`}
                        </p>
                      )}
                      {f.avisos.length > 0 && (
                        <ul className="space-y-0.5 pl-6 text-[11px] text-warn-ink">
                          {f.avisos.map((a) => (
                            <li key={a}>⚠ {a}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>

      {plan.anotaciones.length > 0 && (
        <div className="rounded-xl border border-line bg-surface p-3 space-y-2">
          <p className="text-xs font-semibold text-fg">Anotaciones del libro sobre cobros que Nexus ya tiene</p>
          <p className="text-[11px] text-fg-muted">
            Van a la bitácora de su cobro, una sola vez. Si el texto trae una fecha, Nexus la propone como promesa y la registrás
            vos: la factura sigue vencida y su alerta, a la vista.
          </p>
          <ul className="space-y-1.5">
            {plan.anotaciones.map((a) => {
              const ya = yaAnotadas.has(a.clave);
              const promesa = promesasHechas[a.clave] ?? a.promesaActual;
              return (
                <li key={a.clave} className="rounded-lg border border-line bg-surface-muted px-3 py-2 space-y-1">
                  <label className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <input
                      type="checkbox"
                      checked={!ya && anotar.has(a.clave)}
                      disabled={ya}
                      onChange={(e) => anotarUna(a.clave, e.target.checked)}
                      className="h-3.5 w-3.5"
                    />
                    <span className="font-semibold text-fg">{a.cuentaNombre}</span>
                    <span className="text-fg-secondary">
                      {a.cobroId === null
                        ? `«${a.cliente}» · habla de ${a.cuotas} cuotas: va a la bitácora de la cuenta`
                        : `${a.numero ?? a.documento} · ${a.periodo ? etiquetaMes(a.periodo) : "sin mes"} · ${fmtMonto(a.monto, a.moneda)} · ${
                            a.estado ? (ESTADO_COBRO[a.estado] ?? a.estado) : ""
                          }`}
                    </span>
                    {ya && <span className="text-[10px] text-fg-muted">ya está en la bitácora</span>}
                  </label>
                  <p className="pl-6 text-[11px] text-fg-secondary">«{a.anotacion}»</p>
                  {a.promesaPropuesta && (
                    <div className="flex flex-wrap items-center gap-2 pl-6">
                      {promesa === a.promesaPropuesta ? (
                        <span className="text-[11px] text-success-ink">Promesa del {fmtFecha(a.promesaPropuesta)} registrada.</span>
                      ) : (
                        <>
                          <span className="text-[11px] text-fg-secondary">
                            Trae fecha: {fmtFecha(a.promesaPropuesta)}
                            {promesa ? ` · Nexus tiene el ${fmtFecha(promesa)}` : ""}.
                          </span>
                          <button
                            type="button"
                            onClick={() => void registrarPromesa(a)}
                            disabled={guardandoPromesa !== null}
                            className={BTN_GHOST}
                          >
                            {guardandoPromesa === a.clave ? "Registrando…" : `Registrar promesa del ${fmtFecha(a.promesaPropuesta)}`}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-xs text-fg">
            {listos.facturas === 1 ? "1 factura lista para cargar" : `${listos.facturas} facturas listas para cargar`}
            {listos.porMoneda.size > 0 &&
              ` · ${[...listos.porMoneda].map(([moneda, total]) => fmtMonto(total, moneda)).join(" + ")} sin IVA`}
            {anotar.size > 0 && ` · ${anotar.size} anotaciones`}
          </p>
          {listos.esperan.length > 0 && (
            <p className="text-[11px] text-warn-ink">
              Tildadas que no entran en esta carga hasta que decidas {listos.esperan.join(", ")}.
            </p>
          )}
        </div>
        <button type="button" onClick={() => void aplicar()} disabled={bloqueado} className={BTN_PRIMARY}>
          {aplicando ? "Cargando…" : "Cargar por cobrar"}
        </button>
      </div>

      {resultado && (
        <div className="rounded-xl border border-line bg-surface p-3 space-y-2">
          <p className="text-xs font-semibold text-fg">Lo que pasó en la última carga</p>
          <p className="text-[11px] text-fg-secondary">
            {resultado.cargadas.length} cargadas por cobrar · {resultado.yaEstaban.length} ya estaban · {resultado.rechazos.length}{" "}
            no se cargaron · {resultado.sociedadesNuevas} sociedades anotadas · {resultado.serviciosNuevos} servicios nuevos ·{" "}
            {resultado.anotacionesEscritas} anotaciones escritas
          </p>
          {resultado.cargadas.some((c) => c.pagadaSegunLibro) && (
            <Alert variant="warning">
              <p className="text-xs">
                El libro da pagadas{" "}
                {resultado.cargadas
                  .filter((c) => c.pagadaSegunLibro)
                  .map((c) => `${c.numero} (${c.cuentaNombre})`)
                  .join(", ")}
                . Si la plata entró, registrá el pago en ese cobro, desde el cronograma de la cuenta en{" "}
                <Link href="/cobranza" className="underline decoration-dotted">
                  Cobranza
                </Link>
                , con el comprobante. No con «Pago manual»: cargaría la factura otra vez.
              </p>
            </Alert>
          )}
          {resultado.cargadas.some((c) => c.avisos.length > 0) && (
            <ul className="space-y-0.5 text-[11px] text-warn-ink">
              {resultado.cargadas.flatMap((c) =>
                c.avisos
                  .filter((a) => !a.startsWith("El libro la da pagada"))
                  .map((a) => (
                    <li key={`${c.cobroId}-${a}`}>
                      ⚠ {c.numero}: {a}
                    </li>
                  )),
              )}
            </ul>
          )}
          {resultado.rechazos.length > 0 && (
            <ul className="space-y-0.5 text-[11px] text-danger-ink">
              {resultado.rechazos.map((r) => (
                <li key={`${r.clave}-${r.motivo}`}>
                  {r.numero ?? r.clave} · {r.cliente}: {r.motivo}
                </li>
              ))}
            </ul>
          )}
          {resultado.yaEstaban.length > 0 && (
            <p className="text-[11px] text-fg-muted">
              Ya estaban: {resultado.yaEstaban.map((y) => `${y.numero} (${y.cuentaNombre})`).join(", ")}.
            </p>
          )}
        </div>
      )}

      {plan.noSeCargan.length > 0 && (
        <div className="rounded-xl border border-line bg-surface p-3">
          <button type="button" onClick={() => setVerNoSeCargan((v) => !v)} className="text-xs font-medium text-fg-secondary hover:text-fg">
            {verNoSeCargan ? "Ocultar" : "Ver"} los {plan.noSeCargan.length} documentos que el libro no carga, y por qué
          </button>
          {verNoSeCargan && (
            <ul className="mt-2 space-y-1">
              {plan.noSeCargan.map((n) => (
                <li key={n.clave} className="text-[11px]">
                  <span className="font-medium text-fg">{n.numero ?? n.cliente}</span>{" "}
                  {n.numero && <span className="text-fg-muted">{n.cliente}</span>} — <span className="text-fg-secondary">{n.motivo}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {creandoPara && (
        <NuevaEmpresaModal
          open
          onClose={() => setCreandoPara(null)}
          inicial={{
            nombre: creandoPara.nombreSugerido,
            tipo: creandoPara.tipoSugerido,
            viaCobro: creandoPara.plataforma,
            moneda: creandoPara.monedaSugerida,
          }}
          onCreated={(cuentaId) => {
            cambiar(creandoPara.clave, { cuentaId });
            setCreandoPara(null);
            setVersion((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}
