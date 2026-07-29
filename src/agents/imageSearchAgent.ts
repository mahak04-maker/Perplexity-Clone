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
import eventEmitter from "events";
import type { StreamEvent } from "@langchain/core/tracers/log_stream";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Embeddings } from "@langchain/core/embeddings";
import type { SearchResult } from "../types/SearchResult.js";

const basicImageSearchRetrieverPrompt = `
You will be given a conversation and a follow-up question.

Your task is to rewrite the follow-up question into a standalone search query that is optimized for finding relevant images.

If the input is a greeting (such as "hi", "hello"), casual conversation, or a writing task instead of an image search request, return exactly:

not_needed

Examples:

1.
Follow-up question:
Show me the Eiffel Tower.

Rephrased:
Eiffel Tower images

2.
Follow-up question:
How does a neural network architecture look?

Rephrased:
Neural network architecture diagram

3.
Follow-up question:
Show me the Tesla Model S.

Rephrased:
Tesla Model S images

4.
Follow-up question:
Human heart anatomy

Rephrased:
Human heart anatomy diagram

Conversation:
{chat_history}

Follow-up question:
{query}

Rephrased search query:
`;

const basicImageSearchResponsePrompt = `
   You are FutureSearch, an AI assistant specialized in image search.

You are currently operating in "Image Search" mode.

Your task is to answer the user's request using the provided image search results.

The context contains image search results, including image titles, descriptions, and metadata.

Guidelines:

- Identify the most relevant images from the provided context.
- Explain what each image represents.
- If multiple useful images are available, summarize the differences between them.
- Do not invent information that is not present in the search results.
- If the user asks for comparison, compare the images clearly.
- If the user asks for diagrams, illustrations, maps, charts, or photographs, prioritize those image types.
- If image URLs are available in the metadata, include them in a separate **Images** section.
- Use markdown headings and bullet points.
- Keep the response informative and well structured.
- Every factual statement must include citations using the corresponding search result number such as [1], [2], or [1][3].

<context>
{context}
</context>

The information inside the context block comes from image search results and is not part of the conversation.

Today's date is ${new Date().toISOString()}
`;

const strParser = new StringOutputParser();

type BasicChainInput = {
  chat_history: BaseMessage[];
  query: string;
};

const createBasicImageSearchAnsweringChain = (
  llm: BaseChatModel,
) => {
  const basicImageSearchRetrieverChain =
    createBasicImageSearchRetrieverChain(llm);

  const processDocs = async (docs: (Document | undefined)[]) => {
    return docs
      .filter((doc): doc is Document => doc !== undefined)
      .map((doc, index) => `${index + 1}.
       Description: ${doc.pageContent}
       Image: ${doc.metadata.img_src ?? "N/A"}
       URL: ${doc.metadata.url}
        `)
      .join("\n");
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
        basicImageSearchRetrieverChain
          // .pipe(rerankDocs)
          .withConfig({
            runName: "FinalSourceRetriever",
          })
          .pipe((x) => x.docs)
          .pipe(processDocs),
      ]),
    }),
    ChatPromptTemplate.fromMessages([
      ["system", basicImageSearchResponsePrompt],
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

const createBasicImageSearchRetrieverChain = (llm: BaseChatModel) => {
  return RunnableSequence.from([
    PromptTemplate.fromTemplate(basicImageSearchRetrieverPrompt),
    llm,
    strParser,
    RunnableLambda.from(async (input: string) => {
      if (input === "not_needed") {
        return { query: "", docs: [] };
      }

       const res = await searchSearxng(input, {
        language: "en",
        engines: [
          "bing images",
          "brave.images",
          "google cse images"
        ],
      });

      const documents = (res.results ?? []).map(
        (result: SearchResult) =>
          new Document({
            pageContent: result.content || result.title || result.url ||
            "No Description available",
            metadata: {
              title: result.title,
              url: result.url,
              ...(result.img_src && { img_src: result.img_src }),
            },
          })
      );

      return { query: input, docs: documents };
    }),
  ]);
};

const basicImageSearch = (
  query: string,
  history: BaseMessage[],
  llm: BaseChatModel,
) => {
  const emitter = new eventEmitter();

  try {
    const basicImageSearchAnsweringChain =
      createBasicImageSearchAnsweringChain(llm);
    const stream = basicImageSearchAnsweringChain.streamEvents(
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

const handleImageSearch = (
  message: string,
  history: BaseMessage[],
  llm: BaseChatModel,
) => {
  const emitter = basicImageSearch(message, history, llm);
  return emitter;
};

export default handleImageSearch;
