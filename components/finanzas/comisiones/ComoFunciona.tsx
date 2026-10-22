"use client";

/**
 * «Cómo funciona» — el modelo de comisiones cerrado con Marco (2026-10-21) explicado con calculadoras chicas, no con el
 * documento copiado. Los números salen de las mismas reglas que la simulación (lib/finanzas/modelo-comisiones/reglas.ts):
 * si cambia una regla, cambia la explicación. Es igual para todo el equipo comercial; los techos los ve solo Super Admin.
 */
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Segmentado } from "@/components/ui";
import { BotonEnlace, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import {
  BONO_DEL_LIDER,
  BONO_DE_CUSTOMER_SUCCESS,
  DIAS_PARA_CAERSE,
  LICENCIA,
  MESES_DEL_VALOR,
  MESES_DE_VENTAS,
  PORCENTAJE_DE_CUSTOMER_SUCCESS,
  RENOVACION,
  TECHOS,
  TOPE_DE_LOS_BONOS,
  TRAMOS_DE_VENTA,
  UMBRAL_DE_APROBACION,
  bonoDeCustomerSuccess,
  bonoDeCustomerSuccessAlCien,
  bonoDelLiderPorPersona,
  comisionDeLicencia,
  porcentajeDelCumplimiento,
  valorDeLaVenta,
} from "@/lib/finanzas/modelo-comisiones/reglas";
import { CLASE_DE_PILDORA, PILDORA, usd, usd2 } from "./formato";

const META_DE_EJEMPLO = 30000;

/** El caso de Marco (2026-10-17): una recurrencia de US$ 3.000 al mes que se cerró en US$ 2.800. */
const MARCO = { primera: 3000, cerrado: 2800 };

/** Lo que le cuesta a Smarteam con todos en la meta: la comisión más alta y el bono del líder sobre esa meta. */
const COSTO_EN_VENTAS = TRAMOS_DE_VENTA[TRAMOS_DE_VENTA.length - 1].porcentaje + (BONO_DEL_LIDER.paga / BONO_DEL_LIDER.porCada) * 100;
const COSTO_EN_CUSTOMER_SUCCESS = PORCENTAJE_DE_CUSTOMER_SUCCESS + BONO_DE_CUSTOMER_SUCCESS.porcentajeDeLaMeta;
const ESCALERA = BONO_DE_CUSTOMER_SUCCESS.escalera;
const BASE = BONO_DE_CUSTOMER_SUCCESS.base;
/** «1,67 %»: lo que paga el bono de quien lidera sobre lo que vende cada persona. */
const PARTE_DEL_BONO = `${String(Math.round((BONO_DEL_LIDER.paga / BONO_DEL_LIDER.porCada) * 10000) / 100).replace(".", ",")} %`;

function pct1(n: number): string {
  return `${String(Math.round(n * 10) / 10).replace(".", ",")} %`;
}

/** Lo que se cerró con Marco el 2026-10-21, en una línea cada cosa. */
const YA_DECIDIDO = [
  "La meta es mensual y solo de servicios: las licencias no suman.",
  `Un servicio mensual cuenta sus ${MESES_DEL_VALOR} meses en la meta, sin multiplicar por nada.`,
  "El descuento se mide contra la primera propuesta del mismo negocio y sale entero de la comisión.",
  `Un descuento de más del ${UMBRAL_DE_APROBACION} % lo aprueba Marco en la propuesta.`,
  "El 3 % corre por debajo del 50 % de la meta, para todos.",
  `Andrés gana el ${PARTE_DEL_BONO} de lo que vende cada persona de su equipo, desde el ${BONO_DEL_LIDER.minimo * 100} % de su meta.`,
  `Los dos bonos dejan de crecer en el ${TOPE_DE_LOS_BONOS * 100} %.`,
  `Una venta que se cae en sus primeros ${DIAS_PARA_CAERSE} días se resta del mes en que se firmó.`,
  `Una renovación no cuenta para ninguna meta: el CSE de la cuenta gana el ${RENOVACION.porcentaje} % de un año.`,
  "Una venta compartida se marca antes de la firma: mitad de la comisión para cada uno y completa en las dos metas.",
  "Las licencias pagan sobre su valor, y se pagan cada trimestre, cuando HubSpot ya pagó.",
  "La comisión de quien vende no tiene tope.",
  "Desarrollo (conectores e integraciones) queda fuera de esta versión y se diseña aparte.",
];

/** Lo que falta decidir: solo dos cosas. */
const PENDIENTES: { pregunta: string; contexto: string; conQuien: string }[] = [
  {
    pregunta: "¿Cuál es la meta de ventas de toda la empresa?",
    contexto:
      "En la reunión se habló de vender entre US$ 80.000 y 90.000 al mes, para cubrir el punto de equilibrio con margen. De ahí salen las metas de cada persona.",
    conQuien: "Para decidir con Marco",
  },
  {
    pregunta: "¿RC Inmobiliaria, Honda, JUDESUR y APRECAP son renovaciones o expansiones?",
    contexto:
      "Una renovación no cuenta para la meta de Customer Success y una expansión sí: cambia la base de la que sale la meta del área. En HubSpot se marca en «Motion comercial».",
    conQuien: "Para confirmar con Alex",
  },
];

/** Lo que no coincide con este modelo, para corregir. */
const NO_CUADRA: { que: string; detalle: string }[] = [
  {
    que: "La oferta de Liz dice 60 % para el tramo del 3 %",
    detalle: "El modelo dice 50 %: por debajo de la mitad de la meta, 3 %; desde la mitad, 4 %. Hay que corregir la oferta a 50 %.",
  },
];

export default function ComoFunciona({ onSimular, todo }: { onSimular: () => void; todo: boolean }) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="space-y-1">
          <p className="text-[15px] leading-6 text-fg">
            Quien vende se lleva una parte de lo que vendió. Si llega a su meta del mes, esa parte es más grande. Quien lidera un equipo gana un bono
            cuando a su equipo le va bien.
          </p>
          <p className="text-[15px] leading-6 text-fg-secondary">Y una regla para todos: la comisión se paga cuando el cliente paga.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Resumen
            rotulo="Comisión por ventas"
            valor={TRAMOS_DE_VENTA.map((t) => t.porcentaje).join(" · ") + " %"}
            nota="Un 3, 4 o 5 % de todo lo que vende en el mes. Mientras más cerca de su meta, más alto el porcentaje."
          />
          <Resumen
            rotulo="Comisión por licencias"
            valor={`${LICENCIA.porcentaje} % × ${LICENCIA.meses} meses`}
            nota={`El ${LICENCIA.porcentaje} % de lo que cuesta la licencia al mes, durante sus primeros ${LICENCIA.meses} meses.`}
          />
          <Resumen
            rotulo="Comisión de Customer Success"
            valor={`${PORCENTAJE_DE_CUSTOMER_SUCCESS} % fijo`}
            nota={`El ${PORCENTAJE_DE_CUSTOMER_SUCCESS} % de lo que un CSE le vende a un cliente actual, y un ${RENOVACION.porcentaje} % por cada renovación.`}
          />
          <Resumen
            rotulo="Bono de liderazgo"
            valor="Por trimestre"
            nota={`Andrés: el ${PARTE_DEL_BONO} de lo que vende cada persona de su equipo. Alex: el ${BONO_DE_CUSTOMER_SUCCESS.porcentajeDeLaMeta} % de la meta del área.`}
          />
        </div>
        <div className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-xl border border-line bg-surface px-4 py-3 md:grid-cols-3">
          <Dato rotulo="Aplica a">Ventas (Andrés y Liz) y Customer Success (los CSE y Alex). Marco queda fuera.</Dato>
          <Dato rotulo="Rige desde">
            Las comisiones, desde el 1 de noviembre de 2026; los bonos, desde el trimestre que empieza en enero de 2027. Reemplaza todas las condiciones
            anteriores; lo vendido antes se paga como se acordó.
          </Dato>
          <Dato rotulo="Costo para Smarteam">
            Con todos en la meta, cerca del {pct1(COSTO_EN_VENTAS)} de lo vendido en Ventas y del {pct1(COSTO_EN_CUSTOMER_SUCCESS)} de la expansión en Customer Success.
          </Dato>
        </div>
      </div>

      <Seccion
        numero={1}
        titulo="Comisión por ventas"
        bajada={`${TRAMOS_DE_VENTA.map((t) => `${t.porcentaje} %`).join(", ").replace(/, ([^,]*)$/, " o $1")} según el cumplimiento de la meta del mes`}
        texto={<ComisionPorVentaTexto />}
      >
        <CalculadoraDeVenta />
      </Seccion>

      <Seccion
        numero={2}
        titulo="Descuentos y servicios mensuales"
        bajada={`Un servicio mensual vale ${MESES_DEL_VALOR} meses y el descuento sale de la comisión`}
        texto={<ValorDeLaCuentaTexto />}
      >
        <CalculadoraDelDescuento />
      </Seccion>

      <Seccion
        numero={3}
        titulo="Comisión por licencias"
        bajada={`${LICENCIA.porcentaje} % del valor mensual, por ${LICENCIA.meses} meses`}
        texto={
          <>
            <Parrafo>
              Quien la vende se lleva el {LICENCIA.porcentaje} % de lo que cuesta al mes, durante sus primeros {LICENCIA.meses} meses. Aunque el cliente pague el año entero, son
              solo {LICENCIA.meses} meses.
            </Parrafo>
            <Parrafo>Solo cuentan las licencias que consigue Smarteam. Las que refiere HubSpot no.</Parrafo>
            <Parrafo>Se pagan todas juntas cada 3 meses, después de que HubSpot le paga a Smarteam.</Parrafo>
          </>
        }
      >
        <CalculadoraDeLicencia />
      </Seccion>

      <Seccion numero={4} titulo="De quién es cada venta" bajada={`Ventas los primeros ${MESES_DE_VENTAS} meses; después, quien crea el negocio`} texto={<AQuienTexto />}>
        <AQuienCaja />
      </Seccion>

      <Seccion
        numero={5}
        titulo="Customer Success y renovaciones"
        bajada={`${PORCENTAJE_DE_CUSTOMER_SUCCESS} % fijo de la expansión y ${RENOVACION.porcentaje} % por renovación`}
        texto={<CustomerSuccessTexto />}
      >
        <CalculadoraDeCustomerSuccess />
      </Seccion>

      <Seccion numero={6} titulo="Bono de liderazgo" bajada="Por lo que vende el equipo, no por las ventas propias" texto={<BonoTexto />}>
        <CalculadoraDeBono />
      </Seccion>

      <Seccion numero={7} titulo="Si una venta se cae" bajada={`En sus primeros ${DIAS_PARA_CAERSE} días, se resta del mes en que se firmó`} texto={<CaidasTexto />}>
        <EjemploDeCaida />
      </Seccion>

      <section aria-labelledby="como-se-paga" className="space-y-3.5 rounded-xl border border-line bg-surface p-5">
        <TituloNumerado numero={8} id="como-se-paga" bajada="La comisión se paga cuando el cliente paga">
          Calendario de pago
        </TituloNumerado>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Paso rotulo="1 · El cliente firma">La venta cuenta para la meta de quien vendió, en ese mes.</Paso>
          <Paso rotulo="2 · El cliente paga">Si paga por partes, la comisión también se paga por partes.</Paso>
          <Paso rotulo="3 · Al mes siguiente">Se paga la comisión, con el porcentaje del mes en que firmó.</Paso>
          <Paso rotulo="Trimestral">Se pagan los bonos de liderazgo y las comisiones por licencias.</Paso>
        </div>
      </section>

      {todo && <Techos />}

      <section aria-labelledby="ya-decidido" className="space-y-3 rounded-xl border border-line bg-surface p-5">
        <h2 id="ya-decidido" className="text-base font-semibold text-fg">
          Decisiones tomadas
        </h2>
        <ul className="grid grid-cols-1 gap-x-6 gap-y-2 text-[13px] leading-[19px] text-fg-secondary md:grid-cols-2">
          {YA_DECIDIDO.map((d) => (
            <li key={d} className="flex gap-2">
              <span aria-hidden className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-fg-muted" />
              <span>{d}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section aria-labelledby="falta-decidir" className="space-y-3 rounded-xl border border-warn-line bg-surface p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="falta-decidir" className="text-base font-semibold text-fg">
              Pendientes
            </h2>
            <BotonEnlace onClick={onSimular}>Ver la simulación →</BotonEnlace>
          </div>
          <ol className="flex flex-col">
            {PENDIENTES.map((p, i) => (
              <li key={p.pregunta} className="grid grid-cols-[24px_minmax(0,1fr)] items-start gap-3 border-b border-line py-3 first:pt-0 last:border-b-0 last:pb-0">
                <Numero>{i + 1}</Numero>
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-sm font-semibold text-fg">{p.pregunta}</span>
                  <p className="text-[13px] leading-[19px] text-fg-secondary">{p.contexto}</p>
                  <span className={cn(CLASE_DE_PILDORA, PILDORA.atencion, "self-start")}>{p.conQuien}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="no-cuadra" className="space-y-3 rounded-xl border border-line bg-surface p-5">
          <h2 id="no-cuadra" className="text-base font-semibold text-fg">
            Lo que no cuadra
          </h2>
          <ul className="flex flex-col">
            {NO_CUADRA.map((n) => (
              <li key={n.que} className="flex flex-col gap-1 border-b border-line py-3 first:pt-0 last:border-b-0 last:pb-0">
                <span className="text-sm font-semibold text-fg">{n.que}</span>
                <p className="text-[13px] leading-[19px] text-fg-secondary">{n.detalle}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

// ── Las piezas ─────────────────────────────────────────────────────────────────

function Resumen({ rotulo, valor, nota }: { rotulo: string; valor: string; nota: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface px-4 py-4">
      <span className={ROTULO_DEL_SISTEMA}>{rotulo}</span>
      <span className="text-[22px] font-bold leading-7 tabular-nums text-fg">{valor}</span>
      <span className="text-xs leading-4 text-fg-muted">{nota}</span>
    </div>
  );
}

function Numero({ children }: { children: ReactNode }) {
  return <span className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-[7px] bg-surface-muted text-xs font-bold text-fg-secondary">{children}</span>;
}

function TituloNumerado({ numero, id, bajada, children }: { numero: number; id: string; bajada?: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[24px_minmax(0,1fr)] items-start gap-x-2.5">
      <Numero>{numero}</Numero>
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 id={id} className="text-base font-semibold leading-6 text-fg">
          {children}
        </h2>
        {bajada && <span className="text-[13px] leading-[19px] text-fg-muted">{bajada}</span>}
      </div>
    </div>
  );
}

function Dato({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className={ROTULO_DEL_SISTEMA}>{rotulo}</span>
      <span className="text-[13px] leading-[19px] text-fg-secondary">{children}</span>
    </div>
  );
}

function Parrafo({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-[22px] text-fg-secondary">{children}</p>;
}

function Seccion({ numero, titulo, bajada, texto, children }: { numero: number; titulo: string; bajada: string; texto: ReactNode; children: ReactNode }) {
  const id = `seccion-${numero}`;
  return (
    <section aria-labelledby={id} className="grid grid-cols-1 gap-6 rounded-xl border border-line bg-surface p-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="flex flex-col gap-2">
        <TituloNumerado numero={numero} id={id} bajada={bajada}>
          {titulo}
        </TituloNumerado>
        {texto}
      </div>
      <div className="flex flex-col gap-3 rounded-[10px] border border-line bg-surface-muted p-4">{children}</div>
    </section>
  );
}

function Paso({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-[10px] border border-line bg-surface p-3.5">
      <span className={ROTULO_DEL_SISTEMA}>{rotulo}</span>
      <span className="text-[13px] leading-[19px] text-fg">{children}</span>
    </div>
  );
}

function Deslizador({ id, etiqueta, valor, texto, min, max, step, onCambio }: { id: string; etiqueta: string; valor: number; texto: string; min: number; max: number; step: number; onCambio: (n: number) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[13px] text-fg-secondary">
          {etiqueta}
        </label>
        <span className="font-semibold tabular-nums text-fg">{texto}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={valor} onChange={(e) => onCambio(Number(e.target.value))} className="w-full accent-brand" />
    </div>
  );
}

function Cifra({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className={ROTULO_DEL_SISTEMA}>{rotulo}</span>
      <span className="text-[22px] font-bold leading-7 tabular-nums text-fg">{valor}</span>
    </div>
  );
}

function Pildora({ tono, children }: { tono: keyof typeof PILDORA; children: ReactNode }) {
  return <span className={cn(CLASE_DE_PILDORA, PILDORA[tono])}>{children}</span>;
}

// ── 1 · La comisión por venta ──────────────────────────────────────────────────

function ComisionPorVentaTexto() {
  return (
    <>
      <Parrafo>Cada vendedor tiene una meta al mes: lo que se espera que venda. Según cuánto llegue, se lleva una parte distinta de todo lo que vendió ese mes:</Parrafo>
      <ul className="flex flex-col gap-1.5 text-sm leading-[22px] text-fg-secondary">
        <li>· Menos de la mitad de su meta: <strong className="font-semibold text-fg">3 %</strong>.</li>
        <li>· Desde la mitad: <strong className="font-semibold text-fg">4 %</strong>.</li>
        <li>· La meta o más: <strong className="font-semibold text-fg">5 %</strong>.</li>
      </ul>
      <Parrafo>Los tramos son iguales para todos. No hay tope: mientras más vende, más gana. Solo cuentan los servicios; las licencias van aparte.</Parrafo>
      <div className="mt-1 flex flex-col gap-2 rounded-[10px] border border-line bg-surface-muted p-4">
        <span className={ROTULO_DEL_SISTEMA}>Si recién entra</span>
        <p className="text-[13px] leading-[19px] text-fg-secondary">En sus primeros meses tiene una meta más baja, que sube hasta la completa. Esa meta es la que cuenta.</p>
      </div>
    </>
  );
}

function CalculadoraDeVenta() {
  const [ventas, setVentas] = useState(25000);
  const cumplimiento = ventas / META_DE_EJEMPLO;
  const porcentaje = porcentajeDelCumplimiento(cumplimiento);
  const comision = (ventas * porcentaje) / 100;
  const siguiente = TRAMOS_DE_VENTA.find((t) => t.porcentaje > porcentaje);
  const falta = siguiente ? siguiente.desde * META_DE_EJEMPLO - ventas : 0;
  const ganaria = siguiente ? (siguiente.desde * META_DE_EJEMPLO * siguiente.porcentaje) / 100 - comision : 0;
  return (
    <>
      <ul className="grid grid-cols-3 gap-1">
        {TRAMOS_DE_VENTA.map((t) => (
          <li key={t.porcentaje} className={cn("flex flex-col gap-0.5 rounded-lg border px-3 py-2.5", t.porcentaje === porcentaje ? "border-info-line bg-info-surface" : "border-line bg-surface")}>
            <span className="text-xs leading-4 text-fg-muted">{t.rotulo}</span>
            <span className="text-xl font-bold leading-[26px] tabular-nums text-fg">{t.porcentaje} %</span>
          </li>
        ))}
      </ul>
      <Deslizador
        id="ventas-del-mes"
        etiqueta={`Ventas del mes, con una meta de ${usd(META_DE_EJEMPLO)}`}
        valor={ventas}
        texto={usd(ventas)}
        min={0}
        max={45000}
        step={100}
        onCambio={setVentas}
      />
      <div className="grid grid-cols-3 gap-3">
        <Cifra rotulo="Cumplimiento" valor={`${Math.round(cumplimiento * 100)} %`} />
        <Cifra rotulo="Tasa aplicada" valor={`${porcentaje} %`} />
        <Cifra rotulo="Comisión del mes" valor={usd(comision)} />
      </div>
      <GraficoDeLaComision ventas={ventas} comision={comision} />
      <div className="flex flex-wrap items-center gap-2">
        {siguiente ? (
          <>
            <Pildora tono="atencion">Al siguiente tramo</Pildora>
            <span className="text-[13px] text-fg-secondary">
              Si vende {usd(falta)} más, se lleva el {siguiente.porcentaje} % de todo el mes: ganaría {usd(ganaria)} más.
            </span>
          </>
        ) : (
          <>
            <Pildora tono="info">Llegó a la meta</Pildora>
            <span className="text-[13px] text-fg-secondary">Se lleva el {porcentaje} % de todo lo que vendió en el mes.</span>
          </>
        )}
      </div>
    </>
  );
}


// ── 4 · De quién es cada venta ──────────────────────────────────────────────────

function AQuienTexto() {
  return (
    <>
      <Parrafo>
        Cuando un cliente le compra a Smarteam por primera vez, Ventas lo acompaña {MESES_DE_VENTAS} meses: todo lo que se le venda en ese tiempo es de Ventas.
      </Parrafo>
      <Parrafo>Después, la venta es de quien la convierte en negocio en HubSpot. Casi siempre es Customer Success.</Parrafo>
      <Parrafo>
        Si Ventas y Customer Success la hacen juntos, quien crea el negocio lo marca en HubSpot («Venta compartida con») antes de la firma. Cada uno se lleva la
        mitad de su comisión y la venta cuenta completa en las dos metas. Después de firmada ya no se puede marcar.
      </Parrafo>
      <Parrafo>Una venta de Customer Success sin Ventas cuenta solo para la meta de Customer Success.</Parrafo>
      <Parrafo>En HubSpot, «Motion comercial» dice si el negocio es nuevo, expansión o renovación. Sin marcar, Nexus lo deduce.</Parrafo>
    </>
  );
}

function AQuienCaja() {
  return (
    <>
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] overflow-hidden rounded-lg border border-line">
        <div className="flex flex-col gap-0.5 border-r border-info-line bg-info-surface px-3.5 py-3">
          <span className={cn(ROTULO_DEL_SISTEMA, "text-info-ink")}>Primera venta → {MESES_DE_VENTAS} meses</span>
          <span className="text-sm font-semibold text-fg">Ventas</span>
          <span className="text-xs leading-4 text-fg-muted">Todo lo que se le venda en ese plazo</span>
        </div>
        <div className="flex flex-col gap-0.5 bg-surface px-3.5 py-3">
          <span className={ROTULO_DEL_SISTEMA}>Después</span>
          <span className="text-sm font-semibold text-fg">Quien crea el negocio en HubSpot</span>
          <span className="text-xs leading-4 text-fg-muted">Casi siempre Customer Success</span>
        </div>
      </div>
      <Bloque
        rotulo="Venta compartida"
        valor="Mitad y mitad"
        nota="Marcada antes de la firma. Cada uno se lleva la mitad de su comisión y la venta cuenta completa en las dos metas. Vale igual para las licencias."
      />
    </>
  );
}

function EscaleraDeLaMeta() {
  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-line bg-surface p-3.5">
      <span className={ROTULO_DEL_SISTEMA}>Meta del área, por trimestre</span>
      <ol className="flex flex-col">
        {ESCALERA.map((e, i) => (
          <li key={e.meta} className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-baseline gap-x-2.5 border-b border-line py-1.5 last:border-b-0">
            <span className="text-xs font-semibold tabular-nums text-fg-muted">T{i + 1}</span>
            <span className="text-[13px] leading-[19px] text-fg-secondary">{e.porque}</span>
            <span className="text-sm font-semibold tabular-nums text-fg">{usd(e.meta)}</span>
          </li>
        ))}
      </ol>
      <span className="text-xs leading-4 text-fg-muted">La comparte todo el equipo de Customer Success. Sin las renovaciones de contrato.</span>
    </div>
  );
}

function Bloque({ rotulo, valor, nota }: { rotulo: string; valor: string; nota: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-[10px] border border-line bg-surface p-3.5">
      <span className={ROTULO_DEL_SISTEMA}>{rotulo}</span>
      <span className="text-xl font-bold leading-[26px] text-fg">{valor}</span>
      <span className="text-xs leading-4 text-fg-muted">{nota}</span>
    </div>
  );
}


// ── 5 · Customer Success y renovaciones ─────────────────────────────────────────

function CustomerSuccessTexto() {
  return (
    <>
      <Parrafo>
        Cada CSE se lleva el {PORCENTAJE_DE_CUSTOMER_SUCCESS} % de lo que le vende a un cliente actual: siempre el mismo, sin tramos. Los CSE no tienen meta
        individual.
      </Parrafo>
      <Parrafo>
        La meta es del área y sube por escalones, de {usd(ESCALERA[0].meta)} a {usd(ESCALERA[ESCALERA.length - 1].meta)} de expansión por trimestre. De esa
        meta sale el bono de liderazgo de Alex.
      </Parrafo>
      <Parrafo>
        La base es la expansión que compró la cartera de {BASE.periodo}: {usd(BASE.expansion)}, unos {usd(BASE.expansion / 4)} por trimestre. Hasta ahora la
        vendían Marco y Andrés; desde este esquema, Customer Success.
      </Parrafo>
      <Parrafo>
        Las renovaciones no cuentan para ninguna meta. Si un cliente renueva a tiempo y sin descuento, el CSE de la cuenta gana un bono del {RENOVACION.porcentaje} %
        sobre un año del contrato, cuando el cliente paga. Lo que crece en la renovación (más alcance o más precio) es expansión: paga el{" "}
        {PORCENTAJE_DE_CUSTOMER_SUCCESS} % y cuenta para la meta. Un servicio mensual sin fecha de fin cuenta como renovación cada {MESES_DEL_VALOR} meses que
        sigue activo. Las licencias no cambian.
      </Parrafo>
    </>
  );
}

function CalculadoraDeCustomerSuccess() {
  const [venta, setVenta] = useState(5000);
  const [modo, setModo] = useState<"solo" | "compartida" | "renovacion">("solo");
  const porcentaje = modo === "solo" ? PORCENTAJE_DE_CUSTOMER_SUCCESS : modo === "compartida" ? PORCENTAJE_DE_CUSTOMER_SUCCESS / 2 : RENOVACION.porcentaje;
  return (
    <>
      <Segmentado
        etiqueta="Qué se vendió"
        valor={modo}
        onCambio={setModo}
        opciones={[
          { clave: "solo", etiqueta: "Expansión del CSE" },
          { clave: "compartida", etiqueta: "Junto con Ventas" },
          { clave: "renovacion", etiqueta: "Renovación" },
        ]}
      />
      <Deslizador
        id="venta-de-expansion"
        etiqueta={modo === "renovacion" ? "Un año del contrato renovado" : "Venta a un cliente actual"}
        valor={venta}
        texto={usd(venta)}
        min={500}
        max={30000}
        step={100}
        onCambio={setVenta}
      />
      <div className="grid grid-cols-2 gap-3">
        <Cifra rotulo="Tasa aplicada" valor={`${String(porcentaje).replace(".", ",")} %`} />
        <Cifra rotulo={modo === "renovacion" ? "Bono del CSE" : "Comisión del CSE"} valor={usd((venta * porcentaje) / 100)} />
      </div>
      <span className="text-xs leading-4 text-fg-muted">
        {modo === "renovacion" ? "No cuenta para la meta del área. Solo si se renovó a tiempo y sin descuento." : "Cuenta completa para la meta del área."}
      </span>
      <EscaleraDeLaMeta />
    </>
  );
}

// ── 3 · Licencias ──────────────────────────────────────────────────────────────

function CalculadoraDeLicencia() {
  const [mensual, setMensual] = useState(621);
  const cuota = (mensual * LICENCIA.porcentaje) / 100;
  return (
    <>
      <Deslizador id="valor-licencia" etiqueta="Valor mensual de la licencia" valor={mensual} texto={usd(mensual)} min={50} max={3000} step={1} onCambio={setMensual} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface px-3.5 py-3">
          <span className={ROTULO_DEL_SISTEMA}>Comisión total</span>
          <span className="text-[22px] font-bold leading-7 tabular-nums text-fg">{usd2(comisionDeLicencia(mensual))}</span>
          <span className="text-xs leading-4 text-fg-muted">
            {LICENCIA.porcentaje} % de {usd(mensual)} = {usd2(cuota)} por cada uno de los primeros {LICENCIA.meses} meses de la licencia.
          </span>
        </div>
        <div className="flex flex-col gap-1 rounded-lg border border-info-line bg-surface px-3.5 py-3">
          <span className={ROTULO_DEL_SISTEMA}>Cuándo se paga</span>
          <span className="text-[15px] font-semibold leading-[22px] text-fg">Trimestral, en un solo pago</span>
          <span className="text-xs leading-4 text-fg-muted">Junto con las demás licencias del trimestre, cuando HubSpot ya le pagó a Smarteam su comisión.</span>
        </div>
      </div>
    </>
  );
}


// ── 6 · Bono de liderazgo ────────────────────────────────────────────────

function BonoTexto() {
  return (
    <>
      <Parrafo>Quien lidera gana cuando a su equipo le va bien.</Parrafo>
      <div className="mt-1 grid grid-cols-1 gap-2">
        <div className="flex flex-col gap-1 rounded-[10px] border border-line bg-surface-muted p-3.5">
          <span className={ROTULO_DEL_SISTEMA}>Andrés · Ventas</span>
          <span className="text-[13px] leading-[19px] text-fg-secondary">
            Gana el {PARTE_DEL_BONO} de lo que vende cada persona de su equipo ({usd(BONO_DEL_LIDER.paga)} por cada {usd(BONO_DEL_LIDER.porCada)}), en los meses en que esa
            persona llega al {BONO_DEL_LIDER.minimo * 100} % de su propia meta. En sus primeros meses se usa su meta reducida. Lo vendido deja de contar en el{" "}
            {TOPE_DE_LOS_BONOS * 100} % de su meta. Se paga cada trimestre.
          </span>
        </div>
        <div className="flex flex-col gap-1 rounded-[10px] border border-line bg-surface-muted p-3.5">
          <span className={ROTULO_DEL_SISTEMA}>Alex · Customer Success</span>
          <span className="text-[13px] leading-[19px] text-fg-secondary">
            Su equipo tiene una sola meta de expansión por trimestre, que sube por escalones: de {usd(ESCALERA[0].meta)} a {usd(ESCALERA[ESCALERA.length - 1].meta)}.
            Si llegan, Alex gana el {BONO_DE_CUSTOMER_SUCCESS.porcentajeDeLaMeta} % de esa meta; desde el {BONO_DEL_LIDER.minimo * 100} % se paga en proporción, y deja
            de crecer en el {TOPE_DE_LOS_BONOS * 100} %.
          </span>
        </div>
      </div>
      <div className="mt-1 flex flex-col gap-1.5 rounded-[10px] border border-info-line bg-info-surface p-3.5">
        <span className={cn(ROTULO_DEL_SISTEMA, "text-info-ink")}>¿Por qué se calculan distinto?</span>
        <span className="text-[13px] leading-[19px] text-fg-secondary">
          En el bono de Andrés solo cuenta lo que vende su equipo, porque sus propias ventas ya le pagan comisión. En el de Alex cuenta todo lo que crece la
          cartera, también lo que venda él.
        </span>
      </div>
    </>
  );
}

/** Los ejemplos que dio Elías (2026-10-21): un mes de una persona del equipo de Andrés. */
const EJEMPLOS_DEL_BONO = [
  { meta: 10000, vendido: 8000 },
  { meta: 30000, vendido: 18000 },
  { meta: 30000, vendido: 30000 },
  { meta: 30000, vendido: 50000 },
];

function CalculadoraDeBono() {
  const [quien, setQuien] = useState<"ventas" | "cs">("ventas");
  const [meta, setMeta] = useState(META_DE_EJEMPLO);
  const [vendido, setVendido] = useState(30000);
  const [trimestre, setTrimestre] = useState<"0" | "1" | "2" | "3">("0");
  const [cumplimiento, setCumplimiento] = useState(100);
  const metaDelArea = ESCALERA[Number(trimestre)].meta;
  if (quien === "cs") {
    const bono = bonoDeCustomerSuccess(metaDelArea, (metaDelArea * cumplimiento) / 100);
    const maximo = bonoDeCustomerSuccessAlCien(metaDelArea) * TOPE_DE_LOS_BONOS;
    return (
      <>
        <SelectorDeLider quien={quien} onCambio={setQuien} />
        <Segmentado
          etiqueta="Trimestre"
          valor={trimestre}
          onCambio={setTrimestre}
          opciones={ESCALERA.map((_, i) => ({ clave: String(i) as "0" | "1" | "2" | "3", etiqueta: `T${i + 1}` }))}
        />
        <span className="text-[13px] text-fg-secondary">
          Meta del área: {usd(metaDelArea)}. Al llegar, el bono es {usd(bonoDeCustomerSuccessAlCien(metaDelArea))}. No depende de cuántos CSE tiene a cargo.
        </span>
        <Deslizador id="cumplimiento-area" etiqueta="Cumplimiento de la meta del área" valor={cumplimiento} texto={`${cumplimiento} %`} min={0} max={200} step={5} onCambio={setCumplimiento} />
        <div className="grid grid-cols-2 gap-3">
          <Cifra rotulo="Bono del trimestre" valor={usd(bono)} />
          <Cifra rotulo="Lo máximo" valor={usd(maximo)} />
        </div>
        <EstadoDelBono cumplimiento={cumplimiento / 100} />
      </>
    );
  }
  const bono = bonoDelLiderPorPersona(vendido, meta);
  return (
    <>
      <SelectorDeLider quien={quien} onCambio={setQuien} />
      <Deslizador id="meta-de-la-persona" etiqueta="Meta del mes de la persona" valor={meta} texto={usd(meta)} min={5000} max={60000} step={1000} onCambio={setMeta} />
      <Deslizador id="vendido-de-la-persona" etiqueta="Lo que vende en el mes" valor={vendido} texto={usd(vendido)} min={0} max={90000} step={500} onCambio={setVendido} />
      <div className="grid grid-cols-2 gap-3">
        <Cifra rotulo="Bono de Andrés por ese mes" valor={usd(bono)} />
        <Cifra rotulo="Cumplimiento" valor={`${Math.round((vendido / meta) * 100)} %`} />
      </div>
      <EstadoDelBono cumplimiento={vendido / meta} />
      <div className="flex flex-col gap-1.5 rounded-[10px] border border-line bg-surface p-3.5">
        <span className={ROTULO_DEL_SISTEMA}>Ejemplos de un mes</span>
        <ul className="flex flex-col gap-1 text-[13px] leading-[19px] text-fg-secondary">
          {EJEMPLOS_DEL_BONO.map((e) => (
            <li key={`${e.meta}-${e.vendido}`} className="flex justify-between gap-3">
              <span>
                Meta de {usd(e.meta)}, vende {usd(e.vendido)}
              </span>
              <span className="font-semibold tabular-nums text-fg">{usd(bonoDelLiderPorPersona(e.vendido, e.meta))}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function SelectorDeLider({ quien, onCambio }: { quien: "ventas" | "cs"; onCambio: (q: "ventas" | "cs") => void }) {
  return (
    <Segmentado
      etiqueta="Quién lidera"
      valor={quien}
      onCambio={onCambio}
      opciones={[
        { clave: "ventas", etiqueta: "Andrés · Ventas" },
        { clave: "cs", etiqueta: "Alex · Customer Success" },
      ]}
    />
  );
}

function EstadoDelBono({ cumplimiento }: { cumplimiento: number }) {
  if (cumplimiento < BONO_DEL_LIDER.minimo) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Pildora tono="atencion">No alcanza</Pildora>
        <span className="text-[13px] text-fg-secondary">Con menos del {BONO_DEL_LIDER.minimo * 100} % de la meta no hay bono.</span>
      </div>
    );
  }
  if (cumplimiento > TOPE_DE_LOS_BONOS) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Pildora tono="neutra">Llegó al tope</Pildora>
        <span className="text-[13px] text-fg-secondary">Pasado el {TOPE_DE_LOS_BONOS * 100} % el bono ya no crece.</span>
      </div>
    );
  }
  return <span className="text-[13px] text-fg-secondary">Entre el {BONO_DEL_LIDER.minimo * 100} y el {TOPE_DE_LOS_BONOS * 100} %, el bono crece con lo vendido.</span>;
}

/**
 * Cómo crece la comisión del mes con lo vendido (meta de 30.000): una línea por tramo, con los saltos en el 50 y el
 * 100 %, contra el 5 % fijo de hoy, punteado. SVG estático: el punto marca lo que se eligió arriba.
 */
function GraficoDeLaComision({ ventas, comision }: { ventas: number; comision: number }) {
  const ancho = 480;
  const alto = 170;
  const margen = { izq: 8, der: 8, arriba: 10, abajo: 34 };
  const maxV = 45000;
  const maxC = (maxV * 5) / 100;
  const x = (v: number) => margen.izq + (v / maxV) * (ancho - margen.izq - margen.der);
  const y = (c: number) => alto - margen.abajo - (c / maxC) * (alto - margen.arriba - margen.abajo);
  const cortes = [0, ...TRAMOS_DE_VENTA.slice(1).map((t) => t.desde * META_DE_EJEMPLO), maxV];
  const tramos = TRAMOS_DE_VENTA.map((t, i) => ({ desde: cortes[i], hasta: cortes[i + 1], porcentaje: t.porcentaje }));
  return (
    <figure className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${ancho} ${alto}`} className="h-auto w-full" role="img" aria-label="La comisión del mes según lo vendido: sube por tramos y salta al 50 y al 100 % de la meta">
        <line x1={x(0)} y1={y(0)} x2={x(maxV)} y2={y(0)} className="stroke-line" strokeWidth={1} />
        {cortes.slice(1, -1).map((v) => (
          <line key={v} x1={x(v)} y1={y(0)} x2={x(v)} y2={margen.arriba} className="stroke-line" strokeWidth={1} strokeDasharray="2 3" />
        ))}
        <line x1={x(0)} y1={y(0)} x2={x(maxV)} y2={y(maxC)} className="stroke-fg-muted" strokeWidth={1.5} strokeDasharray="5 4" />
        {tramos.map((t) => (
          <line key={t.porcentaje} x1={x(t.desde)} y1={y((t.desde * t.porcentaje) / 100)} x2={x(t.hasta)} y2={y((t.hasta * t.porcentaje) / 100)} className="stroke-brand" strokeWidth={2.5} />
        ))}
        <circle cx={x(ventas)} cy={y(comision)} r={5} className="fill-brand stroke-surface" strokeWidth={2} />
        {[
          { v: 0, texto: "0" },
          { v: cortes[1], texto: "50 % de la meta" },
          { v: cortes[2], texto: "La meta" },
          { v: maxV, texto: usd(maxV) },
        ].map((m, i, todos) => (
          <text
            key={m.v}
            x={x(m.v)}
            y={alto - 12}
            textAnchor={i === 0 ? "start" : i === todos.length - 1 ? "end" : "middle"}
            className="fill-fg-muted text-[11px]"
          >
            {m.texto}
          </text>
        ))}
      </svg>
      <figcaption className="flex flex-wrap gap-4 text-xs text-fg-secondary">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-0.5 w-5 bg-brand" />
          Con el modelo
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block w-5 border-t-2 border-dashed border-fg-muted" />
          Hoy, con el 5 % fijo
        </span>
      </figcaption>
    </figure>
  );
}


// ── 2 · Descuentos y servicios mensuales ────────────────────────────────────────

function ValorDeLaCuentaTexto() {
  const regalado = (MARCO.primera - MARCO.cerrado) * MESES_DEL_VALOR;
  const valor = MARCO.cerrado * MESES_DEL_VALOR;
  return (
    <>
      <Parrafo>
        Un servicio que se cobra todos los meses vale lo que cobra en {MESES_DEL_VALOR} meses, y cuenta eso para la meta. Si se vende con descuento, lo
        descontado sale de lo que comisiona: quien vende también pone parte del descuento. Para la meta cuenta lo que se cerró.
      </Parrafo>
      <Parrafo>
        El descuento se mide contra la primera propuesta del mismo negocio: lo que bajó desde ahí. Es así hasta que existan precios estándar por caso de uso.
      </Parrafo>
      <div className="mt-1 flex flex-col gap-1.5 rounded-[10px] border border-line bg-surface-muted p-4">
        <span className={ROTULO_DEL_SISTEMA}>El caso de Marco</span>
        <p className="text-[13px] leading-[19px] text-fg-secondary">
          La primera propuesta decía {usd(MARCO.primera)} al mes y se cerró en {usd(MARCO.cerrado)}: se regalaron {usd(regalado)} al año.
        </p>
        <ul className="flex flex-col gap-1 text-[13px] leading-[19px] text-fg-secondary">
          <li>
            · Vale {MESES_DEL_VALOR} × {usd(MARCO.cerrado)} = {usd(valor)}, y eso cuenta para la meta.
          </li>
          <li>
            · Menos lo descontado: {usd(valor)} − {usd(regalado)} = {usd(valor - regalado)}.
          </li>
          <li>
            · Al 5 %: <strong className="font-semibold text-fg">{usd2(((valor - regalado) * 5) / 100)}</strong> en vez de {usd2((valor * 5) / 100)}.
          </li>
        </ul>
      </div>
      <Parrafo>Una venta de una vez cuenta completa en el mes en que se firma, aunque se cobre en partes.</Parrafo>
      <Parrafo>Un descuento de más del {UMBRAL_DE_APROBACION} % lo aprueba Marco en la propuesta, y queda quién y cuándo lo aprobó.</Parrafo>
    </>
  );
}

function CalculadoraDelDescuento() {
  const [primera, setPrimera] = useState(MARCO.primera);
  const [cerrado, setCerrado] = useState(MARCO.cerrado);
  const [tasa, setTasa] = useState<"3" | "4" | "5">("5");
  const cerradoReal = Math.min(cerrado, primera);
  const partes = { unico: 0, mensual: cerradoReal, descontado: (primera - cerradoReal) * MESES_DEL_VALOR };
  const porcentaje = Number(tasa);
  const antes = valorDeLaVenta(partes, true);
  const ahora = valorDeLaVenta(partes);
  const pideAprobacion = ahora.porcentajeDeDescuento > UMBRAL_DE_APROBACION;
  return (
    <>
      <Deslizador id="primera-propuesta" etiqueta="Primera propuesta, al mes" valor={primera} texto={usd(primera)} min={500} max={10000} step={100} onCambio={setPrimera} />
      <Deslizador id="lo-cerrado" etiqueta="Lo que se cerró al mes" valor={cerradoReal} texto={usd(cerradoReal)} min={0} max={primera} step={50} onCambio={setCerrado} />
      <Segmentado
        etiqueta="Tasa del mes"
        valor={tasa}
        onCambio={setTasa}
        opciones={TRAMOS_DE_VENTA.map((t) => ({ clave: String(t.porcentaje) as "3" | "4" | "5", etiqueta: `${t.porcentaje} %` }))}
      />
      <div className="grid grid-cols-3 gap-3">
        <Cifra rotulo={`Valor de ${MESES_DEL_VALOR} meses`} valor={usd(ahora.valor)} />
        <Cifra rotulo="Descontado" valor={usd(partes.descontado)} />
        <Cifra rotulo="Cuenta para la meta" valor={usd(ahora.paraLaMeta)} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface px-3.5 py-3">
          <span className={ROTULO_DEL_SISTEMA}>Hoy</span>
          <span className="text-[22px] font-bold leading-7 tabular-nums text-fg-muted">{usd2((antes.base * porcentaje) / 100)}</span>
          <span className="text-xs leading-4 text-fg-muted">
            {porcentaje} % de {usd(antes.base)}: el descuento no se nota en la comisión.
          </span>
        </div>
        <div className="flex flex-col gap-1 rounded-lg border border-info-line bg-surface px-3.5 py-3">
          <span className={ROTULO_DEL_SISTEMA}>Con el modelo</span>
          <span className="text-[22px] font-bold leading-7 tabular-nums text-fg">{usd2((ahora.base * porcentaje) / 100)}</span>
          <span className="text-xs leading-4 text-fg-muted">
            {porcentaje} % de {usd(ahora.base)}: {usd(ahora.valor)} menos los {usd(partes.descontado)} descontados.
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Pildora tono={pideAprobacion ? "atencion" : "neutra"}>{pideAprobacion ? "Lo aprueba Marco" : "Sin aprobación"}</Pildora>
        <span className="text-[13px] text-fg-secondary">
          {`Bajó un ${String(Math.round(ahora.porcentajeDeDescuento * 10) / 10).replace(".", ",")} % desde la primera propuesta. `}
          {pideAprobacion ? `Pasa el ${UMBRAL_DE_APROBACION} %: lo aprueba Marco en la propuesta.` : `Hasta el ${UMBRAL_DE_APROBACION} % no hace falta aprobarlo.`}
        </span>
      </div>
    </>
  );
}

// ── 7 · Si una venta se cae ─────────────────────────────────────────────────────

function CaidasTexto() {
  return (
    <>
      <Parrafo>
        Si el cliente cancela en sus primeros {DIAS_PARA_CAERSE} días, la venta se resta del mes en que se firmó. El porcentaje de ese mes se vuelve a calcular y
        la diferencia se descuenta de las próximas comisiones. Nunca se pide dinero de vuelta.
      </Parrafo>
      <Parrafo>Vale igual para un servicio mensual que se cancela en ese plazo, y para Ventas y Customer Success.</Parrafo>
    </>
  );
}

/** Un mes con una meta de 30.000: vendió 32.000 y una venta de 6.000 se cae a los 40 días. */
function EjemploDeCaida() {
  const vendido = 32000;
  const caida = 6000;
  const antes = porcentajeDelCumplimiento(vendido / META_DE_EJEMPLO);
  const despues = porcentajeDelCumplimiento((vendido - caida) / META_DE_EJEMPLO);
  const pagado = (vendido * antes) / 100;
  const correcto = ((vendido - caida) * despues) / 100;
  return (
    <>
      <span className={ROTULO_DEL_SISTEMA}>Un ejemplo, con una meta de {usd(META_DE_EJEMPLO)}</span>
      <ul className="flex flex-col gap-1.5 text-[13px] leading-[19px] text-fg-secondary">
        <li>
          · Vendió {usd(vendido)} en el mes: {antes} % de todo, {usd(pagado)}.
        </li>
        <li>· A los 40 días se cae una venta de {usd(caida)}.</li>
        <li>
          · El mes queda en {usd(vendido - caida)}: {despues} % de todo, {usd(correcto)}.
        </li>
      </ul>
      <div className="grid grid-cols-2 gap-3">
        <Cifra rotulo="Se descuenta" valor={usd(pagado - correcto)} />
        <Cifra rotulo="De dónde" valor="Las próximas" />
      </div>
      <span className="text-xs leading-4 text-fg-muted">Si ya se cobró la comisión de esa venta, también sale; si no, simplemente no se paga.</span>
    </>
  );
}

// ── Los techos (solo Super Admin) ──────────────────────────────────────────────

function Techos() {
  return (
    <section aria-labelledby="techos" className="space-y-3 rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="techos" className="text-base font-semibold text-fg">
          Techos
        </h2>
        <span className={cn(CLASE_DE_PILDORA, PILDORA.neutra)}>Solo lo ve Super Admin</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Bloque
          rotulo="Quienes atienden al cliente"
          valor={`Hasta el ${TECHOS.quienesAtienden} %`}
          nota="De los servicios vendidos: quien vende, Customer Success y quien lidera, con bonos y renovaciones."
        />
        <Bloque rotulo="En total" valor={`Hasta el ${TECHOS.total} %`} nota="De los servicios vendidos, para dejar espacio a otros roles. Sin contar licencias." />
      </div>
      <p className="text-[13px] leading-[19px] text-fg-secondary">
        Se mide cada trimestre. Si se pasa, se ajusta la versión siguiente del modelo; nunca se recorta lo ya ganado. La simulación lo mide con las ventas del año.
      </p>
    </section>
  );
}
