import { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY, // Securely stored API key
});

// Store the cached result
type CachedResponse = {
    theme: string;
    words: string[];
    clues: Record<string, string>;
} | null;

let cachedResponse: CachedResponse = null;
let lastFetched: Date | null = null;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Add CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*"); // Replace * with specific origin if needed
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    // Handle OPTIONS preflight request
    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    const now = new Date();

    // Check if the result is cached and within the same day
    if (cachedResponse && lastFetched && now.toDateString() === lastFetched.toDateString()) {
        return res.status(200).json(cachedResponse);
    }

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "You are an advanced crossword puzzle generator. Generate unique themes with 15 words and clues for each word, formatted strictly as JSON.",
                },
                {
                    role: "user",
                    content: `Generate a unique crossword puzzle theme with 15 words and their corresponding clues. Prioritize words between 4-7 letters. The output should strictly follow this format:
                ...
                `,
                },
            ],
        });

        const content = completion.choices[0]?.message?.content;

        if (!content) {
            throw new Error("No content returned by OpenAI API");
        }

        const rawResult = JSON.parse(content);

        // Cache the response and timestamp
        cachedResponse = {
            theme: rawResult.theme,
            words: rawResult.words.map((entry) => entry.word),
            clues: rawResult.words.reduce(
                (acc, entry) => {
                    acc[entry.word.toUpperCase()] = entry.clue;
                    return acc;
                },
                {}
            ),
        };
        lastFetched = now;

        res.status(200).json(cachedResponse);
    } catch (error) {
        console.error("Error fetching words and clues:", error);
        res.status(500).json({ error: "Internal Server Error", details: error.message || error });
    }
}
