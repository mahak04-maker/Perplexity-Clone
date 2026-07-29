//import { ChatOpenAI, OpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { BaseMessage } from "@langchain/core/messages";
import {
  RunnableSequence,
  RunnableMap,
} from "@langchain/core/runnables";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import eventEmitter from "events";
import type { StreamEvent } from "@langchain/core/tracers/log_stream";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";


const basicSuggestionSearchResponsePrompt = `
  You are FutureSearch's Suggestion Generator.

Generate exactly 5 intelligent follow-up search suggestions.

Rules:

- Suggestions should help the user continue exploring the topic.
- Suggestions should be concise.
- Each suggestion must be unique.
- No explanations.
- No numbering.
- One suggestion per line.
- Return plain text only.
`;

const strParser = new StringOutputParser();

type BasicChainInput = {
  chat_history: BaseMessage[];
  query: string;
};

const createBasicSuggestionSearchAnsweringChain = (
  llm: BaseChatModel
) => {

    return RunnableSequence.from([
        RunnableMap.from({
            query: (input: BasicChainInput) => input.query,
            chat_history: (input: BasicChainInput) => input.chat_history,

        }),
        ChatPromptTemplate.fromMessages([
        ["system", basicSuggestionSearchResponsePrompt],
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
      event.event === "on_chain_stream" &&
      event.name === "FinalResponseGenerator"
    ) {
      emitter.emit("data",
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
  };


const basicSuggestionSearch = (
  query: string,
  history: BaseMessage[],
  llm: BaseChatModel,
) => {
  const emitter = new eventEmitter();

  try {
    const basicSuggestionSearchAnsweringChain =
      createBasicSuggestionSearchAnsweringChain(llm);
    const stream = basicSuggestionSearchAnsweringChain.streamEvents(
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

const handleSuggestionSearch = (
  message: string,
  history: BaseMessage[],
  llm: BaseChatModel,
) => {
  const emitter = basicSuggestionSearch(message, history, llm);
  return emitter;
};

export default handleSuggestionSearch;
