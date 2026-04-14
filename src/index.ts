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
 * 从请求 URL 中读取 name 参数，构造问候语。
 * 可复用于更多路由逻辑，保持 handler 简洁。
 */
function createGreeting(url: URL): string {
  const name = url.searchParams.get("name")?.trim() || "Cloudflare Worker";
  return `Hello, ${name}!`;
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

    // 默认首页返回 demo 信息，方便首次部署后验证。
    return jsonResponse({
      project: "abm_code_distribution",
      demo: "cloudflare-workers",
      message: "Worker is running",
      endpoints: ["/health", "/greet?name=Alice"]
    });
  }
};
