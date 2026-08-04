# FutureSearch - Perplexity AI Clone

FutureSearch is an AI-powered search assistant inspired by Perplexity AI. It supports multiple search modes such as Web Search, Academic Search, Reddit Search, YouTube Search, Image Search, Video Search, Writing Assistant, and AI-generated Search Suggestions.

The backend is built using **Node.js, Express, TypeScript, LangChain, Groq LLM, Gemini Embeddings, and SearXNG**.

---

# Features

- Web Search
- Academic Search
- Writing Assistant
- Image Search
- Video Search
- YouTube Search
- Reddit Search
- AI Suggestion Generator
- Streaming AI Responses (SSE)
- Source Citations
- Semantic Search using Gemini Embeddings
- Groq LLM Integration

---

# Tech Stack

### Backend

- Node.js
- Express.js
- TypeScript

### AI

- LangChain
- Groq (Llama 3.3 70B)
- Gemini Embeddings

### Search Engine

- SearXNG

### Others

- Docker
- Event Stream (SSE)

---

# Folder Structure

```
src
│
├── agents
│   ├── academicSearchAgent.ts
│   ├── imageSearchAgent.ts
│   ├── redditSearchAgent.ts
│   ├── suggestionGeneratorAgent.ts
│   ├── videoSearchAgent.ts
│   ├── webSearchAgent.ts
│   ├── writingAssistantAgent.ts
│   └── youtubeSearchAgent.ts
│
├── lib
│   ├── embeddings.ts
│   ├── gemini.ts
│   ├── groq.ts
│   └── searxng.ts
│
├── routes
│   ├── search.ts
│   └── test.ts
│
├── types
│   └── SearchResult.ts
│
├── utils
│   ├── computeSimilarity.ts
│   └── formatHistory.ts
│
└── server.ts
```

---

# Project Workflow

```
Client Request

↓

Express Route

↓

Selected Search Agent

↓

SearXNG Search

↓

Gemini Embeddings

↓

Semantic Re-ranking

↓

Groq LLM

↓

Streaming Response (SSE)

↓

Client
```

---

# Search Modes

| Mode | Description |
|------|-------------|
| web | General web search |
| academic | Research papers & journals |
| writing | Essay and writing assistant |
| image | Image search |
| video | Video search |
| youtube | YouTube search |
| reddit | Reddit discussions |
| suggestion | AI follow-up suggestions |

---

# Installation

Clone Repository

```bash
git clone https://github.com/YOUR_USERNAME/perplexity-clone.git

cd perplexity-clone
```

Install Packages

```bash
npm install
```

---

# Environment Variables

Create a `.env` file.

```env
GROQ_API_KEY=your_groq_api_key

GEMINI_API_KEY=your_gemini_api_key

SEARXNG_URL=http://localhost:8080
```

---

# Running Backend

```bash
npm run dev
```

Server

```
http://localhost:3000
```

---

# Docker Setup (SearXNG)

### Pull Docker Image

```bash
docker pull searxng/searxng
```

### Run Container

```bash
docker run -d ^
--name searxng ^
-p 8080:8080 ^
searxng/searxng
```

Linux / Mac

```bash
docker run -d \
--name searxng \
-p 8080:8080 \
searxng/searxng
```

### Check Running Container

```bash
docker ps
```

Expected Output

```
PORTS

0.0.0.0:8080->8080/tcp
```

Open Browser

```
http://localhost:8080
```

---

# API Endpoint

POST

```
http://localhost:3000/api/search
```

Example Request

```json
{
  "message": "What is Artificial Intelligence?",
  "mode": "web",
  "history": []
}
```

---

# Supported Modes

```json
web

academic

writing

image

video

youtube

reddit

suggestion
```

---

# Response Format

Streaming Response

```text
data:
{
"type":"response",
"data":"Artificial..."
}
```

Sources

```json
{
"type":"sources",
"data":[]
}
```

---

# Similarity Search

Gemini Embeddings are used to generate vector embeddings.

Cosine Similarity is applied to rank the most relevant search results before sending them to the LLM.

---

# AI Models

### LLM

Groq

Model

```
llama-3.3-70b-versatile
```

### Embeddings

Google Gemini

```
gemini-embedding-001
```

---

# Future Improvements

- React Frontend
- Authentication
- Chat History
- Image Preview
- PDF Upload
- Voice Search
- Dark Mode

---
For better understanding look at the Architecture_Image

# Author

Mahak Yadav

```