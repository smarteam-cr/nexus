"use client";

/**
 * components/cs/AjusteDelColor.tsx — corregir el color de una cuenta y marcar «en espera del cliente»
 * (2026-10-09, docs/exito-del-cliente-cartera-plan.md, entrega 2; regla en lib/cs/ajustes-de-salud.ts).
 *
 * Lo usan la pestaña «Cartera» (en la fila) y el panel de la cuenta. Solo la CSL y dirección llegan a estas
 * pantallas, y el servidor lo vuelve a mirar (`guardLiderDeCs`). Al guardar, la pantalla se refresca: el color
 * lo vuelve a calcular el servidor con la misma regla que el resto de la cartera.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, Modal, Segmentado, Textarea } from "@/components/ui";
import { BotonAzul, BotonBlanco, IconoDeSugerencia } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { cn } from "@/lib/cn";
import { fmtDia } from "@/lib/cs/formato";
import { NOMBRE_DE_LA_SALUD, type SaludDeCuenta } from "@/lib/cs/cartera-reglas";
import { DIAS_DE_LA_CORRECCION, LARGO_DE_LA_NOTA, type PropuestaDeEspera, type SaludCorregible } from "@/lib/cs/ajustes-de-salud";
import type { AjusteDeSaludPedido } from "@/lib/cs/schema";

async function pedir(clientId: string, cuerpo: AjusteDeSaludPedido): Promise<void> {
  await fetchJson(`/api/cs/salud/${clientId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
}

/** Guardar un ajuste y refrescar la pantalla. Devuelve true si salió bien. */
function useAjuste(clientId: string) {
  const router = useRouter();
  const toast = useToast();
  const [ocupado, setOcupado] = useState(false);
  async function guardar(cuerpo: AjusteDeSaludPedido, listo: string): Promise<boolean> {
    setOcupado(true);
    try {
      await pedir(clientId, cuerpo);
      toast.success(listo);
      router.refresh();
      return true;
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
      return false;
    } finally {
      setOcupado(false);
    }
  }
  return { ocupado, guardar };
}

const OPCIONES: { clave: SaludCorregible; etiqueta: string }[] = [
  { clave: "en-riesgo", etiqueta: NOMBRE_DE_LA_SALUD["en-riesgo"] },
  { clave: "en-friccion", etiqueta: NOMBRE_DE_LA_SALUD["en-friccion"] },
  { clave: "saludable", etiqueta: NOMBRE_DE_LA_SALUD.saludable },
];

export interface CorreccionVisible {
  quien: string;
  nota: string;
  /** AAAA-MM-DD. */
  vence: string;
}

/**
 * «Corregir el color»: elige el color y escribe por qué. Con una corrección vigente, deja quitarla. El color de
 * Nexus se ve al lado (`nexus`).
 */
export function CorregirColor({
  clientId,
  cuenta,
  salud,
  nexus,
  correccion,
  hoy,
  compacto = false,
}: {
  clientId: string;
  cuenta: string;
  /** El color que se ve hoy. */
  salud: SaludDeCuenta;
  /** El que calcula Nexus, cuando hay una corrección. */
  nexus: SaludDeCuenta | null;
  correccion: CorreccionVisible | null;
  hoy: string;
  /** En la fila de la cartera: solo el enlace. */
  compacto?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const inicial: SaludCorregible = salud === "en-riesgo" || salud === "en-friccion" || salud === "saludable" ? salud : "en-friccion";
  const [color, setColor] = useState<SaludCorregible>(inicial);
  const [nota, setNota] = useState("");
  const { ocupado, guardar } = useAjuste(clientId);

  const abrir = () => {
    setColor(inicial);
    setNota("");
    setAbierto(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className={cn("text-xs text-fg-muted transition-colors hover:text-brand", compacto && "text-[11px]")}
        title={correccion ? `Corregido por ${correccion.quien}: ${correccion.nota}` : "Corregir el color que calcula Nexus"}
      >
        {correccion ? "Corregido · cambiar" : "Corregir"}
      </button>
      <Modal
        open={abierto}
        onClose={() => setAbierto(false)}
        title={`Corregir el color de ${cuenta}`}
        description={`Vale ${DIAS_DE_LA_CORRECCION} días, o menos si Nexus ve algo rojo que no estaba. El color de Nexus se sigue viendo al lado.`}
        size="sm"
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            {correccion ? (
              <BotonBlanco
                disabled={ocupado}
                onClick={async () => {
                  if (await guardar({ accion: "quitar-correccion" }, "Listo: vuelve el color de Nexus.")) setAbierto(false);
                }}
              >
                Quitar la corrección
              </BotonBlanco>
            ) : (
              <span />
            )}
            <BotonAzul
              disabled={ocupado || nota.trim().length < 3}
              onClick={async () => {
                if (await guardar({ accion: "corregir", salud: color, nota: nota.trim() }, "Color corregido.")) setAbierto(false);
              }}
            >
              {ocupado ? "Guardando…" : "Guardar"}
            </BotonAzul>
          </div>
        }
      >
        <div className="space-y-4">
          {correccion && (
            <p className="text-[13px] text-fg-secondary">
              Hoy: corregido por {correccion.quien} hasta el {fmtDia(correccion.vence, hoy)} («{correccion.nota}»).
              {nexus && <> Nexus diría: {NOMBRE_DE_LA_SALUD[nexus].toLowerCase()}.</>}
            </p>
          )}
          <Segmentado<SaludCorregible> etiqueta="El color" valor={color} onCambio={setColor} opciones={OPCIONES} lleno />
          <Field label="Por qué (lo lee todo el equipo)" hint={`Una línea. Hasta ${LARGO_DE_LA_NOTA} caracteres.`}>
            <Textarea value={nota} onChange={(e) => setNota(e.target.value.slice(0, LARGO_DE_LA_NOTA))} rows={2} placeholder="Ej.: hablé con el gerente el martes y el atraso ya está acordado." />
          </Field>
        </div>
      </Modal>
    </>
  );
}

export interface EsperaVisible {
  quien: string;
  nota: string;
}

/**
 * «En espera del cliente»: lo marcado (con quitar), lo que propone Nexus (usar o descartar) o el enlace para
 * marcarlo. No cuenta como riesgo; si además hay algo rojo, gana el rojo.
 */
export function EnEsperaDelCliente({
  clientId,
  espera,
  propuesta,
}: {
  clientId: string;
  espera: EsperaVisible | null;
  propuesta: PropuestaDeEspera | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [nota, setNota] = useState("");
  const { ocupado, guardar } = useAjuste(clientId);

  if (espera) {
    return (
      <div className="flex flex-col gap-1 text-[13px]">
        <span className="text-fg">
          <b className="font-semibold">En espera del cliente</b>: {espera.nota}
        </span>
        <span className="flex items-center gap-2 text-xs text-fg-muted">
          lo marcó {espera.quien}
          <button
            type="button"
            disabled={ocupado}
            onClick={() => void guardar({ accion: "quitar-espera" }, "Listo: la cuenta ya no está en espera.")}
            className="text-brand transition-colors hover:text-brand-light disabled:opacity-50"
          >
            Quitar
          </button>
        </span>
      </div>
    );
  }

  return (
    <>
      {propuesta ? (
        <div className="flex flex-col gap-1.5 rounded-lg border border-info-line bg-info-surface px-2.5 py-2 text-[13px]">
          <span className="flex items-start gap-1.5 text-fg">
            <IconoDeSugerencia className="mt-0.5 h-[14px] w-[14px] flex-shrink-0 text-brand" />
            <span>
              Nexus propone <b className="font-semibold">en espera del cliente</b>: {propuesta.nota}.
            </span>
          </span>
          <span className="flex gap-3 pl-5 text-xs font-semibold">
            <button
              type="button"
              disabled={ocupado}
              onClick={() => void guardar({ accion: "en-espera", nota: propuesta.nota }, "Cuenta en espera del cliente.")}
              className="text-brand transition-colors hover:text-brand-light disabled:opacity-50"
            >
              Usar
            </button>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => void guardar({ accion: "descartar-espera", huella: propuesta.huella }, "Descartado.")}
              className="text-fg-muted transition-colors hover:text-fg disabled:opacity-50"
            >
              Descartar
            </button>
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setNota("");
            setAbierto(true);
          }}
          className="self-start text-xs text-fg-muted transition-colors hover:text-brand"
        >
          Marcar en espera del cliente
        </button>
      )}
      <Modal
        open={abierto}
        onClose={() => setAbierto(false)}
        title="En espera del cliente"
        description="La cuenta está frenada por el cliente. No cuenta como riesgo: si además hay algo rojo, gana el rojo."
        size="sm"
        footer={
          <BotonAzul
            disabled={ocupado || nota.trim().length < 3}
            onClick={async () => {
              if (await guardar({ accion: "en-espera", nota: nota.trim() }, "Cuenta en espera del cliente.")) setAbierto(false);
            }}
          >
            {ocupado ? "Guardando…" : "Guardar"}
          </BotonAzul>
        }
      >
        <Field label="Qué se espera del cliente" hint={`Una línea. Hasta ${LARGO_DE_LA_NOTA} caracteres.`}>
          <Textarea value={nota} onChange={(e) => setNota(e.target.value.slice(0, LARGO_DE_LA_NOTA))} rows={2} placeholder="Ej.: los accesos a su ERP; pidió pausa hasta noviembre." />
        </Field>
      </Modal>
    </>
  );
}
