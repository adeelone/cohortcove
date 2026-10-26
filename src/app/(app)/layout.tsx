import type { CSSProperties } from "react";
import { AppFooter, AppNav } from "@/components/chrome";
import { requireMember } from "@/server/guards";
import { hasFeature } from "@/lib/plans";
import { hexToRgbChannels } from "@/lib/color";

/**
 * Shell for every signed-in page. Applies the institution's brand accent
 * when its plan includes custom branding. Individual pages still run their
 * own guards — layouts don't re-run on client navigation.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const membership = await requireMember();
  const { institution } = membership;
  const accent =
    institution.accentColor && hasFeature(institution.subscription, "branding") ? hexToRgbChannels(institution.accentColor) : null;

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip" style={accent ? ({ "--cove-accent": accent } as CSSProperties) : undefined}>
      <AppNav />
      <main id="main-content" className="mx-auto w-full max-w-page flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
      <AppFooter />
    </div>
  );
}
