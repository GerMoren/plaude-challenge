import { defineHook } from "workflow";
import { z } from "zod";

export const approvalHook = defineHook({
  schema: z.object({
    approved: z.boolean(),
    comment: z.string().optional(),
  }),
});
