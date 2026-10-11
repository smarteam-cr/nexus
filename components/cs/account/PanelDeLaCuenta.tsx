"use client";

/**
 * components/cs/account/PanelDeLaCuenta.tsx — el panel de contexto de la ficha (300 px, a la
 * derecha), igual en todas las pestañas: «Qué sigue», el color (corregirlo y «en espera del cliente», 2026-10-09),
 * la clasificación (2026-10-07), la relación con HubSpot
 * (2026-10-09), el equipo de los dos lados, las alertas vivas (con resolver y descartar) y de dónde salen los datos.
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QueSigue, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { diasEntre, fmtDia } from "@/lib/cs/formato";
import { NOMBRE_DE_LA_SALUD, cseDeLaCuenta, quienCorrigio } from "@/lib/cs/cartera-reglas";
import { CorregirColor, EnEsperaDelCliente } from "../AjusteDelColor";
import { REGLA_DE_LA_RELACION, relacionConHubspot } from "@/lib/cs/relacion-gestionada";
import { InfoHint } from "@/components/ui/Tooltip";
import type { CsAccountData } from "@/lib/cs/load-account";
import { Avatar, Punto, Salud } from "../piezas";
import { AlertaParaCerrar, AlertasCerradas } from "../AlertaParaCerrar";
import { CeldaDeClasificacion, NOMBRE_DEL_DATO, conLoGuardado } from "../CeldaDeClasificacion";
import type { ClasificacionGuardada, DatoDeClasificacion } from "@/lib/cs/clasificacion";
import PanelLateral from "@/components/ui/PanelLateral";
import CseEncargadoSelect from "@/components/clients/CseEncargadoSelect";

const BOTON_AZUL = "inline-flex rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg transition-colors hover:bg-primary-hover";

export default function PanelDeLaCuenta({ data }: { data: CsAccountData }) {
  const c = data.cuenta;
  const p = c.partner;
  const primero = data.motivos[0];
  const cse = cseDeLaCuenta(c);
  // Quien HubSpot todavía tiene como dueño pero está de baja en Nexus: se nombra para reasignarlo.
  const deBaja = [...new Set(c.proyectos.filter((x) => x.activo && x.cseDeBaja).map((x) => x.cseDeBaja as string))];

  return (
    <PanelLateral etiqueta="La cuenta" ancho="lg:w-[300px]" className="py-6">
      <QueSigue
        accion={
          (primero?.clave === "relacionPorVencer" || primero?.clave === "relacionTerminada") && p?.enlacePortal ? (
            <a href={p.enlacePortal} target="_blank" rel="noreferrer" className={BOTON_AZUL}>
              Abrir el portal del cliente ↗
            </a>
          ) : primero && c.proyectos.some((x) => x.activo) ? (
            <Link href={`/clients/${c.clientId}`} className={BOTON_AZUL}>
              Abrir la ficha del cliente →
            </Link>
          ) : undefined
        }
      >
        {primero ? `${primero.texto}.` : "Nada pide atención en esta cuenta hoy."}
      </QueSigue>

      <ElColor data={data} />

      <Clasificacion data={data} />

      <RelacionConHubspot data={data} />

      <section className="flex flex-col gap-2.5">
        <span className={ROTULO_DEL_SISTEMA}>Equipo</span>
        <div className="rounded-xl border border-line bg-surface px-3 py-1">
          <FilaDeEquipo etiqueta="CSE">
            {data.puedeReasignar && c.proyectos.some((x) => x.activo) ? (
              /* El pase de cuenta (2026-10-09): escribe «CSE Encargado» en la empresa, sus contactos y sus
                 proyectos de implementación, y le manda al CSE nuevo el resumen de la cuenta en «Para ti». */
              <span className="flex items-center gap-1.5">
                <CseEncargadoSelect
                  clientId={c.clientId}
                  clientName={c.nombre}
                  nombres={[...new Set(c.proyectos.filter((x) => x.activo && x.cseNombre).map((x) => x.cseNombre as string))]}
                  opciones={data.equipoParaPase}
                  puedeEditar
                />
                <Avatar nombre={cse?.nombre ?? null} />
              </span>
            ) : cse ? (
              <span className="flex items-center gap-1.5">
                {cse.nombre}
                <Avatar nombre={cse.nombre} />
              </span>
            ) : (
              <span className="text-right text-warn-ink">
                sin asignar
                {deBaja.length > 0 && <span className="block text-xs">en HubSpot sigue {deBaja.join(", ")}, que ya no está</span>}
              </span>
            )}
          </FilaDeEquipo>
          {(p?.csmHubspot || p?.growthHubspot || p?.contratosHubspot) && (
            <>
              <p className={cn(ROTULO_DEL_SISTEMA, "border-t border-line pb-0.5 pt-2")}>De HubSpot</p>
              {p?.csmHubspot && <FilaDeEquipo etiqueta="Customer Success">{p.csmHubspot}</FilaDeEquipo>}
              {p?.growthHubspot && <FilaDeEquipo etiqueta="Crecimiento">{p.growthHubspot}</FilaDeEquipo>}
              {p?.contratosHubspot && <FilaDeEquipo etiqueta="Contratos">{p.contratosHubspot}</FilaDeEquipo>}
            </>
          )}
        </div>
      </section>

      <Alertas data={data} />

      {/* Las personas del cliente y las apps de su portal viven en sus pestañas desde el 2026-10-05
          (Conversaciones y Adopción): el panel queda para lo que vale en cualquier pestaña. */}

      <section className="flex flex-col gap-2.5">
        <span className={ROTULO_DEL_SISTEMA}>De dónde salen los datos</span>
        <div className="flex flex-col gap-1.5 text-[13px]">
          <Fuente nombre="HubSpot Partner" at={data.partner?.fetchedAt ?? null} hoy={data.hoy} />
          <Fuente nombre="Señales de HubSpot" at={data.signals?.fetchedAt ?? null} hoy={data.hoy} />
          <span className="flex justify-between gap-2">
            <span className="text-fg-secondary">Cronogramas de Nexus</span>
            <span className="text-fg-muted">en vivo</span>
          </span>
          <Fuente nombre="Minutas de reuniones" at={data.minutes[0]?.date ?? null} hoy={data.hoy} viejoDespues={DIAS_MINUTA_VIEJA} />
        </div>
      </section>
    </PanelLateral>
  );
}

/**
 * El color de la cuenta y su porqué, con lo que puede hacer la CSL (2026-10-09, entrega 2): corregirlo con una
 * razón (vale 30 días o hasta que Nexus vea algo rojo nuevo) y marcar «en espera del cliente». Con una corrección,
 * el color de Nexus se ve al lado.
 */
function ElColor({ data }: { data: CsAccountData }) {
  const s = data.salud;
  const caduco = s.correccionQueCaduco;
  return (
    <section className="flex flex-col gap-2.5" data-recorrido="cs.color">
      <span className={ROTULO_DEL_SISTEMA}>El color</span>
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-[13px]">
        <Salud salud={s.salud} />
        <p className="text-fg-secondary">{s.porque}</p>
        {s.nexus && (
          <p className="text-xs text-fg-muted">
            Nexus diría: {NOMBRE_DE_LA_SALUD[s.nexus.salud].toLowerCase()} · {s.nexus.porque}
          </p>
        )}
        {caduco && (
          <p className="text-xs text-warn-ink">
            La corrección de {quienCorrigio(caduco)} dejó de valer
            {caduco.motivo === "vencio" ? ` el ${fmtDia(caduco.vence, data.hoy)}` : `: Nexus ve algo nuevo (${caduco.senal})`}.
          </p>
        )}
        {data.ajustesListos && (
          <div className="flex flex-col gap-1.5 border-t border-line pt-2">
            <CorregirColor
              clientId={data.cuenta.clientId}
              cuenta={data.cuenta.nombre}
              salud={s.salud}
              nexus={s.nexus?.salud ?? null}
              correccion={s.correccion ? { quien: quienCorrigio(s.correccion), nota: s.correccion.nota, vence: s.correccion.vence } : null}
              hoy={data.hoy}
            />
            <EnEsperaDelCliente
              clientId={data.cuenta.clientId}
              espera={data.cuenta.ajustes?.espera ? { quien: quienCorrigio(data.cuenta.ajustes.espera), nota: data.cuenta.ajustes.espera.nota } : null}
              propuesta={data.esperaPropuesta}
            />
          </div>
        )}
      </div>
    </section>
  );
}

const DATOS_DEL_PANEL: DatoDeClasificacion[] = ["relacion", "momento", "potencial"];

/**
 * El tipo de relación, el momento y el potencial de la cuenta: lo confirmado, y en azul lo que propone Nexus
 * (el mismo control que la pestaña «Cartera»). El CSE va en «Equipo»: se cambia con el pase de cuenta.
 */
function Clasificacion({ data }: { data: CsAccountData }) {
  const [guardada, setGuardada] = useState<ClasificacionGuardada | null>(null);
  if (!data.clasificacion) return null;
  const cl = guardada ? conLoGuardado(data.clasificacion, guardada) : data.clasificacion;
  return (
    <section className="flex flex-col gap-2.5" data-recorrido="cs.clasificacion">
      <span className={ROTULO_DEL_SISTEMA}>Clasificación</span>
      <div className="rounded-xl border border-line bg-surface px-3 py-1">
        {DATOS_DEL_PANEL.map((dato) => (
          <div key={dato} className="grid grid-cols-[92px_minmax(0,1fr)] items-start gap-2 py-1.5">
            <span className="pt-0.5 text-[13px] text-fg-muted">{NOMBRE_DEL_DATO[dato]}</span>
            <CeldaDeClasificacion
              clientId={data.cuenta.clientId}
              cuenta={data.cuenta.nombre}
              dato={dato}
              estado={cl[dato]}
              puedeEditar={data.clasificacionLista}
              onGuardada={setGuardada}
              hoy={data.hoy}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * La relación de Smarteam con la cuenta en HubSpot (2026-10-09, `lib/cs/relacion-gestionada.ts`): si la
 * gestiona, cuándo vence, lo último que hizo Smarteam en su portal y quién, y qué hacer para que no se pierda.
 * Sin ella, HubSpot deja de compartir el uso y la cuenta deja de sumar puntos de partner.
 */
function RelacionConHubspot({ data }: { data: CsAccountData }) {
  const p = data.cuenta.partner;
  if (!p) return null;
  const r = relacionConHubspot(p, data.hoy);
  const pide = r.tono === "ambar";
  return (
    <section className="flex flex-col gap-2.5" data-recorrido="cs.relacion">
      <span className={cn(ROTULO_DEL_SISTEMA, "flex items-center gap-1.5")}>
        Relación con HubSpot
        <InfoHint text={REGLA_DE_LA_RELACION} />
      </span>
      <div className={cn("flex flex-col gap-1.5 rounded-xl border px-3 py-2.5 text-[13px]", pide ? "border-warn-line bg-warn-surface" : "border-line bg-surface")}>
        <span className="flex items-center gap-1.5 font-semibold text-fg">
          <Punto color={r.tono === "verde" ? "verde" : r.tono === "ambar" ? "ambar" : "gris"} />
          {r.corto}
        </span>
        <p className="text-fg-secondary">{r.porque}</p>
        {r.queHacer && <p className={pide ? "text-warn-ink" : "text-fg-muted"}>{r.queHacer}</p>}
        {pide && p.enlacePortal && (
          <a href={p.enlacePortal} target="_blank" rel="noreferrer" className="self-start text-xs font-semibold text-brand hover:text-brand-light">
            Abrir su portal ↗
          </a>
        )}
      </div>
    </section>
  );
}

/** Una minuta de hace más de un mes ya no describe la cuenta. */
const DIAS_MINUTA_VIEJA = 30;

function FilaDeEquipo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-[13px]">
      <span className="text-fg-muted">{etiqueta}</span>
      <span className="text-right text-fg">{children}</span>
    </div>
  );
}

function Fuente({ nombre, at, hoy, viejoDespues = 3 }: { nombre: string; at: string | null; hoy: string; viejoDespues?: number }) {
  const viejo = !at || diasEntre(at, hoy) > viejoDespues;
  return (
    <span className="flex justify-between gap-2">
      <span className="text-fg-secondary">{nombre}</span>
      <span className={viejo ? "text-warn-ink" : "text-fg-muted"}>{at ? fmtDia(at, hoy) : "sin datos"}</span>
    </span>
  );
}

/**
 * Las alertas vivas de la cuenta, con resolver y descartar (y una nota corta opcional). Las cerradas
 * de los últimos 30 días quedan plegadas abajo, para consultarlas o volver a abrirlas.
 */
function Alertas({ data }: { data: CsAccountData }) {
  const router = useRouter();
  const [cerradas, setCerradas] = useState<ReadonlySet<string>>(new Set());
  const [verCerradas, setVerCerradas] = useState(false);
  const alertas = data.cuenta.alertas.filter((a) => !cerradas.has(a.id));

  return (
    <section className="flex flex-col gap-2.5" data-recorrido="cs.alertas">
      <span className={ROTULO_DEL_SISTEMA}>Alertas · {alertas.length}</span>
      {alertas.length === 0 ? (
        <p className="text-[13px] text-fg-muted">Ninguna alerta abierta.</p>
      ) : (
        alertas.map((a) => (
          <AlertaParaCerrar
            key={a.id}
            alerta={a}
            hoy={data.hoy}
            onCerrada={(id) => {
              setCerradas((s) => new Set(s).add(id));
              router.refresh();
            }}
          />
        ))
      )}
      {data.alertasCerradas.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setVerCerradas((v) => !v)}
            aria-expanded={verCerradas}
            className="self-start text-xs text-fg-muted transition-colors hover:text-fg"
          >
            {verCerradas ? "Ocultar las cerradas" : `Ver las cerradas · ${data.alertasCerradas.length}`}
          </button>
          {verCerradas && <AlertasCerradas alertas={data.alertasCerradas} hoy={data.hoy} />}
        </>
      )}
    </section>
  );
}
