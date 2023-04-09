import {PromisePool} from "@supercharge/promise-pool";

export type DiavgeiaQuery = {
    decisionTypeUid: string[],
    issueDate: [string, string]
}

export const stringEncodeDiavgeiaQuery = (diavgeiaQuery : DiavgeiaQuery) => {
    return `decisionTypeUid:[${diavgeiaQuery.decisionTypeUid.map((x) => `"${x}"`).join(", ")}] AND issueDate:[${diavgeiaQuery.issueDate.map((x) => `${x}`).join(" TO ")}]`;
}

export const diavgeiaSearchQuery = (diavgeiaQuery : DiavgeiaQuery, page : number, size : number) => {
    return `https://diavgeia.gov.gr/opendata/search/advanced.json?q=${stringEncodeDiavgeiaQuery(diavgeiaQuery)}&page=${page}&size=${size}`;
}

export const equalSizes = (embedings : number[][]) => {
    let sizes = embedings.map((x) => x.length);
    return sizes.every((x) => x === sizes[0]);
}

export const combineEmbeddings = (embedings : number[][]) => {
    if (!equalSizes(embedings)) {
        throw new Error("Embeddings must have the same size");
    }

    let combinedEmbedding : number[] = [];
    for (let i = 0; i < embedings[0].length; i++) {
        combinedEmbedding.push(embedings.map((x) => x[i]).reduce((a, b) => a + b, 0));
    }

    return combinedEmbedding;
}

export const sleep = (ms : number) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function doWithPooling<A, B> (elems : A[], func : ((x : A) => Promise<B>), concurrency = 5) : Promise<B[]> {
    let {results, errors} = await PromisePool
        .withConcurrency(concurrency)
        .for(elems)
        .process(func);

    if (errors.length > 0) {
        console.log(`Errors: ${errors.length}`);
        console.log(errors);
        throw new Error(`Errors: ${errors.length}`);
    }

    return results;
}