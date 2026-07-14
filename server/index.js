import { WebSocketServer, WebSocket } from "ws";
import dotenv from "dotenv";
import { pipeline } from "@huggingface/transformers";

dotenv.config();

let generator = null;
let isLoading = true;
let loadingProgress = 0;
let lastSent = 0;

const wss = new WebSocketServer({
    port: process.env.PORT ?? 8080
});


function broadcast(data) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}


async function loadAI() {
    try {
        console.log("Loading AI model...");

        generator = await pipeline(
            "text-generation",
            "HuggingFaceTB/SmolLM2-360M-Instruct",
            {
                progress_callback: (progress) => {

                        const now = Date.now();

    if (now - lastSent < 200) return;

    lastSent = now;

    loadingProgress = Math.floor(progress.progress);

    broadcast({
        type: "loading",
        progress: loadingProgress,
        message: `Loading AI model ${loadingProgress}%`
    });
                }
            }
        );

        isLoading = false;

        broadcast({
            type: "ready",
            message: "AI model loaded"
        });

        console.log("AI model loaded");

    } catch (error) {
        console.error("Failed to load AI model:", error);

        broadcast({
            type: "error",
            message: "AI failed to load"
        });

        isLoading = false;
    }
}


loadAI();


wss.on("connection", (socket, request) => {

    // Send current state immediately
    if (isLoading) {
        socket.send(JSON.stringify({
            type: "loading",
            progress: loadingProgress,
            message: `Loading AI model ${loadingProgress}%`
        }));
    } else {
        socket.send(JSON.stringify({
            type: "ready",
            message: "AI ready"
        }));
    }


    socket.on("message", async (data) => {
        const message = data.toString();

        // console.log("User:", message);


        if (isLoading) {
            socket.send(JSON.stringify({
                type: "loading",
                progress: loadingProgress,
                message: "AI is still loading..."
            }));
            return;
        }


        if (!generator) {
            socket.send(JSON.stringify({
                type: "error",
                message: "AI unavailable"
            }));
            return;
        }


        try {
           const prompt = `
You are a helpful, friendly AI assistant.

Answer the user's question directly and concisely.
Do not repeat the prompt.
Do not include "User:" or "AI:" in your answer.

User: ${message}
AI:
`;

const result = await generator(prompt, {
    max_new_tokens: 80,
    temperature: 0.7,
    do_sample: true,
    top_p: 0.9,
});

const response =
    result[0].generated_text.split("AI:").pop()?.trim() ??
    "Sorry, I couldn't generate a response.";
            socket.send(JSON.stringify({
                type: "response",
                message: response
            }));


        } catch (error) {
            console.error("Generation error:", error);

            socket.send(JSON.stringify({
                type: "error",
                message: "AI failed to generate response"
            }));
        }
    });




    
socket.on("error", (err) => {
    console.error("Socket error:", err);

    socket.send(
        JSON.stringify({
            type: "error",
            message: "An unexpected server error occurred."
        })
    );
});

socket.on("close", (code, reason) => {
    const message = reason.toString() || "Connection closed.";

    console.log(`Client disconnected (${code}) ${message}`);

    switch (code) {
        case 1000:
            console.log("Normal closure.");
            break;

        case 1001:
            console.log("Client navigated away or closed the browser.");
            break;

        case 1006:
            console.log("Connection lost unexpectedly.");
            break;

        case 1008:
            console.log("Policy violation.");
            break;

        case 1011:
            console.log("Internal server error.");
            break;

        default:
            console.log(`Disconnected with code ${code}.`);
    }
});
});


console.log(`Websocket is live on ws://localhost:${process.env.PORT ?? 8080}`);