import TaskConstructor from "../taskConstructor";
import Summarizer from "./summarizer";

const ENABLED_TASKS = [
    "gptSummarizer"
];

async function createTasks() {
    const tasks: { [key: string]: TaskConstructor } = {};

    for (const task of ENABLED_TASKS) {
        const module = (await import(`./${task}`)).default;
        let [implementation, classConstructor] = module;
        tasks[implementation] = new class implements TaskConstructor {
            create(name: string): Summarizer {
                return new classConstructor(name);
            }
        };
    }

    return tasks;
}

export default createTasks();