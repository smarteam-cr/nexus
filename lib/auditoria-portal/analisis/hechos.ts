/**
 * lib/auditoria-portal/analisis/hechos.ts — LO QUE EL ANÁLISIS SABE DEL PORTAL, EN FRASES CON CLAVE.
 *
 * El modelo no recibe la foto cruda: recibe HECHOS, cada uno con su clave («actividad.sin_actividad»)
 * y ya escrito con sus cifras y sus porcentajes. Tres razones:
 *  · Cada hallazgo cita las claves en que se apoya, y la pantalla muestra de dónde sale.
 *  · Las cifras ya vienen calculadas: el modelo no hace cuentas (las hace mal), y una cifra que no
 *    esté en los hechos se detecta y el hallazgo se cae (`validar.ts`).
 *  · Lo que no se pudo leer se dice como tal, nunca como cero (`lecturas.ts`).
 * PURO: sin red ni base.
 */
import { leerEstadoDeLaAuditoria } from "../estado";
import type { FotoDeAuditoria, SeccionDeHallazgo } from "../foto";
import { cifra, porcentaje } from "../cifras";
import {
  automatizacionDelPipeline,
  avisosSinDestino,
  buclesPosibles,
  cadenasDeWorkflows,
  compararConLaPlanificacion,
  etapaQueAcumula,
  mapaDeEtapas,
  masEditados,
} from "../cruces";
import {
  creadoresDePropiedades,
  dominiosConAcceso,
  ETIQUETA_DEL_OBJETO,
  propiedadesEnChoque,
  sinCambiosHaceUnAnio,
  type WorkflowLeido,
} from "../inventario";

export interface Hecho {
  clave: string;
  seccion: SeccionDeHallazgo | "portal";
  /** Rótulo corto para la pantalla («de dónde sale»). */
  etiqueta: string;
  texto: string;
}

export interface HechosDelPortal {
  hechos: Hecho[];
  /** Listas largas (workflows, propiedades de gente que ya no está) para que el modelo cite nombres. */
  detalle: string;
  /** Lo que Nexus sabe del cliente por sus documentos (no sale del portal). Vacío sin cliente. */
  cliente?: string;
}

const SIN_LEER = "no se pudo leer";

const n = (v: number | null | undefined) => (v === null || v === undefined ? SIN_LEER : cifra(v));
const conPct = (v: number | null | undefined, total: number | null | undefined) =>
  v === null || v === undefined ? SIN_LEER : total ? `${cifra(v)} (${porcentaje(v, total)})` : cifra(v);

const mes = (iso: string | null) => (iso ? iso.slice(0, 7) : "sin fecha");

/** Los hechos de una foto lista. `hoy` se pasa para que la función sea pura (tests). */
export function armarHechos(foto: FotoDeAuditoria, hoy: Date): HechosDelPortal {
  const hechos: Hecho[] = [];
  const add = (clave: string, seccion: Hecho["seccion"], etiqueta: string, texto: string) =>
    hechos.push({ clave, seccion, etiqueta, texto });

  const stats = foto.lifecycleStats;
  const estado = stats ? leerEstadoDeLaAuditoria({ lifecycleStats: stats, ownerStats: foto.ownerStats, lecturas: foto.lecturas }) : null;
  const tot = estado?.totales;
  const contactos = tot?.contactos ?? null;
  const empresas = tot?.empresas ?? null;

  // ── Portal ──────────────────────────────────────────────────────────────────
  add(
    "portal.totales",
    "portal",
    "Totales del portal",
    `Contactos: ${n(contactos)} · Empresas: ${n(empresas)} · Negocios: ${n(tot?.negocios)} · Tickets: ${n(tot?.tickets)}`,
  );
  if (foto.cuenta) {
    const c = foto.cuenta;
    add(
      "portal.cuenta",
      "portal",
      "Datos de la cuenta",
      `Moneda: ${c.companyCurrency ?? SIN_LEER} · Zona horaria: ${c.timeZone ?? SIN_LEER} · Datos alojados en: ${c.dataHostingLocation ?? SIN_LEER} · Tipo de cuenta: ${c.accountType ?? SIN_LEER}`,
    );
  }

  // ── Actividad y detalle de contactos/empresas ───────────────────────────────
  const e = foto.enriquecimiento;
  if (e) {
    add("actividad.sin_actividad", "actividad", "Contactos sin actividad", `Contactos sin ninguna actividad registrada: ${conPct(e.contacts.neverContacted, contactos)}`);
    add("actividad.contactos_30", "actividad", "Contactos activos en 30 días", `Contactos con actividad en los últimos 30 días: ${conPct(e.contacts.active30d, contactos)}`);
    add("actividad.empresas_30", "actividad", "Empresas activas en 30 días", `Empresas con actividad en los últimos 30 días: ${conPct(e.companies.active30d, empresas)}`);
    add("actividad.conversiones", "actividad", "Contactos con conversiones", `Contactos con al menos una conversión de formulario: ${conPct(e.contacts.withConversions, contactos)}`);
    const conEstado = e.contacts.withLeadStatus;
    const reparto = e.contacts.byLeadStatus.map((x) => `${x.label} ${cifra(x.count)}`).join(", ");
    add(
      "actividad.estado_del_lead",
      "actividad",
      "Estado del lead",
      `Contactos con estado del lead: ${conPct(conEstado, contactos)}${reparto ? `; reparto: ${reparto}` : ""}`,
    );
    if (e.contacts.byOriginalSource.length) {
      add(
        "actividad.fuentes",
        "actividad",
        "Fuente original de los contactos",
        `Fuente original de los contactos: ${e.contacts.byOriginalSource
          .slice()
          .sort((a, b) => b.count - a.count)
          .map((x) => `${x.label} ${conPct(x.count, contactos)}`)
          .join(", ")}`,
      );
    }
    add("empresas.con_negocios", "empresas", "Empresas con negocios", `Empresas con al menos un negocio asociado: ${conPct(e.companies.withDeals, empresas)}`);
    add("empresas.paso_a_cliente", "empresas", "Empresas que pasaron a Cliente", `Empresas con fecha de paso a la etapa Cliente: ${conPct(e.companies.withCustomerDate, empresas)}`);
    add("empresas.sin_propietario", "empresas", "Empresas sin propietario", `Empresas sin propietario: ${conPct(e.companies.orphans, empresas)}`);
    if (e.companies.byIndustry.length) {
      add(
        "empresas.industrias",
        "empresas",
        "Industrias",
        `Empresas por industria (las más comunes): ${e.companies.byIndustry
          .slice()
          .sort((a, b) => b.count - a.count)
          .slice(0, 6)
          .map((x) => `${x.label} ${cifra(x.count)}`)
          .join(", ")}`,
      );
    }
  }

  // ── Ciclo de vida ───────────────────────────────────────────────────────────
  if (estado) {
    const etapas = (lista: { label: string; count: number }[] | null, total: number | null) => {
      if (!lista || total === null) return SIN_LEER;
      const con = lista.reduce((s, x) => s + x.count, 0);
      const sin = Math.max(0, total - con);
      return `${lista.map((x) => `${x.label} ${conPct(x.count, total)}`).join(", ")}; sin etapa: ${conPct(sin, total)}`;
    };
    add("ciclo.contactos", "ciclo_de_vida", "Contactos por etapa", `Contactos por etapa del ciclo de vida: ${etapas(estado.contactosPorEtapa, contactos)}`);
    add("ciclo.empresas", "ciclo_de_vida", "Empresas por etapa", `Empresas por etapa del ciclo de vida: ${etapas(estado.empresasPorEtapa, empresas)}`);
    const wfEtapa = estado.workflowsDelCicloDeVida;
    add(
      "ciclo.workflows_de_contactos",
      "ciclo_de_vida",
      "Workflows de contactos que tocan la etapa",
      wfEtapa === null
        ? `Workflows de contactos que tocan la etapa del ciclo de vida: ${SIN_LEER}`
        : `Workflows encendidos de contactos que tocan la etapa del ciclo de vida (lectura v3): ${cifra(wfEtapa.length)}${wfEtapa.length ? `: ${wfEtapa.join("; ")}` : ""}`,
    );
  }

  // ── Propietarios ────────────────────────────────────────────────────────────
  if (estado) {
    const p = estado.propietarios;
    if (p.estado === "completo") {
      const d = p.datos;
      const top = d.owners
        .slice(0, 5)
        .map((o) => `${o.ownerName} ${conPct(o.contactCount, contactos)}`)
        .join(", ");
      const creados = d.monthlyCreated.reduce((s, m) => s + m.count, 0);
      const asignados = d.monthlyAssignments.reduce((s, m) => s + m.count, 0);
      add("propietarios.sin_propietario", "propietarios", "Contactos sin propietario", `Contactos sin propietario: ${conPct(d.unassigned, contactos)}`);
      add("propietarios.reparto", "propietarios", "Reparto por propietario", `Propietarios con contactos: ${cifra(d.owners.length)}. Los que más tienen: ${top || "ninguno"}`);
      add(
        "propietarios.doce_meses",
        "propietarios",
        "Asignación en 12 meses",
        `En los últimos 12 meses se crearon ${cifra(creados)} contactos y hubo ${cifra(asignados)} asignaciones de propietario`,
      );
    } else if (p.estado === "sin_leer") {
      add("propietarios.sin_leer", "propietarios", "Propietarios", `Asignación de propietarios: ${SIN_LEER}`);
    }
  }

  // ── Workflows (inventario) ──────────────────────────────────────────────────
  const inv = foto.inventario;
  const wfs = inv?.workflows ?? null;
  if (inv) {
    if (wfs === null) {
      add("workflows.total", "workflows", "Workflows", `Workflows: ${SIN_LEER}`);
    } else {
      const encendidos = wfs.filter((w) => w.encendido);
      const porObjeto = new Map<string, number>();
      for (const w of wfs) porObjeto.set(ETIQUETA_DEL_OBJETO[w.objeto], (porObjeto.get(ETIQUETA_DEL_OBJETO[w.objeto]) ?? 0) + 1);
      add(
        "workflows.total",
        "workflows",
        "Workflows",
        `Workflows: ${cifra(wfs.length)} (encendidos ${cifra(encendidos.length)}, apagados ${cifra(wfs.length - encendidos.length)}). Por objeto: ${[...porObjeto.entries()].map(([o, c]) => `${o} ${cifra(c)}`).join(", ")}`,
      );
      const viejos = wfs.filter((w) => sinCambiosHaceUnAnio(w, hoy));
      add(
        "workflows.sin_cambios",
        "workflows",
        "Workflows sin cambios hace un año",
        `Workflows sin cambios hace más de un año: ${cifra(viejos.length)} (encendidos ${cifra(viejos.filter((w) => w.encendido).length)}, apagados ${cifra(viejos.filter((w) => !w.encendido).length)})`,
      );
      const conDetalle = wfs.filter((w): w is WorkflowLeido & { detalle: NonNullable<WorkflowLeido["detalle"]> } => w.detalle !== null);
      if (conDetalle.length < wfs.length) {
        add("workflows.sin_detalle", "workflows", "Workflows sin detalle", `Workflows cuyo detalle (disparador y acciones) ${SIN_LEER}: ${cifra(wfs.length - conDetalle.length)}`);
      }
      const etapa = conDetalle.filter((w) => w.detalle.cambiaEtapa);
      add(
        "workflows.cambian_etapa",
        "workflows",
        "Workflows que cambian la etapa",
        `Workflows que cambian la etapa del ciclo de vida (todos los objetos): ${cifra(etapa.length)} (encendidos ${cifra(etapa.filter((w) => w.encendido).length)})`,
      );
      const queHace = new Map<string, number>();
      for (const w of conDetalle) for (const q of w.detalle.queHace) queHace.set(q, (queHace.get(q) ?? 0) + 1);
      if (queHace.size) {
        add(
          "workflows.acciones",
          "workflows",
          "Lo que hacen los workflows",
          `Lo que hacen (cuántos workflows tienen cada acción): ${[...queHace.entries()].sort((a, b) => b[1] - a[1]).map(([q, c]) => `${q} ${cifra(c)}`).join(", ")}`,
        );
      }
      const repetidas = propiedadesEnChoque(wfs).map((c) => [c.propiedad, c.workflows.length] as const);
      add(
        "workflows.misma_propiedad",
        "workflows",
        "Propiedades que escriben varios workflows",
        repetidas.length
          ? `Propiedades que escriben dos o más workflows encendidos: ${repetidas.slice(0, 12).map(([p, c]) => `${p} (${cifra(c)})`).join(", ")}`
          : "Ninguna propiedad la escriben dos o más workflows encendidos",
      );
      add(
        "workflows.codigo",
        "workflows",
        "Código propio y webhooks",
        `Workflows con código propio: ${cifra(conDetalle.filter((w) => w.detalle.conCodigo).length)} · con webhook: ${cifra(conDetalle.filter((w) => w.detalle.conWebhook).length)} · manuales (sin disparador automático): ${cifra(conDetalle.filter((w) => w.detalle.disparador === "manual").length)}`,
      );

      // Lo de abajo existe desde el 2026-10-04: una foto anterior no trae `disparadoPor`.
      const conDisparo = conDetalle.filter((w) => w.detalle.disparadoPor);
      if (conDisparo.length) {
        const enc = conDisparo.filter((w) => w.encendido);
        const cuenta = (f: (d: NonNullable<WorkflowLeido["detalle"]>) => boolean) => cifra(enc.filter((w) => f(w.detalle)).length);
        add(
          "workflows.disparadores",
          "workflows",
          "Qué dispara los workflows",
          `De los ${cifra(enc.length)} encendidos con detalle: por formulario ${cuenta((d) => (d.disparadoPor?.formularios ?? 0) > 0)}, por otros eventos ${cuenta((d) => (d.disparadoPor?.eventos ?? 0) > (d.disparadoPor?.formularios ?? 0))}, por propiedades del registro ${cuenta((d) => (d.disparadoPor?.propiedades.length ?? 0) > 0)}, por pertenecer a una lista ${cuenta((d) => (d.disparadoPor?.listas ?? 0) > 0)}, a mano ${cuenta((d) => d.disparador === "manual")}. Se reinscriben (un registro puede pasar varias veces): ${cuenta((d) => d.reinscribe === true)}`,
        );
        const nombre = (id: string) => `«${wfs.find((w) => w.id === id)?.nombre ?? id}»`;
        const etapas = mapaDeEtapas(inv.pipelines ?? []);
        const nombreEtapa = (id: string) => {
          const e = etapas.get(id);
          return e ? `«${e.etapa}» de «${e.pipeline}»` : `la etapa ${id}`;
        };
        const cadenas = cadenasDeWorkflows(wfs);
        add(
          "workflows.cadenas",
          "workflows",
          "Cadenas entre workflows",
          cadenas.length
            ? `Cadenas entre workflows encendidos (uno dispara o llama a otro): ${cifra(cadenas.length)}. ${cadenas
                .slice(0, 14)
                .map((c) => `${nombre(c.desde)} → ${nombre(c.hacia)} (${c.tipo === "pasa" ? "lo llama" : c.tipo === "etapa" ? `al poner ${nombreEtapa(c.por)}` : `al escribir ${c.por}`})`)
                .join("; ")}`
            : "Ningún workflow encendido dispara a otro ni lo llama",
        );
        const bucles = buclesPosibles(wfs, cadenas);
        if (bucles.length) {
          add(
            "workflows.bucles",
            "workflows",
            "Posibles bucles",
            `Posibles bucles (se reinscriben y escriben lo que los dispara, o dos se disparan entre sí): ${bucles.map((b) => `${b.workflows.map(nombre).join(" ↔ ")} por ${etapas.has(b.por) ? nombreEtapa(b.por) : b.por}`).join("; ")}`,
          );
        }
        const avisos = avisosSinDestino(wfs, inv.personas);
        if (avisos?.length) {
          add(
            "workflows.avisos",
            "workflows",
            "Avisos a personas que ya no están",
            `Workflows encendidos que avisan o rotan entre personas que ya no tienen usuario: ${cifra(new Set(avisos.map((a) => a.workflowId)).size)}. ${avisos
              .slice(0, 10)
              .map((a) => `${nombre(a.workflowId)} ${a.tipo === "avisa" ? "avisa a" : "rota entre"} ${a.usuarios.map((u) => u.nombre ?? `un usuario que no aparece (${u.id})`).join(", ")}`)
              .join("; ")}`,
          );
        }
        const editados = masEditados(wfs);
        if (editados.length) {
          add(
            "workflows.mas_editados",
            "workflows",
            "Los más editados",
            `Los workflows con más versiones guardadas: ${editados.map((w) => `${nombre(w.id)} ${cifra(w.versiones ?? 0)} versiones (${w.encendido ? "encendido" : "apagado"})`).join("; ")}`,
          );
        }
        const muevenEtapas = enc.filter((w) => (w.detalle.poneEtapas?.length ?? 0) > 0);
        add(
          "workflows.etapas_de_pipeline",
          "workflows",
          "Workflows que mueven etapas de pipeline",
          `Workflows encendidos que ponen una etapa de pipeline (negocios o tickets): ${cifra(muevenEtapas.length)}`,
        );
      }
    }
  }

  // ── Propiedades ─────────────────────────────────────────────────────────────
  if (inv) {
    if (inv.propiedades === null) {
      add("propiedades.por_objeto", "propiedades", "Propiedades", `Propiedades: ${SIN_LEER}`);
    } else {
      const { porObjeto, propias } = inv.propiedades;
      add(
        "propiedades.por_objeto",
        "propiedades",
        "Propiedades propias",
        `Propiedades creadas en el portal (propias) sobre el total: ${porObjeto.map((o) => `${o.objeto} ${cifra(o.propias)} de ${cifra(o.total)}`).join(", ")}`,
      );
      const c = creadoresDePropiedades(propias, inv.personas);
      add(
        "propiedades.creadores",
        "propiedades",
        "Quién creó las propiedades",
        `Propiedades propias con creador registrado: ${cifra(c.conCreador)}; sin creador registrado: ${cifra(c.sinCreador)}; creadas por personas que ya no tienen usuario: ${cifra(c.deQuienesYaNoEstan)}`,
      );
      if (c.porPersona.length) {
        add(
          "propiedades.por_persona",
          "propiedades",
          "Quién creó más propiedades",
          `Quién creó más propiedades: ${c.porPersona
            .slice(0, 8)
            .map((p) => `${p.nombre} (${p.activo ? "activo" : "ya no está"}${p.dominio ? `, ${p.dominio}` : ""}) ${cifra(p.propiedades)}`)
            .join("; ")}`,
        );
      }
      add("propiedades.calculadas", "propiedades", "Propiedades calculadas", `Propiedades calculadas: ${cifra(propias.filter((p) => p.calculada).length)}`);
    }
  }

  // ── Pipelines ───────────────────────────────────────────────────────────────
  if (inv) {
    if (inv.pipelines === null) {
      add("pipelines.todos", "pipelines", "Pipelines", `Pipelines: ${SIN_LEER}`);
    } else {
      for (const objeto of ["negocios", "tickets"] as const) {
        const de = inv.pipelines.filter((p) => p.objeto === objeto);
        add(
          `pipelines.${objeto}`,
          "pipelines",
          `Pipelines de ${objeto}`,
          de.length
            ? `Pipelines de ${objeto}: ${cifra(de.length)} — ${de.map((p) => `«${p.nombre}» ${cifra(p.etapas.length)} etapas, ${p.registros === null ? `registros ${SIN_LEER}` : `${cifra(p.registros)} registros`}`).join("; ")}`
            : `Pipelines de ${objeto}: ninguno`,
        );
      }
      const nombreWf = (id: string) => `«${wfs?.find((w) => w.id === id)?.nombre ?? id}»`;
      for (const p of inv.pipelines) {
        const partes = [`«${p.nombre}» (${p.objeto}): ${p.registros === null ? `registros ${SIN_LEER}` : `${cifra(p.registros)} registros`}`];
        if (p.abiertos != null) partes.push(`abiertos ${cifra(p.abiertos)}`);
        if (p.sinActividad != null && p.abiertos) partes.push(`abiertos sin actividad registrada (nota, llamada, correo o reunión) en 90 días ${conPct(p.sinActividad, p.abiertos)}`);
        if (p.sinCambios != null && p.abiertos) partes.push(`abiertos sin ningún cambio en 90 días ${conPct(p.sinCambios, p.abiertos)}`);
        const etapas = p.etapas.map((e) => `${e.nombre}${e.registros !== null ? ` ${cifra(e.registros)}` : ""}${e.probabilidad !== null && !e.cerrada ? ` (probabilidad ${cifra(e.probabilidad)} %)` : ""}${e.cerrada ? " [cierra]" : ""}`);
        partes.push(`etapas en orden: ${etapas.join(" · ")}`);
        const vacias = p.registros ? p.etapas.filter((e) => e.registros === 0).map((e) => e.nombre) : [];
        if (vacias.length) partes.push(`etapas sin registros: ${vacias.join(", ")}`);
        const acumula = etapaQueAcumula(p);
        if (acumula) partes.push(`donde se acumulan los abiertos: «${acumula.nombre}» ${conPct(acumula.registros, acumula.deAbiertos)}`);
        if (p.creadoEn || p.cambiadoEn) partes.push(`creado ${mes(p.creadoEn ?? null)}, último cambio ${mes(p.cambiadoEn ?? null)}`);
        if (wfs) {
          const auto = automatizacionDelPipeline(p, wfs).filter((a) => a.alEntrar.length || a.laPonen.length);
          const nombreEtapa = (id: string) => p.etapas.find((e) => e.id === id)?.nombre ?? id;
          partes.push(
            auto.length
              ? `automatización: ${auto
                  .map((a) => [a.alEntrar.length ? `en «${nombreEtapa(a.etapaId)}» corre ${a.alEntrar.map(nombreWf).join(", ")}` : "", a.laPonen.length ? `${a.laPonen.map(nombreWf).join(", ")} pone «${nombreEtapa(a.etapaId)}»` : ""].filter(Boolean).join("; "))
                  .join("; ")}`
              : "ningún workflow encendido corre por sus etapas ni las pone",
          );
        }
        add(`pipeline.${p.id}`, "pipelines", `Pipeline «${p.nombre}»`, partes.join("; "));
      }
      const plan = foto.contextoDelCliente?.pipelinesPlaneados ?? [];
      const comparacion = compararConLaPlanificacion(plan, inv.pipelines);
      if (comparacion.length) {
        add(
          "pipelines.planificacion",
          "pipelines",
          "La Planificación contra el portal",
          `Según la Planificación del cliente (no sale del portal): ${comparacion
            .map((c) =>
              c.enPortal
                ? `«${c.planeado}» se parece a «${c.enPortal.nombre}»: coinciden ${cifra(c.coinciden.length)} etapas; faltan en el portal ${c.faltanEnElPortal.join(", ") || "ninguna"}; solo en el portal ${c.soloEnElPortal.join(", ") || "ninguna"}`
                : `«${c.planeado}» no tiene un pipeline parecido en el portal`,
            )
            .join(". ")}`,
        );
      }
    }
  }

  // ── Usuarios ────────────────────────────────────────────────────────────────
  if (inv) {
    if (inv.personas === null) {
      add("usuarios.total", "usuarios", "Usuarios", `Usuarios: ${SIN_LEER}`);
    } else {
      const activos = inv.personas.filter((p) => p.activo);
      const dominios = dominiosConAcceso(inv.personas).filter((d) => d.activos > 0);
      add(
        "usuarios.total",
        "usuarios",
        "Usuarios",
        `Usuarios con acceso: ${cifra(activos.length)} (Super Admin ${cifra(activos.filter((p) => p.superAdmin).length)}). Personas que tuvieron usuario y ya no: ${cifra(inv.personas.length - activos.length)}`,
      );
      add(
        "usuarios.dominios",
        "usuarios",
        "Dominios de los usuarios",
        `Dominios de correo de los usuarios con acceso: ${dominios.map((d) => `${d.dominio} ${cifra(d.activos)}${d.superAdmins ? ` (Super Admin ${cifra(d.superAdmins)})` : ""}`).join(", ") || "ninguno"}`,
      );
    }
    add(
      "usuarios.equipos",
      "usuarios",
      "Equipos",
      inv.equipos === null ? `Equipos: ${SIN_LEER}` : `Equipos: ${cifra(inv.equipos.length)}${inv.equipos.length ? ` (${inv.equipos.map((t) => `${t.nombre} ${cifra(t.miembros)}`).join(", ")})` : ""}`,
    );
    add(
      "usuarios.objetos",
      "datos",
      "Objetos personalizados",
      inv.objetosPersonalizados === null
        ? `Objetos personalizados: ${SIN_LEER}`
        : `Objetos personalizados: ${cifra(inv.objetosPersonalizados.length)}${inv.objetosPersonalizados.length ? ` (${inv.objetosPersonalizados.join(", ")})` : ""}`,
    );
  }

  // ── Lo que Nexus sabe del cliente ──────────────────────────────────────────
  const ctx = foto.contextoDelCliente;
  if (ctx) {
    add(
      "cliente.fuentes",
      "datos",
      "Lo que Nexus sabe del cliente",
      `Documentos del cliente en Nexus que se leyeron (no salen del portal): ${ctx.fuentes.map((f) => `${f.documento} (${f.proyecto})`).join("; ")}`,
    );
  }

  // ── Lo que no se pudo leer ─────────────────────────────────────────────────
  const fallidas = foto.lecturas?.fallidas ?? [];
  if (fallidas.length) {
    add(
      "lecturas.fallidas",
      "datos",
      "Lecturas que fallaron",
      `Lecturas que fallaron (no son ceros): ${[...new Set(fallidas.map((f) => f.que))].join("; ")}`,
    );
  }

  // ── Detalle largo ───────────────────────────────────────────────────────────
  const lineas: string[] = [];
  if (wfs?.length) {
    lineas.push("WORKFLOWS (nombre | objeto | estado | disparador | qué lo dispara | qué hace | propiedades que escribe | último cambio | versiones):");
    const orden = [...wfs].sort((a, b) => Number(b.encendido) - Number(a.encendido) || (b.cambiadoEn ?? "").localeCompare(a.cambiadoEn ?? ""));
    for (const w of orden.slice(0, 150)) {
      const d = w.detalle;
      lineas.push(
        `- ${w.nombre} | ${ETIQUETA_DEL_OBJETO[w.objeto]} | ${w.encendido ? "encendido" : "apagado"} | ${d ? d.disparador : "sin detalle"} | ${disparoEnTexto(d)} | ${d?.queHace.join(", ") || "—"} | ${d?.escribe.join(", ") || "—"} | ${mes(w.cambiadoEn)} | ${w.versiones ?? "—"}`,
      );
    }
    if (wfs.length > 150) lineas.push(`(y ${cifra(wfs.length - 150)} workflows más)`);
  }
  if (inv?.propiedades && inv.personas) {
    const porId = new Map(inv.personas.map((p) => [p.usuarioId, p]));
    const deQuienesNoEstan = inv.propiedades.propias.filter((p) => p.creadorId && !porId.get(p.creadorId)?.activo);
    if (deQuienesNoEstan.length) {
      lineas.push("", "PROPIEDADES CREADAS POR PERSONAS QUE YA NO TIENEN USUARIO (etiqueta | objeto | quién | creada):");
      for (const p of deQuienesNoEstan.slice(0, 60)) {
        const quien = porId.get(p.creadorId!);
        lineas.push(`- ${p.etiqueta} | ${p.objeto} | ${quien?.nombre ?? "sin datos"}${quien?.dominio ? ` (${quien.dominio})` : ""} | ${mes(p.creadaEn)}`);
      }
      if (deQuienesNoEstan.length > 60) lineas.push(`(y ${cifra(deQuienesNoEstan.length - 60)} más)`);
    }
  }

  return { hechos, detalle: lineas.join("\n"), cliente: ctx?.texto ?? "" };
}

/** Qué dispara un workflow, en pocas palabras, para el detalle. */
function disparoEnTexto(d: WorkflowLeido["detalle"]): string {
  const p = d?.disparadoPor;
  if (!p) return "—";
  const partes = [
    p.formularios ? `formulario${p.formularios > 1 ? `s (${p.formularios})` : ""}` : "",
    p.eventos > p.formularios ? "evento" : "",
    p.listas ? "lista" : "",
    p.propiedades.length ? `propiedades ${p.propiedades.slice(0, 4).join(", ")}${p.propiedades.length > 4 ? "…" : ""}` : "",
    d?.reinscribe ? "se reinscribe" : "",
  ].filter(Boolean);
  return partes.join(", ") || "—";
}
