var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
}
__name(jsonResponse, "jsonResponse");
function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8"
    }
  });
}
__name(htmlResponse, "htmlResponse");
function createGreeting(url) {
  const name = url.searchParams.get("name")?.trim() || "Cloudflare Worker";
  return `Hello, ${name}!`;
}
__name(createGreeting, "createGreeting");
function createQrImageUrl(text, size = 260) {
  const encodedText = encodeURIComponent(text);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodedText}`;
}
__name(createQrImageUrl, "createQrImageUrl");
function createHomePageHtml(initialQrText) {
  const initialQrUrl = createQrImageUrl(initialQrText);
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Cloudflare Workers QR Demo</title>
    <style>
      :root {
        color-scheme: light;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(145deg, #f5f8ff, #eef2ff);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC",
          "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      }
      .card {
        width: 320px;
        background: #fff;
        border-radius: 14px;
        padding: 24px;
        box-shadow: 0 10px 28px rgba(35, 46, 80, 0.14);
        text-align: center;
      }
      .title {
        margin: 0 0 12px;
        font-size: 20px;
        color: #222;
      }
      .desc {
        margin: 0 0 16px;
        font-size: 14px;
        color: #5b6470;
      }
      .qr-wrapper {
        width: 260px;
        height: 260px;
        margin: 0 auto 16px;
        border: 1px solid #e7eaf3;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #fafbfd;
      }
      .qr-image {
        width: 240px;
        height: 240px;
      }
      .action-btn {
        width: 100%;
        border: none;
        border-radius: 10px;
        padding: 12px 14px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        color: #fff;
        background: #2f6df6;
      }
      .action-btn:hover {
        background: #295fda;
      }
      .footer {
        margin-top: 10px;
        font-size: 12px;
        color: #7c8593;
        word-break: break-all;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <h1 class="title">\u4E8C\u7EF4\u7801 Demo \u9875\u9762</h1>
      <p class="desc">\u70B9\u51FB\u6309\u94AE\u53EF\u5237\u65B0\u4E8C\u7EF4\u7801\u5185\u5BB9</p>
      <div class="qr-wrapper">
        <img id="qrImage" class="qr-image" src="${initialQrUrl}" alt="\u4E8C\u7EF4\u7801" />
      </div>
      <button id="refreshBtn" class="action-btn" type="button">\u5237\u65B0\u4E8C\u7EF4\u7801</button>
      <p id="qrText" class="footer">${initialQrText}</p>
    </main>
    <script>
      // \u6839\u636E\u6587\u672C\u751F\u6210\u4E8C\u7EF4\u7801\u5730\u5740\uFF0C\u4E0E\u670D\u52A1\u7AEF\u51FD\u6570\u4FDD\u6301\u4E00\u81F4\u7684 URL \u89C4\u5219\u3002
      const buildQrUrl = (text, size = 260) => {
        return \`https://api.qrserver.com/v1/create-qr-code/?size=\${size}x\${size}&data=\${encodeURIComponent(text)}\`;
      };

      const qrImage = document.getElementById("qrImage");
      const qrText = document.getElementById("qrText");
      const refreshBtn = document.getElementById("refreshBtn");

      // \u91CD\u8981\u4EA4\u4E92\u903B\u8F91\uFF1A\u6BCF\u6B21\u70B9\u51FB\u751F\u6210\u65B0\u7684\u6587\u672C\uFF0C\u66F4\u65B0\u4E8C\u7EF4\u7801\u4E0E\u5E95\u90E8\u8BF4\u660E\u3002
      refreshBtn.addEventListener("click", () => {
        const nextText = \`Worker QR @ \${new Date().toISOString()}\`;
        qrImage.src = buildQrUrl(nextText);
        qrText.textContent = nextText;
      });
    <\/script>
  </body>
</html>`;
}
__name(createHomePageHtml, "createHomePageHtml");
var src_default = {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return jsonResponse({
        ok: true,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    if (url.pathname === "/greet") {
      return jsonResponse({
        message: createGreeting(url),
        path: url.pathname
      });
    }
    const initialQrText = "Worker QR @ " + (/* @__PURE__ */ new Date()).toISOString();
    return htmlResponse(createHomePageHtml(initialQrText));
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-t3nemN/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-t3nemN/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
