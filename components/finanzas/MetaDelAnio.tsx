"use client";

/**
 * components/finanzas/MetaDelAnio.tsx — la meta del año como barra, contra lo facturado en los años anteriores, y de qué
 * está hecha la línea de «por facturar» (iniciativa C de docs/roadmap.md). SOLO DIRECCIÓN: lo montan Rentabilidad y el
 * punto de equilibrio, que ya lo son.
 *
 * La meta la edita dirección acá mismo («Cambiar la meta»): una fila nueva, firmada; la anterior queda en la historia.
 * Lo facturado sale de Odoo, Mercury y las comisiones confirmadas (lib/finanzas/meta.ts); lo que no se pudo convertir a
 * dólares se dice debajo, nunca se suma a ojo.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, Input } from "@/components/ui";
import { BotonAzul, BotonBlanco, BotonTexto, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import type { AnioDeLaBarra, MetaYPorFacturar } from "@/lib/finanzas/meta";

const miles = (n: number) => String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const usd = (x: number) => `${x < 0 ? "−" : ""}US$ ${miles(x)}`;
const millones = (x: number) => (Math.abs(x) >= 1_000_000 ? `US$ ${(x / 1_000_000).toLocaleString("es-CR", { maximumFractionDigits: 2 })} M` : usd(x));
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const mesCorto = (p: string) => `${MESES[Number(p.slice(5, 7)) - 1]}`;
const diaCorto = (iso: string) => {
  const d = new Date(Date.parse(iso) - 6 * 3_600_000);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

export default function MetaDelAnio({ datos, conLinea = false }: { datos: MetaYPorFacturar; conLinea?: boolean }) {
  const lectura = datos.meta;
  const enCurso = datos.anios.find((a) => a.enCurso) ?? null;
  const porFacturar = lectura?.enCurso?.porFacturar ?? 0;
  const tope = Math.max(lectura?.meta.montoUsd ?? 0, ...datos.anios.map((a) => a.usd + (a.enCurso ? porFacturar : 0)), 1);
  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface p-4" aria-labelledby="meta-del-anio">
      <Encabezado datos={datos} />
      <ul className="space-y-2">
        {datos.anios.map((a) => (
          <BarraDelAnio key={a.anio} a={a} tope={tope} porFacturar={a.enCurso ? porFacturar : 0} />
        ))}
        {lectura && (
          <li className="grid grid-cols-[56px_minmax(0,1fr)_150px] items-center gap-3">
            <span className="text-[13px] font-semibold text-fg">{lectura.meta.anio}</span>
            <span className="relative h-5 rounded-md border-2 border-dashed border-brand bg-info-surface" style={{ width: `${(lectura.meta.montoUsd / tope) * 100}%` }} />
            <span className="text-right text-[13px] font-semibold tabular-nums text-brand">Meta · {millones(lectura.meta.montoUsd)}</span>
          </li>
        )}
      </ul>
      {lectura && (
        <div className="grid gap-3 text-[13px] leading-[19px] text-fg-secondary md:grid-cols-3">
          <p>
            <b className="text-fg">Por mes:</b> para llegar hay que facturar {usd(lectura.porMes)} cada mes de {lectura.meta.anio}.
          </p>
          <p>
            <b className="text-fg">Contra {lectura.base?.anio ?? "el último año"}:</b>{" "}
            {lectura.crecimiento !== null && lectura.base
              ? `${Math.round(lectura.crecimiento * 100)} % más que los ${usd(lectura.base.usd)} de ${lectura.base.anio}.`
              : "no hay un año completo con facturas para comparar."}
          </p>
          {lectura.enCurso && enCurso && (
            <p>
              <b className="text-fg">{lectura.enCurso.anio} hasta hoy:</b> {usd(lectura.enCurso.facturado)} facturado, y {usd(lectura.enCurso.porFacturar)} programado
              que todavía no tiene factura.
            </p>
          )}
        </div>
      )}
      {datos.camino && <CaminoALaMeta camino={datos.camino} />}
      {conLinea && datos.linea && <LineaDePorFacturar datos={datos} />}
      {datos.sinConvertir.length > 0 && (
        <p className="text-xs text-fg-muted">
          Sin tipo de cambio (no entra en las barras):{" "}
          {datos.sinConvertir.map((s) => `${s.anio}: ${s.moneda === "CRC" ? "₡" : `${s.moneda} `}${miles(s.monto)}`).join(" · ")}.
        </p>
      )}
      <p className="text-xs text-fg-muted">
        Lo facturado es lo de Odoo (facturas publicadas menos notas de crédito) y Mercury (no canceladas), sin IVA, más las comisiones de aliados con monto
        confirmado. Los cobros de Cobranza no se suman: son las mismas facturas. Cada mes en colones va a dólares con su tipo de cambio.
      </p>
    </section>
  );
}

function Encabezado({ datos }: { datos: MetaYPorFacturar }) {
  const router = useRouter();
  const toast = useToast();
  const lectura = datos.meta;
  const [editando, setEditando] = useState(false);
  const [anio, setAnio] = useState(String(lectura?.meta.anio ?? Number(datos.hoyISO.slice(0, 4)) + 1));
  const [monto, setMonto] = useState(lectura ? String(Math.round(lectura.meta.montoUsd)) : "");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [verHistoria, setVerHistoria] = useState(false);

  const guardar = async () => {
    // La meta es en dólares enteros: «2.500.000», «2,500,000» y «2500000» son lo mismo (prueba 83).
    const montoUsd = Number(monto.replace(/\D/g, ""));
    if (!Number.isFinite(montoUsd) || montoUsd <= 0) return toast.error("Escribe la meta en dólares.");
    setGuardando(true);
    try {
      const r = await fetch("/api/cobranza/costos/meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anio: Number(anio), montoUsd, nota: nota.trim() || null }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "No se pudo guardar la meta.");
      toast.success(`Meta de ${anio} guardada.`);
      setEditando(false);
      setNota("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar la meta.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={ROTULO_DEL_SISTEMA}>La meta del año</p>
          <h2 id="meta-del-anio" className="text-sm font-semibold text-fg">
            {lectura ? `${millones(lectura.meta.montoUsd)} en ${lectura.meta.anio}` : "Todavía no hay una meta definida"}
          </h2>
          {lectura && (
            <p className="text-xs text-fg-muted">
              La definió {lectura.meta.definidaPor} el {diaCorto(lectura.meta.definidaAt)}
              {lectura.meta.nota ? ` · ${lectura.meta.nota}` : ""}
            </p>
          )}
        </div>
        {!editando && (
          <div className="flex items-center gap-2">
            {datos.historial.length > 1 && <BotonTexto onClick={() => setVerHistoria((v) => !v)}>{verHistoria ? "Ocultar la historia" : "Ver la historia"}</BotonTexto>}
            <BotonBlanco onClick={() => setEditando(true)}>{lectura ? "Cambiar la meta" : "Definir la meta"}</BotonBlanco>
          </div>
        )}
      </div>
      {verHistoria && (
        <ul className="space-y-0.5 text-xs text-fg-muted">
          {[...datos.historial].reverse().map((h) => (
            <li key={`${h.anio}-${h.definidaAt}`}>
              {h.anio}: {usd(h.montoUsd)} · {h.definidaPor} · {diaCorto(h.definidaAt)}
              {h.nota ? ` · ${h.nota}` : ""}
            </li>
          ))}
        </ul>
      )}
      {editando && (
        <div className="grid gap-3 rounded-lg bg-surface-muted p-3 sm:grid-cols-[110px_180px_minmax(0,1fr)_auto] sm:items-end">
          <Field label="Año">
            <Input inputMode="numeric" value={anio} onChange={(e) => setAnio(e.target.value.replace(/\D/g, "").slice(0, 4))} />
          </Field>
          <Field label="Meta en dólares">
            <Input inputMode="numeric" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="2300000" />
          </Field>
          <Field label="Por qué (opcional)">
            <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Lo que se acordó y con quién" />
          </Field>
          <div className="flex gap-2">
            <BotonTexto onClick={() => setEditando(false)} disabled={guardando}>
              Cancelar
            </BotonTexto>
            <BotonAzul onClick={guardar} disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar"}
            </BotonAzul>
          </div>
        </div>
      )}
    </div>
  );
}

function BarraDelAnio({ a, tope, porFacturar }: { a: AnioDeLaBarra; tope: number; porFacturar: number }) {
  if (a.documentos === 0) {
    return (
      <li className="grid grid-cols-[56px_minmax(0,1fr)_150px] items-center gap-3">
        <span className="text-[13px] font-semibold text-fg-muted">{a.anio}</span>
        <span className="text-xs text-fg-muted">No hay facturas de este año en la base.</span>
        <span />
      </li>
    );
  }
  const partes = [
    { clave: "odoo", h: a.usdPorFuente.odoo, clase: "bg-fg", texto: "Odoo" },
    { clave: "mercury", h: a.usdPorFuente.mercury, clase: "bg-fg-secondary", texto: "Mercury" },
    { clave: "aliados", h: a.usdPorFuente.aliados, clase: "bg-fg-muted", texto: "Aliados" },
  ];
  return (
    <li className="grid grid-cols-[56px_minmax(0,1fr)_150px] items-center gap-3">
      <span className="text-[13px] font-semibold text-fg">{a.anio}</span>
      <span className="flex h-5 overflow-hidden rounded-md bg-surface-muted" title={partes.map((p) => `${p.texto}: ${usd(p.h)}`).join(" · ")}>
        {partes.map((p) => (p.h > 0 ? <span key={p.clave} className={cn("h-full", p.clase)} style={{ width: `${(p.h / tope) * 100}%` }} /> : null))}
        {porFacturar > 0 && (
          <span className="h-full border-2 border-dashed border-fg-muted bg-surface" style={{ width: `${(porFacturar / tope) * 100}%` }} title={`Programado sin factura: ${usd(porFacturar)}`} />
        )}
      </span>
      <span className="text-right text-[13px] tabular-nums text-fg">
        {millones(a.usd)}
        {a.enCurso && <span className="block text-xs text-fg-muted">hasta hoy{porFacturar > 0 ? ` · +${millones(porFacturar)} por facturar` : ""}</span>}
      </span>
    </li>
  );
}

function CaminoALaMeta({ camino }: { camino: NonNullable<MetaYPorFacturar["camino"]> }) {
  return (
    <div className="space-y-2 rounded-lg bg-surface-muted p-3">
      <p className={ROTULO_DEL_SISTEMA}>Qué falta para la meta de {camino.anio}</p>
      <div className="grid gap-2 text-[13px] leading-[19px] text-fg-secondary sm:grid-cols-4">
        <p>
          <b className="block text-fg tabular-nums">{usd(camino.recurrenciaAnual)}</b>
          con la recurrencia de hoy ({usd(camino.recurrenciaMensual)} al mes, el promedio de los últimos 3 meses).
        </p>
        <p>
          <b className="block text-fg tabular-nums">{usd(camino.expansiones)}</b>
          en expansiones del pipeline de HubSpot (clientes de hoy), por monto × probabilidad.
        </p>
        <p>
          <b className="block text-fg tabular-nums">{usd(camino.nuevos)}</b>
          en negocios nuevos del pipeline, ponderados.
        </p>
        <p>
          <b className={cn("block tabular-nums", camino.falta > 0 ? "text-danger-ink" : "text-success-ink")}>{usd(camino.falta)}</b>
          {camino.falta > 0 ? `faltan: unos ${usd(camino.recurrenciaNuevaPorMes)} al mes de recurrencia nueva desde enero.` : "el pipeline ponderado alcanza para la meta."}
        </p>
      </div>
      <p className="text-xs text-fg-muted">Es una cuenta, no una predicción: no supone que la recurrencia crezca ni que se pierda.</p>
    </div>
  );
}

function LineaDePorFacturar({ datos }: { datos: MetaYPorFacturar }) {
  const l = datos.linea!;
  const mesActual = datos.hoyISO.slice(0, 7);
  const meses = l.meses.filter((m) => m.periodo >= mesActual);
  if (!meses.length) return null;
  return (
    <div className="space-y-2">
      <p className={ROTULO_DEL_SISTEMA}>La línea de «por facturar», mes a mes</p>
      <p className="text-xs text-fg-muted">
        La línea que sube al final son las cuotas programadas sin factura. Así se reparte, y cuánto falta para{" "}
        {l.objetivo.fuente === "meta" ? `la meta del año (${usd(l.objetivo.mensual)} al mes)` : `el piso (${usd(l.objetivo.mensual)} al mes; el año no tiene meta)`}.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px] leading-[19px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
              <th className="px-3 py-2">Mes</th>
              <th className="px-3 py-2 text-right">Por facturar</th>
              <th className="px-3 py-2 text-right">Recurrencia</th>
              <th className="px-3 py-2 text-right">Proyectos</th>
              <th className="px-3 py-2 text-right">Expansiones en el pipeline</th>
              <th className="px-3 py-2 text-right">Negocios nuevos</th>
              <th className="px-3 py-2 text-right">Falta</th>
            </tr>
          </thead>
          <tbody>
            {meses.map((m) => (
              <tr key={m.periodo} className="border-b border-line last:border-b-0">
                <td className="px-3 py-2 font-semibold text-fg">{mesCorto(m.periodo)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{usd(m.porFacturar)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{usd(m.recurrencia)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{m.sinDesglose > 0 ? <span title="Sin cuotas que la expliquen">{usd(m.sinDesglose)} sin desglose</span> : usd(m.proyectos)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-fg-muted">{m.expansiones > 0 ? usd(m.expansiones) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums text-fg-muted">{m.nuevos > 0 ? usd(m.nuevos) : "—"}</td>
                <td className={cn("px-3 py-2 text-right tabular-nums", m.falta > 0 && "text-danger-ink")}>{m.falta > 0 ? usd(m.falta) : "Cubierto"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-fg-muted">
        El pipeline todavía no es «por facturar»: se muestra al lado, en el mes en que cierra cada negocio, para ver qué haría subir la línea. Falta = el
        objetivo del mes menos lo facturado y lo programado.
      </p>
    </div>
  );
}
