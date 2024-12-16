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

// Utility function to sanitize and clean OpenAI response
const sanitizeJSON = (response: string): string => {
    return response
        .replace(/```json/g, "") // Remove starting ```json
        .replace(/```/g, "") // Remove any ending backticks
        .trim(); // Remove leading/trailing whitespace
};

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
        console.log("Returning cached response.");
        return res.status(200).json(cachedResponse);
    }

    try {
        console.log("Requesting new data from OpenAI...");

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `You are a professional crossword puzzle generator.
Your task is to generate a unique crossword puzzle with exactly 15 words and concise clues. 
Follow these rules:
1. Words must be between 4 to 7 letters long.
2. The output must strictly adhere to this JSON format with NO markdown, NO backticks, and NO explanations:

{
  "theme": "some-theme",
  "words": ["WORD1", "WORD2", ...],
  "clues": {
    "word1": "clue for word1",
    "word2": "clue for word2"
  }
}

Ensure that:
- The 'words' array contains unique words, all in uppercase.
- The 'clues' object contains words as keys (case-insensitive) and their concise clues as values.
`
                },
                {
                    role: "user",
                    content: "Generate a crossword puzzle strictly following the above JSON format."
                },
            ],
        });

        const rawContent = completion.choices[0]?.message?.content || "";

        console.log("Raw response from OpenAI:", rawContent);

        // Sanitize and clean up the JSON response
        const sanitizedContent = sanitizeJSON(rawContent);
        console.log("Sanitized response:", sanitizedContent);

        const parsedResult = JSON.parse(sanitizedContent);

        // Enforce output format
        const formattedResponse: CachedResponse = {
            theme: parsedResult.theme,
            words: parsedResult.words.map((word: string) => word.toUpperCase()),
            clues: Object.fromEntries(
                Object.entries(parsedResult.clues).map(
                    ([word, clue]) => [word.toUpperCase(), clue as string]
                )
            ),
        };

        // Cache the response for the entire day
        cachedResponse = formattedResponse;
        lastFetched = now;

        res.status(200).json(formattedResponse);
    } catch (error) {
        console.error("Error processing OpenAI response:", error);
        res.status(500).json({ error: "Internal Server Error", details: error.message || error });
    }
}
