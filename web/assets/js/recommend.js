(function () {
  "use strict";

  const AgriNivis = window.AgriNivis;
  const CROPS = window.AGRINIVIS_CROPS || [];
  const form = document.getElementById("recommend-form");
  if (!form) return;

  const WATER_RANK = { rainfed: 0, low: 1, medium: 2, assured: 3 };
  const MOISTURE_RANK = { low: 1, medium: 2, high: 3 };
  const SEASON_LABEL = { kharif: "Kharif", rabi: "Rabi", zaid: "Zaid", "year-round": "Year-round" };
  const SOIL_LABEL = {
    alluvial: "Alluvial soil",
    black: "Black cotton soil",
    red: "Red soil",
    laterite: "Laterite soil",
    sandy: "Sandy soil",
    loamy: "Loamy soil",
    clay: "Clay soil",
    peaty: "Peaty soil",
    desert: "Desert soil",
  };
  const WATER_LABEL = { rainfed: "Rainfed", low: "Limited water", medium: "Moderate water", assured: "Assured water" };
  const NUTRIENT_MATRIX = {
    low: { none: 5, organic: 5, mixed: 4, chemical: 3 },
    medium: { none: 2, organic: 3, mixed: 5, chemical: 4 },
    high: { none: 1, organic: 2, mixed: 4, chemical: 5 },
  };
  const WEATHER_TEXT = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with hail",
    99: "Thunderstorm with heavy hail",
  };

  const state = {
    weather: null,
    results: [],
    inputs: null,
    loadingWeather: false,
  };

  const el = {
    ph: document.getElementById("ph-range"),
    phValue: document.getElementById("ph-value"),
    formError: document.getElementById("recommend-error"),
    resultsEmpty: document.getElementById("results-empty"),
    resultsContent: document.getElementById("results-content"),
    resultsTitle: document.getElementById("results-title"),
    resultsSubtitle: document.getElementById("results-subtitle"),
    recList: document.getElementById("rec-list"),
    weatherCard: document.getElementById("weather-card"),
    locationInput: document.getElementById("location-input"),
    locationHint: document.getElementById("location-hint"),
    weatherBtn: document.getElementById("weather-btn"),
    geoBtn: document.getElementById("geo-btn"),
    submit: document.getElementById("recommend-btn"),
    printBtn: document.getElementById("print-btn"),
    resetBtn: document.getElementById("reset-btn"),
  };

  function setError(message) {
    if (!el.formError) return;
    if (!message) {
      el.formError.textContent = "";
      el.formError.classList.remove("is-visible");
      return;
    }
    el.formError.textContent = message;
    el.formError.classList.add("is-visible");
    el.formError.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function timeoutSignal(ms) {
    if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
      return AbortSignal.timeout(ms);
    }
    const controller = new AbortController();
    window.setTimeout(function () { controller.abort(); }, ms);
    return controller.signal;
  }

  function readInputs() {
    const data = new FormData(form);
    return {
      soil: String(data.get("soil-type") || ""),
      season: String(data.get("season") || ""),
      ph: Number(data.get("ph") || el.ph.value),
      moisture: String(data.get("moisture") || "medium"),
      irrigation: String(data.get("irrigation") || "medium"),
      previousCrop: String(data.get("previous-crop") || "fallow"),
      fertilizer: String(data.get("fertilizer") || "mixed"),
      landSize: String(data.get("land-size") || ""),
      location: el.locationInput ? el.locationInput.value.trim() : "",
    };
  }

  function validate(inputs) {
    if (!inputs.soil) return "Choose your soil type so the engine can score soil suitability.";
    if (!inputs.season) return "Choose the growing season you are planning for.";
    if (!Number.isFinite(inputs.ph) || inputs.ph < 4.5 || inputs.ph > 9) return "Soil pH must be between 4.5 and 9.0.";
    return "";
  }

  function distanceToRange(value, range) {
    const low = Number(range[0]);
    const high = Number(range[1]);
    if (value < low) return low - value;
    if (value > high) return value - high;
    return 0;
  }

  function nearestRank(rank, ranks) {
    return Math.min.apply(null, ranks.map(function (item) { return Math.abs(rank - item); }));
  }

  function scoreCrop(crop, inputs) {
    let score = 0;
    const reasons = [];
    const warnings = [];

    if (crop.seasons.indexOf(inputs.season) !== -1) {
      score += 22;
      reasons.push("Matches the " + SEASON_LABEL[inputs.season].toLowerCase() + " season");
    } else if (crop.seasons.indexOf("year-round") !== -1) {
      score += 12;
      reasons.push("Year-round crop suited to a long window");
      warnings.push("Usually grown beyond a single " + SEASON_LABEL[inputs.season].toLowerCase() + " season");
    } else {
      warnings.push("Not a typical " + SEASON_LABEL[inputs.season].toLowerCase() + " crop");
    }

    if (crop.soils.indexOf(inputs.soil) !== -1) {
      score += 17;
      reasons.push("Well suited to " + SOIL_LABEL[inputs.soil].toLowerCase());
    } else {
      warnings.push("Prefers " + crop.soils.map(function (soil) { return SOIL_LABEL[soil] || soil; }).join(", "));
    }

    const phDistance = distanceToRange(inputs.ph, crop.ph);
    if (phDistance === 0) {
      score += 13;
      reasons.push("pH " + inputs.ph.toFixed(1) + " is inside the preferred range");
    } else {
      const points = Math.max(0, 13 - phDistance * 8);
      score += points;
      if (points < 6) {
        warnings.push("pH outside the comfortable range of " + crop.ph[0] + "-" + crop.ph[1]);
      }
    }

    const waterRank = WATER_RANK[inputs.irrigation];
    const cropWaterRanks = crop.irrigation.map(function (level) { return WATER_RANK[level]; });
    const waterDistance = nearestRank(waterRank, cropWaterRanks);
    const waterPoints = Math.max(0, 15 - waterDistance * 7);
    score += waterPoints;
    if (waterPoints === 15) {
      reasons.push(WATER_LABEL[inputs.irrigation] + " fits the crop's water need");
    } else if (waterRank < Math.min.apply(null, cropWaterRanks)) {
      warnings.push("Needs more reliable water than your current irrigation");
    } else if (waterRank > Math.max.apply(null, cropWaterRanks)) {
      warnings.push("Extra irrigation is possible, but avoid waterlogging");
    }

    const moistureRank = MOISTURE_RANK[inputs.moisture];
    const cropMoisture = crop.moisture.map(function (level) { return MOISTURE_RANK[level]; });
    const moistureDistance = nearestRank(moistureRank, cropMoisture);
    score += moistureDistance === 0 ? 8 : moistureDistance === 1 ? 4 : 0;
    if (moistureDistance === 0) {
      reasons.push("Soil moisture matches the crop's preference");
    } else {
      warnings.push("Check soil moisture before sowing; the crop prefers " + crop.moisture.join(" or ") + " moisture");
    }

    if (state.weather && Number.isFinite(state.weather.avgTemp)) {
      const tempDistance = distanceToRange(state.weather.avgTemp, crop.temp);
      if (tempDistance === 0) {
        score += 10;
        reasons.push("Local temperature is within the crop's range");
      } else {
        score += Math.max(0, 10 - tempDistance * 2.5);
        warnings.push("Local temperature is outside the ideal " + crop.temp[0] + "-" + crop.temp[1] + " C range");
      }
    } else {
      score += 6;
    }

    const previous = inputs.previousCrop;
    if (previous === "fallow") {
      score += 10;
      reasons.push("Fallow land reduces rotation pressure");
    } else if (previous === crop.id) {
      warnings.push("Same crop as last season increases pest and disease carry-over");
    } else if (crop.badPrev.indexOf(previous) !== -1) {
      score += 2;
      warnings.push("Poor rotation after " + previous.replace(/_/g, " "));
    } else if (crop.goodPrev.indexOf(previous) !== -1) {
      score += 10;
      reasons.push("Good rotation after " + previous.replace(/_/g, " "));
    } else {
      score += 6;
      reasons.push("No major rotation conflict with the previous crop");
    }

    const nutrientPoints = NUTRIENT_MATRIX[crop.nutrient][inputs.fertilizer];
    score += nutrientPoints;
    if (nutrientPoints >= 4) {
      reasons.push("Nutrient demand matches your fertilizer practice");
    } else if (nutrientPoints <= 2) {
      warnings.push("Nutrient demand is high for the current fertilizer plan");
    }

    return {
      crop: crop,
      score: Math.max(0, Math.min(100, Math.round(score))),
      reasons: reasons.slice(0, 4),
      warnings: warnings.slice(0, 3),
    };
  }

  function weatherPlaceLabel() {
    if (!state.weather) return "Local weather";
    return state.weather.place || "Local weather";
  }

  function renderWeather() {
    if (!el.weatherCard) return;
    if (!state.weather) {
      el.weatherCard.innerHTML =
        '<div class="weather-empty">' +
          '<div class="weather-place"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>Local weather</div>' +
          '<p>Add a location to include temperature, humidity and 7-day rainfall in the crop scoring.</p>' +
          '<button class="btn btn-outline btn-sm btn-on-dark" type="button" id="weather-empty-btn">Use my location</button>' +
        "</div>";
      const button = document.getElementById("weather-empty-btn");
      if (button) button.addEventListener("click", function () { geoLocate(); });
      return;
    }

    const weather = state.weather;
    const code = Number(weather.code);
    const description = WEATHER_TEXT[code] || "Current conditions";
    el.weatherCard.innerHTML =
      '<div class="weather-top">' +
        '<div>' +
          '<div class="weather-place"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
            AgriNivis.escapeHtml(weather.place || "Selected location") + "</div>" +
          '<div class="weather-temp">' + Math.round(weather.currentTemp) + "<sup>C</sup></div>" +
          '<div class="weather-desc">' + AgriNivis.escapeHtml(description) + " · " + Math.round(weather.humidity) + "% humidity</div>" +
        "</div>" +
        '<span class="weather-status"><span class="dot"></span>Live</span>' +
      "</div>" +
      '<div class="weather-grid">' +
        "<div><span>7-day rain</span><strong>" + weather.rain7.toFixed(1) + " mm</strong></div>" +
        "<div><span>Avg temp</span><strong>" + weather.avgTemp.toFixed(1) + " C</strong></div>" +
        "<div><span>Rain days</span><strong>" + weather.rainDays + "</strong></div>" +
      "</div>" +
      '<p class="tiny" style="margin-top:12px;color:rgba(255,255,255,.5);position:relative">Open-Meteo forecast · ' + AgriNivis.escapeHtml(weather.updated || "") + "</p>";
  }

  async function reverseGeocode(lat, lon) {
    try {
      const url =
        "https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=" +
        encodeURIComponent(lat) +
        "&longitude=" +
        encodeURIComponent(lon) +
        "&localityLanguage=en";
      const response = await fetch(url, { signal: timeoutSignal(7000) });
      if (!response.ok) return "";
      const data = await response.json();
      return [data.locality || data.city, data.principalSubdivision, data.countryName]
        .filter(Boolean)
        .slice(0, 3)
        .join(", ");
    } catch (_error) {
      return "";
    }
  }

  async function fetchWeather(lat, lon, label) {
    const url =
      "https://api.open-meteo.com/v1/forecast?latitude=" +
      encodeURIComponent(lat) +
      "&longitude=" +
      encodeURIComponent(lon) +
      "&current=temperature_2m,relative_humidity_2m,precipitation,weather_code" +
      "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum" +
      "&forecast_days=7&timezone=auto";

    const response = await fetch(url, { signal: timeoutSignal(12000) });
    if (!response.ok) throw new Error("The weather service did not respond.");
    const data = await response.json();
    if (!data.current || !data.daily) throw new Error("The weather response was incomplete.");

    const maxes = data.daily.temperature_2m_max || [];
    const mins = data.daily.temperature_2m_min || [];
    const rain = data.daily.precipitation_sum || [];
    const rain7 = rain.reduce(function (sum, value) { return sum + (Number(value) || 0); }, 0);
    const rainDays = rain.filter(function (value) { return Number(value) >= 1; }).length;
    const tempValues = [];
    for (let i = 0; i < Math.min(maxes.length, mins.length); i += 1) {
      tempValues.push((Number(maxes[i]) + Number(mins[i])) / 2);
    }
    const avgTemp = tempValues.length
      ? tempValues.reduce(function (sum, value) { return sum + value; }, 0) / tempValues.length
      : Number(data.current.temperature_2m);

    state.weather = {
      lat: Number(lat),
      lon: Number(lon),
      place: label || (await reverseGeocode(lat, lon)) || Number(lat).toFixed(2) + ", " + Number(lon).toFixed(2),
      currentTemp: Number(data.current.temperature_2m),
      humidity: Number(data.current.relative_humidity_2m),
      code: Number(data.current.weather_code),
      rain7: rain7,
      rainDays: rainDays,
      avgTemp: avgTemp,
      updated: data.current.time ? data.current.time.replace("T", " ") : "",
    };
    renderWeather();
    if (state.inputs) {
      runRecommendation(state.inputs, true);
    }
  }

  async function searchLocation() {
    const query = el.locationInput ? el.locationInput.value.trim() : "";
    if (!query) {
      AgriNivis.toast("Enter a village, town or district first");
      if (el.locationInput) el.locationInput.focus();
      return;
    }
    setWeatherLoading(true);
    try {
      const response = await fetch(
        "https://geocoding-api.open-meteo.com/v1/search?name=" +
          encodeURIComponent(query) +
          "&count=1&language=en&format=json",
        { signal: timeoutSignal(10000) }
      );
      if (!response.ok) throw new Error("Location search failed.");
      const data = await response.json();
      if (!data.results || !data.results.length) {
        throw new Error("No place matched that name. Try a nearby town or district.");
      }
      const place = data.results[0];
      const label = [place.name, place.admin1, place.country].filter(Boolean).join(", ");
      if (el.locationInput) el.locationInput.value = label;
      await fetchWeather(place.latitude, place.longitude, label);
      if (el.locationHint) el.locationHint.textContent = "Weather loaded for " + label + ". Change the location and fetch again to update.";
      AgriNivis.toast("Weather added for " + place.name);
    } catch (error) {
      AgriNivis.toast(error.message || "Could not load weather for that location");
      if (el.locationHint) el.locationHint.textContent = "Could not load weather. Recommendations will still work without it.";
    } finally {
      setWeatherLoading(false);
    }
  }

  function setWeatherLoading(loading) {
    state.loadingWeather = loading;
    if (!el.weatherBtn) return;
    el.weatherBtn.disabled = loading;
    if (loading) {
      el.weatherBtn.dataset.label = el.weatherBtn.innerHTML;
      el.weatherBtn.innerHTML = '<span class="btn-spinner" style="border-color:rgba(16,35,26,.25);border-top-color:var(--forest)"></span> Loading';
    } else if (el.weatherBtn.dataset.label) {
      el.weatherBtn.innerHTML = el.weatherBtn.dataset.label;
      delete el.weatherBtn.dataset.label;
    }
  }

  function geoLocate() {
    if (!navigator.geolocation) {
      AgriNivis.toast("This browser does not support geolocation");
      return;
    }
    if (window.location.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(window.location.hostname)) {
      AgriNivis.toast("Location needs an HTTPS site or localhost");
      return;
    }
    setWeatherLoading(true);
    navigator.geolocation.getCurrentPosition(
      async function (position) {
        try {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          const label = await reverseGeocode(lat, lon);
          await fetchWeather(lat, lon, label || "Your location");
          if (el.locationInput && label) el.locationInput.value = label;
          if (el.locationHint) el.locationHint.textContent = "Using weather for your current location. You can type a different place and fetch again.";
          AgriNivis.toast("Weather loaded for your location");
        } catch (error) {
          AgriNivis.toast(error.message || "Could not load weather");
        } finally {
          setWeatherLoading(false);
        }
      },
      function () {
        setWeatherLoading(false);
        AgriNivis.toast("Location permission was not granted");
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 }
    );
  }

  function fitLabel(score) {
    if (score >= 78) return { text: "Strong fit", className: "badge-green" };
    if (score >= 62) return { text: "Suitable with care", className: "badge-amber" };
    return { text: "Weak fit", className: "badge-red" };
  }

  function scoreColor(score) {
    if (score >= 78) return "var(--leaf)";
    if (score >= 62) return "var(--amber)";
    return "var(--clay)";
  }

  function renderResults(inputs, ranked) {
    if (!el.resultsEmpty || !el.resultsContent) return;
    el.resultsEmpty.hidden = true;
    el.resultsContent.hidden = false;

    const top = ranked[0];
    const topScore = top ? top.score : 0;
    const tied = ranked.filter(function (item) { return item.score === topScore; });
    el.resultsTitle.textContent = top ? "Top of your shortlist: " + top.crop.name : "Crop ranking";
    const weatherNote = state.weather
      ? "Weather included from " + weatherPlaceLabel() + "."
      : "Weather not included; add a location for temperature-aware scoring.";
    const tieNote = tied.length > 1
      ? " " + tied.map(function (item) { return item.crop.name; }).join(", ") + " share the top score of " + topScore + "."
      : "";
    el.resultsSubtitle.textContent =
      SEASON_LABEL[inputs.season] +
      " · " +
      (SOIL_LABEL[inputs.soil] || inputs.soil) +
      " · pH " +
      inputs.ph.toFixed(1) +
      " · " +
      WATER_LABEL[inputs.irrigation] +
      ". " +
      weatherNote +
      tieNote;

    el.recList.innerHTML = ranked.slice(0, 6).map(function (result, index) {
      const crop = result.crop;
      const fit = fitLabel(result.score);
      const circumference = 138.2;
      const offset = circumference * (1 - result.score / 100);
      const why = result.reasons.slice(0, 4).map(function (reason) {
        return "<li>" + AgriNivis.escapeHtml(reason) + "</li>";
      }).join("");
      const warnings = result.warnings.map(function (warning) {
        return "<li class=\"warn\">" + AgriNivis.escapeHtml(warning) + "</li>";
      }).join("");
      const tags = [
        '<span class="badge badge-muted">' + AgriNivis.escapeHtml(crop.category) + "</span>",
        '<span class="badge badge-green">' + AgriNivis.escapeHtml(crop.seasons.map(function (season) { return SEASON_LABEL[season] || season; }).join(" / ")) + "</span>",
        '<span class="badge badge-amber">' + AgriNivis.escapeHtml(crop.duration) + "</span>",
        '<span class="badge badge-muted">' + AgriNivis.escapeHtml(crop.water) + " water</span>",
      ].join("");

      return (
        '<article class="rec-card' + (index === 0 ? " is-top" : "") + '">' +
          '<div class="rec-top">' +
            '<span class="rank">' + (index + 1) + "</span>" +
            '<div class="rec-title">' +
              "<h3>" + AgriNivis.escapeHtml(crop.name) + "</h3>" +
              "<p>" + AgriNivis.escapeHtml(crop.botanical) + " · " + AgriNivis.escapeHtml(crop.duration) + "</p>" +
            "</div>" +
            '<div class="score-ring" aria-label="Suitability score ' + result.score + ' out of 100">' +
              '<svg viewBox="0 0 48 48" aria-hidden="true">' +
                '<circle class="ring-bg" cx="24" cy="24" r="22"></circle>' +
                '<circle class="ring-fill" cx="24" cy="24" r="22" style="stroke:' + scoreColor(result.score) + ";stroke-dashoffset:" + offset + '"></circle>' +
              "</svg>" +
              "<strong>" + result.score + "</strong>" +
            "</div>" +
          "</div>" +
          '<div class="rec-body">' +
            '<div class="rec-tags">' + tags + "</div>" +
            '<ul class="rec-why">' + why + "</ul>" +
            (result.warnings.length
              ? '<div class="rec-warnings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><ul class="rec-why" style="margin:0">' + warnings + "</ul></div>"
              : "") +
            '<div class="rec-foot">' +
              '<span class="badge ' + fit.className + '">' + fit.text + "</span>" +
              '<button type="button" data-detail="' + index + '" aria-expanded="false">Field notes</button>' +
            "</div>" +
            '<div class="rec-details" id="rec-detail-' + index + '">' +
              "<strong>Agronomy tip:</strong> " + AgriNivis.escapeHtml(crop.tip) +
              "<br><br><strong>Typical rainfall:</strong> " + crop.rain[0] + "-" + crop.rain[1] + " mm · " +
              "<strong>Temperature:</strong> " + crop.temp[0] + "-" + crop.temp[1] + " C · " +
              "<strong>Nutrient demand:</strong> " + AgriNivis.escapeHtml(crop.nutrient) +
              "<br><br><strong>Common growing states:</strong> " + AgriNivis.escapeHtml(crop.states) +
            "</div>" +
          "</div>" +
        "</article>"
      );
    }).join("");

    el.recList.querySelectorAll("[data-detail]").forEach(function (button) {
      button.addEventListener("click", function () {
        const index = button.getAttribute("data-detail");
        const detail = document.getElementById("rec-detail-" + index);
        if (!detail) return;
        const open = !detail.classList.contains("is-open");
        detail.classList.toggle("is-open", open);
        button.setAttribute("aria-expanded", open ? "true" : "false");
        button.textContent = open ? "Hide notes" : "Field notes";
      });
    });

    if (window.innerWidth < 1020) {
      el.resultsContent.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function runRecommendation(inputs, silent) {
    state.inputs = inputs;
    const results = CROPS.map(function (crop) {
      return scoreCrop(crop, inputs);
    }).sort(function (a, b) {
      return b.score - a.score || a.crop.name.localeCompare(b.crop.name);
    });
    state.results = results;
    renderResults(inputs, results);
    if (silent) AgriNivis.toast("Recommendations updated with local weather");
  }

  function handleSubmit(event) {
    event.preventDefault();
    setError("");
    const inputs = readInputs();
    const error = validate(inputs);
    if (error) {
      setError(error);
      return;
    }
    runRecommendation(inputs, false);
  }

  function resetForm() {
    window.setTimeout(function () {
      if (el.phValue) el.phValue.textContent = Number(el.ph.value).toFixed(1);
      state.weather = null;
      state.inputs = null;
      state.results = [];
      renderWeather();
      if (el.resultsEmpty) el.resultsEmpty.hidden = false;
      if (el.resultsContent) el.resultsContent.hidden = true;
      if (el.locationHint) {
        el.locationHint.textContent = "Weather is fetched from Open-Meteo when you add a location. You can still get recommendations without it.";
      }
      setError("");
    }, 0);
  }

  function bind() {
    if (el.ph && el.phValue) {
      const update = function () { el.phValue.textContent = Number(el.ph.value).toFixed(1); };
      el.ph.addEventListener("input", update);
      update();
    }
    form.addEventListener("submit", handleSubmit);
    if (el.resetBtn) el.resetBtn.addEventListener("click", resetForm);
    if (el.weatherBtn) el.weatherBtn.addEventListener("click", searchLocation);
    if (el.geoBtn) el.geoBtn.addEventListener("click", geoLocate);
    if (el.locationInput) {
      el.locationInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          searchLocation();
        }
      });
    }
    if (el.printBtn) {
      el.printBtn.addEventListener("click", function () {
        window.print();
      });
    }
    if (el.weatherCard) {
      const button = document.getElementById("weather-empty-btn");
      if (button) button.addEventListener("click", geoLocate);
    }
    document.addEventListener("agrinivis:api-changed", function () {
      /* The recommender does not use the ML API, but keep the page consistent. */
    });
  }

  bind();
  renderWeather();
})();
