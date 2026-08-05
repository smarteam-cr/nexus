"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Alert, Modal } from "@/components/ui";
import type { UniversoTraible, EmpresaTraible } from "@/lib/hubspot/empresas-con-proyecto";

/**
 * app/(shell)/clients/TraerDeHubspot.tsx — el botón que trae empresas que HubSpot ya tiene.
 *
 * ── LO QUE DECIDE SU FORMA ──────────────────────────────────────────────────
 * Se trae **de a una**, no todas de golpe, y no es una preferencia estética: de las 4 empresas
 * que el criterio ofrecía al medir, **3 ya eran clientes de Nexus** creados por el importador de
 * cobranza SIN `hubspotCompanyId` — o sea invisibles para el cruce por id. Un botón de «traer
 * todas» habría fabricado tres fichas gemelas de clientes que están facturando el primer día, y
 * partir un cliente en dos parte la plata (la cuenta y los cobros en una ficha) del trabajo (el
 * proyecto en la otra). Por eso cada fila muestra la ficha parecida ANTES de traer.
 *
 * ⚠ El botón NO se pinta cuando no hay nada que traer. Es la regla que este mismo directorio
 * escribe dos veces (la píldora que no parte el universo, la pestaña de categoría vacía): un
 * control que se contesta siempre igual es un control muerto. Y este universo se agota solo —
 * hoy quedan 2 de 61.
 */
export default function TraerDeHubspot({ cuantas }: { cuantas: number }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [universo, setUniverso] = useState<UniversoTraible & { enganchadaDe?: { actor: string; hace: number } | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** companyId → estado de esa fila. */
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
        setResultados((r) => ({ ...r, [empresa.companyId]: { tipo: "error", mensaje: data.error ?? "No se pudo traer." } }));
        return;
      }
      setResultados((r) => ({ ...r, [empresa.companyId]: { tipo: "listo", ...data } }));
      /* La tabla la pinta el servidor: sin esto el panel afirma «listo» sobre una lista que
         sigue mostrando lo de antes. */
      router.refresh();
    } catch {
      setResultados((r) => ({ ...r, [empresa.companyId]: { tipo: "error", mensaje: "No se pudo traer." } }));
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
        title={
          `HubSpot tiene ${cuantas} empresa${cuantas !== 1 ? "s" : ""} con un proyecto que todavía no está acá. ` +
          "Las traés de a una, con su proyecto. No borra ni cambia nada de lo que ya existe."
        }
      >
        Traer {cuantas} empresa{cuantas !== 1 ? "s" : ""} de HubSpot
      </Button>

      {/* En Modal y no inline: el botón vive dentro del toolbar, que es un flex, así que un
          panel ahí adentro se pinta AL LADO del buscador y parte la fila. El Modal además trae
          Escape, foco atrapado y scroll bloqueado sin escribir nada. */}
      <Modal open={abierto} onClose={() => setAbierto(false)} title="Traer empresas de HubSpot" size="lg">
        <div className="space-y-3">
          <div className="min-w-0">
            {cargando ? (
              <p className="text-sm text-fg-muted">Buscando en HubSpot…</p>
            ) : universo ? (
              <>
                <p className="text-sm font-semibold text-fg">
                  {universo.traibles.length} empresa{universo.traibles.length !== 1 ? "s" : ""} tiene
                  {universo.traibles.length === 1 ? "" : "n"} un proyecto que todavía no está en Nexus.
                </p>
                {/* El denominador honesto: sin esto, «2 empresas» no dice si son 2 de 3 o 2 de 300. */}
                <p className="text-xs text-fg-muted mt-0.5">
                  HubSpot tiene {universo.totalConProyecto} empresas con proyecto.{" "}
                  {universo.yaEnNexus} ya estaban acá
                  {universo.yaTraidoBajoOtraFicha > 0 &&
                    `, y ${universo.yaTraidoBajoOtraFicha} más tienen su proyecto ya traído bajo otra ficha`}
                  .
                </p>
              </>
            ) : null}
          </div>

          {error && <Alert variant="danger">{error}</Alert>}

          {universo?.enganchadaDe && (
            <p className="text-xs text-fg-muted">
              Ya lo está trayendo {universo.enganchadaDe.actor}, hace {universo.enganchadaDe.hace} segundos.
              Este es el resultado de esa búsqueda.
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

          {universo && universo.sinEmpresaAsociada > 0 && (
            <p className="text-xs text-fg-muted border-t border-line pt-2">
              {universo.sinEmpresaAsociada} proyecto{universo.sinEmpresaAsociada !== 1 ? "s" : ""} de HubSpot
              no tiene{universo.sinEmpresaAsociada !== 1 ? "n" : ""} ninguna empresa asociada, así que no se
              puede{universo.sinEmpresaAsociada !== 1 ? "n" : ""} traer desde acá hasta que alguien se la
              asocie allá.
            </p>
          )}
          {universo && universo.ilegibles > 0 && (
            <p className="text-xs text-warn-ink border-t border-line pt-2">
              HubSpot no contestó por {universo.ilegibles} proyecto{universo.ilegibles !== 1 ? "s" : ""}. No se
              muestran acá para no ofrecer algo equivocado; volvé a abrir el panel en un minuto.
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
  termino?: boolean;
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
  const proyecto = empresa.proyectos[0];

  if (resultado?.tipo === "listo") {
    return (
      <div className="rounded-lg border border-success-line bg-success-surface px-3 py-2">
        <p className="text-sm font-medium text-success-ink">
          Listo: «{empresa.rotulo}» ya está en Nexus, con su proyecto.
        </p>
        {/* Los TRES desenlaces. Sin el tercero, quien trae un proyecto sin encargado lee «es de
            otro», culpa a la regla de visibilidad y se va creyendo que funcionó. */}
        <p className="text-xs text-success-ink/80 mt-0.5">
          {resultado.sinEncargado
            ? "Ese proyecto no tiene encargado en HubSpot, así que no le aparece a nadie en su lista. Poné «CSL Encargado» en HubSpot y se acomoda solo."
            : resultado.loVasAVer
              ? "Te aparece en tu lista porque figurás como encargado del proyecto en HubSpot."
              : `En tu lista no la vas a ver: el encargado del proyecto en HubSpot es ${resultado.encargadoNombre ?? "otra persona"}, así que le aparece a él. Si tiene que ser tuya, cambiá «CSL Encargado» en HubSpot y en unos minutos se acomoda solo.`}
        </p>
        {resultado.clientId && (
          <a href={`/clients/${resultado.clientId}`} className="text-xs text-brand hover:underline">
            Abrir la empresa
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
          <p className="text-xs text-fg-muted">
            {empresa.proyectos.length} proyecto{empresa.proyectos.length !== 1 ? "s" : ""}: «{proyecto?.nombre}»
            {proyecto?.tipo && ` · ${proyecto.tipo}`}
            {proyecto?.encargadoNombre && ` · Encargado: ${proyecto.encargadoNombre}`}
          </p>
        </div>
        {empresa.gemelas.length === 0 && (
          <Button variant="secondary" size="xs" loading={ocupada} onClick={() => onTraer(false)}>
            Traer
          </Button>
        )}
      </div>

      {empresa.gemelas.length > 0 && (
        <div className="rounded-lg border border-warn-line bg-warn-surface px-2.5 py-2">
          <p className="text-xs text-warn-ink">
            ⚠ En Nexus ya existe «{empresa.gemelas[0].nombre}». Puede ser la misma empresa con dos
            fichas en HubSpot.
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <a
              href={`/clients/${empresa.gemelas[0].clientId}`}
              className="text-xs font-medium px-2.5 py-1 rounded-lg border border-brand/30 bg-brand/15 text-brand hover:bg-brand/25"
            >
              Es la misma → abrir «{empresa.gemelas[0].nombre}»
            </a>
            <button
              onClick={() => onTraer(true)}
              disabled={ocupada}
              className="text-xs text-fg-muted hover:text-fg-secondary disabled:opacity-50"
            >
              {ocupada ? "Trayendo…" : "Es otra empresa → traerla igual"}
            </button>
          </div>
        </div>
      )}

      {/* Se dice lo que va a pasar ANTES de escribir. */}
      <p className="text-2xs text-fg-muted">
        Se crea la empresa en Nexus y se le cuelga ese proyecto. Va a aparecer en Cobranza como
        cuenta sin configurar hasta que alguien le cargue el cobro.
      </p>

      {resultado?.tipo === "error" && <Alert variant="danger">{resultado.mensaje}</Alert>}
    </div>
  );
}
