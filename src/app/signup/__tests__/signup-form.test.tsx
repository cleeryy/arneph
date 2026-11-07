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

import { signUpAction } from "@/lib/auth/actions";
import frMessages from "../../../../messages/fr.json";
import { SignupForm } from "../signup-form";

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

function renderSignup(nextPath = "/editor") {
  return render(
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      <SignupForm nextPath={nextPath} />
    </NextIntlClientProvider>,
  );
}

describe("SignupForm — rendering", () => {
  test("renders the account fields, the hidden next path and the login link", () => {
    renderSignup();

    expect(
      screen.getByLabelText("Nom d'affichage (facultatif)"),
    ).toBeInTheDocument();

    const email = screen.getByLabelText("Adresse e-mail");
    expect(email).toHaveAttribute("type", "email");
    expect(email).toHaveAttribute("autocomplete", "email");

    const password = screen.getByLabelText("Mot de passe");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "new-password");
    expect(password).toHaveAttribute("minlength", "8");

    expect(
      screen.getByLabelText("Confirmer le mot de passe"),
    ).toHaveAttribute("autocomplete", "new-password");

    const next = screen.getByDisplayValue("/editor");
    expect(next).toHaveAttribute("type", "hidden");
    expect(next).toHaveAttribute("name", "next");

    expect(
      screen.getByRole("button", { name: "Créer mon compte" }),
    ).toBeEnabled();

    expect(screen.getByRole("link", { name: "Se connecter" })).toHaveAttribute(
      "href",
      "/login?next=%2Feditor",
    );
  });
});

describe("SignupForm — password confirmation", () => {
  test("shows an error and blocks submission when passwords differ", () => {
    renderSignup();

    fireEvent.change(screen.getByLabelText("Mot de passe"), {
      target: { value: "secret123" },
    });
    fireEvent.change(screen.getByLabelText("Confirmer le mot de passe"), {
      target: { value: "secret124" },
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Les mots de passe ne correspondent pas.",
    );
    expect(
      screen.getByRole("button", { name: "Créer mon compte" }),
    ).toBeDisabled();
    expect(signUpAction).not.toHaveBeenCalled();
  });
});

describe("SignupForm — pending state", () => {
  test("disables the submit button while the server action runs", async () => {
    vi.mocked(signUpAction).mockReturnValue(new Promise<never>(() => {}));
    const { container } = renderSignup();

    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);

    await waitFor(() => {
      expect(signUpAction).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Création…" })).toBeDisabled();
    });
  });
});
