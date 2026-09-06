import { ApprovalForm } from "@/components/approval-form";

export default async function ApprovePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-xl font-semibold">Human approval requested</h1>
      <p className="text-sm text-gray-500">
        Review the request the agent escalated and approve or reject it below.
      </p>
      <ApprovalForm token={token} />
    </main>
  );
}
