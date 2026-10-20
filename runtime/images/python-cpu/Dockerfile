# Base image for learner workspaces AND subject containers (docs/design/11).
# Same toolchain in both => "works in workspace" implies "works in simulator".
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
 && apt-get install -y --no-install-recommends tini procps less nano git \
 && rm -rf /var/lib/apt/lists/*

RUN pip install \
      "numpy==2.2.*" \
      "pillow==11.*" \
      "onnx==1.17.*" \
      "onnxruntime==1.20.*" \
      "scikit-learn==1.6.*" \
      "fastapi==0.115.*" \
      "uvicorn==0.34.*" \
      "httpx==0.28.*" \
      "pyyaml==6.*" \
      "rank-bm25==0.2.*"

RUN groupadd -g 1000 learner \
 && useradd -m -u 1000 -g 1000 -s /bin/bash learner \
 && mkdir -p /workspace /opt/cole \
 && chown learner:learner /workspace

COPY harness.py /opt/cole/harness.py
COPY bashrc /home/learner/.bashrc

USER 1000:1000
WORKDIR /workspace
ENV PS1="\\w $ " HOME=/home/learner

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sleep", "infinity"]
