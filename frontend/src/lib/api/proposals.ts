import { useMutation, useQuery, useQueryClient, type Query } from '@tanstack/react-query';

import { ApiError } from '@/lib/api/api-error';
import { apiFetch } from '@/lib/api/client';
import { mutationKeys, queryKeys } from '@/lib/api/query-keys';
import type { Proposal, ProposalConflict, ProposalList } from '@/types/proposal';

const PROPOSAL_DETAIL_POLL_MS = 5_000;

function proposalPath(proposalId: string, suffix: string = ''): string {
  return `/proposals/${encodeURIComponent(proposalId)}${suffix}`;
}

export type ListProposalsOptions = {
  status?: string | string[];
  clothingId?: string;
};

function toProposalsQuery(options: ListProposalsOptions): string {
  const params = new URLSearchParams();
  const status = options.status;
  if (status !== undefined) {
    for (const value of Array.isArray(status) ? status : [status]) {
      params.append('status', value);
    }
  }
  if (options.clothingId !== undefined) {
    params.set('clothingId', options.clothingId);
  }
  return params.toString();
}

export async function listProposals(
  eventId: string,
  options: ListProposalsOptions = {},
): Promise<ProposalList> {
  const query = toProposalsQuery(options);
  const path =
    `/events/${encodeURIComponent(eventId)}/proposals` + (query === '' ? '' : `?${query}`);
  return apiFetch<ProposalList>(eventId, path);
}

export async function getProposal(eventId: string, proposalId: string): Promise<Proposal> {
  return apiFetch<Proposal>(eventId, proposalPath(proposalId));
}

export async function consentProposal(
  eventId: string,
  proposalId: string,
  version: number,
): Promise<Proposal> {
  return apiFetch<Proposal>(eventId, proposalPath(proposalId, '/consents'), {
    method: 'POST',
    body: JSON.stringify({ version }),
  });
}

export async function rejectProposal(
  eventId: string,
  proposalId: string,
  version: number,
): Promise<Proposal> {
  return apiFetch<Proposal>(eventId, proposalPath(proposalId, '/reject'), {
    method: 'POST',
    body: JSON.stringify({ version }),
  });
}

export async function cancelProposal(eventId: string, proposalId: string): Promise<Proposal> {
  return apiFetch<Proposal>(eventId, proposalPath(proposalId, '/cancel'), {
    method: 'POST',
  });
}

export function getProposalConflict(error: unknown): ProposalConflict | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code !== 'PROPOSAL_VERSION_MISMATCH') return null;
  const details = error.details as { currentStatus?: unknown; latestProposalId?: unknown } | null | undefined;
  if (typeof details !== 'object' || details === null) return null;
  if (typeof details.currentStatus !== 'string') return null;
  const latestProposalId =
    typeof details.latestProposalId === 'string' ? details.latestProposalId : null;
  return { currentStatus: details.currentStatus, latestProposalId };
}

export function proposalDetailRefetchInterval(query: Query<Proposal>): number | false {
  return query.state.data?.status === 'pending' ? PROPOSAL_DETAIL_POLL_MS : false;
}

export function useProposalsQuery(
  eventId: string,
  options: ListProposalsOptions & { enabled?: boolean; closed?: boolean } = {},
) {
  const { enabled = true, closed = false, ...filters } = options;
  return useQuery({
    queryKey: queryKeys.proposals(eventId, toProposalsQuery(filters)),
    queryFn: () => listProposals(eventId, filters),
    enabled,
    retry: 1,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: closed ? false : 15_000,
    refetchIntervalInBackground: false,
  });
}

export function useProposalQuery(
  eventId: string,
  proposalId: string,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: queryKeys.proposal(eventId, proposalId),
    queryFn: () => getProposal(eventId, proposalId),
    enabled,
    retry: 1,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: proposalDetailRefetchInterval,
    refetchIntervalInBackground: false,
  });
}

export function useConsentProposalMutation(eventId: string, proposalId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.consentProposal(eventId, proposalId),
    mutationFn: (version: number) => consentProposal(eventId, proposalId, version),
    retry: 0,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['events', eventId] });
    },
  });
}

export function useRejectProposalMutation(eventId: string, proposalId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.rejectProposal(eventId, proposalId),
    mutationFn: (version: number) => rejectProposal(eventId, proposalId, version),
    retry: 0,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['events', eventId] });
    },
  });
}
