import type { EventEditorData } from "@/server/http/owner-pages";

// UI-UX PublishChecklist: syarat publish (BR-EVT-04) dengan tab tujuan.
const TAB_FOR: Record<string, string> = {
  name: "info",
  schedule: "info",
  venue: "info",
  ticketTypes: "tickets",
  slug: "subdomain",
};

export function PublishChecklist({
  items,
  onGoTo,
}: {
  items: EventEditorData["checklist"];
  onGoTo: (tab: string) => void;
}) {
  return (
    <aside
      aria-label="Checklist publish"
      className="rounded-xl border border-border bg-surface p-4"
    >
      <h2 className="text-sm font-semibold tracking-wide text-subtle">CHECKLIST PUBLISH</h2>
      <ul className="mt-3 flex flex-col gap-2 text-sm">
        {items.map((item) => (
          <li key={item.key} className={item.done ? "text-success" : "text-danger"}>
            {item.done ? "✔" : "✘"} {item.label}
            {!item.done ? (
              <button
                type="button"
                onClick={() => onGoTo(TAB_FOR[item.key] ?? "info")}
                className="ml-2 text-primary underline"
              >
                lengkapi
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </aside>
  );
}
