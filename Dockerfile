# 使用更通用的 Node 20 官方镜像，降低部分镜像源缺少特定 slim 标签导致的拉取失败风险。
FROM node:20

# 统一容器内工作目录，避免命令执行路径不一致。
WORKDIR /app

# 先复制依赖清单，利用 Docker 构建缓存加速后续构建。
COPY package*.json ./

# 安装项目依赖（包含 wrangler 等开发依赖）。
RUN npm install

# 复制项目源码到容器中。
COPY . .

# 暴露 Wrangler 本地开发服务端口。
EXPOSE 8787

# 关键参数说明：
# --ip 0.0.0.0 让容器外（宿主机）可访问；
# --port 8787 与端口映射保持一致，便于调试与文档统一。
CMD ["npm", "run", "dev", "--", "--ip", "0.0.0.0", "--port", "8787"]
