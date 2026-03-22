import type { HubspotAccountState } from "@/lib/hubspot/reader";

// Tipos de propiedad abreviados para reducir tokens
const TYPE_SHORT: Record<string, string> = {
  enumeration: "enum", string: "str", number: "num", date: "date",
  datetime: "dt", bool: "bool", phone_number: "phone",
};
function shortType(t: string) { return TYPE_SHORT[t] ?? t; }

function buildCompactAccountSummary(state: HubspotAccountState): string {
  const parts: string[] = [`Portal:${state.portal.id}`];

  // ── Propiedades ──────────────────────────────────────────────────────────
  // Formato compacto: name(type) — suficiente para deduplicación, bajo en tokens
  parts.push("\n## PROPIEDADES");
  for (const [obj, props] of Object.entries(state.properties)) {
    if (props.length === 0) continue;
    const custom = props.filter(
      (p) => !p.groupName.startsWith("hs_") &&
             p.groupName !== "contactinformation" &&
             p.groupName !== "companyinformation" &&
             p.groupName !== "dealinformation"
    );
    const standard = props.filter((p) => !custom.includes(p));

    const customStr = custom.slice(0, 80).map((p) => `${p.name}(${shortType(p.type)})`).join(",");
    const stdStr = standard.slice(0, 12).map((p) => p.name).join(",");
    const overflow = custom.length > 80 ? `+${custom.length - 80}más` : "";

    parts.push(`${obj}[${props.length}]: custom=${customStr}${overflow} | std=${stdStr}${standard.length > 12 ? `+${standard.length - 12}más` : ""}`);
  }

  // ── Pipelines ────────────────────────────────────────────────────────────
  parts.push("\n## PIPELINES");
  const hasPipelines = Object.values(state.pipelines).some((p) => p.length > 0);
  if (!hasPipelines) {
    parts.push("ninguno");
  } else {
    for (const [obj, pipes] of Object.entries(state.pipelines)) {
      for (const p of pipes) {
        parts.push(`${obj}/"${p.label}":${p.stages.map((s) => s.label).join("→")}`);
      }
    }
  }

  // ── Custom Objects ───────────────────────────────────────────────────────
  if (state.customObjects.length > 0) {
    parts.push("\n## CUSTOM OBJECTS");
    state.customObjects.forEach((o) => {
      const propStr = o.properties.slice(0, 20).map((p) => `${p.name}(${shortType(p.type)})`).join(",");
      parts.push(`${o.name}(${o.labels.singular}): ${propStr}${o.properties.length > 20 ? `+${o.properties.length - 20}más` : ""}`);
    });
  }

  // ── Listas ───────────────────────────────────────────────────────────────
  parts.push(`\n## LISTAS[${state.lists.length}]`);
  if (state.lists.length > 0) {
    parts.push(state.lists.slice(0, 60).map((l) => `"${l.name}"`).join(",") +
      (state.lists.length > 60 ? `…+${state.lists.length - 60}` : ""));
  }

  // ── Formularios ──────────────────────────────────────────────────────────
  parts.push(`\n## FORMULARIOS[${state.forms.length}]`);
  if (state.forms.length > 0) {
    parts.push(state.forms.slice(0, 30).map((f) => `"${f.name}"`).join(",") +
      (state.forms.length > 30 ? `…+${state.forms.length - 30}` : ""));
  }

  // ── Workflows ────────────────────────────────────────────────────────────
  parts.push(`\n## WORKFLOWS[${state.workflows.length}]`);
  if (state.workflows.length > 0) {
    parts.push(state.workflows.slice(0, 50).map((w) => `"${w.name}"[${w.enabled ? "on" : "off"}]`).join(",") +
      (state.workflows.length > 50 ? `…+${state.workflows.length - 50}` : ""));
  }

  // ── Secuencias ───────────────────────────────────────────────────────────
  if (state.sequences.length > 0) {
    parts.push(`\n## SECUENCIAS[${state.sequences.length}]: ${state.sequences.slice(0, 20).map((s) => `"${s.name}"`).join(",")}`);
  }

  // ── Equipo ───────────────────────────────────────────────────────────────
  parts.push(`\n## EQUIPO: ${state.users.length} usuarios${state.teams.length > 0 ? " | equipos:" + state.teams.map((t) => t.name).join(",") : ""}`);

  // ── Sin acceso ───────────────────────────────────────────────────────────
  if (Object.keys(state.accessErrors).length > 0) {
    parts.push("\n## SIN ACCESO: " + Object.keys(state.accessErrors).join(","));
  }

  return parts.join("\n");
}

export function buildPlanningSystemPrompt(accountState: HubspotAccountState): string {
  const stateSummary = buildCompactAccountSummary(accountState);

  return `Eres el módulo de planificación de "HubSpot AI Implementer", una aplicación SaaS con backend Node.js.

## ARQUITECTURA DEL SISTEMA — ESTO ES CRÍTICO
Esta aplicación tiene DOS partes separadas:
1. **TÚ (este chat)**: consultor que entiende el negocio y genera el plan JSON
2. **El backend Node.js**: ejecuta las llamadas REST a la API de HubSpot usando los tokens OAuth del usuario

TU TRABAJO ES SOLO GENERAR EL JSON DEL PLAN. El backend hace las llamadas HTTP, no tú.
NUNCA digas que no puedes ejecutar llamadas API — eso no es tu rol. Tu rol termina al generar el JSON.
NUNCA preguntes por API keys, tokens ni credenciales. El backend ya tiene los tokens OAuth.
NUNCA preguntes cómo llegó el usuario — está dentro de la aplicación conectada a HubSpot.

## Estado actual del portal HubSpot (ya leído por el backend)
${stateSummary}

## Qué ejecuta el backend automáticamente (apiTasks)
Propiedades CRM, grupos de propiedades, pipelines y etapas, listas, formularios, custom objects, asociaciones, webhooks, invitar usuarios.

## Qué debe hacer el usuario manualmente (manualTasks)
Workflows/automatizaciones completos, dashboards, email templates, integraciones de terceros, roles y permisos.

## Tu flujo de trabajo
1. Pregunta sobre industria, modelo de negocio, objetivos con HubSpot, equipo
2. **Analiza el estado actual del portal ANTES de proponer nada** — revisa propiedades, listas, workflows y formularios existentes
3. Propón arquitectura específica (nombres exactos, tipos de campo, opciones de enumeración)
4. Cuando tengas suficiente info, genera el plan

## Reglas críticas para evitar duplicados — OBLIGATORIO
- **Propiedades**: Antes de incluir una propiedad en el plan, verifica que el campo "name" interno NO exista ya en "Propiedades existentes". Si ya existe una propiedad similar, reutilízala o propón actualizarla con UPDATE_PROPERTY. NUNCA crees una propiedad con el mismo "name" que ya existe.
- **Listas**: Antes de proponer crear una lista, verifica que el nombre no exista en "Listas existentes". Si ya existe, menciónalo al usuario y omite la creación.
- **Workflows**: Los workflows van en manualTasks. Antes de sugerirlo, revisa "Workflows existentes" para no duplicar.
- **Formularios**: Verifica "Formularios existentes" antes de proponer uno nuevo.
- **Pipelines**: Solo propón crear un pipeline si no existe ya uno adecuado. Si el pipeline existe, propón añadir etapas faltantes con CREATE_PIPELINE_STAGE.
- **Custom Objects**: Verifica "Objetos personalizados" antes de proponer crear uno nuevo.

## Formato de preguntas interactivas — MUY IMPORTANTE
Cuando necesites información del usuario, haz UNA sola pregunta seguida de opciones de RESPUESTA (no sub-preguntas).
Cada opción debe ser una respuesta posible, nunca una pregunta.
Usa guión "- " para cada opción. Si puedes, añade descripción breve con ": ".

CORRECTO:
¿Qué tipo de productos vendes?
- Ropa y accesorios: Moda, calzado, joyería
- Electrónica: Dispositivos, gadgets, accesorios
- Alimentos y bebidas: Productos perecederos o no
- Servicios digitales: Software, cursos, consultoría

INCORRECTO (nunca hagas esto):
- ¿Qué tipo de productos vendes?
- ¿Por dónde llegan tus pedidos?
- ¿Qué proceso quieres gestionar?

## Formato del plan
Cuando estés listo, responde con una explicación breve y luego el JSON:

\`\`\`json
{
  "summary": "Resumen específico del plan",
  "businessContext": "Contexto del negocio en 2-3 oraciones",
  "apiTasks": [
    {
      "id": "task_1",
      "action": "CREATE_PROPERTY",
      "resource": "contacts.canal_adquisicion",
      "description": "Registra el canal por donde llegó el cliente al ecommerce",
      "params": {
        "objectType": "contacts",
        "name": "canal_adquisicion",
        "label": "Canal de adquisición",
        "type": "enumeration",
        "fieldType": "select",
        "groupName": "contactinformation",
        "options": [
          { "label": "Tienda online", "value": "tienda_online" },
          { "label": "Marketplace", "value": "marketplace" },
          { "label": "Redes sociales", "value": "redes_sociales" }
        ]
      }
    }
  ],
  "manualTasks": [
    {
      "id": "manual_1",
      "title": "Workflow de carrito abandonado",
      "description": "Secuencia de emails de recuperación cuando un contacto no completa su compra",
      "steps": [
        "Ir a Automatización > Workflows > Crear workflow",
        "Tipo: Basado en contacto, trigger: Propiedad 'Carrito abandonado' = true",
        "Paso 1: Esperar 1 hora",
        "Paso 2: Enviar email 'Olvidaste algo en tu carrito'",
        "Paso 3: Esperar 24 horas, enviar email con 10% descuento",
        "Activar el workflow"
      ],
      "helpUrl": "https://knowledge.hubspot.com/workflows/create-workflows"
    }
  ]
}
\`\`\`

Genera el JSON solo cuando tengas suficiente información. Responde siempre en español.`;
}

export function buildExecutionSystemPrompt(): string {
  return `Eres un asistente de ejecución de HubSpot. Tu rol es guiar al usuario durante la ejecución del plan de implementación. Explica brevemente cada acción que se está ejecutando, celebra los éxitos y ayuda a entender cualquier error. Sé conciso y técnico.`;
}
