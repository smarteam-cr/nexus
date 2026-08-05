"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Alert, Modal } from "@/components/ui";
import type { UniversoTraible, EmpresaTraible } from "@/lib/hubspot/empresas-con-proyecto";

/**
 * app/(shell)/clients/TraerDeHubspot.tsx — el botón que trae empresas que HubSpot ya tiene.
 *
 * ── LO QUE DECIDE SU FORMA ──────────────────────────────────────────────────
 * Se trae **de a una**, no todas de golpe, y no es preferencia estética: de las 4 empresas que
 * el criterio ofrecía al medir, **3 ya eran clientes de Nexus** creados por el importador de
 * cobranza SIN `hubspotCompanyId` — invisibles para el cruce por id. Un botón de «traer todas»
 * habría fabricado tres fichas gemelas de clientes que están facturando, el primer día, y partir
 * un cliente en dos parte la plata (cuenta y cobros en una ficha) del trabajo (proyecto en la
 * otra). Por eso cada fila muestra la ficha parecida ANTES de traer.
 *
 * ⚠ El botón NO se pinta cuando no hay nada que traer. Es la regla que este mismo directorio
 * escribe dos veces (la píldora que no parte el universo, la pestaña de categoría vacía): un
 * control que se contesta siempre igual es un control muerto. Este universo se agota solo.
 *
 * ── SOBRE EL COPY ───────────────────────────────────────────────────────────
 * Se escribió largo y se recortó a pedido. Lo que sobrevive es lo que cambia una decisión: el
 * denominador (pegado al número, no en un párrafo aparte), el aviso de ficha parecida, y a quién
 * le va a aparecer. Lo que se explicaba —por qué puede haber dos fichas, qué es la cuarentena de
 * cobranza— se cayó: nadie lee un párrafo para apretar un botón de dos opciones.
 */
export default function TraerDeHubspot({ cuantas }: { cuantas: number }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [universo, setUniverso] = useState<
    (UniversoTraible & { enganchadaDe?: { actor: string; hace: number } | null }) | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [trayendo, setTrayendo] = useState<string | null>(null);
  const [resultados, setResultados] = useState<Record<string, ResultadoFila>>({});

  async function abrir() {
    setAbierto(true);
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/clients/traer-de-hubspot");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo consultar HubSpot.");
      setUniverso(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo consultar HubSpot.");
    } finally {
      setCargando(false);
    }
  }

  async function traer(empresa: EmpresaTraible, confirmoGemela: boolean) {
    setTrayendo(empresa.companyId);
    try {
      const res = await fetch("/api/clients/traer-de-hubspot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: empresa.companyId,
          hubspotServiceId: empresa.proyectos[0]?.hubspotServiceId,
          confirmoGemela,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResultados((r) => ({
          ...r,
          [empresa.companyId]: { tipo: "error", mensaje: data.error ?? "No se pudo traer." },
        }));
        return;
      }
      setResultados((r) => ({ ...r, [empresa.companyId]: { tipo: "listo", ...data } }));
      /* La tabla la pinta el servidor: sin esto el panel afirma «listo» sobre una lista que
         sigue mostrando lo de antes. */
      router.refresh();
    } catch {
      setResultados((r) => ({
        ...r,
        [empresa.companyId]: { tipo: "error", mensaje: "No se pudo traer." },
      }));
    } finally {
      setTrayendo(null);
    }
  }

  if (cuantas <= 0) return null;

  return (
    <>
      <Button
        variant="secondary"
        size="md"
        onClick={abrir}
        title="Empresas que en HubSpot ya tienen un proyecto y todavía no están acá."
      >
        Traer {cuantas} empresa{cuantas !== 1 ? "s" : ""} de HubSpot
      </Button>

      {/* En Modal y no inline: el botón vive dentro del toolbar, que es un flex, así que un
          panel ahí adentro se pinta AL LADO del buscador y parte la fila. El Modal además trae
          Escape, foco atrapado y scroll bloqueado sin escribir nada. */}
      <Modal
        open={abierto}
        onClose={() => setAbierto(false)}
        title="Traer empresas de HubSpot"
        size="lg"
      >
        <div className="space-y-2">
          {cargando ? (
            <p className="text-sm text-fg-muted">Buscando en HubSpot…</p>
          ) : universo ? (
            /* El denominador va PEGADO al número, no en un párrafo aparte: sin él, «2 empresas»
               no dice si son 2 de 3 o 2 de 300; en un párrafo, nadie lo lee. */
            <p className="text-sm text-fg-secondary">
              {universo.traibles.length} de {universo.totalConProyecto} empresas con proyecto en
              HubSpot no están acá.
            </p>
          ) : null}

          {error && <Alert variant="danger">{error}</Alert>}

          {universo?.enganchadaDe && (
            <p className="text-xs text-fg-muted">
              Ya lo está trayendo {universo.enganchadaDe.actor}, hace {universo.enganchadaDe.hace} s.
            </p>
          )}

          {universo?.traibles.map((e) => (
            <FilaEmpresa
              key={e.companyId}
              empresa={e}
              ocupada={trayendo === e.companyId}
              resultado={resultados[e.companyId]}
              onTraer={(confirmo) => traer(e, confirmo)}
            />
          ))}

          {universo && universo.traibles.length > 0 && (
            /* La consecuencia se dice UNA vez, al pie, y no en cada fila. */
            <p className="text-xs text-fg-muted border-t border-line pt-2">
              Se crea la empresa con su proyecto. Entra a Cobranza sin cobro cargado.
            </p>
          )}
          {universo && universo.sinEmpresaAsociada > 0 && (
            <p className="text-xs text-fg-muted">
              {universo.sinEmpresaAsociada} proyecto{universo.sinEmpresaAsociada !== 1 ? "s" : ""} sin
              empresa asociada en HubSpot.
            </p>
          )}
          {universo && universo.ilegibles > 0 && (
            <p className="text-xs text-warn-ink">
              HubSpot no contestó por {universo.ilegibles} proyecto
              {universo.ilegibles !== 1 ? "s" : ""}. Volvé a abrir en un minuto.
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}

interface ResultadoFila {
  tipo: "listo" | "error";
  mensaje?: string;
  clientId?: string;
  encargadoNombre?: string | null;
  loVasAVer?: boolean;
  sinEncargado?: boolean;
}

function FilaEmpresa({
  empresa,
  ocupada,
  resultado,
  onTraer,
}: {
  empresa: EmpresaTraible;
  ocupada: boolean;
  resultado?: ResultadoFila;
  onTraer: (confirmoGemela: boolean) => void;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const proyecto = empresa.proyectos[0];
  const gemela = empresa.gemelas[0];

  if (resultado?.tipo === "listo") {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-success-line bg-success-surface px-3 py-2">
        <span className="text-sm font-medium text-success-ink">
          «{empresa.rotulo}» ya está en Nexus.
        </span>
        {/* Los TRES desenlaces, uno por frase corta. Sin el tercero, quien trae un proyecto sin
            encargado lee «es de otro», culpa a la regla de visibilidad y se va creyendo que
            funcionó. */}
        <span className="text-xs text-success-ink/80">
          {resultado.sinEncargado
            ? "No le aparece a nadie: el proyecto no tiene encargado en HubSpot."
            : resultado.loVasAVer
              ? "Te aparece en tu lista."
              : `Le aparece a ${resultado.encargadoNombre ?? "su encargado"}, no a vos.`}
        </span>
        {resultado.clientId && (
          <a href={`/clients/${resultado.clientId}`} className="text-xs text-brand hover:underline">
            Abrir
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-surface-muted px-3 py-2 space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-fg truncate">{empresa.rotulo}</p>
          {/* Se cayó el tipo de pipeline: es el mismo en casi todas y no cambia la decisión.
              Queda el nombre del proyecto (para reconocerlo) y el encargado (que decide a quién
              le va a aparecer). */}
          <p className="text-xs text-fg-muted truncate">
            «{proyecto?.nombre}»{proyecto?.encargadoNombre && ` · ${proyecto.encargadoNombre}`}
          </p>
        </div>
        {!gemela && (
          <Button variant="secondary" size="xs" loading={ocupada} onClick={() => onTraer(false)}>
            Traer
          </Button>
        )}
      </div>

      {gemela && (
        /**
         * ⚠ EL CAMINO IRREVERSIBLE PIDE DOS CLICS, Y LOS DOS SON BOTONES DE VERDAD.
         *
         * La primera versión ponía «Es otra → traer igual» como texto plano al lado de un botón:
         * la opción que CREA UNA FICHA DUPLICADA era la que menos parecía un control, y se
         * apretaba sin querer. Pasó en la primera prueba y dejó dos «kamalio» en producción.
         *
         * Ahora: los dos son botones, el seguro («Abrirla») es el sólido, y el que duplica abre
         * una confirmación que NOMBRA a las dos empresas — no se puede contestar en automático,
         * porque para decir que sí hay que haber leído cuál es cuál.
         */
        <div className="rounded-lg border border-warn-line bg-warn-surface px-2.5 py-2">
          {!confirmando ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-warn-ink flex-1 min-w-40">
                ⚠ Ya existe «{gemela.nombre}» en Nexus.
              </span>
              <Button
                variant="primary"
                size="xs"
                onClick={() => router.push(`/clients/${gemela.clientId}`)}
              >
                Es la misma → abrirla
              </Button>
              <Button variant="secondary" size="xs" onClick={() => setConfirmando(true)}>
                Es otra empresa
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-warn-ink flex-1 min-w-40">
                ¿«{empresa.rotulo}» es distinta de «{gemela.nombre}»? Se va a crear una ficha
                aparte.
              </span>
              <Button
                variant="destructive-solid"
                size="xs"
                loading={ocupada}
                onClick={() => onTraer(true)}
              >
                Sí, es otra: traerla
              </Button>
              <Button variant="secondary" size="xs" onClick={() => setConfirmando(false)}>
                Cancelar
              </Button>
            </div>
          )}
        </div>
      )}

      {resultado?.tipo === "error" && <Alert variant="danger">{resultado.mensaje}</Alert>}
    </div>
  );
}
