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
import { useState } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { FUENTES_VIVAS, type FuenteViva } from "@/lib/documentacion/tipos";
import { iniciales } from "@/lib/documentacion/equipo";
import { useVivos } from "../ContextoDeVivos";
import { IconoCandado } from "../iconos";
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
  equipo: "El equipo, por área",
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

  if (fuente === "equipo") {
    return (
      <div className="grid gap-5">
        {datos.equipo.map((g) => (
          <section key={g.area}>
            <h3 className="mb-2 text-sm font-semibold text-fg">
              {g.area} <span className="text-2xs font-normal text-fg-muted">· {g.personas.length}</span>
            </h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {g.personas.map((p) => (
                <li
                  key={p.correo ?? p.nombre}
                  className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3"
                >
                  {p.foto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.foto} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold text-fg-secondary"
                    >
                      {iniciales(p.nombre)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-fg">{p.nombre}</p>
                    <p className="truncate text-xs text-fg-muted">
                      {p.rol}
                      {p.correo && (
                        <>
                          {p.rol ? " · " : ""}
                          <a href={`mailto:${p.correo}`} className="hover:text-fg">
                            {p.correo}
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
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

/**
 * Cómo se ve el bloque MIENTRAS SE EDITA: plegado, con su nombre y el motivo.
 *
 * Desplegado mide más de mil píxeles, y con esa altura la manija de arrastre de BlockNote —que se
 * ancla arriba del bloque— queda lejísimos del cursor: para moverlo o sacarlo había que subir
 * hasta el tope y el menú se escapaba al bloque de al lado en el camino. Plegado entra en un
 * renglón, así que la manija y el «+» quedan a mano. Y de paso dice lo que no se ve: que eso no se
 * escribe, se arma solo.
 */
function VivoPlegado({ fuente }: { fuente: FuenteViva }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="my-2 rounded-lg border border-line bg-surface-muted">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2">
        <IconoCandado className="h-3.5 w-3.5 shrink-0 text-fg-muted" />
        <span className="text-sm font-medium text-fg">{ETIQUETAS_DE_FUENTE[fuente]}</span>
        <span className="text-xs text-fg-muted">Se arma solo desde Nexus · no se escribe a mano</span>
        <button
          type="button"
          /* Sin esto, el clic mueve el cursor del editor antes de llegar al botón y el bloque
             queda seleccionado por sorpresa. */
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setAbierto((v) => !v)}
          className="ml-auto rounded-md border border-line bg-surface px-2 py-0.5 text-xs text-fg-secondary transition-colors hover:text-fg"
        >
          {abierto ? "Ocultar" : "Ver cómo queda"}
        </button>
      </div>
      {abierto && (
        <div className="border-t border-line px-3 py-3">
          <Contenido fuente={fuente} />
        </div>
      )}
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
          {editor.isEditable ? <VivoPlegado fuente={fuente} /> : <Contenido fuente={fuente} />}
        </div>
      );
    },
  },
);
