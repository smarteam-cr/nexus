"use client";

/**
 * components/cs/CsPanel.tsx — el ÍNDICE de Éxito del cliente: la pantalla de la líder de Customer
 * Success (rediseño 2026-10-04, sistema «Nexus · interfaz interna»).
 *
 * Responde las preguntas del lunes, una por pestaña: a quién llamar, qué renueva, si usan lo que
 * compraron, dónde crecer, cómo está cada CSE y qué cuentas sostienen el nivel de partner. Arriba,
 * la cartera en una línea y la entrega de proyectos; a la derecha, «Qué sigue» y de dónde salen
 * los datos (con su fecha: la CSL tiene que saber qué tan viejo es lo que mira).
 *
 * Todo viene calculado del servidor (`lib/cs/cartera.ts` → `lib/cs/cartera-reglas.ts`); acá solo
 * se filtra. Las fechas relativas se calculan contra `data.hoy`, nunca contra el reloj del
 * navegador: el servidor y el cliente tienen que pintar lo mismo.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { Alert, PageHeader, Tabs } from "@/components/ui";
import { BotonBlanco, QueSigue, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { cn } from "@/lib/cn";
import { diasEntre, fmtDia, fmtMonto, haceCuanto, plural } from "@/lib/cs/formato";
import type { CarteraDeLaCsl } from "@/lib/cs/cartera";
import { Punto } from "./piezas";
import Llamar, { type FiltroDeEntrega } from "./cartera/Llamar";
import Renovaciones from "./cartera/Renovaciones";
import UsoYLicencias from "./cartera/UsoYLicencias";
import Crecimiento from "./cartera/Crecimiento";
import Equipo from "./cartera/Equipo";
import NivelDePartner from "./cartera/NivelDePartner";
import PanelLateral from "@/components/ui/PanelLateral";

type Pestana = "llamar" | "renovaciones" | "uso" | "crecimiento" | "equipo" | "nivel";

/** Un dato de más de 3 días ya se avisa. */
const DIAS_PARA_VIEJO = 3;

export default function CsPanel({
  data,
  puedeCurar,
  contenedor,
}: {
  data: CarteraDeLaCsl;
  /** El padding de la columna de contenido: la página pasa su `SHELL_*`, el mismo que su loading. */
  contenedor: string;
  /**
   * ⚠ Quien puede ESCRIBIR desde esta pantalla (`clientes.viewAll`): refrescar señales y correr el
   * vigía recorren la cartera entera y sus endpoints siguen en ese gate. Requerido y sin default:
   * sacarlo del call site es un error de compilación, no un botón que se pinta y da 403.
   */
  puedeCurar: boolean;
}) {
  const [pestana, setPestana] = useState<Pestana>("llamar");
  const [filtroDeEntrega, setFiltroDeEntrega] = useState<FiltroDeEntrega | null>(null);
  const { linea, entrega, fuentes } = data;
  // Todos los que llevan algún cliente, para el filtro por CSE (quien está de baja ya no aparece:
  // sus proyectos cuentan como sin CSE).
  const cses = useMemo(() => data.equipo.filas.map((f) => f.nombre), [data.equipo.filas]);

  const verEnLlamar = (f: FiltroDeEntrega) => {
    setPestana("llamar");
    setFiltroDeEntrega(f);
  };

  const partnerViejo = !fuentes.partner.at || diasEntre(fuentes.partner.at, data.hoy) > DIAS_PARA_VIEJO;
  const renovaciones90 = data.renovaciones.filter((r) => r.dias <= 90);
  const conConsumo = data.consumo.paganYNoUsan.length + data.consumo.alLimite.length;

  return (
    <div className="flex flex-col lg:min-h-screen lg:flex-row">
      <main className={cn(contenedor, "min-w-0 flex-1")}>
        <PageHeader
          title="Éxito del cliente"
          recorrido="exito-listado"
          description={`${plural(data.conProyecto, "cuenta con proyecto activo", "cuentas con proyecto activo")} · ${plural(data.gestionadas, "gestionada", "gestionadas")} en HubSpot.`}
        />

        {partnerViejo && (
          <Alert variant="warning" className="mb-5" title={fuentes.partner.at ? `El uso, las licencias y las renovaciones son del ${fmtDia(fuentes.partner.at, data.hoy)}.` : "Todavía no hay datos de HubSpot Partner."}>
            {fuentes.partner.apagado ? "La copia diaria de HubSpot Partner está apagada en el servidor." : "La copia diaria de HubSpot Partner no está trayendo datos nuevos."}
          </Alert>
        )}

        <section className="mb-3" data-recorrido="cs.cartera">
          <p className={ROTULO_DEL_SISTEMA}>La cartera en una línea</p>
          <div className="mt-2 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
            <Estadistica numero={fmtMonto(linea.mrrGestionado)} etiqueta="gestionados al mes" detalle={`${plural(linea.cuentasGestionadas, "cuenta gestionada", "cuentas gestionadas")} por Smarteam`} />
            <Estadistica
              punto={linea.enRiesgo90.cuentas > 0 ? "rojo" : undefined}
              numero={fmtMonto(linea.enRiesgo90.monto)}
              etiqueta="en riesgo de lo que renueva en 90 días"
              detalle={`${linea.enRiesgo90.cuentas} de ${plural(linea.renuevan90.cuentas, "renovación", "renovaciones")} · renuevan ${fmtMonto(linea.renuevan90.monto)} al mes`}
            />
            <Estadistica
              numero={plural(linea.conSenalDeCrecimiento.cuentas, "cuenta", "cuentas")}
              etiqueta="con señal de crecimiento"
              detalle={`pagan hoy ${fmtMonto(linea.conSenalDeCrecimiento.pagan)} al mes. HubSpot no estima cuánto crecerían.`}
            />
            <Estadistica
              numero={linea.uso.promedio !== null ? String(linea.uso.promedio) : "—"}
              sufijo={linea.uso.promedio !== null ? "de 100" : undefined}
              etiqueta="uso promedio"
              detalle={
                <>
                  de {plural(linea.uso.conPuntaje, "cuenta con puntaje", "cuentas con puntaje")}
                  {linea.uso.cayendo > 0 && <span className="text-warn-ink"> · {linea.uso.cayendo} cayendo</span>}
                </>
              }
            />
          </div>
        </section>

        <div className="mb-6 flex flex-wrap items-center gap-2" data-recorrido="cs.entrega">
          <span className={cn(ROTULO_DEL_SISTEMA, "mr-1")}>Entrega de proyectos</span>
          <BotonDeEntrega color="rojo" numero={entrega.bloqueados} texto={entrega.bloqueados === 1 ? "bloqueado" : "bloqueados"} onClick={() => verEnLlamar("bloqueados")} />
          <BotonDeEntrega color="ambar" numero={entrega.atrasados} texto={entrega.atrasados === 1 ? "atrasado" : "atrasados"} onClick={() => verEnLlamar("atrasados")} />
          <BotonDeEntrega color="ambar" numero={entrega.alertasAltas} texto={entrega.alertasAltas === 1 ? "alerta alta" : "alertas altas"} onClick={() => verEnLlamar("alertas")} />
          <BotonDeEntrega color="ambar" numero={entrega.sinCse} texto={entrega.sinCse === 1 ? "proyecto sin CSE" : "proyectos sin CSE"} onClick={() => setPestana("equipo")} />
        </div>

        {/* `Tabs` no deja pasar atributos: el ancla del recorrido va en este envoltorio. */}
        <div data-recorrido="cs.preguntas">
        <Tabs<Pestana>
          aria-label="Preguntas de la cartera"
          className="mb-4"
          value={pestana}
          onChange={(k) => setPestana(k)}
          items={[
            { key: "llamar", label: "A quién llamar", count: data.llamar.length },
            { key: "renovaciones", label: "Renovaciones", count: renovaciones90.length },
            { key: "uso", label: "Uso y licencias", count: conConsumo },
            { key: "crecimiento", label: "Crecimiento", count: data.oportunidades.length },
            { key: "equipo", label: "Equipo", count: data.equipo.filas.length },
            { key: "nivel", label: "Nivel de partner" },
          ]}
        />
        </div>

        {pestana === "llamar" && (
          <Llamar
            filas={data.llamar}
            cuentas={data.cuentas}
            cses={cses}
            hoy={data.hoy}
            filtroDeEntrega={filtroDeEntrega}
            onQuitarFiltro={() => setFiltroDeEntrega(null)}
          />
        )}
        {pestana === "renovaciones" && <Renovaciones filas={data.renovaciones} hoy={data.hoy} />}
        {pestana === "uso" && <UsoYLicencias adopcion={data.adopcion} primeros90={data.primeros90} consumo={data.consumo} />}
        {pestana === "crecimiento" && <Crecimiento oportunidades={data.oportunidades} />}
        {pestana === "equipo" && <Equipo equipo={data.equipo} />}
        {pestana === "nivel" && <NivelDePartner nivel={data.nivel} hoy={data.hoy} />}
      </main>

      <PanelLateral etiqueta="Cartera" ancho="lg:w-[360px]" className="py-8">
        <QueSigueDeLaCartera data={data} onVer={setPestana} />
        <Fuentes data={data} puedeCurar={puedeCurar} />
        <Leyenda />
      </PanelLateral>
    </div>
  );
}

function Estadistica({
  numero,
  sufijo,
  etiqueta,
  detalle,
  punto,
}: {
  numero: string;
  sufijo?: string;
  etiqueta: string;
  detalle: React.ReactNode;
  punto?: "rojo";
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-line bg-surface px-4 py-3.5">
      <span className="flex items-baseline gap-1.5">
        {punto && <Punto color={punto} className="self-center" />}
        <span className="text-[22px] font-bold leading-7 tabular-nums text-fg">{numero}</span>
        {sufijo && <span className="text-[13px] text-fg-muted">{sufijo}</span>}
      </span>
      <span className="text-[13px] font-medium text-fg">{etiqueta}</span>
      <span className="text-xs text-fg-muted">{detalle}</span>
    </div>
  );
}

function BotonDeEntrega({ color, numero, texto, onClick }: { color: "rojo" | "ambar"; numero: number; texto: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] text-fg-secondary transition-colors hover:bg-surface-hover"
    >
      <Punto color={numero > 0 ? color : "gris"} />
      <b className="font-bold tabular-nums text-fg">{numero}</b> {texto}
    </button>
  );
}

function QueSigueDeLaCartera({ data, onVer }: { data: CarteraDeLaCsl; onVer: (p: Pestana) => void }) {
  const primera = data.llamar[0];
  const en30 = data.renovaciones.filter((r) => r.dias <= 30).length;
  const taller = data.adopcion.find((h) => h.tallerGrupal);
  return (
    <QueSigue
      accion={
        primera ? (
          <Link
            href={`/customer-success/${primera.clientId}`}
            className="inline-flex rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
          >
            Abrir la cuenta →
          </Link>
        ) : undefined
      }
    >
      <p>{primera ? `${primera.nombre}: ${primera.principal.texto}.` : "Nada urgente en la cartera esta semana."}</p>
      {(en30 > 0 || taller) && (
        <div className="mt-2 flex flex-col gap-1.5 border-t border-info-line pt-2 text-[13px] text-fg-secondary">
          {en30 > 0 && (
            <span>
              {plural(en30, "renovación", "renovaciones")} en 30 días.{" "}
              <button type="button" onClick={() => onVer("renovaciones")} className="text-brand hover:text-brand-light">
                Ver cuáles
              </button>
            </span>
          )}
          {taller && (
            <span>
              {taller.sinActivar.length} cuentas sin activar {taller.nombre}: un taller las cubre.{" "}
              <button type="button" onClick={() => onVer("uso")} className="text-brand hover:text-brand-light">
                Ver cuáles
              </button>
            </span>
          )}
        </div>
      )}
    </QueSigue>
  );
}

function FilaDeFuente({ nombre, que, fecha, viejo }: { nombre: string; que: string; fecha: string; viejo: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2.5">
      <span className="flex min-w-0 flex-col gap-px">
        <span className="text-[13px] font-medium text-fg">{nombre}</span>
        <span className="text-xs text-fg-muted">{que}</span>
      </span>
      <span className={cn("whitespace-nowrap text-right text-xs", viejo ? "text-warn-ink" : "text-fg-muted")}>{fecha}</span>
    </div>
  );
}

function Fuentes({ data, puedeCurar }: { data: CarteraDeLaCsl; puedeCurar: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [corriendo, setCorriendo] = useState<null | "partner" | "senales" | "vigia">(null);
  const f = data.fuentes;
  const fecha = (at: string | null) => (at ? `${fmtDia(at, data.hoy)} · ${haceCuanto(at, data.hoy)}` : "sin datos");
  const viejo = (at: string | null) => !at || diasEntre(at, data.hoy) > DIAS_PARA_VIEJO;

  async function refreshPartner() {
    setCorriendo("partner");
    toast.info("Trayendo HubSpot Partner… puede tardar un minuto.");
    try {
      const r = await fetchJson<{ supported: boolean; total: number; createdClients: unknown[] }>("/api/cs/partner/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // createClients EXPLÍCITO: el endpoint defaultea a false (defensivo) y crear Clients para
        // los registros sin match es una decisión que declara quien la quiere. Este botón la quiere.
        body: JSON.stringify({ createClients: true }),
      });
      if (!r.supported) toast.error("La app de HubSpot no tiene el permiso de Partner Clients: hay que volver a autorizarla.", { duration: 0 });
      else {
        toast.success(`HubSpot Partner: ${plural(r.total, "cuenta actualizada", "cuentas actualizadas")}.`);
        router.refresh();
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo traer HubSpot Partner.");
    } finally {
      setCorriendo(null);
    }
  }

  async function refreshSignals() {
    setCorriendo("senales");
    toast.info("Actualizando las señales de HubSpot… puede tardar un par de minutos.");
    try {
      const r = await fetchJson<{ refreshed: unknown[]; skippedFresh: number }>("/api/cs/signals/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      toast.success(`Señales actualizadas: ${plural(r.refreshed.length, "cuenta", "cuentas")} (${r.skippedFresh} ya estaban al día).`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudieron actualizar las señales.");
    } finally {
      setCorriendo(null);
    }
  }

  async function runWatchdog() {
    setCorriendo("vigia");
    toast.info("El agente vigía está revisando los proyectos con novedades…");
    try {
      const r = await fetchJson<{ ran: number; candidates: number }>("/api/cs/watchdog/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      toast.success(`Agente vigía: revisó ${r.ran} de ${plural(r.candidates, "proyecto con novedades", "proyectos con novedades")}.`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "El agente vigía falló.");
    } finally {
      setCorriendo(null);
    }
  }

  const ocupado = corriendo !== null;
  return (
    <section className="flex flex-col gap-2.5" data-recorrido="cs.fuentes">
      <p className={ROTULO_DEL_SISTEMA}>De dónde salen los datos</p>
      <div className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface">
        <FilaDeFuente nombre="HubSpot Partner" que="dinero, uso, licencias, renovaciones y señales" fecha={f.partner.apagado ? `apagado · ${fecha(f.partner.at)}` : fecha(f.partner.at)} viejo={viejo(f.partner.at) || !!f.partner.apagado} />
        <FilaDeFuente nombre="Puntos de nivel" que="los calcula HubSpot" fecha={f.puntos.at ? fmtDia(f.puntos.at, data.hoy) : "sin datos"} viejo={!f.puntos.at || diasEntre(f.puntos.at, data.hoy) > 60} />
        <FilaDeFuente nombre="Señales de HubSpot" que="tickets, contactos y registro de la empresa" fecha={f.senales.apagado ? `apagado · ${fecha(f.senales.at)}` : fecha(f.senales.at)} viejo={viejo(f.senales.at) || !!f.senales.apagado} />
        <FilaDeFuente nombre="Reuniones de Nexus" que="último contacto y minutas" fecha={fecha(f.reuniones.at)} viejo={false} />
        <FilaDeFuente nombre="Proyectos y cronogramas" que="bloqueos, atrasos y avance" fecha="en vivo" viejo={false} />
        <FilaDeFuente
          nombre="Agente vigía"
          que="cruza todo lo anterior y alerta"
          fecha={f.vigia.encendido ? (f.vigia.ultimaCorrida ? `corrió ${haceCuanto(f.vigia.ultimaCorrida, data.hoy)}` : "encendido") : "apagado"}
          viejo={!f.vigia.encendido}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {puedeCurar && (
          <BotonBlanco onClick={refreshPartner} disabled={ocupado}>
            {corriendo === "partner" ? "Trayendo…" : "Actualizar partner"}
          </BotonBlanco>
        )}
        {puedeCurar && (
          <BotonBlanco onClick={refreshSignals} disabled={ocupado}>
            {corriendo === "senales" ? "Actualizando…" : "Actualizar señales"}
          </BotonBlanco>
        )}
        {puedeCurar && (
          <BotonBlanco onClick={runWatchdog} disabled={ocupado}>
            {corriendo === "vigia" ? "Revisando…" : "Correr el agente vigía"}
          </BotonBlanco>
        )}
      </div>
    </section>
  );
}

function Leyenda() {
  const filas = useMemo(
    () => [
      { color: "rojo" as const, nombre: "En riesgo", texto: "bloqueado, cancelación registrada, facturas vencidas o renueva con el uso cayendo" },
      { color: "ambar" as const, nombre: "En fricción", texto: "atrasado, sin contacto o relación por vencer" },
      { color: "verde" as const, nombre: "Saludable", texto: "nada de lo anterior" },
    ],
    [],
  );
  return (
    <section className="flex flex-col gap-2">
      <p className={ROTULO_DEL_SISTEMA}>Qué es cada marca</p>
      <div className="flex flex-col gap-2 text-[13px] text-fg-secondary">
        {filas.map((f) => (
          <span key={f.nombre} className="flex items-start gap-2">
            <Punto color={f.color} className="mt-1.5" />
            <span>
              <b className="font-semibold text-fg">{f.nombre}</b>: {f.texto}
            </span>
          </span>
        ))}
        <span className="flex items-start gap-2">
          <span className="inline-flex flex-shrink-0 items-center rounded-full border border-fg bg-surface px-2 py-px text-[11px] font-semibold text-fg">Cruce</span>
          <span>junta dos fuentes que HubSpot no ve juntas</span>
        </span>
      </div>
    </section>
  );
}
