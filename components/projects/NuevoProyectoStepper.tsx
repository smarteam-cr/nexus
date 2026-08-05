"use client";

/**
 * components/projects/NuevoProyectoStepper.tsx — EL BOTÓN ÚNICO del alta (Tanda C).
 *
 * ── QUÉ REEMPLAZA ────────────────────────────────────────────────────────────
 * Hasta ahora, arrancar un proyecto se hacía desde el asistente de HANDOFF: el único botón
 * que creaba un proyecto en HubSpot vivía adentro del flujo que redacta un documento. Eso
 * tenía tres consecuencias que este botón corrige:
 *
 *   1. Solo se podían crear IMPLEMENTACIONES. Un desarrollo o un sitio web había que
 *      crearlos a mano en HubSpot y esperar diez minutos a que el espejo los trajera —
 *      que es exactamente lo que pasó con Grupo Printer.
 *   2. Los líderes de CS no podían arrancar un proyecto, aunque sí editar su handoff.
 *   3. Si HubSpot fallaba en el medio, quedaba una fila invisible en Nexus.
 *
 * ── EL RECORRIDO ─────────────────────────────────────────────────────────────
 *   Empresa  → dominio → HubSpot (mismo paso del asistente viejo, con su auto-búsqueda).
 *   Proyecto → tipo · nombre · de qué cuelga · trato ganado · interno,
 *              o ADJUNTAR uno que ya existe en HubSpot.
 *   Listo    → curar las sesiones, igual que antes.
 *
 * El asistente viejo NO se borra en este commit: se esconde. Si algo de esto falla, volver
 * a mostrarlo es un cambio de una línea.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Modal, Button, Input } from "@/components/ui";
import { useMe } from "@/hooks/useMe";
import SessionSelectionReview from "@/components/clients/SessionSelectionReview";
import { UnreviewedSessionsChip } from "@/components/clients/ProjectSessionsReview";
import {
  PROJECT_PIPELINES,
  exigeTratoGanado,
  pipelineByKey,
  resolvePipeline,
} from "@/lib/projects/kind";
import type { ProjectPipelineKey } from "@/lib/projects/kind";
import { etiquetarAmbiguos, nombreYaUsado, rotuloDeHubspot } from "@/lib/projects/lista-de-empresa";
import { armarCuerpoDelAlta } from "@/lib/projects/alta";
import { DOMINIO_PROPIO } from "@/lib/sessions/dominio-propio";

/** Las rutas que este botón consume. Importadas por la guarda de paridad, no repetidas. */
export const RUTAS_DEL_ALTA = {
  buscarEmpresa: "/api/handoffs/lookup",
  proyectosDeLaEmpresa: "/api/handoffs/projects-of-company",
  crear: "/api/projects",
} as const;

interface Trato {
  id: string;
  name: string;
  amount: string | null;
  closedate: string | null;
  isWon: boolean;
  pipeline: string | null;
}
interface Busqueda {
  company: { id: string; name: string; domain: string | null } | null;
  deals: Trato[];
  existingClientId: string | null;
  existingClientName: string | null;
}
interface ProyectoDeLaEmpresa {
  hubspotProjectId: string;
  name: string;
  stage: string | null;
  createdAt: string | null;
  nexusProjectId: string | null;
  hasHandoff: boolean;
  /** El tipo MATERIALIZADO en Nexus. `null` = todavía no está acá, o es anterior a la Tanda A. */
  nexusPipelineId: string | null;
  /** Lo que HubSpot dice sobre "interno". Se MUESTRA, no se elige (ver la rama de adjuntar). */
  interno: boolean;
  /** El pipeline que el record tiene EN HUBSPOT. `null` = el record no declara ninguno. */
  hubspotPipelineId: string | null;
}

type Paso = "empresa" | "proyecto" | "listo";
const PASOS: { key: Paso; label: string }[] = [
  { key: "empresa", label: "Empresa" },
  { key: "proyecto", label: "Proyecto" },
  { key: "listo", label: "Listo" },
];

/** Lo que el usuario pega (URL con www/path/query) → dominio pelado. */
function extraerDominio(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0]
    .trim();
}
function pareceDominio(d: string): boolean {
  return /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(d);
}
function fmtFecha(raw: string): string {
  const d = new Date(raw);
  return isNaN(d.getTime())
    ? raw
    : d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

export default function NuevoProyectoStepper() {
  const router = useRouter();
  const me = useMe();
  const puedeCrear = me?.permissions.sections.proyectos?.create === true;

  const [abierto, setAbierto] = useState(false);
  const [paso, setPaso] = useState<Paso>("empresa");
  const [dominio, setDominio] = useState("");
  const [dominioBuscado, setDominioBuscado] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState<Busqueda | null>(null);
  const [proyectosHs, setProyectosHs] = useState<ProyectoDeLaEmpresa[]>([]);

  // Lo que se elige en el paso 2.
  const [tipo, setTipo] = useState<ProjectPipelineKey>("customer-success");
  const [nombre, setNombre] = useState("");
  const [tratoId, setTratoId] = useState("");
  const [sinTratoMotivo, setSinTratoMotivo] = useState("");
  const [interno, setInterno] = useState(false);
  const [hermanoHsId, setHermanoHsId] = useState("");
  /** "nuevo" | hubspotProjectId del que se adjunta. */
  const [seleccion, setSeleccion] = useState("nuevo");

  const [creado, setCreado] = useState<{
    clientId: string;
    projectId: string;
    termino: boolean;
    /** Presente solo si el alta cayó en un cliente que ya existía. */
    clienteReusado?: { nombre: string; reapuntado: boolean } | null;
  } | null>(
    null,
  );

  const yaBuscado = useRef("");

  const buscar = useCallback(async (raw: string) => {
    const d = extraerDominio(raw);
    if (d.length < 3) return;
    yaBuscado.current = d;
    setOcupado(true);
    setError(null);
    try {
      const r = await fetch(`${RUTAS_DEL_ALTA.buscarEmpresa}?domain=${encodeURIComponent(d)}`);
      const data = (await r.json()) as Busqueda & { error?: string };
      if (!r.ok) {
        setError(data.error ?? "No se pudo buscar.");
        return;
      }
      if (!data.company) {
        /* El alta NO crea la empresa en HubSpot: si no existe allá, se detiene y lo dice.
           Crear empresas es una decisión comercial que se toma en el CRM, no un efecto
           secundario de arrancar un proyecto. */
        setError("No existe esa empresa en HubSpot. Creala allá primero y volvé.");
        return;
      }
      setBusqueda(data);
      setDominioBuscado(d);
      const ganados = data.deals.filter((x) => x.isWon);
      /* ⚠ SIEMPRE se reescribe, aunque no haya un único ganado. Antes solo se pisaba con
         exactamente uno, así que con 0 o con 2+ sobrevivía el trato de la empresa ANTERIOR — y no
         es un campo cualquiera: el alta lo escribe en `hubspotDealId` y el creador lo manda dentro
         de las ASOCIACIONES del POST, o sea que en HubSpot quedaba un proyecto de la empresa B
         colgado del trato ganado de la empresa A. Sin error, sin aviso, y con la pantalla
         mostrando el trato como no elegido. */
      setTratoId(ganados.length === 1 ? ganados[0].id : "");
      setNombre(ganados[0]?.name ?? data.company.name);
      try {
        const pr = await fetch(
          `${RUTAS_DEL_ALTA.proyectosDeLaEmpresa}?companyId=${data.company.id}`,
        );
        const pdata = (await pr.json()) as { projects?: ProyectoDeLaEmpresa[] };
        setProyectosHs(pdata.projects ?? []);
      } catch {
        setProyectosHs([]);
      }
      /* ⚠ Soltar lo que era de la empresa ANTERIOR. `buscar()` no reseteaba `seleccion`, y con la
         casilla de interno en el paso 1 eso deja de ser un borde raro y pasa a ser el camino
         normal: elegir un proyecto para adjuntar de la empresa A, volver con "Atrás" y buscar la
         empresa B dejaba la pantalla diciendo "Traer el proyecto" mientras CREABA uno nuevo,
         porque el id elegido ya no está en la lista. `interno` sobrevive: es la intención
         declarada, no un dato de la empresa. */
      setSeleccion("nuevo");
      setHermanoHsId("");
      setSinTratoMotivo("");
      setPaso("proyecto");
    } catch {
      setError("Error de conexión.");
    } finally {
      setOcupado(false);
    }
  }, []);

  // Auto-búsqueda un segundo después de dejar de escribir, si ya parece un dominio.
  useEffect(() => {
    const d = extraerDominio(dominio);
    if (ocupado || yaBuscado.current === d || !pareceDominio(d)) return;
    const t = setTimeout(() => buscar(dominio), 1000);
    return () => clearTimeout(t);
  }, [dominio, ocupado, buscar]);

  if (!puedeCrear) return null;

  const limpiar = () => {
    setAbierto(false);
    setPaso("empresa");
    setDominio("");
    setDominioBuscado("");
    yaBuscado.current = "";
    setOcupado(false);
    setError(null);
    setBusqueda(null);
    setProyectosHs([]);
    setTipo("customer-success");
    setNombre("");
    setTratoId("");
    setSinTratoMotivo("");
    setInterno(false);
    setHermanoHsId("");
    setSeleccion("nuevo");
    setCreado(null);
  };

  const def = pipelineByKey(tipo);
  const adjuntando = seleccion !== "nuevo";
  /* El record elegido para adjuntar. Vive acá y no dentro del envío porque la pantalla también lo
     necesita: al adjuntar, el tipo y la marca de interno se MUESTRAN con lo que dice HubSpot. */
  const adjuntado = adjuntando
    ? proyectosHs.find((p) => p.hubspotProjectId === seleccion)
    : undefined;
  /* El tipo del record que se va a traer, en clave. `null` = HubSpot lo tiene en un pipeline que
     Nexus no conoce; entonces el alta NO se puede terminar (el motor compara el tipo que vuelve
     contra el declarado y nunca coincidirían), así que se dice acá en vez de dejar el proyecto en
     cuarentena para siempre. */
  const tipoDelAdjuntado = adjuntado
    ? (resolvePipeline(adjuntado.hubspotPipelineId)?.key ?? null)
    : null;
  const adjuntadoSinTipoConocido = !!adjuntado && tipoDelAdjuntado === null;

  /* ADJUNTAR es solo para lo que TODAVÍA NO está en Nexus. Los que ya están se mostraban como
     opciones deshabilitadas y la primera persona que lo usó intentó elegirlas y se trabó: en una
     lista de "elegí uno", una fila que no se puede elegir no informa, estorba. Se resumen abajo
     en una línea, que sigue sirviendo para no crear un duplicado sin darse cuenta. */
  const adjuntables = proyectosHs.filter((p) => !p.nexusProjectId);
  const yaEnNexus = proyectosHs.filter((p) => !!p.nexusProjectId);

  /* Solo se puede colgar de una IMPLEMENTACIÓN de Customer Success que ya esté en Nexus.
     Las dos condiciones importan: el tipo, porque es lo que el servidor acepta como padre
     (`resolvePipeline(...).key === "customer-success"` en app/api/projects/route.ts); y estar en
     Nexus, porque el alta valida el hermano contra su fila de acá. Antes se filtraba solo por lo
     segundo, así que el desplegable ofrecía desarrollos y el rechazo llegaba recién al enviar,
     con el formulario entero ya lleno. */
  const hermanosPosibles = etiquetarAmbiguos(
    proyectosHs.filter(
      (p) => !!p.nexusProjectId && resolvePipeline(p.nexusPipelineId)?.key === "customer-success",
    ),
  );
  /* Un proyecto INTERNO no cuelga de nadie, así que ni se pregunta. La regla de verdad vive en
     `armarCuerpoDelAlta` —esconder un campo no limpia su valor— y esto es solo la mitad visible:
     no tiene sentido pedir un dato que el envío va a descartar. */
  const puedeTenerHermano =
    !interno && def.canBeSiblingOf.length > 0 && hermanosPosibles.length > 0;

  /* Aviso, nunca bloqueo. Dos proyectos del mismo cliente pueden llamarse igual con toda
     legitimidad; lo que no puede pasar es crear un homónimo SIN QUERER — y el campo viene con el
     nombre de la empresa por defecto, así que pasa fácil. */
  const nombreChoca = adjuntando ? null : nombreYaUsado(nombre, proyectosHs);

  const tratosGanados = (busqueda?.deals ?? []).filter((d) => d.isWon);
  /* La MISMA función que usa el endpoint. Si la pantalla la copiara, un día pediría trato
     donde el servidor no lo pide (o al revés) y el formulario quedaría trabado sin motivo. */
  const pideTrato =
    !adjuntando &&
    exigeTratoGanado({ pipeline: def, interno, tieneHermano: !!hermanoHsId });
  const tratoResuelto = !pideTrato || !!tratoId || sinTratoMotivo.trim().length > 0;

  const listoParaCrear =
    !!busqueda?.company &&
    (adjuntando || nombre.trim().length > 0) &&
    tratoResuelto &&
    /* ⚠ Se BLOQUEA, no se avisa. Si HubSpot tiene el proyecto en un pipeline que Nexus no conoce,
       el alta no puede terminar: el motor compara el tipo que volvió del espejo contra el elegido
       y, si no coinciden, deja el alta en «pendiente_espejo» PARA SIEMPRE. Y eso no se ve como un
       error: el proyecto existe, se abre, se ve normal — y nunca entra a cobranza. Dejarlo crear
       con un aviso sería fabricar ese estado a sabiendas. */
    !adjuntadoSinTipoConocido &&
    !ocupado;

  const crear = async () => {
    if (!busqueda?.company || ocupado) return;
    setOcupado(true);
    setError(null);
    try {
      const empresa = busqueda.company;

      /* El cuerpo lo arma una función PURA. Acá vivía suelto, y ahí se escondía el bug del
         hermano fantasma: esconder un campo no es lo mismo que limpiarlo. */
      const cuerpo = armarCuerpoDelAlta({
        nombre,
        pipeline: tipo,
        interno,
        hermanoHsId,
        tratoId,
        sinTratoMotivo,
        clientId: busqueda.existingClientId,
        companyId: empresa.id,
        companyName: empresa.name,
        domain: empresa.domain,
        adjuntar: adjuntado ? { ...adjuntado, pipeline: tipoDelAdjuntado } : null,
      });

      const res = await fetch(RUTAS_DEL_ALTA.crear, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const data = (await res.json()) as {
        projectId?: string;
        clientId?: string;
        termino?: boolean;
        clienteReusado?: { nombre: string; reapuntado: boolean } | null;
        error?: string;
      };
      if (res.status === 409 && data.projectId && data.clientId) {
        // Ya existe: no es un error, es "andá a verlo".
        router.push(`/clients/${data.clientId}/projects/${data.projectId}`);
        limpiar();
        return;
      }
      if (!res.ok || !data.projectId || !data.clientId) {
        throw new Error(data.error ?? "No se pudo crear el proyecto.");
      }
      /* Se llega a "listo" aunque el alta NO haya terminado. Es deliberado: el proyecto ya
         existe en Nexus, se puede abrir, y el cartel de adentro ofrece "Reintentar". Tratar
         el alta a medias como un fracaso dejaría a la persona sin ningún lugar adonde ir. */
      setCreado({
        clientId: data.clientId,
        projectId: data.projectId,
        termino: !!data.termino,
        clienteReusado: data.clienteReusado ?? null,
      });
      setPaso("listo");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear el proyecto.");
    } finally {
      setOcupado(false);
    }
  };

  const idxPaso = paso === "empresa" ? 0 : paso === "proyecto" ? 1 : 2;
  const alcanzable = (s: Paso): boolean =>
    paso === "listo" ? false : s === "empresa" ? true : s === "proyecto" ? !!busqueda : false;
  const dominioSinTocar = !!busqueda && extraerDominio(dominio) === dominioBuscado;

  const pie =
    paso === "empresa" ? (
      <>
        <Button type="button" variant="secondary" size="md" onClick={limpiar} disabled={ocupado}>
          Cancelar
        </Button>
        {dominioSinTocar ? (
          <Button
            type="button"
            variant="primary"
            size="md"
            className="bg-brand hover:bg-brand-dark"
            onClick={() => setPaso("proyecto")}
          >
            Siguiente
          </Button>
        ) : (
          <Button
            type="submit"
            form="alta-dominio"
            variant="primary"
            size="md"
            className="bg-brand hover:bg-brand-dark"
            loading={ocupado}
            disabled={dominio.trim().length < 3}
          >
            Buscar empresa
          </Button>
        )}
      </>
    ) : paso === "proyecto" ? (
      <>
        <Button type="button" variant="secondary" size="md" onClick={() => setPaso("empresa")} disabled={ocupado}>
          Atrás
        </Button>
        <Button
          type="button"
          variant="primary"
          size="md"
          className="bg-brand hover:bg-brand-dark"
          onClick={crear}
          loading={ocupado}
          disabled={!listoParaCrear}
        >
          {adjuntando ? "Traer el proyecto" : "Crear el proyecto"}
        </Button>
      </>
    ) : (
      <>
        <Button type="button" variant="secondary" size="md" onClick={limpiar}>
          Cerrar
        </Button>
        {creado && (
          <Button
            type="button"
            variant="primary"
            size="md"
            className="bg-brand hover:bg-brand-dark"
            onClick={() => {
              const c = creado;
              limpiar();
              router.push(`/clients/${c.clientId}/projects/${c.projectId}`);
            }}
          >
            Ir al proyecto
          </Button>
        )}
      </>
    );

  return (
    <>
      <Button variant="primary" size="md" className="bg-brand hover:bg-brand-dark" onClick={() => setAbierto(true)}>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Nuevo proyecto
      </Button>

      <Modal open={abierto} onClose={limpiar} title="Nuevo proyecto" size="md" footer={pie}>
        <div className="flex items-center gap-2 mb-4">
          {PASOS.map((s, i) => {
            const activo = i === idxPaso;
            const clickeable = alcanzable(s.key) && !activo;
            return (
              <div key={s.key} className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!clickeable}
                  onClick={() => clickeable && setPaso(s.key)}
                  className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
                    activo
                      ? "text-fg"
                      : clickeable
                        ? "text-fg-muted hover:text-fg cursor-pointer"
                        : "text-fg-muted cursor-default"
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                      activo ? "bg-brand text-primary-fg border-brand" : "border-line text-fg-muted"
                    }`}
                  >
                    {i + 1}
                  </span>
                  {s.label}
                </button>
                {i < PASOS.length - 1 && <span className="w-4 h-px bg-line" />}
              </div>
            );
          })}
        </div>

        {/* ── Paso 1 · la empresa ───────────────────────────────────────────── */}
        {paso === "empresa" && (
          <form
            id="alta-dominio"
            onSubmit={(e) => {
              e.preventDefault();
              buscar(dominio);
            }}
            className="space-y-3"
          >
            <p className="text-xs text-fg-muted leading-relaxed">
              Pegá el dominio de la empresa. La buscamos en HubSpot apenas se vea completo.
            </p>
            <div>
              <label className="block text-2xs font-medium text-fg-muted uppercase tracking-wider mb-1">
                Dominio <span className="text-brand">*</span>
              </label>
              <Input
                type="text"
                value={dominio}
                onChange={(e) => setDominio(e.target.value)}
                placeholder="Ej: acmecorp.com"
                autoFocus
              />
            </div>
            {/* Interno — vive ACÁ y no en el paso siguiente porque es lo PRIMERO que se sabe:
                quien va a crear un proyecto interno no tiene por qué tipear el dominio de su
                propia empresa para recién después catalogarlo. Marcarlo lo completa. */}
            <label className="flex items-start gap-2 px-3 py-2 rounded-lg border border-line hover:bg-surface-hover cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={interno}
                onChange={(e) => {
                  const marcado = e.target.checked;
                  setInterno(marcado);
                  /* Se limpia al MARCAR: si no, desmarcar más tarde reviviría un hermano que la
                     persona ya no está viendo desde hace rato. El envío lo descarta igual
                     (`armarCuerpoDelAlta`), pero el estado no puede quedar mintiendo:
                     `exigeTratoGanado` lo lee para decidir si pedir el trato. */
                  if (marcado) setHermanoHsId("");
                  /* Completa el dominio propio solo si el campo está VACÍO, y no lo borra al
                     desmarcar: pisar o tirar algo que la persona escribió es peor que dejar un
                     valor visible que puede corregir. El campo queda editable a propósito — un
                     interno puede ser para otra empresa (el caso SmartAgro). */
                  if (marcado && !dominio.trim()) setDominio(DOMINIO_PROPIO);
                }}
              />
              <span className="flex-1 min-w-0">
                <span className="text-sm text-fg block">Proyecto interno de Smarteam</span>
                <span className="text-[11px] text-fg-muted leading-relaxed">
                  No se factura, no es cartera de nadie y no se le publica nada al cliente. Se
                  completa el dominio de Smarteam; si el proyecto es para otra empresa, cambialo.
                </span>
              </span>
            </label>
            {ocupado ? (
              <p className="flex items-center gap-2 text-xs text-fg-muted">
                <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Buscando empresa en HubSpot…
              </p>
            ) : error ? (
              <p className="text-xs text-danger-ink">{error}</p>
            ) : null}
          </form>
        )}

        {/* ── Paso 2 · el proyecto ──────────────────────────────────────────── */}
        {paso === "proyecto" && busqueda?.company && (
          <div className="space-y-4">
            <div className="rounded-lg border border-line bg-surface-muted px-3 py-2">
              <p className="text-sm font-semibold text-fg">{busqueda.company.name}</p>
              <p className="text-xs text-fg-muted">{busqueda.company.domain ?? "(sin dominio)"}</p>
              {busqueda.existingClientName && (
                <p className="text-[11px] text-fg-muted mt-1">
                  Ya existe en Nexus como{" "}
                  <span className="font-medium text-fg">{busqueda.existingClientName}</span> — se reusa.
                </p>
              )}
            </div>

            {/* Nuevo o adjuntar uno que ya está en HubSpot */}
            {adjuntables.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-2xs font-medium text-fg-muted uppercase tracking-wider">
                  Ya en HubSpot, todavía no en Nexus
                </p>
                {etiquetarAmbiguos(adjuntables).map((p) => {
                  /* El tipo y la etapa YA viajaban en la respuesta y no los pintaba nadie. Sin
                     ellos, elegir es adivinar: la mayoría de los adjuntables reales del portal
                     está en «Finalizado» o «Bloqueado», y traer uno muerto se ve igual que traer
                     uno vivo hasta que alguien lo abre. */
                  const rot = rotuloDeHubspot(p);
                  return (
                    <label
                      key={p.hubspotProjectId}
                      className="flex items-start gap-2 px-3 py-2 rounded-lg border border-line hover:bg-surface-hover cursor-pointer"
                    >
                      <input
                        type="radio"
                        className="mt-1"
                        name="alta-proyecto"
                        checked={seleccion === p.hubspotProjectId}
                        onChange={() => setSeleccion(p.hubspotProjectId)}
                      />
                      <span className="flex-1 min-w-0">
                        <span className="text-sm text-fg block truncate">{p.etiqueta}</span>
                        <span
                          className={`text-[11px] block truncate ${rot.desconocido ? "text-danger-ink" : "text-fg-muted"}`}
                        >
                          {rot.texto}
                        </span>
                      </span>
                    </label>
                  );
                })}
                <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-line hover:bg-surface-hover cursor-pointer">
                  <input
                    type="radio"
                    name="alta-proyecto"
                    checked={seleccion === "nuevo"}
                    onChange={() => setSeleccion("nuevo")}
                  />
                  <span className="text-sm text-fg">Crear uno nuevo</span>
                </label>
              </div>
            )}

            {/* Los que ya están en Nexus NO son opciones —traerlos otra vez no significa nada—
                pero decir cuántos hay evita el duplicado por desconocimiento, que es la razón por
                la que esta sección existe. */}
            {yaEnNexus.length > 0 && (
              <p className="text-[11px] text-fg-muted leading-relaxed">
                {yaEnNexus.length === 1
                  ? "Esta empresa ya tiene 1 proyecto en Nexus."
                  : `Esta empresa ya tiene ${yaEnNexus.length} proyectos en Nexus.`}{" "}
                Si el que buscás es uno de ésos, no hace falta crearlo: ya está.
              </p>
            )}

            {adjuntando ? (
              /* Al ADJUNTAR, el tipo se MUESTRA, no se elige: el record ya existe en HubSpot
                 con su pipeline puesto, y moverlo de pipeline es otra operación. */
              <div className="space-y-2">
                {adjuntadoSinTipoConocido ? (
                  <p className="text-xs leading-relaxed rounded-lg border border-danger-line bg-danger-surface px-3 py-2 text-danger-ink">
                    Este proyecto está en un pipeline de HubSpot que Nexus todavía no conoce, así que
                    no se puede traer: el alta quedaría a medio hacer y el proyecto nunca entraría a
                    cobranza. Movelo en HubSpot a Implementación, Desarrollo o Sitios web, y volvé.
                  </p>
                ) : (
                  <p className="text-xs text-fg-muted leading-relaxed rounded-lg border border-line bg-surface-muted px-3 py-2">
                    Se trae el proyecto tal como está en HubSpot, con su tipo y su etapa. Si hay que
                    cambiarle el tipo, eso se hace allá.
                  </p>
                )}
                {/* La casilla de interno, en gris. NO es editable a propósito: acá Nexus no crea
                    nada en HubSpot, así que marcarla no se aplicaría a nada — prometería algo que
                    no puede cumplir. Se muestra deshabilitada para que se vea qué va a pasar. */}
                <label className="flex items-start gap-2 px-3 py-2 rounded-lg border border-line bg-surface-muted opacity-70 cursor-not-allowed">
                  <input type="checkbox" className="mt-1" checked={adjuntado?.interno ?? false} disabled readOnly />
                  <span className="flex-1 min-w-0">
                    <span className="text-sm text-fg block">Proyecto interno de Smarteam</span>
                    <span className="text-[11px] text-fg-muted leading-relaxed">
                      {adjuntado?.interno
                        ? "Así está marcado en HubSpot: no se factura, no es cartera de nadie y no se le publica nada al cliente."
                        : "En HubSpot no está marcado como interno. Para cambiarlo, se marca allá."}
                    </span>
                  </span>
                </label>
              </div>
            ) : (
              <>
                {/* Tipo */}
                <div className="space-y-1.5">
                  <p className="text-2xs font-medium text-fg-muted uppercase tracking-wider">
                    Tipo de proyecto
                  </p>
                  {PROJECT_PIPELINES.map((p) => (
                    <label
                      key={p.key}
                      className="flex items-start gap-2 px-3 py-2 rounded-lg border border-line hover:bg-surface-hover cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="alta-tipo"
                        className="mt-1"
                        checked={tipo === p.key}
                        onChange={() => {
                          setTipo(p.key);
                          // El hermano depende del tipo: cambiarlo invalida lo elegido antes.
                          setHermanoHsId("");
                        }}
                      />
                      <span className="flex-1 min-w-0">
                        <span className="text-sm text-fg block">{p.label}</span>
                        <span className="text-[11px] text-fg-muted leading-relaxed">{p.help}</span>
                      </span>
                    </label>
                  ))}
                </div>

                {/* Nombre */}
                <div className="space-y-1.5">
                  <label className="block text-2xs font-medium text-fg-muted uppercase tracking-wider">
                    Nombre <span className="text-brand">*</span>
                  </label>
                  <Input
                    type="text"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Nombre del proyecto"
                  />
                  {nombreChoca && (
                    <p className="text-[11px] text-warn-ink bg-warn-surface border border-warn-line rounded-lg px-2.5 py-1.5 leading-relaxed">
                      Este cliente ya tiene un proyecto llamado «{nombreChoca}». Podés seguir igual,
                      pero después van a ser difíciles de distinguir.
                    </p>
                  )}
                </div>

                {/* De qué cuelga */}
                {puedeTenerHermano && (
                  <div className="space-y-1.5">
                    <p className="text-2xs font-medium text-fg-muted uppercase tracking-wider">
                      ¿Cuelga de una implementación?
                    </p>
                    <p className="text-[11px] text-fg-muted leading-relaxed">
                      Si cuelga, no se factura aparte: cobra la implementación.
                    </p>
                    <select
                      value={hermanoHsId}
                      onChange={(e) => setHermanoHsId(e.target.value)}
                      className="w-full text-sm border border-line rounded-lg px-3 py-2 bg-surface text-fg focus:outline-none focus:border-brand"
                    >
                      <option value="">Va solo (se factura aparte)</option>
                      {hermanosPosibles.map((p) => (
                        <option key={p.hubspotProjectId} value={p.hubspotProjectId}>
                          Cuelga de {p.etiqueta}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Trato ganado — solo cuando el proyecto COBRA */}
                {pideTrato && (
                  <div className="space-y-1.5">
                    <p className="text-2xs font-medium text-fg-muted uppercase tracking-wider">
                      Trato ganado <span className="text-brand">*</span>
                    </p>
                    <p className="text-[11px] text-fg-muted leading-relaxed">
                      Este proyecto se le cobra al cliente, así que necesita un trato ganado. Si no
                      lo tiene todavía, escribí por qué va sin él.
                    </p>
                    {tratosGanados.map((d) => (
                      <label
                        key={d.id}
                        className="flex items-start gap-2 px-3 py-2 rounded-lg border border-line hover:bg-surface-hover cursor-pointer"
                      >
                        <input
                          type="radio"
                          name="alta-trato"
                          className="mt-1"
                          checked={tratoId === d.id}
                          onChange={() => {
                            setTratoId(d.id);
                            setSinTratoMotivo("");
                          }}
                        />
                        <span className="flex-1 min-w-0">
                          <span className="text-sm text-fg block">{d.name}</span>
                          {d.pipeline && <span className="text-[11px] text-fg-muted">{d.pipeline}</span>}
                        </span>
                        {d.closedate && (
                          <span className="text-xs text-fg-muted flex-shrink-0 mt-0.5">
                            {fmtFecha(d.closedate)}
                          </span>
                        )}
                      </label>
                    ))}
                    {!tratoId && (
                      <Input
                        type="text"
                        value={sinTratoMotivo}
                        onChange={(e) => setSinTratoMotivo(e.target.value)}
                        placeholder={
                          tratosGanados.length === 0
                            ? "No hay tratos ganados. ¿Por qué arranca igual?"
                            : "…o explicá por qué va sin trato"
                        }
                      />
                    )}
                  </div>
                )}
              </>
            )}

            {error && <p className="text-xs text-danger-ink">{error}</p>}
          </div>
        )}

        {/* ── Paso 3 · listo ────────────────────────────────────────────────── */}
        {paso === "listo" && creado && (
          <div className="space-y-3">
            {/* El paso 1 dijo "empresa nueva" y el proyecto terminó en un cliente que ya estaba:
                pasa cuando la empresa se fusionó en HubSpot y Nexus guardaba la ficha vieja. Sin
                esta línea la persona no tiene forma de enterarse. */}
            {creado.clienteReusado && (
              <p className="text-xs text-fg-muted">
                Se usó el cliente que ya existía: <strong>{creado.clienteReusado.nombre}</strong>.
                {creado.clienteReusado.reapuntado &&
                  " Su empresa se había fusionado en HubSpot y quedó apuntando a la ficha vigente."}
              </p>
            )}
            {creado.termino ? (
              <div className="rounded-lg border border-line bg-surface-muted px-3 py-2">
                <p className="text-sm font-semibold text-fg">Proyecto creado</p>
                <p className="text-xs text-fg-muted">
                  Ya está en Nexus y en HubSpot. Revisá las sesiones que lo van a armar.
                </p>
              </div>
            ) : (
              /* No terminó: el proyecto EXISTE y se puede abrir, pero está en cuarentena.
                 Se dice acá y el cartel de adentro trae el botón de retomar. */
              <div className="rounded-xl border border-warn-line bg-warn-surface px-3 py-2">
                <p className="text-sm font-semibold text-warn-ink">
                  El proyecto quedó a medio crear
                </p>
                <p className="text-xs text-warn-ink/80 leading-relaxed">
                  Existe en Nexus y se puede abrir, pero falta terminarlo en HubSpot. Mientras
                  tanto no se factura ni entra en la cartera. Entrá al proyecto y apretá
                  «Reintentar».
                </p>
              </div>
            )}
            <UnreviewedSessionsChip projectId={creado.projectId} />
            <SessionSelectionReview projectId={creado.projectId} />
          </div>
        )}
      </Modal>
    </>
  );
}
