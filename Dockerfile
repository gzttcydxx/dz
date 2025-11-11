FROM python:3.11-slim

# 环境设置：更快、更稳定的 Python 运行
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

WORKDIR /app

# 仅拷贝依赖声明以优化构建缓存
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# 拷贝项目代码
COPY . .

# 端口暴露（Flask/SocketIO 默认 5000）
EXPOSE 5000

# 生产环境默认关闭调试
ENV DEBUG=False

# 启动应用：使用项目内的入口 main.py
CMD ["python", "main.py"]
