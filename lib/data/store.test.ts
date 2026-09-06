import { describe, it, expect } from "vitest";
import { countRecentRefunds, getOrder, listOrders, DEMO_CUSTOMER_ID } from "./store";

describe("account lookups", () => {
  it("counts only refunds inside the window", () => {
    const asOf = new Date("2026-09-06");
    expect(countRecentRefunds(DEMO_CUSTOMER_ID, 30, asOf)).toBe(2);
    expect(countRecentRefunds(DEMO_CUSTOMER_ID, 5, asOf)).toBe(0);
  });

  it("does not count another customer's refunds", () => {
    expect(countRecentRefunds("cus_002", 3650, new Date("2026-09-06"))).toBe(0);
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
