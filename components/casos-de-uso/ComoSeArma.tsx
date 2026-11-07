/**
 * components/casos-de-uso/ComoSeArma.tsx — en la ficha de un caso, cómo se arma (MVP de la biblioteca, 2026-11-04):
 * lo que se entrega, las actividades con sus horas, las horas y el precio de referencia, lo que necesitamos del cliente,
 * lo que no incluye, la guía para quien vende y lo que queda por decidir.
 *
 * Corto a propósito (Elías pidió algo mucho más chico que el documento): cada actividad es una línea y se abre para
 * ver qué se hace, cuándo cambia y cómo se cobra; las variantes, las preguntas y el resto de la guía van plegados.
 * Solo presentación y sin JS: los pliegues son <details>. Las actividades y las horas son internas: el cliente nunca
 * las ve.
 */
import { cn } from "@/lib/cn";
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { EnVinetas, EtiquetasDeLaFila, RepartoDelTiempo } from "@/components/casos-de-uso/FichaDeLaActividad";
import {
  comoSeCobra,
  filasPorEtapa,
  formatoHoras,
  formatoUsd,
  horasConElCliente,
  horasDeLaFila,
  lineaDeCasosAparte,
  lineasDeLoQueNoIncluye,
  loQueSePideAlCliente,
  sobreQueAparte,
  TARIFAS,
  textoDeSeQuita,
  tiempoDeLaFila,
  type ActividadDeLaBiblioteca,
  type ActividadesDelCaso,
  type FilaDelCaso,
  type LineaDeLoQueNoIncluye,
} from "@/lib/casos-de-uso/actividades";

const TARJETA = "flex flex-col gap-3 rounded-xl border border-line bg-surface p-5";
const LATERAL = "flex flex-col gap-2 rounded-xl border border-line bg-surface p-4";
const PLIEGUE = "cursor-pointer list-none [&::-webkit-details-marker]:hidden";

function Interno() {
  return <span className="rounded-full border border-line bg-surface-muted px-2 py-px text-[11px] font-medium text-fg-muted">Interno</span>;
}

function Flecha() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true" className="mt-1 flex-none text-fg-muted transition-transform group-open:rotate-90">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/**
 * La primera oración y el resto, para mostrar lo largo plegado. Corta solo en un punto, y si la primera oración queda
 * muy corta (un rótulo como «Licencia: …» termina en el punto siguiente), sigue hasta el próximo.
 */
function partir(texto: string): [string, string] {
  let i = texto.search(/\.\s/);
  while (i !== -1 && i < 40) {
    const j = texto.slice(i + 1).search(/\.\s/);
    i = j === -1 ? -1 : i + 1 + j;
  }
  return i === -1 || i > 260 ? [texto, ""] : [texto.slice(0, i + 1), texto.slice(i + 2)];
}

export function LoQueSeEntrega({ actividades }: { actividades: ActividadesDelCaso }) {
  const usoDelEquipo = new Set(actividades.usoDelEquipo);
  return (
    <section className={TARJETA}>
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold text-fg">Lo que se entrega</h2>
        <span className="text-xs text-fg-muted">Lo que ve el cliente en la propuesta. La última línea es la meta con su cifra.</span>
      </div>
      <ol className="flex flex-col gap-2">
        {actividades.loQueSeEntrega.map((l, i) => (
          <li key={i} className="flex gap-2.5 text-[13px] leading-5 text-fg">
            <span className="w-4 flex-none text-right tabular-nums text-fg-muted">{i + 1}.</span>
            <span>
              {l}
              {usoDelEquipo.has(i) && <span className="ml-1.5 whitespace-nowrap text-xs text-fg-muted">· depende de que su equipo lo use</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Fila({ f }: { f: FilaDelCaso }) {
  return (
    <details className="group border-b border-line last:border-b-0">
      <summary className={cn(PLIEGUE, "flex items-start gap-2 rounded-md px-1 py-2 text-[13px] leading-5 hover:bg-surface-hover")}>
        <Flecha />
        <span aria-hidden="true" className={cn("w-3 flex-none text-center", f.porDefecto ? "text-brand" : "text-fg-muted")}>
          {f.porDefecto ? "✓" : "+"}
        </span>
        <span className="sr-only">{f.porDefecto ? "Viene marcada:" : "Opcional:"}</span>
        <span className="min-w-0 flex-1">
          <span className={f.porDefecto ? "text-fg" : "text-fg-secondary"}>{f.nombre}</span>
          {sobreQueAparte(f) && <span className="text-fg-muted"> · sobre «{f.sobreQue}»</span>}
          {!f.quien.startsWith("CSE") && (
            <span className="ml-1.5 rounded-full border border-line px-1.5 py-px text-[11px] text-fg-muted">{f.quien}</span>
          )}
        </span>
        <span className={cn("flex-none tabular-nums", f.porDefecto ? "text-fg-secondary" : "text-fg-muted")}>{tiempoDeLaFila(f)}</span>
      </summary>
      <div className="flex flex-col gap-2 pb-3 pl-[46px] pr-2 text-[13px] leading-5 text-fg-secondary">
        <EtiquetasDeLaFila f={f} />
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-fg">Qué se hace</span>
          <EnVinetas texto={f.queSeHace} />
        </div>
        <RepartoDelTiempo partes={f.reparto} total={f.horasPorVez} />
        {f.cuandoCambia && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-fg">{f.porDefecto ? "Cuándo cambia" : "Cuándo se marca"}</span>
            <EnVinetas texto={f.cuandoCambia} />
          </div>
        )}
        <p className="text-xs text-fg-muted">
          {f.comparte === "sobreQue" && <>{comoSeCobra(f)} </>}
          {f.nombre !== f.actividad && <>En la biblioteca: «{f.actividad}».</>}
        </p>
      </div>
    </details>
  );
}

export function LasActividades({ actividades }: { actividades: ActividadesDelCaso }) {
  const etapas = filasPorEtapa(actividades);
  const marcadas = actividades.actividades.filter((f) => f.porDefecto).length;
  return (
    <section className={TARJETA}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex max-w-[560px] flex-col gap-0.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
            Las actividades <Interno />
          </h2>
          <span className="text-xs leading-[18px] text-fg-muted">
            Lo que hacemos para entregarlo. ✓ viene marcada; + la marca quien vende cuando aplica (lo extra). Abre una línea para ver qué se
            hace, cómo se reparte el tiempo y cuándo cambia.
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-lg font-semibold tabular-nums text-fg">{formatoHoras(actividades.horasPorDefecto)}</span>
          <span className="text-xs text-fg-muted">
            por defecto · {marcadas} de {actividades.actividades.length} marcadas
          </span>
        </div>
      </div>
      {actividades.escenarioBase && (
        <details className="group rounded-lg border border-line bg-surface-muted px-3 py-2">
          <summary className={cn(PLIEGUE, "flex items-start gap-2 text-xs text-fg-secondary")}>
            <Flecha />
            Sobre qué venta se cuentan estas horas
          </summary>
          <p className="mt-1.5 pl-5 text-xs leading-5 text-fg-secondary">{actividades.escenarioBase}</p>
        </details>
      )}
      <div className="flex flex-col gap-3">
        {etapas.map((e) => {
          const subtotal = e.filas.filter((f) => f.porDefecto).reduce((s, f) => s + horasDeLaFila(f), 0);
          return (
            <div key={e.clave} className="flex flex-col">
              <div className="flex items-baseline justify-between border-b border-line pb-1">
                <span className={ROTULO_DEL_SISTEMA}>{e.nombre}</span>
                <span className="text-xs tabular-nums text-fg-muted">{subtotal ? formatoHoras(subtotal) : "—"}</span>
              </div>
              {e.filas.map((f, i) => (
                <Fila key={i} f={f} />
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Renglon({ etiqueta, valor, fuerte }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13px]">
      <span className="text-fg-secondary">{etiqueta}</span>
      <span className={cn("tabular-nums", fuerte ? "font-semibold text-fg" : "text-fg-secondary")}>{valor}</span>
    </div>
  );
}

export function HorasYPrecio({ actividades }: { actividades: ActividadesDelCaso }) {
  const h = actividades.horasPorDefecto;
  const sinTiempo = actividades.actividades.some((f) => f.porDefecto && f.horasPendientes);
  const opcionalesSinTiempo = actividades.actividades.some((f) => !f.porDefecto && f.horasPendientes);
  return (
    <section className={LATERAL}>
      <span className={cn(ROTULO_DEL_SISTEMA, "flex items-center gap-2")}>
        Horas y precio de referencia <Interno />
      </span>
      <Renglon etiqueta="Por defecto" valor={formatoHoras(h)} fuerte />
      {(() => {
        const { conElCliente, internas } = horasConElCliente(actividades);
        return conElCliente + internas > 0 ? (
          <span className="-mt-1 text-xs text-fg-muted">
            {formatoHoras(conElCliente)} con el cliente · {formatoHoras(internas)} de trabajo interno
          </span>
        ) : null;
      })()}
      {actividades.horasJuntoConSuRequerido != null && (
        <Renglon etiqueta="Junto con lo que requiere" valor={formatoHoras(actividades.horasJuntoConSuRequerido)} />
      )}
      {actividades.horasOpcionales > 0 && (
        <Renglon
          etiqueta="Opcionales"
          valor={opcionalesSinTiempo ? `${formatoHoras(actividades.horasOpcionales)} más, sin Diseño ni Dev` : `hasta ${formatoHoras(actividades.horasOpcionales)} más`}
        />
      )}
      <div className="mt-1 flex flex-col gap-1 border-t border-line pt-2">
        {TARIFAS.map((t) => (
          <Renglon key={t.clave} etiqueta={`${t.nombre} · ${t.usdPorHora} USD/h`} valor={formatoUsd(h * t.usdPorHora)} />
        ))}
      </div>
      {actividades.periodo && <p className="text-xs leading-[18px] text-fg-secondary">{actividades.periodo}</p>}
      <p className="text-xs leading-[18px] text-fg-muted">
        Solo este caso{sinTiempo ? ", sin lo que define Diseño o Dev" : ""}. En corporativo y gobierno la venta suma sola las reuniones del contrato. Las licencias llegan en la fase 2.
      </p>
    </section>
  );
}

export function ParaQuienVende({ actividades, aviso }: { actividades: ActividadesDelCaso; aviso?: string }) {
  // El aviso del catálogo a veces repite la guía: si ya está adentro, no se muestra dos veces. Sin guía, el aviso es el texto.
  const guia = actividades.paraQuienVende.trim();
  const avisoAparte = aviso && !guia.includes(aviso.slice(0, 60)) ? aviso : "";
  const [primera, resto] = partir(guia || avisoAparte);
  if (!primera) return null;
  return (
    <section className={LATERAL}>
      <span className={cn(ROTULO_DEL_SISTEMA, "flex items-center gap-2")}>
        Para quien vende <Interno />
      </span>
      <details className="group">
        <summary className={cn(PLIEGUE, "flex items-start gap-1.5 text-[13px] leading-5 text-fg-secondary")}>
          <Flecha />
          <span>{primera}</span>
        </summary>
        {resto && <p className="mt-1.5 pl-[18px] text-[13px] leading-5 text-fg-secondary">{resto}</p>}
        {guia && avisoAparte && (
          <p className="mt-1.5 pl-[18px] text-[13px] leading-5 text-fg-secondary">
            <span className="font-medium text-fg">Antes de ofrecerlo: </span>
            {avisoAparte}
          </p>
        )}
      </details>
    </section>
  );
}

export function LoQueNecesitamosDeTi({
  actividades,
  biblioteca,
}: {
  actividades: ActividadesDelCaso;
  biblioteca: readonly Pick<ActividadDeLaBiblioteca, "nombre" | "pideAlCliente">[];
}) {
  const lineas = loQueSePideAlCliente(actividades, biblioteca);
  if (!lineas.length) return null;
  return (
    <section className={LATERAL}>
      <span className={ROTULO_DEL_SISTEMA}>Lo que necesitamos del cliente</span>
      <ul className="flex flex-col gap-1.5">
        {lineas.map((l, i) => (
          <li key={i} className="text-[13px] leading-5 text-fg-secondary">
            {l.texto}
            {l.de && <span className="block text-xs text-fg-muted">Lo pide «{l.de}».</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function LineaQueNoIncluye({ l }: { l: LineaDeLoQueNoIncluye }) {
  return (
    <li>
      {l.texto}
      {l.seQuitaCon.length > 0 && <span className="block text-xs text-fg-muted">{textoDeSeQuita(l.seQuitaCon)}</span>}
      {l.camino && <span className="block text-xs text-fg-muted">Solo por el camino de {l.camino === "insider" ? "Insider" : "HubSpot"}.</span>}
    </li>
  );
}

export function LoQueNoIncluye({ actividades, tituloDe }: { actividades: ActividadesDelCaso; tituloDe: (id: string) => string | undefined }) {
  // La fija va primero; después, los casos aparte, y luego lo que depende de lo que se marque.
  const lineas = lineasDeLoQueNoIncluye(actividades);
  const hayFija = !!actividades.loQueNoIncluye[0];
  const fijas = hayFija ? lineas.slice(0, 1) : [];
  const demas = hayFija ? lineas.slice(1) : lineas;
  const aparte = lineaDeCasosAparte(actividades.casosAparte, tituloDe);
  return (
    <section className={LATERAL}>
      <span className={ROTULO_DEL_SISTEMA}>Lo que no incluye</span>
      <ul className="flex flex-col gap-1.5 text-[13px] leading-5 text-fg-secondary">
        {fijas.map((l, i) => (
          <LineaQueNoIncluye key={`fija-${i}`} l={l} />
        ))}
        {aparte && <li>{aparte}</li>}
        {demas.map((l, i) => (
          <LineaQueNoIncluye key={i} l={l} />
        ))}
      </ul>
    </section>
  );
}

export function PorDecidir({ actividades }: { actividades: ActividadesDelCaso }) {
  const { preguntas, variantes } = actividades;
  if (!preguntas.length && !variantes.length) return null;
  return (
    <section className={TARJETA}>
      {preguntas.length > 0 && (
        <details className="group" open>
          <summary className={cn(PLIEGUE, "flex items-start gap-2 text-sm font-semibold text-fg")}>
            <Flecha />
            Por decidir · {preguntas.length}
          </summary>
          <ol className="mt-2 flex flex-col gap-2 pl-5">
            {preguntas.map((p, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-5 text-fg-secondary">
                <span className="flex-none tabular-nums text-fg-muted">{i + 1}.</span>
                <span>{p}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
      {variantes.length > 0 && (
        <details className={cn("group", preguntas.length > 0 && "border-t border-line pt-3")}>
          <summary className={cn(PLIEGUE, "flex items-start gap-2 text-sm font-semibold text-fg")}>
            <Flecha />
            Variantes · {variantes.length}
            <span className="font-normal text-fg-muted">— cuando la venta no es la de por defecto</span>
          </summary>
          <dl className="mt-2 flex flex-col gap-2.5 pl-5">
            {variantes.map((v, i) => (
              <div key={i} className="flex flex-col gap-0.5 text-[13px] leading-5">
                <dt className="font-medium text-fg">{v.nombre}</dt>
                <dd className="text-fg-secondary">{v.cambia}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </section>
  );
}
