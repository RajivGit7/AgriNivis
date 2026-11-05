"""Smoke tests for the AgriNivis inference service (run from ml-service/)."""

import io
import json
import unittest

from PIL import Image

from app import app


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_health(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["model_loaded"])
        self.assertGreaterEqual(payload["classes"], 1)

    def test_classes(self):
        response = self.client.get("/classes")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["count"], 12)
        self.assertEqual(payload["classes"][0]["label"], "Apple scab")

    def test_predict_multipart(self):
        buffer = io.BytesIO()
        Image.new("RGB", (320, 240), (60, 140, 70)).save(buffer, format="JPEG")
        buffer.seek(0)
        response = self.client.post(
            "/predict?top_k=3",
            data={"image": (buffer, "leaf.jpg")},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 200, response.get_data(as_text=True))
        payload = response.get_json()
        self.assertIn("predictions", payload)
        self.assertEqual(len(payload["predictions"]), 3)
        self.assertIn("prevention", payload["predictions"][0])

    def test_predict_json_base64(self):
        import base64

        buffer = io.BytesIO()
        Image.new("RGB", (224, 224), (30, 90, 30)).save(buffer, format="PNG")
        encoded = base64.b64encode(buffer.getvalue()).decode()
        response = self.client.post("/predict", json={"image": f"data:image/png;base64,{encoded}"})
        self.assertEqual(response.status_code, 200, response.get_data(as_text=True))
        self.assertTrue(0 <= response.get_json()["confidence"] <= 100)

    def test_missing_image(self):
        response = self.client.post("/predict", json={})
        self.assertEqual(response.status_code, 400)


if __name__ == "__main__":
    unittest.main(verbosity=2)
