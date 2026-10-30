import { NextResponse } from "next/server";
import { db } from "@/db";
import { messageDrafts } from "@/db/schema";
import { draftMessage, type MessageCategory, type MessageLanguage } from "@/lib/ml/messages";
import { CLASSES } from "@/lib/ml/labels";

export const dynamic = "force-dynamic";

const CATEGORIES: MessageCategory[] = [...CLASSES, "ambiguous"];
const LANGUAGES: MessageLanguage[] = ["en", "hinglish", "hi"];

/**
 * Customer Resolution Assistant — policy-constrained template drafting.
 * Generation is separate from classification; messages are never sent by the
 * system and drafts only persist when a named human approver approves them.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      category?: string;
      language?: string;
      customerName?: string;
      productName?: string;
      caseId?: string;
      approve?: boolean;
      approvedBy?: string;
      /** Pre-drafted body (e.g. from /api/ai) — validated before persisting. */
      draftedBody?: string;
    };
    const category = (body.category ?? "ambiguous") as MessageCategory;
    const language = (body.language ?? "en") as MessageLanguage;
    const draftedBody = (body.draftedBody ?? "").trim();
    if (body.approve === true && draftedBody.length > 0) {
      // Save an externally drafted (AI) message — requires approver, sane length.
      const approvedBy = (body.approvedBy ?? "").trim().slice(0, 64);
      if (!approvedBy) {
        return NextResponse.json({ error: "approver_required" }, { status: 422 });
      }
      if (draftedBody.length < 20 || draftedBody.length > 4000) {
        return NextResponse.json({ error: "body_length_invalid" }, { status: 422 });
      }
      const [row] = await db
        .insert(messageDrafts)
        .values({
          caseId: (body.caseId ?? "").trim().slice(0, 64) || null,
          category: CATEGORIES.includes(category) ? category : "ambiguous",
          language: LANGUAGES.includes(language) ? language : "en",
          body: draftedBody.slice(0, 4000),
          approvedBy,
        })
        .returning();
      return NextResponse.json({ body: row.body, notes: ["AI-drafted, human-approved", "Persisted to audit store"], approved: true, savedId: row.id });
    }
    if (!CATEGORIES.includes(category)) {
      return NextResponse.json({ error: "invalid_category", valid: CATEGORIES }, { status: 422 });
    }
    if (!LANGUAGES.includes(language)) {
      return NextResponse.json({ error: "invalid_language", valid: LANGUAGES }, { status: 422 });
    }
    const draft = draftMessage({
      category,
      language,
      customerName: (body.customerName ?? "").trim().slice(0, 64) || undefined,
      productName: (body.productName ?? "").trim().slice(0, 96) || undefined,
    });

    let savedId: number | null = null;
    if (body.approve === true) {
      const approvedBy = (body.approvedBy ?? "").trim().slice(0, 64);
      if (!approvedBy) {
        return NextResponse.json(
          { error: "approver_required", message: "A named human approver is required to save an approved draft." },
          { status: 422 },
        );
      }
      const [row] = await db
        .insert(messageDrafts)
        .values({
          caseId: (body.caseId ?? "").trim().slice(0, 64) || null,
          category,
          language,
          body: draft.body,
          approvedBy,
        })
        .returning();
      savedId = row.id;
    }
    return NextResponse.json({ body: draft.body, notes: draft.notes, approved: body.approve === true, savedId });
  } catch (e) {
    return NextResponse.json(
      { error: "message_failed", message: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}

/** Recent approved drafts (audit). */
export async function GET() {
  try {
    const { sql } = await import("drizzle-orm");
    const rows = (
      await db.execute(sql`
        SELECT id, case_id, category, language, body, approved_by, created_at
        FROM message_drafts ORDER BY id DESC LIMIT 40
      `)
    ).rows;
    return NextResponse.json({ rows });
  } catch (e) {
    return NextResponse.json(
      { error: "message_fetch_failed", message: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
