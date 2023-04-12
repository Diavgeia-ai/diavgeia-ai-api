import Logger from './logger';
import env from 'dotenv';
import { ModelName } from './types';
import { modelTokenPriceUsd } from './utils';

env.config();

class EmbeddingUsageMonitor {
    private _maxCostUsd: number;
    private _totalCost: number;
    private _logger = new Logger("Usage Monitor");

    constructor(maxCostUsd: number) {
        this._maxCostUsd = maxCostUsd;
        this._totalCost = 0;
        this._logger.info(`Maximum cost set to ${this._maxCostUsd} USD`);
    }

    addTokens(model : ModelName, tokens: number) {
        if (!(model in modelTokenPriceUsd)) {
            throw new Error(`Unknown model ${model}`);
        }
        this.addCost(tokens * modelTokenPriceUsd[model]);
    }

    addCost(cost: number) {
        this._totalCost += cost;
        this._logger.info(`Total cost so far: ${this._totalCost} USD`);

        if (this._totalCost > this._maxCostUsd) {
            this._logger.error(`Maximum cost exceeded – exiting!`);
            process.exit(1);
        }
    }

    get totalCost(): number {
        return this._totalCost;
    }

    get maxCost(): number {
        return this._maxCostUsd;
    }
}

const UsageMonitor = new EmbeddingUsageMonitor(process.env.MAX_COST_USD ? parseFloat(process.env.MAX_COST_USD) : 10);

export default UsageMonitor;