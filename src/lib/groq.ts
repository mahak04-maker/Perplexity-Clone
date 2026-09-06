import { ChatGroq } from "@langchain/groq";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) {
  throw new Error("Missing GROQ_API_KEY environment variable");
}

const groq = new ChatGroq({
  apiKey,
  model: "openai/gpt-oss-120b",
  temperature: 0.7,
});
export default groq;