import Task from '../task';
import { SemanticPoint } from './semanticPoint';

export default abstract class DimensionalityReducer extends Task {
    constructor(type: string, name: string) {
        super('dimensionality-reducer', type, name);
    }

    protected async saveSemanticPoints(semanticPoints: SemanticPoint[]) {
        this.logger.info(`Saving ${semanticPoints.length} semantic points...`);
        await this.db.query('START TRANSACTION');
        for (let point of semanticPoints) {
            await this.db.query('INSERT INTO semantic_points (dimensionality_reducer_task_id, decision_id, x, y) VALUES ($1, $2, $3, $4)', [
                this.id,
                point.decisionId,
                point.x,
                point.y
            ]);
        }
        await this.db.query('COMMIT');
    }
}