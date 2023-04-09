
//@ts-ignore
import { getDocument } from 'pdfjs-dist-legacy';
import axios from 'axios';
import Logger from './logger';
import { ChromaClient } from 'chromadb';
import {OpenAIEmbeddingFunction}  from 'chromadb';
import TikToken from "tiktoken-node";
import dotenv from 'dotenv';
import { combineEmbeddings, equalSizes } from './utils';
import {Configuration, OpenAIApi} from 'openai';
import UsageMonitor from './embeddingUsageMonitor';

dotenv.config();
const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY!,
});
const openai = new OpenAIApi(configuration);

const MAX_TOKENS_PER_REQUEST = 2000;
const EMBEDDING_MODEL = "text-embedding-ada-002";

/*
 * A decision (Πράξη) from Diavgeia.
 */
export default class Decision {
    private _metadata : { [key: string]: any } = {};
    private _documentUrl ?: string = undefined;
    private _documentText ?: string = undefined;
    private _log : Logger;
    constructor(diavgeiaDecisionObj : {[key: string]: any}) {
        this._extractData(diavgeiaDecisionObj);
        if (!this._metadata.ada || this._metadata.ada === "") {
            throw new Error("Decision ADA not set");
        }
        this._log = new Logger(`Decision ${this._metadata.ada}`);
    }

    // Downloads a PDF file from Diavgeia and converts it to text
    async loadDocument() : Promise<void> {
        if (this._documentUrl === undefined) {
            throw new Error("Document URL not set");
        }

        if (this._documentUrl === "" || this._documentUrl === null || this._documentUrl === "null") {
            this._log.warn("No document URL, skipping...");
            this._documentText = "";
            return;
        }

        this._log.info(`Loading document from ${this._documentUrl}...`);
        
        let doc = await getDocument(encodeURI(this._documentUrl)).promise;
        let pageTexts  : string[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
            let page = await doc.getPage(i);
            pageTexts.push((await page.getTextContent()).items.map((x) => {
                if ("str" in x) return x.str;
                else return ""; // will never happen
            }).join(" "));
        }

        this._documentText = pageTexts.join(" ");
        
        let metadata = await doc.getMetadata();

        let metadataObj = metadata.metadata.getAll();
        for (let key in metadataObj) {
            this._metadata[`pdfMetadata_${key}`] = metadataObj[key as keyof typeof metadataObj];
        }
        for (let key in metadata.info) {
            this._metadata[`pdfInfo_${key}`] = metadata.info[key as keyof typeof metadata.info];
        }
    }

    async generateEmbedding() : Promise<number[]> {
        let encoder = TikToken.encodingForModel("text-embedding-ada-002")
        let encoding = encoder.encode(this.embeddingText);

        // Split the token encoding into chunks of 2000 tokens each
        // (~the maximum number of tokens that can be embedded in a single request)
        let tokensToEmbed : number[][] = [];
        for (let i = 0; i < encoding.length; i += MAX_TOKENS_PER_REQUEST) {
            tokensToEmbed.push(encoding.slice(i, i + MAX_TOKENS_PER_REQUEST));
        }

        // Encode each token chunk separately
        this._log.info(`Will embed text ${encoding.length} tokens in ${tokensToEmbed.length} requests...`);
        let response = await openai.createEmbedding({
            model: EMBEDDING_MODEL,
            input: tokensToEmbed
        });

        UsageMonitor.addTokens(EMBEDDING_MODEL, response.data.usage.total_tokens);
        let embeddings = response.data.data.map((x) => x.embedding);

        if (!equalSizes(embeddings)) {
            this._log.error(`Embeddings have different sizes!`);
        }

        // Combine the embeddings of the different parts of the document into
        // a single embedding by summing them
        return combineEmbeddings(embeddings);
    }

    private _extractData(diavgeiaDecisionObj : {[key: string]: any}) {
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

    public get metadata() : { [key: string]: any } {
        return this._metadata;
    }

    public get documentText() : string {
        if (this._documentText === undefined) {
            throw new Error("Document text not loaded");
        }
        return this._documentText;
    }

    public get embeddingText() : string {
        return `
            DOCUMENT
            SUBJECT: ${this._metadata.subject}
            TEXT START
            ${this.documentText}
            TEXT END
        `;
    }
}