"use client";

/**
 * components/exploraciones/PedirleANexus.tsx — «✨ Mejorar con IA» de La escala DENTRO del cajón «Nexus» (23 nov, etapas 2
 * y 3 del plan maestro de «Hablar con Nexus»): lo monta HablarConNexus.tsx cuando el cajón se abrió con el lugar como chip.
 * Hasta la etapa 2 era un panel al lado de la página; se retiró (no quedan los dos). Un pedido, una propuesta: no es una
 * conversación. Cerrar el cajón no pierde nada: el pedido de cada lugar queda recordado mientras la página esté abierta
 * (lib/pedirle-a-nexus/recordado.ts).
 *
 * Arriba, el lugar (lo pone el botón: el Resumen o un área y, desde el 24 nov, la sección desde la que se pidió; la sección
 * se puede quitar para pedir sobre toda la página) y la caja para pedir. Debajo, la propuesta en el marco de siempre
 * (`<AgentProposal>`): cada cambio con el antes y el después, «Aplicar» y «Descartar» por pieza, y «Aplicar todo». Lo que
 * escribió el equipo no se reemplaza sin preguntar, y lo interno que pediste llega con su aviso (`AVISO_DE_LO_INTERNO`):
 * «Aplicar todo» deja los dos para que los decidas uno por uno, y «Aplicar» pregunta. Lo que la revisión del código
 * descartó se ve, con el porqué.
 *
 * Aplicar escribe por el camino de la edición a mano (lib/exploraciones/escala-con-nexus-server.ts) y nunca publica: el
 * aviso dice que hay cambios que el cliente no ve, con «Deshacer». Si otra persona cambió una parte entretanto, no se aplica
 * nada y se dice qué dice ahora.
 */
import { useState, useSyncExternalStore } from "react";
import { leerRecordado, recordar, SIN_PEDIDO, suscribirAlRecordado, type EstadoDelCambio, type PedidoRecordado } from "@/lib/pedirle-a-nexus/recordado";
import { Alert, Button, ConfirmDialog, IconButton, Textarea } from "@/components/ui";
import { AgentProposal } from "@/components/ai/AgentProposal";
import { AVISO_DE_LO_INTERNO, MAX_PEDIDO, NOMBRE_DEL_BOTON, type CambioParaAplicar, type CambioPropuesto, type Choque, type DeshacerDeNexus, type PropuestaDeNexus } from "@/lib/pedirle-a-nexus/contrato";
import type { LugarEnLaEscala } from "@/lib/exploraciones/escala-con-nexus";

/**
 * La clave del pedido recordado de un lugar de La escala (lib/pedirle-a-nexus/recordado.ts). Cada sección tiene el suyo (24
 * nov): lo pedido desde «Puntos clave» no aparece al abrir desde «Tu operación».
 */
export const claveDelPedido = (exploracionId: string, lugar: LugarEnLaEscala, seccion: string | null = null): string =>
  `escala:${exploracionId}:${lugar.pagina === "resumen" ? "resumen" : `area:${lugar.areaId}`}${seccion ? `:${seccion}` : ""}`;

/** El pedido recordado de un lugar (la misma referencia hasta que cambia: lo pide `useSyncExternalStore`). */
function useRecordado(clave: string): PedidoRecordado {
  return useSyncExternalStore(
    suscribirAlRecordado,
    () => leerRecordado(clave),
    () => SIN_PEDIDO,
  );
}

const EJEMPLO = "Por ejemplo: «cambia el titular a algo sobre la cobranza» o «agrega un punto clave sobre el WhatsApp, que es crítico».";

function Cambio({ c, estado, aplicando, onAplicar, onDescartar }: { c: CambioPropuesto; estado: EstadoDelCambio; aplicando: boolean; onAplicar: () => void; onDescartar: () => void }) {
  return (
    <li className={`rounded-xl border border-line bg-surface px-3 py-2.5 ${estado !== "pendiente" ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <p className="text-xs font-semibold text-fg">
          {c.nombre}
          {c.agregar && <span className="ml-1.5 font-normal text-brand">· nueva</span>}
          {c.despues === null && <span className="ml-1.5 font-normal text-fg-muted">· se quita</span>}
        </p>
        <span className="text-[11px] text-fg-muted">{c.seccion}</span>
      </div>
      {c.aMano && estado === "pendiente" && <p className="mt-1 text-[11px] text-fg-secondary">La escribió tu equipo: te pregunto antes de reemplazarla.</p>}
      {c.interno && <p className="mt-1 text-[11px] font-semibold text-warn-ink">{AVISO_DE_LO_INTERNO}</p>}
      {/* Lo que lo respalda (24 nov): Nexus no juzga si dice lo mismo que lo pedido; quien aplica lo compara. */}
      {c.respaldo && c.respaldo.length > 0 && (
        <div className="mt-1.5 rounded-lg border border-dashed border-line bg-surface-muted px-2.5 py-1.5 text-[11px] text-fg-secondary">
          <p className="font-semibold text-fg-muted">Lo que Nexus tiene de la cuenta (compáralo antes de aplicar):</p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
            {c.respaldo.map((r) => (
              <li key={r}>«{r}»</li>
            ))}
          </ul>
        </div>
      )}
      {c.antes !== null && <p className="mt-1.5 whitespace-pre-line text-xs text-fg-muted line-through">{c.antes}</p>}
      {c.despues !== null && <p className="mt-1 whitespace-pre-line text-sm text-fg">{c.despues}</p>}
      <div className="mt-2 flex items-center gap-2">
        {estado === "pendiente" ? (
          <>
            <Button size="sm" variant="primary" disabled={aplicando} onClick={onAplicar}>
              Aplicar
            </Button>
            <Button size="sm" variant="ghost" disabled={aplicando} onClick={onDescartar}>
              Descartar
            </Button>
          </>
        ) : (
          <span className="text-[11px] font-semibold text-fg-muted">{estado === "aplicado" ? "Aplicado" : "Descartado"}</span>
        )}
      </div>
    </li>
  );
}

export default function PedirleANexus({
  exploracionId,
  lugar,
  lugarNombre,
  foco,
  onQuitarFoco,
  onCerrar,
  rotuloDeCerrar = "Cerrar",
  alCambiar,
}: {
  exploracionId: string;
  lugar: LugarEnLaEscala;
  /** «Resumen» o el nombre del área. */
  lugarNombre: string;
  /** La sección desde la que se pidió (lib/external/secciones-de-la-escala.ts); null: la página entera. */
  foco: string | null;
  onQuitarFoco: () => void;
  onCerrar: () => void;
  /** El rótulo de `onCerrar`: dentro del cajón «Nexus», vuelve a la conversación. */
  rotuloDeCerrar?: string;
  /** Después de aplicar o deshacer (o de un choque): la página y el lienzo se ponen al día. */
  alCambiar: () => void;
}) {
  // El pedido de este lugar vive en el almacén del módulo (abajo): cerrar el cajón y volver a abrirlo lo trae como estaba.
  const clave = claveDelPedido(exploracionId, lugar, foco);
  const { pedido, pidiendo, error, propuesta, estados, aplicando, choques, hecho } = useRecordado(clave);
  /** El cambio de una pieza escrita por el equipo, esperando que la persona confirme. */
  const [aConfirmar, setAConfirmar] = useState<CambioPropuesto | null>(null);

  const pedir = async () => {
    const texto = pedido.trim();
    if (!texto || pidiendo) return;
    recordar(clave, { pidiendo: true, error: null, choques: [], hecho: null });
    const r = await fetch(`/api/sales/exploraciones/${exploracionId}/escala/nexus`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lugar, pedido: texto, foco }),
    }).catch(() => null);
    const data = ((await r?.json().catch(() => ({}))) ?? {}) as { propuesta?: PropuestaDeNexus; error?: string };
    // Aunque el cajón se haya cerrado mientras Nexus pensaba: la respuesta queda para cuando se vuelva a abrir.
    if (!r?.ok || !data.propuesta) {
      recordar(clave, { pidiendo: false, error: data.error ?? "Nexus no pudo proponer. Vuelve a intentarlo." });
      return;
    }
    recordar(clave, { pidiendo: false, propuesta: data.propuesta, estados: {} });
  };

  /** Aplica (o deshace: vuelve a la versión de antes) por la ruta de la página. Devuelve si salió. */
  const enviar = async (pedidoAlServidor: { cambios: CambioParaAplicar[] } | { deshacer: DeshacerDeNexus }): Promise<boolean> => {
    const deshacer = "deshacer" in pedidoAlServidor;
    // «Deshacer» vuelve a como estaba antes del ÚLTIMO «Aplicar»: solo esas piezas quedan otra vez por decidir.
    const deshechas = deshacer ? (leerRecordado(clave).hecho?.claves ?? []) : [];
    recordar(clave, { aplicando: true, error: null, choques: [] });
    const r = await fetch(`/api/sales/exploraciones/${exploracionId}/escala/nexus`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(deshacer ? { lugar, ...pedidoAlServidor } : { lugar, ...pedidoAlServidor, pedido: leerRecordado(clave).propuesta?.pedido ?? null }),
    }).catch(() => null);
    const data = ((await r?.json().catch(() => ({}))) ?? {}) as { aviso?: string; deshacer?: DeshacerDeNexus | null; error?: string; choques?: Choque[] };
    if (!r?.ok) {
      recordar(clave, { aplicando: false, error: data.error ?? "No se pudo aplicar.", choques: data.choques ?? [] });
      // Lo que cambió otra persona se ve en la página.
      alCambiar();
      return false;
    }
    recordar(clave, (e) => ({
      aplicando: false,
      hecho: deshacer || !("cambios" in pedidoAlServidor) ? null : { aviso: data.aviso ?? "Listo.", deshacer: data.deshacer ?? null, claves: pedidoAlServidor.cambios.map((c) => c.clave) },
      estados: deshacer ? Object.fromEntries(Object.entries(e.estados).filter(([k]) => !deshechas.includes(k))) : e.estados,
    }));
    alCambiar();
    return true;
  };

  const aplicar = async (lista: CambioPropuesto[]) => {
    if (!lista.length) return;
    const ok = await enviar({ cambios: lista.map((c) => ({ clave: c.clave, antes: c.antes, despues: c.despues })) });
    if (ok) recordar(clave, (e) => ({ estados: { ...e.estados, ...Object.fromEntries(lista.map((c) => [c.clave, "aplicado" as const])) } }));
  };

  const pendientes = (propuesta?.cambios ?? []).filter((c) => (estados[c.clave] ?? "pendiente") === "pendiente");
  // Lo escrito por el equipo y lo interno se deciden uno por uno, con su pregunta (24 nov: lo interno, como lo escrito a mano).
  const sinPreguntar = pendientes.filter((c) => !c.aMano && !c.interno);
  const descartar = (c: CambioPropuesto) => recordar(clave, (e) => ({ estados: { ...e.estados, [c.clave]: "descartado" } }));
  const setPedido = (texto: string) => recordar(clave, { pedido: texto });
  const descartarTodo = () => recordar(clave, { propuesta: null, estados: {} });

  return (
    <section aria-label={NOMBRE_DEL_BOTON} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fg">{NOMBRE_DEL_BOTON}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-fg-muted">
            <span>Página de La escala › {lugarNombre}</span>
            {foco && (
              <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-muted px-2 py-0.5 text-fg-secondary">
                › {foco}
                <IconButton aria-label="Pedir sobre toda la página" icon={<span aria-hidden="true">×</span>} onClick={onQuitarFoco} />
              </span>
            )}
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={onCerrar}>
          {rotuloDeCerrar}
        </Button>
      </div>

      <Textarea
        value={pedido}
        rows={3}
        maxLength={MAX_PEDIDO}
        placeholder={EJEMPLO}
        aria-label="Qué quieres que Nexus cambie"
        onChange={(e) => setPedido(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void pedir();
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-fg-muted">Nexus propone; tú aplicas. Nada se publica.</p>
        <Button size="sm" variant="primary" loading={pidiendo} disabled={!pedido.trim()} onClick={() => void pedir()}>
          {pidiendo ? "Nexus está leyendo la página…" : "Pedir"}
        </Button>
      </div>

      {error && (
        <Alert variant={choques.length ? "warning" : "danger"} title={choques.length ? "Otra persona cambió esto" : "No se pudo"}>
          {error}
          {choques.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {choques.map((x) => (
                <li key={x.clave}>
                  {x.nombre ?? "Una parte"}: {x.ahora === null ? "ya no está." : `ahora dice «${x.ahora}».`}
                </li>
              ))}
            </ul>
          )}
        </Alert>
      )}

      {hecho && (
        <Alert variant="success" title="Aplicado">
          {hecho.aviso}{" "}
          {hecho.deshacer && (
            <Button size="sm" variant="secondary" className="ml-1" loading={aplicando} onClick={() => hecho.deshacer && void enviar({ deshacer: hecho.deshacer })}>
              Deshacer
            </Button>
          )}
        </Alert>
      )}

      {propuesta && (
        <AgentProposal
          title={propuesta.cambios.length ? "Lo que propone Nexus" : "Nexus no propone cambios"}
          subtitle={
            propuesta.cambios.length
              ? sinPreguntar.length < pendientes.length
                ? "«Aplicar todo» deja para el final lo que escribió tu equipo y lo interno de la venta: eso lo decides uno por uno."
                : "Revisa cada cambio: aplica uno por uno o todos juntos."
              : undefined
          }
          summary={propuesta.cambios.length ? [`${propuesta.cambios.length} ${propuesta.cambios.length === 1 ? "cambio" : "cambios"}`] : undefined}
          reasoning={propuesta.nota ?? undefined}
          applyLabel="Aplicar todo"
          applyDisabled={!sinPreguntar.length}
          applying={aplicando}
          onApply={() => aplicar(sinPreguntar)}
          onDiscard={descartarTodo}
        >
          {propuesta.cambios.length > 0 && (
            <ul className="flex flex-col gap-2">
              {propuesta.cambios.map((c) => (
                <Cambio
                  key={c.clave}
                  c={c}
                  estado={estados[c.clave] ?? "pendiente"}
                  aplicando={aplicando}
                  onAplicar={() => (c.aMano || c.interno ? setAConfirmar(c) : void aplicar([c]))}
                  onDescartar={() => descartar(c)}
                />
              ))}
            </ul>
          )}
          {propuesta.descartados.length > 0 && (
            <details className="text-xs text-fg-muted">
              <summary className="cursor-pointer font-semibold text-fg-secondary">Lo que Nexus escribió y no pasó la revisión ({propuesta.descartados.length})</summary>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {propuesta.descartados.map((x, i) => (
                  <li key={`${x.clave ?? "x"}-${i}`}>
                    {x.nombre ? `${x.nombre}: ` : ""}«{x.texto}» — {x.motivo}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </AgentProposal>
      )}

      <ConfirmDialog
        open={!!aConfirmar}
        onCancel={() => setAConfirmar(null)}
        onConfirm={() => {
          const c = aConfirmar;
          setAConfirmar(null);
          if (c) void aplicar([c]);
        }}
        title={aConfirmar?.interno ? "¿Llevar algo interno de la venta a la página?" : "¿Reemplazar lo que escribió tu equipo?"}
        description={
          aConfirmar
            ? [
                aConfirmar.interno ? `${AVISO_DE_LO_INTERNO} Aplicar no publica: queda en «${aConfirmar.nombre}» hasta que alguien publique.` : null,
                aConfirmar.respaldo?.length ? "Compara con lo que Nexus tiene de la cuenta, debajo del cambio: Nexus no revisa si dice lo mismo." : null,
                aConfirmar.aMano ? `«${aConfirmar.nombre}» la escribió una persona. Si aplicas, queda lo que propone Nexus (y lo de antes, en el historial).` : null,
              ]
                .filter(Boolean)
                .join(" ")
            : ""
        }
        confirmLabel={aConfirmar?.interno ? "Sí, llevarlo a la página" : "Sí, reemplazarla"}
      />
    </section>
  );
}
