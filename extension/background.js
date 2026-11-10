chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "ndns-lookup",
    title: 'Look up "%s" on Nexus DNS',
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  const selection = (info.selectionText || "").trim().toLowerCase();
  const cleaned = selection
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .replace(/^["'`]+/, "")
    .replace(/[.,.;:!?)"'`\s]+$/, "");
  const m = cleaned.match(/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/);
  if (!m) return;
  const url = `https://oba-seg.github.io/dnstools/?domain=${encodeURIComponent(cleaned)}`;
  chrome.tabs.create({ url });
});
