import { MarketingFooter, MarketingHeader } from "@/components/chrome";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col overflow-x-clip">
      <MarketingHeader />
      <div className="w-full min-w-0 flex-1">{children}</div>
      <MarketingFooter />
    </div>
  );
}
