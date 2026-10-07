// Logger terstruktur JSON (AI-CODING-RULES §8). Jangan pernah mengirim
// kredensial, token, atau PII utuh sebagai field.
type LogLevel = "debug" | "info" | "warn" | "error";
type LogFields = Readonly<Record<string, unknown>>;

function write(level: LogLevel, msg: string, fields: LogFields = {}): void {
  const line = JSON.stringify({ level, msg, time: new Date().toISOString(), ...fields });
  const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;
  stream.write(`${line}\n`);
}

export const logger = {
  debug: (msg: string, fields?: LogFields) => {
    if (process.env.NODE_ENV !== "production") write("debug", msg, fields);
  },
  info: (msg: string, fields?: LogFields) => write("info", msg, fields),
  warn: (msg: string, fields?: LogFields) => write("warn", msg, fields),
  error: (msg: string, fields?: LogFields) => write("error", msg, fields),
};
