"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { CheckIcon, Loader2Icon, MessageCircleQuestionIcon, MinusIcon, PlusIcon, UndoIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import {
  answerQuestion,
  approveTask,
  askQuestion,
  declineTask,
  reassignTask,
  receiveUnitWork,
  rejectTask,
  submitTask,
  updateProgress,
} from "@/actions/tasks";
import { PhotoUpload } from "@/components/data/photo-upload";
import { ActionForm } from "@/components/form/action-form";
import { FormMessage, TextAreaField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { useFormFeedback } from "@/components/forms/use-form-feedback";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EMPTY_FORM_STATE } from "@/lib/forms";
import { cn } from "cn";

/* ---------- Tailor: progress ---------- */

export function ProgressStepper({ taskId, qty, qtyDone }: { taskId: string; qty: number; qtyDone: number }) {
  const [value, setValue] = useState(qtyDone);
  const [saved, setSaved] = useState(qtyDone);
  const [pending, start] = useTransition();
  const save = (next: number) => {
    const clamped = Math.max(0, Math.min(qty, next));
    setValue(clamped);
    start(async () => {
      const res = await updateProgress({ taskId, qtyDone: clamped });
      if (res.error) {
        toast.error(res.error);
        setValue(saved);
      } else {
        setSaved(res.qtyDone ?? clamped);
        toast.success(`${res.qtyDone} of ${qty} done.`);
      }
    });
  };
  const pct = qty ? (value / qty) * 100 : 0;
  return (
    <section className="rounded-[14px] border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-sans text-[15px] font-semibold">How many are done</h2>
        {pending ? <Loader2Icon className="size-4 animate-spin text-ink-muted" /> : null}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button type="button" variant="outline" className="size-14 shrink-0 rounded-[14px]" aria-label="One less" disabled={value <= 0} onClick={() => save(value - 1)}>
          <MinusIcon className="size-6" />
        </Button>
        <p className="tabular flex-1 text-center font-display leading-none">
          <span className="text-[3.25rem] font-medium">{value}</span>
          <span className="text-2xl text-ink-muted"> of {qty}</span>
        </p>
        <Button type="button" variant="outline" className="size-14 shrink-0 rounded-[14px]" aria-label="One more" disabled={value >= qty} onClick={() => save(value + 1)} data-mission="progress">
          <PlusIcon className="size-6" />
        </Button>
      </div>
      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-paper-deep">
        <span className="block h-full rounded-full bg-ink/70 transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      {qty >= 5 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {[5, 10].map((step) =>
            value + step <= qty ? (
              <Button key={step} type="button" variant="secondary" size="sm" onClick={() => save(value + step)}>
                +{step}
              </Button>
            ) : null,
          )}
        </div>
      ) : null}
    </section>
  );
}

/* ---------- Tailor: submit with photo ---------- */

export function SubmitWork({ taskId, qty }: { taskId: string; qty: number }) {
  const [state, action] = useActionState(submitTask, EMPTY_FORM_STATE);
  useFormFeedback(state);
  const [url, setUrl] = useState("");
  return (
    <section className="rounded-[14px] border-2 border-brand/25 bg-surface p-4">
      <h2 className="font-sans text-[15px] font-semibold">Finished? Photo, then submit</h2>
      <p className="mb-3 text-[13px] text-ink-muted">One photo of all {qty} pieces together is enough.</p>
      <ActionForm action={action} className="flex flex-col gap-3">
        <input type="hidden" name="taskId" value={taskId} />
        <PhotoUpload name="photoUrl" folder="tasks" emptyText="Take photo of the work" onChange={setUrl} />
        <FormMessage message={state.ok ? undefined : state.message} />
        <SubmitButton size="lg" className="h-14 w-full text-base" disabled={!url} pendingText="Submitting" data-mission="submit">
          <CheckIcon />
          {url ? `Submit all ${qty} as done` : "Take a photo to submit"}
        </SubmitButton>
      </ActionForm>
    </section>
  );
}

/* ---------- Tailor: ask or decline ---------- */

function TextDialog({
  open,
  onOpenChange,
  title,
  description,
  action,
  taskId,
  field,
  label,
  submit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  action: Parameters<typeof useActionState<typeof EMPTY_FORM_STATE, FormData>>[0];
  taskId: string;
  field: string;
  label: string;
  submit: string;
}) {
  const [state, formAction] = useActionState(action, EMPTY_FORM_STATE);
  useFormFeedback(state, () => onOpenChange(false));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <ActionForm action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="taskId" value={taskId} />
          <FormMessage message={state.ok ? undefined : state.message} />
          <TextAreaField name={field} label={label} errors={state.errors?.[field]} autoFocus />
          <SubmitButton size="lg" pendingText="Sending">
            {submit}
          </SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

export function TailorMore({ taskId, canDecline }: { taskId: string; canDecline: boolean }) {
  const [ask, setAsk] = useState(false);
  const [decline, setDecline] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" className="h-12 flex-1" onClick={() => setAsk(true)}>
        <MessageCircleQuestionIcon />
        Ask a question
      </Button>
      {canDecline ? (
        <Button type="button" variant="ghost" className="h-12 flex-1" onClick={() => setDecline(true)}>
          I can&apos;t do this
        </Button>
      ) : null}
      <TextDialog
        open={ask}
        onOpenChange={setAsk}
        title="Ask the owner"
        description="Your question shows on the task and on the owner's Today screen."
        action={askQuestion}
        taskId={taskId}
        field="body"
        label="Your question"
        submit="Send question"
      />
      <TextDialog
        open={decline}
        onOpenChange={setDecline}
        title="Decline this task"
        description="It goes back to the owner to give to someone else."
        action={declineTask}
        taskId={taskId}
        field="reason"
        label="Why can't you do it?"
        submit="Decline task"
      />
    </div>
  );
}

/* ---------- Owner ---------- */

/** Plays once, under a second, when a task has just been approved. */
export function ApprovalCelebration({ approvedAt }: { approvedAt: string | null }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!approvedAt || Date.now() - Date.parse(approvedAt) > 8000) return;
    const on = setTimeout(() => setShow(true), 0);
    const off = setTimeout(() => setShow(false), 1000);
    return () => {
      clearTimeout(on);
      clearTimeout(off);
    };
  }, [approvedAt]);
  return <AnimatePresence>{show ? <ApprovedBurst /> : null}</AnimatePresence>;
}

function ApprovedBurst() {
  const reduce = useReducedMotion();
  const colours = ["bg-sky", "bg-sun", "bg-leaf", "bg-magenta"];
  return (
    <motion.div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ delay: 0.7, duration: 0.25 }}>
      {colours.map((c, i) => (
        <motion.span
          key={c}
          className={cn("absolute size-3 rounded-full", c)}
          initial={reduce ? false : { x: 0, y: 0, scale: 0.4 }}
          animate={{ x: Math.cos((i / 4) * Math.PI * 2 + 0.6) * 70, y: Math.sin((i / 4) * Math.PI * 2 + 0.6) * 46, scale: 1 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        />
      ))}
      <motion.span
        className="flex size-16 items-center justify-center rounded-full bg-leaf text-white"
        initial={reduce ? false : { scale: 0.3 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 20 }}
      >
        <CheckIcon className="size-8" strokeWidth={3} />
      </motion.span>
    </motion.div>
  );
}

export function OwnerReview({ taskId }: { taskId: string }) {
  const [state, action] = useActionState(approveTask, EMPTY_FORM_STATE);
  useFormFeedback(state);
  const [reject, setReject] = useState(false);
  return (
    <section className="relative rounded-[14px] border-2 border-magenta/30 bg-surface p-4">
      <h2 className="font-sans text-[15px] font-semibold">Waiting for your review</h2>
      <p className="mb-3 text-[13px] text-ink-muted">Check the photo. Approve to add it to the Gallery, or send it back with a reason.</p>
      <div className="flex flex-wrap gap-2">
        <ActionForm action={action} className="flex-1">
          <input type="hidden" name="taskId" value={taskId} />
          <SubmitButton size="lg" className="h-12 w-full" pendingText="Approving" data-mission="approve">
            <CheckIcon />
            Approve
          </SubmitButton>
        </ActionForm>
        <Button type="button" variant="outline" className="h-12 flex-1" onClick={() => setReject(true)} data-mission="reject">
          <UndoIcon />
          Send back
        </Button>
      </div>
      {state.message && !state.ok ? <p className="mt-2 text-[13px] text-brand-deep">{state.message}</p> : null}
      <TextDialog
        open={reject}
        onOpenChange={setReject}
        title="Send the work back"
        description="The tailor sees your reason on the task and fixes it."
        action={rejectTask}
        taskId={taskId}
        field="reason"
        label="What needs fixing?"
        submit="Send back"
      />
    </section>
  );
}

export function AnswerForm({ taskId }: { taskId: string }) {
  const [state, action] = useActionState(answerQuestion, EMPTY_FORM_STATE);
  useFormFeedback(state);
  return (
    <ActionForm key={state.savedAt} action={action} className="flex flex-col gap-3">
      <input type="hidden" name="taskId" value={taskId} />
      <TextAreaField name="body" label="Your answer" errors={state.errors?.body} />
      <SubmitButton className="self-end" pendingText="Sending">
        Send answer
      </SubmitButton>
    </ActionForm>
  );
}

export function ReassignForm({ taskId, tailors, units, current }: { taskId: string; tailors: { id: string; name: string }[]; units: { id: string; name: string }[]; current?: string }) {
  const [state, action] = useActionState(reassignTask, EMPTY_FORM_STATE);
  useFormFeedback(state);
  return (
    <ActionForm action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <input type="hidden" name="taskId" value={taskId} />
      <div className="flex flex-1 flex-col gap-1.5">
        <label htmlFor="assignee" className="text-sm font-semibold">
          Give it to
        </label>
        <select id="assignee" name="assignee" defaultValue="" className="h-11 rounded-[10px] border border-line bg-surface px-3 text-base">
          <option value="" disabled>
            Pick a tailor or unit
          </option>
          <optgroup label="Tailors">
            {tailors.filter((t) => t.id !== current).map((t) => (
              <option key={t.id} value={`tailor:${t.id}`}>
                {t.name}
              </option>
            ))}
          </optgroup>
          {units.length ? (
            <optgroup label="Stitching units">
              {units.filter((u) => u.id !== current).map((u) => (
                <option key={u.id} value={`unit:${u.id}`}>
                  {u.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
        {state.errors?.assignee ? <p className="text-[13px] font-medium text-brand-deep">{state.errors.assignee[0]}</p> : null}
      </div>
      <SubmitButton pendingText="Saving">Reassign</SubmitButton>
    </ActionForm>
  );
}

export function UnitReceive({ taskId, qty, qtyDone }: { taskId: string; qty: number; qtyDone: number }) {
  const [state, action] = useActionState(receiveUnitWork, EMPTY_FORM_STATE);
  useFormFeedback(state);
  return (
    <section className="rounded-[14px] border border-line bg-surface p-4">
      <h2 className="font-sans text-[15px] font-semibold">Record what came back</h2>
      <p className="mb-3 text-[13px] text-ink-muted">Stitching units have no login. When all {qty} are back, the task is approved.</p>
      <ActionForm action={action} className="flex flex-col gap-3">
        <input type="hidden" name="taskId" value={taskId} />
        <TextField name="qtyDone" label={`Pieces received, of ${qty}`} inputMode="numeric" defaultValue={String(qtyDone)} errors={state.errors?.qtyDone} className="tabular" />
        <PhotoUpload name="photoUrl" folder="tasks" label="Photo, optional" emptyText="Photo of what came back" />
        <SubmitButton className="self-end" pendingText="Saving">
          Save
        </SubmitButton>
      </ActionForm>
    </section>
  );
}
