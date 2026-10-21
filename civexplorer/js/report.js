import { data, fill, fetchUpdate } from "./datahandler.js";
import { $, clone } from "./ui.js";

export function openReport(title, status) {
  $("reportTitle").textContent = title;
  $("reportStatus").textContent = status;
  $("reportList").replaceChildren();
  $("reportDownloads").replaceChildren();
  $("reportDownloads").hidden = true;
  if (!$("report").open) $("report").showModal();
}

export function report(line) {
  const li = clone("reportTemplate");
  li.textContent = line;
  $("reportList").append(li);
}

export async function runUpdate() {
  const tools = data.tools;
  openReport(tools.updateTitle, fill(tools.updateLoading, { source: data.source.name }));
  try {
    const { messages, fresh, files } = await fetchUpdate();
    messages.forEach(report);
    if (!fresh) {
      $("reportStatus").textContent = tools.updateBlocked;
      return;
    }
    if (!messages.length) report(tools.updateSame);
    $("reportStatus").textContent = fill(tools.updateReady, {
      civs: fresh.civs.length, items: Object.keys(fresh.availability).length, languages: Object.keys(fresh.languages).length,
    });
    $("reportDownloads").replaceChildren(...files.map(({ path, json }) => {
      const li = clone("downloadTemplate");
      const link = li.querySelector("a");
      link.href = URL.createObjectURL(new Blob([`${json}\n`], { type: "application/json" }));
      link.download = path.split("/").pop();
      link.textContent = fill(tools.download, { file: path });
      return li;
    }));
    $("reportDownloads").hidden = false;
  } catch (error) {
    $("reportStatus").textContent = fill(tools.updateFailed, { error: error.message });
  }
}
