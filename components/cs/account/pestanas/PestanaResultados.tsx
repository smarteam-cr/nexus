"use client";

/**
 * components/cs/account/pestanas/PestanaResultados.tsx — «Resultados» (rediseño del 2026-10-05):
 * lo que el cliente necesita alcanzar, como se prometió en el handoff de cada proyecto. Una tarjeta
 * por resultado con cómo se mide, línea base → meta, plazo, quién lo necesita y lo que lo frena.
 *
 * El avance hacia la meta NO se mide en Nexus todavía: la pestaña lo dice en vez de inventarlo.
 */
import Link from "next/link";
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import type { CsAccountData } from "@/lib/cs/load-account";
import { Chip, TituloDeSeccion } from "../../piezas";
import { TextoConFormato } from "@/components/clients/TextoConFormato";
import { fmtDia } from "@/lib/cs/formato";


/**
 * Lo que persigue la EMPRESA (2026-10-09, entrega 6 del plan de la cartera): lo confirmado en Información del
 * cliente, que también vive en la empresa de HubSpot. Arriba de los resultados de cada proyecto: la cuenta se
 * entiende por lo que busca el cliente, no por un proyecto.
 */
function LoQuePersigueLaEmpresa({ data }: { data: CsAccountData }) {
  const e = data.empresa;
  if (!e) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line bg-surface px-6 py-5 text-center">
        <b className="text-sm font-semibold text-fg">Todavía no hay nada confirmado de la empresa</b>
        <span className="max-w-[520px] text-[13px] text-fg-muted">
          Los resultados, los retos y el dolor principal se confirman en Información del cliente; de ahí van a HubSpot.
        </span>
        <Link href={`/clients/${data.clientId}`} className="text-xs font-semibold text-brand hover:text-brand-light">
          Abrir Información del cliente →
        </Link>
      </div>
    );
  }
  const bloques = [
    { titulo: "Resultados que persigue", texto: e.resultados },
    { titulo: "Retos estratégicos", texto: e.retos },
    { titulo: "Dolor principal", texto: e.dolor },
  ].filter((b) => b.texto.trim());
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4" data-recorrido="cs.empresa">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {bloques.map((b) => (
          <div key={b.titulo} className="flex min-w-0 flex-col gap-1.5">
            <span className={ROTULO_DEL_SISTEMA}>{b.titulo}</span>
            <TextoConFormato texto={b.texto} className="text-[13px] text-fg" />
          </div>
        ))}
      </div>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2 text-xs text-fg-muted">
        <span>
          Información del cliente{e.confirmadaAt ? ` · confirmada el ${fmtDia(e.confirmadaAt.slice(0, 10), data.hoy)}` : ""}
          {e.confirmadaPor ? ` por ${e.confirmadaPor}` : ""} · también en la empresa de HubSpot
        </span>
        {e.hayPropuesta && <Chip tono="ia">Hay una propuesta sin revisar</Chip>}
        <Link href={`/clients/${data.clientId}`} className="font-semibold text-brand hover:text-brand-light">
          Abrir →
        </Link>
      </span>
    </div>
  );
}

export default function PestanaResultados({ data }: { data: CsAccountData }) {
  const confirmados = data.resultados.filter((r) => r.confirmado).length;
  const porValidar = data.resultados.filter((r) => r.porValidar).length;
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <TituloDeSeccion titulo="Lo que persigue la empresa" ayuda="Lo confirmado en Información del cliente: vale para todos sus proyectos y vive también en la empresa de HubSpot." />
        <LoQuePersigueLaEmpresa data={data} />
      </section>

      <TituloDeSeccion
        titulo="Resultados de cada proyecto"
        ayuda="Lo que se prometió en el handoff, con cómo se mide, su línea base, su meta y su plazo. Es de lo que se habla en la reunión de valor."
        derecha={
          data.resultados.length > 0 ? (
            <>
              {confirmados > 0 && <Chip tono="confirmado">{confirmados} {confirmados === 1 ? "confirmado" : "confirmados"}</Chip>}
              {porValidar > 0 && <Chip tono="atencion">{porValidar} por validar</Chip>}
              <Link
                href={`/clients/${data.clientId}`}
                className="rounded-md border border-line bg-surface px-2.5 py-[5px] text-xs font-medium text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
              >
                Confirmarlos en la ficha del cliente →
              </Link>
            </>
          ) : undefined
        }
      />

      {data.resultados.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line bg-surface px-6 py-6 text-center">
          <b className="text-sm font-semibold text-fg">Todavía no hay resultados medibles</b>
          <span className="max-w-[520px] text-[13px] text-fg-muted">
            Salen del handoff de cada proyecto. Al generarlo o releerlo, aparecen acá con su línea base, su meta y su plazo.
          </span>
        </div>
      ) : (
        data.resultados.map((r) => (
          <article key={`${r.proyecto}-${r.id}`} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <span className="flex min-w-0 items-start gap-2.5">
                <span className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-[7px] border border-line bg-surface-muted text-[11px] font-bold text-fg-secondary">
                  {r.id}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[14.5px] font-semibold leading-[21px] text-fg">{r.resultado}</span>
                  <span className="text-xs text-fg-muted">{[r.quienLoNecesita ? `Lo necesita: ${r.quienLoNecesita}` : null, r.proyecto].filter(Boolean).join(" · ")}</span>
                </span>
              </span>
              {r.porValidar ? <Chip tono="atencion">Por validar</Chip> : r.confirmado ? <Chip tono="confirmado">✓ Confirmado</Chip> : <Chip>Sin confirmar</Chip>}
            </div>
            <div className="grid grid-cols-1 items-center gap-3 border-t border-line pt-3 sm:grid-cols-[minmax(0,1.4fr)_130px_24px_130px_140px]">
              <span className="flex flex-col gap-0.5">
                <span className={ROTULO_DEL_SISTEMA}>Cómo se mide</span>
                <span className="text-[13px] text-fg-secondary">{r.metrica || <span className="text-fg-muted">sin definir</span>}</span>
              </span>
              <span className="flex flex-col gap-0.5">
                <span className={ROTULO_DEL_SISTEMA}>Línea base</span>
                {r.lineaBase ? (
                  <span className="text-sm font-semibold tabular-nums text-fg">{r.lineaBase}</span>
                ) : (
                  <span className="text-[13px] text-warn-ink">falta la línea base</span>
                )}
              </span>
              <span aria-hidden className="hidden text-center text-lg text-fg-muted sm:block">
                →
              </span>
              <span className="flex flex-col gap-0.5">
                <span className={ROTULO_DEL_SISTEMA}>Meta</span>
                <span className="text-sm font-semibold tabular-nums text-fg">{r.meta || <span className="font-normal text-fg-muted">por definir</span>}</span>
              </span>
              <span className="flex flex-col gap-0.5">
                <span className={ROTULO_DEL_SISTEMA}>Plazo</span>
                <span className="text-[13px] text-fg">{r.plazo || <span className="text-fg-muted">sin plazo</span>}</span>
              </span>
            </div>
            {r.retos.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className={ROTULO_DEL_SISTEMA}>Lo que lo frena</span>
                {r.retos.map((x) => (
                  <span key={x} className="text-xs text-fg-secondary">
                    · {x}
                  </span>
                ))}
              </div>
            )}
          </article>
        ))
      )}

      {data.resultados.length > 0 && (
        <p className="rounded-xl border border-dashed border-line bg-surface px-4 py-3.5 text-[13px] text-fg-muted">
          El avance hacia cada meta todavía no se mide en Nexus: hoy se ve la línea base y la meta. El número de hoy se anota en la reunión de valor.
        </p>
      )}
    </div>
  );
}
