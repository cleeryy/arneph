import type { ReactElement } from "react";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";

import { NewSectionDialog } from "../NewSectionDialog";
import frMessages from "../../../../messages/fr.json";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { src, alt, width, height, loading, priority, className, sizes, ...rest } =
      props as {
        src: string;
        alt: string;
        width: number;
        height: number;
        loading?: "eager" | "lazy";
        priority?: boolean;
        className?: string;
        sizes?: string;
      };
    return (
      <img
        data-testid="next-image"
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={loading}
        sizes={sizes}
        data-priority={String(priority)}
        className={className}
        {...rest}
      />
    );
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

function wrap(ui: ReactElement) {
  return (
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("NewSectionDialog — T6", () => {
  test("dialog is visible when open is true before any section is added", () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      wrap(
        <NewSectionDialog open={true} onOpenChange={onOpenChange} onConfirm={onConfirm} />,
      ),
    );

    expect(screen.getByText("Nouvelle section")).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test("clicking Annuler closes dialog and does not call onConfirm", () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      wrap(
        <NewSectionDialog open={true} onOpenChange={onOpenChange} onConfirm={onConfirm} />,
      ),
    );

    expect(screen.getByText("Nouvelle section")).toBeInTheDocument();

    const cancelBtn = screen.getByRole("button", { name: /Annuler/ });
    fireEvent.click(cancelBtn);

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test("selecting Panoramique and clicking Créer calls onConfirm with pan-x", () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      wrap(
        <NewSectionDialog open={true} onOpenChange={onOpenChange} onConfirm={onConfirm} />,
      ),
    );

    expect(screen.getByText("Nouvelle section")).toBeInTheDocument();

    const panoramicBtn = screen.getByRole("button", { name: "Panoramique" });
    fireEvent.click(panoramicBtn);

    const createBtn = screen.getByRole("button", { name: /Créer/ });
    fireEvent.click(createBtn);

    expect(onConfirm).toHaveBeenCalledWith("pan-x");
  });
});
