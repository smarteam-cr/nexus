"use client";

/**
 * components/procesos/EditarPaso.tsx — EDITAR UN PASO DEL MAPA.
 *
 * Qué pasa, quién lo hace (el carril), con qué, el dolor (solo hoy) y de dónde sale. Las citas no se
 * escriben a mano: vienen de las reuniones y acá solo se quitan. «Lo dijo el cliente» (hoy) y
 * «Acordado con el cliente» (después) piden al menos una cita; sin cita, el paso queda como supuesto
 * (lo vuelve a decir el servidor: `lib/procesos/servidor.ts`).
 *
 * Guardar deja el mapa como editado a mano: el agente ya no lo pisa al volver a mapear. Un mapa
 * validado con el cliente vuelve a «Revisado», porque lo validado era otra cosa.
 */
import { useState } from "react";
import { Drawer, Field, Input, Select, Segmentado, Textarea } from "@/components/ui";
import { BotonAzul, BotonBlanco, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { ETIQUETA_DE_ORIGEN, type MapaDeProceso, type OrigenDelPaso } from "@/lib/procesos/mapa";
import { fechaCorta, type CualVersion } from "./MapaPorCarriles";

export interface EdicionDelPaso {
  version: CualVersion;
  pasoId: string;
  texto: string;
  carril: string;
  herramienta: string;
  dolor: string;
  origen: OrigenDelPaso;
  quitarCitas: number[];
}

const ORIGENES_DE: Record<CualVersion, OrigenDelPaso[]> = { hoy: ["dicho", "supuesto"], despues: ["acordado", "propuesto", "supuesto"] };
const CORTO: Record<OrigenDelPaso, string> = { dicho: "Lo dijo el cliente", acordado: "Acordado", propuesto: "Propuesto", supuesto: "Supuesto" };

export default function EditarPaso({
  mapa,
  cual,
  pasoId,
  guardando,
  error,
  onGuardar,
  onCerrar,
}: {
  mapa: MapaDeProceso;
  cual: CualVersion;
  pasoId: string;
  guardando: boolean;
  error: string | null;
  onGuardar: (cambio: EdicionDelPaso) => void;
  onCerrar: () => void;
}) {
  const version = mapa[cual];
  const paso = version.pasos.find((p) => p.id === pasoId);
  const [texto, setTexto] = useState(paso?.texto ?? "");
  const [carril, setCarril] = useState(paso?.carril ?? "");
  const [herramienta, setHerramienta] = useState(paso?.herramienta ?? "");
  const [dolor, setDolor] = useState(paso?.dolor ?? "");
  const [origen, setOrigen] = useState<OrigenDelPaso>(paso?.origen ?? "supuesto");
  const [quitar, setQuitar] = useState<number[]>([]);
  if (!paso) return null;

  const citasQueQuedan = paso.citas.filter((_, i) => !quitar.includes(i)).length;
  const pideCita = origen === "dicho" || origen === "acordado";
  const sinCita = pideCita && citasQueQuedan === 0;
  const opciones = ORIGENES_DE[cual].map((o) => ({
    clave: o,
    etiqueta: CORTO[o],
    title: ETIQUETA_DE_ORIGEN[o],
    deshabilitada: (o === "dicho" || o === "acordado") && citasQueQuedan === 0,
  }));

  return (
    <Drawer
      open
      onClose={onCerrar}
      size="md"
      title="Editar el paso"
      description={cual === "hoy" ? "Cómo lo hace el cliente hoy." : "Cómo va a funcionar después de la implementación."}
      footer={
        <div className="flex items-center justify-end gap-2">
          <BotonBlanco onClick={onCerrar} disabled={guardando}>
            Cancelar
          </BotonBlanco>
          <BotonAzul
            disabled={guardando || !texto.trim() || sinCita}
            onClick={() => onGuardar({ version: cual, pasoId, texto, carril, herramienta, dolor, origen, quitarCitas: quitar })}
          >
            {guardando ? "Guardando…" : "Guardar"}
          </BotonAzul>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Qué pasa">
          <Textarea value={texto} maxLength={120} rows={2} onChange={(e) => setTexto(e.target.value)} />
        </Field>
        <Field label="Quién lo hace">
          <Select value={carril} onChange={(e) => setCarril(e.target.value)}>
            {version.carriles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Con qué" hint="La herramienta o el canal: Excel, WhatsApp, HubSpot…">
          <Input value={herramienta} maxLength={80} onChange={(e) => setHerramienta(e.target.value)} />
        </Field>
        {cual === "hoy" && (
          <Field label="Dolor (opcional)" hint="Qué falla o cuesta en este paso, si lo dijo el cliente.">
            <Textarea value={dolor} maxLength={140} rows={2} onChange={(e) => setDolor(e.target.value)} />
          </Field>
        )}

        <section className="space-y-2">
          <p className={ROTULO_DEL_SISTEMA}>De dónde sale</p>
          <Segmentado opciones={opciones} valor={origen} onCambio={setOrigen} etiqueta="De dónde sale el paso" />
          {paso.citas.map((c, i) => {
            const fuera = quitar.includes(i);
            return (
              <div key={i} className={cn("rounded-lg border border-line bg-surface px-3 py-2", fuera && "opacity-50")}>
                <p className={cn("text-[13px] leading-[1.45] text-fg", fuera && "line-through")}>«{c.cita}»</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-[11.5px] text-fg-muted">
                    {[c.quien, c.sesionTitulo, c.fecha ? fechaCorta(c.fecha) : "", c.minuto ? `min ${c.minuto}` : ""].filter(Boolean).join(" · ")}
                  </span>
                  <button
                    type="button"
                    className="flex-shrink-0 text-xs font-medium text-fg-muted transition-colors hover:text-fg"
                    onClick={() => setQuitar((q) => (fuera ? q.filter((k) => k !== i) : [...q, i]))}
                  >
                    {fuera ? "Dejarla" : "Quitar"}
                  </button>
                </div>
              </div>
            );
          })}
          <p className="text-xs leading-relaxed text-fg-muted">
            {cual === "hoy" ? "«Lo dijo el cliente»" : "«Acordado»"} pide una cita de una reunión: las citas salen de lo que se dijo, nunca se
            escriben a mano. Sin cita, el paso queda como supuesto.
          </p>
          {sinCita && <p className="text-xs text-warn-ink">Quitaste todas las citas: elige «Supuesto»{cual === "despues" ? " o «Propuesto»" : ""}.</p>}
        </section>

        {error && <p className="text-xs text-danger-ink">{error}</p>}
      </div>
    </Drawer>
  );
}
