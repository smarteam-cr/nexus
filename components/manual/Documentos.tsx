/**
 * components/manual/Documentos.tsx — la ficha de cada documento del proyecto.
 *
 * Los diez bloques usan la MISMA plantilla de cuatro zonas —para qué sirve · cuándo lo abres ·
 * cómo se genera · qué trae— para que cada dato esté siempre en el mismo lugar. Ésa es la forma
 * barata de hacer comparables diez entidades homogéneas: una tabla aparte sería el mismo
 * contenido dos veces en la misma página.
 *
 * Las secciones NO van colapsadas. "¿Qué trae el kickoff?" es probablemente el dato que más se
 * viene a buscar, y detrás de un desplegable no lo alcanza ni el ojo ni el Ctrl+F del navegador
 * —que es el único buscador que esta pantalla necesita y va a tener—.
 */
import { anclaDeAgente, anclaDeDocumento } from "@/lib/manual/anclas";
import { INTRO_DOCUMENTOS, SIN_SECCIONES } from "@/lib/manual/contenido";
import type { DocumentoDoc } from "@/lib/manual/armar";
import { Pildora, PildoraLink, Seccion } from "./Piezas";

function Zona({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-2xs font-semibold uppercase tracking-wider text-fg-muted mb-1">{titulo}</p>
      {children}
    </div>
  );
}

function Documento({ d }: { d: DocumentoDoc }) {
  return (
    <article
      id={anclaDeDocumento(d.slug)}
      tabIndex={-1}
      className="scroll-mt-24 rounded-xl border border-line bg-surface p-5"
    >
      {/* La tira de un vistazo: los mismos datos, siempre en el mismo lugar, en los diez. */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5 mb-4">
        <h3 className="text-sm font-semibold text-fg">{d.nombre}</h3>
        <span className="text-xs text-fg-muted">{d.deQuien}</span>
        {d.etapa && <Pildora>Etapa: {d.etapa}</Pildora>}
        {d.etiquetas.map((e) => (
          <Pildora key={e}>{e}</Pildora>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Zona titulo="Para qué sirve">
          <p className="text-sm text-fg-secondary leading-relaxed">{d.paraQue}</p>
        </Zona>

        <Zona titulo="Cuándo lo abres">
          <p className="text-sm text-fg-secondary leading-relaxed">{d.cuando}</p>
        </Zona>

        <Zona titulo="Cómo se genera">
          {/* Ojo con la diferencia: `generadoPorId` es "tiene su botón en el encabezado del
              canvas" y `tieneAgente` es "lo escribe un agente". El handoff y el cronograma son
              lo segundo sin ser lo primero —su disparador vive en otro lugar de la pantalla—,
              así que mirar solo el botón los dejaría como si nadie los generara. */}
          {d.generadoPor && d.generadoPorId ? (
            <p className="text-sm text-fg-secondary leading-relaxed">
              Con el botón{" "}
              <PildoraLink href={`#${anclaDeAgente(d.generadoPorId)}`}>{d.generadoPor}</PildoraLink>{" "}
              del propio documento.
            </p>
          ) : d.tieneAgente ? (
            <p className="text-sm text-fg-secondary leading-relaxed">
              Lo escribe un agente, con su botón dentro de la pantalla del documento.
            </p>
          ) : (
            <p className="text-sm text-fg-secondary leading-relaxed">
              Se va llenando con el trabajo del equipo, no con un botón.
            </p>
          )}
        </Zona>

        <Zona titulo={d.secciones.length > 0 ? `Qué trae · ${d.secciones.length} secciones` : "Qué trae"}>
          {d.secciones.length > 0 ? (
            <ol className="grid gap-0.5 list-decimal list-inside">
              {d.secciones.map((s, i) => (
                <li key={`${s}-${i}`} className="text-xs text-fg-muted">
                  {s}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-fg-muted leading-relaxed">
              {SIN_SECCIONES[d.slug] ?? "Su contenido no se organiza en secciones fijas."}
            </p>
          )}
        </Zona>
      </div>
    </article>
  );
}

export default function Documentos({ docs }: { docs: DocumentoDoc[] }) {
  return (
    <Seccion id="documentos" titulo="Los documentos" intro={INTRO_DOCUMENTOS}>
      <div className="grid gap-4">
        {docs.map((d) => (
          <Documento key={d.slug} d={d} />
        ))}
      </div>
    </Seccion>
  );
}
