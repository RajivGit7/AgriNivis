/* AgriNivis - crop disease detection page. */
(function () {
  "use strict";

  const AgriNivis = window.AgriNivis;
  const MAX_BYTES = 12 * 1024 * 1024;
  const MAX_DIMENSION = 1280;
  const LOW_CONFIDENCE = Number((AgriNivis.config && AgriNivis.config.LOW_CONFIDENCE_THRESHOLD) || 60);
  const DOC_ICON =
    '<div class="icon-tile" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg></div>';
  const LEAF_ICON =
    '<div class="icon-tile" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22V10"/><path d="M5 10c0-4 3-7 7-7s7 3 7 7"/><path d="M5 10c3 0 5 2 7 5 2-3 4-5 7-5"/></svg></div>';

  const state = {
    file: null,
    previewUrl: null,
    diseases: [],
    analyzing: false,
    apiOnline: false,
  };

  const el = {
    dropzone: document.getElementById("dropzone"),
    fileInput: document.getElementById("file-input"),
    cameraInput: document.getElementById("camera-input"),
    browseBtn: document.getElementById("browse-btn"),
    cameraBtn: document.getElementById("camera-btn"),
    analyzeBtn: document.getElementById("analyze-btn"),
    analyzeLabel: document.getElementById("analyze-label"),
    removeBtn: document.getElementById("remove-image"),
    preview: document.getElementById("preview"),
    previewName: document.getElementById("preview-name"),
    error: document.getElementById("detect-error"),
    result: document.getElementById("result-panel"),
    note: document.getElementById("server-note-text"),
    noteBox: document.getElementById("api"),
    status: document.getElementById("page-status"),
    statusText: document.getElementById("page-status-text"),
    library: document.getElementById("library-grid"),
    filter: document.getElementById("crop-filter"),
    diseaseModal: document.getElementById("disease-modal"),
    diseaseContent: document.getElementById("disease-modal-content"),
  };

  function setError(message) {
    if (!el.error) return;
    if (!message) {
      el.error.textContent = "";
      el.error.classList.remove("is-visible");
      return;
    }
    el.error.textContent = message;
    el.error.classList.add("is-visible");
  }

  function setStatus(kind, text) {
    if (!el.status) return;
    el.status.className = "badge " + (kind === "ok" ? "badge-green" : kind === "error" ? "badge-red" : "badge-amber");
    el.status.style.padding = "9px 14px";
    el.statusText.textContent = text;
  }

  function setNote(kind, html) {
    if (!el.noteBox || !el.note) return;
    el.noteBox.classList.toggle("is-error", kind === "error");
    el.note.innerHTML = html;
  }

  function timeoutSignal(ms) {
    if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
      return AbortSignal.timeout(ms);
    }
    const controller = new AbortController();
    window.setTimeout(function () { controller.abort(); }, ms);
    return controller.signal;
  }

  async function checkHealth() {
    const base = AgriNivis.getApiBaseUrl();
    const healthUrl = AgriNivis.apiUrl("/health");

    if (!healthUrl) {
      state.apiOnline = false;
      setStatus("error", "API URL not configured");
      setNote(
        "error",
        'The disease model API is not configured yet. Open <button type="button" class="btn btn-ghost btn-sm" data-open-api-settings style="padding:0 4px;min-height:auto;text-decoration:underline">API settings</button> and paste your deployed service URL.'
      );
      bindSettingsButtons();
      return;
    }

    setStatus("checking", "Checking model service");
    setNote("info", "Connecting to the inference service at <code>" + AgriNivis.escapeHtml(base) + "</code>. If the free API has been idle, this can take up to a minute while it wakes.");

    try {
      let response = null;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          response = await fetch(healthUrl, { signal: timeoutSignal(75000), cache: "no-store" });
        } catch (error) {
          response = null;
          if (attempt === 2) throw error;
        }
        if (response && !(response.ok === false && [502, 503, 504].includes(response.status))) break;
        setStatus("checking", "Waking model service");
        setNote("info", "The free API is waking up. Retrying in a few seconds...");
        await new Promise(function (resolve) { setTimeout(resolve, 6000); });
      }
      const data = await response.json().catch(function () { return {}; });
      if (response.ok && data.model_loaded) {
        state.apiOnline = true;
        setStatus("ok", "Model ready");
        setNote("ok", "Connected. The model is ready. Photos are sent to <code>" + AgriNivis.escapeHtml(base.replace(/^https?:\/\//, "")) + "</code> only when you press Analyse.");
      } else {
        state.apiOnline = false;
        setStatus("error", "Model unavailable");
        setNote("error", "The API answered but the model is not loaded. Check the service logs, then retry. <button type=\"button\" class=\"btn btn-ghost btn-sm\" data-retry-health style=\"padding:0 4px;min-height:auto;text-decoration:underline\">Retry</button> <button type=\"button\" class=\"btn btn-ghost btn-sm\" data-open-api-settings style=\"padding:0 4px;min-height:auto;text-decoration:underline\">API settings</button>");
      }
    } catch (error) {
      state.apiOnline = false;
      setStatus("error", "Service offline");
      setNote(
        "error",
        "Could not reach the inference API. Free hosting can take up to a minute to wake. <button type=\"button\" class=\"btn btn-ghost btn-sm\" data-retry-health style=\"padding:0 4px;min-height:auto;text-decoration:underline\">Retry</button>, or open <button type=\"button\" class=\"btn btn-ghost btn-sm\" data-open-api-settings style=\"padding:0 4px;min-height:auto;text-decoration:underline\">API settings</button> to check the URL."
      );
    }
    bindSettingsButtons();
  }

  function bindSettingsButtons() {
    document.querySelectorAll("[data-open-api-settings]").forEach(function (button) {
      if (button.dataset.bound === "1") return;
      button.dataset.bound = "1";
      button.addEventListener("click", function () {
        const modal = document.getElementById("api-modal");
        if (!modal) return;
        modal.classList.add("is-open");
        modal.setAttribute("aria-hidden", "false");
      });
    });
  }

  function resetFile() {
    state.file = null;
    if (state.previewUrl) {
      URL.revokeObjectURL(state.previewUrl);
      state.previewUrl = null;
    }
    el.dropzone.classList.remove("has-image");
    el.preview.removeAttribute("src");
    el.fileInput.value = "";
    el.cameraInput.value = "";
    el.analyzeBtn.disabled = true;
    setError("");
    el.result.innerHTML =
      '<div class="result-empty">' + DOC_ICON + '<h3 style="font-size:1.2rem">Your result will appear here</h3><p>Select a leaf photo and press Analyse. You will get the most likely disease, the model\'s confidence, and a treatment checklist.</p></div>';
  }

  function humanSize(bytes) {
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function handleFile(file) {
    setError("");
    if (!file) return;
    if (!file.type || !file.type.startsWith("image/")) {
      setError("Please choose an image file (JPG, PNG or WebP).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("That image is " + humanSize(file.size) + ". Please use a photo under 12 MB.");
      return;
    }

    state.file = file;
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = URL.createObjectURL(file);
    el.preview.src = state.previewUrl;
    el.previewName.textContent = file.name + " · " + humanSize(file.size);
    el.dropzone.classList.add("has-image");
    el.analyzeBtn.disabled = false;

    el.result.innerHTML =
      '<div class="result-empty">' + LEAF_ICON + '<h3 style="font-size:1.2rem">Photo ready</h3><p>Press Analyse leaf to run the model on this image.</p></div>';
  }

  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = function () {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        URL.revokeObjectURL(objectUrl);
        resolve(canvas.toDataURL("image/jpeg", 0.9));
      };
      image.onerror = function () {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("The browser could not read this image. Try a JPG or PNG."));
      };
      image.src = objectUrl;
    });
  }

  async function analyze() {
    if (!state.file || state.analyzing) return;
    setError("");

    const predictUrl = AgriNivis.apiUrl("/predict?top_k=3");
    if (!predictUrl) {
      setError("Add the model API URL first. Open API settings below and paste the URL of your deployed inference service.");
      document.getElementById("api-modal").classList.add("is-open");
      document.getElementById("api-modal").setAttribute("aria-hidden", "false");
      return;
    }

    state.analyzing = true;
    el.analyzeBtn.disabled = true;
    el.analyzeLabel.textContent = "Analysing...";
    el.analyzeBtn.insertAdjacentHTML("afterbegin", '<span class="btn-spinner" aria-hidden="true"></span>');
    el.result.innerHTML =
      '<div class="result-empty"><div class="spinner" style="width:40px;height:40px;border:3px solid var(--mint);border-top-color:var(--forest);border-radius:50%;animation:spin .8s linear infinite"></div><h3 style="font-size:1.2rem">Reading the leaf</h3><p>The model is checking colour, texture and lesion patterns. This usually takes a few seconds.</p></div>';

    try {
      const dataUrl = await compressImage(state.file);
      const response = await fetch(predictUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ image: dataUrl }),
        signal: timeoutSignal(120000),
      });
      const payload = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        throw new Error(payload.error || "The inference service returned an error (" + response.status + ").");
      }
      if (!payload.predictions || !payload.predictions.length) {
        throw new Error("The API returned no predictions.");
      }
      renderResult(payload);
      if (window.innerWidth < 1020) {
        el.result.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } catch (error) {
      const message = error && error.name === "AbortError"
        ? "The request timed out. The service may be starting up; try again in a moment."
        : (error.message || "Could not analyse the image.");
      setError(message);
      el.result.innerHTML =
        '<div class="result-empty"><div class="icon-tile clay" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div><h3 style="font-size:1.2rem">No result yet</h3><p>Check the service status, then try again. Your photo has not been stored.</p></div>';
    } finally {
      state.analyzing = false;
      el.analyzeBtn.disabled = !state.file;
      el.analyzeLabel.textContent = "Analyse leaf";
      const spinner = el.analyzeBtn.querySelector(".btn-spinner");
      if (spinner) spinner.remove();
    }
  }

  function severityBadge(severity) {
    const value = String(severity || "").toLowerCase();
    if (value === "high") return '<span class="badge badge-red"><span class="dot"></span>High impact</span>';
    if (value === "moderate") return '<span class="badge badge-amber"><span class="dot"></span>Moderate impact</span>';
    return '<span class="badge badge-green"><span class="dot"></span>Manageable</span>';
  }

  function list(items, className) {
    if (!items || !items.length) return '<p class="muted small">No specific guidance available.</p>';
    return '<ul class="list-check ' + (className || "") + '">' +
      items.map(function (item) { return "<li>" + AgriNivis.escapeHtml(item) + "</li>"; }).join("") +
      "</ul>";
  }

  function renderResult(payload) {
    const top = payload.predictions[0];
    const confidence = Number(top.confidence || 0);
    const isLow = payload.low_confidence || confidence < LOW_CONFIDENCE;
    const meterClass = confidence >= 70 ? "" : confidence >= LOW_CONFIDENCE ? "amber" : "red";
    const confidenceNote = isLow
      ? "Low confidence. A different photo with better lighting and a single leaf may help."
      : "The model is reasonably confident, but this is still a screening result.";

    const predictions = payload.predictions.map(function (prediction) {
      return (
        '<div class="pred-row">' +
        '<div><div class="pred-name"><span>' + AgriNivis.escapeHtml(prediction.disease) + '</span><span>' + Number(prediction.confidence).toFixed(1) + "%</span></div>" +
        '<div class="pred-bar"><i style="width:' + Math.max(2, Math.min(100, Number(prediction.confidence))) + '%"></i></div></div>' +
        "</div>"
      );
    }).join("");

    el.result.innerHTML =
      '<div class="result-head">' +
        '<div class="icon-tile ' + (isLow ? "amber" : "clay") + '" aria-hidden="true">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22V10"/><path d="M5 10c0-4 3-7 7-7s7 3 7 7"/><path d="M5 10c3 0 5 2 7 5 2-3 4-5 7-5"/><circle cx="19" cy="5" r="2.4"/></svg>' +
        "</div>" +
        '<div class="result-head-main">' +
          '<div class="result-kicker">' +
            severityBadge(top.severity) +
            (isLow ? '<span class="badge badge-amber">Needs confirmation</span>' : '<span class="badge badge-green">Screening result</span>') +
          "</div>" +
          '<h3>' + AgriNivis.escapeHtml(top.disease) + "</h3>" +
          '<div class="result-crop-line">' + AgriNivis.escapeHtml(top.crop) + " · " + AgriNivis.escapeHtml(top.pathogen || "Pathogen information unavailable") + "</div>" +
        "</div>" +
      "</div>" +
      '<div class="confidence-block">' +
        '<div class="confidence-row"><span>Model confidence</span><strong>' + confidence.toFixed(1) + "%</strong></div>" +
        '<div class="meter ' + meterClass + '"><i id="confidence-fill"></i></div>' +
        '<p class="tiny muted" style="margin-top:8px">' + confidenceNote + "</p>" +
      "</div>" +
      '<div class="result-body">' +
        '<div class="result-tabs" role="tablist" aria-label="Disease details">' +
          '<button type="button" role="tab" aria-selected="true" data-tab="overview" id="tab-overview" aria-controls="panel-overview">Overview</button>' +
          '<button type="button" role="tab" aria-selected="false" data-tab="prevention" id="tab-prevention" aria-controls="panel-prevention">Prevention</button>' +
          '<button type="button" role="tab" aria-selected="false" data-tab="treatment" id="tab-treatment" aria-controls="panel-treatment">Treatment</button>' +
        "</div>" +
        '<div class="tab-panel" id="panel-overview" role="tabpanel" aria-labelledby="tab-overview">' +
          '<div class="info-block"><h4>What is happening</h4><p>' + AgriNivis.escapeHtml(top.cause || "No description available.") + "</p></div>" +
          '<div class="info-block"><h4>Favourable conditions</h4><p>' + AgriNivis.escapeHtml(top.favorable_conditions || "Not specified.") + "</p></div>" +
          '<div class="info-block"><h4>Symptoms to check</h4>' + list(top.symptoms) + "</div>" +
        "</div>" +
        '<div class="tab-panel" id="panel-prevention" role="tabpanel" aria-labelledby="tab-prevention" hidden>' +
          '<div class="info-block"><h4>Preventive measures</h4>' + list(top.prevention) + "</div>" +
          '<div class="info-block"><h4>Organic or cultural options</h4>' + list(top.organic_options) + "</div>" +
        "</div>" +
        '<div class="tab-panel" id="panel-treatment" role="tabpanel" aria-labelledby="tab-treatment" hidden>' +
          '<div class="info-block"><h4>Treatment options</h4>' + list(top.treatment) + "</div>" +
          '<div class="info-block"><h4>Agronomist note</h4><p>' + AgriNivis.escapeHtml(top.expert_note || "Confirm before applying any chemical treatment.") + "</p></div>" +
        "</div>" +
      "</div>" +
      '<div class="top-predictions"><h4>Other possible matches</h4>' + predictions + "</div>" +
      '<div class="result-footnote"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg><span>' + AgriNivis.escapeHtml(payload.disclaimer || "Confirm with a qualified agronomist before applying pesticides.") + "</span></div>";

    const fill = document.getElementById("confidence-fill");
    if (fill) {
      requestAnimationFrame(function () {
        fill.style.width = Math.max(2, Math.min(100, confidence)) + "%";
      });
    }

    el.result.querySelectorAll("[data-tab]").forEach(function (button) {
      button.addEventListener("click", function () {
        const tab = button.getAttribute("data-tab");
        el.result.querySelectorAll("[data-tab]").forEach(function (other) {
          const selected = other === button;
          other.setAttribute("aria-selected", selected ? "true" : "false");
        });
        el.result.querySelectorAll(".tab-panel").forEach(function (panel) {
          panel.hidden = panel.id !== "panel-" + tab;
        });
      });
    });
  }

  function severityClass(severity) {
    const value = String(severity || "").toLowerCase();
    if (value === "high") return "badge-red";
    if (value === "moderate") return "badge-amber";
    return "badge-green";
  }

  function renderLibrary(filterValue) {
    if (!el.library) return;
    const items = state.diseases.filter(function (item) {
      return !filterValue || filterValue === "all" || item.crop === filterValue;
    });
    if (!items.length) {
      el.library.innerHTML = '<div class="card" style="grid-column:1/-1;text-align:center;padding:36px"><p class="muted">No classes match that crop.</p></div>';
      return;
    }
    el.library.innerHTML = items.map(function (item, index) {
      return (
        '<article class="disease-card" data-disease-index="' + state.diseases.indexOf(item) + '" tabindex="0" role="button" aria-label="Open details for ' + AgriNivis.escapeHtml(item.disease) + '">' +
          '<div class="disease-card-top">' +
            '<span class="badge badge-green">' + AgriNivis.escapeHtml(item.crop) + "</span>" +
            '<span class="badge ' + severityClass(item.severity) + '">' + AgriNivis.escapeHtml(item.severity) + "</span>" +
          "</div>" +
          "<h3>" + AgriNivis.escapeHtml(item.disease) + "</h3>" +
          "<p>" + AgriNivis.escapeHtml(item.cause) + "</p>" +
          '<span class="card-meta">View symptoms and treatment<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></span>' +
        "</article>"
      );
    }).join("");

    el.library.querySelectorAll("[data-disease-index]").forEach(function (card) {
      function open() {
        const item = state.diseases[Number(card.getAttribute("data-disease-index"))];
        openDisease(item);
      }
      card.addEventListener("click", open);
      card.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      });
    });
  }

  function openDisease(item) {
    if (!item || !el.diseaseModal) return;
    el.diseaseContent.innerHTML =
      '<div class="result-kicker" style="margin-bottom:12px">' +
        '<span class="badge badge-green">' + AgriNivis.escapeHtml(item.crop) + "</span>" +
        '<span class="badge ' + severityClass(item.severity) + '">' + AgriNivis.escapeHtml(item.severity) + " impact</span>" +
      "</div>" +
      '<h3 id="disease-modal-title" style="font-size:1.7rem;margin-bottom:6px">' + AgriNivis.escapeHtml(item.disease) + "</h3>" +
      '<p class="small muted" style="margin-bottom:18px">' + AgriNivis.escapeHtml(item.pathogen) + "</p>" +
      '<div class="info-block"><h4>Cause</h4><p>' + AgriNivis.escapeHtml(item.cause) + "</p></div>" +
      '<div class="info-block"><h4>Favourable conditions</h4><p>' + AgriNivis.escapeHtml(item.favorable_conditions) + "</p></div>" +
      '<div class="info-block"><h4>Symptoms</h4>' + list(item.symptoms) + "</div>" +
      '<div class="info-block"><h4>Prevention</h4>' + list(item.prevention) + "</div>" +
      '<div class="info-block"><h4>Treatment</h4>' + list(item.treatment) + "</div>" +
      '<div class="info-block"><h4>Organic options</h4>' + list(item.organic_options) + "</div>" +
      '<div class="disclaimer-strip" style="margin-top:18px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg><span>' + AgriNivis.escapeHtml(item.expert_note) + " Confirm with your local extension service before spraying.</span></div>";
    el.diseaseModal.classList.add("is-open");
    el.diseaseModal.setAttribute("aria-hidden", "false");
  }

  function closeDisease() {
    if (!el.diseaseModal) return;
    el.diseaseModal.classList.remove("is-open");
    el.diseaseModal.setAttribute("aria-hidden", "true");
  }

  async function loadLibrary() {
    try {
      const response = await fetch("assets/data/diseases.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load the library");
      const payload = await response.json();
      state.diseases = payload.classes || [];
      renderLibrary("all");
    } catch (error) {
      el.library.innerHTML = '<div class="card" style="grid-column:1/-1;text-align:center;padding:36px"><p class="muted">The offline disease library could not be loaded. You can still run predictions through the API.</p></div>';
    }
  }

  function bind() {
    el.browseBtn.addEventListener("click", function () { el.fileInput.click(); });
    el.cameraBtn.addEventListener("click", function () { el.cameraInput.click(); });
    el.dropzone.addEventListener("click", function (event) {
      if (event.target.closest("#remove-image")) return;
      if (el.dropzone.classList.contains("has-image")) return;
      el.fileInput.click();
    });
    el.dropzone.addEventListener("keydown", function (event) {
      if ((event.key === "Enter" || event.key === " ") && !el.dropzone.classList.contains("has-image")) {
        event.preventDefault();
        el.fileInput.click();
      }
    });
    el.fileInput.addEventListener("change", function (event) { handleFile(event.target.files[0]); });
    el.cameraInput.addEventListener("change", function (event) { handleFile(event.target.files[0]); });
    el.removeBtn.addEventListener("click", function (event) {
      event.stopPropagation();
      resetFile();
    });
    el.analyzeBtn.addEventListener("click", analyze);

    ["dragenter", "dragover"].forEach(function (type) {
      el.dropzone.addEventListener(type, function (event) {
        event.preventDefault();
        el.dropzone.classList.add("is-dragging");
      });
    });
    ["dragleave", "drop"].forEach(function (type) {
      el.dropzone.addEventListener(type, function (event) {
        event.preventDefault();
        el.dropzone.classList.remove("is-dragging");
      });
    });
    el.dropzone.addEventListener("drop", function (event) {
      if (event.dataTransfer && event.dataTransfer.files.length) {
        handleFile(event.dataTransfer.files[0]);
      }
    });

    document.addEventListener("paste", function (event) {
      if (!event.clipboardData) return;
      const items = Array.from(event.clipboardData.items || []);
      const imageItem = items.find(function (item) { return item.type && item.type.startsWith("image/"); });
      if (imageItem) {
        handleFile(imageItem.getAsFile());
        AgriNivis.toast("Pasted image from clipboard");
      }
    });

    if (el.filter) {
      el.filter.addEventListener("change", function (event) {
        if (event.target.name === "crop-filter") renderLibrary(event.target.value);
      });
    }

    document.addEventListener("agrinivis:api-changed", checkHealth);
    document.addEventListener("click", function (event) {
      if (event.target.closest("[data-retry-health]")) checkHealth();
    });
    document.querySelectorAll("[data-close-disease]").forEach(function (button) {
      button.addEventListener("click", closeDisease);
    });
    if (el.diseaseModal) {
      el.diseaseModal.addEventListener("click", function (event) {
        if (event.target === el.diseaseModal) closeDisease();
      });
      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") closeDisease();
      });
    }
  }

  bind();
  checkHealth();
  loadLibrary();
})();
