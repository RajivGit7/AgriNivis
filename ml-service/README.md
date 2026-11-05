---
title: AgriNivis Crop Disease API
emoji: 🌿
colorFrom: green
colorTo: yellow
sdk: docker
pinned: false
app_port: 7860
---

# AgriNivis Crop Disease API

A standalone Flask service that runs the `final_model.tflite` (224×224 RGB,
12-class softmax) model and enriches each prediction with agronomic guidance.

Deployed apart from the website so the GitHub Pages site stays static.

## Endpoints

| Method | Path       | Description                                   |
| ------ | ---------- | --------------------------------------------- |
| GET    | `/`        | Service metadata                              |
| GET    | `/health`  | Readiness + model metadata                    |
| GET    | `/classes` | All 12 classes with disease knowledge         |
| POST   | `/predict` | Image → disease prediction + treatment advice |

### Predict

Multipart:

```bash
curl -X POST "https://YOUR-SPACE.hf.space/predict?top_k=3" \
  -F "image=@leaf.jpg"
```

JSON base64:

```bash
curl -X POST "https://YOUR-SPACE.hf.space/predict" \
  -H "Content-Type: application/json" \
  -d '{"image":"data:image/jpeg;base64,...."}'
```

Response (abridged):

```json
{
  "crop": "Rice",
  "disease": "Rice blast",
  "confidence": 96.42,
  "raw_class": "Rice Blast",
  "severity": "high",
  "low_confidence": false,
  "predictions": [
    {
      "label": "Rice Blast",
      "confidence": 96.42,
      "cause": "...",
      "symptoms": ["..."],
      "prevention": ["..."],
      "treatment": ["..."],
      "organic_options": ["..."]
    }
  ],
  "disclaimer": "..."
}
```

## Run locally

```bash
cd ml-service
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
python app.py                   # http://127.0.0.1:7860
```

On Windows without a prebuilt `ai-edge-litert` wheel, install `tensorflow`
instead; `app.py` automatically falls back to `tensorflow.lite`.

## Test

```bash
python test_local.py
```

## Deploy to Hugging Face Spaces (free CPU)

1. Create a new Space at <https://huggingface.co/new-space>.
2. Choose **Docker** → blank template → CPU basic.
3. Upload the contents of `ml-service/` (or connect the GitHub repo and set
   the Docker context to `ml-service`).
4. Wait for the build, then copy the Space URL, e.g.
   `https://username-agrinivis-ml.hf.space`.
5. Paste that URL into `web/assets/js/config.js` (or use the “API settings”
   button on the detection page).

The YAML front matter at the top of this file is read by Hugging Face Spaces.

## Deploy to Render

Use the repository `render.yaml`, or create a Docker web service with:

- Root directory: `ml-service`
- Health check path: `/health`
- Environment: `ALLOWED_ORIGINS=https://<your-github-username>.github.io`

Set `ALLOWED_ORIGINS` to your GitHub Pages origin in production. `*` is the
default and is convenient for local development.

## Notes

- The model input is `float32 [1, 224, 224, 3]` in RGB, scaled to `[0, 1]`.
- Images are EXIF-rotated and bilinearly resized.
- `low_confidence` is flagged below 60% by default (`LOW_CONFIDENCE_THRESHOLD`).
- This API is a screening aid, not a substitute for laboratory diagnosis.
