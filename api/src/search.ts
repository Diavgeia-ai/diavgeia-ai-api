import { getLatestConfiguration } from "./db";
import { generateChromaQuery } from "./generateQuery";
import { ValueWithCost } from "./types";
import { generateCohereEmbedding } from "./utils";
//@ts-ignore
import pgvector from 'pgvector/pg';
import { db } from "./db";
const EMBEDDING_MODEL = "multilingual-22-12";

export const getQueryEmbedding = async (query: string): Promise<ValueWithCost<number[]>> => {
    return generateCohereEmbedding(EMBEDDING_MODEL, query);
};

const emptyResponse = {
    ids: [[]],
    distances: [[]],
    metadatas: [[]],
    documents: [[]]
};

const search = async (query: string, n: number) => {
    let startTime = Date.now();
    let searchCost = 0;


    let queryToEmbed: string;
    let whereObj: { [key: string]: any } | undefined;
    try {
        let { cost, value } = await generateChromaQuery(query);
        [queryToEmbed, whereObj] = value;
        searchCost += cost;
    } catch (e) {
        throw new Error("Failed to generate query");
        return;
    }

    console.log(`Query to embed: ${queryToEmbed}`);
    const { cost, value: embedding } = await getQueryEmbedding(queryToEmbed);
    searchCost += cost;
    // decisionType is always "Δ.1" for the demo
    let whereDecisionType = whereObj.decisionType;
    delete whereObj.decisionType;

    let where = whereObj;
    console.log(JSON.stringify(where));

    const configurationId = await getLatestConfiguration();
    console.log(`Configuration ID: ${configurationId}`);
    let results = await db.query(
        `SELECT
            ada,
            decision_metadata,
            summary,
            text,
            document_metadata,
            x, y,
            embedding <-> $2 AS distance
        FROM decisions_view($1)
        ORDER BY embedding <-> $2
        LIMIT $3`,
        [configurationId, pgvector.toSql(embedding), n]
    );

    //re-add the decision type
    whereObj.decisionType = whereDecisionType;

    let endTime = Date.now();
    let timeMs = endTime - startTime;


    return {
        queryMetadata: {
            resultCount: results.rows.length,
            semanticQuery: queryToEmbed,
            whereQuery: whereObj,
            cost: searchCost,
            timeMs,
            queryEmbedding: embedding
        },
        results: results.rows
    };
}

export default search;