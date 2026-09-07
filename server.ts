import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for JSON body parsing (50MB limit for audio base64)
  app.use(express.json({ limit: "50mb" }));

  // API Routes
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // AI Video Audio Speech-to-Text Transcription Route using Gemini
  app.post("/api/transcribe", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ error: "GEMINI_API_KEY environment variable is missing" });
      }

      const { audioBase64, mimeType = "audio/wav", wordsPerBlock = 3, language } = req.body;
      if (!audioBase64) {
        return res.status(400).json({ error: "audioBase64 is required" });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const languageLabels: Record<string, string> = {
        bg: "Bulgarian (Български език)",
        en: "English (US/UK)",
        es: "Spanish (Español)",
        fr: "French (Français)",
        de: "German (Deutsch)",
        it: "Italian (Italiano)",
        pt: "Portuguese (Português)",
        ja: "Japanese (日本語)",
        zh: "Chinese (中文)",
        ru: "Russian (Русский)",
        hi: "Hindi (हिन्दी)",
        nl: "Dutch (Nederlands)",
        ko: "Korean (한국어)",
        ar: "Arabic (العربية)",
      };

      const langTarget = language && language !== "auto"
        ? (languageLabels[language] || language)
        : null;

      const langInstruction = langTarget
        ? `Transcribe specifically in ${langTarget} using correct grammar, vocabulary, orthography, and native script/casing.`
        : `Transcribe in the original spoken language (auto-detecting Bulgarian, English, Spanish, French, German, Japanese, Portuguese, Hindi, etc.).`;

      const promptText = `Listen carefully to the audio extracted from this video.
Task:
1. ${langInstruction}
2. Group the spoken words into small subtitle blocks suitable for short-form social videos (approx ${wordsPerBlock} words per block).
3. Provide exact timestamps in seconds for start and end times of each block, as well as timestamps for each individual word.
4. Perform Sentiment & Mood Analysis on each block:
   - Identify the overall block mood: "hype", "happy", "dramatic", "shock", "inspirational", "warning", "curious", or "neutral".
   - Suggest a high-impact mood emoji overlay for the block (e.g., 🔥, ⚡, 😱, 🚀, 💡, ⚠️, 💰, 👑, ✨, 🤯, 🎯).
5. For individual words, classify key power words/verbs/numbers with sentiment ("positive", "negative", "excited", "dramatic", "curious", "neutral"), mark isEmphasized: true, provide a vivid hex colorOverride (e.g., #FFE600 for electric gold, #FF3B30 for red alert, #22C55E for neon green, #00F0FF for cyan), and assign relevant contextual emojis to key words.

CRITICAL TIMING & SILENCE CONSTRAINTS:
1. Pay extreme attention to speech pauses, silences, and gaps between sentences in the audio.
2. DO NOT stretch block or word end times across silent pauses. If the speaker pauses, end the current block/word IMMEDIATELY when speech stops. Start the next block ONLY when speech resumes.
3. Each word's start and end timestamp must strictly reflect when that specific word is spoken in the audio.

Format output as a JSON array of blocks:
[
  {
    "start": 0.2,
    "end": 1.1,
    "mood": "hype",
    "suggestedEmoji": "🔥",
    "words": [
      { "text": "This", "start": 0.2, "end": 0.4 },
      { "text": "CRAZY", "start": 0.4, "end": 0.8, "emoji": "🤯", "isEmphasized": true, "colorOverride": "#FFE600", "sentiment": "excited" },
      { "text": "hack", "start": 0.8, "end": 1.1, "emoji": "⚡", "isEmphasized": true, "colorOverride": "#00F0FF", "sentiment": "positive" }
    ]
  }
]`;

      // Candidate multimodal models supporting structured JSON schemas with word-level audio alignment
      const CANDIDATE_MODELS = [
        "gemini-2.5-flash",
        "gemini-3.7-flash",
        "gemini-3.1-flash-lite",
        "gemini-2.5-flash-lite",
        "gemini-2.5-pro",
      ];

      const audioPart = {
        inlineData: {
          mimeType: mimeType,
          data: audioBase64,
        },
      };

      const contents = {
        parts: [
          audioPart,
          { text: promptText },
        ],
      };

      const schemaConfig = {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          description: "List of timed subtitle blocks with sentiment analysis and mood emoji suggestions",
          items: {
            type: Type.OBJECT,
            properties: {
              start: { type: Type.NUMBER, description: "Block start time in seconds" },
              end: { type: Type.NUMBER, description: "Block end time in seconds" },
              mood: {
                type: Type.STRING,
                description: "Overall mood: hype, happy, dramatic, shock, inspirational, warning, curious, or neutral",
              },
              suggestedEmoji: {
                type: Type.STRING,
                description: "Mood-based suggested emoji overlay for this segment (e.g. 🔥, ⚡, 😱, 🚀, 💡, ⚠️, 💰, 👑, ✨)",
              },
              words: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    text: { type: Type.STRING },
                    start: { type: Type.NUMBER },
                    end: { type: Type.NUMBER },
                    emoji: { type: Type.STRING },
                    colorOverride: { type: Type.STRING },
                    isEmphasized: { type: Type.BOOLEAN },
                    sentiment: { type: Type.STRING },
                  },
                  required: ["text", "start", "end"],
                },
              },
            },
            required: ["start", "end", "words"],
          },
        },
      };

      let responseText: string | null = null;
      let lastError: any = null;

      // Iterate through candidate models with retry backoff on high demand (503/429)
      for (const modelName of CANDIDATE_MODELS) {
        const maxRetriesPerModel = 1;
        for (let attempt = 0; attempt <= maxRetriesPerModel; attempt++) {
          try {
            console.log(`[Transcribe] Attempting speech recognition with ${modelName} (attempt ${attempt + 1})...`);
            let response;
            try {
              response = await ai.models.generateContent({
                model: modelName,
                contents,
                config: schemaConfig,
              });
            } catch (schemaErr: any) {
              // If model doesn't support responseSchema/JSON mode, retry without schemaConfig
              const isSchemaUnsupported =
                schemaErr?.status === 400 ||
                schemaErr?.code === 400 ||
                (schemaErr?.message && schemaErr.message.includes("JSON mode"));
              if (isSchemaUnsupported) {
                console.warn(`[Transcribe] ${modelName} does not support responseSchema, attempting prompt-driven mode...`);
                response = await ai.models.generateContent({
                  model: modelName,
                  contents,
                });
              } else {
                throw schemaErr;
              }
            }

            if (response?.text) {
              responseText = response.text;
              console.log(`[Transcribe] Successfully generated transcript using ${modelName}`);
              break;
            }
          } catch (err: any) {
            lastError = err;
            const errMsg = err?.message || JSON.stringify(err);
            const isTransient =
              err?.status === 503 ||
              err?.code === 503 ||
              err?.status === 429 ||
              err?.code === 429 ||
              errMsg.includes("503") ||
              errMsg.includes("429") ||
              errMsg.includes("high demand") ||
              errMsg.includes("UNAVAILABLE") ||
              errMsg.includes("RESOURCE_EXHAUSTED");

            console.warn(`[Transcribe] Model ${modelName} encountered error:`, errMsg);

            if (attempt < maxRetriesPerModel && isTransient) {
              const backoffMs = 500 + Math.random() * 300;
              await new Promise((r) => setTimeout(r, backoffMs));
              continue;
            }
            // Move to next candidate model
            break;
          }
        }

        if (responseText) {
          break;
        }
      }

      if (!responseText) {
        const errorMsg = lastError?.message || "AI transcription service temporarily unavailable due to high model demand";
        return res.status(503).json({
          error: errorMsg,
          fallbackAvailable: true,
        });
      }

      // Robust JSON extraction & cleanup
      let cleanJson = responseText.trim();
      if (cleanJson.startsWith("```json")) {
        cleanJson = cleanJson.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
      } else if (cleanJson.startsWith("```")) {
        cleanJson = cleanJson.replace(/^```\s*/i, "").replace(/\s*```$/, "");
      }

      let blocks = JSON.parse(cleanJson || "[]");

      // Add unique IDs to blocks and words, preserving sentiment analysis and mood overlays
      blocks = blocks.map((b: any, bIdx: number) => ({
        id: `ai-block-${bIdx}-${Date.now()}`,
        start: Number(b.start) || 0,
        end: Number(b.end) || 0.5,
        mood: b.mood ? String(b.mood) : undefined,
        suggestedEmoji: b.suggestedEmoji ? String(b.suggestedEmoji) : undefined,
        words: (b.words || []).map((w: any, wIdx: number) => ({
          id: `ai-word-${bIdx}-${wIdx}-${Date.now()}`,
          text: String(w.text || ""),
          start: Number(w.start) || 0,
          end: Number(w.end) || 0.3,
          emoji: w.emoji ? String(w.emoji) : undefined,
          colorOverride: w.colorOverride ? String(w.colorOverride) : undefined,
          isEmphasized: Boolean(w.isEmphasized),
          sentiment: w.sentiment ? String(w.sentiment) : undefined,
        })),
      }));

      return res.json({ blocks });
    } catch (error: any) {
      console.error("Transcription API Error:", error);
      return res.status(500).json({ error: error.message || "Failed to transcribe video audio with Gemini AI" });
    }
  });

  // Vite middleware for development vs static serve for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
