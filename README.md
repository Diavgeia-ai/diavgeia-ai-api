# Diavgeia.ai Backend

## Contribute

### Get started
1. **Set up your .env file**: You'll need API keys for OpenAI and CohereAI.
```bash
cp .env.sample .env && vi .env
```
2. **Start the api server**:
```
docker compose up --build -d
```
You can optionally check that both `diavgeia-db` and `diavgeia-api` are up and running with `docker ps`.

3. **Run the data pipeline**: The below ingests all decisions in the Δ.1 category published during the first 10 days of 2023, using the default components. It will also create a view configuration.
```bash
docker compose exec api run cli -- pipeline --name jan23-10d  --startDate 2023-01-01 --endDate 2023-01-10 --decisionTypes Δ.1
```

### The data pipeline step by step

The data pipeline is split into ingestion, text extraction, embedding creation and dimensionality reduction. These are background tasks that run and depend on each other. A view configuration is a virtual table (PostgreSQL view) with references to a run of each of the four steps, and contains the data produced by the specific pipeline. You can experiment and work on different pipelines at the same time and easily switch between by changing the view configuration you're using to access the resulting data.


To run a custom pipeline step-by-step:

1. **Ingest** some decisions from diavgeia. The below ingests all decisions in the Δ.1 category published during the first 10 days of 2023, using `diavgeia-ingestor`:
```bash
docker compose exec api run cli -- ingest --impl diavgeia-ingestor --name jan23-10d-ing --startDate 2023-01-01 --endDate 2023-01-10 --decisionTypes Δ.1
```
2. **Extract text** from the data you ingested. The below extracts texts from the most recently run ingestor task, using `simple-text-extractor`. You can specify an alternative ingestor task id with `--ingestor-task-id`:
```bash
docker compose exec api run cli -- extract-text --impl simple-text-extractor  --name jan23-10d-te
```
3. **Create embeddings** for the text you extracted. The below creates embeddings for the most recently run text extraction task, using `cohere-one-batch-embedder`. You can specify another text extractor task id with `--text-extractor-task-id`:
```bash
docker compose exec api run cli -- embed --impl cohere-one-batch-embedder --name jan23-10d-emb
```
4. **Create semantic 2D points** that the frontend can visualize for the embeddings you just generated. The below creates semantic points for the most recent embedding. You can specify another embedding task with `--embedder-task-id`:
```bash
docker compose exec api run cli -- dimensionality-reduction --name jan23-10d-red --impl umap-dimensionality-reducer
```

### Write a component

Pipeline components live under `api/src/tasks/`.
