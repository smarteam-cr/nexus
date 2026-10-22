"use client";

/**
 * Finanzas › Modelos › Comisiones (/finanzas/modelo-de-comisiones). El modelo de comisiones cerrado con Marco
 * (2026-10-21) en dos pestañas: «Cómo funciona» (la explicación, con calculadoras chicas, igual para todo el equipo
 * comercial) y «Simulación» (lo de quien mira; Super Admin, todo). Las reglas viven en
 * lib/finanzas/modelo-comisiones/reglas.ts; qué ve cada uno, en ./quien-ve.ts de ese módulo.
 *
 * La pestaña viaja en la dirección (`?pestana=simulacion`) con `history.replaceState`: cambiarla no vuelve a cargar la
 * página. Lo que se mueve en la simulación no se guarda.
 */
import Link from "next/link";
import { useState } from "react";
import { Alert, PageHeader, Tabs } from "@/components/ui";
import { ENLACE_BLANCO } from "@/components/carga/piezas";
import type { DatosDeLaSimulacion } from "@/lib/finanzas/modelo-comisiones/cargar";
import ComoFunciona from "./ComoFunciona";
import SimulacionDeComisiones from "./SimulacionDeComisiones";

export type PestanaDeComisiones = "como-funciona" | "simulacion";

/** El aviso que pidió Elías (2026-10-21), tal cual. */
const AVISO_DEL_MODELO =
  "Modelo en prueba. Lo vamos a ajustar con lo que aprendamos. Cuando Smarteam calcule la rentabilidad de cada proyecto, es probable que cambie para pagar sobre el margen. Un cambio nunca toca lo que ya se vendió.";

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
        description="Cómo se calcula lo que gana cada persona por vender."
        action={
          datos.todo ? (
            <Link href="/finanzas/costos/comisiones-vendedor" className={ENLACE_BLANCO}>
              Lo que se paga hoy →
            </Link>
          ) : undefined
        }
        className="mb-0"
      />
      <Alert variant="warning">{AVISO_DEL_MODELO}</Alert>
      <Tabs<PestanaDeComisiones>
        aria-label="Secciones de Comisiones"
        value={pestana}
        onChange={cambiar}
        items={[
          { key: "como-funciona", label: "Cómo funciona" },
          { key: "simulacion", label: "Simulación" },
        ]}
      />
      {pestana === "como-funciona" ? <ComoFunciona onSimular={() => cambiar("simulacion")} todo={datos.todo} /> : <SimulacionDeComisiones datos={datos} />}
    </div>
  );
}
