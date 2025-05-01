import { Schema } from "effect";

export class CursorDownloadObject extends Schema.Class<CursorDownloadObject>(
  "CursorDownloadObject"
)({
  version: Schema.String,
  downloadUrl: Schema.String,
  rehUrl: Schema.String,
}) {}
