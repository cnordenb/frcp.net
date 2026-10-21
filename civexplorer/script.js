import { params, load, recall, useData, loadLanguage, loadLanguages, preferredLanguage } from "./js/datahandler.js";
import { start, setSimple, showLoadError } from "./js/ui.js";
import { runUpdate } from "./js/report.js";
import { startPictures } from "./js/pictures.js";

setSimple(recall("simple") === "true");
load("data.json").then((raw) => {
  useData(raw);
  return params.has("test") || params.has("update") ? loadLanguages() : loadLanguage(preferredLanguage()).catch(() => null);
}).then(() => {
  start();
  startPictures();
  if (params.has("test")) return import("./js/tests/run.js").then(({ runTests }) => runTests());
  if (params.has("update")) return runUpdate();
  return null;
}).catch((error) => {
  showLoadError();
  if (params.has("test")) import("./js/tests/run.js").then(({ loadFailed }) => loadFailed());
  throw error;
});
