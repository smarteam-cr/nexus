"use client";

/**
 * Finanzas › Modelos › Comisiones (/finanzas/modelo-de-comisiones), SOLO SUPER ADMIN. La propuesta de comisiones del
 * 15 oct de 2026 en dos pestañas: «Cómo funciona» (la explicación, con calculadoras chicas) y «Simulación» (un vendedor
 * con sus ventas ganadas y su meta de HubSpot). Las reglas viven en lib/finanzas/modelo-comisiones/reglas.ts.
 *
 * La pestaña viaja en la dirección (`?pestana=simulacion`) con `history.replaceState`: cambiarla no vuelve a cargar la
 * página. Lo que se mueve en la simulación no se guarda.
 */
import Link from "next/link";
import { useState } from "react";
import { PageHeader, Tabs } from "@/components/ui";
import { ENLACE_BLANCO } from "@/components/carga/piezas";
import type { DatosDeLaSimulacion } from "@/lib/finanzas/modelo-comisiones/cargar";
import ComoFunciona from "./ComoFunciona";
import SimulacionDeComisiones from "./SimulacionDeComisiones";

export type PestanaDeComisiones = "como-funciona" | "simulacion";

export default function ModeloDeComisiones({ datos, pestanaInicial }: { datos: DatosDeLaSimulacion; pestanaInicial: PestanaDeComisiones }) {
  const [pestana, setPestana] = useState<PestanaDeComisiones>(pestanaInicial);
  const cambiar = (p: PestanaDeComisiones) => {
    setPestana(p);
    const url = new URL(window.location.href);
    if (p === "simulacion") url.searchParams.set("pestana", p);
    else url.searchParams.delete("pestana");
    window.history.replaceState(window.history.state, "", url);
  };
  return (
    <div className="space-y-6">
      <PageHeader
        title="Comisiones"
        description="Cómo se calcularía lo que gana cada persona por vender."
        action={
          <Link href="/finanzas/costos/comisiones-vendedor" className={ENLACE_BLANCO}>
            Lo que se paga hoy →
          </Link>
        }
        className="mb-0"
      />
      <Tabs<PestanaDeComisiones>
        aria-label="Secciones de Comisiones"
        value={pestana}
        onChange={cambiar}
        items={[
          { key: "como-funciona", label: "Cómo funciona" },
          { key: "simulacion", label: "Simulación" },
        ]}
      />
      {pestana === "como-funciona" ? <ComoFunciona onSimular={() => cambiar("simulacion")} /> : <SimulacionDeComisiones datos={datos} />}
    </div>
  );
}
