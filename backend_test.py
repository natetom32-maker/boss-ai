#!/usr/bin/env python3
"""
Boss AI Backend API Testing Suite
Tests all backend endpoints with proper authentication
"""

import requests
import json
import sys
from datetime import datetime
import uuid

# Test configuration
BASE_URL = "https://memory-boss.preview.emergentagent.com/api"
SESSION_TOKEN = "test_session_1768187604791"
USER_ID = "user_1768187604791"

# Headers for authenticated requests
AUTH_HEADERS = {
    "Authorization": f"Bearer {SESSION_TOKEN}",
    "Content-Type": "application/json"
}

class TestResults:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []
    
    def log_pass(self, test_name):
        print(f"✅ PASS: {test_name}")
        self.passed += 1
    
    def log_fail(self, test_name, error):
        print(f"❌ FAIL: {test_name} - {error}")
        self.failed += 1
        self.errors.append(f"{test_name}: {error}")
    
    def summary(self):
        total = self.passed + self.failed
        print(f"\n{'='*60}")
        print(f"TEST SUMMARY: {self.passed}/{total} passed")
        if self.errors:
            print(f"\nFAILED TESTS:")
            for error in self.errors:
                print(f"  - {error}")
        print(f"{'='*60}")

results = TestResults()

def test_api_root():
    """Test API root endpoint"""
    try:
        response = requests.get(f"{BASE_URL}/")
        if response.status_code == 200:
            data = response.json()
            if "Boss AI API" in data.get("message", ""):
                results.log_pass("API Root Endpoint")
                return True
            else:
                results.log_fail("API Root Endpoint", f"Unexpected message: {data}")
                return False
        else:
            results.log_fail("API Root Endpoint", f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        results.log_fail("API Root Endpoint", f"Exception: {str(e)}")
        return False

def test_health_endpoint():
    """Test health endpoint"""
    try:
        response = requests.get(f"{BASE_URL}/health")
        if response.status_code == 200:
            data = response.json()
            if data.get("status") == "healthy":
                results.log_pass("Health Endpoint")
                return True
            else:
                results.log_fail("Health Endpoint", f"Unexpected status: {data}")
                return False
        else:
            results.log_fail("Health Endpoint", f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        results.log_fail("Health Endpoint", f"Exception: {str(e)}")
        return False

def test_auth_me():
    """Test GET /api/auth/me with Bearer token"""
    try:
        response = requests.get(f"{BASE_URL}/auth/me", headers=AUTH_HEADERS)
        if response.status_code == 200:
            data = response.json()
            if data.get("user_id") == USER_ID:
                results.log_pass("Auth Me Endpoint")
                return True
            else:
                results.log_fail("Auth Me Endpoint", f"Wrong user_id: {data}")
                return False
        else:
            results.log_fail("Auth Me Endpoint", f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        results.log_fail("Auth Me Endpoint", f"Exception: {str(e)}")
        return False

def test_memory_engine():
    """Test Memory Engine endpoints"""
    # Test POST /api/memory/events
    try:
        event_data = {
            "event_type": "MEMORY_SET",
            "scope": "L0_PRIME",
            "key": "test_preference",
            "value": {"setting": "test_value", "enabled": True},
            "metadata": {"test": True}
        }
        
        response = requests.post(f"{BASE_URL}/memory/events", 
                               headers=AUTH_HEADERS, 
                               json=event_data)
        
        if response.status_code == 200:
            event_result = response.json()
            if event_result.get("event_type") == "MEMORY_SET":
                results.log_pass("Memory Events POST")
            else:
                results.log_fail("Memory Events POST", f"Unexpected response: {event_result}")
                return False
        else:
            results.log_fail("Memory Events POST", f"Status {response.status_code}: {response.text}")
            return False
            
    except Exception as e:
        results.log_fail("Memory Events POST", f"Exception: {str(e)}")
        return False
    
    # Test GET /api/memory/events
    try:
        response = requests.get(f"{BASE_URL}/memory/events", headers=AUTH_HEADERS)
        if response.status_code == 200:
            events = response.json()
            if isinstance(events, list):
                results.log_pass("Memory Events GET")
            else:
                results.log_fail("Memory Events GET", f"Expected list, got: {type(events)}")
                return False
        else:
            results.log_fail("Memory Events GET", f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        results.log_fail("Memory Events GET", f"Exception: {str(e)}")
        return False
    
    # Test GET /api/memory/state
    try:
        response = requests.get(f"{BASE_URL}/memory/state", headers=AUTH_HEADERS)
        if response.status_code == 200:
            state = response.json()
            if isinstance(state, list):
                results.log_pass("Memory State GET")
                return True
            else:
                results.log_fail("Memory State GET", f"Expected list, got: {type(state)}")
                return False
        else:
            results.log_fail("Memory State GET", f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        results.log_fail("Memory State GET", f"Exception: {str(e)}")
        return False

def test_projects():
    """Test Projects CRUD endpoints"""
    project_id = None
    
    # Test POST /api/projects
    try:
        project_data = {
            "name": "Test Project",
            "description": "A test project for API validation"
        }
        
        response = requests.post(f"{BASE_URL}/projects", 
                               headers=AUTH_HEADERS, 
                               json=project_data)
        
        if response.status_code == 200:
            project = response.json()
            project_id = project.get("project_id")
            if project.get("name") == "Test Project":
                results.log_pass("Projects POST")
            else:
                results.log_fail("Projects POST", f"Unexpected response: {project}")
                return False
        else:
            results.log_fail("Projects POST", f"Status {response.status_code}: {response.text}")
            return False
            
    except Exception as e:
        results.log_fail("Projects POST", f"Exception: {str(e)}")
        return False
    
    # Test GET /api/projects
    try:
        response = requests.get(f"{BASE_URL}/projects", headers=AUTH_HEADERS)
        if response.status_code == 200:
            projects = response.json()
            if isinstance(projects, list) and len(projects) > 0:
                results.log_pass("Projects GET")
            else:
                results.log_fail("Projects GET", f"Expected non-empty list, got: {projects}")
                return False
        else:
            results.log_fail("Projects GET", f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        results.log_fail("Projects GET", f"Exception: {str(e)}")
        return False
    
    # Test GET /api/projects/{id} if we have a project_id
    if project_id:
        try:
            response = requests.get(f"{BASE_URL}/projects/{project_id}", headers=AUTH_HEADERS)
            if response.status_code == 200:
                project = response.json()
                if project.get("project_id") == project_id:
                    results.log_pass("Projects GET by ID")
                    return True
                else:
                    results.log_fail("Projects GET by ID", f"Wrong project_id: {project}")
                    return False
            else:
                results.log_fail("Projects GET by ID", f"Status {response.status_code}: {response.text}")
                return False
        except Exception as e:
            results.log_fail("Projects GET by ID", f"Exception: {str(e)}")
            return False
    
    return True

def test_decisions():
    """Test Decisions CRUD endpoints"""
    # Test POST /api/decisions
    try:
        decision_data = {
            "title": "Test Decision",
            "description": "A test decision for API validation",
            "context": {"test": True},
            "outcome": "Approved for testing",
            "memory_keys_used": ["test_preference"]
        }
        
        response = requests.post(f"{BASE_URL}/decisions", 
                               headers=AUTH_HEADERS, 
                               json=decision_data)
        
        if response.status_code == 200:
            decision = response.json()
            if decision.get("title") == "Test Decision":
                results.log_pass("Decisions POST")
            else:
                results.log_fail("Decisions POST", f"Unexpected response: {decision}")
                return False
        else:
            results.log_fail("Decisions POST", f"Status {response.status_code}: {response.text}")
            return False
            
    except Exception as e:
        results.log_fail("Decisions POST", f"Exception: {str(e)}")
        return False
    
    # Test GET /api/decisions
    try:
        response = requests.get(f"{BASE_URL}/decisions", headers=AUTH_HEADERS)
        if response.status_code == 200:
            decisions = response.json()
            if isinstance(decisions, list):
                results.log_pass("Decisions GET")
                return True
            else:
                results.log_fail("Decisions GET", f"Expected list, got: {type(decisions)}")
                return False
        else:
            results.log_fail("Decisions GET", f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        results.log_fail("Decisions GET", f"Exception: {str(e)}")
        return False

def test_checkpoints():
    """Test Checkpoints CRUD endpoints"""
    checkpoint_id = None
    
    # Test POST /api/checkpoints
    try:
        checkpoint_data = {
            "checkpoint_type": "DELETE_OVERWRITE",
            "action_description": "Test deletion action for API validation",
            "context": {"test": True}
        }
        
        response = requests.post(f"{BASE_URL}/checkpoints", 
                               headers=AUTH_HEADERS, 
                               json=checkpoint_data)
        
        if response.status_code == 200:
            checkpoint = response.json()
            checkpoint_id = checkpoint.get("checkpoint_id")
            if checkpoint.get("checkpoint_type") == "DELETE_OVERWRITE":
                results.log_pass("Checkpoints POST")
            else:
                results.log_fail("Checkpoints POST", f"Unexpected response: {checkpoint}")
                return False
        else:
            results.log_fail("Checkpoints POST", f"Status {response.status_code}: {response.text}")
            return False
            
    except Exception as e:
        results.log_fail("Checkpoints POST", f"Exception: {str(e)}")
        return False
    
    # Test GET /api/checkpoints
    try:
        response = requests.get(f"{BASE_URL}/checkpoints", headers=AUTH_HEADERS)
        if response.status_code == 200:
            checkpoints = response.json()
            if isinstance(checkpoints, list):
                results.log_pass("Checkpoints GET")
            else:
                results.log_fail("Checkpoints GET", f"Expected list, got: {type(checkpoints)}")
                return False
        else:
            results.log_fail("Checkpoints GET", f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        results.log_fail("Checkpoints GET", f"Exception: {str(e)}")
        return False
    
    # Test PUT /api/checkpoints/{id} if we have a checkpoint_id
    if checkpoint_id:
        try:
            resolve_data = {"status": "APPROVED"}
            response = requests.put(f"{BASE_URL}/checkpoints/{checkpoint_id}", 
                                  headers=AUTH_HEADERS, 
                                  json=resolve_data)
            if response.status_code == 200:
                result = response.json()
                if "approved" in result.get("message", "").lower():
                    results.log_pass("Checkpoints PUT (Resolve)")
                    return True
                else:
                    results.log_fail("Checkpoints PUT (Resolve)", f"Unexpected message: {result}")
                    return False
            else:
                results.log_fail("Checkpoints PUT (Resolve)", f"Status {response.status_code}: {response.text}")
                return False
        except Exception as e:
            results.log_fail("Checkpoints PUT (Resolve)", f"Exception: {str(e)}")
            return False
    
    return True

def test_boss_ai():
    """Test Boss AI endpoints"""
    # Test POST /api/boss/message with simple message
    try:
        message_data = {
            "message": "Hello Boss AI, please help me organize my tasks for today",
            "include_memory": True
        }
        
        response = requests.post(f"{BASE_URL}/boss/message", 
                               headers=AUTH_HEADERS, 
                               json=message_data)
        
        if response.status_code == 200:
            boss_response = response.json()
            if boss_response.get("response") and boss_response.get("model_used"):
                results.log_pass("Boss AI Message (Simple)")
            else:
                results.log_fail("Boss AI Message (Simple)", f"Missing response fields: {boss_response}")
                return False
        else:
            results.log_fail("Boss AI Message (Simple)", f"Status {response.status_code}: {response.text}")
            return False
            
    except Exception as e:
        results.log_fail("Boss AI Message (Simple)", f"Exception: {str(e)}")
        return False
    
    # Test checkpoint trigger with "delete all files"
    try:
        checkpoint_message = {
            "message": "delete all files in my project folder",
            "include_memory": True
        }
        
        response = requests.post(f"{BASE_URL}/boss/message", 
                               headers=AUTH_HEADERS, 
                               json=checkpoint_message)
        
        if response.status_code == 200:
            boss_response = response.json()
            checkpoint_required = boss_response.get("checkpoint_required")
            if checkpoint_required and checkpoint_required.get("type") == "DELETE_OVERWRITE":
                results.log_pass("Boss AI Checkpoint Trigger")
            else:
                results.log_fail("Boss AI Checkpoint Trigger", f"Expected checkpoint, got: {boss_response}")
                return False
        else:
            results.log_fail("Boss AI Checkpoint Trigger", f"Status {response.status_code}: {response.text}")
            return False
            
    except Exception as e:
        results.log_fail("Boss AI Checkpoint Trigger", f"Exception: {str(e)}")
        return False
    
    # Test GET /api/boss/memory-receipt
    try:
        response = requests.get(f"{BASE_URL}/boss/memory-receipt", headers=AUTH_HEADERS)
        if response.status_code == 200:
            receipts = response.json()
            if isinstance(receipts, list):
                results.log_pass("Boss AI Memory Receipt")
                return True
            else:
                results.log_fail("Boss AI Memory Receipt", f"Expected list, got: {type(receipts)}")
                return False
        else:
            results.log_fail("Boss AI Memory Receipt", f"Status {response.status_code}: {response.text}")
            return False
    except Exception as e:
        results.log_fail("Boss AI Memory Receipt", f"Exception: {str(e)}")
        return False

def main():
    """Run all tests in priority order"""
    print("🚀 Starting Boss AI Backend API Tests")
    print(f"Base URL: {BASE_URL}")
    print(f"Session Token: {SESSION_TOKEN}")
    print(f"User ID: {USER_ID}")
    print("="*60)
    
    # Test in priority order as specified
    print("\n1. Testing API Root and Health Endpoints...")
    test_api_root()
    test_health_endpoint()
    
    print("\n2. Testing Auth Endpoints...")
    test_auth_me()
    
    print("\n3. Testing Memory Engine...")
    test_memory_engine()
    
    print("\n4. Testing Projects...")
    test_projects()
    
    print("\n5. Testing Decisions...")
    test_decisions()
    
    print("\n6. Testing Checkpoints...")
    test_checkpoints()
    
    print("\n7. Testing Boss AI...")
    test_boss_ai()
    
    # Print summary
    results.summary()
    
    # Exit with appropriate code
    if results.failed > 0:
        sys.exit(1)
    else:
        print("\n🎉 All tests passed!")
        sys.exit(0)

if __name__ == "__main__":
    main()