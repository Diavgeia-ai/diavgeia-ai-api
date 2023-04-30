export type EmbeddingProvider = "OpenAI" | "Cohere";
export type ModelName = "text-embedding-ada-002" | "multilingual-22-12" | "text-davinci-003";
export type ValueWithCost<A> = {
    value: A;
    cost: number;
};