import "server-only";

export { composeOutboxEmail, type ComposeDeps, type Composed } from "./compose";
export {
  applyEmailDeliveryEvent,
  MAX_EMAIL_ATTEMPTS,
  processEmailOutbox,
  type OutboxDeps,
  type OutboxRunResult,
} from "./outbox";
export {
  EmailSendFailedError,
  TicketResendNotAllowedError,
  type TicketResendBlockReason,
} from "./errors";
export { assertTicketResendable, prepareTicketResend } from "./resend-ticket";
