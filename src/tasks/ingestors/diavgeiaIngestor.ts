import TaskConstructor from '../taskConstructor';
import Ingestor from './ingestor';
import Task from '../task';
import Logger from '../../logger';

const IMPLEMENTATION = 'diavgeia-ingestor';
class DiavgeiaIngestor extends Ingestor {
    constructor(name: string) {
        super(IMPLEMENTATION, name);
    }

    protected async run(params: object): Promise<void> {
        this.logger.debug('Starting Diavgeia ingestor');
    }
}

export default [IMPLEMENTATION, DiavgeiaIngestor];