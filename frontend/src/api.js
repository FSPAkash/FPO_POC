const JSON_HEADERS = {
  "Content-Type": "application/json"
};

let currentRole = "Super Admin";

export function setApiRole(role) {
  currentRole = role || "Super Admin";
}

async function parseResponse(response) {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Request failed (${response.status}): ${text || response.statusText}`);
  }
  return response.json();
}

async function parseBlobResponse(response) {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Request failed (${response.status}): ${text || response.statusText}`);
  }
  return response.blob();
}

function requestHeaders() {
  return {
    ...JSON_HEADERS,
    "X-Demo-Role": currentRole
  };
}

export async function getJson(path) {
  const response = await fetch(path, { headers: requestHeaders() });
  return parseResponse(response);
}

function withPageParams(path, page, pageSize) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}page=${page}&page_size=${pageSize}`;
}

export async function getAllPages(path, pageSize = 200) {
  const items = [];
  let page = 1;
  let total = 0;
  let totalPages = 1;

  while (page <= totalPages) {
    const payload = await getJson(withPageParams(path, page, pageSize));
    const pageItems = Array.isArray(payload?.items) ? payload.items : [];
    const pageTotal = Number(payload?.total ?? pageItems.length);

    total = Math.max(total, pageTotal);
    totalPages = Math.max(1, Math.ceil(pageTotal / pageSize));
    items.push(...pageItems);

    if (!pageItems.length) {
      break;
    }

    page += 1;
  }

  return {
    page: 1,
    page_size: items.length || pageSize,
    total: total || items.length,
    items
  };
}

export async function postJson(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify(payload)
  });
  return parseResponse(response);
}

export async function getBlob(path) {
  const response = await fetch(path, { headers: requestHeaders() });
  return parseBlobResponse(response);
}

export const api = {
  health: () => getJson("/api/health"),
  lookups: () => getJson("/api/lookups"),
  dashboardSummary: () => getJson("/api/dashboard/summary"),
  agentCommandCenter: () => getJson("/api/agent/command-center"),
  runAgentCycle: (payload = {}) => postJson("/api/agent/run-cycle", payload),
  agentRunEvents: (runId) => getJson(`/api/agent/runs/${encodeURIComponent(runId)}/events`),
  reportKpis: () => getJson("/api/reports/kpis"),
  demoScript: () => getJson("/api/demo/script"),
  runDemoStep: (stepId) => postJson("/api/demo/run-step", { step_id: stepId }),
  reseed: (seed, profile = "full_data") => postJson("/api/admin/seed", { seed, profile }),
  registryFpos: () => getAllPages("/api/registry/fpos"),
  registryFarmers: () => getAllPages("/api/registry/farmers"),
  registryPlots: () => getAllPages("/api/registry/plots"),
  registrySeasons: () => getAllPages("/api/registry/seasons"),
  registryCommunicationProfiles: () => getAllPages("/api/registry/communication-profiles"),
  registryGeographies: () => getJson("/api/registry/geographies"),
  createFarmer: (payload) => postJson("/api/registry/farmers", payload),
  operationsDemands: () => getAllPages("/api/operations/demand-summary"),
  operationsDemandReviewQueue: () => getAllPages("/api/operations/demands/review-queue"),
  approveDemandReview: (demandId, payload) => postJson(`/api/operations/demands/${demandId}/approve`, payload || {}),
  rejectDemandReview: (demandId, payload) => postJson(`/api/operations/demands/${demandId}/reject`, payload || {}),
  operationsProcurement: () => getJson("/api/operations/procurement"),
  operationsInventory: () => getAllPages("/api/operations/inventory"),
  operationsInventoryTransactions: () => getAllPages("/api/operations/inventory-transactions"),
  operationsCollections: () => getAllPages("/api/operations/collections"),
  operationsSettlements: () => getAllPages("/api/operations/settlements"),
  aggregateDemands: (payload) => postJson("/api/operations/demands/aggregate", payload),
  createPurchaseRequest: (payload) => postJson("/api/operations/purchase-requests", payload),
  approvePurchaseRequest: (prId) => postJson(`/api/operations/purchase-requests/${prId}/approve`, {}),
  createGoodsReceipt: (payload) => postJson("/api/operations/goods-receipts", payload),
  createInputIssue: (payload) => postJson("/api/operations/input-issues", payload),
  createProduceCollection: (payload) => postJson("/api/operations/produce-collections", payload),
  generateSettlements: (payload) => postJson("/api/operations/settlements/generate", payload),
  markSettlementPaid: (settlementId) => postJson(`/api/operations/settlements/${settlementId}/mark-paid`, {}),
  marketPrices: () => getAllPages("/api/market/prices"),
  marketBuyers: () => getAllPages("/api/market/buyers"),
  marketDemands: () => getAllPages("/api/market/demands"),
  marketMatching: () => getAllPages("/api/market/matching"),
  marketSalesOrders: () => getAllPages("/api/market/sales-orders"),
  marketDispatches: () => getAllPages("/api/market/dispatches"),
  createBuyerDemand: (payload) => postJson("/api/market/buyer-demands", payload),
  createSalesOrder: (payload) => postJson("/api/market/sales-orders", payload),
  createDispatch: (payload) => postJson("/api/market/dispatches", payload),
  markSalesOrderPaid: (orderId) => postJson(`/api/market/sales-orders/${orderId}/mark-paid`, {}),
  communicationInbox: () => getAllPages("/api/communication/inbox"),
  communicationAdvisories: () => getAllPages("/api/communication/advisories"),
  communicationEscalations: () => getAllPages("/api/communication/escalations"),
  communicationDiseaseCases: () => getAllPages("/api/communication/disease-cases"),
  communicationBroadcasts: () => getAllPages("/api/communication/broadcasts"),
  createBroadcast: (payload) => postJson("/api/communication/broadcasts", payload),
  broadcastRecipients: (broadcastId) => getJson(`/api/communication/broadcasts/${broadcastId}/recipients?page_size=200`),
  broadcastSimulateReply: (broadcastId, farmer_id) => postJson(`/api/communication/broadcasts/${broadcastId}/simulate-reply`, { farmer_id }),
  assignDiseaseCase: (caseId, payload) => postJson(`/api/communication/disease-cases/${caseId}/assign`, payload),
  communicationAgentConfig: () => getJson("/api/communication/agent-config"),
  communicationAgentReply: (payload) => postJson("/api/communication/agent-reply", payload),
  communicationThread: (farmerId = "", pageSize = 60) =>
    getJson(
      `/api/communication/mock-whatsapp/thread?page_size=${pageSize}${farmerId ? `&farmer_id=${encodeURIComponent(farmerId)}` : ""}`
    ),
  communicationSend: (payload) => postJson("/api/communication/mock-whatsapp/send", payload),
  communicationReply: (payload) => postJson("/api/communication/mock-whatsapp/reply", payload),
  communicationSetStatus: (messageId, status) => postJson(`/api/communication/messages/${messageId}/status`, { status }),
  adminRoles: () => getJson("/api/admin/roles"),
  adminAuditLogs: () => getAllPages("/api/admin/audit-logs"),
  adminApprovalLogs: () => getAllPages("/api/admin/approval-logs"),
  decideApproval: (approvalId, decision, notes = "") => postJson(`/api/admin/approvals/${approvalId}/decide`, { decision, notes }),
  bulkDecideApprovals: (ids, decision, notes = "") => postJson("/api/admin/approvals/bulk-decide", { ids, decision, notes }),
  bulkApprovePurchaseRequests: (ids) => postJson("/api/operations/purchase-requests/bulk-approve", { ids }),
  bulkMarkSettlementsPaid: (ids) => postJson("/api/operations/settlements/bulk-mark-paid", { ids }),
  carbonPractices: () => getAllPages("/api/carbon/practices"),
  createCarbonPractice: (payload) => postJson("/api/carbon/practices", payload),
  carbonEstimates: () => getAllPages("/api/carbon/estimates"),
  carbonProjects: () => getAllPages("/api/carbon/projects"),
  carbonProjectDetail: (projectId) => getJson(`/api/carbon/projects/${projectId}`),
  advanceCarbonProject: (projectId, payload) => postJson(`/api/carbon/projects/${projectId}/advance`, payload || {}),
  reportExport: (reportType, format = "csv") =>
    getBlob(`/api/reports/export?report=${encodeURIComponent(reportType)}&format=${encodeURIComponent(format)}`)
};
