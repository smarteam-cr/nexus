"use client";

/**
 * components/rentabilidad/Rentabilidad.tsx — Éxito del cliente › Rentabilidad, SOLO DIRECCIÓN (2026-10-07): el margen de
 * cada cuenta con sus horas reales, el costo de la hora por persona y por equipo, y cuándo hace falta contratar.
 *
 * Todo en dólares, con el tipo de cambio del día de cada monto. El costo de la hora de cada persona sí se muestra (decisión
 * de Elías: «por persona, y que se pueda ver por equipo»); el salario mensual de nadie. La propuesta de contratar la
 * PROPONE Nexus y la confirma o descarta dirección, con su motivo. «Tu carga» es la cuarta pestaña: lleva a su ruta.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Alert, PageHeader, Segmentado, Tabs, Textarea } from "@/components/ui";
import { BotonAzul, BotonBlanco } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { ChipDeCabecera } from "@/components/cs/piezas";
import { Cifra, ENLACE_BLANCO, coma } from "@/components/carga/piezas";
import { cn } from "@/lib/cn";
import { ETIQUETA_DE_TRATO, type ConfigCarga } from "@/lib/carga/config";
import { ETIQUETA_DE_ESCENARIO, PROBABILIDAD_MINIMA, proyectarDemanda, type Escenario, type TratoParaProyectar } from "@/lib/carga/contratacion";
import { RUTA_DE_LA_CARGA, RUTA_DE_LA_RENTABILIDAD, RUTA_DE_LOS_SUPUESTOS, RUTA_DE_TU_CARGA, rutaDelMargenDeLaCuenta } from "@/lib/carga/rutas";
import { ETIQUETA_DEL_MODO, ETIQUETA_DEL_PERIODO, margenPorPersona, tablaDeMargen, type FilaDeMargen, type ModoDeCosto, type Periodo } from "@/lib/rentabilidad/margen";
import type { DatosDeRentabilidad } from "@/lib/rentabilidad/queries";
import type { DecisionDeContratacion } from "@/lib/rentabilidad/decisiones";
import OrigenDeLosMeses from "./OrigenDeLosMeses";
import LecturaDeLosNumeros from "./LecturaDeLosNumeros";
import MetaDelAnio from "@/components/finanzas/MetaDelAnio";
import type { MetaYPorFacturar } from "@/lib/finanzas/meta";
import type { LecturaDeLosNumeros as DatosDeLaLectura } from "@/lib/rentabilidad/lectura/servidor";

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
  /** La utilización medida del equipo en las semanas cerradas (la de la carga), y cuántas semanas. */
  utilizacionMedida: number;
  semanasMedidas: number;
  /** Lo que dirección ya decidió, de lo más nuevo a lo más viejo. */
  decisiones: DecisionDeContratacion[];
}

export type Pestana = "margen" | "costo" | "contratacion" | "lectura";
/** Las cuentas sin cobros que se muestran en filas; el resto va en una línea. */
const SIN_COBRO_A_LA_VISTA = 12;

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
  meta,
  lectura,
  pestanaInicial = "margen",
  contenedor,
}: {
  /** La meta del año contra lo facturado (iniciativa C de docs/roadmap.md). */
  meta: MetaYPorFacturar;
  /** Lo que propone la lectura de los números. */
  lectura: DatosDeLaLectura;
  /** «?vista=contratacion» abre directo la contratación. */
  pestanaInicial?: Pestana;
  datos: DatosDeRentabilidad;
  contratacion: DatosDeContratacion;
  config: ConfigCarga;
  hoyISO: string;
  contenedor: string;
}) {
  const router = useRouter();
  const [pestana, setPestana] = useState<Pestana>(pestanaInicial);
  const h = datos.costoDeLaHora;
  const cambiarPestana = (p: Pestana | "tu-carga") => {
    if (p === "tu-carga") router.push(RUTA_DE_TU_CARGA);
    else setPestana(p);
  };
  return (
    <div className={cn(contenedor, "space-y-6")}>
      <PageHeader
        title="Rentabilidad"
        crumbs={[{ label: "Éxito del cliente", href: "/customer-success" }, { label: "Rentabilidad" }]}
        badges={
          <>
            <ChipDeCabecera>{datos.rango.etiqueta}</ChipDeCabecera>
            <ChipDeCabecera>Solo Super Admin</ChipDeCabecera>
          </>
        }
        description="El margen de cada cuenta con sus horas reales, contra lo que su cronograma planeaba, el costo de la hora de cada persona y cuándo hace falta contratar. Todo en dólares, con el tipo de cambio del día de cada monto."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <nav aria-label="Período" className="inline-flex gap-0.5 rounded-[10px] bg-surface-muted p-[3px]">
              {(["mes", "trimestre", "anio"] as Periodo[]).map((p) => (
                <Link
                  key={p}
                  href={`${RUTA_DE_LA_RENTABILIDAD}?periodo=${p}`}
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

      <MetaDelAnio datos={meta} />

      <Tabs<Pestana | "tu-carga">
        aria-label="Secciones de Rentabilidad"
        value={pestana}
        onChange={cambiarPestana}
        items={[
          { key: "margen", label: "Margen por cuenta" },
          { key: "costo", label: "Costo de la hora" },
          { key: "contratacion", label: "Contratación" },
          {
            key: "lectura",
            label: lectura.propuestas.some((p) => p.estado === "pendiente")
              ? `Lectura de los números · ${lectura.propuestas.filter((p) => p.estado === "pendiente").length}`
              : "Lectura de los números",
          },
          { key: "tu-carga", label: "Tu carga" },
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

      {pestana !== "contratacion" && pestana !== "lectura" && datos.origenDeLosMeses && <OrigenDeLosMeses origenes={datos.origenDeLosMeses} />}

      {pestana === "margen" ? (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Cifra rotulo="Costo de una hora pagada" valor={h.directo !== null ? usd1(h.directo) : "—"} nota={`Planilla del período ÷ ${miles(datos.totales.horasPagadas)} h pagadas`} />
            <Cifra rotulo="Costo de una hora con clientes" valor={h.cargado !== null ? usd1(h.cargado) : "—"} nota="Lo que cada hora con clientes tiene que cubrir de la planilla entera" />
            <Cifra rotulo="Ingreso por hora con clientes" valor={h.ingresoPorHora !== null ? usd1(h.ingresoPorHora) : "—"} nota={`${usd(datos.totales.ingreso)} ÷ ${miles(datos.totales.horasConClientes)} h. Sin la comisión de HubSpot`} />
            <Cifra
              rotulo="Horas con clientes"
              valor={h.parteAClientes !== null ? `${Math.round(h.parteAClientes * 100)} %` : "—"}
              nota={`${miles(datos.totales.horasConClientes)} de ${miles(datos.totales.horasPagadas)} h pagadas: reuniones, preparación y entrega`}
            />
          </div>
          <MargenPorCuenta datos={datos} />
        </>
      ) : pestana === "costo" ? (
        <CostoDeLaHora datos={datos} />
      ) : pestana === "lectura" ? (
        <LecturaDeLosNumeros datos={lectura} />
      ) : (
        <Contratacion contratacion={contratacion} config={config} hoyISO={hoyISO} />
      )}
    </div>
  );
}

function OrigenDeLasHoras({ datos }: { datos: DatosDeRentabilidad }) {
  const o = datos.horasPorOrigen;
  const tareas = o.tareas ?? 0;
  const total = o.calendario + tareas + o.declaradas + o.estimadas;
  if (total <= 0) return null;
  const sinMeet = o.calendarioSinMeet ?? 0;
  const partes = [
    {
      clave: "calendario",
      texto: sinMeet >= 0.5 ? `Del calendario (${miles(sinMeet)} h fuera de Meet)` : "Del calendario",
      h: o.calendario,
      clase: "bg-fg border-fg",
    },
    { clave: "tareas", texto: "Tareas con su bloque en la agenda", h: tareas, clase: "bg-fg-secondary border-fg-secondary" },
    { clave: "declaradas", texto: "Respondidas por el equipo", h: o.declaradas, clase: "bg-fg-muted border-fg-muted" },
    {
      clave: "estimadas",
      texto: (o.tareasEstimadas ?? 0) >= 0.5 ? "Estimadas (preparación, entrega y tareas sin bloque)" : "Estimadas (preparación y entrega sin respuesta)",
      h: o.estimadas,
      clase: "bg-surface-muted border-dashed border-fg-muted",
    },
  ];
  const f = datos.fuentesDeHoras;
  return (
    <div className="space-y-1.5 px-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">De dónde salen las horas</p>
      <span className="flex h-2.5 gap-px overflow-hidden rounded-full bg-surface-muted">
        {partes.map((p) => (p.h > 0 ? <span key={p.clave} className={cn("h-full border", p.clase)} style={{ width: `${(p.h / total) * 100}%` }} title={`${p.texto}: ${miles(p.h)} h`} /> : null))}
      </span>
      <span className="flex flex-wrap gap-4 text-xs text-fg-secondary">
        {partes.map((p) => (
          <span key={p.clave} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cn("inline-block h-2.5 w-2.5 rounded-sm border", p.clase)} />
            {p.texto} · {Math.round((p.h / total) * 100)} %
          </span>
        ))}
      </span>
      {f && <p className="text-xs text-fg-muted">{lecturaDeLasFuentes(f)}</p>}
    </div>
  );
}

/** Qué se leyó del calendario y de las tareas, en una línea. */
function lecturaDeLasFuentes(f: NonNullable<DatosDeRentabilidad["fuentesDeHoras"]>): string {
  const c = f.calendario;
  const cal =
    c.estado === "leido"
      ? `Calendario de ${c.personasLeidas} personas: ${c.contados} reuniones con clientes fuera de Meet. No entraron ${c.conMeet} con Meet (ya cuentan por Meet), ${c.yaEnUnaSesion + c.agregadasAMano} que ya eran una reunión de Nexus y ${c.sinUnaEmpresa} sin una empresa de la cartera sola.`
      : c.estado === "sin-google"
        ? "Sin Google Calendar en este entorno: las reuniones fuera de Meet no se leyeron."
        : "";
  const t = f.tareas;
  const tar =
    t.hechas > 0
      ? `Tareas internas hechas: ${t.hechas} (${t.conBloque} con bloque en la agenda, ${t.conEstimado} con su estimado, ${t.sinTiempo} sin tiempo).`
      : "Ninguna tarea interna hecha con una cuenta en el período.";
  const reun = t.reuniones > 0 ? ` Las ${t.reuniones} tareas de reunión no suman: cuentan por su reunión.` : "";
  return [cal, tar + reun].filter(Boolean).join(" ");
}

const NOTA_DEL_MODO: Record<ModoDeCosto, string> = {
  persona: "Por persona: cada hora al costo de quien la hizo (su planilla ÷ sus horas pagadas). Quien no tiene planilla ni salario en el período va al costo de una hora pagada promedio.",
  equipo: "Por equipo: cada hora al costo promedio del equipo de quien la hizo (Customer Success, Ventas, Marketing…).",
  cargado: "Cargado: cada hora con clientes paga su parte de la planilla entera (dirección, ventas, marketing, lo interno). Es el que dice si una cuenta deja plata.",
};

function MargenPorCuenta({ datos }: { datos: DatosDeRentabilidad }) {
  const [modo, setModo] = useState<ModoDeCosto>("persona");
  const tarifa = datos.costoDeLaHora.cargado ?? 0;
  const { conIngreso, sinIngreso } = useMemo(() => tablaDeMargen(datos.cuentas, tarifa, datos.totales.horasPorSesion, modo), [datos, tarifa, modo]);
  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface py-4">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4">
        <h2 className="text-sm font-semibold text-fg">Margen real contra margen estimado</h2>
        <span className="flex items-center gap-2">
          <span className="text-xs text-fg-muted">Costo de la hora</span>
          <Segmentado<ModoDeCosto>
            etiqueta="Costo de la hora"
            valor={modo}
            onCambio={setModo}
            opciones={[
              { clave: "persona", etiqueta: ETIQUETA_DEL_MODO.persona },
              { clave: "equipo", etiqueta: ETIQUETA_DEL_MODO.equipo },
              { clave: "cargado", etiqueta: `${ETIQUETA_DEL_MODO.cargado} · ${usd1(datos.costoDeLaHora.cargado ?? 0)}` },
            ]}
          />
        </span>
      </div>
      <p className="px-4 text-xs text-fg-muted">{NOTA_DEL_MODO[modo]}</p>
      <OrigenDeLasHoras datos={datos} />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px] leading-[19px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
              <th className="px-4 py-2">Cuenta</th>
              <th className="px-3 py-2 text-right">Cobrado</th>
              <th className="px-3 py-2 text-right">Horas reales</th>
              <th className="px-3 py-2 text-right">Costo</th>
              <th className="px-3 py-2 text-right">Margen real</th>
              <th className="px-3 py-2 text-right">Horas planeadas</th>
              <th className="px-3 py-2 text-right">Margen estimado</th>
              <th className="px-4 py-2">Real contra plan</th>
            </tr>
          </thead>
          <tbody>
            {conIngreso.map((f) => (
              <Fila key={f.clienteId} f={f} />
            ))}
            {sinIngreso.length > 0 && (
              <tr className="border-b border-line bg-surface-muted">
                <td colSpan={8} className="px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                  Sin cobros en el período · {sinIngreso.length}
                </td>
              </tr>
            )}
            {sinIngreso.slice(0, SIN_COBRO_A_LA_VISTA).map((f) => (
              <Fila key={f.clienteId} f={f} />
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
          <b className="text-fg-secondary">Horas reales</b> = reuniones del calendario, con y sin Meet (cada persona invitada que no la rechazó × la duración) +{" "}
          {datos.preparacionMin} min de preparación por persona y reunión + entrega del cronograma (lo respondido en «¿Cuánto te tomó?»; si no, lo estimado) +
          tareas internas hechas (lo que duraron sus bloques en la agenda; sin bloque, su estimado). Una tarea de reunión no suma: cuenta su reunión.
        </p>
        <p>
          <b className="text-fg-secondary">Horas planeadas</b> = lo que el cronograma ponía en el período: sus sesiones (a {coma(datos.totales.horasPorSesion, 1)} h-persona cada
          una, el promedio de una reunión con un cliente) + sus tareas. No son horas vendidas: hasta guardarlas al aprobar la propuesta, es lo más parecido que hay.
        </p>
        <p>«Sin entrega»: la cuenta no tiene tareas del cronograma ni internas en el período, así que el trabajo fuera de reunión no se ve y sus horas reales salen bajas.</p>
      </div>
    </section>
  );
}

function Fila({ f }: { f: FilaDeMargen }) {
  const bajo = f.margenPct !== null && f.margenPct < 0.15;
  return (
    <tr className="border-b border-line last:border-b-0">
      <td className="min-w-[220px] px-4 py-2.5">
        <Link href={rutaDelMargenDeLaCuenta(f.clienteId)} className="block font-semibold text-fg hover:text-brand">
          {f.nombre}
        </Link>
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
              {miles(f.desglose.reuniones)} reun.
              {(f.desglose.reunionesSinMeet ?? 0) >= 0.5 && ` (${miles(f.desglose.reunionesSinMeet ?? 0)} fuera de Meet)`} · {miles(f.desglose.preparacion)} prep. ·{" "}
              {f.sinEntregaEstimada ? "sin entrega" : `${miles(f.desglose.entrega)} entrega`}
              {(f.desglose.declarada ?? 0) >= 0.5 && ` (${miles(f.desglose.declarada ?? 0)} respondidas)`}
              {(f.desglose.tareas ?? 0) >= 0.5 &&
                ` · ${miles(f.desglose.tareas ?? 0)} tareas${(f.desglose.tareasAgenda ?? 0) >= 0.5 ? ` (${miles(f.desglose.tareasAgenda ?? 0)} de la agenda)` : ""}`}
            </span>
          </>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
        {f.horas < 0.5 ? (
          <span className="text-fg-muted">—</span>
        ) : (
          <>
            <span className="block">{usd(f.costo)}</span>
            <span className="block text-xs text-fg-muted">{usd1(f.tarifa)} la hora</span>
          </>
        )}
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
          Medido: el equipo está al <b className="text-fg">{c.utilizacionMedida} %</b> en las últimas {c.semanasMedidas} semanas. Hoy: {miles(c.base)} h por
          semana ({c.sinCse > 0 ? `${miles(c.sinCse)} de cuentas sin CSE vigente · ` : ""}de la{" "}
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
          <Decidir
            propuesta={
              p.primerMesSobre
                ? `Abrir la búsqueda de ${p.cseQueFaltan === 1 ? "un CSE" : `${p.cseQueFaltan} CSE`}${p.abrirBusquedaAntesDe ? ` antes del ${fecha(p.abrirBusquedaAntesDe, hoyISO.slice(0, 4))}` : ""} (${ETIQUETA_DE_ESCENARIO[escenario].toLowerCase()})`
                : `No contratar todavía (${ETIQUETA_DE_ESCENARIO[escenario].toLowerCase()})`
            }
            decisiones={c.decisiones}
            hoyISO={hoyISO}
          />
        </section>
      </div>

      {c.decisiones.length > 0 && (
        <section className="space-y-2 rounded-xl border border-line bg-surface px-4 py-3">
          <h2 className="text-sm font-semibold text-fg">Lo que ya se decidió</h2>
          <ul className="divide-y divide-line text-[13px]">
            {c.decisiones.map((d) => (
              <li key={d.clave} className="py-2">
                <span className="font-semibold text-fg">{d.valor === "CONFIRMADA" ? "Confirmada" : "Descartada"}</span>{" "}
                <span className="text-fg-muted">
                  · {fecha(d.decididoEn, hoyISO.slice(0, 4))} · {d.decididoPor}
                </span>
                {d.propuesta && <span className="block text-fg-secondary">{d.propuesta}</span>}
                {d.motivo && <span className="block text-xs text-fg-muted">Por qué: {d.motivo}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

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
                <th className="px-3 py-2">De dónde salen las horas</th>
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
                  <td className="px-3 py-2.5 text-xs text-fg-muted" title="El catálogo de casos de uso todavía no tiene horas: cuando las tenga, salen de la propuesta">
                    Por el tipo de trato
                  </td>
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

/** Confirmar o descartar la propuesta de contratar, con su motivo. Queda firmada, una por mes. */
function Decidir({ propuesta, decisiones, hoyISO }: { propuesta: string; decisiones: DecisionDeContratacion[]; hoyISO: string }) {
  const router = useRouter();
  const toast = useToast();
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const deEsteMes = decisiones.find((d) => d.mes === hoyISO.slice(0, 7));

  const decidir = async (valor: "CONFIRMADA" | "DESCARTADA") => {
    if (valor === "DESCARTADA" && !motivo.trim()) {
      toast.error("Para descartar la propuesta, escribe por qué.");
      return;
    }
    setGuardando(true);
    try {
      const r = await fetch("/api/cobranza/costos/contratacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valor, propuesta, motivo: motivo.trim() || undefined }),
      });
      const cuerpo = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(cuerpo.error ?? "No se pudo guardar.");
      toast.success(valor === "CONFIRMADA" ? "Propuesta confirmada: queda en «Lo que ya se decidió»." : "Propuesta descartada, con su motivo.");
      setMotivo("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-2 border-t border-line pt-3">
      {deEsteMes && (
        <p className="text-xs text-fg-secondary">
          Este mes ya se {deEsteMes.valor === "CONFIRMADA" ? "confirmó" : "descartó"}: {deEsteMes.propuesta}. Decidir de nuevo la reemplaza.
        </p>
      )}
      <label className="block">
        <span className="sr-only">Motivo</span>
        <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={1000} placeholder="Por qué (obligatorio para descartar)" />
      </label>
      <span className="flex flex-wrap justify-end gap-2">
        <BotonBlanco onClick={() => void decidir("DESCARTADA")} disabled={guardando}>
          Descartar
        </BotonBlanco>
        <BotonAzul onClick={() => void decidir("CONFIRMADA")} disabled={guardando}>
          {guardando ? "Guardando…" : "Confirmar la propuesta"}
        </BotonAzul>
      </span>
    </div>
  );
}

/** El costo de la hora por equipo y por persona. ⛔ Solo dirección: esta página ya lo es. Nunca el salario mensual. */
function CostoDeLaHora({ datos }: { datos: DatosDeRentabilidad }) {
  const equipos = datos.costos.equipos;
  const [equipo, setEquipo] = useState<string>("todos");
  const personas = datos.costos.personas.filter((p) => equipo === "todos" || p.equipo === equipo);
  const margenDe = useMemo(() => {
    const costoHora = new Map(datos.costos.personas.map((p) => [p.email, p.costoHora]));
    const directo = datos.costoDeLaHora.directo ?? 0;
    return new Map(margenPorPersona(datos.cuentas, (e) => costoHora.get(e) ?? directo).map((m) => [m.email, m]));
  }, [datos]);
  const pctTexto = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)} %`);
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <section className="space-y-2 rounded-xl border border-line bg-surface py-4">
          <h2 className="px-4 text-sm font-semibold text-fg">Por equipo · {datos.rango.etiqueta}</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px] leading-[19px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                  <th className="px-4 py-2">Equipo</th>
                  <th className="px-3 py-2 text-right">Personas</th>
                  <th className="px-3 py-2 text-right">Planilla</th>
                  <th className="px-3 py-2 text-right">Horas pagadas</th>
                  <th className="px-3 py-2 text-right">Costo de la hora</th>
                  <th className="px-3 py-2 text-right">Horas con clientes</th>
                  <th className="px-4 py-2 text-right">Parte con clientes</th>
                </tr>
              </thead>
              <tbody>
                {equipos.map((e) => (
                  <tr key={e.equipo} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-2.5 font-semibold text-fg">{e.equipo}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{e.personas}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{usd(e.planilla)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{miles(e.horasPagadas)} h</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{e.costoHora !== null ? usd1(e.costoHora) : "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{miles(e.horasConClientes)} h</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{pctTexto(e.parteConClientes)}</td>
                  </tr>
                ))}
                <tr className="bg-surface-muted">
                  <td className="px-4 py-2.5 font-semibold text-fg">Todo el equipo</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{equipos.reduce((a, e) => a + e.personas, 0)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{usd(datos.totales.planilla)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{miles(datos.totales.horasPagadas)} h</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{datos.costoDeLaHora.directo !== null ? usd1(datos.costoDeLaHora.directo) : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{miles(datos.totales.horasConClientes)} h</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{pctTexto(datos.costoDeLaHora.parteAClientes)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-2 rounded-xl border border-line bg-surface py-4">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4">
            <h2 className="text-sm font-semibold text-fg">Por persona</h2>
            <label className="flex items-center gap-2 text-xs text-fg-muted">
              Equipo
              <select
                value={equipo}
                onChange={(e) => setEquipo(e.target.value)}
                className="h-7 rounded-lg border border-line bg-surface px-1.5 text-xs text-fg"
              >
                <option value="todos">Todos</option>
                {equipos.map((e) => (
                  <option key={e.equipo} value={e.equipo}>
                    {e.equipo}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px] leading-[19px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                  <th className="px-4 py-2">Persona</th>
                  <th className="px-3 py-2">Equipo</th>
                  <th className="px-3 py-2 text-right">Horas pagadas</th>
                  <th className="px-3 py-2 text-right">Costo de la hora</th>
                  <th className="px-3 py-2 text-right">Horas con clientes</th>
                  <th className="px-3 py-2 text-right">Generado</th>
                  <th className="px-3 py-2 text-right">Margen</th>
                  <th className="px-4 py-2">De dónde sale</th>
                </tr>
              </thead>
              <tbody>
                {personas.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-2.5 font-semibold text-fg">{p.nombre}</td>
                    <td className="px-3 py-2.5 text-fg-secondary">{p.equipo}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{miles(p.horasPagadas)} h</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{p.costoHora !== null ? usd1(p.costoHora) : <span className="font-normal text-warn-ink">Sin planilla</span>}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{miles(p.horasConClientes)} h</td>
                    <MargenDeLaPersona m={margenDe.get(p.email)} />
                    <td className="px-4 py-2.5 text-xs text-fg-muted">
                      {p.fuente === "libro" ? "Libro de planilla" : p.fuente === "libro-media" ? "Libro (una quincena, la otra por pagarse)" : p.fuente === "costo-recurrente" ? "Salario registrado en Costos" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <aside className="space-y-3">
        <section className="space-y-2 rounded-xl bg-surface-muted p-4 text-[13px] leading-[19px] text-fg-secondary">
          <h2 className="text-sm font-semibold text-fg">De dónde sale</h2>
          <p>
            <b className="text-fg">Planilla:</b> lo pagado en el libro de planilla de Finanzas, quincena por quincena, con el tipo de cambio del día del pago; sin
            libro, el salario registrado en Costos. Más la reserva de aguinaldo (13 pagos en 12 meses).
          </p>
          <p>
            <b className="text-fg">Horas pagadas:</b> horas de contrato × las semanas en que estuvo en el equipo.
          </p>
          <p>
            <b className="text-fg">Costo de la hora:</b> planilla ÷ horas pagadas. Con eso se valora cada hora en el margen «por persona».
          </p>
          <p>
            <b className="text-fg">Horas con clientes:</b> reuniones del calendario (con y sin Meet), preparación, entrega del cronograma y tareas internas en las cuentas.
          </p>
          <p>
            <b className="text-fg">Generado y margen:</b> el cobro de cada cuenta repartido por la parte de horas que puso cada persona, menos lo que costaron sus
            horas. No mide a nadie: dice cuánto dejaron las cuentas en las que trabajó. Por nombre, sin ranking.
          </p>
        </section>
        <section className="space-y-2 rounded-xl bg-surface-muted p-4 text-[13px] leading-[19px] text-fg-secondary">
          <h2 className="text-sm font-semibold text-fg">Quién ve esto</h2>
          <p>Solo dirección (Super Admin). Nunca se muestra el salario mensual de nadie: solo su costo por hora.</p>
          {datos.personas.sinCosto.length > 0 && (
            <p className="text-xs text-fg-muted">Sin planilla en el período: {datos.personas.sinCosto.join(", ")}.</p>
          )}
        </section>
      </aside>
    </div>
  );
}

/** Lo que generaron las horas de una persona y su margen (lib/rentabilidad/margen.ts › margenPorPersona). */
function MargenDeLaPersona({ m }: { m: ReturnType<typeof margenPorPersona>[number] | undefined }) {
  if (!m) {
    return (
      <>
        <td className="px-3 py-2.5 text-right text-fg-muted">—</td>
        <td className="px-3 py-2.5 text-right text-fg-muted">—</td>
      </>
    );
  }
  return (
    <>
      <td className="px-3 py-2.5 text-right tabular-nums">{usd(m.ingreso)}</td>
      <td className={cn("px-3 py-2.5 text-right tabular-nums", m.margen < 0 && "text-danger-ink")}>{usd(m.margen)}</td>
    </>
  );
}
