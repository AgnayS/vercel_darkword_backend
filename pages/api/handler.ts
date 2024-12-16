import type { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';
import { list, put } from '@vercel/blob';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function sanitizeJSON(response: string): string {
  return response
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10); // e.g. "2024-12-17"
  const puzzlePath = `puzzle/${today}/puzzle.json`;

  try {
    // 1. Check if today's puzzle is already in Blob storage
    const existing = await list({ prefix: `puzzle/${today}/` });
    const existingPuzzle = existing.blobs.find(blob => blob.pathname === puzzlePath);

    if (existingPuzzle) {
      // Puzzle found, just fetch it and return it
      console.log("Returning puzzle from Blob storage:", existingPuzzle.url);

      const puzzleResponse = await fetch(existingPuzzle.url);
      if (!puzzleResponse.ok) {
        console.error("Error fetching puzzle from Blob:", puzzleResponse.status);
        return res.status(500).json({ error: "Failed to fetch puzzle from Blob" });
      }

      const puzzleData = await puzzleResponse.json();
      return res.status(200).json(puzzleData);
    }

    // 2. No puzzle found, generate a new one via OpenAI
    console.log("Requesting new puzzle from OpenAI...");
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",  // Adjust model if needed
      messages: [
        {
          role: "system",
          content: `You are a professional crossword puzzle generator.
Your task is to generate a unique crossword puzzle with exactly 15 words and concise clues. 
Follow these rules:
1. Words must be between 4 to 7 letters long.
2. The output must strictly adhere to this JSON format with NO markdown, NO backticks, NO explanations:

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
    const sanitizedContent = sanitizeJSON(rawContent);
    const parsedResult = JSON.parse(sanitizedContent);

    const formattedResponse = {
      theme: parsedResult.theme,
      words: parsedResult.words.map((word: string) => word.toUpperCase()),
      clues: Object.fromEntries(
        Object.entries(parsedResult.clues).map(([word, clue]) => [word.toUpperCase(), clue])
      ),
    };

    // 3. Upload puzzle to Blob storage
    // We'll upload it publicly so we can just fetch it directly in the future.
    const blob = await put(puzzlePath, JSON.stringify(formattedResponse, null, 2), {
      access: 'public',
      contentType: 'application/json',
    });

    console.log("Uploaded new puzzle to Blob:", blob.url);

    // 4. Return the newly generated puzzle
    return res.status(200).json(formattedResponse);

  } catch (error: any) {
    console.error("Error:", error);
    return res.status(500).json({ error: "Internal Server Error", details: error.message || String(error) });
  }
}
