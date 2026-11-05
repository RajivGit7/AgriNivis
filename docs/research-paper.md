# AgriNivis: A Lightweight Crop Disease Classifier and Explainable Crop Recommendation Platform for Smallholder Farmers

**Authors:** [Author names and affiliations]
**Corresponding author:** [email]
**Status:** Working draft — evaluation tables and final dataset counts must be completed before submission.

---

## Abstract

Crop losses caused by disease and poor crop–environment matching remain significant for smallholder farmers, particularly where extension services are stretched and reliable agronomic advice is not available at the moment of decision. This paper presents AgriNivis, a two-part decision-support platform. The first component is a compact convolutional neural network, exported to TensorFlow Lite, that classifies 12 diseases affecting apple, rice, corn and grape leaves from a single photograph. Predictions are returned with a confidence score, top-three alternatives and a curated knowledge entry describing the pathogen, favourable conditions, symptoms, preventive measures and treatment options. The second component is a transparent, knowledge-based crop recommendation engine that scores 24 crops against farmer-reported soil type, pH, moisture, previous crop, fertilizer practice, irrigation availability and season, augmented with local temperature and rainfall from a public weather API. The system is deployed as two independent services: a static website suitable for GitHub Pages and a containerised Flask inference API. We describe the dataset construction, transfer-learning and conversion pipeline, the weighted recommendation model, the deployment architecture and an evaluation plan. The work contributes a reproducible, low-cost template for combining a trained vision model with an explainable agronomic decision layer. Final accuracy, per-class F1 and latency results will be reported from the completed experimental run.

**Keywords:** crop disease detection, transfer learning, TensorFlow Lite, crop recommendation, explainable AI, agricultural decision support, edge inference

---

## 1. Introduction

Plant disease is a persistent constraint on food production. Symptoms such as leaf spots, blights, rusts and wilts are visible in the field, but recognising the cause requires experience. A farmer who misidentifies a fungal infection may apply the wrong product, delay treatment or spray unnecessarily. At the same time, planting decisions are often made without a structured comparison of soil, water and seasonal suitability. The two problems are linked by a common constraint: timely, local, actionable information.

Deep learning has made image-based plant disease recognition practical. Public benchmark datasets and transfer learning allow a small team to train a classifier on a modest GPU budget. However, a classifier label alone is not a decision. A useful system must also communicate uncertainty, explain what the label means and connect it to safe, locally appropriate action. On the planning side, many published crop-recommendation models use a narrow feature set (nitrogen, phosphorus, potassium, temperature, humidity, pH and rainfall), while the variables farmers can actually report — previous crop, irrigation reliability and soil type — are often omitted. A rule-based, auditable model can fill that gap without pretending to be a trained predictor.

AgriNivis is designed around these constraints. Its contributions are:

1. A 12-class leaf-disease classifier trained with transfer learning and deployed as a 2.5 MB TensorFlow Lite model behind a stateless inference API.
2. A disease knowledge layer that turns each class probability into an explanation, prevention checklist and treatment summary while explicitly avoiding dosage advice.
3. An explainable, browser-side crop recommendation engine covering 24 crops and eight weighted criteria, with live weather context from Open-Meteo.
4. A two-service deployment architecture that separates the model service from a static GitHub Pages frontend, making the system cheap to host and easy to reproduce.
5. A research and engineering protocol, including an evaluation plan, responsible-use limits and an open deployment recipe.

The remainder of the paper is organised as follows. Section 2 reviews related work. Section 3 describes the dataset and label taxonomy. Section 4 presents the disease model and recommendation methodology. Section 5 describes the system architecture. Section 6 defines the evaluation protocol and placeholders for results. Section 7 discusses limitations and ethics, and Section 8 concludes.

---

## 2. Related Work

### 2.1 Image-based plant disease recognition

Hughes and Salathé introduced PlantVillage, a large, openly available collection of labelled plant leaf images that became a standard benchmark for plant disease classification [1]. Mohanty et al. evaluated deep learning on PlantVillage and reported high accuracy under controlled conditions, while also warning that performance falls on images taken in real field conditions [2]. Subsequent work has explored field-image datasets, background removal, segmentation, multi-crop models and mobile deployment.

Transfer learning is the dominant strategy for small agricultural datasets. A backbone pretrained on ImageNet is fine-tuned on crop images, reducing the labelled data requirement and training time. MobileNetV2 provides an efficient inverted-residual architecture designed for mobile and embedded vision [3]. TensorFlow Lite further reduces model size and enables CPU inference on inexpensive hardware [4].

### 2.2 Crop recommendation

Crop recommendation is often framed as a supervised classification problem using soil nutrients and climate variables. Random forests, support vector machines, decision trees and neural networks are common. Such models can achieve high accuracy on the dataset they are trained on, but their inputs are usually limited to laboratory soil measurements and weather variables. They do not capture farmer-reported constraints such as irrigation reliability, previous crop or soil texture, and their recommendations can be difficult to explain.

Rule-based and knowledge-based systems offer complementary strengths: transparency, auditability and the ability to encode rotation and water constraints directly. AgriNivis therefore uses a trained model for perception (disease recognition) and a rule-based model for planning (crop suitability). The design is deliberate: the recommendation engine is not presented as a learned predictor, and every point in the score can be traced to a stated criterion.

### 2.3 Deployment and responsible AI

Agricultural AI systems are increasingly expected to run in low-bandwidth settings and to communicate uncertainty. A cloud API can serve a larger model, but it introduces connectivity and privacy costs. A static web frontend plus a small container API is a pragmatic compromise: the interface loads quickly, the image is sent only on explicit user action, and the model can be replaced without rebuilding the site. Responsible deployment also requires clear limits: a 12-class model cannot diagnose an unknown disease, and treatment guidance must not substitute for a label, a plant clinic or local regulation.

---

## 3. Dataset and Label Taxonomy

### 3.1 Class set

The classifier predicts exactly 12 classes spanning four crops. The label order used at training and inference time is fixed and must not be reordered without retraining or remapping.

| Index | Raw class label | Crop | Disease | Severity |
| ---: | --- | --- | --- | --- |
| 0 | Apple scab | Apple | Apple scab | Moderate |
| 1 | Apple Black rot | Apple | Apple black rot | High |
| 2 | Cedar apple rust | Apple | Cedar apple rust | Moderate |
| 3 | Rice Bacterialblight | Rice | Bacterial blight | High |
| 4 | Rice Blast | Rice | Rice blast | High |
| 5 | Rice Brownspot | Rice | Brown spot | Moderate |
| 6 | Corn Cercospora leaf spot | Corn | Cercospora leaf spot | Moderate |
| 7 | Corn Common rust | Corn | Common rust | Moderate |
| 8 | Corn Northern Leaf Blight | Corn | Northern leaf blight | High |
| 9 | Grape Black rot | Grape | Black rot | High |
| 10 | Grape Esca (Black Measles) | Grape | Esca (black measles) | High |
| 11 | Grape Leaf blight (Isariopsis Leaf Spot) | Grape | Leaf blight (Isariopsis leaf spot) | Moderate |

### 3.2 Collection and preprocessing

**[TODO — complete before submission]** Describe the source of each class: field collection sites, public datasets used, dates, devices, number of original images and licence. State how duplicates, near-duplicates and background leakage were removed. Report the number of images per class after cleaning.

The current preprocessing pipeline is:

1. Decode the image and apply EXIF orientation.
2. Convert to RGB.
3. Resize bilinearly to 224 × 224 pixels.
4. Scale pixel values to the range [0, 1] as `float32`.
5. Pass a tensor of shape `[1, 224, 224, 3]` to the model.

**[TODO]** State the train/validation/test split (stratified by class) and the augmentation policy. Report whether the split was made at the image level or at the field/plant level; the latter is preferable to avoid optimistic leakage.

### 3.3 Knowledge entries

Each class is linked to an expert-reviewed entry containing the pathogen, favourable conditions, symptoms, prevention, treatment options, organic alternatives and an agronomist note. The entries are stored in `ml-service/labels.json` and mirrored to the static site by `scripts/sync_data.py`. Treatment text names active ingredients or practices but deliberately omits dosage and application intervals, which depend on the product formulation, crop stage and local regulation.

---

## 4. Methodology

### 4.1 Disease classifier

The model uses a compact convolutional backbone with transfer learning. The exact training configuration used for the released checkpoint should be recorded in the repository's experiment log. The expected configuration is:

- Backbone initialised with ImageNet weights.
- Input resolution 224 × 224 × 3.
- Global average pooling followed by a dropout layer and a 12-unit softmax classifier.
- Categorical cross-entropy loss with class weighting if the class distribution is imbalanced.
- Adam or AdamW optimisation with a reduced learning rate for fine-tuning.
- Early stopping on validation loss, with model checkpoint restoration.
- Optional mixed-precision training on GPU.

The trained Keras model is converted to TensorFlow Lite. The released model has a `float32` input and a `float32` 12-way softmax output; its file size is approximately 2.5 MB. The service also supports `uint8` or `int8` quantised inputs if a future model is exported with quantisation. Inference applies a softmax fallback when the output does not sum to one, protecting the API against a model exported with logits.

**Uncertainty reporting.** The API returns the top three class probabilities. A prediction below a configurable threshold (default 60%) is flagged as low confidence. The interface displays the flag and recommends a new photo or expert confirmation. This does not constitute calibrated uncertainty; temperature scaling or conformal prediction is left for future work.

### 4.2 Crop recommendation engine

The recommender scores 24 crops against eight criteria. Each criterion contributes a maximum number of points, summing to 100:

| Criterion | Max points | Rule |
| --- | ---: | --- |
| Season | 22 | Full points if the crop belongs to the selected season; partial for year-round crops; zero otherwise. |
| Soil type | 17 | Full points if the reported soil is in the crop's suitable set. |
| Soil pH | 13 | Full points inside the preferred range, then linear decay with distance; zero beyond a tolerance. |
| Irrigation | 15 | Compares the farmer's water availability rank (rainfed, limited, moderate, assured) with the crop's accepted ranks. |
| Soil moisture | 8 | Full, partial or zero based on proximity of reported moisture to the crop's preference. |
| Weather / temperature | 10 | Full if the local forecast average temperature lies inside the crop's range; linear penalty outside. Neutral when weather is unavailable. |
| Rotation | 10 | Full for a compatible previous crop or fallow; penalty for the same crop or a known poor rotation. |
| Nutrient balance | 5 | Matches crop nutrient demand (low, medium, high) with the reported fertilizer practice. |

The engine is deterministic and runs in the browser. It returns the top six crops, each with a score, positive reasons, warnings and field notes. Weather context is fetched from Open-Meteo using latitude and longitude; no API key is required. The forecast average temperature over seven days and the seven-day rainfall total are used. Rainfall is displayed as context and is not converted into a seasonal water balance, because a short forecast cannot represent the full crop season.

**[TODO]** Report the agronomic sources used to set each crop's ranges. Consider an expert review with at least two agronomists and report inter-rater agreement on a sample of 30 scenarios.

### 4.3 Explanation design

For a disease prediction, the interface explains:

- the top class and its probability;
- the top three alternatives;
- the pathogen and favourable conditions;
- symptoms the farmer can verify;
- preventive actions and treatment options;
- a reminder that the output is a screening result.

For a crop recommendation, the interface explains:

- the numeric score and a qualitative fit band;
- the criteria that added points;
- the criteria that caused concern;
- duration, water need, nutrient demand, temperature and rainfall ranges;
- common growing states and an agronomy tip.

---

## 5. System Architecture

AgriNivis separates the presentation layer from the model service.

```text
Farmer / browser
      |
      |  static HTML, CSS, JS
      v
GitHub Pages (web/)
      |
      |  fetch /health, POST /predict (base64 image)
      v
Containerised Flask API (ml-service/)
      |
      |  TensorFlow Lite interpreter
      v
final_model.tflite + labels.json
```

```text
Farmer / browser
      |
      |  crop form + optional geolocation
      v
Crop engine (JavaScript, 24 crops, weighted rules)
      |
      +--> Open-Meteo geocoding + forecast (HTTPS, no key)
```

### 5.1 Inference service

The service is a Flask application with four endpoints: `/`, `/health`, `/classes` and `/predict`. It accepts either `multipart/form-data` with an `image` field or JSON with a base64 data URI. Images are limited to 12 MB. CORS origins are configurable through `ALLOWED_ORIGINS`. A single Gunicorn worker is used in the reference Docker image so the model is loaded once; threads handle concurrent requests. The service is stateless and does not persist images.

### 5.2 Static frontend

The website is plain HTML, CSS and JavaScript, with no build step. It is therefore deployable directly from the `web/` directory to GitHub Pages. The disease library is also available as static JSON, so browsing the knowledge base does not require the API. The API base URL can be set in `web/assets/js/config.js` or overridden at runtime and stored in `localStorage`.

### 5.3 Reproducibility

The repository contains the model, label file, inference code, frontend, Dockerfile, GitHub Pages workflow and this paper. The recommended reproduction sequence is:

1. Place the trained `final_model.tflite` and matching `labels.json` in `ml-service/`.
2. Run `python scripts/sync_data.py` to regenerate the static disease library.
3. Build and run the Docker image, or run `python app.py` locally.
4. Serve `web/` with any static server and set the API URL.
5. Run `python ml-service/test_local.py` to verify the endpoints.

---

## 6. Evaluation Plan and Results

### 6.1 Classifier metrics

The following metrics should be reported on a held-out test set that was not used for training or model selection:

- overall accuracy with a 95% confidence interval;
- macro-averaged precision, recall and F1;
- per-class precision, recall and F1;
- confusion matrix;
- top-3 accuracy;
- expected calibration error and a reliability diagram;
- inference latency on CPU for a single 224 × 224 image (median and 95th percentile);
- model size before and after TFLite conversion.

**Table 1. Per-class results.** [TODO]

| Class | Precision | Recall | F1 | Support |
| --- | ---: | ---: | ---: | ---: |
| Apple scab | TBD | TBD | TBD | TBD |
| Apple black rot | TBD | TBD | TBD | TBD |
| Cedar apple rust | TBD | TBD | TBD | TBD |
| Rice bacterial blight | TBD | TBD | TBD | TBD |
| Rice blast | TBD | TBD | TBD | TBD |
| Rice brown spot | TBD | TBD | TBD | TBD |
| Corn Cercospora leaf spot | TBD | TBD | TBD | TBD |
| Corn common rust | TBD | TBD | TBD | TBD |
| Corn northern leaf blight | TBD | TBD | TBD | TBD |
| Grape black rot | TBD | TBD | TBD | TBD |
| Grape Esca | TBD | TBD | TBD | TBD |
| Grape leaf blight | TBD | TBD | TBD | TBD |
| **Macro average** | TBD | TBD | TBD | TBD |

### 6.2 Ablations

Report at least:

1. Backbone comparison (for example, MobileNetV2 versus EfficientNet-Lite or ResNet-50).
2. Training from scratch versus transfer learning.
3. With and without augmentation.
4. Float32 versus quantised TFLite, including the accuracy–size–latency trade-off.
5. Field-condition images versus curated/studio images.

### 6.3 Recommendation evaluation

Because the recommender is rule-based, evaluation should focus on agreement with expert judgement rather than conventional ML accuracy. A proposed protocol is:

- Construct 30–50 realistic farm scenarios spanning soil types, seasons, water availability and previous crops.
- Ask two independent agronomists to rank the top five crops for each scenario.
- Report top-1 and top-3 overlap between the engine and expert consensus.
- Report cases where the engine's warnings correctly identified a limiting factor.
- Conduct a sensitivity analysis of the weights (season, soil, water, pH) and report whether the top three crops change.

### 6.4 Usability

Report a small usability study with farmers or agriculture students: task completion for uploading a leaf, understanding the confidence value, and interpreting the recommendation reasons. Include time on task and a short satisfaction score.

---

## 7. Discussion, Limitations and Ethics

**Unknown classes.** The model is closed-set. A leaf with a disease outside the 12 classes will still receive a probability distribution. The low-confidence flag mitigates but does not solve this. Future work should include an out-of-distribution detector or an "unknown" class trained with open-set methods.

**Dataset bias.** Leaf images collected in one region or season may not generalise to another. Background, lighting, camera and post-harvest handling can dominate the signal if the dataset is not curated. Field-level splits and external validation are essential.

**Image privacy.** The reference service does not persist uploaded images. A fork may add logging; deployers must disclose this and obtain consent where required.

**Treatment safety.** The knowledge base names active ingredients and non-chemical practices but not doses. Pesticide choice depends on the crop, target pathogen, formulation, resistance status and local registration. The user must read the label and consult an extension officer.

**Recommendation limits.** The engine does not know variety, seed quality, soil test values, labour, market price or pest history. It is a shortlisting tool, not a planting guarantee. Short forecasts are not seasonal climate predictions.

**Language and access.** The current interface is English-only and requires a browser with JavaScript. Local-language support, offline packaging and a low-literacy mode are important future work.

**No claim of field-proven yield impact.** This work reports a system design and an evaluation plan. Claims about yield or income improvement require a controlled field study and are outside the scope of the current draft.

---

## 8. Conclusion and Future Work

AgriNivis demonstrates how a compact, separately deployed vision model can be combined with a transparent crop-planning engine on a static website. The system is inexpensive to host, explainable at the point of use and reproducible from the repository. The next steps are to complete the held-out evaluation, add field-condition images, calibrate confidence, expand the class list to additional crops and diseases, localise the interface, and validate the recommendations with agronomists and farmers. A future version will also explore offline on-device inference in the browser and an open-set "unknown disease" pathway.

---

## References

[1] Hughes, D. P., and Salathé, M. (2015). An open access repository of images on plant health to enable the development of mobile disease diagnostics. *arXiv:1511.08060*.

[2] Mohanty, S. P., Hughes, D. P., and Salathé, M. (2016). Using deep learning for image-based plant disease detection. *Frontiers in Plant Science*, 7, 1419.

[3] Sandler, M., Howard, A., Zhu, M., Zhmoginov, A., and Chen, L.-C. (2018). MobileNetV2: Inverted residuals and linear bottlenecks. *Proceedings of the IEEE Conference on Computer Vision and Pattern Recognition (CVPR)*, 4510–4520.

[4] David, R., Duke, J., Jain, A., Janapa Reddi, V., Jeffries, N., Li, J., et al. (2020). TensorFlow Lite Micro: Embedded machine learning for TinyML systems. *Proceedings of Machine Learning and Systems (MLSys)*.

[5] Ferrucci, F., et al. (2020). **[TODO — add a recent crop-recommendation reference used in your literature review.]**

[6] Open-Meteo. (2026). Free weather forecast and geocoding APIs. <https://open-meteo.com/>

---

## Appendix A. API Contract

```http
POST /predict
Content-Type: multipart/form-data

image=<file>
```

```json
{
  "crop": "Rice",
  "disease": "Rice blast",
  "confidence": 96.42,
  "predictions": [
    {
      "label": "Rice Blast",
      "crop": "Rice",
      "disease": "Rice blast",
      "confidence": 96.42,
      "severity": "high",
      "pathogen": "Magnaporthe oryzae (fungus)",
      "symptoms": ["..."],
      "prevention": ["..."],
      "treatment": ["..."],
      "organic_options": ["..."],
      "expert_note": "..."
    }
  ],
  "low_confidence": false,
  "disclaimer": "..."
}
```

## Appendix B. Recommended Reporting Checklist

- [ ] Dataset provenance, licence and per-class counts
- [ ] Train/validation/test split method
- [ ] Random seeds and library versions
- [ ] Hardware used for training and inference
- [ ] Full per-class metrics and confusion matrix
- [ ] Ablation results
- [ ] Calibration analysis
- [ ] Expert review of recommendation ranges
- [ ] Deployment URL and model version
- [ ] Privacy and consent statement
- [ ] Treatment-guidance review by an agronomist
