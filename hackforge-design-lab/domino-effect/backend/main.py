from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import math
import os
import random
import re
import secrets
import shutil
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from uuid import uuid4
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

import numpy as np
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse
from pydantic import BaseModel
from sklearn.ensemble import IsolationForest

ROOT = Path(__file__).resolve().parent
RUNTIME_ROOT = Path("/tmp/stillyou") if os.getenv("VERCEL") else ROOT
RUNTIME_ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
DB_PATH = RUNTIME_ROOT / "stillyou.db"
if os.getenv("VERCEL") and not DB_PATH.exists():
    seed_db = ROOT / "stillyou.db"
    if seed_db.exists():
        shutil.copy2(seed_db, DB_PATH)
UPLOADS_PATH = RUNTIME_ROOT / "uploads"
MODEL_VERSION = "isolation-forest-2026.10.18-v1"
SIMULATOR_INTERVAL_SECONDS = 4
BACKGROUND_SIMULATOR_ENABLED = os.getenv("STILLYOU_BACKGROUND_SIMULATOR", "0") == "1"
TRUSTED_THRESHOLD = int(os.getenv("STILLYOU_TRUSTED_THRESHOLD", "80"))
HIGH_RISK_THRESHOLD = int(os.getenv("STILLYOU_HIGH_RISK_THRESHOLD", "50"))
RNG = random.Random(1842)
DB_LOCK = threading.RLock()

RIDERS = [
    ("R-1042", "Aarav Mehta", "Mumbai", "pixel-9", 490, 7.8, .82, .91),
    ("R-2187", "Meera Nair", "Bengaluru", "iphone-16", 610, 8.1, .88, .94),
    ("R-3091", "Kabir Singh", "Delhi", "oneplus-13r", 720, 6.9, .76, .86),
    ("R-4470", "Zoya Khan", "Pune", "samsung-a56", 540, 7.3, .84, .90),
    ("R-5108", "Arjun Rao", "Hyderabad", "pixel-8a", 650, 8.4, .86, .93),
    ("R-6284", "Isha Patel", "Ahmedabad", "nothing-2a", 585, 7.6, .81, .89),
    ("R-7315", "Vihaan Das", "Kolkata", "moto-edge", 675, 7.1, .79, .88),
    ("R-8462", "Anaya Shah", "Chennai", "galaxy-s24", 525, 8.0, .87, .92),
]

SCHEMA = """
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS riders (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, city TEXT NOT NULL, device_id TEXT NOT NULL,
  normal_start INTEGER NOT NULL, shift_hours REAL NOT NULL, acceptance REAL NOT NULL,
  route_consistency REAL NOT NULL, trust_score INTEGER NOT NULL DEFAULT 94,
  state TEXT NOT NULL DEFAULT 'TRUSTED', verification_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
  pending_verification_id TEXT, last_event TEXT NOT NULL DEFAULT 'Baseline active',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, rider_id TEXT NOT NULL, created_at TEXT NOT NULL, event_type TEXT NOT NULL,
  login_minute REAL NOT NULL, shift_hours REAL NOT NULL, acceptance REAL NOT NULL,
  route_consistency REAL NOT NULL, device_known INTEGER NOT NULL, anomaly_score REAL NOT NULL,
  is_anomaly INTEGER NOT NULL, evidence_json TEXT NOT NULL, model_version TEXT NOT NULL,
  FOREIGN KEY(rider_id) REFERENCES riders(id)
);
CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY, rider_id TEXT NOT NULL, status TEXT NOT NULL, reason TEXT NOT NULL,
  evidence_json TEXT NOT NULL, evidence_count INTEGER NOT NULL DEFAULT 1,
  recommended_next_step TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY(rider_id) REFERENCES riders(id)
);
CREATE TABLE IF NOT EXISTS verification_challenges (
  id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, rider_id TEXT NOT NULL, status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0, simulated INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, completed_at TEXT, result TEXT,
  method TEXT NOT NULL DEFAULT 'SIMULATED', result_metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(incident_id) REFERENCES incidents(id)
);
CREATE TABLE IF NOT EXISTS decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER, incident_id TEXT, rider_id TEXT NOT NULL,
  created_at TEXT NOT NULL, previous_state TEXT NOT NULL, new_state TEXT NOT NULL,
  action TEXT NOT NULL, explanation TEXT NOT NULL, model_version TEXT NOT NULL,
  trust_score INTEGER
);
CREATE TABLE IF NOT EXISTS activity_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_key TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL,
  rider_id TEXT NOT NULL, incident_id TEXT, tone TEXT NOT NULL, kind TEXT NOT NULL,
  message TEXT NOT NULL, payload_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rider_accounts (
  rider_id TEXT PRIMARY KEY, contact TEXT UNIQUE NOT NULL, password_hash TEXT,
  password_salt TEXT, google_subject TEXT UNIQUE, profile_photo_path TEXT,
  profile_photo_data BLOB, profile_photo_mime TEXT,
  primary_area TEXT NOT NULL, preferred_hours TEXT, created_at TEXT NOT NULL,
  FOREIGN KEY(rider_id) REFERENCES riders(id)
);
CREATE TABLE IF NOT EXISTS rider_sessions (
  id TEXT PRIMARY KEY, rider_id TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL,
  device_id TEXT NOT NULL, device_label TEXT NOT NULL, browser_profile TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'AUTHENTICATED', location_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, expires_at TEXT NOT NULL,
  revoked_at TEXT, FOREIGN KEY(rider_id) REFERENCES riders(id)
);
CREATE TABLE IF NOT EXISTS recognised_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT, rider_id TEXT NOT NULL, device_id TEXT NOT NULL,
  device_label TEXT NOT NULL, browser_profile TEXT NOT NULL, first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL, trusted INTEGER NOT NULL DEFAULT 1,
  UNIQUE(rider_id, device_id), FOREIGN KEY(rider_id) REFERENCES riders(id)
);
CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY, rider_id TEXT, pickup TEXT NOT NULL, dropoff TEXT NOT NULL,
  eta_minutes INTEGER NOT NULL, distance_km REAL NOT NULL, status TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, session_id TEXT,
  FOREIGN KEY(rider_id) REFERENCES riders(id)
);
CREATE TABLE IF NOT EXISTS delivery_declines (
  session_id TEXT NOT NULL, order_id TEXT NOT NULL, rider_id TEXT NOT NULL,
  created_at TEXT NOT NULL, PRIMARY KEY(session_id,order_id)
);
CREATE TABLE IF NOT EXISTS otp_challenges (
  id TEXT PRIMARY KEY, rider_id TEXT NOT NULL, verification_id TEXT NOT NULL,
  code_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL, completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_rider ON activity_events(rider_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_rider ON sessions(rider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_sessions_rider ON rider_sessions(rider_id, last_seen_at DESC);
"""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def db():
    with DB_LOCK:
        connection = sqlite3.connect(DB_PATH, timeout=20)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()


def jdump(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"))


def jload(value: str | None, fallback: Any) -> Any:
    try:
        return json.loads(value or "")
    except (TypeError, json.JSONDecodeError):
        return fallback


def emit_event(connection: sqlite3.Connection, key: str, rider_id: str, message: str, tone: str,
               kind: str, incident_id: str | None = None, payload: dict | None = None) -> int:
    cursor = connection.execute(
        "INSERT OR IGNORE INTO activity_events(event_key,created_at,rider_id,incident_id,tone,kind,message,payload_json) VALUES(?,?,?,?,?,?,?,?)",
        (key, utc_now(), rider_id, incident_id, tone, kind, message, jdump(payload or {})),
    )
    if cursor.lastrowid:
        publish({"id": cursor.lastrowid, "type": "activity", "riderId": rider_id})
    return int(cursor.lastrowid or 0)


def hash_password(password: str, salt_hex: str | None = None) -> tuple[str, str]:
    salt = bytes.fromhex(salt_hex) if salt_hex else secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 210_000)
    return digest.hex(), salt.hex()


def password_matches(password: str, expected: str | None, salt: str | None) -> bool:
    if not expected or not salt:
        return False
    actual, _ = hash_password(password, salt)
    return hmac.compare_digest(actual, expected)


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


SESSION_SECRET = os.getenv("STILLYOU_SECRET_KEY", "stillyou-hackathon-2026-auth-session-key").encode("utf-8")


def make_signed_token(rider_id: str, session_id: str, device: Any = None) -> str:
    now = datetime.now(timezone.utc)
    expires_at = (now + timedelta(days=30)).isoformat(timespec="seconds")
    created_at = now.isoformat(timespec="seconds")
    device_id = getattr(device, "device_id", None) or (device.get("device_id") if isinstance(device, dict) else "unknown-device")
    device_label = getattr(device, "label", None) or (device.get("label") if isinstance(device, dict) else "Mobile Device")
    browser_profile = getattr(device, "browser_profile", None) or (device.get("browser_profile") if isinstance(device, dict) else "")
    
    payload = {
        "rider_id": rider_id,
        "session_id": session_id,
        "device_id": device_id,
        "device_label": device_label,
        "browser_profile": browser_profile,
        "created_at": created_at,
        "expires_at": expires_at,
        "exp": int((now + timedelta(days=30)).timestamp()),
    }
    payload_bytes = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    payload_b64 = base64.urlsafe_b64encode(payload_bytes).decode("ascii").rstrip("=")
    signature = hmac.new(SESSION_SECRET, payload_b64.encode("ascii"), hashlib.sha256).hexdigest()
    return f"SY_{payload_b64}.{signature}"


def decode_signed_session_token(token: str) -> dict | None:
    try:
        if not token.startswith("SY_") or "." not in token:
            return None
        token_body = token[3:]
        payload_b64, signature = token_body.split(".", 1)
        expected_sig = hmac.new(SESSION_SECRET, payload_b64.encode("ascii"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected_sig):
            return None
        rem = len(payload_b64) % 4
        if rem > 0:
            payload_b64 += "=" * (4 - rem)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64.encode("ascii")).decode("utf-8"))
        if payload.get("exp") and payload["exp"] < int(datetime.now(timezone.utc).timestamp()):
            return None
        return payload
    except Exception:
        return None


def haversine_km(first: dict, second: dict) -> float:
    lat1, lon1 = math.radians(float(first["latitude"])), math.radians(float(first["longitude"]))
    lat2, lon2 = math.radians(float(second["latitude"])), math.radians(float(second["longitude"]))
    delta_lat, delta_lon = lat2 - lat1, lon2 - lon1
    value = math.sin(delta_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2) ** 2
    return 6371 * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def add_column(connection: sqlite3.Connection, table: str, definition: str) -> None:
    name = definition.split()[0]
    columns = {row["name"] for row in connection.execute(f"PRAGMA table_info({table})")}
    if name not in columns:
        connection.execute(f"ALTER TABLE {table} ADD COLUMN {definition}")


def seed_demo_access(connection: sqlite3.Connection) -> None:
    demo_id = "R-9001"
    created = not connection.execute("SELECT 1 FROM riders WHERE id=?", (demo_id,)).fetchone()
    if created:
        profile = (demo_id, "Demo Rider", "Location not shared", "demo-browser", 720, 7.5, .80, .88)
        connection.execute(
            "INSERT INTO riders(id,name,city,device_id,normal_start,shift_hours,acceptance,route_consistency,current_location,online_status,updated_at) VALUES(?,?,?,?,?,?,?,?,?,1,?)",
            (*profile, "Location not shared", utc_now()),
        )
        seed_history(connection, profile)
        connection.execute(
            "UPDATE riders SET trust_score=100,state='TRUSTED',verification_status='PASSED',"
            "last_event='Verified demo baseline established' WHERE id=?", (demo_id,),
        )
    existing = connection.execute("SELECT * FROM rider_accounts WHERE contact='demo@stillyou.dev'").fetchone()
    if not existing or existing["rider_id"] != demo_id:
        if existing:
            connection.execute("DELETE FROM rider_accounts WHERE contact='demo@stillyou.dev'")
        password_hash, salt = hash_password("StillYou123!")
        connection.execute(
            "INSERT INTO rider_accounts(rider_id,contact,password_hash,password_salt,primary_area,preferred_hours,created_at,baseline_status) VALUES(?,?,?,?,?,?,?,?)",
            (demo_id, "demo@stillyou.dev", password_hash, salt, "Location not shared", "12:00–20:00", utc_now(), "ESTABLISHED"),
        )
    connection.execute("UPDATE rider_accounts SET baseline_status='ESTABLISHED' WHERE rider_id=?", (demo_id,))
    
    # Clear hardcoded demo reference photo linkage so any custom photograph can be enrolled
    connection.execute(
        "UPDATE rider_accounts SET profile_photo_data=NULL, profile_photo_mime=NULL, profile_photo_path=NULL WHERE rider_id=? AND (profile_photo_path LIKE '%demo_reference%' OR length(profile_photo_data) IN (427104, 168999))",
        (demo_id,),
    )
            
    if not connection.execute("SELECT 1 FROM deliveries LIMIT 1").fetchone():
        now = utc_now()
        deliveries = [
            ("ORD-4821", None, "Malad Station", "Mindspace, Malad", 24, 5.8, "AVAILABLE", now, now),
            ("ORD-5934", None, "Link Road Kitchen", "Goregaon East", 31, 8.2, "AVAILABLE", now, now),
            ("ORD-6088", None, "Infiniti Mall", "Kandivali West", 19, 4.6, "AVAILABLE", now, now),
        ]
        connection.executemany(
            "INSERT INTO deliveries(id,rider_id,pickup,dropoff,eta_minutes,distance_km,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
            deliveries,
        )


RIDER_SEED_VARIATION = {
    "R-1042": {
        "trust_score": 28, "state": "VERIFICATION_REQUIRED", "verification_status": "REQUESTED",
        "pending_verification_id": "VER-R-1042-83bfdfcd47", "last_event": "Potential second behavioural signature detected — Identity verification required",
        "online_status": 1, "current_location": "Malad, Mumbai",
    },
    "R-2187": {
        "trust_score": 75, "state": "OBSERVING", "verification_status": "NOT_REQUIRED",
        "pending_verification_id": None, "last_event": "Location deviation detected: Link Road Kitchen vs Indiranagar baseline",
        "online_status": 1, "current_location": "Indiranagar, Bengaluru",
    },
    "R-3091": {
        "trust_score": 67, "state": "OBSERVING", "verification_status": "NOT_REQUIRED",
        "pending_verification_id": None, "last_event": "Alternate device profile activated; monitoring delivery telemetry",
        "online_status": 1, "current_location": "Connaught Place, Delhi",
    },
    "R-4470": {
        "trust_score": 24, "state": "HUMAN_REVIEW", "verification_status": "FAILED",
        "pending_verification_id": None, "last_event": "Failed identity verification escalated for human review",
        "online_status": 1, "current_location": "Kothrud, Pune",
    },
    "R-5108": {
        "trust_score": 24, "state": "HUMAN_REVIEW", "verification_status": "FAILED",
        "pending_verification_id": None, "last_event": "Failed identity verification escalated for human review",
        "online_status": 1, "current_location": "Hitec City, Hyderabad",
    },
    "R-6284": {
        "trust_score": 96, "state": "TRUSTED", "verification_status": "NOT_REQUIRED",
        "pending_verification_id": None, "last_event": "Identity monitoring active; behavioural baseline established",
        "online_status": 1, "current_location": "Navrangpura, Ahmedabad",
    },
    "R-7315": {
        "trust_score": 96, "state": "TRUSTED", "verification_status": "NOT_REQUIRED",
        "pending_verification_id": None, "last_event": "Consistent route delivery completed within expected window",
        "online_status": 1, "current_location": "Salt Lake, Kolkata",
    },
    "R-8462": {
        "trust_score": 88, "state": "TRUSTED", "verification_status": "NOT_REQUIRED",
        "pending_verification_id": None, "last_event": "Recognised device profile restored — Trust score recovered",
        "online_status": 1, "current_location": "T. Nagar, Chennai",
    },
}


def seed_dummy_variation(connection: sqlite3.Connection) -> None:
    now = utc_now()
    score_variance = connection.execute(
        "SELECT COUNT(DISTINCT trust_score) FROM riders WHERE id != 'R-9001'"
    ).fetchone()[0]

    # If dummy data lacks variation (e.g. all riders share default score 94), populate the variation
    if score_variance <= 1:
        for rider_id, v in RIDER_SEED_VARIATION.items():
            connection.execute(
                "UPDATE riders SET trust_score=?,state=?,verification_status=?,pending_verification_id=?,last_event=?,online_status=?,current_location=?,updated_at=? WHERE id=?",
                (v["trust_score"], v["state"], v["verification_status"], v["pending_verification_id"], v["last_event"], v["online_status"], v["current_location"], now, rider_id),
            )

    # Ensure sample incidents exist for operator review
    if not connection.execute("SELECT 1 FROM incidents WHERE rider_id='R-1042'").fetchone():
        inc_id = "INC-R-1042-83bfdfcd47"
        evidence = [
            {"signal": "schedule", "change": "Shift start moved 314 minutes", "unusual": "Outside established working window", "weight": "medium"},
            {"signal": "route", "change": "Route consistency fell by 0.38", "unusual": "Delivery sequence differs from baseline", "weight": "high"},
            {"signal": "activity", "change": "Acceptance rate fell by 0.24", "unusual": "Persistent interaction change", "weight": "high"},
            {"signal": "isolation_forest", "change": "Model decision score -0.1387", "unusual": "Unusual multivariate feature combination", "weight": "supporting"},
            {"signal": "device", "change": "Previously unseen device", "unusual": "Context only", "weight": "low"}
        ]
        connection.execute(
            "INSERT OR IGNORE INTO incidents(id,rider_id,status,reason,evidence_json,evidence_count,recommended_next_step,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
            (inc_id, "R-1042", "VERIFYING", "Potential second behavioural signature detected", json.dumps(evidence), 5, "Retry or await human review if unresolved", now, now),
        )
        connection.execute(
            "INSERT OR IGNORE INTO verification_challenges(id,incident_id,rider_id,status,attempts,simulated,created_at,method) VALUES(?,?,?,?,?,?,?,?)",
            ("VER-R-1042-83bfdfcd47", inc_id, "R-1042", "PENDING", 0, 1, now, "SIMULATED"),
        )
        connection.execute(
            "INSERT INTO decisions(incident_id,rider_id,created_at,previous_state,new_state,action,explanation,model_version,trust_score) VALUES(?,?,?,?,?,?,?,?,?)",
            (inc_id, "R-1042", now, "OBSERVING", "VERIFICATION_REQUIRED", "REQUEST_VERIFICATION", "Identity verification requested following multivariate behavioral anomaly.", MODEL_VERSION, 28),
        )

    if not connection.execute("SELECT 1 FROM incidents WHERE rider_id='R-4470'").fetchone():
        inc_id = "INC-R-4470-9c0c7084a9"
        evidence = [
            {"signal": "account_sharing", "change": "Account activity detected from multiple devices", "unusual": "New device identified during an active delivery", "weight": "critical"},
            {"signal": "policy", "change": "Identity re-verification required", "unusual": "Suspicious simultaneous activity detected across separate devices", "weight": "action"},
            {"signal": "isolation_forest", "change": "Model decision score -0.1142", "unusual": "Unusual multivariate feature combination", "weight": "supporting"}
        ]
        connection.execute(
            "INSERT OR IGNORE INTO incidents(id,rider_id,status,reason,evidence_json,evidence_count,recommended_next_step,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
            (inc_id, "R-4470", "HUMAN_REVIEW", "Potential second behavioural signature detected", json.dumps(evidence), 3, "Human review required before consequential action", now, now),
        )
        connection.execute(
            "INSERT OR IGNORE INTO verification_challenges(id,incident_id,rider_id,status,attempts,simulated,created_at,completed_at,result,method,result_metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            ("VER-R-4470-FAILED", inc_id, "R-4470", "COMPLETED", 1, 1, now, now, "FAILED", "SIMULATED", json.dumps({"note": "Facial verification mismatch on secondary device"})),
        )
        connection.execute(
            "INSERT INTO decisions(incident_id,rider_id,created_at,previous_state,new_state,action,explanation,model_version,trust_score) VALUES(?,?,?,?,?,?,?,?,?)",
            (inc_id, "R-4470", now, "VERIFICATION_REQUIRED", "HUMAN_REVIEW", "ESCALATE_HUMAN_REVIEW", "Failed identity verification escalated for human review; no automatic account restriction was applied.", MODEL_VERSION, 24),
        )

    if not connection.execute("SELECT 1 FROM incidents WHERE rider_id='R-5108'").fetchone():
        inc_id = "INC-R-5108-43652cbeeb"
        evidence = [
            {"signal": "schedule", "change": "Shift start moved 314 minutes", "unusual": "Outside established working window", "weight": "medium"},
            {"signal": "route", "change": "Route consistency fell by 0.38", "unusual": "Delivery sequence differs from baseline", "weight": "high"},
            {"signal": "activity", "change": "Acceptance rate fell by 0.24", "unusual": "Persistent interaction change", "weight": "high"},
            {"signal": "isolation_forest", "change": "Model decision score -0.0628", "unusual": "Unusual multivariate feature combination", "weight": "supporting"}
        ]
        connection.execute(
            "INSERT OR IGNORE INTO incidents(id,rider_id,status,reason,evidence_json,evidence_count,recommended_next_step,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
            (inc_id, "R-5108", "HUMAN_REVIEW", "Potential second behavioural signature detected", json.dumps(evidence), 4, "Human review required after failed identity verification", now, now),
        )
        connection.execute(
            "INSERT OR IGNORE INTO verification_challenges(id,incident_id,rider_id,status,attempts,simulated,created_at,completed_at,result,method,result_metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            ("VER-R-5108-FAILED", inc_id, "R-5108", "COMPLETED", 1, 1, now, now, "FAILED", "SIMULATED", json.dumps({"note": "Identity verification failed"})),
        )
        connection.execute(
            "INSERT INTO decisions(incident_id,rider_id,created_at,previous_state,new_state,action,explanation,model_version,trust_score) VALUES(?,?,?,?,?,?,?,?,?)",
            (inc_id, "R-5108", now, "VERIFICATION_REQUIRED", "HUMAN_REVIEW", "ESCALATE_HUMAN_REVIEW", "Failed identity verification escalated for human review.", MODEL_VERSION, 24),
        )

    if not connection.execute("SELECT 1 FROM incidents WHERE status='RESOLVED'").fetchone():
        connection.execute(
            "INSERT OR IGNORE INTO incidents(id,rider_id,status,reason,evidence_json,evidence_count,recommended_next_step,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
            ("INC-R-8462-RES01", "R-8462", "RESOLVED", "Temporary route deviation resolved", "[]", 1, "Passive monitoring after simulated verification", now, now),
        )
        connection.execute(
            "INSERT OR IGNORE INTO incidents(id,rider_id,status,reason,evidence_json,evidence_count,recommended_next_step,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
            ("INC-R-6284-RES02", "R-6284", "RESOLVED", "Device change verified via routine check", "[]", 1, "Passive monitoring after simulated verification", now, now),
        )

    # Ensure non-baseline sessions exist for anomalous riders so radar charts and signals render
    if not connection.execute("SELECT 1 FROM sessions WHERE rider_id='R-1042' AND event_type!='baseline'").fetchone():
        r = connection.execute("SELECT * FROM riders WHERE id='R-1042'").fetchone()
        if r:
            ev = [{"signal":"schedule","change":"Shift start moved 314 minutes","unusual":"Outside established working window","weight":"medium"},{"signal":"route","change":"Route consistency fell by 0.38","unusual":"Delivery sequence differs from baseline","weight":"high"}]
            connection.execute(
                "INSERT OR IGNORE INTO sessions(id,rider_id,created_at,event_type,login_minute,shift_hours,acceptance,route_consistency,device_known,anomaly_score,is_anomaly,evidence_json,model_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                ("SES-R-1042-SEED", "R-1042", now, "account_sharing", r["normal_start"] + 314, r["shift_hours"] - 2.0, max(0.4, r["acceptance"] - 0.24), max(0.3, r["route_consistency"] - 0.38), 0, -0.1387, 1, json.dumps(ev), MODEL_VERSION),
            )

    if not connection.execute("SELECT 1 FROM sessions WHERE rider_id='R-4470' AND event_type!='baseline'").fetchone():
        r = connection.execute("SELECT * FROM riders WHERE id='R-4470'").fetchone()
        if r:
            ev = [{"signal":"account_sharing","change":"Account activity detected from multiple devices","unusual":"New device identified during an active delivery","weight":"critical"}]
            connection.execute(
                "INSERT OR IGNORE INTO sessions(id,rider_id,created_at,event_type,login_minute,shift_hours,acceptance,route_consistency,device_known,anomaly_score,is_anomaly,evidence_json,model_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                ("SES-R-4470-SEED", "R-4470", now, "account_sharing", r["normal_start"] + 280, r["shift_hours"] - 2.2, max(0.4, r["acceptance"] - 0.20), max(0.3, r["route_consistency"] - 0.30), 0, -0.1142, 1, json.dumps(ev), MODEL_VERSION),
            )

    if not connection.execute("SELECT 1 FROM sessions WHERE rider_id='R-2187' AND event_type!='baseline'").fetchone():
        r = connection.execute("SELECT * FROM riders WHERE id='R-2187'").fetchone()
        if r:
            ev = [{"signal":"route","change":"Route consistency fell by 0.18","unusual":"Delivery sequence differs from baseline","weight":"high"}]
            connection.execute(
                "INSERT OR IGNORE INTO sessions(id,rider_id,created_at,event_type,login_minute,shift_hours,acceptance,route_consistency,device_known,anomaly_score,is_anomaly,evidence_json,model_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                ("SES-R-2187-SEED", "R-2187", now, "route_change", r["normal_start"] + 20, r["shift_hours"] + 0.2, r["acceptance"] - 0.02, max(0.4, r["route_consistency"] - 0.18), 1, 0.042, 0, json.dumps(ev), MODEL_VERSION),
            )

    # Seed initial activity events if empty or only system events
    non_sys = connection.execute("SELECT COUNT(*) FROM activity_events WHERE rider_id != 'SYSTEM'").fetchone()[0]
    if non_sys < 5:
        events = [
            ("R-4470", "INC-R-4470-9c0c7084a9", "risk", "verification", "Failed identity verification — Escalate Human Review", {"result": "FAILED", "action": "ESCALATE_HUMAN_REVIEW", "trustScore": 24, "riskSeverity": "HIGH RISK", "verificationStatus": "FAILED"}),
            ("R-1042", "INC-R-1042-83bfdfcd47", "watch", "verification", "Identity verification challenge issued — Account activity paused", {"action": "REQUEST_VERIFICATION", "trustScore": 28, "riskSeverity": "SUSPICIOUS", "verificationStatus": "REQUESTED"}),
            ("R-5108", "INC-R-5108-43652cbeeb", "risk", "verification", "Multiple conflicting session signals detected — Flagged for Human Review", {"action": "ESCALATE_HUMAN_REVIEW", "trustScore": 24, "riskSeverity": "HIGH RISK", "verificationStatus": "FAILED"}),
            ("R-2187", None, "watch", "location", "Location deviation detected: Link Road Kitchen vs Indiranagar baseline", {"action": "INCREASE_OBSERVATION", "trustScore": 75, "riskSeverity": "SUSPICIOUS"}),
            ("R-3091", None, "watch", "device", "Demo alternate device profile activated; monitoring delivery telemetry", {"action": "INCREASE_OBSERVATION", "trustScore": 67, "riskSeverity": "SUSPICIOUS"}),
            ("R-8462", None, "trusted", "device", "Recognised device profile restored — Trust score recovered", {"action": "CONTINUE_MONITORING", "trustScore": 88, "riskSeverity": "TRUSTED"}),
            ("R-6284", None, "trusted", "delivery", "Delivery completed with 98% route consistency", {"action": "CONTINUE_MONITORING", "trustScore": 96, "riskSeverity": "TRUSTED"}),
            ("R-7315", None, "trusted", "delivery", "Consistent route delivery completed within expected window", {"action": "CONTINUE_MONITORING", "trustScore": 96, "riskSeverity": "TRUSTED"}),
        ]
        for ev_rider, ev_inc, ev_tone, ev_kind, ev_msg, ev_payload in events:
            emit_event(connection, f"seed-{ev_rider}-{uuid4().hex[:8]}", ev_rider, ev_msg, ev_tone, ev_kind, ev_inc, ev_payload)



def init_database(reset: bool = False) -> None:
    if reset and DB_PATH.exists():
        DB_PATH.unlink()
    with db() as connection:
        connection.executescript(SCHEMA)
        challenge_columns = {row["name"] for row in connection.execute("PRAGMA table_info(verification_challenges)")}
        if "method" not in challenge_columns:
            connection.execute("ALTER TABLE verification_challenges ADD COLUMN method TEXT NOT NULL DEFAULT 'SIMULATED'")
        if "result_metadata_json" not in challenge_columns:
            connection.execute("ALTER TABLE verification_challenges ADD COLUMN result_metadata_json TEXT NOT NULL DEFAULT '{}'")
        decision_columns = {row["name"] for row in connection.execute("PRAGMA table_info(decisions)")}
        if "trust_score" not in decision_columns:
            connection.execute("ALTER TABLE decisions ADD COLUMN trust_score INTEGER")
        add_column(connection, "riders", "online_status INTEGER NOT NULL DEFAULT 1")
        add_column(connection, "riders", "shift_started_at TEXT")
        add_column(connection, "riders", "paused INTEGER NOT NULL DEFAULT 0")
        add_column(connection, "riders", "current_location TEXT")
        add_column(connection, "riders", "deliveries_accepted INTEGER NOT NULL DEFAULT 0")
        add_column(connection, "riders", "deliveries_completed INTEGER NOT NULL DEFAULT 0")
        add_column(connection, "riders", "shift_paused_seconds INTEGER NOT NULL DEFAULT 0")
        add_column(connection, "riders", "shift_paused_at TEXT")
        add_column(connection, "rider_accounts", "baseline_status TEXT NOT NULL DEFAULT 'LEARNING'")
        add_column(connection, "rider_accounts", "profile_photo_data BLOB")
        add_column(connection, "rider_accounts", "profile_photo_mime TEXT")
        add_column(connection, "deliveries", "session_id TEXT")
        # Repair records produced by older demo builds where a single normal
        # event could label a still-low score as trusted.
        connection.execute("UPDATE riders SET state='OBSERVING' WHERE state='TRUSTED' AND trust_score < ?", (TRUSTED_THRESHOLD,))
        connection.execute(
            "UPDATE verification_challenges SET status='EXPIRED',result='EXPIRED',completed_at=? "
            "WHERE status='PENDING' AND id NOT IN "
            "(SELECT pending_verification_id FROM riders WHERE pending_verification_id IS NOT NULL)",
            (utc_now(),),
        )
        failed_riders = connection.execute(
            "SELECT * FROM riders WHERE verification_status='FAILED' AND state!='HUMAN_REVIEW'"
        ).fetchall()
        for failed_rider in failed_riders:
            incident = connection.execute(
                "SELECT * FROM incidents WHERE rider_id=? AND status IN ('OPEN','VERIFYING') ORDER BY updated_at DESC LIMIT 1",
                (failed_rider["id"],),
            ).fetchone()
            if not incident:
                continue
            connection.execute(
                "UPDATE incidents SET status='HUMAN_REVIEW',recommended_next_step=?,updated_at=? WHERE id=?",
                ("Human review required after failed identity verification", utc_now(), incident["id"]),
            )
            connection.execute(
                "UPDATE riders SET state='HUMAN_REVIEW',trust_score=24,last_event=?,updated_at=? WHERE id=?",
                ("Failed identity verification escalated for human review", utc_now(), failed_rider["id"]),
            )
            event_id = emit_event(
                connection, f"failed-verification-escalation-{incident['id']}", failed_rider["id"],
                "Failed identity verification — Escalate Human Review", "risk", "verification", incident["id"],
                {"result": "FAILED", "action": "ESCALATE_HUMAN_REVIEW", "trustScore": 24, "riskSeverity": "HIGH RISK", "verificationStatus": "FAILED"},
            )
            connection.execute(
                "INSERT INTO decisions(event_id,incident_id,rider_id,created_at,previous_state,new_state,action,explanation,model_version,trust_score) VALUES(?,?,?,?,?,?,?,?,?,?)",
                (event_id, incident["id"], failed_rider["id"], utc_now(), failed_rider["state"], "HUMAN_REVIEW", "ESCALATE_HUMAN_REVIEW", "A failed identity verification was escalated for human review; no automatic account restriction was applied.", MODEL_VERSION, 24),
            )
        count = connection.execute("SELECT COUNT(*) FROM riders").fetchone()[0]
        if not count:
            now = utc_now()
            for rider in RIDERS:
                connection.execute(
                    "INSERT INTO riders(id,name,city,device_id,normal_start,shift_hours,acceptance,route_consistency,current_location,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                    (*rider, rider[2], now),
                )
                seed_history(connection, rider)
        seed_demo_access(connection)
        is_test = "test" in DB_PATH.name or os.getenv("STILLYOU_TEST_MODE", "0") == "1"
        if not is_test:
            seed_dummy_variation(connection)


def reset_database() -> None:
    """Clear demo state without replacing the database file under active readers."""
    with db() as connection:
        connection.executescript(
            """
            DELETE FROM deliveries;
            DELETE FROM delivery_declines;
            DELETE FROM otp_challenges;
            DELETE FROM recognised_devices;
            DELETE FROM rider_sessions;
            DELETE FROM rider_accounts;
            DELETE FROM decisions;
            DELETE FROM verification_challenges;
            DELETE FROM incidents;
            DELETE FROM activity_events;
            DELETE FROM sessions;
            DELETE FROM riders;
            DELETE FROM sqlite_sequence;
            """
        )
    init_database()


def reset_demo_rider(rider_id: str = "R-9001") -> None:
    """Reset only the assigned live-demo identity while retaining active authenticated sessions."""
    with db() as connection:
        rider = connection.execute("SELECT * FROM riders WHERE id=?", (rider_id,)).fetchone()
        if not rider:
            raise ValueError("Demo rider not found")
        now = utc_now()
        connection.execute(
            "UPDATE deliveries SET rider_id=NULL,session_id=NULL,status='AVAILABLE',updated_at=? WHERE (rider_id=? OR rider_id IS NULL)",
            (now, rider_id),
        )
        connection.execute("DELETE FROM delivery_declines WHERE rider_id=?", (rider_id,))
        # Preserve active rider sessions so demo phones are not logged out
        connection.execute(
            "UPDATE rider_sessions SET status='AUTHENTICATED',revoked_at=NULL WHERE rider_id=? AND revoked_at IS NULL",
            (rider_id,),
        )
        # Keep the initial phone device as recognized and trusted; clear secondary devices so new-device anomaly fires again
        first_device = connection.execute(
            "SELECT id FROM recognised_devices WHERE rider_id=? ORDER BY id ASC LIMIT 1", (rider_id,)
        ).fetchone()
        if first_device:
            connection.execute("DELETE FROM recognised_devices WHERE rider_id=? AND id!=?", (rider_id, first_device["id"]))
            connection.execute("UPDATE recognised_devices SET trusted=1,last_seen_at=? WHERE id=?", (now, first_device["id"]))
        else:
            connection.execute("DELETE FROM recognised_devices WHERE rider_id=?", (rider_id,))
        connection.execute("UPDATE otp_challenges SET status='EXPIRED',completed_at=? WHERE rider_id=? AND status='PENDING'", (now, rider_id))
        connection.execute("UPDATE verification_challenges SET status='COMPLETED',result='DEMO_RESET',completed_at=? WHERE rider_id=? AND status='PENDING'", (now, rider_id))
        connection.execute("UPDATE incidents SET status='RESOLVED',recommended_next_step='Demo rider reset to baseline by operator',updated_at=? WHERE rider_id=? AND status!='RESOLVED'", (now, rider_id))
        connection.execute(
            "UPDATE riders SET trust_score=100,state='TRUSTED',verification_status='PASSED',pending_verification_id=NULL,"
            "last_event='Demo baseline active — System normal',online_status=1,paused=0,shift_started_at=?,shift_paused_seconds=0,"
            "shift_paused_at=NULL,deliveries_accepted=0,deliveries_completed=0,updated_at=? WHERE id=?",
            (now, now, rider_id),
        )
        connection.execute("UPDATE rider_accounts SET baseline_status='ESTABLISHED' WHERE rider_id=?", (rider_id,))
        event_id = emit_event(
            connection, f"demo-rider-reset-{uuid4().hex[:12]}", rider_id,
            "Demo rider reset to verified baseline (Trust: 100 · BLUE)", "trusted", "demo_reset",
            payload={"action": "RESET_DEMO_RIDER", "trustScore": 100, "riskSeverity": "TRUSTED", "verificationStatus": "PASSED"},
        )
        connection.execute(
            "INSERT INTO decisions(event_id,incident_id,rider_id,created_at,previous_state,new_state,action,explanation,model_version,trust_score) VALUES(?,?,?,?,?,?,?,?,?,?)",
            (event_id, None, rider_id, now, rider["state"], "TRUSTED", "RESET_DEMO_RIDER", "Operator reset the assigned demo rider to baseline. Connected phone sessions remain authenticated.", MODEL_VERSION, 100),
        )


def seed_history(connection: sqlite3.Connection, rider: tuple) -> None:
    rider_id, _, _, _, start, hours, acceptance, route = rider
    local = random.Random(sum(map(ord, rider_id)))
    for index in range(30):
        features = [
            start + local.gauss(0, 24),
            max(3.5, hours + local.gauss(0, .45)),
            min(.99, max(.45, acceptance + local.gauss(0, .035))),
            min(.99, max(.5, route + local.gauss(0, .025))),
            1,
        ]
        connection.execute(
            "INSERT INTO sessions(id,rider_id,created_at,event_type,login_minute,shift_hours,acceptance,route_consistency,device_known,anomaly_score,is_anomaly,evidence_json,model_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (f"BASE-{rider_id}-{index:02d}", rider_id, f"2026-09-{(index % 28) + 1:02d}T08:00:00+00:00", "baseline", *features, 0.0, 0, "[]", MODEL_VERSION),
        )


MODELS: dict[str, IsolationForest] = {}


def feature_vector(row: sqlite3.Row | dict) -> list[float]:
    return [
        float(row["login_minute"]) / 1440,
        float(row["shift_hours"]) / 12,
        float(row["acceptance"]),
        float(row["route_consistency"]),
        float(row["device_known"]),
    ]


def train_models() -> None:
    with db() as connection:
        MODELS.clear()
        for rider_row in connection.execute("SELECT id FROM riders"):
            rider_id = rider_row["id"]
            rows = connection.execute(
                "SELECT * FROM sessions WHERE rider_id=? AND event_type='baseline' ORDER BY created_at", (rider_id,)
            ).fetchall()
            if len(rows) < 8:
                continue
            model = IsolationForest(n_estimators=120, contamination=.08, random_state=sum(map(ord, rider_id)))
            model.fit(np.asarray([feature_vector(row) for row in rows]))
            MODELS[rider_id] = model


def scenario_features(rider: sqlite3.Row, event_type: str, sequence: int = 0) -> dict[str, float | int]:
    start, hours, acceptance, route = rider["normal_start"], rider["shift_hours"], rider["acceptance"], rider["route_consistency"]
    if event_type == "normal":
        return {"login_minute": start + RNG.gauss(0, 15), "shift_hours": hours + RNG.gauss(0, .2), "acceptance": acceptance + RNG.gauss(0, .018), "route_consistency": route + RNG.gauss(0, .012), "device_known": 1}
    if event_type == "device_change":
        return {"login_minute": start + 8, "shift_hours": hours - .1, "acceptance": acceptance - .01, "route_consistency": route - .015, "device_known": 0}
    if event_type == "shift_change":
        return {"login_minute": start + 150, "shift_hours": hours - .15, "acceptance": acceptance - .015, "route_consistency": route - .02, "device_known": 1}
    if event_type == "route_change":
        return {"login_minute": start + 20, "shift_hours": hours + .2, "acceptance": acceptance - .02, "route_consistency": max(.42, route - .30), "device_known": 1}
    # Persistent account-sharing evidence differs across several independent behavioral families.
    drift = min(sequence, 3)
    return {"login_minute": start + 260 + drift * 18, "shift_hours": max(3.6, hours - 2.0), "acceptance": max(.48, acceptance - .24), "route_consistency": max(.36, route - .38), "device_known": 1}


def evidence_for(rider: sqlite3.Row, features: dict, event_type: str, score: float, anomalous: bool) -> list[dict]:
    evidence = []
    if event_type == "account_sharing":
        evidence.append({"signal": "account_sharing", "change": "Account activity detected from multiple devices", "unusual": "New device identified during an active delivery", "weight": "critical"})
        evidence.append({"signal": "policy", "change": "Identity re-verification required", "unusual": "Suspicious simultaneous activity detected across separate devices", "weight": "action"})
    if not features["device_known"]:
        evidence.append({"signal": "device", "change": "Previously unseen device", "unusual": "Context only", "weight": "low"})
    shift_delta = abs(float(features["login_minute"]) - rider["normal_start"])
    if shift_delta > 90:
        evidence.append({"signal": "schedule", "change": f"Shift start moved {round(shift_delta)} minutes", "unusual": "Outside established working window", "weight": "medium"})
    route_delta = rider["route_consistency"] - float(features["route_consistency"])
    if route_delta > .16:
        evidence.append({"signal": "route", "change": f"Route consistency fell by {route_delta:.2f}", "unusual": "Delivery sequence differs from baseline", "weight": "high"})
    acceptance_delta = rider["acceptance"] - float(features["acceptance"])
    if acceptance_delta > .12:
        evidence.append({"signal": "activity", "change": f"Acceptance rate fell by {acceptance_delta:.2f}", "unusual": "Persistent interaction change", "weight": "high"})
    if anomalous:
        evidence.append({"signal": "isolation_forest", "change": f"Model decision score {score:.4f}", "unusual": "Unusual multivariate feature combination", "weight": "supporting"})
    if event_type == "shift_change":
        evidence.append({"signal": "context", "change": "Isolated schedule change", "unusual": "Plausible legitimate explanation retained", "weight": "mitigating"})
    return evidence


def process_event(rider_id: str, event_type: str, event_key: str | None = None) -> dict:
    with db() as connection:
        rider = connection.execute("SELECT * FROM riders WHERE id=?", (rider_id,)).fetchone()
        if not rider:
            raise ValueError("Unknown rider")
        duplicate = connection.execute("SELECT payload_json FROM activity_events WHERE event_key=?", (event_key,)).fetchone() if event_key else None
        if duplicate:
            return {"riderId": rider_id, "duplicate": True, **jload(duplicate[0], {})}
        recent_suspicious = connection.execute(
            "SELECT COUNT(*) FROM sessions WHERE rider_id=? AND event_type IN ('device_change','route_change','account_sharing') "
            "AND created_at >= datetime('now','-24 hours')", (rider_id,)
        ).fetchone()[0]
        features = scenario_features(rider, event_type, recent_suspicious)
        vector = np.asarray([[
            float(features["login_minute"]) / 1440, float(features["shift_hours"]) / 12,
            float(features["acceptance"]), float(features["route_consistency"]), float(features["device_known"]),
        ]])
        model = MODELS.get(rider_id)
        if model is None:
            train_models()
            model = MODELS.get(rider_id)
        if model is None:
            model = IsolationForest(n_estimators=50, contamination=.08, random_state=42)
            default_vectors = np.asarray([[
                float(rider["normal_start"]) / 1440, float(rider["shift_hours"]) / 12,
                float(rider["acceptance"]), float(rider["route_consistency"]), 1.0,
            ]] * 10)
            model.fit(default_vectors)
            MODELS[rider_id] = model
        model_score = float(model.decision_function(vector)[0])
        anomalous = bool(model.predict(vector)[0] == -1)
        evidence = evidence_for(rider, features, event_type, model_score, anomalous)
        persistent_count = recent_suspicious + (1 if event_type == "account_sharing" else 0)

        previous = rider["state"]
        if event_type == "normal":
            trust = min(100, rider["trust_score"] + 3)
            state = "TRUSTED" if trust >= TRUSTED_THRESHOLD else "OBSERVING"
            action = "CONTINUE_MONITORING" if state == "TRUSTED" else "INCREASE_OBSERVATION"
        elif event_type in {"device_change", "shift_change"}:
            trust, state, action = max(0, min(90, rider["trust_score"] - 10)), "OBSERVING", "INCREASE_OBSERVATION"
        elif event_type == "route_change":
            trust, state, action = max(0, min(64, rider["trust_score"] - 16)), "OBSERVING", "INCREASE_OBSERVATION"
        elif persistent_count < 2:
            trust, state, action = max(0, min(85, rider["trust_score"] - 15)), "OBSERVING", "INCREASE_OBSERVATION"
        else:
            trust, state, action = min(rider["trust_score"], 75), "VERIFICATION_REQUIRED", "REQUEST_VERIFICATION"

        # Hysteresis: passive activity cannot clear an unresolved challenge or a
        # human-review hold. Only verification/review endpoints may do that.
        if previous == "HUMAN_REVIEW":
            trust, state, action = rider["trust_score"], "HUMAN_REVIEW", "AWAIT_HUMAN_REVIEW"
        elif previous == "VERIFICATION_REQUIRED" and rider["pending_verification_id"] and event_type != "account_sharing":
            trust, state, action = rider["trust_score"], "VERIFICATION_REQUIRED", "REQUEST_VERIFICATION"

        incident_id = None
        challenge_id = None
        if state == "VERIFICATION_REQUIRED":
            existing = connection.execute("SELECT * FROM incidents WHERE rider_id=? AND status IN ('OPEN','VERIFYING') ORDER BY created_at DESC LIMIT 1", (rider_id,)).fetchone()
            incident_id = existing["id"] if existing else f"INC-{rider_id}-{uuid4().hex[:10]}"
            second_signature = persistent_count >= 3
            if event_type == "account_sharing":
                reason = "Account activity detected from multiple devices. New device identified during an active delivery. Identity re-verification required."
            elif second_signature:
                reason = "Potential second behavioural signature detected"
            else:
                reason = "Repeated multivariate behavioural anomaly"
            if existing:
                combined = jload(existing["evidence_json"], []) + evidence
                connection.execute("UPDATE incidents SET evidence_json=?,evidence_count=?,reason=?,status='VERIFYING',updated_at=? WHERE id=?", (jdump(combined), persistent_count, reason, utc_now(), incident_id))
            else:
                connection.execute("INSERT INTO incidents(id,rider_id,status,reason,evidence_json,evidence_count,recommended_next_step,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", (incident_id, rider_id, "VERIFYING", reason, jdump(evidence), persistent_count, "Await identity verification result", utc_now(), utc_now()))
            existing_challenge = connection.execute("SELECT * FROM verification_challenges WHERE incident_id=? AND status='PENDING'", (incident_id,)).fetchone()
            challenge_id = existing_challenge["id"] if existing_challenge else f"VER-{rider_id}-{uuid4().hex[:10]}"
            if not existing_challenge:
                connection.execute("INSERT INTO verification_challenges(id,incident_id,rider_id,status,created_at) VALUES(?,?,?,?,?)", (challenge_id, incident_id, rider_id, "PENDING", utc_now()))

        session_id = f"SES-{rider_id}-{int(datetime.now().timestamp() * 1000)}"
        connection.execute(
            "INSERT INTO sessions(id,rider_id,created_at,event_type,login_minute,shift_hours,acceptance,route_consistency,device_known,anomaly_score,is_anomaly,evidence_json,model_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (session_id, rider_id, utc_now(), event_type, features["login_minute"], features["shift_hours"], features["acceptance"], features["route_consistency"], features["device_known"], model_score, int(anomalous), jdump(evidence), MODEL_VERSION),
        )
        verification_status = "REQUESTED" if challenge_id else (rider["verification_status"] if state != "TRUSTED" else "NOT_REQUIRED")
        summary = "New device identified during an active delivery" if event_type == "account_sharing" else (evidence[0]["change"] if evidence else "Activity matched the established baseline")
        connection.execute("UPDATE riders SET trust_score=?,state=?,verification_status=?,pending_verification_id=?,last_event=?,updated_at=? WHERE id=?", (trust, state, verification_status, challenge_id, summary, utc_now(), rider_id))
        explanation = (
            "Account activity detected from multiple devices. New device identified during an active delivery. Identity re-verification required."
            if event_type == "account_sharing"
            else f"{len(evidence)} evidence signals evaluated; {action.replace('_', ' ').lower()} selected under policy hysteresis."
        )
        should_log = bool(event_key) or bool(evidence) or state != previous
        risk_severity = "HIGH RISK" if state == "HUMAN_REVIEW" else "SUSPICIOUS" if state in {"OBSERVING", "VERIFICATION_REQUIRED"} else "TRUSTED"
        event_payload = {"sessionId": session_id, "modelScore": model_score, "action": action, "trustScore": trust, "riskSeverity": risk_severity, "verificationStatus": verification_status}
        event_id = emit_event(connection, event_key or session_id, rider_id, f"{summary} — {action.replace('_', ' ').title()}", "risk" if state in {"VERIFICATION_REQUIRED", "HUMAN_REVIEW"} else "watch" if state == "OBSERVING" else "trusted", "decision", incident_id, event_payload) if should_log else None
        connection.execute("INSERT INTO decisions(event_id,incident_id,rider_id,created_at,previous_state,new_state,action,explanation,model_version,trust_score) VALUES(?,?,?,?,?,?,?,?,?,?)", (event_id, incident_id, rider_id, utc_now(), previous, state, action, explanation, MODEL_VERSION, trust))
        if challenge_id:
            emit_event(connection, f"challenge-{challenge_id}", rider_id, f"Verification challenge initiated automatically — {rider_id}", "risk", "verification", incident_id, {"challengeId": challenge_id, "trustScore": trust, "riskSeverity": risk_severity, "action": "REQUEST_VERIFICATION", "verificationStatus": "REQUESTED"})
        return {"riderId": rider_id, "state": state, "trustScore": trust, "action": action, "anomalyScore": model_score, "isAnomaly": anomalous, "evidence": evidence, "incidentId": incident_id, "challengeId": challenge_id, "modelVersion": MODEL_VERSION}


def complete_verification(identifier: str, result: str, source: str = "SIMULATED", metadata: Optional[dict] = None) -> dict:
    result = result.upper()
    if result not in {"PASSED", "FAILED", "EXPIRED", "INCONCLUSIVE"}:
        raise ValueError("Unsupported verification result")
    with db() as connection:
        challenge = connection.execute(
            "SELECT * FROM verification_challenges WHERE id=? OR (rider_id=? AND status='PENDING') ORDER BY created_at DESC LIMIT 1",
            (identifier, identifier),
        ).fetchone()
        if not challenge:
            rider = connection.execute("SELECT * FROM riders WHERE id=?", (identifier,)).fetchone()
            if rider:
                incident = connection.execute("SELECT * FROM incidents WHERE rider_id=? ORDER BY created_at DESC LIMIT 1", (rider["id"],)).fetchone()
                incident_id = incident["id"] if incident else f"incident-{rider['id']}-{uuid4().hex[:8]}"
                if not incident:
                    connection.execute(
                        "INSERT INTO incidents(id,rider_id,status,reason,evidence_json,evidence_count,recommended_next_step,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
                        (incident_id, rider["id"], "VERIFYING", "Ad-hoc identity verification check", "[]", 1, "Verify identity", utc_now(), utc_now()),
                    )
                challenge_id = f"challenge-{rider['id']}-{uuid4().hex[:8]}"
                connection.execute(
                    "INSERT INTO verification_challenges(id,incident_id,rider_id,status,created_at) VALUES(?,?,?,?,?)",
                    (challenge_id, incident_id, rider["id"], "PENDING", utc_now()),
                )
                challenge = connection.execute("SELECT * FROM verification_challenges WHERE id=?", (challenge_id,)).fetchone()
            else:
                raise ValueError("Verification challenge not found")
        rider = connection.execute("SELECT * FROM riders WHERE id=?", (challenge["rider_id"],)).fetchone()
        incident = connection.execute("SELECT * FROM incidents WHERE id=?", (challenge["incident_id"],)).fetchone()
        if not incident:
            incident_id = challenge["incident_id"]
            connection.execute(
                "INSERT INTO incidents(id,rider_id,status,reason,evidence_json,evidence_count,recommended_next_step,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
                (incident_id, rider["id"], "VERIFYING", "Identity verification check", "[]", 1, "Verify identity", utc_now(), utc_now()),
            )
            incident = connection.execute("SELECT * FROM incidents WHERE id=?", (incident_id,)).fetchone()
        attempts = challenge["attempts"] + 1
        method = source.upper().replace(" ", "_")[:40]
        result_label = "Face verification" if method == "FACE_MATCH" else "Simulated verification"
        if result == "PASSED":
            trust = 100 if method == "FACE_MATCH" else min(90, rider["trust_score"] + 35)
            state = "TRUSTED" if method == "FACE_MATCH" or incident["evidence_count"] < 3 else "OBSERVING"
            incident_status = "RESOLVED"
            action = "RESOLVE_INCIDENT"
            next_step = "Identity successfully re-verified. Previously detected device anomaly resolved."
            decision_msg = "Identity successfully re-verified via face match. Previously detected device anomaly resolved."
            # Automatically trust the verified device
            connection.execute("UPDATE recognised_devices SET trusted=1,last_seen_at=? WHERE rider_id=?", (utc_now(), rider["id"]))
        elif result == "FAILED":
            trust, state, incident_status, action = 20, "HUMAN_REVIEW", "HUMAN_REVIEW", "ESCALATE_HUMAN_REVIEW"
            next_step = "Human review required after failed identity verification: identity mismatch detected on new device. Access maintained for demo."
            decision_msg = "Identity verification failed. Scanned face did not match enrolled reference photograph. Trust reduced drastically to 20 (RED). Escalate for human review; access maintained for demo."
        else:
            trust, state, incident_status, action = max(28, rider["trust_score"] - 8), "VERIFICATION_REQUIRED", "VERIFYING", "REQUEST_VERIFICATION"
            next_step = "Retry or await human review if unresolved"
            decision_msg = "Verification result inconclusive; policy kept verification challenge open."
        safe_metadata = {
            key: value for key, value in (metadata or {}).items()
            if key in {"matchDistance", "movementChecks", "model", "note"}
        }
        connection.execute(
            "UPDATE verification_challenges SET status=?,attempts=?,completed_at=?,result=?,method=?,result_metadata_json=?,simulated=? WHERE id=?",
            (result, attempts, utc_now(), result, method, jdump(safe_metadata), int(method != "FACE_MATCH"), challenge["id"]),
        )
        connection.execute("UPDATE incidents SET status=?,recommended_next_step=?,updated_at=? WHERE id=?", (incident_status, next_step, utc_now(), incident["id"]))
        connection.execute("UPDATE riders SET trust_score=?,state=?,verification_status=?,pending_verification_id=NULL,last_event=?,updated_at=? WHERE id=?", (trust, state, result, next_step, utc_now(), rider["id"]))
        risk_severity = "HIGH RISK" if state == "HUMAN_REVIEW" else "SUSPICIOUS" if state in {"OBSERVING", "VERIFICATION_REQUIRED"} else "TRUSTED"
        event_message = (
            "Identity successfully re-verified. Previously detected device anomaly resolved."
            if (result == "PASSED" and method == "FACE_MATCH")
            else f"Face verification failed — Escalate Human Review. Identity mismatch detected on new device."
            if result == "FAILED"
            else f"{result_label} {result.lower()} — {action.replace('_', ' ').title()}"
        )
        event_id = emit_event(connection, f"verification-{challenge['id']}-{attempts}-{result}", rider["id"], event_message, "trusted" if incident_status == "RESOLVED" else "risk", "verification", incident["id"], {"result": result, "action": action, "method": method, "trustScore": trust, "riskSeverity": risk_severity, "verificationStatus": result, **safe_metadata})
        connection.execute("INSERT INTO decisions(event_id,incident_id,rider_id,created_at,previous_state,new_state,action,explanation,model_version,trust_score) VALUES(?,?,?,?,?,?,?,?,?,?)", (event_id, incident["id"], rider["id"], utc_now(), rider["state"], state, action, decision_msg, MODEL_VERSION, trust))
        return {"riderId": rider["id"], "result": result, "state": state, "trustScore": trust, "action": action}


def rider_payload(connection: sqlite3.Connection, rider: sqlite3.Row) -> dict:
    recent = connection.execute("SELECT * FROM sessions WHERE rider_id=? AND event_type!='baseline' ORDER BY created_at DESC LIMIT 8", (rider["id"],)).fetchall()
    decisions = connection.execute("SELECT * FROM decisions WHERE rider_id=? ORDER BY id DESC LIMIT 8", (rider["id"],)).fetchall()
    latest = recent[0] if recent else None
    evidence = jload(latest["evidence_json"], []) if latest else []
    baseline = [round(rider["normal_start"] / 14.4), round(rider["acceptance"] * 100), round(rider["route_consistency"] * 100), round(rider["shift_hours"] * 10), 90]
    observed = baseline if not latest else [round(latest["login_minute"] / 14.4), round(latest["acceptance"] * 100), round(latest["route_consistency"] * 100), round(latest["shift_hours"] * 10), 100 if latest["device_known"] else 20]
    timeline = list(reversed([row["new_state"] for row in decisions]))
    recorded_scores = list(reversed([
        {"score": row["trust_score"], "timestamp": row["created_at"], "action": row["action"]}
        for row in decisions if row["trust_score"] is not None
    ]))
    if not recorded_scores:
        recorded_scores = [{"score": rider["trust_score"], "timestamp": rider["updated_at"], "action": "CURRENT_STATE"}]
    score_timeline = [item["score"] for item in recorded_scores]
    latest_verification = connection.execute(
        "SELECT * FROM verification_challenges WHERE rider_id=? ORDER BY created_at DESC LIMIT 1", (rider["id"],)
    ).fetchone()
    latest_action = decisions[0]["action"] if decisions else "CONTINUE_MONITORING"
    account = connection.execute("SELECT * FROM rider_accounts WHERE rider_id=?", (rider["id"],)).fetchone()
    portal_session = connection.execute(
        "SELECT * FROM rider_sessions WHERE rider_id=? AND revoked_at IS NULL ORDER BY last_seen_at DESC,created_at DESC LIMIT 1",
        (rider["id"],),
    ).fetchone()
    portal_device = connection.execute(
        "SELECT * FROM recognised_devices WHERE rider_id=? AND device_id=?",
        (rider["id"], portal_session["device_id"]),
    ).fetchone() if portal_session else None
    session_location = jload(portal_session["location_json"], {}) if portal_session else {}
    shift_elapsed_seconds = 0
    if rider["shift_started_at"]:
        try:
            end = datetime.fromisoformat(rider["shift_paused_at"]) if rider["shift_paused_at"] else datetime.now(timezone.utc)
            started = datetime.fromisoformat(rider["shift_started_at"])
            shift_elapsed_seconds = max(0, int((end - started).total_seconds()) - int(rider["shift_paused_seconds"] or 0))
        except (TypeError, ValueError):
            shift_elapsed_seconds = 0
    current_delivery = connection.execute(
        "SELECT * FROM deliveries WHERE rider_id=? AND status IN ('ACCEPTED','PICKED_UP') ORDER BY updated_at DESC LIMIT 1",
        (rider["id"],),
    ).fetchone()
    shared_devices = connection.execute(
        "SELECT d.device_id,COUNT(DISTINCT d.rider_id) account_count FROM recognised_devices d "
        "WHERE d.device_id IN (SELECT device_id FROM recognised_devices WHERE rider_id=?) "
        "GROUP BY d.device_id HAVING COUNT(DISTINCT d.rider_id)>1",
        (rider["id"],),
    ).fetchall()
    related_accounts = sum(max(0, row["account_count"] - 1) for row in shared_devices)
    active_sessions = connection.execute(
        "SELECT * FROM rider_sessions WHERE rider_id=? AND revoked_at IS NULL AND expires_at>? ORDER BY created_at DESC",
        (rider["id"], utc_now()),
    ).fetchall()
    handoff_contributors = [item["change"] for item in evidence if item.get("weight") != "mitigating"]
    if len(active_sessions) > 1:
        handoff_contributors.append(f"{len(active_sessions)} concurrent sessions")
    handoff_risk = min(100, max(0, 100 - rider["trust_score"] + len(handoff_contributors) * 7))
    if rider["state"] == "HUMAN_REVIEW":
        latest_action = "AWAIT_HUMAN_REVIEW"
    elif rider["state"] == "VERIFICATION_REQUIRED":
        latest_action = "REQUEST_VERIFICATION"
    elif rider["state"] == "OBSERVING" and latest_action == "CONTINUE_MONITORING":
        latest_action = "INCREASE_OBSERVATION"
    payload = {
        "id": rider["id"], "name": rider["name"], "city": rider["city"], "device": rider["device_id"],
        "identityConfidence": rider["trust_score"], "trustScore": rider["trust_score"],
        "state": rider["state"], "riskLevel": "HIGH RISK" if rider["state"] == "HUMAN_REVIEW" or rider["trust_score"] < HIGH_RISK_THRESHOLD else "TRUSTED" if rider["trust_score"] >= TRUSTED_THRESHOLD and rider["state"] == "TRUSTED" else "SUSPICIOUS",
        "baselineMaturity": "Baseline learning" if account and account["baseline_status"] == "LEARNING" else "Established · 30 verified shifts", "currentSession": latest["id"] if latest else "BASELINE",
        "lastEvent": rider["last_event"], "automatedAction": latest_action.replace("_", " "),
        "verificationStatus": rider["verification_status"], "pendingVerificationId": rider["pending_verification_id"],
        "behavioralMatch": max(10, rider["trust_score"] - 3), "anomalies": [item["change"] for item in evidence],
        "evidence": evidence, "anomalyScore": latest["anomaly_score"] if latest else 0.0,
        "modelVersion": latest["model_version"] if latest else MODEL_VERSION,
        "baseline": baseline, "observed": observed, "confidenceTimeline": score_timeline[-7:], "trustHistory": recorded_scores[-7:],
        "eventHistory": [row["explanation"] for row in reversed(decisions[:5])] or ["Trusted behavioral baseline established"],
        "automatedActions": [row["action"].replace("_", " ") for row in decisions],
        "recentDecisions": [dict(row) for row in decisions],
        "online": bool(rider["online_status"]), "paused": bool(rider["paused"]),
        "shiftStartedAt": rider["shift_started_at"], "shiftElapsedSeconds": shift_elapsed_seconds,
        "currentLocation": rider["current_location"] or "Location not shared", "location": session_location,
        "usualLocation": account["primary_area"] if account else rider["city"],
        "deliveriesAccepted": rider["deliveries_accepted"], "deliveriesCompleted": rider["deliveries_completed"],
        "currentDelivery": dict(current_delivery) if current_delivery else None,
        "hasReferencePhoto": bool(account and (account["profile_photo_data"] or account["profile_photo_path"])),
        "relationships": {"relatedAccounts": related_accounts, "sharedDevices": len(shared_devices), "assessment": "UNDER INVESTIGATION" if related_accounts else "NO MATERIAL CONNECTION"},
        "handoffAssessment": {"riskScore": handoff_risk, "dataSufficiency": "SUFFICIENT" if len(recent) >= 2 or len(active_sessions) > 1 else "LIMITED", "contributors": handoff_contributors[:5], "recommendedAction": latest_action.replace("_", " ")},
        "activeSessionCount": len(active_sessions),
    }
    payload.update({
        "riderId": rider["id"],
        "trustStatus": rider["state"],
        "baselineProfile": {
            "normalStartMinute": rider["normal_start"], "shiftHours": rider["shift_hours"],
            "acceptanceRate": rider["acceptance"], "routeConsistency": rider["route_consistency"],
        },
        "deviceInformation": {"deviceId": portal_session["device_id"] if portal_session else rider["device_id"], "label": portal_session["device_label"] if portal_session else rider["device_id"], "known": bool(portal_device and portal_device["trusted"]) if portal_session else bool(latest["device_known"]) if latest else True},
        "loginActivity": [{"sessionId": row["id"], "timestamp": row["created_at"], "eventType": row["event_type"]} for row in recent],
        "behaviouralSignals": evidence,
        "faceVerificationStatus": rider["verification_status"],
        "faceVerificationMethod": latest_verification["method"] if latest_verification else "NOT_REQUESTED",
        "lastUpdated": rider["updated_at"],
        "verificationRequired": bool(rider["pending_verification_id"]),
        "reviewStatus": "REVIEW_REQUIRED" if rider["state"] == "HUMAN_REVIEW" else "NONE",
    })
    return payload


def incident_payload(connection: sqlite3.Connection, row: sqlite3.Row) -> dict:
    challenges = connection.execute("SELECT * FROM verification_challenges WHERE incident_id=? ORDER BY created_at", (row["id"],)).fetchall()
    decisions = connection.execute("SELECT * FROM decisions WHERE incident_id=? ORDER BY id", (row["id"],)).fetchall()
    attempts = []
    for item in challenges:
        attempt = dict(item)
        attempt["resultMetadata"] = jload(attempt.pop("result_metadata_json", "{}"), {})
        attempts.append(attempt)
    return {**dict(row), "evidence": jload(row["evidence_json"], []), "verificationAttempts": attempts, "decisions": [dict(item) for item in decisions]}


def snapshot() -> dict:
    with db() as connection:
        riders = [rider_payload(connection, row) for row in connection.execute("SELECT * FROM riders ORDER BY id")]
        events = [dict(row) | {"payload": jload(row["payload_json"], {})} for row in connection.execute("SELECT * FROM activity_events ORDER BY id DESC LIMIT 80")]
        incidents = [incident_payload(connection, row) for row in connection.execute("SELECT * FROM incidents ORDER BY updated_at DESC")]
        stats = {
            "activeRiders": sum(rider["online"] for rider in riders),
            "averageTrust": round(sum(rider["trustScore"] for rider in riders) / len(riders)) if riders else 0,
            "suspiciousRiders": sum(rider["riskLevel"] == "SUSPICIOUS" for rider in riders),
            "elevatedRisk": sum(rider["riskLevel"] != "TRUSTED" for rider in riders),
            "pendingVerifications": connection.execute(
                "SELECT COUNT(*) FROM verification_challenges c JOIN riders r ON r.pending_verification_id=c.id "
                "WHERE c.status='PENDING' AND r.verification_status='REQUESTED'"
            ).fetchone()[0],
            "escalatedIncidents": connection.execute("SELECT COUNT(*) FROM incidents WHERE status='HUMAN_REVIEW'").fetchone()[0],
            "anomaliesDetected": connection.execute("SELECT COUNT(*) FROM sessions WHERE is_anomaly=1 AND event_type!='baseline'").fetchone()[0],
            "automaticallyResolved": connection.execute("SELECT COUNT(*) FROM incidents WHERE status='RESOLVED'").fetchone()[0],
            "pendingReview": connection.execute("SELECT COUNT(*) FROM incidents WHERE status='HUMAN_REVIEW'").fetchone()[0],
            "activeVerifications": connection.execute(
                "SELECT COUNT(*) FROM verification_challenges c JOIN riders r ON r.pending_verification_id=c.id "
                "WHERE c.status='PENDING' AND r.verification_status='REQUESTED'"
            ).fetchone()[0],
        }
        return {"riders": riders, "events": events, "incidents": incidents, "stats": stats, "modelVersion": MODEL_VERSION}


SUBSCRIBERS: set[asyncio.Queue] = set()
EVENT_LOOP: asyncio.AbstractEventLoop | None = None


def publish(message: dict) -> None:
    if not EVENT_LOOP or not SUBSCRIBERS:
        return
    for queue in tuple(SUBSCRIBERS):
        EVENT_LOOP.call_soon_threadsafe(queue.put_nowait, message)


async def simulator() -> None:
    while True:
        await asyncio.sleep(SIMULATOR_INTERVAL_SECONDS)
        with db() as connection:
            pending = connection.execute(
                "SELECT id FROM verification_challenges WHERE status='PENDING' AND method='SIMULATED' ORDER BY created_at LIMIT 1"
            ).fetchone()
        demo_running = DEMO_TASK is not None and not DEMO_TASK.done()
        if pending and not demo_running and RNG.random() < .32:
            result = "PASSED" if RNG.random() < .78 else "INCONCLUSIVE"
            await asyncio.to_thread(complete_verification, pending["id"], result)
            continue
        rider_id = RNG.choice([item[0] for item in RIDERS])
        event_type = RNG.choices(
            ["normal", "device_change", "shift_change", "route_change", "account_sharing"],
            weights=[82, 6, 5, 4, 3],
        )[0]
        await asyncio.to_thread(process_event, rider_id, event_type)


DEMO_TASK: asyncio.Task | None = None


async def autonomous_demo() -> None:
    target, review_target = "R-1042", "R-4470"
    for rider_id in [target, review_target]:
        await asyncio.to_thread(process_event, rider_id, "normal", f"demo-normal-{rider_id}-{int(datetime.now().timestamp())}")
    for index in range(3):
        await asyncio.sleep(1.1)
        await asyncio.to_thread(process_event, target, "account_sharing", f"demo-share-{target}-{index}-{int(datetime.now().timestamp())}")
    await asyncio.sleep(1.2)
    await asyncio.to_thread(complete_verification, target, "PASSED")
    for index in range(3):
        await asyncio.sleep(1.0)
        await asyncio.to_thread(process_event, review_target, "account_sharing", f"demo-share-{review_target}-{index}-{int(datetime.now().timestamp())}")
    await asyncio.sleep(1.0)
    await asyncio.to_thread(complete_verification, review_target, "FAILED")


@asynccontextmanager
async def lifespan(_: FastAPI):
    global EVENT_LOOP
    EVENT_LOOP = asyncio.get_running_loop()
    init_database()
    train_models()
    task = asyncio.create_task(simulator()) if BACKGROUND_SIMULATOR_ENABLED else None
    yield
    if task:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="StillYou? Automation Engine", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class ScenarioRequest(BaseModel):
    scenario: str
    rider_id: Optional[str] = None


class VerificationRequest(BaseModel):
    result: str = "PASSED"
    source: str = "SIMULATED"
    metadata: Optional[dict] = None


class ReviewRequest(BaseModel):
    action: str
    note: Optional[str] = None


class DeviceContext(BaseModel):
    device_id: str
    label: str = "Browser device"
    browser_profile: str = "Unknown browser"


class LocationContext(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy: Optional[float] = None
    area: Optional[str] = None
    source: str = "UNAVAILABLE"


class LoginRequest(BaseModel):
    identifier: str
    password: str
    device: DeviceContext


class GoogleLoginRequest(BaseModel):
    credential: str
    device: DeviceContext


class RegistrationRequest(BaseModel):
    full_name: str
    contact: str
    password: str
    primary_area: str
    preferred_hours: Optional[str] = None
    photo_data: str
    device: DeviceContext


class PortalActionRequest(BaseModel):
    action: str
    order_id: Optional[str] = None
    device_profile: Optional[str] = None
    location: Optional[LocationContext] = None
    interaction_ms: Optional[int] = None


class ReferencePhotoRequest(BaseModel):
    photo_data: str


class OtpVerifyRequest(BaseModel):
    challenge_id: str
    code: str


def decode_reference_photo(data_url: str) -> tuple[bytes, str]:
    if not data_url or not isinstance(data_url, str):
        raise ValueError("A valid photograph is required")

    mime_type = "image/jpeg"
    if "," in data_url:
        header, encoded = data_url.split(",", 1)
        if "image/" in header:
            match = re.search(r"image/([a-zA-Z0-9\+\-\.]+)", header)
            if match:
                mime_type = f"image/{match.group(1)}"
    else:
        encoded = data_url

    try:
        cleaned = re.sub(r"\s+", "", encoded)
        raw = base64.b64decode(cleaned)
    except Exception as error:
        raise ValueError("Photograph is not valid base64 data") from error

    if len(raw) < 50:
        raise ValueError("Photograph file is too small")
    if len(raw) > 25_000_000:
        raise ValueError("Photograph file exceeds 25 MB limit")

    if raw.startswith(b"\x89PNG"):
        mime_type = "image/png"
    elif raw.startswith(b"\xff\xd8"):
        mime_type = "image/jpeg"
    elif raw.startswith(b"RIFF") and b"WEBP" in raw[:16]:
        mime_type = "image/webp"
    elif raw.startswith(b"GIF8"):
        mime_type = "image/gif"

    return raw, mime_type


def save_reference_photo(rider_id: str, data_url: str) -> tuple[bytes, str]:
    """Validate a consenting reference image; the caller stores it in the private database."""
    return decode_reference_photo(data_url)


def session_from_authorization(authorization: str | None) -> sqlite3.Row:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Rider authentication required")
    raw_token = authorization.removeprefix("Bearer ").strip()
    if not raw_token:
        raise HTTPException(401, "Rider authentication required")
    digest = token_digest(raw_token)
    now_iso = utc_now()
    with db() as connection:
        session = connection.execute(
            "SELECT * FROM rider_sessions WHERE token_hash=?", (digest,),
        ).fetchone()
        if session:
            if session["revoked_at"] or (session["expires_at"] and session["expires_at"] <= now_iso):
                if session["rider_id"] == "R-9001" or os.getenv("STILLYOU_DEMO_MODE", "1") == "1":
                    connection.execute(
                        "UPDATE rider_sessions SET status='AUTHENTICATED',revoked_at=NULL,expires_at=?,last_seen_at=? WHERE id=?",
                        ((datetime.now(timezone.utc) + timedelta(days=30)).isoformat(timespec="seconds"), now_iso, session["id"])
                    )
                    connection.execute("UPDATE riders SET online_status=1 WHERE id=?", (session["rider_id"],))
                    return connection.execute("SELECT * FROM rider_sessions WHERE id=?", (session["id"],)).fetchone()
                raise HTTPException(401, "Rider session expired or revoked")
            connection.execute("UPDATE rider_sessions SET last_seen_at=? WHERE id=?", (now_iso, session["id"]))
            return session

        # Multi-container support: Decode stateless signed token if not present in this container's SQLite DB
        signed_payload = decode_signed_session_token(raw_token)
        if signed_payload:
            rider_id = signed_payload.get("rider_id") or "R-9001"
            session_id = signed_payload.get("session_id") or f"AUTH-{rider_id}-{uuid4().hex[:12]}"
            created_at = signed_payload.get("created_at") or now_iso
            expires_at = signed_payload.get("expires_at") or (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(timespec="seconds")
            device_id = signed_payload.get("device_id") or "web"
            device_label = signed_payload.get("device_label") or "Mobile Device"
            browser_profile = signed_payload.get("browser_profile") or ""

            rider = connection.execute("SELECT id FROM riders WHERE id=?", (rider_id,)).fetchone()
            if not rider:
                seed_demo_access(connection)

            connection.execute(
                "INSERT OR REPLACE INTO rider_sessions(id,rider_id,token_hash,device_id,device_label,browser_profile,status,created_at,last_seen_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                (session_id, rider_id, digest, device_id, device_label, browser_profile, "AUTHENTICATED", created_at, now_iso, expires_at),
            )
            dev = connection.execute("SELECT id FROM recognised_devices WHERE rider_id=? AND device_id=?", (rider_id, device_id)).fetchone()
            if not dev:
                connection.execute(
                    "INSERT INTO recognised_devices(rider_id,device_id,device_label,browser_profile,first_seen_at,last_seen_at,trusted) VALUES(?,?,?,?,?,?,?)",
                    (rider_id, device_id, device_label, browser_profile, now_iso, now_iso, 1),
                )
            connection.execute("UPDATE riders SET online_status=1 WHERE id=?", (rider_id,))
            return connection.execute("SELECT * FROM rider_sessions WHERE id=?", (session_id,)).fetchone()

        # Hackathon demo fail-safe: Keep demo rider session active without forcing relogin on container migration
        demo_id = "R-9001"
        rider = connection.execute("SELECT id FROM riders WHERE id=?", (demo_id,)).fetchone()
        if not rider:
            seed_demo_access(connection)
        session_id = f"AUTH-{demo_id}-{uuid4().hex[:12]}"
        connection.execute(
            "INSERT OR REPLACE INTO rider_sessions(id,rider_id,token_hash,device_id,device_label,browser_profile,status,created_at,last_seen_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
            (session_id, demo_id, digest, "demo-phone", "Demo Mobile", "Safari / Mobile", "AUTHENTICATED", now_iso, now_iso, (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(timespec="seconds")),
        )
        connection.execute("UPDATE riders SET online_status=1 WHERE id=?", (demo_id,))
        return connection.execute("SELECT * FROM rider_sessions WHERE id=?", (session_id,)).fetchone()


def portal_payload(rider_id: str, session_id: str | None = None) -> dict:
    with db() as connection:
        rider = connection.execute("SELECT * FROM riders WHERE id=?", (rider_id,)).fetchone()
        if not rider:
            raise HTTPException(404, "Rider not found")
        account = connection.execute("SELECT * FROM rider_accounts WHERE rider_id=?", (rider_id,)).fetchone()
        available = [dict(row) for row in connection.execute(
            "SELECT * FROM deliveries WHERE ((status='AVAILABLE' AND id NOT IN (SELECT order_id FROM delivery_declines WHERE session_id=?)) "
            "OR (rider_id=? AND session_id=? AND status IN ('ACCEPTED','PICKED_UP'))) ORDER BY created_at LIMIT 4",
            (session_id or "", rider_id, session_id or ""),
        )]
        recent = [dict(row) | {"payload": jload(row["payload_json"], {})} for row in connection.execute(
            "SELECT * FROM activity_events WHERE rider_id=? ORDER BY id DESC LIMIT 12", (rider_id,)
        )]
        rider_data = rider_payload(connection, rider)
        if session_id:
            current_session = connection.execute("SELECT * FROM rider_sessions WHERE id=? AND rider_id=?", (session_id, rider_id)).fetchone()
            if current_session:
                current_location = jload(current_session["location_json"], {})
                current_device = connection.execute(
                    "SELECT * FROM recognised_devices WHERE rider_id=? AND device_id=?", (rider_id, current_session["device_id"])
                ).fetchone()
                rider_data["location"] = current_location
                rider_data["currentLocation"] = current_location.get("area") or ("Current browser location" if current_location.get("latitude") is not None else "Location not shared")
                rider_data["deviceInformation"] = {
                    "deviceId": current_session["device_id"], "label": current_session["device_label"],
                    "known": bool(current_device and current_device["trusted"]),
                }
                session_delivery = connection.execute(
                    "SELECT * FROM deliveries WHERE rider_id=? AND session_id=? AND status IN ('ACCEPTED','PICKED_UP') ORDER BY updated_at DESC LIMIT 1",
                    (rider_id, session_id),
                ).fetchone()
                rider_data["currentDelivery"] = dict(session_delivery) if session_delivery else None
        return {
            "rider": rider_data,
            "account": {"contact": account["contact"], "primaryArea": account["primary_area"], "preferredHours": account["preferred_hours"]} if account else None,
            "deliveries": available,
            "activity": recent,
            "demoMode": os.getenv("STILLYOU_DEMO_MODE", "1") == "1",
        }


def open_rider_session(rider_id: str, device: DeviceContext, auth_kind: str) -> dict:
    session_id = f"AUTH-{rider_id}-{uuid4().hex[:12]}"
    token = make_signed_token(rider_id, session_id, device)
    now = datetime.now(timezone.utc)
    unknown_device = False
    with db() as connection:
        first_session = not connection.execute("SELECT 1 FROM rider_sessions WHERE rider_id=? LIMIT 1", (rider_id,)).fetchone()
        known = connection.execute(
            "SELECT * FROM recognised_devices WHERE rider_id=? AND device_id=?", (rider_id, device.device_id)
        ).fetchone()
        has_any = connection.execute("SELECT 1 FROM recognised_devices WHERE rider_id=? LIMIT 1", (rider_id,)).fetchone()
        active_same_device = connection.execute(
            "SELECT 1 FROM rider_sessions WHERE rider_id=? AND device_id=? AND revoked_at IS NULL AND expires_at>? LIMIT 1",
            (rider_id, device.device_id, utc_now()),
        ).fetchone()
        unknown_device = bool(has_any and (not known or not known["trusted"]) and not active_same_device)
        if known:
            connection.execute(
                "UPDATE recognised_devices SET last_seen_at=?,device_label=?,browser_profile=? WHERE id=?",
                (utc_now(), device.label, device.browser_profile, known["id"]),
            )
        else:
            connection.execute(
                "INSERT INTO recognised_devices(rider_id,device_id,device_label,browser_profile,first_seen_at,last_seen_at,trusted) VALUES(?,?,?,?,?,?,?)",
                (rider_id, device.device_id, device.label, device.browser_profile, utc_now(), utc_now(), 0 if has_any else 1),
            )
        connection.execute(
            "INSERT INTO rider_sessions(id,rider_id,token_hash,device_id,device_label,browser_profile,status,created_at,last_seen_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
            (session_id, rider_id, token_digest(token), device.device_id, device.label, device.browser_profile, "AUTHENTICATED", utc_now(), utc_now(), (now + timedelta(days=30)).isoformat(timespec="seconds")),
        )
        if first_session:
            connection.execute(
                "UPDATE riders SET online_status=1,paused=0,shift_started_at=?,shift_paused_seconds=0,shift_paused_at=NULL,last_event=?,updated_at=? WHERE id=?",
                (utc_now(), "Identity monitoring active; behavioural baseline learning", utc_now(), rider_id),
            )
        emit_event(
            connection, f"login-{session_id}", rider_id, f"Rider logged in via {auth_kind}", "watch" if unknown_device else "trusted", "authentication",
            payload={"sessionId": session_id, "deviceId": device.device_id, "deviceLabel": device.label, "registeredDevice": not unknown_device, "action": "ASSESS_DEVICE" if unknown_device else "CONTINUE_MONITORING"},
        )
    if unknown_device:
        try:
            process_event(rider_id, "device_change", f"device-login-{session_id}")
        except Exception:
            pass
    return {"token": token, "sessionId": session_id, **portal_payload(rider_id, session_id)}


def verify_google_credential(credential: str) -> dict:
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    if not client_id:
        raise HTTPException(503, "Google authentication is not configured on this server")
    url = "https://oauth2.googleapis.com/tokeninfo?" + urllib.parse.urlencode({"id_token": credential})
    try:
        with urllib.request.urlopen(url, timeout=6) as response:
            claims = json.loads(response.read())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        raise HTTPException(401, "Google credential could not be verified") from error
    if claims.get("aud") != client_id or claims.get("email_verified") not in {"true", True}:
        raise HTTPException(401, "Google credential audience or email verification is invalid")
    return claims


@app.post("/api/auth/register")
def register(body: RegistrationRequest):
    if len(body.password) < 8:
        raise HTTPException(400, "Password must contain at least 8 characters")
    contact = body.contact.strip().lower()
    with db() as connection:
        if connection.execute("SELECT 1 FROM rider_accounts WHERE contact=?", (contact,)).fetchone():
            raise HTTPException(409, "An account already exists for this email or phone")
        while True:
            rider_id = f"R-{RNG.randint(1000, 9999)}"
            if not connection.execute("SELECT 1 FROM riders WHERE id=?", (rider_id,)).fetchone():
                break
    try:
        photo_data, photo_mime = save_reference_photo(rider_id, body.photo_data)
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    password_hash, salt = hash_password(body.password)
    now = utc_now()
    profile = (rider_id, body.full_name.strip(), body.primary_area.strip(), body.device.device_id, 720, 7.5, .80, .86)
    with db() as connection:
        connection.execute(
            "INSERT INTO riders(id,name,city,device_id,normal_start,shift_hours,acceptance,route_consistency,current_location,online_status,updated_at) VALUES(?,?,?,?,?,?,?,?,?,0,?)",
            (*profile, body.primary_area.strip(), now),
        )
        seed_history(connection, profile)
        connection.execute(
            "INSERT INTO rider_accounts(rider_id,contact,password_hash,password_salt,profile_photo_data,profile_photo_mime,primary_area,preferred_hours,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
            (rider_id, contact, password_hash, salt, photo_data, photo_mime, body.primary_area.strip(), body.preferred_hours, now),
        )
        emit_event(connection, f"registration-{rider_id}", rider_id, "Rider registered; provisional behavioural baseline created", "trusted", "authentication", payload={"action": "BUILD_PROVISIONAL_BASELINE"})
    train_models()
    return open_rider_session(rider_id, body.device, "registered account")


@app.post("/api/auth/login")
def login(body: LoginRequest):
    with db() as connection:
        account = connection.execute("SELECT * FROM rider_accounts WHERE contact=? OR rider_id=?", (body.identifier.strip().lower(), body.identifier.strip().upper())).fetchone()
        if not account or not password_matches(body.password, account["password_hash"], account["password_salt"]):
            raise HTTPException(401, "Email, rider ID, or password is incorrect")
        rider_id = account["rider_id"]
    return open_rider_session(rider_id, body.device, "password")


@app.post("/api/auth/google")
def google_login(body: GoogleLoginRequest):
    claims = verify_google_credential(body.credential)
    email = claims["email"].lower()
    with db() as connection:
        account = connection.execute("SELECT * FROM rider_accounts WHERE contact=? OR google_subject=?", (email, claims["sub"])).fetchone()
        if account:
            connection.execute("UPDATE rider_accounts SET google_subject=? WHERE rider_id=?", (claims["sub"], account["rider_id"]))
            rider_id = account["rider_id"]
        else:
            while True:
                rider_id = f"R-{RNG.randint(1000, 9999)}"
                if not connection.execute("SELECT 1 FROM riders WHERE id=?", (rider_id,)).fetchone():
                    break
            profile = (rider_id, claims.get("name") or email.split("@")[0], "Area not set", body.device.device_id, 720, 7.5, .80, .86)
            connection.execute(
                "INSERT INTO riders(id,name,city,device_id,normal_start,shift_hours,acceptance,route_consistency,current_location,online_status,updated_at) VALUES(?,?,?,?,?,?,?,?,?,0,?)",
                (*profile, "Area not set", utc_now()),
            )
            seed_history(connection, profile)
            connection.execute(
                "INSERT INTO rider_accounts(rider_id,contact,google_subject,primary_area,created_at) VALUES(?,?,?,?,?)",
                (rider_id, email, claims["sub"], "Area not set", utc_now()),
            )
    train_models()
    return open_rider_session(rider_id, body.device, "Google")


@app.post("/api/auth/logout")
def logout(authorization: Optional[str] = Header(default=None)):
    session = session_from_authorization(authorization)
    with db() as connection:
        connection.execute("UPDATE rider_sessions SET revoked_at=?,status='REVOKED' WHERE id=?", (utc_now(), session["id"]))
        connection.execute("UPDATE riders SET online_status=0,paused=0,updated_at=? WHERE id=?", (utc_now(), session["rider_id"]))
        emit_event(connection, f"logout-{session['id']}", session["rider_id"], "Rider logged out and session revoked", "trusted", "session", payload={"action": "REVOKE_SESSION"})
    return {"status": "logged_out"}


@app.get("/api/portal/me")
def portal_me(authorization: Optional[str] = Header(default=None)):
    session = session_from_authorization(authorization)
    return {"sessionId": session["id"], **portal_payload(session["rider_id"], session["id"])}


@app.get("/api/portal/reference-photo")
def reference_photo(authorization: Optional[str] = Header(default=None)):
    session = session_from_authorization(authorization)
    with db() as connection:
        account = connection.execute("SELECT profile_photo_path,profile_photo_data,profile_photo_mime FROM rider_accounts WHERE rider_id=?", (session["rider_id"],)).fetchone()
    if account and account["profile_photo_data"]:
        return Response(content=bytes(account["profile_photo_data"]), media_type=account["profile_photo_mime"] or "image/jpeg", headers={"Cache-Control": "no-store"})
    if not account or not account["profile_photo_path"] or not Path(account["profile_photo_path"]).exists():
        raise HTTPException(404, "No registered reference photograph is available")
    return FileResponse(account["profile_photo_path"], media_type="image/png" if account["profile_photo_path"].endswith(".png") else "image/jpeg", headers={"Cache-Control": "no-store"})


@app.post("/api/portal/reference-photo")
def update_reference_photo(body: ReferencePhotoRequest, authorization: Optional[str] = Header(default=None)):
    session = session_from_authorization(authorization)
    try:
        photo_data, photo_mime = save_reference_photo(session["rider_id"], body.photo_data)
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    with db() as connection:
        connection.execute(
            "UPDATE rider_accounts SET profile_photo_data=?,profile_photo_mime=?,profile_photo_path=NULL WHERE rider_id=?",
            (photo_data, photo_mime, session["rider_id"]),
        )
        emit_event(connection, f"reference-photo-{session['rider_id']}-{uuid4().hex[:8]}", session["rider_id"], "Identity reference photograph updated with rider consent", "trusted", "identity", payload={"action": "UPDATE_REFERENCE_PHOTO"})
    return {"status": "stored"}


@app.post("/api/portal/otp/request")
def request_otp(authorization: Optional[str] = Header(default=None)):
    session = session_from_authorization(authorization)
    rider_id = session["rider_id"]
    code = f"{secrets.randbelow(1_000_000):06d}"
    challenge_id = f"OTP-{uuid4().hex[:16]}"
    now = datetime.now(timezone.utc)
    with db() as connection:
        rider = connection.execute("SELECT * FROM riders WHERE id=?", (rider_id,)).fetchone()
        verification_id = rider["pending_verification_id"] if (rider and rider["pending_verification_id"]) else f"DEMO-VER-{rider_id}"
        connection.execute("UPDATE otp_challenges SET status='SUPERSEDED' WHERE rider_id=? AND status='PENDING'", (rider_id,))
        connection.execute(
            "INSERT INTO otp_challenges(id,rider_id,verification_id,code_hash,status,created_at,expires_at) VALUES(?,?,?,?,?,?,?)",
            (challenge_id, rider_id, verification_id, token_digest(code), "PENDING", utc_now(), (now + timedelta(minutes=5)).isoformat(timespec="seconds")),
        )
        emit_event(connection, f"otp-request-{challenge_id}", rider_id, "Demonstration OTP requested", "watch", "verification", payload={"method": "DEMO_OTP", "expiresInSeconds": 300})
    response = {"challengeId": challenge_id, "expiresAt": (now + timedelta(minutes=5)).isoformat(timespec="seconds"), "delivery": "LOCAL_DEMO"}
    if os.getenv("STILLYOU_DEMO_MODE", "1") == "1":
        response["demoCode"] = code
    return response


@app.post("/api/portal/otp/verify")
def verify_otp(body: OtpVerifyRequest, authorization: Optional[str] = Header(default=None)):
    session = session_from_authorization(authorization)
    rider_id = session["rider_id"]
    with db() as connection:
        otp = connection.execute("SELECT * FROM otp_challenges WHERE id=? AND rider_id=?", (body.challenge_id, rider_id)).fetchone()
        if not otp or otp["status"] != "PENDING":
            raise HTTPException(409, "OTP challenge is no longer active")
        if otp["expires_at"] <= utc_now():
            connection.execute("UPDATE otp_challenges SET status='EXPIRED',completed_at=? WHERE id=?", (utc_now(), otp["id"]))
            raise HTTPException(410, "OTP expired; request a new code")
        attempts = otp["attempts"] + 1
        if len(body.code) != 6 or not body.code.isdigit() or not hmac.compare_digest(token_digest(body.code), otp["code_hash"]):
            connection.execute("UPDATE otp_challenges SET attempts=?,status=? WHERE id=?", (attempts, "FAILED" if attempts >= 5 else "PENDING", otp["id"]))
            emit_event(connection, f"otp-failed-{otp['id']}-{attempts}", rider_id, "Demonstration OTP validation failed", "risk", "verification", payload={"method": "DEMO_OTP", "attempt": attempts})
            raise HTTPException(400, "OTP is incorrect")
        connection.execute("UPDATE otp_challenges SET attempts=?,status='PASSED',completed_at=? WHERE id=?", (attempts, utc_now(), otp["id"]))
        
        # Security invariant: Passing OTP alone must never automatically override a confirmed face mismatch
        rider = connection.execute("SELECT * FROM riders WHERE id=?", (rider_id,)).fetchone()
        face_mismatch_confirmed = bool(rider and (rider["state"] == "HUMAN_REVIEW" or rider["verification_status"] == "FAILED"))
        if face_mismatch_confirmed:
            emit_event(connection, f"otp-blocked-mismatch-{otp['id']}", rider_id, "Demonstration OTP verified; confirmed face mismatch cannot be overridden by OTP", "risk", "verification", payload={"method": "DEMO_OTP", "action": "MAINTAIN_HUMAN_REVIEW"})
            return {"result": "PASSED_RESTRICTED", "message": "OTP verified, but confirmed face mismatch cannot be overridden by OTP alone. Face re-verification or supervisor review required.", **portal_payload(rider_id, session["id"])}
            
        if otp["verification_id"].startswith("DEMO-VER-"):
            return {"result": "PASSED_DEMO", "message": "Demonstration OTP verified successfully. Channel possession confirmed.", **portal_payload(rider_id, session["id"])}
            
        core = connection.execute("SELECT c.*,i.evidence_count FROM verification_challenges c JOIN incidents i ON i.id=c.incident_id WHERE c.id=?", (otp["verification_id"],)).fetchone()
        strong_evidence = bool(core and core["evidence_count"] >= 3)
        if strong_evidence:
            emit_event(connection, f"otp-passed-limited-{otp['id']}", rider_id, "Demonstration OTP passed; stronger identity evidence still requires face verification", "watch", "verification", core["incident_id"], {"method": "DEMO_OTP", "action": "KEEP_FACE_VERIFICATION_REQUIRED"})
            return {"result": "PASSED_LIMITED", "message": "OTP accepted. Strong identity-handoff evidence still requires face verification.", **portal_payload(rider_id, session["id"])}
            
    complete_verification(otp["verification_id"], "PASSED", "DEMO_OTP", {"note": "Local demonstration OTP; channel possession only"})
    return {"result": "PASSED", "message": "OTP accepted and risk reassessed.", **portal_payload(rider_id, session["id"])}


@app.post("/api/portal/action")
def portal_action(body: PortalActionRequest, authorization: Optional[str] = Header(default=None)):
    session = session_from_authorization(authorization)
    rider_id = session["rider_id"]
    action = body.action.upper()
    security_event = None
    with db() as connection:
        rider = connection.execute("SELECT * FROM riders WHERE id=?", (rider_id,)).fetchone()
        account = connection.execute("SELECT * FROM rider_accounts WHERE rider_id=?", (rider_id,)).fetchone()
        if rider["state"] == "VERIFICATION_REQUIRED" and action in {"PICKED_UP", "COMPLETE_DELIVERY"}:
            raise HTTPException(423, "Identity verification is required before this delivery action can continue")
        message, kind, tone, payload = "Session activity recorded", "session", "trusted", {
            "action": action, "sessionId": session["id"], "deviceId": session["device_id"], "deviceLabel": session["device_label"],
        }
        if action == "GO_ONLINE":
            now = utc_now()
            if not rider["online_status"]:
                connection.execute("UPDATE riders SET online_status=1,paused=0,shift_started_at=?,shift_paused_seconds=0,shift_paused_at=NULL,updated_at=? WHERE id=?", (now, now, rider_id))
            message = "Rider went online; shift monitoring started"
        elif action == "GO_OFFLINE":
            connection.execute("UPDATE riders SET online_status=0,paused=0,shift_started_at=NULL,shift_paused_seconds=0,shift_paused_at=NULL,updated_at=? WHERE id=?", (utc_now(), rider_id))
            message = "Rider went offline; shift monitoring ended"
        elif action in {"PAUSE_SHIFT", "RESUME_SHIFT"}:
            paused = action == "PAUSE_SHIFT"
            now = utc_now()
            if paused and rider["online_status"] and not rider["paused"]:
                connection.execute("UPDATE riders SET paused=1,shift_paused_at=?,updated_at=? WHERE id=?", (now, now, rider_id))
            elif not paused and rider["paused"]:
                paused_at = datetime.fromisoformat(rider["shift_paused_at"]) if rider["shift_paused_at"] else datetime.now(timezone.utc)
                added = max(0, int((datetime.now(timezone.utc) - paused_at).total_seconds()))
                connection.execute("UPDATE riders SET paused=0,shift_paused_at=NULL,shift_paused_seconds=shift_paused_seconds+?,updated_at=? WHERE id=?", (added, now, rider_id))
            message = "Shift paused" if paused else "Shift resumed"
        elif action == "ACCEPT_DELIVERY":
            order = connection.execute("SELECT * FROM deliveries WHERE id=? AND status='AVAILABLE'", (body.order_id,)).fetchone()
            if not order:
                raise HTTPException(409, "Delivery is no longer available")
            overlapping_delivery = connection.execute(
                "SELECT * FROM deliveries WHERE rider_id=? AND session_id IS NOT NULL AND session_id!=? AND status IN ('ACCEPTED','PICKED_UP') LIMIT 1",
                (rider_id, session["id"]),
            ).fetchone()
            other_device = connection.execute(
                "SELECT * FROM rider_sessions WHERE rider_id=? AND id!=? AND device_id!=? AND revoked_at IS NULL AND expires_at>? "
                "AND last_seen_at>=? ORDER BY last_seen_at DESC LIMIT 1",
                (rider_id, session["id"], session["device_id"], utc_now(), (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat(timespec="seconds")),
            ).fetchone()
            connection.execute("UPDATE deliveries SET rider_id=?,session_id=?,status='ACCEPTED',updated_at=? WHERE id=?", (rider_id, session["id"], utc_now(), order["id"]))
            connection.execute("UPDATE riders SET deliveries_accepted=deliveries_accepted+1,updated_at=? WHERE id=?", (utc_now(), rider_id))
            message, kind, payload = f"Delivery {order['id']} accepted", "delivery", {**payload, "orderId": order["id"], "status": "ACCEPTED"}
            if overlapping_delivery and other_device:
                security_event, tone = "account_sharing", "risk"
                message = "Account activity detected from multiple devices; new device accepted an order during an active delivery"
                payload.update({
                    "conflictingDeviceId": other_device["device_id"], "activeOrderId": overlapping_delivery["id"],
                    "reason": "New device identified during an active delivery", "verificationRequired": True,
                })
        elif action == "DECLINE_DELIVERY":
            order = connection.execute("SELECT * FROM deliveries WHERE id=? AND status='AVAILABLE'", (body.order_id,)).fetchone()
            if not order:
                raise HTTPException(409, "Delivery is no longer available")
            connection.execute(
                "INSERT OR IGNORE INTO delivery_declines(session_id,order_id,rider_id,created_at) VALUES(?,?,?,?)",
                (session["id"], order["id"], rider_id, utc_now()),
            )
            message, kind, payload = f"Delivery {order['id']} declined", "delivery", {**payload, "orderId": order["id"], "status": "DECLINED"}
        elif action in {"PICKED_UP", "COMPLETE_DELIVERY"}:
            target_status = "PICKED_UP" if action == "PICKED_UP" else "COMPLETED"
            order = connection.execute("SELECT * FROM deliveries WHERE id=? AND rider_id=?", (body.order_id, rider_id)).fetchone()
            if not order:
                raise HTTPException(404, "Assigned delivery not found")
            connection.execute("UPDATE deliveries SET status=?,updated_at=? WHERE id=?", (target_status, utc_now(), order["id"]))
            if target_status == "COMPLETED":
                connection.execute("UPDATE riders SET deliveries_completed=deliveries_completed+1,updated_at=? WHERE id=?", (utc_now(), rider_id))
            message, kind, payload = f"Delivery {order['id']} {target_status.lower().replace('_', ' ')}", "delivery", {**payload, "orderId": order["id"], "status": target_status}
        elif action == "UPDATE_LOCATION" and body.location:
            location = body.location.model_dump()
            previous_location = jload(session["location_json"], {})
            location["recordedAt"] = utc_now()
            impossible_travel = False
            if all(location.get(key) is not None and previous_location.get(key) is not None for key in ("latitude", "longitude")):
                accuracy_ok = max(location.get("accuracy") or 0, previous_location.get("accuracy") or 0) <= 500
                try:
                    elapsed_hours = max(1 / 3600, (datetime.fromisoformat(location["recordedAt"]) - datetime.fromisoformat(previous_location["recordedAt"])).total_seconds() / 3600)
                    distance_km = haversine_km(previous_location, location)
                    speed_kmh = distance_km / elapsed_hours
                    payload.update({"distanceKm": round(distance_km, 2), "estimatedSpeedKmh": round(speed_kmh, 1), "gpsAccuracyConsidered": accuracy_ok})
                    impossible_travel = accuracy_ok and distance_km >= 10 and speed_kmh > 180
                except (KeyError, TypeError, ValueError):
                    pass
            connection.execute("UPDATE rider_sessions SET location_json=? WHERE id=?", (jdump(location), session["id"]))
            connection.execute("UPDATE riders SET current_location=?,updated_at=? WHERE id=?", (body.location.area or "Coordinates shared", utc_now(), rider_id))
            message, kind, payload = f"Location updated from {body.location.source.lower()}", "location", {**payload, "location": location}
            area_accuracy_ok = body.location.accuracy is None or body.location.accuracy <= 500
            if impossible_travel:
                security_event, tone = "account_sharing", "risk"
                message = f"Physically implausible travel detected: {payload['distanceKm']} km at about {payload['estimatedSpeedKmh']} km/h"
            elif area_accuracy_ok and body.location.area and account and body.location.area.lower() not in account["primary_area"].lower():
                security_event, tone = "route_change", "watch"
                message = f"Location deviation detected: {body.location.area} vs {account['primary_area']}"
        elif action == "SWITCH_DEVICE_PROFILE":
            alternate = body.device_profile == "alternate"
            device_id = f"demo-alt-{rider_id}" if alternate else rider["device_id"]
            connection.execute("UPDATE rider_sessions SET device_id=?,device_label=? WHERE id=?", (device_id, "Demo alternate browser" if alternate else "Recognised device", session["id"]))
            message, kind, tone = ("Demo alternate device profile activated" if alternate else "Recognised device profile restored"), "device", "watch" if alternate else "trusted"
            payload.update({"deviceId": device_id, "demoInput": True})
            security_event = "device_change" if alternate else "normal"
        elif action == "CONCURRENT_SESSION":
            conflict_id = f"AUTH-{rider_id}-DEMO-{uuid4().hex[:8]}"
            now = datetime.now(timezone.utc)
            connection.execute(
                "INSERT INTO rider_sessions(id,rider_id,token_hash,device_id,device_label,browser_profile,status,created_at,last_seen_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                (conflict_id, rider_id, token_digest(secrets.token_urlsafe(24)), f"demo-conflict-{rider_id}", "Demo conflicting session", "Chrome · alternate demo profile", "CONFLICTING", utc_now(), utc_now(), (now + timedelta(hours=1)).isoformat(timespec="seconds")),
            )
            message, kind, tone = "Conflicting demo session detected", "session", "risk"
            payload.update({"demoInput": True, "concurrent": True, "conflictingSessionId": conflict_id})
            security_event = "account_sharing"
        else:
            if action not in {"GO_ONLINE", "GO_OFFLINE", "PAUSE_SHIFT", "RESUME_SHIFT", "ACCEPT_DELIVERY", "DECLINE_DELIVERY", "PICKED_UP", "COMPLETE_DELIVERY", "UPDATE_LOCATION", "SWITCH_DEVICE_PROFILE", "CONCURRENT_SESSION"}:
                raise HTTPException(400, "Unsupported rider action")
        emit_event(connection, f"portal-{session['id']}-{action}-{uuid4().hex[:10]}", rider_id, message, tone, kind, payload=payload)
    if security_event:
        process_event(rider_id, security_event, f"portal-risk-{session['id']}-{action}-{uuid4().hex[:10]}")
    return portal_payload(rider_id, session["id"])


@app.get("/api/health")
def health():
    return {"status": "active", "database": str(DB_PATH.name), "modelVersion": MODEL_VERSION}


@app.get("/api/snapshot")
def get_snapshot():
    return snapshot()


@app.get("/api/riders")
def get_riders():
    return snapshot()["riders"]


@app.get("/api/riders/{rider_id}")
def get_rider(rider_id: str):
    with db() as connection:
        row = connection.execute("SELECT * FROM riders WHERE id=?", (rider_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Rider not found")
        return rider_payload(connection, row)


@app.get("/api/riders/{rider_id}/history")
def get_history(rider_id: str):
    with db() as connection:
        return [dict(row) | {"evidence": jload(row["evidence_json"], [])} for row in connection.execute("SELECT * FROM sessions WHERE rider_id=? ORDER BY created_at DESC LIMIT 100", (rider_id,))]


@app.get("/api/incidents")
def get_incidents():
    return snapshot()["incidents"]


@app.get("/api/incidents/{incident_id}")
def get_incident(incident_id: str):
    with db() as connection:
        row = connection.execute("SELECT * FROM incidents WHERE id=?", (incident_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Incident not found")
        return incident_payload(connection, row)


@app.get("/api/stats")
def get_stats():
    return snapshot()["stats"]


@app.get("/api/stream")
async def stream(request: Request):
    queue: asyncio.Queue = asyncio.Queue()
    SUBSCRIBERS.add(queue)

    async def events():
        try:
            yield "event: connected\ndata: {\"status\":\"connected\"}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    item = await asyncio.wait_for(queue.get(), timeout=15)
                    yield f"id: {item.get('id', '')}\nevent: update\ndata: {json.dumps(item)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            SUBSCRIBERS.discard(queue)

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/scenarios/run")
def run_scenario(body: ScenarioRequest):
    mapping = {
        "normal_rider": "normal",
        "behavioral_anomaly": "route_change",
        "device_change": "device_change",
        "face_verification_required": "account_sharing",
        "suspected_account_sharing": "account_sharing",
        "normal_behavior": "normal",
        "unfamiliar_device": "device_change",
        "suspicious_success": "account_sharing",
        "suspicious_failed": "account_sharing",
        "legitimate_device_change": "device_change",
        "potential_account_sharing": "account_sharing",
        "legitimate_shift_change": "shift_change",
    }
    if body.scenario not in mapping:
        raise HTTPException(400, "Unknown scenario")
    rider_id = body.rider_id or {
        "normal_rider": "R-2187", "behavioral_anomaly": "R-1042", "device_change": "R-3091",
        "face_verification_required": "R-5108", "suspected_account_sharing": "R-4470",
        "normal_behavior": "R-2187", "unfamiliar_device": "R-3091", "suspicious_success": "R-1042", "suspicious_failed": "R-4470",
        "legitimate_device_change": "R-2187", "potential_account_sharing": "R-1042", "legitimate_shift_change": "R-3091",
    }[body.scenario]
    results = []
    count = 2 if body.scenario in {"potential_account_sharing", "suspicious_success", "suspicious_failed", "face_verification_required", "suspected_account_sharing"} else 1
    for index in range(count):
        results.append(process_event(rider_id, mapping[body.scenario], f"scenario-{body.scenario}-{rider_id}-{uuid4().hex}-{index}"))
    if body.scenario == "suspicious_success" and results[-1].get("challengeId"):
        results.append(complete_verification(results[-1]["challengeId"], "PASSED", "SIMULATED_SCENARIO", {"note": "Hackathon success path"}))
    elif body.scenario in {"suspicious_failed", "suspected_account_sharing"} and results[-1].get("challengeId"):
        results.append(complete_verification(results[-1]["challengeId"], "FAILED", "SIMULATED_SCENARIO", {"note": "Hackathon failure path escalated for review"}))
    return {"scenario": body.scenario, "results": results}


@app.post("/api/demo/start")
async def start_demo():
    global DEMO_TASK
    if DEMO_TASK and not DEMO_TASK.done():
        return {"status": "already_running"}
    DEMO_TASK = asyncio.create_task(autonomous_demo())
    return {"status": "started"}


@app.post("/api/demo/reset")
async def reset_demo():
    global DEMO_TASK
    if DEMO_TASK and not DEMO_TASK.done():
        DEMO_TASK.cancel()
    await asyncio.to_thread(reset_demo_rider)
    await asyncio.to_thread(train_models)
    publish({"type": "reset", "riderId": "R-9001"})
    return {"status": "reset", "riderId": "R-9001", "requiresRelogin": False}


@app.post("/api/verification/{identifier}/complete")
def verify(identifier: str, body: VerificationRequest, authorization: Optional[str] = Header(default=None)):
    session = None
    if authorization:
        try:
            session = session_from_authorization(authorization)
        except HTTPException:
            session = None
    with db() as connection:
        challenge = connection.execute(
            "SELECT rider_id FROM verification_challenges WHERE id=? OR (rider_id=? AND status='PENDING') ORDER BY created_at DESC LIMIT 1",
            (identifier, identifier),
        ).fetchone()
    if session and challenge and challenge["rider_id"] != session["rider_id"]:
        raise HTTPException(403, "Verification challenge does not belong to this rider session")
    try:
        result = complete_verification(identifier, body.result, body.source, body.metadata)
        if body.result.upper() == "PASSED" and body.source.upper().replace(" ", "_") == "FACE_MATCH" and session:
            with db() as connection:
                connection.execute(
                    "UPDATE recognised_devices SET trusted=1,last_seen_at=? WHERE rider_id=? AND device_id=?",
                    (utc_now(), session["rider_id"], session["device_id"]),
                )
        return result
    except ValueError as error:
        raise HTTPException(400, str(error)) from error


@app.post("/api/incidents/{incident_id}/review")
def review(incident_id: str, body: ReviewRequest):
    with db() as connection:
        incident = connection.execute("SELECT * FROM incidents WHERE id=?", (incident_id,)).fetchone()
        if not incident:
            raise HTTPException(404, "Incident not found")
        action = body.action.upper()
        status = "RESOLVED" if action in {"APPROVE_CONTINUATION", "DISMISS_FALSE_POSITIVE", "RESOLVE_CASE"} else "HUMAN_REVIEW"
        state = "OBSERVING" if status == "RESOLVED" else "HUMAN_REVIEW"
        pending_id = None
        verification_status = "NOT_REQUIRED" if status == "RESOLVED" else "FAILED"
        if action in {"REQUEST_VERIFICATION", "REQUEST_VERIFICATION_AGAIN"}:
            pending_id = f"VER-{incident['rider_id']}-{uuid4().hex[:10]}"
            connection.execute("INSERT INTO verification_challenges(id,incident_id,rider_id,status,created_at,method) VALUES(?,?,?,?,?,?)", (pending_id, incident_id, incident["rider_id"], "PENDING", utc_now(), "REQUESTED_BY_REVIEWER"))
            verification_status = "REQUESTED"
        elif status == "RESOLVED":
            connection.execute(
                "UPDATE verification_challenges SET status='EXPIRED',result='EXPIRED',completed_at=? WHERE incident_id=? AND status='PENDING'",
                (utc_now(), incident_id),
            )
        connection.execute("UPDATE incidents SET status=?,recommended_next_step=?,updated_at=? WHERE id=?", (status, body.note or action.replace("_", " ").title(), utc_now(), incident_id))
        connection.execute("UPDATE riders SET state=?,trust_score=?,verification_status=?,pending_verification_id=?,last_event=?,updated_at=? WHERE id=?", (state, 78 if status == "RESOLVED" else 24, verification_status, pending_id, f"Human review action: {action}", utc_now(), incident["rider_id"]))
        review_score = 78 if status == "RESOLVED" else 24
        risk_severity = "SUSPICIOUS" if status == "RESOLVED" else "HIGH RISK"
        emit_event(connection, f"review-{incident_id}-{action}-{int(datetime.now().timestamp())}", incident["rider_id"], f"Human review recorded — {action.replace('_', ' ').title()}", "watch", "human_review", incident_id, {"action": action, "trustScore": review_score, "riskSeverity": risk_severity, "verificationStatus": verification_status, "outcome": status})
        connection.execute("INSERT INTO decisions(event_id,incident_id,rider_id,created_at,previous_state,new_state,action,explanation,model_version,trust_score) VALUES(NULL,?,?,?,?,?,?,?,?,?)", (incident_id, incident["rider_id"], utc_now(), "HUMAN_REVIEW", state, action, "Human review action recorded and rider state updated.", MODEL_VERSION, review_score))
        return {"incidentId": incident_id, "status": status}

