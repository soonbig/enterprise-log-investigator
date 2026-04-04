FROM docker.io/cloudflare/sandbox:0.8.4-python
# numpy, pandas, matplotlib pre-installed — no additional packages needed
ENV MPLBACKEND=Agg

# Install Japanese fonts for matplotlib chart labels
RUN apt-get update && apt-get install -y fonts-noto-cjk && rm -rf /var/lib/apt/lists/*

# Clear matplotlib font cache so it picks up new fonts
RUN rm -rf /root/.cache/matplotlib
