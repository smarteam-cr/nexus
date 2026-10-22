"use client";

/**
 * Las piezas de la simulación de comisiones que comparten la vista de Ventas (./SimulacionDeComisiones.tsx) y la de
 * Customer Success (./SimulacionDeCustomerSuccess.tsx): cifras, cajas, tablas y las filas de cada venta.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Input, Segmentado } from "@/components/ui";
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import {
  DIAS_PARA_CAERSE,
  MESES_DE_VENTAS,
  UMBRAL_DE_APROBACION,
  type AjusteDeVenta,
  type AprobacionDeLaVenta,
  type AQuienLeCuenta,
  type RenovacionSimulada,
  type ServicioSimulado,
} from "@/lib/finanzas/modelo-comisiones/reglas";
import { CLASE_DE_PILDORA, PILDORA, fechaCorta, miles, pct, usd, usd2 } from "./formato";

export function Cifra({ rotulo, valor, nota, destacada = false }: { rotulo: string; valor: string; nota: string; destacada?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-1 rounded-xl border px-4 py-3.5", destacada ? "border-info-line bg-info-surface" : "border-line bg-surface")}>
      <span className={cn(ROTULO_DEL_SISTEMA, destacada && "text-info-ink")}>{rotulo}</span>
      <span className="text-[22px] font-bold leading-7 tabular-nums text-fg">{valor}</span>
      <span className={cn("text-xs leading-4", destacada ? "text-fg-secondary" : "text-fg-muted")}>{nota}</span>
    </div>
  );
}

export function Caja({ titulo, detalle, derecha, children }: { titulo: string; detalle?: string; derecha?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-x-auto rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-3 px-4 pb-3 pt-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[15px] font-semibold text-fg">{titulo}</h2>
          {detalle && <span className="text-xs leading-4 text-fg-muted">{detalle}</span>}
        </div>
        {derecha}
      </div>
      {children}
    </section>
  );
}

export function Th({ children, derecha = false }: { children?: ReactNode; derecha?: boolean }) {
  return <th className={cn("whitespace-nowrap border-b border-line bg-surface-muted px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted", derecha ? "text-right" : "text-left")}>{children}</th>;
}

export function Td({ children, derecha = false, pie = false, className }: { children?: ReactNode; derecha?: boolean; pie?: boolean; className?: string }) {
  return <td className={cn("px-3 align-middle", pie ? "border-t border-line py-3" : "border-b border-line py-2.5", derecha && "whitespace-nowrap text-right tabular-nums", className)}>{children}</td>;
}

/** Una fila vacía de tabla, con su mensaje en la segunda columna. */
export function FilaVacia({ columnas, texto }: { columnas: number; texto: string }) {
  return (
    <tr>
      <Td className="text-fg-muted">—</Td>
      <Td className="text-fg-muted">{texto}</Td>
      {Array.from({ length: columnas - 2 }, (_, i) => (
        <Td key={i} />
      ))}
    </tr>
  );
}

/** La barra de cumplimiento: llena hasta el doble de la meta, con una marca en la meta (o en `marca`). */
export function BarraDeCumplimiento({ cumplimiento, escala = 2, marca = 1 }: { cumplimiento: number | null; escala?: number; marca?: number }) {
  if (cumplimiento == null) return <span className="text-xs text-fg-muted">Sin meta</span>;
  const tono = cumplimiento >= 1 ? "bg-brand" : cumplimiento >= 0.5 ? "bg-brand-light" : "bg-fg-muted";
  return (
    <div className="flex items-center gap-2">
      <span className="relative block h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
        <span className={cn("absolute inset-y-0 left-0", tono)} style={{ width: `${Math.min(100, (cumplimiento / escala) * 100)}%` }} />
        <span aria-hidden className="absolute inset-y-0 w-px bg-line" style={{ left: `${(marca / escala) * 100}%` }} />
      </span>
      <span className="min-w-[40px] text-right text-xs tabular-nums text-fg-secondary">{pct(cumplimiento)}</span>
    </div>
  );
}

export function NombreDeVenta({ nombre, cliente, children }: { nombre: string; cliente: string | null; children?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="font-semibold text-fg">{nombre}</span>
      <span className="text-xs leading-4 text-fg-muted">{cliente ?? "Sin empresa en Nexus"}</span>
      {children}
    </div>
  );
}

export function BotonCorregir({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="self-start py-0.5 text-xs text-fg-muted underline-offset-2 transition-colors hover:text-fg hover:underline">
      {children}
    </button>
  );
}

const COMO: Record<AQuienLeCuenta["como"], { texto: string; tono: keyof typeof PILDORA }> = {
  sinEmpresa: { texto: "Ventas", tono: "bien" },
  clienteNuevo: { texto: "Cliente nuevo", tono: "bien" },
  primerosMeses: { texto: `Primeros ${MESES_DE_VENTAS} meses`, tono: "bien" },
  expansion: { texto: "Expansión", tono: "info" },
  renovacion: { texto: "Renovación", tono: "neutra" },
};

/** Una venta de servicios: a quién le cuenta, su porcentaje y su comisión. Se puede marcar licencia o caída. */
export function FilaDeServicio({
  s,
  anio,
  ajuste,
  onAjustar,
  area = "ventas",
}: {
  s: ServicioSimulado;
  anio: number;
  ajuste: AjusteDeVenta | undefined;
  onAjustar: (c: AjusteDeVenta) => void;
  area?: "ventas" | "customerSuccess";
}) {
  const v = s.venta;
  let pildora: { texto: string; tono: keyof typeof PILDORA };
  const notas: string[] = [];
  if (s.tipo === "otraMoneda") {
    pildora = { texto: "No se suma", tono: "neutra" };
    notas.push(`En ${v.moneda}: el cálculo es en dólares`);
  } else if (s.tipo === "sinMonto") {
    pildora = { texto: "Sin monto en HubSpot", tono: "atencion" };
    notas.push("Comisiona cuando tenga monto");
  } else {
    const a = s.aQuien!;
    pildora = COMO[a.como];
    if (a.como === "renovacion") notas.push("No cuenta para ninguna meta: la paga el bono del CSE de la cuenta");
    else if (a.como === "sinEmpresa") notas.push("Sin empresa en Nexus: cliente nuevo");
    else if (a.como === "primerosMeses") notas.push(`Primera venta: ${fechaCorta(v.primeraVenta!, anio)}`);
    else if (a.como === "expansion" && v.primeraVenta) notas.push(`Cliente desde ${v.primeraVenta.slice(0, 4)}`);
    if (a.deducido && a.como !== "sinEmpresa") notas.push("Deducido: nadie lo marcó en HubSpot");
  }
  if (v.compartidaCon) notas.push(`Compartida con ${v.compartidaCon.nombre || "otra persona"}: la mitad para cada uno`);
  if (v.compartidaTarde) notas.push("La marca de compartida se puso después de la firma: no vale");
  if (s.seCayo) notas.push(v.caida ? `Se cayó el ${fechaCorta(v.caida.fecha, anio)}: no cuenta ni comisiona` : "Marcada como caída: no cuenta ni comisiona");
  else if (v.caida) notas.push(`Se cayó el ${fechaCorta(v.caida.fecha, anio)}, pasados los ${DIAS_PARA_CAERSE} días: no se descuenta`);
  const caidaEscrita = ajuste?.seCayo != null;
  return (
    <tr className={cn(s.seCayo && "text-fg-muted")}>
      <Td className="whitespace-nowrap tabular-nums text-fg-muted">{fechaCorta(v.fecha)}</Td>
      <Td className="max-w-[320px]">
        <NombreDeVenta nombre={v.nombre} cliente={v.cliente}>
          <div className="flex flex-wrap gap-x-3">
            {s.tipo !== "otraMoneda" && <BotonCorregir onClick={() => onAjustar({ tipo: "licencia" })}>Es una licencia</BotonCorregir>}
            {s.tipo === "servicio" && (
              <BotonCorregir onClick={() => onAjustar({ seCayo: !s.seCayo })}>
                {s.seCayo ? (caidaEscrita ? "No se cayó" : "Contarla igual") : `Se canceló en ${DIAS_PARA_CAERSE} días`}
              </BotonCorregir>
            )}
          </div>
        </NombreDeVenta>
      </Td>
      <Td derecha>{v.monto ? (v.moneda === "USD" ? usd(v.monto) : `${v.moneda} ${miles(v.monto)}`) : "—"}</Td>
      <Td>
        <div className="flex flex-col items-start gap-1">
          <div className="flex flex-wrap gap-1">
            <span className={cn(CLASE_DE_PILDORA, PILDORA[pildora.tono])}>{pildora.texto}</span>
            {s.seCayo && <span className={cn(CLASE_DE_PILDORA, PILDORA.atencion)}>Se cayó</span>}
            {v.compartidaCon && <span className={cn(CLASE_DE_PILDORA, PILDORA.info)}>Compartida</span>}
          </div>
          {notas.map((n) => (
            <span key={n} className="text-xs leading-4 text-fg-muted">
              {n}
            </span>
          ))}
        </div>
      </Td>
      <Td derecha className="text-fg-secondary">
        {s.porcentaje == null ? "—" : `${s.porcentaje} %${s.aQuien && s.aQuien.parte < 1 ? " × ½" : ""}`}
        {area === "customerSuccess" && s.porcentaje != null && <span className="block text-xs text-fg-muted">fijo</span>}
      </Td>
      <Td derecha className={cn("font-semibold", s.comision == null ? "text-fg-muted" : "text-fg")}>{s.comision == null ? "—" : usd2(s.comision)}</Td>
    </tr>
  );
}

/** Cómo está el descuento de una venta: no hace falta aprobarlo, está aprobado, falta, o se escribió a mano. */
export function PildoraDeAprobacion({ a }: { a: AprobacionDeLaVenta }) {
  if (a.estado === "no-hace-falta") return null;
  if (a.estado === "aprobado") {
    return (
      <span className={cn(CLASE_DE_PILDORA, PILDORA.bien)} title={`Lo aprobó ${a.porNombre} el ${fechaCorta(a.en)}`}>
        Aprobado · {a.porNombre.split(" ")[0]}
      </span>
    );
  }
  if (a.estado === "falta") return <span className={cn(CLASE_DE_PILDORA, PILDORA.atencion)}>Sin aprobar</span>;
  return (
    <span className={cn(CLASE_DE_PILDORA, PILDORA.neutra)} title={`Pasa el ${UMBRAL_DE_APROBACION} %: en la propuesta lo aprueba Marco`}>
      No se sabe si se aprobó
    </span>
  );
}

const INPUT_CHICO = "h-[30px] w-24 px-2 py-0 text-right text-[13px] tabular-nums";

/** Una venta de servicios con su valor de 12 meses, su descuento y la comisión antes y ahora. */
export function FilaDeValor({ s, antes, ajuste, onAjustar }: { s: ServicioSimulado; antes: number; ajuste: AjusteDeVenta | undefined; onAjustar: (c: AjusteDeVenta) => void }) {
  const p = s.partes!;
  const v = s.valor!;
  const venta = s.venta;
  const origen =
    p.origen === "propuesta" && venta.propuesta
      ? `De la propuesta «${venta.propuesta.nombre}»${venta.propuesta.incompleto ? " · una línea no se pudo leer" : ""}`
      : p.origen === "escrito"
        ? "Lo cambiaste tú"
        : "Monto de HubSpot";
  const primera = venta.propuesta?.primera;
  const origenDescuento =
    p.origenDelDescuento === "escrito"
      ? "Lo escribiste tú"
      : p.origenDelDescuento === "propuesta" && primera
        ? `Contra la primera propuesta (v${primera.version})`
        : primera?.esLaMisma
          ? "Es la primera propuesta"
          : "Sin descuento";
  const pctDescuento = v.porcentajeDeDescuento > 0 ? ` · ${String(Math.round(v.porcentajeDeDescuento * 10) / 10).replace(".", ",")} %` : "";
  return (
    <tr>
      <Td className="max-w-[260px]">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-semibold text-fg">{venta.nombre}</span>
          <span className="text-xs leading-4 text-fg-muted">
            {fechaCorta(venta.fecha)} · {origen}
          </span>
        </div>
      </Td>
      <Td>
        <Segmentado
          etiqueta={`Tipo de ${venta.nombre}`}
          valor={p.recurrente ? "recurrente" : "unica"}
          onCambio={(k) => onAjustar({ recurrente: k === "recurrente", mensual: undefined })}
          opciones={[
            { clave: "unica", etiqueta: "Una vez" },
            { clave: "recurrente", etiqueta: "Al mes" },
          ]}
        />
      </Td>
      <Td derecha>
        {p.recurrente ? (
          <div className="flex flex-col items-end gap-0.5">
            <Input
              type="number"
              min={0}
              step={50}
              inputMode="numeric"
              aria-label={`Lo que se cobra al mes de ${venta.nombre}`}
              value={(ajuste?.mensual ?? p.mensual) || ""}
              placeholder="0"
              onChange={(e) => onAjustar({ recurrente: true, mensual: Math.max(0, Number(e.target.value) || 0) })}
              className={INPUT_CHICO}
            />
            {p.mensualSupuesto && <span className="text-xs leading-4 text-fg-muted">Supone que el monto es el año</span>}
            {p.unico > 0 && <span className="text-xs leading-4 text-fg-muted">+ {usd(p.unico)} de una vez</span>}
          </div>
        ) : (
          <span className="text-fg-muted">—</span>
        )}
      </Td>
      <Td derecha>{usd(v.valor)}</Td>
      <Td derecha>
        <div className="flex flex-col items-end gap-0.5">
          <Input
            type="number"
            min={0}
            step={100}
            inputMode="numeric"
            aria-label={`Lo descontado en 12 meses de ${venta.nombre}`}
            value={p.descontado || ""}
            placeholder="0"
            onChange={(e) => onAjustar({ descuento: Math.max(0, Number(e.target.value) || 0) })}
            className={INPUT_CHICO}
          />
          <span className="text-xs leading-4 text-fg-muted">
            {origenDescuento}
            {pctDescuento}
          </span>
          {s.aprobacion && <PildoraDeAprobacion a={s.aprobacion} />}
        </div>
      </Td>
      <Td derecha>{usd(v.paraLaMeta)}</Td>
      <Td derecha>
        <div className="flex flex-col items-end gap-0.5">
          <span className="font-semibold text-fg">
            <span className="font-normal text-fg-muted">{usd2(antes)}</span> → {usd2(s.comision ?? 0)}
          </span>
          <span className="text-xs leading-4 text-fg-muted">
            {s.porcentaje == null ? "No comisiona" : `${s.porcentaje} % de ${usd(v.base)}${s.aQuien && s.aQuien.parte < 1 ? " × ½" : ""}`}
          </span>
        </div>
      </Td>
    </tr>
  );
}

/** Las renovaciones con el bono del CSE de la cuenta: «a tiempo» se supone y se puede cambiar. */
export function TablaDeRenovaciones({
  renovaciones,
  anio,
  onATiempo,
  detalle,
}: {
  renovaciones: readonly RenovacionSimulada[];
  anio: number;
  onATiempo: (id: string, aTiempo: boolean) => void;
  detalle: string;
}) {
  const total = renovaciones.reduce((a, r) => a + r.bono, 0);
  return (
    <Caja titulo="Renovaciones" detalle={detalle}>
      <table className="w-full min-w-[900px] border-collapse text-[13px] leading-[19px]">
        <thead>
          <tr>
            <Th>Fecha</Th>
            <Th>Renovación</Th>
            <Th>CSE de la cuenta</Th>
            <Th derecha>Un año</Th>
            <Th>¿A tiempo?</Th>
            <Th derecha>Bono</Th>
          </tr>
        </thead>
        <tbody>
          {renovaciones.length === 0 && <FilaVacia columnas={6} texto="Sin renovaciones en el año." />}
          {renovaciones.map((r) => (
            <tr key={r.id}>
              <Td className="whitespace-nowrap tabular-nums text-fg-muted">{fechaCorta(r.fecha, anio)}</Td>
              <Td className="max-w-[320px]">
                <NombreDeVenta nombre={r.nombre} cliente={r.cliente}>
                  <span className="text-xs leading-4 text-fg-muted">{r.origen === "mensual" ? "Servicio mensual sin fin: renueva cada 12 meses" : "Marcada renovación en HubSpot"}</span>
                </NombreDeVenta>
              </Td>
              <Td>{r.encargado?.nombre ?? <span className="text-fg-muted">Sin CSE</span>}</Td>
              <Td derecha>{usd(r.valorDelAnio)}</Td>
              <Td>
                <div className="flex flex-col items-start gap-0.5">
                  <Segmentado
                    etiqueta={`¿${r.nombre} se renovó a tiempo?`}
                    valor={r.aTiempo ? "si" : "no"}
                    onCambio={(k) => onATiempo(r.id, k === "si")}
                    opciones={[
                      { clave: "si", etiqueta: "Sí" },
                      { clave: "no", etiqueta: "No" },
                    ]}
                  />
                  {!r.aTiempoEscrito && <span className="text-xs leading-4 text-fg-muted">Se supone</span>}
                </div>
              </Td>
              <Td derecha className={cn("font-semibold", r.bono ? "text-fg" : "text-fg-muted")}>
                {r.bono ? usd2(r.bono) : r.descontado > 0 ? "Con descuento" : r.aTiempo ? "—" : "Fuera de tiempo"}
              </Td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-surface-muted font-semibold">
            <Td pie>Total</Td>
            <Td pie />
            <Td pie />
            <Td pie />
            <Td pie />
            <Td pie derecha>{usd2(total)}</Td>
          </tr>
        </tfoot>
      </table>
    </Caja>
  );
}
