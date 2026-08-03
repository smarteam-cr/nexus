/**
 * components/manual/Agentes.tsx — el catálogo de agentes, en lenguaje de negocio.
 *
 * Las categorías salen del MISMO criterio que usa `/agents` (`AGENT_CATEGORIES` +
 * `categorizeAgent`), para que las dos pantallas no puedan contar historias distintas del mismo
 * agente. Por eso NO se reagrupan por documento, aunque acá se vea la tentación.
 */
import { anclaDeAgente, anclaDeDocumento } from "@/lib/manual/anclas";
import { INTRO_AGENTES } from "@/lib/manual/contenido";
import type { AgenteDoc, CategoriaDeAgentes } from "@/lib/manual/armar";
import { Badge, EmptyState } from "@/components/ui";
import { Bloque, Pildora, PildoraLink, Seccion } from "./Piezas";

function Agente({ a }: { a: AgenteDoc }) {
  return (
    <article
      id={anclaDeAgente(a.id)}
      tabIndex={-1}
      className="scroll-mt-24 rounded-lg border border-line bg-surface p-4"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h4 className="text-sm font-medium text-fg">{a.nombre}</h4>
        {!a.activo && <Badge variant="default">Inactivo</Badge>}
      </div>
      {a.descripcion && (
        <p className="text-xs text-fg-secondary leading-relaxed mt-1 max-w-prose">{a.descripcion}</p>
      )}
      <div className="flex flex-wrap gap-1.5 mt-2.5">
        <Pildora>Se dispara desde: {a.disparo}</Pildora>
        {a.escribeEn && a.escribeEnSlug && (
          <PildoraLink href={`#${anclaDeDocumento(a.escribeEnSlug)}`}>
            Escribe en: {a.escribeEn}
          </PildoraLink>
        )}
      </div>
    </article>
  );
}

export default function Agentes({ categorias }: { categorias: CategoriaDeAgentes[] }) {
  return (
    <Seccion id="agentes" titulo="Los agentes">
      <Bloque b={INTRO_AGENTES} />

      {categorias.length === 0 ? (
        <EmptyState
          title="Todavía no hay agentes configurados"
          description="El catálogo se llena cuando se siembran los agentes del flujo. Si estás viendo esto en producción, avisá — la pantalla está bien, faltan los datos."
        />
      ) : (
        categorias.map((c) => (
          <section key={c.key} className="mb-8">
            <h3 className="text-sm font-semibold text-fg">{c.label}</h3>
            <p className="text-xs text-fg-muted mt-0.5 mb-3 max-w-prose">{c.description}</p>
            <div className="grid gap-3">
              {c.agentes.map((a) => (
                <Agente key={a.id} a={a} />
              ))}
            </div>
          </section>
        ))
      )}
    </Seccion>
  );
}
