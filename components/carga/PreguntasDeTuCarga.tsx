"use client";

/**
 * components/carga/PreguntasDeTuCarga.tsx — en «Tu carga», lo que tienes sin anotar de «¿cuánto te tomó?». Se contesta
 * ahí mismo; al terminar se recarga la página para que tu carga use lo que respondiste.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import ListaDePreguntas from "@/components/tiempos/ListaDePreguntas";
import type { PreguntaParaResponder } from "@/lib/tiempos/tipos";

export default function PreguntasDeTuCarga({ preguntas }: { preguntas: PreguntaParaResponder[] }) {
  const router = useRouter();
  const [, setRespondidas] = useState<Set<string>>(new Set());
  if (preguntas.length === 0) {
    return <p className="pt-1 text-[13px] text-fg-secondary">No tienes nada sin anotar. Cuando marques hecha una tarea clave, te va a preguntar acá y en «Para ti».</p>;
  }
  const marcar = (id: string) =>
    setRespondidas((s) => {
      const n = new Set(s).add(id);
      if (preguntas.every((p) => n.has(p.id))) window.setTimeout(() => router.refresh(), 1500);
      return n;
    });
  return <ListaDePreguntas preguntas={preguntas} onListo={marcar} />;
}
