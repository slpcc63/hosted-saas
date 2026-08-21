"use client";

import { useId, useRef, useState } from "react";

type ConfirmFormSubmitProps = {
  action: "resend_confirmation" | "save_schedule" | "send_confirmation";
  buttonClassName?: string;
  buttonLabel: string;
  confirmLabel: string;
  employeeCount?: number;
  employeeEmail?: string;
  employeeName?: string;
  periodEnd?: string;
  periodStart?: string;
};

export function ConfirmFormSubmit({
  action,
  buttonClassName = "pill primary pill-button",
  buttonLabel,
  confirmLabel,
  employeeCount = 0,
  employeeEmail,
  employeeName,
  periodEnd,
  periodStart
}: ConfirmFormSubmitProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [details, setDetails] = useState<string[]>([]);

  function prepareConfirmation(button: HTMLButtonElement) {
    const form = button.form;

    if (!form) return;

    const formData = new FormData(form);

    if (action === "save_schedule" && formData.get("automationEnabled") !== "on") {
      form.requestSubmit();
      return;
    }

    if (action === "send_confirmation") {
      setDetails([
        `${employeeName ?? "Employee"} (${employeeEmail ?? "email not available"})`,
        `${String(formData.get("periodStart") ?? periodStart ?? "")} through ${String(formData.get("periodEnd") ?? periodEnd ?? "")}`
      ]);
    } else if (action === "resend_confirmation") {
      setDetails([
        `${employeeName ?? "Employee"} (${employeeEmail ?? "email not available"})`,
        `${periodStart ?? ""} through ${periodEnd ?? ""}`,
        "The previous secure response link will stop working."
      ]);
    } else {
      const daySelect = form.elements.namedItem("sendDayOfWeek") as HTMLSelectElement | null;
      const selectedDay = daySelect?.selectedOptions[0]?.text ?? "Selected day";
      setDetails([
        `${employeeCount} employee${employeeCount === 1 ? "" : "s"} currently have email ready.`,
        `${selectedDay} at ${String(formData.get("sendTimeLocal") ?? "")}`,
        String(formData.get("timezone") ?? "")
      ]);
    }

    dialogRef.current?.showModal();
  }

  return (
    <>
      <button
        className={buttonClassName}
        onClick={(event) => prepareConfirmation(event.currentTarget)}
        type="button"
      >
        {buttonLabel}
      </button>
      <dialog aria-labelledby={headingId} className="confirmation-dialog" ref={dialogRef}>
        <div className="confirmation-dialog-content">
          <div>
            <div className="eyebrow">Please confirm</div>
            <h2 id={headingId}>{buttonLabel}</h2>
          </div>
          <div className="confirmation-dialog-summary">
            {details.map((detail) => <p key={detail}>{detail}</p>)}
          </div>
          <div className="subscription-actions">
            <button className="pill primary pill-button" type="submit">
              {confirmLabel}
            </button>
            <button
              className="pill pill-button"
              onClick={() => dialogRef.current?.close()}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
