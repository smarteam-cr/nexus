"use client";

/**
 * components/escala/Leyenda.tsx — «Cómo leer la escala»: las marcas y las reglas de lectura.
 *
 * Todo el texto sale del documento publicado (Parte 2 y glosario): acá solo se ordena.
 */
import { useState } from "react";
import { Modal } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { DatosDeLaVista } from "@/lib/escala/vista";
import { PUNTO_DE_NIVEL } from "./niveles";
import { BloquesDeLaEscala, BOTON_CLARO, ParrafoDeLaEscala } from "./piezas";

export default function Leyenda({ datos }: { datos: DatosDeLaVista }) {
  const [abierta, setAbierta] = useState(false);
  const bloque = (titulo: string, texto: string | null | undefined) =>
    texto ? (
      <section className="space-y-1.5">
        <h3 className="text-sm font-semibold text-fg">{titulo}</h3>
        {texto.split(/\n\n+/).map((p, i) => (
          <ParrafoDeLaEscala key={i} texto={p} className="text-sm leading-relaxed text-fg-secondary" />
        ))}
      </section>
    ) : null;

  return (
    <>
      <button type="button" onClick={() => setAbierta(true)} className={BOTON_CLARO}>
        <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 6.5v13M12 6.5C10.8 5.6 9.2 5 7.5 5S4.2 5.6 3 6.5v13c1.2-.9 2.8-1.5 4.5-1.5s3.3.6 4.5 1.5m0-13c1.2-.9 2.8-1.5 4.5-1.5s3.3.6 4.5 1.5v13c-1.2-.9-2.8-1.5-4.5-1.5s-3.3.6-4.5 1.5" />
        </svg>
        Cómo leer la escala
      </button>
      <Modal open={abierta} onClose={() => setAbierta(false)} title="Cómo leer la escala" size="xl">
        <div className="space-y-5">
          <section className="space-y-1.5">
            <h3 className="text-sm font-semibold text-fg">Los niveles</h3>
            <ul className="flex flex-wrap gap-3">
              {datos.niveles.map((n) => (
                <li key={n.letra} className="flex items-center gap-1.5 text-[13px] font-medium text-fg">
                  <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", PUNTO_DE_NIVEL[n.letra])} aria-hidden />
                  {n.nombre}
                  <span className="text-xs font-normal text-fg-muted">{n.letra}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-fg-muted">La letra es la del identificador: `1.7.F1` es el primer criterio de Funcional de la dimensión 1.7.</p>
          </section>
          {bloque("Cómo se evalúa cada dimensión", datos.explicaciones.evaluacion)}
          {bloque("Riesgo", datos.explicaciones.riesgo)}
          {bloque("Hábito y niveles por confirmar", datos.explicaciones.habito)}
          {bloque("Criterios requeridos", datos.explicaciones.requeridos)}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-fg">Cómo se verifica cada criterio</h3>
            {(["comprobable", "declarado", "evaluado"] as const).map((v) =>
              datos.verificacion[v] ? (
                <p key={v} className="text-sm leading-relaxed text-fg-secondary">
                  <span className="font-semibold capitalize text-fg">{v}. </span>
                  {datos.verificacion[v]}
                </p>
              ) : null,
            )}
          </section>
          {datos.palabrasConValorFijo.length > 0 && (
            <section className="space-y-1.5">
              <h3 className="text-sm font-semibold text-fg">Palabras con valor fijo</h3>
              <p className="text-sm leading-relaxed text-fg-secondary">
                Para que dos personas decidan igual, estas palabras de los criterios valen siempre lo mismo. En la escala se ven subrayadas con
                puntos ámbar: pasa el cursor para ver su valor. Los términos del glosario (pipeline review, deal, SQL…) se subrayan con puntos
                grises: pasa el cursor para ver qué significan.
              </p>
              <ul className="flex flex-col gap-1">
                {datos.palabrasConValorFijo.map((p) => (
                  <li key={p.termino} className="text-sm text-fg-secondary">
                    <span className="font-semibold text-fg">«{p.termino}»</span>: {p.significado}.
                  </li>
                ))}
              </ul>
            </section>
          )}
          {datos.casosDeLectura.length > 0 && (
            <section className="space-y-1.5">
              <h3 className="text-sm font-semibold text-fg">Casos que se leen distinto</h3>
              <BloquesDeLaEscala bloques={datos.casosDeLectura} />
            </section>
          )}
          {bloque("El perfil de negocio", datos.explicaciones.perfil)}
          {datos.automatizacion.length > 0 && (
            <section className="space-y-1.5">
              <h3 className="text-sm font-semibold text-fg">Regla de automatización</h3>
              <BloquesDeLaEscala bloques={datos.automatizacion} />
            </section>
          )}
          <p className="border-t border-line pt-3 text-xs text-fg-muted">
            Dónde se cuenta cada evidencia dudosa («Regla de asignación») aparece en la vista Por dimensión, junto a la dimensión que toca. Los
            documentos completos se bajan con «Descargar .md».
          </p>
        </div>
      </Modal>
    </>
  );
}
