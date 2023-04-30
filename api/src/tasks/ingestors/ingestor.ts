import Task from '../task';

export default abstract class Ingestor extends Task {
    constructor(type: string, name: string) {
        super('ingestor', type, name);
    }
}