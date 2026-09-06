// Stand-in for the systems a real deployment would call (billing, orders, CRM).
// The point is that the AGENT never treats the customer's own claims as facts —
// amounts, order state, and refund history always come from here.

export type Order = {
  id: string;
  customerId: string;
  description: string;
  amountUsd: number;
  placedAt: string;
  status: "delivered" | "shipped" | "cancelled" | "refunded";
};

export type Refund = {
  orderId: string;
  customerId: string;
  amountUsd: number;
  issuedAt: string;
};

export type Customer = {
  id: string;
  name: string;
  email: string;
  since: string;
};

const CUSTOMERS: Customer[] = [
  { id: "cus_001", name: "Ana Ferreira", email: "ana@example.com", since: "2023-02-11" },
  { id: "cus_002", name: "Marco Diaz", email: "marco@example.com", since: "2025-11-03" },
];

const ORDERS: Order[] = [
  { id: "1", customerId: "cus_001", description: "Annual plan", amountUsd: 480, placedAt: "2026-08-14", status: "delivered" },
  { id: "42", customerId: "cus_001", description: "Hardware token (2x)", amountUsd: 78, placedAt: "2026-08-29", status: "delivered" },
  { id: "123", customerId: "cus_001", description: "Onboarding service", amountUsd: 1500, placedAt: "2026-07-02", status: "delivered" },
  { id: "777", customerId: "cus_002", description: "Monthly plan", amountUsd: 40, placedAt: "2026-09-01", status: "shipped" },
];

const REFUNDS: Refund[] = [
  { orderId: "9001", customerId: "cus_001", amountUsd: 35, issuedAt: "2026-08-20" },
  // Deliberately one refund inside the 30-day window and one outside it: the
  // demo customer stays under the escalation count, so the auto-approval branch
  // is actually reachable, while the window boundary still gets exercised.
  { orderId: "9002", customerId: "cus_001", amountUsd: 60, issuedAt: "2026-07-04" },
];

// The demo UI has no login, so every conversation acts as this customer.
export const DEMO_CUSTOMER_ID = "cus_001";

export function getCustomer(customerId: string): Customer | undefined {
  return CUSTOMERS.find((c) => c.id === customerId);
}

export function getOrder(orderId: string): Order | undefined {
  return ORDERS.find((o) => o.id === orderId);
}

export function listOrders(customerId: string): Order[] {
  return ORDERS.filter((o) => o.customerId === customerId);
}

export function countRecentRefunds(customerId: string, withinDays: number, now = new Date()): number {
  const cutoff = now.getTime() - withinDays * 24 * 60 * 60 * 1000;
  return REFUNDS.filter(
    (r) => r.customerId === customerId && new Date(r.issuedAt).getTime() >= cutoff,
  ).length;
}

export function recordRefund(refund: Refund) {
  REFUNDS.push(refund);
  const order = getOrder(refund.orderId);
  if (order) order.status = "refunded";
}
