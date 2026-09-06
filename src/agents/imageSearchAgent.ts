// //import { ChatOpenAI, OpenAI, OpenAIEmbeddings } from "@langchain/openai";
// import { BaseMessage } from "@langchain/core/messages";
// import {
//   RunnableSequence,
//   RunnableMap,
//   RunnableLambda,
// } from "@langchain/core/runnables";
// import formatChatHistoryAsString from "../utils/formatHistory.js";
// import {
//   PromptTemplate,
//   ChatPromptTemplate,
//   MessagesPlaceholder,
// } from "@langchain/core/prompts";
// import { StringOutputParser } from "@langchain/core/output_parsers";
// import { searchSearxng } from "../lib/searxng.js";
// import { Document } from "@langchain/core/documents";
// import eventEmitter from "events";
// import type { StreamEvent } from "@langchain/core/tracers/log_stream";
// import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
// import type { Embeddings } from "@langchain/core/embeddings";
// import type { SearchResult } from "../types/SearchResult.js";

// const basicImageSearchRetrieverPrompt = `
// You will be given a conversation and a follow-up question.

// Your task is to rewrite the follow-up question into a standalone search query that is optimized for finding relevant images.

// If the input is a greeting (such as "hi", "hello"), casual conversation, or a writing task instead of an image search request, return exactly:

// not_needed

// Examples:

// 1.
// Follow-up question:
// Show me the Eiffel Tower.

// Rephrased:
// Eiffel Tower images

// 2.
// Follow-up question:
// How does a neural network architecture look?

// Rephrased:
// Neural network architecture diagram

// 3.
// Follow-up question:
// Show me the Tesla Model S.

// Rephrased:
// Tesla Model S images

// 4.
// Follow-up question:
// Human heart anatomy

// Rephrased:
// Human heart anatomy diagram

// Conversation:
// {chat_history}

// Follow-up question:
// {query}

// Rephrased search query:
// `;

// const basicImageSearchResponsePrompt = `
//    You are FutureSearch, an AI assistant specialized in image search.

// You are currently operating in "Image Search" mode.

// Your task is to answer the user's request using the provided image search results.

// The context contains image search results, including image titles, descriptions, and metadata.

// Guidelines:

// - Identify the most relevant images from the provided context.
// - Explain what each image represents.
// - If multiple useful images are available, summarize the differences between them.
// - Do not invent information that is not present in the search results.
// - If the user asks for comparison, compare the images clearly.
// - If the user asks for diagrams, illustrations, maps, charts, or photographs, prioritize those image types.
// - Do NOT output image URLs.
// - Do NOT create an Images section.
// - The frontend will display the images separately.
// - Use markdown headings and bullet points.
// - Keep the response informative and well structured.
// - Every factual statement must include citations using the corresponding search result number such as [1], [2], or [1][3].

// <context>
// {context}
// </context>

// The information inside the context block comes from image search results and is not part of the conversation.

// Today's date is ${new Date().toISOString()}
// `;

// const strParser = new StringOutputParser();

// type BasicChainInput = {
//   chat_history: BaseMessage[];
//   query: string;
// };

// const createBasicImageSearchAnsweringChain = (
//   llm: BaseChatModel,
// ) => {
//   const basicImageSearchRetrieverChain =
//     createBasicImageSearchRetrieverChain(llm);

//   const processDocs = async (docs: (Document | undefined)[]) => {
//     return docs
//       .filter((doc): doc is Document => doc !== undefined)
//       .map((doc, index) => ({
//         id: index + 1,
//         title: doc.metadata.title ?? "",
//         description: doc.pageContent ?? "",
//         img_src: doc.metadata.img_src ?? "",
//         url: doc.metadata.url ?? "",
//       }));
//   };

//   const formatImageContext = (
//     docs: {
//     id: number;
//     title: string;
//     description: string;
//     img_src: string;
//     url: string;
//   }[]
// ) => {
//   return docs
//     .map(
//       (doc) => `
// [${doc.id}]
// Title: ${doc.title}
// Description: ${doc.description}
// Image URL: ${doc.img_src}
// Source URL: ${doc.url}
// `
//     )
//     .join("\n");
// };


//   return RunnableSequence.from([
//     RunnableMap.from({
//       query: (input: BasicChainInput) => input.query,
//       chat_history: (input: BasicChainInput) => input.chat_history,
//       context: RunnableSequence.from([
//         (input) => ({
//           query: input.query,
//           chat_history: formatChatHistoryAsString(input.chat_history),
//         }),
//         basicImageSearchRetrieverChain
//           // .pipe(rerankDocs)
//           .withConfig({
//             runName: "FinalSourceRetriever",
//           })
//           .pipe((x) => x.docs)
//           .pipe(processDocs)
//           .pipe(formatImageContext),
//       ]),
//     }),
//     ChatPromptTemplate.fromMessages([
//       ["system", basicImageSearchResponsePrompt],
//       new MessagesPlaceholder("chat_history"),
//       ["user", "{query}"],
//     ]),
//     llm,
//     strParser,
//   ]).withConfig({
//     runName: "FinalResponseGenerator",
//   });
// };

// const handleStream = async (
//   stream: AsyncGenerator<StreamEvent, any, unknown>,
//   emitter: eventEmitter
// ) => {
//   for await (const event of stream) {
//     if (
//       event.event === "on_chain_end" &&
//       event.name === "FinalSourceRetriever"
//     ) {
//       emitter.emit(
//         "data",
//         JSON.stringify({ type: "sources", data: event.data.output })
//       );
//     }
//     if (
//       event.event === "on_chain_stream" &&
//       event.name === "FinalResponseGenerator"
//     ) {
//       emitter.emit(
//         "data",
//         JSON.stringify({ type: "response", data: event.data.chunk })
//       );
//     }
//     if (
//       event.event === "on_chain_end" &&
//       event.name === "FinalResponseGenerator"
//     ) {
//       emitter.emit("end");
//     }
//   }
// };

// const createBasicImageSearchRetrieverChain = (llm: BaseChatModel) => {
//   return RunnableSequence.from([
//     PromptTemplate.fromTemplate(basicImageSearchRetrieverPrompt),
//     llm,
//     strParser,
//     RunnableLambda.from(async (input: string) => {
//       if (input === "not_needed") {
//         return { query: "", docs: [] };
//       }

//        const res = await searchSearxng(input, {
//         language: "en",
//         engines: [
//           "bing images",
//           "brave.images",
//           "google cse images"
//         ],
//       });

//       const documents = (res.results ?? []).map(
//         (result: SearchResult) =>
//           new Document({
//             pageContent: result.content || result.title || result.url ||
//             "No Description available",
//             metadata: {
//               title: result.title,
//               url: result.url,
//               ...(result.img_src && { img_src: result.img_src }),
//             },
//           })
//       );

//       return { query: input, docs: documents };
//     }),
//   ]);
// };

// const basicImageSearch = (
//   query: string,
//   history: BaseMessage[],
//   llm: BaseChatModel,
// ) => {
//   const emitter = new eventEmitter();

//   try {
//     const basicImageSearchAnsweringChain =
//       createBasicImageSearchAnsweringChain(llm);
//     const stream = basicImageSearchAnsweringChain.streamEvents(
//       {
//         chat_history: history,
//         query: query,
//       },
//       {
//         version: "v1",
//       }
//     );

//     handleStream(stream, emitter);
//   } catch (err) {
//     emitter.emit(
//       "error",
//       JSON.stringify({ data: "An error has occurred please try again later" })
//     );
//     console.error(err);
//   }

//   return emitter;
// };

// const handleImageSearch = (
//   message: string,
//   history: BaseMessage[],
//   llm: BaseChatModel,
// ) => {
//   const emitter = basicImageSearch(message, history, llm);
//   return emitter;
// };

// export default handleImageSearch;


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
import EventEmitter from "events";
import type { StreamEvent } from "@langchain/core/tracers/log_stream";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { SearchResult } from "../types/SearchResult.js";

const basicImageSearchRetrieverPrompt = `
You will be given a conversation and a follow-up question.

Your task is to rewrite the follow-up question into a standalone search query
that is optimized for finding relevant images.

If the input is a greeting, casual conversation, or a writing task instead
of an image search request, return exactly:

not_needed

Examples:

Follow-up question:
Show me the Eiffel Tower.

Rephrased:
Eiffel Tower images

Follow-up question:
How does a neural network architecture look?

Rephrased:
Neural network architecture diagram

Follow-up question:
Show me the Tesla Model S.

Rephrased:
Tesla Model S images

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

Guidelines:

- Identify the most relevant images from the provided context.
- Explain what each image represents.
- If multiple useful images are available, summarize the differences between them.
- Do not invent information that is not present in the search results.
- If the user asks for comparison, compare the images clearly.
- If the user asks for diagrams, illustrations, maps, charts, or photographs,
  prioritize those image types.
- Do NOT output image URLs.
- Do NOT create an Images section.
- The frontend will display the images separately.
- Use markdown headings and bullet points.
- Keep the response informative and well structured.
- Every factual statement must include citations using the corresponding
  search result number such as [1], [2], or [1][3].

<context>
{context}
</context>

The information inside the context block comes from image search results
and is not part of the conversation.

Today's date is ${new Date().toISOString()}
`;

const strParser = new StringOutputParser();

type BasicChainInput = {
  chat_history: BaseMessage[];
  query: string;
};

type ImageSource = {
  id: number;
  title: string;
  description: string;
  img_src: string;
  url: string;
};

type ImageRetrieverOutput = {
  query: string;
  docs: Document[];
  sources: ImageSource[];
};

/* ---------------------------------------------------------
   IMAGE SEARCH RETRIEVER
--------------------------------------------------------- */

const createBasicImageSearchRetrieverChain = (
  llm: BaseChatModel
) => {
  return RunnableSequence.from([
    PromptTemplate.fromTemplate(
      basicImageSearchRetrieverPrompt
    ),

    llm,

    strParser,

    RunnableLambda.from(async (input: string) => {
      const searchQuery = input.trim();

      if (!searchQuery || searchQuery === "not_needed") {
        return {
          query: "",
          docs: [],
          sources: [],
        } satisfies ImageRetrieverOutput;
      }

      const res = await searchSearxng(searchQuery, {
        language: "en",
        engines: [
          "bing images",
          "brave.images",
          "google cse images",
        ],
      });

      const documents: Document[] = [];

      const sources: ImageSource[] = [];

      (res.results ?? []).forEach(
        (result: SearchResult, index: number) => {
          const imageSource: ImageSource = {
            id: index + 1,
            title: result.title ?? "",
            description:
              result.content ??
              result.title ??
              "No description available",
            img_src: result.img_src ?? "",
            url: result.url ?? "",
          };

          sources.push(imageSource);

          documents.push(
            new Document({
              pageContent: imageSource.description,
              metadata: {
                title: imageSource.title,
                url: imageSource.url,
                img_src: imageSource.img_src,
              },
            })
          );
        }
      );

      return {
        query: searchQuery,
        docs: documents,
        sources,
      } satisfies ImageRetrieverOutput;
    }),
  ]);
};

/* ---------------------------------------------------------
   IMAGE CONTEXT FORMATTER
--------------------------------------------------------- */

const formatImageContext = (
  sources: ImageSource[]
) => {
  return sources
    .map(
      (source) => `
[${source.id}]
Title: ${source.title}
Description: ${source.description}
Image URL: ${source.img_src}
Source URL: ${source.url}
`
    )
    .join("\n");
};

/* ---------------------------------------------------------
   MAIN ANSWERING CHAIN
--------------------------------------------------------- */

const createBasicImageSearchAnsweringChain = (
  llm: BaseChatModel
) => {
  const basicImageSearchRetrieverChain =
    createBasicImageSearchRetrieverChain(llm);

  return RunnableSequence.from([
    RunnableMap.from({
      query: (input: BasicChainInput) =>
        input.query,

      chat_history: (input: BasicChainInput) =>
        input.chat_history,

      context: RunnableSequence.from([
        (input: BasicChainInput) => ({
          query: input.query,

          chat_history:
            formatChatHistoryAsString(
              input.chat_history
            ),
        }),

        basicImageSearchRetrieverChain,

        (result: ImageRetrieverOutput) =>
          formatImageContext(result.sources),
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

/* ---------------------------------------------------------
   STREAM HANDLER
--------------------------------------------------------- */

const handleStream = async (
  stream: AsyncGenerator<
    StreamEvent,
    any,
    unknown
  >,
  emitter: EventEmitter
) => {
  try {
    for await (const event of stream) {

      /*
       * IMPORTANT:
       * FinalSourceRetriever is handled separately below
       * if you decide to expose the retriever directly.
       */

      if (
        event.event === "on_chain_stream" &&
        event.name === "FinalResponseGenerator"
      ) {
        emitter.emit(
          "data",
          JSON.stringify({
            type: "response",
            data: event.data.chunk,
          })
        );
      }

      if (
        event.event === "on_chain_end" &&
        event.name === "FinalResponseGenerator"
      ) {
        emitter.emit("end");
      }
    }
  } catch (error) {
    console.error(
      "Image stream error:",
      error
    );

    emitter.emit(
      "error",
      JSON.stringify({
        type: "error",
        data: "Image search failed",
      })
    );
  }
};

/* ---------------------------------------------------------
   IMAGE SEARCH
--------------------------------------------------------- */

const basicImageSearch = (
  query: string,
  history: BaseMessage[],
  llm: BaseChatModel
) => {
  const emitter = new EventEmitter();

  try {
    /*
     * First retrieve the image sources separately.
     * This allows us to send structured image data
     * to the frontend.
     */
    const retriever =
      createBasicImageSearchRetrieverChain(llm);

    const answeringChain =
      createBasicImageSearchAnsweringChain(llm);

    /*
     * Get image sources for frontend.
     */
    (async () => {
      try {
        const retrieverResult =
          await retriever.invoke({
            query,
            chat_history:
              formatChatHistoryAsString(history),
          });

        emitter.emit(
          "data",
          JSON.stringify({
            type: "sources",
            data: retrieverResult.sources,
          })
        );
      } catch (error) {
        console.error(
          "Image source retrieval error:",
          error
        );

        emitter.emit(
          "data",
          JSON.stringify({
            type: "sources",
            data: [],
          })
        );
      }
    })();

    /*
     * Generate AI response.
     */
    const stream =
      answeringChain.streamEvents(
        {
          chat_history: history,
          query,
        },
        {
          version: "v1",
        }
      );

    handleStream(stream, emitter);

  } catch (error) {
    console.error(
      "Image search error:",
      error
    );

    emitter.emit(
      "error",
      JSON.stringify({
        type: "error",
        data:
          "An error has occurred. Please try again later.",
      })
    );
  }

  return emitter;
};

/* ---------------------------------------------------------
   EXPORTED HANDLER
--------------------------------------------------------- */

const handleImageSearch = (
  message: string,
  history: BaseMessage[],
  llm: BaseChatModel
) => {
  return basicImageSearch(
    message,
    history,
    llm
  );
};

export default handleImageSearch;