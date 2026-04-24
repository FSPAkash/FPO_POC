from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
import random
from typing import Any


@dataclass(frozen=True)
class CropConfig:
    name: str
    base_price: int
    demand_unit: str
    carbon_factor: float


CROPS = [
    CropConfig("Onion", 1650, "bag", 0.9),
    CropConfig("Tomato", 2200, "crate", 0.7),
    CropConfig("Soybean", 4800, "quintal", 0.6),
    CropConfig("Cotton", 6200, "quintal", 0.8),
    CropConfig("Pomegranate", 7400, "crate", 0.5),
]

INPUT_ITEMS = [
    ("Urea", "fertilizer"),
    ("DAP", "fertilizer"),
    ("Potash", "fertilizer"),
    ("Fungicide A", "pesticide"),
    ("Pesticide B", "pesticide"),
    ("Hybrid Seed C", "seed"),
]

PRACTICES = [
    "Reduced Tillage",
    "Drip Irrigation",
    "Cover Cropping",
    "Organic Manure",
    "Residue Retention",
]

LANGS = ["Marathi", "Hindi", "English"]

DATASET_PROFILES = {
    "full_data": "Full Data",
    "agentic_work": "Agentic Work",
}

# Realistic farmer WhatsApp message templates keyed by intent
FARMER_MESSAGES: dict[str, list[str]] = {
    "price_query": [
        "Hello, what is today's market rate for {crop} at {mandi}? I have about 8 quintals ready.",
        "Please send me today's {crop} price. I am going to the market tomorrow.",
        "I have 12 quintals of {crop} from {village}. What is the current rate at {mandi}?",
        "Good morning. What is the going rate for {crop} today? Should I sell now or wait?",
        "A buyer is coming tomorrow. Can you tell me the best price for {crop} right now?",
        "I need the {crop} mandi rate urgently. My vehicle is ready to load.",
    ],
    "input_request": [
        "I need 5 bags of Urea this week. Is stock available at the collection center?",
        "Please book 3 bags of DAP for my {crop} field. Do you have stock?",
        "I need 2 packets of Hybrid Seed C for the next season. When will it arrive?",
        "I need 4 units of Fungicide A. My {crop} crop is showing some problems.",
        "I want to order 6 bags of Potash. Last time it came quickly.",
        "Can you arrange 8 bags of DAP for {crop}? When can it be delivered to {village}?",
        "Urgent — I need 10 bags of Urea. Is it available?",
    ],
    "disease_query": [
        "The leaves on my {crop} plants are turning yellow. What should I do?",
        "I am seeing white spots on my {crop}. Is this a disease?",
        "There are insects on my crop. I will send a photo. What spray should I use?",
        "The leaves of my {crop} are curling and falling off. I am very worried.",
        "Emergency — there is something like fungus on an entire row of {crop}. What should I do now?",
        "My {crop} colour is changing and growth has stopped. Please send a field officer.",
    ],
    "advisory": [
        "Should I irrigate my {crop} field this week or wait? Is there a chance of rain?",
        "Which fertilizer is best for {crop} this season?",
        "Please send me a spray schedule for {crop}. Last time I did it every 15 days.",
        "What is the right time to harvest {crop}? Please give some guidance.",
        "When will soil testing happen in {village}? I need to know my land pH.",
    ],
    "broadcast_ack": [
        "Received your message. Understood, thank you.",
        "OK, noted. Thank you.",
        "I will come to the collection center tomorrow as advised.",
        "Received. Will follow the instructions.",
        "Message received. OK.",
    ],
}

OFFICE_REPLIES: dict[str, list[str]] = {
    "price_query": [
        "{crop} rate today at {mandi}: INR {min}–{max} per quintal. Good time to sell.",
        "Rate update: {crop} at {mandi} — min INR {min}, max INR {max}/qtl. Volume is strong today.",
        "Today's {crop} mandi price ({mandi}): INR {min}–{max}/qtl. Similar rates expected tomorrow.",
    ],
    "input_request": [
        "Your order is registered. {item} is in stock and will be ready in 3–4 days.",
        "Order raised. {item} will be dispatched from the {village} center this week.",
        "Order noted. {item} delivery in 2–3 working days. Please collect from the center.",
    ],
    "disease_query": [
        "A field officer will visit tomorrow for inspection. Please do not spray until then.",
        "Your case has been escalated. An agronomist will contact you within 24 hours.",
        "Disease case registered. A field visit is being scheduled for your plot.",
    ],
    "advisory": [
        "Avoid irrigation this week — rain is forecast in 3 days.",
        "Recommended for {crop} this season: DAP and Potash mix at 2:1 ratio.",
        "Harvesting window: the next 10–12 days are suitable. Check moisture levels first.",
    ],
    "broadcast_ack": [
        "Thank you for confirming.",
        "Acknowledged. Your response has been recorded.",
    ],
}
IRRIGATION_TYPES = ["Drip", "Canal", "Rainfed", "Borewell"]
SOILS = ["Loam", "Clay", "Sandy Loam", "Black Soil"]
BUYER_TYPES = ["Processor", "Wholesaler", "Retail Chain", "Exporter"]
SEVERITY = ["HIGH", "MEDIUM", "NORMAL"]
INTENTS = ["price_query", "input_request", "advisory", "disease_query", "broadcast_ack"]


def _rid(prefix: str, index: int) -> str:
    return f"{prefix}_{index:04d}"


def _pick(rng: random.Random, values: list[Any]) -> Any:
    return values[rng.randrange(0, len(values))]


def generate_full_dataset(seed: int = 42) -> dict[str, Any]:
    rng = random.Random(seed)
    today = date.today()

    states = [
        {"id": "ST_MH", "name": "Maharashtra"},
        {"id": "ST_MP", "name": "Madhya Pradesh"},
    ]
    districts = [
        {"id": "DI_NSK", "state_id": "ST_MH", "name": "Nashik"},
        {"id": "DI_PUN", "state_id": "ST_MH", "name": "Pune"},
        {"id": "DI_IND", "state_id": "ST_MP", "name": "Indore"},
        {"id": "DI_UJJ", "state_id": "ST_MP", "name": "Ujjain"},
    ]
    villages = []
    village_names = [
        "Chandori",
        "Pimpalgaon",
        "Yeola",
        "Sinnar",
        "Baramati",
        "Junnar",
        "Daund",
        "Shirur",
        "Depalpur",
        "Sanwer",
        "Mhow",
        "Rau",
        "Mahidpur",
        "Tarana",
        "Badnagar",
        "Khachrod",
    ]
    for i, district in enumerate(districts):
        for j in range(4):
            idx = i * 4 + j
            villages.append(
                {
                    "id": f"VI_{district['id']}_{j+1}",
                    "district_id": district["id"],
                    "name": village_names[idx],
                }
            )

    fpos = []
    for i in range(8):
        district = districts[i % len(districts)]
        village_group = [v["name"] for v in villages if v["district_id"] == district["id"]][:3]
        crop_focus = [CROPS[i % len(CROPS)].name, CROPS[(i + 1) % len(CROPS)].name]
        fpos.append(
            {
                "id": _rid("FPO", i + 1),
                "name": f"Krishi Collective {i + 1}",
                "district_id": district["id"],
                "district": district["name"],
                "state_id": district["state_id"],
                "state": next(s["name"] for s in states if s["id"] == district["state_id"]),
                "village_cluster": village_group,
                "warehouse_capacity_mt": rng.randint(120, 420),
                "primary_crops": crop_focus,
                "members_count": 0,
                "contact_person": f"Manager {i + 1}",
            }
        )

    farmers = []
    plots = []
    seasons = []
    communication_profiles = []
    farmer_count = 0
    plot_count = 0
    season_count = 0

    for i, fpo in enumerate(fpos):
        fpo_villages = [v for v in villages if v["district_id"] == fpo["district_id"]]
        fpo_members = rng.randint(120, 230)
        fpo["members_count"] = fpo_members
        for _ in range(fpo_members):
            farmer_count += 1
            village = _pick(rng, fpo_villages)
            crop = _pick(rng, CROPS)
            farmer_id = _rid("FARM", farmer_count)
            land_size = round(rng.uniform(1.2, 4.8), 2)
            farmer = {
                "id": farmer_id,
                "fpo_id": fpo["id"],
                "fpo_name": fpo["name"],
                "name": f"Farmer {farmer_count}",
                "village": village["name"],
                "land_size_ha": land_size,
                "irrigation_type": _pick(rng, IRRIGATION_TYPES),
                "soil_type": _pick(rng, SOILS),
                "primary_crop": crop.name,
                "phone": f"+91-90000{farmer_count:05d}",
                "language": _pick(rng, LANGS),
            }
            farmers.append(farmer)
            communication_profiles.append(
                {
                    "farmer_id": farmer_id,
                    "language": farmer["language"],
                    "preferred_mode": "voice" if rng.random() < 0.45 else "text",
                    "whatsapp_opt_in": rng.random() < 0.88,
                }
            )

            num_plots = rng.randint(1, 3)
            for p in range(num_plots):
                plot_count += 1
                area = round(land_size / num_plots * rng.uniform(0.9, 1.1), 2)
                center_lat = 19.5 + rng.random() * 4.0
                center_lng = 73.0 + rng.random() * 3.2
                plot_id = _rid("PLOT", plot_count)
                polygon = [
                    [round(center_lat, 5), round(center_lng, 5)],
                    [round(center_lat + 0.004, 5), round(center_lng, 5)],
                    [round(center_lat + 0.004, 5), round(center_lng + 0.004, 5)],
                    [round(center_lat, 5), round(center_lng + 0.004, 5)],
                ]
                plots.append(
                    {
                        "id": plot_id,
                        "farmer_id": farmer_id,
                        "fpo_id": fpo["id"],
                        "crop_current": crop.name,
                        "area_ha": area,
                        "soil_type": farmer["soil_type"],
                        "irrigation_source": farmer["irrigation_type"],
                        "polygon": polygon,
                    }
                )

                for year_offset in (0, 1):
                    season_count += 1
                    sowing = today - timedelta(days=140 + year_offset * 340 + rng.randint(0, 20))
                    expected_harvest = sowing + timedelta(days=100 + rng.randint(-10, 18))
                    seasons.append(
                        {
                            "id": _rid("SEASON", season_count),
                            "plot_id": plot_id,
                            "farmer_id": farmer_id,
                            "fpo_id": fpo["id"],
                            "crop_name": crop.name,
                            "sowing_date": sowing.isoformat(),
                            "expected_harvest": expected_harvest.isoformat(),
                            "seed_variety": f"{crop.name} Variety {rng.randint(1, 6)}",
                        }
                    )

    inputs_catalog = []
    for i, item in enumerate(INPUT_ITEMS):
        inputs_catalog.append(
            {
                "id": _rid("INPUT", i + 1),
                "name": item[0],
                "category": item[1],
                "unit": "bag" if item[1] == "fertilizer" else "unit",
                "base_rate": rng.randint(480, 2200),
            }
        )

    suppliers = []
    for i in range(18):
        suppliers.append(
            {
                "id": _rid("SUP", i + 1),
                "name": f"Supplier {i + 1}",
                "lead_time_days": rng.randint(2, 8),
                "credit_terms_days": _pick(rng, [7, 15, 30]),
                "district_id": _pick(rng, districts)["id"],
            }
        )

    input_demands = []
    purchase_requests = []
    purchase_orders = []
    goods_receipts = []
    inventory_transactions = []
    farmer_input_issues = []
    produce_collections = []
    settlements = []
    audit_logs = []

    inventory_balance: dict[tuple[str, str], int] = defaultdict(int)

    for i in range(720):
        farmer = _pick(rng, farmers)
        input_item = _pick(rng, inputs_catalog)
        demand_qty = rng.randint(1, 8)
        demand_date = today - timedelta(days=rng.randint(1, 35))
        demand = {
            "id": _rid("DEM", i + 1),
            "farmer_id": farmer["id"],
            "fpo_id": farmer["fpo_id"],
            "village": farmer["village"],
            "crop": farmer["primary_crop"],
            "item_id": input_item["id"],
            "item_name": input_item["name"],
            "requested_qty": demand_qty,
            "status": _pick(rng, ["captured", "aggregated", "procured", "issued"]),
            "request_date": demand_date.isoformat(),
            "issue_ids": [],
            "aggregated_at": None,
            "procured_at": None,
        }
        input_demands.append(demand)

    # Consolidate purchase requests by FPO + item
    aggregate_map: dict[tuple[str, str], dict[str, Any]] = defaultdict(lambda: {"qty": 0, "demand_ids": []})
    for dem in input_demands:
        if dem["status"] != "captured":
            aggregate_map[(dem["fpo_id"], dem["item_id"])]["qty"] += dem["requested_qty"]
            aggregate_map[(dem["fpo_id"], dem["item_id"])]["demand_ids"].append(dem["id"])

    pr_count = 0
    po_count = 0
    grn_count = 0
    inv_count = 0
    issue_count = 0
    collect_count = 0
    settlement_count = 0

    for (fpo_id, item_id), aggregate in aggregate_map.items():
        qty = int(aggregate["qty"])
        if qty < 20:
            continue
        pr_count += 1
        supplier = _pick(rng, suppliers)
        approval = _pick(rng, ["approved", "pending", "approved", "approved"])
        pr = {
            "id": _rid("PR", pr_count),
            "fpo_id": fpo_id,
            "item_id": item_id,
            "item_name": next(i["name"] for i in inputs_catalog if i["id"] == item_id),
            "total_qty": qty,
            "supplier_id": supplier["id"],
            "supplier_name": supplier["name"],
            "approval_status": approval,
            "input_demand_ids": aggregate["demand_ids"][:60],
            "expected_date": (today + timedelta(days=supplier["lead_time_days"])).isoformat(),
        }
        purchase_requests.append(pr)

        audit_logs.append(
            {
                "id": _rid("AUD", len(audit_logs) + 1),
                "entity": "purchase_request",
                "entity_id": pr["id"],
                "action": "created",
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "notes": f"PR created for {pr['item_name']}",
            }
        )

        if approval != "approved":
            continue
        for demand_id in pr["input_demand_ids"]:
            linked = next((row for row in input_demands if row["id"] == demand_id), None)
            if linked and linked["status"] in {"captured", "aggregated"}:
                linked["status"] = "procured"
                linked["procured_at"] = datetime.utcnow().isoformat() + "Z"

        po_count += 1
        rate = next(i["base_rate"] for i in inputs_catalog if i["id"] == item_id)
        po_qty = int(qty * rng.uniform(0.85, 1.08))
        po = {
            "id": _rid("PO", po_count),
            "fpo_id": fpo_id,
            "pr_id": pr["id"],
            "supplier_id": supplier["id"],
            "item_id": item_id,
            "item_name": pr["item_name"],
            "qty_ordered": po_qty,
            "rate": rate,
            "delivery_status": _pick(rng, ["received", "in_transit", "received"]),
            "order_date": (today - timedelta(days=rng.randint(4, 20))).isoformat(),
        }
        purchase_orders.append(po)

        if po["delivery_status"] != "received":
            continue

        grn_count += 1
        damaged = rng.randint(0, max(1, int(po_qty * 0.03)))
        qty_received = po_qty - damaged
        grn = {
            "id": _rid("GRN", grn_count),
            "po_id": po["id"],
            "fpo_id": fpo_id,
            "item_id": item_id,
            "item_name": po["item_name"],
            "qty_received": qty_received,
            "damaged_qty": damaged,
            "receipt_date": (today - timedelta(days=rng.randint(1, 12))).isoformat(),
        }
        goods_receipts.append(grn)

        inventory_key = (fpo_id, item_id)
        inventory_balance[inventory_key] += qty_received
        inv_count += 1
        inventory_transactions.append(
            {
                "id": _rid("INV", inv_count),
                "fpo_id": fpo_id,
                "item_id": item_id,
                "item_name": po["item_name"],
                "txn_type": "stock_in",
                "qty": qty_received,
                "reference_id": grn["id"],
                "txn_date": grn["receipt_date"],
            }
        )

    # Input issue transactions
    for dem in input_demands[:500]:
        key = (dem["fpo_id"], dem["item_id"])
        if inventory_balance[key] <= 0:
            continue
        issue_qty = min(dem["requested_qty"], max(1, int(inventory_balance[key] * 0.02)))
        if issue_qty <= 0:
            continue
        inventory_balance[key] -= issue_qty
        issue_count += 1
        issue = {
            "id": _rid("ISSUE", issue_count),
            "farmer_id": dem["farmer_id"],
            "fpo_id": dem["fpo_id"],
            "item_id": dem["item_id"],
            "item_name": dem["item_name"],
            "qty_issued": issue_qty,
            "issue_date": (today - timedelta(days=rng.randint(0, 9))).isoformat(),
            "acknowledged": rng.random() < 0.9,
        }
        farmer_input_issues.append(issue)
        dem["status"] = "issued"
        dem["issue_ids"].append(issue["id"])
        inv_count += 1
        inventory_transactions.append(
            {
                "id": _rid("INV", inv_count),
                "fpo_id": dem["fpo_id"],
                "item_id": dem["item_id"],
                "item_name": dem["item_name"],
                "txn_type": "stock_out",
                "qty": issue_qty,
                "reference_id": issue["id"],
                "txn_date": issue["issue_date"],
            }
        )

    buyers = []
    for i in range(32):
        district = _pick(rng, districts)
        buyer_type = _pick(rng, BUYER_TYPES)
        crop_choices = [CROPS[(i + j) % len(CROPS)].name for j in range(2)]
        buyers.append(
            {
                "id": _rid("BUY", i + 1),
                "name": f"{buyer_type} Network {i + 1}",
                "buyer_type": buyer_type,
                "district": district["name"],
                "crop_categories": crop_choices,
                "payment_terms_days": _pick(rng, [7, 10, 15, 21]),
                "reliability_score": round(rng.uniform(3.2, 4.9), 2),
            }
        )

    buyer_demands = []
    market_prices = []
    sales_orders = []
    dispatches = []
    carbon_practices = []
    carbon_estimates = []
    carbon_projects = []
    message_logs = []
    chat_threads: list[dict[str, Any]] = []
    advisory_logs = []
    disease_logs = []
    escalations = []

    # Price series
    for day in range(180):
        d = today - timedelta(days=day)
        for crop in CROPS:
            for market in ["Nashik", "Pune", "Indore", "Ujjain", "Mumbai", "Nagpur"]:
                price_avg = crop.base_price + rng.randint(-250, 320)
                market_prices.append(
                    {
                        "id": _rid("MKT", len(market_prices) + 1),
                        "crop": crop.name,
                        "mandi": market,
                        "price_min": price_avg - rng.randint(50, 120),
                        "price_max": price_avg + rng.randint(80, 140),
                        "price_avg": price_avg,
                        "volume_traded_qtl": rng.randint(90, 850),
                        "date": d.isoformat(),
                    }
                )

    for i in range(90):
        buyer = _pick(rng, buyers)
        crop = _pick(rng, [c for c in CROPS if c.name in buyer["crop_categories"]])
        buyer_demands.append(
            {
                "id": _rid("BDEM", i + 1),
                "buyer_id": buyer["id"],
                "buyer_name": buyer["name"],
                "crop": crop.name,
                "quantity_mt": rng.randint(12, 140),
                "offered_price": crop.base_price + rng.randint(-160, 280),
                "required_date": (today + timedelta(days=rng.randint(1, 20))).isoformat(),
                "delivery_location": buyer["district"],
                "status": _pick(rng, ["open", "open", "matched", "closed"]),
            }
        )

    # Produce, settlements, and sales
    for i in range(560):
        farmer = _pick(rng, farmers)
        crop_name = farmer["primary_crop"]
        grade = _pick(rng, ["A", "B", "C"])
        qty = round(rng.uniform(6.0, 28.0), 2)
        collection_date = today - timedelta(days=rng.randint(1, 45))
        collect_count += 1
        collection = {
            "id": _rid("COLL", collect_count),
            "farmer_id": farmer["id"],
            "farmer_name": farmer["name"],
            "fpo_id": farmer["fpo_id"],
            "crop": crop_name,
            "grade": grade,
            "quantity_qtl": qty,
            "collection_center": f"{farmer['village']} Center",
            "date": collection_date.isoformat(),
            "moisture_pct": round(rng.uniform(8.0, 16.0), 1),
            "status": _pick(rng, ["graded", "graded", "allocated_to_order", "settled"]),
            "sales_order_id": None,
        }
        produce_collections.append(collection)

        settlement_count += 1
        crop_cfg = next(c for c in CROPS if c.name == crop_name)
        rate = crop_cfg.base_price + rng.randint(-140, 190)
        gross = round(rate * qty, 2)
        deductions = round(gross * rng.uniform(0.0, 0.06), 2)
        settlements.append(
            {
                "id": _rid("SET", settlement_count),
                "collection_id": collection["id"],
                "sales_order_id": None,
                "farmer_id": farmer["id"],
                "crop": crop_name,
                "gross_amount": gross,
                "deductions": deductions,
                "net_amount": round(gross - deductions, 2),
                "payment_status": _pick(rng, ["paid", "paid", "pending"]),
                "payment_date": today.isoformat() if rng.random() < 0.6 else None,
            }
        )

    for i in range(72):
        demand = _pick(rng, buyer_demands)
        if demand["status"] not in {"matched", "closed", "open"}:
            continue
        order_qty = round(demand["quantity_mt"] * rng.uniform(0.65, 1.0), 2)
        sales_orders.append(
            {
                "id": _rid("SO", i + 1),
                "buyer_id": demand["buyer_id"],
                "buyer_name": demand["buyer_name"],
                "crop": demand["crop"],
                "quantity_mt": order_qty,
                "price": demand["offered_price"],
                "dispatch_date": (today - timedelta(days=rng.randint(0, 15))).isoformat(),
                "status": _pick(rng, ["dispatched", "confirmed", "delivered", "paid"]),
                "payment_status": _pick(rng, ["pending", "received", "received"]),
                "collection_ids": [],
                "dispatch_ids": [],
                "created_date": (today - timedelta(days=rng.randint(10, 35))).isoformat(),
            }
        )

    for i, so in enumerate(sales_orders, start=1):
        dispatches.append(
            {
                "id": _rid("DSP", i),
                "sales_order_id": so["id"],
                "vehicle_no": f"MH-{rng.randint(10, 50)}-{rng.randint(1000, 9999)}",
                "qty_dispatched_mt": so["quantity_mt"],
                "dispatch_date": so["dispatch_date"],
                "delivery_status": _pick(rng, ["on_time", "on_time", "delayed"]),
            }
        )
        so["dispatch_ids"].append(_rid("DSP", i))
        if so["status"] in {"draft", "confirmed"}:
            so["status"] = "dispatched"

    collections_by_crop: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for collection in produce_collections:
        if collection["status"] in {"graded", "allocated_to_order"}:
            collections_by_crop[collection["crop"]].append(collection)
    for so in sales_orders:
        pool = collections_by_crop.get(so["crop"], [])
        rng.shuffle(pool)
        allocated_qtl = 0.0
        for collection in pool[:40]:
            if collection.get("sales_order_id"):
                continue
            so["collection_ids"].append(collection["id"])
            collection["sales_order_id"] = so["id"]
            collection["status"] = "allocated_to_order"
            settlement = next((row for row in settlements if row["collection_id"] == collection["id"]), None)
            if settlement:
                settlement["sales_order_id"] = so["id"]
            allocated_qtl += collection["quantity_qtl"]
            if allocated_qtl / 10.0 >= so["quantity_mt"]:
                break

    for i in range(1000):
        farmer = _pick(rng, farmers)
        intent = _pick(rng, INTENTS)
        confidence = round(rng.uniform(0.52, 0.97), 2)
        msg_status = "resolved" if confidence > 0.75 else "pending"
        msg_timestamp = datetime.utcnow() - timedelta(hours=rng.randint(1, 220))
        msg_timestamp_iso = msg_timestamp.isoformat() + "Z"

        # Build realistic farmer message text
        tpl = _pick(rng, FARMER_MESSAGES[intent])
        market_row = next(
            (r for r in sorted(market_prices, key=lambda x: x["date"], reverse=True) if r["crop"] == farmer["primary_crop"]),
            {"mandi": "Nashik", "price_min": 1500, "price_max": 1900},
        )
        msg_text = (
            tpl.replace("{crop}", farmer["primary_crop"])
               .replace("{village}", farmer["village"])
               .replace("{mandi}", market_row["mandi"])
               .replace("{item}", _pick(rng, [item[0] for item in INPUT_ITEMS]))
        )

        msg_id = _rid("MSG", i + 1)
        msg = {
            "id": msg_id,
            "farmer_id": farmer["id"],
            "fpo_id": farmer["fpo_id"],
            "farmer_name": farmer["name"],
            "language": farmer["language"],
            "intent": intent,
            "text": msg_text,
            "severity": "HIGH" if intent == "disease_query" else _pick(rng, ["NORMAL", "NORMAL", "MEDIUM"]),
            "timestamp": msg_timestamp_iso,
            "status": msg_status,
            "in_progress_at": msg_timestamp_iso if msg_status == "resolved" else None,
            "resolved_at": None,
        }
        message_logs.append(msg)

        # Seed matching incoming chat thread entry
        chat_threads.append({
            "id": _rid("CHAT", len(chat_threads) + 1),
            "farmer_id": farmer["id"],
            "farmer_name": farmer["name"],
            "direction": "incoming",
            "intent": intent,
            "severity": msg["severity"],
            "status": msg_status,
            "message_id": msg_id,
            "text": msg_text,
            "timestamp": msg_timestamp_iso,
        })

        # For resolved messages seed an office reply chat entry
        if msg_status == "resolved":
            reply_tpls = OFFICE_REPLIES.get(intent, ["Noted. Will follow up shortly."])
            reply_text = (
                _pick(rng, reply_tpls)
                .replace("{crop}", farmer["primary_crop"])
                .replace("{village}", farmer["village"])
                .replace("{mandi}", market_row["mandi"])
                .replace("{min}", str(market_row["price_min"]))
                .replace("{max}", str(market_row["price_max"]))
                .replace("{item}", _pick(rng, [item[0] for item in INPUT_ITEMS]))
            )
            reply_dt = msg_timestamp + timedelta(minutes=rng.randint(8, 90))
            reply_ts = reply_dt.isoformat() + "Z"
            msg["resolved_at"] = reply_ts
            chat_threads.append({
                "id": _rid("CHAT", len(chat_threads) + 1),
                "farmer_id": farmer["id"],
                "farmer_name": farmer["name"],
                "direction": "outgoing",
                "intent": intent,
                "severity": "NORMAL",
                "status": "sent",
                "message_id": msg_id,
                "text": reply_text,
                "timestamp": reply_ts,
            })

        if intent in {"advisory", "price_query"}:
            advisory_logs.append(
                {
                    "id": _rid("ADV", len(advisory_logs) + 1),
                    "farmer_id": farmer["id"],
                    "crop": farmer["primary_crop"],
                    "advisory_type": intent,
                    "advisory_text": f"{farmer['primary_crop']} guidance issued for {farmer['village']}.",
                    "acknowledged": rng.random() < 0.72,
                }
            )
        if intent == "disease_query":
            dlog = {
                "id": _rid("DCASE", len(disease_logs) + 1),
                "farmer_id": farmer["id"],
                "crop": farmer["primary_crop"],
                "predicted_issue": _pick(rng, ["Fungal", "Nutrient Stress", "Pest Damage"]),
                "confidence": confidence,
                "escalated": confidence < 0.68,
                "final_resolution": "Field officer follow-up" if confidence < 0.68 else "Advisory sent",
            }
            disease_logs.append(dlog)
            if dlog["escalated"]:
                escalations.append(
                    {
                        "id": _rid("ESC", len(escalations) + 1),
                        "disease_case_id": dlog["id"],
                        "owner": _pick(rng, ["Field Officer", "Agronomist"]),
                        "status": _pick(rng, ["open", "closed", "in_progress"]),
                    }
                )

    for i in range(760):
        farmer = _pick(rng, farmers)
        practice = _pick(rng, PRACTICES)
        area = round(rng.uniform(0.7, farmer["land_size_ha"]), 2)
        crop_cfg = next(c for c in CROPS if c.name == farmer["primary_crop"])
        practice_weight = {
            "Reduced Tillage": 1.0,
            "Drip Irrigation": 0.7,
            "Cover Cropping": 0.9,
            "Organic Manure": 0.8,
            "Residue Retention": 0.6,
        }[practice]
        estimated = round(area * crop_cfg.carbon_factor * practice_weight, 3)
        practice_id = _rid("CPRA", i + 1)
        carbon_practices.append(
            {
                "id": practice_id,
                "farmer_id": farmer["id"],
                "fpo_id": farmer["fpo_id"],
                "crop": farmer["primary_crop"],
                "practice_type": practice,
                "area_ha": area,
                "start_date": (today - timedelta(days=rng.randint(20, 420))).isoformat(),
            }
        )
        carbon_estimates.append(
            {
                "id": _rid("CEST", i + 1),
                "practice_id": practice_id,
                "farmer_id": farmer["id"],
                "estimated_co2_tons": estimated,
                "calculation_date": today.isoformat(),
            }
        )

    by_fpo_area: dict[str, float] = defaultdict(float)
    by_fpo_credits: dict[str, float] = defaultdict(float)
    by_fpo_farmers: dict[str, set[str]] = defaultdict(set)

    for p in carbon_practices:
        by_fpo_area[p["fpo_id"]] += p["area_ha"]
        by_fpo_farmers[p["fpo_id"]].add(p["farmer_id"])
    for e in carbon_estimates:
        farmer = next(f for f in farmers if f["id"] == e["farmer_id"])
        by_fpo_credits[farmer["fpo_id"]] += e["estimated_co2_tons"]

    for i, fpo in enumerate(fpos, start=1):
        credits = round(by_fpo_credits[fpo["id"]], 2)
        price = 14 + rng.random() * 8
        carbon_projects.append(
            {
                "id": _rid("CPROJ", i),
                "fpo_id": fpo["id"],
                "fpo_name": fpo["name"],
                "total_area_ha": round(by_fpo_area[fpo["id"]], 2),
                "farmers_count": len(by_fpo_farmers[fpo["id"]]),
                "estimated_credits": credits,
                "credit_price_usd": round(price, 2),
                "estimated_revenue_usd": round(price * credits, 2),
                "status": _pick(rng, ["screening", "verification_ready", "aggregation_complete"]),
            }
        )

    # Inventory snapshot
    inventory_snapshot = []
    for (fpo_id, item_id), qty in inventory_balance.items():
        if qty <= 0:
            continue
        inventory_snapshot.append(
            {
                "id": _rid("INVST", len(inventory_snapshot) + 1),
                "fpo_id": fpo_id,
                "item_id": item_id,
                "item_name": next(it["name"] for it in inputs_catalog if it["id"] == item_id),
                "current_stock": qty,
                "reorder_threshold": 30,
                "stock_status": "low" if qty < 30 else "healthy",
            }
        )

    return {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "seed": seed,
        "states": states,
        "districts": districts,
        "villages": villages,
        "fpos": fpos,
        "farmers": farmers,
        "plots": plots,
        "crop_seasons": seasons,
        "communication_profiles": communication_profiles,
        "inputs_catalog": inputs_catalog,
        "suppliers": suppliers,
        "input_demands": input_demands,
        "purchase_requests": purchase_requests,
        "purchase_orders": purchase_orders,
        "goods_receipts": goods_receipts,
        "inventory_transactions": inventory_transactions,
        "inventory_snapshot": inventory_snapshot,
        "farmer_input_issues": farmer_input_issues,
        "produce_collections": produce_collections,
        "settlements": settlements,
        "buyers": buyers,
        "market_prices": market_prices,
        "buyer_demands": buyer_demands,
        "sales_orders": sales_orders,
        "dispatches": dispatches,
        "message_logs": message_logs,
        "chat_threads": chat_threads,
        "advisory_logs": advisory_logs,
        "disease_logs": disease_logs,
        "escalations": escalations,
        "carbon_practices": carbon_practices,
        "carbon_estimates": carbon_estimates,
        "carbon_projects": carbon_projects,
        "audit_logs": audit_logs,
        "communication_settings": {
            "reply_mode": "manual",
            "agent_provider": "openai",
            "agent_prompt_version": "v1",
            "agent_last_error": None,
        },
    }


def generate_agentic_work_dataset(seed: int = 42) -> dict[str, Any]:
    rng = random.Random(seed)
    today = date.today()
    now = datetime.utcnow().replace(microsecond=0)

    def iso_day(offset: int) -> str:
        return (today + timedelta(days=offset)).isoformat()

    def iso_ts(*, days_ago: int = 0, hours_ago: int = 0, minutes_ago: int = 0) -> str:
        return (now - timedelta(days=days_ago, hours=hours_ago, minutes=minutes_ago)).isoformat() + "Z"

    states = [{"id": "ST_MH", "name": "Maharashtra"}]
    districts = [
        {"id": "DI_NSK", "state_id": "ST_MH", "name": "Nashik"},
        {"id": "DI_PUN", "state_id": "ST_MH", "name": "Pune"},
    ]
    villages = [
        {"id": "VI_DI_NSK_1", "district_id": "DI_NSK", "name": "Chandori"},
        {"id": "VI_DI_NSK_2", "district_id": "DI_NSK", "name": "Pimpalgaon"},
        {"id": "VI_DI_NSK_3", "district_id": "DI_NSK", "name": "Sinnar"},
        {"id": "VI_DI_PUN_1", "district_id": "DI_PUN", "name": "Baramati"},
        {"id": "VI_DI_PUN_2", "district_id": "DI_PUN", "name": "Junnar"},
        {"id": "VI_DI_PUN_3", "district_id": "DI_PUN", "name": "Daund"},
    ]
    fpos = [
        {
            "id": "FPO_0001",
            "name": "Sahyadri Onion Growers",
            "district_id": "DI_NSK",
            "district": "Nashik",
            "state_id": "ST_MH",
            "state": "Maharashtra",
            "village_cluster": ["Chandori", "Pimpalgaon", "Sinnar"],
            "warehouse_capacity_mt": 180,
            "primary_crops": ["Onion", "Tomato"],
            "members_count": 0,
            "contact_person": "Nisha Patil",
        },
        {
            "id": "FPO_0002",
            "name": "Deccan Fruit Collective",
            "district_id": "DI_PUN",
            "district": "Pune",
            "state_id": "ST_MH",
            "state": "Maharashtra",
            "village_cluster": ["Baramati", "Junnar", "Daund"],
            "warehouse_capacity_mt": 140,
            "primary_crops": ["Pomegranate", "Soybean"],
            "members_count": 0,
            "contact_person": "Rahul Deshmukh",
        },
    ]
    farmer_specs = [
        ("FARM_0001", "FPO_0001", "Gaurav", "Chandori", 2.4, "Drip", "Loam", "Onion", "Marathi"),
        ("FARM_0002", "FPO_0001", "Meera", "Pimpalgaon", 1.8, "Drip", "Loam", "Onion", "Hindi"),
        ("FARM_0003", "FPO_0001", "Sunita", "Sinnar", 2.2, "Canal", "Black Soil", "Onion", "Marathi"),
        ("FARM_0004", "FPO_0001", "Rohan", "Chandori", 1.6, "Borewell", "Black Soil", "Tomato", "Marathi"),
        ("FARM_0005", "FPO_0001", "Kavita", "Pimpalgaon", 2.0, "Drip", "Loam", "Tomato", "English"),
        ("FARM_0006", "FPO_0001", "Imran", "Sinnar", 1.4, "Rainfed", "Sandy Loam", "Onion", "Hindi"),
        ("FARM_0007", "FPO_0002", "Priya", "Baramati", 2.8, "Drip", "Loam", "Pomegranate", "Marathi"),
        ("FARM_0008", "FPO_0002", "Sandeep", "Junnar", 3.2, "Rainfed", "Clay", "Soybean", "Hindi"),
        ("FARM_0009", "FPO_0002", "Neha", "Daund", 2.1, "Borewell", "Black Soil", "Pomegranate", "English"),
        ("FARM_0010", "FPO_0002", "Arjun", "Baramati", 2.5, "Canal", "Clay", "Cotton", "Marathi"),
        ("FARM_0011", "FPO_0002", "Lakshmi", "Junnar", 1.9, "Drip", "Loam", "Tomato", "Hindi"),
        ("FARM_0012", "FPO_0002", "Mohan", "Daund", 2.3, "Canal", "Sandy Loam", "Onion", "Marathi"),
    ]
    season_offsets = {
        "FARM_0001": (-52, 32),
        "FARM_0002": (-48, 28),
        "FARM_0003": (-92, -6),
        "FARM_0004": (-74, -4),
        "FARM_0005": (-78, 5),
        "FARM_0006": (-60, 24),
        "FARM_0007": (-110, 18),
        "FARM_0008": (-96, -1),
        "FARM_0009": (-120, 22),
        "FARM_0010": (-88, 30),
        "FARM_0011": (-68, 12),
        "FARM_0012": (-90, -2),
    }
    fpo_names = {row["id"]: row["name"] for row in fpos}
    farmers = []
    communication_profiles = []
    plots = []
    crop_seasons = []
    for idx, (farmer_id, fpo_id, name, village, land_size, irrigation, soil, crop, language) in enumerate(farmer_specs, start=1):
        farmers.append(
            {
                "id": farmer_id,
                "fpo_id": fpo_id,
                "fpo_name": fpo_names[fpo_id],
                "name": name,
                "village": village,
                "land_size_ha": land_size,
                "irrigation_type": irrigation,
                "soil_type": soil,
                "primary_crop": crop,
                "phone": f"+91-90000{idx:05d}",
                "language": language,
            }
        )
        communication_profiles.append({"farmer_id": farmer_id, "language": language, "preferred_mode": "voice" if idx % 4 == 0 else "text", "whatsapp_opt_in": True})
        plots.append({"id": _rid("PLOT", idx), "farmer_id": farmer_id, "fpo_id": fpo_id, "crop_current": crop, "area_ha": round(land_size * 0.95, 2), "soil_type": soil, "irrigation_source": irrigation, "polygon": [[round(19.95 + idx * 0.08, 5), round(73.55 + idx * 0.06, 5)]]})
        sowing_offset, harvest_offset = season_offsets[farmer_id]
        crop_seasons.append({"id": _rid("SEASON", idx), "plot_id": _rid("PLOT", idx), "farmer_id": farmer_id, "fpo_id": fpo_id, "crop_name": crop, "sowing_date": iso_day(sowing_offset), "expected_harvest": iso_day(harvest_offset), "seed_variety": f"{crop} Variety {1 + (idx % 3)}"})
    for fpo in fpos:
        fpo["members_count"] = len([farmer for farmer in farmers if farmer["fpo_id"] == fpo["id"]])

    inputs_catalog = [
        {"id": "INPUT_0001", "name": "Urea", "category": "fertilizer", "unit": "bag", "base_rate": 580},
        {"id": "INPUT_0002", "name": "DAP", "category": "fertilizer", "unit": "bag", "base_rate": 1320},
        {"id": "INPUT_0003", "name": "Potash", "category": "fertilizer", "unit": "bag", "base_rate": 980},
        {"id": "INPUT_0004", "name": "Fungicide A", "category": "pesticide", "unit": "unit", "base_rate": 740},
        {"id": "INPUT_0005", "name": "Pesticide B", "category": "pesticide", "unit": "unit", "base_rate": 860},
        {"id": "INPUT_0006", "name": "Hybrid Seed C", "category": "seed", "unit": "unit", "base_rate": 1240},
    ]
    suppliers = [
        {"id": "SUP_0001", "name": "Agri Depot Nashik", "lead_time_days": 2, "credit_terms_days": 15, "district_id": "DI_NSK"},
        {"id": "SUP_0002", "name": "Green Inputs Pune", "lead_time_days": 3, "credit_terms_days": 15, "district_id": "DI_PUN"},
        {"id": "SUP_0003", "name": "Harvest Care Co", "lead_time_days": 5, "credit_terms_days": 30, "district_id": "DI_NSK"},
        {"id": "SUP_0004", "name": "Mandi Supply Hub", "lead_time_days": 4, "credit_terms_days": 21, "district_id": "DI_PUN"},
    ]
    market_prices = []
    for day in range(14):
        price_date = (today - timedelta(days=day)).isoformat()
        for crop_name, base_price in {"Onion": 2200, "Tomato": 2450, "Soybean": 4900, "Cotton": 6400, "Pomegranate": 7600}.items():
            for mandi_idx, mandi in enumerate(["Nashik", "Pune", "Lasalgaon"], start=1):
                avg = base_price + rng.randint(-120, 140) + mandi_idx * 12
                market_prices.append({"id": _rid("MKT", len(market_prices) + 1), "crop": crop_name, "mandi": mandi, "price_min": avg - 80, "price_max": avg + 110, "price_avg": avg, "volume_traded_qtl": 120 + rng.randint(0, 260), "date": price_date})

    def msg(msg_id: str, farmer_id: str, fpo_id: str, farmer_name: str, language: str, intent: str, text: str, status: str, timestamp: str, *, severity: str = "NORMAL", in_progress_at: str | None = None, resolved_at: str | None = None, created_records: dict[str, Any] | None = None, escalated: bool = False, escalation_category: str = "none", escalation_reason: str = "") -> dict[str, Any]:
        return {"id": msg_id, "farmer_id": farmer_id, "fpo_id": fpo_id, "farmer_name": farmer_name, "language": language, "intent": intent, "text": text, "severity": severity, "timestamp": timestamp, "status": status, "in_progress_at": in_progress_at, "resolved_at": resolved_at, "created_records": created_records or {}, "escalated": escalated, "escalation_category": escalation_category, "escalation_reason": escalation_reason}

    message_logs = [
        msg("MSG_0001", "FARM_0001", "FPO_0001", "Gaurav", "Marathi", "input_request", "Need 5 bags urea next week.", "pending", iso_ts(days_ago=1, hours_ago=2), created_records={"input_demand_id": "DEM_0001"}),
        msg("MSG_0002", "FARM_0002", "FPO_0001", "Meera", "Hindi", "input_request", "Send input soon for onion crop, quantity will be same as last time.", "pending", iso_ts(days_ago=1, hours_ago=4), severity="MEDIUM", created_records={"input_demand_id": "DEM_0002"}),
        msg("MSG_0003", "FARM_0007", "FPO_0002", "Priya", "Marathi", "input_request", "Please arrange 6 bags Potash before flowering starts.", "in_progress", iso_ts(days_ago=2, hours_ago=1), in_progress_at=iso_ts(days_ago=2, hours_ago=1), created_records={"input_demand_id": "DEM_0003"}),
        msg("MSG_0004", "FARM_0009", "FPO_0002", "Neha", "English", "disease_query", "Black spots are spreading on my pomegranate leaves. Please check urgently.", "in_progress", iso_ts(days_ago=1, hours_ago=6), severity="HIGH", in_progress_at=iso_ts(days_ago=1, hours_ago=5), escalated=True, escalation_category="disease", escalation_reason="Image confidence too low for safe self-serve advisory."),
        msg("MSG_0005", "FARM_0011", "FPO_0002", "Lakshmi", "Hindi", "input_request", "Need 3 units Fungicide A, crop stress is increasing.", "resolved", iso_ts(days_ago=5, hours_ago=2), in_progress_at=iso_ts(days_ago=5, hours_ago=1), resolved_at=iso_ts(days_ago=5, hours_ago=1), created_records={"input_demand_id": "DEM_0005", "input_issue_id": "ISSUE_0001"}),
        msg("MSG_0006", "FARM_0005", "FPO_0001", "Kavita", "English", "harvest_update", "Tomato harvest should be ready in about 5 days.", "resolved", iso_ts(days_ago=1, hours_ago=8), in_progress_at=iso_ts(days_ago=1, hours_ago=8), resolved_at=iso_ts(days_ago=1, hours_ago=7, minutes_ago=40)),
    ]
    chat_threads = [
        {"id": "CHAT_0001", "farmer_id": "FARM_0001", "farmer_name": "Gaurav", "direction": "incoming", "intent": "input_request", "severity": "NORMAL", "status": "pending", "message_id": "MSG_0001", "text": "Need 5 bags urea next week.", "timestamp": iso_ts(days_ago=1, hours_ago=2)},
        {"id": "CHAT_0002", "farmer_id": "FARM_0002", "farmer_name": "Meera", "direction": "incoming", "intent": "input_request", "severity": "MEDIUM", "status": "pending", "message_id": "MSG_0002", "text": "Send input soon for onion crop, quantity will be same as last time.", "timestamp": iso_ts(days_ago=1, hours_ago=4)},
        {"id": "CHAT_0003", "farmer_id": "FARM_0007", "farmer_name": "Priya", "direction": "incoming", "intent": "input_request", "severity": "NORMAL", "status": "in_progress", "message_id": "MSG_0003", "text": "Please arrange 6 bags Potash before flowering starts.", "timestamp": iso_ts(days_ago=2, hours_ago=1)},
        {"id": "CHAT_0004", "farmer_id": "FARM_0009", "farmer_name": "Neha", "direction": "incoming", "intent": "disease_query", "severity": "HIGH", "status": "in_progress", "message_id": "MSG_0004", "text": "Black spots are spreading on my pomegranate leaves. Please check urgently.", "timestamp": iso_ts(days_ago=1, hours_ago=6)},
        {"id": "CHAT_0005", "farmer_id": "FARM_0011", "farmer_name": "Lakshmi", "direction": "incoming", "intent": "input_request", "severity": "NORMAL", "status": "resolved", "message_id": "MSG_0005", "text": "Need 3 units Fungicide A, crop stress is increasing.", "timestamp": iso_ts(days_ago=5, hours_ago=2)},
        {"id": "CHAT_0006", "farmer_id": "FARM_0011", "farmer_name": "Lakshmi", "direction": "outgoing", "intent": "input_request", "severity": "NORMAL", "status": "sent", "message_id": "MSG_0005", "text": "Fungicide A has been issued from FPO stock and is ready for pickup.", "timestamp": iso_ts(days_ago=5, hours_ago=1), "agent_generated": True},
        {"id": "CHAT_0007", "farmer_id": "FARM_0005", "farmer_name": "Kavita", "direction": "incoming", "intent": "harvest_update", "severity": "NORMAL", "status": "resolved", "message_id": "MSG_0006", "text": "Tomato harvest should be ready in about 5 days.", "timestamp": iso_ts(days_ago=1, hours_ago=8)},
        {"id": "CHAT_0008", "farmer_id": "FARM_0005", "farmer_name": "Kavita", "direction": "outgoing", "intent": "advisory", "severity": "NORMAL", "status": "sent", "message_id": "MSG_0006", "text": "Thanks. I will keep a harvest check active and alert the market desk when you confirm readiness.", "timestamp": iso_ts(days_ago=1, hours_ago=7, minutes_ago=40), "agent_generated": True},
    ]

    input_demands = [
        {"id": "DEM_0001", "farmer_id": "FARM_0001", "fpo_id": "FPO_0001", "village": "Chandori", "crop": "Onion", "item_id": "INPUT_0001", "item_name": "Urea", "requested_qty": 5, "status": "captured", "request_date": iso_day(-1), "issue_ids": [], "aggregated_at": None, "procured_at": None, "source": "farmer_chat", "source_ref": "MSG_0001", "source_text": "Need 5 bags urea next week.", "trust_score": 92, "trust_rationale": ["Item and quantity explicitly stated", "Farmer history matches prior Urea pattern"], "reviewed_by": None, "reviewed_at": None, "review_notes": None},
        {"id": "DEM_0002", "farmer_id": "FARM_0002", "fpo_id": "FPO_0001", "village": "Pimpalgaon", "crop": "Onion", "item_id": "INPUT_0002", "item_name": "DAP", "requested_qty": 8, "status": "needs_review", "request_date": iso_day(-1), "issue_ids": [], "aggregated_at": None, "procured_at": None, "source": "farmer_chat", "source_ref": "MSG_0002", "source_text": "Send input soon for onion crop, quantity will be same as last time.", "trust_score": 62, "trust_rationale": ["Item inferred from past order", "Quantity not explicit in message"], "reviewed_by": None, "reviewed_at": None, "review_notes": None},
        {"id": "DEM_0003", "farmer_id": "FARM_0007", "fpo_id": "FPO_0002", "village": "Baramati", "crop": "Pomegranate", "item_id": "INPUT_0003", "item_name": "Potash", "requested_qty": 6, "status": "procured", "request_date": iso_day(-2), "issue_ids": [], "aggregated_at": iso_ts(days_ago=2, hours_ago=1), "procured_at": iso_ts(days_ago=2), "source": "farmer_chat", "source_ref": "MSG_0003", "source_text": "Please arrange 6 bags Potash before flowering starts.", "trust_score": 88, "trust_rationale": ["Potash requested explicitly", "Crop stage supports recommendation"], "reviewed_by": "Input Fulfillment Agent", "reviewed_at": iso_ts(days_ago=2), "review_notes": None},
        {"id": "DEM_0004", "farmer_id": "FARM_0006", "fpo_id": "FPO_0001", "village": "Sinnar", "crop": "Onion", "item_id": "INPUT_0006", "item_name": "Hybrid Seed C", "requested_qty": 4, "status": "aggregated", "request_date": iso_day(-3), "issue_ids": [], "aggregated_at": iso_ts(days_ago=3), "procured_at": None, "source": "manual", "source_ref": None, "source_text": "Field team logged next-season seed requirement.", "trust_score": 95, "trust_rationale": ["Captured by field team", "Grouped with similar village demand"], "reviewed_by": "Field Coordinator", "reviewed_at": iso_ts(days_ago=3), "review_notes": "Hold until PR approval clears."},
        {"id": "DEM_0005", "farmer_id": "FARM_0011", "fpo_id": "FPO_0002", "village": "Junnar", "crop": "Tomato", "item_id": "INPUT_0004", "item_name": "Fungicide A", "requested_qty": 3, "status": "issued", "request_date": iso_day(-5), "issue_ids": ["ISSUE_0001"], "aggregated_at": iso_ts(days_ago=5, hours_ago=1), "procured_at": iso_ts(days_ago=5, hours_ago=1), "source": "farmer_chat", "source_ref": "MSG_0005", "source_text": "Need 3 units Fungicide A, crop stress is increasing.", "trust_score": 91, "trust_rationale": ["Explicit item request", "Stock already available at FPO"], "reviewed_by": "Input Fulfillment Agent", "reviewed_at": iso_ts(days_ago=5, hours_ago=1), "review_notes": None},
    ]

    purchase_requests = [
        {"id": "PR_0001", "fpo_id": "FPO_0002", "item_id": "INPUT_0003", "item_name": "Potash", "total_qty": 40, "supplier_id": "SUP_0002", "supplier_name": "Green Inputs Pune", "approval_status": "approved", "input_demand_ids": ["DEM_0003"], "expected_date": iso_day(1), "source": "agent", "source_ref": "ARUN_0001", "created_by_agent": True},
        {"id": "PR_0002", "fpo_id": "FPO_0001", "item_id": "INPUT_0006", "item_name": "Hybrid Seed C", "total_qty": 30, "supplier_id": "SUP_0003", "supplier_name": "Harvest Care Co", "approval_status": "pending", "input_demand_ids": ["DEM_0004"], "expected_date": iso_day(4), "source": "agent", "source_ref": "ARUN_0002", "created_by_agent": True},
        {"id": "PR_0003", "fpo_id": "FPO_0001", "item_id": "INPUT_0001", "item_name": "Urea", "total_qty": 60, "supplier_id": "SUP_0001", "supplier_name": "Agri Depot Nashik", "approval_status": "approved", "input_demand_ids": [], "expected_date": iso_day(-6), "source": "manual", "source_ref": None, "created_by_agent": False},
        {"id": "PR_0004", "fpo_id": "FPO_0001", "item_id": "INPUT_0002", "item_name": "DAP", "total_qty": 18, "supplier_id": "SUP_0001", "supplier_name": "Agri Depot Nashik", "approval_status": "approved", "input_demand_ids": [], "expected_date": iso_day(-10), "source": "manual", "source_ref": None, "created_by_agent": False},
    ]
    purchase_orders = [
        {"id": "PO_0001", "fpo_id": "FPO_0002", "pr_id": "PR_0001", "supplier_id": "SUP_0002", "item_id": "INPUT_0003", "item_name": "Potash", "qty_ordered": 40, "rate": 980, "delivery_status": "in_transit", "order_date": iso_day(-2), "source": "agent", "source_ref": "ARUN_0001", "created_by_agent": True},
        {"id": "PO_0002", "fpo_id": "FPO_0001", "pr_id": "PR_0003", "supplier_id": "SUP_0001", "item_id": "INPUT_0001", "item_name": "Urea", "qty_ordered": 60, "rate": 580, "delivery_status": "received", "order_date": iso_day(-8), "source": "manual", "source_ref": None, "created_by_agent": False},
        {"id": "PO_0003", "fpo_id": "FPO_0001", "pr_id": "PR_0004", "supplier_id": "SUP_0001", "item_id": "INPUT_0002", "item_name": "DAP", "qty_ordered": 18, "rate": 1320, "delivery_status": "received", "order_date": iso_day(-11), "source": "manual", "source_ref": None, "created_by_agent": False},
    ]
    goods_receipts = [
        {"id": "GRN_0001", "po_id": "PO_0002", "fpo_id": "FPO_0001", "item_id": "INPUT_0001", "item_name": "Urea", "qty_received": 58, "damaged_qty": 2, "receipt_date": iso_day(-7), "source": "manual", "source_ref": None, "created_by_agent": False},
        {"id": "GRN_0002", "po_id": "PO_0003", "fpo_id": "FPO_0001", "item_id": "INPUT_0002", "item_name": "DAP", "qty_received": 18, "damaged_qty": 0, "receipt_date": iso_day(-10), "source": "manual", "source_ref": None, "created_by_agent": False},
    ]
    inventory_transactions = [
        {"id": "INV_0001", "fpo_id": "FPO_0001", "item_id": "INPUT_0001", "item_name": "Urea", "txn_type": "stock_in", "qty": 58, "reference_id": "GRN_0001", "txn_date": iso_day(-7)},
        {"id": "INV_0002", "fpo_id": "FPO_0001", "item_id": "INPUT_0002", "item_name": "DAP", "txn_type": "stock_in", "qty": 18, "reference_id": "GRN_0002", "txn_date": iso_day(-10)},
        {"id": "INV_0003", "fpo_id": "FPO_0002", "item_id": "INPUT_0004", "item_name": "Fungicide A", "txn_type": "stock_out", "qty": 3, "reference_id": "ISSUE_0001", "txn_date": iso_day(-5)},
    ]
    inventory_snapshot = [
        {"id": "INVST_0001", "fpo_id": "FPO_0001", "item_id": "INPUT_0001", "item_name": "Urea", "current_stock": 22, "reorder_threshold": 30, "stock_status": "low"},
        {"id": "INVST_0002", "fpo_id": "FPO_0001", "item_id": "INPUT_0002", "item_name": "DAP", "current_stock": 4, "reorder_threshold": 15, "stock_status": "low"},
        {"id": "INVST_0003", "fpo_id": "FPO_0002", "item_id": "INPUT_0004", "item_name": "Fungicide A", "current_stock": 9, "reorder_threshold": 5, "stock_status": "healthy"},
    ]
    farmer_input_issues = [
        {"id": "ISSUE_0001", "farmer_id": "FARM_0011", "farmer_name": "Lakshmi", "fpo_id": "FPO_0002", "item_id": "INPUT_0004", "item_name": "Fungicide A", "qty_issued": 3, "issue_date": iso_day(-5), "acknowledged": True, "approval_status": "not_required", "source": "agent", "source_ref": "ARUN_0001", "created_by_agent": True},
        {"id": "ISSUE_0002", "farmer_id": "FARM_0001", "farmer_name": "Gaurav", "fpo_id": "FPO_0001", "item_id": "INPUT_0001", "item_name": "Urea", "qty_issued": 4, "issue_date": iso_day(-4), "acknowledged": True, "approval_status": "not_required", "source": "manual", "source_ref": None, "created_by_agent": False},
    ]

    buyers = [
        {"id": "BUY_0001", "name": "Metro Fresh Retail", "buyer_type": "Retail Chain", "district": "Nashik", "crop_categories": ["Onion", "Tomato"], "payment_terms_days": 7, "reliability_score": 4.6},
        {"id": "BUY_0002", "name": "PrimeVeg Distributors", "buyer_type": "Wholesaler", "district": "Pune", "crop_categories": ["Tomato", "Soybean"], "payment_terms_days": 10, "reliability_score": 4.3},
        {"id": "BUY_0003", "name": "Export Orchard Link", "buyer_type": "Exporter", "district": "Pune", "crop_categories": ["Pomegranate"], "payment_terms_days": 15, "reliability_score": 4.7},
        {"id": "BUY_0004", "name": "Indrayani Processors", "buyer_type": "Processor", "district": "Pune", "crop_categories": ["Soybean", "Cotton"], "payment_terms_days": 21, "reliability_score": 4.1},
    ]
    buyer_demands = [
        {"id": "BDEM_0001", "buyer_id": "BUY_0001", "buyer_name": "Metro Fresh Retail", "crop": "Onion", "quantity_mt": 8.0, "offered_price": 2320, "required_date": iso_day(2), "delivery_location": "Nashik", "status": "open"},
        {"id": "BDEM_0002", "buyer_id": "BUY_0002", "buyer_name": "PrimeVeg Distributors", "crop": "Tomato", "quantity_mt": 6.0, "offered_price": 2460, "required_date": iso_day(3), "delivery_location": "Pune", "status": "open"},
        {"id": "BDEM_0003", "buyer_id": "BUY_0004", "buyer_name": "Indrayani Processors", "crop": "Soybean", "quantity_mt": 2.0, "offered_price": 5050, "required_date": iso_day(4), "delivery_location": "Pune", "status": "matched"},
    ]
    produce_collections = [
        {"id": "COLL_0001", "farmer_id": "FARM_0003", "farmer_name": "Sunita", "fpo_id": "FPO_0001", "crop": "Onion", "grade": "A", "quantity_qtl": 90.0, "collection_center": "Sinnar Center", "date": iso_day(-1), "moisture_pct": 10.8, "status": "graded", "sales_order_id": None, "source": "manual", "source_ref": None, "created_by_agent": False},
        {"id": "COLL_0002", "farmer_id": "FARM_0004", "farmer_name": "Rohan", "fpo_id": "FPO_0001", "crop": "Tomato", "grade": "B", "quantity_qtl": 55.0, "collection_center": "Chandori Center", "date": iso_day(-3), "moisture_pct": 11.2, "status": "allocated_to_order", "sales_order_id": "SO_0001", "source": "agent", "source_ref": "ARUN_0001", "created_by_agent": True},
        {"id": "COLL_0003", "farmer_id": "FARM_0007", "farmer_name": "Priya", "fpo_id": "FPO_0002", "crop": "Pomegranate", "grade": "A", "quantity_qtl": 24.0, "collection_center": "Baramati Center", "date": iso_day(-2), "moisture_pct": 9.8, "status": "graded", "sales_order_id": None, "source": "manual", "source_ref": None, "created_by_agent": False},
        {"id": "COLL_0004", "farmer_id": "FARM_0008", "farmer_name": "Sandeep", "fpo_id": "FPO_0002", "crop": "Soybean", "grade": "B", "quantity_qtl": 18.0, "collection_center": "Junnar Center", "date": iso_day(-6), "moisture_pct": 12.2, "status": "settled", "sales_order_id": "SO_0002", "source": "manual", "source_ref": None, "created_by_agent": False},
    ]
    sales_orders = [
        {"id": "SO_0001", "buyer_id": "BUY_0002", "buyer_name": "PrimeVeg Distributors", "buyer_demand_id": "BDEM_0002", "crop": "Tomato", "quantity_mt": 5.5, "price": 2450, "dispatch_date": iso_day(-2), "status": "dispatched", "payment_status": "pending", "approval_status": "approved", "settlement_release_status": "pending", "collection_ids": ["COLL_0002"], "dispatch_ids": ["DSP_0001"], "created_date": iso_day(-3), "source": "agent", "source_ref": "ARUN_0001", "created_by_agent": True},
        {"id": "SO_0002", "buyer_id": "BUY_0004", "buyer_name": "Indrayani Processors", "buyer_demand_id": "BDEM_0003", "crop": "Soybean", "quantity_mt": 1.8, "price": 5000, "dispatch_date": iso_day(-5), "status": "paid", "payment_status": "received", "approval_status": "approved", "settlement_release_status": "approved", "collection_ids": ["COLL_0004"], "dispatch_ids": ["DSP_0002"], "created_date": iso_day(-7), "source": "manual", "source_ref": None, "created_by_agent": False},
    ]
    dispatches = [
        {"id": "DSP_0001", "sales_order_id": "SO_0001", "vehicle_no": "MH-15-4821", "qty_dispatched_mt": 5.5, "dispatch_date": iso_day(-2), "delivery_status": "on_time", "source": "agent", "source_ref": "ARUN_0001", "created_by_agent": True},
        {"id": "DSP_0002", "sales_order_id": "SO_0002", "vehicle_no": "MH-12-3364", "qty_dispatched_mt": 1.8, "dispatch_date": iso_day(-5), "delivery_status": "on_time", "source": "manual", "source_ref": None, "created_by_agent": False},
    ]
    settlements = [
        {"id": "SET_0001", "collection_id": "COLL_0001", "sales_order_id": None, "farmer_id": "FARM_0003", "crop": "Onion", "gross_amount": 205200.0, "deductions": 5130.0, "net_amount": 200070.0, "payment_status": "pending", "payment_date": None},
        {"id": "SET_0002", "collection_id": "COLL_0002", "sales_order_id": "SO_0001", "farmer_id": "FARM_0004", "crop": "Tomato", "gross_amount": 134750.0, "deductions": 3368.75, "net_amount": 131381.25, "payment_status": "pending", "payment_date": None},
        {"id": "SET_0003", "collection_id": "COLL_0003", "sales_order_id": None, "farmer_id": "FARM_0007", "crop": "Pomegranate", "gross_amount": 182400.0, "deductions": 4560.0, "net_amount": 177840.0, "payment_status": "pending", "payment_date": None},
        {"id": "SET_0004", "collection_id": "COLL_0004", "sales_order_id": "SO_0002", "farmer_id": "FARM_0008", "crop": "Soybean", "gross_amount": 90000.0, "deductions": 2250.0, "net_amount": 87750.0, "payment_status": "paid", "payment_date": iso_day(-2)},
    ]

    advisory_logs = [
        {"id": "ADV_0001", "farmer_id": "FARM_0011", "crop": "Tomato", "advisory_type": "input_request", "advisory_text": "Fungicide issue confirmed and pickup note sent to Lakshmi.", "acknowledged": True},
        {"id": "ADV_0002", "farmer_id": "FARM_0005", "crop": "Tomato", "advisory_type": "harvest_update", "advisory_text": "Harvest reminder flow active for upcoming tomato harvest.", "acknowledged": True},
    ]
    disease_logs = [{"id": "DCASE_0001", "farmer_id": "FARM_0009", "crop": "Pomegranate", "predicted_issue": "Fungal", "confidence": 0.58, "escalated": True, "message_id": "MSG_0004", "escalation_id": "ESC_0001", "final_resolution": "Awaiting agronomist review"}]
    escalations = [{"id": "ESC_0001", "message_id": "MSG_0004", "farmer_id": "FARM_0009", "disease_case_id": "DCASE_0001", "category": "disease", "reason": "Leaf image confidence below safe threshold for self-serve recommendation.", "owner": "Agronomist", "status": "open", "created_at": iso_ts(days_ago=1, hours_ago=5)}]
    carbon_practices = [
        {"id": "CPRA_0001", "farmer_id": "FARM_0001", "fpo_id": "FPO_0001", "crop": "Onion", "practice_type": "Drip Irrigation", "area_ha": 1.6, "start_date": iso_day(-90)},
        {"id": "CPRA_0002", "farmer_id": "FARM_0007", "fpo_id": "FPO_0002", "crop": "Pomegranate", "practice_type": "Organic Manure", "area_ha": 2.0, "start_date": iso_day(-120)},
        {"id": "CPRA_0003", "farmer_id": "FARM_0008", "fpo_id": "FPO_0002", "crop": "Soybean", "practice_type": "Reduced Tillage", "area_ha": 2.4, "start_date": iso_day(-80)},
    ]
    carbon_estimates = [
        {"id": "CEST_0001", "practice_id": "CPRA_0001", "farmer_id": "FARM_0001", "estimated_co2_tons": 1.12, "calculation_date": today.isoformat()},
        {"id": "CEST_0002", "practice_id": "CPRA_0002", "farmer_id": "FARM_0007", "estimated_co2_tons": 1.48, "calculation_date": today.isoformat()},
        {"id": "CEST_0003", "practice_id": "CPRA_0003", "farmer_id": "FARM_0008", "estimated_co2_tons": 1.62, "calculation_date": today.isoformat()},
    ]
    carbon_projects = [
        {"id": "CPROJ_0001", "fpo_id": "FPO_0001", "fpo_name": "Sahyadri Onion Growers", "total_area_ha": 1.6, "farmers_count": 1, "estimated_credits": 1.12, "credit_price_usd": 18.4, "estimated_revenue_usd": 20.61, "status": "verification_ready"},
        {"id": "CPROJ_0002", "fpo_id": "FPO_0002", "fpo_name": "Deccan Fruit Collective", "total_area_ha": 4.4, "farmers_count": 2, "estimated_credits": 3.1, "credit_price_usd": 17.8, "estimated_revenue_usd": 55.18, "status": "screening"},
    ]
    approval_logs = [{"id": "APR_0001", "approval_type": "purchase_request", "entity": "purchase_request", "entity_id": "PR_0002", "status": "pending", "requested_by": "Input Fulfillment Agent", "requested_at": iso_ts(hours_ago=6), "decision_by": None, "decision_at": None, "amount": 37200.0, "notes": "Agent-created PR awaiting human approval."}]
    agent_runs = [{"id": "ARUN_0001", "trigger": "demo_seed", "primary_agent": "agent_fulfillment", "status": "completed", "farmer_id": None, "message_id": None, "started_at": iso_ts(days_ago=5, hours_ago=1), "completed_at": iso_ts(days_ago=5), "action_count": 3, "human_handoffs": 1, "approval_count": 1, "summary": "Issued Fungicide A to Lakshmi and updated the market follow-through queue.", "actions": ["Issued 3 Fungicide A to Lakshmi (ISSUE_0001).", "Allocated collection COLL_0002 to order SO_0001 for 5.5 MT.", "Sent harvest check ALRT_0001 to Mohan for Onion."]}]
    agent_tasks = [
        {"id": "ATASK_0001", "agent_id": "agent_intake", "agent_name": "Farmer Intake Agent", "title": "Classified farmer request from Lakshmi", "entity_type": "message", "entity_id": "MSG_0005", "farmer_id": "FARM_0011", "message_id": "MSG_0005", "status": "completed", "priority": "normal", "requires_human": False, "detail": "Input request -> Fungicide A", "run_id": "ARUN_0001", "created_at": iso_ts(days_ago=5, hours_ago=2)},
        {"id": "ATASK_0002", "agent_id": "agent_fulfillment", "agent_name": "Input Fulfillment Agent", "title": "Issued pending farmer request automatically", "entity_type": "input_issue", "entity_id": "ISSUE_0001", "farmer_id": "FARM_0011", "message_id": "MSG_0005", "status": "completed", "priority": "normal", "requires_human": False, "detail": "3 Fungicide A", "run_id": "ARUN_0001", "created_at": iso_ts(days_ago=5, hours_ago=1)},
        {"id": "ATASK_0003", "agent_id": "agent_market", "agent_name": "Market Allocation Agent", "title": "Allocated collection to buyer demand", "entity_type": "sales_order", "entity_id": "SO_0001", "farmer_id": "FARM_0004", "message_id": None, "status": "completed", "priority": "normal", "requires_human": False, "detail": "Tomato / 5.5 MT", "run_id": "ARUN_0001", "created_at": iso_ts(days_ago=3, hours_ago=4)},
        {"id": "ATASK_0004", "agent_id": "agent_crop_cycle", "agent_name": "Crop Cycle Agent", "title": "Sent proactive harvest reminder", "entity_type": "agent_alert", "entity_id": "ALRT_0001", "farmer_id": "FARM_0012", "message_id": None, "status": "completed", "priority": "normal", "requires_human": False, "detail": "Onion", "run_id": "ARUN_0001", "created_at": iso_ts(days_ago=9)},
        {"id": "ATASK_0005", "agent_id": "agent_exception", "agent_name": "Human Handoff Agent", "title": "Escalated pomegranate disease case for review", "entity_type": "disease_case", "entity_id": "DCASE_0001", "farmer_id": "FARM_0009", "message_id": "MSG_0004", "status": "pending", "priority": "high", "requires_human": True, "detail": "Low confidence disease image", "run_id": "ARUN_0001", "created_at": iso_ts(days_ago=1, hours_ago=5)},
    ]
    agent_alerts = [{"id": "ALRT_0001", "agent_id": "agent_crop_cycle", "agent_name": "Crop Cycle Agent", "alert_type": "harvest_check", "farmer_id": "FARM_0012", "farmer_name": "Mohan", "crop": "Onion", "text": "Your Onion harvest looked close last week. Reply 'harvest ready' and I will line up collection.", "status": "sent", "related_entity_id": "SEASON_0012", "message_id": None, "created_at": iso_ts(days_ago=9)}]
    audit_logs = [
        {"id": "AUD_0001", "entity": "input_issue", "entity_id": "ISSUE_0001", "action": "agent_created", "timestamp": iso_ts(days_ago=5, hours_ago=1), "notes": "Agent issued 3 Fungicide A to Lakshmi."},
        {"id": "AUD_0002", "entity": "sales_order", "entity_id": "SO_0001", "action": "agent_created", "timestamp": iso_ts(days_ago=3, hours_ago=4), "notes": "Agent matched tomato collection to buyer demand."},
        {"id": "AUD_0003", "entity": "communication", "entity_id": "MSG_0004", "action": "escalated", "timestamp": iso_ts(days_ago=1, hours_ago=5), "notes": "Disease case escalated to agronomist due to low confidence."},
        {"id": "AUD_0004", "entity": "purchase_request", "entity_id": "PR_0002", "action": "agent_created", "timestamp": iso_ts(hours_ago=6), "notes": "Seed replenishment PR waiting for approval."},
    ]
    return {"generated_at": datetime.utcnow().isoformat() + "Z", "seed": seed, "states": states, "districts": districts, "villages": villages, "fpos": fpos, "farmers": farmers, "plots": plots, "crop_seasons": crop_seasons, "communication_profiles": communication_profiles, "inputs_catalog": inputs_catalog, "suppliers": suppliers, "input_demands": input_demands, "purchase_requests": purchase_requests, "purchase_orders": purchase_orders, "goods_receipts": goods_receipts, "inventory_transactions": inventory_transactions, "inventory_snapshot": inventory_snapshot, "farmer_input_issues": farmer_input_issues, "produce_collections": produce_collections, "settlements": settlements, "buyers": buyers, "market_prices": market_prices, "buyer_demands": buyer_demands, "sales_orders": sales_orders, "dispatches": dispatches, "message_logs": message_logs, "chat_threads": chat_threads, "advisory_logs": advisory_logs, "disease_logs": disease_logs, "escalations": escalations, "carbon_practices": carbon_practices, "carbon_estimates": carbon_estimates, "carbon_projects": carbon_projects, "audit_logs": audit_logs, "approval_logs": approval_logs, "agent_runs": agent_runs, "agent_tasks": agent_tasks, "agent_alerts": agent_alerts, "harvest_signals": [], "broadcasts": [], "broadcast_recipients": [], "users": [], "roles": [], "communication_settings": {"reply_mode": "agentic", "agent_provider": "openai", "agent_prompt_version": "v1", "agent_last_error": None}}


def generate_dataset(seed: int = 42, profile: str = "full_data") -> dict[str, Any]:
    if profile == "full_data":
        dataset = generate_full_dataset(seed)
    elif profile == "agentic_work":
        dataset = generate_agentic_work_dataset(seed)
    else:
        raise ValueError(f"Unknown dataset profile: {profile}")
    dataset["seed"] = seed
    dataset["data_profile"] = profile
    dataset["generated_at"] = datetime.utcnow().isoformat() + "Z"
    return dataset


def compute_dashboard(dataset: dict[str, Any]) -> dict[str, Any]:
    total_farmers = len(dataset["farmers"])
    total_fpos = len(dataset["fpos"])
    total_plots = len(dataset["plots"])
    demand_open = sum(1 for d in dataset["input_demands"] if d["status"] == "captured")
    settlements_pending = sum(1 for s in dataset["settlements"] if s["payment_status"] == "pending")
    buyer_orders_open = sum(1 for s in dataset["sales_orders"] if s["status"] not in {"delivered", "paid"})
    escalations_open = sum(1 for e in dataset["escalations"] if e["status"] != "closed")

    carbon_revenue = round(sum(p["estimated_revenue_usd"] for p in dataset["carbon_projects"]), 2)
    total_credits = round(sum(p["estimated_credits"] for p in dataset["carbon_projects"]), 2)
    total_collection_qtl = round(sum(c["quantity_qtl"] for c in dataset["produce_collections"]), 2)

    crop_mix: dict[str, int] = defaultdict(int)
    for farmer in dataset["farmers"]:
        crop_mix[farmer["primary_crop"]] += 1
    crop_mix_rows = [{"crop": crop, "farmers": count} for crop, count in sorted(crop_mix.items(), key=lambda x: -x[1])]

    latest_prices: dict[str, dict[str, Any]] = {}
    sorted_prices = sorted(dataset["market_prices"], key=lambda x: x["date"], reverse=True)
    for row in sorted_prices:
        if row["crop"] not in latest_prices:
            latest_prices[row["crop"]] = row

    top_prices = [
        {
            "crop": crop,
            "mandi": row["mandi"],
            "price_avg": row["price_avg"],
            "price_band": f"{row['price_min']} - {row['price_max']}",
        }
        for crop, row in latest_prices.items()
    ]

    return {
        "headline": {
            "total_fpos": total_fpos,
            "total_farmers": total_farmers,
            "total_plots": total_plots,
            "input_demands_open": demand_open,
            "buyer_orders_open": buyer_orders_open,
            "settlements_pending": settlements_pending,
            "escalations_open": escalations_open,
            "total_collection_qtl": total_collection_qtl,
            "carbon_estimated_credits": total_credits,
            "carbon_estimated_revenue_usd": carbon_revenue,
        },
        "crop_mix": crop_mix_rows,
        "top_prices": top_prices,
    }


def compute_matching(dataset: dict[str, Any], min_match_ratio: float = 0.6) -> list[dict[str, Any]]:
    fpo_map = {f["id"]: f for f in dataset["fpos"]}
    buyer_map = {b["id"]: b for b in dataset["buyers"]}
    produce_stats: dict[tuple[str, str], dict[str, Any]] = defaultdict(
        lambda: {"available_mt": 0.0, "grade_weight_total": 0.0, "records": 0}
    )
    grade_weight = {"A": 1.0, "B": 0.82, "C": 0.6}

    for c in dataset["produce_collections"]:
        if c.get("status") not in {"graded", "allocated_to_order", "settled"}:
            continue
        key = (c["fpo_id"], c["crop"])
        produce_stats[key]["available_mt"] += c["quantity_qtl"] / 10.0
        produce_stats[key]["grade_weight_total"] += grade_weight.get(str(c.get("grade", "B")).upper(), 0.75)
        produce_stats[key]["records"] += 1

    matches: list[dict[str, Any]] = []
    for demand in dataset["buyer_demands"]:
        buyer = buyer_map.get(demand["buyer_id"])
        if not buyer:
            continue
        base_price = next(c.base_price for c in CROPS if c.name == demand["crop"])
        best_row: dict[str, Any] | None = None
        for (fpo_id, crop), stats in produce_stats.items():
            if crop != demand["crop"]:
                continue
            available_mt = stats["available_mt"]
            if available_mt < demand["quantity_mt"] * min_match_ratio:
                continue
            fpo = fpo_map.get(fpo_id)
            if not fpo:
                continue
            qty_ratio = min(1.0, available_mt / max(1.0, float(demand["quantity_mt"])))
            district_match = 1.0 if str(fpo.get("district", "")).lower() == str(buyer.get("district", "")).lower() else 0.55
            avg_grade_score = stats["grade_weight_total"] / max(1, stats["records"])
            reliability = float(buyer.get("reliability_score", 3.5)) / 5.0
            terms = max(0.25, 1.0 - (float(buyer.get("payment_terms_days", 14)) / 45.0))
            margin = float(demand["offered_price"]) - float(base_price)
            margin_score = min(1.0, max(0.0, (margin + 350.0) / 700.0))

            weighted_score = (
                qty_ratio * 0.32
                + district_match * 0.14
                + avg_grade_score * 0.18
                + reliability * 0.16
                + terms * 0.08
                + margin_score * 0.12
            )
            row = {
                "buyer_demand_id": demand["id"],
                "crop": demand["crop"],
                "buyer_name": demand["buyer_name"],
                "fpo_id": fpo_id,
                "fpo_name": fpo["name"],
                "required_mt": demand["quantity_mt"],
                "available_mt": round(available_mt, 2),
                "offered_price": demand["offered_price"],
                "expected_margin_vs_base": round(margin, 2),
                "district_proximity_score": round(district_match, 2),
                "grade_fit_score": round(avg_grade_score, 2),
                "buyer_reliability_score": round(reliability, 2),
                "payment_terms_score": round(terms, 2),
                "match_score": round(min(0.99, weighted_score), 2),
            }
            if not best_row or row["match_score"] > best_row["match_score"]:
                best_row = row
        if best_row:
            matches.append(best_row)

    matches.sort(key=lambda x: x["match_score"], reverse=True)
    return matches[:80]
