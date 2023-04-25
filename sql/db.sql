CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  implementation TEXT NOT NULL,
  name TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  params JSONB,
  metrics JSONB,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  UNIQUE (type, implementation, name, version),
  UNIQUE (name, version)
);

CREATE TABLE decisions (
  id SERIAL PRIMARY KEY,
  ada TEXT NOT NULL,
  decision_type TEXT NOT NULL,
  ingestor_name TEXT NOT NULL,
  ingestor_version INTEGER NOT NULL,
  document_url TEXT NOT NULL,
  metadata JSONB,
  published_at TIMESTAMP NOT NULL,
  ingested_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_ada ON decisions(ada);
CREATE INDEX idx_decision_type ON decisions(decision_type);
CREATE INDEX idx_published_at ON decisions(published_at);

CREATE TABLE texts (
  id SERIAL PRIMARY KEY,
  decision_id INTEGER REFERENCES decisions(id) ON DELETE CASCADE,
  text_extractor_name TEXT NOT NULL,
  text_extractor_version INTEGER NOT NULL,
  text TEXT NOT NULL,
  page_count INTEGER NOT NULL,
  text_extracted_at TIMESTAMP NOT NULL
);

CREATE TABLE embeddings (
  id SERIAL PRIMARY KEY,
  text_id INTEGER REFERENCES texts(id) ON DELETE CASCADE,
  embedding_seq INTEGER NOT NULL,
  embedder_name TEXT NOT NULL,
  embedder_version INTEGER NOT NULL,
  embedded_at TIMESTAMP NOT NULL,
  embedding FLOAT[] NOT NULL
);

CREATE TABLE semantic_points (
  id SERIAL PRIMARY KEY,
  decision_id INTEGER REFERENCES decisions(id) ON DELETE CASCADE,
  reductor_name TEXT NOT NULL,
  reductor_version INTEGER NOT NULL,
  x FLOAT NOT NULL,
  y FLOAT NOT NULL
);
