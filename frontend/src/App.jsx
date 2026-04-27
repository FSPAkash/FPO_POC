import { useEffect, useMemo, useState } from "react";
import { api, setApiAuthToken, setApiRole } from "./api";
import { AppShell } from "./components/layout/AppShell";
import { SectionPanel } from "./components/sections/SectionPanel";
import { Login } from "./components/auth/Login";
import { FloatingFarmerPhone } from "./components/phone/FloatingFarmerPhone";
import { SalesCheatsheet } from "./components/sales/SalesCheatsheet";
import { SECTION_TITLES } from "./theme";
import { renderSectionView } from "./sectionViews";

const AUTH_STORAGE_KEY = "fpo_auth_user";
const VALID_SECTION_IDS = new Set(["command", "walkthrough", "whatsapp", "registry", "operations", "market", "communication", "carbon", "governance"]);

const DEMO_ROLES = [
  "Super Admin",
  "FPO Admin",
  "Field Coordinator",
  "Operations User",
  "Sales User",
  "Viewer"
];

const ROLE_ACTIONS = {
  "Super Admin": new Set([
    "create_farmer",
    "create_pr",
    "approve_pr",
    "create_grn",
    "aggregate_demands",
    "issue_inputs",
    "record_collection",
    "generate_settlements",
    "release_settlement",
    "create_buyer_demand",
    "create_sales_order",
    "create_dispatch",
    "mark_sales_paid",
    "decide_approvals",
    "communicate",
    "manage_carbon",
    "export_reports",
    "reseed",
    "run_demo"
  ]),
  "FPO Admin": new Set([
    "create_farmer",
    "create_pr",
    "approve_pr",
    "create_grn",
    "aggregate_demands",
    "issue_inputs",
    "record_collection",
    "generate_settlements",
    "release_settlement",
    "create_buyer_demand",
    "create_sales_order",
    "create_dispatch",
    "mark_sales_paid",
    "decide_approvals",
    "communicate",
    "manage_carbon",
    "export_reports",
    "reseed",
    "run_demo"
  ]),
  "Field Coordinator": new Set(["create_farmer", "record_collection", "communicate", "manage_carbon"]),
  "Operations User": new Set(["create_pr", "approve_pr", "create_grn", "aggregate_demands", "issue_inputs", "generate_settlements", "communicate", "export_reports"]),
  "Sales User": new Set(["create_buyer_demand", "create_sales_order", "create_dispatch", "mark_sales_paid", "communicate", "export_reports"]),
  Viewer: new Set()
};

function getBootConfig() {
  if (typeof window === "undefined") {
    return {
      authUser: null,
      active: "command",
      role: "Super Admin",
      seedInput: "42",
      dataProfile: "full_data",
      captureMode: false,
      showPhone: true,
      showCheatsheet: true
    };
  }

  const params = new URLSearchParams(window.location.search);
  const captureMode = ["1", "true", "yes"].includes((params.get("capture") || "").toLowerCase());
  const requestedSection = params.get("section");
  const requestedRole = params.get("role");
  const seed = params.get("seed");
  const profile = params.get("profile");
  const phone = params.get("phone");
  const coach = params.get("coach");

  let authUser = null;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    authUser = parsed?.token ? parsed : null;
  } catch {
    authUser = null;
  }

  return {
    authUser,
    active: VALID_SECTION_IDS.has(requestedSection) ? requestedSection : "command",
    role: DEMO_ROLES.includes(requestedRole) ? requestedRole : "Super Admin",
    seedInput: seed ? String(seed) : "42",
    dataProfile: profile || "full_data",
    captureMode,
    showPhone: phone ? ["1", "true", "yes"].includes(phone.toLowerCase()) : !captureMode,
    showCheatsheet: coach ? ["1", "true", "yes"].includes(coach.toLowerCase()) : !captureMode
  };
}

export default function App() {
  const bootConfig = useMemo(() => getBootConfig(), []);
  const [authUser, setAuthUser] = useState(bootConfig.authUser);
  const [active, setActive] = useState(bootConfig.active);
  const [role, setRole] = useState(bootConfig.role);
  const [seedInput, setSeedInput] = useState(bootConfig.seedInput);
  const [dataProfile, setDataProfile] = useState(bootConfig.dataProfile);
  const [dataProfiles, setDataProfiles] = useState([
    { id: "full_data", label: "Full Data" },
    { id: "agentic_work", label: "Agentic Work" }
  ]);
  const [generatedAt, setGeneratedAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [data, setData] = useState({
    command: null,
    walkthrough: null,
    whatsapp: null,
    registry: null,
    operations: null,
    market: null,
    communication: null,
    carbon: null,
    governance: null
  });

  useEffect(() => {
    setApiRole(role);
  }, [role]);

  useEffect(() => {
    setApiAuthToken(authUser?.token || "");
  }, [authUser]);

  useEffect(() => {
    if (!info) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setInfo("");
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [info]);

  function canAction(action) {
    return ROLE_ACTIONS[role]?.has(action) ?? false;
  }

  const loaders = useMemo(
    () => ({
      command: async () => {
        const command = await api.agentCommandCenter();
        return command;
      },
      walkthrough: async () => {
        return api.agentCommandCenter();
      },
      whatsapp: async () => {
        const [lookups, thread, inbox, agentConfig] = await Promise.all([
          api.lookups(),
          api.communicationThread(),
          api.communicationInbox(),
          api.communicationAgentConfig()
        ]);
        return { lookups, thread, inbox, agentConfig };
      },
      registry: async () => {
        const [fpos, farmers, plots, seasons, communicationProfiles, geographies] = await Promise.all([
          api.registryFpos(),
          api.registryFarmers(),
          api.registryPlots(),
          api.registrySeasons(),
          api.registryCommunicationProfiles(),
          api.registryGeographies()
        ]);
        return { fpos, farmers, plots, seasons, communicationProfiles, geographies };
      },
      operations: async () => {
        const [demands, reviewQueue, procurement, inventory, inventoryTransactions, collections, settlements, lookups, marketSalesOrders, marketDispatches, approvals, agentActivity] = await Promise.all([
          api.operationsDemands(),
          api.operationsDemandReviewQueue(),
          api.operationsProcurement(),
          api.operationsInventory(),
          api.operationsInventoryTransactions(),
          api.operationsCollections(),
          api.operationsSettlements(),
          api.lookups(),
          api.marketSalesOrders(),
          api.marketDispatches(),
          api.adminApprovalLogs(),
          api.agentCommandCenter()
        ]);
        return { demands, reviewQueue, procurement, inventory, inventoryTransactions, collections, settlements, lookups, marketSalesOrders, marketDispatches, approvals, agentActivity };
      },
      market: async () => {
        const [prices, buyers, demands, matching, salesOrders, dispatches, collections, settlements, approvals, agentActivity] = await Promise.all([
          api.marketPrices(),
          api.marketBuyers(),
          api.marketDemands(),
          api.marketMatching(),
          api.marketSalesOrders(),
          api.marketDispatches(),
          api.operationsCollections(),
          api.operationsSettlements(),
          api.adminApprovalLogs(),
          api.agentCommandCenter()
        ]);
        return { prices, buyers, demands, matching, salesOrders, dispatches, collections, settlements, approvals, agentActivity };
      },
      communication: async () => {
        const [inbox, advisories, thread, broadcasts, agentConfig, lookups] = await Promise.all([
          api.communicationInbox(),
          api.communicationAdvisories(),
          api.communicationThread(),
          api.communicationBroadcasts(),
          api.communicationAgentConfig(),
          api.lookups()
        ]);
        return { inbox, advisories, thread, broadcasts, agentConfig, lookups };
      },
      carbon: async () => {
        const [practices, estimates, projects, lookups] = await Promise.all([
          api.carbonPractices(),
          api.carbonEstimates(),
          api.carbonProjects(),
          api.lookups()
        ]);
        return { practices, estimates, projects, lookups };
      },
      governance: async () => {
        const [approvals, audits, adminRoles, salesOrders, dispatches, settlements, procurement] = await Promise.all([
          api.adminApprovalLogs(),
          api.adminAuditLogs(),
          api.adminRoles(),
          api.marketSalesOrders(),
          api.marketDispatches(),
          api.operationsSettlements(),
          api.operationsProcurement()
        ]);
        return { approvals, audits, adminRoles, salesOrders, dispatches, settlements, procurement };
      }
    }),
    []
  );

  async function loadSection(section) {
    setLoading(true);
    setError("");
    try {
      const payload = await loaders[section]();
      setData((current) => ({ ...current, [section]: payload }));
    } catch (loadError) {
      if (loadError.status === 401) {
        handleLogout();
        return;
      }
      setError(loadError.message || "Something went wrong while loading the section.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authUser) {
      return;
    }
    loadSection(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, role, authUser]);

  useEffect(() => {
    if (authUser) {
      loadHealthMeta({ syncSeedInput: true, syncProfile: true });
    }
  }, [authUser]);

  async function loadHealthMeta({ syncSeedInput = false, syncProfile = false } = {}) {
    const health = await api.health();
    setGeneratedAt(health.generated_at || "");
    if (Array.isArray(health.data_profiles) && health.data_profiles.length) {
      setDataProfiles(health.data_profiles);
    }
    if (syncSeedInput && health.seed !== undefined && health.seed !== null) {
      setSeedInput(String(health.seed));
    }
    if (syncProfile && health.data_profile) {
      setDataProfile(health.data_profile);
    }
    return health;
  }

  async function handleReseed() {
    if (!ensurePermission("reseed", "Current role cannot reseed demo data.")) return;
    setLoading(true);
    setError("");
    try {
      const seed = Number(seedInput);
      await api.reseed(seed, dataProfile);
      await loadSection(active);
      await loadHealthMeta({ syncSeedInput: true, syncProfile: true });
    } catch (reseedError) {
      setError(reseedError.message || "Unable to reseed demo data.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetDemo() {
    if (!ensurePermission("reseed", "Current role cannot reset demo data.")) return null;
    setActionBusy(true);
    setError("");
    setInfo("");
    try {
      const seed = Number(seedInput) || 42;
      await api.reseed(seed, dataProfile);
      await refreshSections(["command", "operations", "market", "communication", "governance", "whatsapp"]);
      await loadHealthMeta({ syncSeedInput: true, syncProfile: true });
      setInfo("Demo reset — agents and human queues are back to their starting state.");
      return true;
    } catch (resetError) {
      setError(resetError.message || "Unable to reset demo.");
      return null;
    } finally {
      setActionBusy(false);
    }
  }

  async function refreshSections(sections) {
    const unique = [...new Set(sections)];
    for (const section of unique) {
      const payload = await loaders[section]();
      setData((current) => ({ ...current, [section]: payload }));
    }
    await loadHealthMeta();
  }

  async function withAction(task, sectionsToRefresh, successMessage) {
    setActionBusy(true);
    setError("");
    setInfo("");
    try {
      const result = await task();
      await refreshSections(sectionsToRefresh);
      setInfo(successMessage);
      return result;
    } catch (taskError) {
      if (taskError.status === 401) {
        handleLogout();
        return null;
      }
      setError(taskError.message || "Action failed.");
    } finally {
      setActionBusy(false);
    }
    return null;
  }

  function ensurePermission(permission, message) {
    if (canAction(permission)) {
      return true;
    }
    setError(message || `Role '${role}' cannot perform this action.`);
    return false;
  }

  async function handleCreateFarmer(formData) {
    if (!ensurePermission("create_farmer", "Current role cannot create farmers.")) return null;
    return withAction(
      () => api.createFarmer(formData),
      ["command", "registry", "whatsapp", "operations", "communication", "governance"],
      "Farmer created and linked to registry."
    );
  }

  async function handleCreatePurchaseRequest(formData) {
    if (!ensurePermission("create_pr", "Current role cannot create purchase requests.")) return null;
    return withAction(
      () => api.createPurchaseRequest(formData),
      ["command", "operations", "governance"],
      "Purchase request created."
    );
  }

  async function handleApprovePurchaseRequest(prId) {
    if (!ensurePermission("approve_pr", "Current role cannot approve purchase requests.")) return null;
    return withAction(
      () => api.approvePurchaseRequest(prId),
      ["command", "operations", "governance"],
      `Purchase request ${prId} approved.`
    );
  }

  async function handleCreateGoodsReceipt(formData) {
    if (!ensurePermission("create_grn", "Current role cannot create goods receipts.")) return null;
    return withAction(
      () => api.createGoodsReceipt(formData),
      ["command", "operations", "governance"],
      "Goods receipt captured and inventory updated."
    );
  }

  async function handleMarkSettlementPaid(settlementId) {
    if (!ensurePermission("release_settlement", "Current role cannot release settlements.")) return null;
    return withAction(
      () => api.markSettlementPaid(settlementId),
      ["command", "operations", "market", "governance"],
      `Settlement ${settlementId} marked paid.`
    );
  }

  async function handleCreateBuyerDemand(formData) {
    if (!ensurePermission("create_buyer_demand", "Current role cannot create buyer demand.")) return null;
    return withAction(
      () => api.createBuyerDemand(formData),
      ["command", "market", "governance"],
      "Buyer demand created."
    );
  }

  async function handleAggregateDemands(formData) {
    if (!ensurePermission("aggregate_demands", "Current role cannot aggregate demands.")) return null;
    return withAction(
      () => api.aggregateDemands(formData),
      ["command", "operations", "communication", "whatsapp", "governance"],
      "Demand rows aggregated."
    );
  }

  async function handleApproveDemandReview(demandId, payload) {
    if (!ensurePermission("aggregate_demands", "Current role cannot review demand queue.")) return null;
    return withAction(
      () => api.approveDemandReview(demandId, payload),
      ["command", "operations", "communication", "whatsapp", "governance"],
      "Demand approved."
    );
  }

  async function handleRejectDemandReview(demandId, payload) {
    if (!ensurePermission("aggregate_demands", "Current role cannot review demand queue.")) return null;
    return withAction(
      () => api.rejectDemandReview(demandId, payload),
      ["command", "operations", "communication", "whatsapp", "governance"],
      "Demand rejected."
    );
  }

  async function handleCreateInputIssue(formData) {
    if (!ensurePermission("issue_inputs", "Current role cannot issue inventory.")) return null;
    return withAction(
      () => api.createInputIssue(formData),
      ["command", "operations", "communication", "whatsapp", "governance"],
      "Inventory issued to farmer."
    );
  }

  async function handleCreateProduceCollection(formData) {
    if (!ensurePermission("record_collection", "Current role cannot record produce collection.")) return null;
    return withAction(
      () => api.createProduceCollection(formData),
      ["command", "operations", "market", "governance"],
      "Produce collection captured."
    );
  }

  async function handleGenerateSettlements(formData) {
    if (!ensurePermission("generate_settlements", "Current role cannot generate settlements.")) return null;
    return withAction(
      () => api.generateSettlements(formData),
      ["command", "operations", "governance"],
      "Settlement suggestions generated."
    );
  }

  async function handleCreateSalesOrder(formData) {
    if (!ensurePermission("create_sales_order", "Current role cannot create sales orders.")) return null;
    return withAction(
      () => api.createSalesOrder(formData),
      ["command", "market", "operations", "governance"],
      "Sales order created from matching."
    );
  }

  async function handleCreateDispatch(formData) {
    if (!ensurePermission("create_dispatch", "Current role cannot create dispatches.")) return null;
    return withAction(
      () => api.createDispatch(formData),
      ["command", "market", "governance"],
      "Dispatch created."
    );
  }

  async function handleMarkSalesOrderPaid(orderId) {
    if (!ensurePermission("mark_sales_paid", "Current role cannot mark buyer payment received.")) return null;
    return withAction(
      () => api.markSalesOrderPaid(orderId),
      ["command", "market", "operations", "governance"],
      `Sales order ${orderId} marked paid.`
    );
  }

  async function handleDecideApproval(approvalId, decision, notes) {
    if (!ensurePermission("decide_approvals", "Current role cannot decide approvals.")) return null;
    return withAction(
      () => api.decideApproval(approvalId, decision, notes || `Decision by ${role}`),
      ["command", "operations", "market", "governance"],
      `Approval ${approvalId} marked ${decision}.`
    );
  }

  async function handleBulkDecideApprovals(ids, decision, notes) {
    if (!ensurePermission("decide_approvals", "Current role cannot decide approvals.")) return null;
    return withAction(
      () => api.bulkDecideApprovals(ids, decision, notes || `Bulk ${decision} by ${role}`),
      ["command", "operations", "market", "governance"],
      `${ids.length} approval(s) marked ${decision}.`
    );
  }

  async function handleBulkApprovePurchaseRequests(ids) {
    if (!ensurePermission("approve_pr", "Current role cannot approve purchase requests.")) return null;
    return withAction(
      () => api.bulkApprovePurchaseRequests(ids),
      ["command", "operations", "governance"],
      `${ids.length} purchase request(s) approved.`
    );
  }

  async function handleBulkMarkSettlementsPaid(ids) {
    if (!ensurePermission("release_settlement", "Current role cannot release settlements.")) return null;
    return withAction(
      () => api.bulkMarkSettlementsPaid(ids),
      ["command", "operations", "market", "governance"],
      `${ids.length} settlement(s) marked paid.`
    );
  }

  async function handleCreateBroadcast(formData) {
    if (!ensurePermission("communicate", "Current role cannot create broadcast campaigns.")) return null;
    return withAction(
      () => api.createBroadcast(formData),
      ["command", "communication", "whatsapp", "governance"],
      "Broadcast sent to targeted recipients."
    );
  }

  async function handleSimulateBroadcastRead(broadcastId, farmerId) {
    if (!ensurePermission("communicate", "Current role cannot mark broadcast reads.")) return null;
    return withAction(
      () => api.broadcastSimulateReply(broadcastId, farmerId),
      ["command", "communication", "whatsapp", "governance"],
      "Farmer confirmed read."
    );
  }

  async function handleAssignDiseaseCase(caseId, payload) {
    if (!ensurePermission("communicate", "Current role cannot assign disease cases.")) return null;
    return withAction(
      () => api.assignDiseaseCase(caseId, payload),
      ["command", "communication", "whatsapp", "governance"],
      `Disease case ${caseId} updated.`
    );
  }

  async function handleCreateCarbonPractice(formData) {
    if (!ensurePermission("manage_carbon", "Current role cannot log carbon practices.")) return null;
    return withAction(
      () => api.createCarbonPractice(formData),
      ["carbon"],
      "Carbon practice logged."
    );
  }

  async function handleAdvanceCarbonProject(projectId) {
    if (!ensurePermission("manage_carbon", "Current role cannot advance carbon projects.")) return null;
    return withAction(
      () => api.advanceCarbonProject(projectId, {}),
      ["carbon"],
      `Carbon project ${projectId} advanced.`
    );
  }

  async function handleDownloadReport(reportType, format = "csv") {
    if (!ensurePermission("export_reports", "Current role cannot export reports.")) return null;
    setActionBusy(true);
    setError("");
    setInfo("");
    try {
      const blob = await api.reportExport(reportType, format);
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${reportType}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      setInfo(`Downloaded ${reportType}.${format}`);
    } catch (taskError) {
      setError(taskError.message || "Report export failed.");
    } finally {
      setActionBusy(false);
    }
    return null;
  }

  async function handleSendWhatsApp(formData) {
    if (!ensurePermission("communicate", "Current role cannot send messages.")) return null;
    return withAction(
      () => api.communicationSend(formData),
      ["command", "whatsapp", "communication", "operations", "market", "governance"],
      "Mock WhatsApp message processed."
    );
  }

  async function handleOfficeReply(formData) {
    if (!ensurePermission("communicate", "Current role cannot reply to chats.")) return null;
    return withAction(
      () => api.communicationReply(formData),
      ["command", "whatsapp", "communication", "governance"],
      "FPO office reply sent."
    );
  }

  async function handleAgentReply(messageId) {
    if (!ensurePermission("communicate", "Current role cannot use agent replies.")) return null;
    return withAction(
      () => api.communicationAgentReply({ message_id: messageId }),
      ["command", "whatsapp", "communication", "operations", "market", "governance"],
      "Agent reply sent."
    );
  }

  async function handleSetMessageStatus(messageId, status) {
    if (!ensurePermission("communicate", "Current role cannot change ticket status.")) return null;
    return withAction(
      () => api.communicationSetStatus(messageId, status),
      ["command", "whatsapp", "communication", "governance"],
      `Ticket ${messageId} moved to ${status.replace("_", " ")}.`
    );
  }

  async function handleRunAgentCycle(payload = {}) {
    if (!ensurePermission("run_demo", "Current role cannot trigger the autonomous agent cycle.")) return null;
    return withAction(
      () => api.runAgentCycle(payload),
      ["command", "whatsapp", "operations", "market", "communication", "governance"],
      "Autonomous agent cycle completed."
    );
  }

  async function handleLogin(credentials) {
    const session = await api.login(credentials.username, credentials.password);
    const user = {
      username: session.user?.username || credentials.username,
      token: session.token,
      expires_in: session.expires_in
    };
    setApiAuthToken(user.token);
    try {
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    } catch {
      // ignore storage errors
    }
    setAuthUser(user);
  }

  function handleLogout() {
    try {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // ignore
    }
    setApiAuthToken("");
    setAuthUser(null);
  }

  if (!authUser) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <AppShell
      active={active}
      onActiveChange={setActive}
      generatedAt={generatedAt}
      onReseed={handleReseed}
      seedInput={seedInput}
      onSeedInput={setSeedInput}
      dataProfile={dataProfile}
      dataProfiles={dataProfiles}
      onDataProfileChange={setDataProfile}
      role={role}
      roles={DEMO_ROLES}
      onRoleChange={setRole}
      canReseed={canAction("reseed")}
      authUser={authUser}
      onLogout={handleLogout}
    >
      <>
        <SectionPanel
          title={active === "command" ? null : SECTION_TITLES[active]}
        >
          {loading ? <p className="info-banner">Loading live synthetic data...</p> : null}
          {!loading && !error
            ? renderSectionView(active, data[active], {
                onCreateFarmer: handleCreateFarmer,
                onRunAgentCycle: handleRunAgentCycle,
                onRefreshSection: (section) => refreshSections([section]),
                onSetActive: setActive,
                onCreatePurchaseRequest: handleCreatePurchaseRequest,
                onApprovePurchaseRequest: handleApprovePurchaseRequest,
                onCreateGoodsReceipt: handleCreateGoodsReceipt,
                onMarkSettlementPaid: handleMarkSettlementPaid,
                onCreateBuyerDemand: handleCreateBuyerDemand,
                onAggregateDemands: handleAggregateDemands,
                onApproveDemandReview: handleApproveDemandReview,
                onRejectDemandReview: handleRejectDemandReview,
                onCreateInputIssue: handleCreateInputIssue,
                onCreateProduceCollection: handleCreateProduceCollection,
                onGenerateSettlements: handleGenerateSettlements,
                onCreateSalesOrder: handleCreateSalesOrder,
                onCreateDispatch: handleCreateDispatch,
                onMarkSalesOrderPaid: handleMarkSalesOrderPaid,
                onDecideApproval: handleDecideApproval,
                onBulkDecideApprovals: handleBulkDecideApprovals,
                onBulkApprovePurchaseRequests: handleBulkApprovePurchaseRequests,
                onBulkMarkSettlementsPaid: handleBulkMarkSettlementsPaid,
                onCreateBroadcast: handleCreateBroadcast,
                onSimulateBroadcastRead: handleSimulateBroadcastRead,
                onAssignDiseaseCase: handleAssignDiseaseCase,
                onCreateCarbonPractice: handleCreateCarbonPractice,
                onAdvanceCarbonProject: handleAdvanceCarbonProject,
                onDownloadReport: handleDownloadReport,
                onSendWhatsApp: handleSendWhatsApp,
                onOfficeReply: handleOfficeReply,
                onAgentReply: handleAgentReply,
                onSetMessageStatus: handleSetMessageStatus,
                onResetDemo: handleResetDemo,
                role,
                canAction,
                dataProfile
              })
            : null}
        </SectionPanel>
        <div className="toast-stack" aria-live="polite">
          {actionBusy ? <p className="info-banner">Applying action...</p> : null}
          {info ? <p className="info-banner success">{info}</p> : null}
          {error ? <p className="info-banner error">{error}</p> : null}
        </div>
        {bootConfig.showPhone ? (
          <FloatingFarmerPhone
            canCommunicate={canAction("communicate")}
            onActivity={() => refreshSections(["whatsapp", "communication", "command"])}
          />
        ) : null}
        {bootConfig.showCheatsheet ? <SalesCheatsheet section={active} role={role} canAction={canAction} /> : null}
      </>
    </AppShell>
  );
}
