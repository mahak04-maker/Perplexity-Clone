//import { ChatOpenAI, OpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { BaseMessage } from "@langchain/core/messages";
import {
  RunnableSequence,
  RunnableMap,
  RunnableLambda,
} from "@langchain/core/runnables";
import formatChatHistoryAsString from "../utils/formatHistory.js";
import {
  PromptTemplate,
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { searchSearxng } from "../lib/searxng.js";
import { Document } from "@langchain/core/documents";
// import { query } from "express";
import computeSimilarity from "../utils/computeSimilarity.js";
import eventEmitter from "events";
import type { StreamEvent } from "@langchain/core/tracers/log_stream";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Embeddings } from "@langchain/core/embeddings";
import type { SearchResult } from "../types/SearchResult.js";

const basicYouTubeSearchRetrieverPrompt = `
You will be given a conversation and a follow-up question.

Your task is to rewrite the follow-up question into a standalone YouTube search query.

If the input is a greeting, casual conversation, or a writing task instead of a search request, return exactly:

not_needed

Examples:

Follow-up:
How to learn React?

Rephrased:
React tutorial YouTube

Follow-up:
LangChain beginner guide

Rephrased:
LangChain beginner tutorial YouTube

Follow-up:
Best Python course

Rephrased:
Best Python course YouTube

Conversation:
{chat_history}

Follow-up question:
{query}

Rephrased search query:
`;

const basicYouTubeSearchResponsePrompt = `
  You are FutureSearch operating in "YouTube Search" mode.

Your task is to answer the user's query using the provided YouTube search results.

Guidelines:

- Recommend the most relevant videos.
- Summarize what each recommended video covers.
- Mention official channels whenever available.
- Separate beginner, intermediate, and advanced resources if applicable.
- If multiple videos explain different approaches, summarize each.
- Do not invent information.
- Use markdown headings and bullet points.
- Include video titles whenever available.
- If video URLs exist in the metadata, include them in a separate "Videos" section.
- Cite every factual statement using [1], [2], etc.

<context>
{context}
</context>

Today's date is ${new Date().toISOString()}
`;

const strParser = new StringOutputParser();

type BasicChainInput = {
  chat_history: BaseMessage[];
  query: string;
};

const createBasicYouTubeSearchAnsweringChain = (
  llm: BaseChatModel,
  embeddings: Embeddings
) => {
  const basicYouTubeSearchRetrieverChain =
    createBasicYouTubeSearchRetrieverChain(llm);

  const processDocs = async (docs: (Document | undefined)[]) => {
    return docs
      .filter((doc): doc is Document => doc !== undefined)
      .map(
        (doc, index) => `
        ${index + 1}. 
        Title: ${doc.metadata.title}
        Description: ${doc.pageContent}
        URL: ${doc.metadata.url}
        Thumbnail: ${doc.metadata.img_src ?? "N/A"}
        ${doc.pageContent ?? ""}`)
      .join("\n");
  };

  const rerankDocs = async ({
    query,
    docs,
  }: {
    query: string;
    docs: Document[];
  }) => {
    if (docs.length === 0) {
      return docs;
    }

    const docsWithContent = docs.filter(
      (doc) => doc.pageContent && doc.pageContent.length > 0
    );

    const [docEmbeddings, queryEmbedding] = await Promise.all([
      embeddings.embedDocuments(docsWithContent.map((doc) => doc.pageContent)),
      embeddings.embedQuery(query),
    ]);

    const similarity = docEmbeddings.map((docEmbedding, i) => {
      const sim = computeSimilarity(queryEmbedding, docEmbedding);

      return {
        index: i,
        similarity: sim,
      };
    });

    const sortedDocs = similarity
      .sort((a, b) => b.similarity - a.similarity)
      .filter((sim) => sim.similarity > 0.5)
      .slice(0, 15)
      .map((sim) => docsWithContent[sim.index]);

    return sortedDocs;
  };

  return RunnableSequence.from([
    RunnableMap.from({
      query: (input: BasicChainInput) => input.query,
      chat_history: (input: BasicChainInput) => input.chat_history,
      context: RunnableSequence.from([
        (input) => ({
          query: input.query,
          chat_history: formatChatHistoryAsString(input.chat_history),
        }),
        basicYouTubeSearchRetrieverChain
          .pipe(rerankDocs)
          .withConfig({
            runName: "FinalSourceRetriever",
          })
          .pipe(processDocs),
      ]),
    }),
    ChatPromptTemplate.fromMessages([
      ["system", basicYouTubeSearchResponsePrompt],
      new MessagesPlaceholder("chat_history"),
      ["user", "{query}"],
    ]),
    llm,
    strParser,
  ]).withConfig({
    runName: "FinalResponseGenerator",
  });
};

const handleStream = async (
  stream: AsyncGenerator<StreamEvent, any, unknown>,
  emitter: eventEmitter
) => {
  for await (const event of stream) {
    if (
      event.event === "on_chain_end" &&
      event.name === "FinalSourceRetriever"
    ) {
      emitter.emit(
        "data",
        JSON.stringify({ type: "sources", data: event.data.output })
      );
    }
    if (
      event.event === "on_chain_stream" &&
      event.name === "FinalResponseGenerator"
    ) {
      emitter.emit(
        "data",
        JSON.stringify({ type: "response", data: event.data.chunk })
      );
    }
    if (
      event.event === "on_chain_end" &&
      event.name === "FinalResponseGenerator"
    ) {
      emitter.emit("end");
    }
  }
};

const createBasicYouTubeSearchRetrieverChain = (llm: BaseChatModel) => {
  return RunnableSequence.from([
    PromptTemplate.fromTemplate(basicYouTubeSearchRetrieverPrompt),
    llm,
    strParser,
    RunnableLambda.from(async (input: string) => {
      if (input === "not_needed") {
        return { query: "", docs: [] };
      }

       const res = await searchSearxng(input, {
        language: "en",
        engines: [
          "youtube"
        ],
      });

      const documents = (res.results ?? []).map(
        (result: SearchResult) =>
          new Document({
            pageContent: `
            Title: ${result.title}
            Description: ${result.content}
            URL: ${result.url}
            Thumbnail: ${result.img_src ?? "N/A"}
            `,
            metadata: {
              title: result.title,
              url: result.url,
              img_src: result.img_src,
            },
          })
      );

      return { query: input, docs: documents };
    }),
  ]);
};

const basicYouTubeSearch = (
  query: string,
  history: BaseMessage[],
  llm: BaseChatModel,
  embeddings: Embeddings
) => {
  const emitter = new eventEmitter();

  try {
    const basicYouTubeSearchAnsweringChain =
      createBasicYouTubeSearchAnsweringChain(llm, embeddings);
    const stream = basicYouTubeSearchAnsweringChain.streamEvents(
      {
        chat_history: history,
        query: query,
      },
      {
        version: "v1",
      }
    );

    handleStream(stream, emitter);
  } catch (err) {
    emitter.emit(
      "error",
      JSON.stringify({ data: "An error has occurred please try again later" })
    );
    console.error(err);
  }

  return emitter;
};

const handleYouTubeSearch = (
  message: string,
  history: BaseMessage[],
  llm: BaseChatModel,
  embeddings: Embeddings
) => {
  const emitter = basicYouTubeSearch(message, history, llm, embeddings);
  return emitter;
};

export default handleYouTubeSearch;
