"use client";

/**
 * components/clients/NovedadesDelDocumento.tsx — la franja «N novedades de reuniones» arriba del documento abierto
 * (memoria de la cuenta, etapa 6; docs/DECISIONS.md «Hechos, enrutador y novedades»).
 *
 * Una novedad es lo que un hecho pendiente de una reunión le propone a una sección de este documento. Se calcula (no se
 * guarda) en lib/seguimiento/novedades.ts. Cada una es una fila azul con sus acciones, sobre las piezas del sistema:
 *   · «Cambiar con el chat» — abre el chat del documento con la sección señalada y la novedad adentro (viaja en el
 *     turno). Cuando el acuerdo se aplica, la novedad queda usada (lo hace el panel, `onNovedadesAplicadas`).
 *   · «Listo» — ya la cambiaste a mano: queda usada.
 *   · «No aplica» — queda desestimada y no vuelve.
 *   · «Sumar la reunión al contexto» — un clic humano que suma la reunión al «Contexto adicional» del documento.
 * En Integraciones avisa que aplicar es publicar: el desarrollador lo lee en vivo.
 *
 * ⛔ Va adentro de `ChatDeSeccionProvider` como un componente aparte: el que provee no consume (ChatDelDocumento.tsx).
 * ⛔ El ancla del recorrido va en el contenedor (`ficha.novedades`), no en `FranjaDeSugerencias`, que no pasa atributos.
 */
import { useState } from "react";
import { useToast } from "@/components/ui";
import { BotonBlanco, BotonEnlace, BotonTexto, BotonUsar, FilaSugerida, FranjaDeSugerencias } from "@/components/ui/sistema";
import { useChatDeSeccion } from "@/components/asistente/chat-de-seccion";
import { useMe } from "@/hooks/useMe";
import { documentoConContexto } from "@/lib/contexto/documento";
import { novedadesEnPalabras, type NovedadDeLaPieza, type NovedadesDeLaPieza } from "@/lib/seguimiento/novedades";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «8 oct», de un AAAA-MM-DD (sin zonas: es un día). */
function diaCorto(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return m && d ? `${d} ${MESES[m - 1] ?? ""}`.trim() : iso;
}

/** Lo que va después de «›» en el rótulo del registro: «Planificación › Pipelines» → «Pipelines». */
const seccionDelRotulo = (rotulo: string) => rotulo.split("›").pop()?.trim() || rotulo;

export default function NovedadesDelDocumento({
  projectId,
  pieza,
  secciones,
  novedades,
  abierta,
  onAlternar,
  onCambio,
  onReunionSumada,
}: {
  projectId: string;
  /** El slug del documento abierto. */
  pieza: string;
  /** Las secciones del documento, para nombrar la que se señala en el chat. */
  secciones: ReadonlyArray<{ key: string; label: string }>;
  novedades: NovedadesDeLaPieza;
  abierta: boolean;
  onAlternar: () => void;
  /** Algo se decidió: hay que volver a leer las novedades. */
  onCambio: () => void;
  /** La reunión se sumó al «Contexto adicional»: hay que volver a leerlo. */
  onReunionSumada: () => void;
}) {
  const toast = useToast();
  const chat = useChatDeSeccion();
  const me = useMe();
  const [ocupado, setOcupado] = useState<string | null>(null);
  // La celda de generar el documento: la misma que pide la ruta para decidir una novedad.
  const seccionDelPermiso = documentoConContexto(pieza)?.seccion;
  const puedeDecidir = !!seccionDelPermiso && me?.permissions?.sections?.[seccionDelPermiso]?.generate === true;
  const items = novedades.items;
  if (!items.length) return null;
  const enVivo = items.some((n) => n.publicaEnVivo);

  async function decidir(n: NovedadDeLaPieza, accion: "usar" | "desestimar") {
    setOcupado(n.hechoId);
    try {
      let alguna = false;
      let error: string | null = null;
      for (const id of [n.hechoId, ...n.mismos]) {
        const r = await fetch(`/api/projects/${encodeURIComponent(projectId)}/novedades/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accion, pieza }),
        });
        if (r.ok) alguna = true;
        else if (r.status !== 409) error = ((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "No se pudo guardar.";
      }
      if (error && !alguna) toast.error(error);
      else toast.success(accion === "usar" ? "Listo: la novedad quedó usada." : "Listo: no vuelve a aparecer.");
      onCambio();
    } catch {
      toast.error("No se pudo guardar. Revisa tu conexión.");
    } finally {
      setOcupado(null);
    }
  }

  async function sumarAlContexto(n: NovedadDeLaPieza) {
    if (!n.reunion.id) return;
    setOcupado(n.hechoId);
    try {
      const r = await fetch(`/api/projects/${encodeURIComponent(projectId)}/contexto/${encodeURIComponent(pieza)}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: n.reunion.id, feeds: true }),
      });
      if (!r.ok) {
        toast.error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "No se pudo sumar la reunión.");
        return;
      }
      toast.success(`Sumaste «${n.reunion.titulo}» al contexto de este documento.`);
      onReunionSumada();
    } catch {
      toast.error("No se pudo sumar la reunión. Revisa tu conexión.");
    } finally {
      setOcupado(null);
    }
  }

  function cambiarConElChat(n: NovedadDeLaPieza) {
    const s = n.secciones[0];
    if (!s) return;
    const label = secciones.find((x) => x.key === s.seccion)?.label ?? seccionDelRotulo(s.rotulo);
    chat.abrirCon({
      key: s.seccion,
      label,
      novedad: { pieza, hechoIds: [n.hechoId, ...n.mismos], frase: n.frase, cita: n.cita, reunion: n.reunion.titulo, fecha: n.reunion.fecha },
    });
  }

  return (
    <div data-recorrido="ficha.novedades" className="space-y-2">
      <FranjaDeSugerencias
        acciones={
          <BotonEnlace onClick={onAlternar} aria-expanded={abierta}>
            {abierta ? "Ocultar" : "Revisarlas"}
          </BotonEnlace>
        }
      >
        <span className="font-semibold">{novedadesEnPalabras(items.length)}</span> · lo que una reunión cambia en este documento. Nada se
        aplica solo.
      </FranjaDeSugerencias>
      {abierta && (
        <>
          {enVivo && (
            <p className="text-xs text-warn-ink">Integraciones se lee en vivo: lo que cambies acá lo ve el desarrollador al instante.</p>
          )}
          {!puedeDecidir && <p className="text-xs text-fg-muted">Las decide quien puede generar este documento.</p>}
          <ul className="space-y-2">
            {items.map((n) => (
              <FilaSugerida
                key={n.hechoId}
                encima={n.secciones.map((s) => seccionDelRotulo(s.rotulo)).join(" · ")}
                origen={
                  <span className="min-w-0 truncate">
                    De «{n.reunion.titulo}» · {diaCorto(n.reunion.fecha)}
                    {n.mismos.length ? ` · se dijo en ${n.mismos.length + 1} reuniones` : ""}
                  </span>
                }
                debajo={
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-fg-muted">Ver de dónde sale</summary>
                    <blockquote className="mt-1 border-l-2 border-line pl-2 text-xs italic text-fg-secondary">«{n.cita}»</blockquote>
                    {n.reunion.id && puedeDecidir && (
                      <BotonEnlace onClick={() => void sumarAlContexto(n)} disabled={ocupado !== null} className="mt-1">
                        Sumar la reunión al contexto
                      </BotonEnlace>
                    )}
                  </details>
                }
                acciones={
                  <>
                    {puedeDecidir && (
                      <BotonTexto onClick={() => void decidir(n, "desestimar")} disabled={ocupado !== null} title="No vuelve a aparecer">
                        No aplica
                      </BotonTexto>
                    )}
                    {puedeDecidir && (
                      <BotonBlanco onClick={() => void decidir(n, "usar")} disabled={ocupado !== null} title="Ya la cambiaste en el documento">
                        Listo
                      </BotonBlanco>
                    )}
                    {chat.disponible && (
                      <BotonUsar onClick={() => cambiarConElChat(n)} disabled={ocupado !== null}>
                        Cambiar con el chat
                      </BotonUsar>
                    )}
                  </>
                }
              >
                {n.frase}
              </FilaSugerida>
            ))}
          </ul>
          {novedades.mas > 0 && (
            <p className="text-xs text-fg-muted">
              {novedades.mas === 1 ? "Hay 1 más antigua: aparece" : `Hay ${novedades.mas} más antiguas: aparecen`} cuando decidas estas.
            </p>
          )}
        </>
      )}
    </div>
  );
}
