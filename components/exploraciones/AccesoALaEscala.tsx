"use client";

/**
 * AccesoALaEscala — el botón «Acceso» de La escala, en la cuenta y en la preventa (Elías, 30 oct). Con los estilos del
 * acceso de un proyecto (ExternalAccessPanel): verde activo, ámbar revocado, candado si todavía no se generó. Crea el
 * enlace con que la empresa ve su escala, una página como la del resultado del test, y lo revoca.
 * Datos: /api/sales/exploraciones/[id]/acceso. Lo que ve el cliente lo decide lib/exploraciones/escala-para-el-cliente.ts.
 *
 * «Qué equipos ve» (2026-11-08, Centauro Solutions): Nexus detecta de qué equipos se habló (equipos-de-la-escala.ts) y el
 * vendedor elige cuáles salen, con una casilla por área. Sin elegir, salen las en juego con algo usado (como antes: un
 * enlace ya enviado no suma áreas solo); las demás se suman con un clic. Desde el 8 nov un área sin nada usado también
 * se puede elegir: la página la muestra «En medición» (Elías: «también debería poder aparecer»). La elección está en el
 * botón «Qué ve el cliente» (arriba a la derecha, junto a «Acceso») y sigue dentro de «Acceso».
 */
import { useCallback, useEffect, useState } from "react";
import { Alert, Modal, useToast } from "@/components/ui";
import { BOTON_DE_HERRAMIENTA, BotonAzul, BotonBlanco, BotonEnlace } from "@/components/ui/sistema";
import type { EstadoDelAcceso } from "@/lib/exploraciones/acceso-a-la-escala";
import { areasParaElCliente, type AreaDeLaEscala } from "@/lib/exploraciones/equipos-de-la-escala";
import { diaYHora } from "@/lib/exploraciones/fechas";
import { useAreasDeLaEscala } from "./useAreasDeLaEscala";
import { useLienzo } from "./contexto";

/** Lo que se sabe de un área, en una línea: lo que vería el cliente o por qué no se puede elegir. */
function loQueTiene(a: AreaDeLaEscala): string {
  const usadas = [a.conEvidencia ? `${a.conEvidencia} con evidencia` : null, a.porExplorar ? `${a.porExplorar} por explorar` : null].filter(Boolean).join(" · ");
  if (usadas) return `${usadas} de ${a.partes}`;
  if (a.sugeridas) return `${a.sugeridas} ${a.sugeridas === 1 ? "sugerida" : "sugeridas"} sin usar: sale «En medición»; úsalas en La escala para que tenga nivel`;
  return a.seHablo ? "se habló de ella, pero no tiene nada ubicado: sale «En medición»" : "todavía no se habló de ella: sale «En medición»";
}

/** Una casilla por área: Nexus marca las que tienen algo; el vendedor decide. */
function EquiposQueVe() {
  const { exp, cambiar, puedeEditar, guardando } = useLienzo();
  const areas = useAreasDeLaEscala();
  const elegidas = exp.estado.contenido.areasAlCliente;
  const salen = areasParaElCliente(areas, elegidas);
  const alternar = (id: string) => {
    const base = elegidas ?? salen;
    void cambiar([{ op: "areasAlCliente", areas: base.includes(id) ? base.filter((x) => x !== id) : [...base, id] }]);
  };
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-semibold text-fg">Qué equipos ve</legend>
      <p className="text-xs text-fg-muted">
        {elegidas ? "Los elegiste tú." : "Por ahora salen las áreas en juego; suma las otras de las que se habló."} Lo por explorar sale marcado así: es lo que
        creemos por lo conversado, para confirmarlo con ellos. Lo que el agente sugiere y nadie usó no sale.
      </p>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {areas.map((a) => {
          return (
            <li key={a.id}>
              <label className={`flex items-start gap-2.5 px-3 py-2 ${puedeEditar ? "cursor-pointer" : ""}`}>
                <input
                  type="checkbox"
                  className="mt-0.5 accent-[var(--color-brand)]"
                  checked={salen.includes(a.id)}
                  disabled={!puedeEditar || guardando}
                  onChange={() => alternar(a.id)}
                />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-fg">
                    {a.nombre}
                    {a.seHablo && <span className="ml-1.5 text-[11px] font-normal text-fg-muted">se habló en las reuniones</span>}
                  </span>
                  <span className="block text-xs text-fg-muted">{loQueTiene(a)}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

/**
 * «Qué ve el cliente» (8 nov, Elías: «desde la escala… debería seleccionarse cuáles se pueden ver en la página de
 * resultados, como un CTA de los de arriba a la derecha»): el botón dice qué equipos salen y abre la misma elección.
 */
export function QueVeElCliente() {
  const { exp } = useLienzo();
  const areas = useAreasDeLaEscala();
  const [abierto, setAbierto] = useState(false);
  const salen = areasParaElCliente(areas, exp.estado.contenido.areasAlCliente);
  const nombres = salen.map((id) => areas.find((a) => a.id === id)?.nombre).filter(Boolean).join(" · ");
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className={BOTON_DE_HERRAMIENTA} title="Qué equipos se ven en la página de resultados del cliente">
        Qué ve el cliente
        <span className="font-normal text-fg-muted">{nombres || "ningún equipo"}</span>
      </button>
      <Modal open={abierto} onClose={() => setAbierto(false)} title="Qué ve el cliente" description="Los equipos que salen en la página de resultados. Uno sin nada ubicado sale «En medición».">
        <EquiposQueVe />
      </Modal>
    </>
  );
}

const PUNTO = { activo: "bg-success-ink", revocado: "bg-warn-ink" } as const;
const NOMBRE_DEL_ESTADO = { activo: "activo", revocado: "revocado", "sin-generar": "sin generar" } as const;

export default function AccesoALaEscala() {
  const { exp, puedeEditar } = useLienzo();
  const toast = useToast();
  const [acceso, setAcceso] = useState<EstadoDelAcceso | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revocando, setRevocando] = useState(false);

  const pedir = useCallback(
    async (method: "GET" | "POST" | "DELETE") => {
      const r = await fetch(`/api/sales/exploraciones/${exp.id}/acceso`, { method, cache: "no-store" });
      const j = (await r.json().catch(() => null)) as (EstadoDelAcceso & { error?: string }) | null;
      if (!r.ok || !j) throw new Error(j?.error ?? "No se pudo hacer el cambio.");
      return j;
    },
    [exp.id],
  );

  useEffect(() => {
    let vivo = true;
    pedir("GET")
      .then((j) => vivo && setAcceso(j))
      .catch((e: unknown) => vivo && setError(e instanceof Error ? e.message : "No se pudo leer el acceso."));
    return () => {
      vivo = false;
    };
    // Con cada cambio de lo confirmado cambia lo que vería el cliente.
  }, [pedir, exp.version]);

  const hacer = async (method: "POST" | "DELETE") => {
    setTrabajando(true);
    setError(null);
    setRevocando(false);
    try {
      setAcceso(await pedir(method));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo hacer el cambio.");
    } finally {
      setTrabajando(false);
    }
  };

  const copiar = async (enlace: string) => {
    try {
      await navigator.clipboard.writeText(enlace);
      toast.success("Enlace copiado.");
    } catch {
      toast.error("No se pudo copiar: selecciónalo y cópialo a mano.");
    }
  };

  const estado = acceso?.estado ?? "sin-generar";
  const noAbre = estado === "activo" && acceso?.abre === false;
  const punto = estado === "sin-generar" ? null : noAbre ? PUNTO.revocado : PUNTO[estado];
  const deEsas = acceso?.porExplorar ? ` (${acceso.porExplorar} por explorar)` : "";
  const cuanto =
    acceso && acceso.medidas < acceso.total
      ? `Hoy vería ${acceso.medidas} de ${acceso.total} partes${deEsas}. Un área con partes sin nada no muestra su nivel general.`
      : `Hoy vería todas las partes${deEsas}.`;

  return (
    <>
      <button type="button" disabled={!acceso && !error} onClick={() => setAbierto(true)} className={BOTON_DE_HERRAMIENTA} title={`Acceso del cliente a la escala: ${NOMBRE_DEL_ESTADO[estado]}`}>
        {punto ? (
          <span className={`h-2 w-2 flex-shrink-0 rounded-full ${punto}`} aria-hidden="true" />
        ) : (
          <svg className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        )}
        Acceso
      </button>
      <Modal open={abierto} onClose={() => { setAbierto(false); setRevocando(false); }} title="Acceso del cliente a la escala" description="Una página como la del resultado del test, con lo que la empresa ya tiene ubicado. Quien tenga el enlace la ve.">
        <div className="space-y-3">
          {error && <Alert variant="danger">{error}</Alert>}
          {noAbre && <Alert variant="warning">Este enlace ya no abre: esta escala se archivó. Revócalo y comparte la que siga viva.</Alert>}
          {!noAbre && <EquiposQueVe />}
          {acceso && !noAbre && <p className="text-[13px] text-fg-secondary">{acceso.medidas ? cuanto : "Los equipos elegidos todavía no tienen nada ubicado: la página los muestra «En medición»."}</p>}
          {acceso?.enlace && (
            <>
              <input readOnly value={acceso.enlace} aria-label="Enlace para el cliente" onFocus={(e) => e.target.select()} className="w-full rounded-md border border-line bg-surface-muted px-2.5 py-1.5 text-[13px] text-fg-secondary" />
              <p className="text-xs text-fg-muted">{acceso.ultimaVista ? `Se abrió por última vez el ${diaYHora(acceso.ultimaVista)}.` : "Todavía nadie lo ha abierto."} La página muestra lo medido hoy. La preventa y la cuenta tienen cada una su enlace: revocar este no cierra el otro.</p>
              <div className="flex flex-wrap items-center gap-2">
                <BotonAzul onClick={() => void copiar(acceso.enlace!)}>Copiar enlace</BotonAzul>
                <a href={acceso.enlace} target="_blank" rel="noreferrer" className={BOTON_DE_HERRAMIENTA}>
                  Abrir la página
                </a>
                {puedeEditar && !revocando && <BotonEnlace onClick={() => setRevocando(true)}>Revocar el acceso</BotonEnlace>}
              </div>
              {revocando && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-muted px-3 py-2">
                  <p className="text-[13px] text-fg-secondary">El enlace dejará de abrir para quien ya lo tiene, y uno nuevo será otra dirección.</p>
                  <BotonBlanco disabled={trabajando} onClick={() => void hacer("DELETE")}>
                    Sí, revocar
                  </BotonBlanco>
                  <BotonEnlace onClick={() => setRevocando(false)}>Cancelar</BotonEnlace>
                </div>
              )}
            </>
          )}
          {acceso && !acceso.enlace && puedeEditar && (
            <div className="flex items-center gap-2">
              {estado === "revocado" && <p className="text-xs text-fg-muted">El enlace anterior ya no abre. El nuevo será otro.</p>}
              <BotonBlanco disabled={trabajando} onClick={() => void hacer("POST")}>
                {estado === "revocado" ? "Crear un enlace nuevo" : "Crear el acceso"}
              </BotonBlanco>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
