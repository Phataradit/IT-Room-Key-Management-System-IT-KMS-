import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host") ?? request.headers.get("x-forwarded-host");
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const requestProtocol =
    forwardedProtocol ?? new URL(request.url).protocol.replace(":", "");

  let originUrl: URL | null = null;
  try {
    originUrl = origin ? new URL(origin) : null;
  } catch {
    originUrl = null;
  }

  if (
    !originUrl ||
    !host ||
    originUrl.host !== host ||
    originUrl.protocol !== `${requestProtocol}:`
  ) {
    return Response.json({ error: "คำขอออกจากระบบไม่ถูกต้อง" }, { status: 403 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.sessionId) {
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  }

  await prisma.authSession.updateMany({
    where: {
      id: session.user.sessionId,
      userId: session.user.id,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });

  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
