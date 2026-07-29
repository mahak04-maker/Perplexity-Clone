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

const basicRedditSearchRetrieverPrompt = `
You will be given a conversation and a follow-up question.

Your task is to rewrite the follow-up question into a standalone search query that is suitable for searching Reddit discussions and community opinions.

If the input is a greeting (such as "hi", "hello"), casual conversation, or a writing task instead of a search query, return exactly:

not_needed

Examples:

1.
Follow-up question:
Which laptop is best for programming?

Rephrased:
Best laptop for programming Reddit

2.
Follow-up question:
Is ChatGPT Plus worth it?

Rephrased:
ChatGPT Plus worth it Reddit

3.
Follow-up question:
Best budget mechanical keyboard?

Rephrased:
Best budget mechanical keyboard Reddit

Conversation:
{chat_history}

Follow-up question:
{query}

Rephrased search query:
`;

const basicRedditSearchResponsePrompt = `
You are FutureSearch, an AI assistant specialized in searching Reddit discussions and community opinions.

You are currently operating in "Reddit Search" mode.

Your task is to answer the user's question using the provided Reddit search results. The context contains Reddit posts, comments, and discussions retrieved from the search engine.

Guidelines:
- Generate an informative, well-structured, and unbiased response based only on the provided Reddit context.
- Summarize the overall community opinion instead of copying comments verbatim.
- If Reddit users have different viewpoints, clearly mention each perspective.
- Highlight commonly agreed opinions separately from minority opinions whenever possible.
- Do not invent information that is not present in the provided context.
- Do not tell the user to visit Reddit or open external links to find the answer.
- If the user explicitly asks for links, you may include the Reddit links available in the search results.
- Use markdown formatting, headings, and bullet points whenever appropriate.
- Keep the response medium to long in length and easy to understand.
- Every factual statement should include citations using the corresponding search result number, for example [1], [2], or [1][3].
- The citation numbers correspond to the numbered search results provided in the context.
- If the Reddit search results contain conflicting opinions, explain the differences instead of choosing one side.
- If there is insufficient or irrelevant information in the context, politely respond:
  "Sorry, I couldn't find enough relevant Reddit discussions for this topic. Please try rephrasing your question."

<context>
{context}
</context>

The information inside the context block comes from Reddit search results and is not part of the conversation with the user.

Today's date is ${new Date().toISOString()}
`;

const strParser = new StringOutputParser();

type BasicChainInput = {
  chat_history: BaseMessage[];
  query: string;
};

const createBasicRedditSearchAnsweringChain = (
  llm: BaseChatModel,
  embeddings: Embeddings
) => {
  const basicRedditSearchRetrieverChain =
    createBasicRedditSearchRetrieverChain(llm);

  const processDocs = async (docs: (Document | undefined)[]) => {
    return docs
      .filter((doc): doc is Document => doc !== undefined)
      .map((doc, index) => `${index + 1}. 
      Title: ${doc.metadata.title}
      Content: ${doc.pageContent}
      URL: ${doc.metadata.url}
      `)
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
        basicRedditSearchRetrieverChain
          .pipe(rerankDocs)
          .withConfig({
            runName: "FinalSourceRetriever",
          })
          .pipe(processDocs),
      ]),
    }),
    ChatPromptTemplate.fromMessages([
      ["system", basicRedditSearchResponsePrompt],
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

const createBasicRedditSearchRetrieverChain = (llm: BaseChatModel) => {
  return RunnableSequence.from([
    PromptTemplate.fromTemplate(basicRedditSearchRetrieverPrompt),
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
          "duckduckgo",
          "brave"
        ],
      });
      

      const documents = (res.results ?? [])
      .filter((result: SearchResult) => result.url.includes("reddit.com"))
      .map(
        (result: SearchResult) =>
          new Document({
            pageContent: result.content ?? "",
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

const basicRedditSearch = (
  query: string,
  history: BaseMessage[],
  llm: BaseChatModel,
  embeddings: Embeddings
) => {
  const emitter = new eventEmitter();

  try {
    const basicRedditSearchAnsweringChain =
      createBasicRedditSearchAnsweringChain(llm, embeddings);
    const stream = basicRedditSearchAnsweringChain.streamEvents(
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

const handleRedditSearch = (
  message: string,
  history: BaseMessage[],
  llm: BaseChatModel,
  embeddings: Embeddings
) => {
  const emitter = basicRedditSearch(message, history, llm, embeddings);
  return emitter;
};

export default handleRedditSearch;
