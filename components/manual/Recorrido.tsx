/**
 * components/manual/Recorrido.tsx — el recorrido de un proyecto, derivado del motor de etapas.
 *
 * Cada etapa enlaza al documento que la cierra: es el salto que antes había que hacer de memoria
 * entre dos pestañas que nunca se veían juntas.
 */
import { anclaDeDocumento } from "@/lib/manual/anclas";
import { INTRO_RECORRIDO } from "@/lib/manual/contenido";
import { armarRecorrido, armarCicloCorto, type EtapaDoc } from "@/lib/manual/armar";
import { Bloque, Pildora, PildoraLink, Seccion } from "./Piezas";

function Etapa({ e, total }: { e: EtapaDoc; total: number }) {
  return (
    <li className="relative pl-9 pb-6 last:pb-0">
      {/* La línea que une las etapas. Decorativa: el orden ya lo da la lista numerada. */}
      <span aria-hidden className="absolute left-3 top-7 bottom-0 w-px bg-line last:hidden" />
      <span
        aria-hidden
        className="absolute left-0 top-0 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-surface text-[11px] font-medium text-fg-muted"
      >
        {e.posicion}
      </span>

      <h4 className="text-sm font-semibold text-fg">
        {e.nombre}
        <span className="ml-2 font-normal text-xs text-fg-muted">
          Etapa {e.posicion} de {total}
        </span>
      </h4>
      <p className="text-sm text-fg-secondary leading-relaxed mt-1 max-w-prose">{e.queEs}</p>

      <div className="flex flex-wrap gap-1.5 mt-2.5">
        {e.esHito ? (
          <Pildora>Hito · no hay documento que abrir</Pildora>
        ) : (
          e.documentos.map((d) => (
            <PildoraLink key={d.slug} href={`#${anclaDeDocumento(d.slug)}`}>
              {d.nombre}
            </PildoraLink>
          ))
        )}
        {e.seCierraCon && <Pildora>Se cierra con: {e.seCierraCon}</Pildora>}
      </div>
    </li>
  );
}

export default function Recorrido() {
  const etapas = armarRecorrido();
  const corto = armarCicloCorto();

  return (
    <Seccion id="recorrido" titulo="El recorrido">
      <Bloque b={INTRO_RECORRIDO} />

      <ol className="mt-6">
        {etapas.map((e) => (
          <Etapa key={e.clave} e={e} total={etapas.length} />
        ))}
      </ol>

      <div className="mt-8 rounded-lg border border-line bg-surface-muted p-4">
        <h3 className="text-sm font-semibold text-fg">Las cuentas de continuidad van por otro lado</h3>
        <p className="text-sm text-fg-secondary leading-relaxed mt-1 max-w-prose">
          Un proyecto de continuidad o soporte no hace el recorrido completo: arranca igual y pasa
          directo a operar. Su camino es más corto:
        </p>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {corto.map((e) => (
            <Pildora key={e.clave}>{e.nombre}</Pildora>
          ))}
        </div>
      </div>
    </Seccion>
  );
}
