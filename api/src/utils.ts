import { PromisePool } from "@supercharge/promise-pool";
import Logger from './logger';
import { OpenAIApi, Configuration } from "openai";
import dotenv from 'dotenv';
import { ModelName } from './types';
import Cohere from "cohere-ai";
import UsageMonitor from "./UsageMonitor";
import { ValueWithCost } from "./types";

dotenv.config();
const logger = new Logger();
console.log(`Cohere API key: ${process.env.COHERE_API_KEY}`);
Cohere.init(process.env.COHERE_API_KEY!);

export type DiavgeiaQuery = {
    decisionTypeUid: string[],
    issueDate: [string, string]
}

export const stringEncodeDiavgeiaQuery = (diavgeiaQuery: DiavgeiaQuery) => {
    return `decisionTypeUid:[${diavgeiaQuery.decisionTypeUid.map((x) => `"${x}"`).join(", ")}] AND issueDate:[${diavgeiaQuery.issueDate.map((x) => `${x}`).join(" TO ")}]`;
}

export const diavgeiaSearchQuery = (diavgeiaQuery: DiavgeiaQuery, page: number, size: number) => {
    return `https://diavgeia.gov.gr/opendata/search/advanced.json?q=${stringEncodeDiavgeiaQuery(diavgeiaQuery)}&page=${page}&size=${size}`;
}

export const equalSizes = (embedings: number[][]) => {
    let sizes = embedings.map((x) => x.length);
    return sizes.every((x) => x === sizes[0]);
}

export const combineEmbeddings = (embedings: number[][]) => {
    if (!equalSizes(embedings)) {
        throw new Error("Embeddings must have the same size");
    }

    let combinedEmbedding: number[] = [];
    for (let i = 0; i < embedings[0].length; i++) {
        combinedEmbedding.push(embedings.map((x) => x[i]).reduce((a, b) => a + b, 0));
    }

    return combinedEmbedding;
}

export const sleep = (ms: number) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function doWithPooling<A, B>(elems: A[], func: ((x: A) => Promise<B>), concurrency = 5): Promise<B[]> {
    let { results, errors } = await PromisePool
        .withConcurrency(concurrency)
        .for(elems)
        .useCorrespondingResults()
        .process(func);

    if (errors.length > 0) {
        logger.error(`Errors: ${errors.length}`);
        logger.error(errors.join("\n\n"));
    }

    //@ts-ignore
    return results;
}

export const getOpenAIClient = () => {
    const configuration = new Configuration({
        apiKey: process.env.OPENAI_API_KEY!,
    });
    return new OpenAIApi(configuration);
}

export const generateCohereEmbedding = async (model: ModelName, text: string): Promise<ValueWithCost<number[]>> => {
    let embedResponse;
    const cost = 0.001;
    try {
        embedResponse = await Cohere.embed({
            texts: [text],
            model,
            truncate: "END"
        });
    } catch (e) {
        console.log(e);
        throw e;
    } finally {
        UsageMonitor.addCost(cost);
    }

    console.log("Cohere:");
    console.log(embedResponse);
    return {
        cost,
        value: embedResponse.body.embeddings[0]
    };
}

export const isWhitespace = (str: string) => {
    return str === "" || /^\s*$/.test(str);
}

export const modelTokenPriceUsd = {
    // From https://openai.com/pricing/, https://cohere.ai/pricing
    "text-embedding-ada-002": 0.0004 / 1000,
    "multilingual-22-12": 0.0002 / 1000,
    "text-davinci-003": 0.06 / 1000,
}