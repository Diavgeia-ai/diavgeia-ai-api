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

CREATE TABLE summaries (
  id SERIAL PRIMARY KEY,
  text_id INTEGER REFERENCES texts(id) ON DELETE CASCADE,
  summarizer_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  summary TEXT,
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
  dimensionality_reducer_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  x FLOAT NOT NULL,
  y FLOAT NOT NULL
);


CREATE TABLE configurations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  ingestor_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  text_extractor_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  summarizer_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  embedder_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  dimensionality_reducer_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE OR REPLACE FUNCTION configuration_view(configuration_id INTEGER)
RETURNS TABLE (
  ada TEXT,
  decision_metadata JSONB,
  text TEXT,
  document_metadata JSONB,
  embedding VECTOR,
  x FLOAT,
  y FLOAT
) AS $$
BEGIN
  RETURN QUERY
  WITH c AS (
    SELECT * FROM configurations WHERE id = configuration_id
  )
  SELECT
    d.ada,
    d.metadata AS decision_metadata,
    t.text,
    t.summary,
    t.document_metadata,
    AVG(e.embedding) AS embedding,
    sp.x,
    sp.y
  FROM
    decisions d
    LEFT JOIN texts t ON d.id = t.decision_id AND t.text_extractor_task_id = (SELECT text_extractor_task_id FROM c)
    LEFT JOIN summaries s ON t.id = s.text_id AND s.summarizer_task_id = (SELECT summarizer_task_id FROM c)
    LEFT JOIN embeddings e ON t.id = e.text_id AND e.embedder_task_id = (SELECT embedder_task_id FROM c)
    LEFT JOIN semantic_points sp ON d.id = sp.decision_id AND sp.dimensionality_reducer_task_id = (SELECT dimensionality_reducer_task_id FROM c)
  WHERE
    d.ingestor_task_id = (SELECT ingestor_task_id FROM c)
  GROUP BY
    d.ada,
    d.metadata,
    t.text,
    s.summary,
    t.document_metadata,
    sp.x,
    sp.y;
END; $$ LANGUAGE plpgsql;