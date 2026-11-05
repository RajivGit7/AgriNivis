"""AgriNivis crop-disease inference API.

This service is intentionally small so it can be deployed on its own
(Hugging Face Spaces, Render, Railway, a VM or Docker) while the website
stays a static site on GitHub Pages.
"""

from __future__ import annotations

import base64
import io
import json
import logging
import os
from pathlib import Path

import numpy as np
from flask import Flask, jsonify, request
from PIL import Image, ImageOps, UnidentifiedImageError

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = Path(os.getenv("MODEL_PATH", BASE_DIR / "final_model.tflite"))
LABELS_PATH = Path(os.getenv("LABELS_PATH", BASE_DIR / "labels.json"))
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", 12 * 1024 * 1024))
LOW_CONFIDENCE_THRESHOLD = float(os.getenv("LOW_CONFIDENCE_THRESHOLD", "0.60"))
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").strip()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("agrinivis-api")

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES

with LABELS_PATH.open("r", encoding="utf-8") as fh:
    LABEL_DATA = json.load(fh)

CLASSES = sorted(LABEL_DATA["classes"], key=lambda item: item["index"])
MODEL_META = LABEL_DATA.get("model", {})

interpreter = None
input_details = None
output_details = None
load_error = None


def _create_interpreter(path: Path):
    """Try the lean runtimes first, fall back to full TensorFlow."""
    try:
        from ai_edge_litert.interpreter import Interpreter  # type: ignore

        return Interpreter(model_path=str(path))
    except Exception:
        pass
    try:
        import tflite_runtime.interpreter as tflite  # type: ignore

        return tflite.Interpreter(model_path=str(path))
    except Exception:
        pass
    import tensorflow as tf  # type: ignore

    return tf.lite.Interpreter(model_path=str(path))


def load_model() -> None:
    global interpreter, input_details, output_details, load_error
    if not MODEL_PATH.exists():
        load_error = f"Model file not found: {MODEL_PATH}"
        log.error(load_error)
        return
    try:
        interpreter = _create_interpreter(MODEL_PATH)
        interpreter.allocate_tensors()
        input_details = interpreter.get_input_details()[0]
        output_details = interpreter.get_output_details()[0]

        classes = int(np.prod(output_details["shape"]))
        if classes != len(CLASSES):
            log.warning(
                "Model outputs %s classes but labels.json defines %s classes",
                classes,
                len(CLASSES),
            )

        # Warm up so the first user request is not penalised.
        warmup = np.zeros(input_details["shape"], dtype=input_details["dtype"])
        interpreter.set_tensor(input_details["index"], warmup)
        interpreter.invoke()
        _ = interpreter.get_tensor(output_details["index"])

        load_error = None
        log.info(
            "Model loaded: input=%s dtype=%s output=%s classes=%s",
            tuple(input_details["shape"]),
            input_details["dtype"].__name__,
            tuple(output_details["shape"]),
            classes,
        )
    except Exception as exc:  # pragma: no cover - startup diagnostics
        interpreter = None
        load_error = f"Failed to load model: {exc}"
        log.exception(load_error)


def _preprocess(image_bytes: bytes) -> np.ndarray:
    if interpreter is None:
        raise RuntimeError(load_error or "Model is not loaded")

    img = Image.open(io.BytesIO(image_bytes))
    img = ImageOps.exif_transpose(img).convert("RGB")

    height = int(input_details["shape"][1])
    width = int(input_details["shape"][2])
    img = img.resize((width, height), Image.Resampling.BILINEAR)

    arr = np.asarray(img)
    if input_details["dtype"] == np.uint8:
        input_data = arr.astype(np.uint8)
    elif input_details["dtype"] == np.int8:
        scale, zero_point = input_details["quantization"]
        input_data = (arr.astype(np.float32) / 255.0 / scale + zero_point).astype(np.int8)
    else:
        input_data = arr.astype(np.float32) / 255.0

    return np.expand_dims(input_data, axis=0)


def _infer(input_data: np.ndarray) -> np.ndarray:
    interpreter.set_tensor(input_details["index"], input_data)
    interpreter.invoke()
    output = interpreter.get_tensor(output_details["index"])[0]

    output = output.astype(np.float64)
    if output.min() < 0 or not np.isclose(output.sum(), 1.0, atol=1e-3):
        exp = np.exp(output - np.max(output))
        output = exp / exp.sum()
    return output


def _pick_top_k(probs: np.ndarray, k: int) -> list[dict]:
    k = max(1, min(k, len(CLASSES), probs.shape[0]))
    order = np.argsort(probs)[::-1][:k]
    results = []
    for idx in order:
        idx = int(idx)
        item = CLASSES[idx] if idx < len(CLASSES) else {}
        results.append(
            {
                "index": idx,
                "label": item.get("label", f"Class {idx}"),
                "crop": item.get("crop", ""),
                "disease": item.get("disease", item.get("label", "")),
                "slug": item.get("slug", ""),
                "confidence": round(float(probs[idx]) * 100, 2),
                "severity": item.get("severity", "unknown"),
                "pathogen": item.get("pathogen", ""),
                "cause": item.get("cause", ""),
                "favorable_conditions": item.get("favorable_conditions", ""),
                "symptoms": item.get("symptoms", []),
                "prevention": item.get("prevention", []),
                "treatment": item.get("treatment", []),
                "organic_options": item.get("organic_options", []),
                "expert_note": item.get("expert_note", ""),
            }
        )
    return results


def _extract_image_bytes():
    if request.content_type and "application/json" in request.content_type:
        payload = request.get_json(silent=True) or {}
        raw = payload.get("image") or payload.get("image_base64")
        if not raw or not isinstance(raw, str):
            raise ValueError("JSON body must contain an 'image' data-URI or base64 string")
        if "," in raw:
            raw = raw.split(",", 1)[1]
        try:
            return base64.b64decode(raw, validate=False)
        except Exception as exc:
            raise ValueError(f"Invalid base64 image: {exc}") from exc

    if "image" in request.files:
        uploaded = request.files["image"]
        if uploaded.filename == "":
            raise ValueError("Uploaded file has no filename")
        return uploaded.read()

    if request.files:
        return next(iter(request.files.values())).read()

    if request.data:
        return request.data

    raise ValueError("No image supplied. Send multipart 'image' or JSON base64.")


@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin", "*")
    if ALLOWED_ORIGINS == "*":
        response.headers["Access-Control-Allow-Origin"] = "*"
    else:
        allowed = [o.strip() for o in ALLOWED_ORIGINS.split(",") if o.strip()]
        response.headers["Access-Control-Allow-Origin"] = origin if origin in allowed else allowed[0]
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Accept"
    response.headers["Access-Control-Max-Age"] = "86400"
    response.headers["Vary"] = "Origin"
    return response


@app.route("/", methods=["GET"])
def root():
    return jsonify(
        {
            "name": "AgriNivis Crop Disease API",
            "version": MODEL_META.get("version", "1.0.0"),
            "status": "ok" if interpreter is not None else "model unavailable",
            "endpoints": {
                "health": "/health",
                "classes": "/classes",
                "predict": "POST /predict",
            },
            "docs": "Send an image as multipart/form-data field 'image' or JSON {image: dataURI}.",
        }
    )


@app.route("/health", methods=["GET"])
def health():
    return (
        jsonify(
            {
                "status": "ok" if interpreter is not None else "error",
                "model_loaded": interpreter is not None,
                "model_path": str(MODEL_PATH),
                "classes": len(CLASSES),
                "input": {
                    "shape": [int(dim) for dim in input_details["shape"]]
                    if input_details is not None
                    else None,
                    "dtype": input_details["dtype"].__name__ if input_details is not None else None,
                },
                "version": MODEL_META.get("version", "1.0.0"),
                "error": load_error,
            }
        ),
        200 if interpreter is not None else 503,
    )


@app.route("/classes", methods=["GET"])
def classes():
    return jsonify({"count": len(CLASSES), "model": MODEL_META, "classes": CLASSES})


@app.route("/predict", methods=["POST", "OPTIONS"])
def predict():
    if request.method == "OPTIONS":
        return ("", 204)
    if interpreter is None:
        return jsonify({"error": load_error or "Model is not loaded"}), 503

    try:
        image_bytes = _extract_image_bytes()
        if not image_bytes:
            raise ValueError("Empty image payload")
        if len(image_bytes) > MAX_UPLOAD_BYTES:
            return jsonify({"error": "Image is too large (max 12 MB)"}), 413

        top_k = request.args.get("top_k", 3, type=int)
        input_data = _preprocess(image_bytes)
        probs = _infer(input_data)
        predictions = _pick_top_k(probs, top_k)
        best = predictions[0]

        return jsonify(
            {
                "crop": best["crop"],
                "disease": best["disease"],
                "confidence": best["confidence"],
                "raw_class": best["label"],
                "severity": best["severity"],
                "low_confidence": best["confidence"] < LOW_CONFIDENCE_THRESHOLD * 100,
                "predictions": predictions,
                "model": {
                    "name": MODEL_META.get("name", "AgriNivis classifier"),
                    "version": MODEL_META.get("version", "1.0.0"),
                },
                "disclaimer": (
                    "AgriNivis is an AI screening aid. Confirm diagnosis and pesticide use "
                    "with a qualified agronomist or your local extension service."
                ),
            }
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except UnidentifiedImageError:
        return jsonify({"error": "The uploaded file could not be read as an image."}), 400
    except Exception as exc:
        log.exception("Prediction failed")
        return jsonify({"error": f"Prediction failed: {exc}"}), 500


@app.errorhandler(413)
def too_large(_error):
    return jsonify({"error": "Image is too large (max 12 MB)"}), 413


load_model()

if __name__ == "__main__":
    port = int(os.getenv("PORT", "7860"))
    app.run(host="0.0.0.0", port=port, debug=False)
