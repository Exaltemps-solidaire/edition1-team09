// Contract for POST /api/v1/chat (US-04, not implemented yet — see adr.md).
export type Source = {
  title: string;
  date_maj: string;
  auteur: string;
  url?: string;
};

export type ChatApiResponse = {
  answer: string;
  sources: Source[];
};

export type ChatApiError = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

export type ChatMessage = {
  id: string;
  role: "bot" | "user";
  time: string;
  text: string;
  sources?: Source[];
  isError?: boolean;
};
