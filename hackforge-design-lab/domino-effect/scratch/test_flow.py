import urllib.request
import json
import sys

BASE_URL = "http://127.0.0.1:8000/api"

def request(path, method="GET", data=None, headers=None):
    url = f"{BASE_URL}{path}"
    req_headers = {"Content-Type": "application/json"}
    if headers:
        req_headers.update(headers)
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, headers=req_headers, method=method)
    with urllib.request.urlopen(req) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))

def main():
    print("=== TESTING TWO-PHONE ACCOUNT SHARING DEMO WORKFLOW ===")
    
    # 0. Reset Demo Rider
    print("\n--- Step 0: Reset Demo Rider ---")
    status, res = request("/demo/reset", method="POST")
    assert status == 200, f"Reset failed: {res}"
    print("Reset response:", res["status"])
    
    # Check baseline status
    status, snapshot = request("/snapshot")
    demo_rider = next((r for r in snapshot["riders"] if r["id"] == "R-9001"), None)
    assert demo_rider is not None, "Demo rider R-9001 not found"
    print(f"R-9001 baseline: Trust={demo_rider['trustScore']}, State={demo_rider['state']}, Color={demo_rider['riskLevel']}")
    assert demo_rider["trustScore"] == 100
    assert demo_rider["riskLevel"] == "TRUSTED"
    
    # 1. Phone A Login & Accept Delivery (Stage 1 - Normal Activity)
    print("\n--- Step 1: Phone A Login & Delivery Acceptance ---")
    status, auth_a = request("/auth/login", method="POST", data={
        "identifier": "demo@stillyou.dev",
        "password": "StillYou123!",
        "device": {
            "device_id": "device-phone-a-demo",
            "label": "Phone A (iPhone 15)",
            "browser_profile": "Mobile Safari / iOS 17"
        }
    })
    token_a = auth_a["token"]
    print("Phone A logged in, session:", auth_a["sessionId"])
    
    # Phone A accepts delivery
    deliveries_a = auth_a["deliveries"]
    avail_a = next((d for d in deliveries_a if d["status"] == "AVAILABLE"), None)
    assert avail_a is not None, "No available delivery for Phone A"
    status, action_a = request("/portal/action", method="POST", data={
        "action": "ACCEPT_DELIVERY",
        "order_id": avail_a["id"]
    }, headers={"Authorization": f"Bearer {token_a}"})
    print(f"Phone A accepted delivery {avail_a['id']}. Trust: {action_a['rider']['trustScore']}, State: {action_a['rider']['state']}")
    assert action_a["rider"]["trustScore"] == 100
    assert action_a["rider"]["state"] == "TRUSTED"
    
    # 2. Phone B Login & Accept Delivery (Stage 2 - Suspicious Activity / Account Sharing)
    print("\n--- Step 2: Phone B Login & Concurrent Delivery Acceptance ---")
    status, auth_b = request("/auth/login", method="POST", data={
        "identifier": "demo@stillyou.dev",
        "password": "StillYou123!",
        "device": {
            "device_id": "device-phone-b-demo",
            "label": "Phone B (Galaxy S23)",
            "browser_profile": "Chrome Mobile / Android 14"
        }
    })
    token_b = auth_b["token"]
    print("Phone B logged in, session:", auth_b["sessionId"])
    assert auth_b["sessionId"] != auth_a["sessionId"], "Sessions must have distinct IDs"
    
    # Phone B accepts delivery while Phone A delivery is active
    deliveries_b = auth_b["deliveries"]
    avail_b = next((d for d in deliveries_b if d["status"] == "AVAILABLE"), None)
    assert avail_b is not None, "No available delivery for Phone B"
    status, action_b = request("/portal/action", method="POST", data={
        "action": "ACCEPT_DELIVERY",
        "order_id": avail_b["id"]
    }, headers={"Authorization": f"Bearer {token_b}"})
    print(f"Phone B delivery acceptance response:")
    print(f"Trust: {action_b['rider']['trustScore']} (Expected: 75)")
    print(f"State: {action_b['rider']['state']} (Expected: VERIFICATION_REQUIRED)")
    print(f"Verification Required: {action_b['rider']['verificationRequired']}")
    assert action_b["rider"]["trustScore"] == 75, f"Expected trust 75, got {action_b['rider']['trustScore']}"
    assert action_b["rider"]["state"] == "VERIFICATION_REQUIRED"
    assert action_b["rider"]["verificationRequired"] is True
    
    # Verify Admin Dashboard Snapshot
    status, snapshot_s2 = request("/snapshot")
    demo_s2 = next((r for r in snapshot_s2["riders"] if r["id"] == "R-9001"), None)
    print(f"Dashboard snapshot for R-9001: Trust={demo_s2['trustScore']}, Severity={demo_s2['riskLevel']}")
    assert demo_s2["trustScore"] == 75
    assert demo_s2["riskLevel"] == "SUSPICIOUS" # YELLOW
    
    # 3. Stage 4A: Face Mismatch on Phone B
    print("\n--- Step 3: Stage 4A - Phone B Face Mismatch Verification ---")
    status, fail_res = request("/verification/R-9001/complete", method="POST", data={
        "result": "FAILED",
        "source": "FACE_MATCH",
        "metadata": {
            "matchDistance": 0.684,
            "reason": "Biometric face mismatch against enrolled portrait"
        }
    })
    print(f"Face verification FAILED result:")
    print(f"Trust: {fail_res['trustScore']} (Expected: 35)")
    print(f"State: {fail_res['state']} (Expected: HUMAN_REVIEW)")
    assert fail_res["trustScore"] == 35, f"Expected 35, got {fail_res['trustScore']}"
    assert fail_res["state"] == "HUMAN_REVIEW"
    
    # Verify Admin Dashboard Snapshot shows RED
    status, snapshot_s4a = request("/snapshot")
    demo_s4a = next((r for r in snapshot_s4a["riders"] if r["id"] == "R-9001"), None)
    print(f"Dashboard snapshot after mismatch: Trust={demo_s4a['trustScore']}, Severity={demo_s4a['riskLevel']}")
    assert demo_s4a["trustScore"] == 35
    assert demo_s4a["riskLevel"] == "HIGH RISK" # RED
    
    # 4. OTP security test: Passing OTP alone must NOT override confirmed face mismatch
    print("\n--- Step 4: OTP Verification Attempt while Face Mismatch is Confirmed ---")
    status, otp_req = request("/portal/otp/request", method="POST", headers={"Authorization": f"Bearer {token_b}"})
    otp_code = otp_req.get("demoCode")
    challenge_id = otp_req["challengeId"]
    status, otp_verify = request("/portal/otp/verify", method="POST", data={
        "challenge_id": challenge_id,
        "code": otp_code
    }, headers={"Authorization": f"Bearer {token_b}"})
    print(f"OTP verification outcome: {otp_verify['result']}")
    print(f"Message: {otp_verify['message']}")
    print(f"Rider state after OTP: {otp_verify['rider']['state']}")
    assert otp_verify["result"] == "PASSED_RESTRICTED"
    assert otp_verify["rider"]["state"] == "HUMAN_REVIEW"
    assert otp_verify["rider"]["trustScore"] == 35
    print("SUCCESS: OTP alone correctly rejected from overriding face mismatch!")
    
    # 5. Reset Demo Rider for Stage 4B
    print("\n--- Step 5: Reset Demo Rider for Stage 4B ---")
    status, res = request("/demo/reset", method="POST")
    assert status == 200
    
    # Check sessions are STILL valid on both phones
    status, me_a = request("/portal/me", headers={"Authorization": f"Bearer {token_a}"})
    assert status == 200, "Phone A session should survive demo reset"
    status, me_b = request("/portal/me", headers={"Authorization": f"Bearer {token_b}"})
    assert status == 200, "Phone B session should survive demo reset"
    print("Sessions on Phone A and Phone B survived reset cleanly!")
    
    # 6. Stage 4B: Re-trigger Anomaly & Face Match
    print("\n--- Step 6: Stage 4B - Face Match Verification ---")
    # Phone A accepts delivery
    status, act_a = request("/portal/action", method="POST", data={"action": "ACCEPT_DELIVERY", "order_id": me_a["deliveries"][0]["id"]}, headers={"Authorization": f"Bearer {token_a}"})
    # Phone B accepts delivery -> triggers anomaly
    status, act_b = request("/portal/action", method="POST", data={"action": "ACCEPT_DELIVERY", "order_id": me_b["deliveries"][1]["id"]}, headers={"Authorization": f"Bearer {token_b}"})
    assert act_b["rider"]["trustScore"] == 75
    print(f"Anomaly re-triggered: Trust = {act_b['rider']['trustScore']}")
    
    # Now Phone B submits matching face
    status, pass_res = request("/verification/R-9001/complete", method="POST", data={
        "result": "PASSED",
        "source": "FACE_MATCH",
        "metadata": {
            "matchDistance": 0.291,
            "movementChecks": ["blink", "left", "right"]
        }
    })
    print(f"Face verification PASSED result:")
    print(f"Trust: {pass_res['trustScore']} (Expected: 100)")
    print(f"State: {pass_res['state']} (Expected: TRUSTED)")
    assert pass_res["trustScore"] == 100
    assert pass_res["state"] == "TRUSTED"
    
    # Verify Admin Dashboard Snapshot shows BLUE
    status, snapshot_final = request("/snapshot")
    demo_final = next((r for r in snapshot_final["riders"] if r["id"] == "R-9001"), None)
    print(f"Dashboard final status: Trust={demo_final['trustScore']}, Severity={demo_final['riskLevel']}")
    assert demo_final["trustScore"] == 100
    assert demo_final["riskLevel"] == "TRUSTED" # BLUE
    
    print("\n=== ALL DEMO STAGES PASSED FLAWLESSLY! ===")

if __name__ == "__main__":
    main()
