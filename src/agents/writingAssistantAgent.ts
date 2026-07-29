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

const basicWritingRetrieverPrompt = `
You will be given a conversation and the user's latest writing request.

Your task is to rewrite the request into a standalone search query that can retrieve useful information for writing.

If the input is a greeting, casual conversation, or does not require web information, return exactly:

not_needed

Examples:

User:
Write an essay on Artificial Intelligence.

Search Query:
Artificial Intelligence overview

User:
Write a report about climate change.

Search Query:
Climate change report information

User:
Write an email requesting leave.

Search Query:
not_needed

Conversation:
{chat_history}

User Request:
{query}

Search Query:
`;

const basicWritingResponsePrompt = `
   You are FutureSearch operating in "Writing Assistant" mode.

Your task is to help the user write high-quality content using the provided context.

Guidelines:

- Use the search context whenever it is relevant.
- Write in clear, natural English.
- Adapt the writing style according to the user's request.
- If the user asks for an essay, write an essay.
- If the user asks for an email, write an email.
- If the user asks for a report, write a report.
- If the user asks for a blog, write a blog.
- Keep the writing well-structured.
- Use headings and bullet points whenever appropriate.
- Do not invent facts.
- Cite factual statements using [1], [2], etc.
- If no useful context is available, write using general knowledge without making unsupported factual claims.

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

const createBasicWritingSearchAnsweringChain = (
  llm: BaseChatModel,
  embeddings: Embeddings
) => {
  const basicWritingSearchRetrieverChain =
    createBasicWritingSearchRetrieverChain(llm);

  const processDocs = async (docs: (Document | undefined)[]) => {
    return docs
      .filter((doc): doc is Document => doc !== undefined)
      .map((doc, index) => `
      ${index + 1}. 
      Title: ${doc.metadata.title}
      Summary: ${doc.pageContent}
      Source: ${doc.metadata.url}`)
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
      .filter((sim) => sim.similarity > 0.2)
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
        basicWritingSearchRetrieverChain
          .pipe(rerankDocs)
          .withConfig({
            runName: "FinalSourceRetriever",
          })
          .pipe(processDocs)
      ]),
    }),
    ChatPromptTemplate.fromMessages([
      ["system", basicWritingResponsePrompt],
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

const createBasicWritingSearchRetrieverChain = (llm: BaseChatModel) => {
  return RunnableSequence.from([
    PromptTemplate.fromTemplate(basicWritingRetrieverPrompt),
    llm,
    strParser,
    RunnableLambda.from(async (input: string) => {
      if (input === "not_needed") {
        return { query: "", docs: [] };
      }

       const res = await searchSearxng(input, {
        language: "en",
        engines: [
          "google scholar",
          "arxiv",
          "pubmed",
          "bing",
        ],
      });

    

      const documents = (res.results ?? []).map(
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

const basicWritingSearch = (
  query: string,
  history: BaseMessage[],
  llm: BaseChatModel,
  embeddings: Embeddings
) => {
  const emitter = new eventEmitter();

  try {
    const basicWritingSearchAnsweringChain =
      createBasicWritingSearchAnsweringChain(llm, embeddings);
    const stream = basicWritingSearchAnsweringChain.streamEvents(
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

const handleWritingSearch = (
  message: string,
  history: BaseMessage[],
  llm: BaseChatModel,
  embeddings: Embeddings
) => {
  const emitter = basicWritingSearch(message, history, llm, embeddings);
  return emitter;
};

export default handleWritingSearch;
