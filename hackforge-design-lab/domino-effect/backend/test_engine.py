import tempfile
import unittest
import base64
from pathlib import Path

import backend.main as engine


class AutomationEngineTests(unittest.TestCase):
    def setUp(self):
        self.original = engine.DB_PATH
        self.original_uploads = engine.UPLOADS_PATH
        self.temp = tempfile.TemporaryDirectory()
        engine.DB_PATH = Path(self.temp.name) / "test.db"
        engine.UPLOADS_PATH = Path(self.temp.name) / "uploads"
        engine.init_database()
        engine.train_models()

    def tearDown(self):
        engine.DB_PATH = self.original
        engine.UPLOADS_PATH = self.original_uploads
        self.temp.cleanup()

    def test_isolation_forest_and_persistent_escalation(self):
        first = engine.process_event("R-1042", "account_sharing", "test-first")
        second = engine.process_event("R-1042", "account_sharing", "test-second")
        self.assertIsInstance(first["anomalyScore"], float)
        self.assertEqual(first["state"], "OBSERVING")
        self.assertEqual(second["state"], "VERIFICATION_REQUIRED")
        self.assertTrue(second["challengeId"])
        with engine.db() as connection:
            rider = connection.execute("SELECT * FROM riders WHERE id='R-1042'").fetchone()
            self.assertEqual(engine.rider_payload(connection, rider)["riskLevel"], "HIGH RISK")

    def test_device_change_is_not_severe(self):
        result = engine.process_event("R-2187", "device_change", "test-device")
        self.assertEqual(result["state"], "OBSERVING")
        self.assertEqual(result["action"], "INCREASE_OBSERVATION")

    def test_adverse_evidence_never_increases_low_trust(self):
        with engine.db() as connection:
            connection.execute("UPDATE riders SET trust_score=44,state='OBSERVING' WHERE id='R-2187'")
        result = engine.process_event("R-2187", "device_change", "low-trust-device")
        self.assertLessEqual(result["trustScore"], 44)

    def test_one_normal_event_does_not_restore_a_low_score_to_trusted(self):
        with engine.db() as connection:
            connection.execute("UPDATE riders SET trust_score=42,state='OBSERVING' WHERE id='R-2187'")
        result = engine.process_event("R-2187", "normal", "low-score-normal")
        self.assertEqual(result["trustScore"], 45)
        self.assertEqual(result["state"], "OBSERVING")
        self.assertEqual(result["action"], "INCREASE_OBSERVATION")

    def test_startup_repairs_legacy_low_score_trusted_state(self):
        with engine.db() as connection:
            connection.execute("UPDATE riders SET trust_score=67,state='TRUSTED' WHERE id='R-3091'")
        engine.init_database()
        with engine.db() as connection:
            rider = connection.execute("SELECT * FROM riders WHERE id='R-3091'").fetchone()
            payload = engine.rider_payload(connection, rider)
        self.assertEqual(rider["state"], "OBSERVING")
        self.assertEqual(payload["riskLevel"], "SUSPICIOUS")
        self.assertEqual(payload["automatedAction"], "INCREASE OBSERVATION")

    def test_passed_verification_reassesses_and_resolves(self):
        engine.process_event("R-1042", "account_sharing", "verify-one")
        flagged = engine.process_event("R-1042", "account_sharing", "verify-two")
        result = engine.complete_verification(flagged["challengeId"], "PASSED")
        self.assertEqual(result["action"], "RESOLVE_INCIDENT")
        self.assertGreaterEqual(result["trustScore"], 70)

    def test_failed_identity_verification_escalates_to_review(self):
        engine.process_event("R-4470", "account_sharing", "fail-one")
        flagged = engine.process_event("R-4470", "account_sharing", "fail-two")
        result = engine.complete_verification(flagged["challengeId"], "FAILED")
        self.assertEqual(result["state"], "HUMAN_REVIEW")
        self.assertEqual(result["action"], "ESCALATE_HUMAN_REVIEW")
        after_normal = engine.process_event("R-4470", "normal", "post-review-normal")
        self.assertEqual(after_normal["state"], "HUMAN_REVIEW")
        self.assertEqual(after_normal["action"], "AWAIT_HUMAN_REVIEW")

    def test_event_idempotency(self):
        first = engine.process_event("R-3091", "normal", "same-event")
        second = engine.process_event("R-3091", "normal", "same-event")
        self.assertEqual(first["riderId"], second["riderId"])
        with engine.db() as connection:
            count = connection.execute("SELECT COUNT(*) FROM activity_events WHERE event_key='same-event'").fetchone()[0]
        self.assertEqual(count, 1)

    def test_background_normal_activity_does_not_spam_the_activity_log(self):
        with engine.db() as connection:
            before = connection.execute("SELECT COUNT(*) FROM activity_events").fetchone()[0]
        engine.process_event("R-3091", "normal")
        with engine.db() as connection:
            after = connection.execute("SELECT COUNT(*) FROM activity_events").fetchone()[0]
        self.assertEqual(after, before)

    def test_face_match_result_is_persisted_without_raw_image(self):
        engine.process_event("R-1042", "account_sharing", "face-one")
        flagged = engine.process_event("R-1042", "account_sharing", "face-two")
        engine.complete_verification(
            flagged["challengeId"], "PASSED", "FACE_MATCH",
            {"matchDistance": 0.31, "movementChecks": ["blink", "left", "right"], "rawImage": "must-not-persist"},
        )
        with engine.db() as connection:
            challenge = connection.execute("SELECT * FROM verification_challenges WHERE id=?", (flagged["challengeId"],)).fetchone()
        self.assertEqual(challenge["method"], "FACE_MATCH")
        self.assertIn("matchDistance", challenge["result_metadata_json"])
        self.assertNotIn("rawImage", challenge["result_metadata_json"])

    def test_unified_rider_payload_exposes_required_state(self):
        with engine.db() as connection:
            rider = connection.execute("SELECT * FROM riders WHERE id='R-2187'").fetchone()
            payload = engine.rider_payload(connection, rider)
        for key in ["riderId", "trustStatus", "baselineProfile", "deviceInformation", "loginActivity", "behaviouralSignals", "faceVerificationStatus", "lastUpdated", "verificationRequired", "reviewStatus", "trustHistory", "handoffAssessment", "activeSessionCount"]:
            self.assertIn(key, payload)

    def test_trust_history_uses_recorded_decision_scores(self):
        engine.process_event("R-2187", "device_change", "history-device")
        engine.process_event("R-2187", "normal", "history-normal")
        with engine.db() as connection:
            rider = connection.execute("SELECT * FROM riders WHERE id='R-2187'").fetchone()
            payload = engine.rider_payload(connection, rider)
            recorded = connection.execute(
                "SELECT trust_score FROM decisions WHERE rider_id='R-2187' AND trust_score IS NOT NULL ORDER BY id"
            ).fetchall()
        self.assertEqual([item["score"] for item in payload["trustHistory"]], [row["trust_score"] for row in recorded][-7:])
        self.assertEqual(payload["trustHistory"][-1]["score"], payload["trustScore"])

    def test_monitoring_statistics_share_authoritative_rider_state(self):
        engine.process_event("R-3091", "device_change", "stats-device")
        data = engine.snapshot()
        expected_average = round(sum(rider["trustScore"] for rider in data["riders"]) / len(data["riders"]))
        expected_suspicious = sum(rider["riskLevel"] == "SUSPICIOUS" for rider in data["riders"])
        self.assertEqual(data["stats"]["averageTrust"], expected_average)
        self.assertEqual(data["stats"]["suspiciousRiders"], expected_suspicious)
        self.assertEqual(data["stats"]["elevatedRisk"], sum(rider["riskLevel"] != "TRUSTED" for rider in data["riders"]))
        self.assertIn("pendingVerifications", data["stats"])
        self.assertIn("escalatedIncidents", data["stats"])

    def test_orphaned_pending_challenge_is_not_counted_and_is_expired(self):
        response = engine.run_scenario(engine.ScenarioRequest(scenario="face_verification_required"))
        challenge_id = response["results"][-1]["challengeId"]
        with engine.db() as connection:
            connection.execute(
                "UPDATE riders SET pending_verification_id=NULL,verification_status='NOT_REQUIRED' WHERE id='R-5108'"
            )
        self.assertEqual(engine.snapshot()["stats"]["pendingVerifications"], 0)
        engine.init_database()
        with engine.db() as connection:
            challenge = connection.execute("SELECT * FROM verification_challenges WHERE id=?", (challenge_id,)).fetchone()
        self.assertEqual(challenge["status"], "EXPIRED")

    def test_review_resolution_expires_reverification_request(self):
        engine.run_scenario(engine.ScenarioRequest(scenario="suspected_account_sharing"))
        with engine.db() as connection:
            incident_id = connection.execute(
                "SELECT id FROM incidents WHERE rider_id='R-4470' AND status='HUMAN_REVIEW'"
            ).fetchone()["id"]
        engine.review(incident_id, engine.ReviewRequest(action="REQUEST_VERIFICATION_AGAIN"))
        engine.review(incident_id, engine.ReviewRequest(action="RESOLVE_CASE"))
        with engine.db() as connection:
            pending = connection.execute(
                "SELECT COUNT(*) FROM verification_challenges WHERE incident_id=? AND status='PENDING'",
                (incident_id,),
            ).fetchone()[0]
            rider = connection.execute("SELECT * FROM riders WHERE id='R-4470'").fetchone()
        self.assertEqual(pending, 0)
        self.assertIsNone(rider["pending_verification_id"])

    def test_activity_event_records_trust_and_verification_context(self):
        engine.process_event("R-1042", "account_sharing", "timeline-one")
        result = engine.process_event("R-1042", "account_sharing", "timeline-two")
        with engine.db() as connection:
            event = connection.execute("SELECT payload_json FROM activity_events WHERE event_key='timeline-two'").fetchone()
            challenges = connection.execute(
                "SELECT COUNT(*) FROM verification_challenges WHERE incident_id=? AND status='PENDING'",
                (result["incidentId"],),
            ).fetchone()[0]
        payload = engine.jload(event["payload_json"], {})
        self.assertEqual(payload["trustScore"], result["trustScore"])
        self.assertEqual(payload["verificationStatus"], "REQUESTED")
        self.assertEqual(challenges, 1)

    def test_face_verification_scenario_leaves_a_pending_challenge(self):
        response = engine.run_scenario(engine.ScenarioRequest(scenario="face_verification_required"))
        self.assertEqual(response["scenario"], "face_verification_required")
        self.assertTrue(response["results"][-1]["challengeId"])
        self.assertEqual(response["results"][-1]["state"], "VERIFICATION_REQUIRED")
        with engine.db() as connection:
            challenge = connection.execute(
                "SELECT * FROM verification_challenges WHERE id=?",
                (response["results"][-1]["challengeId"],),
            ).fetchone()
            rider = connection.execute("SELECT * FROM riders WHERE id='R-5108'").fetchone()
            payload = engine.rider_payload(connection, rider)
        self.assertEqual(challenge["status"], "PENDING")
        self.assertTrue(payload["verificationRequired"])
        self.assertEqual(payload["riskLevel"], "HIGH RISK")

    def test_account_sharing_scenario_escalates_to_review(self):
        response = engine.run_scenario(engine.ScenarioRequest(scenario="suspected_account_sharing"))
        self.assertEqual(response["results"][-1]["state"], "HUMAN_REVIEW")
        self.assertEqual(response["results"][-1]["action"], "ESCALATE_HUMAN_REVIEW")
        with engine.db() as connection:
            open_cases = connection.execute(
                "SELECT COUNT(*) FROM incidents WHERE rider_id='R-4470' AND status='HUMAN_REVIEW'"
            ).fetchone()[0]
        self.assertEqual(open_cases, 1)

    def test_demo_login_uses_hashed_password_and_backend_session(self):
        result = engine.login(engine.LoginRequest(
            identifier="demo@stillyou.dev", password="StillYou123!",
            device=engine.DeviceContext(device_id="test-browser", label="Test browser", browser_profile="Chrome test"),
        ))
        self.assertTrue(result["token"])
        self.assertEqual(result["rider"]["id"], "R-9001")
        self.assertEqual(result["rider"]["baselineMaturity"], "Baseline learning")
        self.assertFalse(result["rider"]["verificationRequired"])
        session = engine.session_from_authorization(f"Bearer {result['token']}")
        self.assertEqual(session["rider_id"], "R-9001")
        with engine.db() as connection:
            account = connection.execute("SELECT * FROM rider_accounts WHERE rider_id='R-9001'").fetchone()
        self.assertNotEqual(account["password_hash"], "StillYou123!")

    def test_driver_inputs_feed_the_shared_risk_pipeline(self):
        login = engine.login(engine.LoginRequest(
            identifier="R-9001", password="StillYou123!",
            device=engine.DeviceContext(device_id="primary-test", label="Primary test", browser_profile="Chrome test"),
        ))
        authorization = f"Bearer {login['token']}"
        engine.portal_action(engine.PortalActionRequest(action="SWITCH_DEVICE_PROFILE", device_profile="alternate"), authorization)
        engine.portal_action(engine.PortalActionRequest(
            action="UPDATE_LOCATION",
            location=engine.LocationContext(area="Mumbai · Andheri", source="DEMO"),
        ), authorization)
        result = engine.portal_action(engine.PortalActionRequest(action="CONCURRENT_SESSION"), authorization)
        self.assertTrue(result["rider"]["verificationRequired"])
        self.assertEqual(result["rider"]["state"], "VERIFICATION_REQUIRED")
        self.assertTrue(any(item["kind"] == "session" for item in result["activity"]))

    def test_registration_stores_hashed_credentials_and_private_reference_path(self):
        photo = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"0" * 1200).decode()
        result = engine.register(engine.RegistrationRequest(
            full_name="New Rider", contact="new@example.test", password="safe-password",
            primary_area="Set after location permission", preferred_hours="12:00–20:00", photo_data=photo,
            device=engine.DeviceContext(device_id="new-device", label="New browser", browser_profile="Chrome test"),
        ))
        self.assertTrue(result["rider"]["hasReferencePhoto"])
        with engine.db() as connection:
            account = connection.execute("SELECT * FROM rider_accounts WHERE contact='new@example.test'").fetchone()
        self.assertNotEqual(account["password_hash"], "safe-password")
        self.assertTrue(Path(account["profile_photo_path"]).exists())

    def test_delivery_actions_update_the_authoritative_rider_record(self):
        login = engine.login(engine.LoginRequest(
            identifier="R-9001", password="StillYou123!",
            device=engine.DeviceContext(device_id="delivery-test", label="Delivery test", browser_profile="Chrome test"),
        ))
        authorization = f"Bearer {login['token']}"
        engine.portal_action(engine.PortalActionRequest(action="GO_ONLINE"), authorization)
        engine.portal_action(engine.PortalActionRequest(action="ACCEPT_DELIVERY", order_id="ORD-4821"), authorization)
        engine.portal_action(engine.PortalActionRequest(action="PICKED_UP", order_id="ORD-4821"), authorization)
        result = engine.portal_action(engine.PortalActionRequest(action="COMPLETE_DELIVERY", order_id="ORD-4821"), authorization)
        self.assertEqual(result["rider"]["deliveriesAccepted"], 1)
        self.assertEqual(result["rider"]["deliveriesCompleted"], 1)
        self.assertTrue(any(item["kind"] == "delivery" for item in result["activity"]))

    def test_declining_delivery_is_persisted_for_the_current_session(self):
        login = engine.login(engine.LoginRequest(
            identifier="R-9001", password="StillYou123!",
            device=engine.DeviceContext(device_id="decline-test", label="Decline test", browser_profile="Chrome test"),
        ))
        authorization = f"Bearer {login['token']}"
        result = engine.portal_action(engine.PortalActionRequest(action="DECLINE_DELIVERY", order_id="ORD-4821"), authorization)
        self.assertNotIn("ORD-4821", [item["id"] for item in result["deliveries"]])
        self.assertTrue(any("declined" in item["message"] for item in result["activity"]))

    def test_demo_otp_is_fresh_expiring_and_validated(self):
        login = engine.login(engine.LoginRequest(
            identifier="R-9001", password="StillYou123!",
            device=engine.DeviceContext(device_id="otp-primary", label="OTP test", browser_profile="Chrome test"),
        ))
        authorization = f"Bearer {login['token']}"
        engine.portal_action(engine.PortalActionRequest(action="CONCURRENT_SESSION"), authorization)
        engine.portal_action(engine.PortalActionRequest(action="CONCURRENT_SESSION"), authorization)
        requested = engine.request_otp(authorization)
        self.assertEqual(len(requested["demoCode"]), 6)
        result = engine.verify_otp(engine.OtpVerifyRequest(challenge_id=requested["challengeId"], code=requested["demoCode"]), authorization)
        self.assertIn(result["result"], {"PASSED", "PASSED_LIMITED"})


if __name__ == "__main__":
    unittest.main()
