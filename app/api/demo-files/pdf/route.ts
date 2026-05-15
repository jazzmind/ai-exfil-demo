import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export const runtime = "nodejs";

export async function GET() {
  try {
    const filePath = join(
      process.cwd(),
      "demo-assets",
      "vendor-estimate-EST-2026-04471-A.pdf"
    );
    const buffer = readFileSync(filePath);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition":
          "attachment; filename=vendor-estimate-EST-2026-04471-A.pdf",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to read PDF file" },
      { status: 500 }
    );
  }
}
