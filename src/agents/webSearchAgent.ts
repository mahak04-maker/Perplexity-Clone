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

const basicWebSearchRetrieverPrompt = `
You will be given a conversation and a follow-up question.

Your task is to rewrite the follow-up question into a standalone search query that is suitable for searching the web.

If the input is a greeting (such as "hi", "hello"), casual conversation, or a writing task instead of a search query, return exactly:

not_needed

Examples:

1.
Follow-up question:
How does Stable Diffusion work?

Rephrased:
Stable Diffusion working

2.
Follow-up question:
What is the latest version of React?

Rephrased:
Latest React version

3.
Follow-up question:
Best AI tools for coding?

Rephrased:
Best AI tools for coding

4.
Follow-up question:
Who won the FIFA World Cup 2022?

Rephrased:
FIFA World Cup 2022 winner

Conversation:
{chat_history}

Follow-up question:
{query}

Rephrased search query:
`;

const basicWebSearchResponsePrompt = `
    You are FutureSearch, an AI assistant specialized in searching the web.

You are currently operating in "Web Search" mode.

Your task is to answer the user's question using the provided web search results.

Guidelines:
- Generate a clear, accurate, and informative response based only on the provided search results.
- Combine information from multiple sources whenever appropriate.
- Use a neutral and factual tone.
- Do not copy the search results verbatim.
- Do not invent information that is not present in the context.
- Organize the answer using markdown headings and bullet points whenever appropriate.
- Keep the response medium to long in length.
- Do not ask the user to visit websites unless they specifically request links.
- Every factual statement should include citations using the corresponding search result number, such as [1], [2], or [1][3].
- If the search results are insufficient, politely state that you could not find enough relevant information.

<context>
{context}
</context>

The information inside the context block comes from web search results and is not part of the conversation.

Today's date is ${new Date().toISOString()}
`;

const strParser = new StringOutputParser();

type BasicChainInput = {
  chat_history: BaseMessage[];
  query: string;
};

const createBasicWebSearchAnsweringChain = (
  llm: BaseChatModel,
  embeddings: Embeddings
) => {
  const basicWebSearchRetrieverChain =
    createBasicWebSearchRetrieverChain(llm);

  const processDocs = async (docs: (Document | undefined)[]) => {
    return docs
      .filter((doc): doc is Document => doc !== undefined)
      .map((doc, index) => `${index + 1}. ${doc.pageContent ?? ""}`)
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
        basicWebSearchRetrieverChain
          .pipe(rerankDocs)
          .withConfig({
            runName: "FinalSourceRetriever",
          })
          .pipe(processDocs),
      ]),
    }),
    ChatPromptTemplate.fromMessages([
      ["system", basicWebSearchResponsePrompt],
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

const createBasicWebSearchRetrieverChain = (llm: BaseChatModel) => {
  return RunnableSequence.from([
    PromptTemplate.fromTemplate(basicWebSearchRetrieverPrompt),
    llm,
    strParser,
    RunnableLambda.from(async (input: string) => {
      if (input === "not_needed") {
        return { query: "", docs: [] };
      }

       const res = await searchSearxng(input, {
        language: "en",
        engines: [
          "google",
          "bing",
          "duckduckgo",
        ],
      });

      const documents = (res.results ?? [])
      .filter((result:SearchResult) => result.content)
      .map(
        (result: SearchResult) =>
          new Document({
            pageContent: result.content,
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

const basicWebSearch = (
  query: string,
  history: BaseMessage[],
  llm: BaseChatModel,
  embeddings: Embeddings
) => {
  const emitter = new eventEmitter();

  try {
    const basicWebSearchAnsweringChain =
      createBasicWebSearchAnsweringChain(llm, embeddings);
    const stream = basicWebSearchAnsweringChain.streamEvents(
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

const handleWebSearch = (
  message: string,
  history: BaseMessage[],
  llm: BaseChatModel,
  embeddings: Embeddings
) => {
  const emitter = basicWebSearch(message, history, llm, embeddings);
  return emitter;
};

export default handleWebSearch;
