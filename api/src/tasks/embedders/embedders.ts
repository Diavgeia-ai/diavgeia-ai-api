import TaskConstructor from "../taskConstructor";
import Embedder from "./embedder";

const ENABLED_EMBEDDERS = [
    "cohereEmbedder",
];

async function createEmbedders() {
    const embedders: { [key: string]: TaskConstructor } = {};

    for (const embedder of ENABLED_EMBEDDERS) {
        const module = (await import(`./${embedder}`)).default;
        let [implementation, classConstructor] = module;
        embedders[implementation] = new class implements TaskConstructor {
            create(name: string): Embedder {
                return new classConstructor(name);
            }
        };
    }

    return embedders;
}

export default createEmbedders();