import { supportHref } from "@/lib/public-contact";

export function EmployeeLegalLinks() {
  return <nav className="employee-legal-links" aria-label="Legal and support">
    <a href="/privacy">Privacy</a>
    <a href="/terms">Terms</a>
    <a href={supportHref}>Support</a>
  </nav>;
}
