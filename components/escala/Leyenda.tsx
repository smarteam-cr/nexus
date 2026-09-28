"use client";

/**
 * components/escala/Leyenda.tsx — «Cómo leer las marcas», con las palabras de la escala.
 *
 * Todo el texto sale del documento publicado (Parte 2 y glosario): acá solo se ordena.
 */
import { useState } from "react";
import { Modal } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { DatosDeLaVista } from "@/lib/escala/vista";
import { PUNTO_DE_NIVEL } from "./niveles";
import { ParrafoDeLaEscala } from "./piezas";

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
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-fg-secondary hover:bg-surface-hover"
      >
        Cómo leer las marcas
      </button>
      <Modal open={abierta} onClose={() => setAbierta(false)} title="Cómo leer la escala" size="xl">
        <div className="space-y-5">
          <section className="space-y-1.5">
            <h3 className="text-sm font-semibold text-fg">Los niveles</h3>
            <ul className="flex flex-wrap gap-3">
              {datos.niveles.map((n) => (
                <li key={n.letra} className="flex items-center gap-1.5 text-sm text-fg-secondary">
                  <span className={cn("h-2.5 w-2.5 rounded-sm", PUNTO_DE_NIVEL[n.letra])} aria-hidden />
                  <span className="font-mono text-2xs text-fg-muted">{n.letra}</span> {n.nombre}
                </li>
              ))}
            </ul>
            <p className="text-xs text-fg-muted">La letra es la del identificador: `1.7.F1` es el primer criterio de Funcional de la dimensión 1.7.</p>
          </section>
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
          {bloque("Riesgo", datos.explicaciones.riesgo)}
          {bloque("Hábito y niveles por confirmar", datos.explicaciones.habito)}
          {bloque("El perfil de negocio", datos.explicaciones.perfil)}
        </div>
      </Modal>
    </>
  );
}
