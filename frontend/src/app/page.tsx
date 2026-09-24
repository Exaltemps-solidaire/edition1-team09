import type { Metadata } from "next";
import ChatbotScreen from "./chatbot/ChatbotScreen";

export const metadata: Metadata = {
  title: "Chatbot · La Sauvegarde du Nord",
};

export default function Home() {
  return <ChatbotScreen />;
}
