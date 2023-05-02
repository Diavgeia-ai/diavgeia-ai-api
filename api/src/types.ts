export type EmbeddingProvider = "OpenAI" | "Cohere";
export type ModelName = "text-embedding-ada-002" | "multilingual-22-12" | "text-davinci-003" | "gpt-4";
export type ValueWithCost<A> = {
    value: A;
    cost: number;
};

export type ViewConfiguration = {
    name: string;
    ingestorTaskId: string;
    textExtractorTaskId: string;
    summarizerTaskId: string;
    embedderTaskId: string;
    dimensionalityReducerTaskId: string;
}