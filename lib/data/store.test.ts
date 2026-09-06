import { describe, it, expect } from "vitest";
import { countRecentRefunds, getOrder, listOrders, DEMO_CUSTOMER_ID } from "./store";

describe("account lookups", () => {
  it("counts only refunds inside the window, whenever it is run", () => {
    // No pinned clock: the fixtures are relative, so these hold in a month too.
    expect(countRecentRefunds(DEMO_CUSTOMER_ID, 30)).toBe(1);
    expect(countRecentRefunds(DEMO_CUSTOMER_ID, 5)).toBe(0);
    // The older refund only counts once the window is wide enough to reach it.
    expect(countRecentRefunds(DEMO_CUSTOMER_ID, 120)).toBe(2);
  });

  it("keeps the demo customer under the escalation threshold", () => {
    // The README promises a refund that resolves without a human. If the
    // fixtures drift past the limit, that walkthrough stops being true.
    expect(countRecentRefunds(DEMO_CUSTOMER_ID, 30)).toBeLessThan(2);
  });

  it("does not count another customer's refunds", () => {
    expect(countRecentRefunds("cus_002", 3650)).toBe(0);
  });

  it("returns only the customer's own orders", () => {
    const orders = listOrders(DEMO_CUSTOMER_ID);
    expect(orders.length).toBeGreaterThan(0);
    expect(orders.every((o) => o.customerId === DEMO_CUSTOMER_ID)).toBe(true);
  });

  it("returns undefined for an unknown order", () => {
    expect(getOrder("does-not-exist")).toBeUndefined();
  });
});
