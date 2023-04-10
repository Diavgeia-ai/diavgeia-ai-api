import express from 'express';
import { getOpenAIClient, getOrCreateChromaCollection } from './src/utils';
import { Collection } from 'chromadb';

const app = express();
var decisions : Collection;
const openai = getOpenAIClient();
const EMBEDDING_MODEL = "text-embedding-ada-002";

let getQueryEmbedding = async (query : string) => {
    let response = await openai.createEmbedding({
        model: EMBEDDING_MODEL,
        input: query
    });

    return response.data.data[0].embedding;
};

app.get('/query', async (req, res) => {
    let query = req.query.q;
    if (query === undefined) {
        res.status(400).send("Missing query");
        return;
    }

    if (typeof query !== "string") {
        res.status(400).send("Query must be a string");
        return;
    }

    const embedding = await getQueryEmbedding(query);
    const results = await decisions.query(embedding, 1);

    res.send(results.ids[0]);
});


app.get('/status', async (req, res) => {
    let count = await decisions.count();

    res.send({
        count
    });
});

const start = async () => {
    decisions = await getOrCreateChromaCollection(process.env.CHROMA_COLLECTION!);
    app.listen(3000, () => {
        console.log(`Server started on port ${3000}`);
    });
}

start();