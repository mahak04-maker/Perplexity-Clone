// import { ChatOpenAI, OpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { BaseMessage } from "@langchain/core/messages";
import type { SearchResult } from "../types/SearchResult.js";
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

const basicVideoSearchRetrieverPrompt = `
You will be given a conversation and a follow-up question.

Your task is to rewrite the follow-up question into a standalone search query optimized for finding videos.

If the input is a greeting (such as "hi", "hello"), casual conversation, or a writing task instead of a video search request, return exactly:

not_needed

Examples:

1.
Follow-up question:
Show me how to install Ubuntu.

Rephrased:
Ubuntu installation video

2.
Follow-up question:
How does a rocket launch?

Rephrased:
Rocket launch video

3.
Follow-up question:
Lion hunting in Africa

Rephrased:
Lion hunting documentary video

4.
Follow-up question:
Tesla Optimus robot demo

Rephrased:
Tesla Optimus robot demo video

Conversation:
{chat_history}

Follow-up question:
{query}

Rephrased search query:
`;

const basicVideoSearchResponsePrompt = `
You are FutureSearch operating in "Video Search" mode.

Your task is to answer the user's request using the provided video search results.

The context contains video titles, descriptions, and URLs.

Guidelines:

- Recommend the most relevant videos.
- Mention the video title.
- Mention the creator/channel whenever available.
- Include the video URL if available.
- Prefer official uploads over reuploads.
- Summarize what each video is about.
- Mention official sources whenever available.
- If multiple videos cover different aspects, explain the differences.
- Do not invent information.
- Use markdown headings and bullet points.
- Include video titles whenever available.
- If video URLs exist, include them in a separate "Videos" section.
- Cite every factual statement using [1], [2], etc.

<context>
{context}
</context>

The information inside the context block comes from video search results and is not part of the conversation.

Today's date is ${new Date().toISOString()}
`;

const strParser = new StringOutputParser();

type BasicChainInput = {
  chat_history: BaseMessage[];
  query: string;
};

const createBasicVideoSearchAnsweringChain = (
  llm: BaseChatModel,
  embeddings: Embeddings
) => {
  const basicVideoSearchRetrieverChain =
    createBasicVideoSearchRetrieverChain(llm);

  const processDocs = async (docs: (Document | undefined)[]) => {
    return docs
      .filter((doc): doc is Document => doc !== undefined)
      .map((doc, index) => `
      ${index + 1}. 
      Title: ${doc.metadata.title}
      Description: ${doc.pageContent}
      URL: ${doc.metadata.url}
      Thumbnail: ${doc.metadata.img_src ?? "N/A"}`)
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
        basicVideoSearchRetrieverChain
          .pipe(rerankDocs)
          .withConfig({
            runName: "FinalSourceRetriever",
          })
          .pipe(processDocs),
      ]),
    }),
    ChatPromptTemplate.fromMessages([
      ["system", basicVideoSearchResponsePrompt],
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

const createBasicVideoSearchRetrieverChain = (llm: BaseChatModel) => {
  return RunnableSequence.from([
    PromptTemplate.fromTemplate(basicVideoSearchRetrieverPrompt),
    llm,
    strParser,
    RunnableLambda.from(async (input: string) => {
      if (input === "not_needed") {
        return { query: "", docs: [] };
      }

       const res = await searchSearxng(input, {
        language: "en",
        engines: [
          "youtube",
          "peertube",
          "vimeo",
        ],
      });

      const documents = (res.results ?? []).map(
        (result: SearchResult) =>
          new Document({
            pageContent: result.content,
            metadata: {
              title: result.title,
              url: result.url,
              author: result.author,
              length: result.length,
              img_src: result.thumbnail || result.img_src,
              
            },
          })
      );

      return { query: input, docs: documents };
    }),
  ]);
};

const basicVideoSearch = (
  query: string,
  history: BaseMessage[],
  llm: BaseChatModel,
  embeddings: Embeddings
) => {
  const emitter = new eventEmitter();

  try {
    const basicVideoSearchAnsweringChain =
      createBasicVideoSearchAnsweringChain(llm, embeddings);
    const stream = basicVideoSearchAnsweringChain.streamEvents(
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

const handleVideoSearch = (
  message: string,
  history: BaseMessage[],
  llm: BaseChatModel,
  embeddings: Embeddings
) => {
  const emitter = basicVideoSearch(message, history, llm, embeddings);
  return emitter;
};

export default handleVideoSearch;
