import axios from "axios";

class GeminiEmbeddings {
  async embedQuery(text: string): Promise<number[]> {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${process.env.GEMINI_API_KEY}`,
      {
        model: "models/gemini-embedding-001",
        content: {
          parts: [
            {
              text,
            },
          ],
        },
      }
    );

    return response.data.embedding.values;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return Promise.all(
      texts.map((text) => this.embedQuery(text))
    );
  }
}

export default new GeminiEmbeddings();