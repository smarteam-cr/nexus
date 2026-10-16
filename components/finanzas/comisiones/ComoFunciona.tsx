"use client";

/**
 * «Cómo funciona» — la propuesta de comisiones explicada con calculadoras chicas, no con el documento copiado. Los números
 * salen de las mismas reglas que la simulación (lib/finanzas/modelo-comisiones/reglas.ts): si cambia una regla, cambia
 * la explicación. Los ejemplos (una meta de 30.000, una licencia de 621) son los de la propuesta.
 */
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Segmentado } from "@/components/ui";
import { BotonEnlace, IconoDeSugerencia, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import {
  BONO_DEL_LIDER,
  BONO_DE_CUSTOMER_SUCCESS,
  LICENCIA,
  MESES_DE_VENTAS,
  PORCENTAJE_DE_CUSTOMER_SUCCESS,
  TRAMOS_DE_VENTA,
  baseDelBono,
  bonoDeCustomerSuccessAlCien,
  bonoTrimestral,
  comisionDeLicencia,
  porcentajeDelCumplimiento,
} from "@/lib/finanzas/modelo-comisiones/reglas";
import { CLASE_DE_PILDORA, PILDORA, usd, usd2 } from "./formato";

const META_DE_EJEMPLO = 30000;

/** Lo que le cuesta a Smarteam con todos en la meta: la comisión más alta y el bono del líder sobre esa meta. */
const COSTO_EN_VENTAS = TRAMOS_DE_VENTA[TRAMOS_DE_VENTA.length - 1].porcentaje + (BONO_DEL_LIDER.porPersonaAlMes / META_DE_EJEMPLO) * 100;
const COSTO_EN_CUSTOMER_SUCCESS = PORCENTAJE_DE_CUSTOMER_SUCCESS + BONO_DE_CUSTOMER_SUCCESS.porcentajeDeLaMeta;
const ESCALERA = BONO_DE_CUSTOMER_SUCCESS.escalera;
const BASE = BONO_DE_CUSTOMER_SUCCESS.base;

function pct1(n: number): string {
  return `${n.toLocaleString("es-CR", { maximumFractionDigits: 1 })} %`;
}

/**
 * Solo las preguntas que tiene que responder Marco, cada una con el contexto para responderla sin leer el documento y
 * con lo que recomienda Nexus (lo escribió la IA con lo que se sabe de Smarteam y de cómo pagan otras empresas de
 * servicios B2B: por eso va marcado). Lo que ya se decidió en la reunión del 2026-10-15 va en su propio bloque.
 */
const DECISIONES: { pregunta: string; contexto: string[]; recomendacion: { que: string; porque: string }; enLaSimulacion?: boolean }[] = [
  {
    pregunta: "¿El 3 % corre por debajo del 50 % de la meta o por debajo del 60 %?",
    contexto: [
      "Esta propuesta dice 50 %. La oferta que se le mandó a Liz dice 60 %: por debajo del 60 %, 3 %; entre el 60 y el 100 %, 4 %; por encima de la meta, 5 %.",
      "Con 60 %, un mes al 55 % paga el 3 % en vez del 4 %. Por ejemplo, julio de Andrés (58 %).",
    ],
    recomendacion: {
      que: "50 % para todos, y corregir la oferta de Liz antes de que firme.",
      porque: "Las metas todavía se están ajustando: un piso más bajo evita castigar un mes normal. En los planes por tramos, el piso más común está alrededor del 50 %. Lo importante es que la oferta y esta página digan lo mismo.",
    },
  },
  {
    pregunta: "¿El bono de quien lidera deja de crecer en el 200 % o en el 150 %?",
    contexto: [
      "La comisión de quien vende no tiene tope: el tope es solo del bono de quien lidera.",
      "Con Liz al 120 % de una meta de US$ 30.000, Liz gana US$ 1.800 y Andrés, si llega a su meta, US$ 1.500 de comisión más US$ 600 de bono. Liz gana más que Andrés cuando pasa el 150 %, con cualquiera de los dos topes.",
    ],
    recomendacion: {
      que: "150 %.",
      porque: "Arriba del 150 % casi siempre hay una venta excepcional, no más trabajo de quien lidera (kölbi fueron US$ 108.000 en un mes). El tope evita que una sola venta dispare el bono, y quien vende la sigue cobrando completa.",
    },
    enLaSimulacion: true,
  },
  {
    pregunta: "Durante la rampa de Liz, ¿su meta cuenta completa para el bono de Andrés?",
    contexto: [
      "En la reunión se dijo que sí, completa. Con el mínimo del 70 %, Andrés cobra algo recién cuando Liz vende US$ 21.000 en un mes (US$ 63.000 en el trimestre).",
      "La oferta de Liz dice que su meta de US$ 30.000 corre completa recién al cerrar el mes 3. Su meta personal y la que usa el bono de Andrés serían distintas en esos meses.",
    ],
    recomendacion: {
      que: "Que el bono use la misma meta de Liz, con su rampa.",
      porque: "Una sola meta por persona, la de HubSpot. Si Liz cumple su rampa, Andrés hizo bien su parte de acompañarla. Con la meta completa desde el mes 1, Andrés casi no cobraría justo cuando más tiempo le dedica. La meta propia de Andrés no cambia.",
    },
    enLaSimulacion: true,
  },
  {
    pregunta: "¿Está bien que Alex y Andrés tengan reglas distintas para el bono?",
    contexto: [
      "Andrés gana por cada vendedor que llega a su meta, y sus propias ventas no cuentan para su bono. Alex gana un monto fijo si toda el área llega a su meta, y lo que vende él sí cuenta.",
    ],
    recomendacion: {
      que: "Sí, y decirlo así de claro.",
      porque: "Andrés tiene meta propia y cobra comisión por lo que vende: si además le contara para el bono, ganaría dos veces por la misma venta. Alex no tiene meta de vendedor: lo que vende él es parte de la expansión del área, que es justo lo que mide su bono.",
    },
  },
  {
    pregunta: "¿Cuánto es lo máximo que se paga de comisiones y bonos?",
    contexto: [
      "En la reunión se habló de un 7 % y de un 10 %. Pueden ser dos techos: hasta el 7 % de lo vendido para quienes atienden al cliente (quien vende, Customer Success y quien lidera) y hasta el 10 % en total, para dejar espacio al resto, como los BDR.",
      "Con Liz en su meta: 5 % de comisión más el bono de Andrés (US$ 500 sobre US$ 30.000, un 1,7 %) suman 6,7 %. Con el área de Alex en su meta: 5 % de los CSE más su bono (2 %) suman 7 %.",
    ],
    recomendacion: {
      que: "7 % y 10 % sobre los servicios vendidos, con las licencias fuera. Se mide cada trimestre y, si se pasa, se ajusta la versión siguiente: nunca se recorta lo ya ganado.",
      porque: "Las licencias se pagan con lo que HubSpot le paga a Smarteam, así que no salen de la venta. Recortar comisiones ya ganadas genera desconfianza. En empresas B2B, lo que cuesta vender (sueldos incluidos) suele quedar entre el 7 y el 13 % de los ingresos.",
    },
  },
  {
    pregunta: "Si una venta se cae poco después de firmarse, ¿qué pasa con la comisión?",
    contexto: [
      "Como la comisión se paga cuando el cliente paga, ya no se adelanta. Pero la venta caída ayudó a subir el porcentaje de las demás ventas de su mes, y en la reunión se pidió una consecuencia para quien vende humo.",
      "Ejemplo: alguien que llegó al 105 % gracias a una venta que después se cae, en realidad estuvo en el 4 % ese mes.",
    ],
    recomendacion: {
      que: "Si el cliente cancela en sus primeros 90 días, la venta se resta del mes en que se firmó, se recalcula el porcentaje de las demás y la diferencia se descuenta de las próximas comisiones. Igual para Ventas y Customer Success. Se revisa qué pasó solo si la persona lo pide.",
      porque: "Es lo más común en ventas B2B: una ventana corta (90 días o menos) y un descuento sobre comisiones futuras, nunca pedir plata de vuelta. Con ventanas más largas la comisión nunca se siente segura.",
    },
  },
  {
    pregunta: "¿Cuál es la meta de ventas de la empresa?",
    contexto: [
      "En la reunión se habló de vender entre US$ 80.000 y 90.000 al mes, para cubrir el punto de equilibrio con margen. De ahí salen las metas de cada persona.",
      "Hoy las metas de octubre en HubSpot suman unos US$ 67.000: faltan las de Liz y la de expansión.",
    ],
    recomendacion: {
      que: "Que la meta de la empresa sea la suma de las metas de cada persona más la de expansión, y que nunca quede por debajo de dos veces el punto de equilibrio.",
      porque: "Así cada meta individual tiene un porqué, y la simulación puede mostrar si la suma alcanza. Es la regla que dio Marco: con un equilibrio de US$ 40.000, vender al menos US$ 80.000.",
    },
  },
  {
    pregunta: "¿Quién puede ver esta página?",
    contexto: [
      "Hoy la ve solo Super Admin. La idea es usarla para alinear a Andrés, Alex y Liz, pero la simulación muestra lo que vendió y ganaría cada persona.",
    ],
    recomendacion: {
      que: "«Cómo funciona», todo el equipo comercial. «Simulación», cada persona solo lo suyo. Super Admin, todo.",
      porque: "La explicación es la misma para todos y conviene que la lean. Lo que vende y gana cada persona es privado, como un salario.",
    },
  },
];

/** Lo que se decidió en la reunión de Elías y Marco del 2026-10-15. */
const YA_DECIDIDO = [
  "La meta es mensual y solo de servicios: las licencias no suman.",
  "Las licencias pagan sobre su valor, y se pagan cada trimestre, cuando HubSpot ya pagó.",
  "Cada CSE gana el 5 % fijo, sin meta ni bono. Si la venta es compartida con Ventas, 2,5 % cada uno.",
  "Pasados los 6 meses, la venta es de quien crea el negocio en HubSpot. Si se hace entre las dos áreas, 50 · 50.",
  "Las oportunidades que sugiere Nexus las ve todo el equipo, y son de quien las convierte en negocio.",
  "Andrés gana US$ 500 al mes por cada vendedor que llega a su meta, desde el 70 %.",
  "Las renovaciones de contrato no cuentan para la meta de Customer Success: renovar no es crecer.",
  "La comisión de quien vende no tiene tope.",
  "Desarrollo (conectores e integraciones) queda fuera de esta versión y se diseña aparte.",
];

export default function ComoFunciona({ onSimular }: { onSimular: () => void }) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="space-y-1">
          <p className="text-[15px] leading-6 text-fg">
            Quien vende se lleva una parte de lo que vendió. Si llega a su meta del mes, esa parte es más grande. Quien lidera un equipo gana un bono
            cuando su equipo llega a la meta.
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
            nota={`El ${PORCENTAJE_DE_CUSTOMER_SUCCESS} % de lo que un CSE le vende a un cliente actual. Siempre el mismo, sin meta.`}
          />
          <Resumen
            rotulo="Bono de liderazgo"
            valor="Por trimestre"
            nota={`Si su equipo llega a la meta. Andrés: ${usd(BONO_DEL_LIDER.porPersonaAlMes)} al mes por cada vendedor. Alex: el ${BONO_DE_CUSTOMER_SUCCESS.porcentajeDeLaMeta} % de la meta del área.`}
          />
        </div>
        <div className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-xl border border-line bg-surface px-4 py-3 md:grid-cols-3">
          <Dato rotulo="Aplica a">Ventas (Andrés y Liz) y Customer Success (los CSE y Alex). Marco queda fuera.</Dato>
          <Dato rotulo="Rige desde">Por definir con Marco. Reemplaza las condiciones anteriores; lo vendido antes se paga como se acordó entonces.</Dato>
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

      <Seccion
        numero={3}
        titulo="Asignación de ventas"
        bajada={`Ventas los primeros ${MESES_DE_VENTAS} meses; después, quien crea el negocio`}
        texto={<AQuienTexto />}
      >
        <AQuienCaja />
      </Seccion>

      <Seccion
        numero={4}
        titulo="Comisión de Customer Success"
        bajada={`${PORCENTAJE_DE_CUSTOMER_SUCCESS} % fijo de la expansión, sin meta individual`}
        texto={<CustomerSuccessTexto />}
      >
        <CalculadoraDeCustomerSuccess />
      </Seccion>

      <Seccion numero={5} titulo="Bono de liderazgo" bajada="Por el cumplimiento del equipo, no por las ventas propias" texto={<BonoTexto />}>
        <CalculadoraDeBono />
      </Seccion>

      <section aria-labelledby="como-se-paga" className="space-y-3.5 rounded-xl border border-line bg-surface p-5">
        <TituloNumerado numero={6} id="como-se-paga" bajada="La comisión se paga cuando el cliente paga">
          Calendario de pago
        </TituloNumerado>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Paso rotulo="1 · El cliente firma">La venta cuenta para la meta de quien vendió, en ese mes.</Paso>
          <Paso rotulo="2 · El cliente paga">Si paga por partes, la comisión también se paga por partes.</Paso>
          <Paso rotulo="3 · Al mes siguiente">Se paga la comisión, con el porcentaje del mes en que firmó.</Paso>
          <Paso rotulo="Trimestral">Se pagan los bonos de liderazgo y las comisiones por licencias.</Paso>
        </div>
        <p className="text-xs leading-4 text-fg-muted">
          En un año se revisa el esquema, para empezar a pagar sobre lo que gana Smarteam y no sobre lo que vende. Un cambio nunca toca lo que ya se vendió.
        </p>
      </section>

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

      <section aria-labelledby="falta-decidir" className="space-y-4 rounded-xl border border-warn-line bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 id="falta-decidir" className="text-base font-semibold text-fg">
              Decisiones pendientes
            </h2>
            <span className="text-xs leading-4 text-fg-muted">
              Para cerrar con Marco. A la derecha, lo que recomienda Nexus con lo que se sabe de Smarteam y de cómo pagan otras empresas de servicios B2B.
            </span>
          </div>
          <BotonEnlace onClick={onSimular}>Probar las decisiones en la simulación →</BotonEnlace>
        </div>
        <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] gap-4 border-b border-line pb-2 lg:grid">
          <span className={cn(ROTULO_DEL_SISTEMA, "pl-9")}>La pregunta</span>
          <span className={cn(ROTULO_DEL_SISTEMA, "text-info-ink")}>Lo que recomienda Nexus</span>
        </div>
        <ol>
          {DECISIONES.map((d, i) => (
            <li key={d.pregunta} className="grid grid-cols-1 gap-3 border-b border-line py-4 first:pt-0 last:border-b-0 last:pb-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-4">
              <div className="grid grid-cols-[24px_minmax(0,1fr)] items-start gap-3">
                <Numero>{i + 1}</Numero>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-sm font-semibold text-fg">{d.pregunta}</span>
                  {d.contexto.map((c) => (
                    <p key={c} className="text-[13px] leading-[19px] text-fg-secondary">
                      {c}
                    </p>
                  ))}
                  {d.enLaSimulacion && <span className={cn(CLASE_DE_PILDORA, PILDORA.info, "self-start")}>Se prueba en la simulación</span>}
                </div>
              </div>
              <div className="flex flex-col gap-1.5 rounded-[10px] border border-info-line bg-info-surface p-3.5">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-info-ink lg:hidden">
                  <IconoDeSugerencia className="h-3.5 w-3.5" />
                  Lo que recomienda Nexus
                </span>
                <span className="flex gap-1.5 text-[13px] font-semibold leading-[19px] text-fg">
                  <IconoDeSugerencia className="mt-0.5 hidden h-4 w-4 flex-none text-brand lg:block" />
                  {d.recomendacion.que}
                </span>
                <p className="text-[13px] leading-[19px] text-fg-secondary">{d.recomendacion.porque}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
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
        <li>· Más de la mitad: <strong className="font-semibold text-fg">4 %</strong>.</li>
        <li>· La meta o más: <strong className="font-semibold text-fg">5 %</strong>.</li>
      </ul>
      <Parrafo>No hay tope: mientras más vende, más gana. Solo cuentan los servicios; las licencias van aparte.</Parrafo>
      <div className="mt-1 flex flex-col gap-2 rounded-[10px] border border-line bg-surface-muted p-4">
        <span className={ROTULO_DEL_SISTEMA}>Si recién entra</span>
        <p className="text-[13px] leading-[19px] text-fg-secondary">Sus primeros 3 meses se lleva el 5 %, pase lo que pase, mientras aprende.</p>
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

// ── 3 · Asignación de ventas ──────────────────────────────────────────────────────

function AQuienTexto() {
  return (
    <>
      <Parrafo>
        Cuando un cliente le compra a Smarteam por primera vez, Ventas lo acompaña {MESES_DE_VENTAS} meses: todo lo que se le venda en ese tiempo es de Ventas.
      </Parrafo>
      <Parrafo>Después, la venta es de quien la convierte en negocio en HubSpot. Casi siempre es Customer Success. Si la hacen juntos, se reparten la comisión mitad y mitad.</Parrafo>
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
      <Bloque rotulo="Venta compartida" valor="Mitad y mitad" nota="Cuando Ventas y Customer Success la hacen juntos, cada área se lleva la mitad de la comisión. Vale igual para las licencias." />
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

// ── 4 · Customer Success ───────────────────────────────────────────────────────

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
        vendían Marco y Andrés; desde este esquema, Customer Success. Las renovaciones de contrato no cuentan ({usd(BASE.renovacionesFuera)} en ese período).
      </Parrafo>
      <Parrafo>Si Alex vende solo, también se lleva el {PORCENTAJE_DE_CUSTOMER_SUCCESS} %. Si un CSE vende junto con Ventas, cada uno se lleva la mitad.</Parrafo>
    </>
  );
}

function CalculadoraDeCustomerSuccess() {
  const [venta, setVenta] = useState(5000);
  const [modo, setModo] = useState<"solo" | "compartida">("solo");
  const porcentaje = modo === "solo" ? PORCENTAJE_DE_CUSTOMER_SUCCESS : PORCENTAJE_DE_CUSTOMER_SUCCESS / 2;
  return (
    <>
      <Segmentado
        etiqueta="Cómo se vendió"
        valor={modo}
        onCambio={setModo}
        opciones={[
          { clave: "solo", etiqueta: "Solo el CSE" },
          { clave: "compartida", etiqueta: "Junto con Ventas" },
        ]}
      />
      <Deslizador id="venta-de-expansion" etiqueta="Venta a un cliente actual" valor={venta} texto={usd(venta)} min={500} max={30000} step={100} onCambio={setVenta} />
      <div className="grid grid-cols-2 gap-3">
        <Cifra rotulo="Tasa aplicada" valor={`${porcentaje.toLocaleString("es-CR")} %`} />
        <Cifra rotulo="Comisión del CSE" valor={usd((venta * porcentaje) / 100)} />
      </div>
      <EscaleraDeLaMeta />
    </>
  );
}

// ── 2 · Licencias ──────────────────────────────────────────────────────────────

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

// ── 5 · Bono de liderazgo ────────────────────────────────────────────────

function BonoTexto() {
  return (
    <>
      <Parrafo>Quien lidera gana cuando a su equipo le va bien. No por sus propias ventas: por las de su equipo.</Parrafo>
      <div className="mt-1 grid grid-cols-1 gap-2">
        <div className="flex flex-col gap-1 rounded-[10px] border border-line bg-surface-muted p-3.5">
          <span className={ROTULO_DEL_SISTEMA}>Andrés · Ventas</span>
          <span className="text-[13px] leading-[19px] text-fg-secondary">
            Cada vendedor de su equipo tiene su meta. Por cada uno que llega, Andrés gana {usd(BONO_DEL_LIDER.porPersonaAlMes)} al mes. Lo que vende él le da
            comisión, como a cualquier vendedor.
          </span>
        </div>
        <div className="flex flex-col gap-1 rounded-[10px] border border-line bg-surface-muted p-3.5">
          <span className={ROTULO_DEL_SISTEMA}>Alex · Customer Success</span>
          <span className="text-[13px] leading-[19px] text-fg-secondary">
            Su equipo tiene una sola meta de expansión por trimestre, que sube por escalones: de {usd(ESCALERA[0].meta)} a{" "}
            {usd(ESCALERA[ESCALERA.length - 1].meta)}. Si llegan, Alex gana el {BONO_DE_CUSTOMER_SUCCESS.porcentajeDeLaMeta} % de esa meta. No depende de cuántos
            CSE tiene a cargo, y lo que vende él también cuenta.
          </span>
        </div>
      </div>
      <Parrafo>
        Si el equipo no llega, el bono se paga en proporción, desde el {BONO_DEL_LIDER.minimo * 100} % de la meta. Menos que eso, no hay bono. Y deja de crecer en
        el {BONO_DEL_LIDER.tope * 100} %.
      </Parrafo>
    </>
  );
}

function CalculadoraDeBono() {
  const [quien, setQuien] = useState<"ventas" | "cs">("ventas");
  const [personas, setPersonas] = useState(1);
  const [trimestre, setTrimestre] = useState<"0" | "1" | "2" | "3">("0");
  const [cumplimiento, setCumplimiento] = useState(100);
  const metaDelArea = ESCALERA[Number(trimestre)].meta;
  const base = quien === "ventas" ? baseDelBono(personas) : bonoDeCustomerSuccessAlCien(metaDelArea);
  const bono = bonoTrimestral(base, cumplimiento / 100);
  const maximo = base * BONO_DEL_LIDER.tope;
  const bajo = cumplimiento < BONO_DEL_LIDER.minimo * 100;
  const tope = cumplimiento > BONO_DEL_LIDER.tope * 100;
  return (
    <>
      <Segmentado
        etiqueta="Quién lidera"
        valor={quien}
        onCambio={setQuien}
        opciones={[
          { clave: "ventas", etiqueta: "Andrés · Ventas" },
          { clave: "cs", etiqueta: "Alex · Customer Success" },
        ]}
      />
      {quien === "ventas" ? (
        <Deslizador id="personas-lideradas" etiqueta="Vendedores a cargo" valor={personas} texto={String(personas)} min={1} max={4} step={1} onCambio={setPersonas} />
      ) : (
        <>
          <Segmentado
            etiqueta="Trimestre"
            valor={trimestre}
            onCambio={setTrimestre}
            opciones={ESCALERA.map((_, i) => ({ clave: String(i) as "0" | "1" | "2" | "3", etiqueta: `T${i + 1}` }))}
          />
          <span className="text-[13px] text-fg-secondary">
            Meta del área: {usd(metaDelArea)}. Al llegar, el bono es {usd(base)}. No depende de cuántos CSE tiene a cargo: la meta es del área.
          </span>
        </>
      )}
      <Deslizador
        id="cumplimiento-equipo"
        etiqueta={quien === "ventas" ? "Cumplimiento del equipo" : "Cumplimiento de la meta del área"}
        valor={cumplimiento}
        texto={`${cumplimiento} %`}
        min={0}
        max={250}
        step={5}
        onCambio={setCumplimiento}
      />
      <div className="grid grid-cols-2 gap-3">
        <Cifra rotulo="Bono del trimestre" valor={usd(bono)} />
        <Cifra rotulo="Equivalente mensual" valor={usd(bono / 3)} />
      </div>
      <span className="relative block h-2.5 overflow-hidden rounded-full bg-surface" aria-hidden>
        <span className="absolute inset-y-0 left-0 bg-brand" style={{ width: `${maximo > 0 ? Math.min(100, (bono / maximo) * 100) : 0}%` }} />
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {bajo ? (
          <>
            <Pildora tono="atencion">No alcanza</Pildora>
            <span className="text-[13px] text-fg-secondary">Con menos del {BONO_DEL_LIDER.minimo * 100} % de la meta no hay bono.</span>
          </>
        ) : tope ? (
          <>
            <Pildora tono="neutra">Llegó al tope</Pildora>
            <span className="text-[13px] text-fg-secondary">Pasado el {BONO_DEL_LIDER.tope * 100} % el bono ya no crece: lo máximo son {usd(maximo)}.</span>
          </>
        ) : (
          <span className="text-[13px] text-fg-secondary">
            {usd(base)} si llegan a la meta × {cumplimiento} % que llegaron.
          </span>
        )}
      </div>
    </>
  );
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
          Con la propuesta
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block w-5 border-t-2 border-dashed border-fg-muted" />
          Hoy, con el 5 % fijo
        </span>
      </figcaption>
    </figure>
  );
}
