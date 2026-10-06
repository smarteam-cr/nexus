"use client";

/**
 * components/rentabilidad/Rentabilidad.tsx — Finanzas › Rentabilidad (solo dirección): el margen de cada cuenta con
 * sus horas reales, y cuándo hace falta contratar según el pipeline.
 *
 * Todo en dólares, con el tipo de cambio de cada mes. Nunca muestra el costo de una persona: la planilla se usa
 * entera, para el costo de la hora. La propuesta de contratar la PROPONE Nexus y la confirma dirección.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { Alert, PageHeader, Segmentado, Tabs } from "@/components/ui";
import { ChipDeCabecera } from "@/components/cs/piezas";
import { Cifra, ENLACE_BLANCO, coma } from "@/components/carga/piezas";
import { cn } from "@/lib/cn";
import { ETIQUETA_DE_TRATO, type ConfigCarga } from "@/lib/carga/config";
import { ETIQUETA_DE_ESCENARIO, PROBABILIDAD_MINIMA, proyectarDemanda, type Escenario, type TratoParaProyectar } from "@/lib/carga/contratacion";
import { RUTA_DE_LA_CARGA, RUTA_DE_LOS_SUPUESTOS } from "@/lib/carga/rutas";
import { ETIQUETA_DEL_PERIODO, tablaDeMargen, type FilaDeMargen, type Periodo } from "@/lib/rentabilidad/margen";
import type { DatosDeRentabilidad } from "@/lib/rentabilidad/queries";

export interface DatosDeContratacion {
  /** Horas comprometidas por semana del equipo que lleva cuentas, más las de cuentas sin CSE vigente. */
  base: number;
  sinCse: number;
  capacidad: number;
  horasPorCse: number;
  personas: number;
  /** CSE que no cuentan como capacidad: no aparecen en el calendario hace semanas. */
  fueraDeLaCapacidad: string[];
  tratos: TratoParaProyectar[];
  error: string | null;
}

export type Pestana = "margen" | "contratacion";
/** Las cuentas sin cobros que se muestran en filas; el resto va en una línea. */
const SIN_COBRO_A_LA_VISTA = 12;
type Modo = "cargado" | "directo";

const miles = (n: number) => String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const usd = (x: number) => `${x < 0 ? "−" : ""}US$ ${miles(x)}`;
const usd1 = (x: number) => `US$ ${coma(x, 1)}`;
const pct = (x: number) => `${x < 0 ? "−" : ""}${Math.abs(Math.round(x * 100))} %`;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** «7 oct», con el año solo si no es el de `anio` (armado a mano: `Intl` escribe distinto en Node y en el navegador). */
const fecha = (iso: string, anio: string) => {
  const d = new Date(Date.parse(iso) - 6 * 3_600_000);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}${String(d.getUTCFullYear()) !== anio ? ` ${d.getUTCFullYear()}` : ""}`;
};

export default function Rentabilidad({
  datos,
  contratacion,
  config,
  hoyISO,
  pestanaInicial = "margen",
  contenedor,
}: {
  /** «?vista=contratacion» abre directo la contratación. */
  pestanaInicial?: Pestana;
  datos: DatosDeRentabilidad;
  contratacion: DatosDeContratacion;
  config: ConfigCarga;
  hoyISO: string;
  contenedor: string;
}) {
  const [pestana, setPestana] = useState<Pestana>(pestanaInicial);
  const h = datos.costoDeLaHora;
  return (
    <div className={cn(contenedor, "space-y-6")}>
      <PageHeader
        title="Rentabilidad"
        badges={
          <>
            <ChipDeCabecera>{datos.rango.etiqueta}</ChipDeCabecera>
            <ChipDeCabecera>Solo dirección</ChipDeCabecera>
          </>
        }
        description="El margen de cada cuenta con sus horas reales, contra lo que su cronograma planeaba, y cuándo hace falta contratar. Todo en dólares, con el tipo de cambio de cada mes."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <nav aria-label="Período" className="inline-flex gap-0.5 rounded-[10px] bg-surface-muted p-[3px]">
              {(["mes", "trimestre", "anio"] as Periodo[]).map((p) => (
                <Link
                  key={p}
                  href={`/finanzas/rentabilidad?periodo=${p}`}
                  aria-current={datos.rango.periodo === p ? "page" : undefined}
                  className={cn(
                    "rounded-[7px] px-3 py-1 text-[13px] transition-colors",
                    datos.rango.periodo === p ? "bg-surface font-semibold text-fg shadow-segment" : "text-fg-muted hover:text-fg",
                  )}
                >
                  {ETIQUETA_DEL_PERIODO[p]}
                </Link>
              ))}
            </nav>
            <Link href={RUTA_DE_LOS_SUPUESTOS} className={ENLACE_BLANCO}>
              Supuestos
            </Link>
          </div>
        }
      />

      <Tabs<Pestana>
        aria-label="Secciones de Rentabilidad"
        value={pestana}
        onChange={setPestana}
        items={[
          { key: "margen", label: "Margen por cuenta" },
          { key: "contratacion", label: "Contratación" },
        ]}
      />

      {datos.avisos.length > 0 && (
        <Alert variant="info" title="Lo que no entra en el cálculo">
          <ul className="list-disc pl-[18px]">
            {datos.avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Alert>
      )}

      {pestana === "margen" ? (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Cifra rotulo="Costo de una hora pagada" valor={h.directo !== null ? usd1(h.directo) : "—"} nota={`Planilla del período ÷ ${miles(datos.totales.horasPagadas)} h pagadas`} />
            <Cifra rotulo="Costo de una hora con clientes" valor={h.cargado !== null ? usd1(h.cargado) : "—"} nota="Lo que cada hora con clientes tiene que cubrir de la planilla entera" />
            <Cifra rotulo="Ingreso por hora con clientes" valor={h.ingresoPorHora !== null ? usd1(h.ingresoPorHora) : "—"} nota={`${usd(datos.totales.ingreso)} ÷ ${miles(datos.totales.horasConClientes)} h. Sin la comisión de HubSpot`} />
            <Cifra
              rotulo="Planilla que va a clientes"
              valor={h.parteAClientes !== null ? `${Math.round(h.parteAClientes * 100)} %` : "—"}
              nota={`${miles(datos.totales.horasConClientes)} de ${miles(datos.totales.horasPagadas)} h pagadas: reuniones, preparación y entrega estimada`}
            />
          </div>
          <MargenPorCuenta datos={datos} />
        </>
      ) : (
        <Contratacion contratacion={contratacion} config={config} hoyISO={hoyISO} />
      )}
    </div>
  );
}

function MargenPorCuenta({ datos }: { datos: DatosDeRentabilidad }) {
  const [modo, setModo] = useState<Modo>("cargado");
  const tarifa = (modo === "cargado" ? datos.costoDeLaHora.cargado : datos.costoDeLaHora.directo) ?? 0;
  const { conIngreso, sinIngreso } = useMemo(() => tablaDeMargen(datos.cuentas, tarifa, datos.totales.horasPorSesion), [datos, tarifa]);
  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface py-4">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4">
        <h2 className="text-sm font-semibold text-fg">Margen real contra margen estimado</h2>
        <span className="flex items-center gap-2">
          <span className="text-xs text-fg-muted">Costo de la hora</span>
          <Segmentado<Modo>
            etiqueta="Costo de la hora"
            valor={modo}
            onCambio={setModo}
            opciones={[
              { clave: "cargado", etiqueta: `Cargado · ${usd1(datos.costoDeLaHora.cargado ?? 0)}` },
              { clave: "directo", etiqueta: `Directo · ${usd1(datos.costoDeLaHora.directo ?? 0)}` },
            ]}
          />
        </span>
      </div>
      <p className="px-4 text-xs text-fg-muted">
        {modo === "cargado"
          ? "Cargado: cada hora con clientes paga su parte de la planilla entera (dirección, ventas, marketing, lo interno). Es el que dice si una cuenta deja plata."
          : "Directo: lo que cuesta una hora pagada de cualquiera. Sirve para comparar, pero deja afuera todo lo que no es una cuenta."}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px] leading-[19px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
              <th className="px-4 py-2">Cuenta</th>
              <th className="px-3 py-2 text-right">Cobrado</th>
              <th className="px-3 py-2 text-right">Horas reales</th>
              <th className="px-3 py-2 text-right">Por hora</th>
              <th className="px-3 py-2 text-right">Margen real</th>
              <th className="px-3 py-2 text-right">Horas planeadas</th>
              <th className="px-3 py-2 text-right">Margen estimado</th>
              <th className="px-4 py-2">Real contra plan</th>
            </tr>
          </thead>
          <tbody>
            {conIngreso.map((f) => (
              <Fila key={f.clienteId} f={f} tarifa={tarifa} />
            ))}
            {sinIngreso.length > 0 && (
              <tr className="border-b border-line bg-surface-muted">
                <td colSpan={8} className="px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                  Sin cobros en el período · {sinIngreso.length}
                </td>
              </tr>
            )}
            {sinIngreso.slice(0, SIN_COBRO_A_LA_VISTA).map((f) => (
              <Fila key={f.clienteId} f={f} tarifa={tarifa} />
            ))}
            {sinIngreso.length > SIN_COBRO_A_LA_VISTA && (
              <tr>
                <td colSpan={8} className="px-4 py-2.5 text-xs text-fg-muted">
                  Y {sinIngreso.length - SIN_COBRO_A_LA_VISTA} cuentas más sin cobros, con {miles(sinIngreso.slice(SIN_COBRO_A_LA_VISTA).reduce((a, f) => a + f.horas, 0))} h entre todas (
                  {usd(sinIngreso.slice(SIN_COBRO_A_LA_VISTA).reduce((a, f) => a + f.costo, 0))} de costo): {sinIngreso.slice(SIN_COBRO_A_LA_VISTA).map((f) => f.nombre).join(", ")}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="space-y-1 px-4 text-xs text-fg-muted">
        <p>
          <b className="text-fg-secondary">Horas reales</b> = reuniones del calendario (cada persona que estuvo × la duración) + {datos.preparacionMin} min de preparación
          por persona y reunión + entrega estimada del cronograma.
        </p>
        <p>
          <b className="text-fg-secondary">Horas planeadas</b> = lo que el cronograma ponía en el período: sus sesiones (a {coma(datos.totales.horasPorSesion, 1)} h-persona cada
          una, el promedio de una reunión con un cliente) + sus tareas. No son horas vendidas: hasta guardarlas al aprobar la propuesta, es lo más parecido que hay.
        </p>
        <p>«Sin entrega estimada»: la cuenta no tiene tareas en el período, así que el trabajo fuera de reunión no se ve y sus horas reales salen bajas.</p>
      </div>
    </section>
  );
}

function Fila({ f, tarifa }: { f: FilaDeMargen; tarifa: number }) {
  const bajo = f.margenPct !== null && f.margenPct < 0.15;
  return (
    <tr className="border-b border-line last:border-b-0">
      <td className="min-w-[220px] px-4 py-2.5">
        <span className="block font-semibold text-fg">{f.nombre}</span>
        <span className="block text-xs text-fg-muted">
          {f.cse ?? "Sin CSE"}
          {f.fuenteDelIngreso === "Odoo" && " · facturado en Odoo"}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{f.ingreso > 0 ? usd(f.ingreso) : "—"}</td>
      <td className="min-w-[230px] px-3 py-2.5 text-right tabular-nums">
        {f.horas < 0.5 ? (
          <span className="block text-xs text-fg-muted">Sin reuniones ni tareas en el período</span>
        ) : (
          <>
            <span className="block whitespace-nowrap">{miles(f.horas)} h</span>
            <span className="block text-xs text-fg-muted">
              {miles(f.desglose.reuniones)} reun. · {miles(f.desglose.preparacion)} prep. · {f.sinEntregaEstimada ? "sin entrega estimada" : `${miles(f.desglose.entrega)} entrega`}
            </span>
          </>
        )}
      </td>
      <td className={cn("whitespace-nowrap px-3 py-2.5 text-right tabular-nums", f.porHora !== null && f.porHora < tarifa * 1.25 && "font-semibold text-danger-ink")}>
        {f.porHora !== null ? usd1(f.porHora) : "—"}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
        {f.horas < 0.5 && f.ingreso > 0 ? (
          <span className="text-fg-muted">—</span>
        ) : (
          <>
            <span className={cn("block font-semibold", (bajo || f.margen < 0) && "text-danger-ink")}>{usd(f.margen)}</span>
            <span className="block text-xs text-fg-muted">{f.margenPct !== null ? pct(f.margenPct) : "de costo"}</span>
          </>
        )}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">{f.horasPlaneadas !== null ? `${miles(f.horasPlaneadas)} h` : "—"}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
        {f.margenPlaneado !== null ? (
          <>
            <span className="block">{usd(f.margenPlaneado)}</span>
            <span className="block text-xs text-fg-muted">{pct(f.margenPlaneado / f.ingreso)}</span>
          </>
        ) : (
          "—"
        )}
      </td>
      <td className="px-4 py-2.5">
        <ChipDePlan f={f} />
      </td>
    </tr>
  );
}

function ChipDePlan({ f }: { f: FilaDeMargen }) {
  const base = "inline-flex h-[22px] items-center whitespace-nowrap rounded-full border px-2.5 text-[11px] font-semibold";
  if (f.realContraPlan === "sin-plan") return <span className={cn(base, "border-dashed border-line bg-surface-muted text-fg-muted")}>Sin plan en el período</span>;
  if (f.realContraPlan === "mas") return <span className={cn(base, "border-danger-line bg-danger-surface text-danger-ink")}>{coma(f.razonContraPlan ?? 0, 1)}× lo planeado</span>;
  if (f.realContraPlan === "menos") return <span className={cn(base, "border-success-line bg-success-surface text-success-ink")}>Menos de lo planeado</span>;
  return <span className={cn(base, "border-success-line bg-success-surface text-success-ink")}>Cerca de lo planeado</span>;
}

function Contratacion({ contratacion: c, config, hoyISO }: { contratacion: DatosDeContratacion; config: ConfigCarga; hoyISO: string }) {
  const [escenario, setEscenario] = useState<Escenario>("ponderado");
  const p = useMemo(
    () => proyectarDemanda({ base: c.base, capacidad: c.capacidad, horasPorCse: c.horasPorCse, tratos: c.tratos, escenario, hoy: new Date(`${hoyISO}T18:00:00Z`) }, config),
    [c, escenario, config, hoyISO],
  );
  const tratos = [...p.tratos].filter((t) => !t.fueraDelMinimo).sort((a, b) => b.probabilidad - a.probabilidad || b.horasSemana - a.horasSemana);
  const umbral = config.semaforo.sobrecarga;
  const tope = Math.max(150, ...p.meses.map((m) => m.utilizacion));
  return (
    <div className="space-y-4">
      {c.error && (
        <Alert variant="warning" title="No se pudo leer el pipeline.">
          {c.error} La proyección muestra solo la carga de hoy.
        </Alert>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmentado<Escenario>
          etiqueta="Escenario"
          valor={escenario}
          onCambio={setEscenario}
          opciones={(["seguro", "ponderado", "todo"] as Escenario[]).map((e) => ({ clave: e, etiqueta: ETIQUETA_DE_ESCENARIO[e] }))}
        />
        <span className="text-xs text-fg-muted">
          Hoy: {miles(c.base)} h por semana ({c.sinCse > 0 ? `${miles(c.sinCse)} de cuentas sin CSE vigente · ` : ""}de la{" "}
          <Link href={RUTA_DE_LA_CARGA} className="font-semibold text-brand hover:text-brand-light">
            carga del equipo
          </Link>
          ) · {miles(c.capacidad)} h disponibles entre {c.personas} CSE
          {c.fueraDeLaCapacidad.length > 0 && ` (sin ${c.fueraDeLaCapacidad.join(" ni ")}: no aparece${c.fueraDeLaCapacidad.length > 1 ? "n" : ""} en el calendario)`}
        </span>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold text-fg">Utilización del equipo, mes a mes</h2>
          <div className="flex h-[200px] items-end gap-6 px-2">
            {p.meses.map((m) => (
              <div key={m.periodo} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <span className={cn("text-sm font-bold tabular-nums", m.semaforo === "sobrecarga" ? "text-danger-ink" : m.semaforo === "llena" ? "text-warn-ink" : "text-success-ink")}>{m.utilizacion} %</span>
                <div className="flex w-full max-w-[90px] flex-col-reverse overflow-hidden rounded-t-md" style={{ height: `${(m.utilizacion / tope) * 100}%` }}>
                  <span className="w-full bg-fg-muted" style={{ height: `${(m.base / Math.max(m.total, 0.01)) * 100}%` }} />
                  <span className="w-full border border-dashed border-fg-muted bg-surface-muted" style={{ height: `${(m.pipeline / Math.max(m.total, 0.01)) * 100}%` }} />
                </div>
                <span className="text-xs text-fg-muted">{m.etiqueta}</span>
                <span className="text-xs tabular-nums text-fg-muted">
                  {miles(m.total)} de {miles(c.capacidad)} h
                </span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-fg-secondary">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm bg-fg-muted" />
              Carga de hoy
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm border border-dashed border-fg-muted bg-surface-muted" />
              Lo que suma el pipeline
            </span>
            <span>Umbral de sobrecarga: {umbral} %</span>
          </div>
        </section>

        <section
          className={cn(
            "space-y-2 rounded-xl border p-4",
            p.primerMesSobre ? "border-warn-line bg-warn-surface" : "border-success-line bg-success-surface",
          )}
        >
          <span className={cn("text-[11px] font-semibold uppercase tracking-[0.08em]", p.primerMesSobre ? "text-warn-ink" : "text-success-ink")}>
            Propuesta de Nexus · la confirma dirección
          </span>
          {p.primerMesSobre ? (
            <>
              <h2 className="text-base font-semibold text-fg">
                Abrir la búsqueda de {p.cseQueFaltan === 1 ? "un CSE" : `${p.cseQueFaltan} CSE`}
                {p.abrirBusquedaAntesDe && p.abrirBusquedaAntesDe > hoyISO ? ` antes del ${fecha(p.abrirBusquedaAntesDe, hoyISO.slice(0, 4))}` : " ya"}
              </h2>
              <p className="text-[13px] leading-[19px] text-fg-secondary">
                Con «{ETIQUETA_DE_ESCENARIO[escenario].toLowerCase()}», el equipo pasa el {umbral} % en {p.meses.find((m) => m.periodo === p.primerMesSobre)?.etiqueta.toLowerCase()}. Contratar y
                formar a un CSE toma {config.semanasParaContratar} semanas
                {p.abrirBusquedaAntesDe && p.abrirBusquedaAntesDe <= hoyISO
                  ? `: para llegar a tiempo había que empezar el ${fecha(p.abrirBusquedaAntesDe, hoyISO.slice(0, 4))}.`
                  : ": por eso la fecha."}
              </p>
              <p className="text-[13px] leading-[19px] text-fg-secondary">
                Antes de decidir: ¿hay espacio para repartir? Mira las horas libres en la{" "}
                <Link href={RUTA_DE_LA_CARGA} className="font-semibold text-brand hover:text-brand-light">
                  carga del equipo
                </Link>
                .
              </p>
            </>
          ) : (
            <>
              <h2 className="text-base font-semibold text-fg">Con este escenario no hace falta contratar todavía</h2>
              <p className="text-[13px] leading-[19px] text-fg-secondary">El equipo se mantiene bajo el {umbral} % en los próximos {p.meses.length} meses.</p>
            </>
          )}
          {p.tratosConCierreVencido > 0 && (
            <p className="text-xs text-fg-muted">
              {p.tratosConCierreVencido} de los tratos que cuentan tienen la fecha de cierre vencida o sin fecha: se cuentan como si cerraran este mes. Pídele a Ventas
              que los ponga al día.
            </p>
          )}
          <p className="text-xs text-fg-muted">Nexus no contrata ni reasigna: solo avisa con tiempo.</p>
        </section>
      </div>

      <section className="space-y-2 rounded-xl border border-line bg-surface py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3 px-4">
          <h2 className="text-sm font-semibold text-fg">
            Los tratos que cuentan · al {Math.round(PROBABILIDAD_MINIMA * 100)} % o más · {tratos.length}
          </h2>
          <span className="text-xs text-fg-muted">El tipo se deduce del nombre del trato; las horas por tipo se ajustan en los supuestos</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px] leading-[19px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                <th className="px-4 py-2">Trato</th>
                <th className="px-3 py-2 text-right">Probabilidad</th>
                <th className="px-3 py-2">Cierre</th>
                <th className="px-3 py-2">Qué trae</th>
                <th className="px-3 py-2 text-right">Horas por semana</th>
                <th className="px-4 py-2 text-right">Cuenta en el escenario</th>
              </tr>
            </thead>
            <tbody>
              {tratos.map((t) => (
                <tr key={t.id} className="border-b border-line last:border-b-0">
                  <td className="min-w-[240px] px-4 py-2.5">
                    <span className="block font-semibold text-fg">{t.nombre}</span>
                    <span className="block text-xs text-fg-muted">
                      {t.pipeline}
                      {t.esClienteActual ? " · ya es cliente" : ""}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{Math.round(t.probabilidad * 100)} %</td>
                  <td className="px-3 py-2.5">
                    {t.cierre ? fecha(String(t.cierre), hoyISO.slice(0, 4)) : "Sin fecha"}
                    {t.cierreVencido && t.cierre && <span className="ml-1.5 text-xs font-semibold text-warn-ink">vencida</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {ETIQUETA_DE_TRATO[t.tipo]}
                    {!t.tipoPorNombre && <span className="block text-xs text-fg-muted">{t.esClienteActual ? "Ya es cliente" : "Empresa nueva"}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{coma(t.horasSemana, 1)} h</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{t.cuenta > 0 ? `${coma(t.cuenta, 1)} h desde ${MESES[Number(t.llega.slice(5, 7)) - 1]}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {p.tratosFueraDelMinimo > 0 && (
          <p className="px-4 text-xs text-fg-muted">
            Otros {p.tratosFueraDelMinimo} tratos abiertos están por debajo del {Math.round(PROBABILIDAD_MINIMA * 100)} % y no entran: son demasiado inciertos para
            contratar por ellos.
          </p>
        )}
      </section>
    </div>
  );
}
