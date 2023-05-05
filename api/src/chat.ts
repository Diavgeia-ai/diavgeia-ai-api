import { Socket } from "socket.io";
import Logger from "./logger";

let getSystemMessage = () => {
    return `
        Eίσαι ένας βοηθός τεχνητής νοημοσύνης για το Διαύγεια.ai, μια εφαρμογή του ανεξάρτητου μη-κερδοσκοπικού και μη κυβερνητικού οργανισμού diavgeia.org.
        Το Διαύγεια.ai αναλύει τα δεδομένα του προγράμματος Δι@υγεια.

        Πρέπει να απαντάς στα ερωτήματα του χρήστη, πάντα όμως με βάση τα δεδομένα που υπάρχουν στην εφαρμογή, και όσα έχεις μάθει από τον χρήστη.
        Αν ένας χρήστης σου ζητήσει κάτι που δεν ξέρεις, που δεν προκύπτει από αυτά που έχει πει ο χρήστης, ή δεν μπορείς να βρείς με τη χρήση της λειτουργίας αναζήτησης, πρέπει να τον ενημερώσεις πως δεν ξέρεις.

        Οι απαντήσεις σου πρέπει να είναι πάντα σε JSON μίας εκ των δύο μορφών:

        Πρώτη μορφή: μπορείς να κάνεις μια αναζήτση στην εφαρμογή, που θα σου επιστρέψει αναρτημένες πράξεις της διαύγειας.
        {
            "type": "search",
            "query": "<ΕΡΩΤΗΜΑ με το οποίο θέλις να ψάξεις την εφαρμογή σε φυσική γλώσσα>"
        }
        Τρία παραδείγματα από το πεδίο queries:
        "Aναθέσεις του υπουργείου περιβάλλοντος τις πρώτες 10 μέρες του ιουνίου 2021"
        "Πράξεις δημοσιευμένες από νοσοκμεία"
        "Αγορές φαρμάκων"

        Δεύτερη μορφή: μπορείς να δώσεις μια απάντηση στον χρήστη, που θα εμφανιστεί στην οθόνη του.
        {
            "type": "response",
            "text": "<ΑΠΑΝΤΗΣΗ που θέλεις να δώσεις στον χρήστη που κάνουν αναφορές [REF$1] σε πράξεις [REF$2]>"
            "references": [
                "<η ΑΔΑ μιας πράξης>"
                "<η ΑΔΑ μιας δεύτερης πράξης>"
            ]
        }
    `;
}



const logger = new Logger("chat");

type Message = {
    text: string,
    sender: string
    inProgress: boolean;
}

const initialMessage = {
    text: "",
    sender: "bot",
    inProgress: true
}

let tryCompleteJSON = (text: string) => {
    try {
        return JSON.parse(text + `"}`);
    } catch (e) {
        return null;
    }
}

export const onConnect = async (socket: Socket) => {
    // ugh
    const importDynamic = new Function('modulePath', 'return import(modulePath)',);
    const { ChatGPTAPI } = await importDynamic("chatgpt");

    const api = new ChatGPTAPI({
        apiKey: process.env.OPENAI_API_KEY as string,
        completionParams: {
            model: 'gpt-4',
            temperature: 0.1,
            top_p: 0.8
        },
        systemMessage: getSystemMessage()
    })

    logger.info("New connection");
    socket.on("message", async (message) => {
        socket.send(initialMessage);

        let aiOutcome = await api.sendMessage(message.text, {
            onProgress: (progress: any) => {
                let parsed = tryCompleteJSON(progress.text);
                if (parsed) {
                    if (parsed.type === "response") {
                        socket.send({
                            text: parsed.text,
                            sender: "bot",
                            inProgress: true
                        });
                    }
                }
            }
        });

        let response = JSON.parse(aiOutcome.text);
        logger.info(`Completed response: ${response.text.text}`);

        if (response.type === "response") {
            socket.send({
                text: response.text,
                sender: "bot",
                inProgress: false
            });
        }

        if (response.type === "search") {

        }

    });

}