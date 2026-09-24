import type { Metadata } from "next";
import ChatbotScreen from "./ChatbotScreen";

export const metadata: Metadata = {
  title: "Chatbot · La Sauvegarde du Nord",
};

export default function ChatbotPage() {
  return <ChatbotScreen />;
}
