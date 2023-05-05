import Task from '../task';
import { Decision } from './decision'
import { Organization } from './organization'
import { Unit } from './unit'
import { Signer } from './signer'

export default abstract class Ingestor extends Task {
    constructor(type: string, name: string) {
        super('ingestor', type, name);
    }

    protected async saveDecisions(decisions: Decision[]) {
        this.logger.info(`Saving ${decisions.length} decisions...`);
        for (let decision of decisions) {
            console.log("Inserting ada ", decision.ada, " into db");
            await this.db.query(
                'INSERT INTO decisions (ingestor_task_id, ada, document_url, metadata, organization_diavgeia_id) VALUES ($1, $2, $3, $4, $5)', [
                this.id,
                decision.ada,
                decision.documentUrl,
                decision.metadata,
                decision.organizationDiavgeiaId,
            ]);
        }
    }

    protected async saveOrganizations(organizations: Organization[]) {
        this.logger.info(`Saving ${organizations.length} organizations...`);
        for (let organization of organizations) {
            await this.db.query(
                'INSERT INTO organizations (ingestor_task_id, diavgeia_id, name, category, vat_number, raw_data) VALUES ($1, $2, $3, $4, $5, $6) ', [
                this.id,
                organization.diavgeiaId,
                organization.name,
                organization.category,
                organization.vatNumber,
                organization.rawData,
            ]);
        }
    }

    protected async saveUnits(units: Unit[]) {
        this.logger.info(`Saving ${units.length} units...`);
        for (let unit of units) {
            await this.db.query(
                'INSERT INTO units (ingestor_task_id, diavgeia_id, name, raw_data) VALUES ($1, $2, $3, $4) ', [
                this.id,
                unit.diavgeiaId,
                unit.name,
                unit.rawData,
            ]);
        }
    }

    protected async saveSigners(signers: Signer[]) {
        this.logger.info(`Saving ${signers.length} signers...`);
        for (let signer of signers) {
            await this.db.query(
                'INSERT INTO signers (ingestor_task_id, diavgeia_id, first_name, last_name, raw_data) VALUES ($1, $2, $3, $4, $5) ', [
                this.id,
                signer.diavgeiaId,
                signer.firstName,
                signer.lastName,
                signer.rawData,
            ]);
        }
    }

    protected async saveDecisionSigners(decisionAda: string, signerIds: string[]) {
        this.logger.info(`Saving ${signerIds.length} decision signers...`);
        for (let signerId of signerIds) {
            await this.db.query(
                'INSERT INTO decision_signers (ingestor_task_id, decision_ada, signer_diavgeia_id) VALUES ($1, $2, $3) ', [
                this.id,
                decisionAda,
                signerId
            ]);
        }
    }

    protected async saveDecisionUnits(decisionAda: string, unitIds: string[]) {
        this.logger.info(`Saving ${unitIds.length} decision units...`);
        for (let unitId of unitIds) {
            await this.db.query(
                'INSERT INTO decision_units (ingestor_task_id, decision_ada, unit_diavgeia_id) VALUES ($1, $2, $3) ', [
                this.id,
                decisionAda,
                unitId
            ]);
        }
    }

    protected async saveAll(decisions: Decision[], organizations: Organization[], units: Unit[], signers: Signer[]) {
        this.logger.info(`Saving all: ${decisions.length} decisions, ${organizations.length} organizations, ${units.length} units and ${signers.length} signers...`);

        await this.db.query('START TRANSACTION');

        await this.saveOrganizations(organizations);
        await this.saveDecisions(decisions);
        await this.saveUnits(units);
        await this.saveSigners(signers);

        for (let decision of decisions) {
            await this.saveDecisionSigners(decision.ada, decision.signerIds);
            await this.saveDecisionUnits(decision.ada, decision.unitIds);
        };
        await this.db.query('COMMIT');
    }
}