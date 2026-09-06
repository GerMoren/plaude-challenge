import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApprovalForm } from "@/components/approval-form";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";

// This page's URL embeds a single-use approval token. Never let it get
// crawled, cached, or leaked to a third party via the Referer header.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

// Paired with the dev-only resume route: in production the reviewer answers in
// Slack, so this page has nothing it is allowed to do.
export default async function ApprovePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            <CardTitle>Human approval requested</CardTitle>
          </div>
          <CardDescription>
            Review the request the agent escalated and approve or reject it below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ApprovalForm token={token} />
        </CardContent>
      </Card>
    </main>
  );
}
