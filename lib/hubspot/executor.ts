import { Client } from "@hubspot/api-client";
import { getHubspotClient } from "./client";

export type ActionResult =
  | { status: "SUCCESS"; data: unknown }
  | { status: "FAILED"; error: string }
  | { status: "MANUAL_REQUIRED"; instructions: string };

export interface ApiTask {
  id: string;
  action: string;
  resource: string;
  description: string;
  params: Record<string, unknown>;
}

export async function executeTask(
  accountId: string,
  task: ApiTask
): Promise<ActionResult> {
  try {
    const client = await getHubspotClient(accountId);
    const handler = ACTION_HANDLERS[task.action];

    if (!handler) {
      return { status: "FAILED", error: `Unknown action: ${task.action}` };
    }

    const result = await handler(client, task.params);
    return { status: "SUCCESS", data: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: "FAILED", error: message };
  }
}

type ActionHandler = (
  client: Client,
  params: Record<string, unknown>
) => Promise<unknown>;

async function getAccessToken(client: Client): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const headers = (client as any)._defaultHeaders as
    | Record<string, string>
    | undefined;
  const auth = headers?.Authorization ?? headers?.authorization ?? "";
  return auth.replace("Bearer ", "");
}

async function hubspotFetch(
  client: Client,
  url: string,
  options: RequestInit
): Promise<unknown> {
  const token = await getAccessToken(client);
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    },
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

const ACTION_HANDLERS: Record<string, ActionHandler> = {
  // ─── Properties ───────────────────────────────────────────────────────────
  CREATE_PROPERTY: async (client, params) => {
    const { objectType, ...p } = params as {
      objectType: string;
      name: string;
      label: string;
      type: string;
      fieldType: string;
      groupName: string;
      description?: string;
      options?: { label: string; value: string }[];
    };
    return client.crm.properties.coreApi.create(objectType, {
      name: p.name,
      label: p.label,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      type: p.type as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fieldType: p.fieldType as any,
      groupName: p.groupName,
      description: p.description ?? "",
      options: p.options?.map((o, i) => ({
        label: o.label,
        value: o.value,
        displayOrder: i,
        hidden: false,
        description: "",
      })),
    });
  },

  UPDATE_PROPERTY: async (client, params) => {
    const { objectType, propertyName, ...updateData } = params as {
      objectType: string;
      propertyName: string;
    };
    return client.crm.properties.coreApi.update(
      objectType,
      propertyName,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      updateData as any
    );
  },

  DELETE_PROPERTY: async (client, params) => {
    const { objectType, propertyName } = params as {
      objectType: string;
      propertyName: string;
    };
    return client.crm.properties.coreApi.archive(objectType, propertyName);
  },

  // ─── Property Groups ──────────────────────────────────────────────────────
  CREATE_PROPERTY_GROUP: async (client, params) => {
    const { objectType, name, label } = params as {
      objectType: string;
      name: string;
      label: string;
    };
    return client.crm.properties.groupsApi.create(objectType, {
      name,
      label,
      displayOrder: -1,
    });
  },

  // ─── Pipelines ────────────────────────────────────────────────────────────
  CREATE_PIPELINE: async (client, params) => {
    const { objectType, label, stages } = params as {
      objectType: string;
      label: string;
      stages: { label: string; displayOrder: number }[];
    };
    return client.crm.pipelines.pipelinesApi.create(objectType, {
      label,
      displayOrder: 0,
      stages: stages.map((s) => ({
        label: s.label,
        displayOrder: s.displayOrder,
        metadata: {},
      })),
    });
  },

  CREATE_PIPELINE_STAGE: async (client, params) => {
    const { objectType, pipelineId, label, displayOrder } = params as {
      objectType: string;
      pipelineId: string;
      label: string;
      displayOrder: number;
    };
    return client.crm.pipelines.pipelineStagesApi.create(
      objectType,
      pipelineId,
      { label, displayOrder, metadata: {} }
    );
  },

  // ─── Custom Objects ───────────────────────────────────────────────────────
  CREATE_CUSTOM_OBJECT_SCHEMA: async (client, params) => {
    const { name, labels, primaryDisplayProperty, properties, associatedObjects } =
      params as {
        name: string;
        labels: { singular: string; plural: string };
        primaryDisplayProperty: string;
        properties: {
          name: string;
          label: string;
          type: string;
          fieldType: string;
        }[];
        associatedObjects?: string[];
      };
    return client.crm.schemas.coreApi.create({
      name,
      labels,
      primaryDisplayProperty,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      properties: properties as any,
      associatedObjects: associatedObjects ?? [],
      searchableProperties: [primaryDisplayProperty],
      requiredProperties: [primaryDisplayProperty],
    });
  },

  // ─── Association Types ────────────────────────────────────────────────────
  CREATE_ASSOCIATION_TYPE: async (client, params) => {
    const { fromObjectType, toObjectType, label, inverseLabel } = params as {
      fromObjectType: string;
      toObjectType: string;
      label: string;
      inverseLabel?: string;
    };
    return hubspotFetch(
      client,
      `https://api.hubapi.com/crm/v4/associations/${fromObjectType}/${toObjectType}/labels`,
      {
        method: "POST",
        body: JSON.stringify({ label, inverseLabel: inverseLabel ?? label }),
      }
    );
  },

  // ─── Lists ────────────────────────────────────────────────────────────────
  CREATE_LIST: async (client, params) => {
    const { name, listType, objectTypeId, filterBranch } = params as {
      name: string;
      listType: "STATIC" | "DYNAMIC";
      objectTypeId?: string;
      filterBranch?: unknown;
    };
    return hubspotFetch(client, "https://api.hubapi.com/crm/v3/lists", {
      method: "POST",
      body: JSON.stringify({
        name,
        objectTypeId: objectTypeId ?? "0-1",
        processingType: listType === "STATIC" ? "MANUAL" : "DYNAMIC",
        filterBranch: filterBranch ?? null,
      }),
    });
  },

  // ─── Forms ────────────────────────────────────────────────────────────────
  CREATE_FORM: async (client, params) => {
    const { name } = params as { name: string };
    return hubspotFetch(client, "https://api.hubapi.com/marketing/v3/forms", {
      method: "POST",
      body: JSON.stringify({
        name,
        formType: "hubspot",
        fieldGroups: [],
        configuration: {
          language: "es",
          cloneable: false,
          editable: true,
          archivable: true,
          recaptchaEnabled: false,
          notifyContactOwner: false,
          notifyRecipients: [],
          createNewContactForNewEmail: false,
          prePopulateKnownValues: false,
          allowLinkToResetKnownValues: false,
        },
        displayOptions: {
          renderRawHtml: false,
          cssClass: "",
          submitButtonText: "Enviar",
          theme: "default_style",
          style: {},
        },
        legalConsentOptions: { type: "none" },
      }),
    });
  },

  // ─── Webhooks ─────────────────────────────────────────────────────────────
  CREATE_WEBHOOK_SUBSCRIPTION: async (client, params) => {
    const { appId, eventType, propertyName, active } = params as {
      appId: number;
      eventType: string;
      propertyName?: string;
      active?: boolean;
    };
    return client.webhooks.subscriptionsApi.create(appId, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eventType: eventType as any,
      propertyName,
      active: active ?? true,
    });
  },

  // ─── Users ────────────────────────────────────────────────────────────────
  INVITE_USER: async (client, params) => {
    const { email, roleId, primaryTeamId } = params as {
      email: string;
      roleId?: number;
      primaryTeamId?: string;
    };
    return client.settings.users.usersApi.create({
      email,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      roleId: roleId as any,
      primaryTeamId,
    });
  },
};
