// ─── Client Canvas (nivel empresa, compartido entre proyectos) ───────────────

export interface ClientCanvas {
  perfil: {
    industria: string;
    modelo_negocio: string;
    tamano: string;
  };
  stakeholders: Array<{
    nombre: string;
    rol: string;
    notas: string;
  }>;
  madurez: {
    marketing: string;
    ventas: string;
    servicio: string;
  };
  herramientas: string[];
  contexto_comercial: {
    canal_adquisicion: string;
    relacion_previa: string;
    motivacion_compra: string;
  };
  retos_estrategicos: Array<{
    descripcion: string;
    estado: "validado" | "por_validar";
    fuente: string;
  }>;
  escala_rendimiento: {
    general: number; // 0-4
    por_hub: {
      marketing: number;
      sales: number;
      service: number;
    };
    objetivo: number; // meta del cliente
  };
  oportunidades_futuras: Array<{
    descripcion: string;
    hub: string;
    escala_nivel: number; // 0-4
    estado: string; // identificada | propuesta | aceptada | descartada
  }>;
}

export const EMPTY_CLIENT_CANVAS: ClientCanvas = {
  perfil: { industria: "", modelo_negocio: "", tamano: "" },
  stakeholders: [],
  madurez: { marketing: "", ventas: "", servicio: "" },
  herramientas: [],
  contexto_comercial: { canal_adquisicion: "", relacion_previa: "", motivacion_compra: "" },
  retos_estrategicos: [],
  escala_rendimiento: {
    general: 0,
    por_hub: { marketing: 0, sales: 0, service: 0 },
    objetivo: 0,
  },
  oportunidades_futuras: [],
};

// ─── Project Canvas (Canvas de servicio — nivel caso de uso) ─────────────────

export interface ProjectCanvas {
  procesos: Array<{
    nombre: string;
    flujo_actual: string;
    dolores: string[];
    owner: string;
  }>;
  stakeholders_proyecto: Array<{
    nombre: string;
    rol: string;
    influencia: string;
    notas: string;
  }>;
  hallazgos_dolores: {
    dolor_principal: string;
    que_no_funciona: string[];
    fricciones: string[];
    que_esperan_resolver: string[];
    estado_emocional: string;
    riesgos: string[];
    quick_wins: string[];
    hallazgos_entrevistas: string[];
  };
  hipotesis_recomendaciones: {
    hipotesis_validadas: string[];
    hipotesis_pendientes: string[];
    recomendaciones: string[];
  };
  plan_implementacion: {
    que_se_va_a_hacer: string[];
    orden_y_fases: string[];
    tiempos: string[];
    kpis: string[];
    acuerdos: string[];
  };
  feedback_optimizaciones: Array<{
    fecha: string;
    comentario: string;
    accion: string;
    estado: string;
  }>;
  estado_proyecto: {
    etapa_actual: string;
    subetapa_actual: string;
    progreso: string;
  };
}

export const EMPTY_PROJECT_CANVAS: ProjectCanvas = {
  procesos: [],
  stakeholders_proyecto: [],
  hallazgos_dolores: {
    dolor_principal: "",
    que_no_funciona: [],
    fricciones: [],
    que_esperan_resolver: [],
    estado_emocional: "",
    riesgos: [],
    quick_wins: [],
    hallazgos_entrevistas: [],
  },
  hipotesis_recomendaciones: { hipotesis_validadas: [], hipotesis_pendientes: [], recomendaciones: [] },
  plan_implementacion: { que_se_va_a_hacer: [], orden_y_fases: [], tiempos: [], kpis: [], acuerdos: [] },
  feedback_optimizaciones: [],
  estado_proyecto: { etapa_actual: "", subetapa_actual: "", progreso: "" },
};

// ─── Labels en español para la UI ────────────────────────────────────────────

export const CLIENT_CANVAS_LABELS: Record<keyof ClientCanvas, string> = {
  perfil: "Perfil de la empresa",
  stakeholders: "Stakeholders y roles",
  madurez: "Madurez tecnológica",
  herramientas: "Herramientas actuales",
  contexto_comercial: "Contexto comercial",
  retos_estrategicos: "Retos estratégicos",
  escala_rendimiento: "Escala de rendimiento",
  oportunidades_futuras: "Oportunidades futuras",
};

export const PROJECT_CANVAS_LABELS: Record<keyof ProjectCanvas, string> = {
  procesos: "Procesos involucrados",
  stakeholders_proyecto: "Stakeholders y estructura organizacional",
  hallazgos_dolores: "Hallazgos y dolores",
  hipotesis_recomendaciones: "Hipótesis y recomendaciones",
  plan_implementacion: "Plan de implementación",
  feedback_optimizaciones: "Feedback y optimizaciones",
  estado_proyecto: "Estado del proyecto",
};
