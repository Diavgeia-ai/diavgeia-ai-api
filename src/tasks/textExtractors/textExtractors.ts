import TaskConstructor from "../taskConstructor";
import TextExtractor from "./textExtractor";
import { DocumentText } from './documentText';

const ENABLED_TEXT_EXTRACTORS = [
    "simpleTextExtractor"
];

async function createTextExtractors() {
    const textExtractors: { [key: string]: TaskConstructor } = {};

    for (const textExtractor of ENABLED_TEXT_EXTRACTORS) {
        const module = (await import(`./${textExtractor}`)).default;
        let [implementation, classConstructor] = module;
        textExtractors[implementation] = new class implements TaskConstructor {
            create(name: string): TextExtractor {
                return new classConstructor(name);
            }
        };
    }

    return textExtractors;
}

export default createTextExtractors();