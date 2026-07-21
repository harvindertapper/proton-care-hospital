import { query as dbQuery, run as dbRun } from "./test-db-adapter.js";
export * from "./server-mocked.js";

export async function query(statement, ...binds) {
  if (
    statement.includes("sessions") ||
    statement.includes("admin_users") ||
    statement.includes("rate_limits") ||
    statement.includes("appointments")
  ) {
    const { query: mockQuery } = await import("./server-mocked.js");
    return mockQuery(statement, ...binds);
  }
  return dbQuery(statement, ...binds);
}

export async function run(statement, ...binds) {
  if (
    statement.includes("sessions") ||
    statement.includes("admin_users") ||
    statement.includes("rate_limits") ||
    statement.includes("appointments")
  ) {
    const { run: mockRun } = await import("./server-mocked.js");
    return mockRun(statement, ...binds);
  }
  return dbRun(statement, ...binds);
}

export { MutationNotFoundError, MutationConflictError, requireAppliedMutation } from "../app/lib/mutation-result.ts";

let mockAdminSessionVal = { ok: true, session: { email: "admin@protoncare.in", role: "SUPER_ADMIN" } };
export function setMockSession(session) {
  mockAdminSessionVal = session;
}
export async function requireAdmin(requirement = {}) {
  if (mockAdminSessionVal.ok && requirement.role && mockAdminSessionVal.session.role !== requirement.role) {
    return { ok: false, status: 403, error: "Super admin approval is required for this action." };
  }
  return mockAdminSessionVal;
}
