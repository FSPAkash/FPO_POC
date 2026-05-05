from __future__ import annotations

import secrets
from collections import defaultdict
import csv
from datetime import date, datetime, timedelta
from io import StringIO
import json
import os
from pathlib import Path
import re
from typing import Any
from urllib import error as urlerror, request as urlrequest
try:
    import winreg  # type: ignore
except ImportError:  # pragma: no cover
    winreg = None

from flask import Flask, jsonify, make_response, request
from flask_cors import CORS
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from data_seed import DATASET_PROFILES, compute_dashboard, compute_matching, generate_dataset


ROLE_ORDER = [
    "Super Admin",
    "FPO Admin",
    "Field Coordinator",
    "Operations User",
    "Sales User",
    "Viewer",
]

ROLE_PERMISSIONS: dict[str, set[str]] = {
    "Super Admin": {
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
        "communicate",
        "manage_carbon",
        "export_reports",
        "run_demo",
        "reseed",
        "view_audit",
        "view_approvals",
        "decide_approvals",
    },
    "FPO Admin": {
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
        "communicate",
        "manage_carbon",
        "export_reports",
        "run_demo",
        "reseed",
        "view_audit",
        "view_approvals",
        "decide_approvals",
    },
    "Field Coordinator": {"create_farmer", "record_collection", "communicate", "manage_carbon", "view_audit", "view_approvals"},
    "Operations User": {"create_pr", "approve_pr", "create_grn", "aggregate_demands", "issue_inputs", "generate_settlements", "communicate", "export_reports", "view_audit", "view_approvals"},
    "Sales User": {"create_buyer_demand", "create_sales_order", "create_dispatch", "mark_sales_paid", "communicate", "export_reports", "view_audit", "view_approvals"},
    "Viewer": {"view_audit", "view_approvals"},
}

DATASET_FILE = Path(__file__).with_name("runtime_dataset.json")
AUTH_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24
AUTH_SALT = "fpo-demo-auth-v1"
AUTH_EXEMPT_PATHS = {"/api/health", "/api/auth/login"}
_EPHEMERAL_AUTH_SECRET = secrets.token_urlsafe(32)
DEFAULT_DEMO_USERS = {
    "Akash": "a1234",
    "Naina": "n1234",
}

CROP_REPLY_REFERENCE: dict[str, dict[str, str]] = {
    "Maize": {
        "aliases": "maize corn makka",
        "harvest_cycle": "Maize usually reaches harvest in about 90 to 120 days after sowing, depending on variety and season.",
        "advice": "Harvest when cobs are mature, husk turns dry, and grain moisture has come down.",
    },
    "Cotton": {
        "aliases": "cotton kapas",
        "harvest_cycle": "Cotton is commonly ready for first picking around 150 to 180 days after sowing, with multiple picking rounds after that.",
        "advice": "Start picking when bolls open well and avoid picking after rain or heavy dew.",
    },
    "Onion": {
        "aliases": "onion pyaj kanda",
        "harvest_cycle": "Onion is often ready in roughly 90 to 120 days after transplanting, depending on the variety.",
        "advice": "Harvest once most tops bend down and bulbs have developed properly.",
    },
    "Tomato": {
        "aliases": "tomato tamatar",
        "harvest_cycle": "Tomato usually starts harvest around 70 to 90 days after transplanting, followed by multiple pickings.",
        "advice": "Pick according to market requirement and avoid harvesting during peak afternoon heat.",
    },
    "Soybean": {
        "aliases": "soybean soya",
        "harvest_cycle": "Soybean is commonly harvested in about 90 to 110 days after sowing.",
        "advice": "Harvest when pods turn brown and leaves have mostly dropped.",
    },
    "Pomegranate": {
        "aliases": "pomegranate anar dalimb",
        "harvest_cycle": "Pomegranate fruits are usually ready around 5 to 7 months after flowering, depending on the bahar and local conditions.",
        "advice": "Harvest at maturity based on fruit colour, size, and expected market demand.",
    },
}

AGENT_PROFILES = [
    {
        "id": "agent_intake",
        "name": "Farmer Intake Agent",
        "focus": "Captures farmer asks, checks confidence, and routes work instantly.",
    },
    {
        "id": "agent_fulfillment",
        "name": "Input Fulfillment Agent",
        "focus": "Checks stock, raises procurement, and issues inventory without office touch.",
    },
    {
        "id": "agent_crop_cycle",
        "name": "Crop Cycle Agent",
        "focus": "Tracks seasons, sends proactive nudges, and verifies harvest readiness.",
    },
    {
        "id": "agent_market",
        "name": "Market Allocation Agent",
        "focus": "Matches produce to buyer demand, creates orders, and dispatches lots.",
    },
    {
        "id": "agent_exception",
        "name": "Human Handoff Agent",
        "focus": "Hands off only low-confidence cases, escalations, and approval-bound work.",
    },
]

INPUT_AUTONOMY_TRUST_THRESHOLD = 80
HARVEST_AUTONOMY_CONFIDENCE_THRESHOLD = 78
PR_AUTO_APPROVAL_QTY = 120
PR_AUTO_APPROVAL_VALUE = 150000
INPUT_ISSUE_APPROVAL_QTY = 120
SALES_ORDER_APPROVAL_QTY = 80
HARVEST_OUTREACH_WINDOW_DAYS = 14
HARVEST_OVERDUE_GRACE_DAYS = 4
AGENT_ALERT_COOLDOWN_DAYS = 7

CROP_YIELD_QTL_PER_HA: dict[str, float] = {
    "Maize": 55.0,
    "Cotton": 22.0,
    "Onion": 180.0,
    "Tomato": 240.0,
    "Soybean": 18.0,
    "Pomegranate": 70.0,
}


def _as_int(value: str | None, fallback: int) -> int:
    if value is None:
        return fallback
    try:
        return int(value)
    except ValueError:
        return fallback


def _paginate(rows: list[dict[str, Any]]) -> dict[str, Any]:
    page = max(1, _as_int(request.args.get("page"), 1))
    page_size = max(1, min(200, _as_int(request.args.get("page_size"), 50)))
    start = (page - 1) * page_size
    end = start + page_size
    return {
        "page": page,
        "page_size": page_size,
        "total": len(rows),
        "items": rows[start:end],
    }


def _filter_rows(rows: list[dict[str, Any]], filters: dict[str, str]) -> list[dict[str, Any]]:
    filtered = rows
    for key, query_key in filters.items():
        value = request.args.get(query_key)
        if not value:
            continue
        value_l = value.lower()
        filtered = [row for row in filtered if value_l in str(row.get(key, "")).lower()]
    return filtered


def _id_suffix(value: str) -> int:
    match = re.search(r"(\d+)$", value)
    return int(match.group(1)) if match else 0


def _next_id(prefix: str, rows: list[dict[str, Any]]) -> str:
    highest = 0
    for row in rows:
        rid = str(row.get("id", ""))
        if rid.startswith(f"{prefix}_"):
            highest = max(highest, _id_suffix(rid))
    return f"{prefix}_{highest + 1:04d}"


def _utc_now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _actor_role() -> str:
    role = str(request.headers.get("X-Demo-Role", "Super Admin")).strip()
    auth = request.environ.get("fpo.auth") if request else None
    allowed_roles = set(auth.get("roles", ROLE_ORDER)) if isinstance(auth, dict) else set(ROLE_ORDER)
    return role if role in ROLE_PERMISSIONS and role in allowed_roles else "Viewer"


def _require_permission(permission: str) -> tuple[Any, int] | None:
    role = _actor_role()
    if permission in ROLE_PERMISSIONS.get(role, set()):
        return None
    return jsonify({"error": f"Role '{role}' cannot perform '{permission}'."}), 403


def _build_users() -> list[dict[str, Any]]:
    return [
        {"id": "USR_0001", "name": "Platform Admin", "role": "Super Admin"},
        {"id": "USR_0002", "name": "FPO Lead", "role": "FPO Admin"},
        {"id": "USR_0003", "name": "Field Officer", "role": "Field Coordinator"},
        {"id": "USR_0004", "name": "Warehouse Ops", "role": "Operations User"},
        {"id": "USR_0005", "name": "Sales Manager", "role": "Sales User"},
        {"id": "USR_0006", "name": "Audit Viewer", "role": "Viewer"},
    ]


def _reply_mode_for_profile(profile: str | None) -> str:
    return "agentic" if profile == "agentic_work" else "manual"


INPUT_REVIEW_ESCALATION_CATEGORY = "input_review"


def _escalation_status_for_message_status(status: str) -> str:
    if status == "resolved":
        return "closed"
    if status == "in_progress":
        return "in_progress"
    return "open"


def _input_review_reason(demand: dict[str, Any]) -> str:
    rationale = [str(item).strip() for item in demand.get("trust_rationale", []) if str(item).strip()]
    if rationale:
        return "; ".join(rationale[:2])
    return "Input request confidence is below the agent autonomy threshold."


def _reconcile_input_review_escalations(dataset: dict[str, Any]) -> None:
    messages_by_id = {str(message.get("id", "")): message for message in dataset.get("message_logs", []) if message.get("id")}
    escalations_by_message = {
        str(escalation.get("message_id", "")): escalation
        for escalation in dataset.get("escalations", [])
        if escalation.get("message_id")
    }
    for demand in dataset.get("input_demands", []):
        if str(demand.get("source", "")).strip().lower() != "farmer_chat":
            continue
        message_id = str(demand.get("source_ref") or "").strip()
        if not message_id:
            continue
        message = messages_by_id.get(message_id)
        if not message:
            continue
        escalation = escalations_by_message.get(message_id)
        needs_review = str(demand.get("status") or "").strip().lower() == "needs_review"
        if needs_review:
            reason = _input_review_reason(demand)
            message["escalated"] = True
            message["escalation_category"] = INPUT_REVIEW_ESCALATION_CATEGORY
            message["escalation_reason"] = reason
            if escalation:
                escalation["category"] = INPUT_REVIEW_ESCALATION_CATEGORY
                escalation["reason"] = reason
                escalation["status"] = _escalation_status_for_message_status(str(message.get("status") or "pending"))
                escalation.setdefault("owner", "FPO Admin")
                escalation.setdefault("created_at", _utc_now())
                continue
            new_escalation = {
                "id": _next_id("ESC", dataset["escalations"]),
                "message_id": message_id,
                "farmer_id": message["farmer_id"],
                "disease_case_id": None,
                "category": INPUT_REVIEW_ESCALATION_CATEGORY,
                "reason": reason,
                "owner": "FPO Admin",
                "status": _escalation_status_for_message_status(str(message.get("status") or "pending")),
                "created_at": _utc_now(),
            }
            dataset["escalations"].append(new_escalation)
            escalations_by_message[message_id] = new_escalation
            continue

        if message.get("escalation_category") == INPUT_REVIEW_ESCALATION_CATEGORY:
            message["escalated"] = False
            message["escalation_category"] = "none"
            message["escalation_reason"] = ""
        if escalation and escalation.get("category") == INPUT_REVIEW_ESCALATION_CATEGORY:
            escalation["status"] = "closed"


def _normalize_dataset(dataset: dict[str, Any]) -> dict[str, Any]:
    dataset.setdefault("seed", 42)
    dataset.setdefault("data_profile", "full_data")
    dataset.setdefault("users", _build_users())
    dataset.setdefault("roles", [{"name": role, "permissions": sorted(ROLE_PERMISSIONS[role])} for role in ROLE_ORDER])
    dataset.setdefault("approval_logs", [])
    dataset.setdefault("audit_logs", [])
    dataset.setdefault("escalations", [])
    dataset.setdefault("farmer_input_issues", [])
    dataset.setdefault("dispatches", [])
    dataset.setdefault("broadcasts", [])
    dataset.setdefault("broadcast_recipients", [])
    dataset.setdefault("message_logs", [])
    dataset.setdefault("chat_threads", [])
    dataset.setdefault("disease_logs", [])
    dataset.setdefault("agent_runs", [])
    dataset.setdefault("agent_tasks", [])
    dataset.setdefault("agent_alerts", [])
    dataset.setdefault("harvest_signals", [])
    for _b in dataset["broadcasts"]:
        _b.setdefault("read_count", 0)
    for _r in dataset["broadcast_recipients"]:
        _r.setdefault("sent_at", _r.get("created_at"))
        _r.setdefault("read_at", None)
        _r.setdefault("farmer_name", "")
        _r.setdefault("village", "")
    settings = dataset.setdefault("communication_settings", {})
    settings["reply_mode"] = _reply_mode_for_profile(dataset.get("data_profile"))
    settings.setdefault("agent_provider", "openai")
    settings.setdefault("agent_prompt_version", "v1")
    settings.setdefault("agent_last_error", None)

    for message in dataset.get("message_logs", []):
        message.setdefault("status", "pending")
        message.setdefault("in_progress_at", None)
        message.setdefault("resolved_at", None)
        message.setdefault("created_records", {})
        message.setdefault("intents", [message.get("intent", "general_query")])
        message.setdefault("escalated", False)
        message.setdefault("escalation_category", "none")
        message.setdefault("escalation_reason", "")

    for disease in dataset.get("disease_logs", []):
        disease.setdefault("escalated", False)
        disease.setdefault("message_id", None)
        disease.setdefault("escalation_id", None)

    for escalation in dataset.get("escalations", []):
        escalation.setdefault("message_id", None)
        escalation.setdefault("category", "unknown")
        escalation.setdefault("reason", "")
        escalation.setdefault("created_at", _utc_now())

    for demand in dataset.get("input_demands", []):
        if demand.get("status") not in {"captured", "aggregated", "procured", "issued", "needs_review", "rejected"}:
            demand["status"] = "captured"
        demand.setdefault("issue_ids", [])
        demand.setdefault("aggregated_at", None)
        demand.setdefault("procured_at", None)
        demand.setdefault("source", "manual")
        demand.setdefault("source_ref", None)
        demand.setdefault("source_text", None)
        demand.setdefault("trust_score", 100)
        demand.setdefault("trust_rationale", [])
        demand.setdefault("reviewed_by", None)
        demand.setdefault("reviewed_at", None)
        demand.setdefault("review_notes", None)
    _reconcile_input_review_escalations(dataset)

    for pr in dataset.get("purchase_requests", []):
        pr.setdefault("input_demand_ids", [])
        pr.setdefault("source", "manual")
        pr.setdefault("source_ref", None)
        pr.setdefault("created_by_agent", False)
    for po in dataset.get("purchase_orders", []):
        po.setdefault("delivery_status", "in_transit")
        po.setdefault("source", "manual")
        po.setdefault("source_ref", None)
        po.setdefault("created_by_agent", False)
    for grn in dataset.get("goods_receipts", []):
        grn.setdefault("source", "manual")
        grn.setdefault("source_ref", None)
        grn.setdefault("created_by_agent", False)
    farmer_names_by_id = {str(farmer.get("id", "")): farmer.get("name", "") for farmer in dataset.get("farmers", [])}
    for issue in dataset.get("farmer_input_issues", []):
        issue.setdefault("approval_status", "approved")
        issue.setdefault("source", "manual")
        issue.setdefault("source_ref", None)
        issue.setdefault("created_by_agent", False)
        issue.setdefault("farmer_name", farmer_names_by_id.get(str(issue.get("farmer_id", ""))) or issue.get("farmer_id"))

    settlement_by_collection = {s.get("collection_id"): s for s in dataset.get("settlements", [])}
    for collection in dataset.get("produce_collections", []):
        existing_settlement = settlement_by_collection.get(collection.get("id"))
        if existing_settlement and existing_settlement.get("payment_status") == "paid":
            collection.setdefault("status", "settled")
        else:
            collection.setdefault("status", "graded")
        collection.setdefault("sales_order_id", None)
        collection.setdefault("source", "manual")
        collection.setdefault("source_ref", None)
        collection.setdefault("created_by_agent", False)

    for settlement in dataset.get("settlements", []):
        settlement.setdefault("payment_date", None)
        settlement.setdefault("sales_order_id", None)

    sales_order_by_id = {s["id"]: s for s in dataset.get("sales_orders", [])}
    for so in dataset.get("sales_orders", []):
        existing_status = so.get("status", "draft")
        if existing_status not in {"draft", "confirmed", "dispatched", "delivered", "paid"}:
            existing_status = "confirmed"
        so["status"] = existing_status
        payment_status = str(so.get("payment_status", "pending")).lower()
        so["payment_status"] = "received" if payment_status in {"received", "paid"} else "pending"
        if so["payment_status"] == "received":
            so["status"] = "paid"
        so.setdefault("approval_status", "approved")
        so.setdefault("settlement_release_status", "not_required")
        so.setdefault("buyer_demand_id", None)
        so.setdefault("collection_ids", [])
        so.setdefault("dispatch_ids", [])
        so.setdefault("created_date", so.get("dispatch_date", date.today().isoformat()))
        so.setdefault("source", "manual")
        so.setdefault("source_ref", None)
        so.setdefault("created_by_agent", False)

    for dispatch in dataset.get("dispatches", []):
        dispatch.setdefault("source", "manual")
        dispatch.setdefault("source_ref", None)
        dispatch.setdefault("created_by_agent", False)
        so = sales_order_by_id.get(dispatch.get("sales_order_id"))
        if so:
            if dispatch["id"] not in so["dispatch_ids"]:
                so["dispatch_ids"].append(dispatch["id"])
            if so["status"] in {"draft", "confirmed"}:
                so["status"] = "dispatched"

    for signal in dataset.get("harvest_signals", []):
        signal.setdefault("status", "confirmed")
        signal.setdefault("confidence", 0)
        signal.setdefault("source", "manual")
        signal.setdefault("source_ref", None)
        signal.setdefault("collection_id", None)
        signal.setdefault("sales_order_id", None)
        signal.setdefault("dispatch_id", None)
        signal.setdefault("market_demand_id", None)
        signal.setdefault("last_action_at", signal.get("created_at"))

    for run in dataset.get("agent_runs", []):
        run.setdefault("status", "completed")
        run.setdefault("farmer_id", None)
        run.setdefault("message_id", None)
        run.setdefault("action_count", 0)
        run.setdefault("human_handoffs", 0)
        run.setdefault("approval_count", 0)
        run.setdefault("summary", "")
        run.setdefault("actions", [])

    for task in dataset.get("agent_tasks", []):
        task.setdefault("status", "completed")
        task.setdefault("priority", "normal")
        task.setdefault("requires_human", False)
        task.setdefault("detail", "")
        task.setdefault("run_id", None)
        task.setdefault("farmer_id", None)
        task.setdefault("message_id", None)
        task.setdefault("entity_id", None)
        task.setdefault("entity_type", None)
        task.setdefault("created_at", _utc_now())

    for alert in dataset.get("agent_alerts", []):
        alert.setdefault("status", "sent")
        alert.setdefault("crop", "")
        alert.setdefault("farmer_id", None)
        alert.setdefault("farmer_name", "")
        alert.setdefault("created_at", _utc_now())
        alert.setdefault("related_entity_id", None)
        alert.setdefault("message_id", None)

    for log in dataset["approval_logs"]:
        log.setdefault("status", "pending")
        log.setdefault("requested_at", _utc_now())
        log.setdefault("decision_at", None)
        log.setdefault("decision_by", None)

    if not dataset["approval_logs"]:
        for pr in dataset.get("purchase_requests", []):
            status = "approved" if pr.get("approval_status") == "approved" else "pending"
            dataset["approval_logs"].append(
                {
                    "id": _next_id("APR", dataset["approval_logs"]),
                    "approval_type": "purchase_request",
                    "entity": "purchase_request",
                    "entity_id": pr["id"],
                    "status": status,
                    "requested_by": "System",
                    "requested_at": _utc_now(),
                    "decision_by": "System" if status == "approved" else None,
                    "decision_at": _utc_now() if status == "approved" else None,
                    "notes": "Seeded approval state.",
                }
            )
    return dataset


def _persist_dataset() -> None:
    DATASET_FILE.write_text(json.dumps(DATASET, separators=(",", ":")), encoding="utf-8")


def _load_dataset(seed: int = 42, profile: str = "full_data") -> dict[str, Any]:
    if DATASET_FILE.exists():
        try:
            raw = json.loads(DATASET_FILE.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                return _normalize_dataset(raw)
        except (json.JSONDecodeError, OSError):
            pass
    dataset = _normalize_dataset(generate_dataset(seed=seed, profile=profile))
    try:
        DATASET_FILE.write_text(json.dumps(dataset, separators=(",", ":")), encoding="utf-8")
    except OSError:
        pass
    return dataset


def _cors_origins() -> list[str]:
    configured = [
        value.strip()
        for value in str(os.environ.get("CORS_ORIGINS", "")).split(",")
        if value.strip()
    ]
    defaults = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://fpo-poc-frontend.onrender.com",
    ]
    return list(dict.fromkeys([*configured, *defaults]))


def _auth_secret() -> str:
    return str(os.environ.get("FPO_AUTH_SECRET") or os.environ.get("SECRET_KEY") or _EPHEMERAL_AUTH_SECRET)


def _auth_serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(_auth_secret(), salt=AUTH_SALT)


def _demo_users() -> dict[str, str]:
    raw = str(os.environ.get("FPO_DEMO_USERS", "")).strip()
    if not raw:
        return DEFAULT_DEMO_USERS.copy()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        parsed = None
    if isinstance(parsed, dict):
        users = {str(username): str(password) for username, password in parsed.items() if str(username).strip()}
        return users or DEFAULT_DEMO_USERS.copy()
    users: dict[str, str] = {}
    for pair in raw.split(","):
        username, separator, password = pair.partition(":")
        if separator and username.strip():
            users[username.strip()] = password
    return users or DEFAULT_DEMO_USERS.copy()


def _issue_auth_token(username: str) -> str:
    return _auth_serializer().dumps({"username": username, "roles": ROLE_ORDER})


def _bearer_token() -> str:
    value = str(request.headers.get("Authorization", "")).strip()
    prefix = "Bearer "
    return value[len(prefix):].strip() if value.startswith(prefix) else ""


def _verify_auth_token(token: str) -> dict[str, Any] | None:
    if not token:
        return None
    try:
        payload = _auth_serializer().loads(token, max_age=AUTH_TOKEN_MAX_AGE_SECONDS)
    except (BadSignature, SignatureExpired):
        return None
    if not isinstance(payload, dict):
        return None
    username = str(payload.get("username", "")).strip()
    if username not in _demo_users():
        return None
    roles = [role for role in payload.get("roles", ROLE_ORDER) if role in ROLE_PERMISSIONS]
    return {"username": username, "roles": roles or ROLE_ORDER}


app = Flask(__name__)
app.config["SECRET_KEY"] = _auth_secret()
CORS(
    app,
    resources={
        r"/api/*": {
            "origins": _cors_origins(),
            "allow_headers": ["Content-Type", "Authorization", "X-Demo-Role"],
            "methods": ["GET", "POST", "OPTIONS"],
        }
    },
)

DATASET = _load_dataset(seed=42, profile="full_data")


@app.before_request
def _authenticate_api_request() -> Any:
    if request.method == "OPTIONS" or not request.path.startswith("/api/"):
        return None
    if request.path in AUTH_EXEMPT_PATHS:
        return None
    auth = _verify_auth_token(_bearer_token())
    if not auth:
        return jsonify({"error": "Authentication required."}), 401
    request.environ["fpo.auth"] = auth
    return None


def _append_audit(entity: str, entity_id: str, action: str, notes: str) -> None:
    DATASET["audit_logs"].append(
        {
            "id": _next_id("AUD", DATASET["audit_logs"]),
            "entity": entity,
            "entity_id": entity_id,
            "action": action,
            "timestamp": _utc_now(),
            "notes": notes,
        }
    )
    try:
        _persist_dataset()
    except OSError:
        pass


def _append_approval(
    approval_type: str,
    entity: str,
    entity_id: str,
    notes: str,
    *,
    status: str = "pending",
    requested_by: str | None = None,
    amount: float | None = None,
) -> dict[str, Any]:
    row = {
        "id": _next_id("APR", DATASET["approval_logs"]),
        "approval_type": approval_type,
        "entity": entity,
        "entity_id": entity_id,
        "status": status,
        "requested_by": requested_by or _actor_role(),
        "requested_at": _utc_now(),
        "decision_by": _actor_role() if status in {"approved", "rejected"} else None,
        "decision_at": _utc_now() if status in {"approved", "rejected"} else None,
        "amount": amount,
        "notes": notes,
    }
    DATASET["approval_logs"].append(row)
    try:
        _persist_dataset()
    except OSError:
        pass
    return row


def _latest_pending_approval(entity: str, entity_id: str) -> dict[str, Any] | None:
    for row in sorted(DATASET["approval_logs"], key=lambda r: r["requested_at"], reverse=True):
        if row["entity"] == entity and row["entity_id"] == entity_id and row["status"] == "pending":
            return row
    return None


def _is_pending_status(value: str | None) -> bool:
    return str(value or "").strip().lower() == "pending"


def _is_approval_cleared(value: str | None) -> bool:
    status = str(value or "").strip().lower()
    return status in {"approved", "not_required"}


def _find_fpo(fpo_id: str) -> dict[str, Any] | None:
    return next((f for f in DATASET["fpos"] if f["id"] == fpo_id), None)


def _find_farmer(farmer_id: str) -> dict[str, Any] | None:
    return next((f for f in DATASET["farmers"] if f["id"] == farmer_id), None)


def _find_input(item_id: str) -> dict[str, Any] | None:
    return next((i for i in DATASET["inputs_catalog"] if i["id"] == item_id), None)


def _find_supplier(supplier_id: str) -> dict[str, Any] | None:
    return next((s for s in DATASET["suppliers"] if s["id"] == supplier_id), None)


def _find_buyer(buyer_id: str) -> dict[str, Any] | None:
    return next((b for b in DATASET["buyers"] if b["id"] == buyer_id), None)


def _find_sales_order(order_id: str) -> dict[str, Any] | None:
    return next((s for s in DATASET["sales_orders"] if s["id"] == order_id), None)


def _find_dispatch_for_sales_order(order_id: str) -> dict[str, Any] | None:
    return next((d for d in DATASET["dispatches"] if d.get("sales_order_id") == order_id), None)


def _find_collection(collection_id: str) -> dict[str, Any] | None:
    return next((c for c in DATASET["produce_collections"] if c["id"] == collection_id), None)


def _find_settlement_by_collection(collection_id: str) -> dict[str, Any] | None:
    return next((s for s in DATASET["settlements"] if s.get("collection_id") == collection_id), None)


def _find_message(message_id: str) -> dict[str, Any] | None:
    return next((m for m in DATASET["message_logs"] if m["id"] == message_id), None)


def _find_escalation_by_message(message_id: str) -> dict[str, Any] | None:
    return next((e for e in DATASET["escalations"] if e.get("message_id") == message_id), None)


def _inventory_row(fpo_id: str, item_id: str) -> dict[str, Any] | None:
    return next((s for s in DATASET["inventory_snapshot"] if s["fpo_id"] == fpo_id and s["item_id"] == item_id), None)


def _find_communication_profile(farmer_id: str) -> dict[str, Any] | None:
    return next((p for p in DATASET["communication_profiles"] if p["farmer_id"] == farmer_id), None)


def _persist_dataset_safe() -> None:
    try:
        _persist_dataset()
    except OSError:
        pass


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
        except ValueError:
            return None


def _days_until(value: str | None) -> int | None:
    parsed = _parse_date(value)
    if not parsed:
        return None
    return (parsed - date.today()).days


def _days_since(value: str | None) -> int | None:
    parsed = _parse_date(value)
    if not parsed:
        return None
    return (date.today() - parsed).days


def _agent_profile(agent_id: str) -> dict[str, Any]:
    return next((row for row in AGENT_PROFILES if row["id"] == agent_id), {"id": agent_id, "name": agent_id, "focus": ""})


def _buyer_reliability_score(buyer_id: str) -> float:
    buyer = _find_buyer(buyer_id)
    if not buyer:
        return 0.0
    try:
        return float(buyer.get("reliability_score", 0.0))
    except (TypeError, ValueError):
        return 0.0


def _estimated_harvest_qty_qtl(farmer: dict[str, Any], crop_name: str) -> float:
    base_yield = CROP_YIELD_QTL_PER_HA.get(crop_name, 60.0)
    area = max(0.5, float(farmer.get("land_size_ha", 1.0) or 1.0))
    return round(base_yield * area, 2)


def _farmer_active_crops(farmer_id: str) -> list[str]:
    crops = {
        str(row.get("crop_name") or "").strip()
        for row in DATASET.get("crop_seasons", [])
        if row.get("farmer_id") == farmer_id and str(row.get("crop_name") or "").strip()
    }
    return sorted(crops)


def _crop_is_unambiguous(farmer: dict[str, Any]) -> bool:
    active = _farmer_active_crops(farmer.get("id", ""))
    if len(active) <= 1:
        return True
    primary = str(farmer.get("primary_crop", "") or "").strip()
    return bool(primary) and active == [primary]


def _score_harvest_signal(text: str, farmer: dict[str, Any], season: dict[str, Any] | None) -> tuple[int, list[str]]:
    lowered = (text or "").lower()
    score = 0
    rationale: list[str] = []
    if any(token in lowered for token in ["harvest", "ready", "picked", "produce ready", "crop ready", "mature"]):
        score += 55
        rationale.append("Strong harvest intent keywords present.")
    crop_name = str(farmer.get("primary_crop", "") or "")
    if crop_name and crop_name.lower() in lowered:
        score += 20
        rationale.append("Farmer crop referenced explicitly.")
    elif _crop_is_unambiguous(farmer) and crop_name:
        score += 20
        rationale.append(f"Farmer has only one active crop on record ({crop_name}); message can be attributed safely.")
    days_to_harvest = _days_until((season or {}).get("expected_harvest"))
    if days_to_harvest is not None and days_to_harvest <= HARVEST_OUTREACH_WINDOW_DAYS:
        score += 25
        rationale.append("Season is inside the expected harvest window.")
    elif season:
        score += 10
        rationale.append("Farmer has an active crop season on record.")
    return min(score, 100), rationale


def _harvest_handoff_reasons(text: str, farmer: dict[str, Any], season: dict[str, Any] | None) -> list[str]:
    lowered = (text or "").lower()
    gaps: list[str] = []
    crop_name = str(farmer.get("primary_crop", "") or "")
    if crop_name and crop_name.lower() not in lowered and not _crop_is_unambiguous(farmer):
        gaps.append(f"the message did not mention {crop_name}, so I could not be sure which crop is ready")
    days_to_harvest = _days_until((season or {}).get("expected_harvest"))
    if not season:
        gaps.append("no active crop season is on record for this farmer")
    elif days_to_harvest is None:
        gaps.append("expected harvest date is missing on the crop season record")
    elif days_to_harvest > HARVEST_OUTREACH_WINDOW_DAYS:
        expected = (season or {}).get("expected_harvest")
        gaps.append(
            f"expected harvest is still {days_to_harvest} days away ({expected}), outside the {HARVEST_OUTREACH_WINDOW_DAYS}-day pickup window"
        )
    elif days_to_harvest < -HARVEST_OVERDUE_GRACE_DAYS:
        gaps.append(f"expected harvest was {-days_to_harvest} days ago, the season looks overdue")
    if not any(token in lowered for token in ["harvest", "ready", "picked", "produce ready", "crop ready", "mature"]):
        gaps.append("the message did not contain clear harvest-ready wording")
    return gaps


def _open_quantity_for_buyer_demand(demand: dict[str, Any]) -> float:
    allocated = sum(
        float(row.get("quantity_mt", 0))
        for row in DATASET.get("sales_orders", [])
        if row.get("buyer_demand_id") == demand["id"] and row.get("status") != "draft"
    )
    return round(max(0.0, float(demand.get("quantity_mt", 0)) - allocated), 2)


def _best_open_buyer_demand(crop: str) -> dict[str, Any] | None:
    candidates = [
        row
        for row in DATASET.get("buyer_demands", [])
        if row.get("crop") == crop and row.get("status") in {"open", "matched"} and _open_quantity_for_buyer_demand(row) > 0
    ]
    if not candidates:
        return None
    candidates.sort(
        key=lambda row: (
            -float(row.get("offered_price", 0)),
            row.get("required_date", ""),
            -_buyer_reliability_score(str(row.get("buyer_id", ""))),
        )
    )
    return candidates[0]


def _start_agent_run(trigger: str, primary_agent: str, *, farmer_id: str | None = None, message_id: str | None = None) -> dict[str, Any]:
    run = {
        "id": _next_id("ARUN", DATASET["agent_runs"]),
        "trigger": trigger,
        "primary_agent": primary_agent,
        "status": "running",
        "farmer_id": farmer_id,
        "message_id": message_id,
        "started_at": _utc_now(),
        "completed_at": None,
        "action_count": 0,
        "human_handoffs": 0,
        "approval_count": 0,
        "summary": "",
        "actions": [],
    }
    DATASET["agent_runs"].append(run)
    return run


def _finish_agent_run(run: dict[str, Any], *, summary: str, actions: list[str], human_handoffs: int = 0, approvals: int = 0) -> dict[str, Any]:
    run["status"] = "completed"
    run["completed_at"] = _utc_now()
    run["summary"] = summary
    run["actions"] = actions
    run["action_count"] = len(actions)
    run["human_handoffs"] = human_handoffs
    run["approval_count"] = approvals
    return run


def _record_agent_task(
    agent_id: str,
    title: str,
    *,
    entity_type: str | None = None,
    entity_id: str | None = None,
    farmer_id: str | None = None,
    message_id: str | None = None,
    status: str = "completed",
    priority: str = "normal",
    requires_human: bool = False,
    detail: str = "",
    run_id: str | None = None,
) -> dict[str, Any]:
    profile = _agent_profile(agent_id)
    row = {
        "id": _next_id("ATASK", DATASET["agent_tasks"]),
        "agent_id": agent_id,
        "agent_name": profile["name"],
        "title": title,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "farmer_id": farmer_id,
        "message_id": message_id,
        "status": status,
        "priority": priority,
        "requires_human": requires_human,
        "detail": detail,
        "run_id": run_id,
        "created_at": _utc_now(),
    }
    DATASET["agent_tasks"].append(row)
    return row


def _latest_agent_alert(farmer_id: str, alert_type: str, crop: str) -> dict[str, Any] | None:
    rows = [
        row
        for row in DATASET.get("agent_alerts", [])
        if row.get("farmer_id") == farmer_id and row.get("alert_type") == alert_type and row.get("crop") == crop
    ]
    if not rows:
        return None
    rows.sort(key=lambda row: row.get("created_at", ""), reverse=True)
    return rows[0]


def _record_agent_alert(
    agent_id: str,
    farmer: dict[str, Any],
    alert_type: str,
    text: str,
    *,
    crop: str = "",
    related_entity_id: str | None = None,
    message_id: str | None = None,
) -> dict[str, Any]:
    row = {
        "id": _next_id("ALRT", DATASET["agent_alerts"]),
        "agent_id": agent_id,
        "agent_name": _agent_profile(agent_id)["name"],
        "alert_type": alert_type,
        "farmer_id": farmer["id"],
        "farmer_name": farmer["name"],
        "crop": crop,
        "text": text,
        "status": "sent",
        "related_entity_id": related_entity_id,
        "message_id": message_id,
        "created_at": _utc_now(),
    }
    DATASET["agent_alerts"].append(row)
    return row


def _message_status_from_escalation(status: str) -> str:
    if status == "in_progress":
        return "in_progress"
    if status == "closed":
        return "resolved"
    return "pending"


def _escalation_status_from_message(status: str) -> str:
    return _escalation_status_for_message_status(status)


def _sync_incoming_chat_status(message_id: str, status: str) -> None:
    incoming = next(
        (
            item
            for item in sorted(DATASET["chat_threads"], key=lambda value: value["timestamp"], reverse=True)
            if item.get("message_id") == message_id and item.get("direction") == "incoming"
        ),
        None,
    )
    if incoming:
        incoming["status"] = status


def _set_message_status_fields(message: dict[str, Any], status: str, *, timestamp: str | None = None) -> None:
    timestamp = timestamp or _utc_now()
    message["status"] = status
    if status == "pending":
        message["in_progress_at"] = None
        message["resolved_at"] = None
    elif status == "in_progress":
        message["in_progress_at"] = message.get("in_progress_at") or timestamp
        message["resolved_at"] = None
    else:
        message["in_progress_at"] = message.get("in_progress_at") or timestamp
        message["resolved_at"] = timestamp
    _sync_incoming_chat_status(message["id"], status)

    escalation = _find_escalation_by_message(message["id"])
    if escalation:
        escalation["status"] = _escalation_status_from_message(status)


def _apply_message_escalation(
    message: dict[str, Any],
    *,
    category: str,
    reason: str = "",
    owner: str = "FPO Manager",
    status: str = "open",
    disease_case_id: str | None = None,
) -> dict[str, Any]:
    message["escalated"] = True
    message["escalation_category"] = category
    message["escalation_reason"] = reason

    escalation = _find_escalation_by_message(message["id"])
    if escalation:
        escalation["category"] = category
        escalation["reason"] = reason
        escalation["owner"] = owner
        escalation["status"] = status
        if disease_case_id:
            escalation["disease_case_id"] = disease_case_id
        escalation.setdefault("created_at", _utc_now())
        return escalation

    escalation = {
        "id": _next_id("ESC", DATASET["escalations"]),
        "message_id": message["id"],
        "farmer_id": message["farmer_id"],
        "disease_case_id": disease_case_id,
        "category": category,
        "reason": reason,
        "owner": owner,
        "status": status,
        "created_at": _utc_now(),
    }
    DATASET["escalations"].append(escalation)
    return escalation


def _clear_message_escalation(message: dict[str, Any]) -> None:
    message["escalated"] = False
    message["escalation_category"] = "none"
    message["escalation_reason"] = ""

    escalation = _find_escalation_by_message(message["id"])
    if escalation:
        escalation["status"] = "closed"


def _post_outgoing_chat(
    farmer: dict[str, Any],
    text: str,
    *,
    message: dict[str, Any] | None = None,
    status: str | None = None,
    intent: str | None = None,
    agent_generated: bool = False,
) -> dict[str, Any]:
    _ensure_chat_threads()
    reply_timestamp = _utc_now()
    outgoing = {
        "id": _next_id("CHAT", DATASET["chat_threads"]),
        "farmer_id": farmer["id"],
        "farmer_name": farmer["name"],
        "direction": "outgoing",
        "intent": intent or (message["intent"] if message else "office_reply"),
        "severity": "NORMAL",
        "status": "sent",
        "message_id": message["id"] if message else None,
        "text": text,
        "timestamp": reply_timestamp,
        "agent_generated": agent_generated,
    }
    DATASET["chat_threads"].append(outgoing)
    if message and status:
        _set_message_status_fields(message, status, timestamp=reply_timestamp)
    _append_audit(
        "communication",
        outgoing["id"],
        "agent_reply" if agent_generated else "office_reply",
        "Automated farmer update sent." if agent_generated else "FPO office replied to farmer.",
    )
    return {"chat_id": outgoing["id"], "resolved_message_id": message["id"] if message and status == "resolved" else None}


def _add_message_response(message: dict[str, Any], text: str) -> dict[str, Any]:
    farmer = _find_farmer(message["farmer_id"])
    if not farmer:
        raise ValueError("Invalid farmer_id")
    last_outgoing = next(
        (
            row
            for row in sorted(DATASET["chat_threads"], key=lambda item: item["timestamp"], reverse=True)
            if row.get("message_id") == message["id"] and row.get("direction") == "outgoing"
        ),
        None,
    )
    if last_outgoing and last_outgoing.get("text") == text:
        return {"chat_id": last_outgoing["id"], "resolved_message_id": message["id"]}
    return _post_outgoing_chat(farmer, text, message=message, status="resolved", agent_generated=True)


def _sync_message_from_demand(demand: dict[str, Any], *, reply_text: str | None = None) -> None:
    source_ref = str(demand.get("source_ref") or "").strip()
    if not source_ref:
        return
    message = _find_message(source_ref)
    if not message:
        return

    status = str(demand.get("status") or "").strip().lower()
    if status in {"captured", "aggregated", "procured"}:
        _set_message_status_fields(message, "in_progress")
    elif status in {"issued", "rejected"}:
        if reply_text:
            _add_message_response(message, reply_text)
        else:
            _set_message_status_fields(message, "resolved")
    intents = {intent for intent in _message_intents(message) if intent != "general_query"}
    if intents == {"input_request"} and message.get("escalated"):
        _clear_message_escalation(message)


def _communication_settings() -> dict[str, Any]:
    settings = DATASET.setdefault("communication_settings", {})
    settings.setdefault("reply_mode", "manual")
    settings.setdefault("agent_provider", "openai")
    settings.setdefault("agent_prompt_version", "v1")
    settings.setdefault("agent_last_error", None)
    return settings


def _agentic_replies_enabled() -> bool:
    return _communication_settings().get("reply_mode") == "agentic"


def _message_intents(message: dict[str, Any]) -> list[str]:
    raw_intents = message.get("intents")
    if isinstance(raw_intents, list):
        intents = [str(item).strip() for item in raw_intents if str(item).strip()]
    else:
        intents = []
    if not intents:
        intent = str(message.get("intent") or "general_query").strip() or "general_query"
        intents = [intent]
    return intents


def _message_has_agent_reply(message_id: str) -> bool:
    return any(
        row.get("message_id") == message_id
        and row.get("direction") == "outgoing"
        and bool(row.get("agent_generated"))
        for row in DATASET.get("chat_threads", [])
    )


def _agent_api_key() -> str:
    value = str(os.environ.get("OPENAI_API_KEY", "")).strip()
    if value:
        return value
    return _read_windows_user_env("OPENAI_API_KEY")


def _agent_model() -> str:
    value = str(os.environ.get("OPENAI_AGENT_MODEL", "")).strip()
    if value:
        return value
    return _read_windows_user_env("OPENAI_AGENT_MODEL") or "gpt-5.2"


def _read_windows_user_env(name: str) -> str:
    if winreg is None:
        return ""
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Environment") as key:
            value, _ = winreg.QueryValueEx(key, name)
            return str(value).strip()
    except OSError:
        return ""


def _agent_public_config() -> dict[str, Any]:
    settings = _communication_settings()
    return {
        "reply_mode": settings["reply_mode"],
        "agent_provider": settings["agent_provider"],
        "agent_prompt_version": settings["agent_prompt_version"],
        "agent_model": _agent_model(),
        "agent_available": bool(_agent_api_key()),
        "agent_auto_reply_enabled": _agentic_replies_enabled(),
        "data_profile": DATASET.get("data_profile", "full_data"),
        "agent_last_error": settings.get("agent_last_error"),
    }


def _set_agent_last_error(message: str | None) -> None:
    settings = _communication_settings()
    settings["agent_last_error"] = message
    try:
        _persist_dataset()
    except OSError:
        pass


def _latest_market_snapshot(crop: str) -> dict[str, Any] | None:
    return next((row for row in sorted(DATASET["market_prices"], key=lambda item: item["date"], reverse=True) if row["crop"] == crop), None)


def _open_escalations_for_farmer(farmer_id: str) -> list[dict[str, Any]]:
    disease_case_ids = {row["id"] for row in DATASET.get("disease_logs", []) if row.get("farmer_id") == farmer_id}
    return [
        row
        for row in sorted(DATASET.get("escalations", []), key=lambda item: item["id"], reverse=True)
        if row.get("disease_case_id") in disease_case_ids and row.get("status") != "closed"
    ]


def _recent_thread_for_farmer(farmer_id: str, limit: int = 6) -> list[dict[str, Any]]:
    rows = [row for row in DATASET.get("chat_threads", []) if row.get("farmer_id") == farmer_id]
    rows = sorted(rows, key=lambda item: item["timestamp"])[-limit:]
    return [
        {
            "direction": row.get("direction"),
            "text": row.get("text"),
            "timestamp": row.get("timestamp"),
            "intent": row.get("intent"),
        }
        for row in rows
    ]


def _requested_crop_name(message_text: str, fallback_crop: str) -> str:
    message = message_text.lower()
    for crop_name, reference in CROP_REPLY_REFERENCE.items():
        alias_tokens = [crop_name.lower(), *reference.get("aliases", "").split()]
        if any(token and token in message for token in alias_tokens):
            return crop_name
    return fallback_crop


def _latest_farmer_season(farmer_id: str, crop_name: str) -> dict[str, Any] | None:
    candidates = [
        row
        for row in DATASET.get("crop_seasons", [])
        if row.get("farmer_id") == farmer_id and (not crop_name or row.get("crop_name") == crop_name)
    ]
    if not candidates:
        return None
    latest = sorted(candidates, key=lambda item: (item.get("sowing_date") or "", item.get("expected_harvest") or ""), reverse=True)[0]
    sowing_date = latest.get("sowing_date")
    harvest_date = latest.get("expected_harvest")
    cycle_days = None
    if sowing_date and harvest_date:
        try:
            cycle_days = (date.fromisoformat(harvest_date) - date.fromisoformat(sowing_date)).days
        except ValueError:
            cycle_days = None
    return {
        "crop_name": latest.get("crop_name"),
        "sowing_date": sowing_date,
        "expected_harvest": harvest_date,
        "seed_variety": latest.get("seed_variety"),
        "cycle_days": cycle_days,
    }


def _detect_crop_mismatch(message_text: str, farmer: dict[str, Any]) -> dict[str, Any] | None:
    message = (message_text or "").lower()
    matched_crop = None
    for crop_name, reference in CROP_REPLY_REFERENCE.items():
        alias_tokens = [crop_name.lower(), *reference.get("aliases", "").split()]
        if any(token and token in message for token in alias_tokens):
            matched_crop = crop_name
            break
    if not matched_crop:
        return None
    farmer_crops = set(_farmer_active_crops(farmer.get("id", "")))
    primary = str(farmer.get("primary_crop", "") or "").strip()
    if primary:
        farmer_crops.add(primary)
    if not farmer_crops:
        return None
    if matched_crop in farmer_crops:
        return None
    return {
        "mentioned_crop": matched_crop,
        "farmer_known_crops": sorted(farmer_crops),
    }


def _build_agent_context(farmer: dict[str, Any], target_msg: dict[str, Any]) -> dict[str, Any]:
    profile = _find_communication_profile(farmer["id"]) or {}
    requested_crop = _requested_crop_name(str(target_msg.get("text", "")), farmer["primary_crop"])
    crop_mismatch = _detect_crop_mismatch(str(target_msg.get("text", "")), farmer)
    if crop_mismatch:
        requested_crop = farmer["primary_crop"]
    market = _latest_market_snapshot(farmer["primary_crop"])
    requested_market = _latest_market_snapshot(requested_crop)
    latest_advisory = next(
        (row for row in reversed(DATASET.get("advisory_logs", [])) if row.get("farmer_id") == farmer["id"]),
        None,
    )
    open_demands = [
        {
            "id": row["id"],
            "item_name": row["item_name"],
            "requested_qty": row["requested_qty"],
            "status": row["status"],
        }
        for row in DATASET.get("input_demands", [])
        if row.get("farmer_id") == farmer["id"] and row.get("status") != "issued"
    ][-3:]
    escalations = _open_escalations_for_farmer(farmer["id"])[:3]
    return {
        "farmer": {
            "id": farmer["id"],
            "name": farmer["name"],
            "language": farmer.get("language", "English"),
            "village": farmer.get("village"),
            "crop": farmer.get("primary_crop"),
            "land_size_ha": farmer.get("land_size_ha"),
            "soil_type": farmer.get("soil_type"),
            "irrigation_type": farmer.get("irrigation_type"),
        },
        "communication_profile": {
            "preferred_mode": profile.get("preferred_mode", "text"),
            "whatsapp_opt_in": profile.get("whatsapp_opt_in", True),
        },
        "requested_crop": requested_crop,
        "crop_mismatch": crop_mismatch,
        "ticket": {
            "id": target_msg["id"],
            "intent": target_msg.get("intent"),
            "intents": _message_intents(target_msg),
            "status": target_msg.get("status"),
            "message_text": target_msg.get("text"),
            "created_records": target_msg.get("created_records", {}),
        },
        "market_price": market,
        "requested_crop_market_price": requested_market,
        "active_season": _latest_farmer_season(farmer["id"], requested_crop),
        "crop_reference": CROP_REPLY_REFERENCE.get(requested_crop),
        "latest_advisory": latest_advisory,
        "open_input_demands": open_demands,
        "open_escalations": escalations,
        "recent_thread": _recent_thread_for_farmer(farmer["id"]),
    }


def _extract_openai_text(payload: dict[str, Any]) -> str:
    output_text = str(payload.get("output_text", "")).strip()
    if output_text:
        return output_text
    for item in payload.get("output", []):
        for content in item.get("content", []):
            text = str(content.get("text", "")).strip()
            if text:
                return text
    raise RuntimeError("OpenAI response did not include output text.")


def _call_openai_agent(context: dict[str, Any]) -> str:
    api_key = _agent_api_key()
    if not api_key:
        raise RuntimeError("Agentic mode is enabled, but OPENAI_API_KEY is not configured yet.")

    system_prompt = (
        "You are the digital communication agent for an Indian FPO office. "
        "You are the default responder: every farmer message gets an agent reply. "
        "Only escalate when the office manager/FPO team must step in. "
        "Escalate if: disease/pest/crop-loss, payment or financial dispute, safety issue, "
        "the farmer explicitly asks for a human/manager, or you cannot answer confidently from the supplied context. "
        "Do NOT escalate simple advisory, price, input-request, or acknowledgment messages you can handle. "
        "If context.crop_mismatch is non-null: the farmer mentioned a crop they do NOT grow. "
        "First politely point out the mismatch, name the crop on record (farmer_known_crops), "
        "and ask them to confirm before you give crop-specific advice or prices. "
        "Do NOT answer with information about the mentioned_crop in this case. "
        "Reply: short WhatsApp style, 2-4 sentences, farmer's preferred language, polite, concise. "
        "Use only facts in the context. Do not promise dates/approvals/visits not in context. "
        "Return STRICT JSON only (no prose, no code fences) with shape: "
        '{"reply": "<text>", "escalate": true|false, "category": "disease|payment|safety|manager_request|unknown|none", "reason": "<short>"}'
    )
    user_prompt = (
        "Draft the FPO office reply + escalation decision for the farmer's latest message using this context JSON. "
        "Return JSON only.\n"
        f"{json.dumps(context, ensure_ascii=False)}"
    )
    payload = {
        "model": _agent_model(),
        "input": [
            {"role": "system", "content": [{"type": "input_text", "text": system_prompt}]},
            {"role": "user", "content": [{"type": "input_text", "text": user_prompt}]},
        ],
        "max_output_tokens": 220,
    }
    req = urlrequest.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    try:
        with urlrequest.urlopen(req, timeout=30) as response:
            raw = json.loads(response.read().decode("utf-8"))
    except urlerror.HTTPError as exc:
        try:
            error_body = json.loads(exc.read().decode("utf-8"))
            message = error_body.get("error", {}).get("message") or str(exc)
        except Exception:
            message = str(exc)
        raise RuntimeError(f"OpenAI request failed: {message}") from exc
    except urlerror.URLError as exc:
        raise RuntimeError(f"OpenAI request failed: {exc.reason}") from exc
    return _parse_agent_decision(_extract_openai_text(raw))


ESCALATION_KEYWORDS = {
    "disease": ["disease", "pest", "infection", "fungus", "rot", "wilt", "blight", "रोग", "कीट"],
    "payment": ["payment", "pay", "money", "dispute", "unpaid", "refund", "pending amount", "भुगतान", "पैसा"],
    "safety": ["accident", "injury", "flood", "fire", "snake bite", "emergency", "loss", "damage"],
    "manager_request": ["manager", "officer", "human", "call me", "talk to someone", "अधिकारी"],
}


def _heuristic_escalation(text: str) -> tuple[bool, str, str]:
    lowered = (text or "").lower()
    for category, keywords in ESCALATION_KEYWORDS.items():
        if any(k in lowered for k in keywords):
            return True, category, f"Matched keyword for {category}."
    return False, "none", ""


def _parse_agent_decision(text: str) -> dict[str, Any]:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.strip("`")
        if stripped.lower().startswith("json"):
            stripped = stripped[4:].strip()
    try:
        data = json.loads(stripped)
        reply = str(data.get("reply", "")).strip()
        if not reply:
            raise ValueError("empty reply")
        return {
            "reply": reply,
            "escalate": bool(data.get("escalate", False)),
            "category": str(data.get("category", "none")).strip() or "none",
            "reason": str(data.get("reason", "")).strip(),
        }
    except (ValueError, json.JSONDecodeError):
        return {
            "reply": stripped or "We have received your message and will update you shortly.",
            "escalate": True,
            "category": "unknown",
            "reason": "Agent returned non-JSON output; routed for manual review.",
        }


def _crop_mismatch_clarify_reply(
    farmer: dict[str, Any],
    target_msg: dict[str, Any],
    mismatch: dict[str, Any],
    run: dict[str, Any],
) -> dict[str, Any]:
    known = ", ".join(mismatch.get("farmer_known_crops", []))
    reply_text = (
        f"I see your message mentions {mismatch['mentioned_crop']}, but our records show your crop is {known}. "
        "Can you confirm which crop you mean? I want to share the right details and not act on the wrong crop."
    )
    reply_result = _post_outgoing_chat(farmer, reply_text, message=target_msg, status="pending", agent_generated=True)
    _record_agent_task(
        "agent_intake",
        "Asked farmer to clarify crop mismatch",
        entity_type="message",
        entity_id=target_msg["id"],
        farmer_id=farmer["id"],
        message_id=target_msg["id"],
        detail=f"mentioned={mismatch['mentioned_crop']}; on_record={known}",
        run_id=run["id"] if run else None,
    )
    return {
        **reply_result,
        "message_id": target_msg["id"],
        "reply_text": reply_text,
        "escalate": False,
        "escalation": None,
        "category": "clarification",
        "reason": "Crop mentioned does not match farmer's registered crops.",
        "used_fallback": False,
        "agent_model": _agent_model(),
        "agent_provider": _communication_settings()["agent_provider"],
    }


def _fallback_agent_decision(farmer: dict[str, Any], target_msg: dict[str, Any]) -> dict[str, Any]:
    text = target_msg.get("text", "")
    escalate, category, reason = _heuristic_escalation(text)
    if not escalate and target_msg.get("intent") == "disease_query":
        escalate, category, reason = True, "disease", "Intent classified as disease_query."
    if escalate:
        reply = "We have noted your concern. Our FPO team will follow up with you shortly."
    else:
        reply = f"Hello {farmer.get('name', 'farmer')}, your message is received. Our team will update you with details soon."
    return {"reply": reply, "escalate": escalate, "category": category or "none", "reason": reason}


def _mark_escalation(target_msg: dict[str, Any], decision: dict[str, Any]) -> dict[str, Any]:
    _set_message_status_fields(target_msg, "pending")
    esc = _apply_message_escalation(
        target_msg,
        category=decision.get("category", "unknown"),
        reason=decision.get("reason", ""),
        owner="FPO Manager",
        status="open",
    )
    _append_audit("communication", target_msg["id"], "escalated_by_agent", f"Escalation category: {esc['category']}.")
    return esc


def _handoff_to_human(
    farmer: dict[str, Any],
    target_msg: dict[str, Any],
    *,
    reason: str,
    reply_text: str,
    owner: str = "FPO Admin",
    category: str = "unknown",
    run: dict[str, Any] | None = None,
) -> dict[str, Any]:
    escalation = _apply_message_escalation(target_msg, category=category, reason=reason, owner=owner, status="open")
    reply_result = _post_outgoing_chat(farmer, reply_text, message=target_msg, status="pending", agent_generated=True)
    _record_agent_task(
        "agent_exception",
        "Human approval or review required",
        entity_type="message",
        entity_id=target_msg["id"],
        farmer_id=farmer["id"],
        message_id=target_msg["id"],
        status="pending",
        priority="high",
        requires_human=True,
        detail=reason,
        run_id=run["id"] if run else None,
    )
    return {
        **reply_result,
        "message_id": target_msg["id"],
        "reply_text": reply_text,
        "escalate": True,
        "escalation": escalation,
        "category": category,
        "reason": reason,
        "used_fallback": True,
        "agent_model": _agent_model(),
        "agent_provider": _communication_settings()["agent_provider"],
    }


def _handle_price_query_agentically(farmer: dict[str, Any], target_msg: dict[str, Any], run: dict[str, Any]) -> dict[str, Any]:
    mismatch = _detect_crop_mismatch(str(target_msg.get("text", "")), farmer)
    if mismatch:
        return _crop_mismatch_clarify_reply(farmer, target_msg, mismatch, run)
    crop_name = _requested_crop_name(str(target_msg.get("text", "")), farmer["primary_crop"])
    market = _latest_market_snapshot(crop_name)
    if market:
        reply_text = (
            f"{crop_name} in {market['mandi']} is at INR {market['price_min']} to {market['price_max']} per quintal today. "
            f"Average traded price is INR {market['price_avg']}."
        )
    else:
        reply_text = f"I do not have a fresh mandi snapshot for {crop_name} yet. I will ask the office team to review it."
        return _handoff_to_human(
            farmer,
            target_msg,
            reason=f"No market snapshot found for {crop_name}.",
            reply_text=reply_text,
            owner="Sales User",
            run=run,
        )
    reply_result = _post_outgoing_chat(farmer, reply_text, message=target_msg, status="resolved", agent_generated=True)
    _record_agent_task(
        "agent_intake",
        "Answered market price query",
        entity_type="message",
        entity_id=target_msg["id"],
        farmer_id=farmer["id"],
        message_id=target_msg["id"],
        detail=f"{crop_name} / {market['mandi']}",
        run_id=run["id"],
    )
    return {
        **reply_result,
        "message_id": target_msg["id"],
        "reply_text": reply_text,
        "escalate": False,
        "escalation": None,
        "category": "none",
        "reason": "",
        "used_fallback": False,
        "agent_model": _agent_model(),
        "agent_provider": _communication_settings()["agent_provider"],
    }


def _handle_advisory_agentically(farmer: dict[str, Any], target_msg: dict[str, Any], run: dict[str, Any]) -> dict[str, Any]:
    mismatch = _detect_crop_mismatch(str(target_msg.get("text", "")), farmer)
    if mismatch:
        return _crop_mismatch_clarify_reply(farmer, target_msg, mismatch, run)
    crop_name = _requested_crop_name(str(target_msg.get("text", "")), farmer["primary_crop"])
    season = _latest_farmer_season(farmer["id"], crop_name)
    crop_reference = CROP_REPLY_REFERENCE.get(crop_name) or {}
    days_to_harvest = _days_until((season or {}).get("expected_harvest"))
    cycle_line = crop_reference.get("harvest_cycle") or f"{crop_name} crop cycle is active in the registry."
    advice_line = crop_reference.get("advice") or "Please follow the latest advisory shared by your FPO agronomy team."
    harvest_line = (
        f"Expected harvest is in about {days_to_harvest} days."
        if days_to_harvest is not None
        else "Harvest timing is being tracked from your active season record."
    )
    reply_text = f"{cycle_line} {advice_line} {harvest_line}"
    reply_result = _post_outgoing_chat(farmer, reply_text, message=target_msg, status="resolved", agent_generated=True)
    _record_agent_task(
        "agent_crop_cycle",
        "Shared crop-cycle advisory",
        entity_type="message",
        entity_id=target_msg["id"],
        farmer_id=farmer["id"],
        message_id=target_msg["id"],
        detail=crop_name,
        run_id=run["id"],
    )
    return {
        **reply_result,
        "message_id": target_msg["id"],
        "reply_text": reply_text,
        "escalate": False,
        "escalation": None,
        "category": "none",
        "reason": "",
        "used_fallback": False,
        "agent_model": _agent_model(),
        "agent_provider": _communication_settings()["agent_provider"],
    }


def _handle_disease_query_agentically(farmer: dict[str, Any], target_msg: dict[str, Any], run: dict[str, Any]) -> dict[str, Any]:
    disease_case_id = str(target_msg.get("created_records", {}).get("disease_case_id", "")).strip()
    disease_case = next((row for row in DATASET.get("disease_logs", []) if row["id"] == disease_case_id), None)
    issue = (disease_case or {}).get("predicted_issue") or "Crop-health concern needs field officer review."
    return _handoff_to_human(
        farmer,
        target_msg,
        reason=issue,
        reply_text=(
            "I have flagged this crop-health issue for the field officer. "
            "Please keep the affected crop area available for inspection and avoid a new spray until the officer confirms."
        ),
        owner="Field Officer",
        category="disease",
        run=run,
    )


def _handle_input_request_agentically(farmer: dict[str, Any], target_msg: dict[str, Any], run: dict[str, Any]) -> dict[str, Any]:
    demand_id = str(target_msg.get("created_records", {}).get("input_demand_id", "")).strip()
    demand = next((row for row in DATASET["input_demands"] if row["id"] == demand_id), None)
    if not demand:
        return _handoff_to_human(
            farmer,
            target_msg,
            reason="Input demand record was not created correctly.",
            reply_text="I could not confirm the input request details. The FPO office will review this for you.",
            category=INPUT_REVIEW_ESCALATION_CATEGORY,
            run=run,
        )
    if demand.get("status") == "needs_review" or int(demand.get("trust_score", 0)) < INPUT_AUTONOMY_TRUST_THRESHOLD:
        gaps: list[str] = []
        source_text_lower = str(demand.get("source_text") or target_msg.get("text") or "").lower()
        rationale_items = [str(item) for item in demand.get("trust_rationale", []) if str(item).strip()]
        for entry in rationale_items:
            entry_lower = entry.lower()
            if entry_lower.startswith("item match"):
                if "0/50" in entry_lower or "15/50" in entry_lower:
                    gaps.append("the requested input could not be matched to a specific catalog item")
            elif entry_lower.startswith("qty parse"):
                if "0/30" in entry_lower or "default" in entry_lower:
                    gaps.append("the quantity was not stated in the message, so I cannot guess how much to send")
                elif "20/30" in entry_lower:
                    gaps.append("the quantity unit (bags, kg, packets) was not specified")
            elif entry_lower.startswith("crop context"):
                if (
                    "10/20" in entry_lower
                    and farmer.get("primary_crop")
                    and farmer.get("primary_crop", "").lower() not in source_text_lower
                    and not _crop_is_unambiguous(farmer)
                ):
                    gaps.append(f"the message did not mention {farmer.get('primary_crop')}, so the crop context is unclear")
        if gaps:
            why = "; ".join(gaps)
            reply_text = (
                f"I understood that you may need {demand['item_name']}, but I could not action it because {why}. "
                "The FPO office will confirm with you before actioning the request."
            )
        else:
            reply_text = (
                f"I understood that you may need {demand['item_name']}, but the request details were not strong enough for me to action safely. "
                "The FPO office will confirm with you before actioning the request."
            )
        return _handoff_to_human(
            farmer,
            target_msg,
            reason=f"Input trust {int(demand.get('trust_score', 0))} below threshold {INPUT_AUTONOMY_TRUST_THRESHOLD}.",
            reply_text=reply_text,
            category=INPUT_REVIEW_ESCALATION_CATEGORY,
            run=run,
        )

    item = _find_input(demand["item_id"])
    if not item:
        return _handoff_to_human(
            farmer,
            target_msg,
            reason=f"Item {demand.get('item_id')} was not found in the catalog.",
            reply_text="I could not verify the requested input in the catalog. The office will review it.",
            category=INPUT_REVIEW_ESCALATION_CATEGORY,
            run=run,
        )

    stock_row = _inventory_row(farmer["fpo_id"], item["id"])
    requested_qty = int(demand.get("requested_qty", 0))
    if stock_row and int(stock_row.get("current_stock", 0)) >= requested_qty:
        issue, issue_error = _create_agent_input_issue(
            farmer,
            item,
            requested_qty,
            demand_rows=[demand],
            source_ref=target_msg["id"],
            sync_reply=False,
        )
        if issue_error or not issue:
            return _handoff_to_human(
                farmer,
                target_msg,
                reason=issue_error or "Agent could not issue stock.",
                reply_text="I found stock, but this issue needs office approval before dispatch.",
                category="approval",
                run=run,
            )
        reply_text = (
            f"I found {item['name']} in FPO stock and allotted {requested_qty} units for you. "
            f"Issue reference {issue['id']} has been created and the dispatch is marked from the FPO inventory."
        )
        reply_result = _post_outgoing_chat(farmer, reply_text, message=target_msg, status="resolved", agent_generated=True)
        _record_agent_task(
            "agent_fulfillment",
            "Issued input directly from FPO stock",
            entity_type="input_issue",
            entity_id=issue["id"],
            farmer_id=farmer["id"],
            message_id=target_msg["id"],
            detail=f"{requested_qty} {item['name']}",
            run_id=run["id"],
        )
        return {
            **reply_result,
            "message_id": target_msg["id"],
            "reply_text": reply_text,
            "escalate": False,
            "escalation": None,
            "category": "none",
            "reason": "",
            "used_fallback": False,
            "agent_model": _agent_model(),
            "agent_provider": _communication_settings()["agent_provider"],
        }

    grouped_demands = [
        row
        for row in DATASET["input_demands"]
        if row.get("fpo_id") == demand["fpo_id"]
        and row.get("item_id") == demand["item_id"]
        and row.get("status") in {"captured", "aggregated"}
        and int(row.get("trust_score", 100)) >= INPUT_AUTONOMY_TRUST_THRESHOLD
    ]
    pr, po, approval_required = _create_agent_purchase_request(
        farmer["fpo_id"],
        item,
        grouped_demands or [demand],
        source_ref=target_msg["id"],
    )
    if approval_required:
        _record_agent_task(
            "agent_fulfillment",
            "Raised procurement pending approval",
            entity_type="purchase_request",
            entity_id=pr["id"],
            farmer_id=farmer["id"],
            message_id=target_msg["id"],
            status="pending",
            requires_human=True,
            detail=f"{pr['total_qty']} {item['name']} awaiting approval",
            run_id=run["id"],
        )
        return _handoff_to_human(
            farmer,
            target_msg,
            reason=f"Procurement request {pr['id']} needs human approval.",
            reply_text=(
                f"I captured your {item['name']} request and prepared procurement request {pr['id']}. "
                "It now needs FPO approval because it is above the autonomous approval limit."
            ),
            category="approval",
            run=run,
        )

    reply_text = (
        f"I captured your {item['name']} request and raised procurement order {pr['id']}. "
        f"Purchase order {po['id'] if po else 'is being generated'} is expected by {pr['expected_date']}. "
        "I will confirm again once the stock is received and issued."
    )
    reply_result = _post_outgoing_chat(farmer, reply_text, message=target_msg, status="in_progress", agent_generated=True)
    _record_agent_task(
        "agent_fulfillment",
        "Raised autonomous procurement",
        entity_type="purchase_request",
        entity_id=pr["id"],
        farmer_id=farmer["id"],
        message_id=target_msg["id"],
        detail=f"{pr['total_qty']} {item['name']}",
        run_id=run["id"],
    )
    return {
        **reply_result,
        "message_id": target_msg["id"],
        "reply_text": reply_text,
        "escalate": False,
        "escalation": None,
        "category": "none",
        "reason": "",
        "used_fallback": False,
        "agent_model": _agent_model(),
        "agent_provider": _communication_settings()["agent_provider"],
    }


def _handle_harvest_update_agentically(farmer: dict[str, Any], target_msg: dict[str, Any], run: dict[str, Any]) -> dict[str, Any]:
    mismatch = _detect_crop_mismatch(str(target_msg.get("text", "")), farmer)
    if mismatch:
        return _crop_mismatch_clarify_reply(farmer, target_msg, mismatch, run)
    signal_id = str(target_msg.get("created_records", {}).get("harvest_signal_id", "")).strip()
    signal = next((row for row in DATASET["harvest_signals"] if row["id"] == signal_id), None)
    if not signal:
        return _handoff_to_human(
            farmer,
            target_msg,
            reason="Harvest signal could not be created from the farmer message.",
            reply_text="I could not confirm the harvest readiness details. The FPO office will review it.",
            run=run,
        )
    if signal.get("status") == "needs_review" or int(signal.get("confidence", 0)) < HARVEST_AUTONOMY_CONFIDENCE_THRESHOLD:
        season = _latest_farmer_season(farmer["id"], farmer.get("primary_crop", ""))
        gaps = _harvest_handoff_reasons(str(signal.get("source_text") or target_msg.get("text") or ""), farmer, season)
        if gaps:
            why = "; ".join(gaps)
            reply_text = (
                f"I noted your harvest update but could not auto-plan the pickup because {why}. "
                "The FPO office will confirm the details with you and take it forward."
            )
        else:
            reply_text = (
                "I noted your harvest update but could not auto-plan the pickup because the readiness signals were not strong enough to act on safely. "
                "The FPO office will confirm the details with you and take it forward."
            )
        return _handoff_to_human(
            farmer,
            target_msg,
            reason=f"Harvest readiness confidence {int(signal.get('confidence', 0))} below threshold {HARVEST_AUTONOMY_CONFIDENCE_THRESHOLD}.",
            reply_text=reply_text,
            run=run,
        )

    season = _latest_farmer_season(farmer["id"], signal["crop"])
    days_to_harvest = _days_until((season or {}).get("expected_harvest"))
    if days_to_harvest is not None and days_to_harvest > HARVEST_OUTREACH_WINDOW_DAYS:
        expected = (season or {}).get("expected_harvest")
        signal["status"] = "needs_review"
        return _handoff_to_human(
            farmer,
            target_msg,
            reason=f"Reported readiness conflicts with season record (expected harvest {expected}, {days_to_harvest} days away).",
            reply_text=(
                f"I noted your update, but our records show {signal['crop']} harvest is expected around {expected} "
                f"({days_to_harvest} days away). I do not want to plan an early pickup that could damage produce, "
                "so the FPO field officer will confirm readiness with you before we proceed."
            ),
            owner="Field Officer",
            run=run,
        )

    collection, settlement = _create_agent_collection(
        farmer,
        signal["crop"],
        float(signal.get("estimated_quantity_qtl", 0) or _estimated_harvest_qty_qtl(farmer, signal["crop"])),
        source_ref=signal["id"],
    )
    signal["collection_id"] = collection["id"]
    signal["last_action_at"] = _utc_now()
    _record_agent_task(
        "agent_crop_cycle",
        "Verified harvest and created collection lot",
        entity_type="produce_collection",
        entity_id=collection["id"],
        farmer_id=farmer["id"],
        message_id=target_msg["id"],
        detail=f"{collection['quantity_qtl']} qtl of {collection['crop']}",
        run_id=run["id"],
    )

    buyer_demand = _best_open_buyer_demand(signal["crop"])
    if not buyer_demand:
        reply_text = (
            f"I verified your {signal['crop']} harvest and created collection lot {collection['id']} for about {collection['quantity_qtl']} quintals. "
            "The market agent is now scouting the best open buyer and will update you automatically."
        )
        reply_result = _post_outgoing_chat(farmer, reply_text, message=target_msg, status="in_progress", agent_generated=True)
        return {
            **reply_result,
            "message_id": target_msg["id"],
            "reply_text": reply_text,
            "escalate": False,
            "escalation": None,
            "category": "none",
            "reason": "",
            "used_fallback": False,
            "agent_model": _agent_model(),
            "agent_provider": _communication_settings()["agent_provider"],
        }

    sales_order, allocated_mt, gap_mt, approval_required = _create_agent_sales_order(
        buyer_demand,
        preferred_collection_ids=[collection["id"]],
        source_ref=signal["id"],
    )
    if not sales_order:
        reply_text = (
            f"I verified your {signal['crop']} harvest and logged collection {collection['id']}. "
            "There is no matching buyer slot yet, so the market agent will keep watching demand."
        )
        reply_result = _post_outgoing_chat(farmer, reply_text, message=target_msg, status="in_progress", agent_generated=True)
        return {
            **reply_result,
            "message_id": target_msg["id"],
            "reply_text": reply_text,
            "escalate": False,
            "escalation": None,
            "category": "none",
            "reason": "",
            "used_fallback": False,
            "agent_model": _agent_model(),
            "agent_provider": _communication_settings()["agent_provider"],
        }

    signal["sales_order_id"] = sales_order["id"]
    signal["market_demand_id"] = buyer_demand["id"]
    dispatch = _create_agent_dispatch(sales_order, source_ref=signal["id"])
    if dispatch:
        signal["dispatch_id"] = dispatch["id"]
    _record_agent_task(
        "agent_market",
        "Allocated harvest to market demand",
        entity_type="sales_order",
        entity_id=sales_order["id"],
        farmer_id=farmer["id"],
        message_id=target_msg["id"],
        detail=f"{allocated_mt} MT / buyer {buyer_demand['buyer_name']}",
        run_id=run["id"],
    )

    if approval_required:
        return _handoff_to_human(
            farmer,
            target_msg,
            reason=f"Sales order {sales_order['id']} exceeds the autonomous approval threshold.",
            reply_text=(
                f"I verified your harvest and matched it to buyer {buyer_demand['buyer_name']} under order {sales_order['id']}. "
                "This deal needs FPO approval before dispatch, so the office has been notified."
            ),
            owner="Sales User",
            run=run,
        )

    if dispatch:
        reply_text = (
            f"I verified your harvest, matched it to buyer {buyer_demand['buyer_name']}, and created dispatch {dispatch['id']}. "
            f"Collection {collection['id']} is now moving under sales order {sales_order['id']}."
        )
        message_status = "resolved"
    else:
        reply_text = (
            f"I verified your harvest and matched it to buyer {buyer_demand['buyer_name']} under order {sales_order['id']}. "
            "Dispatch will be raised automatically next."
        )
        message_status = "in_progress"
    reply_result = _post_outgoing_chat(farmer, reply_text, message=target_msg, status=message_status, agent_generated=True)
    return {
        **reply_result,
        "message_id": target_msg["id"],
        "reply_text": reply_text,
        "escalate": False,
        "escalation": None,
        "category": "none",
        "reason": "",
        "used_fallback": False,
        "agent_model": _agent_model(),
        "agent_provider": _communication_settings()["agent_provider"],
    }


def _handle_multi_intent_agentically(farmer: dict[str, Any], target_msg: dict[str, Any], run: dict[str, Any]) -> dict[str, Any]:
    mismatch = _detect_crop_mismatch(str(target_msg.get("text", "")), farmer)
    if mismatch:
        return _crop_mismatch_clarify_reply(farmer, target_msg, mismatch, run)
    intents = _message_intents(target_msg)
    ordered_handlers = [
        ("input_request", _handle_input_request_agentically),
        ("harvest_update", _handle_harvest_update_agentically),
        ("price_query", _handle_price_query_agentically),
        ("advisory", _handle_advisory_agentically),
        ("disease_query", _handle_disease_query_agentically),
    ]
    results: list[dict[str, Any]] = []
    for intent, handler in ordered_handlers:
        if intent in intents:
            results.append(handler(farmer, target_msg, run))

    if not results:
        return _handle_general_query_agentically(farmer, target_msg, run)

    reply_parts = [str(result.get("reply_text", "")).strip() for result in results if str(result.get("reply_text", "")).strip()]
    escalations = [result.get("escalation") for result in results if result.get("escalation")]
    return {
        **results[-1],
        "message_id": target_msg["id"],
        "reply_text": " ".join(reply_parts),
        "escalate": any(bool(result.get("escalate")) for result in results),
        "escalations": escalations,
        "category": "multi_intent",
        "reason": "; ".join(str(result.get("reason", "")).strip() for result in results if str(result.get("reason", "")).strip()),
        "used_fallback": any(bool(result.get("used_fallback")) for result in results),
        "handled_intents": intents,
    }


def _handle_general_query_agentically(farmer: dict[str, Any], target_msg: dict[str, Any], run: dict[str, Any]) -> dict[str, Any]:
    context = _build_agent_context(farmer, target_msg)
    used_fallback = False
    mismatch = context.get("crop_mismatch")
    if mismatch:
        known = ", ".join(mismatch.get("farmer_known_crops", []))
        decision = {
            "reply": (
                f"I see your message mentions {mismatch['mentioned_crop']}, but our records show your crop is {known}. "
                "Can you confirm which crop you mean? I want to share the right details and not act on the wrong crop."
            ),
            "escalate": False,
            "category": "none",
            "reason": "Crop mentioned does not match farmer's registered crops.",
        }
    elif _agent_api_key():
        try:
            decision = _call_openai_agent(context)
            _set_agent_last_error(None)
        except RuntimeError as exc:
            _set_agent_last_error(str(exc))
            decision = _fallback_agent_decision(farmer, target_msg)
            used_fallback = True
    else:
        decision = _fallback_agent_decision(farmer, target_msg)
        used_fallback = True

    reply_text = decision["reply"].strip()
    if not reply_text:
        raise RuntimeError("Agent returned an empty reply.")

    escalation = None
    if decision.get("escalate"):
        escalation = _mark_escalation(target_msg, decision)
        chat_id = _next_id("CHAT", DATASET["chat_threads"])
        DATASET["chat_threads"].append({
            "id": chat_id,
            "farmer_id": farmer["id"],
            "farmer_name": farmer["name"],
            "direction": "outgoing",
            "intent": target_msg.get("intent", "office_reply"),
            "severity": "HIGH",
            "status": "sent",
            "message_id": target_msg["id"],
            "text": reply_text,
            "timestamp": _utc_now(),
            "agent_generated": True,
        })
        reply_result = {"chat_id": chat_id, "resolved_message_id": None}
    else:
        _clear_message_escalation(target_msg)
        reply_result = _post_outgoing_chat(farmer, reply_text, message=target_msg, status="resolved", agent_generated=True)

    return {
        **reply_result,
        "message_id": target_msg["id"],
        "reply_text": reply_text,
        "escalate": bool(decision.get("escalate")),
        "escalation": escalation,
        "category": decision.get("category", "none"),
        "reason": decision.get("reason", ""),
        "agent_model": _agent_model(),
        "agent_provider": _communication_settings()["agent_provider"],
        "used_fallback": used_fallback,
    }


def _generate_agent_reply(message_id: str) -> dict[str, Any]:
    target_msg = next((row for row in DATASET["message_logs"] if row["id"] == message_id), None)
    if not target_msg:
        raise ValueError("message not found")
    if _message_has_agent_reply(message_id):
        raise ValueError("message already has an agent-generated reply")
    farmer = _find_farmer(target_msg["farmer_id"])
    if not farmer:
        raise ValueError("Invalid farmer_id")

    run = _start_agent_run("incoming_message", "agent_intake", farmer_id=farmer["id"], message_id=message_id)
    intents = _message_intents(target_msg)
    intent = str(target_msg.get("intent") or "").strip() or intents[0]
    _record_agent_task(
        "agent_intake",
        "Classified incoming farmer message",
        entity_type="message",
        entity_id=target_msg["id"],
        farmer_id=farmer["id"],
        message_id=target_msg["id"],
        detail=f"intent={intent}; intents={', '.join(intents)}",
        run_id=run["id"],
    )

    if len([item for item in intents if item != "general_query"]) > 1 or intent == "multi_intent":
        result = _handle_multi_intent_agentically(farmer, target_msg, run)
    elif "input_request" in intents:
        result = _handle_input_request_agentically(farmer, target_msg, run)
    elif "harvest_update" in intents:
        result = _handle_harvest_update_agentically(farmer, target_msg, run)
    elif "price_query" in intents:
        result = _handle_price_query_agentically(farmer, target_msg, run)
    elif "advisory" in intents:
        result = _handle_advisory_agentically(farmer, target_msg, run)
    elif "disease_query" in intents:
        result = _handle_disease_query_agentically(farmer, target_msg, run)
    else:
        result = _handle_general_query_agentically(farmer, target_msg, run)

    _append_audit(
        "communication",
        message_id,
        "agent_reply",
        f"Agent reply; intents={', '.join(intents)}; escalate={result.get('escalate')}.",
    )
    _finish_agent_run(
        run,
        summary=result["reply_text"],
        actions=[result["reply_text"]],
        human_handoffs=1 if result.get("escalate") else 0,
        approvals=1 if "approval" in str(result.get("reason", "")).lower() else 0,
    )
    _persist_dataset_safe()
    return result


def _find_carbon_project(project_id: str) -> dict[str, Any] | None:
    return next((p for p in DATASET["carbon_projects"] if p["id"] == project_id), None)


def _carbon_readiness_for_fpo(fpo_id: str) -> dict[str, float]:
    farmers = [f for f in DATASET["farmers"] if f["fpo_id"] == fpo_id]
    plots = [p for p in DATASET["plots"] if p["fpo_id"] == fpo_id]
    practices = [p for p in DATASET["carbon_practices"] if p["fpo_id"] == fpo_id]

    practice_farmer_ids = {p["farmer_id"] for p in practices}
    farmer_participation = round((len(practice_farmer_ids) / max(1, len(farmers))) * 100, 2)

    plot_area = sum(float(p.get("area_ha", 0)) for p in plots)
    practice_area = sum(float(p.get("area_ha", 0)) for p in practices)
    plot_coverage = round((practice_area / max(0.01, plot_area)) * 100, 2)

    expected_practices = max(1, len(farmers))
    practice_completeness = round((len(practices) / expected_practices) * 100, 2)

    verification_readiness = round((plot_coverage * 0.35) + (practice_completeness * 0.35) + (farmer_participation * 0.30), 2)
    return {
        "plot_coverage_pct": min(100.0, plot_coverage),
        "practice_completeness_pct": min(100.0, practice_completeness),
        "farmer_participation_pct": min(100.0, farmer_participation),
        "verification_readiness_pct": min(100.0, verification_readiness),
    }


def _enrich_carbon_project(project: dict[str, Any]) -> dict[str, Any]:
    readiness = _carbon_readiness_for_fpo(project["fpo_id"])
    return {**project, **readiness}


def _upsert_inventory(fpo_id: str, item_id: str, item_name: str, qty: int, reference_id: str, txn_type: str) -> None:
    DATASET["inventory_transactions"].append(
        {
            "id": _next_id("INV", DATASET["inventory_transactions"]),
            "fpo_id": fpo_id,
            "item_id": item_id,
            "item_name": item_name,
            "txn_type": txn_type,
            "qty": qty,
            "reference_id": reference_id,
            "txn_date": date.today().isoformat(),
        }
    )
    row = next((s for s in DATASET["inventory_snapshot"] if s["fpo_id"] == fpo_id and s["item_id"] == item_id), None)
    if not row:
        row = {
            "id": _next_id("INVST", DATASET["inventory_snapshot"]),
            "fpo_id": fpo_id,
            "item_id": item_id,
            "item_name": item_name,
            "current_stock": 0,
            "reorder_threshold": 30,
            "stock_status": "low",
        }
        DATASET["inventory_snapshot"].append(row)
    if txn_type == "stock_in":
        row["current_stock"] += max(0, qty)
    else:
        row["current_stock"] -= max(0, qty)
    row["current_stock"] = max(0, row["current_stock"])
    row["stock_status"] = "low" if row["current_stock"] < row["reorder_threshold"] else "healthy"


def _select_demands_for_pr(fpo_id: str, item_id: str, demand_ids: list[str] | None = None) -> list[dict[str, Any]]:
    if demand_ids:
        id_set = {str(i) for i in demand_ids}
        rows = [
            d
            for d in DATASET["input_demands"]
            if d["id"] in id_set and d["fpo_id"] == fpo_id and d["item_id"] == item_id and d["status"] in {"captured", "aggregated"}
        ]
        rows.sort(key=lambda d: d["request_date"])
        return rows
    rows = [
        d
        for d in DATASET["input_demands"]
        if d["fpo_id"] == fpo_id and d["item_id"] == item_id and d["status"] in {"captured", "aggregated"}
    ]
    rows.sort(key=lambda d: d["request_date"])
    return rows


def _mark_demands_status(demand_ids: list[str], status: str) -> None:
    id_set = {str(i) for i in demand_ids}
    for row in DATASET["input_demands"]:
        if row["id"] not in id_set:
            continue
        row["status"] = status
        if status == "aggregated":
            row["aggregated_at"] = _utc_now()
        if status == "procured":
            row["procured_at"] = _utc_now()


def _build_inventory_ledger_row(item: dict[str, Any], txn_type: str, qty: int, reference_id: str) -> dict[str, Any]:
    return {
        "id": _next_id("INV", DATASET["inventory_transactions"]),
        "fpo_id": item["fpo_id"],
        "item_id": item["item_id"],
        "item_name": item["item_name"],
        "txn_type": txn_type,
        "qty": qty,
        "reference_id": reference_id,
        "txn_date": date.today().isoformat(),
    }


def _create_settlement_from_collection(collection: dict[str, Any], sales_order: dict[str, Any] | None = None) -> dict[str, Any]:
    existing = _find_settlement_by_collection(collection["id"])
    if existing:
        if sales_order and not existing.get("sales_order_id"):
            existing["sales_order_id"] = sales_order["id"]
        return existing

    market_price = next(
        (
            row["price_avg"]
            for row in sorted(DATASET["market_prices"], key=lambda i: i["date"], reverse=True)
            if row["crop"] == collection["crop"]
        ),
        1800.0,
    )
    rate = float(sales_order["price"]) if sales_order else float(market_price)
    gross = round(rate * float(collection["quantity_qtl"]), 2)
    deductions = round(gross * 0.025, 2)
    settlement = {
        "id": _next_id("SET", DATASET["settlements"]),
        "collection_id": collection["id"],
        "sales_order_id": sales_order["id"] if sales_order else None,
        "farmer_id": collection["farmer_id"],
        "crop": collection["crop"],
        "gross_amount": gross,
        "deductions": deductions,
        "net_amount": round(gross - deductions, 2),
        "payment_status": "pending",
        "payment_date": None,
    }
    DATASET["settlements"].append(settlement)
    _append_audit("settlement", settlement["id"], "generated", f"Generated from collection {collection['id']}.")
    return settlement


def _best_supplier_for_item(item_id: str) -> dict[str, Any] | None:
    suppliers = sorted(DATASET.get("suppliers", []), key=lambda row: (int(row.get("lead_time_days", 99)), str(row.get("name", ""))))
    return suppliers[0] if suppliers else None


def _should_auto_approve_pr(item: dict[str, Any], total_qty: int) -> bool:
    approx_value = float(total_qty) * float(item.get("base_rate", 0))
    return total_qty <= PR_AUTO_APPROVAL_QTY and approx_value <= PR_AUTO_APPROVAL_VALUE


def _latest_collection_for_farmer_crop(farmer_id: str, crop: str) -> dict[str, Any] | None:
    rows = [
        row
        for row in DATASET.get("produce_collections", [])
        if row.get("farmer_id") == farmer_id and row.get("crop") == crop
    ]
    if not rows:
        return None
    rows.sort(key=lambda row: row.get("date", ""), reverse=True)
    return rows[0]


def _create_agent_purchase_request(
    fpo_id: str,
    item: dict[str, Any],
    demand_rows: list[dict[str, Any]],
    *,
    source_ref: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any] | None, bool]:
    total_qty = sum(int(row.get("requested_qty", 0)) for row in demand_rows)
    supplier = _best_supplier_for_item(item["id"])
    if not supplier:
        raise ValueError("No supplier available for the requested item.")
    existing = next(
        (
            row
            for row in DATASET["purchase_requests"]
            if row.get("fpo_id") == fpo_id
            and row.get("item_id") == item["id"]
            and row.get("approval_status") in {"pending", "approved"}
            and row.get("source") == "agent"
        ),
        None,
    )
    if existing:
        existing_ids = {str(i) for i in existing.get("input_demand_ids", [])}
        new_ids = [row["id"] for row in demand_rows if row["id"] not in existing_ids]
        if new_ids:
            existing["input_demand_ids"] = [*existing.get("input_demand_ids", []), *new_ids]
            existing["total_qty"] = int(existing.get("total_qty", 0)) + sum(
                int(row.get("requested_qty", 0)) for row in demand_rows if row["id"] in set(new_ids)
            )
        if existing.get("approval_status") == "approved":
            if new_ids:
                _mark_demands_status(new_ids, "procured")
                for demand in demand_rows:
                    if demand["id"] in set(new_ids):
                        _sync_message_from_demand(demand)
            po = _create_purchase_order_from_pr(existing)
            return existing, po, False
        if new_ids:
            _mark_demands_status(new_ids, "aggregated")
            for demand in demand_rows:
                if demand["id"] in set(new_ids):
                    _sync_message_from_demand(demand)
        return existing, None, True

    approval_required = not _should_auto_approve_pr(item, total_qty)
    pr = {
        "id": _next_id("PR", DATASET["purchase_requests"]),
        "fpo_id": fpo_id,
        "item_id": item["id"],
        "item_name": item["name"],
        "total_qty": total_qty,
        "supplier_id": supplier["id"],
        "supplier_name": supplier["name"],
        "approval_status": "pending" if approval_required else "approved",
        "input_demand_ids": [row["id"] for row in demand_rows],
        "expected_date": (date.today() + timedelta(days=int(supplier.get("lead_time_days", 4)))).isoformat(),
        "source": "agent",
        "source_ref": source_ref,
        "created_by_agent": True,
    }
    DATASET["purchase_requests"].append(pr)
    _append_audit("purchase_request", pr["id"], "agent_created", f"Agent raised PR for {pr['item_name']} ({total_qty}).")
    if approval_required:
        _mark_demands_status(pr["input_demand_ids"], "aggregated")
        for demand in demand_rows:
            _sync_message_from_demand(demand)
        _append_approval(
            "purchase_request",
            "purchase_request",
            pr["id"],
            "Agent-created PR awaiting human approval.",
            requested_by="Input Fulfillment Agent",
            amount=float(total_qty) * float(item.get("base_rate", 0)),
        )
        return pr, None, True

    po = _apply_purchase_request_decision(pr, "approved")
    return pr, po, False


def _create_agent_goods_receipt(po: dict[str, Any], *, source_ref: str | None = None) -> dict[str, Any]:
    existing = next((row for row in DATASET["goods_receipts"] if row["po_id"] == po["id"]), None)
    if existing:
        return existing
    damaged_qty = max(0, min(2, int(round(float(po.get("qty_ordered", 0)) * 0.02))))
    qty_received = max(1, int(po.get("qty_ordered", 0)) - damaged_qty)
    grn = {
        "id": _next_id("GRN", DATASET["goods_receipts"]),
        "po_id": po["id"],
        "fpo_id": po["fpo_id"],
        "item_id": po["item_id"],
        "item_name": po["item_name"],
        "qty_received": qty_received,
        "damaged_qty": damaged_qty,
        "receipt_date": date.today().isoformat(),
        "source": "agent",
        "source_ref": source_ref,
        "created_by_agent": True,
    }
    DATASET["goods_receipts"].append(grn)
    po["delivery_status"] = "received"
    _upsert_inventory(po["fpo_id"], po["item_id"], po["item_name"], max(0, qty_received - damaged_qty), grn["id"], "stock_in")
    _append_audit("goods_receipt", grn["id"], "agent_created", f"Agent received PO {po['id']} into inventory.")
    return grn


def _create_agent_input_issue(
    farmer: dict[str, Any],
    item: dict[str, Any],
    qty_issued: int,
    *,
    demand_rows: list[dict[str, Any]] | None = None,
    source_ref: str | None = None,
    sync_reply: bool = True,
) -> tuple[dict[str, Any] | None, str | None]:
    if qty_issued >= INPUT_ISSUE_APPROVAL_QTY:
        return None, "Issue quantity requires human approval."
    stock_row = _inventory_row(farmer["fpo_id"], item["id"])
    if not stock_row or int(stock_row.get("current_stock", 0)) < qty_issued:
        return None, "Insufficient stock."
    linked_demands = demand_rows or [
        row
        for row in DATASET["input_demands"]
        if row["farmer_id"] == farmer["id"] and row["item_id"] == item["id"] and row["status"] in {"captured", "aggregated", "procured"}
    ]
    issue = {
        "id": _next_id("ISSUE", DATASET["farmer_input_issues"]),
        "farmer_id": farmer["id"],
        "fpo_id": farmer["fpo_id"],
        "item_id": item["id"],
        "item_name": item["name"],
        "qty_issued": qty_issued,
        "issue_date": date.today().isoformat(),
        "acknowledged": True,
        "approval_status": "not_required",
        "source": "agent",
        "source_ref": source_ref,
        "created_by_agent": True,
    }
    DATASET["farmer_input_issues"].append(issue)
    _upsert_inventory(farmer["fpo_id"], item["id"], item["name"], qty_issued, issue["id"], "stock_out")
    for row in linked_demands:
        row["status"] = "issued"
        issue_ids = row.setdefault("issue_ids", [])
        if issue["id"] not in issue_ids:
            issue_ids.append(issue["id"])
        if sync_reply:
            _sync_message_from_demand(
                row,
                reply_text=f"I have allotted {qty_issued} {item['name']} for you and marked it for dispatch from the FPO stock.",
            )
        else:
            _sync_message_from_demand(row)
    _append_audit("input_issue", issue["id"], "agent_created", f"Agent issued {qty_issued} of {item['name']} to {farmer['id']}.")
    return issue, None


def _create_agent_collection(
    farmer: dict[str, Any],
    crop: str,
    quantity_qtl: float,
    *,
    grade: str = "B",
    collection_center: str | None = None,
    source_ref: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    existing = next(
        (
            row
            for row in DATASET["produce_collections"]
            if row.get("source") == "agent" and row.get("source_ref") == source_ref and source_ref
        ),
        None,
    )
    if existing:
        return existing, _create_settlement_from_collection(existing, None)
    collection = {
        "id": _next_id("COLL", DATASET["produce_collections"]),
        "farmer_id": farmer["id"],
        "farmer_name": farmer["name"],
        "fpo_id": farmer["fpo_id"],
        "crop": crop,
        "grade": grade.upper(),
        "quantity_qtl": round(quantity_qtl, 2),
        "collection_center": collection_center or f"{farmer['village']} Center",
        "date": date.today().isoformat(),
        "moisture_pct": 11.5,
        "status": "graded",
        "sales_order_id": None,
        "source": "agent",
        "source_ref": source_ref,
        "created_by_agent": True,
    }
    DATASET["produce_collections"].append(collection)
    settlement = _create_settlement_from_collection(collection, None)
    _append_audit("produce_collection", collection["id"], "agent_created", f"Agent created collection for {crop}.")
    return collection, settlement


def _create_agent_sales_order(
    buyer_demand: dict[str, Any],
    *,
    preferred_collection_ids: list[str] | None = None,
    source_ref: str | None = None,
) -> tuple[dict[str, Any] | None, float, float, bool]:
    buyer = _find_buyer(str(buyer_demand.get("buyer_id", "")))
    if not buyer:
        return None, 0.0, float(buyer_demand.get("quantity_mt", 0)), False
    open_qty_mt = _open_quantity_for_buyer_demand(buyer_demand)
    if open_qty_mt <= 0:
        return None, 0.0, 0.0, False

    preferred_ids = {str(i) for i in (preferred_collection_ids or [])}
    selected_collections = [
        row
        for row in DATASET["produce_collections"]
        if row.get("crop") == buyer_demand["crop"] and not row.get("sales_order_id") and row.get("status") in {"graded", "allocated_to_order"}
    ]
    selected_collections.sort(
        key=lambda row: (0 if row["id"] in preferred_ids else 1, row.get("date", ""))
    )

    allocated_qtl = 0.0
    used_collections: list[dict[str, Any]] = []
    for collection in selected_collections:
        used_collections.append(collection)
        allocated_qtl += float(collection.get("quantity_qtl", 0))
        if allocated_qtl / 10.0 >= open_qty_mt:
            break
    allocated_mt = round(allocated_qtl / 10.0, 2)
    if allocated_mt <= 0:
        return None, 0.0, open_qty_mt, False

    approval_required = allocated_mt >= SALES_ORDER_APPROVAL_QTY
    so = {
        "id": _next_id("SO", DATASET["sales_orders"]),
        "buyer_id": buyer["id"],
        "buyer_name": buyer["name"],
        "buyer_demand_id": buyer_demand["id"],
        "crop": buyer_demand["crop"],
        "quantity_mt": allocated_mt,
        "price": float(buyer_demand["offered_price"]),
        "dispatch_date": date.today().isoformat(),
        "status": "draft" if approval_required else "confirmed",
        "payment_status": "pending",
        "approval_status": "pending" if approval_required else "not_required",
        "settlement_release_status": "not_required",
        "collection_ids": [row["id"] for row in used_collections],
        "dispatch_ids": [],
        "created_date": date.today().isoformat(),
        "source": "agent",
        "source_ref": source_ref,
        "created_by_agent": True,
    }
    DATASET["sales_orders"].append(so)
    for collection in used_collections:
        collection["sales_order_id"] = so["id"]
        collection["status"] = "allocated_to_order"
        settlement = _find_settlement_by_collection(collection["id"])
        if settlement:
            settlement["sales_order_id"] = so["id"]

    remaining = _open_quantity_for_buyer_demand(buyer_demand)
    buyer_demand["status"] = "closed" if remaining <= 0 else "matched"

    if approval_required:
        _append_approval(
            "sales_order",
            "sales_order",
            so["id"],
            "Agent-created sales order awaiting approval.",
            requested_by="Market Allocation Agent",
            amount=allocated_mt,
        )
    _append_audit("sales_order", so["id"], "agent_created", f"Agent created sales order from {len(used_collections)} collections.")
    return so, allocated_mt, round(max(0.0, open_qty_mt - allocated_mt), 2), approval_required


def _create_agent_dispatch(sales_order: dict[str, Any], *, source_ref: str | None = None) -> dict[str, Any] | None:
    if sales_order.get("approval_status") == "pending":
        return None
    existing = next((row for row in DATASET["dispatches"] if row.get("sales_order_id") == sales_order["id"]), None)
    if existing:
        return existing
    suffix = _id_suffix(_next_id("DSP", DATASET["dispatches"]))
    dispatch = {
        "id": _next_id("DSP", DATASET["dispatches"]),
        "sales_order_id": sales_order["id"],
        "vehicle_no": f"MH-14-{suffix:04d}",
        "qty_dispatched_mt": round(float(sales_order.get("quantity_mt", 0)), 2),
        "dispatch_date": date.today().isoformat(),
        "delivery_status": "on_time",
        "source": "agent",
        "source_ref": source_ref,
        "created_by_agent": True,
    }
    DATASET["dispatches"].append(dispatch)
    if dispatch["id"] not in sales_order["dispatch_ids"]:
        sales_order["dispatch_ids"].append(dispatch["id"])
    sales_order["status"] = "dispatched"
    sales_order["dispatch_date"] = dispatch["dispatch_date"]
    _append_audit("dispatch", dispatch["id"], "agent_created", f"Agent created dispatch for order {sales_order['id']}.")
    return dispatch


def _create_farmer(payload: dict[str, Any]) -> tuple[dict[str, Any] | None, str | None]:
    required = ["fpo_id", "name", "village", "primary_crop"]
    missing = [field for field in required if not payload.get(field)]
    if missing:
        return None, f"Missing required fields: {', '.join(missing)}"
    fpo = _find_fpo(str(payload["fpo_id"]))
    if not fpo:
        return None, "Invalid fpo_id."

    farmer_id = _next_id("FARM", DATASET["farmers"])
    farmer = {
        "id": farmer_id,
        "fpo_id": fpo["id"],
        "fpo_name": fpo["name"],
        "name": payload["name"],
        "village": payload["village"],
        "land_size_ha": round(float(payload.get("land_size_ha", 2.2)), 2),
        "irrigation_type": payload.get("irrigation_type", "Drip"),
        "soil_type": payload.get("soil_type", "Loam"),
        "primary_crop": payload["primary_crop"],
        "phone": payload.get("phone", f"+91-90000{_id_suffix(farmer_id):05d}"),
        "language": payload.get("language", "Marathi"),
    }
    DATASET["farmers"].append(farmer)
    fpo["members_count"] += 1
    existing_village = next((row for row in DATASET.get("villages", []) if row.get("name") == farmer["village"]), None)
    if not existing_village:
        DATASET.setdefault("villages", []).append(
            {
                "id": _next_id("VI", DATASET["villages"]),
                "district_id": fpo.get("district_id"),
                "name": farmer["village"],
            }
        )
    DATASET["communication_profiles"].append(
        {
            "farmer_id": farmer["id"],
            "language": farmer["language"],
            "preferred_mode": payload.get("preferred_mode", "text"),
            "whatsapp_opt_in": bool(payload.get("whatsapp_opt_in", True)),
        }
    )
    plot_id = _next_id("PLOT", DATASET["plots"])
    DATASET["plots"].append(
        {
            "id": plot_id,
            "farmer_id": farmer["id"],
            "fpo_id": farmer["fpo_id"],
            "crop_current": farmer["primary_crop"],
            "area_ha": farmer["land_size_ha"],
            "soil_type": farmer["soil_type"],
            "irrigation_source": farmer["irrigation_type"],
            "polygon": [],
        }
    )
    DATASET["crop_seasons"].append(
        {
            "id": _next_id("SEASON", DATASET["crop_seasons"]),
            "plot_id": plot_id,
            "farmer_id": farmer["id"],
            "fpo_id": farmer["fpo_id"],
            "crop_name": farmer["primary_crop"],
            "sowing_date": (date.today() - timedelta(days=30)).isoformat(),
            "expected_harvest": (date.today() + timedelta(days=80)).isoformat(),
            "seed_variety": payload.get("seed_variety", f"{farmer['primary_crop']} Variety 1"),
        }
    )
    _append_audit("farmer", farmer["id"], "created", f"Farmer {farmer['name']} created.")
    return farmer, None


def _create_purchase_order_from_pr(pr: dict[str, Any]) -> dict[str, Any]:
    existing = next((row for row in DATASET["purchase_orders"] if row["pr_id"] == pr["id"]), None)
    if existing:
        return existing
    input_item = _find_input(pr["item_id"])
    po = {
        "id": _next_id("PO", DATASET["purchase_orders"]),
        "fpo_id": pr["fpo_id"],
        "pr_id": pr["id"],
        "supplier_id": pr["supplier_id"],
        "item_id": pr["item_id"],
        "item_name": pr["item_name"],
        "qty_ordered": int(pr["total_qty"]),
        "rate": int((input_item or {}).get("base_rate", 1000)),
        "delivery_status": "in_transit",
        "order_date": date.today().isoformat(),
        "source": pr.get("source", "manual"),
        "source_ref": pr.get("source_ref"),
        "created_by_agent": bool(pr.get("created_by_agent")),
    }
    DATASET["purchase_orders"].append(po)
    _append_audit("purchase_order", po["id"], "created", f"PO from {pr['id']}")
    return po


def _apply_purchase_request_decision(pr: dict[str, Any], decision: str) -> dict[str, Any] | None:
    pr["approval_status"] = decision
    if decision == "approved":
        po = _create_purchase_order_from_pr(pr)
        if pr.get("input_demand_ids"):
            demand_id_set = {str(i) for i in pr["input_demand_ids"]}
            _mark_demands_status(list(demand_id_set), "procured")
            for demand in DATASET["input_demands"]:
                if demand["id"] in demand_id_set:
                    _sync_message_from_demand(demand)
        return po

    if pr.get("input_demand_ids"):
        demand_id_set = {str(i) for i in pr["input_demand_ids"]}
        for demand in DATASET["input_demands"]:
            if demand["id"] in demand_id_set:
                demand["status"] = "captured"
                _sync_message_from_demand(demand)
    return None


def _set_sales_order_approval_status(so: dict[str, Any], decision: str) -> None:
    so["approval_status"] = decision
    if decision == "approved" and so.get("status") == "draft":
        so["status"] = "confirmed"
    elif decision == "rejected" and so.get("status") == "confirmed":
        so["status"] = "draft"


def _set_input_issue_approval_status(issue_id: str, decision: str) -> None:
    issue = next((row for row in DATASET["farmer_input_issues"] if row["id"] == issue_id), None)
    if issue:
        issue["approval_status"] = decision


def _apply_settlement_release_decision(sales_order_id: str, decision: str) -> int:
    sales_order = _find_sales_order(sales_order_id)
    if not sales_order:
        return 0

    sales_order["settlement_release_status"] = decision
    if decision != "approved":
        return 0

    paid_count = 0
    for settlement in DATASET["settlements"]:
        if settlement.get("sales_order_id") != sales_order_id or settlement.get("payment_status") == "paid":
            continue
        settlement["payment_status"] = "paid"
        settlement["payment_date"] = date.today().isoformat()
        collection = _find_collection(str(settlement.get("collection_id", "")))
        if collection:
            collection["status"] = "settled"
        paid_count += 1
    return paid_count


def _sales_order_payment_blocker(so: dict[str, Any]) -> str | None:
    approval_status = str(so.get("approval_status", "")).strip().lower()
    if approval_status == "pending":
        return "Sales order approval is still pending."
    if approval_status == "rejected":
        return "Rejected sales orders cannot be marked paid."
    if not _find_dispatch_for_sales_order(str(so.get("id", ""))):
        return "Dispatch must be created before buyer payment can be recorded."
    return None


def _settlement_release_blocker(settlement: dict[str, Any]) -> str | None:
    sales_order_id = str(settlement.get("sales_order_id", "")).strip()
    if not sales_order_id:
        return None
    sales_order = _find_sales_order(sales_order_id)
    if not sales_order:
        return None
    if str(sales_order.get("payment_status", "")).strip().lower() != "received":
        return "Buyer payment must be received before farmer settlement can be released."
    release_status = str(sales_order.get("settlement_release_status", "not_required")).strip().lower()
    if release_status == "pending":
        return "Settlement release approval is still pending for this sales order."
    if release_status == "rejected":
        return "Settlement release was rejected for this sales order."
    return None


def _ensure_chat_threads() -> None:
    # chat_threads is now seeded by generate_dataset; this is a no-op guard.
    if "chat_threads" not in DATASET:
        DATASET["chat_threads"] = []


def _score_input_demand(text: str, farmer: dict[str, Any]) -> dict[str, Any]:
    """Compute trust score for auto-created input demand from farmer chat.

    Score = weighted match of: item (50), qty (30), crop context (20).
    Returns matched item, qty, score (0-100), and a rationale list.
    """
    lower = (text or "").lower()
    catalog = DATASET.get("inputs_catalog", [])
    matched_item = None
    item_score = 0
    for candidate in catalog:
        name = candidate.get("name", "").lower()
        if not name:
            continue
        if name in lower:
            matched_item = candidate
            item_score = 50
            break
    if not matched_item:
        keyword_map = {"urea": "Urea", "dap": "DAP", "seed": None, "fertilizer": None, "bag": None, "pesticide": None}
        for key, target_name in keyword_map.items():
            if key in lower:
                if target_name:
                    matched_item = next((c for c in catalog if c.get("name") == target_name), None)
                if matched_item:
                    item_score = 35
                    break
                item_score = 15
                break
    if not matched_item and catalog:
        matched_item = catalog[0]

    qty_match = re.search(r"(\d+)\s*(bag|bags|kg|unit|units|packet|packets)?", lower)
    if qty_match:
        qty = int(qty_match.group(1))
        qty_score = 30 if qty_match.group(2) else 20
    else:
        qty = 4
        qty_score = 0

    crop_score = 20 if farmer.get("primary_crop", "").lower() in lower else 10

    total = item_score + qty_score + crop_score
    rationale = []
    rationale.append(f"item match {item_score}/50" + (f" ({matched_item.get('name')})" if matched_item else ""))
    rationale.append(f"qty parse {qty_score}/30" + (f" (={qty})" if qty_match else " (default)"))
    rationale.append(f"crop context {crop_score}/20")
    return {"item": matched_item, "qty": qty, "score": total, "rationale": rationale}


def _infer_intents(text: str) -> list[str]:
    message = text.lower()
    intents: list[str] = []
    if any(key in message for key in ["price", "rate", "mandi"]):
        intents.append("price_query")
    if any(key in message for key in ["need", "urea", "dap", "seed", "fertilizer", "bag"]):
        intents.append("input_request")
    if any(key in message for key in ["disease", "pest", "yellow", "leaf", "spot"]):
        intents.append("disease_query")
    if any(key in message for key in ["harvest", "crop ready", "produce ready", "ready for pickup", "picked", "mature"]):
        intents.append("harvest_update")
    if any(key in message for key in ["advisory", "irrigation", "spray", "cycle", "guidance"]):
        intents.append("advisory")
    return intents or ["general_query"]


def _infer_intent(text: str) -> str:
    intents = _infer_intents(text)
    return "multi_intent" if len([item for item in intents if item != "general_query"]) > 1 else intents[0]


def _simulate_whatsapp(
    farmer_id: str,
    text: str,
    intent: str | None = None,
    auto_reply: bool = False,
) -> dict[str, Any]:
    farmer = _find_farmer(farmer_id)
    if not farmer:
        raise ValueError("Invalid farmer_id")
    _ensure_chat_threads()
    resolved_intents = [str(intent).strip()] if intent else _infer_intents(text)
    resolved_intents = [item for item in resolved_intents if item] or ["general_query"]
    resolved_intent = "multi_intent" if len([item for item in resolved_intents if item != "general_query"]) > 1 else resolved_intents[0]
    severity = "HIGH" if "disease_query" in resolved_intents else "NORMAL"
    timestamp = _utc_now()
    msg_id = _next_id("MSG", DATASET["message_logs"])
    DATASET["message_logs"].append(
        {
            "id": msg_id,
            "farmer_id": farmer["id"],
            "fpo_id": farmer["fpo_id"],
            "farmer_name": farmer["name"],
            "language": farmer["language"],
            "intent": resolved_intent,
            "severity": severity,
            "timestamp": timestamp,
            "text": text,
            "intents": resolved_intents,
            "status": "pending",
            "in_progress_at": None,
            "resolved_at": None,
            "created_records": {},
            "escalated": False,
            "escalation_category": "none",
            "escalation_reason": "",
        }
    )
    incoming_chat = {
        "id": _next_id("CHAT", DATASET["chat_threads"]),
        "farmer_id": farmer["id"],
        "farmer_name": farmer["name"],
        "direction": "incoming",
        "intent": resolved_intent,
        "severity": severity,
        "status": "pending",
        "message_id": msg_id,
        "text": text,
        "timestamp": timestamp,
    }
    DATASET["chat_threads"].append(incoming_chat)

    response_text = "Message captured."
    response_fragments: list[str] = []
    created_records: dict[str, str] = {}
    if "input_request" in resolved_intents:
        scored = _score_input_demand(text, farmer)
        item = scored["item"]
        qty = scored["qty"]
        trust = scored["score"]
        auto_status = "captured" if trust >= INPUT_AUTONOMY_TRUST_THRESHOLD else "needs_review"
        demand = {
            "id": _next_id("DEM", DATASET["input_demands"]),
            "farmer_id": farmer["id"],
            "fpo_id": farmer["fpo_id"],
            "village": farmer["village"],
            "crop": farmer["primary_crop"],
            "item_id": item["id"],
            "item_name": item["name"],
            "requested_qty": qty,
            "status": auto_status,
            "request_date": date.today().isoformat(),
            "issue_ids": [],
            "aggregated_at": None,
            "procured_at": None,
            "source": "farmer_chat",
            "source_ref": msg_id,
            "source_text": text,
            "trust_score": trust,
            "trust_rationale": scored["rationale"],
            "reviewed_by": None,
            "reviewed_at": None,
            "review_notes": None,
        }
        DATASET["input_demands"].append(demand)
        created_records["input_demand_id"] = demand["id"]
        _append_audit(
            "input_demand",
            demand["id"],
            "auto_created",
            f"From chat {msg_id}; trust={trust}; status={auto_status}.",
        )
        if auto_status == "needs_review":
            response_fragments.append(f"Request noted: {qty} units of {item['name']}. Our office will confirm shortly.")
        else:
            response_fragments.append(f"Request captured: {qty} units of {item['name']}.")

    if "harvest_update" in resolved_intents:
        season = _latest_farmer_season(farmer["id"], farmer["primary_crop"])
        confidence, rationale = _score_harvest_signal(text, farmer, season)
        signal = {
            "id": _next_id("HVR", DATASET["harvest_signals"]),
            "farmer_id": farmer["id"],
            "fpo_id": farmer["fpo_id"],
            "crop": farmer["primary_crop"],
            "confidence": confidence,
            "status": "confirmed" if confidence >= HARVEST_AUTONOMY_CONFIDENCE_THRESHOLD else "needs_review",
            "source": "farmer_chat",
            "source_ref": msg_id,
            "source_text": text,
            "estimated_quantity_qtl": _estimated_harvest_qty_qtl(farmer, farmer["primary_crop"]),
            "rationale": rationale,
            "collection_id": None,
            "sales_order_id": None,
            "dispatch_id": None,
            "market_demand_id": None,
            "created_at": _utc_now(),
            "last_action_at": _utc_now(),
        }
        DATASET["harvest_signals"].append(signal)
        created_records["harvest_signal_id"] = signal["id"]
        _append_audit(
            "harvest_signal",
            signal["id"],
            "auto_created",
            f"From chat {msg_id}; confidence={confidence}; status={signal['status']}.",
        )
        if signal["status"] == "needs_review":
            response_fragments.append("Harvest update noted. Our FPO office will confirm the pickup plan with you shortly.")
        else:
            response_fragments.append(f"Harvest update received for {signal['crop']}. I am verifying pickup and market allocation now.")

    if "advisory" in resolved_intents:
        adv = {
            "id": _next_id("ADV", DATASET["advisory_logs"]),
            "farmer_id": farmer["id"],
            "crop": farmer["primary_crop"],
            "advisory_type": "advisory",
            "advisory_text": f"Advisory for {farmer['primary_crop']}: monitor moisture and plan irrigation window.",
            "acknowledged": False,
        }
        DATASET["advisory_logs"].append(adv)
        created_records["advisory_id"] = adv["id"]
        response_fragments.append(adv["advisory_text"])

    if "disease_query" in resolved_intents:
        message = _find_message(msg_id)
        dcase = {
            "id": _next_id("DCASE", DATASET["disease_logs"]),
            "farmer_id": farmer["id"],
            "message_id": msg_id,
            "crop": farmer["primary_crop"],
            "predicted_issue": "Possible fungal infection",
            "confidence": 0.63,
            "escalated": True,
            "final_resolution": "Pending field officer review",
            "escalation_id": None,
        }
        DATASET["disease_logs"].append(dcase)
        esc = _apply_message_escalation(
            message,
            category="disease",
            reason=dcase["predicted_issue"],
            owner="Field Officer",
            status="open",
            disease_case_id=dcase["id"],
        )
        dcase["escalation_id"] = esc["id"]
        created_records["disease_case_id"] = dcase["id"]
        created_records["escalation_id"] = esc["id"]
        response_fragments.append("Possible disease identified. Escalated to field officer.")

    if "price_query" in resolved_intents:
        market = next(
            (row for row in sorted(DATASET["market_prices"], key=lambda x: x["date"], reverse=True) if row["crop"] == farmer["primary_crop"]),
            None,
        )
        if market:
            response_fragments.append(
                f"{farmer['primary_crop']} in {market['mandi']}: INR {market['price_min']} - {market['price_max']} per quintal."
            )

    if "broadcast_ack" in resolved_intents:
        response_fragments.append("Acknowledgment recorded.")

    if response_fragments:
        response_text = " ".join(response_fragments)

    if auto_reply:
        resolved_at = _utc_now()
        DATASET["chat_threads"].append(
            {
                "id": _next_id("CHAT", DATASET["chat_threads"]),
                "farmer_id": farmer["id"],
                "farmer_name": farmer["name"],
                "direction": "outgoing",
                "intent": resolved_intent,
                "severity": "NORMAL",
                "status": "sent",
                "message_id": msg_id,
                "text": response_text,
                "timestamp": resolved_at,
            }
        )
        latest = next((row for row in DATASET["message_logs"] if row["id"] == msg_id), None)
        if latest:
            latest["status"] = "resolved"
            latest["resolved_at"] = resolved_at
            latest["in_progress_at"] = latest.get("in_progress_at") or resolved_at

    latest = next((row for row in DATASET["message_logs"] if row["id"] == msg_id), None)
    if latest:
        latest["created_records"] = created_records

    _append_audit("communication", msg_id, "mock_whatsapp", resolved_intent)
    return {
        "message_id": msg_id,
        "intent": resolved_intent,
        "response_text": response_text,
        "created_records": created_records,
        "incoming_chat_id": incoming_chat["id"],
        "auto_reply": auto_reply,
    }


def _office_reply(farmer_id: str, text: str, message_id: str | None = None) -> dict[str, Any]:
    farmer = _find_farmer(farmer_id)
    if not farmer:
        raise ValueError("Invalid farmer_id")
    target_msg = None
    if message_id:
        target_msg = next((row for row in DATASET["message_logs"] if row["id"] == message_id and row["farmer_id"] == farmer_id), None)
    if not target_msg:
        for preferred_status in ("in_progress", "pending"):
            target_msg = next(
                (
                    row
                    for row in sorted(DATASET["message_logs"], key=lambda item: item["timestamp"], reverse=True)
                    if row["farmer_id"] == farmer_id and row["status"] == preferred_status
                ),
                None,
            )
            if target_msg:
                break
    return _post_outgoing_chat(farmer, text, message=target_msg, status="resolved", agent_generated=False)


def _run_autonomous_procurement_cycle(run: dict[str, Any], *, force: bool = False) -> list[str]:
    actions: list[str] = []
    purchase_orders = [
        row
        for row in DATASET["purchase_orders"]
        if row.get("delivery_status") != "received"
    ]
    purchase_orders.sort(key=lambda row: row.get("order_date", ""))
    for po in purchase_orders[:8]:
        grn = _create_agent_goods_receipt(po, source_ref=run["id"])
        actions.append(f"Received PO {po['id']} into GRN {grn['id']}.")
        _record_agent_task(
            "agent_fulfillment",
            "Received supplier delivery automatically",
            entity_type="goods_receipt",
            entity_id=grn["id"],
            status="completed",
            detail=po["item_name"],
            run_id=run["id"],
        )
    for demand in sorted(DATASET["input_demands"], key=lambda row: row.get("request_date", ""))[:200]:
        if demand.get("status") not in {"captured", "aggregated", "procured"}:
            continue
        if int(demand.get("trust_score", 100)) < INPUT_AUTONOMY_TRUST_THRESHOLD:
            continue
        farmer = _find_farmer(str(demand.get("farmer_id", "")))
        item = _find_input(str(demand.get("item_id", "")))
        if not farmer or not item:
            continue
        stock_row = _inventory_row(farmer["fpo_id"], item["id"])
        qty = int(demand.get("requested_qty", 0))
        if not stock_row or int(stock_row.get("current_stock", 0)) < qty:
            continue
        issue, issue_error = _create_agent_input_issue(farmer, item, qty, demand_rows=[demand], source_ref=run["id"])
        if issue_error or not issue:
            continue
        actions.append(f"Issued {qty} {item['name']} to {farmer['name']} ({issue['id']}).")
        _record_agent_task(
            "agent_fulfillment",
            "Issued pending farmer request automatically",
            entity_type="input_issue",
            entity_id=issue["id"],
            farmer_id=farmer["id"],
            status="completed",
            detail=f"{qty} {item['name']}",
            run_id=run["id"],
        )
    return actions


def _run_crop_cycle_alerts(run: dict[str, Any], *, force: bool = False) -> list[str]:
    actions: list[str] = []
    seasons = sorted(DATASET.get("crop_seasons", []), key=lambda row: row.get("expected_harvest", ""))
    for season in seasons[:240]:
        farmer = _find_farmer(str(season.get("farmer_id", "")))
        if not farmer:
            continue
        days_to_harvest = _days_until(season.get("expected_harvest"))
        if days_to_harvest is None:
            continue
        if days_to_harvest > HARVEST_OUTREACH_WINDOW_DAYS:
            continue
        latest_collection = _latest_collection_for_farmer_crop(farmer["id"], season["crop_name"])
        if latest_collection and (_days_since(latest_collection.get("date")) or 0) <= HARVEST_OUTREACH_WINDOW_DAYS:
            continue
        recent_alert = _latest_agent_alert(farmer["id"], "harvest_check", season["crop_name"])
        if recent_alert and not force and (_days_since(str(recent_alert.get("created_at", "")).split("T")[0]) or 0) < AGENT_ALERT_COOLDOWN_DAYS:
            _record_agent_task(
                "agent_crop_cycle",
                "Monitored season (cooldown active)",
                entity_type="crop_season",
                entity_id=season["id"],
                farmer_id=farmer["id"],
                status="completed",
                detail=f"{season['crop_name']} alert cooldown",
                run_id=run["id"],
            )
            continue
        if days_to_harvest >= 0:
            text = (
                f"Your {season['crop_name']} crop is approaching harvest in about {days_to_harvest} days. "
                "Reply 'harvest ready' when it is ready so I can arrange pickup and market allocation."
            )
        else:
            text = (
                f"I am checking in on your {season['crop_name']} harvest. "
                "If the crop is ready, reply 'harvest ready' and I will arrange the next steps."
            )
        _post_outgoing_chat(farmer, text, intent="advisory", agent_generated=True)
        alert = _record_agent_alert("agent_crop_cycle", farmer, "harvest_check", text, crop=season["crop_name"])
        actions.append(f"Sent harvest check {alert['id']} to {farmer['name']} for {season['crop_name']}.")
        _record_agent_task(
            "agent_crop_cycle",
            "Sent proactive harvest reminder",
            entity_type="agent_alert",
            entity_id=alert["id"],
            farmer_id=farmer["id"],
            status="completed",
            detail=season["crop_name"],
            run_id=run["id"],
        )
    return actions


def _run_market_allocation_cycle(run: dict[str, Any]) -> list[str]:
    actions: list[str] = []
    collections = [
        row
        for row in DATASET["produce_collections"]
        if not row.get("sales_order_id") and row.get("status") in {"graded", "allocated_to_order"}
    ]
    collections.sort(key=lambda row: row.get("date", ""), reverse=True)
    for collection in collections[:24]:
        buyer_demand = _best_open_buyer_demand(collection["crop"])
        if not buyer_demand:
            _record_agent_task(
                "agent_market",
                "No live buyer demand for collection",
                entity_type="produce_collection",
                entity_id=collection["id"],
                farmer_id=collection.get("farmer_id"),
                status="pending",
                detail=f"{collection['crop']} awaiting demand",
                run_id=run["id"],
            )
            continue
        sales_order, allocated_mt, gap_mt, approval_required = _create_agent_sales_order(
            buyer_demand,
            preferred_collection_ids=[collection["id"]],
            source_ref=run["id"],
        )
        if not sales_order:
            continue
        dispatch = _create_agent_dispatch(sales_order, source_ref=run["id"]) if not approval_required else None
        farmer = _find_farmer(collection["farmer_id"])
        if farmer:
            if dispatch:
                _post_outgoing_chat(
                    farmer,
                    (
                        f"Your {collection['crop']} collection {collection['id']} has been matched to buyer {sales_order['buyer_name']} "
                        f"and dispatched under {dispatch['id']}."
                    ),
                    intent="advisory",
                    agent_generated=True,
                )
            elif approval_required:
                _post_outgoing_chat(
                    farmer,
                    (
                        f"Your {collection['crop']} collection {collection['id']} has been matched to buyer {sales_order['buyer_name']} "
                        f"under order {sales_order['id']}. FPO approval is pending before dispatch."
                    ),
                    intent="advisory",
                    agent_generated=True,
                )
        actions.append(
            f"Allocated collection {collection['id']} to order {sales_order['id']} for {allocated_mt} MT"
            + (f"; gap {gap_mt} MT" if gap_mt else "")
            + ("; approval pending." if approval_required else ".")
        )
        _record_agent_task(
            "agent_market",
            "Allocated collection to buyer demand",
            entity_type="sales_order",
            entity_id=sales_order["id"],
            farmer_id=collection["farmer_id"],
            status="pending" if approval_required else "completed",
            requires_human=approval_required,
            detail=f"{collection['crop']} / {allocated_mt} MT",
            run_id=run["id"],
        )
    return actions


def _run_agent_orchestration_cycle(*, trigger: str, force: bool = False) -> dict[str, Any]:
    run = _start_agent_run(trigger, "agent_intake")
    procurement_actions = _run_autonomous_procurement_cycle(run, force=force)
    crop_actions = _run_crop_cycle_alerts(run, force=force)
    market_actions = _run_market_allocation_cycle(run)
    actions = [*procurement_actions, *crop_actions, *market_actions]
    lane_counts = {
        "agent_fulfillment": len(procurement_actions),
        "agent_crop_cycle": len(crop_actions),
        "agent_market": len(market_actions),
    }
    lead = max(lane_counts, key=lane_counts.get) if any(lane_counts.values()) else "agent_intake"
    run["primary_agent"] = lead
    pending_approvals = sum(1 for row in DATASET["approval_logs"] if row.get("status") == "pending")
    human_handoffs = sum(1 for row in DATASET["agent_tasks"][-80:] if row.get("run_id") == run["id"] and row.get("requires_human"))
    summary = actions[0] if actions else "No autonomous work was available on this cycle."
    _finish_agent_run(run, summary=summary, actions=actions, human_handoffs=human_handoffs, approvals=pending_approvals)
    _persist_dataset_safe()
    return {
        "status": "completed",
        "run": run,
        "actions": actions,
        "action_count": len(actions),
        "pending_approvals": pending_approvals,
        "human_handoffs": human_handoffs,
    }


def _agent_command_center_payload() -> dict[str, Any]:
    pending_review = [row for row in DATASET["input_demands"] if row.get("status") == "needs_review"]
    open_escalations = [row for row in DATASET["escalations"] if row.get("status") != "closed"]
    pending_approvals = [row for row in DATASET["approval_logs"] if row.get("status") == "pending"]
    represented_message_ids = {
        str(row.get("source_ref") or "").strip()
        for row in pending_review
        if str(row.get("source_ref") or "").strip()
    }
    purchase_requests_by_id = {str(row.get("id", "")): row for row in DATASET.get("purchase_requests", [])}
    for approval in pending_approvals:
        entity_id = str(approval.get("entity_id", "")).strip()
        pr = purchase_requests_by_id.get(entity_id)
        source_ref = str((pr or {}).get("source_ref") or "").strip()
        if source_ref.startswith("MSG_"):
            represented_message_ids.add(source_ref)
    open_escalations = [
        row
        for row in open_escalations
        if str(row.get("message_id") or "").strip() not in represented_message_ids
    ]
    fulfillment_queue = []
    for demand in sorted(DATASET["input_demands"], key=lambda row: row.get("request_date", ""), reverse=True)[:80]:
        if demand.get("status") not in {"captured", "aggregated", "procured", "needs_review"}:
            continue
        farmer = _find_farmer(str(demand.get("farmer_id", "")))
        stock_row = _inventory_row(str(demand.get("fpo_id", "")), str(demand.get("item_id", "")))
        next_action = "Human review" if demand.get("status") == "needs_review" else "Issue now" if stock_row and int(stock_row.get("current_stock", 0)) >= int(demand.get("requested_qty", 0)) else "Procure"
        fulfillment_queue.append(
            {
                "id": demand["id"],
                "farmer_name": farmer["name"] if farmer else demand.get("farmer_id"),
                "item_name": demand["item_name"],
                "requested_qty": demand["requested_qty"],
                "status": demand["status"],
                "trust_score": demand.get("trust_score", 100),
                "next_action": next_action,
            }
        )
    harvest_watchlist = []
    for season in sorted(DATASET.get("crop_seasons", []), key=lambda row: row.get("expected_harvest", ""))[:160]:
        farmer = _find_farmer(str(season.get("farmer_id", "")))
        if not farmer:
            continue
        days_to_harvest = _days_until(season.get("expected_harvest"))
        if days_to_harvest is None or days_to_harvest > HARVEST_OUTREACH_WINDOW_DAYS + 14:
            continue
        latest_collection = _latest_collection_for_farmer_crop(farmer["id"], season["crop_name"])
        harvest_watchlist.append(
            {
                "id": season["id"],
                "farmer_name": farmer["name"],
                "crop": season["crop_name"],
                "expected_harvest": season.get("expected_harvest"),
                "days_to_harvest": days_to_harvest,
                "status": "collected" if latest_collection else "watching",
                "next_action": "Market allocation" if latest_collection and not latest_collection.get("sales_order_id") else "Await farmer confirmation" if days_to_harvest >= 0 else "Follow up now",
            }
        )
    market_queue = []
    for collection in sorted(DATASET["produce_collections"], key=lambda row: row.get("date", ""), reverse=True)[:80]:
        if collection.get("sales_order_id") or collection.get("status") not in {"graded", "allocated_to_order"}:
            continue
        best_demand = _best_open_buyer_demand(collection["crop"])
        market_queue.append(
            {
                "id": collection["id"],
                "farmer_name": collection["farmer_name"],
                "crop": collection["crop"],
                "available_mt": round(float(collection.get("quantity_qtl", 0)) / 10.0, 2),
                "best_buyer": best_demand["buyer_name"] if best_demand else "No live demand",
                "offer_price": best_demand["offered_price"] if best_demand else None,
                "next_action": "Allocate now" if best_demand else "Wait for buyer demand",
            }
        )
    exception_rows = []
    for demand in pending_review[:8]:
        farmer = _find_farmer(str(demand.get("farmer_id", "")))
        exception_rows.append(
            {
                "id": demand["id"],
                "type": "Low confidence input",
                "farmer_name": farmer["name"] if farmer else demand.get("farmer_id"),
                "status": demand["status"],
                "owner": "FPO Office",
                "reason": "; ".join(demand.get("trust_rationale", [])[:2]) or "Needs human confirmation",
            }
        )
    for esc in open_escalations[:8]:
        farmer = _find_farmer(str(esc.get("farmer_id", "")))
        exception_rows.append(
            {
                "id": esc["id"],
                "type": f"Escalation / {esc.get('category', 'unknown')}",
                "farmer_name": farmer["name"] if farmer else esc.get("farmer_id"),
                "status": esc.get("status", "open"),
                "owner": esc.get("owner", "FPO Office"),
                "reason": esc.get("reason", ""),
            }
        )
    for approval in pending_approvals[:12]:
        entity_id = str(approval.get("entity_id", ""))
        label = entity_id
        if entity_id.startswith("PR"):
            pr = next((row for row in DATASET["purchase_requests"] if row["id"] == entity_id), None)
            if pr:
                label = f"{pr.get('item_name', entity_id)} ({pr.get('total_qty', '')})"
        elif entity_id.startswith("SO"):
            so = next((row for row in DATASET["sales_orders"] if row["id"] == entity_id), None)
            if so:
                label = f"{so.get('buyer_name', entity_id)} / {so.get('crop', '')}"
        exception_rows.append(
            {
                "id": approval["id"],
                "type": f"Approval / {approval['approval_type']}",
                "farmer_name": label,
                "status": approval["status"],
                "owner": "Approver",
                "reason": approval.get("notes", ""),
            }
        )
    agents = []
    recent_tasks = DATASET.get("agent_tasks", [])
    for profile in AGENT_PROFILES:
        profile_tasks = [row for row in recent_tasks if row.get("agent_id") == profile["id"]]
        pending_tasks = [row for row in profile_tasks if row.get("status") == "pending"]
        latest_task = profile_tasks[-1] if profile_tasks else None
        agents.append(
            {
                "id": profile["id"],
                "name": profile["name"],
                "focus": profile["focus"],
                "completed_tasks": len([row for row in profile_tasks if row.get("status") == "completed"]),
                "pending_tasks": len(pending_tasks),
                "last_activity": latest_task.get("created_at") if latest_task else None,
            }
        )
    now_ts = _utc_now()
    def _age_seconds(ts: str | None) -> int | None:
        if not ts:
            return None
        try:
            from datetime import datetime as _dt
            t = _dt.fromisoformat(str(ts).replace("Z", "+00:00"))
            n = _dt.fromisoformat(str(now_ts).replace("Z", "+00:00"))
            return max(0, int((n - t).total_seconds()))
        except Exception:
            return None
    recent_task_window = sorted(DATASET.get("agent_tasks", []), key=lambda row: row.get("created_at", ""), reverse=True)[:60]
    edge_counts = {
        "intake_to_fulfillment": len([r for r in recent_task_window if r.get("agent_id") == "agent_fulfillment"]),
        "intake_to_crop_cycle": len([r for r in recent_task_window if r.get("agent_id") == "agent_crop_cycle"]),
        "intake_to_market": len([r for r in recent_task_window if r.get("agent_id") == "agent_market"]),
        "to_exception": len([r for r in recent_task_window if r.get("requires_human")]),
    }
    flow_stats = {
        "nodes": [
            {
                "id": p["id"],
                "name": p["name"],
                "focus": p["focus"],
                "completed": next((a["completed_tasks"] for a in agents if a["id"] == p["id"]), 0),
                "pending": next((a["pending_tasks"] for a in agents if a["id"] == p["id"]), 0),
                "last_activity": next((a["last_activity"] for a in agents if a["id"] == p["id"]), None),
                "last_activity_seconds_ago": _age_seconds(next((a["last_activity"] for a in agents if a["id"] == p["id"]), None)),
            }
            for p in AGENT_PROFILES
        ],
        "edges": [
            {"from": "agent_intake", "to": "agent_fulfillment", "count": edge_counts["intake_to_fulfillment"], "label": "input requests"},
            {"from": "agent_intake", "to": "agent_crop_cycle", "count": edge_counts["intake_to_crop_cycle"], "label": "harvest/advisory"},
            {"from": "agent_crop_cycle", "to": "agent_market", "count": edge_counts["intake_to_market"], "label": "collections"},
            {"from": "agent_fulfillment", "to": "agent_exception", "count": len([r for r in recent_task_window if r.get("agent_id") == "agent_fulfillment" and r.get("requires_human")]), "label": "approval"},
            {"from": "agent_market", "to": "agent_exception", "count": len([r for r in recent_task_window if r.get("agent_id") == "agent_market" and r.get("requires_human")]), "label": "approval"},
            {"from": "agent_intake", "to": "agent_exception", "count": len([r for r in recent_task_window if r.get("agent_id") == "agent_exception"]), "label": "handoffs"},
        ],
        "throughput_last_10": recent_task_window[:10],
        "now": now_ts,
    }
    per_agent_activity = {}
    for profile in AGENT_PROFILES:
        agent_id = profile["id"]
        agent_tasks_sorted = [row for row in recent_task_window if row.get("agent_id") == agent_id]
        pending_rows = [row for row in agent_tasks_sorted if row.get("status") == "pending"]
        latest = agent_tasks_sorted[0] if agent_tasks_sorted else None
        age = _age_seconds(latest.get("created_at") if latest else None)
        if age is None:
            status = "idle"
        elif age < 120:
            status = "active"
        elif pending_rows:
            status = "busy"
        else:
            status = "waiting"
        per_agent_activity[agent_id] = {
            "status": status,
            "pending_count": len(pending_rows),
            "current": pending_rows[0] if pending_rows else (latest if latest else None),
            "recent": agent_tasks_sorted[:3],
            "last_activity_seconds_ago": age,
        }
    flow_stats["per_agent_activity"] = per_agent_activity
    return {
        "summary": {
            "farmers_managed": len(DATASET["farmers"]),
            "autonomous_input_issues": len([row for row in DATASET["farmer_input_issues"] if row.get("source") == "agent"]),
            "autonomous_dispatches": len([row for row in DATASET["dispatches"] if row.get("source") == "agent"]),
            "proactive_alerts": len(DATASET.get("agent_alerts", [])),
            "human_exceptions": len(pending_review) + len(open_escalations) + len(pending_approvals),
            "active_workflows": len(fulfillment_queue) + len(market_queue),
        },
        "flow": flow_stats,
        "agents": agents,
        "fulfillment_queue": fulfillment_queue[:10],
        "harvest_watchlist": harvest_watchlist[:10],
        "market_queue": market_queue[:10],
        "exceptions": exception_rows[:24],
        "recent_runs": sorted(DATASET.get("agent_runs", []), key=lambda row: row.get("started_at", ""), reverse=True)[:12],
        "recent_alerts": sorted(DATASET.get("agent_alerts", []), key=lambda row: row.get("created_at", ""), reverse=True)[:10],
        "recent_tasks": sorted(DATASET.get("agent_tasks", []), key=lambda row: row.get("created_at", ""), reverse=True)[:12],
    }


DEMO_STEPS = [
    {
        "id": "step_registry_add_farmer",
        "title": "Onboard New Farmer",
        "description": "Create one farmer and connect data hierarchy.",
        "section": "registry",
    },
    {
        "id": "step_operations_procurement",
        "title": "Procurement Approval",
        "description": "Create PR and approve it into PO.",
        "section": "operations",
    },
    {
        "id": "step_market_demand",
        "title": "Capture Buyer Demand",
        "description": "Add a fresh buyer demand record.",
        "section": "market",
    },
    {
        "id": "step_communication_whatsapp",
        "title": "Mock WhatsApp Query",
        "description": "Simulate chat and capture input demand.",
        "section": "communication",
    },
    {
        "id": "step_settlement_paid",
        "title": "Close Settlement",
        "description": "Mark one pending settlement as paid.",
        "section": "operations",
    },
    {
        "id": "step_carbon_progress",
        "title": "Advance Carbon Project",
        "description": "Move one project to next status stage.",
        "section": "carbon",
    },
]


@app.route("/api/auth/login", methods=["POST"])
def auth_login() -> Any:
    body = request.get_json(silent=True) or {}
    username = str(body.get("username", "")).strip()
    password = str(body.get("password", ""))
    expected = _demo_users().get(username)
    if not expected or not secrets.compare_digest(expected, password):
        return jsonify({"error": "Invalid username or password."}), 401
    token = _issue_auth_token(username)
    return jsonify(
        {
            "token": token,
            "expires_in": AUTH_TOKEN_MAX_AGE_SECONDS,
            "user": {"username": username, "roles": ROLE_ORDER},
        }
    )


@app.route("/api/health", methods=["GET"])
def health() -> Any:
    return jsonify(
        {
            "status": "ok",
            "service": "fpo-poc-api",
            "generated_at": DATASET["generated_at"],
            "seed": DATASET.get("seed"),
            "data_profile": DATASET.get("data_profile", "full_data"),
            "data_profiles": [{"id": key, "label": label} for key, label in DATASET_PROFILES.items()],
            "communication_settings": _agent_public_config(),
            "timestamp": _utc_now(),
        }
    )


@app.route("/api/dashboard/summary", methods=["GET"])
def dashboard_summary() -> Any:
    return jsonify(compute_dashboard(DATASET))


@app.route("/api/agent/command-center", methods=["GET"])
def agent_command_center() -> Any:
    return jsonify(_agent_command_center_payload())


@app.route("/api/agent/runs/<run_id>/events", methods=["GET"])
def agent_run_events(run_id: str) -> Any:
    run = next((row for row in DATASET.get("agent_runs", []) if row.get("id") == run_id), None)
    tasks = [row for row in DATASET.get("agent_tasks", []) if row.get("run_id") == run_id]
    alerts = [row for row in DATASET.get("agent_alerts", []) if row.get("run_id") == run_id]
    events: list[dict[str, Any]] = []
    for task in tasks:
        events.append({
            "kind": "task",
            "id": task.get("id"),
            "agent_id": task.get("agent_id"),
            "agent_name": task.get("agent_name"),
            "title": task.get("title"),
            "detail": task.get("detail", ""),
            "entity_type": task.get("entity_type"),
            "entity_id": task.get("entity_id"),
            "farmer_id": task.get("farmer_id"),
            "message_id": task.get("message_id"),
            "requires_human": task.get("requires_human", False),
            "status": task.get("status"),
            "ts": task.get("created_at"),
        })
    for alert in alerts:
        events.append({
            "kind": "alert",
            "id": alert.get("id"),
            "agent_id": alert.get("agent_id"),
            "agent_name": alert.get("agent_name"),
            "title": alert.get("alert_type"),
            "detail": alert.get("text", ""),
            "entity_type": "agent_alert",
            "entity_id": alert.get("id"),
            "farmer_id": alert.get("farmer_id"),
            "message_id": alert.get("message_id"),
            "requires_human": False,
            "status": alert.get("status"),
            "ts": alert.get("created_at"),
        })
    events.sort(key=lambda row: row.get("ts") or "")
    return jsonify({"run": run, "events": events})


@app.route("/api/agent/run-cycle", methods=["POST"])
def agent_run_cycle() -> Any:
    denied = _require_permission("run_demo")
    if denied:
        return denied
    body = request.get_json(silent=True) or {}
    force = bool(body.get("force", False))
    return jsonify(_run_agent_orchestration_cycle(trigger="manual_command_center", force=force))


@app.route("/api/lookups", methods=["GET"])
def lookups() -> Any:
    return jsonify(
        {
            "fpos": [{"id": row["id"], "name": row["name"]} for row in DATASET["fpos"]],
            "farmers": [
                {
                    "id": row["id"],
                    "name": row["name"],
                    "fpo_id": row["fpo_id"],
                    "village": row.get("village", ""),
                    "primary_crop": row.get("primary_crop", ""),
                    "language": row.get("language", ""),
                    "whatsapp_opt_in": bool((_find_communication_profile(row["id"]) or {}).get("whatsapp_opt_in", True)),
                }
                for row in DATASET["farmers"]
            ],
            "inputs": [{"id": row["id"], "name": row["name"]} for row in DATASET["inputs_catalog"]],
            "suppliers": [{"id": row["id"], "name": row["name"]} for row in DATASET["suppliers"]],
            "buyers": [{"id": row["id"], "name": row["name"], "district": row["district"]} for row in DATASET["buyers"]],
            "roles": [{"name": role, "permissions": sorted(ROLE_PERMISSIONS[role])} for role in ROLE_ORDER],
            "villages": sorted({row.get("village", "") for row in DATASET["farmers"] if row.get("village")}),
            "crops": sorted({row.get("primary_crop", "") for row in DATASET["farmers"] if row.get("primary_crop")}),
            "languages": sorted({row.get("language", "") for row in DATASET["farmers"] if row.get("language")}),
        }
    )


@app.route("/api/registry/fpos", methods=["GET"])
def registry_fpos() -> Any:
    rows = _filter_rows(DATASET["fpos"], {"state": "state", "district": "district", "name": "q"})
    return jsonify(_paginate(rows))


@app.route("/api/registry/farmers", methods=["GET"])
def registry_farmers() -> Any:
    rows = _filter_rows(
        DATASET["farmers"],
        {"fpo_id": "fpo_id", "village": "village", "primary_crop": "crop", "name": "q"},
    )
    return jsonify(_paginate(rows))


@app.route("/api/registry/farmers", methods=["POST"])
def create_registry_farmer() -> Any:
    denied = _require_permission("create_farmer")
    if denied:
        return denied
    body = request.get_json(silent=True) or {}
    farmer, error = _create_farmer(body)
    if error:
        return jsonify({"error": error}), 400
    return jsonify({"status": "created", "farmer": farmer}), 201


@app.route("/api/registry/plots", methods=["GET"])
def registry_plots() -> Any:
    rows = _filter_rows(DATASET["plots"], {"fpo_id": "fpo_id", "crop_current": "crop", "farmer_id": "farmer_id"})
    return jsonify(_paginate(rows))


@app.route("/api/registry/seasons", methods=["GET"])
def registry_seasons() -> Any:
    rows = _filter_rows(DATASET["crop_seasons"], {"fpo_id": "fpo_id", "crop_name": "crop"})
    return jsonify(_paginate(rows))


@app.route("/api/registry/communication-profiles", methods=["GET"])
def registry_communication_profiles() -> Any:
    rows = _filter_rows(DATASET["communication_profiles"], {"farmer_id": "farmer_id", "language": "language"})
    return jsonify(_paginate(rows))


@app.route("/api/registry/geographies", methods=["GET"])
def registry_geographies() -> Any:
    states = DATASET.get("states", [])
    districts = DATASET.get("districts", [])
    villages = DATASET.get("villages", [])
    return jsonify({"states": states, "districts": districts, "villages": villages})


@app.route("/api/communication/inbox", methods=["GET"])
def communication_inbox() -> Any:
    rows = _filter_rows(DATASET["message_logs"], {"fpo_id": "fpo_id", "intent": "intent", "status": "status"})
    escalated_only = str(request.args.get("escalated_only", "")).strip().lower() in {"1", "true", "yes"}
    if escalated_only:
        rows = [row for row in rows if row.get("escalated")]
    rows = sorted(rows, key=lambda r: r["timestamp"], reverse=True)
    return jsonify(_paginate(rows))


@app.route("/api/communication/advisories", methods=["GET"])
def communication_advisories() -> Any:
    rows = _filter_rows(DATASET["advisory_logs"], {"crop": "crop"})
    rows = sorted(rows, key=lambda row: _id_suffix(str(row.get("id", ""))), reverse=True)
    return jsonify(_paginate(rows))


@app.route("/api/communication/escalations", methods=["GET"])
def communication_escalations() -> Any:
    rows = _filter_rows(DATASET["escalations"], {"status": "status", "owner": "owner"})
    rows = sorted(
        rows,
        key=lambda row: (row.get("created_at", ""), _id_suffix(str(row.get("id", "")))),
        reverse=True,
    )
    return jsonify(_paginate(rows))


@app.route("/api/communication/disease-cases", methods=["GET"])
def communication_disease_cases() -> Any:
    rows = _filter_rows(DATASET["disease_logs"], {"crop": "crop", "predicted_issue": "issue"})
    escalation_map = {e["disease_case_id"]: e for e in DATASET["escalations"] if e.get("disease_case_id")}
    enriched = []
    for row in rows:
        escalation = escalation_map.get(row["id"])
        enriched.append(
            {
                **row,
                "owner": escalation["owner"] if escalation else None,
                "status": escalation["status"] if escalation else "open",
            }
        )
    enriched = sorted(enriched, key=lambda r: r["id"], reverse=True)
    return jsonify(_paginate(enriched))


@app.route("/api/communication/disease-cases/<case_id>/assign", methods=["POST"])
def communication_assign_disease_case(case_id: str) -> Any:
    denied = _require_permission("communicate")
    if denied:
        return denied
    body = request.get_json(silent=True) or {}
    owner = str(body.get("owner", "Field Officer")).strip()
    status = str(body.get("status", "in_progress")).strip()
    if status not in {"open", "in_progress", "closed"}:
        return jsonify({"error": "status must be one of: open, in_progress, closed"}), 400

    dcase = next((d for d in DATASET["disease_logs"] if d["id"] == case_id), None)
    if not dcase:
        return jsonify({"error": "disease case not found"}), 404
    dcase["escalated"] = True
    message = _find_message(str(dcase.get("message_id") or ""))

    escalation = next((e for e in DATASET["escalations"] if e.get("disease_case_id") == case_id), None)
    if escalation:
        escalation["owner"] = owner
        escalation["status"] = status
        escalation["category"] = escalation.get("category") or "disease"
        escalation["reason"] = escalation.get("reason") or dcase.get("predicted_issue", "")
        if message and not escalation.get("message_id"):
            escalation["message_id"] = message["id"]
    else:
        if message:
            escalation = _apply_message_escalation(
                message,
                category="disease",
                reason=dcase.get("predicted_issue", ""),
                owner=owner,
                status=status,
                disease_case_id=case_id,
            )
        else:
            escalation = {
                "id": _next_id("ESC", DATASET["escalations"]),
                "message_id": None,
                "farmer_id": dcase.get("farmer_id"),
                "disease_case_id": case_id,
                "category": "disease",
                "reason": dcase.get("predicted_issue", ""),
                "owner": owner,
                "status": status,
                "created_at": _utc_now(),
            }
            DATASET["escalations"].append(escalation)
    dcase["escalation_id"] = escalation["id"]

    if message:
        message["escalated"] = True
        message["escalation_category"] = "disease"
        message["escalation_reason"] = dcase.get("predicted_issue", "")
        _set_message_status_fields(message, _message_status_from_escalation(status))

    _append_audit("disease_case", case_id, "assigned", f"Assigned to {owner} with status {status}.")
    return jsonify({"status": "assigned", "disease_case_id": case_id, "escalation": escalation})


@app.route("/api/communication/broadcasts", methods=["GET"])
def communication_broadcasts() -> Any:
    rows = _filter_rows(DATASET["broadcasts"], {"fpo_id": "fpo_id", "language": "language", "crop": "crop", "status": "status"})
    rows = sorted(rows, key=lambda r: r["created_at"], reverse=True)
    return jsonify(_paginate(rows))


@app.route("/api/communication/broadcasts", methods=["POST"])
def communication_create_broadcast() -> Any:
    denied = _require_permission("communicate")
    if denied:
        return denied
    body = request.get_json(silent=True) or {}
    text = str(body.get("text", "")).strip()
    if not text:
        return jsonify({"error": "text is required"}), 400
    filters = {
        "fpo_id": str(body.get("fpo_id", "")).strip() or None,
        "village": str(body.get("village", "")).strip() or None,
        "crop": str(body.get("crop", "")).strip() or None,
        "language": str(body.get("language", "")).strip() or None,
    }
    recipients = []
    for farmer in DATASET["farmers"]:
        profile = _find_communication_profile(farmer["id"]) or {}
        if filters["fpo_id"] and farmer["fpo_id"] != filters["fpo_id"]:
            continue
        if filters["village"] and farmer["village"] != filters["village"]:
            continue
        if filters["crop"] and farmer["primary_crop"] != filters["crop"]:
            continue
        if filters["language"] and farmer["language"] != filters["language"]:
            continue
        if not bool(profile.get("whatsapp_opt_in", True)):
            continue
        recipients.append(farmer)

    broadcast_id = _next_id("BRDC", DATASET["broadcasts"])
    full_text = f"{text}\n\nReply YES to confirm you have read this advisory."
    broadcast = {
        "id": broadcast_id,
        "fpo_id": filters["fpo_id"] or "all",
        "crop": filters["crop"] or "all",
        "village": filters["village"] or "all",
        "language": filters["language"] or "all",
        "text": text,
        "recipient_count": len(recipients),
        "read_count": 0,
        "status": "sent",
        "created_at": _utc_now(),
    }
    DATASET["broadcasts"].append(broadcast)

    for farmer in recipients:
        DATASET["broadcast_recipients"].append(
            {
                "id": _next_id("BRCPT", DATASET["broadcast_recipients"]),
                "broadcast_id": broadcast_id,
                "farmer_id": farmer["id"],
                "farmer_name": farmer["name"],
                "village": farmer.get("village", ""),
                "status": "sent",
                "sent_at": _utc_now(),
                "read_at": None,
            }
        )
        DATASET["chat_threads"].append(
            {
                "id": _next_id("CHAT", DATASET["chat_threads"]),
                "farmer_id": farmer["id"],
                "farmer_name": farmer["name"],
                "direction": "outgoing",
                "intent": "broadcast",
                "severity": "NORMAL",
                "status": "sent",
                "text": full_text,
                "timestamp": _utc_now(),
                "broadcast_id": broadcast_id,
            }
        )

    _append_audit("broadcast", broadcast_id, "created", f"Broadcast sent to {len(recipients)} recipients.")
    return jsonify({"status": "sent", "broadcast": broadcast, "recipients": len(recipients)}), 201


YES_TOKENS = {"yes", "y", "ok", "okay", "confirmed", "received", "haan", "haa", "हाँ", "हां", "ठीक", "हो", "ok.", "yes."}


def _is_yes_reply(text: str) -> bool:
    t = (text or "").strip().lower().strip(".,!? ")
    return t in YES_TOKENS


def _mark_broadcast_read_by_farmer(farmer_id: str, broadcast_id: str | None = None) -> dict[str, Any] | None:
    pending = [
        r for r in DATASET["broadcast_recipients"]
        if r["farmer_id"] == farmer_id and r.get("status") != "read"
        and (not broadcast_id or r["broadcast_id"] == broadcast_id)
    ]
    if not pending:
        return None
    pending.sort(key=lambda r: r.get("sent_at") or "", reverse=True)
    recipient = pending[0]
    recipient["status"] = "read"
    recipient["read_at"] = _utc_now()
    broadcast = next((b for b in DATASET["broadcasts"] if b["id"] == recipient["broadcast_id"]), None)
    if broadcast:
        broadcast["read_count"] = sum(
            1 for r in DATASET["broadcast_recipients"]
            if r["broadcast_id"] == recipient["broadcast_id"] and r["status"] == "read"
        )
    _append_audit("broadcast", recipient["broadcast_id"], "read_ack", f"Farmer {farmer_id} confirmed read.")
    return recipient


def _process_broadcast_ack(farmer_id: str, message_id: str, broadcast_id: str | None = None) -> dict[str, Any] | None:
    recipient = _mark_broadcast_read_by_farmer(farmer_id, broadcast_id=broadcast_id)
    if not recipient:
        return None

    message = _find_message(message_id)
    if message:
        message["intent"] = "broadcast_ack"
        message["intents"] = ["broadcast_ack"]
        _add_message_response(message, "Thank you for confirming. We have noted your response.")
    return recipient


@app.route("/api/communication/broadcasts/<broadcast_id>/recipients", methods=["GET"])
def communication_broadcast_recipients(broadcast_id: str) -> Any:
    rows = [r for r in DATASET["broadcast_recipients"] if r["broadcast_id"] == broadcast_id]
    return jsonify(_paginate(rows))


@app.route("/api/communication/broadcasts/<broadcast_id>/simulate-reply", methods=["POST"])
def communication_broadcast_simulate_reply(broadcast_id: str) -> Any:
    denied = _require_permission("communicate")
    if denied:
        return denied
    body = request.get_json(silent=True) or {}
    farmer_id = str(body.get("farmer_id", "")).strip()
    if not farmer_id:
        return jsonify({"error": "farmer_id is required"}), 400
    recipient = next(
        (r for r in DATASET["broadcast_recipients"] if r["broadcast_id"] == broadcast_id and r["farmer_id"] == farmer_id),
        None,
    )
    if not recipient:
        return jsonify({"error": "recipient not found"}), 404
    try:
        result = _simulate_whatsapp(farmer_id, "YES", intent="broadcast_ack", auto_reply=False)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    updated_recipient = _process_broadcast_ack(farmer_id, result["message_id"], broadcast_id=broadcast_id)
    if not updated_recipient:
        return jsonify({"error": "recipient not found"}), 404
    return jsonify({"status": "read", "recipient": updated_recipient, "message_id": result["message_id"]})


@app.route("/api/communication/mock-whatsapp/thread", methods=["GET"])
def communication_thread() -> Any:
    _ensure_chat_threads()
    rows = DATASET["chat_threads"]
    farmer_id = request.args.get("farmer_id")
    if farmer_id:
        rows = [row for row in rows if row["farmer_id"] == farmer_id]
    # Return newest first for pagination so recent replies are always visible.
    rows = sorted(rows, key=lambda row: row["timestamp"], reverse=True)
    return jsonify(_paginate(rows))


@app.route("/api/communication/mock-whatsapp/send", methods=["POST"])
def communication_send() -> Any:
    denied = _require_permission("communicate")
    if denied:
        return denied
    body = request.get_json(silent=True) or {}
    farmer_id = str(body.get("farmer_id", "")).strip()
    text = str(body.get("text", "")).strip()
    intent = body.get("intent")
    auto_reply = bool(body.get("auto_reply", False))
    if not farmer_id or not text:
        return jsonify({"error": "farmer_id and text are required"}), 400
    try:
        result = _simulate_whatsapp(farmer_id, text, intent, auto_reply=auto_reply and not _agentic_replies_enabled())
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    agent_result = None
    agent_warning = None
    broadcast_ack = None
    if _is_yes_reply(text):
        broadcast_ack = _process_broadcast_ack(farmer_id, result["message_id"])
    if broadcast_ack is None and _agentic_replies_enabled():
        try:
            agent_result = _generate_agent_reply(result["message_id"])
        except (RuntimeError, ValueError) as exc:
            agent_warning = str(exc)
            _set_agent_last_error(agent_warning)
    return jsonify(
        {
            "status": "sent",
            "reply_mode": _communication_settings()["reply_mode"],
            "agent_result": agent_result,
            "agent_warning": agent_warning,
            "broadcast_ack": broadcast_ack,
            **result,
        }
    )


@app.route("/api/communication/mock-whatsapp/reply", methods=["POST"])
def communication_reply() -> Any:
    denied = _require_permission("communicate")
    if denied:
        return denied
    body = request.get_json(silent=True) or {}
    farmer_id = str(body.get("farmer_id", "")).strip()
    text = str(body.get("text", "")).strip()
    message_id = str(body.get("message_id", "")).strip() or None
    if not farmer_id or not text:
        return jsonify({"error": "farmer_id and text are required"}), 400
    try:
        result = _office_reply(farmer_id, text, message_id=message_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify({"status": "replied", **result})


@app.route("/api/communication/agent-config", methods=["GET"])
def communication_agent_config() -> Any:
    return jsonify(_agent_public_config())


@app.route("/api/communication/agent-reply", methods=["POST"])
def communication_agent_reply() -> Any:
    denied = _require_permission("communicate")
    if denied:
        return denied
    body = request.get_json(silent=True) or {}
    message_id = str(body.get("message_id", "")).strip()
    if not message_id:
        return jsonify({"error": "message_id is required"}), 400
    if _message_has_agent_reply(message_id):
        return jsonify({"error": "message already has an agent-generated reply"}), 409
    try:
        result = _generate_agent_reply(message_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except RuntimeError as exc:
        _set_agent_last_error(str(exc))
        return jsonify({"error": str(exc)}), 503
    return jsonify({"status": "replied", "reply_mode": _communication_settings()["reply_mode"], **result})


@app.route("/api/communication/messages/<message_id>/status", methods=["POST"])
def communication_set_status(message_id: str) -> Any:
    denied = _require_permission("communicate")
    if denied:
        return denied
    body = request.get_json(silent=True) or {}
    status = str(body.get("status", "")).strip().lower()
    allowed = {"pending", "in_progress", "resolved"}
    if status not in allowed:
        return jsonify({"error": f"status must be one of: {', '.join(sorted(allowed))}"}), 400
    row = next((item for item in DATASET["message_logs"] if item["id"] == message_id), None)
    if not row:
        return jsonify({"error": "message not found"}), 404
    timestamp = _utc_now()
    _set_message_status_fields(row, status, timestamp=timestamp)
    _append_audit("communication", message_id, "status_update", f"Message status set to {status}")
    return jsonify({"status": "updated", "message_id": message_id, "message_status": status})


@app.route("/api/operations/demand-summary", methods=["GET"])
def operations_demands() -> Any:
    rows = _filter_rows(DATASET["input_demands"], {"fpo_id": "fpo_id", "crop": "crop", "status": "status"})
    rows = sorted(
        rows,
        key=lambda row: (row.get("request_date", ""), _id_suffix(str(row.get("id", "")))),
        reverse=True,
    )
    return jsonify(_paginate(rows))


@app.route("/api/operations/demands/review-queue", methods=["GET"])
def operations_review_queue() -> Any:
    rows = [d for d in DATASET["input_demands"] if d.get("status") == "needs_review"]
    rows.sort(key=lambda r: (r.get("request_date", ""), _id_suffix(str(r.get("id", "")))), reverse=True)
    return jsonify(_paginate(rows))


@app.route("/api/operations/demands/<demand_id>/approve", methods=["POST"])
def approve_demand_review(demand_id: str) -> Any:
    denied = _require_permission("aggregate_demands")
    if denied:
        return denied
    body = request.get_json(silent=True) or {}
    demand = next((d for d in DATASET["input_demands"] if d["id"] == demand_id), None)
    if not demand:
        return jsonify({"error": "Demand not found"}), 404
    if demand.get("status") != "needs_review":
        return jsonify({"error": "Demand is not in review queue."}), 400
    updates = body.get("updates") or {}
    if "item_id" in updates:
        item = _find_input(str(updates["item_id"]))
        if item:
            demand["item_id"] = item["id"]
            demand["item_name"] = item["name"]
    if "requested_qty" in updates:
        try:
            demand["requested_qty"] = int(updates["requested_qty"])
        except (TypeError, ValueError):
            pass
    demand["status"] = "captured"
    demand["reviewed_by"] = _actor_role()
    demand["reviewed_at"] = _utc_now()
    demand["review_notes"] = body.get("notes") or None
    _sync_message_from_demand(demand)
    _append_audit("input_demand", demand["id"], "approved", f"Review approved by {_actor_role()}.")
    return jsonify({"status": "approved", "demand": demand})


@app.route("/api/operations/demands/<demand_id>/reject", methods=["POST"])
def reject_demand_review(demand_id: str) -> Any:
    denied = _require_permission("aggregate_demands")
    if denied:
        return denied
    body = request.get_json(silent=True) or {}
    demand = next((d for d in DATASET["input_demands"] if d["id"] == demand_id), None)
    if not demand:
        return jsonify({"error": "Demand not found"}), 404
    if demand.get("status") != "needs_review":
        return jsonify({"error": "Demand is not in review queue."}), 400
    demand["status"] = "rejected"
    demand["reviewed_by"] = _actor_role()
    demand["reviewed_at"] = _utc_now()
    demand["review_notes"] = body.get("notes") or None
    _sync_message_from_demand(
        demand,
        reply_text=f"We could not confirm your request for {demand['item_name']} yet. Please contact the FPO office for correction.",
    )
    _append_audit("input_demand", demand["id"], "rejected", f"Review rejected by {_actor_role()}.")
    return jsonify({"status": "rejected", "demand": demand})


@app.route("/api/operations/demands/aggregate", methods=["POST"])
def aggregate_input_demands() -> Any:
    denied = _require_permission("aggregate_demands")
    if denied:
        return denied
    body = request.get_json(silent=True) or {}
    fpo_id = str(body.get("fpo_id", "")).strip()
    item_id = str(body.get("item_id", "")).strip()
    demand_ids = [str(i).strip() for i in body.get("demand_ids", []) if str(i).strip()]

    if demand_ids:
        selected = [d for d in DATASET["input_demands"] if d["id"] in set(demand_ids) and d["status"] == "captured"]
    else:
        selected = [
            d
            for d in DATASET["input_demands"]
            if d["status"] == "captured"
            and (not fpo_id or d["fpo_id"] == fpo_id)
            and (not item_id or d["item_id"] == item_id)
        ]
    if not selected:
        return jsonify({"error": "No captured demand rows found for the given selection."}), 400
    by_item: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in selected:
        by_item[(row["fpo_id"], row["item_id"])].append(row)
    if len(by_item) != 1:
        return jsonify({"error": "Aggregate one FPO and one input item at a time."}), 400

    chosen = list(by_item.values())[0]
    chosen_ids = [row["id"] for row in chosen]
    _mark_demands_status(chosen_ids, "aggregated")
    for row in chosen:
        _sync_message_from_demand(row)
    total_qty = sum(int(row.get("requested_qty", 0)) for row in chosen)
    sample = chosen[0]
    _append_audit("input_demand", sample["id"], "aggregated", f"{len(chosen_ids)} rows aggregated for {sample['item_name']}.")
    return jsonify(
        {
            "status": "aggregated",
            "fpo_id": sample["fpo_id"],
            "item_id": sample["item_id"],
            "item_name": sample["item_name"],
            "demand_ids": chosen_ids,
            "rows_aggregated": len(chosen_ids),
            "total_qty": total_qty,
        }
    )


@app.route("/api/operations/procurement", methods=["GET"])
def operations_procurement() -> Any:
    pending_approvals = [
        row
        for row in DATASET["approval_logs"]
        if row["status"] == "pending" and row["approval_type"] in {"purchase_request", "settlement_release", "large_input_issue", "sales_order"}
    ]
    payload = {
        "purchase_requests": sorted(
            DATASET["purchase_requests"],
            key=lambda row: _id_suffix(str(row.get("id", ""))),
            reverse=True,
        ),
        "purchase_orders": sorted(
            DATASET["purchase_orders"],
            key=lambda row: (row.get("order_date", ""), _id_suffix(str(row.get("id", "")))),
            reverse=True,
        ),
        "goods_receipts": sorted(
            DATASET["goods_receipts"],
            key=lambda row: (row.get("receipt_date", ""), _id_suffix(str(row.get("id", "")))),
            reverse=True,
        ),
        "input_issues": sorted(
            DATASET["farmer_input_issues"],
            key=lambda row: (row.get("issue_date", ""), _id_suffix(str(row.get("id", "")))),
            reverse=True,
        ),
        "pending_approvals": sorted(
            pending_approvals,
            key=lambda row: (row.get("requested_at", ""), _id_suffix(str(row.get("id", "")))),
            reverse=True,
        ),
    }
    return jsonify(payload)


@app.route("/api/operations/purchase-requests", methods=["POST"])
def create_purchase_request() -> Any:
    denied = _require_permission("create_pr")
    if denied:
        return denied
    body = request.get_json(silent=True) or {}
    required = ["fpo_id", "item_id", "total_qty", "supplier_id"]
    missing = [field for field in required if not body.get(field)]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400
    fpo = _find_fpo(str(body["fpo_id"]))
    item = _find_input(str(body["item_id"]))
    supplier = _find_supplier(str(body["supplier_id"]))
    if not fpo or not item or not supplier:
        return jsonify({"error": "Invalid fpo_id, item_id, or supplier_id"}), 400
    linked_demands = _select_demands_for_pr(
        fpo["id"],
        item["id"],
        demand_ids=[str(i) for i in (body.get("input_demand_ids") or []) if str(i).strip()],
    )
    demand_ids = [d["id"] for d in linked_demands]
    if demand_ids:
        _mark_demands_status(demand_ids, "aggregated")
        for demand in linked_demands:
            _sync_message_from_demand(demand)

    pr = {
        "id": _next_id("PR", DATASET["purchase_requests"]),
        "fpo_id": fpo["id"],
        "item_id": item["id"],
        "item_name": item["name"],
        "total_qty": int(body["total_qty"]),
        "supplier_id": supplier["id"],
        "supplier_name": supplier["name"],
        "approval_status": "pending",
        "input_demand_ids": demand_ids,
        "expected_date": body.get("expected_date", (date.today() + timedelta(days=5)).isoformat()),
        "source": str(body.get("source", "manual") or "manual"),
        "source_ref": body.get("source_ref"),
        "created_by_agent": bool(body.get("created_by_agent", False)),
    }
    DATASET["purchase_requests"].append(pr)
    _append_approval(
        "purchase_request",
        "purchase_request",
        pr["id"],
        "Purchase request raised and waiting approval.",
        requested_by=_actor_role(),
    )
    _append_audit("purchase_request", pr["id"], "created", f"Manual PR created with {len(demand_ids)} linked demand rows.")
    return jsonify({"status": "created", "purchase_request": pr}), 201


@app.route("/api/operations/purchase-requests/<pr_id>/approve", methods=["POST"])
def approve_purchase_request(pr_id: str) -> Any:
    denied = _require_permission("approve_pr")
    if denied:
        return denied
    pr = next((row for row in DATASET["purchase_requests"] if row["id"] == pr_id), None)
    if not pr:
        return jsonify({"error": "Purchase request not found"}), 404
    if pr.get("approval_status") != "pending":
        return jsonify({"error": f"Purchase request is not pending approval (current: {pr.get('approval_status', 'unknown')})."}), 400
    po = _apply_purchase_request_decision(pr, "approved")
    approval = _latest_pending_approval("purchase_request", pr["id"])
    if approval:
        approval["status"] = "approved"
        approval["decision_by"] = _actor_role()
        approval["decision_at"] = _utc_now()
        approval["notes"] = "PR approved."
    _append_audit("purchase_request", pr["id"], "approved", "PR approved by user.")
    return jsonify({"status": "approved", "purchase_request": pr, "purchase_order": po})


@app.route("/api/operations/goods-receipts", methods=["POST"])
def create_goods_receipt() -> Any:
    denied = _require_permission("create_grn")
    if denied:
        return denied
    body = request.get_json(silent=True) or {}
    po_id = str(body.get("po_id", "")).strip()
    qty_received = int(body.get("qty_received", 0))
    damaged_qty = int(body.get("damaged_qty", 0))
    if not po_id or qty_received <= 0:
        return jsonify({"error": "po_id and qty_received (>0) are required"}), 400
    po = next((row for row in DATASET["purchase_orders"] if row["id"] == po_id), None)
    if not po:
        return jsonify({"error": "Purchase order not found"}), 404
    grn = {
        "id": _next_id("GRN", DATASET["goods_receipts"]),
        "po_id": po["id"],
        "fpo_id": po["fpo_id"],
        "item_id": po["item_id"],
        "item_name": po["item_name"],
        "qty_received": qty_received,
        "damaged_qty": max(0, damaged_qty),
        "receipt_date": date.today().isoformat(),
        "source": str(body.get("source", "manual") or "manual"),
        "source_ref": body.get("source_ref"),
        "created_by_agent": bool(body.get("created_by_agent", False)),
    }
    DATASET["goods_receipts"].append(grn)
    po["delivery_status"] = "received"
    _upsert_inventory(po["fpo_id"], po["item_id"], po["item_name"], max(0, qty_received - grn["damaged_qty"]), grn["id"], "stock_in")
    _append_audit("goods_receipt", grn["id"], "created", f"Goods receipt for PO {po['id']}.")
    return jsonify({"status": "received", "goods_receipt": grn})


@app.route("/api/operations/inventory", methods=["GET"])
def operations_inventory() -> Any:
    rows = _filter_rows(DATASET["inventory_snapshot"], {"fpo_id": "fpo_id", "item_name": "item"})
    return jsonify(_paginate(rows))


@app.route("/api/operations/inventory-transactions", methods=["GET"])
def operations_inventory_transactions() -> Any:
    rows = _filter_rows(
        DATASET["inventory_transactions"],
        {"fpo_id": "fpo_id", "item_name": "item", "txn_type": "txn_type", "reference_id": "reference_id"},
    )
    rows = sorted(rows, key=lambda r: r["txn_date"], reverse=True)
    return jsonify(_paginate(rows))


@app.route("/api/operations/input-issues", methods=["POST"])
def operations_create_input_issue() -> Any:
    denied = _require_permission("issue_inputs")
    if denied:
        return denied
    body = request.get_json(silent=True) or {}
    required = ["farmer_id", "item_id", "qty_issued"]
    missing = [field for field in required if not body.get(field)]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    farmer = _find_farmer(str(body["farmer_id"]))
    item = _find_input(str(body["item_id"]))
    qty_issued = int(body.get("qty_issued", 0))
    if not farmer or not item or qty_issued <= 0:
        return jsonify({"error": "Invalid farmer_id/item_id or qty_issued."}), 400

    fpo_id = farmer["fpo_id"]
    stock_row = _inventory_row(fpo_id, item["id"])
    if not stock_row or int(stock_row.get("current_stock", 0)) < qty_issued:
        return jsonify({"error": "Insufficient stock for issue."}), 400

    demand_ids = [str(i).strip() for i in body.get("demand_ids", []) if str(i).strip()]
    if demand_ids:
        linked_demands = [
            row
            for row in DATASET["input_demands"]
            if row["id"] in set(demand_ids)
            and row["farmer_id"] == farmer["id"]
            and row["item_id"] == item["id"]
            and row["status"] in {"captured", "aggregated", "procured"}
        ]
    else:
        linked_demands = [
            row
            for row in DATASET["input_demands"]
            if row["farmer_id"] == farmer["id"] and row["item_id"] == item["id"] and row["status"] in {"captured", "aggregated", "procured"}
        ][:6]

    issue = {
        "id": _next_id("ISSUE", DATASET["farmer_input_issues"]),
        "farmer_id": farmer["id"],
        "farmer_name": farmer["name"],
        "fpo_id": fpo_id,
        "item_id": item["id"],
        "item_name": item["name"],
        "qty_issued": qty_issued,
        "issue_date": date.today().isoformat(),
        "acknowledged": bool(body.get("acknowledged", True)),
        "approval_status": "approved" if qty_issued >= 120 else "not_required",
        "source": str(body.get("source", "manual") or "manual"),
        "source_ref": body.get("source_ref"),
        "created_by_agent": bool(body.get("created_by_agent", False)),
    }
    DATASET["farmer_input_issues"].append(issue)
    _upsert_inventory(fpo_id, item["id"], item["name"], qty_issued, issue["id"], "stock_out")

    linked_ids = [row["id"] for row in linked_demands]
    for row in linked_demands:
        row["status"] = "issued"
        issue_ids = row.setdefault("issue_ids", [])
        if issue["id"] not in issue_ids:
            issue_ids.append(issue["id"])
        _sync_message_from_demand(
            row,
            reply_text=f"Your requested {row['item_name']} has been issued by the FPO office.",
        )

    if qty_issued >= 120:
        _append_approval(
            "large_input_issue",
            "input_issue",
            issue["id"],
            "Large issue raised and auto-approved in demo mode.",
            status="approved",
            amount=float(qty_issued),
        )

    _append_audit("input_issue", issue["id"], "created", f"Issued {qty_issued} of {item['name']} to {farmer['id']}.")
    return jsonify({"status": "issued", "issue": issue, "linked_demand_ids": linked_ids})


@app.route("/api/operations/collections", methods=["GET"])
def operations_collections() -> Any:
    rows = _filter_rows(DATASET["produce_collections"], {"fpo_id": "fpo_id", "crop": "crop"})
    rows = sorted(rows, key=lambda r: (r["date"], _id_suffix(str(r.get("id", "")))), reverse=True)
    return jsonify(_paginate(rows))


@app.route("/api/operations/produce-collections", methods=["POST"])
def operations_create_collection() -> Any:
    denied = _require_permission("record_collection")
    if denied:
        return denied
    body = request.get_json(silent=True) or {}
    required = ["farmer_id", "crop", "quantity_qtl", "grade"]
    missing = [field for field in required if not body.get(field)]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400
    farmer = _find_farmer(str(body["farmer_id"]))
    if not farmer:
        return jsonify({"error": "Invalid farmer_id"}), 400
    quantity_qtl = float(body.get("quantity_qtl", 0))
    if quantity_qtl <= 0:
        return jsonify({"error": "quantity_qtl must be > 0"}), 400
    collection = {
        "id": _next_id("COLL", DATASET["produce_collections"]),
        "farmer_id": farmer["id"],
        "farmer_name": farmer["name"],
        "fpo_id": farmer["fpo_id"],
        "crop": str(body["crop"]).strip(),
        "grade": str(body["grade"]).strip().upper(),
        "quantity_qtl": round(quantity_qtl, 2),
        "collection_center": body.get("collection_center", f"{farmer['village']} Center"),
        "date": date.today().isoformat(),
        "moisture_pct": round(float(body.get("moisture_pct", 12.0)), 1),
        "status": "graded",
        "sales_order_id": None,
        "source": str(body.get("source", "manual") or "manual"),
        "source_ref": body.get("source_ref"),
        "created_by_agent": bool(body.get("created_by_agent", False)),
    }
    DATASET["produce_collections"].append(collection)
    settlement = _create_settlement_from_collection(collection, None)
    _append_audit("produce_collection", collection["id"], "created", f"Collection recorded for {collection['crop']}.")
    return jsonify({"status": "captured", "collection": collection, "settlement_suggestion": settlement}), 201


@app.route("/api/operations/settlements", methods=["GET"])
def operations_settlements() -> Any:
    rows = _filter_rows(DATASET["settlements"], {"payment_status": "status", "crop": "crop"})
    rows = sorted(
        rows,
        key=lambda row: (
            row.get("payment_date") or "",
            _id_suffix(str(row.get("id", ""))),
        ),
        reverse=True,
    )
    return jsonify(_paginate(rows))


@app.route("/api/operations/settlements/generate", methods=["POST"])
def operations_generate_settlements() -> Any:
    denied = _require_permission("generate_settlements")
    if denied:
        return denied
    body = request.get_json(silent=True) or {}
    collection_id = str(body.get("collection_id", "")).strip() or None
    sales_order_id = str(body.get("sales_order_id", "")).strip() or None
    generated: list[dict[str, Any]] = []

    sales_order = _find_sales_order(sales_order_id) if sales_order_id else None
    if sales_order_id and not sales_order:
        return jsonify({"error": "sales_order_id not found"}), 404

    if collection_id:
        collection = _find_collection(collection_id)
        if not collection:
            return jsonify({"error": "collection_id not found"}), 404
        generated.append(_create_settlement_from_collection(collection, sales_order))
    elif sales_order:
        for cid in sales_order.get("collection_ids", []):
            collection = _find_collection(str(cid))
            if collection:
                generated.append(_create_settlement_from_collection(collection, sales_order))
    else:
        pending = [c for c in DATASET["produce_collections"] if c.get("status") in {"graded", "allocated_to_order"}]
        for collection in pending[:20]:
            generated.append(_create_settlement_from_collection(collection, None))

    if not generated:
        return jsonify({"status": "noop", "message": "No settlement candidates found."})
    _append_audit("settlement", generated[0]["id"], "batch_generate", f"{len(generated)} settlement suggestions generated.")
    return jsonify({"status": "generated", "count": len(generated), "settlements": generated})


@app.route("/api/operations/settlements/<settlement_id>/mark-paid", methods=["POST"])
def mark_settlement_paid(settlement_id: str) -> Any:
    denied = _require_permission("release_settlement")
    if denied:
        return denied
    settlement = next((row for row in DATASET["settlements"] if row["id"] == settlement_id), None)
    if not settlement:
        return jsonify({"error": "Settlement not found"}), 404
    if settlement.get("payment_status") == "paid":
        return jsonify({"error": "settlement is already paid"}), 400
    blocker = _settlement_release_blocker(settlement)
    if blocker:
        return jsonify({"error": blocker}), 400
    settlement["payment_status"] = "paid"
    settlement["payment_date"] = date.today().isoformat()
    collection = _find_collection(str(settlement.get("collection_id", "")))
    if collection:
        collection["status"] = "settled"
    _append_audit("settlement", settlement["id"], "paid", "Settlement marked paid.")
    return jsonify({"status": "paid", "settlement": settlement})


@app.route("/api/market/prices", methods=["GET"])
def market_prices() -> Any:
    crop = request.args.get("crop")
    market = request.args.get("market")
    rows = DATASET["market_prices"]
    if crop:
        rows = [r for r in rows if r["crop"].lower() == crop.lower()]
    if market:
        rows = [r for r in rows if r["mandi"].lower() == market.lower()]
    rows = sorted(rows, key=lambda r: r["date"], reverse=True)
    return jsonify(_paginate(rows))


@app.route("/api/market/buyers", methods=["GET"])
def market_buyers() -> Any:
    rows = _filter_rows(DATASET["buyers"], {"buyer_type": "type", "district": "district", "name": "q"})
    return jsonify(_paginate(rows))


@app.route("/api/market/demands", methods=["GET"])
def market_demands() -> Any:
    rows = _filter_rows(DATASET["buyer_demands"], {"status": "status", "crop": "crop"})
    rows = sorted(rows, key=lambda row: row["required_date"])
    return jsonify(_paginate(rows))


@app.route("/api/market/buyer-demands", methods=["POST"])
def create_buyer_demand() -> Any:
    denied = _require_permission("create_buyer_demand")
    if denied:
        return denied
    body = request.get_json(silent=True) or {}
    required = ["buyer_id", "crop", "quantity_mt", "offered_price"]
    missing = [field for field in required if not body.get(field)]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400
    buyer = _find_buyer(str(body["buyer_id"]))
    if not buyer:
        return jsonify({"error": "Invalid buyer_id"}), 400
    demand = {
        "id": _next_id("BDEM", DATASET["buyer_demands"]),
        "buyer_id": buyer["id"],
        "buyer_name": buyer["name"],
        "crop": str(body["crop"]).strip(),
        "quantity_mt": float(body["quantity_mt"]),
        "offered_price": float(body["offered_price"]),
        "required_date": body.get("required_date", (date.today() + timedelta(days=7)).isoformat()),
        "delivery_location": body.get("delivery_location", buyer["district"]),
        "status": "open",
    }
    DATASET["buyer_demands"].append(demand)
    _append_audit("buyer_demand", demand["id"], "created", f"Demand for {demand['crop']} created.")
    return jsonify({"status": "created", "buyer_demand": demand}), 201


@app.route("/api/market/matching", methods=["GET"])
def market_matching() -> Any:
    min_ratio = request.args.get("min_ratio", "0.6")
    try:
        min_ratio_float = float(min_ratio)
    except ValueError:
        min_ratio_float = 0.6
    rows = compute_matching(DATASET, min_match_ratio=min_ratio_float)
    return jsonify(_paginate(rows))


@app.route("/api/market/sales-orders", methods=["GET"])
def market_sales_orders() -> Any:
    rows = _filter_rows(DATASET["sales_orders"], {"crop": "crop", "status": "status", "buyer_name": "q"})
    rows = sorted(rows, key=lambda r: r["dispatch_date"], reverse=True)
    return jsonify(_paginate(rows))


@app.route("/api/market/sales-orders", methods=["POST"])
def market_create_sales_order() -> Any:
    denied = _require_permission("create_sales_order")
    if denied:
        return denied
    body = request.get_json(silent=True) or {}
    buyer_id = str(body.get("buyer_id", "")).strip()
    crop = str(body.get("crop", "")).strip()
    quantity_mt = float(body.get("quantity_mt", 0))
    price = float(body.get("price", body.get("offered_price", 0)))
    buyer_demand_id = str(body.get("buyer_demand_id", "")).strip() or None
    if not buyer_id or not crop or quantity_mt <= 0 or price <= 0:
        return jsonify({"error": "buyer_id, crop, quantity_mt (>0), and price (>0) are required"}), 400
    buyer = _find_buyer(buyer_id)
    if not buyer:
        return jsonify({"error": "Invalid buyer_id"}), 400
    buyer_demand = next((d for d in DATASET["buyer_demands"] if d["id"] == buyer_demand_id), None) if buyer_demand_id else None

    selected_collection_ids = [str(i).strip() for i in body.get("collection_ids", []) if str(i).strip()]
    selected_collections: list[dict[str, Any]] = []
    if selected_collection_ids:
        selected_collections = [
            c
            for c in DATASET["produce_collections"]
            if c["id"] in set(selected_collection_ids) and c["crop"] == crop and c.get("status") in {"graded", "allocated_to_order"}
        ]
    if not selected_collections:
        selected_collections = [
            c for c in DATASET["produce_collections"] if c["crop"] == crop and c.get("status") in {"graded", "allocated_to_order"}
        ]
    selected_collections.sort(key=lambda c: c["date"])

    allocated_qtl = 0.0
    used_collections: list[dict[str, Any]] = []
    for collection in selected_collections:
        used_collections.append(collection)
        allocated_qtl += float(collection["quantity_qtl"])
        if allocated_qtl / 10.0 >= quantity_mt:
            break
    allocated_mt = round(allocated_qtl / 10.0, 2)

    so = {
        "id": _next_id("SO", DATASET["sales_orders"]),
        "buyer_id": buyer["id"],
        "buyer_name": buyer["name"],
        "buyer_demand_id": buyer_demand_id,
        "crop": crop,
        "quantity_mt": quantity_mt,
        "price": price,
        "dispatch_date": body.get("dispatch_date", date.today().isoformat()),
        "status": "confirmed" if allocated_mt > 0 else "draft",
        "payment_status": "pending",
        "approval_status": "approved" if quantity_mt >= 80 else "not_required",
        "settlement_release_status": "not_required",
        "collection_ids": [c["id"] for c in used_collections],
        "dispatch_ids": [],
        "created_date": date.today().isoformat(),
        "source": str(body.get("source", "manual") or "manual"),
        "source_ref": body.get("source_ref"),
        "created_by_agent": bool(body.get("created_by_agent", False)),
    }
    DATASET["sales_orders"].append(so)
    for collection in used_collections:
        collection["sales_order_id"] = so["id"]
        collection["status"] = "allocated_to_order"

    if buyer_demand:
        buyer_demand["status"] = "closed" if allocated_mt >= quantity_mt else "matched"

    if quantity_mt >= 80:
        _append_approval(
            "sales_order",
            "sales_order",
            so["id"],
            "Large sales order auto-approved in demo mode.",
            status="approved",
            amount=quantity_mt,
        )
    _append_audit("sales_order", so["id"], "created", f"Sales order created from {len(used_collections)} collections.")
    return jsonify(
        {
            "status": "created",
            "sales_order": so,
            "allocated_mt": allocated_mt,
            "allocation_gap_mt": round(max(0.0, quantity_mt - allocated_mt), 2),
        }
    ), 201


@app.route("/api/market/dispatches", methods=["GET"])
def market_dispatches() -> Any:
    rows = _filter_rows(DATASET["dispatches"], {"sales_order_id": "sales_order_id", "delivery_status": "status"})
    rows = sorted(rows, key=lambda r: r["dispatch_date"], reverse=True)
    return jsonify(_paginate(rows))


@app.route("/api/market/dispatches", methods=["POST"])
def market_create_dispatch() -> Any:
    denied = _require_permission("create_dispatch")
    if denied:
        return denied
    body = request.get_json(silent=True) or {}
    sales_order_id = str(body.get("sales_order_id", "")).strip()
    qty_dispatched_mt = float(body.get("qty_dispatched_mt", 0))
    if not sales_order_id or qty_dispatched_mt <= 0:
        return jsonify({"error": "sales_order_id and qty_dispatched_mt (>0) are required"}), 400
    so = _find_sales_order(sales_order_id)
    if not so:
        return jsonify({"error": "sales_order_id not found"}), 404
    dispatch = {
        "id": _next_id("DSP", DATASET["dispatches"]),
        "sales_order_id": so["id"],
        "vehicle_no": str(body.get("vehicle_no", f"MH-14-{_id_suffix(_next_id('DSP', DATASET['dispatches'])):04d}")),
        "qty_dispatched_mt": round(qty_dispatched_mt, 2),
        "dispatch_date": body.get("dispatch_date", date.today().isoformat()),
        "delivery_status": str(body.get("delivery_status", "on_time")),
        "source": str(body.get("source", "manual") or "manual"),
        "source_ref": body.get("source_ref"),
        "created_by_agent": bool(body.get("created_by_agent", False)),
    }
    DATASET["dispatches"].append(dispatch)
    if dispatch["id"] not in so["dispatch_ids"]:
        so["dispatch_ids"].append(dispatch["id"])
    so["dispatch_date"] = dispatch["dispatch_date"]
    if so["status"] in {"draft", "confirmed"}:
        so["status"] = "dispatched"
    _append_audit("dispatch", dispatch["id"], "created", f"Dispatch raised for order {so['id']}.")
    return jsonify({"status": "created", "dispatch": dispatch, "sales_order": so}), 201


@app.route("/api/market/sales-orders/<order_id>/mark-paid", methods=["POST"])
def market_mark_sales_order_paid(order_id: str) -> Any:
    denied = _require_permission("mark_sales_paid")
    if denied:
        return denied
    so = _find_sales_order(order_id)
    if not so:
        return jsonify({"error": "sales order not found"}), 404
    if str(so.get("payment_status", "")).strip().lower() == "received":
        return jsonify({"error": "sales order payment is already recorded"}), 400
    blocker = _sales_order_payment_blocker(so)
    if blocker:
        return jsonify({"error": blocker}), 400
    so["payment_status"] = "received"
    so["status"] = "paid"
    _append_audit("sales_order", so["id"], "paid", "Buyer payment marked as received.")
    generated_settlements = []
    for collection_id in so.get("collection_ids", []):
        collection = _find_collection(collection_id)
        if not collection:
            continue
        generated_settlements.append(_create_settlement_from_collection(collection, so))
    if generated_settlements:
        so["settlement_release_status"] = "pending"
        _append_approval(
            "settlement_release",
            "sales_order",
            so["id"],
            f"Settlement release queue raised for {len(generated_settlements)} collections.",
            status="pending",
        )
    return jsonify({"status": "paid", "sales_order": so, "settlements_linked": len(generated_settlements)})


@app.route("/api/carbon/practices", methods=["GET"])
def carbon_practices() -> Any:
    rows = _filter_rows(DATASET["carbon_practices"], {"fpo_id": "fpo_id", "practice_type": "practice", "crop": "crop"})
    rows = sorted(
        rows,
        key=lambda row: (row.get("start_date", ""), _id_suffix(str(row.get("id", "")))),
        reverse=True,
    )
    return jsonify(_paginate(rows))


@app.route("/api/carbon/practices", methods=["POST"])
def carbon_create_practice() -> Any:
    denied = _require_permission("manage_carbon")
    if denied:
        return denied
    body = request.get_json(silent=True) or {}
    required = ["farmer_id", "practice_type", "area_ha"]
    missing = [field for field in required if not body.get(field)]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400
    farmer = _find_farmer(str(body["farmer_id"]))
    if not farmer:
        return jsonify({"error": "Invalid farmer_id"}), 400
    area_ha = float(body.get("area_ha", 0))
    if area_ha <= 0:
        return jsonify({"error": "area_ha must be > 0"}), 400

    practice = {
        "id": _next_id("CPRA", DATASET["carbon_practices"]),
        "farmer_id": farmer["id"],
        "fpo_id": farmer["fpo_id"],
        "crop": str(body.get("crop", farmer["primary_crop"])).strip(),
        "practice_type": str(body["practice_type"]).strip(),
        "area_ha": round(area_ha, 2),
        "start_date": body.get("start_date", date.today().isoformat()),
    }
    DATASET["carbon_practices"].append(practice)

    factor = 0.62
    if "drip" in practice["practice_type"].lower():
        factor = 0.72
    if "cover" in practice["practice_type"].lower():
        factor = 0.84
    estimate = {
        "id": _next_id("CEST", DATASET["carbon_estimates"]),
        "practice_id": practice["id"],
        "farmer_id": farmer["id"],
        "estimated_co2_tons": round(practice["area_ha"] * factor, 3),
        "calculation_date": date.today().isoformat(),
    }
    DATASET["carbon_estimates"].append(estimate)
    _append_audit("carbon_practice", practice["id"], "created", f"Practice logged for farmer {farmer['id']}.")
    return jsonify({"status": "created", "practice": practice, "estimate": estimate}), 201


@app.route("/api/carbon/estimates", methods=["GET"])
def carbon_estimates() -> Any:
    rows = DATASET["carbon_estimates"]
    fpo_id = request.args.get("fpo_id")
    if fpo_id:
        farmer_ids = {f["id"] for f in DATASET["farmers"] if f["fpo_id"] == fpo_id}
        rows = [r for r in rows if r["farmer_id"] in farmer_ids]
    rows = sorted(rows, key=lambda r: r["calculation_date"], reverse=True)
    return jsonify(_paginate(rows))


@app.route("/api/carbon/projects", methods=["GET"])
def carbon_projects() -> Any:
    rows = _filter_rows(DATASET["carbon_projects"], {"status": "status", "fpo_name": "q"})
    rows = sorted(rows, key=lambda row: _id_suffix(str(row.get("id", ""))), reverse=True)
    return jsonify(_paginate([_enrich_carbon_project(row) for row in rows]))


@app.route("/api/carbon/projects/<project_id>", methods=["GET"])
def carbon_project_detail(project_id: str) -> Any:
    project = _find_carbon_project(project_id)
    if not project:
        return jsonify({"error": "project not found"}), 404
    fpo_id = project["fpo_id"]
    practices = [p for p in DATASET["carbon_practices"] if p["fpo_id"] == fpo_id]
    practice_ids = {p["id"] for p in practices}
    estimates = [e for e in DATASET["carbon_estimates"] if e["practice_id"] in practice_ids]
    farmer_ids = {p["farmer_id"] for p in practices}
    farmers = [f for f in DATASET["farmers"] if f["id"] in farmer_ids][:40]
    readiness = _carbon_readiness_for_fpo(fpo_id)
    reasons = [
        f"Plot coverage is {readiness['plot_coverage_pct']}% based on logged practice area.",
        f"Practice completeness is {readiness['practice_completeness_pct']}% against member base.",
        f"Farmer participation currently stands at {readiness['farmer_participation_pct']}%.",
    ]
    return jsonify(
        {
            "project": _enrich_carbon_project(project),
            "readiness": readiness,
            "farmers": farmers,
            "practices": practices[:120],
            "estimates": estimates[:120],
            "readiness_reasons": reasons,
        }
    )


@app.route("/api/carbon/projects/<project_id>/advance", methods=["POST"])
def carbon_advance_project(project_id: str) -> Any:
    denied = _require_permission("manage_carbon")
    if denied:
        return denied
    project = _find_carbon_project(project_id)
    if not project:
        return jsonify({"error": "project not found"}), 404
    body = request.get_json(silent=True) or {}
    requested_status = str(body.get("status", "")).strip()
    transitions = {
        "screening": "verification_ready",
        "verification_ready": "aggregation_complete",
        "aggregation_complete": "aggregation_complete",
    }
    current = project["status"]
    next_status = requested_status if requested_status in transitions else transitions.get(current, "verification_ready")
    project["status"] = next_status
    _append_audit("carbon_project", project_id, "advanced", f"Project moved {current} -> {next_status}.")
    return jsonify({"status": "advanced", "project": _enrich_carbon_project(project), "from_status": current, "to_status": next_status})


@app.route("/api/reports/kpis", methods=["GET"])
def report_kpis() -> Any:
    dashboard = compute_dashboard(DATASET)
    total_demands = len(DATASET["input_demands"])
    completed_demands = sum(1 for d in DATASET["input_demands"] if d["status"] == "issued")
    capture_rate = round((completed_demands / total_demands) * 100, 2) if total_demands else 0.0
    settlement_paid = sum(1 for s in DATASET["settlements"] if s["payment_status"] == "paid")
    settlement_total = len(DATASET["settlements"])
    settlement_rate = round((settlement_paid / settlement_total) * 100, 2) if settlement_total else 0.0
    repeat_buyers = len({o["buyer_id"] for o in DATASET["sales_orders"]})
    return jsonify(
        {
            "headline": dashboard["headline"],
            "kpis": {
                "input_demand_completion_rate": capture_rate,
                "settlement_paid_rate": settlement_rate,
                "connected_buyers": len(DATASET["buyers"]),
                "repeat_buyers": repeat_buyers,
                "open_escalations": dashboard["headline"]["escalations_open"],
                "pending_approvals": sum(1 for a in DATASET["approval_logs"] if a["status"] == "pending"),
                "dispatches_recorded": len(DATASET["dispatches"]),
            },
        }
    )


def _report_rows(report_type: str) -> list[dict[str, Any]]:
    if report_type == "input_demand_by_village":
        counts: dict[tuple[str, str], int] = defaultdict(int)
        for row in DATASET["input_demands"]:
            counts[(row["fpo_id"], row["village"])] += int(row.get("requested_qty", 0))
        return [{"fpo_id": fpo_id, "village": village, "requested_qty": qty} for (fpo_id, village), qty in counts.items()]

    if report_type == "procurement_status":
        return [
            {
                "purchase_request_id": row["id"],
                "fpo_id": row["fpo_id"],
                "item_name": row["item_name"],
                "qty": row["total_qty"],
                "approval_status": row["approval_status"],
            }
            for row in DATASET["purchase_requests"]
        ]

    if report_type == "inventory_movement":
        return sorted(DATASET["inventory_transactions"], key=lambda r: r["txn_date"], reverse=True)

    if report_type == "settlement_ageing":
        today_dt = date.today()
        rows = []
        for row in DATASET["settlements"]:
            if row.get("payment_status") == "paid":
                continue
            collection = _find_collection(str(row.get("collection_id", "")))
            collection_date = collection.get("date") if collection else today_dt.isoformat()
            age_days = (today_dt - date.fromisoformat(collection_date)).days
            rows.append(
                {
                    "settlement_id": row["id"],
                    "farmer_id": row["farmer_id"],
                    "crop": row["crop"],
                    "net_amount": row["net_amount"],
                    "age_days": age_days,
                }
            )
        return sorted(rows, key=lambda r: r["age_days"], reverse=True)

    if report_type == "buyer_fulfillment":
        rows = []
        dispatch_count: dict[str, int] = defaultdict(int)
        for d in DATASET["dispatches"]:
            dispatch_count[d["sales_order_id"]] += 1
        for row in DATASET["sales_orders"]:
            rows.append(
                {
                    "sales_order_id": row["id"],
                    "buyer_name": row["buyer_name"],
                    "crop": row["crop"],
                    "quantity_mt": row["quantity_mt"],
                    "status": row["status"],
                    "payment_status": row["payment_status"],
                    "dispatch_count": dispatch_count.get(row["id"], 0),
                }
            )
        return rows

    if report_type == "carbon_readiness":
        return [_enrich_carbon_project(row) for row in DATASET["carbon_projects"]]

    if report_type == "audit_trail":
        return sorted(DATASET["audit_logs"], key=lambda r: r["timestamp"], reverse=True)

    raise ValueError(f"Unknown report type: {report_type}")


def _csv_export_response(rows: list[dict[str, Any]], filename: str) -> Any:
    output = StringIO()
    fieldnames = sorted({key for row in rows for key in row.keys()}) if rows else ["message"]
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    if rows:
        writer.writerows(rows)
    else:
        writer.writerow({"message": "No records found"})
    response = make_response(output.getvalue())
    response.headers["Content-Type"] = "text/csv; charset=utf-8"
    response.headers["Content-Disposition"] = f"attachment; filename={filename}"
    return response


@app.route("/api/reports/export", methods=["GET"])
def report_export() -> Any:
    denied = _require_permission("export_reports")
    if denied:
        return denied
    report_type = str(request.args.get("report", "inventory_movement")).strip().lower()
    fmt = str(request.args.get("format", "csv")).strip().lower()
    try:
        rows = _report_rows(report_type)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if fmt == "json":
        return jsonify({"report": report_type, "count": len(rows), "rows": rows})
    if fmt == "csv":
        return _csv_export_response(rows, f"{report_type}.csv")
    return jsonify({"error": "format must be csv or json"}), 400


@app.route("/api/admin/roles", methods=["GET"])
def admin_roles() -> Any:
    role = _actor_role()
    return jsonify(
        {
            "current_role": role,
            "roles": [{"name": r, "permissions": sorted(ROLE_PERMISSIONS[r])} for r in ROLE_ORDER],
            "permissions": sorted(ROLE_PERMISSIONS[role]),
        }
    )


@app.route("/api/admin/audit-logs", methods=["GET"])
def admin_audit_logs() -> Any:
    denied = _require_permission("view_audit")
    if denied:
        return denied
    rows = _filter_rows(DATASET["audit_logs"], {"entity": "entity", "action": "action", "notes": "q"})
    rows = sorted(rows, key=lambda r: r["timestamp"], reverse=True)
    return jsonify(_paginate(rows))


@app.route("/api/admin/approval-logs", methods=["GET"])
def admin_approval_logs() -> Any:
    denied = _require_permission("view_approvals")
    if denied:
        return denied
    rows = _filter_rows(DATASET["approval_logs"], {"status": "status", "approval_type": "type", "entity": "entity"})
    rows = sorted(rows, key=lambda r: r["requested_at"], reverse=True)
    return jsonify(_paginate(rows))


@app.route("/api/admin/approvals/<approval_id>/decide", methods=["POST"])
def admin_decide_approval(approval_id: str) -> Any:
    denied = _require_permission("decide_approvals")
    if denied:
        return denied
    body = request.get_json(silent=True) or {}
    decision = str(body.get("decision", "")).strip().lower()
    if decision not in {"approved", "rejected"}:
        return jsonify({"error": "decision must be approved or rejected"}), 400
    approval = next((row for row in DATASET["approval_logs"] if row["id"] == approval_id), None)
    if not approval:
        return jsonify({"error": "approval not found"}), 404
    approval["status"] = decision
    approval["decision_by"] = _actor_role()
    approval["decision_at"] = _utc_now()
    approval["notes"] = str(body.get("notes", approval.get("notes", "")))

    side_effects: dict[str, Any] = {}
    if approval["approval_type"] == "purchase_request":
        pr = next((row for row in DATASET["purchase_requests"] if row["id"] == approval["entity_id"]), None)
        if pr:
            po = _apply_purchase_request_decision(pr, decision)
            side_effects["purchase_request_status"] = pr.get("approval_status")
            if po:
                side_effects["purchase_order_id"] = po["id"]
    elif approval["approval_type"] == "settlement_release":
        released = _apply_settlement_release_decision(approval["entity_id"], decision)
        side_effects["settlements_released"] = released
    elif approval["approval_type"] == "sales_order":
        so = _find_sales_order(approval["entity_id"])
        if so:
            _set_sales_order_approval_status(so, decision)
            dispatch = None
            if decision == "approved" and so.get("source") == "agent":
                dispatch = _create_agent_dispatch(so, source_ref=approval_id)
            side_effects["sales_order_status"] = so.get("status")
            side_effects["sales_order_approval_status"] = so.get("approval_status")
            if dispatch:
                side_effects["dispatch_id"] = dispatch["id"]
    elif approval["approval_type"] == "large_input_issue":
        _set_input_issue_approval_status(approval["entity_id"], decision)
        side_effects["input_issue_approval_status"] = decision

    _append_audit("approval", approval_id, decision, f"{approval['approval_type']} decision recorded.")
    return jsonify({"status": "updated", "approval": approval, "side_effects": side_effects})


def _decide_single_approval(approval_id: str, decision: str, notes: str) -> dict[str, Any]:
    approval = next((row for row in DATASET["approval_logs"] if row["id"] == approval_id), None)
    if not approval:
        return {"id": approval_id, "ok": False, "error": "not_found"}
    if approval.get("status") != "pending":
        return {"id": approval_id, "ok": False, "error": "already_decided"}
    approval["status"] = decision
    approval["decision_by"] = _actor_role()
    approval["decision_at"] = _utc_now()
    approval["notes"] = notes or approval.get("notes", "")
    side_effects: dict[str, Any] = {}
    if approval["approval_type"] == "purchase_request":
        pr = next((row for row in DATASET["purchase_requests"] if row["id"] == approval["entity_id"]), None)
        if pr:
            po = _apply_purchase_request_decision(pr, decision)
            side_effects["purchase_request_status"] = pr.get("approval_status")
            if po:
                side_effects["purchase_order_id"] = po["id"]
    elif approval["approval_type"] == "settlement_release":
        side_effects["settlements_released"] = _apply_settlement_release_decision(approval["entity_id"], decision)
    elif approval["approval_type"] == "sales_order":
        so = _find_sales_order(approval["entity_id"])
        if so:
            _set_sales_order_approval_status(so, decision)
            dispatch = None
            if decision == "approved" and so.get("source") == "agent":
                dispatch = _create_agent_dispatch(so, source_ref=approval_id)
            side_effects["sales_order_approval_status"] = so.get("approval_status")
            if dispatch:
                side_effects["dispatch_id"] = dispatch["id"]
    elif approval["approval_type"] == "large_input_issue":
        _set_input_issue_approval_status(approval["entity_id"], decision)
        side_effects["input_issue_approval_status"] = decision
    _append_audit("approval", approval_id, decision, f"{approval['approval_type']} decision recorded (bulk).")
    return {"id": approval_id, "ok": True, "approval": approval, "side_effects": side_effects}


@app.route("/api/admin/approvals/bulk-decide", methods=["POST"])
def admin_bulk_decide_approvals() -> Any:
    denied = _require_permission("decide_approvals")
    if denied:
        return denied
    body = request.get_json(silent=True) or {}
    ids = [str(x) for x in (body.get("ids") or []) if str(x).strip()]
    decision = str(body.get("decision", "")).strip().lower()
    notes = str(body.get("notes", ""))
    if decision not in {"approved", "rejected"}:
        return jsonify({"error": "decision must be approved or rejected"}), 400
    if not ids:
        return jsonify({"error": "ids required"}), 400
    results = [_decide_single_approval(i, decision, notes) for i in ids]
    return jsonify({"status": "ok", "count": sum(1 for r in results if r.get("ok")), "results": results})


@app.route("/api/operations/purchase-requests/bulk-approve", methods=["POST"])
def bulk_approve_purchase_requests() -> Any:
    denied = _require_permission("approve_pr")
    if denied:
        return denied
    body = request.get_json(silent=True) or {}
    ids = [str(x) for x in (body.get("ids") or []) if str(x).strip()]
    if not ids:
        return jsonify({"error": "ids required"}), 400
    results = []
    for pr_id in ids:
        pr = next((row for row in DATASET["purchase_requests"] if row["id"] == pr_id), None)
        if not pr:
            results.append({"id": pr_id, "ok": False, "error": "not_found"})
            continue
        if pr.get("approval_status") != "pending":
            results.append({"id": pr_id, "ok": False, "error": f"not_pending:{pr.get('approval_status', 'unknown')}"})
            continue
        po = _apply_purchase_request_decision(pr, "approved")
        approval = _latest_pending_approval("purchase_request", pr["id"])
        if approval:
            approval["status"] = "approved"
            approval["decision_by"] = _actor_role()
            approval["decision_at"] = _utc_now()
            approval["notes"] = "PR bulk-approved."
        _append_audit("purchase_request", pr["id"], "approved", "PR bulk-approved.")
        results.append({"id": pr_id, "ok": True, "purchase_order_id": po["id"] if po else None})
    return jsonify({"status": "ok", "count": sum(1 for r in results if r.get("ok")), "results": results})


@app.route("/api/operations/settlements/bulk-mark-paid", methods=["POST"])
def bulk_mark_settlements_paid() -> Any:
    denied = _require_permission("release_settlement")
    if denied:
        return denied
    body = request.get_json(silent=True) or {}
    ids = [str(x) for x in (body.get("ids") or []) if str(x).strip()]
    if not ids:
        return jsonify({"error": "ids required"}), 400
    results = []
    for sid in ids:
        settlement = next((row for row in DATASET["settlements"] if row["id"] == sid), None)
        if not settlement:
            results.append({"id": sid, "ok": False, "error": "not_found"})
            continue
        if settlement.get("payment_status") == "paid":
            results.append({"id": sid, "ok": False, "error": "already_paid"})
            continue
        blocker = _settlement_release_blocker(settlement)
        if blocker:
            results.append({"id": sid, "ok": False, "error": blocker})
            continue
        settlement["payment_status"] = "paid"
        settlement["payment_date"] = date.today().isoformat()
        collection = _find_collection(str(settlement.get("collection_id", "")))
        if collection:
            collection["status"] = "settled"
        _append_audit("settlement", settlement["id"], "paid", "Settlement bulk-marked paid.")
        results.append({"id": sid, "ok": True})
    return jsonify({"status": "ok", "count": sum(1 for r in results if r.get("ok")), "results": results})


@app.route("/api/demo/script", methods=["GET"])
def demo_script() -> Any:
    return jsonify({"steps": DEMO_STEPS})


@app.route("/api/demo/run-step", methods=["POST"])
def demo_run_step() -> Any:
    denied = _require_permission("run_demo")
    if denied:
        return denied
    body = request.get_json(silent=True) or {}
    step_id = str(body.get("step_id", "")).strip()
    if not step_id:
        return jsonify({"error": "step_id is required"}), 400

    if step_id == "step_registry_add_farmer":
        farmer, error = _create_farmer(
            {
                "fpo_id": DATASET["fpos"][0]["id"],
                "name": f"Demo Farmer {_id_suffix(_next_id('FARM', DATASET['farmers']))}",
                "village": DATASET["villages"][0]["name"],
                "primary_crop": "Onion",
                "land_size_ha": 2.4,
                "irrigation_type": "Drip",
                "soil_type": "Loam",
                "language": "Marathi",
            }
        )
        if error:
            return jsonify({"error": error}), 400
        return jsonify({"status": "ok", "section": "registry", "summary": f"Created farmer {farmer['id']}."})

    if step_id == "step_operations_procurement":
        item = DATASET["inputs_catalog"][0]
        supplier = DATASET["suppliers"][0]
        fpo = DATASET["fpos"][0]
        pr = {
            "id": _next_id("PR", DATASET["purchase_requests"]),
            "fpo_id": fpo["id"],
            "item_id": item["id"],
            "item_name": item["name"],
            "total_qty": 125,
            "supplier_id": supplier["id"],
            "supplier_name": supplier["name"],
            "approval_status": "approved",
            "expected_date": (date.today() + timedelta(days=5)).isoformat(),
        }
        DATASET["purchase_requests"].append(pr)
        po = _create_purchase_order_from_pr(pr)
        return jsonify({"status": "ok", "section": "operations", "summary": f"Created PR {pr['id']} and PO {po['id']}."})

    if step_id == "step_market_demand":
        buyer = DATASET["buyers"][0]
        demand = {
            "id": _next_id("BDEM", DATASET["buyer_demands"]),
            "buyer_id": buyer["id"],
            "buyer_name": buyer["name"],
            "crop": "Tomato",
            "quantity_mt": 75.0,
            "offered_price": 2320.0,
            "required_date": (date.today() + timedelta(days=5)).isoformat(),
            "delivery_location": buyer["district"],
            "status": "open",
        }
        DATASET["buyer_demands"].append(demand)
        return jsonify({"status": "ok", "section": "market", "summary": f"Created buyer demand {demand['id']}."})

    if step_id == "step_communication_whatsapp":
        farmer = DATASET["farmers"][0]
        result = _simulate_whatsapp(farmer["id"], "Need 5 bags urea next week.")
        return jsonify({"status": "ok", "section": "communication", "summary": "Mock WhatsApp simulated.", "details": result})

    if step_id == "step_settlement_paid":
        pending = next((row for row in DATASET["settlements"] if row["payment_status"] != "paid"), None)
        if not pending:
            return jsonify({"status": "ok", "section": "operations", "summary": "No pending settlement found."})
        pending["payment_status"] = "paid"
        pending["payment_date"] = date.today().isoformat()
        return jsonify({"status": "ok", "section": "operations", "summary": f"Settlement {pending['id']} marked paid."})

    if step_id == "step_carbon_progress":
        project = DATASET["carbon_projects"][0]
        transition = {
            "screening": "verification_ready",
            "verification_ready": "aggregation_complete",
            "aggregation_complete": "aggregation_complete",
        }
        old = project["status"]
        project["status"] = transition.get(old, "verification_ready")
        return jsonify({"status": "ok", "section": "carbon", "summary": f"Project moved {old} -> {project['status']}."})

    return jsonify({"error": f"Unknown step_id: {step_id}"}), 400


@app.route("/api/admin/seed", methods=["POST"])
def admin_seed() -> Any:
    denied = _require_permission("reseed")
    if denied:
        return denied
    global DATASET
    body = request.get_json(silent=True) or {}
    seed = body.get("seed", 42)
    profile = str(body.get("profile", DATASET.get("data_profile", "full_data"))).strip() or "full_data"
    try:
        parsed_seed = int(seed)
    except ValueError:
        return jsonify({"error": "seed must be an integer"}), 400
    if profile not in DATASET_PROFILES:
        return jsonify({"error": f"Unknown profile '{profile}'."}), 400
    DATASET = _normalize_dataset(generate_dataset(parsed_seed, profile=profile))
    _persist_dataset()
    return jsonify({"status": "reseeded", "seed": parsed_seed, "data_profile": profile, "generated_at": DATASET["generated_at"]})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    debug = str(os.environ.get("FLASK_DEBUG", "")).strip().lower() in {"1", "true", "yes", "on"}
    app.run(host="0.0.0.0", port=port, debug=debug)
