import { describe, expect, it } from "vitest";
import { hubspotRecordUrl, leerEnlaceDeHubspot, seVincula } from "./urls";

describe("leerEnlaceDeHubspot", () => {
  it("lee la forma de siempre y la de /record/", () => {
    expect(leerEnlaceDeHubspot("https://app.hubspot.com/contacts/4774209/deal/123456789")).toEqual({ portal: "4774209", objeto: "0-3", id: "123456789" });
    expect(leerEnlaceDeHubspot("https://app.hubspot.com/contacts/4774209/company/42/view/1?x=1")).toEqual({ portal: "4774209", objeto: "0-2", id: "42" });
    expect(leerEnlaceDeHubspot("https://app.hubspot.com/contacts/4774209/record/0-970/555")).toEqual({ portal: "4774209", objeto: "0-970", id: "555" });
    expect(leerEnlaceDeHubspot("https://app-eu1.hubspot.com/contacts/1/record/2-9876/7")).toEqual({ portal: "1", objeto: "2-9876", id: "7" });
  });

  it("no acepta lo que no es una ficha de HubSpot", () => {
    for (const malo of [
      "",
      "no es una url",
      "http://app.hubspot.com/contacts/1/deal/2",
      "https://evil.com/contacts/1/deal/2",
      "https://app.hubspot.com.evil.com/contacts/1/deal/2",
      "https://app.hubspot.com/contacts/1/deals/list",
      "https://app.hubspot.com/contacts/abc/deal/2",
      "https://app.hubspot.com/contacts/1/record/0-3/abc",
    ]) {
      expect(leerEnlaceDeHubspot(malo), malo).toBeNull();
    }
  });

  it("la ficha vuelve a armarse igual y solo se vinculan los objetos que la app lee", () => {
    expect(hubspotRecordUrl("4774209", "0-3", "9")).toBe("https://app.hubspot.com/contacts/4774209/deal/9");
    expect(hubspotRecordUrl("4774209", "0-970", "9")).toBe("https://app.hubspot.com/contacts/4774209/record/0-970/9");
    expect(seVincula("0-3")).toBe(true);
    expect(seVincula("2-123")).toBe(true);
    expect(seVincula("0-136")).toBe(false); // leads: la app no los lee
  });
});
