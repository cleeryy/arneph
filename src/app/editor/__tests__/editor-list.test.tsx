import * as React from "react";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { useRouter } from "next/navigation";

import { WebtoonListClient } from "@/components/editor/WebtoonListClient";
import { createWebtoonAction, deleteWebtoonAction } from "@/app/editor/actions";
import frMessages from "../../../../messages/fr.json";

vi.mock("@/app/editor/actions", () => ({
  createWebtoonAction: vi.fn(),
  updateWebtoonMetadataAction: vi.fn(),
  deleteWebtoonAction: vi.fn(),
  saveWebtoon: vi.fn(),
  publishWebtoon: vi.fn(),
  unpublishWebtoon: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

type ListWebtoon = {
  id: string;
  title: string;
  visibility: "draft" | "published";
};

function makeWebtoon(
  id: string,
  title: string,
  visibility: "draft" | "published",
): ListWebtoon {
  return { id, title, visibility };
}

function renderList(webtoons: ListWebtoon[]) {
  return render(
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      <WebtoonListClient title="Éditeur" webtoons={webtoons} />
    </NextIntlClientProvider>,
  );
}

describe("Editor list — empty state", () => {
  test("renders the empty message when there is no webtoon", () => {
    renderList([]);
    expect(screen.getByTestId("editor-empty")).toBeInTheDocument();
  });
});

describe("Editor list — creation goes through the server action", () => {
  test("create button calls createWebtoonAction and navigates to the new webtoon", async () => {
    vi.mocked(createWebtoonAction).mockResolvedValueOnce({
      ok: true,
      webtoonId: "w9",
    });
    const router = useRouter();
    renderList([]);

    fireEvent.click(screen.getByRole("button", { name: "Nouveau webtoon" }));

    await waitFor(() => {
      expect(vi.mocked(createWebtoonAction)).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith("/editor/w9");
    });
  });

  test("create failure shows an inline error and does not navigate", async () => {
    vi.mocked(createWebtoonAction).mockResolvedValueOnce({
      ok: false,
      error: "db.createWebtoon failed: connection refused",
    });
    const router = useRouter();
    renderList([]);

    fireEvent.click(screen.getByRole("button", { name: "Nouveau webtoon" }));

    const error = await screen.findByTestId("create-error");
    expect(error).toHaveTextContent(/connection refused/);
    expect(router.push).not.toHaveBeenCalled();
  });

  test("create button is disabled while the action is pending", async () => {
    let resolveCreate: (value: { ok: boolean; webtoonId?: string }) => void = () => {};
    vi.mocked(createWebtoonAction).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    renderList([]);

    const button = screen.getByRole("button", { name: "Nouveau webtoon" });
    fireEvent.click(button);

    await waitFor(() => {
      expect(button).toBeDisabled();
    });

    resolveCreate({ ok: true, webtoonId: "w1" });
    await waitFor(() => {
      expect(button).toBeEnabled();
    });
  });
});

describe("Editor list — card content", () => {
  test("keeps the webtoon title and the edit link visible", () => {
    renderList([makeWebtoon("w1", "Mon histoire", "draft")]);

    expect(screen.getByText("Mon histoire")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Éditer" })).toHaveAttribute(
      "href",
      "/editor/w1",
    );
  });
});

describe("Editor list — reader links", () => {
  test("a draft card offers no dead /read/:id link", () => {
    renderList([makeWebtoon("draft-1", "Brouillon", "draft")]);

    expect(screen.getByRole("link", { name: "Éditer" })).toHaveAttribute(
      "href",
      "/editor/draft-1",
    );
    expect(
      document.querySelector('a[href="/read/draft-1"]'),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: "Lire" })).not.toBeInTheDocument();
  });

  test("a published card links to the reader", () => {
    renderList([makeWebtoon("pub-1", "Publié", "published")]);

    expect(screen.getByRole("link", { name: "Lire" })).toHaveAttribute(
      "href",
      "/read/pub-1",
    );
  });
});

describe("Editor list — deletion goes through the server action", () => {
  test("delete asks for confirmation before calling deleteWebtoonAction", async () => {
    vi.mocked(deleteWebtoonAction).mockResolvedValueOnce({ ok: true });
    renderList([makeWebtoon("w1", "À supprimer", "draft")]);

    fireEvent.click(screen.getByTestId("delete-w1"));

    expect(await screen.findByTestId("delete-dialog")).toBeInTheDocument();
    expect(screen.getByText(frMessages.editor.confirm)).toBeInTheDocument();
    expect(vi.mocked(deleteWebtoonAction)).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("confirm-delete"));

    await waitFor(() => {
      expect(vi.mocked(deleteWebtoonAction)).toHaveBeenCalledWith("w1");
    });
    await waitFor(() => {
      expect(screen.queryByTestId("delete-dialog")).not.toBeInTheDocument();
    });
  });

  test("cancelling the confirmation never deletes", async () => {
    renderList([makeWebtoon("w1", "À garder", "draft")]);

    fireEvent.click(screen.getByTestId("delete-w1"));
    await screen.findByTestId("delete-dialog");

    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));

    await waitFor(() => {
      expect(screen.queryByTestId("delete-dialog")).not.toBeInTheDocument();
    });
    expect(vi.mocked(deleteWebtoonAction)).not.toHaveBeenCalled();
  });

  test("delete failure keeps the dialog open and shows the error", async () => {
    vi.mocked(deleteWebtoonAction).mockResolvedValueOnce({
      ok: false,
      error: "db.deleteWebtoon failed: permission denied",
    });
    renderList([makeWebtoon("w1", "Protégé", "published")]);

    fireEvent.click(screen.getByTestId("delete-w1"));
    await screen.findByTestId("delete-dialog");
    fireEvent.click(screen.getByTestId("confirm-delete"));

    const error = await screen.findByTestId("delete-error");
    expect(error).toHaveTextContent(/permission denied/);
    expect(screen.getByTestId("delete-dialog")).toBeInTheDocument();
  });

  test("successful delete refreshes the list", async () => {
    vi.mocked(deleteWebtoonAction).mockResolvedValueOnce({ ok: true });
    const router = useRouter();
    renderList([makeWebtoon("w1", "Supprimé", "draft")]);

    fireEvent.click(screen.getByTestId("delete-w1"));
    await screen.findByTestId("delete-dialog");
    fireEvent.click(screen.getByTestId("confirm-delete"));

    await waitFor(() => {
      expect(router.refresh).toHaveBeenCalled();
    });
  });
});
