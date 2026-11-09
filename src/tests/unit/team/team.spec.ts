import { ConflictError } from '../../../shared/application/application-error';
import { LoggingEmailSender } from '../../../integrations/notifications/adapters/logging-email-sender';
import { TeamUseCases } from '../../../modules/team-access/application/team.use-cases';
import { Membership } from '../../../modules/team-access/domain/membership';
import { ROLE_PERMISSIONS, roleCan } from '../../../modules/team-access/domain/roles';
import { LastOwnerError } from '../../../modules/team-access/domain/team.errors';
import {
  FixedClock,
  PassThroughUnitOfWork,
  SequentialIdGenerator,
  testHasher,
} from '../../support/fakes';
import {
  InMemoryInvitations,
  InMemoryMemberships,
  RecordingAuditLog,
  SequentialTokens,
} from '../../support/platform-fakes';

describe('RBAC role map', () => {
  it('separates payout creation from approval and keeps viewers read-only', () => {
    expect(roleCan('finance', 'payouts:approve')).toBe(true);
    expect(roleCan('admin', 'payouts:approve')).toBe(false);
    expect(roleCan('developer', 'refunds:create')).toBe(false);
    expect(ROLE_PERMISSIONS.viewer.every((p) => p.endsWith(':read'))).toBe(true);
    expect(roleCan(null, 'merchant:read')).toBe(false);
    expect(roleCan('hacker', 'merchant:read')).toBe(false);
  });
});

function setup() {
  const clock = new FixedClock();
  const memberships = new InMemoryMemberships();
  const invitations = new InMemoryInvitations();
  const email = new LoggingEmailSender();
  const audit = new RecordingAuditLog();
  const team = new TeamUseCases({
    unitOfWork: new PassThroughUnitOfWork(),
    memberships,
    invitations,
    users: { emailsOf: (ids) => Promise.resolve(new Map(ids.map((id) => [id, `${id}@acme.co`]))) },
    audit,
    email,
    tokens: new SequentialTokens(),
    hasher: testHasher,
    ids: new SequentialIdGenerator(),
    clock,
    dashboardBaseUrl: 'https://dash.test',
  });
  const add = (id: string, userId: string, role: 'owner' | 'admin' | 'viewer') =>
    memberships.insert(
      Membership.create({ id, userId, merchantId: 'mer_1', role, createdAt: clock.now() }),
    );
  return { team, memberships, invitations, email, audit, add };
}

describe('Team use cases', () => {
  it('emails the invitation token and stores only its hash', async () => {
    const { team, invitations, email } = setup();
    await team.invite({ merchantId: 'mer_1', userId: 'usr_owner' }, 'New@Acme.co', 'developer');
    const token = new URL(email.sent[0].variables.acceptUrl).searchParams.get('token')!;
    const stored = [...invitations.rows.values()][0];
    expect(stored.email).toBe('new@acme.co');
    expect(stored.tokenHash).toBe(testHasher.sha256Hex(token));
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it('protects the last owner and forbids changing your own role', async () => {
    const { team, add } = setup();
    await add('mem_1', 'usr_1', 'owner');
    await add('mem_2', 'usr_2', 'admin');
    await expect(
      team.changeRole({ merchantId: 'mer_1', userId: 'usr_2' }, 'mem_1', 'admin'),
    ).rejects.toBeInstanceOf(LastOwnerError);
    await expect(
      team.changeRole({ merchantId: 'mer_1', userId: 'usr_1' }, 'mem_1', 'admin'),
    ).rejects.toBeInstanceOf(ConflictError);
    await team.changeRole({ merchantId: 'mer_1', userId: 'usr_1' }, 'mem_2', 'viewer');
  });

  it('does not let one merchant manage another merchant’s memberships', async () => {
    const { team, add } = setup();
    await add('mem_1', 'usr_1', 'admin');
    await expect(
      team.changeRole({ merchantId: 'mer_other', userId: 'usr_x' }, 'mem_1', 'viewer'),
    ).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
  });
});
