import TaskConstructor from "../taskConstructor";
import Embedder from "./dimensionalityReducer";

const ENABLED_REDUCERS = [
    "umapDimensionalityReducer",
];

async function createDimensionalityReducers() {
    const dimensionalityReducers: { [key: string]: TaskConstructor } = {};

    for (const dimensionalityReducer of ENABLED_REDUCERS) {
        const module = (await import(`./${dimensionalityReducer}`)).default;
        let [implementation, classConstructor] = module;
        dimensionalityReducers[implementation] = new class implements TaskConstructor {
            create(name: string): Embedder {
                return new classConstructor(name);
            }
        };
    }

    return dimensionalityReducers;
}

export default createDimensionalityReducers();