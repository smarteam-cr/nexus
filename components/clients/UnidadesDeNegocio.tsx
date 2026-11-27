"use client";

/**
 * components/clients/UnidadesDeNegocio.tsx — la pestaña «Unidades de negocio» de Información del cliente (2026-11-26).
 *
 * Diseño aprobado por Elías el 26 nov (lienzo «Unidades de negocio»), con el estilo de siempre de la app. Muestra la
 * empresa de esta ficha: la principal y sus unidades (TEC · TAE y TEC · AE), o el grupo armado por gente confirmada en dos
 * fichas (Teamnet y Stratosphere), con siglas, dominio, proyectos, reuniones y la gente confirmada de cada una. Customer
 * Success cambia las siglas o el dominio de una ficha y agrega unidades; antes de guardar siempre ve qué reuniones cambian
 * de ficha. Juntar unidades lo ven solo el Super Admin y la CSL, y aquí es solo el simulacro.
 *
 * Todo pasa por `/api/clients/[id]/unidades` (lib/clients/unidades-server.ts). La gente de cada unidad no se edita aquí:
 * se ve un resumen y se va a «Interlocutores».
 *
 * Con la EMPRESA arriba (2026-11-26, DECISIONS «La empresa arriba de sus unidades») la primera tarjeta es la empresa: sus
 * dominios, su empresa de HubSpot y lo que espera unidad (proyectos que llegaron sin siglas, con «Pasar a una unidad», y lo
 * de HubSpot que se reparte al confirmar a la persona). Es también la página de la empresa (`/clients/<empresa>`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Drawer, Field, Input, Modal, Selector, Skeleton, Interruptor, Segmentado } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { InfoHint } from "@/components/ui/Tooltip";
import { BotonAzul, BotonBlanco, BotonEnlace, BotonTexto, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { ID_DE_LA_UNIDAD_NUEVA, QUE_HACE, type ComoQueda } from "@/lib/clients/unidades";

// ── Lo que devuelve la ruta (lib/clients/unidades-server.ts) ──────────────────────────────────────────────────────────

interface Unidad {
  id: string;
  nombre: string;
  principal: boolean;
  esEmpresa: boolean;
  enEspera: { contactos: number; correos: number; tickets: number; negocios: number; ventas: number } | null;
  esEsta: boolean;
  abre: boolean;
  siglas: string[];
  dominios: string[];
  comparteDominio: boolean;
  conEmpresaDeHubspot: boolean;
  proyectos: { id: string; nombre: string }[];
  reuniones: number;
  personas: { nombre: string; rol: string | null }[];
  confirmadas: number;
  porConfirmar: number;
}

interface Vista {
  tipo: "unidades" | "grupo" | "sola";
  empresa: string;
  fichas: Unidad[];
  delGrupo: { nombre: string; correo: string }[];
  puedeEditar: boolean;
  puedeJuntar: boolean;
}

interface FilaPrevia {
  sessionId: string;
  title: string;
  date: string;
  de: string | null;
  a: string | null;
  final: string | null;
  como: ComoQueda;
  conVinculoDeUnaPersona: boolean;
  elegidaPara: string[];
  pierde: string[];
}

interface VistaPrevia {
  ficha: { nombre: string; siglas: string[]; dominios: string[] };
  filas: FilaPrevia[];
  nombres: Record<string, string>;
  proyectos: { id: string; nombre: string; frenadoPor: { sessionId: string; title: string }[] }[];
  sueltan: number;
  conLosProyectos: Record<string, number>;
  listo: boolean;
  huella: string;
}

interface SimulacroDeJuntar {
  unidad: string;
  principal: string;
  proyectos: number;
  reuniones: number;
  propuestas: number;
  preventas: number;
  personasConfirmadas: number;
  conCuentaDeCobro: boolean;
}

/** Qué se edita en el panel: una ficha de la empresa, la unidad nueva, o un proyecto de la empresa que pasa a una unidad. */
type Edicion = { tipo: "editar"; ficha: Unidad } | { tipo: "agregar" } | { tipo: "pasar"; proyecto: { id: string; nombre: string } };

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric" });
const enLista = (texto: string) =>
  texto
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

// ── La pestaña ────────────────────────────────────────────────────────────────────────────────────────────────────────

export default function UnidadesDeNegocio({ clientId, onIrAInterlocutores }: { clientId: string; onIrAInterlocutores?: () => void }) {
  const [vista, setVista] = useState<Vista | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [prendida, setPrendida] = useState(false);
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [noSeApaga, setNoSeApaga] = useState(false);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const r = await fetch(`/api/clients/${clientId}/unidades`, { cache: "no-store" }).catch(() => null);
      const d = await r?.json().catch(() => null);
      if (!vivo) return;
      if (!r?.ok) {
        setError(d?.error ?? "No se pudieron cargar las unidades de esta empresa.");
        return;
      }
      setError(null);
      setVista(d as Vista);
    })();
    return () => {
      vivo = false;
    };
  }, [clientId, intento]);

  if (error) {
    return (
      <Alert variant="danger">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex-1">{error}</span>
          <BotonBlanco
            onClick={() => {
              setError(null);
              setIntento((n) => n + 1);
            }}
          >
            Reintentar
          </BotonBlanco>
        </div>
      </Alert>
    );
  }
  if (!vista) return <EsqueletoDeUnidades />;

  const conUnidades = vista.tipo === "unidades";
  const esGrupo = vista.tipo === "grupo";
  const activo = conUnidades || prendida;
  const principal = vista.fichas.find((f) => f.principal);
  const unidades = vista.fichas.filter((f) => !f.esEmpresa);

  return (
    <div className="space-y-4">
      <section aria-label="Unidades de negocio" className="rounded-xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className={ROTULO_DEL_SISTEMA}>Unidades de negocio</p>
              {conUnidades && (
                <Badge variant="primary" size="xs">
                  Parte de {vista.empresa} · {unidades.length} unidades
                </Badge>
              )}
              {esGrupo && (
                <Badge variant="purple" size="xs">
                  Grupo {vista.fichas.map((f) => f.nombre).join(" + ")} · {vista.fichas.length} fichas
                </Badge>
              )}
            </div>
            <h3 className="mt-1 text-base font-semibold leading-[22px] text-fg">
              {esGrupo ? "Un grupo sin principal" : "Esta empresa tiene varias unidades de negocio"}
            </h3>
            <p className="mt-1 max-w-3xl text-[13px] leading-5 text-fg-muted">
              {esGrupo
                ? "Cada empresa del grupo es una ficha con su dominio propio. Las une la gente que el equipo confirmó en las dos: trabaja con todo el grupo."
                : "Cada unidad es una ficha propia: su contexto, sus documentos, su escala y su cuenta de cobro. Las reuniones se reparten entre las unidades por las siglas del título, la gente y el dominio."}
            </p>
          </div>
          {!esGrupo && (
            <Interruptor
              activo={activo}
              etiqueta="Esta empresa tiene varias unidades de negocio"
              texto={activo ? "Sí" : "No"}
              deshabilitado={!vista.puedeEditar && !conUnidades}
              onCambio={(v) => {
                if (!v && conUnidades) setNoSeApaga(true);
                else setPrendida(v);
              }}
            />
          )}
        </div>

        {activo && !conUnidades && !esGrupo && (
          <div className="mt-4 rounded-lg border border-dashed border-line p-4">
            <p className="text-sm font-medium text-fg">Todavía no tiene unidades</p>
            <p className="mt-1 text-[13px] text-fg-muted">
              Agrega la primera: esta ficha queda como la principal (la del dominio y la empresa de HubSpot) y la unidad nueva cuelga de
              ella. Prender esto no guarda nada.
            </p>
            {vista.puedeEditar && <BotonAzul className="mt-3" onClick={() => setEdicion({ tipo: "agregar" })}>+ Agregar unidad</BotonAzul>}
          </div>
        )}
        {!activo && !esGrupo && <PreguntasDeUnidadOProyecto />}
        {conUnidades && vista.puedeEditar && (
          <div className="mt-4">
            <BotonAzul onClick={() => setEdicion({ tipo: "agregar" })}>+ Agregar unidad</BotonAzul>
          </div>
        )}
      </section>

      {(conUnidades || esGrupo) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {vista.fichas.map((f) => (
            <TarjetaDeUnidad
              key={f.id}
              f={f}
              esGrupo={esGrupo}
              principal={principal}
              puedeEditar={vista.puedeEditar && !esGrupo}
              onEditar={() => setEdicion({ tipo: "editar", ficha: f })}
              onPasar={(proyecto) => setEdicion({ tipo: "pasar", proyecto })}
              hayUnidadesQueAbre={unidades.some((u) => u.abre)}
              onIrAInterlocutores={onIrAInterlocutores}
            />
          ))}
        </div>
      )}

      {esGrupo && <DelGrupo vista={vista} onIrAInterlocutores={onIrAInterlocutores} />}
      {conUnidades && <ComoSeReparten />}
      {esGrupo && <ReglaDelGrupo vista={vista} />}

      {edicion && (
        <PanelDeUnidad
          clientId={clientId}
          edicion={edicion}
          vista={vista}
          onCerrar={() => setEdicion(null)}
          onGuardado={(nueva) => {
            /* Sin vista (el guardado quedó a medias): se vuelve a leer la empresa como quedó. */
            if (nueva) setVista(nueva);
            else setIntento((n) => n + 1);
            setEdicion(null);
          }}
        />
      )}

      <NoSeApaga abierto={noSeApaga} vista={vista} clientId={clientId} onCerrar={() => setNoSeApaga(false)} />
    </div>
  );
}

// ── Una unidad ────────────────────────────────────────────────────────────────────────────────────────────────────────

function TarjetaDeUnidad({
  f,
  esGrupo,
  principal,
  puedeEditar,
  onEditar,
  onPasar,
  onIrAInterlocutores,
  hayUnidadesQueAbre,
}: {
  hayUnidadesQueAbre: boolean;
  f: Unidad;
  esGrupo: boolean;
  principal: Unidad | undefined;
  puedeEditar: boolean;
  onEditar: () => void;
  onPasar: (proyecto: { id: string; nombre: string }) => void;
  onIrAInterlocutores?: () => void;
}) {
  const otras = f.confirmadas - f.personas.length;
  if (f.esEmpresa) return <TarjetaDeLaEmpresa f={f} puedeEditar={puedeEditar} onEditar={onEditar} onPasar={onPasar} hayUnidadesQueAbre={hayUnidadesQueAbre} />;
  return (
    <section aria-label={f.nombre} className="rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold text-fg">{f.nombre}</h4>
        {f.principal && <Badge variant="primary" size="xs">Principal</Badge>}
        {f.esEsta && <Badge size="xs">Esta ficha</Badge>}
        {esGrupo && <Badge size="xs">{f.proyectos.length ? "Tiene los proyectos" : "Sin proyectos"}</Badge>}
        <span className="flex-1" />
        {puedeEditar && f.abre && <BotonTexto onClick={onEditar}>Editar siglas y dominio</BotonTexto>}
      </div>

      {!f.abre ? (
        <p className="mt-3 text-[13px] text-fg-muted">No tienes acceso a esta ficha: pídeselo a quien lleva esa cuenta.</p>
      ) : (
        <dl className="mt-3 grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-[13px]">
          <dt className="text-fg-muted">Siglas</dt>
          <dd className="flex flex-wrap gap-1">
            {f.siglas.length ? (
              f.siglas.map((s) => (
                <Badge key={s} size="xs" variant="info">
                  {s}
                </Badge>
              ))
            ) : (
              <span className="text-fg-muted">Sin siglas</span>
            )}
          </dd>
          <dt className="text-fg-muted">Dominio</dt>
          <dd className="text-fg-secondary">
            {f.comparteDominio ? `Comparte el de ${principal?.nombre ?? "la principal"}` : f.dominios.length ? f.dominios.join(", ") : "Sin dominio"}
          </dd>
          <dt className="text-fg-muted">HubSpot</dt>
          <dd className="text-fg-secondary">
            {f.conEmpresaDeHubspot
              ? "Tiene su empresa en HubSpot"
              : f.principal || esGrupo
                ? "Sin empresa en HubSpot"
                : principal?.esEmpresa
                  ? principal.conEmpresaDeHubspot
                    ? `Lo de la empresa de HubSpot de ${principal.nombre} le llega repartido`
                    : "Sin empresa en HubSpot"
                  : "Usa la empresa de la principal"}
          </dd>
          <dt className="text-fg-muted">Proyectos</dt>
          <dd className="text-fg-secondary">
            {f.proyectos.length ? f.proyectos.map((p) => p.nombre).join(" · ") : <span className="text-fg-muted">Ninguno</span>}
          </dd>
          <dt className="text-fg-muted">Reuniones</dt>
          <dd className="text-fg-secondary">{f.reuniones}</dd>
          <dt className="text-fg-muted">Interlocutores</dt>
          <dd>
            {f.personas.length === 0 ? (
              <span className="text-fg-muted">Nadie confirmado todavía</span>
            ) : (
              <ul className="space-y-0.5">
                {f.personas.map((p) => (
                  <li key={p.nombre} className="text-fg">
                    {p.nombre} <span className="text-fg-muted">· {p.rol ?? "Sin rol"}</span>
                  </li>
                ))}
              </ul>
            )}
            {(otras > 0 || f.porConfirmar > 0) && (
              <p className="mt-0.5 text-xs text-fg-muted">
                {[otras > 0 ? `+${plural(otras, "confirmada", "confirmadas")}` : null, f.porConfirmar > 0 ? `${f.porConfirmar} por confirmar` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            {f.esEsta && onIrAInterlocutores ? (
              <BotonEnlace className="mt-1" onClick={onIrAInterlocutores}>
                Ver en Interlocutores
              </BotonEnlace>
            ) : (
              <a href={`/clients/${f.id}`} className="mt-1 inline-block text-xs text-brand hover:text-brand-light">
                Abrir la ficha de {f.nombre}
              </a>
            )}
          </dd>
        </dl>
      )}
    </section>
  );
}

/** La empresa arriba de sus unidades: lo que comparten y lo que espera unidad. */
function TarjetaDeLaEmpresa({
  f,
  puedeEditar,
  onEditar,
  onPasar,
  hayUnidadesQueAbre,
}: {
  f: Unidad;
  puedeEditar: boolean;
  onEditar: () => void;
  onPasar: (proyecto: { id: string; nombre: string }) => void;
  hayUnidadesQueAbre: boolean;
}) {
  const espera = f.enEspera;
  const deHubspot = espera
    ? [
        espera.contactos ? plural(espera.contactos, "contacto", "contactos") : null,
        espera.correos ? plural(espera.correos, "correo o nota", "correos y notas") : null,
        espera.tickets ? plural(espera.tickets, "ticket", "tickets") : null,
        espera.negocios ? plural(espera.negocios, "negocio", "negocios") : null,
        espera.ventas ? plural(espera.ventas, "venta ganada", "ventas ganadas") : null,
      ].filter(Boolean)
    : [];
  return (
    <section aria-label={f.nombre} className="rounded-xl border border-line bg-surface p-5 lg:col-span-2">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold text-fg">{f.nombre}</h4>
        <Badge variant="primary" size="xs">
          Empresa
        </Badge>
        {f.esEsta && <Badge size="xs">Esta página</Badge>}
        <InfoHint text="La empresa guarda lo que comparten sus unidades: el dominio y la empresa de HubSpot. No tiene trabajo propio: los proyectos, las reuniones y los documentos son de cada unidad." />
        <span className="flex-1" />
        {!f.esEsta && f.abre && (
          <a href={`/clients/${f.id}`} className="text-xs text-brand hover:text-brand-light">
            Abrir la página de la empresa
          </a>
        )}
        {puedeEditar && f.abre && <BotonTexto onClick={onEditar}>Editar dominio</BotonTexto>}
      </div>
      {!f.abre ? (
        <p className="mt-3 text-[13px] text-fg-muted">No tienes acceso a la empresa: pídeselo a quien lleva sus unidades.</p>
      ) : (
      <dl className="mt-3 grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-[13px]">
        <dt className="text-fg-muted">Dominio</dt>
        <dd className="text-fg-secondary">{f.dominios.length ? `${f.dominios.join(", ")} · lo comparten sus unidades` : "Sin dominio compartido"}</dd>
        <dt className="text-fg-muted">HubSpot</dt>
        <dd className="text-fg-secondary">
          {f.conEmpresaDeHubspot ? "Tiene la empresa de HubSpot: lo que llega se reparte a cada unidad" : "Sin empresa en HubSpot"}
        </dd>
        <dt className="text-fg-muted">Proyectos</dt>
        <dd>
          {f.proyectos.length === 0 ? (
            <span className="text-fg-muted">Ninguno esperando unidad</span>
          ) : (
            <ul className="space-y-1">
              {f.proyectos.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-fg">{p.nombre}</span>
                  <Badge variant="warning" size="xs">
                    Elige su unidad
                  </Badge>
                  {puedeEditar && hayUnidadesQueAbre && <BotonEnlace onClick={() => onPasar(p)}>Pasar a una unidad</BotonEnlace>}
                </li>
              ))}
            </ul>
          )}
        </dd>
        <dt className="text-fg-muted">De HubSpot sin unidad</dt>
        <dd className="text-fg-secondary">
          {deHubspot.length ? deHubspot.join(" · ") : <span className="text-fg-muted">Nada: todo tiene su unidad</span>}
          {deHubspot.length > 0 && (
            <p className="mt-0.5 text-xs text-fg-muted">
              No lo lee ningún agente. Pasa a su unidad cuando confirmas a la persona en «Interlocutores» de esa unidad.
            </p>
          )}
        </dd>
      </dl>
      )}
    </section>
  );
}

function PreguntasDeUnidadOProyecto() {
  return (
    <div className="mt-4 rounded-lg bg-surface-muted p-4 text-[13px] text-fg-secondary">
      <p className="font-medium text-fg">¿Unidad o proyecto? Tres preguntas sobre el cliente</p>
      <ol className="mt-1 list-decimal space-y-0.5 pl-5">
        <li>¿Decide y paga la misma gente?</li>
        <li>¿Trabajamos con la misma gente de su lado?</li>
        <li>¿Lo de uno se le puede mostrar al otro?</li>
      </ol>
      <p className="mt-2 text-fg-muted">
        Si las tres son sí, es un cliente con varios proyectos (kölbi, con Ventas y Marketing, es uno). Si alguna es no, son unidades.
      </p>
    </div>
  );
}

function ComoSeReparten() {
  return (
    <section aria-label="Cómo se reparten las reuniones" className="rounded-xl border border-line bg-surface p-5">
      <h3 className="text-sm font-semibold text-fg">Cómo se reparten las reuniones entre las unidades</h3>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] text-fg-secondary">
        <li>Lo que alguien asignó a mano a una reunión gana siempre.</li>
        <li>La gente que el equipo confirmó en «Interlocutores».</li>
        <li>Las siglas del título. La convención para el equipo: «siglas | tema» («AE | Kickoff»).</li>
        <li>El dominio: una unidad con dominio propio se queda con las reuniones de su gente.</li>
        <li>Sin ninguna pista, queda por decidir en Reuniones, para que alguien elija.</li>
      </ol>
    </section>
  );
}

function DelGrupo({ vista, onIrAInterlocutores }: { vista: Vista; onIrAInterlocutores?: () => void }) {
  return (
    <section aria-label="Del grupo" className="rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-fg">Del grupo</h3>
        <span className="text-xs text-fg-muted">{vista.delGrupo.length}</span>
        <InfoHint text="Confirmadas en dos fichas del grupo o más: trabajan con todo el grupo y no deciden solas de quién es una reunión." />
        <span className="flex-1" />
        {onIrAInterlocutores && <BotonEnlace onClick={onIrAInterlocutores}>+ Agregar una ficha al grupo</BotonEnlace>}
      </div>
      {vista.delGrupo.length === 0 ? (
        <p className="mt-2 text-[13px] text-fg-muted">Nadie confirmado en las dos fichas.</p>
      ) : (
        <p className="mt-2 text-[13px] text-fg">{vista.delGrupo.map((p) => p.nombre).join(" · ")}</p>
      )}
      <p className="mt-2 text-xs text-fg-muted">
        Para sumar una ficha al grupo, confirma en «Interlocutores» a alguien de la empresa que también trabaja con la otra. Para
        deshacerlo, quítale esa confirmación.
      </p>
    </section>
  );
}

function ReglaDelGrupo({ vista }: { vista: Vista }) {
  const conProyectos = vista.fichas.filter((f) => f.proyectos.length > 0);
  const duena = conProyectos.length === 1 ? conProyectos[0]!.nombre : null;
  return (
    <section aria-label="Las reuniones de todo el grupo" className="rounded-xl border border-line bg-surface p-5">
      <h3 className="text-sm font-semibold text-fg">Las reuniones de todo el grupo</h3>
      <p className="mt-1 text-[13px] text-fg-secondary">Una reunión es de las dos fichas cuando:</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] text-fg-secondary">
        <li>el título nombra a las dos («Kick off - Teamnet y Sas»),</li>
        <li>vino gente de las dos, o</li>
        <li>solo vino gente del grupo.</li>
      </ul>
      <p className="mt-2 text-[13px] text-fg">
        {duena
          ? `Esas reuniones se quedan en ${duena}, la ficha que tiene el proyecto.`
          : "Se quedan en la ficha del proyecto más antiguo del grupo. Si ninguna tiene proyectos, quedan por decidir."}
      </p>
      <p className="mt-1 text-xs text-fg-muted">Lo que alguien asignó a mano, o lo que vinculó a un documento, se queda donde está.</p>
    </section>
  );
}

// ── No se puede apagar (y juntar) ─────────────────────────────────────────────────────────────────────────────────────

function NoSeApaga({ abierto, vista, clientId, onCerrar }: { abierto: boolean; vista: Vista; clientId: string; onCerrar: () => void }) {
  const toast = useToast();
  const [simulacro, setSimulacro] = useState<SimulacroDeJuntar | null>(null);
  const [cargando, setCargando] = useState<string | null>(null);
  const unidades = vista.fichas.filter((f) => !f.principal && f.abre);
  /* Con la empresa arriba (2026-11-26) no hay principal con la que juntar: la empresa no tiene trabajo propio. */
  const conLaEmpresaArriba = vista.fichas.some((f) => f.principal && f.esEmpresa);

  const verQuePasaria = async (unidadId: string) => {
    setCargando(unidadId);
    try {
      const r = await fetch(`/api/clients/${clientId}/unidades/juntar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unidadId }),
      }).catch(() => null);
      const d = await r?.json().catch(() => null);
      if (!r?.ok) throw new Error(d?.error ?? "No se pudo calcular qué pasaría.");
      setSimulacro(d as SimulacroDeJuntar);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo calcular qué pasaría.");
    } finally {
      setCargando(null);
    }
  };

  return (
    <Modal
      open={abierto}
      onClose={() => {
        setSimulacro(null);
        onCerrar();
      }}
      title="Mientras tenga unidades, no se puede apagar"
      size="md"
      footer={<BotonBlanco onClick={onCerrar}>Entendido</BotonBlanco>}
    >
      <div className="space-y-3 text-[13px] text-fg-secondary">
        <p>
          Apagarlo sería juntar las unidades en la principal: pasan sus proyectos, sus reuniones y su cuenta de cobro, y la ficha de la
          unidad se borra. Eso no se puede deshacer.
        </p>
        <p>Lo hace un Super Admin o la CSL, siempre con el simulacro primero.</p>
        {conLaEmpresaArriba ? (
          <p className="text-fg-muted">
            Esta empresa tiene su ficha arriba de las unidades: una unidad no se junta con la empresa. Si dos unidades son en realidad
            una sola, avísale al equipo de Nexus.
          </p>
        ) : vista.puedeJuntar ? (
          <div className="space-y-2">
            {unidades.map((u) => (
              <div key={u.id} className="flex items-center gap-3 rounded-lg border border-line p-3">
                <span className="flex-1 font-medium text-fg">{u.nombre}</span>
                <BotonBlanco onClick={() => verQuePasaria(u.id)} disabled={cargando !== null}>
                  {cargando === u.id ? "Calculando…" : "Juntar las unidades…"}
                </BotonBlanco>
              </div>
            ))}
            {simulacro && (
              <div className="rounded-lg bg-surface-muted p-3">
                <p className="font-medium text-fg">
                  Si juntas {simulacro.unidad} con {simulacro.principal}, pasan a {simulacro.principal}:
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  <li>{plural(simulacro.proyectos, "proyecto", "proyectos")}</li>
                  <li>{plural(simulacro.reuniones, "reunión", "reuniones")}</li>
                  <li>
                    {plural(simulacro.propuestas, "propuesta", "propuestas")} y {plural(simulacro.preventas, "preventa", "preventas")}
                  </li>
                  <li>{plural(simulacro.personasConfirmadas, "persona confirmada", "personas confirmadas")}</li>
                  <li>{simulacro.conCuentaDeCobro ? "Su cuenta de cobro (se junta con la de la principal)" : "No tiene cuenta de cobro"}</li>
                </ul>
                <p className="mt-2 text-xs text-fg-muted">
                  Esto es solo el simulacro: no se juntó nada. Como borra la ficha y no se puede deshacer, lo aplica Elías con el script de
                  fusión después de revisar esto.
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-fg-muted">Si hace falta juntarlas, pídeselo a un Super Admin o a la CSL.</p>
        )}
      </div>
    </Modal>
  );
}

// ── Editar o agregar, con la vista previa ─────────────────────────────────────────────────────────────────────────────

/** Lo que eligió la persona para una reunión de la vista previa. */
type Eleccion = "auto" | "mover" | string;

function PanelDeUnidad({
  clientId,
  edicion,
  vista,
  onCerrar,
  onGuardado,
}: {
  clientId: string;
  edicion: Edicion;
  vista: Vista;
  onCerrar: () => void;
  onGuardado: (v: Vista | null) => void;
}) {
  const toast = useToast();
  const agregando = edicion.tipo === "agregar";
  const pasando = edicion.tipo === "pasar" ? edicion.proyecto : null;
  /* «Pasar a una unidad»: la unidad que recibe el proyecto (sus siglas y su dominio no cambian). */
  const unidadesQueReciben = vista.fichas.filter((f) => !f.esEmpresa && f.abre);
  const [destinoId, setDestinoId] = useState<string>(unidadesQueReciben[0]?.id ?? "");
  const ficha = edicion.tipo === "editar" ? edicion.ficha : pasando ? (unidadesQueReciben.find((f) => f.id === destinoId) ?? null) : null;
  const principal = vista.fichas.find((f) => f.principal) ?? (vista.tipo === "sola" ? vista.fichas[0] : undefined);
  const [nombre, setNombre] = useState(agregando ? `${vista.empresa} · ` : (ficha?.nombre ?? ""));
  const [siglasEditadas, setSiglas] = useState((ficha?.siglas ?? []).join(", "));
  const [propioEditado, setPropio] = useState<"comparte" | "propio">(ficha && !ficha.comparteDominio && (ficha.dominios.length > 0 || ficha.principal) ? "propio" : "comparte");
  const [dominiosEditados, setDominios] = useState((ficha?.dominios ?? []).join(", "));
  /* Al pasar un proyecto, las siglas y el dominio son los de la unidad elegida, tal como están. */
  const siglas = pasando ? (ficha?.siglas ?? []).join(", ") : siglasEditadas;
  const propio = pasando ? (ficha?.comparteDominio ? "comparte" : "propio") : propioEditado;
  const dominios = pasando ? (ficha?.dominios ?? []).join(", ") : dominiosEditados;
  const [proyectos, setProyectos] = useState<string[]>([]);
  const [elecciones, setElecciones] = useState<Record<string, Eleccion>>({});
  const [previa, setPrevia] = useState<VistaPrevia | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [falla, setFalla] = useState<string | null>(null);
  const esPrincipal = !!ficha?.principal;

  const pedido = useMemo(() => {
    const asignar: Record<string, string> = {};
    const moverIgual: string[] = [];
    for (const [s, e] of Object.entries(elecciones)) {
      if (e === "mover") moverIgual.push(s);
      else if (e !== "auto") asignar[s] = e;
    }
    return {
      fichaId: ficha?.id,
      nombre: ficha ? undefined : nombre,
      siglas: enLista(siglas),
      dominios: esPrincipal || propio === "propio" ? enLista(dominios) : [],
      ...(agregando ? { proyectos } : pasando ? { proyectos: [pasando.id] } : {}),
      asignar,
      moverIgual,
    };
  }, [ficha, nombre, siglas, esPrincipal, propio, dominios, agregando, pasando, proyectos, elecciones]);
  /* Lo que cambia la cuenta (no las elecciones por reunión): si cambia, la vista previa ya no vale. */
  const llave = JSON.stringify([pedido.fichaId ?? null, pedido.siglas, pedido.dominios, pedido.nombre ?? null, pedido.proyectos ?? []]);
  const llaveDeLaPrevia = useRef<string | null>(null);
  const vigente = previa && llaveDeLaPrevia.current === llave;

  const simular = useCallback(
    async (p: typeof pedido) => {
      setCalculando(true);
      setFalla(null);
      try {
        const r = await fetch(`/api/clients/${clientId}/unidades`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accion: "simular", ...p }),
        }).catch(() => null);
        const d = await r?.json().catch(() => null);
        if (!r?.ok) throw new Error(d?.error ?? "No se pudo calcular qué cambia.");
        llaveDeLaPrevia.current = JSON.stringify([p.fichaId ?? null, p.siglas, p.dominios, p.nombre ?? null, p.proyectos ?? []]);
        setPrevia(d as VistaPrevia);
      } catch (e) {
        setPrevia(null);
        setFalla(e instanceof Error ? e.message : "No se pudo calcular qué cambia.");
      } finally {
        setCalculando(false);
      }
    },
    [clientId],
  );

  /* Una elección por reunión cambia qué se protege y qué proyectos pueden pasar: se recalcula con la cuenta vigente. */
  const elegir = (sessionId: string, e: Eleccion) => {
    const nuevas = { ...elecciones, [sessionId]: e };
    setElecciones(nuevas);
    if (vigente) {
      const asignar: Record<string, string> = {};
      const moverIgual: string[] = [];
      for (const [s, x] of Object.entries(nuevas)) {
        if (x === "mover") moverIgual.push(s);
        else if (x !== "auto") asignar[s] = x;
      }
      void simular({ ...pedido, asignar, moverIgual });
    }
  };

  const guardar = async () => {
    if (!previa) return;
    setGuardando(true);
    try {
      const r = await fetch(`/api/clients/${clientId}/unidades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "guardar", ...pedido, huella: previa.huella }),
      }).catch(() => null);
      const d = await r?.json().catch(() => null);
      if (r?.status === 409 && d?.vistaNueva) {
        toast.info("Cambió algo desde la vista previa: revísala de nuevo.");
        await simular(pedido);
        return;
      }
      if (r?.status === 500 && d?.aMedias) {
        toast.error(d.error);
        onGuardado(null);
        return;
      }
      if (!r?.ok) throw new Error(d?.error ?? "No se pudo guardar.");
      const partes = [
        d.movidas ? `${plural(d.movidas, "reunión cambió", "reuniones cambiaron")} de ficha` : null,
        d.fijadas ? `${plural(d.fijadas, "quedó asignada", "quedaron asignadas")} a mano` : null,
        d.proyectos ? `${plural(d.proyectos, "proyecto pasó", "proyectos pasaron")} a la unidad` : null,
      ].filter(Boolean);
      toast.success(`${agregando ? `Listo: ${pedido.nombre ?? "la unidad"} ya existe.` : "Guardado."}${partes.length ? ` ${partes.join(" · ")}.` : ""}`);
      if (!d.abre) toast.info("Esa ficha no entra en tu cartera (no tiene proyectos tuyos): pídele a la CSL que te la comparta para abrirla.");
      onGuardado(d.vista as Vista);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  const nombreDe = (id: string | null) => (id ? (previa?.nombres[id] ?? "otra ficha") : "Por decidir");
  const cambian = previa?.filas.filter((f) => f.final !== f.de).length ?? 0;
  const faltaElegir = previa?.filas.some((f) => f.como === "falta-elegir" && !elecciones[f.sessionId]) ?? false;
  const frenados = previa?.proyectos.filter((p) => p.frenadoPor.length > 0) ?? [];
  const puedeGuardar = !!vigente && previa.listo && !faltaElegir && !calculando && !guardando;
  const destinos = [...vista.fichas.filter((f) => f.abre && !f.esEmpresa).map((f) => ({ value: f.id, label: f.nombre })), ...(agregando ? [{ value: ID_DE_LA_UNIDAD_NUEVA, label: nombre.trim() || "La unidad nueva" }] : [])];

  return (
    <Drawer
      open
      onClose={onCerrar}
      size="lg"
      title={
        agregando
          ? "Agregar unidad"
          : pasando
            ? `Pasar «${pasando.nombre}» a una unidad`
            : ficha?.esEmpresa
              ? `Dominio de ${ficha.nombre}`
              : `Siglas y dominio de ${ficha?.nombre ?? ""}`
      }
      description={
        agregando
          ? `La unidad nueva cuelga de ${principal?.nombre ?? "esta ficha"}. Antes de guardar ves qué reuniones pasan a ella.`
          : pasando
            ? "El proyecto pasa con su handoff, sus tareas y sus documentos. Antes de guardar ves qué cambia."
            : "Antes de guardar ves qué reuniones cambian de ficha."
      }
      footer={
        <div className="flex items-center justify-end gap-2">
          <BotonTexto onClick={onCerrar}>Cancelar</BotonTexto>
          {!vigente ? (
            <BotonAzul onClick={() => void simular(pedido)} disabled={calculando}>
              {calculando ? "Calculando…" : "Ver qué cambia"}
            </BotonAzul>
          ) : (
            <BotonAzul onClick={() => void guardar()} disabled={!puedeGuardar}>
              {guardando
                ? "Guardando…"
                : pasando
                  ? `Pasar a ${ficha?.nombre ?? "la unidad"}`
                  : agregando
                  ? `Crear ${pedido.nombre?.trim() || "la unidad"}${cambian ? ` y mover ${cambian}` : ""}`
                  : cambian
                    ? `Guardar y mover ${plural(cambian, "reunión", "reuniones")}`
                    : "Guardar"}
            </BotonAzul>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        {agregando && (
          <Field label="Nombre de la unidad" hint="Como «Empresa · Unidad»: Cemaco · Ecuador, TEC · AE." required>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </Field>
        )}
        {pasando && (
          <Field label="La unidad que recibe el proyecto" required>
            <Selector
              etiqueta="Unidad"
              placeholder="Elegir unidad"
              valor={destinoId}
              opciones={unidadesQueReciben.map((f) => ({ value: f.id, label: f.nombre }))}
              onElegir={setDestinoId}
            />
          </Field>
        )}
        {!pasando && !ficha?.esEmpresa && (
          <Field label="Siglas" hint="Su llave en los títulos de las reuniones («AE | Kickoff»). Varias, separadas por coma.">
            <Input value={siglasEditadas} onChange={(e) => setSiglas(e.target.value)} placeholder="AE, EC" />
          </Field>
        )}
        {pasando ? null : esPrincipal ? (
          <Field label="Dominios" hint="Los que comparte con las unidades que no tienen dominio propio.">
            <Input value={dominiosEditados} onChange={(e) => setDominios(e.target.value)} />
          </Field>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-medium text-fg-secondary">Dominio</p>
            <Segmentado
              etiqueta="Dominio de la unidad"
              opciones={[
                { clave: "comparte", etiqueta: `Comparte el de ${principal?.nombre ?? "la principal"}` },
                { clave: "propio", etiqueta: "Propio" },
              ]}
              valor={propioEditado}
              onCambio={setPropio}
            />
            {propioEditado === "propio" && (
              <Field label="Dominios propios" hint="La gente de estos dominios es de esta unidad.">
                <Input value={dominiosEditados} onChange={(e) => setDominios(e.target.value)} placeholder="sukasa.com, comohogar.com" />
              </Field>
            )}
          </div>
        )}

        {agregando && principal && principal.proyectos.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-fg-secondary">Proyectos de {principal.nombre} que pasan a la unidad</legend>
            <p className="text-xs text-fg-muted">Apagados: sin marcar, se quedan en la principal. Un proyecto pasa con su handoff, sus tareas y sus documentos.</p>
            {principal.proyectos.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-[13px] text-fg">
                <input
                  type="checkbox"
                  checked={proyectos.includes(p.id)}
                  onChange={(e) => setProyectos((ps) => (e.target.checked ? [...ps, p.id] : ps.filter((x) => x !== p.id)))}
                />
                {p.nombre}
              </label>
            ))}
          </fieldset>
        )}
        {agregando && <p className="text-xs text-fg-muted">La cuenta de cobro de la unidad se elige después, en Cobranza. Crearla no toca la facturación.</p>}

        {falla && <Alert variant="danger">{falla}</Alert>}
        {calculando && !previa && <EsqueletoDeLaPrevia />}
        {previa && !vigente && !calculando && <Alert variant="info">Cambiaste algo: vuelve a ver qué cambia antes de guardar.</Alert>}

        {previa && vigente && (
          <section aria-label="Qué cambia" className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-fg">Qué cambia</h3>
              <span className="text-xs text-fg-muted">
                {[
                  plural(previa.filas.filter((f) => f.como === "se-mueve" && f.final).length, "cambia de ficha", "cambian de ficha"),
                  `${previa.filas.filter((f) => f.final === null).length} por decidir`,
                  plural(previa.filas.filter((f) => f.como === "se-queda").length, "se queda", "se quedan"),
                ].join(" · ")}
              </span>
              {calculando && <span className="text-xs text-fg-muted">Recalculando…</span>}
            </div>
            {previa.filas.length === 0 ? (
              <p className="text-[13px] text-fg-muted">Ninguna reunión cambia de ficha con esto.</p>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {previa.filas.map((f) => (
                  <FilaDeLaPrevia
                    key={f.sessionId}
                    f={f}
                    nombreDe={nombreDe}
                    destinos={destinos}
                    eleccion={elecciones[f.sessionId] ?? "auto"}
                    onElegir={(e) => elegir(f.sessionId, e)}
                  />
                ))}
              </ul>
            )}
            <p className="text-xs text-fg-muted">Lo que alguien asignó a mano a una reunión no se mueve.</p>

            {frenados.map((p) => (
              <Alert key={p.id} variant="warning">
                <p className="font-medium">«{p.nombre}» no puede pasar todavía</p>
                <p className="mt-1 text-[13px]">
                  {plural(p.frenadoPor.length, "reunión suya se queda", "reuniones suyas se quedan")} en otra ficha:{" "}
                  {p.frenadoPor
                    .slice(0, 3)
                    .map((s) => `«${s.title}»`)
                    .join(", ")}
                  {p.frenadoPor.length > 3 ? ` y ${p.frenadoPor.length - 3} más` : ""}. Elige la unidad para esas reuniones en la lista de arriba, o deja el
                  proyecto en la principal.
                </p>
              </Alert>
            ))}
            {Object.keys(previa.conLosProyectos).length > 0 && frenados.length === 0 && (
              <p className="text-xs text-fg-muted">
                Con los proyectos pasan {Object.values(previa.conLosProyectos).reduce((a, b) => a + b, 0)} registros suyos (handoff, tareas,
                documentos…).{previa.sueltan ? ` Se sueltan ${plural(previa.sueltan, "vínculo", "vínculos")} que puso Nexus con reuniones que no van.` : ""}
              </p>
            )}
            {faltaElegir && <Alert variant="warning">Elige la ficha de las reuniones marcadas para poder guardar.</Alert>}
          </section>
        )}
      </div>
    </Drawer>
  );
}

function FilaDeLaPrevia({
  f,
  nombreDe,
  destinos,
  eleccion,
  onElegir,
}: {
  f: FilaPrevia;
  nombreDe: (id: string | null) => string;
  destinos: { value: string; label: string }[];
  eleccion: Eleccion;
  onElegir: (e: Eleccion) => void;
}) {
  const protegida = f.conVinculoDeUnaPersona;
  const porDecidir = f.a === null;
  const sigue = f.como === "sigue" || (eleccion !== "auto" && eleccion !== "mover" && f.de === f.a);
  /* Las opciones: la de Nexus (o protegerla), dejarla ir, o una ficha a mano. */
  const opciones = [
    ...(f.como === "falta-elegir" || (f.como === "asignada" && f.conVinculoDeUnaPersona && f.a === null)
      ? []
      : [
          {
            value: "auto",
            label: protegida || sigue ? `${sigue ? "Sigue" : "Se queda"} en ${nombreDe(f.de)}` : porDecidir ? "Por decidir" : `A ${nombreDe(f.a)}`,
          },
        ]),
    ...(protegida && !porDecidir ? [{ value: "mover", label: `Moverla igual a ${nombreDe(f.a)}`, hint: "Pierde el vínculo que puso una persona" }] : []),
    ...destinos.filter((d) => d.value !== (protegida || sigue ? f.de : f.a)).map((d) => ({ ...d, hint: "Queda asignada a mano" })),
  ];
  const ambar = protegida || f.como === "falta-elegir" || f.pierde.length > 0;
  return (
    <li className={`flex flex-wrap items-center gap-3 p-3 ${ambar ? "bg-amber-500/5" : ""}`}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-fg" title={f.title}>
          {f.title}
        </p>
        <p className="text-xs text-fg-muted">
          {fecha(f.date)} · {nombreDe(f.de)} → {nombreDe(f.final)}
          <span className="ml-2">
            <Badge size="xs" variant={f.como === "falta-elegir" ? "warning" : f.como === "se-queda" ? "warning" : "default"}>
              {QUE_HACE[f.como]}
            </Badge>
          </span>
        </p>
        {f.elegidaPara.length > 0 && <p className="mt-0.5 text-xs text-fg-secondary">La eligió una persona para {f.elegidaPara.join(", ")}.</p>}
        {protegida && f.elegidaPara.length === 0 && <p className="mt-0.5 text-xs text-fg-secondary">Una persona la vinculó a un proyecto de {nombreDe(f.de)}.</p>}
        {f.como === "sigue" && <p className="mt-0.5 text-xs text-fg-secondary">Es de un proyecto que pasa a la unidad: elígele la unidad para que pase con él.</p>}
        {f.pierde.length > 0 && (
          <p className="mt-0.5 text-xs font-medium text-fg">
            Si la mandas a {nombreDe(f.final)}, pierde lo que puso una persona en otra ficha: {f.pierde.join(", ")}.
          </p>
        )}
      </div>
      {(protegida || porDecidir || sigue || eleccion !== "auto") && (
        <div className="w-56 shrink-0">
          <Selector
            etiqueta={`Ficha de «${f.title}»`}
            opciones={opciones}
            valor={f.como === "falta-elegir" && eleccion === "auto" ? null : eleccion}
            onElegir={(v) => onElegir(v)}
            placeholder="Elige su ficha"
          />
        </div>
      )}
    </li>
  );
}

// ── Esqueletos ────────────────────────────────────────────────────────────────────────────────────────────────────────

function EsqueletoDeUnidades() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="space-y-3 rounded-xl border border-line bg-surface p-5">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-5 w-80" delay={40} />
        <Skeleton className="h-4 w-full max-w-2xl" delay={80} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-3 rounded-xl border border-line bg-surface p-5">
            <Skeleton className="h-4 w-40" delay={i * 60} />
            {Array.from({ length: 5 }, (_, j) => (
              <div key={j} className="flex gap-3">
                <Skeleton className="h-4 w-24" delay={i * 60 + j * 40} />
                <Skeleton className="h-4 flex-1" delay={i * 60 + j * 40} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function EsqueletoDeLaPrevia() {
  return (
    <div className="space-y-2 rounded-lg border border-line p-3" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-4 flex-1" delay={i * 40} />
          <Skeleton className="h-6 w-40" delay={i * 40} />
        </div>
      ))}
    </div>
  );
}
