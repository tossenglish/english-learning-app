import {
  TranslatePracticeSentencesBody,
  TranslatePracticeSentencesResponse,
} from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import { Router, type IRouter, type Request, type Response } from "express";

import { getUserId } from "../lib/auth";

const router: IRouter = Router();

router.post(
  "/openai/translations",
  async (req: Request, res: Response): Promise<void> => {
    if (!getUserId(req)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const body = TranslatePracticeSentencesBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid sentence list" });
      return;
    }

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-5.4-mini",
        max_completion_tokens: 8192,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You translate English learning sentences into natural Korean. Return only JSON with a translations array. Preserve the input order and return exactly one translation per sentence. Do not add explanations.",
          },
          {
            role: "user",
            content: JSON.stringify({ sentences: body.data.sentences }),
          },
        ],
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error("Empty translation response");

      const parsed = JSON.parse(content) as { translations?: unknown };
      if (
        !Array.isArray(parsed.translations) ||
        parsed.translations.length !== body.data.sentences.length ||
        parsed.translations.some((item) => typeof item !== "string")
      ) {
        throw new Error("Invalid translation response");
      }

      res.json(
        TranslatePracticeSentencesResponse.parse({
          translations: parsed.translations,
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, "Failed to translate practice sentences");
      res.status(502).json({ error: "Failed to translate sentences" });
    }
  },
);

export default router;