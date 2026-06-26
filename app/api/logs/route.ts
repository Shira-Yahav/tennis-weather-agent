import { NextResponse } from "next/server";
import { getLogs } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  const logs = await getLogs();
  return NextResponse.json(logs);
}
