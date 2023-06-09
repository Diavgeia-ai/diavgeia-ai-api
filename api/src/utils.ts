import { PromisePool } from "@supercharge/promise-pool";
import Logger from './logger';
import { OpenAIApi, Configuration, Model } from "openai";
import dotenv from 'dotenv';
import { ModelName } from './types';
import Cohere from "cohere-ai";
import UsageMonitor from "./UsageMonitor";
import { ValueWithCost } from "./types";

dotenv.config();
const logger = new Logger();
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

export const diavgeiaOrganizationUrl = (organizationId: string) => {
    return `https://diavgeia.gov.gr/opendata/organizations/${organizationId}.json`;
}

export const diavgeiaSignerUrl = (signerId: string) => {
    return `https://diavgeia.gov.gr/opendata/signers/${signerId}.json`;
}

export const diavgeiaUnitUrl = (unitId: string) => {
    return `https://diavgeia.gov.gr/opendata/units/${unitId}.json`;
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

export const generateCohereEmbeddings = async (model: ModelName, texts: string[]): Promise<ValueWithCost<number[][]>> => {
    let embedResponse;
    const cost = 0.001;
    try {
        embedResponse = await Cohere.embed({
            texts: texts,
            model,
            truncate: "END"
        });
    } catch (e) {
        console.log(e);
        throw e;
    } finally {
        UsageMonitor.addCost(cost);
    }

    return {
        cost,
        value: embedResponse.body.embeddings
    };
}

export const generateCohereEmbedding = async (model: ModelName, text: string): Promise<ValueWithCost<number[]>> => {
    let ret = await generateCohereEmbeddings(model, [text]);
    return {
        cost: ret.cost,
        value: ret.value[0]
    };
}

export const isWhitespace = (str: string) => {
    return str === "" || /^\s*$/.test(str);
}

export const modelTokenPriceUsd = {
    // From https://openai.com/pricing/, https://cohere.ai/pricing
    "text-embedding-ada-002": 0.0004 / 1000,
    "multilingual-22-12": 0.0002 / 1000,
    "text-davinci-003": 0.02 / 1000,
    "code-davinci-002": 0.02 / 1000,
    "gpt-4": 0.03 / 1000,
    "gpt-3.5-turbo": 0.002 / 1000
}

const openai = getOpenAIClient();

export async function generateChatGPTResponse(systemMessage: string, userMessage: string, model: ModelName = "gpt-4"): Promise<ValueWithCost<string>> {
    let api = await badChatGPTAPIImport(systemMessage);

    var cost = 0;
    if (userMessage.length > 8000) {
        logger.warn(`User message too long: ${userMessage.length}`);
    }
    let message = userMessage.slice(0, 8000);
    logger.info(`Requesting ChatGPT response at time ${new Date().toISOString()}`);
    var chatResponse = await openai.createChatCompletion({
        model,
        messages: [{
            role: "system",
            content: systemMessage
        }, {
            role: "user",
            content: message,
        }],
        temperature: 0.1,
        max_tokens: 600,
    });
    var textResponse = chatResponse.data.choices[0].message?.content?.trim();
    let tokensUsed = chatResponse.data.usage?.total_tokens || 0;

    //TODO: calculate cost correctly – this is a rough estimate
    cost = modelTokenPriceUsd[model] * tokensUsed;

    UsageMonitor.addCost(cost);
    return {
        value: textResponse as string,
        cost: cost
    };
}

export async function generateOpenAICompletion(model: ModelName, prompt: string, temperature: number): Promise<ValueWithCost<string>> {
    logger.debug(`Completing prompt with model ${model} and temperature ${temperature}, prompt: ${prompt}`);
    if (["gpt-4", "gpt-3.5-turbo"].includes(model)) {
        return generateChatGPTResponse(
            "Complete texts and output only what's requested, acting like a completion model",
            prompt,
            model);
    }

    try {
        var textResponse: string | undefined;
        var tokensUsed: number | undefined;
        let completionResponse = await openai.createCompletion({
            model,
            prompt,
            max_tokens: 2048,
            temperature
        });
        textResponse = completionResponse.data.choices[0].text?.trim();
        tokensUsed = completionResponse.data.usage?.total_tokens;
    } catch (e: any) {
        console.log(e.response.data);
        throw new Error("OpenAI failed to generate query");
    }

    if (!textResponse || !tokensUsed) {
        throw new Error("OpenAI returned an empty response");
    }
    let cost = tokensUsed * modelTokenPriceUsd[model];
    logger.info(`Used ${tokensUsed} tokens for OpenAI response, cost ${cost} USD`)
    UsageMonitor.addCost(cost);

    return {
        value: textResponse,
        cost
    }
}

export const badChatGPTAPIImport = async (systemMessage: string) => {
    // ugh
    const importDynamic = new Function('modulePath', 'return import(modulePath)',);
    const { ChatGPTAPI } = await importDynamic("chatgpt");
    const api = new ChatGPTAPI({
        apiKey: process.env.OPENAI_API_KEY as string,
        completionParams: {
            model: process.env.OPENAI_CHAT_MODEL,
            temperature: 0.1,
            top_p: 0.8,
        },
        maxModelTokens: 7000,
        debug: true,

        systemMessage: systemMessage
    })
    return api;
}
