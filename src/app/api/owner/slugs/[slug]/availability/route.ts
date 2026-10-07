import { json } from "@/server/http/json";
import { ownerSlugAvailability } from "@/server/http/owner-actions";
import { route } from "@/server/http/route";

// GET /api/owner/slugs/{slug}/availability — cek format, cadangan, terpakai.
export const GET = route(
  async (request: Request, ctx: RouteContext<"/api/owner/slugs/[slug]/availability">) => {
    const { slug } = await ctx.params;
    return json(await ownerSlugAvailability(request, slug));
  },
);
