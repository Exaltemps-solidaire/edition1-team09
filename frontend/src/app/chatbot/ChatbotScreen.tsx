"use client";

import { useState, type FormEvent } from "react";
import styles from "./ChatbotScreen.module.css";
import type { ChatApiError, ChatApiResponse, ChatMessage, Source } from "./types";

const mockUser = {
  name: "Manou Lefebvre",
  roleLabel: "Éducatrice · MECS Nord",
};

const FALLBACK_ERROR_TEXT = "Le service de réponse n'est pas encore disponible.";

function now(): string {
  return new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function SourceCard({ source }: { source: Source }) {
  return (
    <div className={styles.sourceCard}>
      <strong>{source.title}</strong>
      {/* No real document/planning store wired up yet (US-04/US-05 pending). */}
      <button type="button" className={styles.sourceLink}>
        Ouvrir le document →
      </button>
      <div className={styles.sourceMeta}>
        Mis à jour le {source.date_maj} · par {source.auteur}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`${styles.bubbleRow} ${isUser ? styles.userRow : ""}`}>
      <div className={`${styles.avatar} ${isUser ? styles.user : styles.bot}`}>
        {isUser ? "ML" : "IA"}
      </div>
      <div>
        <div
          className={`${styles.bubble} ${isUser ? styles.user : styles.bot} ${
            message.isError ? styles.error : ""
          }`}
        >
          {message.text}
          {message.sources?.map((source, index) => (
            <SourceCard key={index} source={source} />
          ))}
        </div>
        <div className={`${styles.bubbleTime} ${isUser ? "" : styles.left}`}>
          {message.time}
        </div>
      </div>
    </div>
  );
}

async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as Partial<ChatApiError>;
    return body.error?.message ?? FALLBACK_ERROR_TEXT;
  } catch {
    return FALLBACK_ERROR_TEXT;
  }
}

const sidebarItems = ["Chatbot", "Mes documents", "Planning"];
const rhItems = ["RTT restants", "Congés", "Fiches de paie"];

export default function ChatbotScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "greeting",
      role: "bot",
      time: now(),
      text: "Bonjour, posez-moi votre question. Je cherche dans les documents de La Sauvegarde du Nord.",
    },
  ]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = input.trim();
    if (!question || status === "loading") return;

    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", time: now(), text: question },
    ]);
    setInput("");
    setStatus("loading");

    try {
      const response = await fetch("/api/v1/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      if (!response.ok) {
        const message = await extractErrorMessage(response);
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "bot", time: now(), text: message, isError: true },
        ]);
        setStatus("error");
        return;
      }

      const data = (await response.json()) as ChatApiResponse;
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "bot",
          time: now(),
          text: data.answer,
          sources: data.sources,
        },
      ]);
      setStatus("idle");
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "bot",
          time: now(),
          text: FALLBACK_ERROR_TEXT,
          isError: true,
        },
      ]);
      setStatus("error");
    }
  }

  const isLoading = status === "loading";

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <p className={styles.sidebarLabel}>Menu</p>
        <ul className={styles.sidebarList}>
          {sidebarItems.map((item) => (
            <li
              key={item}
              className={`${styles.sidebarItem} ${item === "Chatbot" ? styles.active : ""}`}
            >
              <span className={styles.dot} /> {item}
            </li>
          ))}
        </ul>
        <div className={styles.sidebarDivider} />
        <p className={styles.sidebarLabel}>Mes infos RH</p>
        <ul className={styles.sidebarList}>
          {rhItems.map((item) => (
            <li key={item} className={styles.sidebarItem}>
              <span className={styles.dot} /> {item}
            </li>
          ))}
        </ul>
        <div className={styles.sidebarUser}>
          <strong>{mockUser.name}</strong>
          {mockUser.roleLabel}
        </div>
      </aside>

      <div className={styles.main}>
        <div className={styles.topbar}>
          <h1>Chatbot</h1>
          <span>{messages[messages.length - 1].time}</span>
        </div>

        <div className={styles.chatArea}>
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </div>

        <form className={styles.inputBar} onSubmit={handleSubmit}>
          <textarea
            placeholder="Posez votre question…"
            aria-label="Votre question"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
          />
          <button type="submit" className={styles.sendButton} disabled={isLoading}>
            {isLoading ? "Envoi…" : "Envoyer"}
          </button>
        </form>
      </div>
    </div>
  );
}
