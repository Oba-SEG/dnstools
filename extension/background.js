chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "ndns-lookup",
    title: 'Look up "%s" on Nexus DNS',
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  const selection = (info.selectionText || "").trim();
  const m = selection.match(/^(https?:\/\/)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i);
  const domain = m ? m[2] : selection;
  if (!domain) return;
  const url = `https://oba-seg.github.io/dnstools/?domain=${encodeURIComponent(domain)}`;
  chrome.tabs.create({ url });
});
