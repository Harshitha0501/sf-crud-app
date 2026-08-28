"""
Salesforce CRUD web application - FastAPI backend.

Handles OAuth 2.0 flow with Salesforce and proxies CRUD operations
against 5 standard objects: Account, Opportunity, Lead, Contact, Case.
"""
from fastapi import FastAPI, APIRouter, HTTPException, Header, Request
from fastapi.responses import RedirectResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import secrets
from pathlib import Path
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx
from pydantic import BaseModel


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
mongo_client = AsyncIOMotorClient(mongo_url)
db = mongo_client[os.environ['DB_NAME']]

# Salesforce OAuth configuration
SF_CLIENT_ID = os.environ.get('SF_CLIENT_ID', '')
SF_CLIENT_SECRET = os.environ.get('SF_CLIENT_SECRET', '')
SF_REDIRECT_URI = os.environ.get('SF_REDIRECT_URI', '')
SF_LOGIN_URL = os.environ.get('SF_LOGIN_URL', 'https://login.salesforce.com')
FRONTEND_URL = os.environ.get('FRONTEND_URL', '')
SF_API_VERSION = os.environ.get('SF_API_VERSION', 'v60.0')

app = FastAPI(title="Salesforce CRUD API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ---------- Object field configuration (5-10 fields per object) ----------
OBJECT_FIELDS: Dict[str, List[Dict[str, Any]]] = {
    "Account": [
        {"name": "Name", "label": "Name", "type": "text", "required": True},
        {"name": "Type", "label": "Type", "type": "text"},
        {"name": "Industry", "label": "Industry", "type": "text"},
        {"name": "Phone", "label": "Phone", "type": "text"},
        {"name": "Website", "label": "Website", "type": "text"},
        {"name": "BillingCity", "label": "Billing City", "type": "text"},
        {"name": "AnnualRevenue", "label": "Annual Revenue", "type": "number"},
    ],
    "Opportunity": [
        {"name": "Name", "label": "Name", "type": "text", "required": True},
        {"name": "StageName", "label": "Stage", "type": "text", "required": True},
        {"name": "Amount", "label": "Amount", "type": "number"},
        {"name": "CloseDate", "label": "Close Date", "type": "date", "required": True},
        {"name": "Probability", "label": "Probability (%)", "type": "number"},
        {"name": "Type", "label": "Type", "type": "text"},
        {"name": "LeadSource", "label": "Lead Source", "type": "text"},
    ],
    "Lead": [
        {"name": "FirstName", "label": "First Name", "type": "text"},
        {"name": "LastName", "label": "Last Name", "type": "text", "required": True},
        {"name": "Company", "label": "Company", "type": "text", "required": True},
        {"name": "Email", "label": "Email", "type": "text"},
        {"name": "Phone", "label": "Phone", "type": "text"},
        {"name": "Status", "label": "Status", "type": "text"},
        {"name": "LeadSource", "label": "Lead Source", "type": "text"},
    ],
    "Contact": [
        {"name": "FirstName", "label": "First Name", "type": "text"},
        {"name": "LastName", "label": "Last Name", "type": "text", "required": True},
        {"name": "Email", "label": "Email", "type": "text"},
        {"name": "Phone", "label": "Phone", "type": "text"},
        {"name": "Title", "label": "Title", "type": "text"},
        {"name": "Department", "label": "Department", "type": "text"},
    ],
    "Case": [
        {"name": "Subject", "label": "Subject", "type": "text"},
        {"name": "Status", "label": "Status", "type": "text"},
        {"name": "Priority", "label": "Priority", "type": "text"},
        {"name": "Origin", "label": "Origin", "type": "text"},
        {"name": "Type", "label": "Type", "type": "text"},
        {"name": "Reason", "label": "Reason", "type": "text"},
        {"name": "Description", "label": "Description", "type": "text"},
    ],
}

ALLOWED_OBJECTS = set(OBJECT_FIELDS.keys())


# ---------- Session helpers ----------
async def get_session_by_token(token: str) -> Optional[dict]:
    if not token:
        return None
    doc = await db.sf_sessions.find_one({"session_token": token}, {"_id": 0})
    return doc


async def require_session(authorization: Optional[str]) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1]
    session = await get_session_by_token(token)
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    return session


async def refresh_sf_token(session: dict) -> dict:
    """Attempt to refresh access token via refresh_token grant."""
    refresh_token = session.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Session expired, please re-login")
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{SF_LOGIN_URL}/services/oauth2/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": SF_CLIENT_ID,
                "client_secret": SF_CLIENT_SECRET,
            },
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Failed to refresh Salesforce token")
    data = r.json()
    new_access = data["access_token"]
    await db.sf_sessions.update_one(
        {"session_token": session["session_token"]},
        {"$set": {"access_token": new_access, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    session["access_token"] = new_access
    return session


async def sf_request(session: dict, method: str, path: str,
                     params: Optional[dict] = None,
                     json_body: Optional[dict] = None) -> httpx.Response:
    """Make a Salesforce REST API request, auto-refreshing on 401."""
    url = f"{session['instance_url']}{path}"
    headers = {
        "Authorization": f"Bearer {session['access_token']}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.request(method, url, headers=headers,
                                    params=params, json=json_body)
    if resp.status_code == 401:
        session = await refresh_sf_token(session)
        headers["Authorization"] = f"Bearer {session['access_token']}"
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.request(method, url, headers=headers,
                                        params=params, json=json_body)
    return resp


# ---------- OAuth endpoints ----------
@api_router.get("/")
async def root():
    return {"message": "Salesforce CRUD API", "configured": bool(SF_CLIENT_ID)}


@api_router.get("/auth/config")
async def auth_config():
    """Expose whether OAuth is configured (does not leak secrets)."""
    return {
        "configured": bool(SF_CLIENT_ID and SF_CLIENT_SECRET and SF_REDIRECT_URI),
        "login_url": SF_LOGIN_URL,
        "redirect_uri": SF_REDIRECT_URI,
    }


@api_router.get("/auth/login")
async def auth_login():
    """Redirect the user to the Salesforce OAuth authorize page."""
    if not (SF_CLIENT_ID and SF_REDIRECT_URI):
        raise HTTPException(
            status_code=500,
            detail="Salesforce OAuth not configured. Set SF_CLIENT_ID, SF_CLIENT_SECRET, SF_REDIRECT_URI in backend/.env",
        )
    state = secrets.token_urlsafe(24)
    await db.sf_oauth_state.insert_one({
        "state": state,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    params = {
        "response_type": "code",
        "client_id": SF_CLIENT_ID,
        "redirect_uri": SF_REDIRECT_URI,
        "scope": "api refresh_token offline_access",
        "state": state,
    }
    return RedirectResponse(f"{SF_LOGIN_URL}/services/oauth2/authorize?{urlencode(params)}")


@api_router.get("/auth/callback")
async def auth_callback(code: Optional[str] = None,
                        state: Optional[str] = None,
                        error: Optional[str] = None,
                        error_description: Optional[str] = None):
    """Handle Salesforce OAuth callback, exchange code, create session, redirect to frontend."""
    front = FRONTEND_URL.rstrip("/") if FRONTEND_URL else ""
    if error:
        return RedirectResponse(f"{front}/login?error={error}")
    if not code or not state:
        return RedirectResponse(f"{front}/login?error=missing_code")

    state_doc = await db.sf_oauth_state.find_one({"state": state})
    if not state_doc:
        return RedirectResponse(f"{front}/login?error=invalid_state")
    await db.sf_oauth_state.delete_one({"state": state})

    # Exchange code for tokens
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{SF_LOGIN_URL}/services/oauth2/token",
            data={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": SF_CLIENT_ID,
                "client_secret": SF_CLIENT_SECRET,
                "redirect_uri": SF_REDIRECT_URI,
            },
        )
    if r.status_code != 200:
        logger.error("Token exchange failed: %s", r.text)
        return RedirectResponse(f"{front}/login?error=token_exchange_failed")
    tok = r.json()

    # Fetch user info
    user_info = {}
    if tok.get("id"):
        async with httpx.AsyncClient(timeout=30) as client:
            u = await client.get(tok["id"],
                                 headers={"Authorization": f"Bearer {tok['access_token']}"})
        if u.status_code == 200:
            user_info = u.json()

    session_token = secrets.token_urlsafe(32)
    doc = {
        "session_token": session_token,
        "access_token": tok["access_token"],
        "refresh_token": tok.get("refresh_token"),
        "instance_url": tok["instance_url"],
        "issued_at": tok.get("issued_at"),
        "user_id": user_info.get("user_id") or tok.get("id"),
        "username": user_info.get("username") or user_info.get("preferred_username"),
        "display_name": user_info.get("display_name") or user_info.get("name"),
        "email": user_info.get("email"),
        "organization_id": user_info.get("organization_id"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.sf_sessions.insert_one(doc)

    return RedirectResponse(f"{front}/auth/callback?token={session_token}")


@api_router.get("/auth/me")
async def auth_me(authorization: Optional[str] = Header(default=None)):
    session = await require_session(authorization)
    return {
        "username": session.get("username"),
        "display_name": session.get("display_name"),
        "email": session.get("email"),
        "instance_url": session.get("instance_url"),
        "organization_id": session.get("organization_id"),
    }


@api_router.post("/auth/logout")
async def auth_logout(authorization: Optional[str] = Header(default=None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
        session = await get_session_by_token(token)
        if session:
            # Best-effort revoke on Salesforce
            try:
                async with httpx.AsyncClient(timeout=10) as client:
                    await client.post(f"{SF_LOGIN_URL}/services/oauth2/revoke",
                                      data={"token": session["access_token"]})
            except Exception as e:
                logger.warning("Token revoke failed: %s", e)
            await db.sf_sessions.delete_one({"session_token": token})
    return {"ok": True}


# ---------- Object endpoints ----------
@api_router.get("/objects")
async def list_objects():
    return {"objects": list(OBJECT_FIELDS.keys())}


@api_router.get("/objects/{object_name}/fields")
async def object_fields(object_name: str):
    if object_name not in ALLOWED_OBJECTS:
        raise HTTPException(status_code=404, detail="Object not supported")
    return {"object": object_name, "fields": OBJECT_FIELDS[object_name]}


def _select_fields(object_name: str) -> List[str]:
    return ["Id"] + [f["name"] for f in OBJECT_FIELDS[object_name]]


@api_router.get("/objects/{object_name}/records")
async def list_records(object_name: str,
                       offset: int = 0,
                       limit: int = 20,
                       authorization: Optional[str] = Header(default=None)):
    if object_name not in ALLOWED_OBJECTS:
        raise HTTPException(status_code=404, detail="Object not supported")
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    session = await require_session(authorization)

    fields = ",".join(_select_fields(object_name))
    soql = f"SELECT {fields} FROM {object_name} ORDER BY CreatedDate DESC LIMIT {limit} OFFSET {offset}"
    resp = await sf_request(session, "GET",
                            f"/services/data/{SF_API_VERSION}/query",
                            params={"q": soql})
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    data = resp.json()

    # Count total for UI (best-effort)
    total = None
    if offset == 0:
        count_resp = await sf_request(
            session, "GET", f"/services/data/{SF_API_VERSION}/query",
            params={"q": f"SELECT COUNT() FROM {object_name}"})
        if count_resp.status_code == 200:
            total = count_resp.json().get("totalSize")

    records = [{k: v for k, v in r.items() if k != "attributes"} for r in data.get("records", [])]
    return {
        "records": records,
        "hasMore": not data.get("done", True) or len(records) == limit,
        "totalSize": total,
        "offset": offset,
        "limit": limit,
    }


@api_router.get("/objects/{object_name}/records/{record_id}")
async def get_record(object_name: str, record_id: str,
                     authorization: Optional[str] = Header(default=None)):
    if object_name not in ALLOWED_OBJECTS:
        raise HTTPException(status_code=404, detail="Object not supported")
    session = await require_session(authorization)
    fields = ",".join(_select_fields(object_name))
    resp = await sf_request(
        session, "GET",
        f"/services/data/{SF_API_VERSION}/sobjects/{object_name}/{record_id}",
        params={"fields": fields},
    )
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


class RecordPayload(BaseModel):
    fields: Dict[str, Any]


def _clean_payload(object_name: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    allowed = {f["name"] for f in OBJECT_FIELDS[object_name]}
    field_defs = {f["name"]: f for f in OBJECT_FIELDS[object_name]}
    out: Dict[str, Any] = {}
    for k, v in payload.items():
        if k not in allowed:
            continue
        if v is None or v == "":
            continue
        ftype = field_defs[k].get("type")
        if ftype == "number":
            try:
                out[k] = float(v)
            except (TypeError, ValueError):
                continue
        else:
            out[k] = v
    return out


@api_router.post("/objects/{object_name}/records")
async def create_record(object_name: str, payload: RecordPayload,
                        authorization: Optional[str] = Header(default=None)):
    if object_name not in ALLOWED_OBJECTS:
        raise HTTPException(status_code=404, detail="Object not supported")
    session = await require_session(authorization)
    body = _clean_payload(object_name, payload.fields)
    resp = await sf_request(
        session, "POST",
        f"/services/data/{SF_API_VERSION}/sobjects/{object_name}",
        json_body=body,
    )
    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


@api_router.patch("/objects/{object_name}/records/{record_id}")
async def update_record(object_name: str, record_id: str, payload: RecordPayload,
                        authorization: Optional[str] = Header(default=None)):
    if object_name not in ALLOWED_OBJECTS:
        raise HTTPException(status_code=404, detail="Object not supported")
    session = await require_session(authorization)
    body = _clean_payload(object_name, payload.fields)
    resp = await sf_request(
        session, "PATCH",
        f"/services/data/{SF_API_VERSION}/sobjects/{object_name}/{record_id}",
        json_body=body,
    )
    if resp.status_code not in (200, 204):
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return {"id": record_id, "success": True}


@api_router.delete("/objects/{object_name}/records/{record_id}")
async def delete_record(object_name: str, record_id: str,
                        authorization: Optional[str] = Header(default=None)):
    if object_name not in ALLOWED_OBJECTS:
        raise HTTPException(status_code=404, detail="Object not supported")
    session = await require_session(authorization)
    resp = await sf_request(
        session, "DELETE",
        f"/services/data/{SF_API_VERSION}/sobjects/{object_name}/{record_id}",
    )
    if resp.status_code not in (200, 204):
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return {"id": record_id, "success": True}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    mongo_client.close()
