import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";

const formatChatHistoryAsString = (history: BaseMessage[]) => {
  return history
    .map((message) => {
      if (message instanceof HumanMessage) {
        return `Human: ${message.content}`;
      }

      if (message instanceof AIMessage) {
        return `Assistant: ${message.content}`;
      }

      return "";
    })
    .join("\n");
};

export default formatChatHistoryAsString;