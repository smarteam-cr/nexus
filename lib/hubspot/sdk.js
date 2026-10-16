/**
 * lib/hubspot/sdk.js — el cliente del SDK de HubSpot, tal cual. Los tipos los pone sdk.d.ts (ahí
 * está el porqué): TypeScript lee ese archivo y nunca este, y el bundler, Vitest y tsx cargan este.
 */
export { Client } from "@hubspot/api-client";
