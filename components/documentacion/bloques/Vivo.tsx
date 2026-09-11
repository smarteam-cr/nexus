"use client";

/**
 * components/documentacion/bloques/Vivo.tsx — el bloque que se actualiza solo.
 *
 * No guarda contenido: guarda una FUENTE. Lo que se ve sale de los registros del código y de la
 * base, calculado en el servidor al abrir la página. Por eso el menú, las etapas, los documentos,
 * los agentes, HubSpot y los roles no pueden quedar viejos en la documentación: cuando alguien
 * agrega un canvas o cambia una etapa, esta parte lo refleja sin que nadie edite nada.
 *
 * En edición se muestra un rótulo explicando justamente eso, porque un bloque que no se puede
 * escribir tiene que decir por qué.
 */
import { createReactBlockSpec } from "@blocknote/react";
import { FUENTES_VIVAS, type FuenteViva } from "@/lib/documentacion/tipos";
import { useVivos } from "../ContextoDeVivos";
import Recorrido from "@/components/manual/Recorrido";
import Documentos from "@/components/manual/Documentos";
import Agentes from "@/components/manual/Agentes";
import HubSpot from "@/components/manual/HubSpot";

export const ETIQUETAS_DE_FUENTE: Record<FuenteViva, string> = {
  menu: "El menú, sección por sección",
  recorrido: "El recorrido de un proyecto",
  documentos: "Los documentos de un proyecto",
  agentes: "Los agentes de IA",
  hubspot: "Los pipelines y las propiedades de HubSpot",
  roles: "Los roles del equipo",
};

function Contenido({ fuente }: { fuente: FuenteViva }) {
  const datos = useVivos();

  if (!datos) {
    return (
      <p className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-sm text-fg-muted">
        Esta parte se arma sola desde Nexus. Recargá la página para verla.
      </p>
    );
  }

  if (fuente === "recorrido") {
    return <Recorrido etapas={datos.recorrido.etapas} corto={datos.recorrido.corto} />;
  }
  if (fuente === "documentos") return <Documentos docs={datos.documentos} />;
  if (fuente === "agentes") return <Agentes categorias={datos.agentes} />;
  if (fuente === "hubspot") {
    return (
      <HubSpot
        pipelines={datos.hubspot.pipelines}
        grupos={datos.hubspot.grupos}
        totalProps={datos.hubspot.totalProps}
      />
    );
  }

  if (fuente === "menu") {
    const grupos = [
      { clave: "operacion" as const, titulo: "Operación" },
      { clave: "administracion" as const, titulo: "Administración" },
    ];
    return (
      <div className="grid gap-6">
        {grupos.map((g) => (
          <section key={g.clave}>
            <h3 className="mb-2 text-sm font-semibold text-fg">{g.titulo}</h3>
            <ul className="grid gap-2">
              {datos.menu
                .filter((m) => m.grupo === g.clave)
                .map((m) => (
                  <li key={m.key} className="rounded-lg border border-line bg-surface p-3">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-medium text-fg">{m.label}</span>
                      <span className="text-2xs text-fg-muted">{m.quienLaVe}</span>
                    </div>
                    <p className="mt-0.5 max-w-prose text-sm leading-relaxed text-fg-secondary">
                      {m.queEs}
                    </p>
                    {m.hijas.length > 0 && (
                      <p className="mt-1 text-xs text-fg-muted">Adentro: {m.hijas.join(" · ")}</p>
                    )}
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {datos.roles.map((r) => (
        <div key={r.clave} className="rounded-lg border border-line bg-surface p-3">
          <p className="text-sm font-medium text-fg">{r.nombre}</p>
          <p className="mt-0.5 max-w-prose text-sm leading-relaxed text-fg-secondary">{r.queHace}</p>
          <p className="mt-1 text-xs text-fg-muted">Toca: {r.secciones.join(" · ")}</p>
        </div>
      ))}
      <p className="text-xs text-fg-muted">
        Éstos son los permisos de fábrica. La dirección los ajusta por rol y por persona en Equipo.
      </p>
    </div>
  );
}

export const bloqueVivo = createReactBlockSpec(
  {
    type: "vivo",
    propSchema: {
      fuente: { default: "menu", values: [...FUENTES_VIVAS] },
    },
    content: "none",
  },
  {
    render: ({ block, editor }) => {
      const fuente = (block.props.fuente as FuenteViva) ?? "menu";
      return (
        <div className="my-3" data-fuente-viva={fuente}>
          {editor.isEditable && (
            <p className="mb-1 text-2xs uppercase tracking-wide text-fg-muted">
              {ETIQUETAS_DE_FUENTE[fuente]} · se actualiza solo desde Nexus
            </p>
          )}
          <Contenido fuente={fuente} />
        </div>
      );
    },
  },
);
