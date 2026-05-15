import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export const runtime = "nodejs";

export async function GET() {
  try {
    const filePath = join(process.cwd(), "demo-assets", "claim-file.md");
    const content = readFileSync(filePath, "utf-8");

    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": "attachment; filename=claim-record.md",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to read claim file" },
      { status: 500 }
    );
  }
}
