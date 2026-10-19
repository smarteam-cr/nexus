"use client";

/**
 * components/tareas/FueraDelTope.tsx — lo que el tope de 5 por persona por reunión te dejó fuera (2026-10-19).
 *
 * Una reunión propone como mucho 5 tareas por persona; las demás líneas de sus «Próximos pasos» no se perdían, pero
 * nadie las veía. Acá se ven por reunión, con sus títulos, y «Proponérmelas» las suma como propuestas tuyas: decides
 * tú, como con las demás. Lo calcula el servidor (lib/tareas/lectura.ts › `loQueQuedoFueraDelTope`).
 */
import { useEffect, useState } from "react";
import { BotonBlanco, FranjaDeSugerencias } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { textoFueraDelTope } from "@/lib/tareas/cupo";
import { diaCortoConSemana, horaDeCostaRica } from "@/lib/tareas/semana";
import type { FueraDelTope as Fuera } from "@/lib/tareas/tipos";
import { apiTareas } from "./api";

/** `revision` cambia cuando Mis tareas se vuelve a pedir: así lo de fuera se mira de nuevo. */
export function FueraDelTope({ revision, onPropuestas }: { revision: unknown; onPropuestas: () => void }) {
  const toast = useToast();
  const [reuniones, setReuniones] = useState<Fuera[]>([]);
  const [ocupada, setOcupada] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    apiTareas
      .fueraDelTope()
      .then((r) => vivo && setReuniones(r.reuniones))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [revision]);

  if (!reuniones.length) return null;

  async function proponer(r: Fuera) {
    setOcupada(r.lecturaId);
    try {
      const { creadas } = await apiTareas.proponerLoDeFuera(r.lecturaId);
      toast.success(creadas === 1 ? "Te llegó 1 propuesta más. Decide tú." : `Te llegaron ${creadas} propuestas más. Decide tú.`);
      setReuniones((xs) => xs.filter((x) => x.lecturaId !== r.lecturaId));
      onPropuestas();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron proponer.");
    } finally {
      setOcupada(null);
    }
  }

  return (
    <div className="space-y-2">
      {reuniones.map((r) => (
        <FranjaDeSugerencias
          key={r.lecturaId}
          acciones={
            <BotonBlanco onClick={() => void proponer(r)} disabled={ocupada === r.lecturaId}>
              {ocupada === r.lecturaId ? "Proponiendo…" : r.titulos.length === 1 ? "Proponérmela" : "Proponérmelas"}
            </BotonBlanco>
          }
        >
          De «{r.reunion}» · {diaCortoConSemana(horaDeCostaRica(new Date(r.fecha)).fecha)}: {textoFueraDelTope(r.titulos.length)}{" "}
          <span className="text-fg-secondary">{r.titulos.join(" · ")}</span>
        </FranjaDeSugerencias>
      ))}
    </div>
  );
}
