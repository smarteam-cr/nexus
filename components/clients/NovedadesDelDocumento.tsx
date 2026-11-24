"use client";

/**
 * components/clients/NovedadesDelDocumento.tsx — la franja «N novedades de reuniones» arriba del documento abierto
 * (memoria de la cuenta, etapa 6; docs/DECISIONS.md «Hechos, enrutador y novedades»).
 *
 * Una novedad es lo que un hecho pendiente de una reunión le propone a una sección de este documento. Se calcula (no se
 * guarda) en lib/seguimiento/novedades.ts. Desde el 2026-11-20, una fila azul POR REUNIÓN, con sus novedades adentro (lo
 * que dijo el cliente primero). La fila suma «Listo, todas» y «Ninguna aplica»; cada novedad conserva sus tres acciones de
 * siempre, sobre las piezas del sistema (el chat, de a una: va a SU sección):
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
import { rotuloDeQuienLoDijo } from "@/lib/seguimiento/quien-lo-dijo";

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

  async function decidir(clave: string, ns: readonly NovedadDeLaPieza[], accion: "usar" | "desestimar") {
    setOcupado(clave);
    try {
      let alguna = false;
      let error: string | null = null;
      // Cuántas novedades quedaron decididas (una novedad puede juntar el mismo hecho de varias reuniones).
      let decididas = 0;
      for (const n of ns) {
        let esta = false;
        for (const id of [n.hechoId, ...n.mismos]) {
          const r = await fetch(`/api/projects/${encodeURIComponent(projectId)}/novedades/${encodeURIComponent(id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accion, pieza }),
          });
          if (r.ok) {
            alguna = true;
            esta = true;
          }
          else if (r.status !== 409) error = ((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "No se pudo guardar.";
        }
        if (esta) decididas++;
      }
      if (error && !alguna) toast.error(error);
      else if (error) toast.error(`Se guardaron ${decididas} de ${ns.length}; las demás no: ${error}`);
      else if (ns.length > 1) toast.success(accion === "usar" ? `Listo: las ${ns.length} novedades quedaron usadas.` : "Listo: no vuelven a aparecer.");
      else toast.success(accion === "usar" ? "Listo: la novedad quedó usada." : "Listo: no vuelve a aparecer.");
      onCambio();
    } catch {
      toast.error("No se pudo guardar. Revisa tu conexión.");
    } finally {
      setOcupado(null);
    }
  }

  async function sumarAlContexto(clave: string, n: NovedadDeLaPieza) {
    if (!n.reunion.id) return;
    setOcupado(clave);
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

  /** Una novedad por vez, a SU sección: el chat recibe el contenido de esa sección y la usa solo si se aplica. */
  function cambiarConElChat(n: NovedadDeLaPieza) {
    const s = n.secciones[0];
    if (!s) return;
    const label = secciones.find((x) => x.key === s.seccion)?.label ?? seccionDelRotulo(s.rotulo);
    chat.abrirCon({
      key: s.seccion,
      label,
      novedad: { pieza, hechoIds: [n.hechoId, ...n.mismos], frase: n.frase, cita: n.cita, reunion: n.reunion.titulo, fecha: n.reunion.fecha, quienLoDijo: n.quienLoDijo },
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
          {/* Una fila por reunión (2026-11-20): lo que una reunión le deja a este documento se revisa junto. Cada novedad
              sigue a la vista adentro, con quién lo dijo, de dónde sale y su propio «No aplica». */}
          <ul className="space-y-2">
            {novedades.grupos.map((g) => {
              const seccionesDelGrupo = [...new Set(g.items.flatMap((n) => n.secciones.map((x) => seccionDelRotulo(x.rotulo))))];
              const varias = g.items.length > 1;
              return (
                <FilaSugerida
                  key={g.clave}
                  encima={seccionesDelGrupo.join(" · ")}
                  origen={
                    <span className="min-w-0 truncate">
                      De «{g.reunion.titulo}» · {diaCorto(g.reunion.fecha)}
                      {varias ? ` · ${g.items.length} cosas para este documento` : ""}
                    </span>
                  }
                  debajo={
                    g.reunion.id && puedeDecidir ? (
                      <BotonEnlace onClick={() => void sumarAlContexto(g.clave, g.items[0])} disabled={ocupado !== null} className="mt-1">
                        Sumar la reunión al contexto
                      </BotonEnlace>
                    ) : null
                  }
                  acciones={
                    <>
                      {puedeDecidir && (
                        <BotonTexto onClick={() => void decidir(g.clave, g.items, "desestimar")} disabled={ocupado !== null} title="No vuelve a aparecer">
                          {varias ? "Ninguna aplica" : "No aplica"}
                        </BotonTexto>
                      )}
                      {puedeDecidir && (
                        <BotonBlanco onClick={() => void decidir(g.clave, g.items, "usar")} disabled={ocupado !== null} title="Ya lo cambiaste en el documento">
                          {varias ? "Listo, todas" : "Listo"}
                        </BotonBlanco>
                      )}
                      {!varias && chat.disponible && (
                        <BotonUsar onClick={() => cambiarConElChat(g.items[0])} disabled={ocupado !== null}>
                          Mejorar con IA
                        </BotonUsar>
                      )}
                    </>
                  }
                >
                  <ul className={varias ? "space-y-2" : undefined}>
                    {g.items.map((n) => (
                      <li key={n.hechoId}>
                        {rotuloDeQuienLoDijo(n.quienLoDijo) && <span className="text-xs font-medium text-warn-ink">{rotuloDeQuienLoDijo(n.quienLoDijo)} · </span>}
                        {n.frase}
                        {n.mismos.length ? <span className="text-xs text-fg-muted"> · se dijo en {n.mismos.length + 1} reuniones</span> : null}
                        {/* Con varias en la fila, cada una conserva sus tres acciones de siempre, a la vista. */}
                        {varias && (
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                            {chat.disponible && (
                              <BotonEnlace onClick={() => cambiarConElChat(n)} disabled={ocupado !== null}>
                                Mejorar con IA
                              </BotonEnlace>
                            )}
                            {puedeDecidir && (
                              <BotonEnlace onClick={() => void decidir(n.hechoId, [n], "usar")} disabled={ocupado !== null} title="Ya la cambiaste en el documento">
                                Listo
                              </BotonEnlace>
                            )}
                            {puedeDecidir && (
                              <BotonEnlace onClick={() => void decidir(n.hechoId, [n], "desestimar")} disabled={ocupado !== null} title="No vuelve a aparecer">
                                No aplica
                              </BotonEnlace>
                            )}
                          </span>
                        )}
                        <details className="mt-0.5">
                          <summary className="cursor-pointer text-xs text-fg-muted">Ver de dónde sale</summary>
                          <blockquote className="mt-1 border-l-2 border-line pl-2 text-xs italic text-fg-secondary">«{n.cita}»</blockquote>
                        </details>
                      </li>
                    ))}
                  </ul>
                </FilaSugerida>
              );
            })}
          </ul>
          {novedades.mas > 0 && (
            <p className="text-xs text-fg-muted">
              {novedades.mas === 1 ? "Hay 1 reunión más: aparece" : `Hay ${novedades.mas} reuniones más: aparecen`} cuando decidas estas.
            </p>
          )}
        </>
      )}
    </div>
  );
}
