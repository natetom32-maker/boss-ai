from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Literal
import uuid
from datetime import datetime, timezone, timedelta
import httpx
import asyncio
import base64
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Emergent LLM Key
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

# D-ID API Key
DID_API_KEY = os.environ.get('DID_API_KEY', '')
DID_API_BASE = 'https://api.d-id.com'

# Create the main app
app = FastAPI(title="Boss AI - Operating Layer")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ================== MODELS ==================

# Memory scope levels
MemoryScope = Literal["L0_PRIME", "L1_WORKSPACE", "L2_PROJECT", "L3_SESSION"]

# Event types for event sourcing
EventType = Literal[
    "MEMORY_SET",
    "MEMORY_UPDATE", 
    "MEMORY_DELETE",
    "DECISION_MADE",
    "CHECKPOINT_TRIGGERED",
    "BOSS_ACTION"
]

# Checkpoint types (hard stops)
CheckpointType = Literal[
    "SEND_SHARE",
    "SPEND_MONEY",
    "DELETE_OVERWRITE",
    "LEGAL_MEDICAL"
]

class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    created_at: datetime

class UserSession(BaseModel):
    user_id: str
    session_token: str
    expires_at: datetime
    created_at: datetime

class SessionDataResponse(BaseModel):
    id: str
    email: str
    name: str
    picture: Optional[str] = None
    session_token: str

# Memory Event (Event Sourcing - Append Only)
class MemoryEvent(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    event_type: EventType
    scope: MemoryScope
    project_id: Optional[str] = None  # For L2 project-scoped memory
    key: str
    value: Any
    metadata: Dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class MemoryEventCreate(BaseModel):
    event_type: EventType
    scope: MemoryScope
    project_id: Optional[str] = None
    key: str
    value: Any
    metadata: Dict[str, Any] = Field(default_factory=dict)

# Derived Memory State (computed from events)
class MemoryState(BaseModel):
    memory_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    scope: MemoryScope
    project_id: Optional[str] = None
    key: str
    value: Any
    version: int = 1
    last_event_id: str
    created_at: datetime
    updated_at: datetime

# Decision (Boss remembers decisions, not conversations)
class Decision(BaseModel):
    decision_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    project_id: Optional[str] = None
    title: str
    description: str
    context: Dict[str, Any] = Field(default_factory=dict)
    outcome: Optional[str] = None
    memory_keys_used: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DecisionCreate(BaseModel):
    project_id: Optional[str] = None
    title: str
    description: str
    context: Dict[str, Any] = Field(default_factory=dict)
    outcome: Optional[str] = None
    memory_keys_used: List[str] = Field(default_factory=list)

# Checkpoint (hard stops)
class Checkpoint(BaseModel):
    checkpoint_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    checkpoint_type: CheckpointType
    action_description: str
    status: Literal["PENDING", "APPROVED", "REJECTED"] = "PENDING"
    context: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    resolved_at: Optional[datetime] = None

class CheckpointCreate(BaseModel):
    checkpoint_type: CheckpointType
    action_description: str
    context: Dict[str, Any] = Field(default_factory=dict)

class CheckpointResolve(BaseModel):
    status: Literal["APPROVED", "REJECTED"]

# Project
class Project(BaseModel):
    project_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None

# Boss AI Interaction
class BossMessage(BaseModel):
    message: str
    project_id: Optional[str] = None
    include_memory: bool = True
    generate_video: bool = False  # Whether to generate D-ID avatar video

class BossResponse(BaseModel):
    response: str
    memory_used: List[Dict[str, Any]] = Field(default_factory=list)
    decisions_made: List[str] = Field(default_factory=list)
    checkpoint_required: Optional[Dict[str, Any]] = None
    model_used: str
    video_url: Optional[str] = None  # D-ID generated video URL
    video_status: Optional[str] = None  # pending, processing, completed, failed

# Memory Receipt (trust feature)
class MemoryReceipt(BaseModel):
    scope: MemoryScope
    items_count: int
    items_used: List[Dict[str, str]]
    why_used: str

# D-ID Avatar Video
class AvatarVideo(BaseModel):
    video_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    did_talk_id: Optional[str] = None
    script_text: str
    status: str = "pending"  # pending, processing, completed, failed
    result_video_url: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class GenerateAvatarVideoRequest(BaseModel):
    script_text: str
    voice_id: Optional[str] = "en-US-JennyNeural"  # Microsoft TTS voice

# ================== AUTH HELPERS ==================

async def get_session_token(request: Request) -> Optional[str]:
    """Extract session token from cookies or Authorization header"""
    # First try cookies
    session_token = request.cookies.get("session_token")
    if session_token:
        return session_token
    
    # Then try Authorization header
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header[7:]
    
    return None

async def get_current_user(request: Request) -> User:
    """Get current authenticated user"""
    session_token = await get_session_token(request)
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    session = await db.user_sessions.find_one(
        {"session_token": session_token},
        {"_id": 0}
    )
    
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    # Check expiration with timezone awareness
    expires_at = session["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    
    user = await db.users.find_one(
        {"user_id": session["user_id"]},
        {"_id": 0}
    )
    
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    return User(**user)

async def get_optional_user(request: Request) -> Optional[User]:
    """Get current user if authenticated, None otherwise"""
    try:
        return await get_current_user(request)
    except HTTPException:
        return None

# ================== AUTH ROUTES ==================

@api_router.post("/auth/session")
async def create_session(request: Request, response: Response):
    """Exchange session_id for session_token"""
    data = await request.json()
    session_id = data.get("session_id")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    
    # Exchange session_id with Emergent Auth
    async with httpx.AsyncClient() as client:
        auth_response = await client.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id}
        )
        
        if auth_response.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session_id")
        
        user_data = auth_response.json()
    
    session_data = SessionDataResponse(**user_data)
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    
    # Check if user exists
    existing_user = await db.users.find_one(
        {"email": session_data.email},
        {"_id": 0}
    )
    
    if existing_user:
        user_id = existing_user["user_id"]
    else:
        # Create new user
        new_user = {
            "user_id": user_id,
            "email": session_data.email,
            "name": session_data.name,
            "picture": session_data.picture,
            "created_at": datetime.now(timezone.utc)
        }
        await db.users.insert_one(new_user)
        
        # Initialize L0 Prime Memory for new user
        await _create_memory_event(
            user_id=user_id,
            event_type="MEMORY_SET",
            scope="L0_PRIME",
            key="user_preferences",
            value={"autopilot": True, "notification_level": "checkpoints_only"},
            metadata={"source": "system_init"}
        )
    
    # Create session
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_data.session_token,
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc)
    })
    
    # Set cookie
    response.set_cookie(
        key="session_token",
        value=session_data.session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60
    )
    
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"user": user, "session_token": session_data.session_token}

@api_router.get("/auth/me")
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current user info"""
    return current_user

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    """Logout and clear session"""
    session_token = await get_session_token(request)
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    
    response.delete_cookie(key="session_token", path="/")
    return {"message": "Logged out"}

# ================== MEMORY ENGINE ==================

async def _create_memory_event(
    user_id: str,
    event_type: EventType,
    scope: MemoryScope,
    key: str,
    value: Any,
    project_id: Optional[str] = None,
    metadata: Dict[str, Any] = None
) -> MemoryEvent:
    """Create and store a memory event (event sourcing)"""
    event = MemoryEvent(
        user_id=user_id,
        event_type=event_type,
        scope=scope,
        project_id=project_id,
        key=key,
        value=value,
        metadata=metadata or {}
    )
    
    await db.memory_events.insert_one(event.model_dump())
    
    # Update derived state
    await _update_memory_state(event)
    
    return event

async def _update_memory_state(event: MemoryEvent):
    """Update derived memory state from event"""
    query = {
        "user_id": event.user_id,
        "scope": event.scope,
        "key": event.key
    }
    if event.project_id:
        query["project_id"] = event.project_id
    
    existing = await db.memory_state.find_one(query, {"_id": 0})
    
    if event.event_type == "MEMORY_DELETE":
        if existing:
            await db.memory_state.delete_one(query)
    else:
        if existing:
            await db.memory_state.update_one(
                query,
                {
                    "$set": {
                        "value": event.value,
                        "version": existing["version"] + 1,
                        "last_event_id": event.event_id,
                        "updated_at": datetime.now(timezone.utc)
                    }
                }
            )
        else:
            state = MemoryState(
                user_id=event.user_id,
                scope=event.scope,
                project_id=event.project_id,
                key=event.key,
                value=event.value,
                last_event_id=event.event_id,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc)
            )
            await db.memory_state.insert_one(state.model_dump())

async def _rebuild_state_from_events(user_id: str):
    """Rebuild all memory state from event log (disaster recovery)"""
    # Clear existing state
    await db.memory_state.delete_many({"user_id": user_id})
    
    # Replay all events
    events = await db.memory_events.find(
        {"user_id": user_id}
    ).sort("timestamp", 1).to_list(None)
    
    for event_doc in events:
        event = MemoryEvent(**{k: v for k, v in event_doc.items() if k != "_id"})
        await _update_memory_state(event)
    
    return len(events)

async def _get_memory_for_context(
    user_id: str,
    project_id: Optional[str] = None,
    scopes: List[MemoryScope] = None
) -> List[Dict[str, Any]]:
    """Get relevant memory for Boss AI context"""
    if scopes is None:
        scopes = ["L0_PRIME", "L2_PROJECT"] if project_id else ["L0_PRIME"]
    
    memory_items = []
    
    for scope in scopes:
        query = {"user_id": user_id, "scope": scope}
        if scope == "L2_PROJECT" and project_id:
            query["project_id"] = project_id
        
        items = await db.memory_state.find(query, {"_id": 0}).to_list(100)
        memory_items.extend(items)
    
    return memory_items

# Memory Routes
@api_router.post("/memory/events")
async def create_memory_event(
    event_data: MemoryEventCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new memory event"""
    event = await _create_memory_event(
        user_id=current_user.user_id,
        event_type=event_data.event_type,
        scope=event_data.scope,
        key=event_data.key,
        value=event_data.value,
        project_id=event_data.project_id,
        metadata=event_data.metadata
    )
    return event

@api_router.get("/memory/events")
async def get_memory_events(
    scope: Optional[MemoryScope] = None,
    project_id: Optional[str] = None,
    limit: int = 100,
    current_user: User = Depends(get_current_user)
):
    """Get memory events (audit log)"""
    query = {"user_id": current_user.user_id}
    if scope:
        query["scope"] = scope
    if project_id:
        query["project_id"] = project_id
    
    events = await db.memory_events.find(
        query,
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    
    return events

@api_router.get("/memory/state")
async def get_memory_state(
    scope: Optional[MemoryScope] = None,
    project_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get current memory state (derived from events)"""
    query = {"user_id": current_user.user_id}
    if scope:
        query["scope"] = scope
    if project_id:
        query["project_id"] = project_id
    
    state = await db.memory_state.find(query, {"_id": 0}).to_list(1000)
    return state

@api_router.post("/memory/rebuild")
async def rebuild_memory_state(current_user: User = Depends(get_current_user)):
    """Rebuild memory state from events (disaster recovery)"""
    events_processed = await _rebuild_state_from_events(current_user.user_id)
    return {"message": "State rebuilt", "events_processed": events_processed}

@api_router.delete("/memory/{key}")
async def delete_memory(
    key: str,
    scope: MemoryScope = "L2_PROJECT",
    project_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Delete a memory key"""
    await _create_memory_event(
        user_id=current_user.user_id,
        event_type="MEMORY_DELETE",
        scope=scope,
        key=key,
        value=None,
        project_id=project_id
    )
    return {"message": f"Memory key '{key}' deleted"}

# ================== DECISIONS ==================

@api_router.post("/decisions")
async def create_decision(
    decision_data: DecisionCreate,
    current_user: User = Depends(get_current_user)
):
    """Record a decision (Boss remembers decisions, not conversations)"""
    decision = Decision(
        user_id=current_user.user_id,
        **decision_data.model_dump()
    )
    
    await db.decisions.insert_one(decision.model_dump())
    
    # Record as memory event too
    await _create_memory_event(
        user_id=current_user.user_id,
        event_type="DECISION_MADE",
        scope="L2_PROJECT" if decision_data.project_id else "L0_PRIME",
        key=f"decision_{decision.decision_id[:8]}",
        value={"title": decision.title, "outcome": decision.outcome},
        project_id=decision_data.project_id,
        metadata={"decision_id": decision.decision_id}
    )
    
    return decision

@api_router.get("/decisions")
async def get_decisions(
    project_id: Optional[str] = None,
    limit: int = 50,
    current_user: User = Depends(get_current_user)
):
    """Get recorded decisions"""
    query = {"user_id": current_user.user_id}
    if project_id:
        query["project_id"] = project_id
    
    decisions = await db.decisions.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    return decisions

# ================== CHECKPOINTS ==================

@api_router.post("/checkpoints")
async def create_checkpoint(
    checkpoint_data: CheckpointCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a checkpoint (hard stop)"""
    checkpoint = Checkpoint(
        user_id=current_user.user_id,
        **checkpoint_data.model_dump()
    )
    
    await db.checkpoints.insert_one(checkpoint.model_dump())
    
    # Record as memory event
    await _create_memory_event(
        user_id=current_user.user_id,
        event_type="CHECKPOINT_TRIGGERED",
        scope="L3_SESSION",
        key=f"checkpoint_{checkpoint.checkpoint_id[:8]}",
        value={
            "type": checkpoint.checkpoint_type,
            "action": checkpoint.action_description
        }
    )
    
    return checkpoint

@api_router.get("/checkpoints")
async def get_checkpoints(
    status: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get checkpoints"""
    query = {"user_id": current_user.user_id}
    if status:
        query["status"] = status
    
    checkpoints = await db.checkpoints.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return checkpoints

@api_router.put("/checkpoints/{checkpoint_id}")
async def resolve_checkpoint(
    checkpoint_id: str,
    resolve_data: CheckpointResolve,
    current_user: User = Depends(get_current_user)
):
    """Resolve a checkpoint (approve/reject)"""
    result = await db.checkpoints.update_one(
        {"checkpoint_id": checkpoint_id, "user_id": current_user.user_id},
        {
            "$set": {
                "status": resolve_data.status,
                "resolved_at": datetime.now(timezone.utc)
            }
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Checkpoint not found")
    
    return {"message": f"Checkpoint {resolve_data.status.lower()}"}

# ================== PROJECTS ==================

@api_router.post("/projects")
async def create_project(
    project_data: ProjectCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new project"""
    project = Project(
        user_id=current_user.user_id,
        **project_data.model_dump()
    )
    
    await db.projects.insert_one(project.model_dump())
    return project

@api_router.get("/projects")
async def get_projects(current_user: User = Depends(get_current_user)):
    """Get all projects"""
    projects = await db.projects.find(
        {"user_id": current_user.user_id},
        {"_id": 0}
    ).to_list(100)
    
    return projects

@api_router.get("/projects/{project_id}")
async def get_project(
    project_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get a specific project"""
    project = await db.projects.find_one(
        {"project_id": project_id, "user_id": current_user.user_id},
        {"_id": 0}
    )
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return project

# ================== D-ID AVATAR ==================

# Boss AI Avatar source image URL (the topographic glowing face)
BOSS_AVATAR_SOURCE = "https://customer-assets.emergentagent.com/job_boss-ai-1/artifacts/qfwcfoxo_generated_video.mp4"

async def _create_did_talk(script_text: str, voice_id: str = "en-US-JennyNeural") -> Dict[str, Any]:
    """Create a D-ID talk video"""
    if not DID_API_KEY:
        raise HTTPException(status_code=500, detail="D-ID API key not configured")
    
    headers = {
        "Authorization": f"Basic {DID_API_KEY}",
        "Content-Type": "application/json"
    }
    
    # Use the Boss AI avatar video as source
    payload = {
        "source_url": BOSS_AVATAR_SOURCE,
        "script": {
            "type": "text",
            "input": script_text,
            "provider": {
                "type": "microsoft",
                "voice_id": voice_id
            }
        },
        "config": {
            "fluent": True,
            "pad_audio": 0.5
        }
    }
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{DID_API_BASE}/talks",
            headers=headers,
            json=payload
        )
        
        if response.status_code != 201 and response.status_code != 200:
            logger.error(f"D-ID API error: {response.status_code} - {response.text}")
            raise HTTPException(status_code=500, detail=f"D-ID API error: {response.text}")
        
        return response.json()

async def _get_did_talk_status(talk_id: str) -> Dict[str, Any]:
    """Get D-ID talk video status"""
    headers = {
        "Authorization": f"Basic {DID_API_KEY}"
    }
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            f"{DID_API_BASE}/talks/{talk_id}",
            headers=headers
        )
        
        if response.status_code != 200:
            logger.error(f"D-ID status error: {response.status_code} - {response.text}")
            raise HTTPException(status_code=500, detail=f"D-ID API error: {response.text}")
        
        return response.json()

async def _poll_did_completion(video_id: str, talk_id: str, max_attempts: int = 60):
    """Poll D-ID API for video completion"""
    for attempt in range(max_attempts):
        await asyncio.sleep(2)  # Wait 2 seconds between polls
        
        try:
            status_data = await _get_did_talk_status(talk_id)
            
            if status_data.get("status") == "done":
                # Update database with completed video
                await db.avatar_videos.update_one(
                    {"video_id": video_id},
                    {
                        "$set": {
                            "status": "completed",
                            "result_video_url": status_data.get("result_url"),
                            "updated_at": datetime.now(timezone.utc)
                        }
                    }
                )
                return
            elif status_data.get("status") == "error":
                await db.avatar_videos.update_one(
                    {"video_id": video_id},
                    {
                        "$set": {
                            "status": "failed",
                            "error_message": status_data.get("error", {}).get("description", "Unknown error"),
                            "updated_at": datetime.now(timezone.utc)
                        }
                    }
                )
                return
        except Exception as e:
            logger.error(f"Polling error: {e}")
    
    # Timeout
    await db.avatar_videos.update_one(
        {"video_id": video_id},
        {
            "$set": {
                "status": "failed",
                "error_message": "Timeout waiting for video generation",
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )

@api_router.post("/avatar/generate")
async def generate_avatar_video(
    request_data: GenerateAvatarVideoRequest,
    current_user: User = Depends(get_current_user)
):
    """Generate a D-ID talking avatar video"""
    # Truncate script if too long
    script_text = request_data.script_text[:500]  # D-ID has limits
    
    # Create video record
    video = AvatarVideo(
        user_id=current_user.user_id,
        script_text=script_text,
        status="processing"
    )
    
    await db.avatar_videos.insert_one(video.model_dump())
    
    try:
        # Create D-ID talk
        did_response = await _create_did_talk(script_text, request_data.voice_id)
        talk_id = did_response.get("id")
        
        # Update with D-ID talk ID
        await db.avatar_videos.update_one(
            {"video_id": video.video_id},
            {"$set": {"did_talk_id": talk_id}}
        )
        
        # Start background polling (non-blocking)
        asyncio.create_task(_poll_did_completion(video.video_id, talk_id))
        
        return {
            "video_id": video.video_id,
            "status": "processing",
            "message": "Video generation started"
        }
        
    except Exception as e:
        logger.error(f"Avatar generation error: {e}")
        await db.avatar_videos.update_one(
            {"video_id": video.video_id},
            {
                "$set": {
                    "status": "failed",
                    "error_message": str(e),
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/avatar/status/{video_id}")
async def get_avatar_video_status(
    video_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get avatar video generation status"""
    video = await db.avatar_videos.find_one(
        {"video_id": video_id, "user_id": current_user.user_id},
        {"_id": 0}
    )
    
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    return {
        "video_id": video["video_id"],
        "status": video["status"],
        "result_video_url": video.get("result_video_url"),
        "error_message": video.get("error_message"),
        "created_at": video["created_at"],
        "updated_at": video["updated_at"]
    }

@api_router.get("/avatar/videos")
async def get_avatar_videos(
    limit: int = 20,
    current_user: User = Depends(get_current_user)
):
    """Get user's avatar videos"""
    videos = await db.avatar_videos.find(
        {"user_id": current_user.user_id},
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    return videos

# ================== BOSS AI ==================

# Available models for auto-selection
MODELS = [
    {"provider": "openai", "model": "gpt-5.2", "strength": "general"},
    {"provider": "anthropic", "model": "claude-4-sonnet-20250514", "strength": "reasoning"},
    {"provider": "gemini", "model": "gemini-2.5-flash", "strength": "speed"},
]

def _select_model(context: str) -> Dict[str, str]:
    """Auto-select the best model based on context (Boss chooses, not user)"""
    # Simple heuristic - in production this would be more sophisticated
    context_lower = context.lower()
    
    if any(word in context_lower for word in ["analyze", "reason", "explain", "think"]):
        return MODELS[1]  # Claude for reasoning
    elif any(word in context_lower for word in ["quick", "fast", "simple", "brief"]):
        return MODELS[2]  # Gemini for speed
    else:
        return MODELS[0]  # GPT for general

def _check_for_checkpoint(message: str) -> Optional[Dict[str, Any]]:
    """Check if message requires a checkpoint (hard stop)"""
    message_lower = message.lower()
    
    # Check for send/share actions
    if any(word in message_lower for word in ["send email", "share", "publish", "post to"]):
        return {
            "type": "SEND_SHARE",
            "reason": "This action will share or send content externally"
        }
    
    # Check for spending money
    if any(word in message_lower for word in ["buy", "purchase", "pay", "subscribe", "charge"]):
        return {
            "type": "SPEND_MONEY",
            "reason": "This action involves spending money"
        }
    
    # Check for delete/overwrite
    if any(word in message_lower for word in ["delete", "remove", "overwrite", "erase"]):
        return {
            "type": "DELETE_OVERWRITE",
            "reason": "This action will delete or overwrite data"
        }
    
    # Check for legal/medical
    if any(word in message_lower for word in ["legal", "lawsuit", "medical advice", "diagnosis"]):
        return {
            "type": "LEGAL_MEDICAL",
            "reason": "This involves legal or medical claims"
        }
    
    return None

@api_router.post("/boss/message", response_model=BossResponse)
async def send_boss_message(
    message_data: BossMessage,
    current_user: User = Depends(get_current_user)
):
    """Send a message to Boss AI"""
    
    # Check for checkpoint requirement first
    checkpoint_info = _check_for_checkpoint(message_data.message)
    if checkpoint_info:
        checkpoint = Checkpoint(
            user_id=current_user.user_id,
            checkpoint_type=checkpoint_info["type"],
            action_description=message_data.message,
            context={"reason": checkpoint_info["reason"]}
        )
        await db.checkpoints.insert_one(checkpoint.model_dump())
        
        return BossResponse(
            response=f"Checkpoint Required: {checkpoint_info['reason']}. Please approve this action before I proceed.",
            memory_used=[],
            decisions_made=[],
            checkpoint_required={
                "checkpoint_id": checkpoint.checkpoint_id,
                "type": checkpoint_info["type"],
                "reason": checkpoint_info["reason"]
            },
            model_used="none"
        )
    
    # Get relevant memory
    memory_items = []
    if message_data.include_memory:
        memory_items = await _get_memory_for_context(
            current_user.user_id,
            message_data.project_id
        )
    
    # Build context from memory
    memory_context = ""
    if memory_items:
        memory_context = "\n\nRelevant Memory (decisions and preferences):\n"
        for item in memory_items:
            memory_context += f"- [{item['scope']}] {item['key']}: {item['value']}\n"
    
    # Auto-select model
    selected_model = _select_model(message_data.message)
    
    # Build system message for Boss AI
    system_message = """You are Boss AI - an intelligent operating layer that remembers decisions, not conversations.

Core Principles:
1. AUTOPILOT: Keep going automatically. Never ask "should I proceed?" unless hitting a checkpoint.
2. NO OBVIOUS QUESTIONS: Don't ask what the user already told you or things you can figure out.
3. DECISIONS > CONVERSATIONS: You remember and reference decisions made, not chat history.
4. MEMORY LAYERS: You have access to the user's preferences (L0) and project context (L2).
5. EFFICIENCY: Be concise and action-oriented.

When responding:
- Reference relevant memories/decisions when appropriate
- Proceed with tasks automatically
- Only pause for checkpoints: sending/sharing, spending money, deleting data, legal/medical claims
- State what you're doing, not asking permission
""" + memory_context
    
    try:
        # Initialize chat with selected model
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"boss_{current_user.user_id}_{message_data.project_id or 'global'}",
            system_message=system_message
        ).with_model(selected_model["provider"], selected_model["model"])
        
        # Send message
        user_msg = UserMessage(text=message_data.message)
        response = await chat.send_message(user_msg)
        
        # Record interaction as memory event
        await _create_memory_event(
            user_id=current_user.user_id,
            event_type="BOSS_ACTION",
            scope="L3_SESSION",
            key=f"interaction_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            value={"query": message_data.message[:200], "model": selected_model["model"]},
            project_id=message_data.project_id
        )
        
        # Generate avatar video if requested
        video_url = None
        video_status = None
        if message_data.generate_video and DID_API_KEY:
            try:
                # Create video asynchronously
                video = AvatarVideo(
                    user_id=current_user.user_id,
                    script_text=response[:500],
                    status="processing"
                )
                await db.avatar_videos.insert_one(video.model_dump())
                
                did_response = await _create_did_talk(response[:500])
                talk_id = did_response.get("id")
                
                await db.avatar_videos.update_one(
                    {"video_id": video.video_id},
                    {"$set": {"did_talk_id": talk_id}}
                )
                
                asyncio.create_task(_poll_did_completion(video.video_id, talk_id))
                video_status = "processing"
            except Exception as e:
                logger.error(f"Video generation error: {e}")
                video_status = "failed"
        
        return BossResponse(
            response=response,
            memory_used=[{"key": m["key"], "scope": m["scope"]} for m in memory_items],
            decisions_made=[],
            checkpoint_required=None,
            model_used=f"{selected_model['provider']}/{selected_model['model']}",
            video_url=video_url,
            video_status=video_status
        )
        
    except Exception as e:
        logger.error(f"Boss AI error: {e}")
        raise HTTPException(status_code=500, detail=f"Boss AI error: {str(e)}")

@api_router.get("/boss/memory-receipt")
async def get_memory_receipt(
    project_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get memory receipt (trust feature - shows what memory was used)"""
    memory_items = await _get_memory_for_context(
        current_user.user_id,
        project_id
    )
    
    # Group by scope
    by_scope = {}
    for item in memory_items:
        scope = item["scope"]
        if scope not in by_scope:
            by_scope[scope] = []
        by_scope[scope].append({"key": item["key"], "value": str(item["value"])[:100]})
    
    receipts = []
    for scope, items in by_scope.items():
        receipts.append(MemoryReceipt(
            scope=scope,
            items_count=len(items),
            items_used=items,
            why_used="Providing context for Boss AI decisions and actions"
        ))
    
    return receipts

# ================== BASIC ROUTES ==================

@api_router.get("/")
async def root():
    return {"message": "Boss AI API - Operating Layer, Not Chatbot"}

@api_router.get("/health")
async def health():
    return {"status": "healthy", "service": "boss-ai"}

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
