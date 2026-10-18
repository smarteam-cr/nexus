"use client";

/**
 * La SESIÓN DE APRENDIZAJE y el CIERRE del ciclo (docs/smartloop-plan.md, etapa 4; ficha E). Va en el artefacto
 * Aprendizaje, debajo de la guía del CSE.
 *
 * Por cada caso de uso: lo medido de su criterio de aceptación y qué se decide (se cumplió, no se cumplió, pasa al
 * siguiente ciclo o se descarta). Después, la meta del ciclo evaluada y la propuesta del siguiente ciclo. Todo se
 * guarda como borrador al salir de cada campo; «Cerrar el ciclo» pide que no falte nada (lib/servicios/cierre.ts) y,
 * al cerrar, congela los documentos del ciclo, que quedan en «Ciclos anteriores».
 */
import { useState } from "react";
import { Alert, ConfirmDialog, Field, Select, Textarea } from "@/components/ui";
import { BotonAzul, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import {
  DECISIONES_AL_CERRAR,
  ETIQUETA_DE_DECISION,
  ETIQUETA_DE_RESULTADO,
  PIDEN_MEDICION,
  RESULTADOS_DE_META,
  faltaParaCerrar,
  type DecisionAlCerrar,
} from "@/lib/servicios/cierre";
import type { CicloVista } from "@/lib/servicios/ciclos-server";

type Enviar = (ruta: "" | "/casos" | "/cierre", method: "POST" | "PATCH", body: unknown, ok?: string) => Promise<boolean>;

/** Un campo de texto que guarda al salir (si cambió). */
function TextoQueGuarda({
  valor,
  onGuardar,
  placeholder,
  disabled,
  rows = 2,
}: {
  valor: string | null;
  onGuardar: (v: string) => void;
  placeholder: string;
  disabled: boolean;
  rows?: number;
}) {
  // Quien lo usa le pone `key={valor}`: si el valor guardado cambia, el campo nace de nuevo con él.
  const [v, setV] = useState(valor ?? "");
  return (
    <Textarea
      value={v}
      rows={rows}
      maxLength={4000}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (v.trim() !== (valor ?? "").trim()) onGuardar(v);
      }}
    />
  );
}

export default function CierreDelCiclo({ ciclo, puedeEditar, enviar }: { ciclo: CicloVista; puedeEditar: boolean; enviar: Enviar }) {
  const [confirmar, setConfirmar] = useState(false);
  const falta = faltaParaCerrar({
    meta: ciclo.meta,
    metaResultado: ciclo.metaResultado,
    metaEvaluada: ciclo.metaEvaluada,
    siguienteCiclo: ciclo.siguienteCiclo,
    casos: ciclo.casos,
  });
  const caso = (id: string, datos: object) => void enviar("/casos", "PATCH", { id, ...datos });
  // Con el id del ciclo: si otra pestaña ya lo cerró, el servidor responde 409 en vez de escribirle al siguiente.
  const delCiclo = (datos: object) => void enviar("", "PATCH", { cicloId: ciclo.id, ...datos });

  return (
    <section className="space-y-5 rounded-xl border border-line bg-surface p-5" data-recorrido="ciclo.cierre">
      <div>
        <p className={ROTULO_DEL_SISTEMA}>Sesión de aprendizaje · ciclo {ciclo.numero}</p>
        <p className="mt-1 text-[13px] text-fg-secondary">
          Mide cada caso de uso, decide qué pasa con él y evalúa la meta. Se guarda al salir de cada campo; el ciclo se cierra cuando no
          falta nada.
        </p>
      </div>

      {ciclo.casos.length === 0 ? (
        <p className="text-[13px] text-fg-muted">El ciclo no tiene casos de uso.</p>
      ) : (
        <ul className="space-y-4">
          {ciclo.casos.map((c) => {
            const decision = (c.decisionAlCerrar ?? "") as DecisionAlCerrar | "";
            const pideMedicion = decision !== "" && PIDEN_MEDICION.includes(decision);
            return (
              <li key={c.id} className="space-y-2 rounded-lg border border-line p-3">
                <div>
                  <p className="text-[13px] font-medium text-fg">{c.titulo}</p>
                  <p className="mt-0.5 text-xs text-fg-secondary">{c.criterio ? `Criterio: ${c.criterio}` : "Sin criterio de aceptación."}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
                  <Field label={pideMedicion ? "Lo medido (obligatorio)" : "Lo medido"}>
                    <TextoQueGuarda
                      key={c.criterioMedido ?? ""}
                      valor={c.criterioMedido}
                      disabled={!puedeEditar}
                      placeholder="Qué dio la métrica. Si no se movió, se dice tal cual."
                      onGuardar={(v) => caso(c.id, { criterioMedido: v || null })}
                    />
                  </Field>
                  <Field label="Qué se decide">
                    <Select
                      value={decision}
                      disabled={!puedeEditar}
                      onChange={(e) => caso(c.id, { decisionAlCerrar: e.target.value || null })}
                    >
                      <option value="">Sin decidir</option>
                      {DECISIONES_AL_CERRAR.map((d) => (
                        <option key={d} value={d}>
                          {ETIQUETA_DE_DECISION[d]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-3">
        <p className={ROTULO_DEL_SISTEMA}>La meta del ciclo</p>
        <p className="text-[13px] text-fg">{ciclo.meta ?? <span className="text-warn-ink">El ciclo no tiene meta: escríbela en la tarjeta de la etapa.</span>}</p>
        <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
          <Field label="¿Se cumplió?">
            <Select value={ciclo.metaResultado ?? ""} disabled={!puedeEditar || !ciclo.meta} onChange={(e) => delCiclo({ metaResultado: e.target.value || null })}>
              <option value="">Sin evaluar</option>
              {RESULTADOS_DE_META.map((r) => (
                <option key={r} value={r}>
                  {ETIQUETA_DE_RESULTADO[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cómo se evaluó">
            <TextoQueGuarda
              key={ciclo.metaEvaluada ?? ""}
              valor={ciclo.metaEvaluada}
              disabled={!puedeEditar}
              placeholder="Con qué números se mide, y qué pasó."
              onGuardar={(v) => delCiclo({ metaEvaluada: v || null })}
            />
          </Field>
        </div>
      </div>

      <Field label="La propuesta del siguiente ciclo">
        <TextoQueGuarda
          key={ciclo.siguienteCiclo ?? ""}
          valor={ciclo.siguienteCiclo}
          disabled={!puedeEditar}
          rows={3}
          placeholder="Qué casos de uso siguen y por qué: lo que pasó a este ciclo, lo que pide la escala y lo que pidió el cliente."
          onGuardar={(v) => delCiclo({ siguienteCiclo: v || null })}
        />
      </Field>

      {falta.length > 0 ? (
        <Alert variant="info">
          <p className="font-medium">Para cerrar el ciclo falta:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {falta.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {puedeEditar && (
        <div className="flex justify-end">
          <BotonAzul onClick={() => setConfirmar(true)} disabled={falta.length > 0}>
            Cerrar el ciclo {ciclo.numero}
          </BotonAzul>
        </div>
      )}

      <ConfirmDialog
        open={confirmar}
        onCancel={() => setConfirmar(false)}
        onConfirm={async () => {
          const ok = await enviar("/cierre", "POST", {}, `El ciclo ${ciclo.numero} quedó cerrado.`);
          if (ok) setConfirmar(false);
        }}
        title={`¿Cerrar el ciclo ${ciclo.numero}?`}
        description="Sus documentos quedan congelados como están hoy y el ciclo pasa a «Ciclos anteriores». Lo que pasa al siguiente ciclo entra solo cuando se abra. El proyecto vuelve a Diagnóstico."
        confirmLabel="Cerrar el ciclo"
        variant="default"
      />
    </section>
  );
}
