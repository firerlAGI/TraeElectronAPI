const DEFAULT_INSPECTION_MATCH_LIMIT = Number(process.env.TRAE_SELECTOR_INSPECT_LIMIT || 5);
const DEFAULT_TEXT_PREVIEW_LENGTH = Number(process.env.TRAE_SELECTOR_TEXT_PREVIEW_LENGTH || 120);

const BROWSER_HELPERS_SOURCE = `
function traeAutomationQueryAll(selectors) {
  const seen = new Set();
  const elements = [];
  for (const selector of selectors) {
    if (typeof selector !== "string" || !selector.trim()) {
      continue;
    }
    let matched = [];
    try {
      matched = Array.from(document.querySelectorAll(selector));
    } catch (error) {
      continue;
    }
    for (const element of matched) {
      if (!seen.has(element)) {
        seen.add(element);
        elements.push(element);
      }
    }
  }
  return elements;
}

function traeAutomationIsVisible(element, options = {}) {
  if (!element || !(element instanceof Element)) {
    return false;
  }
  const style = window.getComputedStyle(element);
  if (!style || style.display === "none") {
    return false;
  }
  if (!options.allowHiddenText && style.visibility === "hidden") {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

function traeAutomationDescribeElement(element) {
  if (!element) {
    return null;
  }
  return {
    tagName: element.tagName ? element.tagName.toLowerCase() : null,
    id: element.id || null,
    className: typeof element.className === "string" ? element.className : null
  };
}

function traeAutomationPickVisible(selectors, options = {}) {
  for (const selector of selectors) {
    if (typeof selector !== "string" || !selector.trim()) {
      continue;
    }
    let matched = [];
    try {
      matched = Array.from(document.querySelectorAll(selector)).filter((element) => traeAutomationIsVisible(element));
    } catch (error) {
      continue;
    }
    if (matched.length > 0) {
      return options.pick === "last" ? matched[matched.length - 1] : matched[0];
    }
  }
  return null;
}

function traeAutomationGetText(element) {
  if (!element) {
    return "";
  }
  return String(element.innerText || element.textContent || "")
    .replace(/\\u00a0/g, " ")
    .replace(/\\r/g, "")
    .trim();
}

function traeAutomationPreviewText(value, maxLength) {
  const text = String(value || "");
  if (!text) {
    return "";
  }
  if (!(maxLength > 0) || text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength) + "...";
}

function traeAutomationDescribeMatch(element, maxLength) {
  return {
    ...traeAutomationDescribeElement(element),
    role: element.getAttribute("role"),
    type: element.getAttribute("type"),
    ariaLabel: element.getAttribute("aria-label"),
    title: element.getAttribute("title"),
    name: element.getAttribute("name"),
    placeholder: element.getAttribute("placeholder"),
    textPreview: traeAutomationPreviewText(traeAutomationGetText(element), maxLength)
  };
}

function traeAutomationFilterTopLevel(elements) {
  return elements.filter((element, index) => {
    return !elements.some((candidate, candidateIndex) => candidateIndex !== index && candidate.contains(element));
  });
}

function traeAutomationSnapshotResponses(selectors, options = {}) {
  return traeAutomationFilterTopLevel(
    traeAutomationQueryAll(selectors).filter((element) => traeAutomationIsVisible(element, options))
  )
    .map((element, index) => ({
      index,
      text: traeAutomationGetText(element),
      descriptor: traeAutomationDescribeElement(element)
    }))
    .filter((entry) => entry.text);
}

function traeAutomationCollectSelectorMatches(selectors, limit, maxLength, options = {}) {
  return selectors.map((selector) => {
    const matches = traeAutomationQueryAll([selector]).filter((element) => traeAutomationIsVisible(element, options));
    return {
      selector,
      count: matches.length,
      matches: matches.slice(-limit).map((element) => traeAutomationDescribeMatch(element, maxLength))
    };
  });
}

function traeAutomationCollectGenericMatches(selectors, limit, maxLength) {
  return traeAutomationQueryAll(selectors)
    .filter(traeAutomationIsVisible)
    .slice(-limit)
    .map((element) => traeAutomationDescribeMatch(element, maxLength));
}

function traeAutomationSetValue(element, value) {
  if (!element) {
    return {
      ok: false,
      reason: "composer_missing"
    };
  }

  element.dispatchEvent(new MouseEvent("mousedown", {
    bubbles: true,
    cancelable: true
  }));
  if (typeof element.click === "function") {
    element.click();
  }
  element.focus();

  if (element.isContentEditable) {
    element.textContent = value;
    element.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: value
    }));
    return {
      ok: true,
      mode: "contenteditable"
    };
  }

  const prototype = element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  if (descriptor && typeof descriptor.set === "function") {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  return {
    ok: true,
    mode: element.tagName ? element.tagName.toLowerCase() : "input"
  };
}

function traeAutomationSubmit(composer, sendButton, submitMode) {
  if (submitMode === "enter" || (!sendButton && submitMode !== "button")) {
    const keyboardEvent = {
      key: "Enter",
      code: "Enter",
      bubbles: true,
      cancelable: true
    };
    composer.dispatchEvent(new KeyboardEvent("keydown", keyboardEvent));
    composer.dispatchEvent(new KeyboardEvent("keypress", keyboardEvent));
    composer.dispatchEvent(new KeyboardEvent("keyup", keyboardEvent));
    if (!sendButton) {
      return {
        ok: true,
        trigger: "enter"
      };
    }
  }

  if (sendButton) {
    sendButton.click();
    return {
      ok: true,
      trigger: "button"
    };
  }

  return {
    ok: false,
    reason: "submit_missing"
  };
}

function traeAutomationIsButtonDisabled(element) {
  if (!element) {
    return false;
  }
  if (element.disabled === true) {
    return true;
  }
  const ariaDisabled = element.getAttribute("aria-disabled");
  if (ariaDisabled === "true") {
    return true;
  }
  return typeof element.className === "string" && /(^|\\s)disabled(\\s|$)/.test(element.className);
}
`;

function buildReadinessExpression(config) {
  return `(() => {
    ${BROWSER_HELPERS_SOURCE}
    const composerSelectors = ${JSON.stringify(config.composerSelectors)};
    const sendButtonSelectors = ${JSON.stringify(config.sendButtonSelectors)};
    const responseSelectors = ${JSON.stringify(config.responseSelectors)};
    const activitySelectors = ${JSON.stringify(config.activitySelectors || [])};
    const newChatSelectors = ${JSON.stringify(config.newChatSelectors)};
    const submitMode = ${JSON.stringify(config.submitMode)};
    const requireResponseSelector = ${JSON.stringify(config.requireResponseSelector)};
    const composer = traeAutomationPickVisible(composerSelectors);
    const sendButton = traeAutomationPickVisible(sendButtonSelectors);
    const responseMatches = traeAutomationSnapshotResponses(responseSelectors);
    const activityMatches = traeAutomationSnapshotResponses(activitySelectors, { allowHiddenText: true });
    const newChatButton = traeAutomationPickVisible(newChatSelectors);
    const composerFound = Boolean(composer);
    const sendButtonFound = Boolean(sendButton);
    const responseSelectorFound = responseMatches.length > 0;
    const ready = composerFound && (submitMode !== "button" || sendButtonFound) && (!requireResponseSelector || responseSelectorFound);
    return {
      ready,
      composerFound,
      sendButtonFound,
      responseSelectorFound,
      newChatFound: Boolean(newChatButton),
      title: document.title,
      url: window.location.href,
      composer: traeAutomationDescribeElement(composer),
      sendButton: traeAutomationDescribeElement(sendButton),
      responseCount: responseMatches.length,
      activitySelectorFound: activityMatches.length > 0,
      activityCount: activityMatches.length
    };
  })()`;
}

function buildCaptureExpression(config, options = {}) {
  return `(() => {
    ${BROWSER_HELPERS_SOURCE}
    const captureSelectors = ${JSON.stringify(options.selectors || config.responseSelectors)};
    return traeAutomationSnapshotResponses(captureSelectors, {
      allowHiddenText: ${JSON.stringify(options.allowHiddenText === true)}
    });
  })()`;
}

function buildPrepareSessionExpression(config) {
  return `(() => {
    ${BROWSER_HELPERS_SOURCE}
    const newChatSelectors = ${JSON.stringify(config.newChatSelectors)};
    const button = traeAutomationPickVisible(newChatSelectors);
    if (!button) {
      return {
        clicked: false
      };
    }
    button.click();
    return {
      clicked: true,
      trigger: "new_chat",
      button: traeAutomationDescribeElement(button)
    };
  })()`;
}

function buildSubmitExpression(config, payload = {}) {
  return `(() => {
    ${BROWSER_HELPERS_SOURCE}
    const composerSelectors = ${JSON.stringify(config.composerSelectors)};
    const sendButtonSelectors = ${JSON.stringify(config.sendButtonSelectors)};
    const submitMode = ${JSON.stringify(config.submitMode)};
    const content = ${JSON.stringify(String(payload.content || ""))};
    const composer = traeAutomationPickVisible(composerSelectors);
    const sendButton = traeAutomationPickVisible(sendButtonSelectors);
    const setValueResult = traeAutomationSetValue(composer, content);
    if (!setValueResult.ok) {
      return {
        ok: false,
        ...setValueResult
      };
    }
    const submitResult = traeAutomationSubmit(composer, sendButton, submitMode);
    return {
      ok: submitResult.ok,
      composer: traeAutomationDescribeElement(composer),
      sendButton: traeAutomationDescribeElement(sendButton),
      setValueResult,
      submitResult
    };
  })()`;
}

function buildPrepareInputExpression(config) {
  return `(() => {
    ${BROWSER_HELPERS_SOURCE}
    const composerSelectors = ${JSON.stringify(config.composerSelectors)};
    const sendButtonSelectors = ${JSON.stringify(config.sendButtonSelectors)};
    const composer = traeAutomationPickVisible(composerSelectors);
    const sendButton = traeAutomationPickVisible(sendButtonSelectors);
    if (!composer) {
      return {
        ok: false,
        reason: "composer_missing"
      };
    }

    composer.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true
    }));
    if (typeof composer.click === "function") {
      composer.click();
    }
    composer.focus();

    // Clear stale visible text before the next insertion attempt.
    if (composer.isContentEditable) {
      composer.textContent = "";
      composer.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "deleteContentBackward",
        data: null
      }));
    } else if (Object.prototype.hasOwnProperty.call(composer, "value")) {
      const prototype = composer.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
      if (descriptor && typeof descriptor.set === "function") {
        descriptor.set.call(composer, "");
      } else {
        composer.value = "";
      }
      composer.dispatchEvent(new Event("input", { bubbles: true }));
      composer.dispatchEvent(new Event("change", { bubbles: true }));
    }

    return {
      ok: true,
      composer: traeAutomationDescribeElement(composer),
      sendButton: traeAutomationDescribeElement(sendButton),
      isContentEditable: Boolean(composer.isContentEditable),
      tagName: composer.tagName ? composer.tagName.toLowerCase() : null
    };
  })()`;
}

function buildTriggerSubmitExpression(config) {
  return `(() => {
    ${BROWSER_HELPERS_SOURCE}
    const composerSelectors = ${JSON.stringify(config.composerSelectors)};
    const sendButtonSelectors = ${JSON.stringify(config.sendButtonSelectors)};
    const submitMode = ${JSON.stringify(config.submitMode)};
    const composer = traeAutomationPickVisible(composerSelectors);
    const sendButton = traeAutomationPickVisible(sendButtonSelectors);
    if (!composer) {
      return {
        ok: false,
        reason: "composer_missing"
      };
    }
    const submitResult = traeAutomationSubmit(composer, sendButton, submitMode);
    return {
      ok: submitResult.ok,
      composer: traeAutomationDescribeElement(composer),
      sendButton: traeAutomationDescribeElement(sendButton),
      submitResult,
      composerText: traeAutomationGetText(composer),
      sendButtonDisabled: traeAutomationIsButtonDisabled(sendButton)
    };
  })()`;
}

function buildDiagnosticsExpression(config, options = {}) {
  const matchLimit = Number(options.matchLimit || DEFAULT_INSPECTION_MATCH_LIMIT);
  const textPreviewLength = Number(options.textPreviewLength || DEFAULT_TEXT_PREVIEW_LENGTH);
  return `(() => {
    ${BROWSER_HELPERS_SOURCE}
    const composerSelectors = ${JSON.stringify(config.composerSelectors)};
    const sendButtonSelectors = ${JSON.stringify(config.sendButtonSelectors)};
    const responseSelectors = ${JSON.stringify(config.responseSelectors)};
    const activitySelectors = ${JSON.stringify(config.activitySelectors || [])};
    const newChatSelectors = ${JSON.stringify(config.newChatSelectors)};
    const matchLimit = ${JSON.stringify(matchLimit)};
    const textPreviewLength = ${JSON.stringify(textPreviewLength)};
    return {
      title: document.title,
      url: window.location.href,
      readyState: document.readyState,
      selectorDiagnostics: {
        composer: traeAutomationCollectSelectorMatches(composerSelectors, matchLimit, textPreviewLength),
        sendButton: traeAutomationCollectSelectorMatches(sendButtonSelectors, matchLimit, textPreviewLength),
        response: traeAutomationCollectSelectorMatches(responseSelectors, matchLimit, textPreviewLength),
        activity: traeAutomationCollectSelectorMatches(activitySelectors, matchLimit, textPreviewLength, {
          allowHiddenText: true
        }),
        newChat: traeAutomationCollectSelectorMatches(newChatSelectors, matchLimit, textPreviewLength)
      },
      genericCandidates: {
        composer: traeAutomationCollectGenericMatches(
          ["textarea", "[contenteditable='true']", "input[type='text']", "input:not([type])", "input[type='search']"],
          matchLimit,
          textPreviewLength
        ),
        button: traeAutomationCollectGenericMatches(
          ["button", "[role='button']", "input[type='submit']", "input[type='button']"],
          matchLimit,
          textPreviewLength
        )
      }
    };
  })()`;
}

module.exports = {
  BROWSER_HELPERS_SOURCE,
  DEFAULT_INSPECTION_MATCH_LIMIT,
  DEFAULT_TEXT_PREVIEW_LENGTH,
  buildCaptureExpression,
  buildDiagnosticsExpression,
  buildPrepareInputExpression,
  buildPrepareSessionExpression,
  buildReadinessExpression,
  buildSubmitExpression,
  buildTriggerSubmitExpression
};
