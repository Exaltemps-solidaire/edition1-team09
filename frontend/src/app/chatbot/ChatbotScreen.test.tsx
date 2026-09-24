import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatbotScreen from "./ChatbotScreen";

async function askQuestion(question: string) {
  const user = userEvent.setup();
  render(<ChatbotScreen />);
  await user.type(screen.getByPlaceholderText("Posez votre question…"), question);
  await user.click(screen.getByRole("button", { name: "Envoyer" }));
  return user;
}

describe("ChatbotScreen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the sidebar navigation and the current user", () => {
    render(<ChatbotScreen />);

    expect(screen.getByText("Mes documents")).toBeInTheDocument();
    expect(screen.getByText("Planning")).toBeInTheDocument();
    expect(screen.getByText("RTT restants")).toBeInTheDocument();
    expect(screen.getByText("Congés")).toBeInTheDocument();
    expect(screen.getByText("Fiches de paie")).toBeInTheDocument();
    expect(screen.getByText("Manou Lefebvre")).toBeInTheDocument();
  });

  it("displays the answer and its source when the API responds successfully", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          answer: "Vous bénéficiez de 18 jours de RTT par an.",
          sources: [
            {
              title: "Accord collectif RTT – La Sauvegarde du Nord",
              date_maj: "12 mars 2025",
              auteur: "D. Rousseau (RH Siège)",
            },
          ],
        }),
      })
    );

    await askQuestion("Combien de RTT j'ai droit par an ?");

    expect(
      await screen.findByText("Vous bénéficiez de 18 jours de RTT par an.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Accord collectif RTT – La Sauvegarde du Nord")
    ).toBeInTheDocument();
    expect(screen.getByText(/Mis à jour le 12 mars 2025/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/chat",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ question: "Combien de RTT j'ai droit par an ?" }),
      })
    );
  });

  it("renders the answer without a source card when sources is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ answer: "Je ne sais pas.", sources: [] }),
      })
    );

    await askQuestion("Une question hors corpus ?");

    expect(await screen.findByText("Je ne sais pas.")).toBeInTheDocument();
    expect(screen.queryByText(/Mis à jour le/)).not.toBeInTheDocument();
  });

  it("shows a graceful error message when the API is not available yet (404 today)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => {
          throw new Error("not JSON");
        },
      })
    );

    await askQuestion("Combien de RTT j'ai droit par an ?");

    expect(
      await screen.findByText("Le service de réponse n'est pas encore disponible.")
    ).toBeInTheDocument();
  });

  it("shows the same graceful error message on a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await askQuestion("Combien de RTT j'ai droit par an ?");

    expect(
      await screen.findByText("Le service de réponse n'est pas encore disponible.")
    ).toBeInTheDocument();
  });

  it("does not call the API for a blank question", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ChatbotScreen />);

    await user.type(screen.getByPlaceholderText("Posez votre question…"), "   ");
    await user.click(screen.getByRole("button", { name: "Envoyer" }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("disables the send button while the request is in flight", async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
      )
    );

    await askQuestion("Combien de RTT j'ai droit par an ?");

    expect(screen.getByRole("button", { name: "Envoi…" })).toBeDisabled();

    resolveFetch({ ok: true, json: async () => ({ answer: "Ok", sources: [] }) });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Envoyer" })).not.toBeDisabled()
    );
  });

  it("renders the source link as an inert button, not a real destination", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          answer: "Réponse.",
          sources: [{ title: "Doc", date_maj: "1 janvier 2026", auteur: "A. Test" }],
        }),
      })
    );

    await askQuestion("Question ?");

    expect(
      await screen.findByRole("button", { name: "Ouvrir le document →" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Ouvrir le document/ })
    ).not.toBeInTheDocument();
  });
});
