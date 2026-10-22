/* Shared preview runtime. Injected into the renderer iframe by the host.
   Renderers never implement editing, formatting, printing, or overflow checks. */
(function () {
  var editing = true;
  var lastRange = null;
  var overflowTimer = 0;

  function post(message) {
    try {
      window.parent.postMessage(message, "*");
    } catch (_) {
      /* ignore */
    }
  }

  function fieldElements() {
    return Array.prototype.slice.call(document.querySelectorAll("[data-field]"));
  }

  function plainText(el) {
    return String(el.innerText || el.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "")
      .trim();
  }

  /** Mirrors resolveAnchorTarget in src/core/render/link.ts. */
  function anchorTarget(value) {
    var raw = String(value == null ? "" : value).trim();
    if (!/^(https?:|mailto:)/i.test(raw)) return null;
    try {
      var url = new URL(raw);
      if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") {
        return url.href;
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  function sanitizeHtml(html) {
    var template = document.createElement("template");
    template.innerHTML = String(html || "");
    var allowed = {
      B: true,
      STRONG: true,
      I: true,
      EM: true,
      U: true,
      BR: true,
      SPAN: true,
      DIV: true,
      P: true,
      A: true,
    };
    function unwrap(element, parent) {
      while (element.firstChild) {
        var moved = element.firstChild;
        parent.insertBefore(moved, element);
        cleanElement(moved, parent);
      }
      element.remove();
    }
    function cleanElement(element, parent) {
      if (element.nodeType === 3) return;
      if (element.nodeType !== 1) {
        element.remove();
        return;
      }
      var tag = element.tagName.toUpperCase();
      if (!allowed[tag]) {
        unwrap(element, parent);
        return;
      }
      if (tag === "A") {
        var target = anchorTarget(element.getAttribute("href") || "");
        if (!target) {
          // An unsafe or missing target renders as plain text, not a dead link.
          unwrap(element, parent);
          return;
        }
        Array.prototype.slice.call(element.attributes).forEach(function (attr) {
          element.removeAttribute(attr.name);
        });
        element.setAttribute("href", target);
      } else {
        Array.prototype.slice.call(element.attributes).forEach(function (attr) {
          if (tag === "SPAN" && attr.name === "style") {
            var ok = /^font-size\s*:\s*[\d.]+pt;?$/i.test(attr.value.trim());
            if (!ok) element.removeAttribute(attr.name);
          } else {
            element.removeAttribute(attr.name);
          }
        });
      }
      cleanChildren(element);
    }
    function cleanChildren(parent) {
      Array.prototype.slice.call(parent.childNodes).forEach(function (child) {
        cleanElement(child, parent);
      });
    }
    cleanChildren(template.content);
    return template.innerHTML;
  }

  function postEdit(el) {
    var path = el.getAttribute("data-field");
    if (!path) return;
    post({
      type: "cv:edit",
      path: path,
      text: plainText(el),
      html: sanitizeHtml(el.innerHTML),
    });
  }

  function postAllFields() {
    post({
      type: "cv:sync",
      fields: fieldElements().map(function (el) {
        return {
          path: el.getAttribute("data-field"),
          text: plainText(el),
          html: sanitizeHtml(el.innerHTML),
        };
      }),
    });
  }

  function setEditing(enabled) {
    editing = !!enabled;
    document.body.classList.toggle("cv-editing", editing);
    fieldElements().forEach(function (el) {
      if (editing) el.setAttribute("contenteditable", "true");
      else el.removeAttribute("contenteditable");
    });
  }

  function applyStyle(vars) {
    if (!vars || typeof vars !== "object") return;
    Object.keys(vars).forEach(function (key) {
      document.documentElement.style.setProperty(key, String(vars[key]));
    });
    queueOverflowCheck();
  }

  function rememberSelection() {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return;
    var range = sel.getRangeAt(0);
    var node = range.commonAncestorContainer;
    var el = node.nodeType === 1 ? node : node.parentElement;
    if (el && el.closest && el.closest("[data-field]")) {
      lastRange = range.cloneRange();
    }
  }

  function restoreSelection() {
    if (!lastRange) return;
    var sel = window.getSelection();
    if (!sel) return;
    if (!sel.rangeCount || sel.isCollapsed) {
      sel.removeAllRanges();
      sel.addRange(lastRange);
    }
  }

  function applyCommand(command) {
    if (!editing) return;
    restoreSelection();
    try {
      document.execCommand(command, false, null);
    } catch (_) {
      /* ignore */
    }
    postAllFields();
  }

  function applyFontSize(pt) {
    if (!editing) return;
    var size = Math.min(48, Math.max(5, Number(pt) || 9));
    restoreSelection();
    try {
      document.execCommand("fontSize", false, "7");
    } catch (_) {
      return;
    }
    Array.prototype.slice.call(document.querySelectorAll('font[size="7"]')).forEach(function (font) {
      var span = document.createElement("span");
      span.style.fontSize = size + "pt";
      while (font.firstChild) span.appendChild(font.firstChild);
      font.replaceWith(span);
    });
    postAllFields();
  }

  function checkOverflow() {
    var pages = Array.prototype.slice.call(document.querySelectorAll("[data-cv-page]"));
    var clipped = false;
    pages.forEach(function (page) {
      if (page.scrollHeight > page.clientHeight + 2) clipped = true;
    });
    Array.prototype.slice.call(document.querySelectorAll("[data-cv-overflow-watch]")).forEach(function (el) {
      if (el.scrollHeight > el.clientHeight + 2) clipped = true;
    });
    post({ type: "cv:overflow", clipped: clipped, pages: pages.length });
  }

  function queueOverflowCheck() {
    window.clearTimeout(overflowTimer);
    overflowTimer = window.setTimeout(checkOverflow, 120);
  }

  document.addEventListener("input", function (event) {
    var target = event.target;
    var el = target && target.closest ? target.closest("[data-field]") : null;
    if (el) postEdit(el);
    queueOverflowCheck();
  });

  document.addEventListener("blur", function (event) {
    var target = event.target;
    var el = target && target.closest ? target.closest("[data-field]") : null;
    if (el) postEdit(el);
  }, true);

  document.addEventListener("selectionchange", rememberSelection);

  // In editing mode the stylesheet keeps anchors out of the pointer's way so a
  // click places the caret. Outside editing mode the preview must not navigate
  // itself when a link is clicked; open the target in a new tab instead.
  document.addEventListener("click", function (event) {
    var target = event.target;
    var anchor = target && target.closest ? target.closest("a[href]") : null;
    if (!anchor) return;
    event.preventDefault();
    if (editing) return;
    var href = anchorTarget(anchor.getAttribute("href"));
    if (href) window.open(href, "_blank", "noopener");
  });

  window.addEventListener("message", function (event) {
    if (event.source !== window.parent) return;
    var data = event.data;
    if (!data || typeof data !== "object") return;
    switch (data.type) {
      case "cv:set-editing":
        setEditing(data.enabled);
        break;
      case "cv:style":
        applyStyle(data.vars);
        break;
      case "cv:format":
        applyCommand(data.command);
        break;
      case "cv:font-size":
        applyFontSize(data.pt);
        break;
      case "cv:print":
        if (data.title) document.title = data.title;
        window.print();
        break;
      case "cv:set-title":
        document.title = data.title || document.title;
        break;
      case "cv:check-overflow":
        checkOverflow();
        break;
      default:
        break;
    }
  });

  function init() {
    setEditing(editing);
    if (window.ResizeObserver) {
      var observer = new ResizeObserver(queueOverflowCheck);
      Array.prototype.slice.call(document.querySelectorAll("[data-cv-page]")).forEach(function (page) {
        observer.observe(page);
      });
    }
    queueOverflowCheck();
    post({ type: "cv:ready" });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
