FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py ./

CMD ["gunicorn", "main:app", "--bind=0.0.0.0:8080", "--workers=1", "--threads=2"]
