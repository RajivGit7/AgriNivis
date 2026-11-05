# AgriNivis

**AI-based crop disease detection and crop recommendation for smallholder farms.**

AgriNivis is a two-part agriculture platform:

1. **Crop disease detection** — upload or capture a crop leaf and a TensorFlow Lite model classifies one of 12 apple, rice, corn and grape diseases. The result includes confidence, top-three alternatives, symptoms, prevention and treatment guidance.
2. **Smart crop recommendation** — enter soil type, pH, moisture, previous crop, fertilizer practice, irrigation, season and location. A transparent scoring engine ranks 24 crops and adds local temperature and rainfall context from Open-Meteo.

The frontend is static and deploys to GitHub Pages. The ML model runs in a separate containerised Flask API, so the two halves can scale and deploy independently.

> AgriNivis is a screening and planning aid, not a laboratory diagnosis. Confirm disease and pesticide decisions with a qualified agronomist or your local extension service.

---

## Live demos

| Part | Host | URL |
| --- | --- | --- |
| Website | GitHub Pages | <https://rajivgit7.github.io/AgriNivis/> |
| Model API | Hugging Face Spaces / Render | Pending — set `API_BASE_URL` after deploying |

The URLs are configured in `web/assets/js/config.js` and can be overridden at runtime from **API settings** on the detection page.

---

## Features

- **12-class vision model** — Apple scab, Apple black rot, Cedar apple rust, Rice bacterial blight, Rice blast, Rice brown spot, Corn Cercospora leaf spot, Corn common rust, Corn northern leaf blight, Grape black rot, Grape Esca and Grape leaf blight.
- **Disease knowledge base** — pathogen, favourable conditions, symptoms, prevention, treatment, organic options and agronomist notes.
- **Confidence-aware results** — top-three predictions and a low-confidence warning below 60%.
- **24-crop recommender** — cereals, pulses, oilseeds, millets, fibre, vegetables, horticulture and plantation crops.
- **Explainable scoring** — season, soil, pH, irrigation, moisture, weather, rotation and nutrient balance, weighted to 100 points.
- **Live weather** — Open-Meteo geocoding and forecast; no API key required. Geolocation supported.
- **Mobile-first interface** — camera capture, drag-and-drop, clipboard paste, print/save report.
- **Static-first deployment** — no frontend build step; GitHub Pages workflow included.
- **Separate ML deployment** — Dockerfile for Hugging Face Spaces, Render or any container host.

---

## Project structure

```text
AGG/
├── final_model.tflite            # Original model (copied into ml-service)
├── ml-service/                   # Standalone inference API
│   ├── app.py                    # Flask app, preprocessing, prediction, CORS
│   ├── labels.json               # Canonical 12-class knowledge base
│   ├── final_model.tflite        # TensorFlow Lite model (2.5 MB)
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── test_local.py             # Smoke tests
│   └── README.md                 # API + Hugging Face deployment guide
├── web/                          # Static website (GitHub Pages artifact)
│   ├── index.html
│   ├── detect.html
│   ├── recommend.html
│   ├── about.html
│   ├── 404.html
│   ├── assets/
│   │   ├── css/styles.css
│   │   ├── js/config.js          # API URL and project links
│   │   ├── js/common.js
│   │   ├── js/detect.js
│   │   ├── js/crop-data.js       # 24-crop knowledge base
│   │   ├── js/recommend.js       # Scoring engine + weather
│   │   └── data/diseases.json    # Generated from labels.json
│   └── robots.txt
├── docs/
│   └── research-paper.md         # Working paper draft
├── scripts/
│   └── sync_data.py              # Regenerate static disease library
├── .github/workflows/deploy-pages.yml
├── render.yaml
└── README.md
```

---

## Quick start (local)

### 1. Run the model API

**Windows / macOS / Linux:**

```bash
cd ml-service
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
python app.py
```

The API starts at `http://127.0.0.1:7860`. Check:

```bash
curl http://127.0.0.1:7860/health
```

If `ai-edge-litert` has no wheel for your platform, install `tensorflow` instead. `app.py` falls back automatically.

### 2. Run the website

From the repository root:

```bash
python -m http.server 8000 --directory web
```

Open `http://127.0.0.1:8000`. On localhost the site automatically calls the API at `http://127.0.0.1:7860`.

### 3. Run the tests

```bash
cd ml-service
python test_local.py
```

---

## Model details

| Property | Value |
| --- | --- |
| Format | TensorFlow Lite |
| Size | ~2.5 MB |
| Input | `float32 [1, 224, 224, 3]`, RGB, scaled to `[0, 1]` |
| Output | `float32 [1, 12]` softmax |
| Runtime | `ai-edge-litert` (falls back to `tflite-runtime` or TensorFlow) |
| Hosting | Any Docker host, CPU only |

The label order is fixed:

```text
0  Apple scab
1  Apple Black rot
2  Cedar apple rust
3  Rice Bacterialblight
4  Rice Blast
5  Rice Brownspot
6  Corn Cercospora leaf spot
7  Corn Common rust
8  Corn Northern Leaf Blight
9  Grape Black rot
10 Grape Esca (Black Measles)
11 Grape Leaf blight (Isariopsis Leaf Spot)
```

If you retrain or replace the model, update `ml-service/labels.json` to match the new output order, then run:

```bash
python scripts/sync_data.py
```

---

## Deployment

### A. Deploy the ML model to Hugging Face Spaces (free CPU)

1. Create a Space at <https://huggingface.co/new-space>.
2. Select **Docker** → blank template → **CPU basic**.
3. Upload everything inside `ml-service/` to the Space repository. The YAML front matter in `ml-service/README.md` tells Spaces to use Docker and port `7860`.
4. Wait for the build. The public URL looks like:

   ```text
   https://<username>-agrinivis-ml.hf.space
   ```

5. Open that URL with `/health` to confirm `model_loaded: true`.

### B. Alternative: deploy the ML model to Render

Use the included `render.yaml`, or create a **Web Service → Docker**:

- Root directory: `ml-service`
- Health check path: `/health`
- Environment variable: `ALLOWED_ORIGINS=https://<username>.github.io`

### C. Deploy the website to GitHub Pages

1. Create a GitHub repository and push this project.
2. Open **Settings → Pages → Build and deployment** and select **GitHub Actions**.
3. The included workflow (`.github/workflows/deploy-pages.yml`) publishes the `web/` directory on every push to `main`.
4. Edit `web/assets/js/config.js`:

   ```js
   API_BASE_URL: "https://<username>-agrinivis-ml.hf.space",
   REPO_URL: "https://github.com/<username>/<repo>",
   ```

5. Commit and push. The site is available at `https://<username>.github.io/<repo>/`.

Users can also paste the API URL at runtime via **API settings** on the detection page; it is stored in `localStorage`. This is useful if you deploy the frontend before the API.

### D. GitHub Actions

The workflow:

- runs on pushes to `main` that touch `web/` or the workflow file;
- uploads `web/` as the Pages artifact;
- deploys with the official `actions/deploy-pages`.

No build step is required.

---

## Configuration

`web/assets/js/config.js`:

```js
window.AGRINIVIS_CONFIG = {
  API_BASE_URL: "https://YOUR-SPACE.hf.space",
  API_BASE_URL_LOCAL: "http://127.0.0.1:7860",
  REPO_URL: "https://github.com/RajivGit7/AgriNivis",
  RESEARCH_PAPER_URL: "...",
  LOW_CONFIDENCE_THRESHOLD: 60,
};
```

`ml-service` environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `7860` | HTTP port |
| `MODEL_PATH` | `final_model.tflite` | Path to the model |
| `LABELS_PATH` | `labels.json` | Path to the label file |
| `ALLOWED_ORIGINS` | `*` | Comma-separated CORS allow-list |
| `LOW_CONFIDENCE_THRESHOLD` | `0.60` | Low-confidence flag |
| `MAX_UPLOAD_BYTES` | `12582912` | 12 MB upload limit |

---

## API

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/` | Service metadata |
| `GET` | `/health` | Readiness and model details |
| `GET` | `/classes` | All classes with knowledge entries |
| `POST` | `/predict` | Image → prediction + guidance |

```bash
curl -X POST "http://127.0.0.1:7860/predict?top_k=3" \
  -F "image=@leaf.jpg"
```

```json
{
  "crop": "Rice",
  "disease": "Rice blast",
  "confidence": 96.42,
  "predictions": [
    { "label": "Rice Blast", "confidence": 96.42, "prevention": ["..."] }
  ],
  "low_confidence": false
}
```

See `ml-service/README.md` for the full response schema.

---

## Crop recommendation method

The recommender is a transparent knowledge-based engine, not a trained model. Every crop is scored out of 100:

| Criterion | Max |
| --- | ---: |
| Season | 22 |
| Soil type | 17 |
| Irrigation | 15 |
| pH | 13 |
| Weather / temperature | 10 |
| Rotation | 10 |
| Soil moisture | 8 |
| Nutrient balance | 5 |

Weather is fetched from Open-Meteo only after the user provides a location or grants geolocation permission. The crop knowledge base lives in `web/assets/js/crop-data.js`; the scoring logic is in `web/assets/js/recommend.js`.

The method section on `recommend.html` explains the rules and limitations in the interface.

---

## Research paper

A working draft is in [`docs/research-paper.md`](docs/research-paper.md). It covers the label taxonomy, transfer-learning pipeline, TFLite deployment, recommendation weights, system architecture, evaluation plan and responsible-use limits. Result tables are marked `TBD` until the final experimental run is complete.

To turn the draft into a submission:

1. Fill in the dataset provenance and per-class counts.
2. Run the held-out evaluation and populate Tables 1 and the ablation section.
3. Add the confusion matrix, calibration plot and latency measurements.
4. Have the disease guidance and crop ranges reviewed by an agronomist.
5. Add author affiliations and funding acknowledgements.

---

## Roadmap

- [ ] Complete held-out evaluation and publish the confusion matrix.
- [ ] Add field-condition images and open-set / unknown-disease detection.
- [ ] Calibrate confidence (temperature scaling or conformal prediction).
- [ ] Expand the class set beyond apple, rice, corn and grape.
- [ ] Add local-language interfaces and an offline-first PWA mode.
- [ ] Validate crop recommendations with agronomists and field trials.
- [ ] Add user feedback on each prediction for continuous improvement.

---

## Limitations

- The model is closed-set and can force an unknown disease into one of the 12 classes.
- Accuracy on curated images is not the same as accuracy in the field.
- Treatment guidance names active ingredients but does not provide dosage; always follow the label and local rules.
- The crop engine uses broad agronomic ranges and a short weather forecast, not a full seasonal climate or soil test.
- The interface is currently English-only.

---

## Contributing

Issues and pull requests are welcome, especially from agronomists who can review crop ranges and disease guidance. Please open an issue before a large change so the approach can be discussed.

---

## Licence

MIT. See [LICENSE](LICENSE). The model weights and any third-party dataset used for training may carry separate terms; document them before redistribution.

---

## Acknowledgements

- Plant-pathology knowledge compiled from public extension guidance and reviewed against the classes in the released model.
- Weather and geocoding by [Open-Meteo](https://open-meteo.com/).
- Built with TensorFlow, TensorFlow Lite, Flask, and plain HTML/CSS/JavaScript.
