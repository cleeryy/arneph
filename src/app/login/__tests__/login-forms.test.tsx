import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";

import { signInWithPasswordAction } from "@/lib/auth/actions";
import frMessages from "../../../../messages/fr.json";
import { MagicLinkForm } from "../magic-link-form";
import { PasswordLoginForm } from "../password-login-form";

vi.mock("@/lib/auth/actions", () => ({
  signUpAction: vi.fn(),
  signInWithPasswordAction: vi.fn(),
  sendMagicLink: vi.fn(),
  signOut: vi.fn(),
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

function renderWithIntl(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      {node}
    </NextIntlClientProvider>,
  );
}

describe("PasswordLoginForm", () => {
  test("renders email and password fields plus the signup link", () => {
    renderWithIntl(<PasswordLoginForm nextPath="/account" />);

    const email = screen.getByLabelText("Adresse e-mail");
    expect(email).toHaveAttribute("type", "email");
    expect(email).toHaveAttribute("autocomplete", "email");

    const password = screen.getByLabelText("Mot de passe");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "current-password");

    expect(screen.getByDisplayValue("/account")).toHaveAttribute(
      "name",
      "next",
    );

    expect(screen.getByRole("button", { name: "Se connecter" })).toBeEnabled();
    expect(
      screen.getByRole("link", { name: "Créer un compte" }),
    ).toHaveAttribute("href", "/signup?next=%2Faccount");
  });

  test("shows the server error message with role alert", async () => {
    vi.mocked(signInWithPasswordAction).mockResolvedValue({
      status: "error",
      message: "Identifiants invalides.",
    });
    const { container } = renderWithIntl(
      <PasswordLoginForm nextPath="/editor" />,
    );

    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Identifiants invalides.",
      );
    });
    expect(screen.getByLabelText("Mot de passe")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
});

describe("MagicLinkForm", () => {
  test("keeps the magic link flow in its own form", () => {
    renderWithIntl(<MagicLinkForm nextPath="/editor" />);

    expect(screen.getByLabelText("Adresse e-mail")).toHaveAttribute(
      "autocomplete",
      "email",
    );
    expect(
      screen.getByRole("button", { name: "Recevoir le lien" }),
    ).toBeEnabled();
  });
});
