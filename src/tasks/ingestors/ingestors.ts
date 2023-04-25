import TaskConstructor from "../taskConstructor";
import Ingestor from "./ingestor";

const ENABLED_INGESTORS = [
    "diavgeiaIngestor"
];

async function createIngestors() {
    const ingestors: { [key: string]: TaskConstructor } = {};

    for (const ingestorName of ENABLED_INGESTORS) {
        const module = (await import(`./${ingestorName}`)).default;
        let [implementation, classConstructor] = module;
        ingestors[implementation] = new class implements TaskConstructor {
            create(name: string): Ingestor {
                return new classConstructor(name);
            }
        };
    }

    return ingestors;
}

export default createIngestors();