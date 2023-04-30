# Diavgeia.ai Backend

## Get started
Follow the below steps to run the api and ingest some data:

1. **Clone** this repo:
```bash
git clone https://github.com/diavgeia-ai/diavgeia-ai-api && cd diavgeia-ai-api
```
2. **Set up your .env file**: You'll need API keys for OpenAI and CohereAI.
```bash
cp .env.sample .env && vi .env
```
3. **Start the api server**:
```
docker compose up --build -d
```
4. **Check that the database and api is running**: Verify both diavgeia-db and diavgeia-api are up and running:
```bash
docker ps
```
5. **Ingest** some decisions from diavgeia. The below ingests all decisions in the Δ.1 category published during the first 10 days of 2023, using `diavgeia-ingestor`:
```bash
docker exec diavgeia-api npm run cli -- ingest --impl diavgeia-ingestor --name jan23-10d-ing --startDate 2023-01-01 --endDate 2023-01-10 --decisionTypes Δ.1
```
6. **Extract text** from the data you ingested. The below extracts texts from the most recently run ingestor task, using `simple-text-extractor`. You can specify an alternative ingestor task id with `--ingestor-task-id`:
```bash
docker exec diavgeia-api npm run cli -- extract-text --impl simple-text-extractor  --name jan23-10d-te
```
7. **Create embeddings** for the text you extracted. The below creates embeddings for the most recently run text extraction task, using `cohere-one-batch-embedder`. You can specify another text extractor task id with `--text-extractor-task-id`:
```bash
docker exec diavgeia-api npm run cli -- embed --impl cohere-one-batch-embedder --name jan23-10d-emb
```
8. **Create semantic 2D points** that the frontend can visualize for the embeddings you just generated. The below creates semantic points for the most recent embedding. You can specify another embedding task with `--embedder-task-id`:
```bash
docker exec diavgeia-api npm run cli -- embed --impl umap-reductor --name jan23-10d-red
```