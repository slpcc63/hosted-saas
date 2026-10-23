// Public release catalog; no customer data or billing dependency.
export const ownerSignIn = "https://app.slpcc63.com/sign-in?next=/dashboard";
export const publicProducts = [
  {
    id: "calendar-sync", title: "Calendar Sync", status: "Controlled pilot",
    audience: "For managers sharing schedules and employees planning their week",
    benefit: "Keep work schedules in the calendar you already use.",
    description: "Private, read-only employee schedules for Apple Calendar, Google Calendar, and compatible ICS clients.",
    square: "Reads published schedules from Square. Square remains the source of truth; calendar feeds do not edit shifts.",
    access: "Managers connect Square and distribute private setup links. Employees open their employer’s link without creating an SLPCC63 account.",
    availability: "Controlled pilot with assisted setup. Pricing confirmed during onboarding; public checkout is unavailable.",
    href: "https://app.slpcc63.com/calendar-sink", action: "Manager sign-in for Calendar Sync"
  },
  {
    id: "time-card-manager", title: "Time Card Manager", status: "Assisted demo",
    audience: "For managers reviewing missing punches and employee confirmations",
    benefit: "Give missing punches a clear path to review.",
    description: "Review open timecards, request employee confirmations, and review the responses in one management tool.",
    square: "Reads Square timecards and team information. Employee responses are reviewed by a manager; they are not automatically written back to Square.",
    access: "Managers sign in to their installed tool. Employees use the private response or digest link their employer sends; no SLPCC63 account is required.",
    availability: "Assisted demo and controlled onboarding. Paid plans are not available for public purchase while billing acceptance is pending.",
    href: "https://app.slpcc63.com/time-card-manager", action: "Manager sign-in for Time Card Manager"
  },
  {
    id: "closing-checklist", title: "Closing Checklist", status: "Interactive prototype",
    audience: "For managers and employees exploring a clearer closing routine",
    benefit: "Walk through a close, including the exceptions.",
    description: "Try sample tasks, required exception reasons, a manager summary, and a simulated clock-out.",
    square: "Uses sample data. It does not save data or change Square. Clock-out is simulated, and reloading resets the demo.",
    access: "Open the prototype directly. Shared accounts, employee invitations, and persistent checklist runs are not available in this prototype.",
    availability: "Prototype · demo data resets. Available to explore; not offered as a paid or installed Square extension.",
    href: "https://closing-checklist-platform.vercel.app", action: "Open interactive prototype"
  }
] as const;
