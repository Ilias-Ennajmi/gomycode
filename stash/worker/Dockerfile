FROM python:3.12-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY stash_worker ./stash_worker

ENV PYTHONUNBUFFERED=1 PORT=8080
# One request at a time per instance: each /run works through the queue itself.
CMD exec uvicorn stash_worker.app:app --host 0.0.0.0 --port ${PORT} --workers 1 --timeout-keep-alive 5
