# Dockerfile
FROM postgres:14

USER root

# Install dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        ca-certificates \
        curl \
        git \
        libpq-dev \
        postgresql-server-dev-14 \
    && rm -rf /var/lib/apt/lists/*

# Install pgvector
RUN cd /tmp \
    && git clone --branch v0.4.1 https://github.com/pgvector/pgvector.git \
    && cd pgvector \
    && make \
    && make install

# Copy the schema file
COPY schema.sql /docker-entrypoint-initdb.d/
