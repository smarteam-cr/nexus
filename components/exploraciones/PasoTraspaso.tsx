"use client";

/**
 * PasoTraspaso — qué le llega al CSE cuando el negocio se cierra.
 *
 * La exploración entra al handoff del proyecto como contexto ESTIMADO: «sirve para saber dónde
 * mirar, no es evidencia», como dice la escala. El diagnóstico del CSE no cambia: lo arma completo
 * desde ahí. Lo interno va a las secciones internas del handoff, nunca a un documento del cliente.
 */
import Link from "next/link";
import { CASILLAS } from "@/lib/exploraciones/casillas";
import { useLienzo } from "./contexto";

export default function PasoTraspaso() {
  const { exp, proyectos } = useLienzo();
  const c = exp.estado.contenido.casillas;
  const llenas = CASILLAS.filter((d) => c[d.clave] !== undefined);
  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-xl border border-line bg-surface p-4">
        <h3 className="text-sm font-semibold text-fg">Qué recibe el CSE</h3>
        <p className="text-sm text-fg-secondary">
          Cuando se gane el negocio y el proyecto tenga su handoff, esta exploración aparece en su contexto y alimenta el documento, marcada como estimada: le dice al CSE dónde mirar, pero no reemplaza su diagnóstico.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-fg-secondary">
          <li>La industria, el perfil de negocio y el nivel estimado de cada área y dimensión, con de dónde salió.</li>
          <li>Las metas en cifras, quién decide y a quién afecta, qué pasa si no actúa y lo que falta para Funcional.</li>
          <li>Lo interno (presupuesto, hipótesis, lo que nadie exploró, la apertura a la asesoría) va solo a las secciones internas del handoff.</li>
        </ul>
      </section>
      <section className="space-y-2 rounded-xl border border-line bg-surface p-4">
        <h3 className="text-sm font-semibold text-fg">A qué proyecto le llega</h3>
        {proyectos.length === 0 ? (
          <p className="text-sm text-fg-muted">
            Todavía a ninguno. Le llega al proyecto que nace del negocio de la propuesta o, si no hay ese enlace, al primer proyecto de Customer Success de la empresa en los seis meses siguientes. Nunca a uno de desarrollo ni de sitio web.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {proyectos.map((p) => (
              <li key={p.id}>
                <Link href={`/clients/${p.clientId}?tab=${p.id}`} className="text-brand-light hover:underline">
                  {p.nombre}
                </Link>
                <span className="text-xs text-fg-muted"> · aparece en el contexto de su handoff</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-2 rounded-xl border border-line bg-surface p-4">
        <h3 className="text-sm font-semibold text-fg">Lo que hoy tiene para traspasar</h3>
        {llenas.length === 0 ? (
          <p className="text-sm text-fg-muted">Todavía nada confirmado.</p>
        ) : (
          <p className="text-sm text-fg-secondary">{llenas.map((d) => d.etiqueta).join(" · ")}</p>
        )}
      </section>
    </div>
  );
}
