"use client";

/**
 * Las pestañas de /feedback: Bandeja · Hoja de ruta · Personas · Encuestas. Viven en `?vista=` de la misma ruta, así
 * que van en modo estado (el modo navegación de `Tabs` marca activo por prefijo de ruta, y las cuatro
 * comparten `/feedback`).
 *
 * La Bandeja lleva lo que espera una decisión tuya y la Hoja de ruta, sus temas abiertos (2026-10-06).
 * «Encuestas» se llamaba «Tiempos» hasta el 2026-10-06: junta todo lo que le preguntas al equipo, a una persona
 * («Tus preguntas») o solo («Automáticas»: ¿cuánto te tomó?). `?vista=tiempos` sigue abriéndola, en Automáticas.
 *
 * El recorrido de Feedback (lib/recorridos/contenido/feedback.ts) pide cada pestaña con `feedback.pestana`.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Tabs } from "@/components/ui/Tabs";
import { EVENTO_DEL_RECORRIDO, type AccionDelRecorrido } from "@/lib/recorridos/tipos";

export type Vista = "bandeja" | "hoja" | "personas" | "encuestas";

const VISTAS: readonly Vista[] = ["bandeja", "hoja", "personas", "encuestas"];
const direccionDe = (v: Vista) => (v === "bandeja" ? "/feedback" : `/feedback?vista=${v}`);

export default function PestanasDeFeedback({ vista, cuentas }: { vista: Vista; cuentas: { bandeja: number; hoja: number } }) {
  const router = useRouter();

  // El recorrido pide una pestaña: si ya es esta, no se vuelve a pedir la página.
  useEffect(() => {
    const alPedido = (e: Event) => {
      const a = (e as CustomEvent<AccionDelRecorrido>).detail;
      if (a?.evento !== "feedback.pestana" || !VISTAS.includes(a.valor as Vista) || a.valor === vista) return;
      router.push(direccionDe(a.valor as Vista));
    };
    window.addEventListener(EVENTO_DEL_RECORRIDO, alPedido);
    return () => window.removeEventListener(EVENTO_DEL_RECORRIDO, alPedido);
  }, [vista, router]);

  return (
    // `Tabs` no deja pasar atributos: el ancla del recorrido va en su envoltorio.
    <div data-recorrido="feedback.pestanas">
      <Tabs<Vista>
        aria-label="Secciones de Feedback"
        value={vista}
        onChange={(v) => router.push(direccionDe(v))}
        items={[
          { key: "bandeja", label: "Bandeja", count: cuentas.bandeja },
          { key: "hoja", label: "Hoja de ruta", count: cuentas.hoja },
          { key: "personas", label: "Personas" },
          { key: "encuestas", label: "Encuestas" },
        ]}
      />
    </div>
  );
}
