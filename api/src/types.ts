export type EmbeddingProvider = "OpenAI" | "Cohere";
export type ModelName = "code-davinci-002" |
    "text-embedding-ada-002" |
    "multilingual-22-12" |
    "text-davinci-003" |
    "gpt-4" |
    "gpt-3.5-turbo";
export type ValueWithCost<A> = {
    value: A;
    cost: number;
};

export type ViewConfiguration = {
    name: string;
    ingestorTaskId: string;
    textExtractorTaskId: string;
    summarizerTaskId?: string;
    embedderTaskId: string;
    dimensionalityReducerTaskId: string;
}