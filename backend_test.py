#!/usr/bin/env python3
"""
Boss AI Backend API Testing Suite
Tests the new email/password authentication system and all backend endpoints
"""

import asyncio
import aiohttp
import json
import uuid
from datetime import datetime
from typing import Dict, Any, Optional

# Backend URL from environment
BACKEND_URL = "https://memory-boss.preview.emergentagent.com/api"

# Test credentials
TEST_EMAIL = "test_backend@bossai.com"
TEST_PASSWORD = "backend123"
TEST_NAME = "Backend Tester"

class BossAITester:
    def __init__(self):
        self.session_token: Optional[str] = None
        self.user_id: Optional[str] = None
        self.test_results = []
        
    async def log_result(self, test_name: str, success: bool, details: str = ""):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        result = f"{status}: {test_name}"
        if details:
            result += f" - {details}"
        print(result)
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details
        })
        
    async def make_request(self, method: str, endpoint: str, data: Dict = None, 
                          headers: Dict = None, use_auth: bool = False) -> tuple:
        """Make HTTP request to API"""
        url = f"{BACKEND_URL}{endpoint}"
        
        # Prepare headers
        req_headers = {"Content-Type": "application/json"}
        if headers:
            req_headers.update(headers)
            
        # Add auth header if needed
        if use_auth and self.session_token:
            req_headers["Authorization"] = f"Bearer {self.session_token}"
            
        try:
            async with aiohttp.ClientSession() as session:
                if method.upper() == "GET":
                    async with session.get(url, headers=req_headers) as response:
                        response_data = await response.json() if response.content_type == 'application/json' else await response.text()
                        return response.status, response_data
                elif method.upper() == "POST":
                    async with session.post(url, json=data, headers=req_headers) as response:
                        response_data = await response.json() if response.content_type == 'application/json' else await response.text()
                        return response.status, response_data
                elif method.upper() == "PUT":
                    async with session.put(url, json=data, headers=req_headers) as response:
                        response_data = await response.json() if response.content_type == 'application/json' else await response.text()
                        return response.status, response_data
                elif method.upper() == "DELETE":
                    async with session.delete(url, headers=req_headers) as response:
                        response_data = await response.json() if response.content_type == 'application/json' else await response.text()
                        return response.status, response_data
        except Exception as e:
            return 500, {"error": str(e)}
    
    async def test_health_endpoint(self):
        """Test health check endpoint"""
        status, data = await self.make_request("GET", "/health")
        
        if status == 200 and isinstance(data, dict) and data.get("status") == "healthy":
            await self.log_result("Health Check", True, "Service is healthy")
        else:
            await self.log_result("Health Check", False, f"Status: {status}, Data: {data}")
    
    async def test_root_endpoint(self):
        """Test API root endpoint"""
        status, data = await self.make_request("GET", "/")
        
        if status == 200 and isinstance(data, dict) and "Boss AI" in data.get("message", ""):
            await self.log_result("API Root", True, "Root endpoint accessible")
        else:
            await self.log_result("API Root", False, f"Status: {status}, Data: {data}")
    
    async def test_register_new_user(self):
        """Test user registration with email/password"""
        # Use unique email to avoid conflicts
        unique_email = f"test_{uuid.uuid4().hex[:8]}@bossai.com"
        
        register_data = {
            "email": unique_email,
            "password": TEST_PASSWORD,
            "name": TEST_NAME
        }
        
        status, data = await self.make_request("POST", "/auth/register", register_data)
        
        if status == 200 and isinstance(data, dict):
            if "user" in data and "session_token" in data:
                self.session_token = data["session_token"]
                self.user_id = data["user"]["user_id"]
                await self.log_result("User Registration", True, f"User created with ID: {self.user_id}")
                return True
            else:
                await self.log_result("User Registration", False, f"Missing user or session_token in response: {data}")
        else:
            await self.log_result("User Registration", False, f"Status: {status}, Data: {data}")
        return False
    
    async def test_register_duplicate_email(self):
        """Test registration with duplicate email (should fail)"""
        register_data = {
            "email": TEST_EMAIL,  # Use the same email again
            "password": TEST_PASSWORD,
            "name": TEST_NAME
        }
        
        status, data = await self.make_request("POST", "/auth/register", register_data)
        
        if status == 400 and isinstance(data, dict) and "already registered" in data.get("detail", "").lower():
            await self.log_result("Duplicate Email Registration", True, "Correctly rejected duplicate email")
        else:
            await self.log_result("Duplicate Email Registration", False, f"Status: {status}, Data: {data}")
    
    async def test_login_valid_credentials(self):
        """Test login with valid credentials"""
        login_data = {
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "remember_me": False
        }
        
        status, data = await self.make_request("POST", "/auth/login", login_data)
        
        if status == 200 and isinstance(data, dict):
            if "user" in data and "session_token" in data:
                self.session_token = data["session_token"]
                self.user_id = data["user"]["user_id"]
                await self.log_result("Valid Login", True, f"Login successful for user: {self.user_id}")
                return True
            else:
                await self.log_result("Valid Login", False, f"Missing user or session_token: {data}")
        else:
            await self.log_result("Valid Login", False, f"Status: {status}, Data: {data}")
        return False
    
    async def test_login_remember_me(self):
        """Test login with remember_me option"""
        login_data = {
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "remember_me": True
        }
        
        status, data = await self.make_request("POST", "/auth/login", login_data)
        
        if status == 200 and isinstance(data, dict) and "session_token" in data:
            await self.log_result("Remember Me Login", True, "Remember me option working")
        else:
            await self.log_result("Remember Me Login", False, f"Status: {status}, Data: {data}")
    
    async def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        login_data = {
            "email": TEST_EMAIL,
            "password": "wrongpassword",
            "remember_me": False
        }
        
        status, data = await self.make_request("POST", "/auth/login", login_data)
        
        if status == 401 and isinstance(data, dict) and "invalid" in data.get("detail", "").lower():
            await self.log_result("Invalid Login", True, "Correctly rejected invalid credentials")
        else:
            await self.log_result("Invalid Login", False, f"Status: {status}, Data: {data}")
    
    async def test_get_current_user(self):
        """Test getting current user info"""
        if not self.session_token:
            await self.log_result("Get Current User", False, "No session token available")
            return
            
        status, data = await self.make_request("GET", "/auth/me", use_auth=True)
        
        if status == 200 and isinstance(data, dict):
            if "user_id" in data and "email" in data and "name" in data:
                await self.log_result("Get Current User", True, f"User info retrieved: {data['email']}")
            else:
                await self.log_result("Get Current User", False, f"Missing user fields: {data}")
        else:
            await self.log_result("Get Current User", False, f"Status: {status}, Data: {data}")
    
    async def test_get_current_user_no_auth(self):
        """Test getting current user without authentication"""
        status, data = await self.make_request("GET", "/auth/me", use_auth=False)
        
        if status == 401:
            await self.log_result("Get User No Auth", True, "Correctly requires authentication")
        else:
            await self.log_result("Get User No Auth", False, f"Status: {status}, should be 401")
    
    async def test_boss_message_endpoint(self):
        """Test Boss AI message endpoint"""
        if not self.session_token:
            await self.log_result("Boss Message", False, "No session token available")
            return
            
        message_data = {
            "message": "Hello Boss AI, what can you help me with today?",
            "include_memory": True,
            "generate_video": False
        }
        
        status, data = await self.make_request("POST", "/boss/message", message_data, use_auth=True)
        
        if status == 200 and isinstance(data, dict):
            if "response" in data and "model_used" in data:
                await self.log_result("Boss Message", True, f"Response received, model: {data.get('model_used')}")
            else:
                await self.log_result("Boss Message", False, f"Missing response fields: {data}")
        else:
            await self.log_result("Boss Message", False, f"Status: {status}, Data: {data}")
    
    async def test_boss_message_checkpoint(self):
        """Test Boss AI message that triggers checkpoint"""
        if not self.session_token:
            await self.log_result("Boss Checkpoint", False, "No session token available")
            return
            
        message_data = {
            "message": "Please delete all my project files permanently",
            "include_memory": True,
            "generate_video": False
        }
        
        status, data = await self.make_request("POST", "/boss/message", message_data, use_auth=True)
        
        if status == 200 and isinstance(data, dict):
            if "checkpoint_required" in data and data["checkpoint_required"]:
                await self.log_result("Boss Checkpoint", True, f"Checkpoint triggered: {data['checkpoint_required']['type']}")
            else:
                await self.log_result("Boss Checkpoint", False, f"Checkpoint not triggered: {data}")
        else:
            await self.log_result("Boss Checkpoint", False, f"Status: {status}, Data: {data}")
    
    async def test_memory_receipt(self):
        """Test memory receipt endpoint"""
        if not self.session_token:
            await self.log_result("Memory Receipt", False, "No session token available")
            return
            
        status, data = await self.make_request("GET", "/boss/memory-receipt", use_auth=True)
        
        if status == 200 and isinstance(data, list):
            await self.log_result("Memory Receipt", True, f"Receipt retrieved with {len(data)} scopes")
        else:
            await self.log_result("Memory Receipt", False, f"Status: {status}, Data: {data}")
    
    async def test_memory_events_create(self):
        """Test creating memory events"""
        if not self.session_token:
            await self.log_result("Create Memory Event", False, "No session token available")
            return
            
        event_data = {
            "event_type": "MEMORY_SET",
            "scope": "L0_PRIME",
            "key": "test_preference",
            "value": {"setting": "test_value", "timestamp": datetime.now().isoformat()},
            "metadata": {"source": "backend_test"}
        }
        
        status, data = await self.make_request("POST", "/memory/events", event_data, use_auth=True)
        
        if status == 200 and isinstance(data, dict) and "event_id" in data:
            await self.log_result("Create Memory Event", True, f"Event created: {data['event_id']}")
        else:
            await self.log_result("Create Memory Event", False, f"Status: {status}, Data: {data}")
    
    async def test_memory_events_get(self):
        """Test getting memory events"""
        if not self.session_token:
            await self.log_result("Get Memory Events", False, "No session token available")
            return
            
        status, data = await self.make_request("GET", "/memory/events", use_auth=True)
        
        if status == 200 and isinstance(data, list):
            await self.log_result("Get Memory Events", True, f"Retrieved {len(data)} events")
        else:
            await self.log_result("Get Memory Events", False, f"Status: {status}, Data: {data}")
    
    async def test_memory_state_get(self):
        """Test getting memory state"""
        if not self.session_token:
            await self.log_result("Get Memory State", False, "No session token available")
            return
            
        status, data = await self.make_request("GET", "/memory/state", use_auth=True)
        
        if status == 200 and isinstance(data, list):
            await self.log_result("Get Memory State", True, f"Retrieved {len(data)} memory items")
        else:
            await self.log_result("Get Memory State", False, f"Status: {status}, Data: {data}")
    
    async def test_projects_create(self):
        """Test creating a project"""
        if not self.session_token:
            await self.log_result("Create Project", False, "No session token available")
            return
            
        project_data = {
            "name": "Backend Test Project",
            "description": "A test project created during backend testing"
        }
        
        status, data = await self.make_request("POST", "/projects", project_data, use_auth=True)
        
        if status == 200 and isinstance(data, dict) and "project_id" in data:
            await self.log_result("Create Project", True, f"Project created: {data['project_id']}")
            return data["project_id"]
        else:
            await self.log_result("Create Project", False, f"Status: {status}, Data: {data}")
        return None
    
    async def test_projects_get(self):
        """Test getting projects"""
        if not self.session_token:
            await self.log_result("Get Projects", False, "No session token available")
            return
            
        status, data = await self.make_request("GET", "/projects", use_auth=True)
        
        if status == 200 and isinstance(data, list):
            await self.log_result("Get Projects", True, f"Retrieved {len(data)} projects")
        else:
            await self.log_result("Get Projects", False, f"Status: {status}, Data: {data}")
    
    async def test_decisions_create(self):
        """Test creating a decision"""
        if not self.session_token:
            await self.log_result("Create Decision", False, "No session token available")
            return
            
        decision_data = {
            "title": "Backend Testing Decision",
            "description": "Decision to proceed with comprehensive backend testing",
            "context": {"test_phase": "authentication", "priority": "high"},
            "outcome": "Approved - testing will continue"
        }
        
        status, data = await self.make_request("POST", "/decisions", decision_data, use_auth=True)
        
        if status == 200 and isinstance(data, dict) and "decision_id" in data:
            await self.log_result("Create Decision", True, f"Decision created: {data['decision_id']}")
        else:
            await self.log_result("Create Decision", False, f"Status: {status}, Data: {data}")
    
    async def test_decisions_get(self):
        """Test getting decisions"""
        if not self.session_token:
            await self.log_result("Get Decisions", False, "No session token available")
            return
            
        status, data = await self.make_request("GET", "/decisions", use_auth=True)
        
        if status == 200 and isinstance(data, list):
            await self.log_result("Get Decisions", True, f"Retrieved {len(data)} decisions")
        else:
            await self.log_result("Get Decisions", False, f"Status: {status}, Data: {data}")
    
    async def test_checkpoints_create(self):
        """Test creating a checkpoint"""
        if not self.session_token:
            await self.log_result("Create Checkpoint", False, "No session token available")
            return
            
        checkpoint_data = {
            "checkpoint_type": "DELETE_OVERWRITE",
            "action_description": "Testing checkpoint creation during backend tests",
            "context": {"test_scenario": "backend_validation"}
        }
        
        status, data = await self.make_request("POST", "/checkpoints", checkpoint_data, use_auth=True)
        
        if status == 200 and isinstance(data, dict) and "checkpoint_id" in data:
            await self.log_result("Create Checkpoint", True, f"Checkpoint created: {data['checkpoint_id']}")
            return data["checkpoint_id"]
        else:
            await self.log_result("Create Checkpoint", False, f"Status: {status}, Data: {data}")
        return None
    
    async def test_checkpoints_get(self):
        """Test getting checkpoints"""
        if not self.session_token:
            await self.log_result("Get Checkpoints", False, "No session token available")
            return
            
        status, data = await self.make_request("GET", "/checkpoints", use_auth=True)
        
        if status == 200 and isinstance(data, list):
            await self.log_result("Get Checkpoints", True, f"Retrieved {len(data)} checkpoints")
        else:
            await self.log_result("Get Checkpoints", False, f"Status: {status}, Data: {data}")
    
    async def test_checkpoint_resolve(self, checkpoint_id: str):
        """Test resolving a checkpoint"""
        if not self.session_token or not checkpoint_id:
            await self.log_result("Resolve Checkpoint", False, "No session token or checkpoint ID")
            return
            
        resolve_data = {
            "status": "APPROVED"
        }
        
        status, data = await self.make_request("PUT", f"/checkpoints/{checkpoint_id}", resolve_data, use_auth=True)
        
        if status == 200 and isinstance(data, dict) and "message" in data:
            await self.log_result("Resolve Checkpoint", True, f"Checkpoint resolved: {data['message']}")
        else:
            await self.log_result("Resolve Checkpoint", False, f"Status: {status}, Data: {data}")
    
    async def test_logout(self):
        """Test logout endpoint"""
        if not self.session_token:
            await self.log_result("Logout", False, "No session token available")
            return
            
        status, data = await self.make_request("POST", "/auth/logout", use_auth=True)
        
        if status == 200 and isinstance(data, dict) and "message" in data:
            await self.log_result("Logout", True, "Successfully logged out")
            self.session_token = None
            self.user_id = None
        else:
            await self.log_result("Logout", False, f"Status: {status}, Data: {data}")
    
    async def run_all_tests(self):
        """Run all backend tests"""
        print(f"🚀 Starting Boss AI Backend API Tests")
        print(f"📡 Backend URL: {BACKEND_URL}")
        print(f"📧 Test Email: {TEST_EMAIL}")
        print("=" * 60)
        
        # Basic endpoint tests
        await self.test_health_endpoint()
        await self.test_root_endpoint()
        
        print("\n🔐 AUTHENTICATION TESTS")
        print("-" * 30)
        
        # Authentication tests
        await self.test_register_new_user()
        await self.test_register_duplicate_email()
        await self.test_login_valid_credentials()
        await self.test_login_remember_me()
        await self.test_login_invalid_credentials()
        await self.test_get_current_user()
        await self.test_get_current_user_no_auth()
        
        print("\n🤖 BOSS AI TESTS")
        print("-" * 20)
        
        # Boss AI tests
        await self.test_boss_message_endpoint()
        await self.test_boss_message_checkpoint()
        await self.test_memory_receipt()
        
        print("\n🧠 MEMORY ENGINE TESTS")
        print("-" * 25)
        
        # Memory engine tests
        await self.test_memory_events_create()
        await self.test_memory_events_get()
        await self.test_memory_state_get()
        
        print("\n📋 CRUD OPERATION TESTS")
        print("-" * 25)
        
        # CRUD tests
        project_id = await self.test_projects_create()
        await self.test_projects_get()
        await self.test_decisions_create()
        await self.test_decisions_get()
        checkpoint_id = await self.test_checkpoints_create()
        await self.test_checkpoints_get()
        
        if checkpoint_id:
            await self.test_checkpoint_resolve(checkpoint_id)
        
        print("\n🚪 LOGOUT TEST")
        print("-" * 15)
        
        # Logout test
        await self.test_logout()
        
        # Summary
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for result in self.test_results if result["success"])
        total = len(self.test_results)
        
        print(f"✅ Passed: {passed}/{total}")
        print(f"❌ Failed: {total - passed}/{total}")
        
        if total - passed > 0:
            print("\n🔍 FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"  ❌ {result['test']}: {result['details']}")
        
        print(f"\n🎯 Success Rate: {(passed/total)*100:.1f}%")
        
        return passed == total

async def main():
    """Main test runner"""
    tester = BossAITester()
    success = await tester.run_all_tests()
    
    if success:
        print("\n🎉 All tests passed! Backend API is working correctly.")
        return 0
    else:
        print("\n⚠️  Some tests failed. Please check the results above.")
        return 1

if __name__ == "__main__":
    import sys
    result = asyncio.run(main())
    sys.exit(result)