"use client";

/**
 * «Cómo funciona» — la propuesta de comisiones explicada con calculadoras chicas, no con el documento copiado. Los números
 * salen de las mismas reglas que la simulación (lib/finanzas/modelo-comisiones/reglas.ts): si cambia una regla, cambia
 * la explicación. Los ejemplos (una meta de 30.000, una licencia de 621) son los de la propuesta.
 */
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { BotonEnlace, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import {
  BONO_DEL_LIDER,
  LICENCIA,
  MESES_DE_VENTAS,
  PORCENTAJE_DE_CUSTOMER_SUCCESS,
  TRAMOS_DE_VENTA,
  baseDelBono,
  bonoTrimestral,
  comisionDeLicencia,
  porcentajeDelCumplimiento,
} from "@/lib/finanzas/modelo-comisiones/reglas";
import { CLASE_DE_PILDORA, PILDORA, usd, usd2 } from "./formato";

const META_DE_EJEMPLO = 30000;

/**
 * Solo las preguntas que tiene que responder Marco, cada una con el contexto para responderla sin leer el documento.
 * Lo que se decidió en la reunión del 2026-10-15 va al pie, en «Ya decidido».
 */
const DECISIONES: { pregunta: string; contexto: string[]; enLaSimulacion?: boolean }[] = [
  {
    pregunta: "¿El 3 % corre por debajo del 50 % de la meta o por debajo del 60 %?",
    contexto: [
      "Esta propuesta dice 50 %. La oferta que se le mandó a Liz dice 60 %: por debajo del 60 %, 3 %; entre el 60 y el 100 %, 4 %; por encima de la meta, 5 %.",
      "Las dos tienen que decir lo mismo. Con 60 %, alguien que llega al 55 % de su meta gana el 3 % en vez del 4 %.",
    ],
  },
  {
    pregunta: "¿El bono de quien lidera deja de crecer en el 200 % o en el 150 %?",
    contexto: [
      "La comisión de quien vende no tiene tope: el tope es solo del bono de quien lidera. En la reunión se habló de un tope del vendedor que no existe.",
      "Con Liz y una meta de US$ 30.000 al mes: Liz al 120 % gana US$ 1.800. Andrés, si llega a su meta, gana US$ 1.500 de comisión más US$ 600 de bono: US$ 2.100. Liz gana más que Andrés cuando pasa el 150 % de su meta, con cualquiera de los dos topes. El tope solo limita cuánto suma el bono.",
    ],
    enLaSimulacion: true,
  },
  {
    pregunta: "Durante la rampa de Liz, ¿su meta cuenta completa para el bono de Andrés?",
    contexto: [
      "En la reunión se dijo que sí, completa. Con el mínimo del 70 %, Andrés cobra algo recién cuando Liz vende US$ 21.000 en un mes (US$ 63.000 en el trimestre).",
      "La oferta de Liz dice que su meta de US$ 30.000 corre completa recién al cerrar el mes 3. Su meta personal y la que usa el bono de Andrés serían distintas en esos meses.",
    ],
    enLaSimulacion: true,
  },
  {
    pregunta: "¿Está bien que Alex y Andrés tengan reglas distintas para el bono?",
    contexto: [
      "Las ventas propias de Andrés le dan comisión, pero no cuentan para su bono: el bono sale solo de lo que vende Liz. A Alex, en cambio, lo que vende él mismo sí le cuenta para su bono de expansión.",
      "Puede ser a propósito: Andrés tiene meta de vendedor y Alex no. Conviene confirmarlo.",
    ],
  },
  {
    pregunta: "¿Cuál es la meta de expansión de Alex, y cuánto vale su bono?",
    contexto: [
      "Alex gana el bono por la meta de expansión de la cartera, que todavía no existe. La idea es calcularla con lo que se les vendió a los clientes que ya tenemos en el último año, más un crecimiento razonable.",
      "Su equipo además crece: Alejandro pasa a reportarle a Alex. Si se usa la misma regla que con Andrés (US$ 500 al mes por persona), hay que decidir por quiénes cobra.",
    ],
  },
  {
    pregunta: "¿Cuánto es lo máximo que se paga de comisiones y bonos?",
    contexto: [
      "En la reunión se habló de un 7 % y de un 10 %. La lectura es que son dos techos: hasta el 7 % de lo vendido para quienes atienden al cliente (quien vende, Customer Success y quien lidera) y hasta el 10 % en total, para dejar espacio al resto, como los BDR.",
      "Con Liz en su meta: 5 % de comisión más el bono de Andrés (US$ 500 sobre US$ 30.000, un 1,7 %) suman 6,7 %. Falta decidir si las licencias entran en esos techos.",
    ],
  },
  {
    pregunta: "Si una venta se cae en sus primeros 3 meses, ¿qué pasa con la comisión?",
    contexto: [
      "Como la comisión se paga cuando el cliente paga, ya no se adelanta. Pero la venta caída ayudó a subir el porcentaje de las demás ventas de su mes, y en la reunión se pidió una consecuencia para quien vende humo.",
      "Propuesta: esa venta se resta de la meta del mes en que se firmó, se recalcula el porcentaje de las demás y la diferencia se descuenta de las próximas comisiones. Vale igual para Ventas y Customer Success, y se revisa qué pasó solo si la persona lo pide. Ejemplo: alguien que llegó al 105 % gracias a una venta que después se cae baja al 4 % en todo ese mes.",
    ],
  },
  {
    pregunta: "¿Cuál es la meta de ventas de la empresa?",
    contexto: [
      "En la reunión se habló de vender entre US$ 80.000 y 90.000 al mes, para cubrir el punto de equilibrio con margen. De ahí salen las metas de cada persona.",
      "Los montos de la simulación dependen de esas metas: hoy son las que hay en HubSpot.",
    ],
  },
  {
    pregunta: "¿Quién puede ver esta página?",
    contexto: [
      "Hoy la ve solo Super Admin. La idea es usarla para alinear a Andrés, Alex y Liz, pero la simulación muestra lo que vendió cada persona.",
      "Una opción: que cada persona vea la explicación y su propia simulación, y nada de las demás.",
    ],
  },
];

export default function ComoFunciona({ onSimular }: { onSimular: () => void }) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="max-w-[860px] text-sm leading-[22px] text-fg-secondary">
          Quien vende gana un porcentaje de todo lo que vende en el mes, y ese porcentaje es más alto mientras más cerca está de su meta. Las licencias se
          pagan aparte. Customer Success gana un porcentaje fijo de lo que les vende a los clientes que ya tenemos, y quien lidera un equipo gana un bono
          por cada persona que llega a su meta. Todo se paga cuando el cliente paga.
        </p>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Resumen
            rotulo="Quien vende"
            valor={TRAMOS_DE_VENTA.map((t) => t.porcentaje).join(" · ") + " %"}
            nota="De todo lo que vende en el mes. Mientras más cerca de su meta, más alto el porcentaje."
          />
          <Resumen
            rotulo="Licencias"
            valor={`${LICENCIA.porcentaje} % × ${LICENCIA.meses} meses`}
            nota={`El ${LICENCIA.porcentaje} % del valor mensual, por los primeros ${LICENCIA.meses} meses. Solo las que trae Smarteam.`}
          />
          <Resumen
            rotulo="Customer Success"
            valor={`${PORCENTAJE_DE_CUSTOMER_SUCCESS} % fijo`}
            nota={`De lo que le vende a un cliente que ya tenemos, pasados sus primeros ${MESES_DE_VENTAS} meses.`}
          />
          <Resumen
            rotulo="Quien lidera"
            valor={`${usd(BONO_DEL_LIDER.porPersonaAlMes)} al mes por persona`}
            nota={`Por cada persona de su equipo que llega a su meta. Se cobra desde el ${BONO_DEL_LIDER.minimo * 100} % y se paga cada trimestre.`}
          />
        </div>
        <p className="text-[13px] leading-[19px] text-fg-secondary">
          Este esquema reemplaza todas las condiciones de comisión y bonos anteriores. Las ventas firmadas antes de que entre en vigor se pagan con las
          condiciones de entonces.
        </p>
      </div>

      <Seccion numero={1} titulo="La comisión por venta" texto={<ComisionPorVentaTexto />}>
        <CalculadoraDeVenta />
      </Seccion>

      <Seccion numero={2} titulo="A quién le cuenta cada venta" texto={<AQuienTexto />}>
        <AQuienCaja />
      </Seccion>

      <Seccion
        numero={3}
        titulo="Licencias"
        texto={
          <>
            <Parrafo>Se paga el {LICENCIA.porcentaje} % del valor mensual durante {LICENCIA.meses} meses, aunque el cliente pague el año entero.</Parrafo>
            <Parrafo>Comisionan solo las licencias que trae Smarteam. Las oportunidades que refiere HubSpot no comisionan.</Parrafo>
            <Parrafo>Se pagan juntas cada trimestre, cuando HubSpot ya le pagó a Smarteam: así no salen de la caja antes de que entre la plata.</Parrafo>
          </>
        }
      >
        <CalculadoraDeLicencia />
      </Seccion>

      <Seccion numero={4} titulo="El bono de quien lidera" texto={<BonoTexto />}>
        <CalculadoraDeBono />
      </Seccion>

      <section aria-labelledby="como-se-paga" className="space-y-3.5 rounded-xl border border-line bg-surface p-5">
        <TituloNumerado numero={5} id="como-se-paga">Cuándo se paga</TituloNumerado>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Paso rotulo="Se firma">La venta cuenta para la meta de ese mes. Es lo que controla quien vende.</Paso>
          <Paso rotulo="El cliente paga">Si el proyecto se cobra en partes, la comisión también se paga en partes.</Paso>
          <Paso rotulo="El mes siguiente">Se paga la comisión, con el porcentaje del mes en que se firmó.</Paso>
          <Paso rotulo="Al cerrar el trimestre">El mes siguiente se paga el bono de quien lidera, y las licencias del trimestre cuando HubSpot ya pagó.</Paso>
        </div>
        <p className="text-xs leading-4 text-fg-muted">
          El esquema se revisa en un año, o antes si Smarteam ya tiene el margen de cada proyecto, para pasar a pagar sobre la utilidad y no sobre la venta. Un
          cambio nunca toca ventas ya firmadas.
        </p>
      </section>

      <section aria-labelledby="falta-decidir" className="space-y-3.5 rounded-xl border border-warn-line bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="falta-decidir" className="text-base font-semibold text-fg">Lo que falta decidir con Marco</h2>
          <BotonEnlace onClick={onSimular}>Probar las decisiones en la simulación →</BotonEnlace>
        </div>
        <ol>
          {DECISIONES.map((d, i) => (
            <li key={d.pregunta} className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-start gap-3 border-b border-line py-3 first:pt-0 last:border-b-0 last:pb-0">
              <Numero>{i + 1}</Numero>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-sm font-semibold text-fg">{d.pregunta}</span>
                {d.contexto.map((c) => (
                  <p key={c} className="max-w-[860px] text-[13px] leading-[19px] text-fg-secondary">
                    {c}
                  </p>
                ))}
              </div>
              <span className={cn(CLASE_DE_PILDORA, d.enLaSimulacion ? PILDORA.info : PILDORA.atencion)}>{d.enLaSimulacion ? "Se prueba en la simulación" : "Abierta"}</span>
            </li>
          ))}
        </ol>
        <div className="space-y-1 border-t border-line pt-3 text-xs leading-4 text-fg-muted">
          <p className="font-semibold text-fg-secondary">Ya decidido</p>
          <ul className="list-disc space-y-0.5 pl-4">
            <li>La meta es mensual y solo de servicios: las licencias no suman.</li>
            <li>Las licencias pagan sobre su valor, y se pagan cada trimestre, cuando HubSpot ya pagó.</li>
            <li>Cada CSE gana el 5 % fijo, sin meta ni bono. Si la venta es compartida con Ventas, 2,5 % cada uno.</li>
            <li>Pasados los 6 meses, la venta es de quien crea el negocio en HubSpot. Si se hace entre las dos áreas, 50 · 50.</li>
            <li>Las oportunidades que sugiere Nexus las ve todo el equipo, y son de quien las convierte en negocio.</li>
            <li>Quien lidera gana US$ 500 al mes por persona que llega a su meta, desde el 70 %.</li>
            <li>Desarrollo (conectores e integraciones) queda fuera de esta versión y se diseña aparte.</li>
          </ul>
        </div>
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

function TituloNumerado({ numero, id, children }: { numero: number; id: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <Numero>{numero}</Numero>
      <h2 id={id} className="text-base font-semibold text-fg">
        {children}
      </h2>
    </div>
  );
}

function Parrafo({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-[22px] text-fg-secondary">{children}</p>;
}

function Seccion({ numero, titulo, texto, children }: { numero: number; titulo: string; texto: ReactNode; children: ReactNode }) {
  const id = `seccion-${numero}`;
  return (
    <section aria-labelledby={id} className="grid grid-cols-1 gap-6 rounded-xl border border-line bg-surface p-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="flex flex-col gap-2">
        <TituloNumerado numero={numero} id={id}>
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
      <Parrafo>Tu porcentaje depende de cuánto de tu meta del mes alcanzaste, y se aplica a todo lo que vendiste ese mes. La meta es solo de servicios: las licencias no suman.</Parrafo>
      <Parrafo>Si pasas al tramo siguiente, el porcentaje nuevo vale para todo el mes, no solo para lo que vendiste después. Así llegar a la meta tiene premio. Cada venta cuenta el mes en que se firma.</Parrafo>
      <Parrafo>La comisión de quien vende no tiene tope: mientras más vendes, más ganas.</Parrafo>
      <div className="mt-1 flex flex-col gap-2 rounded-[10px] border border-line bg-surface-muted p-4">
        <span className={ROTULO_DEL_SISTEMA}>Personas nuevas</span>
        <p className="text-[13px] leading-[19px] text-fg-secondary">Los primeros 3 meses ganan un 5 % fijo mientras su meta sube por escalones. Desde el cuarto mes, la escala. Andrés entra directo a la escala.</p>
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
        etiqueta={`Prueba: lo que vendes en el mes, con una meta de ${usd(META_DE_EJEMPLO)}`}
        valor={ventas}
        texto={usd(ventas)}
        min={0}
        max={45000}
        step={100}
        onCambio={setVentas}
      />
      <div className="grid grid-cols-3 gap-3">
        <Cifra rotulo="Cumplimiento" valor={`${Math.round(cumplimiento * 100)} %`} />
        <Cifra rotulo="Porcentaje" valor={`${porcentaje} %`} />
        <Cifra rotulo="Comisión del mes" valor={usd(comision)} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {siguiente ? (
          <>
            <Pildora tono="atencion">Al siguiente tramo</Pildora>
            <span className="text-[13px] text-fg-secondary">
              Con {usd(falta)} más pasarías al {siguiente.porcentaje} % y ganarías {usd(ganaria)} más.
            </span>
          </>
        ) : (
          <>
            <Pildora tono="info">Tramo más alto</Pildora>
            <span className="text-[13px] text-fg-secondary">Todo lo del mes paga el {porcentaje} %.</span>
          </>
        )}
      </div>
    </>
  );
}

// ── 2 · A quién le cuenta ──────────────────────────────────────────────────────

function AQuienTexto() {
  return (
    <>
      <Parrafo>Ventas se queda con el cliente nuevo y con todo lo que se le venda en sus primeros {MESES_DE_VENTAS} meses: la primera venta suele ser chica y lo grande viene después.</Parrafo>
      <Parrafo>Pasados los {MESES_DE_VENTAS} meses, la expansión es de quien la convierte en negocio: quien habla con el cliente y crea el negocio en HubSpot. Ver la oportunidad no alcanza, porque Nexus se la sugiere a todo el equipo.</Parrafo>
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Bloque rotulo="Venta hecha entre las dos áreas" valor="50 · 50" nota="Cuando Customer Success suma a Ventas a propósito: 2,5 % para cada una. Vale para servicios y licencias." />
        <Bloque rotulo="Customer Success" valor={`${PORCENTAJE_DE_CUSTOMER_SUCCESS} % fijo`} nota="Para cada CSE, sin meta ni bono. Quien lidera Customer Success gana por bono, y si vende él mismo cobra también el porcentaje." />
      </div>
    </>
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

// ── 3 · Licencias ──────────────────────────────────────────────────────────────

function CalculadoraDeLicencia() {
  const [mensual, setMensual] = useState(621);
  const cuota = (mensual * LICENCIA.porcentaje) / 100;
  return (
    <>
      <Deslizador id="valor-licencia" etiqueta="Prueba: valor mensual de la licencia" valor={mensual} texto={usd(mensual)} min={50} max={3000} step={1} onCambio={setMensual} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface px-3.5 py-3">
          <span className={ROTULO_DEL_SISTEMA}>Lo que gana quien la vendió</span>
          <span className="text-[22px] font-bold leading-7 tabular-nums text-fg">{usd2(comisionDeLicencia(mensual))}</span>
          <span className="text-xs leading-4 text-fg-muted">
            {LICENCIA.porcentaje} % de {usd(mensual)} = {usd2(cuota)} por cada uno de los primeros {LICENCIA.meses} meses de la licencia.
          </span>
        </div>
        <div className="flex flex-col gap-1 rounded-lg border border-info-line bg-surface px-3.5 py-3">
          <span className={ROTULO_DEL_SISTEMA}>Cuándo se paga</span>
          <span className="text-[15px] font-semibold leading-[22px] text-fg">En un solo pago, cada trimestre</span>
          <span className="text-xs leading-4 text-fg-muted">Junto con las demás licencias del trimestre, cuando HubSpot ya le pagó a Smarteam su comisión.</span>
        </div>
      </div>
    </>
  );
}

// ── 4 · El bono de quien lidera ────────────────────────────────────────────────

function BonoTexto() {
  return (
    <>
      <Parrafo>
        Quien lidera gana {usd(BONO_DEL_LIDER.porPersonaAlMes)} al mes por cada persona de su equipo que llega a su meta, y se paga cada trimestre. Sus propias ventas le dan comisión, no bono.
      </Parrafo>
      <Parrafo>
        Si la persona no llega a la meta, el bono se cobra en proporción: desde el {BONO_DEL_LIDER.minimo * 100} % de cumplimiento, y deja de crecer en el {BONO_DEL_LIDER.tope * 100} %. Por debajo del{" "}
        {BONO_DEL_LIDER.minimo * 100} % no hay bono.
      </Parrafo>
      <dl className="mt-1 flex flex-col gap-1.5 text-[13px] leading-[19px] text-fg-secondary">
        <div className="flex justify-between gap-3">
          <dt>Andrés</dt>
          <dd>su comisión + el bono por Liz</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Alex</dt>
          <dd>el bono por la meta de expansión de la cartera</dd>
        </div>
      </dl>
    </>
  );
}

function CalculadoraDeBono() {
  const [personas, setPersonas] = useState(1);
  const [cumplimiento, setCumplimiento] = useState(100);
  const base = baseDelBono(personas);
  const bono = bonoTrimestral(base, cumplimiento / 100);
  const maximo = base * BONO_DEL_LIDER.tope;
  const bajo = cumplimiento < BONO_DEL_LIDER.minimo * 100;
  const tope = cumplimiento > BONO_DEL_LIDER.tope * 100;
  return (
    <>
      <Deslizador id="personas-lideradas" etiqueta="Prueba: cuántas personas lidera" valor={personas} texto={String(personas)} min={1} max={4} step={1} onCambio={setPersonas} />
      <Deslizador id="cumplimiento-equipo" etiqueta="Cuánto de su meta del trimestre cumplen" valor={cumplimiento} texto={`${cumplimiento} %`} min={0} max={250} step={5} onCambio={setCumplimiento} />
      <div className="grid grid-cols-2 gap-3">
        <Cifra rotulo="Bono del trimestre" valor={usd(bono)} />
        <Cifra rotulo="Al mes" valor={usd(bono / 3)} />
      </div>
      <span className="relative block h-2.5 overflow-hidden rounded-full bg-surface" aria-hidden>
        <span className="absolute inset-y-0 left-0 bg-brand" style={{ width: `${maximo > 0 ? Math.min(100, (bono / maximo) * 100) : 0}%` }} />
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {bajo ? (
          <>
            <Pildora tono="atencion">Bajo el mínimo</Pildora>
            <span className="text-[13px] text-fg-secondary">Con menos del {BONO_DEL_LIDER.minimo * 100} % de la meta no hay bono.</span>
          </>
        ) : tope ? (
          <>
            <Pildora tono="neutra">Con tope</Pildora>
            <span className="text-[13px] text-fg-secondary">
              Pasado el {BONO_DEL_LIDER.tope * 100} % el bono no crece: el máximo es {usd(maximo)} por trimestre.
            </span>
          </>
        ) : (
          <span className="text-[13px] text-fg-secondary">
            {usd(BONO_DEL_LIDER.porPersonaAlMes)} × 3 meses × {personas} {personas === 1 ? "persona" : "personas"} × {cumplimiento} %.
          </span>
        )}
      </div>
    </>
  );
}
