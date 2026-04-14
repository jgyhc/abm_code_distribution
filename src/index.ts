/**
 * 统一构建 JSON 响应，避免多处重复设置响应头。
 */
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
}

/**
 * 统一构建 HTML 响应，保证页面返回时 Content-Type 正确。
 */
function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8"
    }
  });
}

/**
 * 从请求 URL 中读取 name 参数，构造问候语。
 * 可复用于更多路由逻辑，保持 handler 简洁。
 */
function createGreeting(url: URL): string {
  const name = url.searchParams.get("name")?.trim() || "Cloudflare Worker";
  return `Hello, ${name}!`;
}

/**
 * 构造二维码图片地址。
 * 这里使用公开二维码服务，避免在 Worker 端额外引入绘图库依赖。
 */
function createQrImageUrl(text: string, size = 260): string {
  const encodedText = encodeURIComponent(text);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodedText}`;
}

/**
 * 生成首页 HTML。
 * 将页面模板抽成独立函数，后续扩展 UI 时可复用并保持路由层简洁。
 */
function createHomePageHtml(initialQrText: string): string {
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
      <h1 class="title">二维码 Demo 页面</h1>
      <p class="desc">点击按钮可刷新二维码内容</p>
      <div class="qr-wrapper">
        <img id="qrImage" class="qr-image" src="${initialQrUrl}" alt="二维码" />
      </div>
      <button id="refreshBtn" class="action-btn" type="button">刷新二维码</button>
      <p id="qrText" class="footer">${initialQrText}</p>
    </main>
    <script>
      // 根据文本生成二维码地址，与服务端函数保持一致的 URL 规则。
      const buildQrUrl = (text, size = 260) => {
        return \`https://api.qrserver.com/v1/create-qr-code/?size=\${size}x\${size}&data=\${encodeURIComponent(text)}\`;
      };

      const qrImage = document.getElementById("qrImage");
      const qrText = document.getElementById("qrText");
      const refreshBtn = document.getElementById("refreshBtn");

      // 重要交互逻辑：每次点击生成新的文本，更新二维码与底部说明。
      refreshBtn.addEventListener("click", () => {
        const nextText = \`Worker QR @ \${new Date().toISOString()}\`;
        qrImage.src = buildQrUrl(nextText);
        qrText.textContent = nextText;
      });
    </script>
  </body>
</html>`;
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // 基础健康检查接口，便于平台探活和快速验证服务状态。
    if (url.pathname === "/health") {
      return jsonResponse({
        ok: true,
        timestamp: new Date().toISOString()
      });
    }

    // 简单业务示例接口：支持 ?name=xxx 自定义返回内容。
    if (url.pathname === "/greet") {
      return jsonResponse({
        message: createGreeting(url),
        path: url.pathname
      });
    }

    // 默认首页返回页面：包含二维码展示和一个按钮。
    const initialQrText = "Worker QR @ " + new Date().toISOString();
    return htmlResponse(createHomePageHtml(initialQrText));
  }
};
