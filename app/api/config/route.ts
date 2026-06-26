import { NextResponse } from "next/server";
import { getConfig, saveConfig } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = await getConfig();
  return NextResponse.json(config);
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const current = await getConfig();
    const updated = { ...current, ...body };
    await saveConfig(updated);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
