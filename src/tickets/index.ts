import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { unwrap } from "../api/errors";

export type TicketType = "bug" | "feature" | "feedback";
export type TicketStatus = "open" | "in_progress" | "planned" | "resolved" | "closed";

export type TicketSummary = {
  id: string;
  number: number;
  type: TicketType;
  title: string;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  /** True when the last word was the user's, so the team owes a reply. */
  awaitingSupport: boolean;
};

export type TicketMessage = {
  id: string;
  from: "you" | "support";
  body: string;
  createdAt: string;
};

export type Ticket = TicketSummary & {
  description: string;
  appVersion: string | null;
  platform: string | null;
  messages: TicketMessage[];
};

export type NewTicket = {
  type: TicketType;
  title: string;
  description: string;
  appVersion?: string;
  platform?: string;
};

export const TICKET_TYPE_OPTIONS: { value: TicketType; label: string }[] = [
  { value: "bug", label: "Bug" },
  { value: "feature", label: "Feature" },
  { value: "feedback", label: "Feedback" },
];

export const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  bug: "Bug report",
  feature: "Feature request",
  feedback: "Feedback",
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  planned: "Planned",
  resolved: "Resolved",
  closed: "Closed",
};

export const TICKET_LIMITS = { title: 150, description: 5000, note: 5000 } as const;

/** True for a ticket the user can still add to without reopening it. */
export const isTicketActive = (status: TicketStatus) => status !== "resolved" && status !== "closed";

/**
 * The part of an app's generated SDK the ticket hooks call. Pass `api` from `~/api/client`
 * (every API built on app-backend has these operations once its openapi.json is regenerated).
 */
export interface TicketsSdk {
  listTickets(options?: { query?: { status?: "open" | "closed" } }): PromiseLike<any>;
  createTicket(options: { body: NewTicket }): PromiseLike<any>;
  getTicket(options: { path: { id: string } }): PromiseLike<any>;
  addTicketMessage(options: { path: { id: string }; body: { body: string } }): PromiseLike<any>;
  setTicketStatus(options: { path: { id: string }; body: { status: "open" | "closed" } }): PromiseLike<any>;
}

/**
 * React Query hooks for the tickets API. Create them once per app:
 *
 *   export const { useTickets, useTicket, useCreateTicket, useAddTicketNote, useSetTicketStatus } =
 *     createTicketHooks(api);
 */
export function createTicketHooks(sdk: TicketsSdk, keyPrefix = "tickets") {
  const listKey = (status?: "open" | "closed") => [keyPrefix, "list", status ?? "all"] as const;
  const itemKey = (id: string) => [keyPrefix, "item", id] as const;

  function useTickets(status?: "open" | "closed", options: { enabled?: boolean } = {}) {
    return useQuery({
      queryKey: listKey(status),
      enabled: options.enabled ?? true,
      queryFn: async () =>
        (
          (await unwrap(sdk.listTickets(status ? { query: { status } } : undefined))) as {
            tickets: TicketSummary[];
          }
        ).tickets,
    });
  }

  function useTicket(id: string | undefined) {
    return useQuery({
      queryKey: itemKey(id ?? ""),
      enabled: Boolean(id),
      queryFn: async () => (await unwrap(sdk.getTicket({ path: { id: id as string } }))) as Ticket,
    });
  }

  function useCreateTicket() {
    const client = useQueryClient();
    return useMutation({
      mutationFn: async (ticket: NewTicket) => (await unwrap(sdk.createTicket({ body: ticket }))) as Ticket,
      onSuccess: (ticket) => {
        client.setQueryData(itemKey(ticket.id), ticket);
        void client.invalidateQueries({ queryKey: [keyPrefix, "list"] });
      },
    });
  }

  function useAddTicketNote(id: string) {
    const client = useQueryClient();
    return useMutation({
      mutationFn: async (body: string) =>
        (await unwrap(sdk.addTicketMessage({ path: { id }, body: { body } }))) as Ticket,
      onSuccess: (ticket) => {
        client.setQueryData(itemKey(id), ticket);
        void client.invalidateQueries({ queryKey: [keyPrefix, "list"] });
      },
    });
  }

  function useSetTicketStatus(id: string) {
    const client = useQueryClient();
    return useMutation({
      mutationFn: async (status: "open" | "closed") =>
        (await unwrap(sdk.setTicketStatus({ path: { id }, body: { status } }))) as Ticket,
      onSuccess: (ticket) => {
        client.setQueryData(itemKey(id), ticket);
        void client.invalidateQueries({ queryKey: [keyPrefix, "list"] });
      },
    });
  }

  return { useTickets, useTicket, useCreateTicket, useAddTicketNote, useSetTicketStatus };
}
