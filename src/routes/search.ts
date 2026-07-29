import { Router } from "express";
import groq from "../lib/groq.js";
import embeddings from "../lib/embeddings.js";

import handleAcademicSearch from "../agents/academicSearchAgent.js";
import handleWritingSearch from "../agents/writingAssistantAgent.js";
import handleImageSearch from "../agents/imageSearchAgent.js";
import handleYoutubeSearch from "../agents/youtubeSearchAgent.js";
import handleRedditSearch from "../agents/redditSearchAgent.js";
import handleWebSearch from "../agents/webSearchAgent.js";
import handleVideoSearch from "../agents/videoSearchAgent.js";
import handleSuggestionSearch from "../agents/suggestionGeneratorAgent.js";
import type { SearchResult } from "../types/SearchResult.js";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const { message, history = [], mode = "web" } = req.body;

    if (!message) {
      return res.status(400).json({
        error: "Message is required",
      });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

        let emitter;

        switch (mode) {
          case "academic":
            emitter = handleAcademicSearch(message, history, groq, embeddings as any);
            break;

          case "writing":
            emitter = handleWritingSearch(message, history, groq, embeddings as any);
            break;

          case "youtube":
            emitter = handleYoutubeSearch(message, history, groq, embeddings as any);
            break;

          case "reddit":
            emitter = handleRedditSearch(message, history, groq, embeddings as any);
            break;

          case "web":
            emitter = handleWebSearch(message, history, groq, embeddings as any);
            break;

          case "suggestion":
            emitter = handleSuggestionSearch(message, history, groq);
            break;

          case "image":
            emitter = handleImageSearch(message, history, groq);
            break;

          case "video":
            emitter = handleVideoSearch(message, history, groq, embeddings as any);
            break;

          default:
            return res.status(400).json({ error: "Invalid mode" });
        }

        if (!emitter) {
          return res.status(500).json({ error: "Failed to initialize emitter" });
        }

        emitter.on("data", (data: any) => {
          res.write(`data: ${data}\n\n`);
        });

        emitter.on("end", () => {
          res.end();
        });

        emitter.on("error", (err: any) => {
          res.write(`data: ${JSON.stringify(err)}\n\n`);
          res.end();
        });

      } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Internal Server Error",
    });
  }
});



export default router;