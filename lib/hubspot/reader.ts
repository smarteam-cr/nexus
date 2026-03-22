import { Client } from "@hubspot/api-client";
import { getHubspotClient } from "./client";
import { prisma } from "@/lib/db/prisma";

export interface HubspotAccountState {
  portal: { id: string; name?: string };
  properties: Record<string, PropertyDef[]>;
  pipelines: Record<string, PipelineDef[]>;
  customObjects: CustomObjectDef[];
  lists: ListDef[];
  forms: FormDef[];
  workflows: WorkflowDef[];
  sequences: SequenceDef[];
  teams: TeamDef[];
  users: UserDef[];
  /** APIs que fallaron y el motivo (scope, error HTTP, etc.) */
  accessErrors: Record<string, string>;
}

export interface PropertyDef {
  name: string;
  label: string;
  type: string;
  fieldType: string;
  groupName: string;
  description?: string;
  options?: { label: string; value: string }[];
}

export interface PipelineDef {
  id: string;
  label: string;
  displayOrder: number;
  stages: { id: string; label: string; displayOrder: number }[];
}

export interface CustomObjectDef {
  id: string;
  name: string;
  labels: { singular: string; plural: string };
  properties: PropertyDef[];
  primaryDisplayProperty?: string;
}

export interface ListDef {
  listId: string;
  name: string;
  listType: string;
}

export interface FormDef {
  id: string;
  name: string;
  formType: string;
}

export interface WorkflowDef {
  id: number;
  name: string;
  type: string;
  enabled: boolean;
}

export interface SequenceDef {
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TeamDef {
  id: string;
  name: string;
  userIds: string[];
}

export interface UserDef {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

const STANDARD_OBJECTS = ["contacts", "companies", "deals", "tickets"] as const;

export async function readAccountState(
  accountId: string
): Promise<HubspotAccountState> {
  // getHubspotClient refresca el token si está vencido y lo guarda en DB
  const client = await getHubspotClient(accountId);

  // Leer el token actualizado directo de DB (post-posible-refresh)
  const accountRow = await prisma.hubspotAccount.findUnique({
    where: { id: accountId },
    select: { accessToken: true },
  });
  const token = accountRow?.accessToken ?? "";

  const [
    propertiesResult,
    pipelinesResult,
    customObjectsResult,
    listsResult,
    formsResult,
    workflowsResult,
    sequencesResult,
    teamsResult,
    usersResult,
  ] = await Promise.allSettled([
    readAllProperties(client),
    readAllPipelines(client),
    readCustomObjects(client),
    readLists(token),
    readForms(token),
    readWorkflows(token),
    readSequences(token),
    readTeams(client),
    readUsers(client),
  ]);

  // Registrar errores de acceso para mostrarlos en "Sin acceso"
  const accessErrors: Record<string, string> = {};
  if (listsResult.status === "rejected")
    accessErrors["Segmentos"] = listsResult.reason?.message ?? "Error desconocido";
  if (formsResult.status === "rejected")
    accessErrors["Formularios"] = formsResult.reason?.message ?? "Error desconocido";
  if (workflowsResult.status === "rejected")
    accessErrors["Workflows"] = workflowsResult.reason?.message ?? "Error desconocido";
  if (sequencesResult.status === "rejected")
    accessErrors["Secuencias"] = sequencesResult.reason?.message ?? "Error desconocido";
  if (teamsResult.status === "rejected")
    accessErrors["Equipos"] = teamsResult.reason?.message ?? "Error desconocido";
  if (usersResult.status === "rejected")
    accessErrors["Usuarios"] = usersResult.reason?.message ?? "Error desconocido";

  return {
    portal: { id: accountId },
    properties:
      propertiesResult.status === "fulfilled" ? propertiesResult.value : {},
    pipelines:
      pipelinesResult.status === "fulfilled" ? pipelinesResult.value : {},
    customObjects:
      customObjectsResult.status === "fulfilled"
        ? customObjectsResult.value
        : [],
    lists: listsResult.status === "fulfilled" ? listsResult.value : [],
    forms: formsResult.status === "fulfilled" ? formsResult.value : [],
    workflows:
      workflowsResult.status === "fulfilled" ? workflowsResult.value : [],
    sequences:
      sequencesResult.status === "fulfilled" ? sequencesResult.value : [],
    teams: teamsResult.status === "fulfilled" ? teamsResult.value : [],
    users: usersResult.status === "fulfilled" ? usersResult.value : [],
    accessErrors,
  };
}

// ─── Properties ────────────────────────────────────────────────────────────

async function readAllProperties(
  client: Client
): Promise<Record<string, PropertyDef[]>> {
  const results: Record<string, PropertyDef[]> = {};

  for (const objectType of STANDARD_OBJECTS) {
    try {
      const response = await client.crm.properties.coreApi.getAll(objectType);
      results[objectType] = (response.results ?? [])
        .filter((p) => !p.hidden)
        .map((p) => ({
          name: p.name,
          label: p.label,
          type: p.type,
          fieldType: p.fieldType,
          groupName: p.groupName,
          description: p.description,
          options: p.options?.map((o) => ({ label: o.label, value: o.value })),
        }));
    } catch {
      results[objectType] = [];
    }
  }

  return results;
}

// ─── Pipelines ─────────────────────────────────────────────────────────────

async function readAllPipelines(
  client: Client
): Promise<Record<string, PipelineDef[]>> {
  const results: Record<string, PipelineDef[]> = {};
  const pipelineObjects = ["deals", "tickets"] as const;

  for (const objectType of pipelineObjects) {
    try {
      const response =
        await client.crm.pipelines.pipelinesApi.getAll(objectType);
      results[objectType] = (response.results ?? []).map((p) => ({
        id: p.id,
        label: p.label,
        displayOrder: p.displayOrder,
        stages: (p.stages ?? []).map((s) => ({
          id: s.id,
          label: s.label,
          displayOrder: s.displayOrder,
        })),
      }));
    } catch {
      results[objectType] = [];
    }
  }

  return results;
}

// ─── Custom Objects ────────────────────────────────────────────────────────

async function readCustomObjects(client: Client): Promise<CustomObjectDef[]> {
  try {
    const response = await client.crm.schemas.coreApi.getAll();
    const schemas = response.results ?? [];

    const customObjects: CustomObjectDef[] = [];
    for (const schema of schemas) {
      const props = await client.crm.properties.coreApi
        .getAll(schema.objectTypeId ?? "")
        .catch(() => ({ results: [] }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const propResults = (props.results ?? []) as any[];
      customObjects.push({
        id: schema.objectTypeId ?? schema.name,
        name: schema.name,
        labels: {
          singular: schema.labels.singular ?? schema.name,
          plural: schema.labels.plural ?? schema.name,
        },
        primaryDisplayProperty: schema.primaryDisplayProperty ?? undefined,
        properties: propResults.map((p) => ({
          name: p.name as string,
          label: p.label as string,
          type: p.type as string,
          fieldType: p.fieldType as string,
          groupName: p.groupName as string,
        })),
      });
    }
    return customObjects;
  } catch {
    return [];
  }
}

// ─── Lists (Segmentos) ─────────────────────────────────────────────────────

async function readLists(token: string): Promise<ListDef[]> {
  const allLists: ListDef[] = [];

  // CRM Lists v3 — POST /crm/v3/lists/search (endpoint correcto para listar)
  // Respuesta: { lists: [...], hasMore: bool, offset: int, total: int }
  let offset = 0;
  const count = 250;

  for (let page = 0; page < 40; page++) {
    const res = await fetch("https://api.hubapi.com/crm/v3/lists/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ count, offset }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Segmentos API ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      lists?: Array<{ listId: string | number; name: string; listType?: string; processingType?: string }>;
      hasMore?: boolean;
      offset?: number;
      total?: number;
    };

    const lists = data.lists ?? [];
    allLists.push(
      ...lists.map((l) => ({
        listId: String(l.listId),
        name: l.name,
        listType: l.processingType ?? l.listType ?? "STATIC",
      }))
    );

    if (!data.hasMore || lists.length < count) break;
    offset += count;
  }

  return allLists;
}

// ─── Forms ─────────────────────────────────────────────────────────────────

async function readForms(token: string): Promise<FormDef[]> {
  const allForms: FormDef[] = [];
  let after: string | undefined;

  // Marketing Forms v3 — cursor-based pagination (paging.next.after)
  for (let page = 0; page < 50; page++) {
    const params = new URLSearchParams({ limit: "100" });
    if (after) params.set("after", after);

    const res = await fetch(
      `https://api.hubapi.com/marketing/v3/forms?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (res.ok) {
      const data = (await res.json()) as {
        results?: Array<{ id: string; name: string; formType: string }>;
        paging?: { next?: { after: string } };
      };

      const forms = data.results ?? [];
      allForms.push(
        ...forms.map((f) => ({
          id: f.id,
          name: f.name,
          formType: f.formType ?? "HUBSPOT",
        }))
      );

      if (!data.paging?.next?.after) break;
      after = data.paging.next.after;
      continue;
    }

    // Fallback: legacy Forms v2 (sin paginación, devuelve todos)
    if (page === 0) {
      const res2 = await fetch("https://api.hubapi.com/forms/v2/forms", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res2.ok) {
        const body = await res2.text().catch(() => "");
        throw new Error(`Forms API ${res2.status}: ${body.slice(0, 200)}`);
      }

      const data2 = (await res2.json()) as Array<{
        guid: string;
        name: string;
        formType?: string;
      }>;
      return data2.map((f) => ({
        id: f.guid,
        name: f.name,
        formType: f.formType ?? "HUBSPOT",
      }));
    }

    break;
  }

  return allForms;
}

// ─── Workflows ─────────────────────────────────────────────────────────────

async function readWorkflows(token: string): Promise<WorkflowDef[]> {
  // v3 devuelve todos los workflows de Contacts sin paginación
  const res = await fetch("https://api.hubapi.com/automation/v3/workflows", {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Workflows API ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    workflows?: Array<{
      id: number;
      name: string;
      type: string;
      enabled: boolean;
    }>;
  };

  return (data.workflows ?? []).map((w) => ({
    id: w.id,
    name: w.name,
    type: w.type,
    enabled: w.enabled,
  }));
}

// ─── Sequences ─────────────────────────────────────────────────────────────

async function readSequences(token: string): Promise<SequenceDef[]> {
  const allSequences: SequenceDef[] = [];
  let after: string | undefined;

  // GET /automation/v4/sequences — requiere automation.sequences.read
  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams({ limit: "100" });
    if (after) params.set("after", after);

    const res = await fetch(
      `https://api.hubapi.com/automation/v4/sequences?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) {
      if (page === 0) {
        const body = await res.text().catch(() => "");
        throw new Error(`Sequences API ${res.status}: ${body.slice(0, 200)}`);
      }
      break;
    }

    const data = (await res.json()) as {
      results?: Array<{ id: string; name: string; createdAt?: string; updatedAt?: string }>;
      paging?: { next?: { after: string } };
      total?: number;
    };

    const seqs = data.results ?? [];
    allSequences.push(
      ...seqs.map((s) => ({
        id: s.id,
        name: s.name,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }))
    );

    if (!data.paging?.next?.after) break;
    after = data.paging.next.after;
  }

  return allSequences;
}

// ─── Teams ─────────────────────────────────────────────────────────────────

async function readTeams(client: Client): Promise<TeamDef[]> {
  try {
    const response = await client.settings.users.teamsApi.getAll();
    return (response.results ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      userIds: (t.userIds ?? []).map(String),
    }));
  } catch {
    return [];
  }
}

// ─── Users ─────────────────────────────────────────────────────────────────

async function readUsers(client: Client): Promise<UserDef[]> {
  try {
    const response = await client.settings.users.usersApi.getPage();
    return (response.results ?? []).map((u) => ({
      id: String(u.id),
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
    }));
  } catch {
    return [];
  }
}
