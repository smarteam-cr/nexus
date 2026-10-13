"use client";

/**
 * Los controles del ciclo en la tarjeta de la ETAPA del Resumen de un proyecto recurrente (2026-10-12, pedido de
 * Elías: la sección del ciclo respeta el diseño de la tarjeta de la etapa).
 *
 *  · «Cambiar etapa»: un menú con las cinco etapas, hacia adelante o hacia atrás. Solo en un proyecto que NO está en
 *    HubSpot (allá la mueve el equipo, con la encuesta de la etapa).
 *  · «Editar el ciclo»: el tramo, las fechas, la meta y el compromiso del servicio.
 *  · La sugerencia de la etapa que muestran los documentos (el Diagnóstico escrito → Planificación).
 *
 * El primer ciclo se abre solo al guardar cualquiera de estos cambios (lib/servicios/ciclos-server.ts).
 */
import { useState } from "react";
import { Field, Input, Modal, Select, Textarea } from "@/components/ui";
import { Menu } from "@/components/ui/Menu";
import { useToast } from "@/components/ui/Toast";
import { BotonAzul, BotonBlanco, BotonEnlace, BotonTexto, FranjaDeSugerencias } from "@/components/ui/sistema";
import {
  COMPROMISOS,
  ETAPAS_DEL_CICLO,
  ETIQUETA_DE_COMPROMISO,
  ETIQUETA_DE_ETAPA,
  etapaPosterior,
  etapaQueMuestranLasPiezas,
  type Compromiso,
  type EtapaDelCiclo,
} from "@/lib/servicios/ciclo";
import { useCiclo } from "./useCiclo";

async function patchCiclo(projectId: string, body: unknown): Promise<string | null> {
  const r = await fetch(`/api/projects/${projectId}/ciclo`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (r.ok) return null;
  const j = await r.json().catch(() => null);
  return (j?.error as string | undefined) ?? "No se pudo guardar el ciclo.";
}

/** «Cambiar etapa» del ciclo: las cinco etapas, la actual marcada. */
export function CambiarEtapaDelCiclo({
  projectId,
  etapa,
  onCambio,
}: {
  projectId: string;
  etapa: EtapaDelCiclo | null;
  onCambio: () => void;
}) {
  const toast = useToast();
  const mover = async (e: EtapaDelCiclo) => {
    if (e === etapa) return;
    const err = await patchCiclo(projectId, { etapa: e });
    if (err) toast.error(err);
    else {
      toast.success(`El ciclo pasó a ${ETIQUETA_DE_ETAPA[e]}.`);
      onCambio();
    }
  };
  return (
    <Menu
      trigger="Cambiar etapa"
      triggerClassName="text-[13px] font-medium text-brand hover:text-brand-light"
      align="end"
      header="¿En qué etapa está el ciclo?"
      items={ETAPAS_DEL_CICLO.map((e) => ({
        key: e,
        label: e === etapa ? `${ETIQUETA_DE_ETAPA[e]} · ahora` : ETIQUETA_DE_ETAPA[e],
        disabled: e === etapa,
        onSelect: () => void mover(e),
      }))}
    />
  );
}

/**
 * La etapa que muestran los documentos, si va más adelante que la guardada. En un proyecto de HubSpot no escribe:
 * abre la encuesta (`onResponder`).
 */
export function SugerenciaDeEtapaDelCiclo({
  projectId,
  etapa,
  piezasConContenido,
  enHubspot,
  onCambio,
  onResponder,
}: {
  projectId: string;
  etapa: EtapaDelCiclo | null;
  piezasConContenido: readonly string[];
  enHubspot: boolean;
  onCambio: () => void;
  onResponder?: () => void;
}) {
  const toast = useToast();
  const [usando, setUsando] = useState(false);
  const sugerida = etapaQueMuestranLasPiezas(piezasConContenido);
  if (!sugerida || !etapa || !etapaPosterior(sugerida, etapa)) return null;
  const porque = sugerida === "implementacion" ? "la Planificación está escrita" : "el Diagnóstico está escrito";
  return (
    <FranjaDeSugerencias
      acciones={
        enHubspot ? (
          onResponder ? <BotonBlanco onClick={onResponder}>Ver y responder</BotonBlanco> : null
        ) : (
          <BotonBlanco
            disabled={usando}
            onClick={async () => {
              setUsando(true);
              const err = await patchCiclo(projectId, { etapa: sugerida });
              setUsando(false);
              if (err) toast.error(err);
              else {
                toast.success(`El ciclo pasó a ${ETIQUETA_DE_ETAPA[sugerida]}.`);
                onCambio();
              }
            }}
          >
            Usar
          </BotonBlanco>
        )
      }
    >
      Lo que hay en el proyecto muestra que el ciclo ya pasó a <strong className="font-semibold">{ETIQUETA_DE_ETAPA[sugerida]}</strong>: {porque}.
    </FranjaDeSugerencias>
  );
}

/** «Editar el ciclo»: el enlace y su ventana (tramo, fechas, meta, compromiso). */
export function EditarElCiclo({ projectId, onCambio }: { projectId: string; onCambio: () => void }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <BotonEnlace onClick={() => setAbierto(true)}>Editar el ciclo</BotonEnlace>
      {abierto && <VentanaDelCiclo projectId={projectId} onCerrar={() => setAbierto(false)} onCambio={onCambio} />}
    </>
  );
}

function VentanaDelCiclo({ projectId, onCerrar, onCambio }: { projectId: string; onCerrar: () => void; onCambio: () => void }) {
  const { estado, guardando, enviar } = useCiclo(projectId, onCambio);
  return (
    <Modal open onClose={onCerrar} title="El ciclo" size="md">
      {!estado ? (
        <div className="space-y-3" aria-busy="true">
          <div className="skeleton-shimmer h-10 rounded-lg" />
          <div className="skeleton-shimmer h-10 rounded-lg" />
          <div className="skeleton-shimmer h-10 rounded-lg" />
        </div>
      ) : (
        <FormularioDelCiclo
          key={estado.abierto?.id ?? "nuevo"}
          inicial={{
            nombre: estado.abierto?.nombre ?? "",
            desde: estado.abierto?.desde ?? "",
            hasta: estado.abierto?.hasta ?? "",
            meta: estado.abierto?.meta ?? "",
            compromiso: estado.compromiso ?? "",
          }}
          puedeEditar={estado.puedeEditar}
          guardando={guardando}
          onCancelar={onCerrar}
          onGuardar={async (v) => {
            const ok = await enviar(
              "",
              "PATCH",
              {
                nombre: v.nombre || null,
                desde: v.desde || null,
                hasta: v.hasta || null,
                meta: v.meta || null,
                compromiso: (v.compromiso || null) as Compromiso | null,
              },
              "Listo.",
            );
            if (ok) onCerrar();
          }}
        />
      )}
    </Modal>
  );
}

interface ValoresDelCiclo {
  nombre: string;
  desde: string;
  hasta: string;
  meta: string;
  compromiso: string;
}

function FormularioDelCiclo({
  inicial,
  puedeEditar,
  guardando,
  onCancelar,
  onGuardar,
}: {
  inicial: ValoresDelCiclo;
  puedeEditar: boolean;
  guardando: boolean;
  onCancelar: () => void;
  onGuardar: (v: ValoresDelCiclo) => Promise<void>;
}) {
  const [v, setV] = useState(inicial);
  const set = (k: keyof ValoresDelCiclo) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Tramo">
          <Input value={v.nombre} onChange={set("nombre")} maxLength={200} placeholder="Corregir y adoptar" disabled={!puedeEditar} />
        </Field>
        <Field label="Desde">
          <Input type="date" value={v.desde} onChange={set("desde")} disabled={!puedeEditar} />
        </Field>
        <Field label="Hasta">
          <Input type="date" value={v.hasta} onChange={set("hasta")} disabled={!puedeEditar} />
        </Field>
      </div>
      <Field label="Meta del ciclo">
        <Textarea
          value={v.meta}
          onChange={set("meta")}
          rows={2}
          maxLength={4000}
          placeholder="El resultado que persigue el cliente en este tramo, en sus palabras."
          disabled={!puedeEditar}
        />
      </Field>
      <Field label="Compromiso del servicio">
        <Select value={v.compromiso} onChange={set("compromiso")} disabled={!puedeEditar} className="w-48">
          <option value="">Sin definir</option>
          {COMPROMISOS.map((c) => (
            <option key={c} value={c}>
              {ETIQUETA_DE_COMPROMISO[c]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex justify-end gap-2">
        <BotonTexto onClick={onCancelar}>{puedeEditar ? "Cancelar" : "Cerrar"}</BotonTexto>
        {puedeEditar && (
          <BotonAzul disabled={guardando} onClick={() => void onGuardar(v)}>
            Guardar
          </BotonAzul>
        )}
      </div>
    </div>
  );
}
