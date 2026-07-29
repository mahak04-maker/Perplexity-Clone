import { ChatGroq } from "@langchain/groq";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) {
  throw new Error("Missing GROQ_API_KEY environment variable");
}

const groq = new ChatGroq({
  apiKey,
  model: "llama-3.3-70b-versatile",
  temperature: 0.7,
});
export default groq;