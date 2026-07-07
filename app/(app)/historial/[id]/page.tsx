import { notFound } from "next/navigation";

import { getSession } from "@/lib/auth";
import { getSubmission } from "@/lib/submissions";
import { SubmissionDetail } from "@/components/submission-detail";

export const metadata = { title: "Detalle de solicitud" };

export default async function SubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  const submission = session ? await getSubmission(session, id) : null;

  if (!submission) notFound();

  return <SubmissionDetail submission={submission} />;
}
