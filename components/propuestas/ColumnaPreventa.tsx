"use client";

/**
 * components/propuestas/ColumnaPreventa.tsx — la cuarta columna del contexto de la propuesta
 * (2026-10-05, unión con Preventa).
 *
 * La MISMA columna que el contexto del handoff (components/clients/ExploracionDeVentaColumn.tsx),
 * con lo que es propio de la propuesta: se puede proponer con o sin preventa, así que la columna
 * está SIEMPRE (en el handoff se esconde si no hay), y ofrece las preventas de la empresa para usar
 * una. Tres estados:
 *   · la usa      — el resumen (estimado, metas, casos de uso) y «Dejar de usarla»;
 *   · hay sin usar — cada preventa de la empresa con «Usar»;
 *   · ninguna     — la propuesta se arma igual, con HubSpot y las reuniones.
 */
import Link from "next/link";
import { ContextColumnList, ContextRow, CTX_ICONS } from "@/components/clients/context-column";
import { ExploracionDeVentaResumen, type ResumenDeLaExploracion } from "@/components/clients/ExploracionDeVentaColumn";
import { fechaDeVentas } from "@/lib/business-cases/estado-de-la-propuesta";

export interface PreventaDisponible {
  id: string;
  responsable: string | null;
  actualizadaEn: string;
  areas: string[];
  lista: { cumplidos: number; total: number } | null;
}

export interface PreventaDeLaPropuesta {
  exploracionId: string | null;
  usada: ResumenDeLaExploracion | null;
  disponibles: PreventaDisponible[];
}

const meta = (p: PreventaDisponible) =>
  [p.responsable && `La lleva ${p.responsable}`, fechaDeVentas(p.actualizadaEn)].filter(Boolean).join(" · ");
const snippet = (p: PreventaDisponible) =>
  [p.areas.join(" y "), p.lista && `${p.lista.cumplidos} de ${p.lista.total} para proponer`].filter(Boolean).join(" · ");

export default function ColumnaPreventa({
  datos,
  empresa,
  puedeEditar,
  ocupado,
  onUsar,
}: {
  datos: PreventaDeLaPropuesta | null;
  empresa: string;
  puedeEditar: boolean;
  ocupado: boolean;
  onUsar: (exploracionId: string | null) => void;
}) {
  if (!datos) return <ContextColumnList loading empty="">{[]}</ContextColumnList>;

  const enUso = datos.exploracionId ? datos.disponibles.find((p) => p.id === datos.exploracionId) : undefined;
  const otras = datos.disponibles.filter((p) => p.id !== datos.exploracionId);

  if (datos.exploracionId) {
    return (
      <div className="space-y-2">
        <ul className="space-y-1.5">
          <ContextRow
            icon={CTX_ICONS.note}
            meta={enUso ? meta(enUso) : "Preventa"}
            title={`Preventa de ${empresa}`}
            snippet={enUso ? snippet(enUso) : undefined}
            badge={{ label: "En uso", tone: "green" }}
          />
        </ul>
        {datos.usada ? (
          <ExploracionDeVentaResumen datos={datos.usada} alDocumento="a la propuesta" />
        ) : (
          <p className="text-[11px] text-fg-muted">No se pudo leer lo confirmado en la preventa (¿la escala no está publicada?). La propuesta se genera igual.</p>
        )}
        {puedeEditar && (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => onUsar(null)}
            className="text-[11px] text-fg-muted transition-colors hover:text-fg disabled:opacity-40"
          >
            Dejar de usarla
          </button>
        )}
        {otras.length > 0 && (
          <p className="text-[11px] text-fg-muted">
            {empresa} tiene {otras.length === 1 ? "otra preventa" : `${otras.length} preventas más`}: deja de usar esta para elegir otra.
          </p>
        )}
      </div>
    );
  }

  if (datos.disponibles.length > 0) {
    return (
      <div className="space-y-2">
        <p className="text-[11px] leading-4 text-fg-muted">
          {empresa} tiene {datos.disponibles.length === 1 ? "una preventa sin usar" : `${datos.disponibles.length} preventas sin usar`}. Úsala y el agente lee lo confirmado allí: metas, retos y nivel estimado.
        </p>
        <ContextColumnList empty="">
          {datos.disponibles.map((p) => (
            <ContextRow
              key={p.id}
              icon={CTX_ICONS.note}
              meta={meta(p)}
              title={`Preventa de ${empresa}`}
              snippet={snippet(p) || undefined}
              badge={{ label: "Sin usar", tone: "muted" }}
              dim
              action={puedeEditar ? { label: "Usar", onClick: () => onUsar(p.id), disabled: ocupado } : undefined}
            />
          ))}
        </ContextColumnList>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p className="py-3 text-center text-[11px] leading-4 text-fg-muted">
        {empresa} no pasó por Preventa. La propuesta se arma igual, con HubSpot y las reuniones.
      </p>
      <Link href="/sales/exploraciones" className="block text-center text-[11px] font-semibold text-brand hover:text-brand-dark">
        Abrir una preventa
      </Link>
    </div>
  );
}
