CREATE EXTENSION vector;

CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  implementation TEXT NOT NULL,
  name TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  params JSONB,
  metrics JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (type, implementation, name, version),
  UNIQUE (name, version)
);

CREATE TABLE decisions (
  id SERIAL PRIMARY KEY,
  ingestor_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  ada TEXT NOT NULL,
  document_url TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_ada ON decisions(ada);
CREATE INDEX idx_created_at ON decisions(created_at);

CREATE TABLE texts (
  id SERIAL PRIMARY KEY,
  decision_id INTEGER REFERENCES decisions(id) ON DELETE CASCADE,
  text_extractor_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  text TEXT,
  document_metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE embeddings (
  id SERIAL PRIMARY KEY,
  text_id INTEGER REFERENCES texts(id) ON DELETE CASCADE,
  embedder_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  embedding_seq INTEGER NOT NULL,
  embedding vector(768) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE semantic_points (
  id SERIAL PRIMARY KEY,
  decision_id INTEGER REFERENCES decisions(id) ON DELETE CASCADE,
  reductor_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  x FLOAT NOT NULL,
  y FLOAT NOT NULL
);

ALTER TABLE semantic_points RENAME COLUMN reductor_task_id TO dimensionality_reducer_task_id;