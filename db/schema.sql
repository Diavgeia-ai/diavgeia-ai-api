CREATE EXTENSION vector;

/*
 * 1. Tasks
 */
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

/*
 * 2. Task-extracted entities: the following tables contain a _task_id row that references the task that created them.
 */

CREATE TABLE decisions (
  id SERIAL PRIMARY KEY,
  ingestor_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  ada TEXT NOT NULL,
  document_url TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(ingestor_task_id, ada)
);

CREATE TABLE organizations (
  id SERIAL PRIMARY KEY,
  ingestor_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  diavgeia_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  vat_number TEXT,
  raw_data JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(ingestor_task_id, diavgeia_id)
);

CREATE TABLE signers (
  id SERIAL PRIMARY KEY,
  ingestor_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  diavgeia_id TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  organization_diavgeia_id TEXT,
  raw_data JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(ingestor_task_id, diavgeia_id),
  CONSTRAINT fk_signers_organizations
    FOREIGN KEY (ingestor_task_id, organization_diavgeia_id)
    REFERENCES organizations(ingestor_task_id, diavgeia_id) ON DELETE CASCADE
);

CREATE TABLE units (
  id SERIAL PRIMARY KEY,
  ingestor_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  diavgeia_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  raw_data JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(ingestor_task_id, diavgeia_id)
);

ALTER TABLE decisions ADD COLUMN organization_diavgeia_id TEXT ;
ALTER TABLE decisions ADD CONSTRAINT fk_decisions_organization
  FOREIGN KEY (ingestor_task_id, organization_diavgeia_id)
  REFERENCES organizations(ingestor_task_id, diavgeia_id) ON DELETE CASCADE;

CREATE TABLE decision_units (
  id SERIAL PRIMARY KEY,
  ingestor_task_id INTEGER,
  decision_ada TEXT,
  unit_diavgeia_id TEXT,
  UNIQUE(ingestor_task_id, decision_ada, unit_diavgeia_id),
  CONSTRAINT fk_decision_units_units
    FOREIGN KEY (ingestor_task_id, unit_diavgeia_id)
    REFERENCES units(ingestor_task_id, diavgeia_id) ON DELETE CASCADE,
  CONSTRAINT fk_decision_units_decisions
    FOREIGN KEY (ingestor_task_id, decision_ada)
    REFERENCES decisions(ingestor_task_id, ada) ON DELETE CASCADE
);

CREATE TABLE decision_signers (
  id SERIAL PRIMARY KEY,
  ingestor_task_id INTEGER,
  decision_ada TEXT,
  signer_diavgeia_id TEXT,
  UNIQUE(ingestor_task_id, decision_ada, signer_diavgeia_id),
  CONSTRAINT fk_decision_signers_signers
    FOREIGN KEY (ingestor_task_id, signer_diavgeia_id)
    REFERENCES signers(ingestor_task_id, diavgeia_id) ON DELETE CASCADE,
  CONSTRAINT fk_decision_signers_decisions
    FOREIGN KEY (ingestor_task_id, decision_ada)
    REFERENCES decisions(ingestor_task_id, ada) ON DELETE CASCADE
);

CREATE TABLE texts (
  id SERIAL PRIMARY KEY,
  decision_id INTEGER REFERENCES decisions(id) ON DELETE CASCADE,
  text_extractor_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  text TEXT,
  document_metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(text_extractor_task_id, decision_id)
);

CREATE TABLE summaries (
  id SERIAL PRIMARY KEY,
  text_id INTEGER REFERENCES texts(id) ON DELETE CASCADE,
  summarizer_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  summary TEXT,
  extracted_data JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(summarizer_task_id, text_id)
);

CREATE TABLE embeddings (
  id SERIAL PRIMARY KEY,
  text_id INTEGER REFERENCES texts(id) ON DELETE CASCADE,
  embedder_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  embedding_seq INTEGER NOT NULL,
  embedding vector(768) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(embedder_task_id, text_id, embedding_seq)
);

CREATE TABLE semantic_points (
  id SERIAL PRIMARY KEY,
  decision_id INTEGER REFERENCES decisions(id) ON DELETE CASCADE,
  dimensionality_reducer_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  x FLOAT NOT NULL,
  y FLOAT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(dimensionality_reducer_task_id, decision_id)
);

/*
 * 3. Configurations and data views: a configuration is a set of task IDs that can be used to render a view of the data.
 */

CREATE TABLE configurations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  ingestor_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  text_extractor_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  summarizer_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  embedder_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  dimensionality_reducer_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(ingestor_task_id, text_extractor_task_id, summarizer_task_id, embedder_task_id, dimensionality_reducer_task_id)
);

CREATE OR REPLACE FUNCTION decisions_view(configuration_id INTEGER)
RETURNS TABLE (
  ada TEXT,
  organization_id TEXT,
  decision_metadata JSONB,
  text TEXT,
  summary TEXT,
  extracted_data JSONB,
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
    d.organization_diavgeia_id AS organization_id,
    d.metadata AS decision_metadata,
    t.text,
    s.summary,
    s.extracted_data AS extracted_data,
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
    d.organization_diavgeia_id,
    t.text,
    s.summary,
    s.extracted_data,
    t.document_metadata,
    sp.x,
    sp.y;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION organizations_view(configuration_id INTEGER)
RETURNS TABLE (
  id TEXT,
  name TEXT,
  category TEXT,
  raw_data JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH c AS (
    SELECT * FROM configurations WHERE configurations.id = configuration_id
  )
  SELECT
    o.diavgeia_id AS id,
    o.name AS name,
    o.category AS category,
    o.raw_data AS raw_data
  FROM
    organizations o
  WHERE
    o.ingestor_task_id = (SELECT ingestor_task_id FROM c);
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION signers_view(configuration_id INTEGER)
RETURNS TABLE (
  id TEXT,
  first_name TEXT,
  last_name TEXT,
  organization_id TEXT,
  raw_data JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH c AS (
    SELECT * FROM configurations WHERE configurations.id = configuration_id
  )
  SELECT
    s.diavgeia_id AS id,
    s.first_name AS first_name,
    s.last_name AS last_name,
    s.organization_diavgeia_id AS organization_id,
    s.raw_data AS raw_data
  FROM
    signers s
  WHERE
    s.ingestor_task_id = (SELECT ingestor_task_id FROM c);
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION units_view(configuration_id INTEGER)
RETURNS TABLE (
  id TEXT,
  name TEXT,
  category TEXT,
  raw_data JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH c AS (
    SELECT * FROM configurations WHERE configurations.id = configuration_id
  )
  SELECT
    u.diavgeia_id AS id,
    u.name AS name,
    u.category AS category,
    u.raw_data AS raw_data
  FROM
    units u
  WHERE
    u.ingestor_task_id = (SELECT ingestor_task_id FROM c);
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decision_units_view(configuration_id INTEGER)
RETURNS TABLE (
  decision_ada TEXT,
  unit_id TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH c AS (
    SELECT * FROM configurations WHERE configurations.id = configuration_id
  )
  SELECT
    du.decision_ada AS decision_ada,
    du.unit_diavgeia_id AS unit_id
  FROM
    decision_units du
  WHERE
    du.ingestor_task_id = (SELECT ingestor_task_id FROM c);
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decision_signers_view(configuration_id INTEGER)
RETURNS TABLE (
  decision_ada TEXT,
  signer_id TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH c AS (
    SELECT * FROM configurations WHERE configurations.id = configuration_id
  )
  SELECT
    ds.decision_ada AS decision_ada,
    ds.signer_diavgeia_id AS signer_id
  FROM
    decision_signers ds
  WHERE
    ds.ingestor_task_id = (SELECT ingestor_task_id FROM c);
END; $$ LANGUAGE plpgsql;