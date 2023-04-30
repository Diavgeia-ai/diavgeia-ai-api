import { getDocument } from 'pdfjs-dist-legacy';
import axios from 'axios';
import Logger from './logger';
import { ChromaClient } from 'chromadb';
import { OpenAIEmbeddingFunction } from 'chromadb';
import dotenv from 'dotenv';
import { combineEmbeddings, equalSizes, generateCohereEmbedding, getOpenAIClient, isWhitespace } from './utils';
import { Configuration, OpenAIApi } from 'openai';
import UsageMonitor from './UsageMonitor';
import Cohere from "cohere-ai";
import { ModelName, EmbeddingProvider } from './types';
import { Pool } from 'pg';

dotenv.config();
const openai = getOpenAIClient();
Cohere.init(process.env.COHERE_API_KEY!);

const MAX_TOKENS_PER_REQUEST = 512;
const MODELS: { [key: string]: ModelName } = {
    "OpenAI": "text-embedding-ada-002",
    "Cohere": "multilingual-22-12"
}
const EMBEDDING_PROVIDER: EmbeddingProvider = "Cohere";
const EMBEDDING_MODEL: ModelName = MODELS.Cohere;

/*
 * A decision (Πράξη) from Diavgeia.
 */
export default class Decision {
    private _metadata: { [key: string]: any } = {};
    private _documentUrl?: string = undefined;
    private _documentText?: string = undefined;
    private _log: Logger;
    constructor(diavgeiaDecisionObj: { [key: string]: any }) {
        this._extractData(diavgeiaDecisionObj);
        this._log = new Logger(`Decision ${this._metadata.ada}`);
        if (!this._metadata.ada || this._metadata.ada === "") {
            throw new Error("Decision ADA not set");
        }
    }

    // Downloads a PDF file from Diavgeia and converts it to text
    async loadDocument(): Promise<void> {
        if (this._documentUrl === undefined) {
            throw new Error("Document URL not set");
        }

        if (this._documentUrl === "" || this._documentUrl === null || this._documentUrl === "null") {
            this._log.warn("No document URL, skipping...");
            this._documentText = "";
            this._metadata.hasDocument = false;
            return;
        }
        this._metadata.hasDocument = true;

        this._log.info(`Loading document from ${this._documentUrl}...`);

        let doc;
        try {
            doc = await getDocument(encodeURI(this._documentUrl)).promise;
        } catch (e) {
            this._log.error(`Failed to load document: ${e}`);
            this._metadata.textExtractionFailure = true;
            this._documentText = "";
            return;
        }

        let pageTexts: string[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
            let page = await doc.getPage(i);
            pageTexts.push((await page.getTextContent()).items.map((x) => {
                if ("str" in x) return x.str;
                else return ""; // will never happen
            }).join(" "));
        }

        if (isWhitespace(pageTexts.join(""))) {
            this._log.warn("Document text is empty, marking metadata...");
            this._metadata.textExtractionFailure = true;
            pageTexts = [];
        } else {
            this._metadata.textExtractionFailure = false;
        }

        this._documentText = pageTexts.join(" || ");

        let metadata = await doc.getMetadata();
        if (metadata.metadata) {
            let metadataObj = metadata.metadata.getAll();
            for (let key in metadataObj) {
                this._metadata[`pdfMetadata_${key}`] = metadataObj[key as keyof typeof metadataObj];
            }
        }
        for (let key in metadata.info) {
            this._metadata[`pdfInfo_${key}`] = metadata.info[key as keyof typeof metadata.info];
        }
    }

    async generateEmbedding(): Promise<number[]> {
        if (EMBEDDING_PROVIDER === "Cohere") {
            return this._generateCohereEmbedding();
        } else {
            throw new Error("Invalid embedding provider");
        }
    }

    async _generateCohereEmbedding(): Promise<number[]> {
        UsageMonitor.addCost(0.001);
        return generateCohereEmbedding(EMBEDDING_MODEL, this.embeddingText);
    }

    private _extractData(diavgeiaDecisionObj: { [key: string]: any }) {
        let {
            protocolNumber,
            subject,
            issueDate,
            organizationId,
            signerIds,
            unitIds,
            decisionTypeId,
            thematicCategoryIds,
            ada,
            publishTimestamp,
            submissionTimestamp,
            documentUrl
        } = diavgeiaDecisionObj;

        let {
            financialYear,
            budgetType,
            amountWithVAT,
            amountWithKae
        } = diavgeiaDecisionObj.extraFieldValues;

        this._documentUrl = documentUrl;
        if (!this._documentUrl) {
            let inferredUrl = `https://diavgeia.gov.gr/doc/${ada}`;
            this._documentUrl = inferredUrl;
        }

        this._metadata = {
            protocolNumber,
            subject,
            issueDate,
            organizationId,
            signerIds,
            unitIds,
            decisionTypeId,
            thematicCategoryIds,
            ada,
            publishTimestamp,
            submissionTimestamp,
            financialYear,
            budgetType,
            amountWithVAT,
            amountWithKae,
            ...this._metadata
        };
    }

    public get metadata(): { [key: string]: any } {
        return { ...this._metadata, documentUrl: this.documentUrl };
    }

    public get documentUrl(): string {
        if (this._documentUrl === undefined) {
            throw new Error("Document URL not loaded");
        }
        return this._documentUrl;
    }

    public get ada(): string {
        if (this._metadata.ada === undefined) {
            throw new Error("ADA not loaded");
        }
        return this._metadata.ada;
    }

    public get documentText(): string {
        if (this._documentText === undefined) {
            throw new Error("Document text not loaded");
        }
        return this._documentText;
    }

    public get embeddingText(): string {
        let text = this.documentText;
        if (isWhitespace(text)) {
            text = "Δεν υπάρχει κείμενο στην απόφαση";
        }

        return [
            ["Subject", this._metadata.subject].join(":\n"),
            ["Content", text].join(":\n")
        ].join("\n\n");
    }
}