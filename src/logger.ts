type LogLevel = "debug" | "info" | "warn" | "error";

export default class Logger {
    private _context ?: string;

    constructor (context ?: string) {
        this._context = context;
    }

    log(level : LogLevel, content: string) {
        let message = `[${level}]`;
        if (this._context !== undefined) {
            message += ` [${this._context}]`;
        }
        message += ` ${content}`;
        console.log(message);
    }

    debug(content: string) {
        this.log("debug", content);
    }

    info(content: string) {
        this.log("info", content);
    }

    warn(content: string) {
        this.log("warn", content);
    }
    
    error(content: string) {
        this.log("error", content);
    }
}