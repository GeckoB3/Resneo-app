/**
 * The Team mutations with the four roles (web roles plan A1): a role change sends `role_key` with
 * `role`, the billing switch goes in `permissions`, and the team list shows the change at once
 * (Front desk, a new admin without the switch, the switch itself), rolling back when refused.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

import { ApiError } from '@/lib/api/client';
import { queryKeys } from '@/lib/queries/keys';
import type { TeamListResponse, TeamMember } from '@/types/staff';

const mockApiFetch = jest.fn();

jest.mock('@/lib/env', () => ({ isBackendConfigured: () => true }));
jest.mock('@/lib/queries/useAccessToken', () => ({ useAccessToken: () => 'token-A' }));
jest.mock('@/lib/api/client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api/client')>('@/lib/api/client');
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

import { optimisticTeamMember, useInviteStaff, usePatchStaffMember } from '@/lib/queries/useTeamMutations';

const staff: TeamMember = { id: 's1', email: 's@x.com', name: 'Sam', role: 'staff', role_key: 'staff', is_owner: false, permissions: {} };
const desk: TeamMember = {
  id: 'f1',
  email: 'f@x.com',
  name: 'Fay',
  role: 'staff',
  role_key: 'front_desk',
  is_owner: false,
  permissions: { role_key: 'front_desk' },
};
const admin: TeamMember = { id: 'a1', email: 'a@x.com', name: 'Al', role: 'admin', role_key: 'admin', is_owner: false, permissions: {} };

describe('optimisticTeamMember', () => {
  it('makes someone Front desk, and back to Staff', () => {
    const toDesk = optimisticTeamMember(staff, { role: 'staff', role_key: 'front_desk' });
    expect(toDesk).toMatchObject({ role: 'staff', role_key: 'front_desk', permissions: { role_key: 'front_desk' } });
    const back = optimisticTeamMember(desk, { role: 'staff', role_key: 'staff' });
    expect(back.role_key).toBe('staff');
    expect(back.permissions).toEqual({});
  });

  it('makes a new admin without "Billing, payouts and admins", as the server does', () => {
    const made = optimisticTeamMember(desk, { role: 'admin', role_key: 'admin' });
    expect(made).toMatchObject({ role: 'admin', role_key: 'admin', permissions: { billing_payouts_admins: false } });
    expect(made.permissions?.role_key).toBeUndefined();
  });

  it('clears Front desk when an older build sends only a role change', () => {
    expect(optimisticTeamMember(desk, { role: 'admin' }).permissions?.role_key).toBeUndefined();
  });

  it('sets the billing switch, and null puts it back to absent', () => {
    expect(optimisticTeamMember(admin, { permissions: { billing_payouts_admins: false } }).permissions).toEqual({
      billing_payouts_admins: false,
    });
    const absent = optimisticTeamMember(
      { ...admin, permissions: { billing_payouts_admins: false } },
      { permissions: { billing_payouts_admins: null } },
    );
    expect(absent.permissions).toEqual({});
  });
});

/** Lets React Query's batched notifications land inside act. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function setup(list: TeamMember[]) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  client.setQueryData<TeamListResponse>(queryKeys.team.list('token-A'), { staff: list });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}

describe('usePatchStaffMember', () => {
  beforeEach(() => mockApiFetch.mockReset());

  it('sends the role key with the stored role', async () => {
    const { wrapper } = setup([staff]);
    mockApiFetch.mockResolvedValueOnce({ staff: { ...staff, role_key: 'front_desk' } });
    const { result } = await renderHook(() => usePatchStaffMember(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 's1', body: { role: 'staff', role_key: 'front_desk' } });
    });
    await settle();
    const [path, init] = mockApiFetch.mock.calls[0]!;
    expect(path).toBe('/api/venue/staff/s1');
    expect(init).toMatchObject({ method: 'PATCH' });
    expect(JSON.parse(init.body as string)).toEqual({ role: 'staff', role_key: 'front_desk' });
  });

  it('shows the switch at once, and puts it back when the server refuses', async () => {
    const { client, wrapper } = setup([admin]);
    let reject: (e: unknown) => void = () => undefined;
    mockApiFetch.mockReturnValueOnce(new Promise((_resolve, r) => (reject = r)));
    const { result } = await renderHook(() => usePatchStaffMember(), { wrapper });

    let pending: Promise<unknown> = Promise.resolve();
    await act(async () => {
      pending = result.current.mutateAsync({ id: 'a1', body: { permissions: { billing_payouts_admins: false } } }).catch(() => undefined);
    });
    const during = client.getQueryData<TeamListResponse>(queryKeys.team.list('token-A'));
    expect(during?.staff[0]?.permissions).toEqual({ billing_payouts_admins: false });

    await act(async () => {
      reject(new ApiError('Only the owner can change Billing, payouts and admins.', 403, { error: 'x', code: 'PERMISSION_NOT_ALLOWED' }));
      await pending;
    });
    await settle();
    const after = client.getQueryData<TeamListResponse>(queryKeys.team.list('token-A'));
    expect(after?.staff[0]?.permissions).toEqual({});
  });
});

describe('useInviteStaff', () => {
  beforeEach(() => mockApiFetch.mockReset());

  it('posts the role key with the stored role', async () => {
    const { wrapper } = setup([]);
    mockApiFetch.mockResolvedValueOnce({ message: 'ok', invite_email_sent: true, staff: desk });
    const { result } = await renderHook(() => useInviteStaff(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ email: 'f@x.com', role: 'staff', role_key: 'front_desk' });
    });
    await settle();
    const [path, init] = mockApiFetch.mock.calls[0]!;
    expect(path).toBe('/api/venue/staff/invite');
    expect(JSON.parse(init.body as string)).toEqual({ email: 'f@x.com', role: 'staff', role_key: 'front_desk' });
  });
});

describe('optimisticTeamMember and the A2 switches', () => {
  it('sets the contact, export and diary switches, and null puts each back to absent', () => {
    const off = optimisticTeamMember(desk, { permissions: { client_contact: false, export_clients: false, other_diaries: 'view' } });
    expect(off.permissions).toEqual({ role_key: 'front_desk', client_contact: false, export_clients: false, other_diaries: 'view' });
    const back = optimisticTeamMember(off, { permissions: { client_contact: null, export_clients: null, other_diaries: null } });
    expect(back.permissions).toEqual({ role_key: 'front_desk' });
  });

  it('drops the contact and diary switches, and exports, from someone made an admin, as the server does', () => {
    const made = optimisticTeamMember(
      { ...desk, permissions: { role_key: 'front_desk', client_contact: false, other_diaries: 'view' } },
      { role: 'admin', role_key: 'admin' },
    );
    expect(made.permissions).toEqual({ billing_payouts_admins: false, export_clients: false });
  });
});

describe('usePatchStaffMember and the A2 switches', () => {
  beforeEach(() => mockApiFetch.mockReset());

  it('shows a switch at once, sends it, and puts it back when the server refuses', async () => {
    const { client, wrapper } = setup([desk]);
    let reject: (e: unknown) => void = () => undefined;
    mockApiFetch.mockReturnValueOnce(new Promise((_resolve, r) => (reject = r)));
    const { result } = await renderHook(() => usePatchStaffMember(), { wrapper });

    let pending: Promise<unknown> = Promise.resolve();
    await act(async () => {
      pending = result.current.mutateAsync({ id: 'f1', body: { permissions: { client_contact: false } } }).catch(() => undefined);
    });
    expect(JSON.parse(mockApiFetch.mock.calls[0]![1].body as string)).toEqual({ permissions: { client_contact: false } });
    const during = client.getQueryData<TeamListResponse>(queryKeys.team.list('token-A'));
    expect(during?.staff[0]?.permissions).toEqual({ role_key: 'front_desk', client_contact: false });

    await act(async () => {
      reject(new ApiError('Check the highlighted fields.', 400, { error: 'Check the highlighted fields.', code: 'VALIDATION_FAILED' }));
      await pending;
    });
    await settle();
    const after = client.getQueryData<TeamListResponse>(queryKeys.team.list('token-A'));
    expect(after?.staff[0]?.permissions).toEqual({ role_key: 'front_desk' });
  });
});
