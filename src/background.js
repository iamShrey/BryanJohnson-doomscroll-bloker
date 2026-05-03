const BLOCKS_KEY = "doomscrollBlockerActiveBlocks";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (!tabId) {
    sendResponse({});
    return false;
  }

  if (message.type === "DSB_GET_ACTIVE_BLOCK") {
    getBlocks().then((blocks) => {
      const block = blocks[String(tabId)];

      if (!block || block.endTime <= Date.now()) {
        delete blocks[String(tabId)];
        saveBlocks(blocks).then(() => sendResponse({ block: null }));
        return;
      }

      sendResponse({ block });
    });
    return true;
  }

  if (message.type === "DSB_START_BLOCK") {
    getBlocks().then((blocks) => {
      blocks[String(tabId)] = message.block;
      saveBlocks(blocks).then(() => sendResponse({ ok: true }));
    });
    return true;
  }

  if (message.type === "DSB_CLEAR_BLOCK") {
    getBlocks().then((blocks) => {
      delete blocks[String(tabId)];
      saveBlocks(blocks).then(() => sendResponse({ ok: true }));
    });
    return true;
  }

  sendResponse({});
  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  getBlocks().then((blocks) => {
    delete blocks[String(tabId)];
    saveBlocks(blocks);
  });
});

function getBlocks() {
  return chrome.storage.session.get(BLOCKS_KEY).then((result) => {
    return result[BLOCKS_KEY] || {};
  });
}

function saveBlocks(blocks) {
  return chrome.storage.session.set({ [BLOCKS_KEY]: blocks });
}
