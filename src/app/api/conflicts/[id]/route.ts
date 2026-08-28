// PATCH /api/conflicts/[id] — resolve an open conflict with a resolution note.
// Conflicts are only ever resolved by a human decision, never auto-closed.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const resolution =
    typeof body.resolution === "string" && body.resolution.trim()
      ? body.resolution.trim().slice(0, 1000)
      : null;

  try {
    const conflict = await db.conflict.update({
      where: { id },
      data: { status: "RESOLVED", resolution, resolvedAt: new Date() },
    });
    return NextResponse.json(conflict);
  } catch {
    return NextResponse.json({ error: "Conflict not found" }, { status: 404 });
  }
}
