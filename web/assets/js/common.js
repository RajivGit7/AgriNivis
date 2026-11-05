/* Shared AgriNivis browser helpers. */
(function () {
  "use strict";

  const CONFIG = window.AGRINIVIS_CONFIG || {};
  const STORAGE_KEY = "agrinivis_api_url";

  function isLocalHost() {
    return ["localhost", "127.0.0.1", "0.0.0.0", ""].includes(window.location.hostname);
  }

  function isPlaceholder(url) {
    return !url || /YOUR-SPACE|YOUR-USERNAME/i.test(url);
  }

  function getApiBaseUrl() {
    let stored = "";
    try {
      stored = window.localStorage.getItem(STORAGE_KEY) || "";
    } catch (_error) {
      stored = "";
    }
    if (stored.trim()) return stored.trim().replace(/\/+$/, "");
    if (isLocalHost()) {
      return (CONFIG.API_BASE_URL_LOCAL || "http://127.0.0.1:7860").replace(/\/+$/, "");
    }
    return (CONFIG.API_BASE_URL || "").replace(/\/+$/, "");
  }

  function setApiBaseUrl(url) {
    const clean = String(url || "").trim().replace(/\/+$/, "");
    try {
      if (clean) window.localStorage.setItem(STORAGE_KEY, clean);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch (_error) {
      /* storage may be disabled; the page still uses the config default */
    }
    return clean;
  }

  function apiUrl(path) {
    const base = getApiBaseUrl();
    if (isPlaceholder(base)) return "";
    return base + path;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function toast(message, timeout) {
    let element = document.getElementById("agrinivis-toast");
    if (!element) {
      element = document.createElement("div");
      element.id = "agrinivis-toast";
      element.className = "toast";
      element.setAttribute("role", "status");
      element.setAttribute("aria-live", "polite");
      document.body.appendChild(element);
    }
    element.textContent = message;
    requestAnimationFrame(function () {
      element.classList.add("is-visible");
    });
    window.clearTimeout(element._timer);
    element._timer = window.setTimeout(function () {
      element.classList.remove("is-visible");
    }, timeout || 3000);
  }

  function initHeader() {
    const header = document.querySelector(".site-header");
    if (header) {
      const update = function () {
        header.classList.toggle("is-scrolled", window.scrollY > 8);
      };
      update();
      window.addEventListener("scroll", update, { passive: true });
    }

    const toggle = document.querySelector(".nav-toggle");
    const links = document.querySelector(".nav-links");
    if (toggle && links) {
      toggle.addEventListener("click", function () {
        const open = toggle.getAttribute("aria-expanded") !== "true";
        toggle.setAttribute("aria-expanded", String(open));
        links.classList.toggle("is-open", open);
      });
      links.addEventListener("click", function (event) {
        if (event.target.closest("a")) {
          toggle.setAttribute("aria-expanded", "false");
          links.classList.remove("is-open");
        }
      });
      document.addEventListener("click", function (event) {
        if (!links.contains(event.target) && !toggle.contains(event.target)) {
          toggle.setAttribute("aria-expanded", "false");
          links.classList.remove("is-open");
        }
      });
    }

    const page = document.body.getAttribute("data-page");
    if (page) {
      document.querySelectorAll(".nav-links a[data-nav]").forEach(function (link) {
        if (link.getAttribute("data-nav") === page) {
          link.classList.add("is-active");
          link.setAttribute("aria-current", "page");
        }
      });
    }

    const year = document.getElementById("footer-year");
    if (year) year.textContent = String(new Date().getFullYear());
  }

  function initReveal() {
    const items = document.querySelectorAll(".reveal");
    if (!items.length) return;
    if (!("IntersectionObserver" in window)) {
      items.forEach(function (item) {
        item.classList.add("is-visible");
      });
      return;
    }
    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    items.forEach(function (item) {
      observer.observe(item);
    });
  }

  function initApiSettings() {
    const modal = document.getElementById("api-modal");
    if (!modal) return;
    const input = document.getElementById("api-url-input");
    const openers = document.querySelectorAll("[data-open-api-settings]");
    const closeers = modal.querySelectorAll("[data-close-modal]");

    function open() {
      if (input) input.value = getApiBaseUrl() || "";
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      if (input) window.setTimeout(function () { input.focus(); }, 50);
    }

    function close() {
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
    }

    openers.forEach(function (button) {
      button.addEventListener("click", open);
    });
    closeers.forEach(function (button) {
      button.addEventListener("click", close);
    });
    modal.addEventListener("click", function (event) {
      if (event.target === modal) close();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") close();
    });

    const form = document.getElementById("api-settings-form");
    if (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        const value = input ? input.value.trim() : "";
        if (value && !/^https?:\/\//i.test(value)) {
          toast("Enter a full URL starting with http:// or https://");
          return;
        }
        setApiBaseUrl(value);
        close();
        toast(value ? "API URL saved" : "Using the configured API URL");
        const eventBus = new CustomEvent("agrinivis:api-changed", { detail: { url: value } });
        document.dispatchEvent(eventBus);
      });
    }

    const reset = document.getElementById("api-reset");
    if (reset) {
      reset.addEventListener("click", function () {
        setApiBaseUrl("");
        if (input) input.value = getApiBaseUrl();
        toast("API URL reset");
      });
    }
  }

  function init() {
    initHeader();
    initReveal();
    initApiSettings();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.AgriNivis = {
    config: CONFIG,
    getApiBaseUrl: getApiBaseUrl,
    setApiBaseUrl: setApiBaseUrl,
    apiUrl: apiUrl,
    isPlaceholder: isPlaceholder,
    escapeHtml: escapeHtml,
    toast: toast,
  };
})();
