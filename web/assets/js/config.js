/* AgriNivis runtime configuration.
 *
 * After deploying the ML service, replace API_BASE_URL with the public URL
 * (for example https://username-agrinivis-ml.hf.space).
 *
 * You can also override it at runtime from the "API settings" button on the
 * detection page; that value is stored in the browser's localStorage.
 */
window.AGRINIVIS_CONFIG = {
  API_BASE_URL: "https://YOUR-SPACE.hf.space",
  API_BASE_URL_LOCAL: "http://127.0.0.1:7860",
  REPO_URL: "https://github.com/RajivGit7/AgriNivis",
  RESEARCH_PAPER_URL: "https://github.com/RajivGit7/AgriNivis/blob/main/docs/research-paper.md",
  CONTACT_EMAIL: "",
  LOW_CONFIDENCE_THRESHOLD: 60,
};
