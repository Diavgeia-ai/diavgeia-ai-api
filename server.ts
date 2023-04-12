import express from 'express';
import { generateCohereEmbedding, getOpenAIClient, getOrCreateChromaCollection } from './src/utils';
import { Collection } from 'chromadb';
import { generateChromaQuery } from './src/generateQuery';
//@ts-expect-error no types
import throttle from 'express-throttle';
import { Response } from 'express';
import { ValueWithCost } from './src/types';
import apicache from 'apicache';
import { GetEmbeddingIncludeEnum } from 'chromadb/dist/main/generated';

const app = express();
var decisions : Collection;
const EMBEDDING_MODEL = "multilingual-22-12";
const DEFAULT_RESULT_COUNT = 25;

let getQueryEmbedding = async (query : string) : Promise<ValueWithCost<number[]>> => {
    return {
        value: await generateCohereEmbedding(EMBEDDING_MODEL, query),
        cost: 1 / 1000
    }
};

let throttling = {
    "rate": "30/m",
    "key": () => "everyone",
    "on_throttled": (_ : any, res : Response) => {
        res.status(503).send({"error": "System is overloaded, please try again later"});
    }
};

let getEmbeddings = async (decisions : Collection, ids : string[]) : Promise<number[][]> => {
    let response = await decisions.get(ids, undefined, undefined, undefined, [GetEmbeddingIncludeEnum.Embeddings]);
    let embeddings = response.embeddings;
    console.log(embeddings.length);
    return embeddings;
}

let cache = apicache.options({
    defaultDuration: '1 hour',
    statusCodes: {include: [200]}
}).middleware

app.get('/search', cache(), throttle(throttling), async (req, res) => {
    let query = req.query.q;
    let n = parseInt(req.query.n as string);
    let startTime = Date.now();
    let searchCost = 0;

    if (isNaN(n)) {
        n = DEFAULT_RESULT_COUNT;
    }

    if (query === undefined) {
        res.status(400).send("Missing query");
        return;
    }

    if (typeof query !== "string") {
        res.status(400).send("Query must be a string");
        return;
    }

    let queryToEmbed : string;
    let whereObj : {[key: string]: any} | undefined;
    try {
        let {cost, value} = await generateChromaQuery(query);
        [queryToEmbed, whereObj] = value;
        searchCost += cost;
    } catch (e) {
        res.status(500).send({"error": "Failed to generate query"});
        return;
    }

    const {cost, value: embedding} = await getQueryEmbedding(queryToEmbed);
    searchCost += cost;
    // decisionType is always "Δ.1" for the demo
    let whereDecisionType = whereObj.decisionType; 
    delete whereObj.decisionType;

    let where = {
        "$and": [
            whereObj,
            {"hasDocument": {"$eq": "true"}},
            {"textExtractionFailure": {"$eq": "false"}}
        ].filter((x) => Object.keys(x).length > 0) // necessary for a bug in chromadb
    }

    const response = await decisions.query(embedding, n, where);

    //re-add the decision type
    whereObj.decisionType = whereDecisionType;

    if (response.error || response.detail) {
        console.log(response);
        res.status(500).send({"error": "Failed to query"});
        return;
    }

    if (response.ids[0].length === 0) {
        res.send({results: []});
        return;
    }

    let results = [];
    console.log(response);
    for (let i = 0; i < response.ids[0].length; i++) {
        results.push({
            id: response.ids[0][i],
            distance: response.distances[0][i],
            subject: response.metadatas[0][i].subject,
            metadata: response.metadatas[0][i]
        });
    }

    let endTime = Date.now();
    let timeMs = endTime - startTime;
    res.send({
        queryMetadata: {
            resultCount: results.length,
            semanticQuery: queryToEmbed,
            whereQuery: whereObj,
            cost: searchCost,
            timeMs,
            queryEmbedding: embedding
        },
        results
    });
});

app.get('/embeddings', async (req, res) => {
    //@ts-ignore
    let idsString : string = req.query.ids;
    let ids = idsString.split(",");

    if (ids === undefined) {
        res.status(400).send({"error": "Missing ids"});
        return;
    }

    if (!Array.isArray(ids)) {
        res.status(400).send({"error": "Ids must be an array"});
        return;
    }

    let embeddings = await getEmbeddings(decisions, ids);

    res.send({
        embeddings
    });
});

app.get('/status', async (req, res) => {
    let decisionCount = await decisions.count();

    res.send({
        decisionCount
    });
});

app.get('/embed', async (req, res) => {
    let query = req.query.q;
    if (query === undefined) {
        res.status(400).send("Missing query");
        return;
    }

    try {
        var {cost, value} = await getQueryEmbedding(query as string);
    } catch (e) {
        console.log(e);
        res.status(500).send({"error": "Failed to generate query"});
        return;
    }

    res.send({
        query: query,
        embedding: value,
        cost
    });
});


const start = async () => {
    decisions = await getOrCreateChromaCollection(process.env.CHROMA_COLLECTION!);
    let port = process.env.PORT || 3000;
    app.listen(port, () => {
        console.log(`Server started on port ${port}`);
    });
}

start();